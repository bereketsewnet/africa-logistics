import { useState, useEffect, type FormEvent } from 'react'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import { authApi, carOwnerApi, configApi } from '../lib/apiClient'
import PhoneField from '../components/PhoneField'
import { normalisePhone } from '../lib/normalisePhone'
import LanguageToggle from '../components/LanguageToggle'
import { useLanguage } from '../context/LanguageContext'
import {
  LuCar, LuPlus, LuLogOut, LuUser, LuClipboardList, LuCheck,
  LuTriangleAlert, LuTrash2, LuX, LuChevronLeft, LuChevronRight,
  LuSun, LuMoon, LuBadgeCheck, LuSearch, LuUserCheck, LuPhone,
} from 'react-icons/lu'
import { absoluteUploadUrl } from '../lib/uploadUrl'
import ApprovalBadge from '../components/fleet/ApprovalBadge'
import DriverDocumentThumb from '../components/fleet/DriverDocumentThumb'
import type { FleetVehicle, EligibleDriver } from '../components/fleet/types'
import type { OperationalStatus } from '../components/fleet/types'
import OperationalStatusControl from '../components/fleet/OperationalStatusControl'
import DocumentUploadField from '../components/fleet/DocumentUploadField'
import GalleryUploadField from '../components/fleet/GalleryUploadField'

/** Which panel the sidebar is showing. */
type CarOwnerView = 'vehicles' | 'add' | 'profile'

// The individual dashboard shows the same vehicle shape as the company fleet.
type CarOwnerVehicle = FleetVehicle

