import { useState, useEffect, useCallback } from 'react'
import {
  LuBuilding2, LuPlus, LuX, LuTriangleAlert, LuRefreshCw, LuSearch,
  LuPencil, LuTrash2, LuCheck, LuBan, LuSend, LuTruck,
} from 'react-icons/lu'
import { adminCompanyApi } from '../lib/apiClient'
import AdminCompanyDetailSection from './AdminCompanyDetailSection'
import CredentialResultModal, { type CredentialResult } from './CredentialResultModal'

type CompanyStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED'

interface Company {
  id: string
  company_name: string
  legal_name: string | null
  tin_number: string | null
  license_number: string | null
  city: string | null
  address_line: string | null
  status: CompanyStatus
  admin_note: string | null
  owner_name: string
  owner_phone: string
  owner_email: string | null
  owner_is_active: number
  vehicle_count: number
  pending_count: number
  created_at: string
}

const STATUS_STYLE: Record<CompanyStatus, { bg: string; color: string; label: string }> = {
  PENDING:   { bg: 'rgba(251,191,36,0.15)', color: '#fbbf24', label: 'Pending' },
  APPROVED:  { bg: 'rgba(52,211,153,0.15)', color: '#34d399', label: 'Approved' },
  REJECTED:  { bg: 'rgba(248,113,113,0.15)', color: '#f87171', label: 'Rejected' },
  SUSPENDED: { bg: 'rgba(148,163,184,0.15)', color: '#94a3b8', label: 'Suspended' },
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '0.6rem 0.8rem', borderRadius: 10,
  border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)',
  color: 'var(--clr-text)', fontFamily: 'inherit', fontSize: '0.85rem', boxSizing: 'border-box',
}
const labelStyle: React.CSSProperties = {
  fontSize: '0.75rem', fontWeight: 600, color: 'var(--clr-muted)',
  marginBottom: '0.3rem', display: 'block',
}

const LIMIT = 15

/**
 * Transport companies. Each company is one login plus a profile; creating one
 * generates a password and texts it, exactly like the driver flow.
 *
 * Deleting a company is the most destructive action in the product — it takes
 * the whole fleet with it — so it goes through an impact preview and a typed
 * confirmation, and is refused outright while a delivery is in progress.
 */
