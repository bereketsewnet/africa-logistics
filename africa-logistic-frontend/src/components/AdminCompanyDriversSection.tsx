import { useState, useEffect, useCallback } from 'react'
import {
  LuUsers, LuPlus, LuX, LuTriangleAlert, LuRefreshCw, LuSearch,
  LuSend, LuUserMinus, LuTrash2, LuPencil, LuTruck, LuBadgeCheck,
} from 'react-icons/lu'
import { adminCompanyDriverApi, adminCompanyApi } from '../lib/apiClient'
import { absoluteUploadUrl } from '../lib/uploadUrl'
import DocumentUploadField from './fleet/DocumentUploadField'
import CredentialResultModal, { type CredentialResult } from './CredentialResultModal'

interface CompanyDriver {
  id: string
  first_name: string
  last_name: string | null
  phone_number: string
  email: string | null
  is_active: number
  company_id: string
  company_name: string
  status: string
  is_verified: number
  national_id_url: string | null
  license_url: string | null
  libre_url: string | null
  vehicle_id: string | null
  vehicle_plate: string | null
  created_at: string
}

interface CompanyOption { id: string; company_name: string }

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '0.6rem 0.8rem', borderRadius: 10,
  border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)',
  color: 'var(--clr-text)', fontFamily: 'inherit', fontSize: '0.85rem', boxSizing: 'border-box',
}
const labelStyle: React.CSSProperties = {
  fontSize: '0.75rem', fontWeight: 600, color: 'var(--clr-muted)', marginBottom: '0.3rem', display: 'block',
}

const STATUS_COLOR: Record<string, string> = {
  AVAILABLE: 'var(--kpi-green)', ON_JOB: '#60a5fa', OFFLINE: '#94a3b8', SUSPENDED: '#fca5a5',
}

const LIMIT = 15

/**
 * The drivers on a company's roster.
 *
 * A company driver is an ordinary role-3 driver whose profile carries a
 * company_id — not a separate kind of account. That is what keeps them
 * dispatchable, payable and rateable by every existing code path, while still
 * only ever appearing under their own company here.
 *
 * `lockedCompanyId` is used when this is embedded in a company's detail screen:
 * the company is then fixed, so its filter and picker are hidden rather than
 * offering a choice that must not be made.
 */
