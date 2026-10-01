import { useState, useEffect, useCallback } from 'react'
import {
  LuUsers, LuPlus, LuX, LuTriangleAlert, LuRefreshCw, LuSearch,
  LuPencil, LuUserMinus, LuTruck, LuBadgeCheck, LuClock,
} from 'react-icons/lu'
import { companyApi } from '../../lib/apiClient'
import { absoluteUploadUrl } from '../../lib/uploadUrl'
import DocumentUploadField from '../../components/fleet/DocumentUploadField'
import CredentialResultModal, { type CredentialResult } from '../../components/CredentialResultModal'

interface CompanyDriver {
  id: string
  first_name: string
  last_name: string | null
  phone_number: string
  email: string | null
  is_active: number
  status: string
  is_verified: number
  rating: number | null
  total_trips: number | null
  national_id_url: string | null
  license_url: string | null
  libre_url: string | null
  rejection_reason: string | null
  vehicle_id: string | null
  vehicle_plate: string | null
  created_at: string
}

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

const LIMIT = 25

export default function CompanyDriversPanel({ onToast, readOnly }: {
  onToast: (message: string) => void
  readOnly: boolean
}) {
  const [drivers, setDrivers] = useState<CompanyDriver[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  const [filters, setFilters] = useState({ search: '', verified: '' })
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)

  const [showCreate, setShowCreate] = useState(false)
  const [editTarget, setEditTarget] = useState<CompanyDriver | null>(null)
  const [removeTarget, setRemoveTarget] = useState<CompanyDriver | null>(null)
  const [saving, setSaving] = useState(false)
  const [formErr, setFormErr] = useState('')
  // With the SMS provider on a restricted campaign the text rarely arrives, so the
  // company needs the password itself — a toast cannot hold it.
  const [credential, setCredential] = useState<CredentialResult | null>(null)

  const [f, setF] = useState({ first_name: '', last_name: '', phone_number: '', email: '' })
  const [fNationalId, setFNationalId] = useState('')
  const [fLicense, setFLicense] = useState('')
  const [fLibre, setFLibre] = useState('')

  const totalPages = Math.max(1, Math.ceil(total / LIMIT))

  const load = useCallback(async () => {
    setLoading(true); setErr('')
    try {
      const { data } = await companyApi.listDrivers({
        page, limit: LIMIT,
        search: filters.search.trim() || undefined,
        verified: (filters.verified || undefined) as any,
      })
      setDrivers(data.drivers ?? [])
      setTotal(data.pagination?.total ?? 0)
    } catch (e: any) {
      setErr(e.response?.data?.message ?? 'Could not load your drivers.')
    } finally { setLoading(false) }
  }, [page, filters])

  useEffect(() => {
    const t = setTimeout(load, 300)
    return () => clearTimeout(t)
  }, [load])

  const setFilter = (patch: Partial<typeof filters>) => {
    setFilters(prev => ({ ...prev, ...patch }))
    setPage(1)
  }

  const resetCreate = () => {
    setF({ first_name: '', last_name: '', phone_number: '', email: '' })
    setFNationalId(''); setFLicense(''); setFLibre(''); setFormErr('')
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!f.first_name.trim() || !f.phone_number.trim()) {
      setFormErr('First name and phone number are required.'); return
    }
    setSaving(true); setFormErr('')
    try {
      const { data } = await companyApi.createDriver({
        first_name: f.first_name.trim(),
        last_name: f.last_name.trim() || undefined,
        phone_number: f.phone_number.trim(),
        email: f.email.trim() || undefined,
        national_id: fNationalId || undefined,
        license: fLicense || undefined,
        libre: fLibre || undefined,
      })
      setCredential({
        name: `${f.first_name.trim()} ${f.last_name.trim()}`.trim(),
        phone_number: data.phone_number ?? f.phone_number.trim(),
        password: data.password ?? null,
        sms_sent: data.sms_sent,
        message: data.message ?? 'Driver added.',
      })
      resetCreate(); setShowCreate(false); load()
    } catch (e: any) {
      setFormErr(e.response?.data?.message ?? 'Could not add this driver.')
    } finally { setSaving(false) }
  }

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editTarget) return
    setSaving(true); setFormErr('')
    try {
      await companyApi.updateDriver(editTarget.id, {
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
      const { data } = await companyApi.removeDriver(removeTarget.id)
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
        <h2 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--clr-text)', flex: 1, display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
          <LuUsers size={17} /> My Drivers
        </h2>
        <button onClick={load} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.3rem 0.7rem', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: 'var(--clr-muted)', fontFamily: 'inherit', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer' }}>
          <LuRefreshCw size={12} /> Refresh
        </button>
        {!readOnly && (
          <button onClick={() => { resetCreate(); setShowCreate(true) }}
            style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.4rem 0.85rem', borderRadius: 9, border: 'none', background: 'var(--clr-accent)', color: '#080b14', fontFamily: 'inherit', fontSize: '0.78rem', fontWeight: 800, cursor: 'pointer' }}>
            <LuPlus size={13} /> Add Driver
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="glass" style={{ padding: '0.75rem 1rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ flex: 1, minWidth: 160, display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: '0.4rem 0.7rem' }}>
          <LuSearch size={13} style={{ color: 'var(--clr-muted)', flexShrink: 0 }} />
          <input value={filters.search} onChange={e => setFilter({ search: e.target.value })} placeholder="Search name or phone"
            style={{ background: 'none', border: 'none', color: 'var(--clr-text)', fontFamily: 'inherit', fontSize: '0.8rem', outline: 'none', width: '100%' }} />
          {filters.search && <button onClick={() => setFilter({ search: '' })} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--clr-muted)', padding: 0, display: 'flex' }}><LuX size={12} /></button>}
        </div>
        <select value={filters.verified} onChange={e => setFilter({ verified: e.target.value })}
          style={{ padding: '0.4rem 0.6rem', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: 'var(--clr-text)', fontFamily: 'inherit', fontSize: '0.78rem', outline: 'none' }}>
          <option value="" style={{ background: '#0f172a' }}>All drivers</option>
          <option value="yes" style={{ background: '#0f172a' }}>Verified</option>
          <option value="no" style={{ background: '#0f172a' }}>Awaiting verification</option>
        </select>
      </div>

      {err && <div className="alert alert-error"><LuTriangleAlert size={13} /> {err}</div>}

      {/* List */}
      {loading ? (
        <div style={{ color: 'var(--clr-muted)', fontSize: '0.85rem', padding: '1rem 0' }}>Loading…</div>
      ) : drivers.length === 0 ? (
        <div className="glass-inner" style={{ padding: '2rem', textAlign: 'center', color: 'var(--clr-muted)', fontSize: '0.85rem' }}>
          {total === 0 && !filters.search
            ? <>No drivers yet. Use <strong style={{ color: 'var(--clr-text)' }}>Add Driver</strong> to add your first one.</>
            : 'No drivers match these filters.'}
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
                      {d.is_verified ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.2rem', padding: '0.15rem 0.5rem', borderRadius: 999, background: 'rgba(52,211,153,0.15)', color: '#34d399', fontSize: '0.7rem', fontWeight: 700 }}>
                          <LuBadgeCheck size={11} /> Verified
                        </span>
                      ) : (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.2rem', padding: '0.15rem 0.5rem', borderRadius: 999, background: 'rgba(251,191,36,0.15)', color: '#fbbf24', fontSize: '0.7rem', fontWeight: 700 }}>
                          <LuClock size={11} /> Awaiting verification
                        </span>
                      )}
                      <span style={{ padding: '0.15rem 0.5rem', borderRadius: 999, background: 'rgba(255,255,255,0.06)', color: STATUS_COLOR[d.status] ?? 'var(--clr-muted)', fontSize: '0.7rem', fontWeight: 700 }}>
                        {d.status?.replace(/_/g, ' ')}
                      </span>
                    </div>

                    <div style={{ fontSize: '0.78rem', color: 'var(--clr-muted)' }}>
                      {d.phone_number}{d.email ? ` · ${d.email}` : ''}
                    </div>

                    {/* The one thing a company most needs to know about an
                        unverified driver: what they cannot do yet. */}
                    {!d.is_verified && (
                      <div style={{ fontSize: '0.75rem', color: 'var(--kpi-gold)', marginTop: '0.3rem', lineHeight: 1.45 }}>
                        They can sign in to the driver app, but cannot be put on a vehicle until
                        Afri Logistics verifies them.
                      </div>
                    )}
                    {d.rejection_reason && (
                      <div style={{ fontSize: '0.75rem', color: '#f87171', marginTop: '0.25rem', fontStyle: 'italic' }}>
                        Rejected: {d.rejection_reason}
                      </div>
                    )}

                    <div style={{ fontSize: '0.78rem', marginTop: '0.3rem', color: d.vehicle_plate ? '#34d399' : 'var(--clr-muted)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                      <LuTruck size={12} />
                      {d.vehicle_plate ? <>Driving <strong>{d.vehicle_plate}</strong></> : 'No vehicle assigned'}
                    </div>

                    <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                      {docs.length > 0 ? docs : (
                        <span style={{ fontSize: '0.74rem', color: 'var(--clr-muted)', fontStyle: 'italic' }}>
                          No documents uploaded — these are optional.
                        </span>
                      )}
                    </div>
                  </div>

                  {!readOnly && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', alignItems: 'flex-end' }}>
                      <button onClick={() => { setEditTarget({ ...d }); setFormErr('') }}
                        style={{ padding: '0.3rem 0.65rem', borderRadius: 7, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)', color: 'var(--clr-muted)', fontFamily: 'inherit', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        <LuPencil size={11} /> Edit
                      </button>
                      <button onClick={() => { setRemoveTarget(d); setFormErr('') }}
                        style={{ padding: '0.3rem 0.6rem', borderRadius: 7, border: '1px solid rgba(251,191,36,0.4)', background: 'rgba(251,191,36,0.1)', color: '#fbbf24', fontFamily: 'inherit', fontSize: '0.74rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        <LuUserMinus size={11} /> Remove
                      </button>
                    </div>
                  )}
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
          <span style={{ fontSize: '0.78rem', color: 'var(--clr-muted)' }}>Page {page} of {totalPages} · {total} drivers</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
            style={{ padding: '0.3rem 0.6rem', borderRadius: 7, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: 'var(--clr-muted)', cursor: 'pointer', opacity: page === totalPages ? 0.4 : 1 }}>›</button>
        </div>
      )}

      {/* ── Add driver ─────────────────────────────────────────────────────── */}
      {showCreate && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }} onClick={() => !saving && setShowCreate(false)}>
          <div className="glass" style={{ borderRadius: 18, padding: '1.5rem', maxWidth: 500, width: '100%', maxHeight: '90vh', overflowY: 'auto', position: 'relative' }} onClick={e => e.stopPropagation()}>
            <button onClick={() => setShowCreate(false)} style={{ position: 'absolute', top: '0.85rem', right: '0.85rem', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--clr-muted)' }}><LuX size={18} /></button>
            <h3 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--clr-text)', marginBottom: '0.35rem' }}>Add Driver</h3>
            <p style={{ fontSize: '0.76rem', color: 'var(--clr-muted)', marginBottom: '1rem', lineHeight: 1.5 }}>
              We text them a password so they can sign in straight away. Afri Logistics verifies
              them before they can be put on a vehicle. Documents are optional.
            </p>
            {formErr && <div className="alert alert-error" style={{ marginBottom: '0.75rem', fontSize: '0.8rem' }}><LuTriangleAlert size={13} /> {formErr}</div>}

            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
                <div><label style={labelStyle}>First name *</label><input value={f.first_name} onChange={e => setF({ ...f, first_name: e.target.value })} style={inputStyle} /></div>
                <div><label style={labelStyle}>Last name</label><input value={f.last_name} onChange={e => setF({ ...f, last_name: e.target.value })} style={inputStyle} /></div>
              </div>
              <div><label style={labelStyle}>Phone number *</label><input value={f.phone_number} onChange={e => setF({ ...f, phone_number: e.target.value })} placeholder="09… or +2519…" style={inputStyle} /></div>
              <div><label style={labelStyle}>Email (optional)</label><input type="email" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} style={inputStyle} /></div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', paddingTop: '0.4rem', borderTop: '1px solid rgba(255,255,255,0.09)' }}>
                <p style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--clr-text)', margin: 0 }}>
                  Documents<span style={{ fontWeight: 500, color: 'var(--clr-muted)' }}> — all optional</span>
                </p>
                <DocumentUploadField label="National ID" value={fNationalId} onChange={setFNationalId} disabled={saving} />
                <DocumentUploadField label="Driving Licence" value={fLicense} onChange={setFLicense} disabled={saving} />
                <DocumentUploadField label="Libre Document" hint="Image or PDF" value={fLibre} onChange={setFLibre} disabled={saving} />
              </div>

              <button type="submit" disabled={saving} className="btn-primary" style={{ padding: '0.65rem', fontWeight: 800 }}>
                {saving ? 'Adding…' : 'Add Driver & Send Login'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ── Edit ───────────────────────────────────────────────────────────── */}
      {editTarget && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }} onClick={() => !saving && setEditTarget(null)}>
          <div className="glass" style={{ borderRadius: 18, padding: '1.5rem', maxWidth: 440, width: '100%', position: 'relative' }} onClick={e => e.stopPropagation()}>
            <button onClick={() => setEditTarget(null)} style={{ position: 'absolute', top: '0.85rem', right: '0.85rem', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--clr-muted)' }}><LuX size={18} /></button>
            <h3 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--clr-text)', marginBottom: '1rem' }}>Edit driver</h3>
            {formErr && <div className="alert alert-error" style={{ marginBottom: '0.75rem', fontSize: '0.8rem' }}>{formErr}</div>}
            <form onSubmit={handleEdit} style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
                <div><label style={labelStyle}>First name *</label><input value={editTarget.first_name} onChange={e => setEditTarget({ ...editTarget, first_name: e.target.value })} style={inputStyle} /></div>
                <div><label style={labelStyle}>Last name</label><input value={editTarget.last_name ?? ''} onChange={e => setEditTarget({ ...editTarget, last_name: e.target.value })} style={inputStyle} /></div>
              </div>
              <div><label style={labelStyle}>Email</label><input type="email" value={editTarget.email ?? ''} onChange={e => setEditTarget({ ...editTarget, email: e.target.value })} style={inputStyle} /></div>
              <p style={{ fontSize: '0.74rem', color: 'var(--clr-muted)', margin: 0, lineHeight: 1.45 }}>
                The phone number is how they sign in and cannot be changed here.
              </p>
              <button type="submit" disabled={saving} className="btn-primary" style={{ padding: '0.65rem', fontWeight: 800 }}>{saving ? 'Saving…' : 'Save Changes'}</button>
            </form>
          </div>
        </div>
      )}

      {/* ── Remove ─────────────────────────────────────────────────────────── */}
      {removeTarget && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }} onClick={() => !saving && setRemoveTarget(null)}>
          <div className="glass" style={{ borderRadius: 18, padding: '1.5rem', maxWidth: 440, width: '100%' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <LuTriangleAlert size={18} color="#fbbf24" />
              <h3 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--clr-text)' }}>
                Remove {removeTarget.first_name} {removeTarget.last_name ?? ''}?
              </h3>
            </div>
            <p style={{ fontSize: '0.82rem', color: 'var(--clr-muted)', lineHeight: 1.55, marginBottom: '1rem' }}>
              They come off your driver list and off any of your vehicles. Their own account,
              earnings and delivery history are kept — this does not delete the person.
            </p>
            {formErr && <div className="alert alert-error" style={{ marginBottom: '0.75rem', fontSize: '0.8rem' }}>{formErr}</div>}
            <div style={{ display: 'flex', gap: '0.6rem' }}>
              <button onClick={() => setRemoveTarget(null)} disabled={saving}
                style={{ flex: 1, padding: '0.6rem', borderRadius: 10, border: '1px solid rgba(255,255,255,0.14)', background: 'rgba(255,255,255,0.05)', color: 'var(--clr-text)', fontFamily: 'inherit', fontSize: '0.83rem', fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleRemove} disabled={saving}
                style={{ flex: 1.3, padding: '0.6rem', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#f59e0b,#b45309)', color: '#fff', fontFamily: 'inherit', fontSize: '0.83rem', fontWeight: 800, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.55 : 1 }}>
                {saving ? 'Removing…' : 'Remove from my drivers'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
