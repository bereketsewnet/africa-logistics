import { useState, useRef } from 'react'
import {
  LuX, LuDownload, LuUpload, LuTriangleAlert, LuCircleCheck, LuFileSpreadsheet,
  LuSend, LuCopy, LuCheck, LuArrowLeft, LuCircleX,
} from 'react-icons/lu'
import { downloadFile } from '../lib/downloadFile'


/**
 * Bulk import of a company's fleet and crews from a spreadsheet.
 *
 * Four steps, in order: get a template, upload, review what will happen, then
 * commit. The review step is the point of the whole thing — a 400-row file will
 * always contain a few bad rows, and discovering that halfway through writing is
 * far worse than being told up front.
 *
 * Both long operations are chunked by this component rather than run as one big
 * request: committing costs roughly 300 ms of password hashing per driver, and a
 * single SMS can take 17 seconds. Doing either in one call would be a request
 * that the browser or the proxy kills with no way to tell what already happened.
 */

/**
 * The four calls the wizard needs, supplied by whichever portal opened it. The
 * modal never builds a URL, so the company side cannot reach an admin route and
 * the admin side keeps its `:id` out of here.
 */
export interface ImportApi {
  /** Direct HTTPS attachment URL; required for Android WebView downloads. */
  templateDownloadUrl: string
  preview: (file: string) => Promise<{ data: any }>
  commit: (rows: unknown[]) => Promise<{ data: any }>
  credentials: (rows: unknown[]) => Promise<{ data: BlobPart }>
  /** Admin only — texting a whole roster spends Afri Logistics' SMS credits. */
  sendSms?: (driverIds: string[]) => Promise<{ data: any }>
}

interface RowProblem { row: number; field?: string; message: string; severity: 'error' | 'warning' }
interface PreparedRow {
  row: number; plate_number?: string; vehicle_type?: string; first_name?: string
  last_name?: string; normalised_phone?: string; has_vehicle: boolean; has_driver: boolean
}
interface Preview {
  company_name: string
  total_rows: number; vehicles_to_create: number; drivers_to_create: number
  links_to_make: number; rows_with_errors: number
  problems: RowProblem[]; rows: PreparedRow[]
}
interface Credential {
  id?: string; name: string; phone_number: string; password: string
  plate_number?: string | null; sms_sent?: boolean
}

/** Rows the server will accept: parsed, and carrying no fatal problem. */
const importableRows = (p: Preview): PreparedRow[] => {
  const bad = new Set(p.problems.filter(x => x.severity === 'error').map(x => x.row))
  return p.rows.filter(r => !bad.has(r.row))
}

/** Commit cost is ~300 ms of hashing per driver, so 25 keeps each call ~7 s. */
const COMMIT_CHUNK = 25
/** A single SMS can take 17 s worst case; 10 bounds a call to a sane length. */
const SMS_CHUNK = 10

type Step = 'start' | 'review' | 'working' | 'done'