export default function AdminCompanyDriversSection({
  onToast, lockedCompanyId, lockedCompanyName, canPurge,
}: {
  onToast: (message: string) => void
  lockedCompanyId?: string
  lockedCompanyName?: string
  canPurge: boolean
}) {
  const locked = Boolean(lockedCompanyId)

  const [drivers, setDrivers] = useState<CompanyDriver[]>([])
  const [companies, setCompanies] = useState<CompanyOption[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  const [search, setSearch] = useState('')
  const [companyFilter, setCompanyFilter] = useState(lockedCompanyId ?? '')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)

  const [showCreate, setShowCreate] = useState(false)
  const [editTarget, setEditTarget] = useState<CompanyDriver | null>(null)
  const [removeTarget, setRemoveTarget] = useState<CompanyDriver | null>(null)
  const [removeMode, setRemoveMode] = useState<'detach' | 'purge'>('detach')
  const [saving, setSaving] = useState(false)
  const [formErr, setFormErr] = useState('')
  const [credential, setCredential] = useState<CredentialResult | null>(null)

  // create — the same fields as the normal admin driver registration
  const [fCompany, setFCompany] = useState(lockedCompanyId ?? '')
  const [fFirst, setFFirst] = useState(''); const [fLast, setFLast] = useState('')
  const [fPhone, setFPhone] = useState(''); const [fEmail, setFEmail] = useState('')
  const [fNationalId, setFNationalId] = useState('')
  const [fLicense, setFLicense] = useState('')
  const [fLibre, setFLibre] = useState('')

  const totalPages = Math.max(1, Math.ceil(total / LIMIT))

  const load = useCallback(async () => {
    setLoading(true); setErr('')
    try {
      const { data } = await adminCompanyDriverApi.list({
        page, limit: LIMIT,
        search: search.trim() || undefined,
        company_id: (lockedCompanyId ?? companyFilter) || undefined,
      })
      setDrivers(data.drivers ?? [])
      setTotal(data.pagination?.total ?? 0)
    } catch (e: any) {
      setErr(e.response?.data?.message ?? 'Could not load company drivers.')
    } finally { setLoading(false) }
  }, [page, search, companyFilter, lockedCompanyId])

  // Debounced so typing in the search box does not fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(load, 300)
    return () => clearTimeout(t)
  }, [load])

  useEffect(() => {
    if (locked) return
    adminCompanyApi.list({ limit: 100 })
      .then(({ data }) => setCompanies((data.companies ?? []).map((c: any) => ({ id: c.id, company_name: c.company_name }))))
      .catch(() => {})
  }, [locked])

  const resetCreate = () => {
    setFFirst(''); setFLast(''); setFPhone(''); setFEmail('')
    setFNationalId(''); setFLicense(''); setFLibre(''); setFormErr('')
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    const companyId = lockedCompanyId ?? fCompany
    if (!companyId) { setFormErr('Choose which company this driver belongs to.'); return }
    if (!fFirst.trim() || !fPhone.trim()) { setFormErr('First name and phone number are required.'); return }
    setSaving(true); setFormErr('')
    try {
      const { data } = await adminCompanyDriverApi.create({
        company_id: companyId,
        first_name: fFirst.trim(),
        last_name: fLast.trim() || undefined,
        phone_number: fPhone.trim(),
        email: fEmail.trim() || undefined,
        national_id: fNationalId || undefined,
        license: fLicense || undefined,
        libre: fLibre || undefined,
      })
      // The driver exists even when the SMS failed, so report which happened.
      setCredential({
        name: `${fFirst.trim()} ${fLast.trim()}`.trim(),
        phone_number: data.phone_number ?? fPhone.trim(),
        password: data.password ?? null,
        sms_sent: data.sms_sent,
        message: data.message ?? 'Driver registered.',
      })
      resetCreate(); setShowCreate(false); load()
    } catch (e: any) {
      setFormErr(e.response?.data?.message ?? 'Could not register this driver.')
    } finally { setSaving(false) }
  }

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editTarget) return
    setSaving(true); setFormErr('')
    try {
      await adminCompanyDriverApi.update(editTarget.id, {
        first_name: editTarget.first_name,
        last_name: editTarget.last_name ?? '',
        email: editTarget.email ?? '',
      })
      onToast('Driver updated.'); setEditTarget(null); load()
    } catch (e: any) {
      setFormErr(e.response?.data?.message ?? 'Could not save changes.')
    } finally { setSaving(false) }
  }

  const handleRemove = async () => {
    if (!removeTarget) return
    setSaving(true); setFormErr('')
    try {
      const { data } = removeMode === 'purge'
        ? await adminCompanyDriverApi.purge(removeTarget.id)
        : await adminCompanyDriverApi.detach(removeTarget.id)
      onToast(data.message ?? 'Driver removed.'); setRemoveTarget(null); load()
    } catch (e: any) {
      setFormErr(e.response?.data?.message ?? 'Could not remove this driver.')
    } finally { setSaving(false) }
  }

  const docLink = (label: string, url: string | null) => url ? (
    <a key={label} href={absoluteUploadUrl(url) || '#'} target="_blank" rel="noreferrer"
      style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--clr-accent)', textDecoration: 'none', padding: '0.15rem 0.5rem', borderRadius: 6, border: '1px solid rgba(97,148,31,0.25)', background: 'rgba(97,148,31,0.08)' }}>
      {label}
    </a>
  ) : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {credential && <CredentialResultModal result={credential} onClose={() => setCredential(null)} />}
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        {!locked && (
          <h2 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--clr-text)', flex: 1, display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
            <LuUsers size={17} /> Company Drivers
          </h2>
        )}
        {locked && <div style={{ flex: 1 }} />}
        <button onClick={load} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.3rem 0.7rem', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: 'var(--clr-muted)', fontFamily: 'inherit', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer' }}>
          <LuRefreshCw size={12} /> Refresh
        </button>
        <button onClick={() => { resetCreate(); setFCompany(lockedCompanyId ?? companyFilter ?? ''); setShowCreate(true) }}
          style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.4rem 0.85rem', borderRadius: 9, border: 'none', background: 'var(--clr-accent)', color: '#080b14', fontFamily: 'inherit', fontSize: '0.78rem', fontWeight: 800, cursor: 'pointer' }}>
          <LuPlus size={13} /> Add Driver
        </button>
      </div>

      {/* Filters */}
      <div className="glass" style={{ padding: '0.75rem 1rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ flex: 1, minWidth: 160, display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: '0.4rem 0.7rem' }}>
          <LuSearch size={13} style={{ color: 'var(--clr-muted)', flexShrink: 0 }} />
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} placeholder="Search name or phone"
            style={{ background: 'none', border: 'none', color: 'var(--clr-text)', fontFamily: 'inherit', fontSize: '0.8rem', outline: 'none', width: '100%' }} />
          {search && <button onClick={() => { setSearch(''); setPage(1) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--clr-muted)', padding: 0, display: 'flex' }}><LuX size={12} /></button>}
        </div>
        {!locked && (
          <select value={companyFilter} onChange={e => { setCompanyFilter(e.target.value); setPage(1) }}
            style={{ padding: '0.4rem 0.6rem', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: 'var(--clr-text)', fontFamily: 'inherit', fontSize: '0.78rem', outline: 'none', maxWidth: 200 }}>
            <option value="" style={{ background: '#0f172a' }}>All companies</option>
            {companies.map(c => <option key={c.id} value={c.id} style={{ background: '#0f172a' }}>{c.company_name}</option>)}
          </select>
        )}
      </div>

      {err && <div className="alert alert-error"><LuTriangleAlert size={13} /> {err}</div>}

      {/* List */}
      {loading ? (
        <div style={{ color: 'var(--clr-muted)', fontSize: '0.85rem', padding: '1rem 0' }}>Loading…</div>
      ) : drivers.length === 0 ? (
        <div className="glass-inner" style={{ padding: '2rem', textAlign: 'center', color: 'var(--clr-muted)', fontSize: '0.85rem' }}>
          No drivers on {locked ? 'this company' : 'any company'} yet. Use <strong style={{ color: 'var(--clr-text)' }}>Add Driver</strong> to register one.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
          {drivers.map(d => {
            const docs = [
              docLink('National ID', d.national_id_url),
              docLink('Licence', d.license_url),
              docLink('Libre', d.libre_url),
            ].filter(Boolean)

            return (
              <div key={d.id} className="glass-inner" style={{ padding: '0.9rem 1rem' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.3rem' }}>
                      <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--clr-text)' }}>
                        {d.first_name} {d.last_name ?? ''}
                      </span>
                      {Boolean(d.is_verified) && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.2rem', padding: '0.15rem 0.5rem', borderRadius: 999, background: 'rgba(52,211,153,0.15)', color: '#34d399', fontSize: '0.7rem', fontWeight: 700 }}>
                          <LuBadgeCheck size={11} /> Verified
                        </span>
                      )}
                      <span style={{ padding: '0.15rem 0.5rem', borderRadius: 999, background: 'rgba(255,255,255,0.06)', color: STATUS_COLOR[d.status] ?? 'var(--clr-muted)', fontSize: '0.7rem', fontWeight: 700 }}>
                        {d.status?.replace(/_/g, ' ')}
                      </span>
                      {!d.is_active && <span className="badge badge-red" style={{ fontSize: '0.67rem' }}>Login suspended</span>}
                    </div>

                    <div style={{ fontSize: '0.78rem', color: 'var(--clr-muted)' }}>
                      {d.phone_number}{d.email ? ` · ${d.email}` : ''}
                    </div>
                    {!locked && (
                      <div style={{ fontSize: '0.78rem', color: 'var(--clr-muted)', marginTop: '0.25rem' }}>
                        Company: <strong style={{ color: 'var(--clr-text)' }}>{d.company_name}</strong>
                      </div>
                    )}

                    <div style={{ fontSize: '0.78rem', marginTop: '0.3rem', color: d.vehicle_plate ? '#34d399' : 'var(--clr-muted)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                      <LuTruck size={12} />
                      {d.vehicle_plate ? <>Driving <strong>{d.vehicle_plate}</strong></> : 'No vehicle assigned'}
                    </div>

                    <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                      {docs.length > 0 ? docs : (
                        <span style={{ fontSize: '0.74rem', color: 'var(--clr-muted)', fontStyle: 'italic' }}>
                          No documents uploaded — these are optional for an admin-registered driver.
                        </span>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', alignItems: 'flex-end' }}>
                    <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      <button onClick={() => { setEditTarget({ ...d }); setFormErr('') }}
                        style={{ padding: '0.3rem 0.6rem', borderRadius: 7, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)', color: 'var(--clr-muted)', fontFamily: 'inherit', fontSize: '0.74rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        <LuPencil size={11} /> Edit
                      </button>
                      <button onClick={async () => {
                        try {
                          const { data } = await adminCompanyDriverApi.resendCredentials(d.id)
                          setCredential({
                            name: `${d.first_name} ${d.last_name ?? ''}`.trim(),
                            phone_number: data.phone_number ?? d.phone_number,
                            password: data.password ?? null, sms_sent: data.sms_sent,
                            message: data.message ?? 'New login details issued.',
                          })
                        } catch (e: any) { onToast(e.response?.data?.message ?? 'Could not send credentials.') }
                      }}
                        style={{ padding: '0.3rem 0.6rem', borderRadius: 7, border: '1px solid rgba(96,165,250,0.3)', background: 'rgba(96,165,250,0.08)', color: '#60a5fa', fontFamily: 'inherit', fontSize: '0.74rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        <LuSend size={11} /> Resend login
                      </button>
                    </div>
                    <button onClick={() => { setRemoveTarget(d); setRemoveMode('detach'); setFormErr('') }}
                      style={{ padding: '0.3rem 0.6rem', borderRadius: 7, border: '1px solid rgba(251,191,36,0.4)', background: 'rgba(251,191,36,0.1)', color: '#fbbf24', fontFamily: 'inherit', fontSize: '0.74rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      <LuUserMinus size={11} /> Remove from company
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem' }}>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
            style={{ padding: '0.3rem 0.6rem', borderRadius: 7, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: 'var(--clr-muted)', cursor: 'pointer', opacity: page === 1 ? 0.4 : 1 }}>‹</button>
          <span style={{ fontSize: '0.78rem', color: 'var(--clr-muted)' }}>Page {page} of {totalPages} · {total} total</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
            style={{ padding: '0.3rem 0.6rem', borderRadius: 7, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: 'var(--clr-muted)', cursor: 'pointer', opacity: page === totalPages ? 0.4 : 1 }}>›</button>
        </div>
      )}

      {/* ── Add driver ─────────────────────────────────────────────────────── */}
      {showCreate && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }} onClick={() => !saving && setShowCreate(false)}>
          <div className="glass" style={{ borderRadius: 18, padding: '1.5rem', maxWidth: 520, width: '100%', maxHeight: '90vh', overflowY: 'auto', position: 'relative', boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }} onClick={e => e.stopPropagation()}>
            <button onClick={() => setShowCreate(false)} style={{ position: 'absolute', top: '0.85rem', right: '0.85rem', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--clr-muted)' }}><LuX size={18} /></button>
            <h3 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--clr-text)', marginBottom: '0.35rem' }}>
              Register Driver{locked && lockedCompanyName ? ` — ${lockedCompanyName}` : ''}
            </h3>
            <p style={{ fontSize: '0.76rem', color: 'var(--clr-muted)', marginBottom: '1rem', lineHeight: 1.5 }}>
              The account is active and verified straight away, and every document is optional.
              A password is generated and sent by SMS, and they must change it when they first sign in.
            </p>
            {formErr && <div className="alert alert-error" style={{ marginBottom: '0.75rem', fontSize: '0.8rem' }}><LuTriangleAlert size={13} /> {formErr}</div>}

            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {!locked && (
                <div>
                  <label style={labelStyle}>Company *</label>
                  <select value={fCompany} onChange={e => setFCompany(e.target.value)} style={inputStyle}>
                    <option value="" style={{ background: '#0f172a' }}>Choose a company…</option>
                    {companies.map(c => <option key={c.id} value={c.id} style={{ background: '#0f172a' }}>{c.company_name}</option>)}
                  </select>
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
                <div><label style={labelStyle}>First name *</label><input value={fFirst} onChange={e => setFFirst(e.target.value)} style={inputStyle} /></div>
                <div><label style={labelStyle}>Last name</label><input value={fLast} onChange={e => setFLast(e.target.value)} style={inputStyle} /></div>
              </div>
              <div><label style={labelStyle}>Phone number *</label><input value={fPhone} onChange={e => setFPhone(e.target.value)} placeholder="09… or +2519…" style={inputStyle} /></div>
              <div><label style={labelStyle}>Email (optional)</label><input type="email" value={fEmail} onChange={e => setFEmail(e.target.value)} style={inputStyle} /></div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', paddingTop: '0.4rem', borderTop: '1px solid rgba(255,255,255,0.09)' }}>
                <p style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--clr-text)', margin: 0 }}>
                  Documents<span style={{ fontWeight: 500, color: 'var(--clr-muted)' }}> — all optional</span>
                </p>
                <DocumentUploadField label="National ID" value={fNationalId} onChange={setFNationalId} disabled={saving} />
                <DocumentUploadField label="Driving Licence" value={fLicense} onChange={setFLicense} disabled={saving} />
                <DocumentUploadField label="Libre Document" hint="Ownership book — image or PDF" value={fLibre} onChange={setFLibre} disabled={saving} />
              </div>

              <button type="submit" disabled={saving} className="btn-primary" style={{ padding: '0.65rem', fontWeight: 800 }}>
                {saving ? 'Registering…' : 'Register Driver & Send Login'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ── Edit ───────────────────────────────────────────────────────────── */}
      {editTarget && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }} onClick={() => !saving && setEditTarget(null)}>
          <div className="glass" style={{ borderRadius: 18, padding: '1.5rem', maxWidth: 460, width: '100%', position: 'relative' }} onClick={e => e.stopPropagation()}>
            <button onClick={() => setEditTarget(null)} style={{ position: 'absolute', top: '0.85rem', right: '0.85rem', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--clr-muted)' }}><LuX size={18} /></button>
            <h3 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--clr-text)', marginBottom: '1rem' }}>Edit driver</h3>
            {formErr && <div className="alert alert-error" style={{ marginBottom: '0.75rem', fontSize: '0.8rem' }}><LuTriangleAlert size={13} /> {formErr}</div>}
            <form onSubmit={handleEdit} style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
                <div><label style={labelStyle}>First name *</label><input value={editTarget.first_name} onChange={e => setEditTarget({ ...editTarget, first_name: e.target.value })} style={inputStyle} /></div>
                <div><label style={labelStyle}>Last name</label><input value={editTarget.last_name ?? ''} onChange={e => setEditTarget({ ...editTarget, last_name: e.target.value })} style={inputStyle} /></div>
              </div>
              <div><label style={labelStyle}>Email</label><input type="email" value={editTarget.email ?? ''} onChange={e => setEditTarget({ ...editTarget, email: e.target.value })} style={inputStyle} /></div>
              <p style={{ fontSize: '0.74rem', color: 'var(--clr-muted)', margin: 0, lineHeight: 1.45 }}>
                The phone number is the login and cannot be changed here.
              </p>
              <button type="submit" disabled={saving} className="btn-primary" style={{ padding: '0.65rem', fontWeight: 800 }}>{saving ? 'Saving…' : 'Save Changes'}</button>
            </form>
          </div>
        </div>
      )}

      {/* ── Remove ─────────────────────────────────────────────────────────── */}
      {removeTarget && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }} onClick={() => !saving && setRemoveTarget(null)}>
          <div className="glass" style={{ borderRadius: 18, padding: '1.5rem', maxWidth: 460, width: '100%' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.85rem' }}>
              <LuTriangleAlert size={18} color="#fbbf24" />
              <h3 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--clr-text)' }}>
                Remove {removeTarget.first_name} {removeTarget.last_name ?? ''}?
              </h3>
            </div>

            {/* Two very different actions, so they are chosen explicitly rather
                than one being a hidden modifier of the other. */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.9rem' }}>
              {([
                { m: 'detach' as const, title: 'Take off this company', body: 'Keeps the account, its history and wallet. They become an independent driver and release any company vehicle they hold.' },
                ...(canPurge ? [{ m: 'purge' as const, title: 'Delete permanently', body: 'Removes the person and their account from the database entirely. This cannot be undone.' }] : []),
              ]).map(o => (
                <button key={o.m} onClick={() => setRemoveMode(o.m)} type="button"
                  style={{ textAlign: 'left', padding: '0.7rem 0.85rem', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit',
                    border: `1.5px solid ${removeMode === o.m ? (o.m === 'purge' ? '#f87171' : 'var(--clr-accent)') : 'rgba(255,255,255,0.1)'}`,
                    background: removeMode === o.m ? (o.m === 'purge' ? 'rgba(248,113,113,0.1)' : 'rgba(97,148,31,0.08)') : 'rgba(255,255,255,0.04)' }}>
                  <div style={{ fontSize: '0.83rem', fontWeight: 700, color: removeMode === o.m ? (o.m === 'purge' ? '#f87171' : 'var(--clr-accent)') : 'var(--clr-text)' }}>{o.title}</div>
                  <div style={{ fontSize: '0.74rem', color: 'var(--clr-muted)', marginTop: '0.2rem', lineHeight: 1.45 }}>{o.body}</div>
                </button>
              ))}
            </div>

            {formErr && <div className="alert alert-error" style={{ marginBottom: '0.75rem', fontSize: '0.8rem' }}>{formErr}</div>}

            <div style={{ display: 'flex', gap: '0.6rem' }}>
              <button onClick={() => setRemoveTarget(null)} disabled={saving}
                style={{ flex: 1, padding: '0.6rem', borderRadius: 10, border: '1px solid rgba(255,255,255,0.14)', background: 'rgba(255,255,255,0.05)', color: 'var(--clr-text)', fontFamily: 'inherit', fontSize: '0.83rem', fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleRemove} disabled={saving}
                style={{ flex: 1.3, padding: '0.6rem', borderRadius: 10, border: 'none', color: '#fff', fontFamily: 'inherit', fontSize: '0.83rem', fontWeight: 800, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.55 : 1,
                  background: removeMode === 'purge' ? 'linear-gradient(135deg,#ef4444,#b91c1c)' : 'linear-gradient(135deg,#f59e0b,#b45309)' }}>
                {saving ? 'Working…' : removeMode === 'purge'
                  ? <><LuTrash2 size={12} style={{ verticalAlign: '-2px' }} /> Delete permanently</>
                  : <><LuUserMinus size={12} style={{ verticalAlign: '-2px' }} /> Remove from company</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