// ─── Main Component ───────────────────────────────────────────────────────────
export default function CarOwnerDashboard() {
  const { user, logout, updateUser } = useAuth()
  const navigate = useNavigate()
  const { t } = useLanguage()

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

  // ── Layout ───────────────────────────────────────────────────────────────
  // Below this width the sidebar folds into scrollable pills at the top, so
  // the portal stays usable on the phone a fleet manager actually carries.
  // ── Dock expand/collapse ──────────────────────────────────────────────────
  // Same key and default as the shipper/driver portal, so a user who works in
  // both sees the same dock width rather than it flipping between portals.
  const DOCK_KEY = 'dash_dock_v3'
  const [dockExpanded, setDockExpanded] = useState(() => localStorage.getItem(DOCK_KEY) === 'true')
  const toggleDock = () => {
    const next = !dockExpanded
    setDockExpanded(next)
    localStorage.setItem(DOCK_KEY, String(next))
  }

  const [isNarrow, setIsNarrow] = useState(() => window.matchMedia('(max-width: 900px)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 900px)')
    const onChange = (e: MediaQueryListEvent) => setIsNarrow(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const [view, setView] = useState<CarOwnerView>('vehicles')

  // operational status
  const [statusSavingId, setStatusSavingId] = useState<string | null>(null)

  // register form
  const [fPlate, setFPlate] = useState('')
  const [fType, setFType] = useState('')
  const [fModel, setFModel] = useState('')
  const [fColor, setFColor] = useState('')
  const [fYear, setFYear] = useState('')
  const [fCapacity, setFCapacity] = useState('')
  const [fDesc, setFDesc] = useState('')
  const [fPhoto, setFPhoto] = useState('')
  const [fGallery, setFGallery] = useState<string[]>([])
  const [fLibre, setFLibre] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formErr, setFormErr] = useState('')
  const [formOk, setFormOk] = useState(false)

  // delete confirm
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)

  // owner driver assignment
  const [assignVehicle, setAssignVehicle] = useState<CarOwnerVehicle | null>(null)
  const [eligibleDrivers, setEligibleDrivers] = useState<EligibleDriver[]>([])
  const [driversLoading, setDriversLoading] = useState(false)
  const [driversError, setDriversError] = useState('')
  const [driverSearch, setDriverSearch] = useState('')
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null)
  const [assignSaving, setAssignSaving] = useState(false)
  const [assignmentMessage, setAssignmentMessage] = useState('')

  // Car owners are self-service users, so their phone follows the same rules as
  // shippers and drivers. When the company SMS service is off, the API updates
  // and verifies it immediately; if enabled later, this card shows the OTP step.
  const [showPhoneForm, setShowPhoneForm] = useState(false)
  const [newPhone, setNewPhone] = useState('')
  const [phoneOtp, setPhoneOtp] = useState('')
  const [phoneStep, setPhoneStep] = useState<'input' | 'otp'>('input')
  const [phoneLoading, setPhoneLoading] = useState(false)
  const [phoneError, setPhoneError] = useState('')
  const [phoneSuccess, setPhoneSuccess] = useState('')

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
        vehicle_photo: fPhoto || undefined,
        vehicle_images: fGallery.length ? fGallery : undefined,
        libre_file: fLibre || undefined,
      })
      setFormOk(true)
      setFPlate(''); setFModel(''); setFColor(''); setFYear(''); setFCapacity(''); setFDesc('')
      setFPhoto(''); setFGallery([]); setFLibre('')
      await loadVehicles()
      setTimeout(() => { setFormOk(false); setView('vehicles') }, 1500)
    } catch (e: any) {
      setFormErr(e.response?.data?.message || 'Failed to register vehicle.')
    } finally {
      setSubmitting(false)
    }
  }

  /**
   * The owner's own availability switch. Optimistic so a fleet manager flipping
   * several vehicles is not waiting on a round-trip each time; rolled back and
   * surfaced if the server refuses (e.g. the driver is mid-delivery).
   */
  async function handleOperationalStatus(vehicle: CarOwnerVehicle, next: OperationalStatus) {
    const previous = vehicle.operational_status ?? 'ACTIVE'
    if (previous === next) return

    setStatusSavingId(vehicle.id)
    setVehicles(list => list.map(v => v.id === vehicle.id ? { ...v, operational_status: next } : v))
    try {
      const { data } = await carOwnerApi.setOperationalStatus(vehicle.id, next)
      setAssignmentMessage(data?.message ?? 'Vehicle status updated.')
      setTimeout(() => setAssignmentMessage(''), 3500)
    } catch (e: any) {
      setVehicles(list => list.map(v => v.id === vehicle.id ? { ...v, operational_status: previous } : v))
      setErr(e.response?.data?.message || 'Could not update the vehicle status.')
      setTimeout(() => setErr(''), 5000)
    } finally {
      setStatusSavingId(null)
    }
  }

  async function handleDelete(id: string) {
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

  async function openDriverAssignment(vehicle: CarOwnerVehicle) {
    if (vehicle.status !== 'APPROVED') return
    setAssignVehicle(vehicle)
    setEligibleDrivers([])
    setDriversError('')
    setDriverSearch('')
    setSelectedDriverId(vehicle.assigned_driver_id)
    setDriversLoading(true)
    try {
      const { data } = await carOwnerApi.listEligibleDrivers(vehicle.id)
      const drivers = data.drivers ?? []
      setEligibleDrivers(drivers)
      const currentIsEligible = vehicle.assigned_driver_id && drivers.some((driver: EligibleDriver) => driver.id === vehicle.assigned_driver_id)
      setSelectedDriverId(currentIsEligible ? vehicle.assigned_driver_id : drivers[0]?.id ?? null)
    } catch (e: any) {
      setDriversError(e.response?.data?.message || 'Failed to load verified drivers.')
    } finally {
      setDriversLoading(false)
    }
  }

  async function saveDriverAssignment(driverId: string | null) {
    if (!assignVehicle) return
    setAssignSaving(true)
    setDriversError('')
    try {
      const { data } = await carOwnerApi.assignDriver(assignVehicle.id, driverId)
      setAssignmentMessage(data.message || (driverId ? 'Driver assigned successfully.' : 'Driver unassigned.'))
      setAssignVehicle(null)
      await loadVehicles()
      setTimeout(() => setAssignmentMessage(''), 3500)
    } catch (e: any) {
      setDriversError(e.response?.data?.message || 'Failed to update the driver assignment.')
    } finally {
      setAssignSaving(false)
    }
  }

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  async function requestPhoneChange(e: FormEvent) {
    e.preventDefault()
    const phone = normalisePhone(newPhone)
    if (!phone) { setPhoneError('Enter a valid phone number.'); return }
    setPhoneLoading(true); setPhoneError('')
    try {
      const { data } = await authApi.requestPhoneChange(phone)
      if (data.phone_updated) {
        updateUser({ phone_number: phone, is_phone_verified: 1 })
        setPhoneSuccess(data.message || 'Phone number updated and verified.')
        setNewPhone('')
      } else {
        setPhoneStep('otp')
      }
    } catch (e: any) {
      setPhoneError(e.response?.data?.message || 'Unable to update phone number.')
    } finally { setPhoneLoading(false) }
  }

  async function verifyPhoneChange(e: FormEvent) {
    e.preventDefault()
    const phone = normalisePhone(newPhone)
    setPhoneLoading(true); setPhoneError('')
    try {
      await authApi.verifyPhoneChange(phone, phoneOtp)
      updateUser({ phone_number: phone, is_phone_verified: 1 })
      setPhoneSuccess('Phone number updated and verified.')
      setNewPhone(''); setPhoneOtp(''); setPhoneStep('input')
    } catch (e: any) {
      setPhoneError(e.response?.data?.message || 'Invalid OTP.')
    } finally { setPhoneLoading(false) }
  }

  const fullName = [user?.first_name, user?.last_name].filter(Boolean).join(' ') || t('car_owner_badge')
  const filteredDrivers = eligibleDrivers.filter(driver =>
    `${driver.first_name} ${driver.last_name ?? ''}`.toLowerCase().includes(driverSearch.trim().toLowerCase())
  )
  const selectedDriver = eligibleDrivers.find(driver => driver.id === selectedDriverId) ?? null

  const NAV: { id: CarOwnerView; label: string; icon: React.ReactNode }[] = [
    { id: 'vehicles', label: t('my_vehicles'),           icon: <LuClipboardList size={19} /> },
    { id: 'add',      label: t('register_vehicle_btn'),  icon: <LuPlus size={19} /> },
    { id: 'profile',  label: t('nav_account'),           icon: <LuUser size={19} /> },
  ]

  return (
    <div className="aurora-bg" style={{ minHeight: '100vh' }}>
      <div className="aurora-orb aurora-orb-1" />

      {/* ── MOBILE BOTTOM DOCK ── */}
      <div className="dash-dock-mobile">
        {NAV.map(item => (
          <button key={item.id} onClick={() => setView(item.id)} title={item.label}
            className={`dock-btn${view === item.id ? ' dock-btn-active' : ''}`}>
            <span className="dock-icon">{item.icon}</span>
            <span className="dock-label">{item.label}</span>
          </button>
        ))}
      </div>

      {/* ── DESKTOP LEFT DOCK ── */}
      <div className={`dash-dock-desktop${dockExpanded ? ' dock-expanded' : ''}`}>
        <div className="dock-avatar">
          {user?.profile_photo_url
            ? <img src={absoluteUploadUrl(user.profile_photo_url)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <LuCar size={18} />}
        </div>
        <div className="dock-divider" />
        {NAV.map(item => (
          <button key={item.id} onClick={() => setView(item.id)} title={item.label}
            className={`dock-btn${view === item.id ? ' dock-btn-active' : ''}`}
            style={{ flexDirection: dockExpanded ? 'row' : 'column', justifyContent: dockExpanded ? 'flex-start' : 'center', padding: dockExpanded ? '0.6rem 0.85rem' : '0.65rem 0.5rem', gap: dockExpanded ? '0.65rem' : '0.2rem' }}>
            <span className="dock-icon">{item.icon}</span>
            {dockExpanded && <span className="dock-item-label">{item.label}</span>}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <div className="dock-divider" />
        {/* Theme is car-owner specific, so it sits with the other dock controls. */}
        <button onClick={() => handleCarTheme(carTheme === 'LIGHT' ? 'DARK' : 'LIGHT')}
          className="dock-btn" title={carTheme === 'LIGHT' ? 'Switch to dark mode' : 'Switch to light mode'}
          style={{ flexDirection: dockExpanded ? 'row' : 'column', justifyContent: dockExpanded ? 'flex-start' : 'center', padding: dockExpanded ? '0.6rem 0.85rem' : '0.65rem 0.5rem', gap: dockExpanded ? '0.65rem' : '0.2rem' }}>
          <span className="dock-icon">{carTheme === 'LIGHT' ? <LuMoon size={18} /> : <LuSun size={18} />}</span>
          {dockExpanded && <span className="dock-item-label">{carTheme === 'LIGHT' ? 'Dark mode' : 'Light mode'}</span>}
        </button>
        <div style={{ alignSelf: 'stretch', padding: '0.4rem 0.5rem', display: 'flex', justifyContent: 'center' }}>
          <LanguageToggle compact={!dockExpanded} />
        </div>
        <button onClick={toggleDock} className="dock-btn dock-toggle-btn" title={dockExpanded ? 'Collapse' : 'Expand'}>
          {dockExpanded ? <LuChevronLeft size={15} /> : <LuChevronRight size={15} />}
        </button>
        <button onClick={handleLogout} className="dock-btn" title={t('sign_out')}
          style={{ flexDirection: 'column', gap: '0.2rem', padding: '0.65rem 0.5rem' }}>
          <LuLogOut size={18} />
          {dockExpanded && <span className="dock-item-label">{t('sign_out')}</span>}
        </button>
      </div>

      {/* ── Main content area ── */}
      <div className={`dash-main${dockExpanded ? ' dock-wide' : ''}`}>
        <div className="page-shell" style={{ alignItems: 'flex-start' }}>
          <div style={{ width: '100%', maxWidth: 980, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>

          {assignmentMessage && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', color: '#34d399', fontSize: '0.84rem', background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.22)', padding: '0.7rem 0.9rem', borderRadius: 10 }}>
              <LuCheck size={15} /> {assignmentMessage}
            </div>
          )}
            {/* ── My Vehicles ──────────────────────────────────────────── */}
            {view === 'vehicles' && (
              <>
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
                        {v.vehicle_photo_url && (
                          <img src={absoluteUploadUrl(v.vehicle_photo_url)} alt={v.plate_number}
                            style={{ width: 40, height: 30, borderRadius: 6, objectFit: 'cover', border: '1px solid rgba(255,255,255,0.1)' }} />
                        )}
                        <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--clr-text)' }}>{v.plate_number}</span>
                        <span style={{ fontSize: '0.78rem', color: 'var(--clr-muted)', background: 'var(--adm-tab-bg)', padding: '0.1rem 0.5rem', borderRadius: 6 }}>{v.vehicle_type}</span>
                        <ApprovalBadge status={v.status} />
                        <OperationalStatusControl
                          vehicle={v}
                          saving={statusSavingId === v.id}
                          onChange={next => handleOperationalStatus(v, next)}
                        />
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
                      {v.status === 'APPROVED' && (
                        <button
                          onClick={() => openDriverAssignment(v)}
                          style={{ background: 'rgba(97,148,31,0.1)', border: '1px solid rgba(97,148,31,0.28)', borderRadius: 7, padding: '0.38rem 0.65rem', color: 'var(--clr-accent)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem', fontWeight: 700, fontFamily: 'inherit' }}
                        >
                          <LuUserCheck size={13} /> {v.assigned_driver_id ? 'Change Driver' : 'Choose Driver'}
                        </button>
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
              </>
            )}

            {/* ── Add Vehicle ──────────────────────────────────────────── */}
            {view === 'add' && (
              <>

            <div className="glass" style={{ padding: '1.2rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <p style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--clr-text)', margin: 0 }}>{t('register_new_vehicle')}</p>
                <button onClick={() => { setView('vehicles'); setFormErr('') }} style={{ background: 'none', border: 'none', color: 'var(--clr-muted)', cursor: 'pointer', padding: '0.2rem' }}><LuX size={16}/></button>
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

                {/* Photos and documents — every one optional, same as the
                    admin vehicle form. */}
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.09)', paddingTop: '0.9rem', display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
                  <p style={{ margin: 0, fontSize: '0.8rem', fontWeight: 700, color: 'var(--clr-text)' }}>
                    Photos &amp; documents
                    <span style={{ marginLeft: '0.4rem', fontWeight: 500, color: 'var(--clr-muted)', fontSize: '0.72rem' }}>
                      — all optional, you can add them later
                    </span>
                  </p>
                  <DocumentUploadField
                    label="Main Photo"
                    hint="The photo shown on your vehicle card"
                    accept="image/jpeg,image/png,image/webp"
                    value={fPhoto}
                    onChange={setFPhoto}
                    disabled={submitting}
                  />
                  <GalleryUploadField value={fGallery} onChange={setFGallery} disabled={submitting} />
                  <DocumentUploadField
                    label="Libre Document"
                    hint="Ownership book — image or PDF"
                    value={fLibre}
                    onChange={setFLibre}
                    disabled={submitting}
                  />
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
                  <button type="button" onClick={() => { setView('vehicles'); setFormErr('') }}
                    style={{ flex: 1, padding: '0.75rem', borderRadius: 10, border: '1px solid var(--adm-foot-btn-brd)', background: 'var(--adm-foot-btn-bg)', color: 'var(--clr-muted)', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, fontSize: '0.875rem' }}>
                    {t('cancel')}
                  </button>
                  <button type="submit" className="btn-primary" disabled={submitting} style={{ flex: 2, padding: '0.75rem' }}>
                    {submitting ? t('co_submitting') : t('submit_approval')}
                  </button>
                </div>
              </form>
            </div>
              </>
            )}

            {/* ── Profile ──────────────────────────────────────────────── */}
            {view === 'profile' && (
              <>
                <div className="glass" style={{ padding: '1.1rem 1.2rem' }}>
                  <p style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--clr-text)', margin: '0 0 0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <LuUser size={15} style={{ color: 'var(--clr-accent)' }} /> {t('prf_title') || 'Profile'}
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: isNarrow ? '1fr' : '1fr 1fr', gap: '0.75rem' }}>
                    {[
                      ['Name', fullName],
                      ['Phone', user?.phone_number ?? '—'],
                      ['Email', user?.email || '—'],
                      ['Account type', t('car_owner_badge')],
                    ].map(([label, value]) => (
                      <div key={String(label)} className="glass-inner" style={{ padding: '0.7rem 0.85rem' }}>
                        <p style={{ margin: 0, fontSize: '0.7rem', color: 'var(--clr-muted)' }}>{label}</p>
                        <p style={{ margin: '0.15rem 0 0', fontSize: '0.85rem', color: 'var(--clr-text)', fontWeight: 600 }}>{value}</p>
                      </div>
                    ))}
                  </div>
                </div>
          <div className="glass" style={{ padding: '1rem 1.2rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.8rem', flexWrap: 'wrap' }}>
              <div><p style={{ color: 'var(--clr-text)', fontWeight: 700, fontSize: '0.88rem', margin: 0, display: 'flex', alignItems: 'center', gap: '0.35rem' }}><LuPhone size={14} /> Phone number</p><p style={{ color: 'var(--clr-muted)', fontSize: '0.76rem', marginTop: '0.22rem' }}>{user?.phone_number}</p></div>
              <button className="btn-outline" onClick={() => { setShowPhoneForm(open => !open); setPhoneError(''); setPhoneSuccess(''); setPhoneStep('input'); setPhoneOtp('') }} style={{ fontSize: '0.76rem', padding: '0.42rem 0.75rem' }}>{showPhoneForm ? 'Cancel' : 'Change phone'}</button>
            </div>
            {showPhoneForm && <div style={{ marginTop: '0.9rem', borderTop: '1px solid rgba(255,255,255,0.09)', paddingTop: '0.9rem' }}>
              {phoneSuccess ? <div className="alert alert-success" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}><LuCheck size={14} /> {phoneSuccess}</div> : phoneStep === 'input' ? <form onSubmit={requestPhoneChange} style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                {phoneError && <div className="alert alert-error"><LuTriangleAlert size={14} /> {phoneError}</div>}
                <p style={{ color: 'var(--clr-muted)', fontSize: '0.76rem', lineHeight: 1.45 }}>SMS OTP is currently unavailable, so eligible accounts can update their phone number directly. If SMS OTP is enabled later, we will ask for the code here.</p>
                <PhoneField id="car-owner-new-phone" value={newPhone} onChange={setNewPhone} />
                <button className="btn-primary" type="submit" disabled={phoneLoading} style={{ alignSelf: 'flex-start', padding: '0.5rem 0.85rem' }}>{phoneLoading ? 'Updating…' : 'Update phone number'}</button>
              </form> : <form onSubmit={verifyPhoneChange} style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                {phoneError && <div className="alert alert-error"><LuTriangleAlert size={14} /> {phoneError}</div>}
                <p style={{ color: 'var(--clr-muted)', fontSize: '0.76rem' }}>Enter the 6-digit code sent to {normalisePhone(newPhone)}.</p>
                <div className="input-wrap"><input id="car-owner-phone-otp" type="text" inputMode="numeric" placeholder=" " maxLength={6} value={phoneOtp} onChange={event => setPhoneOtp(event.target.value.replace(/\D/g, ''))} required /><label htmlFor="car-owner-phone-otp">6-digit OTP</label></div>
                <div style={{ display: 'flex', gap: '0.5rem' }}><button type="button" className="btn-outline" onClick={() => setPhoneStep('input')}>Back</button><button className="btn-primary" type="submit" disabled={phoneLoading || phoneOtp.length < 6}>{phoneLoading ? 'Verifying…' : 'Verify & update'}</button></div>
              </form>}
            </div>}
          </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Owner Driver Assignment Modal ─────────────────────────────── */}
      {assignVehicle && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.68)', backdropFilter: 'blur(5px)', zIndex: 9999, display: 'grid', placeItems: 'center', padding: '1rem' }}>
          <div className="glass" role="dialog" aria-modal="true" aria-labelledby="choose-driver-title" style={{ width: 'min(720px,100%)', maxHeight: '92vh', overflowY: 'auto', padding: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '0.85rem' }}>
              <div>
                <p id="choose-driver-title" style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--clr-text)', margin: 0 }}>Choose a Verified Driver</p>
                <p style={{ color: 'var(--clr-muted)', fontSize: '0.76rem', margin: '0.25rem 0 0' }}>{assignVehicle.plate_number} · {assignVehicle.vehicle_type}</p>
              </div>
              <button type="button" onClick={() => setAssignVehicle(null)} disabled={assignSaving} aria-label="Close" style={{ border: 'none', background: 'transparent', color: 'var(--clr-muted)', cursor: 'pointer', padding: 3 }}><LuX size={18} /></button>
            </div>

            <div style={{ padding: '0.65rem 0.75rem', borderRadius: 9, background: 'rgba(59,130,246,0.07)', border: '1px solid rgba(59,130,246,0.18)', color: 'var(--clr-muted)', fontSize: '0.72rem', lineHeight: 1.5, marginBottom: '0.8rem' }}>
              Only admin-verified drivers with approved National ID and driving-license documents are shown. Private phone, email, address, and unrelated documents are hidden.
            </div>

            {driversLoading ? (
              <div style={{ padding: '2.25rem', textAlign: 'center', color: 'var(--clr-muted)', fontSize: '0.84rem' }}><span className="spinner" style={{ marginRight: '0.5rem' }} />Loading verified drivers…</div>
            ) : driversError && eligibleDrivers.length === 0 ? (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', color: '#f87171', fontSize: '0.8rem', background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)', padding: '0.7rem 0.8rem', borderRadius: 9 }}><LuTriangleAlert size={14} style={{ flexShrink: 0, marginTop: 1 }} />{driversError}</div>
            ) : eligibleDrivers.length === 0 ? (
              <div style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--clr-muted)' }}>
                <LuUser size={30} style={{ opacity: 0.45, marginBottom: '0.55rem' }} />
                <p style={{ fontSize: '0.84rem', fontWeight: 700, color: 'var(--clr-text)', margin: 0 }}>No verified drivers are currently available</p>
                <p style={{ fontSize: '0.74rem', margin: '0.3rem 0 0' }}>A driver may already be assigned to another vehicle or still be waiting for document approval.</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: '0.75rem' }}>
                <div style={{ position: 'relative' }}>
                  <LuSearch size={14} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--clr-muted)', pointerEvents: 'none' }} />
                  <input value={driverSearch} onChange={event => setDriverSearch(event.target.value)} placeholder="Search driver by name" style={{ width: '100%', boxSizing: 'border-box', padding: '0.62rem 0.75rem 0.62rem 2rem', borderRadius: 9, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: 'var(--clr-text)', fontFamily: 'inherit', outline: 'none', fontSize: '0.8rem' }} />
                </div>

                <div role="radiogroup" aria-label="Eligible verified drivers" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(145px,1fr))', gap: '0.45rem', maxHeight: 145, overflowY: 'auto', padding: '0.15rem 0.2rem 0.15rem 0' }}>
                  {filteredDrivers.map(driver => {
                    const selected = selectedDriverId === driver.id
                    return (
                      <button key={driver.id} type="button" role="radio" aria-checked={selected} onClick={() => { setSelectedDriverId(driver.id); setDriversError('') }} style={{ minHeight: 44, padding: '0.55rem 0.65rem', borderRadius: 9, cursor: 'pointer', background: selected ? 'rgba(97,148,31,0.14)' : 'rgba(255,255,255,0.03)', border: `1px solid ${selected ? 'rgba(97,148,31,0.52)' : 'rgba(255,255,255,0.09)'}`, color: selected ? 'var(--clr-accent)' : 'var(--clr-text)', fontFamily: 'inherit', fontSize: '0.76rem', fontWeight: selected ? 800 : 650, lineHeight: 1.3 }}>
                        {driver.first_name} {driver.last_name ?? ''}
                        {driver.is_currently_assigned === 1 && <span style={{ display: 'block', marginTop: 2, fontSize: '0.62rem', color: '#34d399' }}>Currently assigned</span>}
                      </button>
                    )
                  })}
                </div>

                {filteredDrivers.length === 0 && <p style={{ margin: 0, padding: '0.75rem', textAlign: 'center', color: 'var(--clr-muted)', fontSize: '0.78rem' }}>No driver matches your search.</p>}

                {selectedDriver && (
                  <div style={{ padding: '0.9rem', borderRadius: 12, background: 'rgba(97,148,31,0.07)', border: '1px solid rgba(97,148,31,0.24)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', marginBottom: '0.7rem' }}>
                      <div style={{ width: 46, height: 46, borderRadius: '50%', flexShrink: 0, overflow: 'hidden', background: 'linear-gradient(135deg,var(--clr-accent2),var(--clr-accent))', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
                        {selectedDriver.profile_photo_url ? <img src={absoluteUploadUrl(selectedDriver.profile_photo_url)} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <LuUser size={20} />}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <p style={{ margin: 0, color: 'var(--clr-text)', fontSize: '0.9rem', fontWeight: 800 }}>{selectedDriver.first_name} {selectedDriver.last_name ?? ''}</p>
                        <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', marginTop: 5 }}>
                          {['Verified', assignVehicle.vehicle_type, 'ID approved', 'License approved'].map(tag => <span key={tag} style={{ borderRadius: 99, padding: '0.12rem 0.45rem', fontSize: '0.62rem', fontWeight: 750, color: '#34d399', background: 'rgba(52,211,153,0.09)', border: '1px solid rgba(52,211,153,0.2)' }}>{tag}</span>)}
                        </div>
                      </div>
                      <LuBadgeCheck size={20} style={{ color: '#34d399', marginLeft: 'auto', flexShrink: 0 }} />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: '0.6rem' }}>
                      <DriverDocumentThumb label="National ID" url={selectedDriver.national_id_url} />
                      <DriverDocumentThumb label="Driving License" url={selectedDriver.license_url} />
                    </div>
                  </div>
                )}
              </div>
            )}

            {driversError && eligibleDrivers.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', color: '#f87171', fontSize: '0.78rem', background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)', padding: '0.65rem 0.75rem', borderRadius: 9, marginTop: '0.75rem' }}><LuTriangleAlert size={13} style={{ flexShrink: 0, marginTop: 1 }} />{driversError}</div>
            )}

            <div style={{ display: 'flex', gap: '0.55rem', justifyContent: 'flex-end', flexWrap: 'wrap', marginTop: '1rem' }}>
              {assignVehicle.assigned_driver_id && (
                <button type="button" onClick={() => saveDriverAssignment(null)} disabled={assignSaving} style={{ padding: '0.65rem 0.8rem', borderRadius: 9, border: '1px solid rgba(248,113,113,0.25)', background: 'rgba(248,113,113,0.08)', color: '#f87171', cursor: assignSaving ? 'not-allowed' : 'pointer', fontFamily: 'inherit', fontWeight: 650, fontSize: '0.78rem' }}>Unassign Driver</button>
              )}
              <button type="button" onClick={() => setAssignVehicle(null)} disabled={assignSaving} style={{ padding: '0.65rem 0.9rem', borderRadius: 9, border: '1px solid var(--adm-foot-btn-brd)', background: 'var(--adm-foot-btn-bg)', color: 'var(--clr-muted)', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 650, fontSize: '0.8rem' }}>Cancel</button>
              <button type="button" className="btn-primary" onClick={() => saveDriverAssignment(selectedDriverId)} disabled={assignSaving || driversLoading || !selectedDriverId} style={{ padding: '0.65rem 1rem', opacity: assignSaving || driversLoading || !selectedDriverId ? 0.6 : 1 }}><LuUserCheck size={14} /> {assignSaving ? 'Saving…' : 'Assign Selected Driver'}</button>
            </div>
          </div>
        </div>
      )}

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
