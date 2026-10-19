/**
 * Import Template Service (src/services/import-template.service.ts)
 *
 * Builds the template pack an admin downloads before filling in a bulk import:
 * a ZIP containing plain-language instructions and three ready-made spreadsheets.
 *
 * Three sheets rather than one because the three jobs are genuinely different —
 * a company sending its whole fleet with crews, a company sending trucks it has
 * not hired drivers for yet, and a company adding drivers to trucks that are
 * already registered. Handing someone a single sheet with ten columns and telling
 * them to leave half blank is how bad data gets typed in.
 *
 * The sheets are branded and self-describing: an admin who opens one should not
 * need the README to work out what goes where.
 */

import ExcelJS from 'exceljs'
import JSZip from 'jszip'

/** Afri Logistics green, matching the app's --clr-accent. */
const BRAND = 'FF61941F'
const BRAND_DARK = 'FF3E6113'
const HEADER_TEXT = 'FFFFFFFF'

export const VEHICLE_COLUMNS = [
  { header: 'Plate number *', key: 'plate_number', width: 18 },
  { header: 'Vehicle type *', key: 'vehicle_type', width: 16 },
  { header: 'Model', key: 'model', width: 18 },
  { header: 'Colour', key: 'color', width: 14 },
  { header: 'Year', key: 'year', width: 10 },
  { header: 'Capacity (kg)', key: 'max_capacity_kg', width: 14 },
] as const

export const DRIVER_COLUMNS = [
  { header: 'First name *', key: 'first_name', width: 16 },
  { header: 'Last name', key: 'last_name', width: 16 },
  { header: 'Phone number *', key: 'phone_number', width: 18 },
  { header: 'Email', key: 'email', width: 24 },
] as const

type Col = { header: string; key: string; width: number }

/**
 * One branded sheet.
 *
 * Row 1 is a merged title band, row 2 the column headers, row 3 onward the
 * examples. The header row is frozen so a 400-row sheet still shows what each
 * column is when the user scrolls to the bottom.
 */
function buildSheet(
  wb: ExcelJS.Workbook,
  title: string,
  subtitle: string,
  columns: Col[],
  examples: Record<string, string | number>[],
  /** Templates tell the user to clear the samples; the credentials file must not. */
  isTemplate = true
) {
  // Rows 1-2 are the banner and the instruction, row 3 the headers, data from 4.
  // The instruction deliberately sits ABOVE the headers: merged across every
  // column below the data it is indistinguishable from a row of real values, and
  // the importer would read it as one.
  const ws = wb.addWorksheet('Import', {
    views: [{ state: 'frozen', ySplit: 3 }],
  })

  ws.columns = columns.map(c => ({ key: c.key, width: c.width }))

  // Title band across every column.
  ws.mergeCells(1, 1, 1, columns.length)
  const titleCell = ws.getCell(1, 1)
  titleCell.value = `AFRI LOGISTICS  ·  ${title}`
  titleCell.font = { bold: true, size: 13, color: { argb: HEADER_TEXT } }
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND_DARK } }
  titleCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
  ws.getRow(1).height = 28

  ws.mergeCells(2, 1, 2, columns.length)
  const noteCell = ws.getCell(2, 1)
  noteCell.value = isTemplate
    ? `${subtitle}   Delete the grey example rows before importing. Columns marked * are required.`
    : subtitle
  noteCell.font = { size: 10, color: { argb: 'FF64748B' } }
  noteCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1, wrapText: true }
  ws.getRow(2).height = 26

  // Column headers.
  const headerRow = ws.getRow(3)
  columns.forEach((c, i) => {
    const cell = headerRow.getCell(i + 1)
    cell.value = c.header
    cell.font = { bold: true, size: 11, color: { argb: HEADER_TEXT } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND } }
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFFFFFFF' } },
      bottom: { style: 'thin', color: { argb: 'FFFFFFFF' } },
      left: { style: 'thin', color: { argb: 'FFFFFFFF' } },
      right: { style: 'thin', color: { argb: 'FFFFFFFF' } },
    }
  })
  headerRow.height = 24

  // Example rows, greyed so they read as samples to delete rather than real data.
  for (const ex of examples) {
    const row = ws.addRow(ex)
    row.eachCell(cell => {
      cell.font = { italic: true, color: { argb: 'FF94A3B8' } }
      cell.border = { bottom: { style: 'hair', color: { argb: 'FFCBD5E1' } } }
    })
  }

  return ws
}

