import { useState, useEffect, useCallback } from 'react'
import {
  LuTruck, LuPlus, LuX, LuTriangleAlert, LuRefreshCw, LuSearch,
  LuTrash2, LuUserCheck, LuFileText, LuPencil, LuCheck,
} from 'react-icons/lu'
import { companyApi } from '../../lib/apiClient'
import { absoluteUploadUrl } from '../../lib/uploadUrl'
import ApprovalBadge from '../../components/fleet/ApprovalBadge'
import OperationalStatusControl from '../../components/fleet/OperationalStatusControl'
import DocumentUploadField from '../../components/fleet/DocumentUploadField'
import GalleryUploadField from '../../components/fleet/GalleryUploadField'
import { effectiveVehicleState } from '../../components/fleet/vehicleState'
import type { OperationalStatus } from '../../components/fleet/types'

interface CompanyVehicle {
  id: string
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

interface EligibleDriver {
  id: string
  first_name: string
  last_name: string | null
  status: string
  rating: number | null
  total_trips: number | null
  is_currently_assigned: number
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '0.6rem 0.8rem', borderRadius: 10,
  border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)',
  color: 'var(--clr-text)', fontFamily: 'inherit', fontSize: '0.85rem', boxSizing: 'border-box',
}
const labelStyle: React.CSSProperties = {
  fontSize: '0.75rem', fontWeight: 600, color: 'var(--clr-muted)', marginBottom: '0.3rem', display: 'block',
}
const thumbStyle: React.CSSProperties = {
  width: 84, height: 62, objectFit: 'cover', borderRadius: 8,
  border: '1px solid rgba(255,255,255,0.12)', cursor: 'pointer', background: 'rgba(0,0,0,0.2)',
}

const LIMIT = 25

/** Editing one of these on an approved truck sends it back for review. */
const IDENTITY_HINT = 'Changing the plate, type or capacity sends this vehicle back for approval.'

