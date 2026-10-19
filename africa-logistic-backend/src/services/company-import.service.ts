/**
 * Company Import Service (src/services/company-import.service.ts)
 *
 * Parses and validates a bulk vehicle/driver spreadsheet for one company.
 *
 * Two things drive the design, both measured rather than assumed:
 *
 *  - `findPlateConflict` costs up to three sequential queries PER PLATE. At 400
 *    rows that is up to 1,200 round trips against a pool of ten connections that
 *    live traffic is also using. Everything here is batched instead: three
 *    queries for the plates and one for the phones, whatever the row count.
 *
 *  - bcrypt at cost 12 takes 296 ms on this server, so 400 drivers is about two
 *    minutes of CPU. Validation is therefore completely separate from writing,
 *    and the caller commits in small chunks.
 *
 * Nothing in this file writes. It reads, judges, and reports.
 */

import type { Pool, RowDataPacket } from 'mysql2/promise'
import ExcelJS from 'exceljs'
import { normaliseCustomerPhone } from './customer-account.service.js'

/** Header spellings we accept, normalised. Keep in step with the template. */
const COLUMN_ALIASES: Record<string, string> = {
  platenumber: 'plate_number',
  plate: 'plate_number',
  vehicletype: 'vehicle_type',
  type: 'vehicle_type',
  model: 'model',
  colour: 'color',
  color: 'color',
  year: 'year',
  capacitykg: 'max_capacity_kg',
  capacity: 'max_capacity_kg',
  maxcapacitykg: 'max_capacity_kg',
  firstname: 'first_name',
  lastname: 'last_name',
  phonenumber: 'phone_number',
  phone: 'phone_number',
  email: 'email',
}

/**
 * Headers are matched ignoring case, spaces, punctuation and the `*` marker, so
 * re-saving the workbook or tidying the capitalisation does not break the import.
 */
function normaliseHeader(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null
  const key = String(raw).toLowerCase().replace(/[^a-z]/g, '')
  return COLUMN_ALIASES[key] ?? null
}

export interface ImportRow {
  /** 1-based row number as the user sees it in Excel. */
  row: number
  plate_number?: string
  vehicle_type?: string
  model?: string
  color?: string
  year?: number
  max_capacity_kg?: number
  first_name?: string
  last_name?: string
  phone_number?: string
  email?: string
}

export interface RowProblem {
  row: number
  field?: string
  message: string
  /** FATAL rows are not imported at all. WARNING rows import with something dropped. */
  severity: 'error' | 'warning'
}

export interface PreparedRow extends ImportRow {
  /** Canonical +251… form, set only when the phone parsed. */
  normalised_phone?: string
  has_vehicle: boolean
  has_driver: boolean
  /** Set when the driver is skipped but the vehicle still goes in. */
  driver_skipped_reason?: string
}

export interface ImportPreview {
  total_rows: number
  vehicles_to_create: number
  drivers_to_create: number
  links_to_make: number
  rows_with_errors: number
  problems: RowProblem[]
  /** Rows that are safe to commit, already normalised. */
  rows: PreparedRow[]
}

const cell = (v: unknown): string => {
  if (v === null || v === undefined) return ''
  // ExcelJS hands back objects for formulas, hyperlinks and rich text.
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>
    if (typeof o.text === 'string') return o.text.trim()
    if (typeof o.result === 'string' || typeof o.result === 'number') return String(o.result).trim()
    if (Array.isArray((o as any).richText)) {
      return (o as any).richText.map((r: any) => r.text ?? '').join('').trim()
    }
    return ''
  }
  return String(v).trim()
}

const num = (v: unknown): number | undefined => {
  const s = cell(v).replace(/[,\s]/g, '')
  if (!s) return undefined
  const n = Number(s)
  return Number.isFinite(n) ? n : undefined
}

/** Read the first worksheet into raw rows. Throws only on an unreadable file. */
export async function parseWorkbook(buffer: Buffer): Promise<{ rows: ImportRow[]; headerRow: number }> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer as any)

  const ws = wb.worksheets[0]
  if (!ws) throw new Error('That file has no worksheets in it.')

  // The template puts a title band above the headers, and people add their own
  // notes, so find the header row rather than assuming row 1 or row 2.
  let headerRow = -1
  let mapping: Record<number, string> = {}
  const limit = Math.min(ws.rowCount, 20)
  for (let r = 1; r <= limit; r++) {
    const candidate: Record<number, string> = {}
    ws.getRow(r).eachCell({ includeEmpty: false }, (c, col) => {
      const key = normaliseHeader(c.value)
      if (key) candidate[col] = key
    })
    const found = Object.values(candidate)
    if (found.includes('plate_number') || found.includes('phone_number')) {
      headerRow = r
      mapping = candidate
      break
    }
  }

  if (headerRow === -1) {
    throw new Error(
      'Could not find the column headers. The sheet needs a row containing "Plate number" or "Phone number" — use the template pack.'
    )
  }

  const rows: ImportRow[] = []
  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const excelRow = ws.getRow(r)
    const out: ImportRow = { row: r }
    let any = false

    for (const [colStr, key] of Object.entries(mapping)) {
      const raw = excelRow.getCell(Number(colStr)).value
      if (key === 'year' || key === 'max_capacity_kg') {
        const n = num(raw)
        if (n !== undefined) { (out as any)[key] = n; any = true }
      } else {
        const s = cell(raw)
        if (s) { (out as any)[key] = s; any = true }
      }
    }

    // A banner merged across every column reads back as the same text in each
    // mapped cell. People add their own notes under a sheet, so skip those
    // rather than importing a row of identical nonsense.
    const values = Object.keys(mapping).map(c => cell(excelRow.getCell(Number(c)).value)).filter(Boolean)
    const isMergedBanner = values.length > 1 && new Set(values).size === 1

    if (any && !isMergedBanner) rows.push(out)
  }

  return { rows, headerRow }
}