async function sheetBuffer(
  title: string, subtitle: string, columns: Col[], examples: Record<string, string | number>[]
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Afri Logistics'
  wb.created = new Date()
  buildSheet(wb, title, subtitle, columns, examples)
  return Buffer.from(await wb.xlsx.writeBuffer())
}

function readme(vehicleTypes: string[], forCompany: boolean): string {
  return `AFRI LOGISTICS — BULK IMPORT GUIDE
===================================

This pack contains three spreadsheets. Pick the one that matches what you are
adding, fill it in, and upload it from:

${forCompany
  ? '    Your dashboard  ->  Fleet  ->  Import from Excel'
  : '    Admin panel  ->  Companies  ->  (open a company)  ->  Import from Excel'}

Nothing is saved when you upload. You get a preview showing exactly what will be
created and listing any problems, row by row. Only when you press Confirm is
anything written.


WHICH FILE DO I USE?
--------------------

1-vehicles-and-drivers.xlsx
    A truck and the driver who crews it, on the same row. The driver is created
    and assigned to that truck automatically. This is the usual case.

2-vehicles-only.xlsx
    Trucks with no driver yet. You can assign drivers later from the ${forCompany ? 'Fleet' : 'company'} page.

3-drivers-only.xlsx
    Drivers with no truck. Useful when the vehicles are already registered.

You may also mix row types in one file: fill in only the vehicle columns on some
rows and only the driver columns on others.


THE COLUMNS
-----------

VEHICLE
    Plate number *    Required. Must not already exist anywhere in the system.
    Vehicle type *    Required. One of:
                      ${vehicleTypes.join(', ')}
    Model             Optional, e.g. "Isuzu FVR"
    Colour            Optional
    Year              Optional, e.g. 2019
    Capacity (kg)     Optional, numbers only, e.g. 15000

DRIVER
    First name *      Required if you are adding a driver
    Last name         Optional
    Phone number *    Required if you are adding a driver.
                      Any of these work: 0911234567, +251911234567, 251911234567
    Email             Optional


RULES WORTH KNOWING
-------------------

* A plate number must be unique across the whole system — your company's trucks,
  other companies' trucks, individual car owners' and the platform fleet. If a
  plate is already taken, that row is reported and skipped.

* The same plate twice in one file is also caught, before anything is saved.

* If a driver's phone number is already registered, that driver is skipped and
  the reason is shown. If the row also has a truck, the TRUCK IS STILL CREATED —
  just without a driver attached, so you can link them yourself afterwards.

* Photos, libre documents and driver ID documents are NOT part of the import.
  Add them afterwards from the ${forCompany ? 'Fleet' : 'company'} page. They are optional everywhere.

${forCompany
  ? `* EVERYTHING YOU IMPORT IS REVIEWED BEFORE IT CAN CARRY CARGO. Imported trucks
  arrive marked "Pending" and imported drivers arrive unverified. Afri Logistics
  checks them and approves them. Until then they are saved and visible to you,
  but they cannot be given a delivery.

* You can still set a truck's operational status — Active, Maintenance and so on
  — straight away. That is yours to control and does not need approval.`
  : `* Imported vehicles are approved immediately, because you entered them. Imported
  drivers are verified immediately for the same reason.`}


${forCompany
  ? `DRIVER PASSWORDS
----------------

Each imported driver gets a generated password, and you must download them when
the import finishes:

  * Download credentials  — a spreadsheet of every driver with their phone number
                            and password. DOWNLOAD THIS. It is the only copy; the
                            password is stored encrypted and cannot be read back,
                            by you or by Afri Logistics.

Give each driver their own password. They sign in with their phone number and
will be asked to choose a new password the first time.`
  : `PASSWORDS AND THE WELCOME SMS
-----------------------------

Each imported driver gets a generated password. After the import finishes you can:

  * Download credentials  — a spreadsheet of every driver with their phone number
                            and password. DOWNLOAD THIS. It is the only copy; the
                            password is stored encrypted and cannot be read back.

  * Send welcome SMS      — texts each driver their login. This issues a FRESH
                            password per driver, so download the credentials file
                            again afterwards to keep it accurate.

Note: the welcome message is about 240 characters, which costs 2 SMS segments per
driver. 400 drivers is roughly 800 SMS credits.`}


HEADERS
-------

Headers are matched ignoring case and spacing, so re-saving the file or tidying
the capitalisation will not break the import. Keep the column names themselves —
do not translate or rename them.
`
}