export default function CompanyFleetPanel({ onToast, readOnly }: {
  onToast: (message: string) => void
  readOnly: boolean
}) {
  const [vehicles, setVehicles] = useState<CompanyVehicle[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  // One object so any filter change fires a single request and resets to page 1.
  const [filters, setFilters] = useState({ search: '', status: '', operational_status: '', assigned: '' })
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)

  const [showForm, setShowForm] = useState(false)
  const [editTarget, setEditTarget] = useState<CompanyVehicle | null>(null)
  const [assignTarget, setAssignTarget] = useState<CompanyVehicle | null>(null)
  const [eligible, setEligible] = useState<EligibleDriver[]>([])
  const [selectedDriverId, setSelectedDriverId] = useState('')
  const [driverSearch, setDriverSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [formErr, setFormErr] = useState('')
  const [statusSavingId, setStatusSavingId] = useState<string | null>(null)

  const [f, setF] = useState({
    plate_number: '', vehicle_type: '', model: '', color: '',
    year: '', max_capacity_kg: '', description: '',
  })
  const [fPhoto, setFPhoto] = useState('')
  const [fGallery, setFGallery] = useState<string[]>([])
  const [fLibre, setFLibre] = useState('')

  const totalPages = Math.max(1, Math.ceil(total / LIMIT))

  const load = useCallback(async () => {
    setLoading(true); setErr('')
    try {
      const { data } = await companyApi.listVehicles({
        page, limit: LIMIT,
        search: filters.search.trim() || undefined,
        status: filters.status || undefined,
        operational_status: filters.operational_status || undefined,
        assigned: (filters.assigned || undefined) as any,
      })
      setVehicles(data.vehicles ?? [])
      setTotal(data.pagination?.total ?? 0)
    } catch (e: any) {
      setErr(e.response?.data?.message ?? 'Could not load your vehicles.')
    } finally { setLoading(false) }
  }, [page, filters])

  // Debounced so typing a plate does not fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(load, 300)
    return () => clearTimeout(t)
  }, [load])

  const setFilter = (patch: Partial<typeof filters>) => {
    setFilters(prev => ({ ...prev, ...patch }))
    setPage(1)
  }

  const resetForm = () => {
    setF({ plate_number: '', vehicle_type: '', model: '', color: '', year: '', max_capacity_kg: '', description: '' })
    setFPhoto(''); setFGallery([]); setFLibre(''); setFormErr('')
  }

  const openEdit = (v: CompanyVehicle) => {
    setEditTarget(v)
    setF({
      plate_number: v.plate_number, vehicle_type: v.vehicle_type,
      model: v.model ?? '', color: v.color ?? '',
      year: v.year ? String(v.year) : '',
      max_capacity_kg: v.max_capacity_kg != null ? String(v.max_capacity_kg) : '',
      description: v.description ?? '',
    })
    setFPhoto(''); setFGallery([]); setFLibre(''); setFormErr('')
    setShowForm(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!f.plate_number.trim() || !f.vehicle_type.trim()) {
      setFormErr('Plate number and vehicle type are required.'); return
    }
    setSaving(true); setFormErr('')
    const payload: Record<string, any> = {
      plate_number: f.plate_number.trim(),
      vehicle_type: f.vehicle_type.trim(),
      model: f.model.trim() || undefined,
      color: f.color.trim() || undefined,
      year: f.year ? Number(f.year) : undefined,
      max_capacity_kg: f.max_capacity_kg ? Number(f.max_capacity_kg) : undefined,
      description: f.description.trim() || undefined,
      vehicle_photo: fPhoto || undefined,
      vehicle_images: fGallery.length ? fGallery : undefined,
      libre_file: fLibre || undefined,
    }
    try {
      const { data } = editTarget
        ? await companyApi.updateVehicle(editTarget.id, payload)
        : await companyApi.createVehicle(payload as any)
      onToast(data.message ?? 'Saved.')
      resetForm(); setShowForm(false); setEditTarget(null); load()
    } catch (e: any) {
      setFormErr(e.response?.data?.message ?? 'Could not save this vehicle.')
    } finally { setSaving(false) }
  }

  const handleOperationalStatus = async (v: CompanyVehicle, next: OperationalStatus) => {
    setStatusSavingId(v.id)
    try {
      await companyApi.setOperationalStatus(v.id, next)
      setVehicles(prev => prev.map(x => x.id === v.id ? { ...x, operational_status: next } : x))
      onToast(`${v.plate_number} marked ${next.replace(/_/g, ' ').toLowerCase()}.`)
    } catch (e: any) {
      onToast(e.response?.data?.message ?? 'Could not update the vehicle status.')
      load()
    } finally { setStatusSavingId(null) }
  }

  const handleDelete = async (v: CompanyVehicle) => {
    if (!window.confirm(`Remove ${v.plate_number}? This cannot be undone.`)) return
    try {
      const { data } = await companyApi.deleteVehicle(v.id)
      onToast(data.message ?? 'Vehicle removed.'); load()
    } catch (e: any) {
      onToast(e.response?.data?.message ?? 'Could not remove this vehicle.')
    }
  }

  const openAssign = async (v: CompanyVehicle) => {
    setAssignTarget(v); setFormErr(''); setDriverSearch(''); setEligible([])
    setSelectedDriverId(v.assigned_driver_id ?? '')
    try {
      const { data } = await companyApi.listEligibleDrivers(v.id)
      setEligible(data.drivers ?? [])
    } catch (e: any) {
      setFormErr(e.response?.data?.message ?? 'Could not load your drivers.')
    }
  }

  const saveAssignment = async (driverId: string | null) => {
    if (!assignTarget) return
    setSaving(true); setFormErr('')
    try {
      const { data } = await companyApi.assignDriver(assignTarget.id, driverId)
      onToast(data.message ?? 'Driver updated.')
      setAssignTarget(null); load()
    } catch (e: any) {
      setFormErr(e.response?.data?.message ?? 'Could not update the driver.')
    } finally { setSaving(false) }
  }

  const filteredDrivers = eligible.filter(d =>
    `${d.first_name} ${d.last_name ?? ''}`.toLowerCase().includes(driverSearch.trim().toLowerCase())
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--clr-text)', flex: 1, display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
          <LuTruck size={17} /> My Fleet
        </h2>
        <button onClick={load} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.3rem 0.7rem', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: 'var(--clr-muted)', fontFamily: 'inherit', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer' }}>
          <LuRefreshCw size={12} /> Refresh
        </button>
        {!readOnly && (
          <button onClick={() => { resetForm(); setEditTarget(null); setShowForm(true) }}
            style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.4rem 0.85rem', borderRadius: 9, border: 'none', background: 'var(--clr-accent)', color: '#080b14', fontFamily: 'inherit', fontSize: '0.78rem', fontWeight: 800, cursor: 'pointer' }}>
            <LuPlus size={13} /> Add Vehicle
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="glass" style={{ padding: '0.75rem 1rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ flex: 1, minWidth: 160, display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: '0.4rem 0.7rem' }}>
          <LuSearch size={13} style={{ color: 'var(--clr-muted)', flexShrink: 0 }} />
          <input value={filters.search} onChange={e => setFilter({ search: e.target.value })} placeholder="Search plate, model or type"
            style={{ background: 'none', border: 'none', color: 'var(--clr-text)', fontFamily: 'inherit', fontSize: '0.8rem', outline: 'none', width: '100%' }} />
          {filters.search && <button onClick={() => setFilter({ search: '' })} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--clr-muted)', padding: 0, display: 'flex' }}><LuX size={12} /></button>}
        </div>
        <select value={filters.status} onChange={e => setFilter({ status: e.target.value })}
          style={{ padding: '0.4rem 0.6rem', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: 'var(--clr-text)', fontFamily: 'inherit', fontSize: '0.78rem', outline: 'none' }}>
          {['', 'PENDING', 'APPROVED', 'REJECTED'].map(s => <option key={s} value={s} style={{ background: '#0f172a' }}>{s || 'All approvals'}</option>)}
        </select>
        <select value={filters.operational_status} onChange={e => setFilter({ operational_status: e.target.value })}
          style={{ padding: '0.4rem 0.6rem', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: 'var(--clr-text)', fontFamily: 'inherit', fontSize: '0.78rem', outline: 'none' }}>
          {['', 'ACTIVE', 'INACTIVE', 'MAINTENANCE', 'OUT_OF_SERVICE'].map(s => (
            <option key={s} value={s} style={{ background: '#0f172a' }}>{s ? s.replace(/_/g, ' ') : 'All states'}</option>
          ))}
        </select>
        <select value={filters.assigned} onChange={e => setFilter({ assigned: e.target.value })}
          style={{ padding: '0.4rem 0.6rem', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: 'var(--clr-text)', fontFamily: 'inherit', fontSize: '0.78rem', outline: 'none' }}>
          <option value="" style={{ background: '#0f172a' }}>Any driver</option>
          <option value="yes" style={{ background: '#0f172a' }}>With a driver</option>
          <option value="no" style={{ background: '#0f172a' }}>No driver</option>
        </select>
      </div>

      {err && <div className="alert alert-error"><LuTriangleAlert size={13} /> {err}</div>}

      {/* List */}
      {loading ? (
        <div style={{ color: 'var(--clr-muted)', fontSize: '0.85rem', padding: '1rem 0' }}>Loading…</div>
      ) : vehicles.length === 0 ? (
        <div className="glass-inner" style={{ padding: '2rem', textAlign: 'center', color: 'var(--clr-muted)', fontSize: '0.85rem' }}>
          {total === 0 && !filters.search && !filters.status
            ? <>No vehicles yet. Use <strong style={{ color: 'var(--clr-text)' }}>Add Vehicle</strong> to register your first truck.</>
            : 'No vehicles match these filters.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
          {vehicles.map(v => {
            let gallery: string[] = []
            try {
              gallery = Array.isArray(v.vehicle_images) ? v.vehicle_images
                : v.vehicle_images ? JSON.parse(v.vehicle_images) : []
            } catch { gallery = [] }

            // One source of truth for how the two status axes read together, so
            // an unapproved truck can never show a confident green "Active".
            const state = effectiveVehicleState(v as any)

            return (
              <div key={v.id} className="glass-inner" style={{ padding: '0.9rem 1rem' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 210 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.35rem' }}>
                      <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--clr-text)' }}>{v.plate_number}</span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--clr-muted)', background: 'rgba(255,255,255,0.06)', padding: '0.1rem 0.5rem', borderRadius: 6 }}>{v.vehicle_type}</span>
                      <ApprovalBadge status={v.status} />
                      <OperationalStatusControl vehicle={v as any} saving={statusSavingId === v.id}
                        onChange={next => handleOperationalStatus(v, next)} />
                    </div>

                    {state.reason && (
                      <div style={{ fontSize: '0.75rem', color: 'var(--kpi-gold)', marginBottom: '0.3rem' }}>{state.reason}</div>
                    )}

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem 1rem', fontSize: '0.78rem', color: 'var(--clr-muted)' }}>
                      {v.model && <span>Model: <strong style={{ color: 'var(--clr-text)' }}>{v.model}</strong></span>}
                      {v.color && <span>Colour: <strong style={{ color: 'var(--clr-text)' }}>{v.color}</strong></span>}
                      {v.year && <span>Year: <strong style={{ color: 'var(--clr-text)' }}>{v.year}</strong></span>}
                      {v.max_capacity_kg != null && <span>Capacity: <strong style={{ color: 'var(--clr-text)' }}>{Number(v.max_capacity_kg).toLocaleString()} kg</strong></span>}
                    </div>

                    {v.description && <p style={{ fontSize: '0.78rem', color: 'var(--clr-muted)', marginTop: '0.3rem', lineHeight: 1.45 }}>{v.description}</p>}

                    <div style={{ fontSize: '0.78rem', marginTop: '0.3rem', color: v.assigned_driver_name ? '#34d399' : 'var(--clr-muted)' }}>
                      {v.assigned_driver_name
                        ? <>Driver: <strong>{v.assigned_driver_name}</strong></>
                        : 'No driver assigned'}
                    </div>

                    {v.admin_note && (
                      <div style={{ fontSize: '0.75rem', color: 'var(--clr-muted)', marginTop: '0.25rem', fontStyle: 'italic' }}>
                        Note from Afri Logistics: {v.admin_note}
                      </div>
                    )}

                    {(v.vehicle_photo_url || gallery.length > 0 || v.libre_url) && (
                      <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', marginTop: '0.55rem' }}>
                        {v.vehicle_photo_url && (
                          <a href={absoluteUploadUrl(v.vehicle_photo_url) || '#'} target="_blank" rel="noreferrer">
                            <img src={absoluteUploadUrl(v.vehicle_photo_url)} alt="Vehicle" loading="lazy" style={thumbStyle} />
                          </a>
                        )}
                        {gallery.map((img, i) => (
                          <a key={i} href={absoluteUploadUrl(img) || '#'} target="_blank" rel="noreferrer">
                            <img src={absoluteUploadUrl(img)} alt={`Vehicle ${i + 1}`} loading="lazy" style={thumbStyle} />
                          </a>
                        ))}
                        {v.libre_url && (
                          <a href={absoluteUploadUrl(v.libre_url) || '#'} target="_blank" rel="noreferrer"
                            style={{ ...thumbStyle, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.2rem', textDecoration: 'none', color: 'var(--clr-accent)' }}>
                            <LuFileText size={18} />
                            <span style={{ fontSize: '0.62rem', fontWeight: 700 }}>Libre</span>
                          </a>
                        )}
                      </div>
                    )}
                  </div>

                  {!readOnly && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', alignItems: 'flex-end' }}>
                      <button onClick={() => openEdit(v)}
                        style={{ padding: '0.3rem 0.65rem', borderRadius: 7, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)', color: 'var(--clr-muted)', fontFamily: 'inherit', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        <LuPencil size={11} /> Edit
                      </button>
                      {state.canDispatch && (
                        <button onClick={() => openAssign(v)}
                          style={{ padding: '0.3rem 0.65rem', borderRadius: 7, border: '1px solid rgba(97,148,31,0.25)', background: 'rgba(97,148,31,0.08)', color: 'var(--clr-accent)', fontFamily: 'inherit', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                          <LuUserCheck size={11} /> {v.assigned_driver_id ? 'Change driver' : 'Assign driver'}
                        </button>
                      )}
                      {v.status === 'PENDING' && (
                        <button onClick={() => handleDelete(v)}
                          style={{ padding: '0.3rem 0.55rem', borderRadius: 7, border: '1px solid rgba(239,68,68,0.45)', background: 'rgba(239,68,68,0.12)', color: '#f87171', fontFamily: 'inherit', fontSize: '0.74rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                          <LuTrash2 size={11} /> Remove
                        </button>
                      )}
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
          <span style={{ fontSize: '0.78rem', color: 'var(--clr-muted)' }}>Page {page} of {totalPages} · {total} vehicles</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
            style={{ padding: '0.3rem 0.6rem', borderRadius: 7, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: 'var(--clr-muted)', cursor: 'pointer', opacity: page === totalPages ? 0.4 : 1 }}>›</button>
        </div>
      )}

      {/* ── Add / edit ─────────────────────────────────────────────────────── */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }} onClick={() => !saving && setShowForm(false)}>
          <div className="glass" style={{ borderRadius: 18, padding: '1.5rem', maxWidth: 520, width: '100%', maxHeight: '90vh', overflowY: 'auto', position: 'relative' }} onClick={e => e.stopPropagation()}>
            <button onClick={() => setShowForm(false)} style={{ position: 'absolute', top: '0.85rem', right: '0.85rem', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--clr-muted)' }}><LuX size={18} /></button>
            <h3 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--clr-text)', marginBottom: '0.35rem' }}>
              {editTarget ? `Edit ${editTarget.plate_number}` : 'Add Vehicle'}
            </h3>
            <p style={{ fontSize: '0.76rem', color: 'var(--clr-muted)', marginBottom: '1rem', lineHeight: 1.5 }}>
              {editTarget
                ? (editTarget.status === 'APPROVED' ? IDENTITY_HINT : 'Photos and documents are optional.')
                : 'Afri Logistics approves each vehicle before it can carry loads. Photos and documents are optional.'}
            </p>
            {formErr && <div className="alert alert-error" style={{ marginBottom: '0.75rem', fontSize: '0.8rem' }}><LuTriangleAlert size={13} /> {formErr}</div>}

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
                <div><label style={labelStyle}>Plate number *</label><input value={f.plate_number} onChange={e => setF({ ...f, plate_number: e.target.value })} style={inputStyle} /></div>
                <div><label style={labelStyle}>Vehicle type *</label><input value={f.vehicle_type} onChange={e => setF({ ...f, vehicle_type: e.target.value })} placeholder="Truck, Trailer…" style={inputStyle} /></div>
                <div><label style={labelStyle}>Model</label><input value={f.model} onChange={e => setF({ ...f, model: e.target.value })} style={inputStyle} /></div>
                <div><label style={labelStyle}>Colour</label><input value={f.color} onChange={e => setF({ ...f, color: e.target.value })} style={inputStyle} /></div>
                <div><label style={labelStyle}>Year</label><input type="number" value={f.year} onChange={e => setF({ ...f, year: e.target.value })} style={inputStyle} /></div>
                <div><label style={labelStyle}>Capacity (kg)</label><input type="number" value={f.max_capacity_kg} onChange={e => setF({ ...f, max_capacity_kg: e.target.value })} style={inputStyle} /></div>
              </div>
              <div><label style={labelStyle}>Description</label><input value={f.description} onChange={e => setF({ ...f, description: e.target.value })} style={inputStyle} /></div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', paddingTop: '0.4rem', borderTop: '1px solid rgba(255,255,255,0.09)' }}>
                <p style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--clr-text)', margin: 0 }}>
                  Photos &amp; documents<span style={{ fontWeight: 500, color: 'var(--clr-muted)' }}> — all optional</span>
                </p>
                <DocumentUploadField label="Main Photo" accept="image/jpeg,image/png,image/webp" value={fPhoto} onChange={setFPhoto} disabled={saving} />
                <GalleryUploadField label="Gallery" max={5} value={fGallery} onChange={setFGallery} disabled={saving} />
                <DocumentUploadField label="Libre Document" hint="Ownership book — image or PDF" value={fLibre} onChange={setFLibre} disabled={saving} />
              </div>

              <button type="submit" disabled={saving} className="btn-primary" style={{ padding: '0.65rem', fontWeight: 800 }}>
                {saving ? 'Saving…' : editTarget ? 'Save Changes' : 'Add Vehicle'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ── Assign driver ──────────────────────────────────────────────────── */}
      {assignTarget && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }} onClick={() => !saving && setAssignTarget(null)}>
          <div className="glass" style={{ borderRadius: 18, padding: '1.5rem', maxWidth: 460, width: '100%', maxHeight: '90vh', overflowY: 'auto', position: 'relative' }} onClick={e => e.stopPropagation()}>
            <button onClick={() => setAssignTarget(null)} style={{ position: 'absolute', top: '0.85rem', right: '0.85rem', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--clr-muted)' }}><LuX size={18} /></button>
            <h3 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--clr-text)', marginBottom: '0.35rem' }}>
              Driver for {assignTarget.plate_number}
            </h3>
            <p style={{ fontSize: '0.76rem', color: 'var(--clr-muted)', marginBottom: '0.85rem', lineHeight: 1.5 }}>
              Only your own verified drivers who are not already on another vehicle appear here.
            </p>
            {formErr && <div className="alert alert-error" style={{ marginBottom: '0.75rem', fontSize: '0.8rem' }}>{formErr}</div>}

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: '0.4rem 0.7rem', marginBottom: '0.7rem' }}>
              <LuSearch size={13} style={{ color: 'var(--clr-muted)' }} />
              <input value={driverSearch} onChange={e => setDriverSearch(e.target.value)} placeholder="Search your drivers"
                style={{ background: 'none', border: 'none', color: 'var(--clr-text)', fontFamily: 'inherit', fontSize: '0.8rem', outline: 'none', width: '100%' }} />
            </div>

            {filteredDrivers.length === 0 ? (
              <p style={{ fontSize: '0.8rem', color: 'var(--clr-muted)', padding: '0.75rem 0', lineHeight: 1.5 }}>
                No drivers available. Add drivers under <strong style={{ color: 'var(--clr-text)' }}>Drivers</strong> —
                they become assignable once Afri Logistics verifies them.
              </p>
            ) : (
              <div role="radiogroup" style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '0.9rem' }}>
                {filteredDrivers.map(d => (
                  <button key={d.id} type="button" role="radio" aria-checked={selectedDriverId === d.id}
                    onClick={() => setSelectedDriverId(d.id)}
                    style={{ textAlign: 'left', padding: '0.6rem 0.75rem', borderRadius: 9, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '0.5rem',
                      border: `1.5px solid ${selectedDriverId === d.id ? 'var(--clr-accent)' : 'rgba(255,255,255,0.1)'}`,
                      background: selectedDriverId === d.id ? 'rgba(97,148,31,0.1)' : 'rgba(255,255,255,0.04)' }}>
                    <span style={{ flex: 1, fontSize: '0.84rem', fontWeight: 600, color: 'var(--clr-text)' }}>
                      {d.first_name} {d.last_name ?? ''}
                      {Boolean(d.is_currently_assigned) && <span style={{ color: 'var(--clr-accent)', fontWeight: 700 }}> · current</span>}
                    </span>
                    {selectedDriverId === d.id && <LuCheck size={14} style={{ color: 'var(--clr-accent)' }} />}
                  </button>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: '0.6rem' }}>
              {assignTarget.assigned_driver_id && (
                <button onClick={() => saveAssignment(null)} disabled={saving}
                  style={{ flex: 1, padding: '0.6rem', borderRadius: 10, border: '1px solid rgba(239,68,68,0.4)', background: 'rgba(239,68,68,0.1)', color: '#f87171', fontFamily: 'inherit', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer' }}>
                  Unassign
                </button>
              )}
              <button onClick={() => saveAssignment(selectedDriverId || null)} disabled={saving || !selectedDriverId}
                className="btn-primary" style={{ flex: 1.4, padding: '0.6rem', opacity: (saving || !selectedDriverId) ? 0.55 : 1 }}>
                {saving ? 'Saving…' : 'Assign Driver'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