/**
 * Judge every row against the file itself and against the database.
 *
 * Batched throughout: three plate queries and one phone query regardless of how
 * many rows there are.
 */
export async function validateRows(
  db: Pool,
  rawRows: ImportRow[],
  validVehicleTypes: string[]
): Promise<ImportPreview> {
  const problems: RowProblem[] = []
  const prepared: PreparedRow[] = []

  const typeLookup = new Map(validVehicleTypes.map(t => [t.toLowerCase(), t]))

  // ── Pass 1: shape, required fields, and duplicates within the file ──────────
  const platesSeen = new Map<string, number>()
  const phonesSeen = new Map<string, number>()
  const candidatePlates = new Set<string>()
  const candidatePhones = new Set<string>()
  // users.email carries a UNIQUE index, so two rows sharing one would fail
  // mid-write with ER_DUP_ENTRY after earlier rows had already been inserted.
  // Catching it here is the difference between a clean report and a half-import.
  const emailsSeen = new Map<string, number>()
  const candidateEmails = new Set<string>()

  for (const r of rawRows) {
    const plate = r.plate_number ? r.plate_number.toUpperCase() : undefined
    const hasAnyVehicleField = Boolean(plate || r.vehicle_type || r.model || r.color || r.year || r.max_capacity_kg)
    const hasAnyDriverField = Boolean(r.first_name || r.last_name || r.phone_number || r.email)

    const row: PreparedRow = { ...r, plate_number: plate, has_vehicle: false, has_driver: false }
    let fatal = false

    // ── Vehicle side ──
    if (hasAnyVehicleField) {
      if (!plate) {
        problems.push({ row: r.row, field: 'Plate number', message: 'Plate number is required for a vehicle row.', severity: 'error' })
        fatal = true
      } else if (platesSeen.has(plate)) {
        problems.push({ row: r.row, field: 'Plate number', message: `Plate ${plate} also appears on row ${platesSeen.get(plate)} of this file.`, severity: 'error' })
        fatal = true
      } else {
        platesSeen.set(plate, r.row)
        candidatePlates.add(plate)
      }

      if (!r.vehicle_type) {
        problems.push({ row: r.row, field: 'Vehicle type', message: 'Vehicle type is required for a vehicle row.', severity: 'error' })
        fatal = true
      } else {
        const match = typeLookup.get(r.vehicle_type.toLowerCase())
        if (!match) {
          problems.push({
            row: r.row, field: 'Vehicle type',
            message: `"${r.vehicle_type}" is not a known vehicle type. Use one of: ${validVehicleTypes.join(', ')}.`,
            severity: 'error',
          })
          fatal = true
        } else {
          row.vehicle_type = match   // store the canonical spelling, not the typist's
        }
      }

      if (r.year !== undefined && (r.year < 1950 || r.year > new Date().getFullYear() + 1)) {
        problems.push({ row: r.row, field: 'Year', message: `Year ${r.year} does not look right.`, severity: 'error' })
        fatal = true
      }
      if (r.max_capacity_kg !== undefined && r.max_capacity_kg <= 0) {
        problems.push({ row: r.row, field: 'Capacity (kg)', message: 'Capacity must be a positive number.', severity: 'error' })
        fatal = true
      }

      if (!fatal) row.has_vehicle = true
    }

    // ── Driver side ──
    if (hasAnyDriverField) {
      if (!r.first_name) {
        problems.push({ row: r.row, field: 'First name', message: 'First name is required for a driver row.', severity: 'error' })
        fatal = true
      }
      if (!r.phone_number) {
        problems.push({ row: r.row, field: 'Phone number', message: 'Phone number is required for a driver row.', severity: 'error' })
        fatal = true
      } else {
        const phone = normaliseCustomerPhone(r.phone_number)
        if (!phone) {
          problems.push({
            row: r.row, field: 'Phone number',
            message: `"${r.phone_number}" is not a valid Ethiopian number. Use 0911234567 or +251911234567.`,
            severity: 'error',
          })
          fatal = true
        } else if (phonesSeen.has(phone)) {
          problems.push({ row: r.row, field: 'Phone number', message: `This number also appears on row ${phonesSeen.get(phone)} of this file.`, severity: 'error' })
          fatal = true
        } else {
          phonesSeen.set(phone, r.row)
          candidatePhones.add(phone)
          row.normalised_phone = phone
        }
      }

      if (r.email) {
        const email = r.email.toLowerCase()
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          problems.push({ row: r.row, field: 'Email', message: `"${r.email}" is not a valid email address.`, severity: 'error' })
          fatal = true
        } else if (emailsSeen.has(email)) {
          problems.push({ row: r.row, field: 'Email', message: `This email also appears on row ${emailsSeen.get(email)} of this file.`, severity: 'error' })
          fatal = true
        } else {
          emailsSeen.set(email, r.row)
          candidateEmails.add(email)
          row.email = email
        }
      }

      if (!fatal && row.normalised_phone) row.has_driver = true
    }

    if (!hasAnyVehicleField && !hasAnyDriverField) continue   // blank row, ignore silently

    if (fatal) {
      row.has_vehicle = false
      row.has_driver = false
    }
    prepared.push(row)
  }

  // ── Pass 2: the database, batched ──────────────────────────────────────────
  if (candidatePlates.size > 0) {
    const plates = [...candidatePlates]
    const marks = plates.map(() => '?').join(',')
    // One query per table rather than three per plate.
    const [[companyHits], [ownerHits], [fleetHits]] = await Promise.all([
      db.query<RowDataPacket[]>(`SELECT plate_number FROM company_vehicles  WHERE plate_number IN (${marks})`, plates),
      db.query<RowDataPacket[]>(`SELECT plate_number FROM car_owner_vehicles WHERE plate_number IN (${marks})`, plates),
      db.query<RowDataPacket[]>(`SELECT plate_number FROM vehicles           WHERE plate_number IN (${marks})`, plates),
    ])
    const taken = new Map<string, string>()
    for (const r of companyHits) taken.set(String(r.plate_number).toUpperCase(), 'another company vehicle')
    for (const r of ownerHits)   taken.set(String(r.plate_number).toUpperCase(), 'a car owner vehicle')
    for (const r of fleetHits)   taken.set(String(r.plate_number).toUpperCase(), 'a platform fleet vehicle')

    for (const row of prepared) {
      if (!row.has_vehicle || !row.plate_number) continue
      const owner = taken.get(row.plate_number)
      if (owner) {
        problems.push({ row: row.row, field: 'Plate number', message: `Plate ${row.plate_number} is already registered to ${owner}.`, severity: 'error' })
        row.has_vehicle = false
        // A vehicle that cannot be created has nothing to link a driver to, but
        // the driver is still worth creating.
      }
    }
  }

  if (candidatePhones.size > 0) {
    const phones = [...candidatePhones]
    const marks = phones.map(() => '?').join(',')
    const [existing] = await db.query<RowDataPacket[]>(
      `SELECT phone_number, first_name, last_name FROM users WHERE phone_number IN (${marks})`, phones
    )
    const known = new Map<string, string>()
    for (const r of existing) {
      known.set(String(r.phone_number), `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim() || 'an existing account')
    }

    for (const row of prepared) {
      if (!row.has_driver || !row.normalised_phone) continue
      const who = known.get(row.normalised_phone)
      if (who) {
        // The owner's decision: flag and skip the driver, but still create the
        // vehicle so the admin can link them by hand.
        problems.push({
          row: row.row, field: 'Phone number',
          message: `${row.normalised_phone} already belongs to ${who} — driver skipped${row.has_vehicle ? ', vehicle still created' : ''}.`,
          severity: 'warning',
        })
        row.has_driver = false
        row.driver_skipped_reason = `Phone already registered to ${who}`
      }
    }
  }

  if (candidateEmails.size > 0) {
    const emails = [...candidateEmails]
    const marks = emails.map(() => '?').join(',')
    const [existing] = await db.query<RowDataPacket[]>(
      `SELECT email FROM users WHERE email IN (${marks})`, emails
    )
    const taken = new Set(existing.map(r => String(r.email).toLowerCase()))
    for (const row of prepared) {
      if (!row.has_driver || !row.email) continue
      if (taken.has(row.email)) {
        // Drop just the email rather than the whole driver — the address is
        // optional, and losing a driver over it would be a poor trade.
        problems.push({
          row: row.row, field: 'Email',
          message: `${row.email} is already used by another account — the driver will be created without an email address.`,
          severity: 'warning',
        })
        row.email = undefined
      }
    }
  }

  const rowsWithErrors = new Set(problems.filter(p => p.severity === 'error').map(p => p.row)).size

  return {
    total_rows: prepared.length,
    vehicles_to_create: prepared.filter(r => r.has_vehicle).length,
    drivers_to_create: prepared.filter(r => r.has_driver).length,
    links_to_make: prepared.filter(r => r.has_vehicle && r.has_driver).length,
    rows_with_errors: rowsWithErrors,
    problems: problems.sort((a, b) => a.row - b.row),
    rows: prepared.filter(r => r.has_vehicle || r.has_driver),
  }
}
