import { useState, useEffect, useCallback } from 'react'
import {
  LuTruck, LuPlus, LuX, LuTriangleAlert, LuRefreshCw, LuSearch,
  LuTrash2, LuUserCheck, LuFileText,
} from 'react-icons/lu'
import { adminCompanyVehicleApi, adminCompanyApi, adminCarOwnerApi } from '../lib/apiClient'
import { absoluteUploadUrl } from '../lib/uploadUrl'
import ApprovalBadge from './fleet/ApprovalBadge'
import OperationalStatusControl from './fleet/OperationalStatusControl'
import DocumentUploadField from './fleet/DocumentUploadField'
import GalleryUploadField from './fleet/GalleryUploadField'
import type { OperationalStatus } from './fleet/types'
import SearchableSelect from './SearchableSelect'

interface CompanyVehicle {
  id: string
  company_id: string
  company_name: string
  company_status: string
  plate_number: string
  vehicle_type: string
  model: string | null
  color: string | null
  year: number | null
  max_capacity_kg: number | null
  description: string | null
  vehicle_photo_url: string | null
  vehicle_images: string | string[] | null
  libre_url: string | null
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  operational_status: OperationalStatus
  admin_note: string | null
  assigned_driver_id: string | null
  assigned_driver_name: string | null
  assigned_driver_phone: string | null
  created_at: string
}

interface CompanyOption { id: string; company_name: string }
interface DriverOption { id: string; first_name: string; last_name: string | null; phone_number: string }

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '0.6rem 0.8rem', borderRadius: 10,
  border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)',
  color: 'var(--clr-text)', fontFamily: 'inherit', fontSize: '0.85rem', boxSizing: 'border-box',
}
const labelStyle: React.CSSProperties = {
  fontSize: '0.75rem', fontWeight: 600, color: 'var(--clr-muted)', marginBottom: '0.3rem', display: 'block',
}
const thumbStyle: React.CSSProperties = {
  width: 88, height: 66, objectFit: 'cover', borderRadius: 8,
  border: '1px solid rgba(255,255,255,0.12)', cursor: 'pointer', background: 'rgba(0,0,0,0.2)',
}

const LIMIT = 15

/**
 * Company-owned trucks. Kept separate from AdminCarOwnersSection, which serves
 * individual car owners — the two fleets have different scale and different
 * owners, and mixing them made neither list usable.
 *
 * In this phase the admin registers trucks on a company's behalf; the company's
 * own fleet screen comes later.
 */
