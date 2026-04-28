import { useState, useEffect, type FormEvent } from 'react'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import { carOwnerApi, configApi } from '../lib/apiClient'
import { useThemeLogo } from '../lib/useThemeLogo'
import LanguageToggle from '../components/LanguageToggle'
import { useLanguage } from '../context/LanguageContext'
import {
  LuCar, LuPlus, LuLogOut, LuUser, LuClipboardList, LuCheck,
  LuTriangleAlert, LuRefreshCw, LuTrash2, LuX, LuClock,
  LuSun, LuMoon,
} from 'react-icons/lu'

// ─── Types ────────────────────────────────────────────────────────────────────
interface CarOwnerVehicle {
  id: number
  plate_number: string
  vehicle_type: string
  model: string | null
  color: string | null
  year: number | null
  max_capacity_kg: number | null
  description: string | null
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  admin_note: string | null
  assigned_driver_name: string | null
  assigned_driver_phone: string | null
  created_at: string
}

// ─── Status badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: CarOwnerVehicle['status'] }) {
  const styles: Record<string, { background: string; color: string; label: string }> = {
    PENDING:  { background: 'rgba(251,191,36,0.15)', color: '#fbbf24', label: 'Pending' },
    APPROVED: { background: 'rgba(52,211,153,0.15)', color: '#34d399', label: 'Approved' },
    REJECTED: { background: 'rgba(248,113,113,0.15)', color: '#f87171', label: 'Rejected' },
  }
  const s = styles[status] || styles.PENDING
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
      padding: '0.25rem 0.65rem', borderRadius: 999,
      background: s.background, color: s.color, fontSize: '0.75rem', fontWeight: 700,
    }}>
      {status === 'APPROVED' && <LuCheck size={11}/>}
      {status === 'PENDING' && <LuClock size={11}/>}
      {status === 'REJECTED' && <LuX size={11}/>}
      {s.label}
    </span>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function CarOwnerDashboard() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const { t } = useLanguage()
  const logoImg = useThemeLogo()

  const [vehicles, setVehicles] = useState<CarOwnerVehicle[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [vehicleTypes, setVehicleTypes] = useState<string[]>([])

  // ── Theme ────────────────────────────────────────────────────────────────
  const [carTheme, setCarTheme] = useState<'LIGHT' | 'DARK'>(() =>
    (localStorage.getItem('car-theme') as 'LIGHT' | 'DARK' | null) ?? 'LIGHT'
  )
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', carTheme.toLowerCase())
  }, [])
  const handleCarTheme = (t: 'LIGHT' | 'DARK') => {
    setCarTheme(t)
    localStorage.setItem('car-theme', t)
    document.documentElement.setAttribute('data-theme', t.toLowerCase())
  }

  // register form
  const [showForm, setShowForm] = useState(false)
  const [fPlate, setFPlate] = useState('')
  const [fType, setFType] = useState('')
  const [fModel, setFModel] = useState('')
  const [fColor, setFColor] = useState('')
  const [fYear, setFYear] = useState('')
  const [fCapacity, setFCapacity] = useState('')
  const [fDesc, setFDesc] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formErr, setFormErr] = useState('')
  const [formOk, setFormOk] = useState(false)

  // delete confirm
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)

  async function loadVehicles() {
    setLoading(true); setErr('')
    try {
      const r = await carOwnerApi.listVehicles()
      setVehicles(r.data.vehicles || [])
    } catch {
      setErr('Failed to load vehicles.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadVehicles()
    configApi.getVehicleTypes().then(r => {
      const types = (r.data.vehicle_types as { name: string }[]).map(t => t.name)
      setVehicleTypes(types)
      if (types.length > 0) setFType(types[0])
    }).catch(() => {})
  }, [])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!fPlate.trim()) { setFormErr('Plate number is required.'); return }
    if (!fType) { setFormErr('Vehicle type is required.'); return }
    setSubmitting(true); setFormErr(''); setFormOk(false)
    try {
      await carOwnerApi.registerVehicle({
        plate_number: fPlate.trim(),
        vehicle_type: fType,
        model: fModel.trim() || undefined,
        color: fColor.trim() || undefined,
        year: fYear ? parseInt(fYear) : undefined,
        max_capacity_kg: fCapacity ? parseFloat(fCapacity) : undefined,
        description: fDesc.trim() || undefined,
      })
      setFormOk(true)
      setFPlate(''); setFModel(''); setFColor(''); setFYear(''); setFCapacity(''); setFDesc('')
      await loadVehicles()
      setTimeout(() => { setShowForm(false); setFormOk(false) }, 1500)
    } catch (e: any) {
      setFormErr(e.response?.data?.message || 'Failed to register vehicle.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(id: number) {
    setDeleteLoading(true)
    try {
      await carOwnerApi.deleteVehicle(String(id))
      setDeletingId(null)
      await loadVehicles()
    } catch (e: any) {
      alert(e.response?.data?.message || 'Failed to delete vehicle.')
    } finally {
      setDeleteLoading(false)
    }
  }

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  const fullName = [user?.first_name, user?.last_name].filter(Boolean).join(' ') || t('car_owner_badge')

  return (
    <div className="aurora-bg">
      <div className="aurora-orb aurora-orb-1" />
      <div className="page-shell" style={{ alignItems: 'flex-start', paddingTop: '1.25rem', paddingBottom: '2rem' }}>
        <div style={{ width: '100%', maxWidth: 760, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>

          {/* ── Header card ─────────────────────────────────────────────── */}
          <div className="glass" style={{ padding: '1.1rem 1.2rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.9rem', flexWrap: 'wrap' }}>
              <img src={logoImg} alt="logo" style={{ width: 38, height: 38, objectFit: 'contain', borderRadius: 8 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--clr-text)', margin: 0 }}>{fullName}</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.2rem', flexWrap: 'wrap' }}>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                    padding: '0.2rem 0.55rem', borderRadius: 999,
                    background: 'rgba(97, 148, 31,0.12)', color: 'var(--clr-accent)',
                    fontSize: '0.72rem', fontWeight: 700,
                  }}>
                    <LuCar size={11}/> {t('car_owner_badge')}
                  </span>
                  <span style={{ fontSize: '0.78rem', color: 'var(--clr-muted)' }}>{user?.email || user?.phone_number}</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <LanguageToggle compact />
                <button
                  onClick={() => handleCarTheme(carTheme === 'LIGHT' ? 'DARK' : 'LIGHT')}
                  title={carTheme === 'LIGHT' ? 'Switch to dark mode' : 'Switch to light mode'}
                  style={{ background: 'var(--adm-foot-btn-bg)', border: '1px solid var(--adm-foot-btn-brd)', borderRadius: 8, padding: '0.45rem 0.65rem', color: 'var(--clr-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                >
                  {carTheme === 'LIGHT' ? <LuMoon size={15} /> : <LuSun size={15} />}
                </button>
                <button
                  onClick={loadVehicles}
                  style={{ background: 'var(--adm-foot-btn-bg)', border: '1px solid var(--adm-foot-btn-brd)', borderRadius: 8, padding: '0.45rem 0.65rem', color: 'var(--clr-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                  title="Refresh"
                >
                  <LuRefreshCw size={15} />
                </button>
                <button
                  onClick={handleLogout}
                  style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.25)', borderRadius: 8, padding: '0.45rem 0.75rem', color: '#f87171', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem', fontWeight: 600 }}
                >
                  <LuLogOut size={14}/> {t('sidebar_logout') || 'Logout'}
                </button>
              </div>
            </div>
          </div>

          {/* ── Register Vehicle Button / Form ───────────────────────────── */}
          {!showForm ? (
            <button
              onClick={() => setShowForm(true)}
              className="btn-primary"
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', padding: '0.75rem' }}
            >
              <LuPlus size={16}/> {t('register_vehicle_btn')}
            </button>
          ) : (
            <div className="glass" style={{ padding: '1.2rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <p style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--clr-text)', margin: 0 }}>{t('register_new_vehicle')}</p>
                <button onClick={() => { setShowForm(false); setFormErr('') }} style={{ background: 'none', border: 'none', color: 'var(--clr-muted)', cursor: 'pointer', padding: '0.2rem' }}><LuX size={16}/></button>
              </div>
              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div className="input-wrap">
                    <input id="plate" type="text" placeholder=" " value={fPlate} onChange={e => setFPlate(e.target.value)} required />
                    <label htmlFor="plate">{t('co_plate_number')}</label>
                  </div>
                  <div className="input-wrap">
                    <select id="vtype" value={fType} onChange={e => setFType(e.target.value)} required
                      style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: '0.85rem 0.9rem 0.5rem', color: 'var(--clr-text)', fontSize: '0.875rem', width: '100%', outline: 'none', cursor: 'pointer' }}>
                      {vehicleTypes.length === 0 && <option value="">Loading...</option>}
                      {vehicleTypes.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <label htmlFor="vtype" style={{ top: '0.45rem', fontSize: '0.7rem', pointerEvents: 'none', position: 'absolute', left: '0.9rem', color: 'var(--clr-muted)' }}>{t('vehicle_type')}</label>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div className="input-wrap">
                    <input id="model" type="text" placeholder=" " value={fModel} onChange={e => setFModel(e.target.value)} />
                    <label htmlFor="model">{t('vehicle_model')}</label>
                  </div>
                  <div className="input-wrap">
                    <input id="color" type="text" placeholder=" " value={fColor} onChange={e => setFColor(e.target.value)} />
                    <label htmlFor="color">{t('vehicle_color')}</label>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div className="input-wrap">
                    <input id="year" type="number" placeholder=" " value={fYear} onChange={e => setFYear(e.target.value)} min={1980} max={new Date().getFullYear() + 1} />
                    <label htmlFor="year">{t('vehicle_year')}</label>
                  </div>
                  <div className="input-wrap">
                    <input id="capacity" type="number" placeholder=" " value={fCapacity} onChange={e => setFCapacity(e.target.value)} min={0} step={0.1} />
                    <label htmlFor="capacity">{t('max_capacity_kg')}</label>
                  </div>
                </div>
                <div className="input-wrap">
                  <input id="desc" type="text" placeholder=" " value={fDesc} onChange={e => setFDesc(e.target.value)} />
                  <label htmlFor="desc">{t('description')}</label>
                </div>

                {formErr && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#f87171', fontSize: '0.82rem', background: 'rgba(248,113,113,0.1)', padding: '0.6rem 0.9rem', borderRadius: 8 }}>
                    <LuTriangleAlert size={14}/> {formErr}
                  </div>
                )}
                {formOk && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#34d399', fontSize: '0.82rem', background: 'rgba(52,211,153,0.1)', padding: '0.6rem 0.9rem', borderRadius: 8 }}>
                    <LuCheck size={14}/> Vehicle registered successfully!
                  </div>
                )}

                <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.25rem' }}>
                  <button type="button" onClick={() => { setShowForm(false); setFormErr('') }}
                    style={{ flex: 1, padding: '0.75rem', borderRadius: 10, border: '1px solid var(--adm-foot-btn-brd)', background: 'var(--adm-foot-btn-bg)', color: 'var(--clr-muted)', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, fontSize: '0.875rem' }}>
                    {t('cancel')}
                  </button>
                  <button type="submit" className="btn-primary" disabled={submitting} style={{ flex: 2, padding: '0.75rem' }}>
                    {submitting ? t('co_submitting') : t('submit_approval')}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* ── Vehicles List ─────────────────────────────────────────────── */}
          <div className="glass" style={{ padding: '1.1rem 1.2rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.9rem' }}>
              <LuClipboardList size={16} style={{ color: 'var(--clr-accent)' }} />
              <p style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--clr-text)', margin: 0 }}>{t('my_vehicles')}</p>
              <span style={{ marginLeft: 'auto', fontSize: '0.78rem', color: 'var(--clr-muted)' }}>{vehicles.length} vehicle{vehicles.length !== 1 ? 's' : ''}</span>
            </div>

            {loading && (
              <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--clr-muted)' }}>
                <span className="spinner" style={{ marginRight: '0.5rem' }} />Loading vehicles…
              </div>
            )}
            {err && !loading && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#f87171', fontSize: '0.82rem', padding: '0.6rem' }}>
                <LuTriangleAlert size={14}/> {err}
              </div>
            )}

            {!loading && !err && vehicles.length === 0 && (
              <div style={{ textAlign: 'center', padding: '2.5rem 1rem' }}>
                <LuCar size={40} style={{ color: 'rgba(255,255,255,0.12)', marginBottom: '0.75rem' }} />
                <p style={{ color: 'var(--clr-muted)', fontSize: '0.9rem', margin: 0 }}>{t('no_vehicles')}</p>
                <p style={{ color: 'rgba(148,163,184,0.6)', fontSize: '0.8rem', marginTop: '0.4rem' }}>{t('no_vehicles_sub')}</p>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {vehicles.map(v => (
                <div key={v.id} className="glass-inner" style={{ padding: '0.9rem 1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 160 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.35rem' }}>
                        <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--clr-text)' }}>{v.plate_number}</span>
                        <span style={{ fontSize: '0.78rem', color: 'var(--clr-muted)', background: 'var(--adm-tab-bg)', padding: '0.1rem 0.5rem', borderRadius: 6 }}>{v.vehicle_type}</span>
                        <StatusBadge status={v.status} />
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem 1.25rem' }}>
                        {v.model && <span style={{ fontSize: '0.8rem', color: 'var(--clr-muted)' }}><strong style={{ color: 'var(--clr-text)', fontWeight: 500 }}>Model:</strong> {v.model}</span>}
                        {v.color && <span style={{ fontSize: '0.8rem', color: 'var(--clr-muted)' }}><strong style={{ color: 'var(--clr-text)', fontWeight: 500 }}>Color:</strong> {v.color}</span>}
                        {v.year && <span style={{ fontSize: '0.8rem', color: 'var(--clr-muted)' }}><strong style={{ color: 'var(--clr-text)', fontWeight: 500 }}>Year:</strong> {v.year}</span>}
                        {v.max_capacity_kg && <span style={{ fontSize: '0.8rem', color: 'var(--clr-muted)' }}><strong style={{ color: 'var(--clr-text)', fontWeight: 500 }}>Capacity:</strong> {v.max_capacity_kg} kg</span>}
                      </div>
                      {v.description && <p style={{ fontSize: '0.78rem', color: 'var(--clr-muted)', marginTop: '0.35rem', marginBottom: 0 }}>{v.description}</p>}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.4rem', minWidth: 120 }}>
                      {v.assigned_driver_name ? (
                        <div style={{ textAlign: 'right' }}>
                          <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--clr-muted)' }}>{t('assigned_driver')}</p>
                          <p style={{ margin: 0, fontSize: '0.82rem', color: '#34d399', fontWeight: 600 }}>{v.assigned_driver_name}</p>
                          {v.assigned_driver_phone && <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--clr-muted)' }}>{v.assigned_driver_phone}</p>}
                        </div>
                      ) : (
                        <span style={{ fontSize: '0.75rem', color: 'var(--clr-muted)', background: 'var(--adm-tab-bg)', padding: '0.2rem 0.55rem', borderRadius: 6 }}>{t('no_driver_yet')}</span>
                      )}
                      {v.status === 'PENDING' && (
                        <button
                          onClick={() => setDeletingId(v.id)}
                          style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.25)', borderRadius: 7, padding: '0.3rem 0.6rem', color: '#f87171', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.75rem', fontWeight: 600 }}
                        >
                          <LuTrash2 size={12}/> {t('delete_btn')}
                        </button>
                      )}
                    </div>
                  </div>
                  {v.status === 'REJECTED' && v.admin_note && (
                    <div style={{ marginTop: '0.6rem', background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 7, padding: '0.5rem 0.75rem' }}>
                      <p style={{ margin: 0, fontSize: '0.78rem', color: '#f87171' }}><strong>Rejection reason:</strong> {v.admin_note}</p>
                    </div>
                  )}
                  {v.status === 'APPROVED' && v.admin_note && (
                    <div style={{ marginTop: '0.6rem', background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.2)', borderRadius: 7, padding: '0.5rem 0.75rem' }}>
                      <p style={{ margin: 0, fontSize: '0.78rem', color: '#34d399' }}><strong>Admin note:</strong> {v.admin_note}</p>
                    </div>
                  )}
                  <p style={{ margin: '0.5rem 0 0', fontSize: '0.72rem', color: 'rgba(148,163,184,0.5)' }}>
                    Registered {new Date(v.created_at).toLocaleDateString()}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* ── Info card ────────────────────────────────────────────────── */}
          <div className="glass" style={{ padding: '0.9rem 1.1rem' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
              <LuUser size={16} style={{ color: 'var(--clr-accent)', flexShrink: 0, marginTop: 2 }}/>
              <div>
                <p style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--clr-text)', margin: '0 0 0.3rem' }}>{t('how_it_works')}</p>
                <ol style={{ margin: 0, paddingLeft: '1.1rem', color: 'var(--clr-muted)', fontSize: '0.8rem', lineHeight: 1.7 }}>
                  <li>Register your vehicle with plate number and type.</li>
                  <li>Admin reviews and approves or rejects your vehicle.</li>
                  <li>Once approved, admin can assign a qualified driver to your vehicle.</li>
                  <li>You can see the assigned driver details here.</li>
                </ol>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Delete Confirm Modal ────────────────────────────────────────── */}
      {deletingId !== null && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 9999, display: 'grid', placeItems: 'center', padding: '1rem' }}>
          <div className="glass" style={{ width: 'min(380px,100%)', padding: '1.5rem' }}>
            <p style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--clr-text)', margin: '0 0 0.5rem' }}>{t('delete_vehicle')}</p>
            <p style={{ color: 'var(--clr-muted)', fontSize: '0.85rem', margin: '0 0 1.25rem', lineHeight: 1.6 }}>This will permanently remove the vehicle registration. This action cannot be undone.</p>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button onClick={() => setDeletingId(null)}
                style={{ flex: 1, padding: '0.7rem', borderRadius: 10, border: '1px solid var(--adm-foot-btn-brd)', background: 'var(--adm-foot-btn-bg)', color: 'var(--clr-muted)', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, fontSize: '0.875rem' }}>
                {t('cancel')}
              </button>
              <button onClick={() => handleDelete(deletingId!)} disabled={deleteLoading}
                style={{ flex: 1, padding: '0.7rem', borderRadius: 10, border: 'none', background: 'rgba(248,113,113,0.2)', color: '#f87171', cursor: deleteLoading ? 'not-allowed' : 'pointer', fontFamily: 'inherit', fontWeight: 700, fontSize: '0.875rem' }}>
                {deleteLoading ? t('co_deleting') : t('delete_btn')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