export default function CompanyImportModal({
  companyName, api, variant, onClose, onImported,
}: {
  companyName: string
  api: ImportApi
  /**
   * 'admin' — what is imported is approved on the spot, and the welcome SMS is
   * offered. 'company' — everything lands pending an admin's review, and there
   * is no SMS, so the credentials file is the only way passwords travel.
   */
  variant: 'admin' | 'company'
  onClose: () => void
  onImported: () => void
}) {
  const isCompany = variant === 'company'
  const [step, setStep] = useState<Step>('start')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [fileName, setFileName] = useState('')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [progress, setProgress] = useState({ done: 0, total: 0, label: '' })
  const [credentials, setCredentials] = useState<Credential[]>([])
  const [result, setResult] = useState({ vehicles: 0, drivers: 0, links: 0, skipped: [] as Array<{ row: number; message: string }> })
  const [smsDone, setSmsDone] = useState(false)
  const [copied, setCopied] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleTemplate = () => {
    setErr('')
    // Do not fetch this into a blob first. Android WebView and in-app browsers
    // cannot reliably save blob: URLs; they can save a real HTTPS attachment.
    const link = document.createElement('a')
    link.href = api.templateDownloadUrl
    link.download = 'afri-logistics-import-templates.zip'
    link.rel = 'noopener'
    link.style.display = 'none'
    document.body.appendChild(link)
    link.click()
    window.setTimeout(() => link.remove(), 1_000)
  }

  const handleFile = async (file: File) => {
    setErr(''); setBusy(true); setFileName(file.name)
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = () => reject(new Error('read failed'))
        reader.readAsDataURL(file)
      })
      const { data } = await api.preview(base64)
      setPreview(data)
      setStep('review')
    } catch (e: any) {
      setErr(e.response?.data?.message ?? 'That file could not be read.')
    } finally { setBusy(false) }
  }

  /** Commit in chunks, so a 400-row file is many short calls with visible progress. */
  const handleCommit = async () => {
    if (!preview) return
    // The preview returns every parsed row, including bad ones — the server
    // re-validates and skips those. Filter the same way, so the count and the
    // progress bar match what actually happens.
    const rows = importableRows(preview)
    setStep('working'); setErr('')
    setProgress({ done: 0, total: rows.length, label: 'Creating vehicles and drivers' })

    const creds: Credential[] = []
    let vehicles = 0, drivers = 0, links = 0
    const skipped: Array<{ row: number; message: string }> = []

    try {
      for (let i = 0; i < rows.length; i += COMMIT_CHUNK) {
        const chunk = rows.slice(i, i + COMMIT_CHUNK)
        const { data } = await api.commit(chunk)
        vehicles += data.vehicles_created ?? 0
        drivers += data.drivers_created ?? 0
        links += data.links_made ?? 0
        if (data.skipped?.length) skipped.push(...data.skipped)
        if (data.drivers?.length) creds.push(...data.drivers)
        setProgress({ done: Math.min(i + COMMIT_CHUNK, rows.length), total: rows.length, label: 'Creating vehicles and drivers' })
      }
      setCredentials(creds)
      setResult({ vehicles, drivers, links, skipped })
      setStep('done')
      onImported()
    } catch (e: any) {
      // Earlier chunks are already committed; say so rather than implying nothing happened.
      setErr(
        (e.response?.data?.message ?? 'The import stopped partway.')
        + ` ${vehicles} vehicle(s) and ${drivers} driver(s) were created before it stopped. Re-uploading the same file is safe — anything already created is reported as a duplicate and skipped.`
      )
      setCredentials(creds)
      setResult({ vehicles, drivers, links, skipped })
      setStep('done')
      onImported()
    }
  }

  const handleSendSms = async () => {
    const ids = credentials.map(c => c.id).filter(Boolean) as string[]
    if (ids.length === 0) return
    setBusy(true); setErr('')
    setProgress({ done: 0, total: ids.length, label: 'Sending welcome messages' })

    const updated = new Map(credentials.map(c => [c.id, { ...c }]))
    try {
      for (let i = 0; i < ids.length; i += SMS_CHUNK) {
        const chunk = ids.slice(i, i + SMS_CHUNK)
        const { data } = await api.sendSms!(chunk)
        for (const r of data.results ?? []) {
          const existing = updated.get(r.id)
          if (existing) {
            // The server issues a fresh password when it sends, so the list here
            // has to follow it or the downloaded file would be wrong.
            existing.password = r.password || existing.password
            existing.sms_sent = r.sent
          }
        }
        setProgress({ done: Math.min(i + SMS_CHUNK, ids.length), total: ids.length, label: 'Sending welcome messages' })
      }
      setCredentials([...updated.values()])
      setSmsDone(true)
    } catch (e: any) {
      setCredentials([...updated.values()])
      setErr(e.response?.data?.message ?? 'Sending stopped partway. The messages already sent are reflected below.')
    } finally { setBusy(false) }
  }

  const handleDownloadCredentials = async () => {
    try {
      const { data } = await api.credentials(credentials.map(c => ({
        name: c.name, phone_number: c.phone_number, password: c.password,
        plate_number: c.plate_number ?? null, sms_sent: c.sms_sent,
      })))
      downloadFile(data, `${companyName.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()}-driver-logins.xlsx`,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    } catch {
      setErr('Could not build the credentials file.')
    }
  }

  const copyAll = async () => {
    const text = credentials.map(c => `${c.name}\t${c.phone_number}\t${c.password}`).join('\n')
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true); window.setTimeout(() => setCopied(false), 2000)
    } catch { /* clipboard blocked; the table is on screen and selectable */ }
  }

  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0
  const errors = preview?.problems.filter(p => p.severity === 'error') ?? []
  const warnings = preview?.problems.filter(p => p.severity === 'warning') ?? []
  const toImport = preview ? importableRows(preview) : []
  const smsFailures = credentials.filter(c => c.sms_sent === false).length

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 70, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
      onClick={() => !busy && step !== 'working' && onClose()}>
      <div className="glass" style={{ borderRadius: 18, padding: '1.5rem', maxWidth: 760, width: '100%', maxHeight: '90vh', overflowY: 'auto', position: 'relative' }}
        onClick={e => e.stopPropagation()}>

        {step !== 'working' && (
          <button onClick={onClose} aria-label="Close"
            style={{ position: 'absolute', top: '0.85rem', right: '0.85rem', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--clr-muted)' }}>
            <LuX size={18} />
          </button>
        )}

        <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--clr-text)', marginBottom: '0.3rem', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
          <LuFileSpreadsheet size={18} /> Import from Excel{isCompany ? '' : ` — ${companyName}`}
        </h3>

        {err && <div className="alert alert-error" style={{ margin: '0.75rem 0', fontSize: '0.82rem' }}><LuTriangleAlert size={14} /> {err}</div>}

        {/* ── Step 1: template and upload ──────────────────────────────────── */}
        {step === 'start' && (
          <>
            <p style={{ fontSize: '0.82rem', color: 'var(--clr-muted)', lineHeight: 1.55, margin: '0 0 1rem' }}>
              Add many vehicles and drivers at once. Each row can hold a truck, the driver who
              crews it, or both — a driver on the same row is linked to that truck automatically.
            </p>

            {isCompany && (
              <div className="glass-inner" style={{ padding: '0.8rem 1rem', marginBottom: '1rem', border: '1px solid rgba(251,191,36,0.3)' }}>
                <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#fbbf24', display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.3rem' }}>
                  <LuTriangleAlert size={14} /> Everything you import is reviewed first
                </div>
                <p style={{ fontSize: '0.78rem', color: 'var(--clr-muted)', margin: 0, lineHeight: 1.5 }}>
                  Trucks arrive marked <strong>Pending</strong> and drivers arrive unverified.
                  Afri Logistics checks them before they can be given a delivery. You can still
                  set a truck's operational status straight away — that is yours to control.
                </p>
              </div>
            )}

            <div className="glass-inner" style={{ padding: '1rem', marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.86rem', fontWeight: 700, color: 'var(--clr-text)', marginBottom: '0.3rem' }}>
                1. Get the templates
              </div>
              <p style={{ fontSize: '0.78rem', color: 'var(--clr-muted)', margin: '0 0 0.7rem', lineHeight: 1.5 }}>
                A ZIP with instructions and three ready-made sheets: vehicles with drivers,
                vehicles only, and drivers only.
              </p>
              <button onClick={handleTemplate}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 0.95rem', borderRadius: 9, border: '1px solid rgba(96,165,250,0.35)', background: 'rgba(96,165,250,0.1)', color: '#60a5fa', fontFamily: 'inherit', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}>
                <LuDownload size={14} /> Download template pack
              </button>
            </div>

            <div className="glass-inner" style={{ padding: '1rem' }}>
              <div style={{ fontSize: '0.86rem', fontWeight: 700, color: 'var(--clr-text)', marginBottom: '0.3rem' }}>
                2. Upload your filled-in sheet
              </div>
              <p style={{ fontSize: '0.78rem', color: 'var(--clr-muted)', margin: '0 0 0.7rem', lineHeight: 1.5 }}>
                Nothing is saved yet — you will see exactly what will be created before confirming.
              </p>
              <input ref={fileRef} type="file" accept=".xlsx,.xlsm" style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) handleFile(f) }} />
              <button onClick={() => fileRef.current?.click()} disabled={busy} className="btn-primary"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.55rem 1.1rem', fontWeight: 800 }}>
                <LuUpload size={14} /> {busy ? 'Reading…' : 'Choose spreadsheet'}
              </button>
              {fileName && <div style={{ fontSize: '0.76rem', color: 'var(--clr-muted)', marginTop: '0.5rem' }}>{fileName}</div>}
            </div>
          </>
        )}

        {/* ── Step 2: review ───────────────────────────────────────────────── */}
        {step === 'review' && preview && (
          <>
            <p style={{ fontSize: '0.8rem', color: 'var(--clr-muted)', margin: '0 0 0.9rem' }}>
              {fileName} — nothing has been saved yet.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(110px,1fr))', gap: '0.5rem', marginBottom: '1rem' }}>
              {[
                { label: 'Vehicles', value: preview.vehicles_to_create, tone: 'var(--clr-text)' },
                { label: 'Drivers', value: preview.drivers_to_create, tone: 'var(--clr-text)' },
                { label: 'Linked', value: preview.links_to_make, tone: 'var(--kpi-green)' },
                { label: 'Rows with errors', value: preview.rows_with_errors, tone: preview.rows_with_errors > 0 ? '#f87171' : 'var(--clr-muted)' },
              ].map(s => (
                <div key={s.label} className="glass-inner" style={{ padding: '0.65rem', textAlign: 'center' }}>
                  <div style={{ fontSize: '1.3rem', fontWeight: 800, color: s.tone }}>{s.value}</div>
                  <div style={{ fontSize: '0.68rem', color: 'var(--clr-muted)', fontWeight: 600 }}>{s.label}</div>
                </div>
              ))}
            </div>

            {(errors.length > 0 || warnings.length > 0) && (
              <div className="glass-inner" style={{ padding: '0.85rem 1rem', marginBottom: '1rem', maxHeight: 220, overflowY: 'auto' }}>
                <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--clr-text)', marginBottom: '0.5rem' }}>
                  {errors.length > 0 && <>{errors.length} row{errors.length === 1 ? '' : 's'} will be skipped</>}
                  {errors.length > 0 && warnings.length > 0 && ' · '}
                  {warnings.length > 0 && <>{warnings.length} note{warnings.length === 1 ? '' : 's'}</>}
                </div>
                {preview.problems.map((p, i) => (
                  <div key={i} style={{ display: 'flex', gap: '0.5rem', fontSize: '0.76rem', padding: '0.25rem 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <span style={{ flexShrink: 0, fontWeight: 700, color: p.severity === 'error' ? '#f87171' : '#fbbf24', minWidth: 52 }}>
                      Row {p.row}
                    </span>
                    <span style={{ color: 'var(--clr-muted)', lineHeight: 1.45 }}>{p.message}</span>
                  </div>
                ))}
              </div>
            )}

            {toImport.length === 0 ? (
              <div className="alert alert-error" style={{ fontSize: '0.82rem' }}>
                <LuTriangleAlert size={14} /> Nothing in this file can be imported. Fix the rows above and upload it again.
              </div>
            ) : (
              <p style={{ fontSize: '0.78rem', color: 'var(--clr-muted)', lineHeight: 1.5, margin: '0 0 1rem' }}>
                {toImport.length} row{toImport.length === 1 ? '' : 's'} will be imported
                {errors.length > 0 && <>; the {errors.length} row{errors.length === 1 ? '' : 's'} listed above will be skipped</>}.
                {preview.drivers_to_create > 0 && ' Each driver gets a generated password you can download afterwards.'}
                {isCompany && ' Trucks are saved as Pending and drivers as unverified, for Afri Logistics to review.'}
              </p>
            )}

            <div style={{ display: 'flex', gap: '0.6rem' }}>
              <button onClick={() => { setStep('start'); setPreview(null); setErr('') }}
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem', padding: '0.65rem', borderRadius: 10, border: '1px solid rgba(255,255,255,0.14)', background: 'rgba(255,255,255,0.05)', color: 'var(--clr-text)', fontFamily: 'inherit', fontSize: '0.84rem', fontWeight: 700, cursor: 'pointer' }}>
                <LuArrowLeft size={14} /> Choose another file
              </button>
              <button onClick={handleCommit} disabled={toImport.length === 0} className="btn-primary"
                style={{ flex: 1.6, padding: '0.65rem', fontWeight: 800, opacity: toImport.length === 0 ? 0.5 : 1 }}>
                Import {toImport.length} row{toImport.length === 1 ? '' : 's'}
              </button>
            </div>
          </>
        )}

        {/* ── Step 3: working ──────────────────────────────────────────────── */}
        {step === 'working' && (
          <div style={{ padding: '2rem 0', textAlign: 'center' }}>
            <div style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--clr-text)', marginBottom: '0.3rem' }}>{progress.label}…</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--clr-muted)', marginBottom: '1rem' }}>
              {progress.done} of {progress.total}
            </div>
            <div style={{ height: 8, borderRadius: 999, background: 'rgba(255,255,255,0.08)', overflow: 'hidden', maxWidth: 360, margin: '0 auto' }}>
              <div style={{ width: `${pct}%`, height: '100%', background: 'var(--clr-accent)', transition: 'width 0.25s' }} />
            </div>
            <p style={{ fontSize: '0.74rem', color: 'var(--clr-muted)', marginTop: '1rem' }}>
              Please keep this window open.
            </p>
          </div>
        )}

        {/* ── Step 4: done ─────────────────────────────────────────────────── */}
        {step === 'done' && (
          <>
            <div className="glass-inner" style={{ padding: '0.9rem 1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <LuCircleCheck size={20} style={{ color: 'var(--kpi-green)', flexShrink: 0 }} />
              <div style={{ fontSize: '0.85rem', color: 'var(--clr-text)' }}>
                <strong>{result.vehicles}</strong> vehicle{result.vehicles === 1 ? '' : 's'} and <strong>{result.drivers}</strong> driver{result.drivers === 1 ? '' : 's'} created
                {result.links > 0 && <>, <strong>{result.links}</strong> linked</>}.
                {result.skipped.length > 0 && <> {result.skipped.length} row(s) skipped.</>}
                {isCompany && <> They are waiting for Afri Logistics to review them.</>}
              </div>
            </div>

            {credentials.length > 0 && (
              <>
                {/* Download comes first on purpose: the passwords exist here and
                    nowhere else, and with the SMS provider currently rejecting
                    every message this file is how they reach anyone. */}
                <div className="glass-inner" style={{ padding: '1rem', marginBottom: '0.85rem', border: '1px solid rgba(251,191,36,0.3)' }}>
                  <div style={{ fontSize: '0.86rem', fontWeight: 700, color: 'var(--clr-text)', marginBottom: '0.3rem' }}>
                    Save the logins now
                  </div>
                  <p style={{ fontSize: '0.78rem', color: 'var(--clr-muted)', margin: '0 0 0.75rem', lineHeight: 1.5 }}>
                    These {credentials.length} password{credentials.length === 1 ? '' : 's'} are stored encrypted and
                    cannot be shown again. Download them before closing this window.
                    {isCompany && ' This file is the only way your drivers will learn their password — give each one theirs. They sign in with their phone number.'}
                  </p>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <button onClick={handleDownloadCredentials} className="btn-primary"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.55rem 1rem', fontWeight: 800 }}>
                      <LuDownload size={14} /> Download credentials
                    </button>
                    <button onClick={copyAll}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.55rem 0.95rem', borderRadius: 9, border: '1px solid rgba(255,255,255,0.14)', background: 'rgba(255,255,255,0.05)', color: copied ? 'var(--kpi-green)' : 'var(--clr-text)', fontFamily: 'inherit', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}>
                      {copied ? <><LuCheck size={14} /> Copied</> : <><LuCopy size={14} /> Copy all</>}
                    </button>
                  </div>
                </div>

                {!isCompany && (
                <div className="glass-inner" style={{ padding: '1rem', marginBottom: '0.85rem' }}>
                  <div style={{ fontSize: '0.86rem', fontWeight: 700, color: 'var(--clr-text)', marginBottom: '0.3rem' }}>
                    Send welcome SMS
                  </div>
                  <p style={{ fontSize: '0.78rem', color: 'var(--clr-muted)', margin: '0 0 0.75rem', lineHeight: 1.5 }}>
                    Texts each driver their login. This issues a <strong>new</strong> password per driver,
                    so download the credentials again afterwards. About 2 SMS segments each
                    — roughly {credentials.length * 2} credits for {credentials.length} driver{credentials.length === 1 ? '' : 's'}.
                  </p>
                  {busy && progress.label.startsWith('Sending') && (
                    <div style={{ marginBottom: '0.6rem' }}>
                      <div style={{ fontSize: '0.76rem', color: 'var(--clr-muted)', marginBottom: '0.3rem' }}>{progress.done} of {progress.total}</div>
                      <div style={{ height: 6, borderRadius: 999, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                        <div style={{ width: `${pct}%`, height: '100%', background: 'var(--clr-accent)', transition: 'width 0.25s' }} />
                      </div>
                    </div>
                  )}
                  <button onClick={handleSendSms} disabled={busy}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.55rem 1rem', borderRadius: 9, border: '1px solid rgba(96,165,250,0.35)', background: 'rgba(96,165,250,0.1)', color: '#60a5fa', fontFamily: 'inherit', fontSize: '0.8rem', fontWeight: 700, cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.6 : 1 }}>
                    <LuSend size={14} /> {smsDone ? 'Send again' : `Send to ${credentials.length} driver${credentials.length === 1 ? '' : 's'}`}
                  </button>

                  {smsDone && (
                    <div style={{ marginTop: '0.7rem', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '0.4rem', color: smsFailures > 0 ? '#fbbf24' : 'var(--kpi-green)' }}>
                      {smsFailures > 0 ? <LuCircleX size={14} /> : <LuCircleCheck size={14} />}
                      {smsFailures > 0
                        ? `${smsFailures} message(s) could not be delivered — give those drivers the password from the file.`
                        : 'All messages delivered.'}
                    </div>
                  )}
                </div>
                )}

                <div style={{ maxHeight: 200, overflowY: 'auto', marginBottom: '1rem' }}>
                  <table style={{ width: '100%', fontSize: '0.76rem', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ textAlign: 'left', color: 'var(--clr-muted)' }}>
                        <th style={{ padding: '0.3rem 0.4rem', fontWeight: 700 }}>Driver</th>
                        <th style={{ padding: '0.3rem 0.4rem', fontWeight: 700 }}>Phone</th>
                        <th style={{ padding: '0.3rem 0.4rem', fontWeight: 700 }}>Password</th>
                        <th style={{ padding: '0.3rem 0.4rem', fontWeight: 700 }}>Vehicle</th>
                      </tr>
                    </thead>
                    <tbody>
                      {credentials.map((c, i) => (
                        <tr key={i} style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                          <td style={{ padding: '0.3rem 0.4rem', color: 'var(--clr-text)' }}>{c.name}</td>
                          <td style={{ padding: '0.3rem 0.4rem', color: 'var(--clr-muted)' }}>{c.phone_number}</td>
                          <td style={{ padding: '0.3rem 0.4rem', color: 'var(--clr-accent)', fontWeight: 700, fontFamily: 'Consolas, monospace', userSelect: 'all' }}>{c.password}</td>
                          <td style={{ padding: '0.3rem 0.4rem', color: 'var(--clr-muted)' }}>{c.plate_number ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {result.skipped.length > 0 && (
              <div className="glass-inner" style={{ padding: '0.75rem 1rem', marginBottom: '1rem', maxHeight: 140, overflowY: 'auto' }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--clr-text)', marginBottom: '0.35rem' }}>Skipped rows</div>
                {result.skipped.map((s, i) => (
                  <div key={i} style={{ fontSize: '0.75rem', color: 'var(--clr-muted)', padding: '0.15rem 0' }}>
                    Row {s.row}: {s.message}
                  </div>
                ))}
              </div>
            )}

            <button onClick={onClose} className="btn-primary" style={{ width: '100%', padding: '0.65rem', fontWeight: 800 }}>
              Done
            </button>
          </>
        )}
      </div>
    </div>
  )
}