export default function AdminCompanyVehiclesSection({
  onToast, initialCompanyId, initialCompanyName, lockedCompanyId, lockedCompanyName,
}: {
  onToast: (message: string) => void
  /** Pre-selects a company but still lets the admin switch to another. */
  initialCompanyId?: string
  initialCompanyName?: string
  /**
   * Fixes the company for good. Used when embedded in a company's own detail
   * screen, where every vehicle added belongs to the company being viewed, so
   * offering a company picker would only invite the wrong answer.
   */
  lockedCompanyId?: string
  lockedCompanyName?: string
}) {
  const locked = Boolean(lockedCompanyId)

  const [vehicles, setVehicles] = useState<CompanyVehicle[]>([])
  const [companies, setCompanies] = useState<CompanyOption[]>([])
  const [drivers, setDrivers] = useState<DriverOption[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  const [search, setSearch] = useState('')
  const [companyFilter, setCompanyFilter] = useState(lockedCompanyId ?? initialCompanyId ?? '')
  const [statusFilter, setStatusFilter] = useState('')
  const [opFilter, setOpFilter] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)

  const [showCreate, setShowCreate] = useState(false)
  const [reviewTarget, setReviewTarget] = useState<CompanyVehicle | null>(null)
  const [assignTarget, setAssignTarget] = useState<CompanyVehicle | null>(null)
  const [saving, setSaving] = useState(false)
  const [formErr, setFormErr] = useState('')
  const [statusSavingId, setStatusSavingId] = useState<string | null>(null)

  // create
  const [fCompany, setFCompany] = useState(lockedCompanyId ?? initialCompanyId ?? '')
  const [fPlate, setFPlate] = useState(''); const [fType, setFType] = useState('')
  const [fModel, setFModel] = useState(''); const [fColor, setFColor] = useState('')
  const [fYear, setFYear] = useState(''); const [fCapacity, setFCapacity] = useState('')
  const [fDesc, setFDesc] = useState('')
  const [fPhoto, setFPhoto] = useState(''); const [fGallery, setFGallery] = useState<string[]>([])
  const [fLibre, setFLibre] = useState('')

  const [reviewAction, setReviewAction] = useState<'APPROVED' | 'REJECTED'>('APPROVED')
  const [reviewNote, setReviewNote] = useState('')
  const [assignDriverId, setAssignDriverId] = useState('')

  const totalPages = Math.max(1, Math.ceil(total / LIMIT))

  const load = useCallback(async () => {
    setLoading(true); setErr('')
    try {
      const { data } = await adminCompanyVehicleApi.list({
        page, limit: LIMIT,
        search: search.trim() || undefined,
        company_id: (lockedCompanyId ?? companyFilter) || undefined,
        status: statusFilter || undefined,
        operational_status: opFilter || undefined,
      })
      setVehicles(data.vehicles ?? [])
      setTotal(data.pagination?.total ?? 0)
    } catch (e: any) {
      setErr(e.response?.data?.message ?? 'Could not load company vehicles.')
    } finally { setLoading(false) }
  }, [page, search, companyFilter, statusFilter, opFilter, lockedCompanyId])

  useEffect(() => {
    const t = setTimeout(load, 300)
    return () => clearTimeout(t)
  }, [load])

  // Reference data for the filter dropdown and the assign modal.
  useEffect(() => {
    adminCompanyApi.list({ limit: 100 })
      .then(({ data }) => setCompanies((data.companies ?? []).map((c: any) => ({ id: c.id, company_name: c.company_name }))))
      .catch(() => {})
    adminCarOwnerApi.listDriversForAssign()
      .then(({ data }) => setDrivers(data.drivers ?? []))
      .catch(() => {})
  }, [])

  const resetCreate = () => {
    setFPlate(''); setFType(''); setFModel(''); setFColor(''); setFYear(''); setFCapacity('')
    setFDesc(''); setFPhoto(''); setFGallery([]); setFLibre(''); setFormErr('')
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    const companyId = lockedCompanyId ?? fCompany
    if (!companyId) { setFormErr('Choose which company owns this vehicle.'); return }
    if (!fPlate.trim() || !fType.trim()) { setFormErr('Plate number and vehicle type are required.'); return }
    setSaving(true); setFormErr('')
    try {
      const { data } = await adminCompanyVehicleApi.create({
        company_id: companyId,
        plate_number: fPlate.trim(), vehicle_type: fType.trim(),
        model: fModel.trim() || undefined, color: fColor.trim() || undefined,
        year: fYear ? Number(fYear) : undefined,
        max_capacity_kg: fCapacity ? Number(fCapacity) : undefined,
        description: fDesc.trim() || undefined,
        vehicle_photo: fPhoto || undefined,
        vehicle_images: fGallery.length ? fGallery : undefined,
        libre_file: fLibre || undefined,
      })
      onToast(data.message ?? 'Vehicle registered.')
      resetCreate(); setShowCreate(false); load()
    } catch (e: any) {
      setFormErr(e.response?.data?.message ?? 'Could not register this vehicle.')
    } finally { setSaving(false) }
  }

  const handleReview = async () => {
    if (!reviewTarget) return
    setSaving(true); setFormErr('')
    try {
      const { data } = await adminCompanyVehicleApi.review(reviewTarget.id, {
        action: reviewAction, admin_note: reviewNote.trim() || undefined,
      })
      onToast(data.message ?? 'Vehicle reviewed.')
      setReviewTarget(null); setReviewNote(''); load()
    } catch (e: any) {
      setFormErr(e.response?.data?.message ?? 'Could not save the review.')
    } finally { setSaving(false) }
  }

  const handleAssign = async () => {
    if (!assignTarget) return
    setSaving(true); setFormErr('')
    try {
      const { data } = await adminCompanyVehicleApi.assignDriver(assignTarget.id, assignDriverId || null)
      onToast(data.message ?? 'Driver assignment updated.')
      setAssignTarget(null); load()
    } catch (e: any) {
      // A driver already on another vehicle is refused rather than stolen.
      setFormErr(e.response?.data?.message ?? 'Could not update the driver.')
    } finally { setSaving(false) }
  }

  const handleOperationalStatus = async (v: CompanyVehicle, next: OperationalStatus) => {
    setStatusSavingId(v.id)
    try {
      await adminCompanyVehicleApi.setOperationalStatus(v.id, next)
      setVehicles(prev => prev.map(x => x.id === v.id ? { ...x, operational_status: next } : x))
      onToast(`${v.plate_number} marked ${next.replace(/_/g, ' ').toLowerCase()}.`)
    } catch (e: any) {
      onToast(e.response?.data?.message ?? 'Could not update the vehicle status.')
      load()
    } finally { setStatusSavingId(null) }
  }

  const handleDelete = async (v: CompanyVehicle) => {
    if (!window.confirm(`Delete ${v.plate_number}? This cannot be undone.`)) return
    try {
      const { data } = await adminCompanyVehicleApi.remove(v.id)
      onToast(data.message ?? 'Vehicle deleted.'); load()
    } catch (e: any) {
      onToast(e.response?.data?.message ?? 'Could not delete this vehicle.')
    }
  }

  // Only meaningful when the admin chose a company themselves. With a locked
  // company the detail screen's own header already names it, so repeating it
  // with a "view all companies" escape would be wrong.
  const activeCompanyName = !locked && companyFilter
    ? (companies.find(c => c.id === companyFilter)?.company_name ?? initialCompanyName ?? '')
    : ''

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        {locked ? <div style={{ flex: 1 }} /> : (
          <h2 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--clr-text)', flex: 1, display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
            <LuTruck size={17} /> Company Vehicles
          </h2>
        )}
        <button onClick={load} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.3rem 0.7rem', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: 'var(--clr-muted)', fontFamily: 'inherit', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer' }}>
          <LuRefreshCw size={12} /> Refresh
        </button>
        <button onClick={() => { resetCreate(); setFCompany(lockedCompanyId ?? companyFilter ?? ''); setShowCreate(true) }}
          style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.4rem 0.85rem', borderRadius: 9, border: 'none', background: 'var(--clr-accent)', color: '#080b14', fontFamily: 'inherit', fontSize: '0.78rem', fontWeight: 800, cursor: 'pointer' }}>
          <LuPlus size={13} /> Add Vehicle
        </button>
      </div>

      {/* Filters */}
      <div className="glass" style={{ padding: '0.75rem 1rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ flex: 1, minWidth: 160, display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: '0.4rem 0.7rem' }}>
          <LuSearch size={13} style={{ color: 'var(--clr-muted)', flexShrink: 0 }} />
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} placeholder="Search plate, model or company"
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
        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1) }}
          style={{ padding: '0.4rem 0.6rem', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: 'var(--clr-text)', fontFamily: 'inherit', fontSize: '0.78rem', outline: 'none' }}>
          {['', 'PENDING', 'APPROVED', 'REJECTED'].map(s => <option key={s} value={s} style={{ background: '#0f172a' }}>{s || 'All approvals'}</option>)}
        </select>
        <select value={opFilter} onChange={e => { setOpFilter(e.target.value); setPage(1) }}
          style={{ padding: '0.4rem 0.6rem', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: 'var(--clr-text)', fontFamily: 'inherit', fontSize: '0.78rem', outline: 'none' }}>
          {['', 'ACTIVE', 'INACTIVE', 'MAINTENANCE', 'OUT_OF_SERVICE'].map(s => (
            <option key={s} value={s} style={{ background: '#0f172a' }}>{s ? s.replace(/_/g, ' ') : 'All states'}</option>
          ))}
        </select>
      </div>

      {activeCompanyName && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: 'var(--clr-muted)' }}>
          Viewing <strong style={{ color: 'var(--clr-text)' }}>{activeCompanyName}</strong>
          <button onClick={() => { setCompanyFilter(''); setPage(1) }}
            style={{ background: 'none', border: 'none', color: 'var(--clr-accent)', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.78rem', fontWeight: 700 }}>
            view all companies
          </button>
        </div>
      )}

      {err && <div className="alert alert-error"><LuTriangleAlert size={13} /> {err}</div>}

      {/* List */}
      {loading ? (
        <div style={{ color: 'var(--clr-muted)', fontSize: '0.85rem', padding: '1rem 0' }}>Loading…</div>
      ) : vehicles.length === 0 ? (
        <div className="glass-inner" style={{ padding: '2rem', textAlign: 'center', color: 'var(--clr-muted)', fontSize: '0.85rem' }}>
          No company vehicles match these filters.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
          {vehicles.map(v => {
            let gallery: string[] = []
            try {
              gallery = Array.isArray(v.vehicle_images) ? v.vehicle_images
                : v.vehicle_images ? JSON.parse(v.vehicle_images) : []
            } catch { gallery = [] }
            const hasMedia = Boolean(v.vehicle_photo_url) || gallery.length > 0 || Boolean(v.libre_url)

            return (
              <div key={v.id} className="glass-inner" style={{ padding: '0.9rem 1rem' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.35rem' }}>
                      <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--clr-text)' }}>{v.plate_number}</span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--clr-muted)', background: 'rgba(255,255,255,0.06)', padding: '0.1rem 0.5rem', borderRadius: 6 }}>{v.vehicle_type}</span>
                      <ApprovalBadge status={v.status} />
                      <OperationalStatusControl vehicle={v} saving={statusSavingId === v.id}
                        onChange={next => handleOperationalStatus(v, next)} />
                    </div>

                    <div style={{ fontSize: '0.8rem', color: 'var(--clr-muted)', marginBottom: '0.3rem' }}>
                      Company: <strong style={{ color: 'var(--clr-text)' }}>{v.company_name}</strong>
                      {v.company_status !== 'APPROVED' && (
                        <span style={{ color: 'var(--kpi-gold)' }}> · company {v.company_status.toLowerCase()}</span>
                      )}
                    </div>

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem 1rem', fontSize: '0.78rem', color: 'var(--clr-muted)' }}>
                      {v.model && <span>Model: <strong style={{ color: 'var(--clr-text)' }}>{v.model}</strong></span>}
                      {v.color && <span>Colour: <strong style={{ color: 'var(--clr-text)' }}>{v.color}</strong></span>}
                      {v.year && <span>Year: <strong style={{ color: 'var(--clr-text)' }}>{v.year}</strong></span>}
                      {v.max_capacity_kg != null && <span>Capacity: <strong style={{ color: 'var(--clr-text)' }}>{Number(v.max_capacity_kg).toLocaleString()} kg</strong></span>}
                    </div>

                    {v.description && <p style={{ fontSize: '0.78rem', color: 'var(--clr-muted)', marginTop: '0.3rem', lineHeight: 1.45 }}>{v.description}</p>}

                    <div style={{ fontSize: '0.78rem', marginTop: '0.3rem', color: v.assigned_driver_name ? '#34d399' : 'var(--clr-muted)' }}>
                      {v.assigned_driver_name
                        ? <>Driver: <strong>{v.assigned_driver_name}</strong> · {v.assigned_driver_phone}</>
                        : 'No driver assigned'}
                    </div>

                    {v.admin_note && <div style={{ fontSize: '0.75rem', color: 'var(--clr-muted)', marginTop: '0.25rem', fontStyle: 'italic' }}>Note: {v.admin_note}</div>}

                    {/* Evidence for the approval decision. Documents are optional,
                        so their absence is stated rather than silently blank. */}
                    <div style={{ marginTop: '0.55rem' }}>
                      {hasMedia ? (
                        <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                          {v.vehicle_photo_url && (
                            <a href={absoluteUploadUrl(v.vehicle_photo_url) || '#'} target="_blank" rel="noreferrer" title="Main photo">
                              <img src={absoluteUploadUrl(v.vehicle_photo_url)} alt="Vehicle" loading="lazy" style={thumbStyle} />
                            </a>
                          )}
                          {gallery.map((img, i) => (
                            <a key={i} href={absoluteUploadUrl(img) || '#'} target="_blank" rel="noreferrer" title={`Photo ${i + 1}`}>
                              <img src={absoluteUploadUrl(img)} alt={`Vehicle ${i + 1}`} loading="lazy" style={thumbStyle} />
                            </a>
                          ))}
                          {v.libre_url && (
                            <a href={absoluteUploadUrl(v.libre_url) || '#'} target="_blank" rel="noreferrer"
                              style={{ ...thumbStyle, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.2rem', textDecoration: 'none', color: 'var(--clr-accent)' }}>
                              <LuFileText size={20} />
                              <span style={{ fontSize: '0.64rem', fontWeight: 700 }}>Libre</span>
                            </a>
                          )}
                        </div>
                      ) : (
                        <span style={{ fontSize: '0.74rem', color: 'var(--clr-muted)', fontStyle: 'italic' }}>
                          No photos or documents submitted — these are optional, so you can still approve.
                        </span>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', alignItems: 'flex-end' }}>
                    <button onClick={() => { setReviewTarget(v); setReviewAction(v.status === 'APPROVED' ? 'REJECTED' : 'APPROVED'); setReviewNote(''); setFormErr('') }}
                      className="btn-primary" style={{ padding: '0.35rem 0.8rem', fontSize: '0.76rem' }}>
                      {v.status === 'PENDING' ? 'Review' : 'Re-review'}
                    </button>
                    {v.status === 'APPROVED' && (
                      <button onClick={() => { setAssignTarget(v); setAssignDriverId(v.assigned_driver_id ?? ''); setFormErr('') }}
                        style={{ padding: '0.3rem 0.65rem', borderRadius: 7, border: '1px solid rgba(97,148,31,0.25)', background: 'rgba(97,148,31,0.08)', color: 'var(--clr-accent)', fontFamily: 'inherit', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        <LuUserCheck size={11} /> {v.assigned_driver_id ? 'Change driver' : 'Assign driver'}
                      </button>
                    )}
                    <button onClick={() => handleDelete(v)}
                      style={{ padding: '0.3rem 0.55rem', borderRadius: 7, border: '1px solid rgba(239,68,68,0.45)', background: 'rgba(239,68,68,0.12)', color: '#f87171', fontFamily: 'inherit', fontSize: '0.74rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      <LuTrash2 size={11} /> Delete
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

      {/* ── Add vehicle ────────────────────────────────────────────────────── */}
      {showCreate && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }} onClick={() => !saving && setShowCreate(false)}>
          <div className="glass" style={{ borderRadius: 18, padding: '1.5rem', maxWidth: 520, width: '100%', maxHeight: '90vh', overflowY: 'auto', position: 'relative' }} onClick={e => e.stopPropagation()}>
            <button onClick={() => setShowCreate(false)} style={{ position: 'absolute', top: '0.85rem', right: '0.85rem', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--clr-muted)' }}><LuX size={18} /></button>
            <h3 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--clr-text)', marginBottom: '0.35rem' }}>
              Add Company Vehicle{locked && lockedCompanyName ? ` — ${lockedCompanyName}` : ''}
            </h3>
            <p style={{ fontSize: '0.76rem', color: 'var(--clr-muted)', marginBottom: '1rem', lineHeight: 1.5 }}>
              Registered on the company's behalf and approved straight away — you entering it
              is the approval. Photos and documents are optional.
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
                <div><label style={labelStyle}>Plate number *</label><input value={fPlate} onChange={e => setFPlate(e.target.value)} style={inputStyle} /></div>
                <div><label style={labelStyle}>Vehicle type *</label><input value={fType} onChange={e => setFType(e.target.value)} placeholder="Truck, Trailer…" style={inputStyle} /></div>
                <div><label style={labelStyle}>Model</label><input value={fModel} onChange={e => setFModel(e.target.value)} style={inputStyle} /></div>
                <div><label style={labelStyle}>Colour</label><input value={fColor} onChange={e => setFColor(e.target.value)} style={inputStyle} /></div>
                <div><label style={labelStyle}>Year</label><input type="number" value={fYear} onChange={e => setFYear(e.target.value)} style={inputStyle} /></div>
                <div><label style={labelStyle}>Capacity (kg)</label><input type="number" value={fCapacity} onChange={e => setFCapacity(e.target.value)} style={inputStyle} /></div>
              </div>
              <div><label style={labelStyle}>Description</label><input value={fDesc} onChange={e => setFDesc(e.target.value)} style={inputStyle} /></div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', paddingTop: '0.4rem', borderTop: '1px solid rgba(255,255,255,0.09)' }}>
                <p style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--clr-text)', margin: 0 }}>
                  Photos &amp; documents<span style={{ fontWeight: 500, color: 'var(--clr-muted)' }}> — all optional</span>
                </p>
                <DocumentUploadField label="Main Photo" accept="image/jpeg,image/png,image/webp" value={fPhoto} onChange={setFPhoto} disabled={saving} />
                <GalleryUploadField label="Gallery" max={5} value={fGallery} onChange={setFGallery} disabled={saving} />
                <DocumentUploadField label="Libre Document" hint="Ownership book — image or PDF" value={fLibre} onChange={setFLibre} disabled={saving} />
              </div>

              <button type="submit" disabled={saving} className="btn-primary" style={{ padding: '0.65rem', fontWeight: 800 }}>
                {saving ? 'Saving…' : 'Register Vehicle'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ── Review ─────────────────────────────────────────────────────────── */}
      {reviewTarget && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)', display: 'grid', placeItems: 'center', padding: '1rem' }}>
          <div className="glass" style={{ width: 'min(420px,100%)', padding: '1.5rem' }}>
            <p style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--clr-text)', margin: '0 0 0.85rem' }}>Review — {reviewTarget.plate_number}</p>
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.85rem' }}>
              {(['APPROVED', 'REJECTED'] as const).map(a => (
                <button key={a} onClick={() => setReviewAction(a)}
                  style={{ flex: 1, padding: '0.55rem', borderRadius: 9, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, fontSize: '0.85rem',
                    border: `1.5px solid ${reviewAction === a ? (a === 'APPROVED' ? '#34d399' : '#f87171') : 'rgba(255,255,255,0.1)'}`,
                    background: reviewAction === a ? (a === 'APPROVED' ? 'rgba(52,211,153,0.1)' : 'rgba(248,113,113,0.1)') : 'rgba(255,255,255,0.04)',
                    color: reviewAction === a ? (a === 'APPROVED' ? '#34d399' : '#f87171') : 'var(--clr-muted)' }}>
                  {a === 'APPROVED' ? 'Approve' : 'Reject'}
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

      {/* ── Assign driver ──────────────────────────────────────────────────── */}
      {assignTarget && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)', display: 'grid', placeItems: 'center', padding: '1rem' }}>
          <div className="glass" style={{ width: 'min(420px,100%)', padding: '1.5rem' }}>
            <p style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--clr-text)', margin: '0 0 0.85rem' }}>Assign driver — {assignTarget.plate_number}</p>
            <SearchableSelect
              options={drivers.map(d => ({
                id: String(d.id),
                label: `${d.first_name} ${d.last_name || ''}`.trim(),
                sub: d.phone_number,
              }))}
              value={assignDriverId}
              onChange={setAssignDriverId}
              emptyLabel="— No driver —"
              placeholder="Search name or phone"
            />
            <p style={{ fontSize: '0.74rem', color: 'var(--clr-muted)', marginBottom: '0.85rem', lineHeight: 1.45 }}>
              A driver already assigned to another vehicle will be refused — unassign them there first.
            </p>
            {formErr && <div className="alert alert-error" style={{ marginBottom: '0.75rem', fontSize: '0.8rem' }}>{formErr}</div>}
            <div style={{ display: 'flex', gap: '0.7rem' }}>
              <button onClick={() => setAssignTarget(null)} style={{ flex: 1, padding: '0.6rem', borderRadius: 9, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: 'var(--clr-muted)', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>Cancel</button>
              <button onClick={handleAssign} disabled={saving} className="btn-primary" style={{ flex: 2, padding: '0.6rem' }}>{saving ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