/** The whole pack as one ZIP buffer. */
export async function buildImportTemplatePack(
  vehicleTypes: string[],
  /** The company portal gets different instructions: it submits for review. */
  forCompany = false
): Promise<Buffer> {
  const types = vehicleTypes.length > 0 ? vehicleTypes : ['Truck', 'Trailer', 'Pickup', 'Van']
  const sampleType = types.includes('Truck') ? 'Truck' : types[0]

  const combined = await sheetBuffer(
    'Vehicles and their drivers',
    'Each row is one truck and the driver who will crew it.',
    [...VEHICLE_COLUMNS, ...DRIVER_COLUMNS] as unknown as Col[],
    [
      {
        plate_number: 'AA-12345', vehicle_type: sampleType, model: 'Isuzu FVR',
        color: 'White', year: 2019, max_capacity_kg: 15000,
        first_name: 'Abebe', last_name: 'Kebede', phone_number: '0911234567',
        email: 'abebe@example.com',
      },
      {
        plate_number: 'AA-67890', vehicle_type: types.includes('Trailer') ? 'Trailer' : sampleType,
        model: 'Sinotruk', color: 'Blue', year: 2021, max_capacity_kg: 40000,
        first_name: 'Chaltu', last_name: 'Bekele', phone_number: '+251922334455', email: '',
      },
    ]
  )

  const vehiclesOnly = await sheetBuffer(
    'Vehicles only',
    'Trucks with no driver yet — assign drivers later from the company page.',
    [...VEHICLE_COLUMNS] as unknown as Col[],
    [
      { plate_number: 'AA-11111', vehicle_type: sampleType, model: 'Isuzu NPR', color: 'White', year: 2020, max_capacity_kg: 8000 },
      { plate_number: 'AA-22222', vehicle_type: types.includes('Pickup') ? 'Pickup' : sampleType, model: 'Toyota Hilux', color: 'Silver', year: 2022, max_capacity_kg: 1200 },
    ]
  )

  const driversOnly = await sheetBuffer(
    'Drivers only',
    'Drivers with no truck attached.',
    [...DRIVER_COLUMNS] as unknown as Col[],
    [
      { first_name: 'Dawit', last_name: 'Haile', phone_number: '0933445566', email: 'dawit@example.com' },
      { first_name: 'Selam', last_name: 'Tesfaye', phone_number: '+251944556677', email: '' },
    ]
  )

  const zip = new JSZip()
  zip.file('README.txt', readme(types, forCompany))
  zip.file('1-vehicles-and-drivers.xlsx', combined)
  zip.file('2-vehicles-only.xlsx', vehiclesOnly)
  zip.file('3-drivers-only.xlsx', driversOnly)

  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
}

/**
 * The credentials spreadsheet handed back after an import.
 *
 * This matters more than it looks: the password exists in the response and
 * nowhere else — it is bcrypt-hashed on save and cannot be read back — so for as
 * long as the SMS provider is rejecting our messages, this file is the only way
 * the login reaches the driver.
 */
export async function buildCredentialsWorkbook(
  companyName: string,
  rows: Array<{ name: string; phone_number: string; password: string; plate_number?: string | null; sms_sent?: boolean }>
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Afri Logistics'
  wb.created = new Date()

  const columns: Col[] = [
    { header: 'Driver', key: 'name', width: 24 },
    { header: 'Phone number (username)', key: 'phone_number', width: 22 },
    { header: 'Password', key: 'password', width: 18 },
    { header: 'Vehicle', key: 'plate_number', width: 16 },
    { header: 'SMS delivered', key: 'sms', width: 16 },
  ]

  const ws = buildSheet(
    wb,
    `Driver logins — ${companyName}`,
    'Each driver must change this password the first time they sign in. Keep this file safe — the passwords cannot be recovered afterwards.',
    columns,
    [],
    false
  )

  for (const r of rows) {
    const row = ws.addRow({
      name: r.name,
      phone_number: r.phone_number,
      password: r.password,
      plate_number: r.plate_number ?? '',
      sms: r.sms_sent === undefined ? 'not sent' : r.sms_sent ? 'yes' : 'no — give this password directly',
    })
    // The password is the point of the file, so make it the one thing that stands out.
    row.getCell('password').font = { bold: true, name: 'Consolas' }
  }

  return Buffer.from(await wb.xlsx.writeBuffer())
}