export default function AdminCompaniesSection({ onToast, canDelete, onViewVehicles }: {
  onToast: (message: string) => void
  canDelete: boolean
  onViewVehicles: (companyId: string, companyName: string) => void
}) {
  const [companies, setCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)

  const [showCreate, setShowCreate] = useState(false)
  // The company opened in full. Its fleet and roster are managed in place
  // rather than on a separate screen, so there is one obvious way in.
  const [detailTarget, setDetailTarget] = useState<Company | null>(null)
  // Bumped after an edit or review so the open detail header reflects the change
  // instead of showing the values it was opened with.
  const [detailRefresh, setDetailRefresh] = useState(0)
  const [editTarget, setEditTarget] = useState<Company | null>(null)
  const [reviewTarget, setReviewTarget] = useState<Company | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Company | null>(null)
  const [saving, setSaving] = useState(false)
  const [formErr, setFormErr] = useState('')
  // The generated password has no other copy: it is hashed on save and the SMS is
  // currently undeliverable, so a vanishing toast meant an unusable account.
  const [credential, setCredential] = useState<CredentialResult | null>(null)

  // create
  const [cName, setCName] = useState(''); const [cLegal, setCLegal] = useState('')
  const [cTin, setCTin] = useState(''); const [cLicense, setCLicense] = useState('')
  const [cCity, setCCity] = useState(''); const [cAddress, setCAddress] = useState('')
  const [cFirst, setCFirst] = useState(''); const [cLast, setCLast] = useState('')
  const [cPhone, setCPhone] = useState(''); const [cEmail, setCEmail] = useState('')

  // review
  const [reviewAction, setReviewAction] = useState<'APPROVED' | 'REJECTED' | 'SUSPENDED'>('APPROVED')
  const [reviewNote, setReviewNote] = useState('')

  // delete
  const [impact, setImpact] = useState<any | null>(null)
  const [impactLoading, setImpactLoading] = useState(false)
  const [confirmText, setConfirmText] = useState('')

  const totalPages = Math.max(1, Math.ceil(total / LIMIT))

  const load = useCallback(async () => {
    setLoading(true); setErr('')
    try {
      const { data } = await adminCompanyApi.list({
        page, limit: LIMIT,
        search: search.trim() || undefined,
        status: statusFilter || undefined,
      })
      setCompanies(data.companies ?? [])
      setTotal(data.pagination?.total ?? 0)
    } catch (e: any) {
      setErr(e.response?.data?.message ?? 'Could not load companies.')
    } finally { setLoading(false) }
  }, [page, search, statusFilter])

  // Debounced so typing in the search box does not fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(load, 300)
    return () => clearTimeout(t)
  }, [load])

  const resetCreate = () => {
    setCName(''); setCLegal(''); setCTin(''); setCLicense(''); setCCity(''); setCAddress('')
    setCFirst(''); setCLast(''); setCPhone(''); setCEmail(''); setFormErr('')
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!cName.trim()) { setFormErr('Company name is required.'); return }
    if (!cFirst.trim() || !cPhone.trim()) { setFormErr('The login needs a first name and phone number.'); return }
    setSaving(true); setFormErr('')
    try {
      const { data } = await adminCompanyApi.create({
        company_name: cName.trim(), legal_name: cLegal.trim() || undefined,
        tin_number: cTin.trim() || undefined, license_number: cLicense.trim() || undefined,
        city: cCity.trim() || undefined, address_line: cAddress.trim() || undefined,
        first_name: cFirst.trim(), last_name: cLast.trim() || undefined,
        phone_number: cPhone.trim(), email: cEmail.trim() || undefined,
      })
      // The company exists even when the SMS failed, so report which happened — and
      // hand over the password when it did.
      setCredential({
        name: cName.trim(),
        phone_number: data.phone_number ?? cPhone.trim(),
        password: data.password ?? null,
        sms_sent: data.sms_sent,
        message: data.message ?? 'Company created.',
      })
      resetCreate(); setShowCreate(false); load()
    } catch (e: any) {
      setFormErr(e.response?.data?.message ?? 'Could not create this company.')
    } finally { setSaving(false) }
  }

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editTarget) return
    setSaving(true); setFormErr('')
    try {
      await adminCompanyApi.update(editTarget.id, {
        company_name: editTarget.company_name,
        legal_name: editTarget.legal_name ?? '',
        tin_number: editTarget.tin_number ?? '',
        license_number: editTarget.license_number ?? '',
        city: editTarget.city ?? '',
        address_line: editTarget.address_line ?? '',
      })
      onToast('Company updated.'); setEditTarget(null); setDetailRefresh(n => n + 1); load()
    } catch (e: any) {
      setFormErr(e.response?.data?.message ?? 'Could not save changes.')
    } finally { setSaving(false) }
  }

  const handleReview = async () => {
    if (!reviewTarget) return
    setSaving(true); setFormErr('')
    try {
      const { data } = await adminCompanyApi.review(reviewTarget.id, {
        action: reviewAction, admin_note: reviewNote.trim() || undefined,
      })
      onToast(data.message ?? 'Company reviewed.'); setReviewTarget(null); setReviewNote('')
      setDetailRefresh(n => n + 1); load()
    } catch (e: any) {
      setFormErr(e.response?.data?.message ?? 'Could not save the review.')
    } finally { setSaving(false) }
  }

  const openDelete = async (company: Company) => {
    setDeleteTarget(company); setConfirmText(''); setFormErr(''); setImpact(null)
    setImpactLoading(true)
    try {
      const { data } = await adminCompanyApi.deletionImpact(company.id)
      setImpact(data.impact)
    } catch (e: any) {
      setFormErr(e.response?.data?.message ?? 'Could not check what this would delete.')
    } finally { setImpactLoading(false) }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setSaving(true); setFormErr('')
    try {
      const { data } = await adminCompanyApi.remove(deleteTarget.id)
      // The company is gone, so its detail screen must go with it.
      onToast(data.message ?? 'Company deleted.'); setDeleteTarget(null); setDetailTarget(null); load()
    } catch (e: any) {
      setFormErr(e.response?.data?.message ?? 'Could not delete this company.')
    } finally { setSaving(false) }
  }

  const blocked = Number(impact?.active_orders ?? 0) > 0
  const confirmed = confirmText.trim() === deleteTarget?.company_name

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {credential && <CredentialResultModal result={credential} onClose={() => setCredential(null)} />}
      {detailTarget ? (
        <AdminCompanyDetailSection
          companyId={detailTarget.id}
          companyName={detailTarget.company_name}
          refreshKey={detailRefresh}
          canDelete={canDelete}
          onToast={onToast}
          // Reuse this screen's own modals so there is one implementation of
          // editing, reviewing and deleting a company, not two.
          onBack={() => { setDetailTarget(null); load() }}
          onEdit={() => { setEditTarget({ ...detailTarget }); setFormErr('') }}
          onReview={() => {
            setReviewTarget(detailTarget)
            setReviewAction(detailTarget.status === 'APPROVED' ? 'SUSPENDED' : 'APPROVED')
            setReviewNote(''); setFormErr('')
          }}
          onDelete={() => openDelete(detailTarget)}
        />
      ) : (
      <>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--clr-text)', flex: 1, display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
          <LuBuilding2 size={17} /> Transport Companies
        </h2>
        <button onClick={load} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.3rem 0.7rem', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: 'var(--clr-muted)', fontFamily: 'inherit', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer' }}>
          <LuRefreshCw size={12} /> Refresh
        </button>
        <button onClick={() => { resetCreate(); setShowCreate(true) }}
          style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.4rem 0.85rem', borderRadius: 9, border: 'none', background: 'var(--clr-accent)', color: '#080b14', fontFamily: 'inherit', fontSize: '0.78rem', fontWeight: 800, cursor: 'pointer' }}>
          <LuPlus size={13} /> Add Company
        </button>
      </div>

      {/* Filters */}
      <div className="glass" style={{ padding: '0.75rem 1rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ flex: 1, minWidth: 160, display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: '0.4rem 0.7rem' }}>
          <LuSearch size={13} style={{ color: 'var(--clr-muted)', flexShrink: 0 }} />
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} placeholder="Search name, TIN or phone"
            style={{ background: 'none', border: 'none', color: 'var(--clr-text)', fontFamily: 'inherit', fontSize: '0.8rem', outline: 'none', width: '100%' }} />
          {search && <button onClick={() => { setSearch(''); setPage(1) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--clr-muted)', padding: 0, display: 'flex' }}><LuX size={12} /></button>}
        </div>
        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1) }}
          style={{ padding: '0.4rem 0.6rem', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: 'var(--clr-text)', fontFamily: 'inherit', fontSize: '0.78rem', outline: 'none' }}>
          {['', 'PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED'].map(s => (
            <option key={s} value={s} style={{ background: '#0f172a' }}>{s || 'All statuses'}</option>
          ))}
        </select>
      </div>

      {err && <div className="alert alert-error"><LuTriangleAlert size={13} /> {err}</div>}

      {/* List */}
      {loading ? (
        <div style={{ color: 'var(--clr-muted)', fontSize: '0.85rem', padding: '1rem 0' }}>Loading…</div>
      ) : companies.length === 0 ? (
        <div className="glass-inner" style={{ padding: '2rem', textAlign: 'center', color: 'var(--clr-muted)', fontSize: '0.85rem' }}>
          No companies yet. Use <strong style={{ color: 'var(--clr-text)' }}>Add Company</strong> to register one.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
          {companies.map(c => {
            const st = STATUS_STYLE[c.status] ?? STATUS_STYLE.PENDING
            return (
              <div key={c.id} className="glass-inner" style={{ padding: '0.9rem 1rem' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 190 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.3rem' }}>
                      <button onClick={() => setDetailTarget(c)} title="Open this company"
                        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, fontSize: '0.95rem', color: 'var(--clr-text)', textAlign: 'left' }}>
                        {c.company_name}
                      </button>
                      <span style={{ padding: '0.2rem 0.6rem', borderRadius: 999, background: st.bg, color: st.color, fontSize: '0.72rem', fontWeight: 700 }}>{st.label}</span>
                      {!c.owner_is_active && <span className="badge badge-red" style={{ fontSize: '0.67rem' }}>Login suspended</span>}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem 1rem', fontSize: '0.78rem', color: 'var(--clr-muted)' }}>
                      {c.legal_name && <span>Legal: <strong style={{ color: 'var(--clr-text)' }}>{c.legal_name}</strong></span>}
                      {c.tin_number && <span>TIN: <strong style={{ color: 'var(--clr-text)' }}>{c.tin_number}</strong></span>}
                      {c.license_number && <span>Licence: <strong style={{ color: 'var(--clr-text)' }}>{c.license_number}</strong></span>}
                      {c.city && <span>{c.city}</span>}
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--clr-muted)', marginTop: '0.3rem' }}>
                      Login: <strong style={{ color: 'var(--clr-text)' }}>{c.owner_name}</strong> · {c.owner_phone}
                    </div>
                    {/* The way in to this company's fleet and drivers. Opening
                        the company is what makes adding a vehicle or a driver
                        findable, which it was not when both lived only on their
                        own separate screens. */}
                    <div style={{ marginTop: '0.45rem', display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                      <button onClick={() => setDetailTarget(c)}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', padding: '0.28rem 0.7rem', borderRadius: 7, border: '1px solid rgba(97,148,31,0.35)', background: 'rgba(97,148,31,0.12)', color: 'var(--clr-accent)', fontFamily: 'inherit', fontSize: '0.75rem', fontWeight: 800, cursor: 'pointer' }}>
                        <LuTruck size={11} /> Manage fleet &amp; drivers
                      </button>
                      <button onClick={() => onViewVehicles(c.id, c.company_name)}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', padding: '0.28rem 0.6rem', borderRadius: 7, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)', color: 'var(--clr-muted)', fontFamily: 'inherit', fontSize: '0.74rem', fontWeight: 700, cursor: 'pointer' }}>
                        {c.vehicle_count} vehicle{c.vehicle_count === 1 ? '' : 's'}
                        {c.pending_count > 0 && <span style={{ color: 'var(--kpi-gold)' }}> · {c.pending_count} pending</span>}
                      </button>
                    </div>
                    {c.admin_note && (
                      <div style={{ fontSize: '0.75rem', color: 'var(--clr-muted)', marginTop: '0.3rem', fontStyle: 'italic' }}>Note: {c.admin_note}</div>
                    )}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', alignItems: 'flex-end' }}>
                    <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      <button onClick={() => { setReviewTarget(c); setReviewAction(c.status === 'APPROVED' ? 'SUSPENDED' : 'APPROVED'); setReviewNote(''); setFormErr('') }}
                        className="btn-primary" style={{ padding: '0.35rem 0.8rem', fontSize: '0.76rem' }}>
                        {c.status === 'PENDING' ? 'Review' : 'Change status'}
                      </button>
                      <button onClick={() => { setEditTarget({ ...c }); setFormErr('') }}
                        style={{ padding: '0.3rem 0.6rem', borderRadius: 7, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)', color: 'var(--clr-muted)', fontFamily: 'inherit', fontSize: '0.74rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        <LuPencil size={11} /> Edit
                      </button>
                    </div>
                    <div style={{ display: 'flex', gap: '0.35rem' }}>
                      <button onClick={async () => {
                        try {
                          const { data } = await adminCompanyApi.resendCredentials(c.id)
                          setCredential({
                            name: c.company_name, phone_number: data.phone_number ?? c.owner_phone,
                            password: data.password ?? null, sms_sent: data.sms_sent,
                            message: data.message ?? 'New login details issued.',
                          })
                        } catch (e: any) { onToast(e.response?.data?.message ?? 'Could not send credentials.') }
                      }}
                        style={{ padding: '0.3rem 0.6rem', borderRadius: 7, border: '1px solid rgba(96,165,250,0.3)', background: 'rgba(96,165,250,0.08)', color: '#60a5fa', fontFamily: 'inherit', fontSize: '0.74rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        <LuSend size={11} /> Resend login
                      </button>
                      {canDelete && (
                        <button onClick={() => openDelete(c)} title="Delete company and all its vehicles"
                          style={{ padding: '0.3rem 0.55rem', borderRadius: 7, border: '1px solid rgba(239,68,68,0.45)', background: 'rgba(239,68,68,0.12)', color: '#f87171', fontFamily: 'inherit', fontSize: '0.74rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                          <LuTrash2 size={11} /> Delete
                        </button>
                      )}
                    </div>
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
      </>
      )}

      {/* ── Create ─────────────────────────────────────────────────────────── */}
      {showCreate && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }} onClick={() => !saving && setShowCreate(false)}>
          <div className="glass" style={{ borderRadius: 18, padding: '1.5rem', maxWidth: 520, width: '100%', maxHeight: '90vh', overflowY: 'auto', position: 'relative', boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }} onClick={e => e.stopPropagation()}>
            <button onClick={() => setShowCreate(false)} style={{ position: 'absolute', top: '0.85rem', right: '0.85rem', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--clr-muted)' }}><LuX size={18} /></button>
            <h3 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--clr-text)', marginBottom: '0.35rem' }}>Register Company</h3>
            <p style={{ fontSize: '0.76rem', color: 'var(--clr-muted)', marginBottom: '1rem', lineHeight: 1.5 }}>
              Creates the company and its login together. A password is generated and texted to
              the number below, and they must change it when they first sign in.
            </p>
            {formErr && <div className="alert alert-error" style={{ marginBottom: '0.75rem', fontSize: '0.8rem' }}><LuTriangleAlert size={13} /> {formErr}</div>}

            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div><label style={labelStyle}>Company name *</label><input value={cName} onChange={e => setCName(e.target.value)} style={inputStyle} /></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
                <div><label style={labelStyle}>Trade / legal name</label><input value={cLegal} onChange={e => setCLegal(e.target.value)} style={inputStyle} /></div>
                <div><label style={labelStyle}>TIN</label><input value={cTin} onChange={e => setCTin(e.target.value)} style={inputStyle} /></div>
                <div><label style={labelStyle}>Business licence no.</label><input value={cLicense} onChange={e => setCLicense(e.target.value)} style={inputStyle} /></div>
                <div><label style={labelStyle}>City</label><input value={cCity} onChange={e => setCCity(e.target.value)} style={inputStyle} /></div>
              </div>
              <div><label style={labelStyle}>Address</label><input value={cAddress} onChange={e => setCAddress(e.target.value)} style={inputStyle} /></div>

              <div style={{ paddingTop: '0.4rem', borderTop: '1px solid rgba(255,255,255,0.09)' }}>
                <p style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--clr-text)', margin: '0 0 0.6rem' }}>Company login</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
                  <div><label style={labelStyle}>First name *</label><input value={cFirst} onChange={e => setCFirst(e.target.value)} style={inputStyle} /></div>
                  <div><label style={labelStyle}>Last name</label><input value={cLast} onChange={e => setCLast(e.target.value)} style={inputStyle} /></div>
                </div>
                <div style={{ marginTop: '0.6rem' }}><label style={labelStyle}>Phone number *</label><input value={cPhone} onChange={e => setCPhone(e.target.value)} placeholder="09… or +2519…" style={inputStyle} /></div>
                <div style={{ marginTop: '0.6rem' }}><label style={labelStyle}>Email (optional)</label><input type="email" value={cEmail} onChange={e => setCEmail(e.target.value)} style={inputStyle} /></div>
              </div>

              <button type="submit" disabled={saving} className="btn-primary" style={{ padding: '0.65rem', fontWeight: 800 }}>
                {saving ? 'Creating…' : 'Create Company & Send Login'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ── Edit ───────────────────────────────────────────────────────────── */}
      {editTarget && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }} onClick={() => !saving && setEditTarget(null)}>
          <div className="glass" style={{ borderRadius: 18, padding: '1.5rem', maxWidth: 480, width: '100%', maxHeight: '90vh', overflowY: 'auto', position: 'relative' }} onClick={e => e.stopPropagation()}>
            <button onClick={() => setEditTarget(null)} style={{ position: 'absolute', top: '0.85rem', right: '0.85rem', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--clr-muted)' }}><LuX size={18} /></button>
            <h3 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--clr-text)', marginBottom: '1rem' }}>Edit {editTarget.company_name}</h3>
            {formErr && <div className="alert alert-error" style={{ marginBottom: '0.75rem', fontSize: '0.8rem' }}><LuTriangleAlert size={13} /> {formErr}</div>}
            <form onSubmit={handleEdit} style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
              <div><label style={labelStyle}>Company name *</label><input value={editTarget.company_name} onChange={e => setEditTarget({ ...editTarget, company_name: e.target.value })} style={inputStyle} /></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
                <div><label style={labelStyle}>Trade / legal name</label><input value={editTarget.legal_name ?? ''} onChange={e => setEditTarget({ ...editTarget, legal_name: e.target.value })} style={inputStyle} /></div>
                <div><label style={labelStyle}>TIN</label><input value={editTarget.tin_number ?? ''} onChange={e => setEditTarget({ ...editTarget, tin_number: e.target.value })} style={inputStyle} /></div>
                <div><label style={labelStyle}>Business licence no.</label><input value={editTarget.license_number ?? ''} onChange={e => setEditTarget({ ...editTarget, license_number: e.target.value })} style={inputStyle} /></div>
                <div><label style={labelStyle}>City</label><input value={editTarget.city ?? ''} onChange={e => setEditTarget({ ...editTarget, city: e.target.value })} style={inputStyle} /></div>
              </div>
              <div><label style={labelStyle}>Address</label><input value={editTarget.address_line ?? ''} onChange={e => setEditTarget({ ...editTarget, address_line: e.target.value })} style={inputStyle} /></div>
              <button type="submit" disabled={saving} className="btn-primary" style={{ padding: '0.65rem', fontWeight: 800 }}>{saving ? 'Saving…' : 'Save Changes'}</button>
            </form>
          </div>
        </div>
      )}

      {/* ── Review ─────────────────────────────────────────────────────────── */}
      {reviewTarget && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)', display: 'grid', placeItems: 'center', padding: '1rem' }}>
          <div className="glass" style={{ width: 'min(430px,100%)', padding: '1.5rem' }}>
            <p style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--clr-text)', margin: '0 0 0.85rem' }}>Review — {reviewTarget.company_name}</p>
            <div style={{ display: 'flex', gap: '0.45rem', marginBottom: '0.85rem' }}>
              {([
                { a: 'APPROVED' as const, c: '#34d399', icon: <LuCheck size={12} />, label: 'Approve' },
                { a: 'REJECTED' as const, c: '#f87171', icon: <LuX size={12} />, label: 'Reject' },
                { a: 'SUSPENDED' as const, c: '#94a3b8', icon: <LuBan size={12} />, label: 'Suspend' },
              ]).map(o => (
                <button key={o.a} onClick={() => setReviewAction(o.a)}
                  style={{ flex: 1, padding: '0.5rem', borderRadius: 9, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.25rem',
                    border: `1.5px solid ${reviewAction === o.a ? o.c : 'rgba(255,255,255,0.1)'}`,
                    background: reviewAction === o.a ? `${o.c}1a` : 'rgba(255,255,255,0.04)',
                    color: reviewAction === o.a ? o.c : 'var(--clr-muted)' }}>
                  {o.icon} {o.label}
                </button>
              ))}
            </div>
            <input value={reviewNote} onChange={e => setReviewNote(e.target.value)} placeholder="Note (optional)" style={{ ...inputStyle, marginBottom: '0.85rem' }} />
            {formErr && <div className="alert alert-error" style={{ marginBottom: '0.75rem', fontSize: '0.8rem' }}>{formErr}</div>}
            <div style={{ display: 'flex', gap: '0.7rem' }}>
              <button onClick={() => setReviewTarget(null)} style={{ flex: 1, padding: '0.6rem', borderRadius: 9, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: 'var(--clr-muted)', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>Cancel</button>
              <button onClick={handleReview} disabled={saving} className="btn-primary" style={{ flex: 2, padding: '0.6rem' }}>{saving ? 'Saving…' : 'Confirm'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete ─────────────────────────────────────────────────────────── */}
      {deleteTarget && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }} onClick={() => !saving && setDeleteTarget(null)}>
          <div className="glass" style={{ borderRadius: 18, padding: '1.5rem', maxWidth: 460, width: '100%', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.85rem' }}>
              <LuTriangleAlert size={18} color="#f87171" />
              <h3 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--clr-text)' }}>Delete this company?</h3>
            </div>
            <p style={{ fontSize: '0.82rem', color: 'var(--clr-muted)', lineHeight: 1.55, marginBottom: '0.9rem' }}>
              <strong style={{ color: 'var(--clr-text)' }}>{deleteTarget.company_name}</strong>, every vehicle it owns, and its
              login will be removed from the database. This cannot be undone.
            </p>

            {impactLoading ? (
              <p style={{ fontSize: '0.8rem', color: 'var(--clr-muted)', padding: '0.5rem 0' }}>Checking what this would delete…</p>
            ) : impact && (
              <div className="glass-inner" style={{ padding: '0.75rem 0.9rem', display: 'flex', flexDirection: 'column', gap: '0.3rem', marginBottom: '0.9rem' }}>
                {[
                  { label: 'Vehicles deleted', value: impact.vehicles, warn: impact.vehicles > 0 },
                  { label: 'Drivers released from vehicles', value: impact.assigned_drivers, warn: false },
                  // Stated separately because these accounts survive — saying
                  // "deleted the company" must not be read as "deleted its people".
                  { label: 'Drivers detached (accounts kept)', value: impact.company_drivers ?? 0, warn: false },
                  { label: 'Deliveries in progress', value: impact.active_orders, warn: impact.active_orders > 0 },
                ].map(r => (
                  <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem' }}>
                    <span style={{ color: 'var(--clr-muted)' }}>{r.label}</span>
                    <strong style={{ color: r.warn ? 'var(--kpi-gold)' : 'var(--clr-text)' }}>{r.value}</strong>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem' }}>
                  <span style={{ color: 'var(--clr-muted)' }}>Login removed</span>
                  <strong style={{ color: 'var(--clr-text)' }}>{impact.owner_name}</strong>
                </div>
              </div>
            )}

            {blocked && (
              <div className="alert alert-error" style={{ marginBottom: '0.75rem', fontSize: '0.8rem' }}>
                <LuTriangleAlert size={13} /> This company has deliveries in progress. Finish or cancel them first.
              </div>
            )}
            {formErr && <div className="alert alert-error" style={{ marginBottom: '0.75rem', fontSize: '0.8rem' }}>{formErr}</div>}

            <label style={{ fontSize: '0.73rem', fontWeight: 600, color: 'var(--clr-muted)', marginBottom: '0.3rem', display: 'block' }}>
              Type <strong style={{ color: 'var(--clr-text)' }}>{deleteTarget.company_name}</strong> to confirm
            </label>
            <input value={confirmText} onChange={e => setConfirmText(e.target.value)} disabled={blocked} autoFocus style={{ ...inputStyle, marginBottom: '1rem' }} />

            <div style={{ display: 'flex', gap: '0.6rem' }}>
              <button onClick={() => setDeleteTarget(null)} disabled={saving}
                style={{ flex: 1, padding: '0.6rem', borderRadius: 10, border: '1px solid rgba(255,255,255,0.14)', background: 'rgba(255,255,255,0.05)', color: 'var(--clr-text)', fontFamily: 'inherit', fontSize: '0.83rem', fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleDelete} disabled={saving || !confirmed || blocked || impactLoading}
                style={{ flex: 1.3, padding: '0.6rem', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#ef4444,#b91c1c)', color: '#fff', fontFamily: 'inherit', fontSize: '0.83rem', fontWeight: 800, cursor: (saving || !confirmed || blocked) ? 'not-allowed' : 'pointer', opacity: (saving || !confirmed || blocked || impactLoading) ? 0.55 : 1 }}>
                {saving ? 'Deleting…' : 'Delete permanently'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
