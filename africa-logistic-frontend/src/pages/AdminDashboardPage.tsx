import {
  useState, useEffect, useCallback, useRef,
  type FormEvent, type ChangeEvent,
} from 'react'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import apiClient, { authApi, assistantApi, adminOrderApi, configApi, adminCarOwnerApi } from '../lib/apiClient'
import LanguageToggle from '../components/LanguageToggle'
import { useLanguage } from '../context/LanguageContext'
import PhoneField from '../components/PhoneField'
import { normalisePhone } from '../lib/normalisePhone'
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMapEvents } from 'react-leaflet'
import AdminPaymentReview from '../components/AdminPaymentReview'
import AdminWalletAdjustment from '../components/AdminWalletAdjustment'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import logoImg from '../assets/logo.webp'
import aiLogoSrc from '../assets/logo-ai-assistant.webp'
import AdminReportsSectionComponent from '../components/AdminReportsSection'
import {
  LuTruck, LuUser, LuShield, LuPackage, LuPhone, LuMail,
  LuIdCard, LuCircleCheck, LuTriangleAlert, LuCamera, LuTrash2,
  LuEye, LuEyeOff, LuLogOut, LuCheck, LuSmartphone, LuArrowLeft, LuArrowRight,
  LuLock, LuContact, LuMenu, LuPin, LuPinOff,
  LuUsers, LuChartBar, LuX, LuStar, LuHistory,
  LuShieldCheck, LuPencil, LuPlus, LuFileText, LuRefreshCw,
  LuCar, LuBadgeCheck, LuUserPlus, LuBriefcase, LuSearch,
  LuListOrdered, LuSettings, LuBox, LuBan,
  LuLeaf, LuFlame, LuThermometer, LuHeart, LuMonitor, LuArchive, LuGem, LuFish, LuImage,
  LuMapPin, LuMessageSquare, LuSend, LuNavigation, LuBell,
  LuGlobe, LuWrench, LuBike, LuKey, LuLayoutDashboard, LuLink, LuToggleLeft, LuToggleRight,
  LuWallet, LuLandmark, LuReceipt,
  LuSun, LuMoon,
} from 'react-icons/lu'

// ─── Upload URL helper ───────────────────────────────────────────────────────
const _API_UPLOAD_BASE = (import.meta.env.VITE_API_BASE_URL as string ?? '').replace(/\/api$/, '')
const getUploadUrl = (path: string | null | undefined): string | null =>
  path ? (_API_UPLOAD_BASE + (path.startsWith('/') ? path : '/' + path)) : null

// ─── Shared UI helpers ────────────────────────────────────────────────────────

/** Maps Lucide icon name strings (as stored in DB) → React element */
const CARGO_ICON_MAP: Record<string, React.ReactNode> = {
  LuPackage: <LuPackage />, LuBox: <LuBox />, LuTruck: <LuTruck />,
  LuArchive: <LuArchive />, LuHeart: <LuHeart />, LuMonitor: <LuMonitor />,
  LuTriangleAlert: <LuTriangleAlert />, LuThermometer: <LuThermometer />,
  LuLeaf: <LuLeaf />, LuFlame: <LuFlame />, LuGem: <LuGem />, LuFish: <LuFish />,
}

/** Vehicle type icon map (Lucide icon name → element) */
const VEHICLE_ICON_MAP: Record<string, React.ReactNode> = {
  LuTruck: <LuTruck />, LuCar: <LuCar />, LuBike: <LuBike />,
  LuPackage: <LuPackage />, LuSettings: <LuSettings />,
}

/** Shared hook — loads active vehicle types from the public config endpoint */
function useVehicleTypes() {
  const [vehicleTypes, setVehicleTypes] = useState<Array<{ id: number; name: string; icon: string | null; icon_url: string | null }>>([])
  useEffect(() => {
    configApi.getVehicleTypes()
      .then(r => setVehicleTypes(r.data.vehicle_types ?? []))
      .catch(() => { })
  }, [])
  return vehicleTypes
}

/** Renders a vehicle type icon (preset Lucide or custom image) */
function VehicleTypeIcon({ icon, iconUrl, size = 18, style }: { icon?: string | null; iconUrl?: string | null; size?: number; style?: React.CSSProperties }) {
  if (iconUrl) {
    const abs = iconUrl.startsWith('http') ? iconUrl : (_API_UPLOAD_BASE + iconUrl)
    return <img src={abs} alt="" style={{ width: size, height: size, borderRadius: 4, objectFit: 'cover', flexShrink: 0, ...style }} />
  }
  if (icon && VEHICLE_ICON_MAP[icon]) {
    return <span style={{ width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, ...style }}>{VEHICLE_ICON_MAP[icon]}</span>
  }
  return <span style={{ width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: 'var(--clr-muted)', ...style }}><LuTruck /></span>
}

/** Renders a <select> dropdown whose items come from the dynamic vehicle types */
function VehicleTypeSelect({ value, onChange, style }: { value: string; onChange: (v: string) => void; style?: React.CSSProperties }) {
  const types = useVehicleTypes()
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{ background: 'transparent', border: 'none', color: 'var(--clr-text)', fontFamily: 'inherit', fontSize: '0.9rem', width: '100%', outline: 'none', ...style }}
    >
      <option value="" style={{ background: '#0f172a' }}>— Select vehicle type —</option>
      {types.map(t => <option key={t.id} value={t.name} style={{ background: '#0f172a' }}>{t.name}</option>)}
    </select>
  )
}

/** Variant for modal/form styled select boxes */
function VehicleTypeSelectFull({ value, onChange, style }: { value: string; onChange: (v: string) => void; style?: React.CSSProperties }) {
  const types = useVehicleTypes()
  const inputStyle: React.CSSProperties = { width: '100%', padding: '0.6rem 0.8rem', borderRadius: 9, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)', color: 'var(--clr-text)', fontFamily: 'inherit', fontSize: '0.85rem', boxSizing: 'border-box', outline: 'none', ...style }
  return (
    <select value={value} onChange={e => onChange(e.target.value)} style={inputStyle}>
      <option value="" style={{ background: '#0f172a' }}>— Select vehicle type —</option>
      {types.map(t => <option key={t.id} value={t.name} style={{ background: '#0f172a' }}>{t.name}</option>)}
    </select>
  )
}

/** Renders a cargo type icon (preset Lucide or custom image) */
function CargoIcon({ icon, iconUrl, size = 20, style }: { icon?: string | null; iconUrl?: string | null; size?: number; style?: React.CSSProperties }) {
  if (iconUrl) {
    return <img src={iconUrl} alt="" style={{ width: size, height: size, borderRadius: 4, objectFit: 'cover', flexShrink: 0, ...style }} />
  }
  if (icon && CARGO_ICON_MAP[icon]) {
    return <span style={{ width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, ...style }}>{CARGO_ICON_MAP[icon]}</span>
  }
  return <span style={{ width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: 'var(--clr-muted)', ...style }}><LuBox /></span>
}

function Divider() {
  return <div style={{ height: 1, background: 'rgba(255,255,255,0.07)', margin: '0.25rem 0' }} />
}
function BtnSpinner({ text }: { text: string }) {
  return <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}><span className="spinner" />{text}</span>
}
function PasswordInput({ id, label, value, onChange, show, onToggle, hasError }: {
  id: string; label: string; value: string; onChange: (v: string) => void
  show: boolean; onToggle: () => void; hasError?: boolean
}) {
  return (
    <div className="input-wrap">
      <input id={id} type={show ? 'text' : 'password'} placeholder=" "
        value={value} onChange={e => onChange(e.target.value)} required
        className={hasError ? 'has-error' : ''} style={{ paddingRight: '2.8rem' }} />
      <label htmlFor={id}>{label}</label>
      <button type="button" className="input-suffix" onClick={onToggle}>{show ? <LuEyeOff size={16} /> : <LuEye size={16} />}</button>
    </div>
  )
}
function SectionRow({ title, sub, open, onToggle, toggleLabel, children }: {
  title: string; sub: string; open: boolean; onToggle: () => void; toggleLabel: string; children?: React.ReactNode
}) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: open ? '1rem' : 0 }}>
        <div>
          <p style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--clr-text)' }}>{title}</p>
          <p style={{ fontSize: '0.78rem', color: 'var(--clr-muted)', marginTop: '0.1rem' }}>{sub}</p>
        </div>
        <button className="btn-outline" style={{ fontSize: '0.78rem', padding: '0.4rem 0.9rem', flexShrink: 0, marginLeft: '0.75rem' }} onClick={onToggle}>
          {toggleLabel}
        </button>
      </div>
      {open && children}
    </div>
  )
}
function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
      <span style={{ width: 22, textAlign: 'center', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--clr-accent)' }}>{icon}</span>
      <span style={{ fontSize: '0.8rem', color: 'var(--clr-muted)', width: 68, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: '0.875rem', color: 'var(--clr-text)', fontWeight: 500, wordBreak: 'break-all' }}>{value}</span>
    </div>
  )
}

// ─── Admin types ──────────────────────────────────────────────────────────────

interface UserRow {
  id: string
  first_name: string
  last_name: string
  phone_number: string
  email: string | null
  role_name: string
  role_id: number
  is_active: number
  is_phone_verified: number
  is_email_verified: number
  is_driver_verified?: number  // only for drivers (role_id=3)
  created_at: string
  profile_photo_url: string | null
}
interface Stats {
  total_users: number; total_admins: number; total_shippers: number
  total_drivers: number; active_users: number; new_today: number
}
type AdminSection = 'overview' | 'drivers' | 'shippers' | 'staff' | 'verify-drivers' | 'vehicles' | 'orders' | 'live-drivers' | 'guest-orders' | 'cargo-types' | 'pricing-rules' | 'profile' | 'payments' | 'wallet-adjustment' | 'notif-settings' | 'settings' | 'vehicle-types' | 'countries' | 'maintenance-mode' | 'role-management' | 'security-events' | 'cross-border' | 'reports' | 'contact-info' | 'ai-settings' | 'car-owners'
type ProfileTab = 'profile' | 'security' | 'contact'

interface DriverRow {
  user_id: string
  first_name: string
  last_name: string
  phone_number: string
  email: string | null
  profile_photo_url: string | null
  national_id_url: string | null
  license_url: string | null
  libre_url: string | null
  national_id_status: string | null
  license_status: string | null
  libre_status: string | null
  rejection_reason: string | null
  is_verified: number
  status: string
  verified_at: string | null
  rating: number | null
  total_trips: number
}

interface DocReview {
  id: string
  document_type: 'national_id' | 'license' | 'libre'
  action: 'APPROVED' | 'REJECTED'
  reason: string | null
  reviewed_at: string
  reviewer_name?: string
}

interface VehicleRow {
  id: string
  driver_id: string | null
  plate_number: string
  vehicle_type: string
  max_capacity_kg: number
  is_company_owned: number
  vehicle_photo_url: string | null
  vehicle_images: string | null     // JSON array
  libre_url: string | null
  description: string | null
  is_active: number
  is_approved: number
  submitted_by_driver_id: string | null
  driver_submission_status: 'PENDING' | 'APPROVED' | 'REJECTED' | null
  created_at: string
  driver_first_name?: string
  driver_last_name?: string
  driver_phone?: string
  submitter_first_name?: string
  submitter_last_name?: string
}

// ─── Admin sub-components ─────────────────────────────────────────────────────

function UserAvatar({ u, size = 36 }: { u: UserRow; size?: number }) {
  const iconSize = Math.round(size * 0.45)
  const roleIcon = u.role_id === 1 ? <LuShield size={iconSize} /> : u.role_id === 2 ? <LuPackage size={iconSize} /> : u.role_id === 3 ? <LuTruck size={iconSize} /> : <LuUser size={iconSize} />
  return u.profile_photo_url ? (
    <img src={u.profile_photo_url} alt="" style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
  ) : (
    <div style={{ width: size, height: size, borderRadius: '50%', flexShrink: 0, background: 'linear-gradient(135deg,var(--clr-accent2),var(--clr-accent))', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
      {roleIcon}
    </div>
  )
}
function RoleBadge({ roleId, roleName }: { roleId: number; roleName: string }) {
  const cls: Record<number, string> = { 1: 'badge-cyan', 2: 'badge-purple', 3: 'badge-red', 4: 'badge-cyan', 5: 'badge-purple' }
  return <span className={`badge ${cls[roleId] ?? 'badge-cyan'}`}>{roleName}</span>
}
function VerifiedBadge() {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.2rem', background: 'rgba(74,222,128,0.12)', border: '1px solid rgba(74,222,128,0.3)', color: 'var(--kpi-green)', borderRadius: 99, padding: '0.15rem 0.5rem', fontSize: '0.65rem', fontWeight: 700 }}>
      <LuBadgeCheck size={10} /> Verified
    </span>
  )
}
function userIsVerified(u: UserRow): boolean {
  if (u.role_id === 3) return u.is_driver_verified === 1
  if (u.role_id === 2) return u.is_phone_verified === 1 && u.is_email_verified === 1
  return false
}
function CustomSelect({ value, onChange, options }: {
  value: number; onChange: (v: number) => void; options: { id: number; label: string }[]
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])
  const selected = options.find(o => o.id === value)
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button type="button" onClick={() => setOpen(v => !v)} style={{ width: '100%', padding: '0.6rem 0.8rem', borderRadius: 10, border: '1px solid rgba(255,255,255,0.18)', background: 'rgba(255,255,255,0.08)', color: 'var(--clr-text)', fontFamily: 'inherit', fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', textAlign: 'left', WebkitAppearance: 'none', appearance: 'none' }}>
        <span>{selected?.label ?? '—'}</span>
        <span style={{ color: 'var(--clr-muted)', fontSize: '0.7rem', marginLeft: '0.5rem' }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, background: '#080b16', border: '1px solid rgba(255,255,255,0.16)', borderRadius: 10, overflow: 'hidden', boxShadow: '0 8px 32px rgba(0,0,0,0.7)', zIndex: 9999 }}>
          {options.map(opt => (
            <button key={opt.id} type="button" onClick={() => { onChange(opt.id); setOpen(false) }}
              style={{ display: 'block', width: '100%', padding: '0.7rem 0.85rem', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.06)', WebkitAppearance: 'none', appearance: 'none', background: opt.id === value ? 'rgba(97, 148, 31,0.12)' : '#080b16', color: opt.id === value ? 'var(--kpi-cyan)' : '#cbd5e1', fontFamily: 'inherit', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', textAlign: 'left', transition: 'background 0.12s' }}
              onMouseEnter={e => { if (opt.id !== value) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.07)' }}
              onMouseLeave={e => { if (opt.id !== value) (e.currentTarget as HTMLButtonElement).style.background = '#080b16' }}
            >{opt.label}</button>
          ))}
        </div>
      )}
    </div>
  )
}

function LoadingSpinner() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', padding: '2.5rem', color: 'var(--clr-muted)', fontSize: '0.875rem' }}>
      <span className="spinner" /> Loading…
    </div>
  )
}

// ─── Admin Notification Settings (7.5) ───────────────────────────────────────

function AdminNotifSettings() {
  const { t: tr } = useLanguage()

  type SettingKey = 'push_order_updates' | 'push_driver_job_alerts' | 'push_admin_alerts' | 'email_order_updates' | 'email_payment_alerts' | 'email_admin_alerts'

  const SETTING_DEFS: Array<{ key: SettingKey; label: string; sub: string }> = [
    { key: 'push_order_updates', label: tr('ns_push_orders_label'), sub: tr('ns_push_orders_sub') },
    { key: 'push_driver_job_alerts', label: tr('ns_push_driver_label'), sub: tr('ns_push_driver_sub') },
    { key: 'push_admin_alerts', label: tr('ns_push_admin_label'), sub: tr('ns_push_admin_sub') },
    { key: 'email_order_updates', label: tr('ns_email_orders_label'), sub: tr('ns_email_orders_sub') },
    { key: 'email_payment_alerts', label: tr('ns_email_payment_label'), sub: tr('ns_email_payment_sub') },
    { key: 'email_admin_alerts', label: tr('ns_email_admin_label'), sub: tr('ns_email_admin_sub') },
  ]

  const [settings, setSettings] = useState<Record<SettingKey, boolean>>({
    push_order_updates: true, push_driver_job_alerts: true, push_admin_alerts: true,
    email_order_updates: true, email_payment_alerts: true, email_admin_alerts: true,
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    apiClient.get('/admin/notification-settings').then(r => {
      setSettings(s => ({ ...s, ...(r.data.settings ?? {}) }))
    }).catch(() => { }).finally(() => setLoading(false))
  }, [])

  const toggle = async (key: SettingKey) => {
    const next = !settings[key]
    setSettings(s => ({ ...s, [key]: next }))
    setSaving(true); setMsg('')
    try {
      await apiClient.put('/admin/notification-settings', { [key]: next })
      setMsg(tr('ns_saved'))
    } catch {
      // revert on failure
      setSettings(s => ({ ...s, [key]: !next }))
      setMsg(tr('ns_save_fail'))
    } finally { setSaving(false) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--clr-text)', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
          <LuBell size={17} /> {tr('ns_title')}
        </h2>
        {saving && <span style={{ fontSize: '0.72rem', color: 'var(--clr-muted)' }}>{tr('ns_saving')}</span>}
        {msg && !saving && <span style={{ fontSize: '0.72rem', color: msg === 'Saved.' ? 'var(--kpi-green)' : '#f87171' }}>{msg}</span>}
      </div>

      <p style={{ fontSize: '0.8rem', color: 'var(--clr-muted)', marginTop: '-0.75rem' }}>
        {tr('ns_subtitle')}
      </p>

      {loading ? (
        <div style={{ textAlign: 'center', color: 'var(--clr-muted)', padding: '2rem', fontSize: '0.85rem' }}>{tr('ns_loading')}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
          {/* Push group */}
          <p style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--clr-accent)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '0.1rem' }}>{tr('ns_group_push')}</p>
          {SETTING_DEFS.filter(d => d.key.startsWith('push_')).map(def => (
            <div key={def.key} className="glass-inner" style={{ padding: '0.9rem 1rem', display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--clr-text)', marginBottom: '0.2rem' }}>{def.label}</p>
                <p style={{ fontSize: '0.74rem', color: 'var(--clr-muted)', lineHeight: 1.5 }}>{def.sub}</p>
              </div>
              <button
                onClick={() => toggle(def.key)}
                disabled={saving}
                style={{
                  flexShrink: 0, width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
                  background: settings[def.key] ? 'var(--clr-accent)' : 'rgba(255,255,255,0.12)',
                  position: 'relative', transition: 'background 0.2s', outline: 'none',
                }}
                title={settings[def.key] ? tr('ns_toggle_enable') : tr('ns_toggle_disable')}
              >
                <span style={{
                  position: 'absolute', top: 3, left: settings[def.key] ? 22 : 3,
                  width: 18, height: 18, borderRadius: '50%',
                  background: settings[def.key] ? '#000' : 'rgba(255,255,255,0.5)',
                  transition: 'left 0.18s',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
                }} />
              </button>
            </div>
          ))}

          {/* Email group */}
          <p style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--clr-accent)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '0.1rem', marginTop: '0.4rem' }}>{tr('ns_group_email')}</p>
          {SETTING_DEFS.filter(d => d.key.startsWith('email_')).map(def => (
            <div key={def.key} className="glass-inner" style={{ padding: '0.9rem 1rem', display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--clr-text)', marginBottom: '0.2rem' }}>{def.label}</p>
                <p style={{ fontSize: '0.74rem', color: 'var(--clr-muted)', lineHeight: 1.5 }}>{def.sub}</p>
              </div>
              <button
                onClick={() => toggle(def.key)}
                disabled={saving}
                style={{
                  flexShrink: 0, width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
                  background: settings[def.key] ? 'var(--clr-accent)' : 'rgba(255,255,255,0.12)',
                  position: 'relative', transition: 'background 0.2s', outline: 'none',
                }}
                title={settings[def.key] ? 'Enabled — click to disable' : 'Disabled — click to enable'}
              >
                <span style={{
                  position: 'absolute', top: 3, left: settings[def.key] ? 22 : 3,
                  width: 18, height: 18, borderRadius: '50%',
                  background: settings[def.key] ? '#000' : 'rgba(255,255,255,0.5)',
                  transition: 'left 0.18s',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
                }} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Admin Vehicle Types Section (8.4) ────────────────────────────────────────

interface VehicleTypeRow {
  id: number; name: string; icon: string | null; icon_url: string | null
  max_capacity_kg: number | null; is_active: number; sort_order: number
}

const VT_PRESET_ICONS = [
  { name: 'LuTruck', label: 'Truck', icon: <LuTruck size={16} /> },
  { name: 'LuCar', label: 'Car/Van', icon: <LuCar size={16} /> },
  { name: 'LuBike', label: 'Bike', icon: <LuBike size={16} /> },
  { name: 'LuPackage', label: 'Package', icon: <LuPackage size={16} /> },
  { name: 'LuSettings', label: 'Other', icon: <LuSettings size={16} /> },
]

function AdminVehicleTypesSection() {
  const { t: tr } = useLanguage()
  const [items, setItems] = useState<VehicleTypeRow[]>([])
  const [loading, setLoading] = useState(false)
  const [modal, setModal] = useState<'create' | 'edit' | null>(null)
  const [editTarget, setEditTarget] = useState<VehicleTypeRow | null>(null)
  const [form, setForm] = useState({ name: '', max_capacity_kg: '', icon: 'LuTruck', icon_url: '', is_active: true, sort_order: '0' })
  const [iconMode, setIconMode] = useState<'preset' | 'custom'>('preset')
  const [formErr, setFormErr] = useState('')
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState('')
  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3000) }

  const inputStyle: React.CSSProperties = { width: '100%', padding: '0.6rem 0.8rem', borderRadius: 9, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)', color: 'var(--clr-text)', fontFamily: 'inherit', fontSize: '0.85rem', boxSizing: 'border-box' }
  const labelStyle: React.CSSProperties = { fontSize: '0.73rem', fontWeight: 600, color: 'var(--clr-muted)', marginBottom: '0.3rem', display: 'block' }

  const load = async () => {
    setLoading(true)
    try { const { data } = await adminOrderApi.listVehicleTypes(); setItems(data.vehicle_types ?? []) }
    catch { showToast(tr('vt_load_fail')) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, []) // eslint-disable-line

  const resetForm = () => { setForm({ name: '', max_capacity_kg: '', icon: 'LuTruck', icon_url: '', is_active: true, sort_order: '0' }); setIconMode('preset'); setFormErr('') }

  const openCreate = () => { resetForm(); setEditTarget(null); setModal('create') }
  const openEdit = (v: VehicleTypeRow) => {
    setForm({ name: v.name, max_capacity_kg: v.max_capacity_kg != null ? String(v.max_capacity_kg) : '', icon: v.icon ?? 'LuTruck', icon_url: v.icon_url ? getUploadUrl(v.icon_url) ?? '' : '', is_active: !!v.is_active, sort_order: String(v.sort_order) })
    setIconMode(v.icon_url ? 'custom' : 'preset')
    setEditTarget(v); setFormErr(''); setModal('edit')
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) { setFormErr(tr('vt_err_name')); return }
    setFormErr(''); setSaving(true)
    try {
      const payload: Record<string, unknown> = {
        name: form.name.trim(),
        max_capacity_kg: form.max_capacity_kg ? parseFloat(form.max_capacity_kg) : undefined,
        sort_order: parseInt(form.sort_order) || 0,
        is_active: form.is_active,
      }
      if (iconMode === 'preset') { payload.icon = form.icon; payload.icon_url = null }
      else if (form.icon_url?.startsWith('data:')) { payload.icon_data = form.icon_url; payload.icon = null }

      if (modal === 'create') {
        await apiClient.post('/admin/vehicle-types', payload)
        showToast(tr('vt_created'))
      } else if (editTarget) {
        await apiClient.put(`/admin/vehicle-types/${editTarget.id}`, payload)
        showToast('Updated.')
      }
      setModal(null); load()
    } catch (err: any) { setFormErr(err.response?.data?.message ?? tr('vt_err_fail')) }
    finally { setSaving(false) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--clr-text)', display: 'flex', alignItems: 'center', gap: '0.45rem' }}><LuTruck size={17} /> {tr('vt_title')}</h2>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={load} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.3rem 0.7rem', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: 'var(--clr-muted)', fontFamily: 'inherit', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer' }}><LuRefreshCw size={12} /></button>
          <button onClick={openCreate} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.38rem 0.85rem', borderRadius: 8, border: 'none', background: 'var(--clr-accent)', color: '#000', fontFamily: 'inherit', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}><LuPlus size={14} /> Add</button>
        </div>
      </div>
      <p style={{ fontSize: '0.78rem', color: 'var(--clr-muted)', marginTop: '-0.75rem' }}>
        {tr('vt_subtitle')}
      </p>
      {loading ? <LoadingSpinner /> : (
        <div className="glass-inner" style={{ overflow: 'hidden' }}>
          {items.length === 0 ? <p style={{ padding: '2rem', textAlign: 'center', color: 'var(--clr-muted)' }}>{tr('vt_empty')}</p>
            : items.map((v, i) => (
              <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem', borderBottom: i < items.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(97, 148, 31,0.08)', border: '1px solid rgba(97, 148, 31,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: 'var(--clr-accent)' }}>
                  <VehicleTypeIcon icon={v.icon} iconUrl={v.icon_url} size={18} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--clr-text)' }}>{v.name}</span>
                    {!v.is_active && <span className="badge badge-red" style={{ fontSize: '0.65rem' }}>{tr('vt_badge_inactive')}</span>}
                  </div>
                  {v.max_capacity_kg && <p style={{ fontSize: '0.73rem', color: 'var(--clr-muted)', marginTop: '0.1rem' }}>Max {v.max_capacity_kg} kg</p>}
                </div>
                <button onClick={() => openEdit(v)} style={{ padding: '0.28rem 0.55rem', borderRadius: 7, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)', color: 'var(--clr-muted)', fontFamily: 'inherit', fontSize: '0.7rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem' }}><LuPencil size={11} /> {tr('vt_btn_edit')}</button>
              </div>
            ))}
        </div>
      )}

      {(modal === 'create' || modal === 'edit') && (
        <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) { setModal(null); resetForm() } }}>
          <div className="glass modal-box" style={{ padding: '1.75rem', maxWidth: 420 }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--clr-text)', marginBottom: '1rem' }}>{modal === 'create' ? tr('vt_modal_create') : tr('vt_modal_edit')}</h2>
            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {formErr && <div className="alert alert-error"><LuTriangleAlert size={13} /> {formErr}</div>}
              <div><label style={labelStyle}>{tr('vt_label_name')}</label><input style={inputStyle} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required placeholder="e.g. Mini Truck" /></div>
              <div><label style={labelStyle}>{tr('vt_label_capacity')}</label><input style={inputStyle} type="number" min="0" step="1" value={form.max_capacity_kg} onChange={e => setForm(f => ({ ...f, max_capacity_kg: e.target.value }))} placeholder="Optional" /></div>
              <div><label style={labelStyle}>{tr('vt_label_sort')}</label><input style={inputStyle} type="number" min="0" step="1" value={form.sort_order} onChange={e => setForm(f => ({ ...f, sort_order: e.target.value }))} /></div>

              {/* Icon picker */}
              <div>
                <label style={labelStyle}>{tr('vt_label_icon')}</label>
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.6rem' }}>
                  <button type="button" onClick={() => setIconMode('preset')} style={{ flex: 1, padding: '0.4rem', borderRadius: 7, border: `1px solid ${iconMode === 'preset' ? 'var(--clr-accent)' : 'rgba(255,255,255,0.1)'}`, background: iconMode === 'preset' ? 'rgba(97, 148, 31,0.1)' : 'rgba(255,255,255,0.04)', color: iconMode === 'preset' ? 'var(--clr-accent)' : 'var(--clr-muted)', fontFamily: 'inherit', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}>{tr('vt_icon_preset')}</button>
                  <button type="button" onClick={() => setIconMode('custom')} style={{ flex: 1, padding: '0.4rem', borderRadius: 7, border: `1px solid ${iconMode === 'custom' ? 'var(--clr-accent)' : 'rgba(255,255,255,0.1)'}`, background: iconMode === 'custom' ? 'rgba(97, 148, 31,0.1)' : 'rgba(255,255,255,0.04)', color: iconMode === 'custom' ? 'var(--clr-accent)' : 'var(--clr-muted)', fontFamily: 'inherit', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}><LuImage size={12} /> {tr('vt_icon_custom')}</button>
                </div>
                {iconMode === 'preset' ? (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: '0.4rem' }}>
                    {VT_PRESET_ICONS.map(p => (
                      <button key={p.name} type="button" onClick={() => setForm(f => ({ ...f, icon: p.name }))}
                        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.2rem', padding: '0.5rem 0.25rem', borderRadius: 8, border: `1px solid ${form.icon === p.name ? 'var(--clr-accent)' : 'rgba(255,255,255,0.08)'}`, background: form.icon === p.name ? 'rgba(97, 148, 31,0.12)' : 'rgba(255,255,255,0.03)', color: form.icon === p.name ? 'var(--clr-accent)' : 'var(--clr-muted)', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.6rem', fontWeight: 600 }}>
                        {p.icon}
                        <span style={{ lineHeight: 1.1, textAlign: 'center' }}>{p.label}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div>
                    {form.icon_url && !form.icon_url.startsWith('data:') && <img src={form.icon_url} alt="preview" style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'cover', border: '1px solid rgba(255,255,255,0.1)', marginBottom: '0.4rem' }} />}
                    {form.icon_url?.startsWith('data:') && <img src={form.icon_url} alt="preview" style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'cover', border: '1px solid rgba(255,255,255,0.1)', marginBottom: '0.4rem' }} />}
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.75rem', borderRadius: 8, border: '1px dashed rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.03)', color: 'var(--clr-muted)', cursor: 'pointer', fontSize: '0.78rem' }}>
                      <LuImage size={14} /> {form.icon_url ? tr('vt_icon_change') : tr('vt_icon_upload')}
                      <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => {
                        const file = e.target.files?.[0]; if (!file) return
                        const reader = new FileReader()
                        reader.onload = ev => setForm(f => ({ ...f, icon_url: ev.target?.result as string }))
                        reader.readAsDataURL(file)
                      }} />
                    </label>
                  </div>
                )}
              </div>

              {modal === 'edit' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                  <button type="button" onClick={() => setForm(f => ({ ...f, is_active: !f.is_active }))}
                    style={{ width: 38, height: 22, borderRadius: 99, border: 'none', cursor: 'pointer', background: form.is_active ? 'var(--clr-accent)' : 'rgba(255,255,255,0.12)', transition: 'background 0.2s', flexShrink: 0, position: 'relative' }}>
                    <span style={{ position: 'absolute', top: 2, left: form.is_active ? 18 : 2, width: 18, height: 18, borderRadius: '50%', background: form.is_active ? '#080b14' : 'var(--clr-muted)', transition: 'left 0.2s' }} />
                  </button>
                  <span style={{ fontSize: '0.85rem', color: 'var(--clr-text)' }}>{tr('vt_toggle_active')}</span>
                </div>
              )}
              <div style={{ display: 'flex', gap: '0.6rem', marginTop: '0.25rem' }}>
                <button type="button" className="btn-outline" style={{ flex: 1 }} onClick={() => { setModal(null); resetForm() }}>{tr('vt_btn_cancel')}</button>
                <button type="submit" className="btn-primary" style={{ flex: 2 }} disabled={saving}>{saving ? <BtnSpinner text={tr('vt_saving')} /> : modal === 'create' ? tr('vt_btn_create') : tr('vt_btn_save')}</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {toast && <div style={{ position: 'fixed', bottom: '1.25rem', right: '1.25rem', zIndex: 200, background: 'rgba(97, 148, 31,0.12)', border: '1px solid rgba(97, 148, 31,0.25)', color: 'var(--clr-text)', padding: '0.65rem 1.1rem', borderRadius: 12, fontSize: '0.85rem', fontWeight: 600, backdropFilter: 'blur(12px)' }}>{toast}</div>}
    </div>
  )
}

// ─── Admin Countries Section (8.1) ────────────────────────────────────────────

interface CountryRow { id: number; name: string; iso_code: string; is_active: number }

function AdminCountriesSection() {
  const { t: tr } = useLanguage()
  const [items, setItems] = useState<CountryRow[]>([])
  const [loading, setLoading] = useState(false)
  const [modal, setModal] = useState<'create' | 'edit' | null>(null)
  const [editTarget, setEditTarget] = useState<CountryRow | null>(null)
  const [form, setForm] = useState({ name: '', iso_code: '', is_active: true })
  const [formErr, setFormErr] = useState('')
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState('')
  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3000) }

  const inputStyle: React.CSSProperties = { width: '100%', padding: '0.6rem 0.8rem', borderRadius: 9, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)', color: 'var(--clr-text)', fontFamily: 'inherit', fontSize: '0.85rem', boxSizing: 'border-box' }
  const labelStyle: React.CSSProperties = { fontSize: '0.73rem', fontWeight: 600, color: 'var(--clr-muted)', marginBottom: '0.3rem', display: 'block' }

  const load = async () => {
    setLoading(true)
    try { const { data } = await apiClient.get('/admin/countries'); setItems(data.countries ?? []) }
    catch { showToast(tr('co_load_fail')) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, []) // eslint-disable-line

  const openCreate = () => { setForm({ name: '', iso_code: '', is_active: true }); setEditTarget(null); setFormErr(''); setModal('create') }
  const openEdit = (c: CountryRow) => { setForm({ name: c.name, iso_code: c.iso_code, is_active: !!c.is_active }); setEditTarget(c); setFormErr(''); setModal('edit') }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) { setFormErr(tr('co_err_name')); return }
    if (form.iso_code.trim().length !== 2) { setFormErr(tr('co_err_iso')); return }
    setFormErr(''); setSaving(true)
    try {
      const payload = { name: form.name.trim(), iso_code: form.iso_code.trim().toLowerCase(), is_active: form.is_active }
      if (modal === 'create') { await apiClient.post('/admin/countries', payload); showToast(tr('co_added')) }
      else if (editTarget) { await apiClient.put(`/admin/countries/${editTarget.id}`, payload); showToast(tr('co_updated')) }
      setModal(null); load()
    } catch (err: any) { setFormErr(err.response?.data?.message ?? tr('co_err_fail')) }
    finally { setSaving(false) }
  }

  const active = items.filter(c => c.is_active)
  const inactive = items.filter(c => !c.is_active)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--clr-text)', display: 'flex', alignItems: 'center', gap: '0.45rem' }}><LuGlobe size={17} /> {tr('co_title')}</h2>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={load} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.3rem 0.7rem', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: 'var(--clr-muted)', fontFamily: 'inherit', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer' }}><LuRefreshCw size={12} /></button>
          <button onClick={openCreate} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.38rem 0.85rem', borderRadius: 8, border: 'none', background: 'var(--clr-accent)', color: '#000', fontFamily: 'inherit', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}><LuPlus size={14} /> {tr('co_btn_add')}</button>
        </div>
      </div>
      <p style={{ fontSize: '0.78rem', color: 'var(--clr-muted)', marginTop: '-0.75rem' }}>
        {tr('co_subtitle')}
      </p>

      {loading ? <LoadingSpinner /> : (
        <>
          {active.length > 0 && (
            <>
              <p style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--kpi-green)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{tr('co_active_header')} — {active.length} {active.length === 1 ? tr('co_country') : tr('co_countries')}</p>
              <div className="glass-inner" style={{ overflow: 'hidden' }}>
                {active.map((c, i) => (
                  <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem', borderBottom: i < active.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                    <div style={{ width: 34, height: 34, borderRadius: 8, background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: 'var(--kpi-green)', fontWeight: 800, fontSize: '0.75rem' }}>{c.iso_code.toUpperCase()}</div>
                    <div style={{ flex: 1 }}>
                      <span style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--clr-text)' }}>{c.name}</span>
                      <span className="badge badge-cyan" style={{ fontSize: '0.62rem', marginLeft: '0.4rem' }}>{tr('co_badge_active')}</span>
                    </div>
                    <button onClick={() => openEdit(c)} style={{ padding: '0.28rem 0.55rem', borderRadius: 7, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)', color: 'var(--clr-muted)', fontFamily: 'inherit', fontSize: '0.7rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem' }}><LuPencil size={11} /> {tr('co_btn_edit')}</button>
                  </div>
                ))}
              </div>
            </>
          )}
          {inactive.length > 0 && (
            <>
              <p style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--clr-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{tr('co_inactive_header')} — {inactive.length}</p>
              <div className="glass-inner" style={{ overflow: 'hidden' }}>
                {inactive.map((c, i) => (
                  <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem', borderBottom: i < inactive.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                    <div style={{ width: 34, height: 34, borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: 'var(--clr-muted)', fontWeight: 800, fontSize: '0.75rem' }}>{c.iso_code.toUpperCase()}</div>
                    <div style={{ flex: 1 }}>
                      <span style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--clr-muted)' }}>{c.name}</span>
                      <span className="badge badge-red" style={{ fontSize: '0.62rem', marginLeft: '0.4rem' }}>{tr('co_badge_inactive')}</span>
                    </div>
                    <button onClick={() => openEdit(c)} style={{ padding: '0.28rem 0.55rem', borderRadius: 7, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)', color: 'var(--clr-muted)', fontFamily: 'inherit', fontSize: '0.7rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem' }}><LuPencil size={11} /> {tr('co_btn_edit')}</button>
                  </div>
                ))}
              </div>
            </>
          )}
          {items.length === 0 && <p style={{ padding: '2rem', textAlign: 'center', color: 'var(--clr-muted)' }}>{tr('co_empty')}</p>}
        </>
      )}

      {(modal === 'create' || modal === 'edit') && (
        <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) setModal(null) }}>
          <div className="glass modal-box" style={{ padding: '1.75rem', maxWidth: 380 }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--clr-text)', marginBottom: '1rem' }}>{modal === 'create' ? tr('co_modal_create') : tr('co_modal_edit')}</h2>
            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {formErr && <div className="alert alert-error"><LuTriangleAlert size={13} /> {formErr}</div>}
              <div><label style={labelStyle}>{tr('co_label_name')}</label><input style={inputStyle} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required placeholder="e.g. Kenya" /></div>
              <div><label style={labelStyle}>{tr('co_label_iso')}</label><input style={{ ...inputStyle, textTransform: 'lowercase' }} value={form.iso_code} onChange={e => setForm(f => ({ ...f, iso_code: e.target.value.slice(0, 2) }))} required maxLength={2} placeholder="e.g. ke" /></div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                <button type="button" onClick={() => setForm(f => ({ ...f, is_active: !f.is_active }))}
                  style={{ width: 38, height: 22, borderRadius: 99, border: 'none', cursor: 'pointer', background: form.is_active ? 'var(--clr-accent)' : 'rgba(255,255,255,0.12)', transition: 'background 0.2s', flexShrink: 0, position: 'relative' }}>
                  <span style={{ position: 'absolute', top: 2, left: form.is_active ? 18 : 2, width: 18, height: 18, borderRadius: '50%', background: form.is_active ? '#080b14' : 'var(--clr-muted)', transition: 'left 0.2s' }} />
                </button>
                <span style={{ fontSize: '0.85rem', color: 'var(--clr-text)' }}>{tr('co_toggle_active')}</span>
              </div>
              <div style={{ display: 'flex', gap: '0.6rem', marginTop: '0.25rem' }}>
                <button type="button" className="btn-outline" style={{ flex: 1 }} onClick={() => setModal(null)}>{tr('co_btn_cancel')}</button>
                <button type="submit" className="btn-primary" style={{ flex: 2 }} disabled={saving}>{saving ? <BtnSpinner text={tr('co_saving')} /> : modal === 'create' ? tr('co_btn_add') : tr('co_btn_save')}</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {toast && <div style={{ position: 'fixed', bottom: '1.25rem', right: '1.25rem', zIndex: 200, background: 'rgba(97, 148, 31,0.12)', border: '1px solid rgba(97, 148, 31,0.25)', color: 'var(--clr-text)', padding: '0.65rem 1.1rem', borderRadius: 12, fontSize: '0.85rem', fontWeight: 600, backdropFilter: 'blur(12px)' }}>{toast}</div>}
    </div>
  )
}

// ─── Admin Maintenance Mode Section (8.3) ─────────────────────────────────────

function AdminMaintenanceSection() {
  const { t: tr } = useLanguage()
  const [config, setConfig] = useState({ maintenance_mode: false, maintenance_message: '', app_version: '' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState('')
  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3000) }

  useEffect(() => {
    apiClient.get('/admin/system-config').then(r => {
      const c = r.data.config ?? {}
      setConfig({ maintenance_mode: !!c.maintenance_mode, maintenance_message: c.maintenance_message ?? '', app_version: c.app_version ?? '' })
    }).catch(() => { }).finally(() => setLoading(false))
  }, [])

  const save = async () => {
    setSaving(true)
    try {
      await apiClient.put('/admin/system-config', config)
      showToast(tr('mn_saved'))
    } catch { showToast(tr('mn_save_fail')) }
    finally { setSaving(false) }
  }

  const inputStyle: React.CSSProperties = { width: '100%', padding: '0.6rem 0.8rem', borderRadius: 9, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)', color: 'var(--clr-text)', fontFamily: 'inherit', fontSize: '0.85rem', boxSizing: 'border-box' }
  const labelStyle: React.CSSProperties = { fontSize: '0.73rem', fontWeight: 600, color: 'var(--clr-muted)', marginBottom: '0.3rem', display: 'block' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <h2 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--clr-text)', display: 'flex', alignItems: 'center', gap: '0.45rem' }}><LuWrench size={17} /> {tr('mn_title')}</h2>

      {loading ? <LoadingSpinner /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Maintenance kill-switch */}
          <div className="glass-inner" style={{ padding: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{ flex: 1 }}>
                <p style={{ fontWeight: 700, fontSize: '0.9rem', color: config.maintenance_mode ? 'var(--kpi-orange)' : 'var(--clr-text)' }}>
                  {config.maintenance_mode ? tr('mn_mode_on') : tr('mn_mode_off')}
                </p>
                <p style={{ fontSize: '0.75rem', color: 'var(--clr-muted)', marginTop: '0.2rem' }}>
                  {tr('mn_mode_sub')}
                </p>
              </div>
              <button onClick={() => setConfig(c => ({ ...c, maintenance_mode: !c.maintenance_mode }))}
                style={{ flexShrink: 0, width: 48, height: 26, borderRadius: 13, border: 'none', cursor: 'pointer', background: config.maintenance_mode ? 'var(--kpi-orange)' : 'rgba(255,255,255,0.12)', position: 'relative', transition: 'background 0.2s' }}>
                <span style={{ position: 'absolute', top: 4, left: config.maintenance_mode ? 24 : 4, width: 18, height: 18, borderRadius: '50%', background: config.maintenance_mode ? '#000' : 'rgba(255,255,255,0.5)', transition: 'left 0.18s', boxShadow: '0 1px 3px rgba(0,0,0,0.4)' }} />
              </button>
            </div>
          </div>

          <div><label style={labelStyle}>{tr('mn_label_message')}</label>
            <textarea style={{ ...inputStyle, minHeight: 72, resize: 'vertical' }} value={config.maintenance_message}
              onChange={e => setConfig(c => ({ ...c, maintenance_message: e.target.value }))}
              placeholder={tr('mn_placeholder_msg')} />
          </div>

          <div><label style={labelStyle}>{tr('mn_label_version')}</label>
            <input style={inputStyle} value={config.app_version}
              onChange={e => setConfig(c => ({ ...c, app_version: e.target.value }))}
              placeholder={tr('mn_placeholder_ver')} />
          </div>

          <button onClick={save} disabled={saving} className="btn-primary" style={{ alignSelf: 'flex-start', padding: '0.55rem 1.4rem' }}>
            {saving ? <BtnSpinner text={tr('mn_saving')} /> : tr('mn_btn_save')}
          </button>
        </div>
      )}
      {toast && <div style={{ position: 'fixed', bottom: '1.25rem', right: '1.25rem', zIndex: 200, background: 'rgba(97, 148, 31,0.12)', border: '1px solid rgba(97, 148, 31,0.25)', color: 'var(--clr-text)', padding: '0.65rem 1.1rem', borderRadius: 12, fontSize: '0.85rem', fontWeight: 600, backdropFilter: 'blur(12px)' }}>{toast}</div>}
    </div>
  )
}

// ─── Admin Role Management Section (9.4) ────────────────────────────────────

function AdminRoleManagementSection({ onPermissionsSaved }: { onPermissionsSaved?: () => void }) {
  const { t: tr } = useLanguage()
  const { user } = useAuth()
  const isSuperAdmin = user?.role_id === 1
  const [roles, setRoles] = useState<Array<{ id: number; role_name: string; description: string | null }>>([])
  const [permissions, setPermissions] = useState<Array<{ permission_key: string; label: string; description: string | null }>>([])
  const [matrix, setMatrix] = useState<Record<number, Record<string, boolean>>>({})
  const [loading, setLoading] = useState(true)
  const [savingRole, setSavingRole] = useState<number | null>(null)
  const [deletingRole, setDeletingRole] = useState<number | null>(null)
  const [toast, setToast] = useState('')
  // Create role form
  const [showCreate, setShowCreate] = useState(false)
  const [newRoleName, setNewRoleName] = useState('')
  const [newRoleDesc, setNewRoleDesc] = useState('')
  const [creating, setCreating] = useState(false)
  const [createErr, setCreateErr] = useState('')

  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3500) }

  const load = async () => {
    setLoading(true)
    try {
      const { data } = await adminOrderApi.getRoleManagement()
      setRoles(data.roles ?? [])
      setPermissions(data.permissions ?? [])
      setMatrix(data.matrix ?? {})
    } catch {
      showToast(tr('rm_toast_load_fail'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, []) // eslint-disable-line

  const toggle = (roleId: number, key: string) => {
    if (roleId === 1) return
    setMatrix(prev => ({
      ...prev,
      [roleId]: {
        ...(prev[roleId] ?? {}),
        [key]: !(prev[roleId]?.[key] ?? false),
      },
    }))
  }

  const saveRole = async (roleId: number) => {
    if (roleId === 1) return
    setSavingRole(roleId)
    try {
      const selected = permissions
        .filter(p => matrix[roleId]?.[p.permission_key])
        .map(p => p.permission_key)
      await adminOrderApi.updateRolePermissions(roleId, selected)
      showToast(tr('rm_toast_saved'))
      await load()
      onPermissionsSaved?.()
    } catch {
      showToast(tr('rm_toast_save_fail'))
    } finally {
      setSavingRole(null)
    }
  }

  const handleCreateRole = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newRoleName.trim()) { setCreateErr(tr('rm_err_name')); return }
    setCreateErr(''); setCreating(true)
    try {
      await adminOrderApi.createRole({ role_name: newRoleName.trim(), description: newRoleDesc.trim() || undefined })
      setNewRoleName(''); setNewRoleDesc(''); setShowCreate(false)
      showToast(tr('rm_toast_created'))
      await load()
    } catch (err: any) {
      setCreateErr(err.response?.data?.message ?? tr('rm_err_create_fail'))
    } finally {
      setCreating(false)
    }
  }

  const handleDeleteRole = async (roleId: number, roleName: string) => {
    if (!window.confirm(tr('rm_confirm_delete').replace('{name}', roleName))) return
    setDeletingRole(roleId)
    try {
      await adminOrderApi.deleteRole(roleId)
      showToast(tr('rm_toast_deleted'))
      await load()
    } catch (err: any) {
      showToast(err.response?.data?.message ?? tr('rm_toast_save_fail'))
    } finally {
      setDeletingRole(null)
    }
  }

  const inputStyle: React.CSSProperties = { width: '100%', padding: '0.6rem 0.8rem', borderRadius: 10, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)', color: 'var(--clr-text)', fontFamily: 'inherit', fontSize: '0.85rem', boxSizing: 'border-box' }
  const labelStyle: React.CSSProperties = { fontSize: '0.75rem', fontWeight: 600, color: 'var(--clr-muted)', marginBottom: '0.35rem', display: 'block' }

  if (loading) return <LoadingSpinner />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--clr-text)', display: 'flex', alignItems: 'center', gap: '0.45rem', flex: 1 }}><LuKey size={17} /> {tr('rm_title')}</h2>
        {isSuperAdmin && (
          <button onClick={() => { setCreateErr(''); setShowCreate(true) }} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.42rem 0.9rem', borderRadius: 9, border: 'none', background: 'var(--clr-accent)', color: '#000', fontFamily: 'inherit', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer' }}>
            <LuPlus size={14} /> {tr('rm_btn_new')}
          </button>
        )}
      </div>
      <p style={{ fontSize: '0.78rem', color: 'var(--clr-muted)', marginTop: '-0.6rem' }}>{tr('rm_subtitle')}</p>

      {roles.map(role => (
        <div key={role.id} className="glass-inner" style={{ padding: '0.9rem 1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.65rem', gap: '0.5rem', flexWrap: 'wrap' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <p style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--clr-text)' }}>{role.role_name}</p>
                {role.id > 5 && <span className="badge" style={{ fontSize: '0.62rem', padding: '0.1rem 0.45rem', borderRadius: 6, background: 'rgba(168,85,247,0.15)', color: '#c084fc', border: '1px solid rgba(168,85,247,0.3)' }}>{tr('rm_badge_custom')}</span>}
              </div>
              {role.description && <p style={{ fontSize: '0.72rem', color: 'var(--clr-muted)' }}>{role.description}</p>}
            </div>
            <div style={{ display: 'flex', gap: '0.45rem', alignItems: 'center' }}>
              {role.id !== 1 && isSuperAdmin && (
                <button onClick={() => saveRole(role.id)} disabled={savingRole === role.id}
                  style={{ padding: '0.38rem 0.8rem', borderRadius: 8, border: 'none', background: 'var(--clr-accent)', color: '#000', fontFamily: 'inherit', fontSize: '0.76rem', fontWeight: 700, cursor: 'pointer' }}>
                  {savingRole === role.id ? tr('rm_saving') : tr('rm_btn_save')}
                </button>
              )}
              {role.id > 5 && isSuperAdmin && (
                <button onClick={() => handleDeleteRole(role.id, role.role_name)} disabled={deletingRole === role.id}
                  style={{ padding: '0.38rem 0.7rem', borderRadius: 8, border: '1px solid rgba(239,68,68,0.35)', background: 'rgba(239,68,68,0.08)', color: '#fca5a5', fontFamily: 'inherit', fontSize: '0.76rem', fontWeight: 700, cursor: 'pointer' }}>
                  {deletingRole === role.id ? tr('rm_deleting') : tr('rm_btn_delete')}
                </button>
              )}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: '0.45rem' }}>
            {permissions.map(p => {
              const on = !!matrix[role.id]?.[p.permission_key]
              return (
                <button key={`${role.id}-${p.permission_key}`} type="button" onClick={() => toggle(role.id, p.permission_key)} disabled={role.id === 1 || !isSuperAdmin}
                  style={{ padding: '0.55rem 0.65rem', borderRadius: 9, border: `1px solid ${on ? 'rgba(97, 148, 31,0.35)' : 'rgba(255,255,255,0.1)'}`, background: on ? 'rgba(97, 148, 31,0.1)' : 'rgba(255,255,255,0.03)', color: on ? 'var(--clr-accent)' : 'var(--clr-muted)', fontFamily: 'inherit', fontSize: '0.74rem', textAlign: 'left', cursor: (role.id === 1 || !isSuperAdmin) ? 'not-allowed' : 'pointer', opacity: (role.id === 1 || !isSuperAdmin) ? 0.7 : 1 }}>
                  <p style={{ fontWeight: 700, marginBottom: '0.1rem' }}>{p.label}</p>
                  {p.description && <p style={{ fontSize: '0.68rem', lineHeight: 1.45 }}>{p.description}</p>}
                </button>
              )
            })}
          </div>
        </div>
      ))}

      {/* Create Role Modal */}
      {showCreate && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }} onClick={() => setShowCreate(false)}>
          <div className="glass" style={{ borderRadius: 18, padding: '1.5rem', maxWidth: 420, width: '100%', position: 'relative', boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }} onClick={e => e.stopPropagation()}>
            <button onClick={() => setShowCreate(false)} style={{ position: 'absolute', top: '0.85rem', right: '0.85rem', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--clr-muted)' }}><LuX size={18} /></button>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1.25rem' }}>
              <LuKey size={20} color="var(--clr-accent)" />
              <h3 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--clr-text)' }}>{tr('rm_modal_title')}</h3>
            </div>
            <form onSubmit={handleCreateRole} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div>
                <label style={labelStyle}>{tr('rm_label_name')}</label>
                <input style={inputStyle} placeholder="e.g. Finance Manager" value={newRoleName} onChange={e => setNewRoleName(e.target.value)} required />
              </div>
              <div>
                <label style={labelStyle}>{tr('rm_label_desc')}</label>
                <input style={inputStyle} placeholder="Brief description of this role" value={newRoleDesc} onChange={e => setNewRoleDesc(e.target.value)} />
              </div>
              <p style={{ fontSize: '0.76rem', color: 'var(--clr-muted)' }}>{tr('rm_hint')}</p>
              {createErr && <p style={{ color: '#fca5a5', fontSize: '0.8rem', margin: 0 }}>{createErr}</p>}
              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.25rem' }}>
                <button type="button" onClick={() => setShowCreate(false)} style={{ flex: 1, padding: '0.6rem', borderRadius: 10, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)', color: 'var(--clr-muted)', fontFamily: 'inherit', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}>{tr('rm_btn_cancel')}</button>
                <button type="submit" disabled={creating} style={{ flex: 2, padding: '0.6rem', borderRadius: 10, border: 'none', background: 'var(--clr-accent)', color: '#000', fontFamily: 'inherit', fontSize: '0.85rem', fontWeight: 700, cursor: creating ? 'not-allowed' : 'pointer', opacity: creating ? 0.6 : 1 }}>
                  {creating ? tr('rm_creating') : tr('rm_btn_create')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {toast && <div style={{ position: 'fixed', bottom: '1.25rem', right: '1.25rem', zIndex: 200, background: 'rgba(97, 148, 31,0.12)', border: '1px solid rgba(97, 148, 31,0.25)', color: 'var(--clr-text)', padding: '0.65rem 1.1rem', borderRadius: 12, fontSize: '0.85rem', fontWeight: 600, backdropFilter: 'blur(12px)' }}>{toast}</div>}
    </div>
  )
}

// ─── Cross-Border & Customs Section ──────────────────────────────────────────

const CB_STATUS_COLOR: Record<string, string> = {
  AT_BORDER: '#f59e0b',
  IN_CUSTOMS: '#ef4444',
  CUSTOMS_CLEARED: '#10b981',
  IN_TRANSIT: '#60a5fa',
  DELIVERED: '#a3e635',
}

const CB_STATUS_LABEL: Record<string, string> = {
  AT_BORDER: 'At Border',
  IN_CUSTOMS: 'In Customs',
  CUSTOMS_CLEARED: 'Customs Cleared',
  IN_TRANSIT: 'In Transit',
  DELIVERED: 'Delivered',
}

const DOC_TYPE_OPTIONS = [
  { value: 'COMMERCIAL_INVOICE', label: 'Commercial Invoice' },
  { value: 'BILL_OF_LADING', label: 'Bill of Lading' },
  { value: 'PACKING_LIST', label: 'Packing List' },
  { value: 'CERTIFICATE_OF_ORIGIN', label: 'Certificate of Origin' },
  { value: 'CHECKPOINT_PHOTO', label: 'Checkpoint Photo' },
  { value: 'OTHER', label: 'Other' },
]

function AdminCrossBorderSection() {
  const { t: tr } = useLanguage()
  const [orders, setOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [statusFilter, setStatusFilter] = useState('')
  const [toast, setToast] = useState('')
  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3500) }

  // Selected order + docs panel
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null)
  const [docs, setDocs] = useState<any[]>([])
  const [docsLoading, setDocsLoading] = useState(false)
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({})

  // Border info edit
  const [editBorder, setEditBorder] = useState(false)
  const [borderForm, setBorderForm] = useState({ border_crossing_ref: '', customs_declaration_ref: '', hs_code: '', shipper_tin: '' })
  const [borderSaving, setBorderSaving] = useState(false)

  // eSW
  const [eswLoading, setEswLoading] = useState(false)

  const inputStyle: React.CSSProperties = {
    padding: '0.5rem 0.75rem', borderRadius: 9, border: '1px solid rgba(255,255,255,0.12)',
    background: 'rgba(255,255,255,0.05)', color: 'var(--clr-text)', fontFamily: 'inherit',
    fontSize: '0.82rem', outline: 'none', width: '100%',
  }

  const loadOrders = async (p = page, sf = statusFilter) => {
    setLoading(true)
    try {
      const { data } = await adminOrderApi.getCrossBorderOrders({ page: p, limit: 20, ...(sf ? { status: sf } : {}) })
      setOrders(data.orders ?? [])
      setPages(data.pagination?.pages ?? 1)
    } catch {
      showToast(tr('cb_toast_load_fail'))
    } finally {
      setLoading(false)
    }
  }

  const loadDocs = async (orderId: string) => {
    setDocsLoading(true)
    try {
      const { data } = await adminOrderApi.getOrderCrossBorderDocs(orderId)
      setDocs(data.documents ?? data.docs ?? [])
    } catch {
      showToast(tr('cb_toast_docs_fail'))
    } finally {
      setDocsLoading(false)
    }
  }

  useEffect(() => { loadOrders(1, '') }, []) // eslint-disable-line

  const openOrder = (ord: any) => {
    setSelectedOrderId(ord.id)
    setSelectedOrder(ord)
    setBorderForm({
      border_crossing_ref: ord.border_crossing_ref ?? '',
      customs_declaration_ref: ord.customs_declaration_ref ?? '',
      hs_code: ord.hs_code ?? '',
      shipper_tin: ord.shipper_tin ?? '',
    })
    setEditBorder(false)
    loadDocs(ord.id)
  }

  const closeOrder = () => {
    setSelectedOrderId(null)
    setSelectedOrder(null)
    setDocs([])
    setEditBorder(false)
  }

  const handleReview = async (docId: string, action: 'approve' | 'reject') => {
    if (!selectedOrderId) return
    try {
      // Map UI action to backend enum and require notes when rejecting
      const backendAction = action === 'approve' ? 'APPROVED' : 'REJECTED'
      if (backendAction === 'REJECTED' && !(reviewNotes[docId] ?? '').trim()) {
        showToast(tr('cb_toast_notes_req'))
        return
      }
      await adminOrderApi.reviewCrossBorderDoc(selectedOrderId, docId, { action: backendAction, review_notes: reviewNotes[docId] ?? '' })
      showToast(action === 'approve' ? tr('cb_toast_doc_approved') : tr('cb_toast_doc_rejected'))
      loadDocs(selectedOrderId)
    } catch {
      showToast(tr('cb_toast_review_fail'))
    }
  }

  const handleSaveBorderInfo = async () => {
    if (!selectedOrderId) return
    setBorderSaving(true)
    try {
      await adminOrderApi.updateOrderBorderInfo(selectedOrderId, borderForm)
      showToast(tr('cb_toast_border_saved'))
      setEditBorder(false)
      // refresh order in list
      setSelectedOrder((prev: any) => prev ? { ...prev, ...borderForm } : prev)
      setOrders(prev => prev.map(o => o.id === selectedOrderId ? { ...o, ...borderForm } : o))
    } catch {
      showToast(tr('cb_toast_border_fail'))
    } finally {
      setBorderSaving(false)
    }
  }

  const handleSubmitEsw = async () => {
    if (!selectedOrderId) return
    setEswLoading(true)
    try {
      const { data } = await adminOrderApi.submitToEsw(selectedOrderId)
      showToast(`Submitted to eSW — ref: ${data.esw_reference ?? '—'}`)
      setSelectedOrder((prev: any) => prev ? { ...prev, customs_declaration_ref: data.esw_reference } : prev)
      setBorderForm(prev => ({ ...prev, customs_declaration_ref: data.esw_reference ?? prev.customs_declaration_ref }))
    } catch {
      showToast(tr('cb_toast_esw_fail'))
    } finally {
      setEswLoading(false)
    }
  }

  const DOC_STATUS_COLOR: Record<string, string> = {
    PENDING_REVIEW: '#facc15',
    APPROVED: '#10b981',
    REJECTED: '#f87171',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <h2 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--clr-text)', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
        <LuGlobe size={17} /> {tr('cb_title')}
      </h2>
      <p style={{ fontSize: '0.78rem', color: 'var(--clr-muted)', marginTop: '-0.6rem' }}>
        {tr('cb_subtitle')}
      </p>

      {/* Filter bar */}
      <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <select
          value={statusFilter}
          onChange={e => { setStatusFilter(e.target.value); setPage(1); loadOrders(1, e.target.value) }}
          style={{ ...inputStyle, width: 'auto', minWidth: 180 }}
        >
          <option value="" style={{ background: '#0f172a' }}>{tr('cb_filter_all')}</option>
          {Object.entries(CB_STATUS_LABEL).map(([v, l]) => (
            <option key={v} value={v} style={{ background: '#0f172a' }}>{l}</option>
          ))}
        </select>
        <button className="btn-outline" style={{ fontSize: '0.78rem', padding: '0.45rem 0.85rem' }}
          onClick={() => { setStatusFilter(''); setPage(1); loadOrders(1, '') }}>
          <LuRefreshCw size={13} />
        </button>
      </div>

      {loading ? <LoadingSpinner /> : (
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          {/* Orders table */}
          <div className="glass-inner" style={{ flex: 1, minWidth: 340, overflow: 'hidden' }}>
            {orders.length === 0 ? (
              <p style={{ padding: '2rem', textAlign: 'center', color: 'var(--clr-muted)', fontSize: '0.85rem' }}>{tr('cb_none')}</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.09)' }}>
                      {[tr('cb_col_order'), tr('cb_col_route'), tr('cb_col_status'), tr('cb_col_border_ref'), tr('cb_col_customs_ref'), tr('cb_col_tin'), ''].map(h => (
                        <th key={h} style={{ padding: '0.6rem 0.75rem', textAlign: 'left', color: 'var(--clr-muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((ord, i) => (
                      <tr
                        key={ord.id}
                        onClick={() => openOrder(ord)}
                        style={{
                          borderBottom: i < orders.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                          cursor: 'pointer',
                          background: selectedOrderId === ord.id ? 'rgba(97, 148, 31,0.06)' : 'transparent',
                        }}
                      >
                        <td style={{ padding: '0.55rem 0.75rem', color: 'var(--clr-accent)', fontWeight: 700 }}>
                          {ord.id?.slice(0, 8)}…
                        </td>
                        <td style={{ padding: '0.55rem 0.75rem', color: 'var(--clr-muted)', whiteSpace: 'nowrap' }}>
                          {ord.pickup_country_name ?? '?'} → {ord.delivery_country_name ?? '?'}
                        </td>
                        <td style={{ padding: '0.55rem 0.75rem', whiteSpace: 'nowrap' }}>
                          <span style={{ color: CB_STATUS_COLOR[ord.status] ?? 'var(--clr-muted)', fontWeight: 700, fontSize: '0.72rem' }}>
                            {CB_STATUS_LABEL[ord.status] ?? ord.status}
                          </span>
                        </td>
                        <td style={{ padding: '0.55rem 0.75rem', color: 'var(--clr-muted)', fontFamily: 'monospace', fontSize: '0.73rem' }}>
                          {ord.border_crossing_ref ?? '—'}
                        </td>
                        <td style={{ padding: '0.55rem 0.75rem', color: 'var(--clr-muted)', fontFamily: 'monospace', fontSize: '0.73rem' }}>
                          {ord.customs_declaration_ref ?? '—'}
                        </td>
                        <td style={{ padding: '0.55rem 0.75rem', color: 'var(--clr-muted)', fontFamily: 'monospace', fontSize: '0.73rem' }}>
                          {ord.shipper_tin ?? '—'}
                        </td>
                        <td style={{ padding: '0.55rem 0.75rem' }}>
                          <button className="btn-outline" style={{ fontSize: '0.72rem', padding: '0.3rem 0.65rem' }} onClick={e => { e.stopPropagation(); openOrder(ord) }}>
                            {tr('cb_manage_btn')}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination */}
            {pages > 1 && (
              <div style={{ display: 'flex', gap: '0.4rem', padding: '0.75rem', justifyContent: 'center' }}>
                {Array.from({ length: pages }, (_, i) => i + 1).map(p => (
                  <button
                    key={p}
                    className={p === page ? 'btn-primary' : 'btn-outline'}
                    style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem', minWidth: 32 }}
                    onClick={() => { setPage(p); loadOrders(p, statusFilter) }}
                  >{p}</button>
                ))}
              </div>
            )}
          </div>

          {/* Detail panel */}
          {selectedOrder && (
            <div className="glass-inner" style={{ width: 380, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 800, fontSize: '0.88rem' }}>Order {selectedOrder.id?.slice(0, 8)}…</span>
                <button className="btn-outline" style={{ fontSize: '0.72rem', padding: '0.3rem 0.65rem' }} onClick={closeOrder}>{tr('cb_detail_close')}</button>
              </div>

              {/* Status badge */}
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: CB_STATUS_COLOR[selectedOrder.status] ?? 'var(--clr-muted)', background: 'rgba(0,0,0,0.3)', border: `1px solid ${CB_STATUS_COLOR[selectedOrder.status] ?? '#555'}`, borderRadius: 6, padding: '0.2rem 0.55rem' }}>
                  {CB_STATUS_LABEL[selectedOrder.status] ?? selectedOrder.status}
                </span>
                <span style={{ fontSize: '0.73rem', color: 'var(--clr-muted)' }}>
                  {selectedOrder.pickup_country_name ?? '?'} → {selectedOrder.delivery_country_name ?? '?'}
                </span>
              </div>

              {/* Border info */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--clr-muted)' }}>{tr('cb_border_info')}</span>
                  {!editBorder && (
                    <button className="btn-outline" style={{ fontSize: '0.72rem', padding: '0.25rem 0.55rem' }} onClick={() => setEditBorder(true)}>{tr('cb_edit_btn')}</button>
                  )}
                </div>
                {editBorder ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {([
                      ['border_crossing_ref', tr('cb_field_border_ref')],
                      ['customs_declaration_ref', tr('cb_field_customs_ref')],
                      ['hs_code', tr('cb_field_hs_code')],
                      ['shipper_tin', tr('cb_field_tin')],
                    ] as [keyof typeof borderForm, string][]).map(([key, label]) => (
                      <div key={key}>
                        <label style={{ fontSize: '0.72rem', color: 'var(--clr-muted)', marginBottom: 4, display: 'block' }}>{label}</label>
                        <input
                          style={inputStyle}
                          value={borderForm[key]}
                          onChange={e => setBorderForm(prev => ({ ...prev, [key]: e.target.value }))}
                          placeholder={label}
                        />
                      </div>
                    ))}
                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
                      <button className="btn-primary" style={{ fontSize: '0.78rem', padding: '0.4rem 0.85rem' }} onClick={handleSaveBorderInfo} disabled={borderSaving}>
                        {borderSaving ? tr('cb_saving') : tr('cb_save')}
                      </button>
                      <button className="btn-outline" style={{ fontSize: '0.78rem', padding: '0.4rem 0.85rem' }} onClick={() => setEditBorder(false)}>{tr('cb_cancel')}</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem 0.75rem', fontSize: '0.75rem' }}>
                    {[
                      [tr('cb_info_border_ref'), borderForm.border_crossing_ref || '—'],
                      [tr('cb_info_customs_ref'), borderForm.customs_declaration_ref || '—'],
                      [tr('cb_info_hs_code'), borderForm.hs_code || '—'],
                      [tr('cb_info_tin'), borderForm.shipper_tin || '—'],
                    ].map(([k, v]) => (
                      <>
                        <span key={`${k}-k`} style={{ color: 'var(--clr-muted)' }}>{k}</span>
                        <span key={`${k}-v`} style={{ color: 'var(--clr-text)', fontFamily: 'monospace', wordBreak: 'break-all' }}>{v}</span>
                      </>
                    ))}
                  </div>
                )}
              </div>

              {/* eSW */}
              <div>
                <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--clr-muted)', marginBottom: '0.4rem' }}>eSW Customs System</div>
                <button className="btn-primary" style={{ fontSize: '0.78rem', padding: '0.4rem 0.9rem', opacity: eswLoading ? 0.6 : 1 }} onClick={handleSubmitEsw} disabled={eswLoading}>
                  <LuGlobe size={13} style={{ marginRight: 5 }} />{eswLoading ? 'Submitting…' : 'Submit to eSW'}
                </button>
              </div>

              {/* Documents */}
              <div>
                <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--clr-muted)', marginBottom: '0.5rem' }}>Customs Documents</div>
                {docsLoading ? (
                  <p style={{ fontSize: '0.78rem', color: 'var(--clr-muted)' }}>{tr('cb_docs_loading')}</p>
                ) : docs.length === 0 ? (
                  <p style={{ fontSize: '0.78rem', color: 'var(--clr-muted)' }}>{tr('cb_docs_none')}</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                    {docs.map(doc => {
                      const borderClr = DOC_STATUS_COLOR[doc.status] ?? 'rgba(255,255,255,0.12)'
                      const isApproved = doc.status === 'APPROVED'
                      const isRejected = doc.status === 'REJECTED'
                      const isPending = doc.status === 'PENDING_REVIEW'
                      return (
                        <div key={doc.id} style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid rgba(255,255,255,0.08)`, borderLeft: `3px solid ${borderClr}`, borderRadius: 10, padding: '0.65rem 0.85rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.78rem', fontWeight: 700 }}>
                              {DOC_TYPE_OPTIONS.find(d => d.value === doc.document_type)?.label ?? doc.document_type}
                            </span>
                            <span style={{ fontSize: '0.7rem', fontWeight: 700, color: borderClr, background: 'rgba(0,0,0,0.3)', borderRadius: 5, padding: '0.15rem 0.45rem', border: `1px solid ${borderClr}` }}>
                              {isApproved ? tr('cb_doc_approved') : isRejected ? tr('cb_doc_rejected') : tr('cb_doc_pending')}
                            </span>
                          </div>
                          {doc.notes && <p style={{ fontSize: '0.72rem', color: 'var(--clr-muted)', margin: 0 }}>{doc.notes}</p>}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.7rem', color: 'var(--clr-muted)' }}>
                            <span>{tr('cb_doc_by')} {doc.uploader_first_name} {doc.uploader_last_name} · {new Date(doc.created_at).toLocaleString()}</span>
                            <a href={doc.file_url} target="_blank" rel="noreferrer" style={{ color: 'var(--clr-accent)', marginLeft: 'auto', whiteSpace: 'nowrap' }}>
                              View ↗
                            </a>
                          </div>
                          {isApproved && doc.review_notes && (
                            <div style={{ fontSize: '0.72rem', color: '#10b981', background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 6, padding: '0.3rem 0.55rem' }}>
                              {tr('cb_note_prefix')} {doc.review_notes}
                            </div>
                          )}
                          {isRejected && (
                            <div style={{ fontSize: '0.72rem', color: '#f87171', background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 6, padding: '0.3rem 0.55rem' }}>
                              {doc.review_notes ? `${tr('cb_reason_prefix')} ${doc.review_notes}` : tr('cb_rejected_no_reason')}
                            </div>
                          )}
                          {doc.reviewed_at && (
                            <div style={{ fontSize: '0.68rem', color: 'var(--clr-muted)' }}>
                              {tr('cb_reviewed_by')} {doc.reviewer_first_name} {doc.reviewer_last_name} · {new Date(doc.reviewed_at).toLocaleString()}
                            </div>
                          )}
                          {isPending && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginTop: '0.25rem' }}>
                              <input
                                style={{ ...inputStyle, fontSize: '0.72rem' }}
                                {...{ placeholder: tr('cb_review_ph') }}
                                value={reviewNotes[doc.id] ?? ''}
                                onChange={e => setReviewNotes(prev => ({ ...prev, [doc.id]: e.target.value }))}
                              />
                              <div style={{ display: 'flex', gap: '0.4rem' }}>
                                <button className="btn-primary" style={{ fontSize: '0.72rem', padding: '0.3rem 0.7rem', background: 'linear-gradient(135deg,#10b981,#059669)', border: 'none', flex: 1 }} onClick={() => handleReview(doc.id, 'approve')}>
                                  {tr('cb_approve_btn')}
                                </button>
                                <button className="btn-outline" style={{ fontSize: '0.72rem', padding: '0.3rem 0.7rem', color: '#f87171', borderColor: '#f87171', flex: 1 }} onClick={() => handleReview(doc.id, 'reject')}>
                                  {tr('cb_reject_btn')}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {toast && (
        <div style={{ position: 'fixed', bottom: '1.25rem', right: '1.25rem', zIndex: 200, background: 'rgba(97, 148, 31,0.12)', border: '1px solid rgba(97, 148, 31,0.25)', color: 'var(--clr-text)', padding: '0.65rem 1.1rem', borderRadius: 12, fontSize: '0.85rem', fontWeight: 600, backdropFilter: 'blur(12px)' }}>
          {toast}
        </div>
      )}
    </div>
  )
}

// ─── Contact Information Section ─────────────────────────────────────────────

// Inline SVG icons for social platforms not in lucide
const IconYouTube = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 0 0 .5 6.2C0 8.1 0 12 0 12s0 3.9.5 5.8a3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1C24 15.9 24 12 24 12s0-3.9-.5-5.8zM9.6 15.6V8.4l6.3 3.6-6.3 3.6z" /></svg>
const IconTikTok = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M19.6 3.3a4.8 4.8 0 0 1-2.8-.9 4.8 4.8 0 0 1-1.8-3.1h-3.3v13.9a2.3 2.3 0 0 1-2.3 2.2 2.3 2.3 0 0 1-2.3-2.3 2.3 2.3 0 0 1 2.3-2.3c.2 0 .4 0 .6.1V7.6a5.7 5.7 0 0 0-.6 0 5.6 5.6 0 0 0-5.6 5.6 5.6 5.6 0 0 0 5.6 5.6 5.6 5.6 0 0 0 5.6-5.6V8.6a8.1 8.1 0 0 0 4.7 1.5V6.8a4.8 4.8 0 0 1-1.9-.4v-.1z" style={{ fill: 'currentColor' }} /></svg>
const IconInstagram = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.2c3.2 0 3.6 0 4.9.1 3.3.1 4.8 1.7 4.9 4.9.1 1.3.1 1.6.1 4.8s0 3.6-.1 4.8c-.1 3.2-1.6 4.8-4.9 4.9-1.3.1-1.6.1-4.9.1s-3.6 0-4.8-.1C3.7 21.6 2.2 20 2.1 16.8 2 15.6 2 15.2 2 12s0-3.6.1-4.8C2.2 3.9 3.8 2.2 7.2 2.1 8.4 2 8.8 2.2 12 2.2zm0-2.2C8.7 0 8.3 0 7 .1 2.7.3.3 2.7.1 7 0 8.3 0 8.7 0 12s0 3.7.1 5c.2 4.3 2.6 6.7 6.9 6.9C8.3 24 8.7 24 12 24s3.7 0 5-.1c4.3-.2 6.7-2.6 6.9-6.9.1-1.3.1-1.7.1-5s0-3.7-.1-5c-.2-4.3-2.6-6.7-6.9-6.9C15.7 0 15.3 0 12 0zm0 5.8a6.2 6.2 0 1 0 0 12.4A6.2 6.2 0 0 0 12 5.8zm0 10.2a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.4-11.8a1.4 1.4 0 1 0 0 2.8 1.4 1.4 0 0 0 0-2.8z" /></svg>
const IconX = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M18.3 1h3.1l-6.8 7.8L22.7 23h-6.3l-4.9-6.4L5.9 23H2.8l7.3-8.3L1.3 1h6.4l4.5 5.8L18.3 1zm-1.1 19.8h1.7L7.4 2.8H5.6l11.6 18z" /></svg>
const IconLinkedIn = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M20.4 20.4H17v-5.6c0-1.3 0-3-1.8-3s-2.1 1.4-2.1 2.9v5.7H9.5V9h3.3v1.6h.1c.5-.9 1.6-1.8 3.3-1.8 3.5 0 4.2 2.3 4.2 5.3v6.3zM5.3 7.4A2 2 0 1 1 5.3 3.5a2 2 0 0 1 0 3.9zm1.7 13H3.6V9h3.4v11.4zM22.2 0H1.8C.8 0 0 .8 0 1.8v20.4C0 23.2.8 24 1.8 24h20.4c1 0 1.8-.8 1.8-1.8V1.8C24 .8 23.2 0 22.2 0z" /></svg>
const IconWhatsApp = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M20.5 3.5A12 12 0 0 0 3.5 20.5L2 22l1.5-5.5A12 12 0 0 0 20.5 3.5zM12 22a10 10 0 1 1 0-20A10 10 0 0 1 12 22zM8 8.5c.2-.5.5-1 1-1.2.3-.1.6-.1.8 0 .2.2.7 1.4.8 1.5.1.2.1.4 0 .6-.1.2-.4.6-.5.7-.1.2-.3.4-.1.7.2.4.8 1.3 1.6 2 .8.8 1.6 1.2 2 1.4.3.1.5 0 .7-.2.2-.2.6-.7.8-.9.2-.2.4-.2.7-.1.3.1 1.3.6 1.5.8.2.2.2.3.2.5s-.3 1.1-1 1.6c-.6.4-1.5.7-2.6.3-1-.3-2.3-1-3.6-2.3-1.3-1.3-2-2.6-2.3-3.6-.3-1-.1-1.9.2-2.4z" /></svg>
const IconTelegram = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.6 0 12 0zm5.9 8.2-2 9.4c-.1.6-.5.8-.9.5l-2.5-1.9-1.2 1.1c-.1.1-.3.2-.6.2l.2-2.7 5.2-4.7c.2-.2 0-.3-.3-.1L6.8 14.6l-2.4-.8c-.5-.2-.5-.5.1-.7l11.5-4.4c.5-.2.9.1.8.8-.1-.3 0-.3-.1-.3z" /></svg>

function AdminContactInfoSection() {
  const { t: tr } = useLanguage()
  const [form, setForm] = useState({
    phone1: '', phone2: '', email1: '', email2: '', po_box: '',
    youtube_url: '', tiktok_url: '', instagram_url: '', x_url: '',
    linkedin_url: '', whatsapp_number: '', telegram_url: '',
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState('')
  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3500) }

  useEffect(() => {
    adminOrderApi.getContactInfo()
      .then(({ data }) => {
        const c = data.contact ?? {}
        setForm({
          phone1: c.phone1 ?? '',
          phone2: c.phone2 ?? '',
          email1: c.email1 ?? '',
          email2: c.email2 ?? '',
          po_box: c.po_box ?? '',
          youtube_url: c.youtube_url ?? '',
          tiktok_url: c.tiktok_url ?? '',
          instagram_url: c.instagram_url ?? '',
          x_url: c.x_url ?? '',
          linkedin_url: c.linkedin_url ?? '',
          whatsapp_number: c.whatsapp_number ?? '',
          telegram_url: c.telegram_url ?? '',
        })
      })
      .catch(() => showToast(tr('ci_load_fail')))
      .finally(() => setLoading(false))
  }, [])

  const set = (k: keyof typeof form) => (e: ChangeEvent<HTMLInputElement>) =>
    setForm(prev => ({ ...prev, [k]: e.target.value }))

  const handleSave = async () => {
    setSaving(true)
    try {
      const payload: Record<string, string | null> = {}
      for (const [k, v] of Object.entries(form)) payload[k] = v.trim() || null
      await adminOrderApi.updateContactInfo(payload as any)
      showToast(tr('ci_saved'))
    } catch { showToast(tr('ci_save_fail')) }
    finally { setSaving(false) }
  }

  const inputStyle: React.CSSProperties = {
    padding: '0.5rem 0.75rem', borderRadius: 9, border: '1px solid rgba(255,255,255,0.12)',
    background: 'rgba(255,255,255,0.05)', color: 'var(--clr-text)', fontFamily: 'inherit',
    fontSize: '0.82rem', outline: 'none', width: '100%', boxSizing: 'border-box',
  }
  const labelStyle: React.CSSProperties = {
    fontSize: '0.7rem', color: 'var(--clr-muted)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: '0.35rem',
  }
  const Field = ({ label, icon, fkey, placeholder }: { label: string; icon: React.ReactNode; fkey: keyof typeof form; placeholder?: string }) => (
    <div>
      <label style={labelStyle}>{icon} {label} <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: '0.65rem' }}>{tr('ci_optional')}</span></label>
      <input style={inputStyle} value={form[fkey]} onChange={set(fkey)} placeholder={placeholder ?? label} />
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <h2 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--clr-text)', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
        <LuPhone size={17} /> {tr('ci_title')}
      </h2>
      <p style={{ fontSize: '0.78rem', color: 'var(--clr-muted)', marginTop: '-0.75rem' }}>
        {tr('ci_subtitle')}
      </p>

      {loading ? <LoadingSpinner /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Contact details */}
          <div className="glass-inner" style={{ padding: '1.1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <p style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--clr-muted)', marginBottom: '0.25rem' }}>{tr('ci_section_contact')}</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(240px,1fr))', gap: '0.75rem' }}>
              <Field label={tr('ci_label_phone1')} icon={<LuPhone size={12} />} fkey="phone1" placeholder="+251 9XX XXX XXX" />
              <Field label={tr('ci_label_phone2')} icon={<LuPhone size={12} />} fkey="phone2" placeholder="+251 9XX XXX XXX" />
              <Field label={tr('ci_label_email1')} icon={<LuMail size={12} />} fkey="email1" placeholder="info@company.com" />
              <Field label={tr('ci_label_email2')} icon={<LuMail size={12} />} fkey="email2" placeholder="support@company.com" />
              <Field label={tr('ci_label_po_box')} icon={<LuFileText size={12} />} fkey="po_box" placeholder="P.O. Box 1234" />
            </div>
          </div>

          {/* Social media */}
          <div className="glass-inner" style={{ padding: '1.1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <p style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--clr-muted)', marginBottom: '0.25rem' }}>{tr('ci_section_social')}</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(240px,1fr))', gap: '0.75rem' }}>
              <Field label={tr('ci_label_youtube')} icon={<span style={{ color: '#ff0000' }}><IconYouTube /></span>} fkey="youtube_url" placeholder="https://youtube.com/@channel" />
              <Field label={tr('ci_label_tiktok')} icon={<span style={{ color: '#e0e0e0' }}><IconTikTok /></span>} fkey="tiktok_url" placeholder="https://tiktok.com/@handle" />
              <Field label={tr('ci_label_instagram')} icon={<span style={{ color: '#c13584' }}><IconInstagram /></span>} fkey="instagram_url" placeholder="https://instagram.com/handle" />
              <Field label={tr('ci_label_x')} icon={<span style={{ color: '#e0e0e0' }}><IconX /></span>} fkey="x_url" placeholder="https://x.com/handle" />
              <Field label={tr('ci_label_linkedin')} icon={<span style={{ color: '#0077b5' }}><IconLinkedIn /></span>} fkey="linkedin_url" placeholder="https://linkedin.com/company/..." />
              <Field label={tr('ci_label_whatsapp')} icon={<span style={{ color: '#25d366' }}><IconWhatsApp /></span>} fkey="whatsapp_number" placeholder="+251 9XX XXX XXX" />
              <Field label={tr('ci_label_telegram')} icon={<span style={{ color: '#229ed9' }}><IconTelegram /></span>} fkey="telegram_url" placeholder="https://t.me/channel" />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn-primary" onClick={handleSave} disabled={saving} style={{ padding: '0.5rem 1.4rem', fontSize: '0.85rem' }}>
              {saving ? tr('ci_saving') : tr('ci_btn_save')}
            </button>
          </div>
        </div>
      )}

      {toast && (
        <div style={{ position: 'fixed', bottom: '1.25rem', right: '1.25rem', zIndex: 200, background: 'rgba(97, 148, 31,0.12)', border: '1px solid rgba(97, 148, 31,0.25)', color: 'var(--clr-text)', padding: '0.65rem 1.1rem', borderRadius: 12, fontSize: '0.85rem', fontWeight: 600, backdropFilter: 'blur(12px)' }}>
          {toast}
        </div>
      )}
    </div>
  )
}

// ─── AI Assistance Section ────────────────────────────────────────────────────

function AdminAiSettingsSection() {
  const { t: tr } = useLanguage()
  const [aiEnabled, setAiEnabled] = useState(false)
  const [customerId, setCustomerId] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [apiKeySet, setApiKeySet] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState('')
  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3500) }

  useEffect(() => {
    adminOrderApi.getAiSettings()
      .then(({ data }) => {
        const s = data.settings ?? {}
        setAiEnabled(Boolean(s.ai_enabled))
        setCustomerId(s.customer_id ?? '')
        setApiKeySet(Boolean(s.api_key_set))
        setApiKey('')
      })
      .catch(() => showToast(tr('ais_load_fail')))
      .finally(() => setLoading(false))
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      const payload: { ai_enabled: boolean; customer_id: string; api_key?: string } = {
        ai_enabled: aiEnabled,
        customer_id: customerId.trim(),
      }
      if (apiKey.trim()) payload.api_key = apiKey.trim()
      const { data } = await adminOrderApi.updateAiSettings(payload)
      const s = data.settings ?? {}
      setAiEnabled(Boolean(s.ai_enabled))
      setCustomerId(s.customer_id ?? '')
      setApiKeySet(Boolean(s.api_key_set))
      setApiKey('')
      showToast(tr('ais_saved'))
    } catch { showToast(tr('ais_save_fail')) }
    finally { setSaving(false) }
  }

  const inputStyle: React.CSSProperties = {
    padding: '0.5rem 0.75rem', borderRadius: 9, border: '1px solid rgba(255,255,255,0.12)',
    background: 'rgba(255,255,255,0.05)', color: 'var(--clr-text)', fontFamily: 'inherit',
    fontSize: '0.82rem', outline: 'none', width: '100%', boxSizing: 'border-box',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <h2 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--clr-text)', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
        <LuLink size={17} /> {tr('ais_title')}
      </h2>
      <p style={{ fontSize: '0.78rem', color: 'var(--clr-muted)', marginTop: '-0.75rem' }}>
        {tr('ais_subtitle')}
      </p>

      {loading ? <LoadingSpinner /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="glass-inner" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Toggle */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '0.85rem', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
              <div>
                <p style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--clr-text)' }}>{tr('ais_toggle_title')}</p>
                <p style={{ fontSize: '0.72rem', color: 'var(--clr-muted)', marginTop: 2 }}>{tr('ais_toggle_sub')}</p>
              </div>
              <button
                onClick={() => setAiEnabled(v => !v)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: aiEnabled ? '#10b981' : 'var(--clr-muted)', display: 'flex', alignItems: 'center', transition: 'color 0.2s', flexShrink: 0 }}
              >
                {aiEnabled
                  ? <LuToggleRight size={38} style={{ filter: 'drop-shadow(0 0 6px rgba(16,185,129,0.5))' }} />
                  : <LuToggleLeft size={38} />}
              </button>
            </div>

            {/* Credentials — only shown when enabled */}
            {aiEnabled && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div style={{ background: 'rgba(168,85,247,0.06)', border: '1px solid rgba(168,85,247,0.2)', borderRadius: 10, padding: '0.65rem 0.9rem' }}>
                  <p style={{ fontSize: '0.72rem', color: 'rgba(168,85,247,0.9)' }}>
                    {tr('ais_cred_hint')}
                  </p>
                </div>
                <div>
                  <label style={{ fontSize: '0.7rem', color: 'var(--clr-muted)', marginBottom: 4, display: 'block' }}>{tr('ais_label_cust_id')}</label>
                  <input style={inputStyle} value={customerId} onChange={e => setCustomerId(e.target.value)} placeholder="e.g. cust_abc123xyz" />
                </div>
                <div>
                  <label style={{ fontSize: '0.7rem', color: 'var(--clr-muted)', marginBottom: 4, display: 'block' }}>
                    {tr('ais_label_api_key')} {apiKeySet && <span style={{ color: '#10b981', marginLeft: 6 }}>{tr('ais_key_set')}</span>}
                  </label>
                  <input
                    style={inputStyle}
                    type="password"
                    value={apiKey}
                    onChange={e => setApiKey(e.target.value)}
                    placeholder={apiKeySet ? tr('ais_ph_api_blank') : tr('ais_ph_api_new')}
                    autoComplete="new-password"
                  />
                </div>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn-primary" onClick={handleSave} disabled={saving} style={{ padding: '0.5rem 1.4rem', fontSize: '0.85rem' }}>
              {saving ? tr('ais_saving') : tr('ais_btn_save')}
            </button>
          </div>
        </div>
      )}

      {toast && (
        <div style={{ position: 'fixed', bottom: '1.25rem', right: '1.25rem', zIndex: 200, background: 'rgba(97, 148, 31,0.12)', border: '1px solid rgba(97, 148, 31,0.25)', color: 'var(--clr-text)', padding: '0.65rem 1.1rem', borderRadius: 12, fontSize: '0.85rem', fontWeight: 600, backdropFilter: 'blur(12px)' }}>
          {toast}
        </div>
      )}
    </div>
  )
}

// ─── Reports Section ─────────────────────────────────────────────────────────

function AdminReportsSection({ allowedTabs }: { allowedTabs?: Array<'orders' | 'finance' | 'drivers' | 'logistics'> }) {
  return <AdminReportsSectionComponent allowedTabs={allowedTabs} />
}

// ─── Security Events Section ─────────────────────────────────────────────────

function AdminSecurityEventsSection() {
  const { t: tr } = useLanguage()
  const [events, setEvents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [filter, setFilter] = useState('')
  const [toast, setToast] = useState('')
  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3000) }

  const load = async (p = page, evtType = filter) => {
    setLoading(true)
    try {
      const { data } = await adminOrderApi.getSecurityEvents({ page: p, limit: 50, ...(evtType ? { event_type: evtType } : {}) })
      setEvents(data.events ?? [])
      setPages(data.pagination?.pages ?? 1)
    } catch {
      showToast(tr('sec_load_fail'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load(1, filter) }, []) // eslint-disable-line

  const EVENT_TYPES = ['ADMIN_ACCESS_DENIED_ROLE', 'ADMIN_ACCESS_DENIED_PERMISSION', 'OTP_LIMIT_REACHED', 'OTP_LOCKED']

  const inputStyle: React.CSSProperties = {
    padding: '0.5rem 0.75rem', borderRadius: 9, border: '1px solid rgba(255,255,255,0.12)',
    background: 'rgba(255,255,255,0.05)', color: 'var(--clr-text)', fontFamily: 'inherit',
    fontSize: '0.82rem', outline: 'none',
  }

  const handleFilter = (v: string) => {
    setFilter(v); setPage(1); load(1, v)
  }

  const handlePage = (p: number) => {
    setPage(p); load(p, filter)
  }

  const COLOUR: Record<string, string> = {
    ADMIN_ACCESS_DENIED_ROLE: '#f87171',
    ADMIN_ACCESS_DENIED_PERMISSION: 'var(--kpi-orange)',
    OTP_LIMIT_REACHED: '#facc15',
    OTP_LOCKED: '#f87171',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <h2 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--clr-text)', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
        <LuShieldCheck size={17} /> {tr('sec_title')}
      </h2>
      <p style={{ fontSize: '0.78rem', color: 'var(--clr-muted)', marginTop: '-0.6rem' }}>
        {tr('sec_subtitle')}
      </p>

      {/* Filter bar */}
      <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={filter} onChange={e => handleFilter(e.target.value)} style={{ ...inputStyle, minWidth: 230 }}>
          <option value="" style={{ background: '#0f172a' }}>{tr('sec_filter_all')}</option>
          {EVENT_TYPES.map(t => <option key={t} value={t} style={{ background: '#0f172a' }}>{t.replaceAll('_', ' ')}</option>)}
        </select>
        <button className="btn-outline" style={{ fontSize: '0.78rem', padding: '0.45rem 0.85rem' }} onClick={() => { setFilter(''); setPage(1); load(1, '') }}>
          <LuRefreshCw size={13} />
        </button>
      </div>

      {loading ? <LoadingSpinner /> : (
        <>
          <div className="glass-inner" style={{ overflow: 'hidden' }}>
            {events.length === 0 ? (
              <p style={{ padding: '2rem', textAlign: 'center', color: 'var(--clr-muted)', fontSize: '0.85rem' }}>{tr('sec_none')}</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.09)' }}>
                      {[tr('sec_col_time'), tr('sec_col_type'), tr('sec_col_role'), tr('sec_col_method'), tr('sec_col_endpoint'), tr('sec_col_reason'), tr('sec_col_ip')].map(h => (
                        <th key={h} style={{ padding: '0.6rem 0.75rem', textAlign: 'left', color: 'var(--clr-muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {events.map((ev, i) => (
                      <tr key={ev.id} style={{ borderBottom: i < events.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                        <td style={{ padding: '0.55rem 0.75rem', color: 'var(--clr-muted)', whiteSpace: 'nowrap' }}>
                          {new Date(ev.created_at).toLocaleString()}
                        </td>
                        <td style={{ padding: '0.55rem 0.75rem', whiteSpace: 'nowrap' }}>
                          <span style={{ color: COLOUR[ev.event_type] ?? 'var(--clr-text)', fontWeight: 700, fontSize: '0.72rem' }}>
                            {ev.event_type.replaceAll('_', ' ')}
                          </span>
                        </td>
                        <td style={{ padding: '0.55rem 0.75rem', color: 'var(--clr-muted)' }}>
                          {ev.role_id ?? '—'}
                        </td>
                        <td style={{ padding: '0.55rem 0.75rem', color: 'var(--clr-muted)' }}>
                          {ev.method ?? '—'}
                        </td>
                        <td style={{ padding: '0.55rem 0.75rem', color: 'var(--clr-text)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {ev.endpoint ?? '—'}
                        </td>
                        <td style={{ padding: '0.55rem 0.75rem', color: 'var(--clr-muted)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {ev.reason ?? '—'}
                        </td>
                        <td style={{ padding: '0.55rem 0.75rem', color: 'var(--clr-muted)', whiteSpace: 'nowrap', fontFamily: 'monospace', fontSize: '0.72rem' }}>
                          {ev.ip_address ?? '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Pagination */}
          {pages > 1 && (
            <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center', flexWrap: 'wrap' }}>
              {Array.from({ length: pages }, (_, i) => i + 1).map(p => (
                <button key={p} onClick={() => handlePage(p)}
                  style={{
                    padding: '0.3rem 0.65rem', borderRadius: 7, border: 'none', fontFamily: 'inherit', fontSize: '0.78rem', cursor: 'pointer',
                    background: p === page ? 'var(--clr-accent)' : 'rgba(255,255,255,0.08)',
                    color: p === page ? '#000' : 'var(--clr-text)', fontWeight: p === page ? 700 : 400
                  }}>
                  {p}
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {toast && <div style={{ position: 'fixed', bottom: '1.25rem', right: '1.25rem', zIndex: 200, background: 'rgba(97, 148, 31,0.12)', border: '1px solid rgba(97, 148, 31,0.25)', color: 'var(--clr-text)', padding: '0.65rem 1.1rem', borderRadius: 12, fontSize: '0.85rem', fontWeight: 600, backdropFilter: 'blur(12px)' }}>{toast}</div>}
    </div>
  )
}

// ─── Admin Settings Hub (8.x landing page) ────────────────────────────────────

function AdminSettingsHub({ onNav }: { onNav: (s: AdminSection) => void }) {
  const { t: tr } = useLanguage()
  const tiles: { id: AdminSection; icon: React.ReactNode; label: string; desc: string; accent: string }[] = [
    { id: 'cargo-types', icon: <LuBox size={22} />, label: tr('sb_st_cargo'), desc: tr('sh_desc_cargo'), accent: 'rgba(97, 148, 31,0.12)' },
    { id: 'pricing-rules', icon: <LuSettings size={22} />, label: tr('sb_st_pricing'), desc: tr('sh_desc_pricing'), accent: 'rgba(139,92,246,0.12)' },
    { id: 'vehicle-types', icon: <LuTruck size={22} />, label: tr('sb_st_vehicles'), desc: tr('sh_desc_vehicles'), accent: 'rgba(251,146,60,0.12)' },
    { id: 'countries', icon: <LuGlobe size={22} />, label: tr('sb_st_countries'), desc: tr('sh_desc_countries'), accent: 'rgba(74,222,128,0.12)' },
    { id: 'notif-settings', icon: <LuBell size={22} />, label: tr('sb_st_notif'), desc: tr('sh_desc_notif'), accent: 'rgba(250,204,21,0.10)' },
    { id: 'role-management', icon: <LuKey size={22} />, label: tr('sb_st_roles'), desc: tr('sh_desc_roles'), accent: 'rgba(14,165,233,0.10)' },
    { id: 'maintenance-mode', icon: <LuWrench size={22} />, label: tr('sb_st_maintenance'), desc: 'Activate maintenance kill-switch and manage app version string.', accent: 'rgba(239,68,68,0.10)' },
    { id: 'contact-info', icon: <LuPhone size={22} />, label: tr('sb_st_contact'), desc: tr('sh_desc_contact'), accent: 'rgba(16,185,129,0.10)' },
    { id: 'ai-settings', icon: <LuLink size={22} />, label: tr('sb_st_ai'), desc: tr('sh_desc_ai'), accent: 'rgba(168,85,247,0.12)' },
  ]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <h2 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--clr-text)', display: 'flex', alignItems: 'center', gap: '0.45rem' }}><LuSettings size={17} /> {tr('sb_sys_settings_title')}</h2>
      <p style={{ fontSize: '0.8rem', color: 'var(--clr-muted)', marginTop: '-0.75rem' }}>{tr('sb_sys_settings_desc')}</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(230px,1fr))', gap: '0.75rem' }}>
        {tiles.map(t => (
          <button key={t.id} onClick={() => onNav(t.id)}
            style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', padding: '1.1rem', borderRadius: 14, border: '1px solid rgba(255,255,255,0.09)', background: t.accent, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', color: 'var(--clr-text)', transition: 'border-color 0.18s' }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(97, 148, 31,0.3)')}
            onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.09)')}>
            <span style={{ color: 'var(--clr-accent)' }}>{t.icon}</span>
            <div>
              <p style={{ fontWeight: 700, fontSize: '0.9rem' }}>{t.label}</p>
              <p style={{ fontSize: '0.74rem', color: 'var(--clr-muted)', marginTop: '0.2rem', lineHeight: 1.5 }}>{t.desc}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Overview section ─────────────────────────────────────────────────────────

/* Animated count-up hook */
function useCountUp(target: number, duration = 1200) {
  const [val, setVal] = useState(0)
  useEffect(() => {
    if (!target) { setVal(0); return }
    let start = 0
    const step = target / (duration / 16)
    const id = setInterval(() => {
      start += step
      if (start >= target) { setVal(target); clearInterval(id) }
      else setVal(Math.floor(start))
    }, 16)
    return () => clearInterval(id)
  }, [target, duration])
  return val
}

/* Mini SVG Pie chart — pure inline SVG, no lib */
function PieChart({ slices, size = 110 }: { slices: { value: number; color: string; label: string }[]; size?: number }) {
  const total = slices.reduce((s, x) => s + x.value, 0)
  if (!total) return <div style={{ width: size, height: size, borderRadius: '50%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }} />
  const r = size / 2 - 8
  const cx = size / 2, cy = size / 2
  let angle = -Math.PI / 2
  const paths = slices.filter(s => s.value > 0).map(s => {
    const sweep = (s.value / total) * 2 * Math.PI
    const x1 = cx + r * Math.cos(angle), y1 = cy + r * Math.sin(angle)
    angle += sweep
    const x2 = cx + r * Math.cos(angle), y2 = cy + r * Math.sin(angle)
    const large = sweep > Math.PI ? 1 : 0
    return { d: `M${cx},${cy} L${x1},${y1} A${r},${r},0,${large},1,${x2},${y2} Z`, color: s.color, label: s.label, value: s.value }
  })
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ filter: 'drop-shadow(0 4px 16px rgba(0,0,0,0.4))' }}>
      {paths.map((p, i) => <path key={i} d={p.d} fill={p.color} opacity={0.9} stroke="var(--clr-bg)" strokeWidth={1.5} />)}
      <circle cx={cx} cy={cy} r={r * 0.52} fill="var(--clr-bg)" />
    </svg>
  )
}

/* Horizontal bar chart — pure SVG */
function BarChart({ bars, maxVal }: { bars: { label: string; value: number; color: string }[]; maxVal: number }) {
  const H = 14
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', width: '100%' }}>
      {bars.map((b, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
          <span style={{ fontSize: '0.7rem', color: 'var(--clr-muted)', width: 72, flexShrink: 0, textAlign: 'right', fontWeight: 600 }}>{b.label}</span>
          <div style={{ flex: 1, height: H, borderRadius: 99, background: 'rgba(255,255,255,0.04)', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.05)' }}>
            <div style={{
              height: '100%', borderRadius: 99,
              width: maxVal > 0 ? `${Math.max(2, (b.value / maxVal) * 100)}%` : '2%',
              background: b.color,
              boxShadow: `0 0 8px ${b.color}66`,
              animation: 'progress-fill 1s cubic-bezier(0.4,0,0.2,1) both',
              animationDelay: `${i * 80}ms`,
            }} />
          </div>
          <span style={{ fontSize: '0.72rem', fontWeight: 800, color: b.color, width: 28, textAlign: 'left' }}>{b.value}</span>
        </div>
      ))}
    </div>
  )
}

/* Sparkline — tiny inline SVG trend line */
function Sparkline({ data, color, width = 80, height = 32 }: { data: number[]; color: string; width?: number; height?: number }) {
  if (data.length < 2) return null
  const max = Math.max(...data) || 1
  const min = Math.min(...data)
  const range = max - min || 1
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width
    const y = height - ((v - min) / range) * (height - 4) - 2
    return `${x},${y}`
  }).join(' ')
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity={0.9} />
      <polyline points={`0,${height} ${pts} ${width},${height}`} fill={`${color}18`} stroke="none" />
    </svg>
  )
}

/* KPI hero card */
function KpiCard({
  icon, label, value, sub, color, trend, trendLabel, onClick,
}: {
  icon: React.ReactNode; label: string; value: number; sub?: string
  color: string; trend?: number[]; trendLabel?: string; onClick?: () => void
}) {
  const displayed = useCountUp(value)
  return (
    <div
      onClick={onClick}
      className="glass"
      style={{
        padding: '1rem 1.1rem', borderRadius: '1rem', cursor: onClick ? 'pointer' : 'default',
        border: `1px solid color-mix(in srgb, ${color} 13%, transparent)`, background: `linear-gradient(135deg,color-mix(in srgb, ${color} 6%, transparent) 0%,var(--clr-surface) 100%)`,
        display: 'flex', flexDirection: 'column', gap: '0.4rem', position: 'relative', overflow: 'hidden',
        transition: 'transform .18s, box-shadow .18s',
      }}
      onMouseEnter={e => { if (onClick) { (e.currentTarget as HTMLElement).style.transform = 'translateY(-3px)'; (e.currentTarget as HTMLElement).style.boxShadow = `0 12px 32px color-mix(in srgb, ${color} 15%, transparent)` } }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = ''; (e.currentTarget as HTMLElement).style.boxShadow = '' }}
    >
      {/* Glow orb */}
      <div style={{ position: 'absolute', top: -20, right: -20, width: 80, height: 80, borderRadius: '50%', background: `radial-gradient(circle,color-mix(in srgb, ${color} 12%, transparent) 0%,transparent 70%)`, pointerEvents: 'none' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ width: 32, height: 32, borderRadius: '8px', background: `${color}18`, border: `1px solid ${color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', color }}>
          {icon}
        </div>
        {trend && <Sparkline data={trend} color={color} />}
      </div>
      <div style={{ fontSize: '1.7rem', fontWeight: 900, color: 'var(--clr-text)', lineHeight: 1, letterSpacing: '-0.03em' }}>
        {displayed.toLocaleString()}
      </div>
      <div style={{ fontSize: '0.72rem', fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</div>
      {sub && <div style={{ fontSize: '0.68rem', color: 'var(--clr-muted)' }}>{sub}</div>}
      {trendLabel && <div style={{ fontSize: '0.68rem', color: 'rgba(100,116,139,0.7)' }}>{trendLabel}</div>}
    </div>
  )
}

/* Revenue formatted */
function fmtMoney(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`
  return `$${n.toLocaleString()}`
}

const ORDER_STATUS_META: Record<string, { color: string; label: string }> = {
  PENDING: { color: 'var(--kpi-gold)', label: 'Pending' },
  CONFIRMED: { color: '#60a5fa', label: 'Confirmed' },
  ASSIGNED: { color: 'var(--kpi-purple)', label: 'Assigned' },
  PICKED_UP: { color: 'var(--kpi-sky)', label: 'Picked Up' },
  IN_TRANSIT: { color: '#34d399', label: 'In Transit' },
  DELIVERED: { color: 'var(--kpi-green)', label: 'Delivered' },
  COMPLETED: { color: '#86efac', label: 'Completed' },
  CANCELLED: { color: '#f87171', label: 'Cancelled' },
  FAILED: { color: '#fca5a5', label: 'Failed' },
}

function OverviewSection({
  stats,
  users,
  onNav,
  financeOnly = false,
}: {
  stats: Stats | null
  users: UserRow[]
  onNav: (s: AdminSection) => void
  financeOnly?: boolean
}) {
  const { t: tr } = useLanguage()
  const [orderStats, setOrderStats] = useState<OrderStats | null>(null)
  const [walletStats, setWalletStats] = useState<any>(null)
  const [pendingPaymentCount, setPendingPaymentCount] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      financeOnly ? Promise.resolve(null) : adminOrderApi.getStats().catch(() => null),
      apiClient.get('/admin/wallet-stats').catch(() => null),
      apiClient.get('/admin/payments/pending', { params: { status: 'PENDING' } }).catch(() => null),
    ]).then(([oRes, wRes, pRes]) => {
      setOrderStats(oRes?.data?.stats ?? null)
      setWalletStats(wRes?.data ?? null)
      setPendingPaymentCount(((pRes as any)?.data?.payments ?? []).length)
    }).finally(() => setLoading(false))
  }, [financeOnly])

  const recent = [...users].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 8)
  const drivers = users.filter(u => u.role_id === 3)
  const shippers = users.filter(u => u.role_id === 2)
  const verifiedDrivers = drivers.filter(u => u.is_driver_verified)
  const unverifiedDrivers = drivers.filter(u => !u.is_driver_verified)
  const activeUsers = users.filter(u => u.is_active)
  const pendingVerif = drivers.filter(u => !u.is_driver_verified)

  /* Order bars */
  const statusEntries = Object.entries(orderStats?.by_status ?? {})
    .map(([k, v]) => ({ label: ORDER_STATUS_META[k]?.label ?? k, value: v, color: ORDER_STATUS_META[k]?.color ?? '#94a3b8' }))
    .sort((a, b) => b.value - a.value)
  const maxOrders = Math.max(...statusEntries.map(e => e.value), 1)

  /* Pie data — user roles */
  const rolePie = [
    { label: 'Drivers', value: drivers.length, color: 'var(--kpi-cyan)' },
    { label: 'Shippers', value: shippers.length, color: 'var(--kpi-purple)' },
    { label: 'Staff', value: users.filter(u => [1, 4, 5].includes(u.role_id)).length, color: 'var(--kpi-gold)' },
  ]

  /* Revenue */
  const totalRevenue = Number(orderStats?.total_revenue ?? 0)
  const walletBalance = Number(walletStats?.wallet_summary?.total_balance ?? 0)
  const totalDeposits = Number(walletStats?.manual_payment_summary?.total_deposits ?? 0)
  const pendingPayAmt = Number(walletStats?.manual_payment_summary?.pending_amount ?? 0)

  if (financeOnly) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div>
            <h1 style={{ fontSize: '1.2rem', fontWeight: 900, color: 'var(--clr-text)', margin: 0, letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <LuLayoutDashboard size={19} color="var(--clr-accent)" /> {tr('ov_fin_title')}
            </h1>
            <p style={{ fontSize: '0.76rem', color: 'var(--clr-muted)', margin: '0.2rem 0 0' }}>{tr('ov_fin_subtitle')}</p>
          </div>
          <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
            <button onClick={() => onNav('reports')} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.42rem 0.85rem', borderRadius: '0.6rem', border: '1px solid rgba(97, 148, 31,0.2)', background: 'rgba(97, 148, 31,0.06)', color: 'var(--clr-accent)', fontFamily: 'inherit', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}><LuChartBar size={13} /> {tr('ov_fin_btn_report')}</button>
            <button onClick={() => onNav('payments')} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.42rem 0.85rem', borderRadius: '0.6rem', border: '1px solid rgba(167,139,250,0.2)', background: 'rgba(167,139,250,0.06)', color: 'var(--kpi-purple)', fontFamily: 'inherit', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}><LuFileText size={13} /> {tr('ov_fin_btn_reviews')}</button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: '0.75rem' }}>
          {[
            { label: tr('ov_fin_kpi_wallet'), value: fmtMoney(walletBalance), sub: tr('ov_fin_sub_all_wallets'), color: 'var(--kpi-cyan)', icon: <LuHistory size={15} /> },
            { label: tr('ov_fin_kpi_deposits'), value: fmtMoney(totalDeposits), sub: tr('ov_fin_sub_approved'), color: 'var(--kpi-purple)', icon: <LuFileText size={15} /> },
            { label: tr('ov_fin_kpi_pending_amt'), value: fmtMoney(pendingPayAmt), sub: tr('ov_fin_sub_awaiting'), color: 'var(--kpi-gold)', icon: <LuTriangleAlert size={15} /> },
            { label: tr('ov_fin_kpi_pending_req'), value: pendingPaymentCount.toString(), sub: tr('ov_fin_sub_queue'), color: 'var(--kpi-green)', icon: <LuCircleCheck size={15} /> },
          ].map(c => (
            <div key={c.label} className="glass" style={{ padding: '0.9rem 1.05rem', borderRadius: '1rem', border: `1px solid color-mix(in srgb, ${c.color} 10%, transparent)`, background: `linear-gradient(135deg,color-mix(in srgb, ${c.color} 4%, transparent),var(--clr-surface))`, display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: c.color }}>
                {c.icon}
                <span style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{c.label}</span>
              </div>
              <div style={{ fontSize: '1.3rem', fontWeight: 900, color: 'var(--clr-text)', letterSpacing: '-0.02em' }}>{loading ? '—' : c.value}</div>
              <div style={{ fontSize: '0.67rem', color: 'var(--clr-muted)' }}>{c.sub}</div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  /* Simulated sparkline (registrations over last 7 days) */
  const last7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i))
    const ds = d.toISOString().slice(0, 10)
    return users.filter(u => u.created_at?.slice(0, 10) === ds).length
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

      {/* ── Page header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.35rem', fontWeight: 900, color: 'var(--clr-text)', margin: 0, letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <LuLayoutDashboard size={20} color="var(--clr-accent)" /> {tr('ov_title')}
          </h1>
          <p style={{ fontSize: '0.78rem', color: 'var(--clr-muted)', margin: '0.2rem 0 0' }}>
            {tr('ov_subtitle_prefix')} · {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button onClick={() => onNav('orders')} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.45rem 0.9rem', borderRadius: '0.6rem', border: '1px solid rgba(97, 148, 31,0.2)', background: 'rgba(97, 148, 31,0.06)', color: 'var(--clr-accent)', fontFamily: 'inherit', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}><LuListOrdered size={13} /> {tr('ov_btn_orders')}</button>
          <button onClick={() => onNav('drivers')} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.45rem 0.9rem', borderRadius: '0.6rem', border: '1px solid rgba(167,139,250,0.2)', background: 'rgba(167,139,250,0.06)', color: 'var(--kpi-purple)', fontFamily: 'inherit', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}><LuTruck size={13} /> {tr('ov_btn_drivers')}</button>
          <button onClick={() => onNav('payments')} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.45rem 0.9rem', borderRadius: '0.6rem', border: '1px solid rgba(74,222,128,0.2)', background: 'rgba(74,222,128,0.06)', color: 'var(--kpi-green)', fontFamily: 'inherit', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}><LuFileText size={13} /> {tr('ov_btn_payments')}</button>
        </div>
      </div>

      {/* ── KPI Hero Row ── */}
      {stats ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: '0.75rem' }}>
          <KpiCard icon={<LuUsers size={15} />} label={tr('ov_kpi_total_users')} value={stats.total_users} color="var(--kpi-cyan)" trend={last7} trendLabel={`${stats.new_today} ${tr('ov_kpi_joined_today')}`} onClick={() => onNav('shippers')} />
          <KpiCard icon={<LuTruck size={15} />} label={tr('ov_kpi_drivers')} value={stats.total_drivers} color="var(--kpi-purple)" sub={`${verifiedDrivers.length} ${tr('ov_kpi_verified')}`} onClick={() => onNav('drivers')} />
          <KpiCard icon={<LuPackage size={15} />} label={tr('ov_kpi_shippers')} value={stats.total_shippers} color="var(--kpi-sky)" onClick={() => onNav('shippers')} />
          <KpiCard icon={<LuListOrdered size={15} />} label={tr('ov_kpi_orders')} value={orderStats?.total_orders ?? 0} color="var(--kpi-green)" onClick={() => onNav('orders')} />
          <KpiCard icon={<LuCircleCheck size={15} />} label={tr('ov_kpi_active')} value={activeUsers.length} color="var(--kpi-gold)" sub={`of ${stats.total_users} accounts`} />
          <KpiCard icon={<LuStar size={15} />} label={tr('ov_kpi_new_today')} value={stats.new_today} color="var(--kpi-orange)" />
        </div>
      ) : <LoadingSpinner />}

      {/* ── Revenue + Finance Row ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: '0.75rem' }}>
        {[
          { label: tr('ov_rev_total_revenue'), value: fmtMoney(totalRevenue), sub: tr('ov_rev_sub_delivered'), color: 'var(--kpi-green)', icon: <LuChartBar size={15} /> },
          { label: tr('ov_rev_wallet'), value: fmtMoney(walletBalance), sub: tr('ov_rev_sub_wallets'), color: 'var(--kpi-cyan)', icon: <LuHistory size={15} /> },
          { label: tr('ov_rev_deposits'), value: fmtMoney(totalDeposits), sub: tr('ov_rev_sub_approved'), color: 'var(--kpi-purple)', icon: <LuFileText size={15} /> },
          { label: tr('ov_rev_pending_pay'), value: fmtMoney(pendingPayAmt), sub: tr('ov_rev_sub_awaiting'), color: 'var(--kpi-gold)', icon: <LuTriangleAlert size={15} /> },
        ].map(c => (
          <div key={c.label} className="glass" style={{ padding: '0.9rem 1.1rem', borderRadius: '1rem', border: `1px solid color-mix(in srgb, ${c.color} 10%, transparent)`, background: `linear-gradient(135deg,color-mix(in srgb, ${c.color} 4%, transparent),var(--clr-surface))`, display: 'flex', flexDirection: 'column', gap: '0.25rem', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: -16, right: -16, width: 64, height: 64, borderRadius: '50%', background: `radial-gradient(circle,color-mix(in srgb, ${c.color} 9%, transparent),transparent 70%)`, pointerEvents: 'none' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: c.color }}>
              {c.icon}
              <span style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{c.label}</span>
            </div>
            <div style={{ fontSize: '1.35rem', fontWeight: 900, color: 'var(--clr-text)', letterSpacing: '-0.02em' }}>{loading ? '—' : c.value}</div>
            <div style={{ fontSize: '0.67rem', color: 'var(--clr-muted)' }}>{c.sub}</div>
          </div>
        ))}
      </div>

      {/* ── Charts row ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: '1rem' }}>

        {/* Order status bar chart */}
        <div className="glass" style={{ padding: '1.1rem 1.25rem', borderRadius: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <div>
              <div style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--clr-text)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}><LuListOrdered size={14} color="var(--clr-accent)" /> Orders by Status</div>
              <div style={{ fontSize: '0.67rem', color: 'var(--clr-muted)', marginTop: '0.1rem' }}>Total: {orderStats?.total_orders ?? 0}</div>
            </div>
            <button onClick={() => onNav('orders')} style={{ fontSize: '0.68rem', padding: '0.25rem 0.6rem', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: 'var(--clr-muted)', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>{tr('ov_chart_view')}</button>
          </div>
          {loading ? <LoadingSpinner /> : statusEntries.length > 0
            ? <BarChart bars={statusEntries} maxVal={maxOrders} />
            : <p style={{ fontSize: '0.8rem', color: 'var(--clr-muted)', textAlign: 'center', padding: '1rem 0' }}>{tr('ov_no_orders')}</p>
          }
        </div>

        {/* User role pie */}
        <div className="glass" style={{ padding: '1.1rem 1.25rem', borderRadius: '1rem' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--clr-text)', display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '1rem' }}>
            <LuUsers size={14} color="var(--kpi-purple)" /> User Distribution
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', flexWrap: 'wrap' }}>
            <PieChart slices={rolePie} size={110} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
              {rolePie.map(s => (
                <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: s.color, flexShrink: 0, boxShadow: `0 0 6px ${s.color}88` }} />
                  <span style={{ fontSize: '0.75rem', color: 'var(--clr-muted)', fontWeight: 600 }}>{s.label}</span>
                  <span style={{ fontSize: '0.78rem', fontWeight: 800, color: s.color, marginLeft: 'auto' }}>{s.value}</span>
                </div>
              ))}
              <div style={{ marginTop: '0.25rem', paddingTop: '0.45rem', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--kpi-green)', flexShrink: 0, boxShadow: '0 0 6px #4ade8088' }} />
                <span style={{ fontSize: '0.75rem', color: 'var(--clr-muted)', fontWeight: 600 }}>Active</span>
                <span style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--kpi-green)', marginLeft: 'auto' }}>{activeUsers.length}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Driver verification status */}
        <div className="glass" style={{ padding: '1.1rem 1.25rem', borderRadius: '1rem' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--clr-text)', display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '1rem' }}>
            <LuBadgeCheck size={14} color="var(--kpi-green)" /> Driver Verification
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
            {[
              { label: tr('ov_drv_verified'), value: verifiedDrivers.length, total: drivers.length, color: 'var(--kpi-green)' },
              { label: tr('ov_drv_pending'), value: unverifiedDrivers.length, total: drivers.length, color: 'var(--kpi-gold)' },
              { label: tr('ov_drv_active_now'), value: activeUsers.filter(u => u.role_id === 3).length, total: drivers.length, color: 'var(--kpi-cyan)' },
            ].map(row => (
              <div key={row.label}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--clr-muted)', fontWeight: 600 }}>{row.label}</span>
                  <span style={{ fontSize: '0.72rem', fontWeight: 800, color: row.color }}>{row.value} <span style={{ color: 'var(--clr-muted)', fontWeight: 500 }}>/ {row.total}</span></span>
                </div>
                <div style={{ height: 6, borderRadius: 99, background: 'rgba(255,255,255,0.04)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: row.total ? `${(row.value / row.total) * 100}%` : '0%', borderRadius: 99, background: row.color, boxShadow: `0 0 6px ${row.color}66`, animation: 'progress-fill 1.2s cubic-bezier(0.4,0,0.2,1) both' }} />
                </div>
              </div>
            ))}
            {pendingVerif.length > 0 && (
              <button onClick={() => onNav('verify-drivers')} style={{ marginTop: '0.35rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', padding: '0.5rem', borderRadius: '0.6rem', border: '1px solid rgba(251,191,36,0.3)', background: 'rgba(251,191,36,0.06)', color: 'var(--kpi-gold)', fontFamily: 'inherit', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}>
                <LuTriangleAlert size={13} /> {pendingVerif.length} {tr('ov_drv_awaiting')}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── 7-Day registrations sparkline row ── */}
      <div className="glass" style={{ padding: '1.1rem 1.25rem', borderRadius: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--clr-text)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <LuStar size={14} color="var(--kpi-orange)" /> Registrations — Last 7 Days
          </div>
          <span style={{ fontSize: '0.68rem', color: 'var(--clr-muted)' }}>total: {last7.reduce((a, b) => a + b, 0)} {tr('ov_reg_new_users')}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.3rem', height: 56 }}>
          {last7.map((v, i) => {
            const maxV = Math.max(...last7, 1)
            const h = Math.max(4, (v / maxV) * 48)
            const label = new Date(Date.now() - (6 - i) * 86400000).toLocaleDateString('en-US', { weekday: 'short' })
            return (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.2rem' }}>
                <div style={{ fontSize: '0.62rem', fontWeight: 700, color: v > 0 ? 'var(--kpi-orange)' : 'var(--clr-muted)' }}>{v || ''}</div>
                <div style={{ width: '100%', height: h, borderRadius: '4px 4px 2px 2px', background: v > 0 ? 'linear-gradient(180deg,#fb923c,#f97316)' : 'rgba(255,255,255,0.05)', boxShadow: v > 0 ? '0 0 8px #fb923c44' : 'none', animation: 'progress-fill 0.8s ease both', animationDelay: `${i * 80}ms`, transformOrigin: 'bottom' }} />
                <div style={{ fontSize: '0.6rem', color: 'var(--clr-muted)' }}>{label}</div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Bottom grid: Recent registrations + Quick actions ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: '1rem' }}>

        {/* Recent users */}
        <div className="glass" style={{ borderRadius: '1rem', overflow: 'hidden' }}>
          <div style={{ padding: '0.9rem 1.1rem', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--clr-text)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}><LuHistory size={14} color="var(--clr-accent)" /> Recent Registrations</div>
            <button onClick={() => onNav('shippers')} style={{ fontSize: '0.68rem', padding: '0.25rem 0.55rem', borderRadius: 6, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.04)', color: 'var(--clr-muted)', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>{tr('ov_view_all')}</button>
          </div>
          {recent.length === 0 ? (
            <p style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--clr-muted)', fontSize: '0.82rem' }}>{tr('ov_no_users')}</p>
          ) : recent.map((u, i) => (
            <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', padding: '0.65rem 1rem', borderBottom: i < recent.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none', transition: 'background .15s' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.025)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
              <UserAvatar u={u} size={30} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: '0.82rem', color: 'var(--clr-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.first_name} {u.last_name}</div>
                <div style={{ fontSize: '0.68rem', color: 'var(--clr-muted)' }}>{u.phone_number}</div>
              </div>
              <RoleBadge roleId={u.role_id} roleName={u.role_name} />
            </div>
          ))}
        </div>

        {/* Quick stats + shortcuts */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>

          {/* Pending actions card */}
          <div className="glass" style={{ padding: '1rem 1.1rem', borderRadius: '1rem', border: '1px solid rgba(251,191,36,0.15)', background: 'linear-gradient(135deg,rgba(251,191,36,0.05),var(--clr-surface))' }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--kpi-gold)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}><LuTriangleAlert size={13} /> Action Required</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
              {[
                { label: tr('ov_action_drv_verif'), value: pendingVerif.length, nav: 'verify-drivers' as AdminSection, color: 'var(--kpi-gold)' },
                { label: tr('ov_action_pay_review'), value: '—', nav: 'payments' as AdminSection, color: 'var(--kpi-orange)' },
                { label: tr('ov_action_unverified'), value: users.filter(u => !u.is_phone_verified).length, nav: 'shippers' as AdminSection, color: '#f87171' },
              ].map(row => (
                <div key={row.label} onClick={() => onNav(row.nav)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0.75rem', borderRadius: '0.6rem', background: 'rgba(255,255,255,0.03)', border: `1px solid ${row.color}1a`, cursor: 'pointer', transition: 'background .15s' }}
                  onMouseEnter={e => (e.currentTarget.style.background = `${row.color}0a`)}
                  onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}>
                  <span style={{ fontSize: '0.74rem', color: 'var(--clr-muted)', fontWeight: 500 }}>{row.label}</span>
                  <span style={{ fontSize: '0.8rem', fontWeight: 800, color: row.color }}>{row.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Quick nav tiles */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.55rem' }}>
            {([
              { id: 'orders' as AdminSection, icon: <LuListOrdered size={18} />, label: tr('ov_btn_orders'), color: 'var(--kpi-green)' },
              { id: 'live-drivers' as AdminSection, icon: <LuMapPin size={18} />, label: tr('ov_quick_live_map'), color: 'var(--kpi-cyan)' },
              { id: 'payments' as AdminSection, icon: <LuFileText size={18} />, label: tr('ov_btn_payments'), color: 'var(--kpi-purple)' },
              { id: 'reports' as AdminSection, icon: <LuChartBar size={18} />, label: tr('ov_quick_reports'), color: 'var(--kpi-orange)' },
            ] as const).map(tile => (
              <button key={tile.id} onClick={() => onNav(tile.id as AdminSection)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', padding: '0.85rem 0.5rem', borderRadius: '0.85rem', border: `1px solid ${tile.color}20`, background: `${tile.color}07`, color: tile.color, fontFamily: 'inherit', fontSize: '0.73rem', fontWeight: 700, cursor: 'pointer', transition: 'all .18s' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = `${tile.color}14`; (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = `${tile.color}07`; (e.currentTarget as HTMLElement).style.transform = '' }}>
                {tile.icon}{tile.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}


// ─── Users list section ───────────────────────────────────────────────────────

// ─── Customer section (Shippers / Drivers) ───────────────────────────────────

function CustomerSection({ allUsers, loading, onToggleActive, onRefresh }: {
  allUsers: UserRow[]; loading: boolean
  onToggleActive: (u: UserRow) => void; onRefresh: () => void
}) {
  const { t: tr } = useLanguage()
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<UserRow | null>(null)
  const filtered = allUsers.filter(u => {
    const q = search.toLowerCase()
    return !q || u.first_name.toLowerCase().includes(q) || u.last_name.toLowerCase().includes(q) || u.phone_number.includes(q) || (u.email ?? '').toLowerCase().includes(q)
  })

  const handleToggle = (u: UserRow) => {
    onToggleActive(u)
    if (selected?.id === u.id) setSelected({ ...u, is_active: u.is_active ? 0 : 1 })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--clr-text)', flex: 1 }}>{tr('usr_title')}</h2>
        <button onClick={onRefresh} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.3rem 0.7rem', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: 'var(--clr-muted)', fontFamily: 'inherit', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer' }}>
          <LuRefreshCw size={12} /> {tr('usr_refresh')}
        </button>
      </div>
      <div className="input-wrap">
        <input id="cs-search" type="text" placeholder=" " value={search} onChange={e => setSearch(e.target.value)} />
        <label htmlFor="cs-search"><LuSearch size={12} style={{ verticalAlign: 'middle', marginRight: '0.3rem' }} />{tr('usr_search_ph')}</label>
      </div>
      {loading ? <LoadingSpinner /> : (
        <div className="glass-inner" style={{ overflow: 'hidden' }}>
          {filtered.length === 0 ? (
            <p style={{ padding: '2rem', textAlign: 'center', color: 'var(--clr-muted)', fontSize: '0.875rem' }}>{tr('usr_none')}</p>
          ) : filtered.map((u, i) => (
            <div key={u.id} onClick={() => setSelected(u)} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.85rem 1rem', borderBottom: i < filtered.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none', flexWrap: 'wrap', cursor: 'pointer', transition: 'background 0.15s' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
              <UserAvatar u={u} size={40} />
              <div style={{ flex: 1, minWidth: 110 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--clr-text)' }}>{u.first_name} {u.last_name}</span>
                  <RoleBadge roleId={u.role_id} roleName={u.role_name} />
                  {userIsVerified(u) && <VerifiedBadge />}
                  {!u.is_active && <span className="badge badge-red" style={{ fontSize: '0.67rem' }}>{tr('usr_suspended_badge')}</span>}
                </div>
                <p style={{ fontSize: '0.75rem', color: 'var(--clr-muted)', marginTop: '0.15rem' }}>{u.phone_number}</p>
                {u.email && <p style={{ fontSize: '0.7rem', color: 'var(--clr-muted)' }}>{u.email}</p>}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.3rem', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                <span style={{ fontSize: '0.68rem', color: 'var(--clr-muted)' }}>{new Date(u.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                <button onClick={() => handleToggle(u)} style={{ padding: '0.28rem 0.65rem', borderRadius: 7, border: '1px solid', borderColor: u.is_active ? 'rgba(239,68,68,0.35)' : 'rgba(74,222,128,0.35)', background: u.is_active ? 'rgba(239,68,68,0.08)' : 'rgba(74,222,128,0.08)', color: u.is_active ? '#fca5a5' : 'var(--kpi-green)', fontFamily: 'inherit', fontSize: '0.7rem', fontWeight: 600, cursor: 'pointer' }}>
                  {u.is_active ? tr('usr_suspend_btn') : tr('usr_activate_btn')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <p style={{ fontSize: '0.73rem', color: 'var(--clr-muted)', textAlign: 'right' }}>{filtered.length} {tr('usr_shown')}</p>

      {/* Detail modal */}
      {selected && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }} onClick={() => setSelected(null)}>
          <div className="glass" style={{ borderRadius: 18, padding: '1.5rem', maxWidth: 440, width: '100%', position: 'relative', boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }} onClick={e => e.stopPropagation()}>
            <button onClick={() => setSelected(null)} style={{ position: 'absolute', top: '0.85rem', right: '0.85rem', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--clr-muted)' }}><LuX size={18} /></button>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.4rem' }}>
              <UserAvatar u={selected} size={56} />
              <div>
                <p style={{ fontWeight: 800, fontSize: '1.05rem', color: 'var(--clr-text)' }}>{selected.first_name} {selected.last_name}</p>
                <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.25rem', flexWrap: 'wrap' }}>
                  <RoleBadge roleId={selected.role_id} roleName={selected.role_name} />
                  {userIsVerified(selected) && <VerifiedBadge />}
                  {!selected.is_active && <span className="badge badge-red" style={{ fontSize: '0.67rem' }}>{tr('usr_suspended_badge')}</span>}
                </div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem 1.5rem', fontSize: '0.8rem', marginBottom: '1.25rem' }}>
              {[
                { label: tr('usr_phone'), value: selected.phone_number },
                { label: tr('usr_email'), value: selected.email || '—' },
                { label: tr('usr_phone_verified'), value: selected.is_phone_verified ? tr('usr_yes') : tr('usr_no'), clr: selected.is_phone_verified ? 'var(--kpi-green)' : '#fca5a5' },
                { label: tr('usr_email_verified'), value: selected.is_email_verified ? tr('usr_yes') : tr('usr_no'), clr: selected.is_email_verified ? 'var(--kpi-green)' : '#fca5a5' },
                { label: tr('usr_status'), value: selected.is_active ? tr('usr_active_val') : tr('usr_suspended_val'), clr: selected.is_active ? 'var(--kpi-green)' : '#fca5a5' },
                { label: tr('usr_registered'), value: new Date(selected.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) },
              ].map(r => (
                <div key={r.label}>
                  <p style={{ color: 'var(--clr-muted)', marginBottom: '0.15rem', fontSize: '0.72rem' }}>{r.label}</p>
                  <p style={{ color: r.clr ?? 'var(--clr-text)', fontWeight: 600 }}>{r.value}</p>
                </div>
              ))}
            </div>
            <button onClick={() => handleToggle(selected)} style={{ width: '100%', padding: '0.6rem', borderRadius: 10, border: '1px solid', borderColor: selected.is_active ? 'rgba(239,68,68,0.35)' : 'rgba(74,222,128,0.35)', background: selected.is_active ? 'rgba(239,68,68,0.1)' : 'rgba(74,222,128,0.1)', color: selected.is_active ? '#fca5a5' : 'var(--kpi-green)', fontFamily: 'inherit', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer' }}>
              {selected.is_active ? tr('usr_suspend_user') : tr('usr_activate_user')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Staff management section ─────────────────────────────────────────────────

function StaffManagementSection({ allUsers, loading, onToggleActive, onRefresh }: {
  allUsers: UserRow[]; loading: boolean
  onToggleActive: (u: UserRow) => void; onRefresh: () => void
}) {
  const { t: tr } = useLanguage()
  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [editTarget, setEditTarget] = useState<UserRow | null>(null)
  const [formErr, setFormErr] = useState('')
  const [saving, setSaving] = useState(false)
  const [staffRoleOptions, setStaffRoleOptions] = useState<{ id: number; label: string }[]>([])

  // Load available staff roles dynamically from API
  useEffect(() => {
    adminOrderApi.getStaffRoles().then(({ data }) => {
      setStaffRoleOptions((data.roles ?? []).map((r: { id: number; role_name: string }) => ({ id: r.id, label: r.role_name })))
    }).catch(() => {
      // fallback to system defaults if API fails
      setStaffRoleOptions([{ id: 1, label: 'Admin' }, { id: 4, label: 'Cashier' }, { id: 5, label: 'Dispatcher' }])
    })
  }, [])

  // Create form state
  const [cFirst, setCFirst] = useState(''); const [cLast, setCLast] = useState('')
  const [cPhone, setCPhone] = useState(''); const [cEmail, setCEmail] = useState('')
  const [cRole, setCRole] = useState<number>(4)
  const [cPass, setCPass] = useState(''); const [showCPass, setShowCPass] = useState(false)

  // Edit form state
  const [eFirst, setEFirst] = useState(''); const [eLast, setELast] = useState('')
  const [eEmail, setEEmail] = useState(''); const [eRole, setERole] = useState<number>(4)
  const [ePass, setEPass] = useState(''); const [showEPass, setShowEPass] = useState(false)

  const filtered = allUsers.filter(u => {
    const q = search.toLowerCase()
    return !q || u.first_name.toLowerCase().includes(q) || u.last_name.toLowerCase().includes(q) || u.phone_number.includes(q) || (u.email ?? '').toLowerCase().includes(q)
  })

  const openEdit = (u: UserRow) => {
    setEFirst(u.first_name); setELast(u.last_name)
    setEEmail(u.email ?? ''); setERole(u.role_id); setEPass('')
    setFormErr(''); setEditTarget(u)
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!cFirst.trim() || !cPhone.trim() || !cPass) { setFormErr(tr('stf_err_required')); return }
    if (cPass.length < 6) { setFormErr(tr('stf_err_pass_len')); return }
    setFormErr(''); setSaving(true)
    try {
      await apiClient.post('/admin/staff', { first_name: cFirst.trim(), last_name: cLast.trim(), phone_number: cPhone.trim(), email: cEmail.trim() || undefined, role_id: cRole, password: cPass })
      setCFirst(''); setCLast(''); setCPhone(''); setCEmail(''); setCPass(''); setCRole(4)
      setShowCreate(false); onRefresh()
    } catch (err: any) { setFormErr(err.response?.data?.message ?? tr('stf_err_create')) }
    finally { setSaving(false) }
  }

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editTarget) return
    if (!eFirst.trim()) { setFormErr(tr('stf_err_name')); return }
    setFormErr(''); setSaving(true)
    try {
      await apiClient.put(`/admin/users/${editTarget.id}`, { first_name: eFirst.trim(), last_name: eLast.trim(), email: eEmail.trim() || null, role_id: eRole, new_password: ePass || undefined })
      setEditTarget(null); onRefresh()
    } catch (err: any) { setFormErr(err.response?.data?.message ?? tr('stf_err_edit')) }
    finally { setSaving(false) }
  }

  const inputStyle: React.CSSProperties = { width: '100%', padding: '0.6rem 0.8rem', borderRadius: 10, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)', color: 'var(--clr-text)', fontFamily: 'inherit', fontSize: '0.85rem', boxSizing: 'border-box' }
  const labelStyle: React.CSSProperties = { fontSize: '0.75rem', fontWeight: 600, color: 'var(--clr-muted)', marginBottom: '0.35rem', display: 'block' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--clr-text)', flex: 1 }}>{tr('stf_title')}</h2>
        <button onClick={onRefresh} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.3rem 0.7rem', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: 'var(--clr-muted)', fontFamily: 'inherit', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer' }}>
          <LuRefreshCw size={12} /> {tr('stf_refresh')}
        </button>
        <button onClick={() => { setFormErr(''); setShowCreate(true) }} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.42rem 0.9rem', borderRadius: 9, border: 'none', background: 'var(--clr-accent)', color: '#000', fontFamily: 'inherit', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer' }}>
          <LuUserPlus size={14} /> {tr('stf_add_btn')}
        </button>
      </div>
      <div className="input-wrap">
        <input id="sf-search" type="text" placeholder=" " value={search} onChange={e => setSearch(e.target.value)} />
        <label htmlFor="sf-search"><LuSearch size={12} style={{ verticalAlign: 'middle', marginRight: '0.3rem' }} />{tr('stf_search_ph')}</label>
      </div>
      {loading ? <LoadingSpinner /> : (
        <div className="glass-inner" style={{ overflow: 'hidden' }}>
          {filtered.length === 0 ? (
            <p style={{ padding: '2rem', textAlign: 'center', color: 'var(--clr-muted)', fontSize: '0.875rem' }}>{tr('stf_none')}</p>
          ) : filtered.map((u, i) => (
            <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.85rem 1rem', borderBottom: i < filtered.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none', flexWrap: 'wrap' }}>
              <UserAvatar u={u} size={40} />
              <div style={{ flex: 1, minWidth: 110 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--clr-text)' }}>{u.first_name} {u.last_name}</span>
                  <RoleBadge roleId={u.role_id} roleName={u.role_name} />
                  {!u.is_active && <span className="badge badge-red" style={{ fontSize: '0.67rem' }}>{tr('stf_suspended_badge')}</span>}
                </div>
                <p style={{ fontSize: '0.75rem', color: 'var(--clr-muted)', marginTop: '0.15rem' }}>{u.phone_number}</p>
                {u.email && <p style={{ fontSize: '0.7rem', color: 'var(--clr-muted)' }}>{u.email}</p>}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}>
                <button onClick={() => openEdit(u)} style={{ padding: '0.28rem 0.55rem', borderRadius: 7, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)', color: 'var(--clr-muted)', fontFamily: 'inherit', fontSize: '0.7rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <LuPencil size={11} /> {tr('stf_edit_btn')}
                </button>
                <button onClick={() => onToggleActive(u)} style={{ padding: '0.28rem 0.65rem', borderRadius: 7, border: '1px solid', borderColor: u.is_active ? 'rgba(239,68,68,0.35)' : 'rgba(74,222,128,0.35)', background: u.is_active ? 'rgba(239,68,68,0.08)' : 'rgba(74,222,128,0.08)', color: u.is_active ? '#fca5a5' : 'var(--kpi-green)', fontFamily: 'inherit', fontSize: '0.7rem', fontWeight: 600, cursor: 'pointer' }}>
                  {u.is_active ? tr('stf_suspend_btn') : tr('stf_activate_btn')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <p style={{ fontSize: '0.73rem', color: 'var(--clr-muted)', textAlign: 'right' }}>{filtered.length} {tr('stf_count')}</p>

      {/* Create staff modal */}
      {showCreate && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }} onClick={() => setShowCreate(false)}>
          <div className="glass" style={{ borderRadius: 18, padding: '1.5rem', maxWidth: 440, width: '100%', position: 'relative', boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }} onClick={e => e.stopPropagation()}>
            <button onClick={() => setShowCreate(false)} style={{ position: 'absolute', top: '0.85rem', right: '0.85rem', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--clr-muted)' }}><LuX size={18} /></button>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1.25rem' }}>
              <LuUserPlus size={20} color="var(--clr-accent)" />
              <h3 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--clr-text)' }}>{tr('stf_create_title')}</h3>
            </div>
            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem' }}>
                <div>
                  <label style={labelStyle}>{tr('stf_first_name')}</label>
                  <input style={inputStyle} placeholder={tr('stf_first_ph')} value={cFirst} onChange={e => setCFirst(e.target.value)} required />
                </div>
                <div>
                  <label style={labelStyle}>{tr('stf_last_name')}</label>
                  <input style={inputStyle} placeholder={tr('stf_last_ph')} value={cLast} onChange={e => setCLast(e.target.value)} />
                </div>
              </div>
              <div>
                <label style={labelStyle}>{tr('stf_phone')}</label>
                <input style={inputStyle} placeholder="+2519..." value={cPhone} onChange={e => setCPhone(e.target.value)} required />
              </div>
              <div>
                <label style={labelStyle}>{tr('stf_email_opt')}</label>
                <input style={inputStyle} type="email" placeholder="email@example.com" value={cEmail} onChange={e => setCEmail(e.target.value)} />
              </div>
              <div>
                <label style={labelStyle}>{tr('stf_role')}</label>
                <CustomSelect value={cRole} onChange={setCRole} options={staffRoleOptions} />
              </div>
              <div>
                <label style={labelStyle}>{tr('stf_password')}</label>
                <div style={{ position: 'relative' }}>
                  <input style={{ ...inputStyle, paddingRight: '2.5rem' }} type={showCPass ? 'text' : 'password'} placeholder={tr('stf_pass_ph')} value={cPass} onChange={e => setCPass(e.target.value)} required />
                  <button type="button" onClick={() => setShowCPass(v => !v)} style={{ position: 'absolute', right: '0.65rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--clr-muted)', padding: 0 }}>
                    {showCPass ? <LuEyeOff size={15} /> : <LuEye size={15} />}
                  </button>
                </div>
              </div>
              {formErr && <p style={{ color: '#fca5a5', fontSize: '0.8rem', margin: 0 }}>{formErr}</p>}
              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.25rem' }}>
                <button type="button" onClick={() => setShowCreate(false)} style={{ flex: 1, padding: '0.6rem', borderRadius: 10, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)', color: 'var(--clr-muted)', fontFamily: 'inherit', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}>{tr('stf_cancel')}</button>
                <button type="submit" disabled={saving} style={{ flex: 2, padding: '0.6rem', borderRadius: 10, border: 'none', background: 'var(--clr-accent)', color: '#000', fontFamily: 'inherit', fontSize: '0.85rem', fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1 }}>
                  {saving ? tr('stf_creating') : tr('stf_create_submit')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit staff modal */}
      {editTarget && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }} onClick={() => setEditTarget(null)}>
          <div className="glass" style={{ borderRadius: 18, padding: '1.5rem', maxWidth: 440, width: '100%', position: 'relative', boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }} onClick={e => e.stopPropagation()}>
            <button onClick={() => setEditTarget(null)} style={{ position: 'absolute', top: '0.85rem', right: '0.85rem', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--clr-muted)' }}><LuX size={18} /></button>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1.25rem' }}>
              <LuPencil size={18} color="var(--clr-accent)" />
              <h3 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--clr-text)' }}>{tr('stf_edit_title')} {editTarget.first_name} {editTarget.last_name}</h3>
            </div>
            <form onSubmit={handleEdit} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem' }}>
                <div>
                  <label style={labelStyle}>{tr('stf_first_name')}</label>
                  <input style={inputStyle} placeholder={tr('stf_first_ph')} value={eFirst} onChange={e => setEFirst(e.target.value)} required />
                </div>
                <div>
                  <label style={labelStyle}>{tr('stf_last_name')}</label>
                  <input style={inputStyle} placeholder={tr('stf_last_ph')} value={eLast} onChange={e => setELast(e.target.value)} />
                </div>
              </div>
              <div>
                <label style={labelStyle}>{tr('stf_email_label')}</label>
                <input style={inputStyle} type="email" placeholder="email@example.com" value={eEmail} onChange={e => setEEmail(e.target.value)} />
              </div>
              <div>
                <label style={labelStyle}>{tr('stf_role_label')}</label>
                <CustomSelect value={eRole} onChange={setERole} options={staffRoleOptions} />
              </div>
              <div>
                <label style={labelStyle}>{tr('stf_new_pass')}</label>
                <div style={{ position: 'relative' }}>
                  <input style={{ ...inputStyle, paddingRight: '2.5rem' }} type={showEPass ? 'text' : 'password'} placeholder={tr('stf_new_pass_ph')} value={ePass} onChange={e => setEPass(e.target.value)} />
                  <button type="button" onClick={() => setShowEPass(v => !v)} style={{ position: 'absolute', right: '0.65rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--clr-muted)', padding: 0 }}>
                    {showEPass ? <LuEyeOff size={15} /> : <LuEye size={15} />}
                  </button>
                </div>
              </div>
              {formErr && <p style={{ color: '#fca5a5', fontSize: '0.8rem', margin: 0 }}>{formErr}</p>}
              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.25rem' }}>
                <button type="button" onClick={() => setEditTarget(null)} style={{ flex: 1, padding: '0.6rem', borderRadius: 10, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)', color: 'var(--clr-muted)', fontFamily: 'inherit', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}>{tr('stf_cancel')}</button>
                <button type="submit" disabled={saving} style={{ flex: 2, padding: '0.6rem', borderRadius: 10, border: 'none', background: 'var(--clr-accent)', color: '#000', fontFamily: 'inherit', fontSize: '0.85rem', fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1 }}>
                  {saving ? tr('stf_saving') : tr('stf_save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Profile section (embedded, no aurora-bg wrapper) ────────────────────────

function ProfileSection({ adminTheme, onThemeChange }: { adminTheme: 'LIGHT' | 'DARK'; onThemeChange: (t: 'LIGHT' | 'DARK') => void }) {
  const { t: tr } = useLanguage()
  const { user, updateUser, refreshUser } = useAuth()
  const [activeTab, setActiveTab] = useState<ProfileTab>('profile')

  const roleLabel = user?.role_id === 1 ? 'Admin' : user?.role_id === 2 ? 'Shipper' : user?.role_id === 3 ? 'Driver' : user?.role_name ?? 'User'
  const roleIcon = user?.role_id === 1 ? <LuShield size={28} /> : user?.role_id === 2 ? <LuPackage size={28} /> : user?.role_id === 3 ? <LuTruck size={28} /> : <LuUser size={28} />

  // Photo
  const photoInput = useRef<HTMLInputElement>(null)
  const [photoLoading, setPhotoLoading] = useState(false)
  const [photoError, setPhotoError] = useState('')
  const handlePhotoChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return
    if (file.size > 5 * 1024 * 1024) { setPhotoError(tr('prf_photo_err_size')); return }
    setPhotoError(''); setPhotoLoading(true)
    const reader = new FileReader()
    reader.onload = async () => {
      try {
        await authApi.updateProfile({ profile_photo_base64: reader.result as string, profile_photo_filename: file.name })
        await refreshUser()
      } catch (err: any) { setPhotoError(err.response?.data?.message || tr('prf_photo_err_fail')) }
      finally { setPhotoLoading(false); if (photoInput.current) photoInput.current.value = '' }
    }
    reader.readAsDataURL(file)
  }
  const handleDeletePhoto = async () => {
    setPhotoError(''); setPhotoLoading(true)
    try { await authApi.deleteProfilePhoto(); updateUser({ profile_photo_url: null }) }
    catch (err: any) { setPhotoError(err.response?.data?.message || tr('prf_photo_err_fail')) }
    finally { setPhotoLoading(false) }
  }

  // Name
  const [editFirst, setEditFirst] = useState(user?.first_name ?? '')
  const [editLast, setEditLast] = useState(user?.last_name ?? '')
  const [nameLoading, setNameLoading] = useState(false)
  const [nameError, setNameError] = useState('')
  const [nameSuccess, setNameSuccess] = useState(false)
  const handleSaveName = async (e: FormEvent) => {
    e.preventDefault()
    if (!editFirst.trim()) { setNameError(tr('prf_name_err_req')); return }
    setNameError(''); setNameLoading(true)
    try {
      await authApi.updateProfile({ first_name: editFirst.trim(), last_name: editLast.trim() })
      updateUser({ first_name: editFirst.trim(), last_name: editLast.trim() })
      setNameSuccess(true); setTimeout(() => setNameSuccess(false), 3000)
    } catch (err: any) { setNameError(err.response?.data?.message || tr('prf_photo_err_fail')) }
    finally { setNameLoading(false) }
  }

  // Password
  const [showPwForm, setShowPwForm] = useState(false)
  const [currentPw, setCurrentPw] = useState(''); const [newPw, setNewPw] = useState(''); const [confirmPw, setConfirmPw] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [pwLoading, setPwLoading] = useState(false); const [pwError, setPwError] = useState(''); const [pwSuccess, setPwSuccess] = useState(false)
  const handleChangePassword = async (e: FormEvent) => {
    e.preventDefault()
    if (newPw !== confirmPw) { setPwError(tr('prf_pw_no_match')); return }
    if (newPw.length < 6) { setPwError(tr('prf_pw_min_chars')); return }
    setPwError(''); setPwLoading(true)
    try { await authApi.changePassword(currentPw, newPw); setPwSuccess(true); setCurrentPw(''); setNewPw(''); setConfirmPw(''); setTimeout(() => { setPwSuccess(false); setShowPwForm(false) }, 2500) }
    catch (err: any) { setPwError(err.response?.data?.message || tr('prf_photo_err_fail')) }
    finally { setPwLoading(false) }
  }

  // Email
  const [showEmailForm, setShowEmailForm] = useState(false)
  const [emailInput, setEmailInput] = useState('')
  const [emailLoading, setEmailLoading] = useState(false); const [emailError, setEmailError] = useState(''); const [emailSent, setEmailSent] = useState(false)
  const handleLinkEmail = async (e: FormEvent) => {
    e.preventDefault(); setEmailError(''); setEmailLoading(true)
    try { await authApi.requestEmailLink(emailInput); setEmailSent(true) }
    catch (err: any) { setEmailError(err.response?.data?.message || tr('prf_photo_err_fail')) }
    finally { setEmailLoading(false) }
  }

  // Phone change
  const [showPhoneForm, setShowPhoneForm] = useState(false)
  const [phoneStep, setPhoneStep] = useState<'input' | 'otp'>('input')
  const [newPhone, setNewPhone] = useState(''); const [phoneOtp, setPhoneOtp] = useState('')
  const [phoneLoading, setPhoneLoading] = useState(false); const [phoneError, setPhoneError] = useState(''); const [phoneSuccess, setPhoneSuccess] = useState(false)
  const handleRequestPhoneOtp = async (e: FormEvent) => {
    e.preventDefault()
    const n = normalisePhone(newPhone ?? ''); if (!n) { setPhoneError(tr('prf_phone_invalid')); return }
    setPhoneError(''); setPhoneLoading(true)
    try { await authApi.requestPhoneChange(n); setPhoneStep('otp') }
    catch (err: any) { setPhoneError(err.response?.data?.message || tr('prf_photo_err_fail')) }
    finally { setPhoneLoading(false) }
  }
  const handleVerifyPhoneOtp = async (e: FormEvent) => {
    e.preventDefault()
    const n = normalisePhone(newPhone ?? ''); setPhoneError(''); setPhoneLoading(true)
    try { await authApi.verifyPhoneChange(n, phoneOtp); updateUser({ phone_number: n }); setPhoneSuccess(true); setTimeout(() => { setPhoneSuccess(false); setShowPhoneForm(false); setPhoneStep('input'); setNewPhone(''); setPhoneOtp('') }, 2500) }
    catch (err: any) { setPhoneError(err.response?.data?.message || tr('prf_phone_invalid_otp')) }
    finally { setPhoneLoading(false) }
  }

  // Delete account
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState('')
  const [deleteLoading, setDeleteLoading] = useState(false); const [deleteError, setDeleteError] = useState('')
  const handleDeleteAccount = async () => {
    if (deleteConfirm !== 'DELETE') { setDeleteError(tr('prf_del_input_label')); return }
    setDeleteError(''); setDeleteLoading(true)
    try { throw new Error('Account deletion not yet enabled.') }
    catch (err: any) { setDeleteError(err.message || tr('prf_photo_err_fail')); setDeleteLoading(false) }
  }

  const photoUrl = user?.profile_photo_url
  const tabs: { id: ProfileTab; icon: React.ReactNode; label: string }[] = [
    { id: 'profile', icon: <LuUser size={14} />, label: tr('prf_tab_profile') },
    { id: 'security', icon: <LuLock size={14} />, label: tr('prf_tab_security') },
    { id: 'contact', icon: <LuContact size={14} />, label: tr('prf_tab_contact') },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Header card */}
      <div className="glass" style={{ padding: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <div style={{ width: 72, height: 72, borderRadius: '50%', background: photoUrl ? 'transparent' : 'linear-gradient(135deg,var(--clr-accent2),var(--clr-accent))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.9rem', overflow: 'hidden', border: '2.5px solid rgba(97, 148, 31,0.3)', boxShadow: '0 0 20px rgba(97, 148, 31,0.2)' }}>
              {photoUrl ? <img src={photoUrl} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : roleIcon}
            </div>
            <button {...{ title: tr('prf_photo_title') }} onClick={() => photoInput.current?.click()} disabled={photoLoading} style={{ position: 'absolute', bottom: 0, right: 0, width: 24, height: 24, borderRadius: '50%', background: 'var(--clr-accent)', border: '2px solid rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: '0.68rem' }}>
              {photoLoading ? '…' : <LuCamera size={12} />}
            </button>
            <input ref={photoInput} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }} onChange={handlePhotoChange} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <h1 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--clr-text)' }}>{user?.first_name} {user?.last_name}</h1>
              <span className="badge badge-cyan">{roleLabel}</span>
            </div>
            <p style={{ color: 'var(--clr-muted)', fontSize: '0.82rem', marginTop: '0.15rem' }}>{user?.phone_number}</p>
            {user?.email && <p style={{ color: 'var(--clr-muted)', fontSize: '0.76rem', marginTop: '0.1rem' }}>{user.email} {user.is_email_verified ? <span style={{ color: 'var(--kpi-green)', fontSize: '0.7rem', display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}><LuCircleCheck size={11} /></span> : <span style={{ color: 'var(--kpi-gold)', fontSize: '0.7rem' }}>{tr('prf_email_pending')}</span>}</p>}
            {photoError && <p style={{ color: '#fca5a5', fontSize: '0.75rem', marginTop: '0.25rem' }}>{photoError}</p>}
            {photoUrl && <button className="btn-outline" style={{ marginTop: '0.4rem', fontSize: '0.71rem', padding: '0.25rem 0.65rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }} onClick={handleDeletePhoto} disabled={photoLoading}><LuTrash2 size={11} /> {tr('prf_photo_remove')}</button>}
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: '0.4rem', background: 'var(--adm-tab-bg)', borderRadius: 12, padding: '0.3rem' }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} style={{ flex: 1, padding: '0.5rem', border: 'none', borderRadius: 9, background: activeTab === t.id ? 'var(--adm-nav-active-bg)' : 'transparent', color: activeTab === t.id ? 'var(--clr-accent)' : 'var(--clr-muted)', fontFamily: 'inherit', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', transition: 'all 0.18s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem', outline: activeTab === t.id ? '1px solid var(--adm-nav-active-brd)' : 'none' }}>
            <span>{t.icon}</span>{t.label}
          </button>
        ))}
      </div>

      {/* Profile tab */}
      {activeTab === 'profile' && (
        <div className="glass step-enter" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
          <h2 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--clr-text)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}><LuUser size={15} /> {tr('prf_section_title')}</h2>
          <div className="glass-inner" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            <InfoRow icon={<LuIdCard size={14} />} label={tr('prf_info_id')} value={user?.id ? user.id.slice(0, 8) + '…' : '—'} />
            <InfoRow icon={<LuPhone size={14} />} label={tr('prf_info_phone')} value={user?.phone_number ?? '—'} />
            <InfoRow icon={<LuMail size={14} />} label={tr('prf_info_email')} value={user?.email || tr('prf_info_email_none')} />
            <InfoRow icon={<LuShield size={14} />} label={tr('prf_info_role')} value={roleLabel} />
            <InfoRow icon={<LuCircleCheck size={14} />} label={tr('prf_info_status')} value={user?.is_active ? tr('prf_info_active') : tr('prf_info_suspended')} />
          </div>
          <Divider />
          <form onSubmit={handleSaveName} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <p style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--clr-text)' }}>Display Name</p>
            {nameError && <div className="alert alert-error"><LuTriangleAlert size={13} /> {nameError}</div>}
            {nameSuccess && <div className="alert alert-success" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}><LuCheck size={13} /> {tr('prf_name_saved')}</div>}
            <div style={{ display: 'flex', gap: '0.6rem' }}>
              <div className="input-wrap" style={{ flex: 1 }}><input id="ef2" type="text" placeholder=" " value={editFirst} onChange={e => setEditFirst(e.target.value)} required /><label htmlFor="ef2">{tr('prf_first_name')}</label></div>
              <div className="input-wrap" style={{ flex: 1 }}><input id="el2" type="text" placeholder=" " value={editLast} onChange={e => setEditLast(e.target.value)} /><label htmlFor="el2">{tr('prf_last_name')}</label></div>
            </div>
            <button type="submit" className="btn-primary" disabled={nameLoading}>{nameLoading ? <BtnSpinner text={tr('prf_name_saving')} /> : tr('prf_name_save')}</button>
          </form>
          <Divider />
          {/* Display Theme */}
          <div>
            <h2 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--clr-text)', display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.75rem' }}>
              {adminTheme === 'LIGHT' ? <LuSun size={15} /> : <LuMoon size={15} />} Display Theme
            </h2>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {(['LIGHT', 'DARK'] as const).map(val => {
                const active = adminTheme === val
                return (
                  <button key={val} onClick={() => onThemeChange(val)} style={{ flex: 1, padding: '0.62rem 0.5rem', border: 'none', borderRadius: 10, outline: active ? '1px solid var(--adm-nav-active-brd)' : '1px solid var(--adm-foot-btn-brd)', background: active ? 'var(--adm-nav-active-bg)' : 'transparent', color: active ? 'var(--clr-accent)' : 'var(--clr-muted)', fontFamily: 'inherit', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer', transition: 'all 0.18s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}>
                    {val === 'LIGHT' ? <LuSun size={14} /> : <LuMoon size={14} />}
                    {val === 'LIGHT' ? 'Light' : 'Dark'}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Security tab */}
      {activeTab === 'security' && (
        <div className="glass step-enter" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
          <h2 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--clr-text)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}><LuLock size={15} /> {tr('prf_sec_title')}</h2>
          <SectionRow title={tr('prf_pw_title')} sub={tr('prf_pw_sub')} open={showPwForm} onToggle={() => { setShowPwForm(v => !v); setPwError(''); setPwSuccess(false) }} toggleLabel={showPwForm ? tr('prf_pw_cancel') : tr('prf_pw_change')}>
            <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }} className="step-enter">
              {pwError && <div className="alert alert-error"><LuTriangleAlert size={13} /> {pwError}</div>}
              {pwSuccess && <div className="alert alert-success" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}><LuCheck size={13} /> {tr('prf_pw_success')}</div>}
              <PasswordInput id="adm-cpw-cur" {...{ label: tr('prf_pw_cur') }} value={currentPw} onChange={setCurrentPw} show={showPw} onToggle={() => setShowPw(v => !v)} />
              <PasswordInput id="adm-cpw-new" {...{ label: tr('prf_pw_new') }} value={newPw} onChange={setNewPw} show={showPw} onToggle={() => setShowPw(v => !v)} />
              <PasswordInput id="adm-cpw-cfg" {...{ label: tr('prf_pw_confirm') }} value={confirmPw} onChange={setConfirmPw} show={showPw} onToggle={() => setShowPw(v => !v)} hasError={!!(confirmPw && confirmPw !== newPw)} />
              <button type="submit" className="btn-primary" disabled={pwLoading}>{pwLoading ? <BtnSpinner text={tr('prf_pw_saving')} /> : tr('prf_pw_save')}</button>
            </form>
          </SectionRow>
          <Divider />
          <div className="danger-card">
            <h3 style={{ fontSize: '0.875rem', fontWeight: 700, color: '#fca5a5', marginBottom: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}><LuTriangleAlert size={14} /> {tr('prf_danger_title')}</h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--clr-muted)', marginBottom: '0.85rem' }}>{tr('prf_danger_sub')}</p>
            <button onClick={() => { setShowDeleteModal(true); setDeleteConfirm(''); setDeleteError('') }} style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5', fontFamily: 'inherit', fontSize: '0.85rem', fontWeight: 600, padding: '0.55rem 1rem', borderRadius: 10, cursor: 'pointer' }}>{tr('prf_danger_btn')}</button>
          </div>
        </div>
      )}

      {/* Contact tab */}
      {activeTab === 'contact' && (
        <div className="glass step-enter" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
          <h2 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--clr-text)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}><LuSmartphone size={15} /> {tr('prf_contact_title')}</h2>
          <SectionRow title={tr('prf_email_section')} sub={user?.email ? `${user.email}${user.is_email_verified ? ' ✔' : ` ${tr('prf_email_unverified')}`}` : tr('prf_email_sub_link')} open={showEmailForm} onToggle={() => { setShowEmailForm(v => !v); setEmailError(''); setEmailSent(false) }} toggleLabel={showEmailForm ? tr('prf_email_cancel') : user?.email ? tr('prf_email_change') : tr('prf_email_link')}>
            {emailSent ? (
              <div className="alert alert-success step-enter" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}><LuCheck size={13} /> {tr('prf_email_sent_prefix')} <strong>{emailInput}</strong>.</div>
            ) : (
              <form onSubmit={handleLinkEmail} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }} className="step-enter">
                {emailError && <div className="alert alert-error"><LuTriangleAlert size={13} /> {emailError}</div>}
                <div className="input-wrap"><input id="adm-em" type="email" placeholder=" " value={emailInput} onChange={e => setEmailInput(e.target.value)} required /><label htmlFor="adm-em">{tr('prf_email_label')}</label></div>
                <button type="submit" className="btn-primary" disabled={emailLoading}>{emailLoading ? <BtnSpinner text={tr('prf_email_sending')} /> : tr('prf_email_send')}</button>
              </form>
            )}
          </SectionRow>
          <Divider />
          <SectionRow title={tr('prf_phone_section')} sub={user?.phone_number ?? ''} open={showPhoneForm} onToggle={() => { setShowPhoneForm(v => !v); setPhoneError(''); setPhoneSuccess(false); setPhoneStep('input'); setPhoneOtp(''); setNewPhone('') }} toggleLabel={showPhoneForm ? tr('prf_phone_cancel') : tr('prf_phone_change')}>
            {phoneSuccess ? (
              <div className="alert alert-success step-enter" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}><LuCheck size={13} /> {tr('prf_phone_success')}</div>
            ) : phoneStep === 'input' ? (
              <form onSubmit={handleRequestPhoneOtp} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }} className="step-enter">
                {phoneError && <div className="alert alert-error"><LuTriangleAlert size={13} /> {phoneError}</div>}
                <PhoneField value={newPhone} onChange={setNewPhone} id="adm-new-phone" />
                <button type="submit" className="btn-primary" disabled={phoneLoading}>{phoneLoading ? <BtnSpinner text={tr('prf_phone_sending')} /> : tr('prf_phone_send')}</button>
              </form>
            ) : (
              <form onSubmit={handleVerifyPhoneOtp} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }} className="step-enter">
                {phoneError && <div className="alert alert-error"><LuTriangleAlert size={13} /> {phoneError}</div>}
                <div className="input-wrap"><input id="adm-ph-otp" type="text" inputMode="numeric" placeholder=" " maxLength={6} value={phoneOtp} onChange={e => setPhoneOtp(e.target.value.replace(/\D/g, ''))} required /><label htmlFor="adm-ph-otp">{tr('prf_phone_otp_label')}</label></div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button type="button" className="btn-outline" style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.3rem', justifyContent: 'center' }} onClick={() => setPhoneStep('input')} disabled={phoneLoading}><LuArrowLeft size={13} /> {tr('prf_phone_back')}</button>
                  <button type="submit" className="btn-primary" style={{ flex: 2 }} disabled={phoneLoading || phoneOtp.length < 6}>{phoneLoading ? <BtnSpinner text={tr('prf_phone_verifying')} /> : tr('prf_phone_verify')}</button>
                </div>
              </form>
            )}
          </SectionRow>
        </div>
      )}

      {/* Delete modal */}
      {showDeleteModal && (
        <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) setShowDeleteModal(false) }}>
          <div className="glass modal-box" style={{ padding: '1.75rem' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 800, color: '#fca5a5', marginBottom: '0.5rem' }}>Delete Account</h2>
            <p style={{ color: 'var(--clr-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>Type <strong style={{ color: 'var(--clr-text)' }}>{tr('prf_del_type_delete')}</strong> {tr('prf_del_body')}</p>
            {deleteError && <div className="alert alert-error" style={{ marginBottom: '0.75rem' }}><LuTriangleAlert size={13} /> {deleteError}</div>}
            <div className="input-wrap" style={{ marginBottom: '0.75rem' }}><input id="adm-del" type="text" placeholder=" " value={deleteConfirm} onChange={e => setDeleteConfirm(e.target.value)} autoComplete="off" /><label htmlFor="adm-del">{tr('prf_del_input_label')}</label></div>
            <div style={{ display: 'flex', gap: '0.6rem' }}>
              <button className="btn-outline" style={{ flex: 1 }} onClick={() => setShowDeleteModal(false)}>{tr('prf_del_cancel')}</button>
              <button disabled={deleteLoading || deleteConfirm !== 'DELETE'} onClick={handleDeleteAccount} style={{ flex: 1, padding: '0.7rem', borderRadius: 10, border: 'none', background: deleteConfirm === 'DELETE' ? '#ef4444' : 'rgba(239,68,68,0.25)', color: '#fff', fontFamily: 'inherit', fontSize: '0.85rem', fontWeight: 700, cursor: deleteConfirm === 'DELETE' ? 'pointer' : 'not-allowed' }}>{deleteLoading ? <BtnSpinner text={tr('prf_del_deleting')} /> : tr('prf_del_confirm')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Admin Drivers Section ────────────────────────────────────────────────────

interface DriverDetail {
  driver_profile: any
  document_reviews: any[]
  trip_stats: { total_assigned: number; completed: number; cancelled: number; active_now: number }
  ratings: any[]
  rating_summary: any | null
}

function AdminDriversSection({ allUsers, loading: usersLoading, onToggleActive, onRefresh, onViewOrders }: {
  allUsers: UserRow[]; loading: boolean
  onToggleActive: (u: UserRow) => void; onRefresh: () => void; onViewOrders: (driverId: string, statusGroup?: string) => void
}) {
  const { t: tr } = useLanguage()
  const [search, setSearch] = useState('')
  const [selectedUser, setSelectedUser] = useState<UserRow | null>(null)
  const [detail, setDetail] = useState<DriverDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [statusSaving, setStatusSaving] = useState(false)
  const [toastMsg, setToastMsg] = useState('')
  const toast = (m: string) => { setToastMsg(m); setTimeout(() => setToastMsg(''), 3000) }

  const filtered = allUsers.filter(u => {
    const q = search.toLowerCase()
    return !q || u.first_name.toLowerCase().includes(q) || u.last_name.toLowerCase().includes(q) || u.phone_number.includes(q) || (u.email ?? '').toLowerCase().includes(q)
  })

  const openDetail = async (u: UserRow) => {
    setSelectedUser(u)
    setDetail(null)
    setDetailLoading(true)
    try {
      const { data } = await apiClient.get(`/admin/drivers/${u.id}`)
      setDetail(data)
    } catch { toast(tr('drv_load_fail')) }
    finally { setDetailLoading(false) }
  }

  const closeModal = () => { setSelectedUser(null); setDetail(null) }

  const handleToggle = (u: UserRow) => {
    onToggleActive(u)
    if (selectedUser?.id === u.id) setSelectedUser({ ...u, is_active: u.is_active ? 0 : 1 })
  }

  const setDriverStatus = async (driverId: string, status: string) => {
    setStatusSaving(true)
    try {
      await apiClient.patch(`/admin/drivers/${driverId}/status`, { status })
      toast(`Status set to ${status}`)
      setDetail(prev => prev ? { ...prev, driver_profile: { ...prev.driver_profile, status } } : prev)
    } catch (e: any) { toast(e.response?.data?.message ?? tr('drv_status_fail')) }
    finally { setStatusSaving(false) }
  }

  const deleteRating = async (ratingId: string) => {
    if (!window.confirm('Delete this rating?')) return
    try {
      await apiClient.delete(`/admin/ratings/${ratingId}`)
      toast(tr('drv_del_rating_ok'))
      setDetail(prev => prev ? { ...prev, ratings: prev.ratings.filter((r: any) => r.id !== ratingId) } : prev)
    } catch { toast(tr('drv_del_rating_fail')) }
  }

  const stColor: Record<string, string> = { AVAILABLE: 'var(--kpi-green)', ON_JOB: '#60a5fa', OFFLINE: '#94a3b8', SUSPENDED: '#fca5a5' }
  const stLabel: Record<string, string> = { AVAILABLE: tr('drv_st_available'), ON_JOB: tr('drv_st_on_job'), OFFLINE: tr('drv_st_offline'), SUSPENDED: tr('drv_st_suspended') }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {toastMsg && <div className="alert alert-success" style={{ marginBottom: '0.25rem' }}>{toastMsg}</div>}

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--clr-text)', flex: 1, display: 'flex', alignItems: 'center', gap: '0.45rem' }}><LuTruck size={17} /> {tr('drv_title')}</h2>
        <button onClick={onRefresh} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.3rem 0.7rem', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: 'var(--clr-muted)', fontFamily: 'inherit', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer' }}>
          <LuRefreshCw size={12} /> {tr('drv_refresh')}
        </button>
      </div>

      <div className="input-wrap">
        <input id="drv-search" type="text" placeholder=" " value={search} onChange={e => setSearch(e.target.value)} />
        <label htmlFor="drv-search"><LuSearch size={12} style={{ verticalAlign: 'middle', marginRight: '0.3rem' }} />{tr('drv_search_ph')}</label>
      </div>

      {usersLoading ? <LoadingSpinner /> : (
        <div className="glass-inner" style={{ overflow: 'hidden' }}>
          {filtered.length === 0 ? (
            <p style={{ padding: '2rem', textAlign: 'center', color: 'var(--clr-muted)', fontSize: '0.875rem' }}>{tr('drv_none')}</p>
          ) : filtered.map((u, i) => {
            const st = (u as any).status as string | undefined
            const c = st ? (stColor[st] ?? '#94a3b8') : undefined
            return (
              <div key={u.id} onClick={() => openDetail(u)} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.85rem 1rem', borderBottom: i < filtered.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none', cursor: 'pointer', transition: 'background 0.15s' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                <UserAvatar u={u} size={40} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--clr-text)' }}>{u.first_name} {u.last_name}</span>
                    {u.is_driver_verified === 1 && <VerifiedBadge />}
                    {!u.is_active && <span className="badge badge-red" style={{ fontSize: '0.67rem' }}>{tr('drv_suspended_badge')}</span>}
                  </div>
                  <p style={{ fontSize: '0.75rem', color: 'var(--clr-muted)', marginTop: '0.1rem' }}>{u.phone_number}</p>
                </div>
                {c && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', flexShrink: 0 }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: c, boxShadow: `0 0 4px ${c}` }} />
                    <span style={{ fontSize: '0.7rem', fontWeight: 700, color: c }}>{stLabel[st!] ?? st}</span>
                  </div>
                )}
                <span style={{ color: 'var(--clr-muted)', fontSize: '0.75rem', flexShrink: 0, marginLeft: '0.25rem' }}>›</span>
              </div>
            )
          })}
        </div>
      )}
      <p style={{ fontSize: '0.73rem', color: 'var(--clr-muted)', textAlign: 'right' }}>{filtered.length} {tr('drv_count')}</p>

      {/* Full Driver Detail Modal */}
      {selectedUser && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }} onClick={closeModal}>
          <div className="glass" style={{ borderRadius: 18, padding: '1.5rem', maxWidth: 520, width: '100%', maxHeight: '90vh', overflowY: 'auto', position: 'relative', boxShadow: '0 24px 64px rgba(0,0,0,0.6)' }} onClick={e => e.stopPropagation()}>
            <button onClick={closeModal} style={{ position: 'absolute', top: '0.85rem', right: '0.85rem', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--clr-muted)' }}><LuX size={18} /></button>

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.25rem' }}>
              <UserAvatar u={selectedUser} size={56} />
              <div>
                <p style={{ fontWeight: 800, fontSize: '1.05rem', color: 'var(--clr-text)' }}>{selectedUser.first_name} {selectedUser.last_name}</p>
                <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.3rem', flexWrap: 'wrap', alignItems: 'center' }}>
                  <RoleBadge roleId={selectedUser.role_id} roleName={selectedUser.role_name} />
                  {selectedUser.is_driver_verified === 1 && <VerifiedBadge />}
                  {!selectedUser.is_active && <span className="badge badge-red" style={{ fontSize: '0.67rem' }}>{tr('drv_suspended_badge')}</span>}
                  {detail?.driver_profile?.status && (() => {
                    const st = detail.driver_profile.status
                    const c = stColor[st] ?? '#94a3b8'
                    return (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', padding: '0.18rem 0.55rem', borderRadius: 99, border: `1px solid ${c}44`, background: `${c}18`, fontSize: '0.72rem', fontWeight: 700, color: c }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: c, boxShadow: `0 0 4px ${c}` }} />{stLabel[st] ?? st}
                      </span>
                    )
                  })()}
                </div>
              </div>
            </div>

            {/* Contact info */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem 1.5rem', fontSize: '0.8rem', marginBottom: '1.25rem' }}>
              {[
                { label: tr('drv_phone'), value: selectedUser.phone_number },
                { label: tr('drv_email'), value: selectedUser.email || '—' },
                { label: tr('drv_phone_verified'), value: selectedUser.is_phone_verified ? '✓ Yes' : '✗ No', clr: selectedUser.is_phone_verified ? 'var(--kpi-green)' : '#fca5a5' },
                { label: tr('drv_email_verified'), value: selectedUser.is_email_verified ? '✓ Yes' : '✗ No', clr: selectedUser.is_email_verified ? 'var(--kpi-green)' : '#fca5a5' },
                { label: tr('drv_account'), value: selectedUser.is_active ? tr('drv_active') : tr('drv_st_suspended'), clr: selectedUser.is_active ? 'var(--kpi-green)' : '#fca5a5' },
                { label: tr('drv_registered'), value: new Date(selectedUser.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) },
              ].map(r => (
                <div key={r.label}>
                  <p style={{ color: 'var(--clr-muted)', fontSize: '0.72rem', marginBottom: '0.12rem' }}>{r.label}</p>
                  <p style={{ color: r.clr ?? 'var(--clr-text)', fontWeight: 600 }}>{r.value}</p>
                </div>
              ))}
            </div>

            {detailLoading ? <LoadingSpinner /> : detail ? (
              <>
                {/* Trip Statistics */}
                <div style={{ marginBottom: '1.25rem' }}>
                  <p style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--clr-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.6rem' }}>{tr('drv_trip_stats')}</p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '0.5rem' }}>
                    {[
                      { label: tr('drv_assigned'), value: detail.trip_stats.total_assigned, clr: '#60a5fa', internalFilter: 'ASSIGNED_ANY' },
                      { label: tr('drv_completed'), value: detail.trip_stats.completed, clr: 'var(--kpi-green)', internalFilter: 'COMPLETED' },
                      { label: tr('drv_cancelled'), value: detail.trip_stats.cancelled, clr: '#fca5a5', internalFilter: 'CANCELLED' },
                      { label: tr('drv_active_now'), value: detail.trip_stats.active_now, clr: 'var(--kpi-gold)', internalFilter: 'ACTIVE_NOW' },
                    ].map(s => (
                      <div key={s.label} onClick={() => onViewOrders(selectedUser!.id, s.internalFilter)} className="glass-inner" style={{ padding: '0.65rem 0.5rem', textAlign: 'center', border: `1px solid ${s.clr}22`, cursor: 'pointer', transition: 'background 0.15s' }} onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')} onMouseLeave={e => (e.currentTarget.style.background = '')}>
                        <p style={{ fontSize: '1.3rem', fontWeight: 800, color: s.clr, lineHeight: 1 }}>{Number(s.value) || 0}</p>
                        <p style={{ fontSize: '0.65rem', color: 'var(--clr-muted)', marginTop: '0.2rem' }}>{s.label}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Rating */}
                <div style={{ marginBottom: '1.25rem' }}>
                  <p style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--clr-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.6rem' }}>{tr('drv_rating')}</p>
                  {detail.rating_summary ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                      {/* Score cards */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '0.5rem' }}>
                        {[
                          { label: tr('drv_combined'), value: detail.rating_summary.combined_rating },
                          { label: tr('drv_shipper_avg'), value: detail.rating_summary.shipper_avg },
                          { label: tr('drv_system_score'), value: detail.rating_summary.system_score },
                        ].map(s => (
                          <div key={s.label} className="glass-inner" style={{ padding: '0.65rem 0.5rem', textAlign: 'center' }}>
                            <div style={{ display: 'flex', justifyContent: 'center', gap: '1px', marginBottom: '0.2rem' }}>
                              {[1, 2, 3, 4, 5].map(n => <LuStar key={n} size={11} fill={s.value != null && n <= Math.round(Number(s.value)) ? 'var(--kpi-gold)' : 'none'} stroke={s.value != null && n <= Math.round(Number(s.value)) ? 'var(--kpi-gold)' : 'rgba(255,255,255,0.2)'} />)}
                            </div>
                            <p style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--kpi-gold)', lineHeight: 1 }}>{s.value != null ? Number(s.value).toFixed(1) : '—'}</p>
                            <p style={{ fontSize: '0.62rem', color: 'var(--clr-muted)', marginTop: '0.2rem' }}>{s.label}</p>
                          </div>
                        ))}
                      </div>
                      <p style={{ fontSize: '0.72rem', color: 'var(--clr-muted)' }}>
                        {detail.rating_summary.shipper_count ?? 0} {detail.rating_summary.shipper_count !== 1 ? tr('drv_shipper_reviews') : tr('drv_shipper_review')} · {detail.rating_summary.delivered_trips ?? 0}/{detail.rating_summary.total_trips ?? 0} {tr('drv_trips_delivered')}
                      </p>

                      {/* Individual reviews */}
                      {detail.ratings.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', maxHeight: 220, overflowY: 'auto' }}>
                          {detail.ratings.map((r: any) => (
                            <div key={r.id} className="glass-inner" style={{ padding: '0.65rem 0.85rem', display: 'flex', gap: '0.65rem', alignItems: 'flex-start' }}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.2rem' }}>
                                  <div style={{ display: 'flex', gap: '1px' }}>
                                    {[1, 2, 3, 4, 5].map(n => <LuStar key={n} size={11} fill={n <= r.stars ? 'var(--kpi-gold)' : 'none'} stroke={n <= r.stars ? 'var(--kpi-gold)' : 'rgba(255,255,255,0.25)'} />)}
                                  </div>
                                  <span style={{ fontSize: '0.72rem', color: 'var(--clr-text)', fontWeight: 600 }}>{r.shipper_first_name} {r.shipper_last_name}</span>
                                  <span style={{ fontSize: '0.67rem', color: 'var(--clr-muted)' }}>{new Date(r.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                                </div>
                                {r.comment && <p style={{ fontSize: '0.76rem', color: 'var(--clr-muted)', lineHeight: 1.5 }}>{r.comment}</p>}
                              </div>
                              <button onClick={() => deleteRating(r.id)} title="Delete rating"
                                style={{ padding: '0.22rem 0.42rem', borderRadius: 6, border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.07)', color: '#fca5a5', cursor: 'pointer', flexShrink: 0 }}>
                                <LuTrash2 size={12} />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <p style={{ fontSize: '0.82rem', color: 'var(--clr-muted)', fontStyle: 'italic' }}>{tr('drv_no_ratings')}</p>
                  )}
                </div>

                {/* Admin controls */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                  <p style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--clr-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{tr('drv_admin_controls')}</p>
                  {/* Status override */}
                  <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                    {(['AVAILABLE', 'OFFLINE', 'SUSPENDED'] as const).map(s => (
                      <button key={s} disabled={statusSaving || detail.driver_profile?.status === s}
                        onClick={() => setDriverStatus(selectedUser.id, s)}
                        style={{ padding: '0.35rem 0.75rem', borderRadius: 8, border: `1px solid ${stColor[s]}44`, background: detail.driver_profile?.status === s ? `${stColor[s]}22` : 'transparent', color: stColor[s], fontFamily: 'inherit', fontSize: '0.75rem', fontWeight: 700, cursor: detail.driver_profile?.status === s ? 'default' : 'pointer', opacity: detail.driver_profile?.status === s ? 0.6 : 1 }}>
                        {detail.driver_profile?.status === s ? '● ' : ''}{stLabel[s]}
                      </button>
                    ))}
                  </div>
                  {/* Suspend/Activate */}
                  <button onClick={() => handleToggle(selectedUser)}
                    style={{ width: '100%', padding: '0.6rem', borderRadius: 10, border: '1px solid', borderColor: selectedUser.is_active ? 'rgba(239,68,68,0.35)' : 'rgba(74,222,128,0.35)', background: selectedUser.is_active ? 'rgba(239,68,68,0.08)' : 'rgba(74,222,128,0.08)', color: selectedUser.is_active ? '#fca5a5' : 'var(--kpi-green)', fontFamily: 'inherit', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer' }}>
                    {selectedUser.is_active ? tr('drv_suspend_btn') : tr('drv_activate_btn')}
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Driver Verification section ─────────────────────────────────────────────

function DriverVerificationSection() {
  const { t: tr } = useLanguage()
  const [filter, setFilter] = useState<'all' | 'pending' | 'verified' | 'rejected'>('pending')
  const [drivers, setDrivers] = useState<DriverRow[]>([])
  const [loading, setLoading] = useState(false)
  const [toastMsg, setToastMsg] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [driverReviews, setDriverReviews] = useState<Record<string, DocReview[]>>({})

  // Rating state
  const [driverRatings, setDriverRatings] = useState<Record<string, { ratings: any[]; summary: any }>>({})
  const [ratingsLoading, setRatingsLoading] = useState<string | null>(null)

  // Reject modal state
  const [rejectModal, setRejectModal] = useState<{ type: 'driver' | 'doc'; driverId: string; docType?: string } | null>(null)
  const [rejectReason, setRejectReason] = useState('')

  const toast = (msg: string) => { setToastMsg(msg); setTimeout(() => setToastMsg(''), 3000) }

  const load = async () => {
    setLoading(true)
    try {
      const { data } = await apiClient.get(`/admin/drivers?filter=${filter}`)
      setDrivers(data.drivers ?? [])
    } catch { toast(tr('veh_toast_driver_fail')) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [filter]) // eslint-disable-line

  const loadDriverDetail = async (driverId: string) => {
    if (driverReviews[driverId]) return // already loaded
    try {
      const { data } = await apiClient.get(`/admin/drivers/${driverId}`)
      setDriverReviews(prev => ({ ...prev, [driverId]: data.document_reviews ?? [] }))
    } catch { /* ignore */ }
  }

  const handleExpand = (driverId: string) => {
    const next = expandedId === driverId ? null : driverId
    setExpandedId(next)
    if (next) {
      loadDriverDetail(next)
      loadDriverRatings(next)
    }
  }

  const loadDriverRatings = async (driverId: string) => {
    if (driverRatings[driverId]) return
    setRatingsLoading(driverId)
    try {
      const { data } = await apiClient.get(`/admin/drivers/${driverId}/ratings`)
      setDriverRatings(prev => ({ ...prev, [driverId]: { ratings: data.ratings ?? [], summary: data.summary ?? null } }))
    } catch { /* ignore */ }
    finally { setRatingsLoading(null) }
  }

  const deleteRating = async (ratingId: string, driverId: string) => {
    if (!window.confirm('Delete this rating?')) return
    try {
      await apiClient.delete(`/admin/ratings/${ratingId}`)
      toast(tr('vdr_del_rating_ok'))
      setDriverRatings(prev => {
        const existing = prev[driverId]
        if (!existing) return prev
        return { ...prev, [driverId]: { ...existing, ratings: existing.ratings.filter((r: any) => r.id !== ratingId) } }
      })
      await loadDriverRatings(driverId)
    } catch { toast(tr('vdr_del_rating_fail')) }
  }

  const reviewDoc = async (driverId: string, docType: string, action: 'APPROVED' | 'REJECTED', reason?: string) => {
    const key = `${driverId}-${docType}-${action}`
    setActionLoading(key)
    try {
      await apiClient.post(`/admin/drivers/${driverId}/review-document`, { document_type: docType, action, reason: reason ?? null })
      toast(`${docType.replace('_', ' ')} ${action.toLowerCase()}.`)
      // Invalidate cached reviews so it reloads
      setDriverReviews(prev => { const next = { ...prev }; delete next[driverId]; return next })
      await load()
      await loadDriverDetail(driverId)
    } catch (e: any) { toast(e.response?.data?.message ?? tr('vdr_action_fail')) }
    finally { setActionLoading(null); setRejectModal(null); setRejectReason('') }
  }

  const verifyDriver = async (driverId: string) => {
    setActionLoading(`verify-${driverId}`)
    try {
      await apiClient.post(`/admin/drivers/${driverId}/verify`)
      toast(tr('vdr_verify_ok'))
      await load()
    } catch (e: any) { toast(e.response?.data?.message ?? tr('vdr_action_fail')) }
    finally { setActionLoading(null) }
  }

  const rejectDriverFull = async (driverId: string, reason: string) => {
    if (!reason.trim()) return
    setActionLoading(`reject-${driverId}`)
    try {
      await apiClient.post(`/admin/drivers/${driverId}/reject`, { reason })
      toast(tr('vdr_reject_ok'))
      setDriverReviews(prev => { const next = { ...prev }; delete next[driverId]; return next })
      await load()
    } catch (e: any) { toast(e.response?.data?.message ?? 'Action failed') }
    finally { setActionLoading(null); setRejectModal(null); setRejectReason('') }
  }

  const statusColor = (s: string | null) =>
    s === 'APPROVED' ? 'var(--kpi-green)' : s === 'REJECTED' ? '#fca5a5' : s === 'PENDING' ? 'var(--kpi-gold)' : 'var(--clr-muted)'

  const StatusBadge = ({ s, label }: { s: string | null; label?: string }) => (
    <span style={{ fontSize: '0.68rem', fontWeight: 700, color: statusColor(s), background: `${statusColor(s)}18`, border: `1px solid ${statusColor(s)}44`, borderRadius: 99, padding: '0.15rem 0.5rem', whiteSpace: 'nowrap' }}>
      {label ? `${label}: ` : ''}{s ?? 'N/A'}
    </span>
  )

  const filters: { id: typeof filter; label: string }[] = [
    { id: 'pending', label: tr('vdr_filter_pending') },
    { id: 'verified', label: tr('vdr_filter_verified') },
    { id: 'rejected', label: tr('vdr_filter_rejected') },
    { id: 'all', label: tr('vdr_filter_all') },
  ]

  const _apiBase = (import.meta.env.VITE_API_BASE_URL as string ?? '').replace(/\/api$/, '')
  const absUrl = (raw: string | null) => raw ? (raw.startsWith('http') ? raw : `${_apiBase}${raw}`) : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--clr-text)', display: 'flex', alignItems: 'center', gap: '0.45rem' }}><LuShieldCheck size={17} /> {tr('vdr_title')}</h2>
        <button className="btn-outline" style={{ fontSize: '0.75rem', padding: '0.35rem 0.7rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }} onClick={load} disabled={loading}><LuRefreshCw size={13} /> {tr('vdr_refresh')}</button>
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: '0.4rem', background: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: '0.3rem' }}>
        {filters.map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)} style={{ flex: 1, padding: '0.45rem', border: 'none', borderRadius: 9, background: filter === f.id ? 'rgba(97, 148, 31,0.12)' : 'transparent', color: filter === f.id ? 'var(--clr-accent)' : 'var(--clr-muted)', fontFamily: 'inherit', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', transition: 'all 0.18s', outline: filter === f.id ? '1px solid rgba(97, 148, 31,0.2)' : 'none' }}>
            {f.label}
          </button>
        ))}
      </div>

      {loading ? <LoadingSpinner /> : drivers.length === 0 ? (
        <div className="glass-inner" style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--clr-muted)', fontSize: '0.875rem' }}>{tr('vdr_none')}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
          {drivers.map(d => {
            const isExpanded = expandedId === d.user_id
            const fullName = `${d.first_name} ${d.last_name}`
            const reviews = driverReviews[d.user_id] ?? []
            return (
              <div key={d.user_id} className="glass-inner" style={{ overflow: 'hidden' }}>
                {/* Card header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.85rem 1rem', cursor: 'pointer' }} onClick={() => handleExpand(d.user_id)}>
                  <div style={{ width: 38, height: 38, borderRadius: '50%', flexShrink: 0, background: 'linear-gradient(135deg,var(--clr-accent2),var(--clr-accent))', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', border: '2px solid rgba(97, 148, 31,0.2)' }}>
                    {d.profile_photo_url ? <img src={absUrl(d.profile_photo_url)!} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <LuTruck size={16} color="#fff" />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--clr-text)' }}>{fullName}</span>
                      {d.is_verified === 1 && <span style={{ color: 'var(--kpi-green)', display: 'flex', alignItems: 'center', gap: '0.2rem', fontSize: '0.72rem', fontWeight: 700 }}><LuBadgeCheck size={12} /> {tr('vdr_verified_badge')}</span>}
                    </div>
                    <p style={{ fontSize: '0.73rem', color: 'var(--clr-muted)' }}>{d.phone_number}</p>
                    <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginTop: '0.3rem' }}>
                      <StatusBadge s={d.national_id_status} label={tr('vdr_doc_national_id').slice(0, 2).toUpperCase()} />
                      <StatusBadge s={d.license_status} label={tr('vdr_doc_license').slice(0, 3)} />
                      <StatusBadge s={d.libre_status} label={tr('vdr_doc_libre').slice(0, 5)} />
                    </div>
                  </div>
                  <span style={{ color: 'var(--clr-muted)', fontSize: '0.75rem', flexShrink: 0, marginLeft: '0.5rem' }}>{isExpanded ? '▲' : '▼'}</span>
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>

                    {/* Overall rejection reason */}
                    {d.rejection_reason && (
                      <div className="alert alert-error" style={{ fontSize: '0.8rem', display: 'flex', alignItems: 'flex-start', gap: '0.4rem' }}>
                        <LuTriangleAlert size={13} style={{ flexShrink: 0, marginTop: 2 }} />
                        <span><strong>Overall rejection:</strong> {d.rejection_reason}</span>
                      </div>
                    )}

                    {/* Per-document review */}
                    {(['national_id', 'license', 'libre'] as const).map(docKey => {
                      const urlKey = `${docKey}_url` as keyof DriverRow
                      const statusKey = `${docKey}_status` as keyof DriverRow
                      const rawUrl = d[urlKey] as string | null
                      const url = absUrl(rawUrl)
                      const status = d[statusKey] as string | null
                      const aKey = `${d.user_id}-${docKey}`

                      // Get rejection reasons for this doc from review history
                      const docRejections = reviews.filter(r => r.document_type === docKey && r.action === 'REJECTED')
                      const latestRejection = docRejections[0]

                      return (
                        <div key={docKey} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', padding: '0.75rem', background: 'rgba(255,255,255,0.03)', borderRadius: 10 }}>
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                            <div style={{ flex: 1 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem', flexWrap: 'wrap' }}>
                                <span style={{ fontWeight: 600, fontSize: '0.82rem', color: 'var(--clr-text)', textTransform: 'capitalize' }}>{docKey.replace('_', ' ')}</span>
                                <StatusBadge s={status} />
                              </div>
                              {url ? (
                                <a href={url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.75rem', color: 'var(--clr-accent)', display: 'flex', alignItems: 'center', gap: '0.25rem', textDecoration: 'none' }}>
                                  <LuFileText size={12} /> {tr('vdr_view_doc')}
                                </a>
                              ) : (
                                <span style={{ fontSize: '0.73rem', color: 'var(--clr-muted)' }}>{tr('vdr_no_doc')}</span>
                              )}
                              {/* Latest rejection reason for this doc */}
                              {status === 'REJECTED' && latestRejection?.reason && (
                                <p style={{ marginTop: '0.35rem', fontSize: '0.75rem', color: '#fca5a5', display: 'flex', alignItems: 'flex-start', gap: '0.3rem' }}>
                                  <LuTriangleAlert size={11} style={{ flexShrink: 0, marginTop: 2 }} /> {latestRejection.reason}
                                </p>
                              )}
                            </div>
                            {url && (
                              <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0 }}>
                                <button onClick={() => reviewDoc(d.user_id, docKey, 'APPROVED')} disabled={!!actionLoading || status === 'APPROVED'}
                                  style={{ padding: '0.3rem 0.65rem', borderRadius: 7, border: '1px solid rgba(74,222,128,0.35)', background: 'rgba(74,222,128,0.08)', color: 'var(--kpi-green)', fontFamily: 'inherit', fontSize: '0.72rem', fontWeight: 600, cursor: status === 'APPROVED' ? 'not-allowed' : 'pointer', opacity: status === 'APPROVED' ? 0.5 : 1 }}>
                                  {actionLoading === `${aKey}-APPROVED` ? '…' : tr('vdr_approve_btn')}
                                </button>
                                <button onClick={() => { setRejectModal({ type: 'doc', driverId: d.user_id, docType: docKey }); setRejectReason('') }} disabled={!!actionLoading || status === 'REJECTED'}
                                  style={{ padding: '0.3rem 0.65rem', borderRadius: 7, border: '1px solid rgba(239,68,68,0.35)', background: 'rgba(239,68,68,0.08)', color: '#fca5a5', fontFamily: 'inherit', fontSize: '0.72rem', fontWeight: 600, cursor: status === 'REJECTED' ? 'not-allowed' : 'pointer', opacity: status === 'REJECTED' ? 0.5 : 1 }}>
                                  {tr('vdr_reject_btn')}
                                </button>
                              </div>
                            )}
                          </div>

                          {/* Review history for this document */}
                          {docRejections.length > 0 && (
                            <details style={{ marginTop: '0.2rem' }}>
                              <summary style={{ fontSize: '0.72rem', color: 'var(--clr-muted)', cursor: 'pointer', userSelect: 'none', listStyle: 'none', display: 'flex', alignItems: 'center', gap: '0.3rem', outline: 'none' }}>
                                <LuHistory size={11} /> {docRejections.length} {docRejections.length > 1 ? tr('vdr_rejections') : tr('vdr_rejection')} — {tr('vdr_view_history')}
                              </summary>
                              <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                                {docRejections.map(r => (
                                  <div key={r.id} style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)', borderRadius: 7, padding: '0.4rem 0.6rem', fontSize: '0.73rem' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.2rem' }}>
                                      <span style={{ color: '#fca5a5', fontWeight: 600 }}>{tr('vdr_rejected_label')}</span>
                                      <span style={{ color: 'var(--clr-muted)' }}>{new Date(r.reviewed_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                                    </div>
                                    {r.reason && <p style={{ color: 'var(--clr-muted)' }}>{r.reason}</p>}
                                    {r.reviewer_name && <p style={{ color: 'var(--clr-muted)', fontSize: '0.68rem', marginTop: '0.15rem' }}>{tr('vdr_reviewer_by')} {r.reviewer_name}</p>}
                                  </div>
                                ))}
                              </div>
                            </details>
                          )}
                        </div>
                      )
                    })}

                    {/* Full verify/reject */}
                    {d.is_verified !== 1 && (
                      <div style={{ display: 'flex', gap: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '0.85rem' }}>
                        <button onClick={() => verifyDriver(d.user_id)} disabled={!!actionLoading}
                          style={{ flex: 1, padding: '0.55rem', borderRadius: 10, border: '1px solid rgba(74,222,128,0.35)', background: 'rgba(74,222,128,0.10)', color: 'var(--kpi-green)', fontFamily: 'inherit', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}>
                          {actionLoading === `verify-${d.user_id}` ? <><span className="spinner" />…</> : <><LuShieldCheck size={14} /> {tr('vdr_fully_verify')}</>}
                        </button>
                        <button onClick={() => { setRejectModal({ type: 'driver', driverId: d.user_id }); setRejectReason('') }} disabled={!!actionLoading}
                          style={{ flex: 1, padding: '0.55rem', borderRadius: 10, border: '1px solid rgba(239,68,68,0.35)', background: 'rgba(239,68,68,0.08)', color: '#fca5a5', fontFamily: 'inherit', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}>
                          <LuX size={14} /> {tr('vdr_reject_driver')}
                        </button>
                      </div>
                    )}

                    {/* ── Driver Ratings panel ── */}
                    {(() => {
                      const rd = driverRatings[d.user_id]
                      const isLoading = ratingsLoading === d.user_id
                      const summary = rd?.summary
                      const ratings: any[] = rd?.ratings ?? []
                      return (
                        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.4rem' }}>
                            <p style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--clr-text)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                              <LuStar size={14} color="var(--kpi-gold)" /> {tr('vdr_ratings_title')}
                            </p>
                            <button onClick={async () => { setDriverRatings(prev => { const n = { ...prev }; delete n[d.user_id]; return n }); await loadDriverRatings(d.user_id) }}
                              style={{ padding: '0.2rem 0.5rem', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: 'var(--clr-muted)', fontFamily: 'inherit', fontSize: '0.68rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                              <LuRefreshCw size={10} /> {tr('vdr_rating_refresh')}
                            </button>
                          </div>
                          {isLoading ? (
                            <div style={{ color: 'var(--clr-muted)', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}><span className="spinner" style={{ width: 12, height: 12, borderWidth: 1.5 }} /> {tr('vdr_rating_loading')}</div>
                          ) : summary ? (
                            <>
                              {/* Summary row */}
                              <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap' }}>
                                {summary.combined_rating != null && (
                                  <div style={{ padding: '0.5rem 0.75rem', borderRadius: 9, background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                    <span style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--kpi-gold)' }}>{Number(summary.combined_rating).toFixed(1)}</span>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
                                      <div style={{ display: 'flex', gap: '1px' }}>
                                        {[1, 2, 3, 4, 5].map(n => <LuStar key={n} size={11} fill={n <= Math.round(summary.combined_rating) ? 'var(--kpi-gold)' : 'none'} stroke={n <= Math.round(summary.combined_rating) ? 'var(--kpi-gold)' : 'rgba(255,255,255,0.3)'} />)}
                                      </div>
                                      <span style={{ fontSize: '0.6rem', color: 'var(--clr-muted)' }}>{tr('vdr_rating_combined')}</span>
                                    </div>
                                  </div>
                                )}
                                {summary.shipper_avg != null && (
                                  <div style={{ padding: '0.5rem 0.75rem', borderRadius: 9, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', fontSize: '0.72rem', color: 'var(--clr-muted)' }}>
                                    <p style={{ fontWeight: 700, color: 'var(--clr-text)', fontSize: '0.82rem' }}>{Number(summary.shipper_avg).toFixed(1)} ★</p>
                                    <p>{summary.shipper_count} {tr('vdr_rating_reviews')}{summary.shipper_count !== 1 ? 's' : ''}</p>
                                  </div>
                                )}
                                {summary.system_score != null && (
                                  <div style={{ padding: '0.5rem 0.75rem', borderRadius: 9, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', fontSize: '0.72rem', color: 'var(--clr-muted)' }}>
                                    <p style={{ fontWeight: 700, color: 'var(--clr-text)', fontSize: '0.82rem' }}>{Number(summary.system_score).toFixed(1)} ★</p>
                                    <p>{tr('vdr_system_score')}</p>
                                    <p>{summary.delivered_trips}/{summary.total_trips} {tr('vdr_delivered')}</p>
                                  </div>
                                )}
                                {summary.combined_rating == null && <p style={{ fontSize: '0.75rem', color: 'var(--clr-muted)', fontStyle: 'italic' }}>{tr('vdr_no_ratings')}</p>}
                              </div>

                              {/* Individual reviews */}
                              {ratings.length > 0 && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: 240, overflowY: 'auto' }}>
                                  {ratings.map((r: any) => (
                                    <div key={r.id} style={{ padding: '0.65rem 0.85rem', borderRadius: 9, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', display: 'flex', gap: '0.65rem', alignItems: 'flex-start' }}>
                                      <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.2rem' }}>
                                          <div style={{ display: 'flex', gap: '1px' }}>
                                            {[1, 2, 3, 4, 5].map(n => <LuStar key={n} size={11} fill={n <= r.stars ? 'var(--kpi-gold)' : 'none'} stroke={n <= r.stars ? 'var(--kpi-gold)' : 'rgba(255,255,255,0.3)'} />)}
                                          </div>
                                          <span style={{ fontSize: '0.7rem', color: 'var(--clr-muted)' }}>{r.shipper_first_name} {r.shipper_last_name}</span>
                                          <span style={{ fontSize: '0.67rem', color: 'var(--clr-muted)' }}>{new Date(r.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                                        </div>
                                        {r.comment && <p style={{ fontSize: '0.76rem', color: 'var(--clr-text)', lineHeight: 1.5 }}>{r.comment}</p>}
                                      </div>
                                      <button onClick={() => deleteRating(r.id, d.user_id)} title="Delete rating"
                                        style={{ padding: '0.25rem 0.45rem', borderRadius: 6, border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.07)', color: '#fca5a5', cursor: 'pointer', flexShrink: 0 }}>
                                        <LuTrash2 size={12} />
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </>
                          ) : (
                            <p style={{ fontSize: '0.75rem', color: 'var(--clr-muted)', fontStyle: 'italic' }}>{tr('vdr_no_data')}</p>
                          )}
                        </div>
                      )
                    })()}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Reject reason modal */}
      {rejectModal && (
        <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) { setRejectModal(null); setRejectReason('') } }}>
          <div className="glass modal-box" style={{ padding: '1.75rem' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 800, color: '#fca5a5', marginBottom: '0.4rem' }}>
              {rejectModal.type === 'driver' ? tr('vdr_reject_driver') : `${tr('vdr_reject_modal_doc')} ${rejectModal.docType?.replace('_', ' ')}`}
            </h2>
            <p style={{ fontSize: '0.82rem', color: 'var(--clr-muted)', marginBottom: '1rem' }}>{tr('vdr_reject_reason_p')}</p>
            <div className="input-wrap" style={{ marginBottom: '0.75rem' }}>
              <input id="rej-reason" type="text" placeholder=" " value={rejectReason} onChange={e => setRejectReason(e.target.value)} autoFocus />
              <label htmlFor="rej-reason">{tr('vdr_reason_ph')}</label>
            </div>
            <div style={{ display: 'flex', gap: '0.6rem' }}>
              <button className="btn-outline" style={{ flex: 1 }} onClick={() => { setRejectModal(null); setRejectReason('') }}>{tr('vdr_cancel')}</button>
              <button disabled={!rejectReason.trim() || !!actionLoading}
                onClick={() => {
                  if (rejectModal.type === 'driver') rejectDriverFull(rejectModal.driverId, rejectReason)
                  else reviewDoc(rejectModal.driverId, rejectModal.docType!, 'REJECTED', rejectReason)
                }}
                style={{ flex: 1, padding: '0.7rem', borderRadius: 10, border: 'none', background: rejectReason.trim() ? '#ef4444' : 'rgba(239,68,68,0.25)', color: '#fff', fontFamily: 'inherit', fontSize: '0.85rem', fontWeight: 700, cursor: rejectReason.trim() ? 'pointer' : 'not-allowed' }}>
                {actionLoading ? <><span className="spinner" /> …</> : tr('vdr_confirm_reject')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toastMsg && (
        <div style={{ position: 'fixed', bottom: '1.25rem', right: '1.25rem', zIndex: 200, background: 'rgba(97, 148, 31,0.12)', border: '1px solid rgba(97, 148, 31,0.25)', color: 'var(--clr-text)', padding: '0.65rem 1.1rem', borderRadius: 12, fontSize: '0.85rem', fontWeight: 600, backdropFilter: 'blur(12px)' }}>
          {toastMsg}
        </div>
      )}
    </div>
  )
}

// ─── Vehicle Management section ───────────────────────────────────────────────

function VehicleManagementSection() {
  const { t: tr } = useLanguage()
  const _apiBase = (import.meta.env.VITE_API_BASE_URL as string ?? '').replace(/\/api$/, '')
  const absUrl = (raw: string | null | undefined) => !raw ? null : raw.startsWith('http') ? raw : `${_apiBase}${raw}`

  const [vehicleTab, setVehicleTab] = useState<'fleet' | 'submissions'>('fleet')
  const [vehicles, setVehicles] = useState<VehicleRow[]>([])
  const [submissions, setSubmissions] = useState<VehicleRow[]>([])
  const [loading, setLoading] = useState(false)
  const [subsLoading, setSubsLoading] = useState(false)
  const [toastMsg, setToastMsg] = useState('')
  const [showAll, setShowAll] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  // Modal state: create / edit
  const [modal, setModal] = useState<'create' | 'edit' | null>(null)
  const [editTarget, setEditTarget] = useState<VehicleRow | null>(null)
  const [form, setForm] = useState({ plate_number: '', vehicle_type: '', max_capacity_kg: '', is_company_owned: true, description: '', vehicle_photo: '' as string })
  const [vehicleGallery, setVehicleGallery] = useState<string[]>([])
  const [formLibre, setFormLibre] = useState('')
  const [formError, setFormError] = useState('')
  const photoInputRef = useRef<HTMLInputElement>(null)
  const galleryInputRef = useRef<HTMLInputElement>(null)
  const libreInputRef = useRef<HTMLInputElement>(null)

  // Assign driver modal
  const [assignModal, setAssignModal] = useState<VehicleRow | null>(null)
  const [allDrivers, setAllDrivers] = useState<DriverRow[]>([])
  const [selectedDriver, setSelectedDriver] = useState('')
  const [driversLoading, setDriversLoading] = useState(false)

  // Confirm delete
  const [deleteConfirm, setDeleteConfirm] = useState<VehicleRow | null>(null)

  // Lightbox for full-size image viewing
  const [lightbox, setLightbox] = useState<{ urls: string[]; index: number } | null>(null)

  const toast = (msg: string) => { setToastMsg(msg); setTimeout(() => setToastMsg(''), 3000) }

  const load = async () => {
    setLoading(true)
    try {
      const { data } = await apiClient.get(`/admin/vehicles${showAll ? '?all=1' : ''}`)
      setVehicles(data.vehicles ?? [])
    } catch { toast(tr('veh_toast_load_fail')) }
    finally { setLoading(false) }
  }

  const loadSubmissions = async () => {
    setSubsLoading(true)
    try {
      const { data } = await apiClient.get('/admin/vehicles/submissions')
      setSubmissions(data.vehicles ?? [])
    } catch { toast(tr('veh_toast_subs_fail')) }
    finally { setSubsLoading(false) }
  }

  useEffect(() => { load() }, [showAll]) // eslint-disable-line
  useEffect(() => { if (vehicleTab === 'submissions') loadSubmissions() }, [vehicleTab]) // eslint-disable-line

  const resetForm = () => {
    setForm({ plate_number: '', vehicle_type: '', max_capacity_kg: '', is_company_owned: true, description: '', vehicle_photo: '' })
    setVehicleGallery([])
    setFormLibre('')
    setFormError('')
  }

  const openCreate = () => { resetForm(); setModal('create') }
  const openEdit = (v: VehicleRow) => {
    setEditTarget(v)
    setForm({ plate_number: v.plate_number, vehicle_type: v.vehicle_type, max_capacity_kg: String(v.max_capacity_kg), is_company_owned: !!v.is_company_owned, description: v.description ?? '', vehicle_photo: '' })
    setVehicleGallery([])
    setFormLibre('')
    setFormError('')
    setModal('edit')
  }

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return
    if (file.size > 8 * 1024 * 1024) { setFormError(tr('veh_err_photo_size')); return }
    const reader = new FileReader()
    reader.onload = () => setForm(f => ({ ...f, vehicle_photo: reader.result as string }))
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const handleGallerySelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return
    files.slice(0, 5 - vehicleGallery.length).forEach(file => {
      if (file.size > 8 * 1024 * 1024) { setFormError(tr('veh_err_gallery_size')); return }
      const reader = new FileReader()
      reader.onload = () => setVehicleGallery(g => g.length < 5 ? [...g, reader.result as string] : g)
      reader.readAsDataURL(file)
    })
    e.target.value = ''
  }

  const handleLibreSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return
    if (file.size > 8 * 1024 * 1024) { setFormError(tr('veh_err_libre_size')); return }
    const reader = new FileReader()
    reader.onload = () => setFormLibre(reader.result as string)
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setFormError('')
    if (!form.plate_number.trim()) { setFormError(tr('veh_err_plate')); return }
    const cap = parseFloat(form.max_capacity_kg)
    if (isNaN(cap) || cap <= 0) { setFormError(tr('veh_err_cap')); return }
    const payload: Record<string, unknown> = {
      plate_number: form.plate_number.trim(),
      vehicle_type: form.vehicle_type,
      max_capacity_kg: cap,
      is_company_owned: form.is_company_owned,
      description: form.description.trim() || undefined,
    }
    if (form.vehicle_photo) payload.vehicle_photo = form.vehicle_photo
    if (vehicleGallery.length > 0) payload.vehicle_images = vehicleGallery
    if (formLibre) payload.libre_file = formLibre
    setActionLoading('form')
    try {
      if (modal === 'create') {
        await apiClient.post('/admin/vehicles', payload)
        toast(tr('veh_toast_created'))
      } else if (editTarget) {
        await apiClient.put(`/admin/vehicles/${editTarget.id}`, payload)
        toast(tr('veh_toast_updated'))
      }
      setModal(null); resetForm(); await load()
    } catch (err: any) { setFormError(err.response?.data?.message ?? tr('veh_toast_fail')) }
    finally { setActionLoading(null) }
  }

  const handleReviewSubmission = async (vehicleId: string, action: 'APPROVED' | 'REJECTED', driverId?: string) => {
    setActionLoading(`review-${vehicleId}-${action}`)
    try {
      await apiClient.post(`/admin/vehicles/${vehicleId}/review`, { action, driver_id: driverId })
      toast(action === 'APPROVED' ? tr('veh_toast_approved') : tr('veh_toast_sub_rejected'))
      await loadSubmissions()
    } catch (err: any) { toast(err.response?.data?.message ?? tr('veh_toast_fail')) }
    finally { setActionLoading(null) }
  }

  const handleDelete = async (v: VehicleRow) => {
    setActionLoading(`del-${v.id}`)
    try {
      await apiClient.delete(`/admin/vehicles/${v.id}`)
      toast(tr('veh_toast_deactivated')); setDeleteConfirm(null); await load()
    } catch (err: any) { toast(err.response?.data?.message ?? tr('veh_toast_delete_fail')) }
    finally { setActionLoading(null) }
  }

  const openAssign = async (v: VehicleRow) => {
    setAssignModal(v); setSelectedDriver(v.driver_id ?? '')
    setDriversLoading(true)
    try {
      const { data } = await apiClient.get('/admin/drivers?filter=verified')
      setAllDrivers(data.drivers ?? [])
    } catch { toast('Failed to load drivers') }
    finally { setDriversLoading(false) }
  }

  const handleAssign = async () => {
    if (!assignModal) return
    setActionLoading(`assign-${assignModal.id}`)
    try {
      await apiClient.post(`/admin/vehicles/${assignModal.id}/assign-driver`, { driver_id: selectedDriver || null })
      toast(selectedDriver ? tr('veh_toast_assigned') : tr('veh_toast_unassigned'))
      setAssignModal(null); await load()
    } catch (err: any) { toast(err.response?.data?.message ?? tr('veh_toast_fail')) }
    finally { setActionLoading(null) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--clr-text)', display: 'flex', alignItems: 'center', gap: '0.45rem' }}><LuCar size={17} /> {tr('veh_title')}</h2>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          {vehicleTab === 'fleet' && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                <button type="button" onClick={() => setShowAll(v => !v)}
                  style={{ width: 38, height: 22, borderRadius: 99, border: 'none', cursor: 'pointer', background: showAll ? 'var(--clr-accent)' : 'rgba(255,255,255,0.12)', transition: 'background 0.2s', flexShrink: 0, position: 'relative' }}>
                  <span style={{ position: 'absolute', top: 2, left: showAll ? 18 : 2, width: 18, height: 18, borderRadius: '50%', background: showAll ? '#080b14' : 'var(--clr-muted)', transition: 'left 0.2s' }} />
                </button>
                <span style={{ fontSize: '0.78rem', color: 'var(--clr-muted)' }}>Show inactive</span>
              </div>
              <button className="btn-primary" style={{ fontSize: '0.8rem', padding: '0.42rem 0.9rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }} onClick={openCreate}><LuPlus size={14} /> {tr('veh_add_btn')}</button>
            </>
          )}
          <button className="btn-outline" style={{ fontSize: '0.75rem', padding: '0.35rem 0.7rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }} onClick={vehicleTab === 'fleet' ? load : loadSubmissions} disabled={loading || subsLoading}><LuRefreshCw size={13} /></button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.4rem', background: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: '0.3rem' }}>
        {(['fleet', 'submissions'] as const).map(tab => (
          <button key={tab} onClick={() => setVehicleTab(tab)} style={{ flex: 1, padding: '0.45rem', border: 'none', borderRadius: 9, background: vehicleTab === tab ? 'rgba(97, 148, 31,0.12)' : 'transparent', color: vehicleTab === tab ? 'var(--clr-accent)' : 'var(--clr-muted)', fontFamily: 'inherit', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', transition: 'all 0.18s', outline: vehicleTab === tab ? '1px solid rgba(97, 148, 31,0.2)' : 'none' }}>
            {tab === 'fleet' ? tr('veh_tab_fleet') : `${tr('veh_tab_submissions')}${submissions.length > 0 ? ` (${submissions.length})` : ''}`}
          </button>
        ))}
      </div>

      {/* Fleet tab */}
      {vehicleTab === 'fleet' && (
        loading ? <LoadingSpinner /> : vehicles.length === 0 ? (
          <div className="glass-inner" style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--clr-muted)', fontSize: '0.875rem' }}>{tr('veh_none')}</div>
        ) : (
          <div className="glass-inner" style={{ overflow: 'hidden' }}>
            {vehicles.map((v, i) => {
              const imgUrl = absUrl(v.vehicle_photo_url)
              const gallery: string[] = v.vehicle_images ? (() => { try { return JSON.parse(v.vehicle_images) } catch { return [] } })() : []
              const allImgs = [imgUrl, ...gallery.map(absUrl)].filter(Boolean) as string[]
              return (
                <div key={v.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', padding: '0.85rem 1rem', borderBottom: i < vehicles.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none', flexWrap: 'wrap' }}>
                  <div style={{ width: 52, height: 52, borderRadius: 10, flexShrink: 0, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginTop: 2, cursor: imgUrl ? 'pointer' : 'default' }}
                    onClick={() => imgUrl && setLightbox({ urls: allImgs, index: 0 })}>
                    {imgUrl ? <img src={imgUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <LuCar size={18} color="var(--clr-muted)" />}
                  </div>
                  <div style={{ flex: 1, minWidth: 110 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 700, fontSize: '0.885rem', color: 'var(--clr-text)' }}>{v.plate_number}</span>
                      <span className="badge badge-cyan" style={{ fontSize: '0.67rem' }}>{v.vehicle_type}</span>
                      {!!v.is_company_owned && <span className="badge badge-purple" style={{ fontSize: '0.67rem' }}>{tr('veh_badge_company')}</span>}
                      {!v.is_active && <span className="badge badge-red" style={{ fontSize: '0.67rem' }}>{tr('veh_badge_inactive')}</span>}
                      {v.libre_url && <a href={absUrl(v.libre_url)!} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.65rem', display: 'inline-flex', alignItems: 'center', gap: '0.15rem', color: 'var(--clr-muted)', textDecoration: 'none', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 5, padding: '0.1rem 0.35rem' }}><LuFileText size={10} /> Libre</a>}
                    </div>
                    <p style={{ fontSize: '0.73rem', color: 'var(--clr-muted)', marginTop: '0.1rem' }}>{v.max_capacity_kg} kg · {v.driver_id ? tr('veh_assigned') : tr('veh_unassigned')}</p>
                    {v.description && <p style={{ fontSize: '0.7rem', color: 'var(--clr-muted)' }}>{v.description}</p>}
                    {gallery.length > 0 && (
                      <div style={{ display: 'flex', gap: '0.3rem', marginTop: '0.4rem', flexWrap: 'wrap' }}>
                        {gallery.map((src, gi) => {
                          const u = absUrl(src)
                          return u ? <img key={gi} src={u} alt="" onClick={() => setLightbox({ urls: allImgs, index: gi + 1 })}
                            style={{ width: 52, height: 52, borderRadius: 6, objectFit: 'cover', border: '1px solid rgba(255,255,255,0.12)', cursor: 'pointer', transition: 'transform 0.15s, opacity 0.15s' }}
                            onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.08)'; e.currentTarget.style.opacity = '0.9' }}
                            onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.opacity = '1' }}
                          /> : null
                        })}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '0.35rem', flexShrink: 0 }}>
                    <button title="Assign driver" onClick={() => openAssign(v)}
                      style={{ padding: '0.28rem 0.5rem', borderRadius: 7, border: '1px solid rgba(97, 148, 31,0.25)', background: 'rgba(97, 148, 31,0.07)', color: 'var(--clr-accent)', fontFamily: 'inherit', fontSize: '0.72rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      <LuUser size={12} /> Driver
                    </button>
                    <button title="Edit" onClick={() => openEdit(v)}
                      style={{ padding: '0.28rem 0.5rem', borderRadius: 7, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.05)', color: 'var(--clr-text)', fontFamily: 'inherit', fontSize: '0.72rem', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                      <LuPencil size={12} />
                    </button>
                    {!!v.is_active && (
                      <button title="Deactivate" onClick={() => setDeleteConfirm(v)} disabled={!!actionLoading}
                        style={{ padding: '0.28rem 0.5rem', borderRadius: 7, border: '1px solid rgba(239,68,68,0.35)', background: 'rgba(239,68,68,0.08)', color: '#fca5a5', fontFamily: 'inherit', fontSize: '0.72rem', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                        <LuTrash2 size={12} />
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )
      )}

      {/* Driver Submissions tab */}
      {vehicleTab === 'submissions' && (
        subsLoading ? <LoadingSpinner /> : submissions.length === 0 ? (
          <div className="glass-inner" style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--clr-muted)', fontSize: '0.875rem' }}>{tr('veh_sub_none')}</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
            {submissions.map(v => {
              const imgUrl = absUrl(v.vehicle_photo_url)
              const submitterName = v.submitter_first_name ? `${v.submitter_first_name} ${v.submitter_last_name ?? ''}`.trim() : 'Unknown'
              const sColor = v.driver_submission_status === 'APPROVED' ? 'var(--kpi-green)' : v.driver_submission_status === 'REJECTED' ? '#fca5a5' : 'var(--kpi-gold)'
              return (
                <div key={v.id} className="glass-inner" style={{ padding: '0.9rem 1rem', display: 'flex', alignItems: 'flex-start', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <div style={{ width: 52, height: 52, borderRadius: 10, flexShrink: 0, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginTop: 2, cursor: imgUrl ? 'pointer' : 'default' }}
                    onClick={() => imgUrl && setLightbox({ urls: [imgUrl], index: 0 })}>
                    {imgUrl ? <img src={imgUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <LuCar size={18} color="var(--clr-muted)" />}
                  </div>
                  <div style={{ flex: 1, minWidth: 110 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 700, fontSize: '0.885rem', color: 'var(--clr-text)' }}>{v.plate_number}</span>
                      <span className="badge badge-cyan" style={{ fontSize: '0.67rem' }}>{v.vehicle_type}</span>
                      <span style={{ fontSize: '0.68rem', fontWeight: 700, color: sColor, background: `${sColor}18`, border: `1px solid ${sColor}44`, borderRadius: 99, padding: '0.15rem 0.5rem' }}>{v.driver_submission_status ?? 'PENDING'}</span>
                    </div>
                    <p style={{ fontSize: '0.73rem', color: 'var(--clr-muted)', marginTop: '0.1rem' }}>{tr('veh_sub_by')} <strong style={{ color: 'var(--clr-text)' }}>{submitterName}</strong> · {v.max_capacity_kg} kg</p>
                    {v.description && <p style={{ fontSize: '0.7rem', color: 'var(--clr-muted)' }}>{v.description}</p>}
                    {v.libre_url && <a href={absUrl(v.libre_url)!} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.65rem', display: 'inline-flex', alignItems: 'center', gap: '0.15rem', color: 'var(--clr-accent)', textDecoration: 'none', marginTop: '0.2rem' }}><LuFileText size={10} /> {tr('veh_view_libre')}</a>}
                  </div>
                  {v.driver_submission_status === 'PENDING' && (
                    <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0 }}>
                      <button onClick={() => handleReviewSubmission(v.id, 'APPROVED', v.submitted_by_driver_id ?? undefined)} disabled={!!actionLoading}
                        style={{ padding: '0.3rem 0.65rem', borderRadius: 7, border: '1px solid rgba(74,222,128,0.35)', background: 'rgba(74,222,128,0.08)', color: 'var(--kpi-green)', fontFamily: 'inherit', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        {actionLoading === `review-${v.id}-APPROVED` ? <span className="spinner" /> : null}{tr('veh_approve_btn')}
                      </button>
                      <button onClick={() => handleReviewSubmission(v.id, 'REJECTED')} disabled={!!actionLoading}
                        style={{ padding: '0.3rem 0.65rem', borderRadius: 7, border: '1px solid rgba(239,68,68,0.35)', background: 'rgba(239,68,68,0.08)', color: '#fca5a5', fontFamily: 'inherit', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        {actionLoading === `review-${v.id}-REJECTED` ? <span className="spinner" /> : null}{tr('veh_reject_btn')}
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )
      )}

      {/* Create / Edit modal */}
      {modal !== null && (
        <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) { setModal(null); resetForm() } }}>
          <div className="glass modal-box" style={{ padding: '1.75rem', maxWidth: 460, width: '95%', maxHeight: '90vh', overflowY: 'auto' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--clr-text)', marginBottom: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}><LuCar size={16} /> {modal === 'create' ? tr('veh_create_title') : tr('veh_edit_title')}</h2>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
              {formError && <div className="alert alert-error"><LuTriangleAlert size={13} /> {formError}</div>}
              <div className="input-wrap"><input id="veh-plate" type="text" placeholder=" " value={form.plate_number} onChange={e => setForm(f => ({ ...f, plate_number: e.target.value }))} required /><label htmlFor="veh-plate">{tr('veh_plate_label')}</label></div>
              <div className="input-wrap">
                <VehicleTypeSelect value={form.vehicle_type} onChange={v => setForm(f => ({ ...f, vehicle_type: v }))} style={{ paddingTop: '1.1rem' }} />
                <label htmlFor="veh-type" style={{ top: '0.35rem', fontSize: '0.7rem', color: 'var(--clr-accent)' }}>{tr('veh_type_label')}</label>
              </div>
              <div className="input-wrap"><input id="veh-cap" type="number" placeholder=" " min="1" step="1" value={form.max_capacity_kg} onChange={e => setForm(f => ({ ...f, max_capacity_kg: e.target.value }))} required /><label htmlFor="veh-cap">{tr('veh_cap_label')}</label></div>
              <div className="input-wrap"><input id="veh-desc" type="text" placeholder=" " value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /><label htmlFor="veh-desc">{tr('veh_desc_label')}</label></div>
              {/* company owned toggle */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                <button type="button" onClick={() => setForm(f => ({ ...f, is_company_owned: !f.is_company_owned }))}
                  style={{ width: 44, height: 24, borderRadius: 99, border: 'none', cursor: 'pointer', background: form.is_company_owned ? 'var(--clr-accent)' : 'rgba(255,255,255,0.12)', transition: 'background 0.2s', flexShrink: 0, position: 'relative' }}>
                  <span style={{ position: 'absolute', top: 3, left: form.is_company_owned ? 23 : 3, width: 18, height: 18, borderRadius: '50%', background: form.is_company_owned ? '#080b14' : 'var(--clr-muted)', transition: 'left 0.2s' }} />
                </button>
                <span style={{ fontSize: '0.85rem', color: 'var(--clr-text)' }}>Company-owned vehicle</span>
              </div>
              {/* main photo */}
              <div>
                <p style={{ fontSize: '0.75rem', color: 'var(--clr-muted)', marginBottom: '0.35rem', fontWeight: 600 }}>Main Photo (optional)</p>
                <label htmlFor="veh-photo" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem', borderRadius: 10, border: '1px dashed rgba(255,255,255,0.18)', color: form.vehicle_photo ? 'var(--clr-accent)' : 'var(--clr-muted)', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600, background: 'rgba(255,255,255,0.02)' }}>
                  <LuCamera size={14} /> {form.vehicle_photo ? tr('veh_photo_selected') : (modal === 'edit' ? tr('veh_photo_replace') : tr('veh_photo_add'))}
                </label>
                <input id="veh-photo" ref={photoInputRef} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }} onChange={handlePhotoSelect} />
              </div>
              {/* gallery photos */}
              <div>
                <p style={{ fontSize: '0.75rem', color: 'var(--clr-muted)', marginBottom: '0.35rem', fontWeight: 600 }}>Gallery — up to 5 images (optional)</p>
                <label htmlFor="veh-gallery" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem', borderRadius: 10, border: '1px dashed rgba(255,255,255,0.18)', color: vehicleGallery.length > 0 ? 'var(--clr-accent)' : 'var(--clr-muted)', cursor: vehicleGallery.length >= 5 ? 'not-allowed' : 'pointer', fontSize: '0.82rem', fontWeight: 600, background: 'rgba(255,255,255,0.02)', opacity: vehicleGallery.length >= 5 ? 0.5 : 1 }}>
                  <LuCamera size={14} /> {vehicleGallery.length > 0 ? `${vehicleGallery.length}/5 selected` : tr('veh_gallery_add')}
                </label>
                <input id="veh-gallery" ref={galleryInputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple style={{ display: 'none' }} onChange={handleGallerySelect} disabled={vehicleGallery.length >= 5} />
                {vehicleGallery.length > 0 && (
                  <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                    {vehicleGallery.map((src, idx) => (
                      <div key={idx} style={{ position: 'relative' }}>
                        <img src={src} alt="" style={{ width: 56, height: 56, borderRadius: 8, objectFit: 'cover', border: '1px solid rgba(255,255,255,0.12)' }} />
                        <button type="button" onClick={() => setVehicleGallery(g => g.filter((_, i) => i !== idx))}
                          style={{ position: 'absolute', top: -4, right: -4, width: 16, height: 16, borderRadius: '50%', background: '#ef4444', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
                          <LuX size={9} color="#fff" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {/* libre document */}
              <div>
                <p style={{ fontSize: '0.75rem', color: 'var(--clr-muted)', marginBottom: '0.35rem', fontWeight: 600 }}>Libre Document (optional)</p>
                <label htmlFor="veh-libre" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem', borderRadius: 10, border: '1px dashed rgba(255,255,255,0.18)', color: formLibre ? 'var(--clr-accent)' : 'var(--clr-muted)', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600, background: 'rgba(255,255,255,0.02)' }}>
                  <LuFileText size={14} /> {formLibre ? tr('veh_libre_selected') : (modal === 'edit' ? tr('veh_libre_replace') : tr('veh_libre_upload'))}
                </label>
                <input id="veh-libre" ref={libreInputRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" style={{ display: 'none' }} onChange={handleLibreSelect} />
              </div>
              <div style={{ display: 'flex', gap: '0.6rem', marginTop: '0.25rem' }}>
                <button type="button" className="btn-outline" style={{ flex: 1 }} onClick={() => { setModal(null); resetForm() }}>{tr('veh_cancel')}</button>
                <button type="submit" className="btn-primary" style={{ flex: 2 }} disabled={actionLoading === 'form'}>{actionLoading === 'form' ? <><span className="spinner" /> {tr('veh_saving')}</> : (modal === 'create' ? tr('veh_create_submit') : tr('veh_save_changes'))}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Assign driver modal */}
      {assignModal && (
        <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) setAssignModal(null) }}>
          <div className="glass modal-box" style={{ padding: '1.75rem' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--clr-text)', marginBottom: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}><LuTruck size={15} /> {tr('veh_assign_title')}</h2>
            <p style={{ fontSize: '0.8rem', color: 'var(--clr-muted)', marginBottom: '1rem' }}>{tr('veh_vehicle_label')} <strong style={{ color: 'var(--clr-text)' }}>{assignModal.plate_number}</strong></p>
            {driversLoading ? <LoadingSpinner /> : (
              <>
                <div className="input-wrap" style={{ marginBottom: '0.75rem' }}>
                  <select id="drv-sel" value={selectedDriver} onChange={e => setSelectedDriver(e.target.value)}
                    style={{ background: 'transparent', border: 'none', color: 'var(--clr-text)', fontFamily: 'inherit', fontSize: '0.9rem', width: '100%', outline: 'none', paddingTop: '1.1rem' }}>
                    <option value="" style={{ background: '#0f172a' }}>{tr('veh_unassign_opt')}</option>
                    {allDrivers.map(d => (
                      <option key={d.user_id} value={d.user_id} style={{ background: '#0f172a' }}>{d.first_name} {d.last_name} · {d.phone_number}</option>
                    ))}
                  </select>
                  <label htmlFor="drv-sel" style={{ top: '0.35rem', fontSize: '0.7rem', color: 'var(--clr-accent)' }}>{tr('veh_driver_label')}</label>
                </div>
                <div style={{ display: 'flex', gap: '0.6rem' }}>
                  <button className="btn-outline" style={{ flex: 1 }} onClick={() => setAssignModal(null)}>{tr('veh_cancel')}</button>
                  <button className="btn-primary" style={{ flex: 2 }} disabled={!!actionLoading} onClick={handleAssign}>
                    {actionLoading ? <><span className="spinner" /> …</> : (selectedDriver ? tr('veh_assign_btn') : tr('veh_unassign_btn'))}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteConfirm && (
        <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) setDeleteConfirm(null) }}>
          <div className="glass modal-box" style={{ padding: '1.75rem' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 800, color: '#fca5a5', marginBottom: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}><LuTriangleAlert size={15} /> {tr('veh_deactivate_title')}</h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--clr-muted)', marginBottom: '1.1rem' }}>Deactivate <strong style={{ color: 'var(--clr-text)' }}>{deleteConfirm.plate_number}</strong>? {tr('veh_deactivate_confirm')}</p>
            <div style={{ display: 'flex', gap: '0.6rem' }}>
              <button className="btn-outline" style={{ flex: 1 }} onClick={() => setDeleteConfirm(null)}>{tr('veh_cancel')}</button>
              <button disabled={!!actionLoading} onClick={() => handleDelete(deleteConfirm)}
                style={{ flex: 1, padding: '0.7rem', borderRadius: 10, border: 'none', background: '#ef4444', color: '#fff', fontFamily: 'inherit', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer' }}>
                {actionLoading ? <><span className="spinner" /> …</> : tr('veh_deactivate_btn')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div onClick={() => setLightbox(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.88)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out', backdropFilter: 'blur(6px)' }}>
          <button onClick={() => setLightbox(null)}
            style={{ position: 'absolute', top: '1rem', right: '1rem', width: 36, height: 36, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.1)', color: '#fff', cursor: 'pointer', fontSize: '1.1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1 }}>✕</button>
          {lightbox.urls.length > 1 && (
            <>
              <button onClick={e => { e.stopPropagation(); setLightbox(lb => lb ? { ...lb, index: (lb.index - 1 + lb.urls.length) % lb.urls.length } : null) }}
                style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', width: 40, height: 40, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.1)', color: '#fff', cursor: 'pointer', fontSize: '1.2rem', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1 }}>‹</button>
              <button onClick={e => { e.stopPropagation(); setLightbox(lb => lb ? { ...lb, index: (lb.index + 1) % lb.urls.length } : null) }}
                style={{ position: 'absolute', right: '1rem', top: '50%', transform: 'translateY(-50%)', width: 40, height: 40, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.1)', color: '#fff', cursor: 'pointer', fontSize: '1.2rem', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1 }}>›</button>
            </>
          )}
          <img src={lightbox.urls[lightbox.index]} alt="" onClick={e => e.stopPropagation()}
            style={{ maxWidth: '90vw', maxHeight: '88vh', borderRadius: 14, boxShadow: '0 24px 80px rgba(0,0,0,0.8)', objectFit: 'contain', cursor: 'default' }} />
          {lightbox.urls.length > 1 && (
            <div style={{ position: 'absolute', bottom: '1.25rem', left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: '0.4rem' }}>
              {lightbox.urls.map((_, i) => (
                <div key={i} onClick={e => { e.stopPropagation(); setLightbox(lb => lb ? { ...lb, index: i } : null) }}
                  style={{ width: i === lightbox.index ? 20 : 8, height: 8, borderRadius: 99, background: i === lightbox.index ? 'var(--kpi-cyan)' : 'rgba(255,255,255,0.3)', cursor: 'pointer', transition: 'all 0.2s' }} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Toast */}
      {toastMsg && (
        <div style={{ position: 'fixed', bottom: '1.25rem', right: '1.25rem', zIndex: 200, background: 'rgba(97, 148, 31,0.12)', border: '1px solid rgba(97, 148, 31,0.25)', color: 'var(--clr-text)', padding: '0.65rem 1.1rem', borderRadius: 12, fontSize: '0.85rem', fontWeight: 600, backdropFilter: 'blur(12px)' }}>
          {toastMsg}
        </div>
      )}
    </div>
  )
}

// ─── Admin Map Helpers (shared by Create Order forms) ────────────────────────

const adminPickupIcon = new L.DivIcon({
  html: `<div style="width:18px;height:18px;border-radius:50%;background:#4ade80;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.5)"></div>`,
  iconSize: [18, 18], iconAnchor: [9, 9], className: '',
})
const adminDeliveryIcon = new L.DivIcon({
  html: `<div style="width:18px;height:18px;border-radius:50%;background:#f87171;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.5)"></div>`,
  iconSize: [18, 18], iconAnchor: [9, 9], className: '',
})

async function adminReverseGeocode(lat: number, lng: number): Promise<{ address: string; countryCode: string | null }> {
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&addressdetails=1&lat=${lat}&lon=${lng}`, { headers: { 'Accept-Language': 'en' } })
    const d = await r.json()
    const { road, suburb, city, town, village, state, country, country_code } = d.address ?? {}
    const parts = [road, suburb, city ?? town ?? village, state, country].filter(Boolean)
    return { address: parts.join(', ') || `${lat.toFixed(5)}, ${lng.toFixed(5)}`, countryCode: country_code ? String(country_code).toLowerCase() : null }
  } catch { return { address: `${lat.toFixed(5)}, ${lng.toFixed(5)}`, countryCode: null } }
}

function AdminMapClickHandler({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: e => onPick(e.latlng.lat, e.latlng.lng) })
  return null
}

function AdminLocationSearch({ label, dotColor, value, countryCode, onSelect, onClear }: {
  label: string; dotColor: string; value: string; countryCode?: string
  onSelect: (lat: string, lng: string, addr: string, cCode: string | null) => void
  onClear: () => void
}) {
  const [q, setQ] = useState(value)
  const [results, setResults] = useState<Array<{ display_name: string; lat: string; lon: string; address?: { country_code?: string } }>>([])
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => { setQ(value) }, [value])

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const search = (text: string) => {
    setQ(text)
    clearTimeout(timerRef.current ?? undefined)
    if (!text.trim() || text.length < 2) { setResults([]); setOpen(false); return }
    timerRef.current = setTimeout(async () => {
      setBusy(true)
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&q=${encodeURIComponent(text)}&limit=6${countryCode ? `&countrycodes=${encodeURIComponent(countryCode)}` : ''}`,
          { headers: { 'Accept-Language': 'en' } }
        )
        const d: Array<{ display_name: string; lat: string; lon: string; address?: { country_code?: string } }> = await res.json()
        setResults(d); setOpen(d.length > 0)
      } catch { /* ignore */ }
      finally { setBusy(false) }
    }, 450)
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 0.85rem', borderRadius: 10, background: 'rgba(255,255,255,0.05)', border: `1px solid ${dotColor}44` }}>
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
        <span style={{ fontSize: '0.67rem', fontWeight: 700, color: dotColor, width: 50, flexShrink: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
        <input value={q} onChange={e => search(e.target.value)} onFocus={() => results.length > 0 && setOpen(true)}
          placeholder={`Type ${label.toLowerCase()} address…`}
          style={{ flex: 1, background: 'none', border: 'none', color: 'var(--clr-text)', fontFamily: 'inherit', fontSize: '0.82rem', outline: 'none', minWidth: 0 }} />
        {busy && <span className="spinner" style={{ width: 13, height: 13, borderWidth: 1.5, flexShrink: 0 }} />}
        {q && !busy && <button type="button" onClick={() => { setQ(''); setResults([]); setOpen(false); onClear() }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--clr-muted)', padding: 0, display: 'flex', alignItems: 'center', flexShrink: 0 }}><LuX size={12} /></button>}
      </div>
      {open && results.length > 0 && (
        <div style={{ position: 'absolute', top: 'calc(100% + 3px)', left: 0, right: 0, zIndex: 9999, background: '#0d1526', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 10, overflow: 'hidden', boxShadow: '0 10px 40px rgba(0,0,0,0.7)', maxHeight: 200, overflowY: 'auto' }}>
          {results.map((item, i) => (
            <button key={i} type="button"
              onClick={() => { setQ(item.display_name); setOpen(false); onSelect(item.lat, item.lon, item.display_name, item.address?.country_code ? String(item.address.country_code).toLowerCase() : null) }}
              style={{ display: 'flex', alignItems: 'flex-start', gap: '0.45rem', width: '100%', textAlign: 'left', padding: '0.6rem 0.85rem', background: 'none', border: 'none', borderBottom: i < results.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none', color: 'var(--clr-text)', fontFamily: 'inherit', fontSize: '0.78rem', cursor: 'pointer', lineHeight: 1.4 }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.07)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
              <LuMapPin size={12} style={{ color: dotColor, marginTop: 2, flexShrink: 0 }} /><span>{item.display_name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

interface AdminMapPickerProps {
  pickupLat: string; pickupLng: string; pickupAddress: string
  deliveryLat: string; deliveryLng: string; deliveryAddress: string
  selectedCountryCode?: string
  onChange: (field: 'pickup_lat' | 'pickup_lng' | 'pickup_address' | 'pickup_country_code' | 'delivery_lat' | 'delivery_lng' | 'delivery_address' | 'delivery_country_code', val: string) => void
}
function AdminMapPicker({ pickupLat, pickupLng, pickupAddress, deliveryLat, deliveryLng, deliveryAddress, selectedCountryCode, onChange }: AdminMapPickerProps) {
  const [mode, setMode] = useState<'pickup' | 'delivery'>('pickup')
  const [geocoding, setGeocoding] = useState(false)
  const [gpsLoading, setGpsLoading] = useState(false)

  const handlePick = async (lat: number, lng: number) => {
    setGeocoding(true)
    const geo = await adminReverseGeocode(lat, lng)
    if (mode === 'pickup') {
      onChange('pickup_lat', lat.toFixed(6)); onChange('pickup_lng', lng.toFixed(6))
      onChange('pickup_address', geo.address); onChange('pickup_country_code', geo.countryCode ?? '')
    } else {
      onChange('delivery_lat', lat.toFixed(6)); onChange('delivery_lng', lng.toFixed(6))
      onChange('delivery_address', geo.address); onChange('delivery_country_code', geo.countryCode ?? '')
    }
    setGeocoding(false)
  }

  const useMyLocation = () => {
    if (!navigator.geolocation) return
    setGpsLoading(true)
    navigator.geolocation.getCurrentPosition(async pos => {
      const { latitude: lat, longitude: lng } = pos.coords
      const geo = await adminReverseGeocode(lat, lng)
      if (mode === 'pickup') {
        onChange('pickup_lat', lat.toFixed(6)); onChange('pickup_lng', lng.toFixed(6))
        onChange('pickup_address', geo.address); onChange('pickup_country_code', geo.countryCode ?? '')
      } else {
        onChange('delivery_lat', lat.toFixed(6)); onChange('delivery_lng', lng.toFixed(6))
        onChange('delivery_address', geo.address); onChange('delivery_country_code', geo.countryCode ?? '')
      }
      setGpsLoading(false)
    }, () => setGpsLoading(false))
  }

  const pLat = parseFloat(pickupLat), pLng = parseFloat(pickupLng)
  const dLat = parseFloat(deliveryLat), dLng = parseFloat(deliveryLng)
  const hasPickup = !isNaN(pLat) && !isNaN(pLng)
  const hasDelivery = !isNaN(dLat) && !isNaN(dLng)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      <AdminLocationSearch label="Pickup" dotColor="var(--kpi-green)" value={pickupAddress} countryCode={selectedCountryCode}
        onSelect={(lat, lng, addr, cCode) => { onChange('pickup_lat', lat); onChange('pickup_lng', lng); onChange('pickup_address', addr); onChange('pickup_country_code', cCode ?? ''); setMode('delivery') }}
        onClear={() => { onChange('pickup_lat', ''); onChange('pickup_lng', ''); onChange('pickup_address', ''); onChange('pickup_country_code', '') }} />
      <AdminLocationSearch label="Delivery" dotColor="#f87171" value={deliveryAddress} countryCode={selectedCountryCode}
        onSelect={(lat, lng, addr, cCode) => { onChange('delivery_lat', lat); onChange('delivery_lng', lng); onChange('delivery_address', addr); onChange('delivery_country_code', cCode ?? '') }}
        onClear={() => { onChange('delivery_lat', ''); onChange('delivery_lng', ''); onChange('delivery_address', ''); onChange('delivery_country_code', '') }} />

      {/* Mode toggle + GPS */}
      <div style={{ display: 'flex', gap: '0.4rem', background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: '0.25rem' }}>
        {(['pickup', 'delivery'] as const).map(m => (
          <button key={m} type="button" onClick={() => setMode(m)}
            style={{ flex: 1, padding: '0.38rem', border: 'none', borderRadius: 8, background: mode === m ? (m === 'pickup' ? 'rgba(74,222,128,0.15)' : 'rgba(248,113,113,0.15)') : 'transparent', color: mode === m ? (m === 'pickup' ? 'var(--kpi-green)' : '#f87171') : 'var(--clr-muted)', fontFamily: 'inherit', fontSize: '0.73rem', fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s', outline: mode === m ? `1px solid ${m === 'pickup' ? 'rgba(74,222,128,0.3)' : 'rgba(248,113,113,0.3)'}` : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: mode === m ? (m === 'pickup' ? 'var(--kpi-green)' : '#f87171') : 'rgba(255,255,255,0.3)', flexShrink: 0 }} />
            Pin {m === 'pickup' ? 'Pickup' : 'Delivery'} {m === 'pickup' && hasPickup && <LuCircleCheck size={10} />}{m === 'delivery' && hasDelivery && <LuCircleCheck size={10} />}
          </button>
        ))}
        <button type="button" onClick={useMyLocation} disabled={gpsLoading}
          style={{ padding: '0.38rem 0.6rem', border: 'none', borderRadius: 8, background: 'rgba(99,102,241,0.15)', color: gpsLoading ? 'var(--clr-muted)' : '#818cf8', fontFamily: 'inherit', fontSize: '0.73rem', fontWeight: 700, cursor: gpsLoading ? 'wait' : 'pointer', outline: '1px solid rgba(99,102,241,0.25)', display: 'flex', alignItems: 'center', gap: '0.3rem', flexShrink: 0 }}>
          {gpsLoading ? <span className="spinner" style={{ width: 11, height: 11, borderWidth: 1.5 }} /> : <LuNavigation size={12} />}
        </button>
      </div>

      {hasPickup && hasDelivery && pLat.toFixed(4) === dLat.toFixed(4) && pLng.toFixed(4) === dLng.toFixed(4) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.45rem 0.75rem', borderRadius: 9, background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.25)', fontSize: '0.72rem', color: '#f87171' }}>
          <LuTriangleAlert size={12} /> Pickup and delivery are the same location.
        </div>
      )}

      <p style={{ fontSize: '0.7rem', color: geocoding ? 'var(--clr-accent)' : 'var(--clr-muted)', textAlign: 'center', margin: 0 }}>
        {geocoding ? 'Getting address…' : `Tap map to pin ${mode} location`}
      </p>

      {/* Map */}
      <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)', height: 220 }}>
        <MapContainer center={[9.0084, 38.7575]} zoom={12} style={{ width: '100%', height: '100%' }} scrollWheelZoom>
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; <a href="https://openstreetmap.org">OpenStreetMap</a>' />
          <AdminMapClickHandler onPick={handlePick} />
          {hasPickup && <Marker position={[pLat, pLng]} icon={adminPickupIcon}><Popup>Pickup: {pickupAddress}</Popup></Marker>}
          {hasDelivery && <Marker position={[dLat, dLng]} icon={adminDeliveryIcon}><Popup>Delivery: {deliveryAddress}</Popup></Marker>}
        </MapContainer>
      </div>
    </div>
  )
}

// ─── Admin Orders Section ────────────────────────────────────────────────────

interface AdminOrder {
  id: string; reference_code: string; status: string
  cargo_type_name: string; vehicle_type_required: string; estimated_weight_kg: number | null
  pickup_address: string; delivery_address: string
  estimated_price: number; final_price: number | null; currency: string
  shipper_first_name: string; shipper_last_name: string
  driver_first_name: string | null; driver_last_name: string | null
  driver_id?: string | null
  created_at: string
  is_cross_border?: number | boolean
  is_guest_order?: number | boolean
  driver_payout_status?: 'PENDING' | 'WALLET_PAID' | 'BANK_TRANSFERRED'
}
interface OrderStats {
  by_status: Record<string, number>
  total_orders: number
  total_revenue: string | number
}
interface AdminDriver { user_id: string; first_name: string; last_name: string; phone_number: string }
interface AdminVehicle { id: string; plate_number: string; vehicle_type: string; driver_id?: string | null }

const ORDER_STATUS_COLOR: Record<string, string> = {
  PENDING: 'var(--kpi-gold)', ASSIGNED: '#60a5fa', EN_ROUTE: 'var(--kpi-purple)',
  AT_PICKUP: 'var(--kpi-orange)', IN_TRANSIT: '#34d399', DELIVERED: 'var(--kpi-green)', CANCELLED: '#f87171',
}
const ORDER_STATUS_LABEL: Record<string, string> = {
  PENDING: 'Pending', ASSIGNED: 'Assigned', EN_ROUTE: 'En Route',
  AT_PICKUP: 'At Pickup', IN_TRANSIT: 'In Transit', DELIVERED: 'Delivered', CANCELLED: 'Cancelled',
}
function orderBadge(status: string) {
  const c = ORDER_STATUS_COLOR[status] ?? '#94a3b8'
  return <span style={{ fontSize: '0.68rem', fontWeight: 700, color: c, background: `${c}1a`, border: `1px solid ${c}44`, borderRadius: 99, padding: '0.15rem 0.5rem', whiteSpace: 'nowrap' }}>{ORDER_STATUS_LABEL[status] ?? status}</span>
}

function AdminOrdersSection({ initialDriverFilter, initialStatusFilter }: { initialDriverFilter?: string; initialStatusFilter?: string } = {}) {
  const { t: tr } = useLanguage()
  const [orders, setOrders] = useState<AdminOrder[]>([])
  const [stats, setStats] = useState<OrderStats | null>(null)
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState(initialStatusFilter ?? '')
  const [driverFilter, setDriverFilter] = useState(initialDriverFilter ?? '')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const LIMIT = 15
  const [toast, setToast] = useState('')
  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3000) }

  // Assign modal
  const [assignOrder, setAssignOrder] = useState<AdminOrder | null>(null)
  const [drivers, setDrivers] = useState<AdminDriver[]>([])
  const [suggestedDrivers, setSuggestedDrivers] = useState<any[]>([])
  const [vehicles, setVehicles] = useState<AdminVehicle[]>([])
  const [selDriver, setSelDriver] = useState('')
  const [selVehicle, setSelVehicle] = useState('')
  const [assigning, setAssigning] = useState(false)
  const [detailOrder, setDetailOrder] = useState<any | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)

  // Price adjustment state
  const [priceAdjustMode, setPriceAdjustMode] = useState(false)
  const [priceAdjustVal, setPriceAdjustVal] = useState('')
  const [priceAdjustNotes, setPriceAdjustNotes] = useState('')
  const [priceAdjusting, setPriceAdjusting] = useState(false)
  const [statusOverride, setStatusOverride] = useState('')
  const [statusOverrideNotes, setStatusOverrideNotes] = useState('')
  const [statusOverrideSaving, setStatusOverrideSaving] = useState(false)
  const [internalNotes, setInternalNotes] = useState('')
  const [internalNotesSaving, setInternalNotesSaving] = useState(false)
  const [orderCargoTypes, setOrderCargoTypes] = useState<Array<{ id: number; name: string }>>([])
  const [detailsOverrideSaving, setDetailsOverrideSaving] = useState(false)
  const [detailsOverrideForm, setDetailsOverrideForm] = useState({
    cargo_type_id: '',
    vehicle_type_required: '',
    estimated_weight_kg: '',
    pickup_address: '',
    pickup_lat: '',
    pickup_lng: '',
    delivery_address: '',
    delivery_lat: '',
    delivery_lng: '',
    special_instructions: '',
    notes: '',
  })

  // Order detail chat (admin ↔ shipper / admin ↔ driver)
  const [detailChatChannel, setDetailChatChannel] = useState<'shipper' | 'driver'>('shipper')
  const [detailMessages, setDetailMessages] = useState<ChatMessage[]>([])
  const [detailChatMsg, setDetailChatMsg] = useState('')
  const [detailChatSending, setDetailChatSending] = useState(false)
  const detailChatEndRef = useRef<HTMLDivElement>(null)

  // Driver payout states
  const [orderDriverPayments, setOrderDriverPayments] = useState<any[]>([])
  const [payDriverOpen, setPayDriverOpen] = useState(false)
  const [pdGross, setPdGross] = useState('')
  const [pdCommType, setPdCommType] = useState<'PERCENT' | 'FIXED' | 'NONE'>('NONE')
  const [pdCommValue, setPdCommValue] = useState('')
  const [pdNote, setPdNote] = useState('')
  const [pdSaving, setPdSaving] = useState(false)
  const [pdErr, setPdErr] = useState('')
  const [bankTransferOpen, setBankTransferOpen] = useState(false)
  const [btAmount, setBtAmount] = useState('')
  const [btNote, setBtNote] = useState('')
  const [btReceiptB64, setBtReceiptB64] = useState('')
  const [btReceiptPreview, setBtReceiptPreview] = useState('')
  const [btSaving, setBtSaving] = useState(false)
  const [btErr, setBtErr] = useState('')

  // Create Order on behalf state
  const [createOrderModal, setCreateOrderModal] = useState(false)
  const [shippers, setShippers] = useState<Array<{ id: string; first_name: string; last_name: string; phone_number: string }>>([])
  const [cargoTypesForCreate, setCargoTypesForCreate] = useState<Array<{ id: number; name: string; icon: string | null; icon_url: string | null }>>([])
  const [coCountries, setCoCountries] = useState<Array<{ id: number; name: string; iso_code: string }>>([])
  const [coForm, setCoForm] = useState({
    shipper_id: '', shipper_search: '',
    country_code: '',
    cargo_type_id: '', vehicle_type: '',
    estimated_weight_kg: '',
    pickup_address: '', pickup_lat: '', pickup_lng: '', pickup_country_code: '',
    delivery_address: '', delivery_lat: '', delivery_lng: '', delivery_country_code: '',
    special_instructions: '',
    driver_id: '', vehicle_id: '',
  })
  const [coQuote, setCoQuote] = useState<{ estimated_price: number; distance_km: number; base_fare: number; per_km_rate: number; weight_cost?: number; fees_breakdown?: any[] } | null>(null)
  const [coStep, setCoStep] = useState<'form' | 'confirm'>('form')
  const [coSaving, setCoSaving] = useState(false)
  const [coErr, setCoErr] = useState('')
  // Optional image uploads
  const [coCargoImage, setCoCargoImage] = useState<string | null>(null)
  const [coPaymentReceipt, setCoPaymentReceipt] = useState<string | null>(null)
  // Cross-border fields for create order
  const [coIsCrossBorder, setCoIsCrossBorder] = useState(false)
  const [coDeliveryCountryId, setCoDeliveryCountryId] = useState('')
  const [coHsCode, setCoHsCode] = useState('')
  const [coShipperTin, setCoShipperTin] = useState('')

  const loadOrders = useCallback(async (pg = page, sf = statusFilter, q = search, df = driverFilter) => {
    setLoading(true)
    try {
      const { data } = await adminOrderApi.listOrders({ page: pg, limit: LIMIT, status: sf || undefined, search: q || undefined, driver_id: df || undefined })
      // Filter out guest orders — those belong in the Guest Orders section
      setOrders((data.orders ?? []).filter((o: AdminOrder) => !o.is_guest_order))
      setTotal(data.pagination?.total ?? 0)
    } catch { showToast('Failed to load orders') }
    finally { setLoading(false) }
  }, [page, statusFilter, search, driverFilter])

  const loadStats = async () => {
    try { const { data } = await adminOrderApi.getStats(); setStats(data.stats) }
    catch { /* ignore */ }
  }

  useEffect(() => { loadOrders(); loadStats() }, []) // eslint-disable-line
  useEffect(() => { loadOrders(page, statusFilter, search, driverFilter) }, [page, statusFilter, driverFilter]) // eslint-disable-line

  useEffect(() => {
    adminOrderApi
      .listCargoTypes()
      .then(({ data }) => {
        const types = (data.cargo_types ?? []).map((ct: any) => ({ id: Number(ct.id), name: String(ct.name) }))
        setOrderCargoTypes(types)
      })
      .catch(() => {
        setOrderCargoTypes([])
      })
  }, [])

  const setDetailOverrideFromOrder = (order: any) => {
    setDetailsOverrideForm({
      cargo_type_id: order?.cargo_type_id != null ? String(order.cargo_type_id) : '',
      vehicle_type_required: String(order?.vehicle_type_required ?? order?.vehicle_type ?? ''),
      estimated_weight_kg: order?.estimated_weight_kg != null ? String(order.estimated_weight_kg) : '',
      pickup_address: String(order?.pickup_address ?? ''),
      pickup_lat: order?.pickup_lat != null ? String(order.pickup_lat) : '',
      pickup_lng: order?.pickup_lng != null ? String(order.pickup_lng) : '',
      delivery_address: String(order?.delivery_address ?? ''),
      delivery_lat: order?.delivery_lat != null ? String(order.delivery_lat) : '',
      delivery_lng: order?.delivery_lng != null ? String(order.delivery_lng) : '',
      special_instructions: String(order?.special_instructions ?? ''),
      notes: '',
    })
  }

  const openAssign = async (o: AdminOrder) => {
    setAssignOrder(o); setSelDriver(''); setSelVehicle(''); setSuggestedDrivers([])
    try {
      const [dr, vh, sugg] = await Promise.all([
        apiClient.get('/admin/drivers?filter=verified'),
        apiClient.get('/admin/vehicles'),
        apiClient.get(`/admin/orders/${o.id}/suggest-drivers`).catch(() => ({ data: { drivers: [] } })),
      ])
      setDrivers(dr.data.drivers ?? [])
      setVehicles((vh.data.vehicles ?? []).filter((v: any) => v.is_active))
      setSuggestedDrivers(sugg.data.drivers ?? [])
    } catch { showToast('Failed to load drivers/vehicles') }
  }

  // Auto-fill vehicle when driver selection changes
  useEffect(() => {
    if (selDriver && vehicles.length > 0) {
      const match = vehicles.find((v: AdminVehicle) => v.driver_id === selDriver)
      if (match) setSelVehicle(match.id)
      else setSelVehicle('')
    }
  }, [selDriver]) // eslint-disable-line

  const loadOrderPayments = async (orderId: string) => {
    try {
      const r = await adminOrderApi.getOrderDriverPayments(orderId)
      setOrderDriverPayments(r.data.payments ?? [])
    } catch { setOrderDriverPayments([]) }
  }

  const openOrderDetail = async (id: string) => {
    setLoadingDetail(true)
    setDetailOrder(null)
    setDetailChatChannel('shipper')
    setDetailMessages([])
    setPriceAdjustMode(false); setPriceAdjustVal(''); setPriceAdjustNotes('')
    setOrderDriverPayments([])
    try {
      const { data } = await adminOrderApi.getOrder(id)
      const order = data.order ?? data
      setDetailOrder(order)
      setStatusOverride(order.status ?? '')
      setInternalNotes(order.internal_notes ?? '')
      setDetailOverrideFromOrder(order)
      setPdGross(String(order.final_price ?? order.estimated_price ?? ''))
      setBtAmount(String(order.final_price ?? order.estimated_price ?? ''))
      loadOrderPayments(id)
    } catch { showToast('Failed to load order details') }
    finally { setLoadingDetail(false) }
  }

  // Load detail chat messages when order or channel changes
  useEffect(() => {
    if (detailOrder?.id) {
      adminOrderApi.getOrderMessages(detailOrder.id, detailChatChannel)
        .then(({ data }) => setDetailMessages(data.messages ?? []))
        .catch(() => setDetailMessages([]))
    } else {
      setDetailMessages([])
    }
  }, [detailOrder?.id, detailChatChannel]) // eslint-disable-line

  useEffect(() => {
    detailChatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [detailMessages])

  const sendDetailMsg = async () => {
    if (!detailChatMsg.trim() || !detailOrder?.id || detailChatSending) return
    setDetailChatSending(true)
    try {
      await adminOrderApi.sendOrderMessage(detailOrder.id, detailChatMsg.trim(), detailChatChannel)
      setDetailChatMsg('')
      const { data } = await adminOrderApi.getOrderMessages(detailOrder.id, detailChatChannel)
      setDetailMessages(data.messages ?? [])
    } catch { showToast('Failed to send') }
    finally { setDetailChatSending(false) }
  }

  const submitPriceAdjust = async () => {
    const val = parseFloat(priceAdjustVal)
    if (isNaN(val) || val < 0) { showToast('Enter a valid price'); return }
    setPriceAdjusting(true)
    try {
      await apiClient.patch(`/admin/orders/${detailOrder.id}/price`, { final_price: val, notes: priceAdjustNotes || undefined })
      showToast(`Price updated to ${val.toLocaleString()} ETB`)
      setPriceAdjustMode(false)
      // refresh detail
      const { data } = await adminOrderApi.getOrder(detailOrder.id)
      setDetailOrder(data.order ?? data)
    } catch (e: any) { showToast(e.response?.data?.message ?? 'Price update failed') }
    finally { setPriceAdjusting(false) }
  }

  const submitStatusOverride = async () => {
    if (!detailOrder?.id || !statusOverride) return
    setStatusOverrideSaving(true)
    try {
      await adminOrderApi.updateStatus(detailOrder.id, statusOverride, statusOverrideNotes || undefined)
      showToast(`Status updated to ${statusOverride}`)
      const { data } = await adminOrderApi.getOrder(detailOrder.id)
      const order = data.order ?? data
      setDetailOrder(order)
      setStatusOverride(order.status ?? statusOverride)
      loadOrders(page, statusFilter, search, driverFilter)
    } catch (e: any) { showToast(e.response?.data?.message ?? 'Status update failed') }
    finally { setStatusOverrideSaving(false) }
  }

  const submitInternalNotes = async () => {
    if (!detailOrder?.id) return
    setInternalNotesSaving(true)
    try {
      await adminOrderApi.updateInternalNotes(detailOrder.id, internalNotes)
      showToast('Internal notes saved')
      const { data } = await adminOrderApi.getOrder(detailOrder.id)
      const order = data.order ?? data
      setDetailOrder(order)
      setInternalNotes(order.internal_notes ?? internalNotes)
    } catch (e: any) { showToast(e.response?.data?.message ?? 'Notes update failed') }
    finally { setInternalNotesSaving(false) }
  }

  const submitDetailsOverride = async () => {
    if (!detailOrder?.id) return

    const cargoTypeId = Number(detailsOverrideForm.cargo_type_id)
    if (!Number.isInteger(cargoTypeId) || cargoTypeId <= 0) {
      showToast('Select a valid cargo type')
      return
    }

    const vehicleType = detailsOverrideForm.vehicle_type_required.trim()
    if (!vehicleType) {
      showToast('Vehicle type is required')
      return
    }

    const pickupLat = Number(detailsOverrideForm.pickup_lat)
    const pickupLng = Number(detailsOverrideForm.pickup_lng)
    const deliveryLat = Number(detailsOverrideForm.delivery_lat)
    const deliveryLng = Number(detailsOverrideForm.delivery_lng)

    if ([pickupLat, pickupLng, deliveryLat, deliveryLng].some((v) => Number.isNaN(v))) {
      showToast('Pickup and delivery coordinates must be valid numbers')
      return
    }

    let weightValue: number | null = null
    if (detailsOverrideForm.estimated_weight_kg.trim() !== '') {
      const parsed = Number(detailsOverrideForm.estimated_weight_kg)
      if (Number.isNaN(parsed) || parsed < 0) {
        showToast('Weight must be a non-negative number')
        return
      }
      weightValue = parsed
    }

    setDetailsOverrideSaving(true)
    try {
      await adminOrderApi.updateDetails(detailOrder.id, {
        cargo_type_id: cargoTypeId,
        vehicle_type_required: vehicleType,
        estimated_weight_kg: weightValue,
        pickup_address: detailsOverrideForm.pickup_address.trim() || null,
        pickup_lat: pickupLat,
        pickup_lng: pickupLng,
        delivery_address: detailsOverrideForm.delivery_address.trim() || null,
        delivery_lat: deliveryLat,
        delivery_lng: deliveryLng,
        special_instructions: detailsOverrideForm.special_instructions.trim() || null,
        notes: detailsOverrideForm.notes.trim() || undefined,
      })

      showToast('Order details updated')
      const { data } = await adminOrderApi.getOrder(detailOrder.id)
      const order = data.order ?? data
      setDetailOrder(order)
      setDetailOverrideFromOrder(order)
      loadOrders(page, statusFilter, search, driverFilter)
    } catch (e: any) {
      showToast(e.response?.data?.message ?? 'Details update failed')
    } finally {
      setDetailsOverrideSaving(false)
    }
  }

  const openCreateOrder = async () => {
    setCoForm({ shipper_id: '', shipper_search: '', country_code: '', cargo_type_id: '', vehicle_type: '', estimated_weight_kg: '', pickup_address: '', pickup_lat: '', pickup_lng: '', pickup_country_code: '', delivery_address: '', delivery_lat: '', delivery_lng: '', delivery_country_code: '', special_instructions: '', driver_id: '', vehicle_id: '' })
    setCoQuote(null); setCoStep('form'); setCoErr('')
    setCoCargoImage(null); setCoPaymentReceipt(null)
    setCoIsCrossBorder(false); setCoDeliveryCountryId(''); setCoHsCode(''); setCoShipperTin('')
    setCreateOrderModal(true)
    // Load shippers + cargo types + drivers/vehicles if not loaded
    try {
      const [sh, ct, dr, vh, ctry] = await Promise.all([
        adminOrderApi.getShippers(),
        apiClient.get('/orders/cargo-types'),
        apiClient.get('/admin/drivers?filter=verified'),
        apiClient.get('/admin/vehicles'),
        configApi.getCountries(),
      ])
      setShippers((sh.data.users ?? []).filter((u: any) => u.role_id === 2))
      setCargoTypesForCreate(ct.data.cargo_types ?? [])
      setDrivers(dr.data.drivers ?? [])
      setVehicles((vh.data.vehicles ?? []).filter((v: any) => v.is_active))
      const countries = ctry.data.countries ?? []
      setCoCountries(countries)
      if (countries[0]?.iso_code) {
        setCoForm(f => ({ ...f, country_code: String(countries[0].iso_code).toLowerCase() }))
      }
    } catch { setCoErr('Failed to load data') }
  }

  const getCoQuote = async () => {
    setCoErr('')
    if (!coForm.country_code) {
      setCoErr('Select country first'); return
    }
    if (coForm.pickup_country_code && coForm.pickup_country_code !== coForm.country_code) {
      setCoErr('Pickup is outside selected country'); return
    }
    if (!coIsCrossBorder && coForm.delivery_country_code && coForm.delivery_country_code !== coForm.country_code) {
      setCoErr('Delivery is outside selected country'); return
    }
    if (coIsCrossBorder && !coDeliveryCountryId) {
      setCoErr('Select a delivery country for cross-border shipment'); return
    }
    if (!coForm.cargo_type_id || !coForm.vehicle_type || !coForm.pickup_lat || !coForm.delivery_lat) {
      setCoErr('Fill cargo type, vehicle, pickup & delivery locations first'); return
    }
    try {
      const { data } = await apiClient.post('/orders/quote', {
        cargo_type_id: Number(coForm.cargo_type_id),
        vehicle_type: coForm.vehicle_type,
        estimated_weight_kg: coForm.estimated_weight_kg ? Number(coForm.estimated_weight_kg) : undefined,
        pickup_lat: Number(coForm.pickup_lat), pickup_lng: Number(coForm.pickup_lng),
        delivery_lat: Number(coForm.delivery_lat), delivery_lng: Number(coForm.delivery_lng),
        is_cross_border: coIsCrossBorder || undefined,
      })
      setCoQuote(data.quote ?? data)
      setCoStep('confirm')
    } catch (e: any) { setCoErr(e.response?.data?.message ?? 'Quote failed') }
  }

  const placeCoOrder = async () => {
    if (!coForm.shipper_id) { setCoErr('Select a shipper'); return }
    const pickupCountryObj = coCountries.find(c => String(c.iso_code).toLowerCase() === coForm.country_code)
    if (!coIsCrossBorder && (!coForm.country_code || (coForm.pickup_country_code && coForm.pickup_country_code !== coForm.country_code) || (coForm.delivery_country_code && coForm.delivery_country_code !== coForm.country_code))) {
      setCoErr('Pickup and delivery must be inside selected country')
      return
    }
    if (coIsCrossBorder && !coDeliveryCountryId) {
      setCoErr('Select a delivery country for cross-border shipment'); return
    }
    setCoSaving(true); setCoErr('')
    try {
      const { data } = await adminOrderApi.createOrderOnBehalf({
        shipper_id: coForm.shipper_id,
        cargo_type_id: Number(coForm.cargo_type_id),
        vehicle_type: coForm.vehicle_type,
        estimated_weight_kg: coForm.estimated_weight_kg ? Number(coForm.estimated_weight_kg) : undefined,
        pickup_address: coForm.pickup_address, pickup_lat: Number(coForm.pickup_lat), pickup_lng: Number(coForm.pickup_lng),
        delivery_address: coForm.delivery_address, delivery_lat: Number(coForm.delivery_lat), delivery_lng: Number(coForm.delivery_lng),
        special_instructions: coForm.special_instructions || undefined,
        driver_id: coForm.driver_id || undefined,
        vehicle_id: coForm.vehicle_id || undefined,
        cargo_image: coCargoImage ?? undefined,
        payment_receipt: coPaymentReceipt ?? undefined,
        is_cross_border: coIsCrossBorder || undefined,
        pickup_country_id: coIsCrossBorder && pickupCountryObj ? pickupCountryObj.id : undefined,
        delivery_country_id: coIsCrossBorder && coDeliveryCountryId ? Number(coDeliveryCountryId) : undefined,
        hs_code: coIsCrossBorder && coHsCode ? coHsCode : undefined,
        shipper_tin: coIsCrossBorder && coShipperTin ? coShipperTin : undefined,
      })
      showToast(`Order ${data.order?.reference_code ?? ''} created! Pickup OTP: ${data.otps?.pickup_otp}`)
      setCreateOrderModal(false)
      loadOrders(page, statusFilter, search)
    } catch (e: any) {
      const data = e.response?.data
      if (e.response?.status === 402 && data?.shortfall !== undefined) {
        setCoErr(`Insufficient wallet balance. Shortfall: ${Number(data.shortfall).toFixed(2)} ETB. Please recharge the shipper wallet first.`)
      } else {
        setCoErr(data?.message ?? 'Failed to create order')
      }
    }
    finally { setCoSaving(false) }
  }

  const handleAssign = async () => {
    if (!assignOrder || !selDriver) return
    setAssigning(true)
    try {
      await adminOrderApi.assignOrder(assignOrder.id, selDriver, selVehicle || undefined)
      showToast('Driver assigned!')
      setAssignOrder(null)
      loadOrders(page, statusFilter, search)
    } catch (e: any) { showToast(e.response?.data?.message ?? 'Assignment failed') }
    finally { setAssigning(false) }
  }

  const handleCancel = async (o: AdminOrder) => {
    if (!window.confirm(`Cancel order ${o.reference_code}?`)) return
    try {
      await adminOrderApi.cancelOrder(o.id, 'Cancelled by admin')
      showToast('Order cancelled.')
      loadOrders(page, statusFilter, search)
    } catch (e: any) { showToast(e.response?.data?.message ?? 'Cancel failed') }
  }

  const totalPages = Math.max(1, Math.ceil(total / LIMIT))
  const STATUSES = ['', 'PENDING', 'ASSIGNED', 'EN_ROUTE', 'AT_PICKUP', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED']
  const OVERRIDE_STATUSES = [
    'PENDING', 'ASSIGNED', 'EN_ROUTE', 'AT_PICKUP', 'IN_TRANSIT',
    'AT_BORDER', 'IN_CUSTOMS', 'CUSTOMS_CLEARED',
    'DELIVERED', 'COMPLETED', 'CANCELLED', 'FAILED',
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--clr-text)', display: 'flex', alignItems: 'center', gap: '0.45rem' }}><LuListOrdered size={17} /> {tr('aord_title')}</h2>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={() => { loadOrders(); loadStats() }} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.3rem 0.7rem', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: 'var(--clr-muted)', fontFamily: 'inherit', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer' }}><LuRefreshCw size={12} /> {tr('aord_refresh')}</button>
          <button onClick={openCreateOrder} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.38rem 0.85rem', borderRadius: 8, border: 'none', background: 'var(--clr-accent)', color: '#000', fontFamily: 'inherit', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}><LuPlus size={14} /> {tr('aord_create_order')}</button>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.65rem' }}>
          {Object.entries(stats.by_status).map(([status, count]) => (
            <div key={status} className="glass-inner" style={{ flex: 1, minWidth: 110, padding: '0.75rem 0.85rem', textAlign: 'center', cursor: 'pointer', display: 'flex', flexDirection: 'column', justifyContent: 'center' }} onClick={() => { setStatusFilter(status); setPage(1) }}>
              <p style={{ fontSize: '1.4rem', fontWeight: 800, color: ORDER_STATUS_COLOR[status] ?? 'var(--clr-text)', lineHeight: 1 }}>{count}</p>
              <p style={{ fontSize: '0.68rem', color: 'var(--clr-muted)', marginTop: '0.4rem', fontWeight: 600 }}>{ORDER_STATUS_LABEL[status] ?? status}</p>
            </div>
          ))}
          <div className="glass-inner" style={{ flex: 1, minWidth: 120, padding: '0.75rem 0.85rem', textAlign: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'center', border: '1px solid rgba(97, 148, 31,0.15)' }}>
            <p style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--clr-accent)', lineHeight: 1 }}>{Number(stats.total_revenue).toLocaleString()}</p>
            <p style={{ fontSize: '0.68rem', color: 'var(--clr-muted)', marginTop: '0.4rem', fontWeight: 600 }}>{tr('aord_revenue')}</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="glass" style={{ padding: '0.75rem 1rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ flex: 1, minWidth: 160, display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: '0.4rem 0.7rem' }}>
          <LuSearch size={13} style={{ color: 'var(--clr-muted)', flexShrink: 0 }} />
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} placeholder={tr('aord_search_ph')} style={{ background: 'none', border: 'none', color: 'var(--clr-text)', fontFamily: 'inherit', fontSize: '0.8rem', outline: 'none', width: '100%' }} />
          {search && <button onClick={() => { setSearch(''); setPage(1) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--clr-muted)', padding: 0, display: 'flex', alignItems: 'center' }}><LuX size={12} /></button>}
        </div>
        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1) }}
          style={{ padding: '0.4rem 0.6rem', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: 'var(--clr-text)', fontFamily: 'inherit', fontSize: '0.78rem', outline: 'none' }}>
          {STATUSES.map(s => <option key={s} value={s} style={{ background: '#0f172a' }}>{s || tr('aord_all_statuses')}</option>)}
        </select>
      </div>

      {driverFilter && (
        <div style={{ padding: '0.75rem 1rem', background: 'rgba(97, 148, 31,0.06)', borderRadius: 8, margin: '0 1px', border: '1px solid rgba(97, 148, 31,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '0.78rem', color: 'var(--clr-accent)', fontWeight: 600 }}>{tr('aord_viewing_driver')}</span>
          <button onClick={() => { setDriverFilter(''); setPage(1); setSearch(''); setStatusFilter(''); }} style={{ background: 'none', border: 'none', color: 'var(--clr-accent)', cursor: 'pointer', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}><LuX size={14} /> {tr('aord_view_all')}</button>
        </div>
      )}

      {/* Order list */}
      <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
        {loading ? (
          <div style={{ gridColumn: '1/-1', display: 'flex', justifyContent: 'center', padding: '3rem' }}><LoadingSpinner /></div>
        ) : orders.length === 0 ? (
          <div className="glass-inner" style={{ gridColumn: '1/-1', padding: '3rem 1rem', textAlign: 'center', color: 'var(--clr-muted)', fontSize: '0.875rem' }}>
            {tr('aord_no_orders')}
          </div>
        ) : orders.map((o) => (
          <div key={o.id} className="glass-inner" onClick={e => { if ((e.target as HTMLElement).closest('button')) return; openOrderDetail(o.id) }} style={{ padding: '0.9rem 1rem', cursor: 'pointer', transition: 'background 0.15s', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }} onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')} onMouseLeave={e => (e.currentTarget.style.background = '')}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 800, fontSize: '0.88rem', color: 'var(--clr-text)' }}>{o.reference_code}</span>
                {orderBadge(o.status)}
                {!!o.is_cross_border && <span style={{ fontSize: '0.63rem', fontWeight: 700, color: '#f59e0b', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 99, padding: '0.1rem 0.45rem' }}>🌍 Cross-Border</span>}
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <span style={{ fontWeight: 800, fontSize: '0.88rem', color: 'var(--clr-accent)' }}>{(o.final_price ?? o.estimated_price).toLocaleString()} ETB</span>
                <div style={{ fontSize: '0.68rem', color: 'var(--clr-muted)', marginTop: '0.2rem' }}>
                  {new Date(o.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '0.75rem' }}>
              <p style={{ fontSize: '0.75rem', color: 'var(--clr-muted)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <LuMapPin size={12} /> {o.pickup_address}
              </p>
              <p style={{ fontSize: '0.75rem', color: 'var(--clr-muted)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <LuArrowRight size={12} /> {o.delivery_address}
              </p>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '0.5rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                <p style={{ fontSize: '0.73rem', color: 'var(--clr-muted)', display: 'flex', gap: '0.25rem' }}><span style={{ color: 'var(--clr-text)' }}>{tr('aord_shipper')}:</span> {o.shipper_first_name} {o.shipper_last_name}</p>
                {o.driver_first_name && <p style={{ fontSize: '0.73rem', color: 'var(--clr-muted)', display: 'flex', gap: '0.25rem' }}><span style={{ color: 'var(--clr-text)' }}>{tr('aord_driver')}:</span> {o.driver_first_name} {o.driver_last_name}</p>}
                {(o.cargo_type_name || o.vehicle_type_required) && (
                  <p style={{ fontSize: '0.73rem', color: 'var(--clr-muted)', display: 'flex', gap: '0.4rem', marginTop: '0.2rem' }}>
                    {o.cargo_type_name && <span>{o.cargo_type_name}</span>}
                    {o.cargo_type_name && o.vehicle_type_required && <span>·</span>}
                    {o.vehicle_type_required && <span>{o.vehicle_type_required}</span>}
                    {o.estimated_weight_kg != null && <><span>·</span><span>{o.estimated_weight_kg} kg</span></>}
                  </p>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', flexShrink: 0 }}>
                {o.status === 'PENDING' && (
                  <button onClick={() => openAssign(o)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.25rem', padding: '0.35rem 0.75rem', borderRadius: 7, border: 'none', background: 'var(--clr-accent)', color: '#080b14', fontFamily: 'inherit', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}>
                    <LuTruck size={12} /> Assign
                  </button>
                )}
                {['PENDING', 'ASSIGNED'].includes(o.status) && (
                  <button onClick={() => handleCancel(o)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.25rem', padding: '0.35rem 0.75rem', borderRadius: 7, border: '1px solid rgba(248,113,113,0.3)', background: 'rgba(248,113,113,0.06)', color: '#f87171', fontFamily: 'inherit', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}>
                    <LuBan size={12} /> Cancel
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem' }}>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={{ padding: '0.3rem 0.6rem', borderRadius: 7, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: 'var(--clr-muted)', cursor: 'pointer', opacity: page === 1 ? 0.4 : 1 }}>‹</button>
          <span style={{ fontSize: '0.78rem', color: 'var(--clr-muted)' }}>{tr('aord_page_of')} {page} {tr('aord_of')} {totalPages} · {total} {tr('aord_total')}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={{ padding: '0.3rem 0.6rem', borderRadius: 7, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: 'var(--clr-muted)', cursor: 'pointer', opacity: page === totalPages ? 0.4 : 1 }}>›</button>
        </div>
      )}

      {/* Assign modal */}
      {assignOrder && (
        <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) setAssignOrder(null) }}>
          <div className="glass modal-box" style={{ padding: '1.75rem' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--clr-text)', marginBottom: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.45rem' }}><LuTruck size={16} /> {tr('aord_assign_driver')}</h2>
            <p style={{ fontSize: '0.8rem', color: 'var(--clr-muted)', marginBottom: '1rem' }}>{tr('aord_order_label')} <strong style={{ color: 'var(--clr-accent)' }}>{assignOrder.reference_code}</strong></p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {/* Nearest available drivers */}
              {suggestedDrivers.length > 0 && (
                <div>
                  <label style={{ fontSize: '0.75rem', color: 'var(--clr-muted)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.45rem' }}>
                    <LuMapPin size={12} /> Nearest Available Drivers
                  </label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: 220, overflowY: 'auto' }}>
                    {suggestedDrivers.map(d => (
                      <div key={d.user_id} onClick={() => setSelDriver(d.user_id)}
                        style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', padding: '0.55rem 0.75rem', borderRadius: 9, border: `1px solid ${selDriver === d.user_id ? 'var(--clr-accent)' : 'rgba(255,255,255,0.1)'}`, background: selDriver === d.user_id ? 'rgba(97, 148, 31,0.08)' : 'rgba(255,255,255,0.03)', cursor: 'pointer', transition: 'all 0.15s' }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--kpi-green)', flexShrink: 0 }} />
                        <div style={{ flex: 1 }}>
                          <p style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--clr-text)', margin: 0 }}>{d.first_name} {d.last_name}</p>
                          <p style={{ fontSize: '0.7rem', color: 'var(--clr-muted)', margin: 0 }}>{d.phone_number}{d.vehicle_type ? ` · ${d.vehicle_type}` : ''}</p>
                        </div>
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--clr-accent)', background: 'rgba(97, 148, 31,0.1)', borderRadius: 99, padding: '0.15rem 0.5rem', whiteSpace: 'nowrap' }}>
                          {Number(d.distance_km).toFixed(1)} km
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <label style={{ fontSize: '0.75rem', color: 'var(--clr-muted)', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>
                  {suggestedDrivers.length > 0 ? tr('aord_any_driver') : tr('aord_driver_label')}
                </label>
                <select value={selDriver} onChange={e => setSelDriver(e.target.value)} style={{ width: '100%', padding: '0.6rem', borderRadius: 9, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.05)', color: 'var(--clr-text)', fontFamily: 'inherit', fontSize: '0.85rem', outline: 'none' }}>
                  <option value="" style={{ background: '#0f172a' }}>— Select driver —</option>
                  {drivers.map(d => <option key={d.user_id} value={d.user_id} style={{ background: '#0f172a' }}>{d.first_name} {d.last_name} · {d.phone_number}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: '0.75rem', color: 'var(--clr-muted)', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>{tr('aord_vehicle_opt')}</label>
                <select value={selVehicle} onChange={e => setSelVehicle(e.target.value)} style={{ width: '100%', padding: '0.6rem', borderRadius: 9, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.05)', color: 'var(--clr-text)', fontFamily: 'inherit', fontSize: '0.85rem', outline: 'none' }}>
                  <option value="" style={{ background: '#0f172a' }}>— No vehicle —</option>
                  {vehicles.map(v => <option key={v.id} value={v.id} style={{ background: '#0f172a' }}>{v.plate_number} · {v.vehicle_type}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.6rem', marginTop: '1.1rem' }}>
              <button className="btn-outline" style={{ flex: 1 }} onClick={() => setAssignOrder(null)}>{tr('aord_cancel_btn')}</button>
              <button className="btn-primary" style={{ flex: 2 }} disabled={!selDriver || assigning} onClick={handleAssign}>
                {assigning ? <BtnSpinner text={tr('aord_assigning')} /> : tr('aord_confirm_assign')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Order detail modal */}
      {(loadingDetail || detailOrder) && (
        <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) { setDetailOrder(null); setLoadingDetail(false) } }}>
          <div className="glass modal-box" style={{ padding: '1.75rem', maxWidth: 520, maxHeight: '85vh', overflowY: 'auto' }}>
            {loadingDetail && !detailOrder ? (
              <div style={{ textAlign: 'center', padding: '2rem' }}><LoadingSpinner /></div>
            ) : detailOrder && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                  <div>
                    <h2 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--clr-text)', marginBottom: '0.25rem' }}>{detailOrder.reference_code}</h2>
                    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
                      {orderBadge(detailOrder.status)}
                      {!!detailOrder.is_cross_border && <span style={{ fontSize: '0.63rem', fontWeight: 700, color: '#f59e0b', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 99, padding: '0.1rem 0.45rem' }}>🌍 Cross-Border</span>}
                    </div>
                  </div>
                  <button onClick={() => setDetailOrder(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--clr-muted)', padding: '0.2rem' }}><LuX size={18} /></button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {/* Shipper */}
                  <div className="glass-inner" style={{ padding: '0.75rem 1rem' }}>
                    <p style={{ fontSize: '0.7rem', color: 'var(--clr-muted)', fontWeight: 600, marginBottom: '0.35rem' }}>{tr('aord_shipper_section')}</p>
                    <p style={{ fontSize: '0.875rem', color: 'var(--clr-text)', fontWeight: 600 }}>{detailOrder.shipper_first_name} {detailOrder.shipper_last_name}</p>
                    {detailOrder.shipper_phone && <p style={{ fontSize: '0.78rem', color: 'var(--clr-muted)' }}>{detailOrder.shipper_phone}</p>}
                  </div>
                  {/* Driver */}
                  {detailOrder.driver_first_name && (
                    <div className="glass-inner" style={{ padding: '0.75rem 1rem' }}>
                      <p style={{ fontSize: '0.7rem', color: 'var(--clr-muted)', fontWeight: 600, marginBottom: '0.35rem' }}>{tr('aord_driver_section')}</p>
                      <p style={{ fontSize: '0.875rem', color: 'var(--clr-text)', fontWeight: 600 }}>{detailOrder.driver_first_name} {detailOrder.driver_last_name}</p>
                      {detailOrder.driver_phone && <p style={{ fontSize: '0.78rem', color: 'var(--clr-muted)' }}>{detailOrder.driver_phone}</p>}
                    </div>
                  )}
                  {/* Cargo & Route */}
                  <div className="glass-inner" style={{ padding: '0.75rem 1rem' }}>
                    <p style={{ fontSize: '0.7rem', color: 'var(--clr-muted)', fontWeight: 600, marginBottom: '0.5rem' }}>{tr('aord_shipment')}</p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem 1rem' }}>
                      <div><p style={{ fontSize: '0.7rem', color: 'var(--clr-muted)' }}>{tr('aord_cargo_type')}</p><div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.15rem' }}><CargoIcon icon={detailOrder.cargo_type_icon} iconUrl={detailOrder.cargo_type_icon_url} size={16} style={{ color: 'var(--clr-accent)' }} /><p style={{ fontSize: '0.82rem', color: 'var(--clr-text)', fontWeight: 600 }}>{detailOrder.cargo_type_name ?? '—'}</p></div></div>
                      <div><p style={{ fontSize: '0.7rem', color: 'var(--clr-muted)' }}>{tr('aord_vehicle')}</p><p style={{ fontSize: '0.82rem', color: 'var(--clr-text)', fontWeight: 600 }}>{detailOrder.vehicle_type_required ?? detailOrder.vehicle_type ?? '—'}</p></div>
                      <div><p style={{ fontSize: '0.7rem', color: 'var(--clr-muted)' }}>{tr('aord_weight')}</p><p style={{ fontSize: '0.82rem', color: 'var(--clr-text)', fontWeight: 600 }}>{detailOrder.estimated_weight_kg != null ? `${detailOrder.estimated_weight_kg} kg` : '—'}</p></div>
                      <div><p style={{ fontSize: '0.7rem', color: 'var(--clr-muted)' }}>{tr('aord_distance')}</p><p style={{ fontSize: '0.82rem', color: 'var(--clr-text)', fontWeight: 600 }}>{detailOrder.distance_km != null ? `${Number(detailOrder.distance_km).toFixed(1)} km` : '—'}</p></div>
                    </div>
                  </div>
                  <div className="glass-inner" style={{ padding: '0.75rem 1rem' }}>
                    <p style={{ fontSize: '0.7rem', color: 'var(--clr-muted)', fontWeight: 600, marginBottom: '0.5rem' }}>{tr('aord_details_override')}</p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.45rem' }}>
                      <select value={detailsOverrideForm.cargo_type_id} onChange={e => setDetailsOverrideForm(f => ({ ...f, cargo_type_id: e.target.value }))}
                        style={{ padding: '0.5rem 0.65rem', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)', color: 'var(--clr-text)', fontFamily: 'inherit', fontSize: '0.8rem', outline: 'none' }}>
                        <option value="" style={{ background: '#0f172a' }}>Cargo Type</option>
                        {orderCargoTypes.map((ct) => <option key={ct.id} value={ct.id} style={{ background: '#0f172a' }}>{ct.name}</option>)}
                      </select>
                      <VehicleTypeSelectFull value={detailsOverrideForm.vehicle_type_required} onChange={v => setDetailsOverrideForm(f => ({ ...f, vehicle_type_required: v }))}
                        style={{ padding: '0.5rem 0.65rem', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)', fontSize: '0.8rem' }} />
                      <input type="number" min={0} step="0.01" value={detailsOverrideForm.estimated_weight_kg} onChange={e => setDetailsOverrideForm(f => ({ ...f, estimated_weight_kg: e.target.value }))}
                        placeholder="Weight (kg)"
                        style={{ padding: '0.5rem 0.65rem', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)', color: 'var(--clr-text)', fontFamily: 'inherit', fontSize: '0.8rem', outline: 'none' }} />
                      <input type="text" value={detailsOverrideForm.notes} onChange={e => setDetailsOverrideForm(f => ({ ...f, notes: e.target.value }))}
                        placeholder="Reason for override (optional)"
                        style={{ padding: '0.5rem 0.65rem', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)', color: 'var(--clr-text)', fontFamily: 'inherit', fontSize: '0.8rem', outline: 'none' }} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', marginTop: '0.45rem' }}>
                      <input type="text" value={detailsOverrideForm.pickup_address} onChange={e => setDetailsOverrideForm(f => ({ ...f, pickup_address: e.target.value }))}
                        placeholder="Pickup address"
                        style={{ padding: '0.5rem 0.65rem', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)', color: 'var(--clr-text)', fontFamily: 'inherit', fontSize: '0.8rem', outline: 'none' }} />
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.45rem' }}>
                        <input type="number" step="any" value={detailsOverrideForm.pickup_lat} onChange={e => setDetailsOverrideForm(f => ({ ...f, pickup_lat: e.target.value }))}
                          placeholder="Pickup lat"
                          style={{ padding: '0.5rem 0.65rem', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)', color: 'var(--clr-text)', fontFamily: 'inherit', fontSize: '0.8rem', outline: 'none' }} />
                        <input type="number" step="any" value={detailsOverrideForm.pickup_lng} onChange={e => setDetailsOverrideForm(f => ({ ...f, pickup_lng: e.target.value }))}
                          placeholder="Pickup lng"
                          style={{ padding: '0.5rem 0.65rem', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)', color: 'var(--clr-text)', fontFamily: 'inherit', fontSize: '0.8rem', outline: 'none' }} />
                      </div>
                      <input type="text" value={detailsOverrideForm.delivery_address} onChange={e => setDetailsOverrideForm(f => ({ ...f, delivery_address: e.target.value }))}
                        placeholder="Delivery address"
                        style={{ padding: '0.5rem 0.65rem', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)', color: 'var(--clr-text)', fontFamily: 'inherit', fontSize: '0.8rem', outline: 'none' }} />
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.45rem' }}>
                        <input type="number" step="any" value={detailsOverrideForm.delivery_lat} onChange={e => setDetailsOverrideForm(f => ({ ...f, delivery_lat: e.target.value }))}
                          placeholder="Delivery lat"
                          style={{ padding: '0.5rem 0.65rem', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)', color: 'var(--clr-text)', fontFamily: 'inherit', fontSize: '0.8rem', outline: 'none' }} />
                        <input type="number" step="any" value={detailsOverrideForm.delivery_lng} onChange={e => setDetailsOverrideForm(f => ({ ...f, delivery_lng: e.target.value }))}
                          placeholder="Delivery lng"
                          style={{ padding: '0.5rem 0.65rem', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)', color: 'var(--clr-text)', fontFamily: 'inherit', fontSize: '0.8rem', outline: 'none' }} />
                      </div>
                      <textarea value={detailsOverrideForm.special_instructions} onChange={e => setDetailsOverrideForm(f => ({ ...f, special_instructions: e.target.value }))} rows={2}
                        placeholder="Special instructions"
                        style={{ width: '100%', padding: '0.55rem 0.7rem', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)', color: 'var(--clr-text)', fontFamily: 'inherit', fontSize: '0.8rem', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }} />
                      <button onClick={submitDetailsOverride} disabled={detailsOverrideSaving}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem', padding: '0.45rem 0.9rem', borderRadius: 8, border: '1px solid rgba(97, 148, 31,0.3)', background: 'rgba(97, 148, 31,0.08)', color: 'var(--clr-accent)', fontFamily: 'inherit', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', opacity: detailsOverrideSaving ? 0.6 : 1 }}>
                        {detailsOverrideSaving ? tr('aord_saving') : tr('aord_save_overrides')}
                      </button>
                    </div>
                  </div>
                  {/* Addresses */}
                  <div className="glass-inner" style={{ padding: '0.75rem 1rem' }}>
                    <p style={{ fontSize: '0.7rem', color: 'var(--clr-muted)', fontWeight: 600, marginBottom: '0.35rem' }}>{tr('aord_route')}</p>
                    <p style={{ fontSize: '0.78rem', color: 'var(--clr-muted)', marginBottom: '0.15rem' }}>{tr('aord_from')}</p>
                    <p style={{ fontSize: '0.85rem', color: 'var(--clr-text)', marginBottom: '0.4rem' }}>{detailOrder.pickup_address}</p>
                    <p style={{ fontSize: '0.78rem', color: 'var(--clr-muted)', marginBottom: '0.15rem' }}>{tr('aord_to')}</p>
                    <p style={{ fontSize: '0.85rem', color: 'var(--clr-text)' }}>{detailOrder.delivery_address}</p>
                  </div>
                  {/* Pricing */}
                  <div className="glass-inner" style={{ padding: '0.75rem 1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                      <p style={{ fontSize: '0.7rem', color: 'var(--clr-muted)', fontWeight: 600, margin: 0 }}>{tr('aord_pricing')}</p>
                      <button onClick={() => { setPriceAdjustMode(m => !m); setPriceAdjustVal(String(detailOrder.final_price ?? detailOrder.estimated_price ?? '')); setPriceAdjustNotes('') }}
                        style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', padding: '0.2rem 0.5rem', borderRadius: 7, border: '1px solid rgba(251,191,36,0.3)', background: 'rgba(251,191,36,0.06)', color: 'var(--kpi-gold)', fontFamily: 'inherit', fontSize: '0.68rem', fontWeight: 700, cursor: 'pointer' }}>
                        <LuPencil size={10} /> {tr('aord_adjust')}
                      </button>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.78rem', color: 'var(--clr-muted)' }}>{tr('aord_estimated')}</span>
                      <span style={{ fontSize: '0.85rem', color: 'var(--clr-text)', fontWeight: 700 }}>{Number(detailOrder.estimated_price ?? 0).toLocaleString()} ETB</span>
                    </div>
                    {detailOrder.final_price != null && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.25rem' }}>
                        <span style={{ fontSize: '0.78rem', color: 'var(--clr-muted)' }}>{tr('aord_final')}</span>
                        <span style={{ fontSize: '0.9rem', color: 'var(--clr-accent)', fontWeight: 800 }}>{Number(detailOrder.final_price).toLocaleString()} ETB</span>
                      </div>
                    )}
                    {priceAdjustMode && (
                      <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid rgba(255,255,255,0.07)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <p style={{ fontSize: '0.72rem', color: 'var(--kpi-gold)', fontWeight: 600, margin: 0 }}>{tr('aord_set_final_price')}</p>
                        <input type="number" min={0} value={priceAdjustVal} onChange={e => setPriceAdjustVal(e.target.value)}
                          placeholder="e.g. 4500" style={{ padding: '0.5rem 0.7rem', borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.05)', color: 'var(--clr-text)', fontFamily: 'inherit', fontSize: '0.85rem', outline: 'none', width: '100%', boxSizing: 'border-box' }} />
                        <input type="text" value={priceAdjustNotes} onChange={e => setPriceAdjustNotes(e.target.value)}
                          placeholder={tr('aord_reason_notes')} style={{ padding: '0.5rem 0.7rem', borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.05)', color: 'var(--clr-text)', fontFamily: 'inherit', fontSize: '0.82rem', outline: 'none', width: '100%', boxSizing: 'border-box' }} />
                        <div style={{ display: 'flex', gap: '0.4rem' }}>
                          <button onClick={() => setPriceAdjustMode(false)} className="btn-outline" style={{ flex: 1, fontSize: '0.78rem' }}>{tr('aord_cancel_btn')}</button>
                          <button onClick={submitPriceAdjust} disabled={priceAdjusting} className="btn-primary" style={{ flex: 2, fontSize: '0.78rem' }}>
                            {priceAdjusting ? <BtnSpinner text={tr('aord_saving')} /> : tr('aord_save_price')}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                  {/* Overrides */}
                  <div className="glass-inner" style={{ padding: '0.75rem 1rem' }}>
                    <p style={{ fontSize: '0.7rem', color: 'var(--clr-muted)', fontWeight: 600, marginBottom: '0.5rem' }}>{tr('aord_overrides')}</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      <select value={statusOverride} onChange={e => setStatusOverride(e.target.value)}
                        style={{ padding: '0.5rem 0.65rem', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)', color: 'var(--clr-text)', fontFamily: 'inherit', fontSize: '0.82rem', outline: 'none' }}>
                        {OVERRIDE_STATUSES.map(s => <option key={s} value={s} style={{ background: '#0f172a' }}>{s}</option>)}
                      </select>
                      <input type="text" value={statusOverrideNotes} onChange={e => setStatusOverrideNotes(e.target.value)}
                        placeholder="Reason / internal note (optional)"
                        style={{ padding: '0.5rem 0.65rem', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)', color: 'var(--clr-text)', fontFamily: 'inherit', fontSize: '0.8rem', outline: 'none' }} />
                      <button onClick={submitStatusOverride} disabled={statusOverrideSaving || !statusOverride}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem', padding: '0.45rem 0.9rem', borderRadius: 8, border: '1px solid rgba(97, 148, 31,0.3)', background: 'rgba(97, 148, 31,0.08)', color: 'var(--clr-accent)', fontFamily: 'inherit', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', opacity: statusOverrideSaving ? 0.6 : 1 }}>
                        {statusOverrideSaving ? tr('aord_saving') : tr('aord_apply_status')}
                      </button>
                    </div>
                  </div>
                  {/* Internal Notes */}
                  <div className="glass-inner" style={{ padding: '0.75rem 1rem' }}>
                    <p style={{ fontSize: '0.7rem', color: 'var(--clr-muted)', fontWeight: 600, marginBottom: '0.5rem' }}>{tr('aord_internal_notes')}</p>
                    <textarea value={internalNotes} onChange={e => setInternalNotes(e.target.value)} rows={3}
                      placeholder={tr('aord_internal_notes_ph')}
                      style={{ width: '100%', padding: '0.55rem 0.7rem', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)', color: 'var(--clr-text)', fontFamily: 'inherit', fontSize: '0.8rem', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }} />
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                      <button onClick={submitInternalNotes} disabled={internalNotesSaving}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem', padding: '0.45rem 0.9rem', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.06)', color: 'var(--clr-text)', fontFamily: 'inherit', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', opacity: internalNotesSaving ? 0.6 : 1 }}>
                        {internalNotesSaving ? tr('aord_saving') : tr('aord_save_notes')}
                      </button>
                    </div>
                  </div>
                  {/* OTPs */}
                  {(detailOrder.pickup_otp || detailOrder.delivery_otp) && (
                    <div className="glass-inner" style={{ padding: '0.75rem 1rem' }}>
                      <p style={{ fontSize: '0.7rem', color: 'var(--clr-muted)', fontWeight: 600, marginBottom: '0.5rem' }}>{tr('aord_order_otps')}</p>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                        <div style={{ textAlign: 'center', padding: '0.5rem', background: 'rgba(97, 148, 31,0.06)', borderRadius: 8, border: '1px solid rgba(97, 148, 31,0.12)' }}>
                          <p style={{ fontSize: '0.65rem', color: 'var(--clr-muted)', fontWeight: 600, marginBottom: '0.15rem' }}>{tr('aord_pickup_otp')}</p>
                          <p style={{ fontSize: '1.2rem', fontWeight: 900, color: 'var(--clr-accent)', letterSpacing: 3 }}>{detailOrder.pickup_otp ?? '—'}</p>
                        </div>
                        <div style={{ textAlign: 'center', padding: '0.5rem', background: 'rgba(97, 148, 31,0.06)', borderRadius: 8, border: '1px solid rgba(97, 148, 31,0.12)' }}>
                          <p style={{ fontSize: '0.65rem', color: 'var(--clr-muted)', fontWeight: 600, marginBottom: '0.15rem' }}>{tr('aord_delivery_otp')}</p>
                          <p style={{ fontSize: '1.2rem', fontWeight: 900, color: 'var(--clr-accent)', letterSpacing: 3 }}>{detailOrder.delivery_otp ?? '—'}</p>
                        </div>
                      </div>
                    </div>
                  )}
                  {/* Description */}
                  {detailOrder.special_instructions && (
                    <div className="glass-inner" style={{ padding: '0.75rem 1rem' }}>
                      <p style={{ fontSize: '0.7rem', color: 'var(--clr-muted)', fontWeight: 600, marginBottom: '0.25rem' }}>{tr('aord_notes_label')}</p>
                      <p style={{ fontSize: '0.82rem', color: 'var(--clr-text)' }}>{detailOrder.special_instructions}</p>
                    </div>
                  )}
                  {/* Cross-border Info */}
                  {!!detailOrder.is_cross_border && (
                    <div className="glass-inner" style={{ padding: '0.75rem 1rem', border: '1px solid rgba(245,158,11,0.2)', background: 'rgba(245,158,11,0.04)' }}>
                      <p style={{ fontSize: '0.7rem', color: '#f59e0b', fontWeight: 700, marginBottom: '0.45rem' }}>🌍 CROSS-BORDER SHIPMENT</p>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem 1rem', fontSize: '0.8rem' }}>
                        {detailOrder.hs_code && <div><p style={{ fontSize: '0.68rem', color: 'var(--clr-muted)' }}>HS Code</p><p style={{ color: 'var(--clr-text)', fontWeight: 600 }}>{detailOrder.hs_code}</p></div>}
                        {detailOrder.shipper_tin && <div><p style={{ fontSize: '0.68rem', color: 'var(--clr-muted)' }}>Shipper TIN</p><p style={{ color: 'var(--clr-text)', fontWeight: 600 }}>{detailOrder.shipper_tin}</p></div>}
                        {detailOrder.border_crossing_ref && <div><p style={{ fontSize: '0.68rem', color: 'var(--clr-muted)' }}>Border Ref</p><p style={{ color: 'var(--clr-text)', fontWeight: 600 }}>{detailOrder.border_crossing_ref}</p></div>}
                        {detailOrder.customs_declaration_ref && <div><p style={{ fontSize: '0.68rem', color: 'var(--clr-muted)' }}>Customs Ref</p><p style={{ color: 'var(--clr-text)', fontWeight: 600 }}>{detailOrder.customs_declaration_ref}</p></div>}
                      </div>
                      {['AT_BORDER', 'IN_CUSTOMS', 'CUSTOMS_CLEARED'].includes(detailOrder.status) && (
                        <p style={{ fontSize: '0.73rem', color: '#f59e0b', marginTop: '0.5rem' }}>
                          {detailOrder.status === 'AT_BORDER' && '🛂 Driver is at the border crossing.'}
                          {detailOrder.status === 'IN_CUSTOMS' && '📋 Shipment is under customs review.'}
                          {detailOrder.status === 'CUSTOMS_CLEARED' && '✅ Customs cleared — driver will resume delivery.'}
                        </p>
                      )}
                    </div>
                  )}
                  {/* Order Images */}
                  {(detailOrder.order_image_1_url || detailOrder.order_image_2_url) && (
                    <div className="glass-inner" style={{ padding: '0.75rem 1rem' }}>
                      <p style={{ fontSize: '0.7rem', color: 'var(--clr-muted)', fontWeight: 600, marginBottom: '0.5rem' }}>{tr('aord_order_images')}</p>
                      <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap' }}>
                        {detailOrder.order_image_1_url && <img src={getUploadUrl(detailOrder.order_image_1_url)!} alt="Order image 1" style={{ width: 120, height: 90, objectFit: 'cover', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)' }} />}
                        {detailOrder.order_image_2_url && <img src={getUploadUrl(detailOrder.order_image_2_url)!} alt="Order image 2" style={{ width: 120, height: 90, objectFit: 'cover', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)' }} />}
                      </div>
                    </div>
                  )}
                  {/* Action buttons */}
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <button onClick={() => { setDetailOrder(null); openAssign(detailOrder) }} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.45rem 0.9rem', borderRadius: 8, border: 'none', background: 'var(--clr-accent)', color: '#080b14', fontFamily: 'inherit', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}>
                      <LuTruck size={13} /> {detailOrder.driver_first_name ? tr('aord_reassign_driver') : tr('aord_assign_driver')}
                    </button>
                    {['PENDING', 'ASSIGNED'].includes(detailOrder.status) && (
                      <button onClick={() => { handleCancel(detailOrder); setDetailOrder(null) }} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.45rem 0.9rem', borderRadius: 8, border: '1px solid rgba(248,113,113,0.3)', background: 'rgba(248,113,113,0.06)', color: '#f87171', fontFamily: 'inherit', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}><LuBan size={13} /> {tr('aord_cancel_order')}</button>
                    )}
                  </div>

                  {/* Driver Payout Section */}
                  {['DELIVERED', 'COMPLETED'].includes(detailOrder.status) && detailOrder.driver_id && (
                    <div className="glass-inner" style={{ padding: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.4rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <LuWallet size={13} style={{ color: 'var(--clr-accent)' }} />
                          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--clr-text)' }}>{tr('aord_driver_payout')}</span>
                          {detailOrder.driver_payout_status === 'WALLET_PAID' && (
                            <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--kpi-green)', background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.3)', borderRadius: 99, padding: '0.1rem 0.45rem' }}>{tr('aord_wallet_paid')}</span>
                          )}
                          {detailOrder.driver_payout_status === 'BANK_TRANSFERRED' && (
                            <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#60a5fa', background: 'rgba(96,165,250,0.1)', border: '1px solid rgba(96,165,250,0.3)', borderRadius: 99, padding: '0.1rem 0.45rem' }}>{tr('aord_bank_transferred')}</span>
                          )}
                          {(!detailOrder.driver_payout_status || detailOrder.driver_payout_status === 'PENDING') && (
                            <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--kpi-gold)', background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.3)', borderRadius: 99, padding: '0.1rem 0.45rem' }}>{tr('aord_pending_payout')}</span>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: '0.4rem' }}>
                          {detailOrder.driver_payout_status !== 'WALLET_PAID' && (
                            <button onClick={() => { setPdGross(String(detailOrder.final_price ?? detailOrder.estimated_price ?? '')); setPdCommType('NONE'); setPdCommValue(''); setPdNote(''); setPdErr(''); setPayDriverOpen(true) }}
                              style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.4rem 0.75rem', borderRadius: 8, border: '1px solid rgba(74,222,128,0.3)', background: 'rgba(74,222,128,0.07)', color: 'var(--kpi-green)', fontFamily: 'inherit', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}>
                              <LuWallet size={12} /> Pay to Wallet
                            </button>
                          )}
                          <button onClick={() => { setBtAmount(String(detailOrder.final_price ?? detailOrder.estimated_price ?? '')); setBtNote(''); setBtReceiptB64(''); setBtReceiptPreview(''); setBtErr(''); setBankTransferOpen(true) }}
                            style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.4rem 0.75rem', borderRadius: 8, border: '1px solid rgba(96,165,250,0.3)', background: 'rgba(96,165,250,0.07)', color: '#60a5fa', fontFamily: 'inherit', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}>
                            <LuLandmark size={12} /> Bank Transfer
                          </button>
                        </div>
                      </div>
                      {/* Payment history */}
                      {orderDriverPayments.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', maxHeight: 180, overflowY: 'auto' }}>
                          {orderDriverPayments.map((p: any) => (
                            <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '0.45rem 0.65rem', background: 'rgba(255,255,255,0.03)', borderRadius: 7, border: '1px solid rgba(255,255,255,0.07)', fontSize: '0.75rem' }}>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                  {p.payment_type === 'WALLET' ? <LuWallet size={11} style={{ color: 'var(--kpi-green)' }} /> : <LuLandmark size={11} style={{ color: '#60a5fa' }} />}
                                  <span style={{ color: p.payment_type === 'WALLET' ? 'var(--kpi-green)' : '#60a5fa', fontWeight: 700 }}>{p.payment_type === 'WALLET' ? 'Wallet' : 'Bank Transfer'}</span>
                                  {p.commission_type !== 'NONE' && p.commission_amount > 0 && (
                                    <span style={{ color: 'var(--clr-muted)', fontSize: '0.68rem' }}>· {p.commission_type === 'PERCENT' ? `${p.commission_value}% comm` : `${Number(p.commission_value).toLocaleString()} fixed`}</span>
                                  )}
                                </div>
                                {p.note && <span style={{ color: 'var(--clr-muted)', fontSize: '0.68rem' }}>{p.note}</span>}
                                {p.receipt_url && (
                                  <a href={getUploadUrl(p.receipt_url) ?? '#'} target="_blank" rel="noreferrer" style={{ color: '#60a5fa', fontSize: '0.68rem', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                                    <LuReceipt size={10} /> Receipt
                                  </a>
                                )}
                              </div>
                              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                <div style={{ fontWeight: 700, color: 'var(--clr-text)' }}>{Number(p.net_amount).toLocaleString()} {detailOrder.currency || 'ETB'}</div>
                                <div style={{ color: 'var(--clr-muted)', fontSize: '0.65rem' }}>{new Date(p.created_at).toLocaleDateString()}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Order Chat */}
                  <div className="glass-inner" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    {/* Channel tabs */}
                    <div style={{ display: 'flex', alignItems: 'center', padding: '0.3rem 0.5rem 0.3rem 0.75rem', borderBottom: '1px solid rgba(255,255,255,0.07)', gap: '0.4rem' }}>
                      <LuMessageSquare size={13} style={{ color: 'var(--clr-accent)', flexShrink: 0 }} />
                      <div style={{ display: 'flex', flex: 1, gap: '0.3rem' }}>
                        {(['shipper', 'driver'] as const).map(ch => (
                          <button key={ch} onClick={() => setDetailChatChannel(ch)}
                            style={{
                              flex: 1, padding: '0.3rem 0.4rem', borderRadius: 6, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.7rem', fontWeight: 700, transition: 'all 0.15s',
                              background: detailChatChannel === ch ? 'var(--clr-accent)' : 'rgba(255,255,255,0.06)',
                              color: detailChatChannel === ch ? '#000' : 'var(--clr-muted)'
                            }}>
                            {ch === 'shipper' ? tr('aord_shipper_chat') : tr('aord_driver_chat')}
                          </button>
                        ))}
                      </div>
                    </div>
                    {/* Messages */}
                    <div style={{ height: 220, overflowY: 'auto', padding: '0.65rem 0.85rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {detailMessages.length === 0 ? (
                        <p style={{ color: 'var(--clr-muted)', fontSize: '0.78rem', textAlign: 'center', margin: 'auto' }}>{tr('aord_no_messages')}</p>
                      ) : detailMessages.map(m => (
                        <div key={m.id} style={{ display: 'flex', flexDirection: 'column', alignItems: m.sender_role === 'Admin' ? 'flex-end' : 'flex-start' }}>
                          <div style={{
                            maxWidth: '85%', padding: '0.4rem 0.7rem', borderRadius: 10, fontSize: '0.8rem', color: 'var(--clr-text)',
                            background: m.sender_role === 'Admin' ? 'rgba(97, 148, 31,0.12)' : m.sender_role === 'Shipper' ? 'rgba(245,158,11,0.09)' : 'rgba(167,139,250,0.1)',
                            border: `1px solid ${m.sender_role === 'Admin' ? 'rgba(97, 148, 31,0.22)' : m.sender_role === 'Shipper' ? 'rgba(245,158,11,0.22)' : 'rgba(167,139,250,0.22)'}`
                          }}>
                            {m.message}
                          </div>
                          <span style={{
                            fontSize: '0.6rem', marginTop: '0.15rem', fontWeight: 600,
                            color: m.sender_role === 'Admin' ? 'var(--kpi-cyan)' : m.sender_role === 'Shipper' ? '#f59e0b' : 'var(--kpi-purple)'
                          }}>
                            {m.sender_name ?? `${(m as any).sender_first_name ?? ''} ${(m as any).sender_last_name ?? ''}`.trim()} · {m.sender_role ?? 'User'}
                          </span>
                        </div>
                      ))}
                      <div ref={detailChatEndRef} />
                    </div>
                    {/* Input */}
                    <div style={{ padding: '0.5rem 0.75rem', borderTop: '1px solid rgba(255,255,255,0.07)', display: 'flex', gap: '0.45rem' }}>
                      <input value={detailChatMsg} onChange={e => setDetailChatMsg(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendDetailMsg() } }}
                        placeholder={detailChatChannel === 'shipper' ? tr('aord_msg_shipper_ph') : tr('aord_msg_driver_ph')}
                        style={{ flex: 1, padding: '0.4rem 0.65rem', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: 'var(--clr-text)', fontFamily: 'inherit', fontSize: '0.8rem', outline: 'none' }} />
                      <button onClick={sendDetailMsg} disabled={detailChatSending || !detailChatMsg.trim()}
                        style={{ padding: '0.4rem 0.7rem', borderRadius: 8, border: 'none', background: 'var(--clr-accent)', color: '#000', cursor: 'pointer', opacity: (!detailChatMsg.trim() || detailChatSending) ? 0.5 : 1 }}>
                        <LuSend size={13} />
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Pay Driver to Wallet modal */}
      {payDriverOpen && detailOrder && (
        <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) setPayDriverOpen(false) }}>
          <div className="glass modal-box" style={{ padding: '1.75rem', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.1rem' }}>
              <h2 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--clr-text)', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                <LuWallet size={16} style={{ color: 'var(--kpi-green)' }} /> {tr('aord_pay_driver_title')}
              </h2>
              <button onClick={() => setPayDriverOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--clr-muted)' }}><LuX size={18} /></button>
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--clr-muted)', marginBottom: '1rem' }}>
              Driver: <strong style={{ color: 'var(--clr-text)' }}>{detailOrder.driver_first_name} {detailOrder.driver_last_name}</strong> · Order: <strong style={{ color: 'var(--clr-text)' }}>{detailOrder.reference_code}</strong>
            </div>
            {pdErr && <div className="alert alert-error" style={{ marginBottom: '0.75rem', fontSize: '0.8rem' }}><LuTriangleAlert size={13} /> {pdErr}</div>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div>
                <label style={{ fontSize: '0.73rem', fontWeight: 600, color: 'var(--clr-muted)', marginBottom: '0.3rem', display: 'block' }}>{tr('aord_gross_amount')} ({detailOrder.currency || 'ETB'}) *</label>
                <input type="number" min="0" step="0.01" value={pdGross} onChange={e => setPdGross(e.target.value)}
                  style={{ width: '100%', padding: '0.6rem 0.8rem', borderRadius: 9, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)', color: 'var(--clr-text)', fontFamily: 'inherit', fontSize: '0.85rem', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ fontSize: '0.73rem', fontWeight: 600, color: 'var(--clr-muted)', marginBottom: '0.3rem', display: 'block' }}>{tr('aord_comm_type')}</label>
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  {(['NONE', 'PERCENT', 'FIXED'] as const).map(t => (
                    <button key={t} onClick={() => { setPdCommType(t); if (t === 'NONE') setPdCommValue('') }}
                      style={{
                        flex: 1, padding: '0.45rem', borderRadius: 8, border: '1px solid', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.75rem', fontWeight: 700,
                        borderColor: pdCommType === t ? 'var(--clr-accent)' : 'rgba(255,255,255,0.12)',
                        background: pdCommType === t ? 'rgba(97, 148, 31,0.1)' : 'rgba(255,255,255,0.04)',
                        color: pdCommType === t ? 'var(--clr-accent)' : 'var(--clr-muted)'
                      }}>
                      {t === 'NONE' ? tr('aord_no_cut') : t === 'PERCENT' ? tr('aord_percent') : tr('aord_fixed')}
                    </button>
                  ))}
                </div>
              </div>
              {pdCommType !== 'NONE' && (
                <div>
                  <label style={{ fontSize: '0.73rem', fontWeight: 600, color: 'var(--clr-muted)', marginBottom: '0.3rem', display: 'block' }}>
                    {pdCommType === 'PERCENT' ? tr('aord_comm_pct') : `${tr('aord_comm_fixed')} (${detailOrder.currency || 'ETB'})`}
                  </label>
                  <input type="number" min="0" step="0.01" value={pdCommValue} onChange={e => setPdCommValue(e.target.value)}
                    style={{ width: '100%', padding: '0.6rem 0.8rem', borderRadius: 9, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)', color: 'var(--clr-text)', fontFamily: 'inherit', fontSize: '0.85rem', boxSizing: 'border-box' }} />
                  {pdGross && pdCommValue && (
                    <div style={{ marginTop: '0.3rem', fontSize: '0.72rem', color: 'var(--clr-muted)' }}>
                      {(() => {
                        const gross = parseFloat(pdGross) || 0
                        const cv = parseFloat(pdCommValue) || 0
                        const comm = pdCommType === 'PERCENT' ? gross * cv / 100 : cv
                        const net = gross - comm
                        return <>Commission: <strong style={{ color: 'var(--kpi-gold)' }}>{comm.toLocaleString(undefined, { maximumFractionDigits: 2 })} {detailOrder.currency || 'ETB'}</strong> · Net to driver: <strong style={{ color: 'var(--kpi-green)' }}>{net.toLocaleString(undefined, { maximumFractionDigits: 2 })} {detailOrder.currency || 'ETB'}</strong></>
                      })()}
                    </div>
                  )}
                </div>
              )}
              {pdCommType === 'NONE' && pdGross && (
                <div style={{ fontSize: '0.72rem', color: 'var(--clr-muted)' }}>
                  Net to driver: <strong style={{ color: 'var(--kpi-green)' }}>{(parseFloat(pdGross) || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })} {detailOrder.currency || 'ETB'}</strong>
                </div>
              )}
              <div>
                <label style={{ fontSize: '0.73rem', fontWeight: 600, color: 'var(--clr-muted)', marginBottom: '0.3rem', display: 'block' }}>{tr('aord_note_opt')}</label>
                <input value={pdNote} onChange={e => setPdNote(e.target.value)} placeholder={tr('aord_note_driver_ph')}
                  style={{ width: '100%', padding: '0.6rem 0.8rem', borderRadius: 9, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)', color: 'var(--clr-text)', fontFamily: 'inherit', fontSize: '0.85rem', boxSizing: 'border-box' }} />
              </div>
              <button disabled={pdSaving || !pdGross} onClick={async () => {
                const gross = parseFloat(pdGross)
                if (isNaN(gross) || gross <= 0) { setPdErr('Enter a valid gross amount'); return }
                const cv = pdCommType !== 'NONE' ? parseFloat(pdCommValue) : 0
                if (pdCommType !== 'NONE' && (isNaN(cv) || cv < 0)) { setPdErr('Enter a valid commission value'); return }
                setPdSaving(true); setPdErr('')
                try {
                  await adminOrderApi.payDriverWallet(detailOrder.id, { gross_amount: gross, commission_type: pdCommType, commission_value: cv, note: pdNote || undefined })
                  setPayDriverOpen(false)
                  showToast('Driver wallet credited successfully')
                  const { data } = await adminOrderApi.getOrder(detailOrder.id)
                  setDetailOrder(data.order ?? data)
                  loadOrderPayments(detailOrder.id)
                } catch (e: any) { setPdErr(e.response?.data?.message ?? 'Payment failed') }
                finally { setPdSaving(false) }
              }} style={{ padding: '0.65rem', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#4ade80,#22c55e)', color: '#000', fontFamily: 'inherit', fontSize: '0.85rem', fontWeight: 800, cursor: (pdSaving || !pdGross) ? 'not-allowed' : 'pointer', opacity: (pdSaving || !pdGross) ? 0.6 : 1 }}>
                {pdSaving ? tr('aord_processing') : tr('aord_pay_driver_btn')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bank Transfer modal */}
      {bankTransferOpen && detailOrder && (
        <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) setBankTransferOpen(false) }}>
          <div className="glass modal-box" style={{ padding: '1.75rem', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.1rem' }}>
              <h2 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--clr-text)', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                <LuLandmark size={16} style={{ color: '#60a5fa' }} /> {tr('aord_bank_title')}
              </h2>
              <button onClick={() => setBankTransferOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--clr-muted)' }}><LuX size={18} /></button>
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--clr-muted)', marginBottom: '1rem' }}>
              Driver: <strong style={{ color: 'var(--clr-text)' }}>{detailOrder.driver_first_name} {detailOrder.driver_last_name}</strong> · Order: <strong style={{ color: 'var(--clr-text)' }}>{detailOrder.reference_code}</strong>
            </div>
            {btErr && <div className="alert alert-error" style={{ marginBottom: '0.75rem', fontSize: '0.8rem' }}><LuTriangleAlert size={13} /> {btErr}</div>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div>
                <label style={{ fontSize: '0.73rem', fontWeight: 600, color: 'var(--clr-muted)', marginBottom: '0.3rem', display: 'block' }}>{tr('aord_amount_label')} ({detailOrder.currency || 'ETB'}) *</label>
                <input type="number" min="0" step="0.01" value={btAmount} onChange={e => setBtAmount(e.target.value)}
                  style={{ width: '100%', padding: '0.6rem 0.8rem', borderRadius: 9, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)', color: 'var(--clr-text)', fontFamily: 'inherit', fontSize: '0.85rem', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ fontSize: '0.73rem', fontWeight: 600, color: 'var(--clr-muted)', marginBottom: '0.3rem', display: 'block' }}>{tr('aord_receipt_label')}</label>
                <input type="file" accept="image/*,application/pdf" onChange={e => {
                  const f = e.target.files?.[0]
                  if (!f) return
                  const reader = new FileReader()
                  reader.onload = ev => {
                    const result = ev.target?.result as string
                    setBtReceiptB64(result)
                    setBtReceiptPreview(f.type.startsWith('image/') ? result : '')
                  }
                  reader.readAsDataURL(f)
                }} style={{ width: '100%', padding: '0.5rem 0', fontSize: '0.8rem', color: 'var(--clr-muted)', fontFamily: 'inherit' }} />
                {btReceiptPreview && (
                  <img src={btReceiptPreview} alt="Receipt preview" style={{ marginTop: '0.5rem', maxWidth: '100%', maxHeight: 180, borderRadius: 8, objectFit: 'contain', border: '1px solid rgba(255,255,255,0.1)' }} />
                )}
                {btReceiptB64 && !btReceiptPreview && (
                  <div style={{ marginTop: '0.4rem', fontSize: '0.72rem', color: '#60a5fa', display: 'flex', alignItems: 'center', gap: '0.3rem' }}><LuReceipt size={12} /> File attached</div>
                )}
              </div>
              <div>
                <label style={{ fontSize: '0.73rem', fontWeight: 600, color: 'var(--clr-muted)', marginBottom: '0.3rem', display: 'block' }}>{tr('aord_note_opt')}</label>
                <input value={btNote} onChange={e => setBtNote(e.target.value)} placeholder={tr('aord_bank_note_ph')}
                  style={{ width: '100%', padding: '0.6rem 0.8rem', borderRadius: 9, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)', color: 'var(--clr-text)', fontFamily: 'inherit', fontSize: '0.85rem', boxSizing: 'border-box' }} />
              </div>
              <button disabled={btSaving || !btAmount} onClick={async () => {
                const amount = parseFloat(btAmount)
                if (isNaN(amount) || amount <= 0) { setBtErr('Enter a valid amount'); return }
                setBtSaving(true); setBtErr('')
                try {
                  await adminOrderApi.bankTransferDriver(detailOrder.id, { amount, receipt_base64: btReceiptB64 || undefined, note: btNote || undefined })
                  setBankTransferOpen(false)
                  showToast('Bank transfer recorded successfully')
                  const { data } = await adminOrderApi.getOrder(detailOrder.id)
                  setDetailOrder(data.order ?? data)
                  loadOrderPayments(detailOrder.id)
                } catch (e: any) { setBtErr(e.response?.data?.message ?? 'Transfer record failed') }
                finally { setBtSaving(false) }
              }} style={{ padding: '0.65rem', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#60a5fa,#3b82f6)', color: '#fff', fontFamily: 'inherit', fontSize: '0.85rem', fontWeight: 800, cursor: (btSaving || !btAmount) ? 'not-allowed' : 'pointer', opacity: (btSaving || !btAmount) ? 0.6 : 1 }}>
                {btSaving ? tr('aord_recording') : tr('aord_record_transfer')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Order on-behalf modal */}
      {createOrderModal && (
        <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) setCreateOrderModal(false) }}>
          <div className="glass modal-box" style={{ padding: '1.75rem', maxWidth: 540, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h2 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--clr-text)', display: 'flex', alignItems: 'center', gap: '0.45rem' }}><LuPlus size={16} /> {tr('aord_create_title')}</h2>
              <button onClick={() => setCreateOrderModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--clr-muted)' }}><LuX size={18} /></button>
            </div>
            {coErr && <div className="alert alert-error" style={{ marginBottom: '0.75rem' }}><LuTriangleAlert size={13} /> {coErr}</div>}

            {coStep === 'form' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                {/* Shipper search */}
                <div>
                  <label style={{ fontSize: '0.73rem', fontWeight: 600, color: 'var(--clr-muted)', marginBottom: '0.3rem', display: 'block' }}>{tr('aord_shipper_customer')}</label>
                  <input value={coForm.shipper_search} onChange={e => setCoForm(f => ({ ...f, shipper_search: e.target.value, shipper_id: '' }))} placeholder={tr('aord_shipper_search_ph')}
                    style={{ width: '100%', padding: '0.6rem 0.8rem', borderRadius: 9, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)', color: 'var(--clr-text)', fontFamily: 'inherit', fontSize: '0.85rem', boxSizing: 'border-box' }} />
                  {coForm.shipper_search && !coForm.shipper_id && (
                    <div style={{ marginTop: '0.25rem', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, overflow: 'hidden', maxHeight: 140, overflowY: 'auto' }}>
                      {shippers.filter(s => `${s.first_name} ${s.last_name} ${s.phone_number}`.toLowerCase().includes(coForm.shipper_search.toLowerCase())).map(s => (
                        <div key={s.id} onClick={() => setCoForm(f => ({ ...f, shipper_id: s.id, shipper_search: `${s.first_name} ${s.last_name} · ${s.phone_number}` }))}
                          style={{ padding: '0.5rem 0.75rem', cursor: 'pointer', background: 'rgba(255,255,255,0.04)', borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: '0.8rem', color: 'var(--clr-text)' }}>
                          {s.first_name} {s.last_name} <span style={{ color: 'var(--clr-muted)' }}>{s.phone_number}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {coForm.shipper_id && <p style={{ fontSize: '0.72rem', color: 'var(--clr-accent)', marginTop: '0.2rem' }}>{tr('aord_shipper_selected')}</p>}
                </div>

                {/* Cargo & Vehicle */}
                <div>
                  <label style={{ fontSize: '0.73rem', fontWeight: 600, color: 'var(--clr-muted)', marginBottom: '0.3rem', display: 'block' }}>{tr('aord_country')}</label>
                  <select value={coForm.country_code} onChange={e => setCoForm(f => ({
                    ...f,
                    country_code: e.target.value,
                    pickup_address: '', pickup_lat: '', pickup_lng: '', pickup_country_code: '',
                    delivery_address: '', delivery_lat: '', delivery_lng: '', delivery_country_code: '',
                  }))}
                    style={{ width: '100%', padding: '0.6rem', borderRadius: 9, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)', color: 'var(--clr-text)', fontFamily: 'inherit', fontSize: '0.82rem', outline: 'none' }}>
                    <option value="" style={{ background: '#0f172a' }}>— Select country —</option>
                    {coCountries.map(c => <option key={c.id} value={String(c.iso_code).toLowerCase()} style={{ background: '#0f172a' }}>{c.name}</option>)}
                  </select>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem' }}>
                  <div>
                    <label style={{ fontSize: '0.73rem', fontWeight: 600, color: 'var(--clr-muted)', marginBottom: '0.3rem', display: 'block' }}>{tr('aord_cargo_type_req')}</label>
                    <select value={coForm.cargo_type_id} onChange={e => setCoForm(f => ({ ...f, cargo_type_id: e.target.value }))}
                      style={{ width: '100%', padding: '0.6rem', borderRadius: 9, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)', color: 'var(--clr-text)', fontFamily: 'inherit', fontSize: '0.82rem', outline: 'none' }}>
                      <option value="" style={{ background: '#0f172a' }}>— Select —</option>
                      {cargoTypesForCreate.map(ct => <option key={ct.id} value={ct.id} style={{ background: '#0f172a' }}>{ct.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: '0.73rem', fontWeight: 600, color: 'var(--clr-muted)', marginBottom: '0.3rem', display: 'block' }}>{tr('aord_vehicle_req')}</label>
                    <VehicleTypeSelectFull value={coForm.vehicle_type} onChange={v => setCoForm(f => ({ ...f, vehicle_type: v }))} />
                  </div>
                </div>
                <div>
                  <label style={{ fontSize: '0.73rem', fontWeight: 600, color: 'var(--clr-muted)', marginBottom: '0.3rem', display: 'block' }}>{tr('aord_weight_label')}</label>
                  <input type="number" min="0" step="0.1" value={coForm.estimated_weight_kg} onChange={e => setCoForm(f => ({ ...f, estimated_weight_kg: e.target.value }))} placeholder="Optional"
                    style={{ width: '100%', padding: '0.6rem 0.8rem', borderRadius: 9, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)', color: 'var(--clr-text)', fontFamily: 'inherit', fontSize: '0.85rem', boxSizing: 'border-box' }} />
                </div>

                {/* Pickup + Delivery via map */}
                <div>
                  <label style={{ fontSize: '0.73rem', fontWeight: 600, color: 'var(--clr-muted)', marginBottom: '0.5rem', display: 'block' }}>{tr('aord_location_label')}</label>
                  <AdminMapPicker
                    pickupLat={coForm.pickup_lat} pickupLng={coForm.pickup_lng} pickupAddress={coForm.pickup_address}
                    deliveryLat={coForm.delivery_lat} deliveryLng={coForm.delivery_lng} deliveryAddress={coForm.delivery_address}
                    selectedCountryCode={coForm.country_code || undefined}
                    onChange={(field, val) => setCoForm(f => ({ ...f, [field]: val }))}
                  />
                </div>

                {/* Notes */}
                <div>
                  <label style={{ fontSize: '0.73rem', fontWeight: 600, color: 'var(--clr-muted)', marginBottom: '0.3rem', display: 'block' }}>{tr('aord_notes_inst')}</label>
                  <input value={coForm.special_instructions} onChange={e => setCoForm(f => ({ ...f, special_instructions: e.target.value }))} placeholder="Optional…"
                    style={{ width: '100%', padding: '0.6rem 0.8rem', borderRadius: 9, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)', color: 'var(--clr-text)', fontFamily: 'inherit', fontSize: '0.85rem', boxSizing: 'border-box' }} />
                </div>

                {/* Cross-border */}
                <div style={{ padding: '0.75rem 0.9rem', borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.02)' }}>
                  <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.6rem', fontWeight: 600, fontSize: '0.83rem' }}>
                    <input type="checkbox" checked={coIsCrossBorder} onChange={e => { setCoIsCrossBorder(e.target.checked); setCoDeliveryCountryId('') }} style={{ accentColor: 'var(--clr-accent)', width: 15, height: 15 }} />
                    {tr('aord_cross_border')}
                  </label>
                  {coIsCrossBorder && (
                    <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                      <div>
                        <label style={{ fontSize: '0.73rem', fontWeight: 600, color: 'var(--clr-muted)', marginBottom: '0.25rem', display: 'block' }}>{tr('aord_delivery_country')}</label>
                        <select value={coDeliveryCountryId} onChange={e => setCoDeliveryCountryId(e.target.value)}
                          style={{ width: '100%', padding: '0.6rem 0.8rem', borderRadius: 9, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(30,30,30,0.95)', color: 'var(--clr-text)', fontFamily: 'inherit', fontSize: '0.85rem' }}>
                          <option value=''>-- Select destination country --</option>
                          {coCountries.filter(c => String(c.iso_code).toLowerCase() !== coForm.country_code).map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
                        <div>
                          <label style={{ fontSize: '0.73rem', fontWeight: 600, color: 'var(--clr-muted)', marginBottom: '0.25rem', display: 'block' }}>{tr('aord_hs_code')}</label>
                          <input value={coHsCode} onChange={e => setCoHsCode(e.target.value)} placeholder="e.g. 8471.30"
                            style={{ width: '100%', padding: '0.6rem 0.8rem', borderRadius: 9, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)', color: 'var(--clr-text)', fontFamily: 'inherit', fontSize: '0.85rem', boxSizing: 'border-box' }} />
                        </div>
                        <div>
                          <label style={{ fontSize: '0.73rem', fontWeight: 600, color: 'var(--clr-muted)', marginBottom: '0.25rem', display: 'block' }}>{tr('aord_shipper_tin')}</label>
                          <input value={coShipperTin} onChange={e => setCoShipperTin(e.target.value)} placeholder="Tax ID number"
                            style={{ width: '100%', padding: '0.6rem 0.8rem', borderRadius: 9, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)', color: 'var(--clr-text)', fontFamily: 'inherit', fontSize: '0.85rem', boxSizing: 'border-box' }} />
                        </div>
                      </div>
                      <p style={{ fontSize: '0.72rem', color: 'var(--clr-muted)', margin: 0 }}>ℹ️ Cross-border orders go through AT_BORDER → IN_CUSTOMS → CUSTOMS_CLEARED before delivery.</p>
                    </div>
                  )}
                </div>

                {/* Cargo image upload (optional) */}
                <div>
                  <label style={{ fontSize: '0.73rem', fontWeight: 600, color: 'var(--clr-muted)', marginBottom: '0.3rem', display: 'block' }}>{tr('aord_cargo_image')}</label>
                  {coCargoImage ? (
                    <div style={{ position: 'relative', display: 'inline-block' }}>
                      <img src={coCargoImage} alt="Cargo" style={{ width: 100, height: 72, objectFit: 'cover', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)' }} />
                      <button type="button" onClick={() => setCoCargoImage(null)} style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%', border: 'none', background: '#ef4444', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem' }}>✕</button>
                    </div>
                  ) : (
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.85rem', borderRadius: 9, border: '1px dashed rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.03)', cursor: 'pointer', fontSize: '0.78rem', color: 'var(--clr-muted)' }}>
                      <LuImage size={15} /> Click to upload image
                      <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => {
                        const file = e.target.files?.[0]; if (!file) return
                        const reader = new FileReader()
                        reader.onload = ev => setCoCargoImage(ev.target?.result as string)
                        reader.readAsDataURL(file)
                      }} />
                    </label>
                  )}
                </div>

                {/* Payment receipt upload (optional) */}
                <div>
                  <label style={{ fontSize: '0.73rem', fontWeight: 600, color: 'var(--clr-muted)', marginBottom: '0.3rem', display: 'block' }}>{tr('aord_payment_receipt')}</label>
                  {coPaymentReceipt ? (
                    <div style={{ position: 'relative', display: 'inline-block' }}>
                      <img src={coPaymentReceipt} alt="Receipt" style={{ width: 100, height: 72, objectFit: 'cover', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)' }} />
                      <button type="button" onClick={() => setCoPaymentReceipt(null)} style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%', border: 'none', background: '#ef4444', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem' }}>✕</button>
                    </div>
                  ) : (
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.85rem', borderRadius: 9, border: '1px dashed rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.03)', cursor: 'pointer', fontSize: '0.78rem', color: 'var(--clr-muted)' }}>
                      <LuFileText size={15} /> Click to upload receipt
                      <input type="file" accept="image/*,application/pdf" style={{ display: 'none' }} onChange={e => {
                        const file = e.target.files?.[0]; if (!file) return
                        const reader = new FileReader()
                        reader.onload = ev => setCoPaymentReceipt(ev.target?.result as string)
                        reader.readAsDataURL(file)
                      }} />
                    </label>
                  )}
                </div>

                {/* Assign driver (optional) */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem' }}>
                  <div>
                    <label style={{ fontSize: '0.73rem', fontWeight: 600, color: 'var(--clr-muted)', marginBottom: '0.3rem', display: 'block' }}>{tr('aord_assign_drv_opt')}</label>
                    <select value={coForm.driver_id} onChange={e => {
                      const did = e.target.value
                      const autoVehicle = vehicles.find((v: AdminVehicle) => v.driver_id === did)
                      setCoForm(f => ({ ...f, driver_id: did, vehicle_id: autoVehicle?.id ?? '' }))
                    }} style={{ width: '100%', padding: '0.6rem', borderRadius: 9, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)', color: 'var(--clr-text)', fontFamily: 'inherit', fontSize: '0.78rem', outline: 'none' }}>
                      <option value="" style={{ background: '#0f172a' }}>— None —</option>
                      {drivers.map(d => <option key={d.user_id} value={d.user_id} style={{ background: '#0f172a' }}>{d.first_name} {d.last_name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: '0.73rem', fontWeight: 600, color: 'var(--clr-muted)', marginBottom: '0.3rem', display: 'block' }}>{tr('aord_vehicle_auto')}</label>
                    <select value={coForm.vehicle_id} onChange={e => setCoForm(f => ({ ...f, vehicle_id: e.target.value }))}
                      style={{ width: '100%', padding: '0.6rem', borderRadius: 9, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)', color: 'var(--clr-text)', fontFamily: 'inherit', fontSize: '0.78rem', outline: 'none' }}>
                      <option value="" style={{ background: '#0f172a' }}>— None —</option>
                      {vehicles.map(v => <option key={v.id} value={v.id} style={{ background: '#0f172a' }}>{v.plate_number} · {v.vehicle_type}</option>)}
                    </select>
                  </div>
                </div>

                <button onClick={getCoQuote} style={{ width: '100%', padding: '0.7rem', borderRadius: 10, border: 'none', background: 'var(--clr-accent)', color: '#000', fontFamily: 'inherit', fontSize: '0.88rem', fontWeight: 700, cursor: 'pointer', marginTop: '0.25rem' }}>
                  Get Quote →
                </button>
              </div>
            ) : (
              /* Confirm step */
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                <div className="glass-inner" style={{ padding: '1rem' }}>
                  <p style={{ fontSize: '0.7rem', color: 'var(--clr-muted)', fontWeight: 600, marginBottom: '0.65rem' }}>{tr('aord_price_breakdown')}</p>
                  {[
                    [tr('aord_base_fare'), `${Number(coQuote?.base_fare ?? 0).toFixed(2)} ETB`],
                    [tr('aord_distance_cost'), `${Number(coQuote?.distance_km ?? 0).toFixed(1)} km × ${Number(coQuote?.per_km_rate ?? 0)} ETB/km`],
                    ...(coQuote?.weight_cost ? [[tr('aord_weight_cost'), `${Number(coQuote.weight_cost).toFixed(2)} ETB`]] : []),
                    ...(coQuote?.fees_breakdown?.map(f => [f.name, `${Number(f.amount).toFixed(2)} ETB`]) ?? []),
                  ].map(([l, v]) => (
                    <div key={l} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: '0.3rem' }}>
                      <span style={{ color: 'var(--clr-muted)' }}>{l}</span><span style={{ color: 'var(--clr-text)' }}>{v}</span>
                    </div>
                  ))}
                  <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', marginTop: '0.5rem', paddingTop: '0.5rem', display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontWeight: 700, color: 'var(--clr-text)' }}>{tr('aord_confirm_total')}</span>
                    <span style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--clr-accent)' }}>{Number(coQuote?.estimated_price ?? 0).toLocaleString()} ETB</span>
                  </div>
                </div>
                {/* Show uploaded media summary */}
                {(coCargoImage || coPaymentReceipt) && (
                  <div style={{ display: 'flex', gap: '0.65rem' }}>
                    {coCargoImage && <div style={{ flex: 1, padding: '0.5rem 0.75rem', borderRadius: 8, background: 'rgba(97, 148, 31,0.06)', border: '1px solid rgba(97, 148, 31,0.15)', fontSize: '0.75rem', color: 'var(--clr-accent)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}><LuImage size={13} /> {tr('aord_cargo_img_attached')}</div>}
                    {coPaymentReceipt && <div style={{ flex: 1, padding: '0.5rem 0.75rem', borderRadius: 8, background: 'rgba(97, 148, 31,0.06)', border: '1px solid rgba(97, 148, 31,0.15)', fontSize: '0.75rem', color: 'var(--clr-accent)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}><LuFileText size={13} /> {tr('aord_receipt_attached')}</div>}
                  </div>
                )}
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button onClick={() => setCoStep('form')} className="btn-outline" style={{ flex: 1 }}>{tr('aord_back')}</button>
                  <button onClick={placeCoOrder} disabled={coSaving || !coForm.shipper_id} className="btn-primary" style={{ flex: 2 }}>
                    {coSaving ? <BtnSpinner text={tr('aord_creating')} /> : tr('aord_place_order')}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {toast && <div style={{ position: 'fixed', bottom: '1.25rem', right: '1.25rem', zIndex: 200, background: 'rgba(97, 148, 31,0.12)', border: '1px solid rgba(97, 148, 31,0.25)', color: 'var(--clr-text)', padding: '0.65rem 1.1rem', borderRadius: 12, fontSize: '0.85rem', fontWeight: 600, backdropFilter: 'blur(12px)' }}>{toast}</div>}
    </div>
  )
}

// ─── Admin Live Drivers Section ───────────────────────────────────────────────

// Fix Leaflet default marker icons (broken by Webpack/Vite asset hashing)
const DefaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41],
})
L.Marker.prototype.options.icon = DefaultIcon

interface LiveDriver {
  driver_id: string; first_name: string; last_name: string; phone_number: string; profile_photo_url: string | null
  lat: number | null; lng: number | null; heading: number | null; speed_kmh: number | null; last_seen: string | null
  order_id: string | null; reference_code: string | null; status: string | null
  pickup_address: string | null; delivery_address: string | null
  pickup_lat: number | null; pickup_lng: number | null; delivery_lat: number | null; delivery_lng: number | null
  cargo_type_name: string | null; cargo_type_icon: string | null; cargo_type_icon_url: string | null
  vehicle_type: string | null; estimated_weight_kg: number | null; distance_km: number | null
  estimated_price: number | null; final_price: number | null
  pickup_otp: string | null; delivery_otp: string | null
  shipper_first_name: string | null; shipper_last_name: string | null; shipper_phone: string | null
  guest_name: string | null; is_guest_order: number | null
}

interface ChatMessage {
  id: number; order_id: string; sender_id: string; sender_name: string
  sender_role: string; message: string; created_at: string
}

function AdminLiveDriversSection() {
  const { t: tr } = useLanguage()
  const [drivers, setDrivers] = useState<LiveDriver[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<LiveDriver | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [chatMsg, setChatMsg] = useState('')
  const [chatSending, setChatSending] = useState(false)
  const [driverChatChannel, setDriverChatChannel] = useState<'driver' | 'main'>('driver')
  const [toast, setToast] = useState('')
  const chatEndRef = useRef<HTMLDivElement>(null)
  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3000) }

  const load = useCallback(async () => {
    try {
      const { data } = await adminOrderApi.getLiveDrivers()
      setDrivers(data.drivers ?? [])
    } catch { /* silently ignore polling errors */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    load()
    const interval = setInterval(load, 10000)
    return () => clearInterval(interval)
  }, [load])

  const openDriver = async (d: LiveDriver) => {
    setSelected(d)
    setDriverChatChannel('driver')
    if (d.order_id) {
      try {
        const { data } = await adminOrderApi.getOrderMessages(d.order_id, 'driver')
        setMessages(data.messages ?? [])
      } catch { setMessages([]) }
    } else { setMessages([]) }
  }

  // Reload messages when channel tab changes
  useEffect(() => {
    if (selected?.order_id) {
      adminOrderApi.getOrderMessages(selected.order_id, driverChatChannel)
        .then(({ data }) => setMessages(data.messages ?? []))
        .catch(() => setMessages([]))
    }
  }, [driverChatChannel]) // eslint-disable-line

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMsg = async () => {
    if (!chatMsg.trim() || !selected?.order_id) return
    setChatSending(true)
    try {
      await adminOrderApi.sendOrderMessage(selected.order_id, chatMsg.trim(), driverChatChannel)
      setChatMsg('')
      const { data } = await adminOrderApi.getOrderMessages(selected.order_id, driverChatChannel)
      setMessages(data.messages ?? [])
    } catch { showToast('Failed to send message') }
    finally { setChatSending(false) }
  }

  const mapDrivers = drivers.filter(d => d.lat != null && d.lng != null)

  /** Haversine great-circle distance in km */
  function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
    const R = 6371, toRad = (d: number) => d * Math.PI / 180
    const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1)
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  }

  /** Returns km-left, km-driven, and progress % for a driver */
  function driverProgress(d: LiveDriver) {
    if (!d.lat || !d.lng || !d.delivery_lat || !d.delivery_lng || !d.distance_km) return null
    const kmLeft = haversineKm(d.lat, d.lng, d.delivery_lat, d.delivery_lng)
    const total = Number(d.distance_km)
    const kmDriven = Math.max(0, total - kmLeft)
    const pct = Math.min(100, Math.round((kmDriven / total) * 100))
    return { kmLeft: Math.max(0, kmLeft), kmDriven, total, pct }
  }

  /** Driver-status colour for map icons (overrides vehicle type) */
  const driverStatusColor: Record<string, string> = {
    AVAILABLE: 'var(--kpi-green)',   // green
    ON_JOB: '#f97316',   // orange
    OFFLINE: '#94a3b8',   // grey
    SUSPENDED: '#f87171',   // red
  }
  /** Vehicle emoji per type */
  const vehicleEmoji: Record<string, string> = {
    Truck: '🚛', 'Mini Truck': '🚚', Van: '🚐', Pickup: '🛻',
    Motorcycle: '🏍', 'Cargo Bike': '🚲', Trailer: '🚜',
  }
  function makeDriverIcon(d: LiveDriver) {
    const status = (d as any).driver_status as string | undefined
    const bg = driverStatusColor[status ?? ''] ?? 'var(--kpi-cyan)'
    const emoji = vehicleEmoji[d.vehicle_type ?? ''] ?? '🚚'
    return L.divIcon({
      className: '',
      html: `<div style="background:${bg};width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.45);font-size:13px">${emoji}</div>`,
      iconSize: [28, 28], iconAnchor: [14, 14],
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--clr-text)', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
          <LuMapPin size={17} /> {tr('alv_title')}
          <span style={{ fontSize: '0.7rem', color: 'var(--clr-muted)', fontWeight: 400, marginLeft: '0.35rem' }}>{tr('alv_auto_refresh')}</span>
        </h2>
        <button onClick={load} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.3rem 0.7rem', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: 'var(--clr-muted)', fontFamily: 'inherit', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer' }}>
          <LuRefreshCw size={12} /> Refresh
        </button>
      </div>

      {loading && drivers.length === 0 ? (
        <LoadingSpinner />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: selected ? '1fr 1fr' : '1fr', gap: '1rem' }}>
          {/* Map Panel */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {/* Status legend */}
            <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
              {Object.entries(driverStatusColor).map(([s, c]) => (
                <div key={s} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: c, flexShrink: 0 }} />
                  <span style={{ fontSize: '0.68rem', color: 'var(--clr-muted)', fontWeight: 600 }}>{s.replace('_', ' ')}</span>
                </div>
              ))}
            </div>
            <div style={{ borderRadius: 14, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.09)', height: 400 }}>
              <MapContainer center={[9.03, 38.74]} zoom={12} style={{ width: '100%', height: '100%' }}>
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap contributors" />
                {mapDrivers.map(d => (
                  <Marker key={d.driver_id} position={[Number(d.lat!), Number(d.lng!)]} icon={makeDriverIcon(d)} eventHandlers={{ click: () => openDriver(d) }}>
                    <Popup>
                      <strong>{d.first_name} {d.last_name}</strong><br />
                      {d.reference_code ? `Order: ${d.reference_code}` : 'No active order'}<br />
                      {d.status && <span style={{ color: ORDER_STATUS_COLOR[d.status] ?? '#888' }}>{ORDER_STATUS_LABEL[d.status] ?? d.status}</span>}
                    </Popup>
                  </Marker>
                ))}
                {/* Route lines for drivers with active orders */}
                {mapDrivers.filter(d => d.pickup_lat && d.delivery_lat).map(d => (
                  <Polyline key={`route-${d.driver_id}`}
                    positions={[[Number(d.pickup_lat), Number(d.pickup_lng)], [Number(d.delivery_lat), Number(d.delivery_lng)]]}
                    pathOptions={{ color: driverStatusColor[(d as any).driver_status ?? ''] ?? 'var(--kpi-cyan)', weight: 2, opacity: 0.35, dashArray: '6 4' }}
                  />
                ))}
                {/* Driver → delivery remaining line */}
                {mapDrivers.filter(d => d.delivery_lat && d.status === 'IN_TRANSIT').map(d => (
                  <Polyline key={`remaining-${d.driver_id}`}
                    positions={[[Number(d.lat), Number(d.lng)], [Number(d.delivery_lat), Number(d.delivery_lng)]]}
                    pathOptions={{ color: 'var(--kpi-cyan)', weight: 2.5, opacity: 0.75 }}
                  />
                ))}
              </MapContainer>
            </div>

            {/* Driver list */}
            <div className="glass-inner" style={{ overflow: 'hidden' }}>
              {drivers.length === 0 ? (
                <p style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--clr-muted)', fontSize: '0.85rem' }}>{tr('alv_no_drivers')}</p>
              ) : drivers.map((d, i) => (
                <div key={d.driver_id} onClick={() => openDriver(d)}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.8rem 1rem', borderBottom: i < drivers.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none', cursor: 'pointer', background: selected?.driver_id === d.driver_id ? 'rgba(97, 148, 31,0.06)' : 'transparent', transition: 'background 0.15s' }}>
                  <div style={{ width: 36, height: 36, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, background: driverStatusColor[(d as any).driver_status ?? ''] ?? 'linear-gradient(135deg,var(--clr-accent2),var(--clr-accent))', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {d.profile_photo_url ? <img src={d.profile_photo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <LuTruck size={16} color="#fff" />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--clr-text)', marginBottom: '0.1rem' }}>{d.first_name} {d.last_name}</p>
                    <p style={{ fontSize: '0.72rem', color: 'var(--clr-muted)' }}>{d.phone_number}</p>
                    {d.vehicle_type && <p style={{ fontSize: '0.68rem', color: 'var(--clr-muted)', fontWeight: 600 }}>{vehicleEmoji[d.vehicle_type] ?? '🚚'} {d.vehicle_type}</p>}
                    {d.reference_code && <p style={{ fontSize: '0.7rem', color: 'var(--clr-accent)', fontWeight: 600 }}>Order: {d.reference_code}</p>}
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    {d.status ? orderBadge(d.status) : <span className="badge" style={{ fontSize: '0.65rem' }}>Idle</span>}
                    {d.lat != null && <p style={{ fontSize: '0.65rem', color: 'var(--clr-muted)', marginTop: '0.2rem' }}><LuNavigation size={9} /> {Number(d.lat).toFixed(4)}, {Number(d.lng!).toFixed(4)}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Detail + Chat Panel */}
          {selected && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <p style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--clr-text)' }}>{selected.first_name} {selected.last_name}</p>
                <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--clr-muted)' }}><LuX size={16} /></button>
              </div>

              {/* Order detail */}
              {selected.order_id ? (
                <div className="glass-inner" style={{ padding: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--clr-text)' }}>{selected.reference_code}</span>
                    {selected.status && orderBadge(selected.status)}
                  </div>
                  {/* Customer */}
                  <div>
                    <p style={{ fontSize: '0.65rem', color: 'var(--clr-muted)', fontWeight: 600, marginBottom: '0.2rem' }}>{tr('alv_customer')}</p>
                    <p style={{ fontSize: '0.82rem', color: 'var(--clr-text)', fontWeight: 600 }}>
                      {selected.is_guest_order ? (selected.guest_name ?? 'Guest') : `${selected.shipper_first_name ?? ''} ${selected.shipper_last_name ?? ''}`.trim()}
                    </p>
                    {selected.shipper_phone && !selected.is_guest_order && <p style={{ fontSize: '0.72rem', color: 'var(--clr-muted)' }}>{selected.shipper_phone}</p>}
                  </div>
                  {/* Route */}
                  <div>
                    <p style={{ fontSize: '0.65rem', color: 'var(--clr-muted)', fontWeight: 600, marginBottom: '0.2rem' }}>{tr('alv_from')}</p>
                    <p style={{ fontSize: '0.78rem', color: 'var(--clr-text)', marginBottom: '0.3rem' }}>{selected.pickup_address ?? '—'}</p>
                    <p style={{ fontSize: '0.65rem', color: 'var(--clr-muted)', fontWeight: 600, marginBottom: '0.2rem' }}>{tr('alv_to')}</p>
                    <p style={{ fontSize: '0.78rem', color: 'var(--clr-text)' }}>{selected.delivery_address ?? '—'}</p>
                  </div>
                  {/* Cargo */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem' }}>
                    <div>
                      <p style={{ fontSize: '0.65rem', color: 'var(--clr-muted)' }}>Cargo</p>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        <CargoIcon icon={selected.cargo_type_icon} iconUrl={selected.cargo_type_icon_url} size={14} />
                        <p style={{ fontSize: '0.78rem', color: 'var(--clr-text)', fontWeight: 600 }}>{selected.cargo_type_name ?? '—'}</p>
                      </div>
                    </div>
                    <div><p style={{ fontSize: '0.65rem', color: 'var(--clr-muted)' }}>{tr('alv_vehicle')}</p><p style={{ fontSize: '0.78rem', color: 'var(--clr-text)', fontWeight: 600 }}>{selected.vehicle_type ?? '—'}</p></div>
                    {selected.estimated_weight_kg != null && <div><p style={{ fontSize: '0.65rem', color: 'var(--clr-muted)' }}>{tr('alv_weight')}</p><p style={{ fontSize: '0.78rem', color: 'var(--clr-text)', fontWeight: 600 }}>{selected.estimated_weight_kg} kg</p></div>}
                    {selected.distance_km != null && <div><p style={{ fontSize: '0.65rem', color: 'var(--clr-muted)' }}>{tr('alv_distance')}</p><p style={{ fontSize: '0.78rem', color: 'var(--clr-text)', fontWeight: 600 }}>{Number(selected.distance_km).toFixed(1)} km</p></div>}
                  </div>
                  {/* Progress */}
                  {(() => {
                    const prog = driverProgress(selected)
                    if (!prog) return null
                    return (
                      <div style={{ background: 'rgba(97, 148, 31,0.05)', borderRadius: 8, border: '1px solid rgba(97, 148, 31,0.12)', padding: '0.5rem 0.65rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                          <span style={{ fontSize: '0.65rem', color: 'var(--clr-muted)', fontWeight: 600 }}>{tr('alv_trip_progress')}</span>
                          <span style={{ fontSize: '0.72rem', color: 'var(--clr-accent)', fontWeight: 800 }}>{prog.pct}%</span>
                        </div>
                        <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${prog.pct}%`, background: 'var(--clr-accent)', borderRadius: 3, transition: 'width 0.4s' }} />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.35rem' }}>
                          <span style={{ fontSize: '0.65rem', color: 'var(--clr-muted)' }}>{tr('alv_driven')} <strong style={{ color: 'var(--clr-text)' }}>{prog.kmDriven.toFixed(1)} km</strong></span>
                          <span style={{ fontSize: '0.65rem', color: 'var(--clr-muted)' }}>{tr('alv_left')} <strong style={{ color: 'var(--clr-accent)' }}>{prog.kmLeft.toFixed(1)} km</strong></span>
                        </div>
                        {selected.speed_kmh != null && (
                          <p style={{ fontSize: '0.65rem', color: 'var(--clr-muted)', marginTop: '0.2rem' }}>{tr('alv_speed')} <strong style={{ color: 'var(--clr-text)' }}>{Number(selected.speed_kmh).toFixed(0)} km/h</strong></p>
                        )}
                      </div>
                    )
                  })()}
                  {/* OTPs */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', padding: '0.6rem', background: 'rgba(97, 148, 31,0.06)', borderRadius: 8, border: '1px solid rgba(97, 148, 31,0.12)' }}>
                    <div style={{ textAlign: 'center' }}>
                      <p style={{ fontSize: '0.65rem', color: 'var(--clr-muted)', fontWeight: 600, marginBottom: '0.15rem' }}>{tr('alv_pickup_otp')}</p>
                      <p style={{ fontSize: '1.1rem', fontWeight: 900, color: 'var(--clr-accent)', letterSpacing: 2 }}>{selected.pickup_otp ?? '—'}</p>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <p style={{ fontSize: '0.65rem', color: 'var(--clr-muted)', fontWeight: 600, marginBottom: '0.15rem' }}>{tr('alv_delivery_otp')}</p>
                      <p style={{ fontSize: '1.1rem', fontWeight: 900, color: 'var(--clr-accent)', letterSpacing: 2 }}>{selected.delivery_otp ?? '—'}</p>
                    </div>
                  </div>
                  {/* Price */}
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--clr-muted)' }}>{tr('alv_price')}</span>
                    <span style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--clr-accent)' }}>
                      {(selected.final_price ?? selected.estimated_price ?? 0).toLocaleString()} ETB
                    </span>
                  </div>
                </div>
              ) : (
                <div className="glass-inner" style={{ padding: '1rem', textAlign: 'center', color: 'var(--clr-muted)', fontSize: '0.82rem' }}>{tr('alv_no_order')}</div>
              )}

              {/* Chat */}
              {selected.order_id && (
                <div className="glass-inner" style={{ display: 'flex', flexDirection: 'column', gap: '0', overflow: 'hidden' }}>
                  {/* Channel tabs */}
                  <div style={{ display: 'flex', alignItems: 'center', padding: '0.3rem 0.5rem 0.3rem 0.75rem', borderBottom: '1px solid rgba(255,255,255,0.07)', gap: '0.4rem' }}>
                    <LuMessageSquare size={13} style={{ color: 'var(--clr-accent)', flexShrink: 0 }} />
                    <div style={{ display: 'flex', flex: 1, gap: '0.3rem' }}>
                      {([{ v: 'driver', label: 'Driver Chat' }, { v: 'main', label: 'Shipper Chat' }] as const).map(({ v, label }) => (
                        <button key={v} onClick={() => setDriverChatChannel(v)}
                          style={{
                            flex: 1, padding: '0.3rem 0.4rem', borderRadius: 6, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.7rem', fontWeight: 700, transition: 'all 0.15s',
                            background: driverChatChannel === v ? 'var(--clr-accent)' : 'rgba(255,255,255,0.06)',
                            color: driverChatChannel === v ? '#000' : 'var(--clr-muted)'
                          }}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div style={{ height: 180, overflowY: 'auto', padding: '0.65rem 0.85rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {messages.length === 0 ? (
                      <p style={{ color: 'var(--clr-muted)', fontSize: '0.78rem', textAlign: 'center', margin: 'auto' }}>{tr('alv_no_messages')}</p>
                    ) : messages.map(m => (
                      <div key={m.id} style={{ display: 'flex', flexDirection: 'column', alignItems: m.sender_role === 'Admin' ? 'flex-end' : 'flex-start' }}>
                        <div style={{
                          maxWidth: '85%', padding: '0.45rem 0.75rem', borderRadius: 10, fontSize: '0.8rem', color: 'var(--clr-text)',
                          background: m.sender_role === 'Admin' ? 'rgba(97, 148, 31,0.12)' : m.sender_role === 'Shipper' ? 'rgba(245,158,11,0.09)' : 'rgba(167,139,250,0.1)',
                          border: `1px solid ${m.sender_role === 'Admin' ? 'rgba(97, 148, 31,0.22)' : m.sender_role === 'Shipper' ? 'rgba(245,158,11,0.22)' : 'rgba(167,139,250,0.22)'}`
                        }}>
                          {m.message}
                        </div>
                        <span style={{
                          fontSize: '0.6rem', marginTop: '0.12rem', fontWeight: 600,
                          color: m.sender_role === 'Admin' ? 'var(--kpi-cyan)' : m.sender_role === 'Shipper' ? '#f59e0b' : 'var(--kpi-purple)'
                        }}>
                          {m.sender_name ?? `${(m as any).sender_first_name ?? ''} ${(m as any).sender_last_name ?? ''}`.trim()} · {m.sender_role ?? 'User'}
                        </span>
                      </div>
                    ))}
                    <div ref={chatEndRef} />
                  </div>
                  <div style={{ padding: '0.55rem 0.85rem', borderTop: '1px solid rgba(255,255,255,0.07)', display: 'flex', gap: '0.5rem' }}>
                    <input value={chatMsg} onChange={e => setChatMsg(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg() } }}
                      placeholder={driverChatChannel === 'driver' ? tr('alv_msg_driver_ph') : tr('alv_msg_shipper_ph')}
                      style={{ flex: 1, padding: '0.45rem 0.7rem', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: 'var(--clr-text)', fontFamily: 'inherit', fontSize: '0.8rem', outline: 'none' }} />
                    <button onClick={sendMsg} disabled={chatSending || !chatMsg.trim()}
                      style={{ padding: '0.45rem 0.75rem', borderRadius: 8, border: 'none', background: 'var(--clr-accent)', color: '#000', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem', fontFamily: 'inherit', fontSize: '0.78rem', fontWeight: 700, opacity: (!chatMsg.trim() || chatSending) ? 0.5 : 1 }}>
                      <LuSend size={13} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {toast && <div style={{ position: 'fixed', bottom: '1.25rem', right: '1.25rem', zIndex: 200, background: 'rgba(97, 148, 31,0.12)', border: '1px solid rgba(97, 148, 31,0.25)', color: 'var(--clr-text)', padding: '0.65rem 1.1rem', borderRadius: 12, fontSize: '0.85rem', fontWeight: 600, backdropFilter: 'blur(12px)' }}>{toast}</div>}
    </div>
  )
}

// ─── Admin Guest Orders Section ───────────────────────────────────────────────

function AdminGuestOrdersSection() {
  const { t: tr } = useLanguage()
  const [orders, setOrders] = useState<AdminOrder[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const LIMIT = 20
  const [detailOrder, setDetailOrder] = useState<any | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [toast, setToast] = useState('')
  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3500) }

  // ── Create guest order state ────────────────────────────────────────────────
  const [createModal, setCreateModal] = useState(false)
  const [drivers, setDrivers] = useState<AdminDriver[]>([])
  const [vehicles, setVehicles] = useState<AdminVehicle[]>([])
  const [cargoTypes, setCargoTypes] = useState<Array<{ id: number; name: string; icon: string | null; icon_url: string | null }>>([])
  const [countries, setCountries] = useState<Array<{ id: number; name: string; iso_code: string }>>([])
  const [gForm, setGForm] = useState({
    guest_name: '', guest_phone: '', guest_email: '',
    country_code: '',
    cargo_type_id: '', vehicle_type: '',
    estimated_weight_kg: '',
    pickup_address: '', pickup_lat: '', pickup_lng: '', pickup_country_code: '',
    delivery_address: '', delivery_lat: '', delivery_lng: '', delivery_country_code: '',
    special_instructions: '',
    driver_id: '', vehicle_id: '',
  })
  const [gCargoImage, setGCargoImage] = useState<string | null>(null)
  const [gPaymentReceipt, setGPaymentReceipt] = useState<string | null>(null)
  const [gIsCrossBorder, setGIsCrossBorder] = useState(false)
  const [gDeliveryCountryId, setGDeliveryCountryId] = useState('')
  const [gHsCode, setGHsCode] = useState('')
  const [gShipperTin, setGShipperTin] = useState('')
  const [gQuote, setGQuote] = useState<{ estimated_price: number; distance_km: number; base_fare: number; per_km_rate: number; weight_cost?: number; fees_breakdown?: any[] } | null>(null)
  const [gStep, setGStep] = useState<'form' | 'confirm'>('form')
  const [gSaving, setGSaving] = useState(false)
  const [gErr, setGErr] = useState('')

  // ── Loaders ─────────────────────────────────────────────────────────────────
  const load = useCallback(async (pg = page, q = search) => {
    setLoading(true)
    try {
      const { data } = await adminOrderApi.getGuestOrders({ page: pg, limit: LIMIT, search: q || undefined })
      setOrders(data.orders ?? [])
      setTotal(data.pagination?.total ?? 0)
    } catch { showToast('Failed to load guest orders') }
    finally { setLoading(false) }
  }, [page, search])

  useEffect(() => { load() }, []) // eslint-disable-line
  useEffect(() => { load(page, search) }, [page]) // eslint-disable-line

  const openDetail = async (id: string) => {
    setLoadingDetail(true); setDetailOrder(null)
    try {
      const { data } = await adminOrderApi.getOrder(id)
      setDetailOrder(data.order ?? data)
    } catch { showToast('Failed to load order') }
    finally { setLoadingDetail(false) }
  }

  const openCreateModal = async () => {
    setGForm({ guest_name: '', guest_phone: '', guest_email: '', country_code: '', cargo_type_id: '', vehicle_type: '', estimated_weight_kg: '', pickup_address: '', pickup_lat: '', pickup_lng: '', pickup_country_code: '', delivery_address: '', delivery_lat: '', delivery_lng: '', delivery_country_code: '', special_instructions: '', driver_id: '', vehicle_id: '' })
    setGCargoImage(null); setGPaymentReceipt(null); setGIsCrossBorder(false)
    setGDeliveryCountryId(''); setGHsCode(''); setGShipperTin('')
    setGQuote(null); setGStep('form'); setGErr('')
    setCreateModal(true)
    try {
      const [ct, dr, vh, ctry] = await Promise.all([
        apiClient.get('/orders/cargo-types'),
        apiClient.get('/admin/drivers?filter=verified'),
        apiClient.get('/admin/vehicles'),
        configApi.getCountries(),
      ])
      setCargoTypes(ct.data.cargo_types ?? [])
      setDrivers(dr.data.drivers ?? [])
      setVehicles((vh.data.vehicles ?? []).filter((v: any) => v.is_active))
      const ctryList = ctry.data.countries ?? []
      setCountries(ctryList)
      if (ctryList[0]?.iso_code) setGForm(f => ({ ...f, country_code: String(ctryList[0].iso_code).toLowerCase() }))
    } catch { setGErr('Failed to load data') }
  }

  const getGuestQuote = async () => {
    setGErr('')
    if (!gForm.cargo_type_id || !gForm.vehicle_type || !gForm.pickup_lat || !gForm.delivery_lat) {
      setGErr('Fill cargo type, vehicle, pickup & delivery locations first'); return
    }
    try {
      const { data } = await apiClient.post('/orders/quote', {
        cargo_type_id: Number(gForm.cargo_type_id),
        vehicle_type: gForm.vehicle_type,
        estimated_weight_kg: gForm.estimated_weight_kg ? Number(gForm.estimated_weight_kg) : undefined,
        pickup_lat: Number(gForm.pickup_lat), pickup_lng: Number(gForm.pickup_lng),
        delivery_lat: Number(gForm.delivery_lat), delivery_lng: Number(gForm.delivery_lng),
        is_cross_border: gIsCrossBorder || undefined,
      })
      setGQuote(data.quote ?? data)
      setGStep('confirm')
    } catch (e: any) { setGErr(e.response?.data?.message ?? 'Quote failed') }
  }

  const placeGuestOrder = async () => {
    setGSaving(true); setGErr('')
    const pickupCountryObj = countries.find(c => String(c.iso_code).toLowerCase() === gForm.country_code)
    try {
      const { data } = await adminOrderApi.createOrderOnBehalf({
        is_guest: true,
        guest_name: gForm.guest_name || undefined,
        guest_phone: gForm.guest_phone || undefined,
        guest_email: gForm.guest_email || undefined,
        cargo_type_id: Number(gForm.cargo_type_id),
        vehicle_type: gForm.vehicle_type,
        estimated_weight_kg: gForm.estimated_weight_kg ? Number(gForm.estimated_weight_kg) : undefined,
        pickup_address: gForm.pickup_address, pickup_lat: Number(gForm.pickup_lat), pickup_lng: Number(gForm.pickup_lng),
        delivery_address: gForm.delivery_address, delivery_lat: Number(gForm.delivery_lat), delivery_lng: Number(gForm.delivery_lng),
        special_instructions: gForm.special_instructions || undefined,
        driver_id: gForm.driver_id || undefined,
        vehicle_id: gForm.vehicle_id || undefined,
        cargo_image: gCargoImage ?? undefined,
        payment_receipt: gPaymentReceipt ?? undefined,
        is_cross_border: gIsCrossBorder || undefined,
        pickup_country_id: gIsCrossBorder && pickupCountryObj ? pickupCountryObj.id : undefined,
        delivery_country_id: gIsCrossBorder && gDeliveryCountryId ? Number(gDeliveryCountryId) : undefined,
        hs_code: gIsCrossBorder && gHsCode ? gHsCode : undefined,
        shipper_tin: gIsCrossBorder && gShipperTin ? gShipperTin : undefined,
      })
      showToast(`Guest order ${data.order?.reference_code ?? ''} created! Pickup OTP: ${data.otps?.pickup_otp}`)
      setCreateModal(false)
      load(1, search)
    } catch (e: any) {
      setGErr(e.response?.data?.message ?? 'Failed to create guest order')
    } finally { setGSaving(false) }
  }

  const totalPages = Math.max(1, Math.ceil(total / LIMIT))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--clr-text)', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
          <LuUsers size={17} /> {tr('agst_title')}
          {total > 0 && <span className="badge badge-cyan" style={{ fontSize: '0.67rem' }}>{total}</span>}
        </h2>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={() => load(page, search)} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.3rem 0.7rem', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: 'var(--clr-muted)', fontFamily: 'inherit', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer' }}>
            <LuRefreshCw size={12} /> Refresh
          </button>
          <button onClick={openCreateModal} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.38rem 0.85rem', borderRadius: 8, border: 'none', background: 'var(--clr-accent)', color: '#000', fontFamily: 'inherit', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}>
            <LuPlus size={14} /> New Guest Order
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="glass" style={{ padding: '0.75rem 1rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        <LuSearch size={13} style={{ color: 'var(--clr-muted)', flexShrink: 0 }} />
        <input value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
          onKeyDown={e => e.key === 'Enter' && load(1, search)}
          placeholder={tr('agst_search_ph')}
          style={{ flex: 1, background: 'none', border: 'none', color: 'var(--clr-text)', fontFamily: 'inherit', fontSize: '0.8rem', outline: 'none' }} />
        {search && <button onClick={() => { setSearch(''); setPage(1); load(1, '') }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--clr-muted)', padding: 0, display: 'flex', alignItems: 'center' }}><LuX size={12} /></button>}
        <button onClick={() => load(1, search)} style={{ padding: '0.3rem 0.7rem', borderRadius: 7, border: 'none', background: 'var(--clr-accent)', color: '#000', fontFamily: 'inherit', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer' }}>{tr('agst_search_btn')}</button>
      </div>

      {/* Grid of order cards — same design as normal orders */}
      <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
        {loading ? (
          <div style={{ gridColumn: '1/-1', display: 'flex', justifyContent: 'center', padding: '3rem' }}><LoadingSpinner /></div>
        ) : orders.length === 0 ? (
          <div className="glass-inner" style={{ gridColumn: '1/-1', padding: '3rem 1rem', textAlign: 'center', color: 'var(--clr-muted)', fontSize: '0.875rem' }}>
            {tr('agst_no_orders')}
          </div>
        ) : orders.map(o => (
          <div key={o.id} className="glass-inner"
            onClick={e => { if ((e.target as HTMLElement).closest('button')) return; openDetail(o.id) }}
            style={{ padding: '0.9rem 1rem', cursor: 'pointer', transition: 'background 0.15s', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
            onMouseLeave={e => (e.currentTarget.style.background = '')}>
            {/* Top row */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 800, fontSize: '0.88rem', color: 'var(--clr-text)' }}>{o.reference_code}</span>
                {orderBadge(o.status)}
                <span className="badge" style={{ fontSize: '0.62rem', background: 'rgba(168,85,247,0.15)', color: '#c084fc', border: '1px solid rgba(168,85,247,0.25)' }}>Guest</span>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <span style={{ fontWeight: 800, fontSize: '0.88rem', color: 'var(--clr-accent)' }}>{(o.final_price ?? o.estimated_price).toLocaleString()} ETB</span>
                <div style={{ fontSize: '0.68rem', color: 'var(--clr-muted)', marginTop: '0.2rem' }}>
                  {new Date(o.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </div>
              </div>
            </div>
            {/* Route */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '0.75rem' }}>
              <p style={{ fontSize: '0.75rem', color: 'var(--clr-muted)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <LuMapPin size={12} /> {o.pickup_address}
              </p>
              <p style={{ fontSize: '0.75rem', color: 'var(--clr-muted)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <LuArrowRight size={12} /> {o.delivery_address}
              </p>
            </div>
            {/* Bottom info */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '0.5rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                <p style={{ fontSize: '0.73rem', color: 'var(--clr-muted)', display: 'flex', gap: '0.25rem' }}>
                  <span style={{ color: 'var(--clr-text)' }}>{tr('agst_guest_label')}</span>
                  {(o as any).guest_name ?? 'Unknown'} · {(o as any).guest_phone ?? '—'}
                </p>
                {o.driver_first_name && <p style={{ fontSize: '0.73rem', color: 'var(--clr-muted)', display: 'flex', gap: '0.25rem' }}><span style={{ color: 'var(--clr-text)' }}>{tr('aord_driver')}:</span> {o.driver_first_name} {o.driver_last_name}</p>}
                {(o.cargo_type_name || o.vehicle_type_required) && (
                  <p style={{ fontSize: '0.73rem', color: 'var(--clr-muted)', display: 'flex', gap: '0.4rem', marginTop: '0.2rem' }}>
                    {o.cargo_type_name && <span>{o.cargo_type_name}</span>}
                    {o.cargo_type_name && o.vehicle_type_required && <span>·</span>}
                    {o.vehicle_type_required && <span>{o.vehicle_type_required}</span>}
                  </p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem' }}>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={{ padding: '0.3rem 0.6rem', borderRadius: 7, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: 'var(--clr-muted)', cursor: 'pointer', opacity: page === 1 ? 0.4 : 1 }}>‹</button>
          <span style={{ fontSize: '0.78rem', color: 'var(--clr-muted)' }}>{tr('aord_page_of')} {page} {tr('aord_of')} {totalPages} · {total} {tr('aord_total')}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={{ padding: '0.3rem 0.6rem', borderRadius: 7, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: 'var(--clr-muted)', cursor: 'pointer', opacity: page === totalPages ? 0.4 : 1 }}>›</button>
        </div>
      )}

      {/* Detail modal */}
      {(loadingDetail || detailOrder) && (
        <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) { setDetailOrder(null); setLoadingDetail(false) } }}>
          <div className="glass modal-box" style={{ padding: '1.75rem', maxWidth: 480, maxHeight: '85vh', overflowY: 'auto' }}>
            {loadingDetail && !detailOrder ? <div style={{ textAlign: 'center', padding: '2rem' }}><LoadingSpinner /></div>
              : detailOrder && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                    <div>
                      <h2 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--clr-text)', marginBottom: '0.25rem' }}>{detailOrder.reference_code}</h2>
                      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
                        {orderBadge(detailOrder.status)}
                        <span className="badge" style={{ fontSize: '0.62rem', background: 'rgba(168,85,247,0.15)', color: '#c084fc', border: '1px solid rgba(168,85,247,0.25)' }}>{tr('agst_guest_badge')}</span>
                      </div>
                    </div>
                    <button onClick={() => setDetailOrder(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--clr-muted)', padding: '0.2rem' }}><LuX size={18} /></button>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <div className="glass-inner" style={{ padding: '0.75rem 1rem' }}>
                      <p style={{ fontSize: '0.7rem', color: 'var(--clr-muted)', fontWeight: 600, marginBottom: '0.35rem' }}>{tr('agst_guest_customer')}</p>
                      <p style={{ fontSize: '0.875rem', color: 'var(--clr-text)', fontWeight: 600 }}>{detailOrder.guest_name ?? tr('agst_unknown_guest')}</p>
                      {detailOrder.guest_phone && <p style={{ fontSize: '0.78rem', color: 'var(--clr-muted)' }}>{detailOrder.guest_phone}</p>}
                      {detailOrder.guest_email && <p style={{ fontSize: '0.78rem', color: 'var(--clr-muted)' }}>{detailOrder.guest_email}</p>}
                    </div>
                    {detailOrder.driver_first_name && (
                      <div className="glass-inner" style={{ padding: '0.75rem 1rem' }}>
                        <p style={{ fontSize: '0.7rem', color: 'var(--clr-muted)', fontWeight: 600, marginBottom: '0.35rem' }}>{tr('aord_driver_section')}</p>
                        <p style={{ fontSize: '0.875rem', color: 'var(--clr-text)', fontWeight: 600 }}>{detailOrder.driver_first_name} {detailOrder.driver_last_name}</p>
                        {detailOrder.driver_phone && <p style={{ fontSize: '0.78rem', color: 'var(--clr-muted)' }}>{detailOrder.driver_phone}</p>}
                      </div>
                    )}
                    <div className="glass-inner" style={{ padding: '0.75rem 1rem' }}>
                      <p style={{ fontSize: '0.7rem', color: 'var(--clr-muted)', fontWeight: 600, marginBottom: '0.35rem' }}>{tr('aord_route')}</p>
                      <p style={{ fontSize: '0.78rem', color: 'var(--clr-muted)', marginBottom: '0.1rem' }}>From</p>
                      <p style={{ fontSize: '0.85rem', color: 'var(--clr-text)', marginBottom: '0.4rem' }}>{detailOrder.pickup_address}</p>
                      <p style={{ fontSize: '0.78rem', color: 'var(--clr-muted)', marginBottom: '0.1rem' }}>{tr('aord_to')}</p>
                      <p style={{ fontSize: '0.85rem', color: 'var(--clr-text)' }}>{detailOrder.delivery_address}</p>
                    </div>
                    <div className="glass-inner" style={{ padding: '0.75rem 1rem' }}>
                      <p style={{ fontSize: '0.7rem', color: 'var(--clr-muted)', fontWeight: 600, marginBottom: '0.5rem' }}>{tr('aord_shipment')}</p>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem 1rem' }}>
                        <div><p style={{ fontSize: '0.7rem', color: 'var(--clr-muted)' }}>{tr('aord_cargo_type')}</p><div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.15rem' }}><CargoIcon icon={detailOrder.cargo_type_icon} iconUrl={detailOrder.cargo_type_icon_url} size={16} /><p style={{ fontSize: '0.82rem', color: 'var(--clr-text)', fontWeight: 600 }}>{detailOrder.cargo_type_name ?? '—'}</p></div></div>
                        <div><p style={{ fontSize: '0.7rem', color: 'var(--clr-muted)' }}>{tr('aord_vehicle')}</p><p style={{ fontSize: '0.82rem', color: 'var(--clr-text)', fontWeight: 600 }}>{detailOrder.vehicle_type ?? '—'}</p></div>
                        {detailOrder.estimated_weight_kg != null && <div><p style={{ fontSize: '0.7rem', color: 'var(--clr-muted)' }}>{tr('aord_weight')}</p><p style={{ fontSize: '0.82rem', color: 'var(--clr-text)', fontWeight: 600 }}>{detailOrder.estimated_weight_kg} kg</p></div>}
                        {detailOrder.distance_km != null && <div><p style={{ fontSize: '0.7rem', color: 'var(--clr-muted)' }}>{tr('agst_distance')}</p><p style={{ fontSize: '0.82rem', color: 'var(--clr-text)', fontWeight: 600 }}>{Number(detailOrder.distance_km).toFixed(1)} km</p></div>}
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', padding: '0.7rem', background: 'rgba(97, 148, 31,0.06)', borderRadius: 8, border: '1px solid rgba(97, 148, 31,0.12)' }}>
                      <div style={{ textAlign: 'center' }}>
                        <p style={{ fontSize: '0.65rem', color: 'var(--clr-muted)', fontWeight: 600, marginBottom: '0.2rem' }}>{tr('aord_pickup_otp')}</p>
                        <p style={{ fontSize: '1.1rem', fontWeight: 900, color: 'var(--clr-accent)', letterSpacing: 2 }}>{detailOrder.pickup_otp ?? '—'}</p>
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <p style={{ fontSize: '0.65rem', color: 'var(--clr-muted)', fontWeight: 600, marginBottom: '0.2rem' }}>{tr('aord_delivery_otp')}</p>
                        <p style={{ fontSize: '1.1rem', fontWeight: 900, color: 'var(--clr-accent)', letterSpacing: 2 }}>{detailOrder.delivery_otp ?? '—'}</p>
                      </div>
                    </div>
                    <div className="glass-inner" style={{ padding: '0.75rem 1rem' }}>
                      <p style={{ fontSize: '0.7rem', color: 'var(--clr-muted)', fontWeight: 600, marginBottom: '0.35rem' }}>PRICING</p>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '0.78rem', color: 'var(--clr-muted)' }}>{tr('aord_estimated')}</span>
                        <span style={{ fontSize: '0.85rem', color: 'var(--clr-text)', fontWeight: 700 }}>{Number(detailOrder.estimated_price ?? 0).toLocaleString()} ETB</span>
                      </div>
                      {detailOrder.final_price != null && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.25rem' }}>
                          <span style={{ fontSize: '0.78rem', color: 'var(--clr-muted)' }}>{tr('aord_final')}</span>
                          <span style={{ fontSize: '0.9rem', color: 'var(--clr-accent)', fontWeight: 800 }}>{Number(detailOrder.final_price).toLocaleString()} ETB</span>
                        </div>
                      )}
                    </div>
                    {(detailOrder.cargo_image_url || detailOrder.payment_receipt_url) && (
                      <div className="glass-inner" style={{ padding: '0.75rem 1rem' }}>
                        <p style={{ fontSize: '0.7rem', color: 'var(--clr-muted)', fontWeight: 600, marginBottom: '0.5rem' }}>{tr('agst_attachments')}</p>
                        <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap' }}>
                          {detailOrder.cargo_image_url && <div style={{ textAlign: 'center' }}><img src={getUploadUrl(detailOrder.cargo_image_url)!} alt="Cargo" style={{ width: 120, height: 90, objectFit: 'cover', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)' }} /><p style={{ fontSize: '0.65rem', color: 'var(--clr-muted)', marginTop: '0.2rem' }}>{tr('agst_cargo_image')}</p></div>}
                          {detailOrder.payment_receipt_url && <div style={{ textAlign: 'center' }}><img src={getUploadUrl(detailOrder.payment_receipt_url)!} alt="Receipt" style={{ width: 120, height: 90, objectFit: 'cover', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)' }} /><p style={{ fontSize: '0.65rem', color: 'var(--clr-muted)', marginTop: '0.2rem' }}>{tr('agst_payment_receipt')}</p></div>}
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}
          </div>
        </div>
      )}

      {/* ── Create Guest Order Modal ─────────────────────────────────────────────── */}
      {createModal && (
        <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) setCreateModal(false) }}>
          <div className="glass modal-box" style={{ padding: '1.75rem', maxWidth: 540, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h2 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--clr-text)', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                <LuUsers size={16} /> {tr('agst_new_title')}
              </h2>
              <button onClick={() => setCreateModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--clr-muted)' }}><LuX size={18} /></button>
            </div>
            {gErr && <div className="alert alert-error" style={{ marginBottom: '0.75rem' }}><LuTriangleAlert size={13} /> {gErr}</div>}

            {gStep === 'form' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                {/* Guest info */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', padding: '0.85rem', borderRadius: 10, border: '1px solid rgba(97, 148, 31,0.15)', background: 'rgba(97, 148, 31,0.04)' }}>
                  <p style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--clr-accent)', marginBottom: '0.1rem' }}>{tr('agst_all_optional')}</p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.55rem' }}>
                    <div>
                      <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--clr-muted)', marginBottom: '0.25rem', display: 'block' }}>{tr('agst_name')}</label>
                      <input value={gForm.guest_name} onChange={e => setGForm(f => ({ ...f, guest_name: e.target.value }))} placeholder={tr('agst_name_ph')}
                        style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: 9, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: 'var(--clr-text)', fontFamily: 'inherit', fontSize: '0.82rem', boxSizing: 'border-box' }} />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--clr-muted)', marginBottom: '0.25rem', display: 'block' }}>{tr('agst_phone')}</label>
                      <input value={gForm.guest_phone} onChange={e => setGForm(f => ({ ...f, guest_phone: e.target.value }))} placeholder="+251…"
                        style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: 9, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: 'var(--clr-text)', fontFamily: 'inherit', fontSize: '0.82rem', boxSizing: 'border-box' }} />
                    </div>
                  </div>
                  <div>
                    <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--clr-muted)', marginBottom: '0.25rem', display: 'block' }}>{tr('agst_email')}</label>
                    <input type="email" value={gForm.guest_email} onChange={e => setGForm(f => ({ ...f, guest_email: e.target.value }))} placeholder="Optional"
                      style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: 9, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: 'var(--clr-text)', fontFamily: 'inherit', fontSize: '0.82rem', boxSizing: 'border-box' }} />
                  </div>
                </div>

                {/* Country */}
                <div>
                  <label style={{ fontSize: '0.73rem', fontWeight: 600, color: 'var(--clr-muted)', marginBottom: '0.3rem', display: 'block' }}>{tr('aord_country')}</label>
                  <select value={gForm.country_code} onChange={e => setGForm(f => ({ ...f, country_code: e.target.value, pickup_address: '', pickup_lat: '', pickup_lng: '', pickup_country_code: '', delivery_address: '', delivery_lat: '', delivery_lng: '', delivery_country_code: '' }))}
                    style={{ width: '100%', padding: '0.6rem', borderRadius: 9, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)', color: 'var(--clr-text)', fontFamily: 'inherit', fontSize: '0.82rem', outline: 'none' }}>
                    <option value="" style={{ background: '#0f172a' }}>— Select country —</option>
                    {countries.map(c => <option key={c.id} value={String(c.iso_code).toLowerCase()} style={{ background: '#0f172a' }}>{c.name}</option>)}
                  </select>
                </div>

                {/* Cargo + Vehicle */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem' }}>
                  <div>
                    <label style={{ fontSize: '0.73rem', fontWeight: 600, color: 'var(--clr-muted)', marginBottom: '0.3rem', display: 'block' }}>{tr('aord_cargo_type_req')}</label>
                    <select value={gForm.cargo_type_id} onChange={e => setGForm(f => ({ ...f, cargo_type_id: e.target.value }))}
                      style={{ width: '100%', padding: '0.6rem', borderRadius: 9, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)', color: 'var(--clr-text)', fontFamily: 'inherit', fontSize: '0.82rem', outline: 'none' }}>
                      <option value="" style={{ background: '#0f172a' }}>— Select —</option>
                      {cargoTypes.map(ct => <option key={ct.id} value={ct.id} style={{ background: '#0f172a' }}>{ct.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: '0.73rem', fontWeight: 600, color: 'var(--clr-muted)', marginBottom: '0.3rem', display: 'block' }}>{tr('aord_vehicle_req')}</label>
                    <VehicleTypeSelectFull value={gForm.vehicle_type} onChange={v => setGForm(f => ({ ...f, vehicle_type: v }))} />
                  </div>
                </div>
                <div>
                  <label style={{ fontSize: '0.73rem', fontWeight: 600, color: 'var(--clr-muted)', marginBottom: '0.3rem', display: 'block' }}>{tr('aord_weight_label')}</label>
                  <input type="number" min="0" step="0.1" value={gForm.estimated_weight_kg} onChange={e => setGForm(f => ({ ...f, estimated_weight_kg: e.target.value }))} placeholder="Optional"
                    style={{ width: '100%', padding: '0.6rem 0.8rem', borderRadius: 9, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)', color: 'var(--clr-text)', fontFamily: 'inherit', fontSize: '0.85rem', boxSizing: 'border-box' }} />
                </div>

                {/* Map picker */}
                <div>
                  <label style={{ fontSize: '0.73rem', fontWeight: 600, color: 'var(--clr-muted)', marginBottom: '0.5rem', display: 'block' }}>{tr('aord_location_label')}</label>
                  <AdminMapPicker
                    pickupLat={gForm.pickup_lat} pickupLng={gForm.pickup_lng} pickupAddress={gForm.pickup_address}
                    deliveryLat={gForm.delivery_lat} deliveryLng={gForm.delivery_lng} deliveryAddress={gForm.delivery_address}
                    selectedCountryCode={gForm.country_code || undefined}
                    onChange={(field, val) => setGForm(f => ({ ...f, [field]: val }))}
                  />
                </div>

                {/* Notes */}
                <div>
                  <label style={{ fontSize: '0.73rem', fontWeight: 600, color: 'var(--clr-muted)', marginBottom: '0.3rem', display: 'block' }}>{tr('aord_notes_inst')}</label>
                  <input value={gForm.special_instructions} onChange={e => setGForm(f => ({ ...f, special_instructions: e.target.value }))} placeholder="Optional…"
                    style={{ width: '100%', padding: '0.6rem 0.8rem', borderRadius: 9, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)', color: 'var(--clr-text)', fontFamily: 'inherit', fontSize: '0.85rem', boxSizing: 'border-box' }} />
                </div>

                {/* Cross-border */}
                <div style={{ padding: '0.75rem 0.9rem', borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.02)' }}>
                  <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.6rem', fontWeight: 600, fontSize: '0.83rem' }}>
                    <input type="checkbox" checked={gIsCrossBorder} onChange={e => { setGIsCrossBorder(e.target.checked); setGDeliveryCountryId('') }} style={{ accentColor: 'var(--clr-accent)', width: 15, height: 15 }} />
                    {tr('agst_cross_border')}
                  </label>
                  {gIsCrossBorder && (
                    <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                      <select value={gDeliveryCountryId} onChange={e => setGDeliveryCountryId(e.target.value)}
                        style={{ width: '100%', padding: '0.6rem 0.8rem', borderRadius: 9, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(30,30,30,0.95)', color: 'var(--clr-text)', fontFamily: 'inherit', fontSize: '0.85rem' }}>
                        <option value=''>-- Select destination country --</option>
                        {countries.filter(c => String(c.iso_code).toLowerCase() !== gForm.country_code).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
                        <input value={gHsCode} onChange={e => setGHsCode(e.target.value)} placeholder="HS Code (e.g. 8471.30)"
                          style={{ padding: '0.6rem 0.8rem', borderRadius: 9, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)', color: 'var(--clr-text)', fontFamily: 'inherit', fontSize: '0.82rem' }} />
                        <input value={gShipperTin} onChange={e => setGShipperTin(e.target.value)} placeholder="Shipper TIN"
                          style={{ padding: '0.6rem 0.8rem', borderRadius: 9, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)', color: 'var(--clr-text)', fontFamily: 'inherit', fontSize: '0.82rem' }} />
                      </div>
                    </div>
                  )}
                </div>

                {/* Cargo image */}
                <div>
                  <label style={{ fontSize: '0.73rem', fontWeight: 600, color: 'var(--clr-muted)', marginBottom: '0.3rem', display: 'block' }}>{tr('aord_cargo_image')}</label>
                  {gCargoImage ? (
                    <div style={{ position: 'relative', display: 'inline-block' }}>
                      <img src={gCargoImage} alt="Cargo" style={{ width: 100, height: 72, objectFit: 'cover', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)' }} />
                      <button type="button" onClick={() => setGCargoImage(null)} style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%', border: 'none', background: '#ef4444', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem' }}>✕</button>
                    </div>
                  ) : (
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.85rem', borderRadius: 9, border: '1px dashed rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.03)', cursor: 'pointer', fontSize: '0.78rem', color: 'var(--clr-muted)' }}>
                      <LuImage size={15} /> Click to upload image
                      <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (!f) return; const r = new FileReader(); r.onload = ev => setGCargoImage(ev.target?.result as string); r.readAsDataURL(f) }} />
                    </label>
                  )}
                </div>

                {/* Payment receipt */}
                <div>
                  <label style={{ fontSize: '0.73rem', fontWeight: 600, color: 'var(--clr-muted)', marginBottom: '0.3rem', display: 'block' }}>{tr('aord_payment_receipt')}</label>
                  {gPaymentReceipt ? (
                    <div style={{ position: 'relative', display: 'inline-block' }}>
                      <img src={gPaymentReceipt} alt="Receipt" style={{ width: 100, height: 72, objectFit: 'cover', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)' }} />
                      <button type="button" onClick={() => setGPaymentReceipt(null)} style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%', border: 'none', background: '#ef4444', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem' }}>✕</button>
                    </div>
                  ) : (
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.85rem', borderRadius: 9, border: '1px dashed rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.03)', cursor: 'pointer', fontSize: '0.78rem', color: 'var(--clr-muted)' }}>
                      <LuFileText size={15} /> Click to upload receipt
                      <input type="file" accept="image/*,application/pdf" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (!f) return; const r = new FileReader(); r.onload = ev => setGPaymentReceipt(ev.target?.result as string); r.readAsDataURL(f) }} />
                    </label>
                  )}
                </div>

                {/* Assign driver (optional) */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem' }}>
                  <div>
                    <label style={{ fontSize: '0.73rem', fontWeight: 600, color: 'var(--clr-muted)', marginBottom: '0.3rem', display: 'block' }}>{tr('aord_assign_drv_opt')}</label>
                    <select value={gForm.driver_id} onChange={e => { const did = e.target.value; const av = vehicles.find((v: AdminVehicle) => v.driver_id === did); setGForm(f => ({ ...f, driver_id: did, vehicle_id: av?.id ?? '' })) }}
                      style={{ width: '100%', padding: '0.6rem', borderRadius: 9, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)', color: 'var(--clr-text)', fontFamily: 'inherit', fontSize: '0.78rem', outline: 'none' }}>
                      <option value="" style={{ background: '#0f172a' }}>— None —</option>
                      {drivers.map(d => <option key={d.user_id} value={d.user_id} style={{ background: '#0f172a' }}>{d.first_name} {d.last_name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: '0.73rem', fontWeight: 600, color: 'var(--clr-muted)', marginBottom: '0.3rem', display: 'block' }}>{tr('aord_vehicle_opt')}</label>
                    <select value={gForm.vehicle_id} onChange={e => setGForm(f => ({ ...f, vehicle_id: e.target.value }))}
                      style={{ width: '100%', padding: '0.6rem', borderRadius: 9, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)', color: 'var(--clr-text)', fontFamily: 'inherit', fontSize: '0.78rem', outline: 'none' }}>
                      <option value="" style={{ background: '#0f172a' }}>— None —</option>
                      {vehicles.map(v => <option key={v.id} value={v.id} style={{ background: '#0f172a' }}>{v.plate_number} · {v.vehicle_type}</option>)}
                    </select>
                  </div>
                </div>

                <button onClick={getGuestQuote} style={{ width: '100%', padding: '0.7rem', borderRadius: 10, border: 'none', background: 'var(--clr-accent)', color: '#000', fontFamily: 'inherit', fontSize: '0.88rem', fontWeight: 700, cursor: 'pointer', marginTop: '0.25rem' }}>
                  Get Quote →
                </button>
              </div>
            ) : (
              /* Confirm step */
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                <div className="glass-inner" style={{ padding: '1rem' }}>
                  <p style={{ fontSize: '0.7rem', color: 'var(--clr-muted)', fontWeight: 600, marginBottom: '0.65rem' }}>{tr('aord_price_breakdown')}</p>
                  {[
                    [tr('aord_base_fare'), `${Number(gQuote?.base_fare ?? 0).toFixed(2)} ETB`],
                    [tr('aord_distance_cost'), `${Number(gQuote?.distance_km ?? 0).toFixed(1)} km × ${Number(gQuote?.per_km_rate ?? 0)} ETB/km`],
                    ...(gQuote?.weight_cost ? [[tr('aord_weight_cost'), `${Number(gQuote.weight_cost).toFixed(2)} ETB`]] : []),
                    ...(gQuote?.fees_breakdown?.map(f => [f.name, `${Number(f.amount).toFixed(2)} ETB`]) ?? []),
                  ].map(([l, v]) => (
                    <div key={l} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: '0.3rem' }}>
                      <span style={{ color: 'var(--clr-muted)' }}>{l}</span><span style={{ color: 'var(--clr-text)' }}>{v}</span>
                    </div>
                  ))}
                  <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', marginTop: '0.5rem', paddingTop: '0.5rem', display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontWeight: 700, color: 'var(--clr-text)' }}>{tr('aord_confirm_total')}</span>
                    <span style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--clr-accent)' }}>{Number(gQuote?.estimated_price ?? 0).toLocaleString()} ETB</span>
                  </div>
                </div>
                {gForm.guest_name && (
                  <div style={{ padding: '0.6rem 0.85rem', borderRadius: 8, background: 'rgba(97, 148, 31,0.06)', border: '1px solid rgba(97, 148, 31,0.15)', fontSize: '0.75rem', color: 'var(--clr-accent)' }}>
                    Guest: {gForm.guest_name} · {gForm.guest_phone || '—'} · {gForm.guest_email || '—'}
                  </div>
                )}
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button onClick={() => setGStep('form')} className="btn-outline" style={{ flex: 1 }}>{tr('aord_back')}</button>
                  <button onClick={placeGuestOrder} disabled={gSaving} className="btn-primary" style={{ flex: 2 }}>
                    {gSaving ? <BtnSpinner text={tr('agst_creating')} /> : tr('agst_place_order')}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {toast && <div style={{ position: 'fixed', bottom: '1.25rem', right: '1.25rem', zIndex: 200, background: 'rgba(97, 148, 31,0.12)', border: '1px solid rgba(97, 148, 31,0.25)', color: 'var(--clr-text)', padding: '0.65rem 1.1rem', borderRadius: 12, fontSize: '0.85rem', fontWeight: 600, backdropFilter: 'blur(12px)' }}>{toast}</div>}
    </div>
  )
}


// ─── Admin Cargo Types Section ────────────────────────────────────────────────

interface CargoType { id: number; name: string; description: string | null; requires_special_handling: number; icon: string | null; icon_url: string | null; is_active: number }

function AdminCargoTypesSection() {
  const { t: tr } = useLanguage()
  const [items, setItems] = useState<CargoType[]>([])
  const [loading, setLoading] = useState(false)
  const [modal, setModal] = useState<'create' | 'edit' | null>(null)
  const [editTarget, setEditTarget] = useState<CargoType | null>(null)
  const [form, setForm] = useState({ name: '', description: '', requires_special_handling: false, icon: '', icon_url: '', is_active: true })
  const [formErr, setFormErr] = useState('')
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState('')
  const [iconMode, setIconMode] = useState<'preset' | 'custom'>('preset')
  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3000) }

  const PRESET_ICONS: Array<{ label: string; icon: React.ReactNode; name: string }> = [
    { label: 'General', name: 'LuPackage', icon: <LuPackage size={20} /> },
    { label: 'Box', name: 'LuBox', icon: <LuBox size={20} /> },
    { label: 'Freight', name: 'LuTruck', icon: <LuTruck size={20} /> },
    { label: 'Archive', name: 'LuArchive', icon: <LuArchive size={20} /> },
    { label: 'Fragile', name: 'LuHeart', icon: <LuHeart size={20} /> },
    { label: 'Electronic', name: 'LuMonitor', icon: <LuMonitor size={20} /> },
    { label: 'Hazardous', name: 'LuTriangleAlert', icon: <LuTriangleAlert size={20} /> },
    { label: 'Temp. Sensitive', name: 'LuThermometer', icon: <LuThermometer size={20} /> },
    { label: 'Organic', name: 'LuLeaf', icon: <LuLeaf size={20} /> },
    { label: 'Flammable', name: 'LuFlame', icon: <LuFlame size={20} /> },
    { label: 'Valuable', name: 'LuGem', icon: <LuGem size={20} /> },
    { label: 'Perishable', name: 'LuFish', icon: <LuFish size={20} /> },
  ]

  const load = async () => {
    setLoading(true)
    try { const { data } = await adminOrderApi.listCargoTypes(); setItems(data.cargo_types ?? []) }
    catch { showToast(tr('ct_load_fail')) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, []) // eslint-disable-line

  const openCreate = () => { setForm({ name: '', description: '', requires_special_handling: false, icon: '', icon_url: '', is_active: true }); setIconMode('preset'); setFormErr(''); setEditTarget(null); setModal('create') }
  const openEdit = (c: CargoType) => { setForm({ name: c.name, description: c.description ?? '', requires_special_handling: !!c.requires_special_handling, icon: c.icon ?? '', icon_url: c.icon_url ?? '', is_active: !!c.is_active }); setIconMode(c.icon_url ? 'custom' : 'preset'); setFormErr(''); setEditTarget(c); setModal('edit') }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) { setFormErr(tr('ct_err_name')); return }
    setFormErr(''); setSaving(true)
    try {
      if (modal === 'create') {
        await adminOrderApi.createCargoType({ name: form.name.trim(), description: form.description || undefined, requires_special_handling: form.requires_special_handling, icon: iconMode === 'preset' ? form.icon || undefined : undefined, icon_url: iconMode === 'custom' ? form.icon_url || undefined : undefined })
        showToast(tr('ct_created'))
      } else if (editTarget) {
        await adminOrderApi.updateCargoType(editTarget.id, { name: form.name.trim(), description: form.description || undefined, requires_special_handling: form.requires_special_handling, icon: iconMode === 'preset' ? form.icon || undefined : undefined, icon_url: iconMode === 'custom' ? form.icon_url || undefined : undefined, is_active: form.is_active })
        showToast(tr('ct_updated'))
      }
      setModal(null); load()
    } catch (err: any) { setFormErr(err.response?.data?.message ?? tr('ct_err_fail')) }
    finally { setSaving(false) }
  }

  const inputStyle: React.CSSProperties = { width: '100%', padding: '0.6rem 0.8rem', borderRadius: 9, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)', color: 'var(--clr-text)', fontFamily: 'inherit', fontSize: '0.85rem', boxSizing: 'border-box' }
  const labelStyle: React.CSSProperties = { fontSize: '0.73rem', fontWeight: 600, color: 'var(--clr-muted)', marginBottom: '0.3rem', display: 'block' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--clr-text)', display: 'flex', alignItems: 'center', gap: '0.45rem' }}><LuBox size={17} /> {tr('ct_title')}</h2>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={load} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.3rem 0.7rem', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: 'var(--clr-muted)', fontFamily: 'inherit', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer' }}><LuRefreshCw size={12} /></button>
          <button onClick={openCreate} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.38rem 0.85rem', borderRadius: 8, border: 'none', background: 'var(--clr-accent)', color: '#000', fontFamily: 'inherit', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}><LuPlus size={14} /> Add</button>
        </div>
      </div>
      {loading ? <LoadingSpinner /> : (
        <div className="glass-inner" style={{ overflow: 'hidden' }}>
          {items.length === 0 ? <p style={{ padding: '2rem', textAlign: 'center', color: 'var(--clr-muted)' }}>{tr('ct_empty')}</p>
            : items.map((c, i) => (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem', borderBottom: i < items.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(97, 148, 31,0.08)', border: '1px solid rgba(97, 148, 31,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: 'var(--clr-accent)', fontSize: '1rem' }}>
                  <CargoIcon icon={c.icon} iconUrl={c.icon_url} size={18} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--clr-text)' }}>{c.name}</span>
                    {!c.is_active && <span className="badge badge-red" style={{ fontSize: '0.65rem' }}>{tr('ct_badge_inactive')}</span>}
                    {!!c.requires_special_handling && <span className="badge badge-purple" style={{ fontSize: '0.65rem' }}>{tr('ct_badge_special')}</span>}
                  </div>
                  {c.description && <p style={{ fontSize: '0.73rem', color: 'var(--clr-muted)', marginTop: '0.1rem' }}>{c.description}</p>}
                </div>
                <button onClick={() => openEdit(c)} style={{ padding: '0.28rem 0.55rem', borderRadius: 7, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)', color: 'var(--clr-muted)', fontFamily: 'inherit', fontSize: '0.7rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem' }}><LuPencil size={11} /> {tr('ct_btn_edit')}</button>
              </div>
            ))}
        </div>
      )}

      {(modal === 'create' || modal === 'edit') && (
        <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) setModal(null) }}>
          <div className="glass modal-box" style={{ padding: '1.75rem', maxWidth: 420 }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--clr-text)', marginBottom: '1rem' }}>{modal === 'create' ? tr('ct_modal_create') : tr('ct_modal_edit')}</h2>
            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {formErr && <div className="alert alert-error"><LuTriangleAlert size={13} /> {formErr}</div>}
              <div><label style={labelStyle}>{tr('ct_label_name')}</label><input style={inputStyle} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required /></div>
              <div><label style={labelStyle}>{tr('ct_label_desc')}</label><input style={inputStyle} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
              {/* Icon picker */}
              <div>
                <label style={labelStyle}>{tr('ct_label_icon')}</label>
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.6rem' }}>
                  <button type="button" onClick={() => setIconMode('preset')} style={{ flex: 1, padding: '0.4rem', borderRadius: 7, border: `1px solid ${iconMode === 'preset' ? 'var(--clr-accent)' : 'rgba(255,255,255,0.1)'}`, background: iconMode === 'preset' ? 'rgba(97, 148, 31,0.1)' : 'rgba(255,255,255,0.04)', color: iconMode === 'preset' ? 'var(--clr-accent)' : 'var(--clr-muted)', fontFamily: 'inherit', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}>{tr('ct_icon_preset')}</button>
                  <button type="button" onClick={() => setIconMode('custom')} style={{ flex: 1, padding: '0.4rem', borderRadius: 7, border: `1px solid ${iconMode === 'custom' ? 'var(--clr-accent)' : 'rgba(255,255,255,0.1)'}`, background: iconMode === 'custom' ? 'rgba(97, 148, 31,0.1)' : 'rgba(255,255,255,0.04)', color: iconMode === 'custom' ? 'var(--clr-accent)' : 'var(--clr-muted)', fontFamily: 'inherit', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}><LuImage size={12} /> {tr('ct_icon_custom')}</button>
                </div>
                {iconMode === 'preset' ? (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '0.4rem' }}>
                    {PRESET_ICONS.map(p => (
                      <button key={p.name} type="button" onClick={() => setForm(f => ({ ...f, icon: p.name }))}
                        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.2rem', padding: '0.5rem 0.25rem', borderRadius: 8, border: `1px solid ${form.icon === p.name ? 'var(--clr-accent)' : 'rgba(255,255,255,0.08)'}`, background: form.icon === p.name ? 'rgba(97, 148, 31,0.12)' : 'rgba(255,255,255,0.03)', color: form.icon === p.name ? 'var(--clr-accent)' : 'var(--clr-muted)', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.6rem', fontWeight: 600 }}>
                        {p.icon}
                        <span style={{ lineHeight: 1.1, textAlign: 'center' }}>{p.label}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div>
                    {form.icon_url && <img src={form.icon_url} alt="icon preview" style={{ width: 56, height: 56, borderRadius: 8, objectFit: 'cover', border: '1px solid rgba(255,255,255,0.1)', marginBottom: '0.4rem' }} />}
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.75rem', borderRadius: 8, border: '1px dashed rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.03)', color: 'var(--clr-muted)', cursor: 'pointer', fontSize: '0.78rem' }}>
                      <LuImage size={14} /> {form.icon_url ? tr('ct_icon_change') : tr('ct_icon_upload')}
                      <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => {
                        const file = e.target.files?.[0]; if (!file) return
                        const reader = new FileReader()
                        reader.onload = ev => setForm(f => ({ ...f, icon_url: ev.target?.result as string }))
                        reader.readAsDataURL(file)
                      }} />
                    </label>
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                <button type="button" onClick={() => setForm(f => ({ ...f, requires_special_handling: !f.requires_special_handling }))}
                  style={{ width: 38, height: 22, borderRadius: 99, border: 'none', cursor: 'pointer', background: form.requires_special_handling ? 'var(--clr-accent)' : 'rgba(255,255,255,0.12)', transition: 'background 0.2s', flexShrink: 0, position: 'relative' }}>
                  <span style={{ position: 'absolute', top: 2, left: form.requires_special_handling ? 18 : 2, width: 18, height: 18, borderRadius: '50%', background: form.requires_special_handling ? '#080b14' : 'var(--clr-muted)', transition: 'left 0.2s' }} />
                </button>
                <span style={{ fontSize: '0.85rem', color: 'var(--clr-text)' }}>{tr('ct_toggle_special')}</span>
              </div>
              {modal === 'edit' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                  <button type="button" onClick={() => setForm(f => ({ ...f, is_active: !f.is_active }))}
                    style={{ width: 38, height: 22, borderRadius: 99, border: 'none', cursor: 'pointer', background: form.is_active ? 'var(--clr-accent)' : 'rgba(255,255,255,0.12)', transition: 'background 0.2s', flexShrink: 0, position: 'relative' }}>
                    <span style={{ position: 'absolute', top: 2, left: form.is_active ? 18 : 2, width: 18, height: 18, borderRadius: '50%', background: form.is_active ? '#080b14' : 'var(--clr-muted)', transition: 'left 0.2s' }} />
                  </button>
                  <span style={{ fontSize: '0.85rem', color: 'var(--clr-text)' }}>{tr('ct_toggle_active')}</span>
                </div>
              )}
              <div style={{ display: 'flex', gap: '0.6rem', marginTop: '0.25rem' }}>
                <button type="button" className="btn-outline" style={{ flex: 1 }} onClick={() => setModal(null)}>{tr('ct_btn_cancel')}</button>
                <button type="submit" className="btn-primary" style={{ flex: 2 }} disabled={saving}>{saving ? <BtnSpinner text={tr('ct_saving')} /> : modal === 'create' ? tr('ct_btn_create') : tr('ct_btn_save')}</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {toast && <div style={{ position: 'fixed', bottom: '1.25rem', right: '1.25rem', zIndex: 200, background: 'rgba(97, 148, 31,0.12)', border: '1px solid rgba(97, 148, 31,0.25)', color: 'var(--clr-text)', padding: '0.65rem 1.1rem', borderRadius: 12, fontSize: '0.85rem', fontWeight: 600, backdropFilter: 'blur(12px)' }}>{toast}</div>}
    </div>
  )
}

// ─── Admin Pricing Rules Section ──────────────────────────────────────────────

interface PricingRule { id: number; vehicle_type: string; base_fare: number; per_km_rate: number; per_kg_rate: number; city_surcharge: number; min_distance_km: number | null; is_active: number; additional_fees: string | null }

function AdminPricingRulesSection() {
  const { t: tr } = useLanguage()
  const [items, setItems] = useState<PricingRule[]>([])
  const [loading, setLoading] = useState(false)
  const [modal, setModal] = useState<'create' | 'edit' | null>(null)
  const [editTarget, setEditTarget] = useState<PricingRule | null>(null)
  const [form, setForm] = useState({ vehicle_type: '', base_fare: '', per_km_rate: '', per_kg_rate: '0', min_distance_km: '', is_active: true })
  const [fees, setFees] = useState<Array<{ name: string; value: string; type: 'fixed' | 'percent' }>>([])
  const [newFee, setNewFee] = useState({ name: '', value: '', type: 'fixed' as 'fixed' | 'percent' })
  const [formErr, setFormErr] = useState('')
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState('')
  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3000) }

  const load = async () => {
    setLoading(true)
    try { const { data } = await adminOrderApi.listPricingRules(); setItems(data.pricing_rules ?? []) }
    catch { showToast(tr('pr_load_fail')) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, []) // eslint-disable-line

  const openCreate = () => { setForm({ vehicle_type: '', base_fare: '', per_km_rate: '', per_kg_rate: '0', min_distance_km: '', is_active: true }); setFees([]); setNewFee({ name: '', value: '', type: 'fixed' }); setFormErr(''); setEditTarget(null); setModal('create') }
  const openEdit = (p: PricingRule) => {
    const parsedFees = p.additional_fees ? (typeof p.additional_fees === 'string' ? JSON.parse(p.additional_fees) : p.additional_fees) : []
    setForm({ vehicle_type: p.vehicle_type, base_fare: String(p.base_fare), per_km_rate: String(p.per_km_rate), per_kg_rate: String(p.per_kg_rate ?? 0), min_distance_km: p.min_distance_km != null ? String(p.min_distance_km) : '', is_active: !!p.is_active })
    setFees(parsedFees.map((f: any) => ({ name: f.name, value: String(f.value), type: f.type })))
    setNewFee({ name: '', value: '', type: 'fixed' }); setFormErr(''); setEditTarget(p); setModal('edit')
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.vehicle_type.trim()) { setFormErr(tr('pr_err_vehicle')); return }
    setFormErr(''); setSaving(true)
    try {
      const parsedFees = fees.filter(f => f.name.trim() && f.value).map(f => ({ name: f.name.trim(), value: parseFloat(f.value), type: f.type }))
      const payload = { vehicle_type: form.vehicle_type.trim(), base_fare: parseFloat(form.base_fare), per_km_rate: parseFloat(form.per_km_rate), per_kg_rate: parseFloat(form.per_kg_rate) || 0, min_distance_km: form.min_distance_km ? parseFloat(form.min_distance_km) : undefined, additional_fees: parsedFees.length ? parsedFees : undefined }
      if (modal === 'create') { await adminOrderApi.createPricingRule(payload); showToast(tr('pr_created')) }
      else if (editTarget) { await adminOrderApi.updatePricingRule(editTarget.id, { ...payload, is_active: form.is_active }); showToast('Updated.') }
      setModal(null); load()
    } catch (err: any) { setFormErr(err.response?.data?.message ?? 'Failed') }
    finally { setSaving(false) }
  }

  const inputStyle: React.CSSProperties = { width: '100%', padding: '0.6rem 0.8rem', borderRadius: 9, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)', color: 'var(--clr-text)', fontFamily: 'inherit', fontSize: '0.85rem', boxSizing: 'border-box' }
  const labelStyle: React.CSSProperties = { fontSize: '0.73rem', fontWeight: 600, color: 'var(--clr-muted)', marginBottom: '0.3rem', display: 'block' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--clr-text)', display: 'flex', alignItems: 'center', gap: '0.45rem' }}><LuSettings size={17} /> {tr('pr_title')}</h2>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={load} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.3rem 0.7rem', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: 'var(--clr-muted)', fontFamily: 'inherit', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer' }}><LuRefreshCw size={12} /></button>
          <button onClick={openCreate} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.38rem 0.85rem', borderRadius: 8, border: 'none', background: 'var(--clr-accent)', color: '#000', fontFamily: 'inherit', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}><LuPlus size={14} /> Add</button>
        </div>
      </div>
      {loading ? <LoadingSpinner /> : (
        <div className="glass-inner" style={{ overflow: 'hidden' }}>
          {items.length === 0 ? <p style={{ padding: '2rem', textAlign: 'center', color: 'var(--clr-muted)' }}>{tr('pr_empty')}</p>
            : items.map((p, i) => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem', borderBottom: i < items.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.15rem' }}>
                    <span style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--clr-text)' }}>{p.vehicle_type}</span>
                    {!p.is_active && <span className="badge badge-red" style={{ fontSize: '0.65rem' }}>{tr('pr_badge_inactive')}</span>}
                  </div>
                  <p style={{ fontSize: '0.73rem', color: 'var(--clr-muted)' }}>Base: {p.base_fare} ETB · {p.per_km_rate} ETB/km · {p.per_kg_rate > 0 ? `${p.per_kg_rate} ETB/kg · ` : ''}{p.additional_fees && (typeof p.additional_fees === 'string' ? JSON.parse(p.additional_fees) : p.additional_fees).length > 0 ? `${(typeof p.additional_fees === 'string' ? JSON.parse(p.additional_fees) : p.additional_fees).length} fees` : 'No extra fees'}</p>
                </div>
                <button onClick={() => openEdit(p)} style={{ padding: '0.28rem 0.55rem', borderRadius: 7, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)', color: 'var(--clr-muted)', fontFamily: 'inherit', fontSize: '0.7rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem' }}><LuPencil size={11} /> {tr('pr_btn_edit')}</button>
              </div>
            ))}
        </div>
      )}

      {(modal === 'create' || modal === 'edit') && (
        <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) setModal(null) }}>
          <div className="glass modal-box" style={{ padding: '1.75rem', maxWidth: 480, maxHeight: '88vh', overflowY: 'auto' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--clr-text)', marginBottom: '1rem' }}>{modal === 'create' ? tr('pr_modal_create') : tr('pr_modal_edit')}</h2>
            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {formErr && <div className="alert alert-error"><LuTriangleAlert size={13} /> {formErr}</div>}
              {/* Vehicle Type dropdown */}
              <div>
                <label style={labelStyle}>{tr('pr_label_vehicle')}</label>
                <VehicleTypeSelectFull value={form.vehicle_type} onChange={v => setForm(f => ({ ...f, vehicle_type: v }))} />
              </div>
              {/* Base fare + per km */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem' }}>
                <div><label style={labelStyle}>{tr('pr_label_base_fare')}</label><input style={inputStyle} type="number" min="0" step="0.01" value={form.base_fare} onChange={e => setForm(f => ({ ...f, base_fare: e.target.value }))} required /></div>
                <div><label style={labelStyle}>{tr('pr_label_per_km')}</label><input style={inputStyle} type="number" min="0" step="0.01" value={form.per_km_rate} onChange={e => setForm(f => ({ ...f, per_km_rate: e.target.value }))} required /></div>
                <div><label style={labelStyle}>{tr('pr_label_per_kg')}</label><input style={inputStyle} type="number" min="0" step="0.0001" value={form.per_kg_rate} onChange={e => setForm(f => ({ ...f, per_kg_rate: e.target.value }))} /></div>
                <div><label style={labelStyle}>{tr('pr_label_min_dist')}</label><input style={inputStyle} type="number" min="0" step="0.1" value={form.min_distance_km} onChange={e => setForm(f => ({ ...f, min_distance_km: e.target.value }))} /></div>
              </div>
              {/* Additional fees manager */}
              <div>
                <label style={labelStyle}>{tr('pr_label_fees')}</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '0.5rem' }}>
                  {fees.map((fee, idx) => (
                    <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.4rem 0.65rem', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                      <span style={{ flex: 1, fontSize: '0.8rem', color: 'var(--clr-text)' }}>{fee.name}</span>
                      <span style={{ fontSize: '0.8rem', color: 'var(--clr-accent)', fontWeight: 700 }}>{fee.type === 'percent' ? `${fee.value}%` : `${fee.value} ETB`}</span>
                      <button type="button" onClick={() => setFees(f => f.filter((_, i) => i !== idx))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#f87171', padding: '0.1rem', display: 'flex', alignItems: 'center' }}><LuX size={13} /></button>
                    </div>
                  ))}
                </div>
                {/* Add new fee row */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: '0.4rem', alignItems: 'center' }}>
                  <input style={{ ...inputStyle, fontSize: '0.78rem', padding: '0.45rem 0.65rem' }} placeholder="Fee name" value={newFee.name} onChange={e => setNewFee(f => ({ ...f, name: e.target.value }))} />
                  <input style={{ ...inputStyle, width: 72, fontSize: '0.78rem', padding: '0.45rem 0.65rem' }} type="number" min="0" step="0.01" placeholder="Value" value={newFee.value} onChange={e => setNewFee(f => ({ ...f, value: e.target.value }))} />
                  <select style={{ ...inputStyle, width: 'auto', fontSize: '0.78rem', padding: '0.45rem 0.55rem', outline: 'none' }} value={newFee.type} onChange={e => setNewFee(f => ({ ...f, type: e.target.value as 'fixed' | 'percent' }))}>
                    <option value="fixed" style={{ background: '#0f172a' }}>ETB</option>
                    <option value="percent" style={{ background: '#0f172a' }}>%</option>
                  </select>
                  <button type="button" onClick={() => { if (!newFee.name.trim() || !newFee.value) return; setFees(f => [...f, { ...newFee }]); setNewFee({ name: '', value: '', type: 'fixed' }) }} style={{ padding: '0.45rem 0.65rem', borderRadius: 8, border: 'none', background: 'var(--clr-accent)', color: '#000', fontFamily: 'inherit', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.2rem' }}><LuPlus size={13} /></button>
                </div>
              </div>
              {modal === 'edit' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                  <button type="button" onClick={() => setForm(f => ({ ...f, is_active: !f.is_active }))}
                    style={{ width: 38, height: 22, borderRadius: 99, border: 'none', cursor: 'pointer', background: form.is_active ? 'var(--clr-accent)' : 'rgba(255,255,255,0.12)', transition: 'background 0.2s', flexShrink: 0, position: 'relative' }}>
                    <span style={{ position: 'absolute', top: 2, left: form.is_active ? 18 : 2, width: 18, height: 18, borderRadius: '50%', background: form.is_active ? '#080b14' : 'var(--clr-muted)', transition: 'left 0.2s' }} />
                  </button>
                  <span style={{ fontSize: '0.85rem', color: 'var(--clr-text)' }}>{tr('pr_toggle_active')}</span>
                </div>
              )}
              <div style={{ display: 'flex', gap: '0.6rem', marginTop: '0.25rem' }}>
                <button type="button" className="btn-outline" style={{ flex: 1 }} onClick={() => setModal(null)}>{tr('pr_btn_cancel')}</button>
                <button type="submit" className="btn-primary" style={{ flex: 2 }} disabled={saving}>{saving ? <BtnSpinner text={tr('pr_saving')} /> : modal === 'create' ? tr('pr_btn_create') : tr('pr_btn_save')}</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {toast && <div style={{ position: 'fixed', bottom: '1.25rem', right: '1.25rem', zIndex: 200, background: 'rgba(97, 148, 31,0.12)', border: '1px solid rgba(97, 148, 31,0.25)', color: 'var(--clr-text)', padding: '0.65rem 1.1rem', borderRadius: 12, fontSize: '0.85rem', fontWeight: 600, backdropFilter: 'blur(12px)' }}>{toast}</div>}
    </div>
  )
}

// ─── Admin Car Owners Section ─────────────────────────────────────────────────

interface CarOwnerVehicleAdmin {
  id: number
  plate_number: string
  vehicle_type: string
  model: string | null
  color: string | null
  year: number | null
  max_capacity_kg: number | null
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  admin_note: string | null
  owner_name: string
  owner_phone: string
  assigned_driver_name: string | null
  assigned_driver_phone: string | null
  assigned_driver_id: number | null
  created_at: string
}

interface DriverForAssign {
  id: number
  first_name: string
  last_name: string | null
  phone_number: string
  has_assigned_car: boolean
  assigned_plate: string | null
}

function AdminCarOwnersSection() {
  const { t: tr } = useLanguage()
  const [vehicles, setVehicles] = useState<CarOwnerVehicleAdmin[]>([])
  const [drivers, setDrivers] = useState<DriverForAssign[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [toast, setToast] = useState('')

  // review modal
  const [reviewTarget, setReviewTarget] = useState<CarOwnerVehicleAdmin | null>(null)
  const [reviewAction, setReviewAction] = useState<'APPROVED' | 'REJECTED'>('APPROVED')
  const [reviewNote, setReviewNote] = useState('')
  const [reviewSaving, setReviewSaving] = useState(false)
  const [reviewErr, setReviewErr] = useState('')

  // assign driver modal
  const [assignTarget, setAssignTarget] = useState<CarOwnerVehicleAdmin | null>(null)
  const [assignDriverId, setAssignDriverId] = useState<string>('')
  const [assignSaving, setAssignSaving] = useState(false)
  const [assignErr, setAssignErr] = useState('')

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(''), 3000) }

  async function load() {
    setLoading(true); setErr('')
    try {
      const [vr, dr] = await Promise.all([adminCarOwnerApi.listVehicles(), adminCarOwnerApi.listDriversForAssign()])
      setVehicles(vr.data.vehicles || [])
      setDrivers(dr.data.drivers || [])
    } catch { setErr(tr('cov_load_fail')) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  async function handleReview() {
    if (!reviewTarget) return
    setReviewSaving(true); setReviewErr('')
    try {
      await adminCarOwnerApi.reviewVehicle(String(reviewTarget.id), { action: reviewAction, admin_note: reviewNote.trim() || undefined })
      showToast(reviewAction === 'APPROVED' ? tr('cov_toast_approved') : tr('cov_toast_rejected'))
      setReviewTarget(null); setReviewNote('')
      await load()
    } catch (e: any) { setReviewErr(e.response?.data?.message || tr('cov_toast_update_fail')) }
    finally { setReviewSaving(false) }
  }

  async function handleAssign() {
    if (!assignTarget) return
    setAssignSaving(true); setAssignErr('')
    try {
      await adminCarOwnerApi.assignDriver(String(assignTarget.id), assignDriverId || null)
      showToast(assignDriverId ? tr('cov_toast_assigned') : tr('cov_toast_removed'))
      setAssignTarget(null); setAssignDriverId('')
      await load()
    } catch (e: any) { setAssignErr(e.response?.data?.message || tr('cov_toast_assign_fail')) }
    finally { setAssignSaving(false) }
  }

  const statusColors: Record<string, { bg: string; color: string }> = {
    PENDING: { bg: 'rgba(251,191,36,0.15)', color: 'var(--kpi-gold)' },
    APPROVED: { bg: 'rgba(52,211,153,0.15)', color: '#34d399' },
    REJECTED: { bg: 'rgba(248,113,113,0.15)', color: '#f87171' },
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {toast && (
        <div style={{ position: 'fixed', top: '1.25rem', right: '1.25rem', zIndex: 9999, background: 'rgba(52,211,153,0.15)', border: '1px solid rgba(52,211,153,0.3)', color: '#34d399', padding: '0.65rem 1rem', borderRadius: 10, fontSize: '0.85rem', fontWeight: 600 }}>
          {toast}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
        <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--clr-muted)' }}>{vehicles.length} {vehicles.length !== 1 ? tr('cov_vehicles_pl') : tr('cov_vehicle_s')} {tr('cov_registered')}</p>
        <button onClick={load} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '0.4rem 0.75rem', color: 'var(--clr-muted)', cursor: 'pointer', fontSize: '0.8rem', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          <LuRefreshCw size={13} /> Refresh
        </button>
      </div>

      {loading && <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--clr-muted)' }}><span className="spinner" style={{ marginRight: '0.5rem' }} />{tr('cov_loading')}</div>}
      {err && <div style={{ color: '#f87171', fontSize: '0.85rem', padding: '0.75rem', background: 'rgba(248,113,113,0.1)', borderRadius: 8 }}>{err}</div>}

      {!loading && !err && vehicles.length === 0 && (
        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--clr-muted)', fontSize: '0.9rem' }}>{tr('cov_none')}</div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {vehicles.map(v => {
          const sc = statusColors[v.status] || statusColors.PENDING
          return (
            <div key={v.id} className="glass-inner" style={{ padding: '0.9rem 1rem' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.3rem' }}>
                    <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--clr-text)' }}>{v.plate_number}</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--clr-muted)', background: 'rgba(255,255,255,0.06)', padding: '0.1rem 0.5rem', borderRadius: 6 }}>{v.vehicle_type}</span>
                    <span style={{ padding: '0.2rem 0.6rem', borderRadius: 999, background: sc.bg, color: sc.color, fontSize: '0.73rem', fontWeight: 700 }}>{v.status}</span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem 1rem', marginBottom: '0.3rem' }}>
                    {v.model && <span style={{ fontSize: '0.78rem', color: 'var(--clr-muted)' }}>{tr('cov_model')} <strong style={{ color: 'var(--clr-text)' }}>{v.model}</strong></span>}
                    {v.color && <span style={{ fontSize: '0.78rem', color: 'var(--clr-muted)' }}>{tr('cov_color')} <strong style={{ color: 'var(--clr-text)' }}>{v.color}</strong></span>}
                    {v.year && <span style={{ fontSize: '0.78rem', color: 'var(--clr-muted)' }}>{tr('cov_year')} <strong style={{ color: 'var(--clr-text)' }}>{v.year}</strong></span>}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--clr-muted)' }}>
                    {tr('cov_owner')} <strong style={{ color: 'var(--clr-text)' }}>{v.owner_name}</strong> · {v.owner_phone}
                  </div>
                  {v.assigned_driver_name && (
                    <div style={{ fontSize: '0.78rem', color: '#34d399', marginTop: '0.25rem' }}>
                      {tr('cov_driver_label')} <strong>{v.assigned_driver_name}</strong> · {v.assigned_driver_phone}
                    </div>
                  )}
                  {!v.assigned_driver_name && v.status === 'APPROVED' && (
                    <div style={{ fontSize: '0.75rem', color: 'var(--clr-muted)', marginTop: '0.25rem' }}>{tr('cov_no_driver')}</div>
                  )}
                  {v.admin_note && (
                    <div style={{ fontSize: '0.75rem', color: 'var(--clr-muted)', marginTop: '0.25rem', fontStyle: 'italic' }}>{tr('cov_note')} {v.admin_note}</div>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', alignItems: 'flex-end' }}>
                  {v.status === 'PENDING' && (
                    <button onClick={() => { setReviewTarget(v); setReviewAction('APPROVED'); setReviewNote(''); setReviewErr('') }}
                      className="btn-primary" style={{ padding: '0.4rem 0.85rem', fontSize: '0.78rem' }}>
                      {tr('cov_review_btn')}
                    </button>
                  )}
                  {v.status === 'APPROVED' && (
                    <button onClick={() => { setAssignTarget(v); setAssignDriverId(v.assigned_driver_id ? String(v.assigned_driver_id) : ''); setAssignErr('') }}
                      style={{ background: 'rgba(97, 148, 31,0.1)', border: '1px solid rgba(97, 148, 31,0.25)', borderRadius: 8, padding: '0.4rem 0.85rem', color: 'var(--clr-accent)', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.78rem', fontWeight: 600 }}>
                      {v.assigned_driver_id ? 'Change Driver' : 'Assign Driver'}
                    </button>
                  )}
                  {v.status === 'APPROVED' && v.assigned_driver_id && (
                    <button onClick={async () => {
                      if (!confirm(tr('cov_confirm_remove'))) return
                      try { await adminCarOwnerApi.assignDriver(String(v.id), null); showToast(tr('cov_toast_removed')); load() } catch { }
                    }}
                      style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.25)', borderRadius: 8, padding: '0.4rem 0.85rem', color: '#f87171', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.78rem', fontWeight: 600 }}>
                      {tr('cov_remove_driver')}
                    </button>
                  )}
                  {v.status === 'REJECTED' && (
                    <button onClick={() => { setReviewTarget(v); setReviewAction('APPROVED'); setReviewNote(''); setReviewErr('') }}
                      style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '0.4rem 0.85rem', color: 'var(--clr-muted)', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.78rem', fontWeight: 600 }}>
                      {tr('cov_rereview_btn')}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Review Modal */}
      {reviewTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 9999, display: 'grid', placeItems: 'center', padding: '1rem' }}>
          <div className="glass" style={{ width: 'min(420px,100%)', padding: '1.5rem' }}>
            <p style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--clr-text)', margin: '0 0 0.75rem' }}>{tr('cov_review_title')} — {reviewTarget.plate_number}</p>
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.85rem' }}>
              {(['APPROVED', 'REJECTED'] as const).map(a => (
                <button key={a} onClick={() => setReviewAction(a)}
                  style={{ flex: 1, padding: '0.55rem', borderRadius: 9, border: `1.5px solid ${reviewAction === a ? (a === 'APPROVED' ? '#34d399' : '#f87171') : 'rgba(255,255,255,0.1)'}`, background: reviewAction === a ? (a === 'APPROVED' ? 'rgba(52,211,153,0.1)' : 'rgba(248,113,113,0.1)') : 'rgba(255,255,255,0.04)', color: reviewAction === a ? (a === 'APPROVED' ? '#34d399' : '#f87171') : 'var(--clr-muted)', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, fontSize: '0.85rem' }}>
                  {a === 'APPROVED' ? tr('cov_approve_btn') : tr('cov_reject_btn')}
                </button>
              ))}
            </div>
            <div className="input-wrap" style={{ marginBottom: '0.85rem' }}>
              <input type="text" id="rnote" placeholder=" " value={reviewNote} onChange={e => setReviewNote(e.target.value)} />
              <label htmlFor="rnote">{tr('cov_admin_note')}</label>
            </div>
            {reviewErr && <div style={{ color: '#f87171', fontSize: '0.8rem', marginBottom: '0.75rem' }}>{reviewErr}</div>}
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button onClick={() => setReviewTarget(null)} style={{ flex: 1, padding: '0.65rem', borderRadius: 9, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: 'var(--clr-muted)', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>{tr('cov_cancel')}</button>
              <button onClick={handleReview} disabled={reviewSaving} className="btn-primary" style={{ flex: 2, padding: '0.65rem' }}>{reviewSaving ? tr('cov_saving') : tr('cov_confirm_btn')}</button>
            </div>
          </div>
        </div>
      )}

      {/* Assign Driver Modal */}
      {assignTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 9999, display: 'grid', placeItems: 'center', padding: '1rem' }}>
          <div className="glass" style={{ width: 'min(420px,100%)', padding: '1.5rem' }}>
            <p style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--clr-text)', margin: '0 0 0.75rem' }}>{tr('cov_assign_title')} — {assignTarget.plate_number}</p>
            <select value={assignDriverId} onChange={e => setAssignDriverId(e.target.value)}
              style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: '0.75rem 0.9rem', color: 'var(--clr-text)', fontSize: '0.875rem', fontFamily: 'inherit', marginBottom: '0.85rem', outline: 'none', cursor: 'pointer' }}>
              <option value="">{tr('cov_no_driver_opt')}</option>
              {drivers.map(d => (
                <option key={d.id} value={String(d.id)}>
                  {d.first_name} {d.last_name || ''} · {d.phone_number}{d.has_assigned_car ? ` (${tr('cov_has_car')} ${d.assigned_plate})` : ''}
                </option>
              ))}
            </select>
            {assignErr && <div style={{ color: '#f87171', fontSize: '0.8rem', marginBottom: '0.75rem' }}>{assignErr}</div>}
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button onClick={() => setAssignTarget(null)} style={{ flex: 1, padding: '0.65rem', borderRadius: 9, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: 'var(--clr-muted)', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>{tr('cov_cancel')}</button>
              <button onClick={handleAssign} disabled={assignSaving} className="btn-primary" style={{ flex: 2, padding: '0.65rem' }}>{assignSaving ? tr('cov_saving') : tr('cov_save_btn')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

interface AdminChatMsg { id: number; from: 'user' | 'bot'; text: string; ts: string }

const ADMIN_BEMNET_GREET = "Hi! I'm **Bemnet**, your AI logistics assistant 👋\nHow can I help you today?"

function adminFmtTime(d: Date) { return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }

function AdminBemnetChat({ aiEnabled, userName, userRole }: { aiEnabled: boolean; userName: string; userRole: string }) {
  const [open, setOpen] = useState(false)
  const [msgs, setMsgs] = useState<AdminChatMsg[]>([])
  const [input, setInput] = useState('')
  const [typing, setTyping] = useState(false)
  const [sessionId, setSessionId] = useState<number | null>(null)
  const [mounted, setMounted] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setTimeout(() => setMounted(true), 350) }, [])

  useEffect(() => {
    if (open && msgs.length === 0) {
      setMsgs([{ id: 1, from: 'bot', text: ADMIN_BEMNET_GREET, ts: adminFmtTime(new Date()) }])
    }
    if (open) setTimeout(() => inputRef.current?.focus(), 80)
  }, [open])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [msgs, typing])

  function renderText(text: string) {
    return text.split(/\*\*(.+?)\*\*/g).map((part, i) =>
      i % 2 === 1
        ? <strong key={i} style={{ color: 'var(--clr-accent)', fontWeight: 700 }}>{part}</strong>
        : part
    )
  }

  if (!aiEnabled) return null

  async function sendMessage(rawText: string) {
    const text = rawText.trim()
    if (!text) return
    const now = new Date()
    const userMsg: AdminChatMsg = { id: Date.now(), from: 'user', text, ts: adminFmtTime(now) }
    setMsgs(prev => [...prev, userMsg])
    setInput('')
    setTyping(true)

    try {
      const { data } = await assistantApi.ask({
        question: text,
        ...(sessionId ? { session_id: sessionId } : {}),
        user_name: userName,
        user_role: userRole,
      })

      const nextSessionId = typeof data?.session_id === 'number' ? data.session_id : null
      if (nextSessionId) setSessionId(nextSessionId)

      const answer = String(data?.answer ?? '').trim() || 'I could not generate a response right now. Please try again.'
      const reply: AdminChatMsg = { id: Date.now() + 1, from: 'bot', text: answer, ts: adminFmtTime(new Date()) }
      setMsgs(prev => [...prev, reply])
    } catch (err: any) {
      const message = err?.response?.data?.message || 'Bemnet is temporarily unavailable. Please try again in a moment.'
      const reply: AdminChatMsg = { id: Date.now() + 1, from: 'bot', text: message, ts: adminFmtTime(new Date()) }
      setMsgs(prev => [...prev, reply])
    } finally {
      setTyping(false)
    }
  }

  function send() {
    void sendMessage(input)
  }

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          title="Chat with Bemnet AI"
          style={{
            position: 'fixed', bottom: '1.25rem', right: '1.25rem', zIndex: 1200,
            width: 58, height: 58, borderRadius: '50%', border: '2px solid rgba(97, 148, 31,0.35)', cursor: 'pointer', padding: 0,
            background: 'var(--chat-fab-bg)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.6), 0 0 0 1px rgba(97, 148, 31,0.12)',
            backdropFilter: 'blur(16px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            animation: mounted ? 'fab-pop 0.5s cubic-bezier(0.34,1.56,0.64,1) both, fab-pulse 2.5s 1.5s ease-in-out infinite' : 'none',
            transition: 'transform .18s',
          }}
        >
          <img src={aiLogoSrc} alt="Bemnet AI" style={{ width: 38, height: 38, borderRadius: '50%', objectFit: 'cover' }} />
          <span style={{ position: 'absolute', top: 2, right: 2, width: 14, height: 14, borderRadius: '50%', background: '#22c55e', border: '2px solid var(--chat-dot-brd)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff' }} />
          </span>
        </button>
      )}

      {open && (
        <div style={{
          position: 'fixed', bottom: '1rem', right: '1.25rem', zIndex: 1200,
          width: 'min(390px, calc(100vw - 2rem))',
          height: 'min(580px, calc(100vh - 2rem))',
          display: 'flex', flexDirection: 'column',
          borderRadius: '1.5rem', overflow: 'hidden',
          background: 'var(--chat-panel-bg)',
          border: '1px solid rgba(99,102,241,0.3)',
          boxShadow: '0 32px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(99,102,241,0.15), inset 0 1px 0 rgba(255,255,255,0.06)',
          backdropFilter: 'blur(24px)',
          animation: 'chat-open 0.35s cubic-bezier(0.34,1.56,0.64,1) both',
        }}>
          <div style={{
            padding: '1rem 1.1rem 0.9rem', flexShrink: 0,
            background: 'linear-gradient(135deg,rgba(99,102,241,0.18) 0%,rgba(139,92,246,0.12) 100%)',
            borderBottom: '1px solid rgba(99,102,241,0.2)',
            display: 'flex', alignItems: 'center', gap: '0.75rem',
          }}>
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <img src={aiLogoSrc} alt="Bemnet" style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover', border: '2px solid rgba(99,102,241,0.5)' }} />
              <span style={{ position: 'absolute', bottom: 1, right: 1, width: 11, height: 11, borderRadius: '50%', background: '#22c55e', border: '2px solid var(--chat-dot-brd)' }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 800, fontSize: '0.97rem', color: 'var(--clr-text)', letterSpacing: '-0.01em' }}>Bemnet</div>
              <div style={{ fontSize: '0.72rem', color: '#22c55e', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} /> Online · AI Assistant
              </div>
            </div>
            <button onClick={() => setOpen(false)} style={{ background: 'var(--chat-close-bg)', border: '1px solid var(--adm-foot-btn-brd)', borderRadius: '50%', width: 32, height: 32, cursor: 'pointer', color: 'var(--clr-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all .15s' }}>
              <LuX size={14} />
            </button>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 0.9rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', scrollbarWidth: 'thin', scrollbarColor: 'rgba(99,102,241,0.3) transparent' }}>
            {msgs.map(msg => (
              <div key={msg.id} style={{ display: 'flex', alignItems: 'flex-end', gap: '0.5rem', flexDirection: msg.from === 'user' ? 'row-reverse' : 'row', animation: msg.from === 'user' ? 'msg-in-user 0.28s cubic-bezier(0.4,0,0.2,1) both' : 'msg-in-bot 0.28s cubic-bezier(0.4,0,0.2,1) both' }}>
                {msg.from === 'bot' && (
                  <img src={aiLogoSrc} alt="Bemnet" style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: '1.5px solid rgba(99,102,241,0.4)' }} />
                )}
                {msg.from === 'user' && (
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <LuUser size={13} color="#fff" />
                  </div>
                )}
                <div style={{ maxWidth: '72%', display: 'flex', flexDirection: 'column', gap: '0.2rem', alignItems: msg.from === 'user' ? 'flex-end' : 'flex-start' }}>
                  <div style={{
                    padding: '0.6rem 0.9rem', borderRadius: msg.from === 'user' ? '1.1rem 1.1rem 0.25rem 1.1rem' : '1.1rem 1.1rem 1.1rem 0.25rem',
                    background: msg.from === 'bot' ? 'var(--chat-bot-bg)' : 'linear-gradient(135deg,#6366f1,#8b5cf6)',
                    border: msg.from === 'bot' ? '1px solid var(--chat-bot-brd)' : 'none',
                    fontSize: '0.845rem', lineHeight: 1.6, color: msg.from === 'user' ? '#fff' : 'var(--chat-msg-color)', fontWeight: 450,
                    boxShadow: msg.from === 'user' ? '0 4px 16px rgba(99,102,241,0.3)' : 'none',
                  }}>
                    {renderText(msg.text)}
                    {msg.from === 'user' && (
                      <div style={{ marginTop: '0.35rem', fontSize: '0.66rem', opacity: 0.9, fontWeight: 600 }}>
                        Name: {userName} | Role: {userRole}
                      </div>
                    )}
                  </div>
                  <span style={{ fontSize: '0.65rem', color: 'rgba(100,116,139,0.7)', padding: '0 0.2rem' }}>{msg.ts}</span>
                </div>
              </div>
            ))}

            {typing && (
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.5rem' }}>
                <img src={aiLogoSrc} alt="Bemnet" style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: '1.5px solid rgba(99,102,241,0.4)' }} />
                <div style={{ padding: '0.7rem 1rem', borderRadius: '1.1rem 1.1rem 1.1rem 0.25rem', background: 'var(--chat-bot-bg)', border: '1px solid var(--chat-bot-brd)', display: 'flex', gap: '4px', alignItems: 'center' }}>
                  {[0, 1, 2].map(i => <span key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--clr-accent)', display: 'inline-block', animation: `typing-dot 1.2s ${i * 0.2}s ease-in-out infinite` }} />)}
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <div style={{ padding: '0 0.9rem 0.6rem', display: 'flex', gap: '0.4rem', flexWrap: 'wrap', flexShrink: 0 }}>
            {['Pending orders', 'Wallet payouts', 'Driver status', 'System alerts'].map(q => (
              <button key={q} onClick={() => { void sendMessage(q) }} style={{ padding: '0.35rem 0.75rem', borderRadius: 99, background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)', color: '#a5b4fc', fontSize: '0.73rem', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                {q}
              </button>
            ))}
          </div>

          <div style={{ padding: '0.75rem 0.9rem 0.9rem', flexShrink: 0, borderTop: '1px solid var(--adm-foot-btn-brd)', background: 'var(--chat-footer-bg)', display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
              placeholder="Message Bemnet…"
              style={{ flex: 1, background: 'var(--chat-input-bg)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: '0.85rem', padding: '0.65rem 1rem', color: 'var(--chat-msg-color)', fontSize: '0.875rem', fontFamily: 'inherit', outline: 'none', transition: 'border-color .2s, box-shadow .2s' }}
              onFocus={e => { e.target.style.borderColor = 'rgba(99,102,241,0.6)'; e.target.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.15)' }}
              onBlur={e => { e.target.style.borderColor = 'rgba(99,102,241,0.25)'; e.target.style.boxShadow = 'none' }}
            />
            <button
              onClick={send}
              disabled={!input.trim()}
              style={{ width: 42, height: 42, borderRadius: '0.75rem', border: 'none', cursor: input.trim() ? 'pointer' : 'not-allowed', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: input.trim() ? 'linear-gradient(135deg,#6366f1,#8b5cf6)' : 'rgba(99,102,241,0.2)', transition: 'all .2s', boxShadow: input.trim() ? '0 4px 14px rgba(99,102,241,0.38)' : 'none' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={input.trim() ? '#fff' : 'rgba(99,102,241,0.5)'} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </>
  )
}

// ─── Main Admin Dashboard ─────────────────────────────────────────────────────

export default function AdminDashboardPage() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const { t: tr } = useLanguage()
  const [chatAiEnabled, setChatAiEnabled] = useState(false)

  const [adminTheme, setAdminTheme] = useState<'LIGHT' | 'DARK'>(() =>
    (localStorage.getItem('admin-theme') as 'LIGHT' | 'DARK' | null) ?? 'LIGHT'
  )
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', adminTheme.toLowerCase())
  }, [adminTheme])
  const handleAdminThemeChange = (t: 'LIGHT' | 'DARK') => {
    setAdminTheme(t)
    localStorage.setItem('admin-theme', t)
    document.documentElement.setAttribute('data-theme', t.toLowerCase())
  }

  const [section, setSection] = useState<AdminSection>('overview')
  const [orderJumpFilter, setOrderJumpFilter] = useState<{ driverId?: string, statusFilter?: string } | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [pinned, setPinned] = useState<boolean>(() => localStorage.getItem('admin-sidebar-pinned') === 'true')
  const [users, setUsers] = useState<UserRow[]>([])
  const [myPermissions, setMyPermissions] = useState<string[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [usersLoading, setUsersLoading] = useState(false)
  const [toastMsg, setToastMsg] = useState('')
  const [pendingCounts, setPendingCounts] = useState({ orders: 0, guestOrders: 0, payments: 0, withdrawals: 0 })

  useEffect(() => {
    configApi.getAiStatus().then(r => setChatAiEnabled(Boolean((r.data as any).ai_enabled))).catch(() => { })
  }, [])

  const togglePin = () => setPinned(v => { const next = !v; localStorage.setItem('admin-sidebar-pinned', String(next)); return next })
  const showToast = (msg: string) => { setToastMsg(msg); setTimeout(() => setToastMsg(''), 3000) }

  const loadPendingCounts = useCallback(async () => {
    try {
      const isSuperAdmin = user?.role_id === 1
      const has = (perm: string) => isSuperAdmin || myPermissions.includes(perm)

      const [oRes, gRes, pRes, wRes] = await Promise.all([
        has('orders.manage') ? adminOrderApi.getStats().catch(() => null) : Promise.resolve(null),
        has('orders.manage') ? adminOrderApi.getGuestOrders({ page: 1, limit: 1, status: 'PENDING' }).catch(() => null) : Promise.resolve(null),
        has('payments.approve') ? apiClient.get('/admin/payments/pending', { params: { status: 'PENDING' } }).catch(() => null) : Promise.resolve(null),
        has('payments.approve') ? adminOrderApi.listWithdrawalRequests({ status: 'PENDING', limit: 999 }).catch(() => null) : Promise.resolve(null),
      ])
      setPendingCounts({
        orders: (oRes?.data?.stats?.by_status?.PENDING ?? 0) as number,
        guestOrders: (gRes?.data?.pagination?.total ?? 0) as number,
        payments: ((pRes?.data?.payments) as unknown[])?.length ?? 0,
        withdrawals: (wRes?.data?.requests as unknown[])?.length ?? 0,
      })
    } catch { /* silent */ }
  }, [myPermissions, user?.role_id])
  useEffect(() => { loadPendingCounts() }, [loadPendingCounts])

  const loadUsers = useCallback(async () => {
    setUsersLoading(true)
    try {
      const { data } = await apiClient.get('/admin/users')
      setUsers(data.users ?? [])
      setStats(data.stats ?? null)
    } catch { showToast('Failed to load users') }
    finally { setUsersLoading(false) }
  }, [])

  useEffect(() => {
    const isSuperAdmin = user?.role_id === 1
    const canManageUsers = isSuperAdmin || myPermissions.includes('users.manage')
    if (canManageUsers) {
      loadUsers()
    } else {
      setUsers([])
      setStats(null)
    }
  }, [loadUsers, myPermissions, user?.role_id])

  const reloadPermissions = useCallback(() => {
    adminOrderApi.getMyPermissions()
      .then(({ data }) => setMyPermissions(data.permissions ?? []))
      .catch(() => { })
  }, [])

  useEffect(() => {
    reloadPermissions()
    // Re-fetch permissions whenever the tab regains focus
    const onVisible = () => { if (document.visibilityState === 'visible') reloadPermissions() }
    document.addEventListener('visibilitychange', onVisible)
    // Also poll every 20 seconds so nav updates without any user action needed
    const interval = setInterval(reloadPermissions, 20_000)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      clearInterval(interval)
    }
  }, [reloadPermissions])

  const handleToggleActive = async (u: UserRow) => {
    try {
      await apiClient.patch(`/admin/users/${u.id}/toggle-active`)
      setUsers(prev => prev.map(x => x.id === u.id ? { ...x, is_active: x.is_active ? 0 : 1 } : x))
      showToast(`${u.first_name} ${u.is_active ? 'suspended' : 'activated'}.`)
    } catch { showToast('Action failed.') }
  }

  const drivers = users.filter(u => u.role_id === 3)
  const shippers = users.filter(u => u.role_id === 2)
  // Include all non-shipper, non-driver roles (including custom roles with id > 5)
  const staffUsers = users.filter(u => ![2, 3].includes(u.role_id))

  const can = (perm: string) => user?.role_id === 1 || myPermissions.includes(perm)
  const chatUserName = `${user?.first_name ?? ''} ${user?.last_name ?? ''}`.trim() || user?.phone_number || 'User'
  const chatUserRole = user?.role_name || 'Admin'
  const canOpenReports = user?.role_id === 1 || can('orders.manage') || can('dispatch.manage') || can('payments.approve') || can('wallet.manage')
  // Finance-only view: user has finance permissions but NOT order management
  const financeOnly = !can('orders.manage') && (can('payments.approve') || can('wallet.manage'))
  // Report tabs visible based on actual permissions (not hardcoded role)
  const reportTabsForRole: Array<'orders' | 'finance' | 'drivers' | 'logistics'> | undefined = (() => {
    if (user?.role_id === 1) return undefined
    const tabs: Array<'orders' | 'finance' | 'drivers' | 'logistics'> = []
    if (can('orders.manage')) tabs.push('orders')
    if (can('payments.approve') || can('wallet.manage')) tabs.push('finance')
    if (can('drivers.verify') || can('dispatch.manage')) tabs.push('drivers')
    if (can('dispatch.manage')) tabs.push('logistics')
    return tabs.length ? tabs : undefined
  })()
  const navItems: { id: AdminSection; icon: React.ReactNode; label: string; count?: number }[] = [
    ...(can('overview.view') ? [{ id: 'overview' as AdminSection, icon: <LuLayoutDashboard size={16} />, label: tr('sb_overview') }] : []),
    ...(canOpenReports ? [{ id: 'reports' as AdminSection, icon: <LuChartBar size={16} />, label: tr('sb_reports') }] : []),
    ...(can('orders.manage') ? [{ id: 'orders' as AdminSection, icon: <LuListOrdered size={16} />, label: tr('sb_orders'), count: pendingCounts.orders }] : []),
    ...(can('orders.manage') ? [{ id: 'guest-orders' as AdminSection, icon: <LuUsers size={16} />, label: tr('sb_guest_orders'), count: pendingCounts.guestOrders }] : []),
    ...(can('dispatch.manage') ? [{ id: 'live-drivers' as AdminSection, icon: <LuMapPin size={16} />, label: tr('sb_live_drivers') }] : []),
    ...(can('payments.approve') ? [{ id: 'payments' as AdminSection, icon: <LuFileText size={16} />, label: tr('sb_payments'), count: pendingCounts.payments + pendingCounts.withdrawals }] : []),
    ...(can('wallet.manage') ? [{ id: 'wallet-adjustment' as AdminSection, icon: <LuHistory size={16} />, label: tr('sb_wallet_adjust') }] : []),
    ...(can('drivers.verify') ? [{ id: 'drivers' as AdminSection, icon: <LuTruck size={16} />, label: tr('sb_drivers') }] : []),
    ...(can('drivers.verify') ? [{ id: 'verify-drivers' as AdminSection, icon: <LuBadgeCheck size={16} />, label: tr('sb_verify_drivers') }] : []),
    ...(can('users.manage') ? [{ id: 'shippers' as AdminSection, icon: <LuPackage size={16} />, label: tr('sb_shippers') }] : []),
    ...(can('users.manage') ? [{ id: 'staff' as AdminSection, icon: <LuBriefcase size={16} />, label: tr('sb_staff') }] : []),
    ...(user?.role_id === 1 ? [{ id: 'cross-border' as AdminSection, icon: <LuGlobe size={16} />, label: tr('sb_cross_border') }] : []),
    ...(can('vehicles.manage') ? [{ id: 'vehicles' as AdminSection, icon: <LuCar size={16} />, label: tr('sb_vehicles') }] : []),
    ...(can('vehicles.manage') ? [{ id: 'car-owners' as AdminSection, icon: <LuCar size={16} />, label: tr('sb_car_owners') }] : []),
    ...(user?.role_id === 1 ? [{ id: 'security-events' as AdminSection, icon: <LuShieldCheck size={16} />, label: tr('sb_security') }] : []),
    ...(can('settings.manage') || can('notifications.manage') || can('roles.manage') || can('pricing.manage') || can('cargo.manage') ? [{ id: 'settings' as AdminSection, icon: <LuSettings size={16} />, label: tr('sb_settings') }] : []),
    { id: 'profile' as AdminSection, icon: <LuUser size={16} />, label: 'My Profile' },
  ]

  const SETTINGS_SUBSECTIONS: AdminSection[] = ['cargo-types', 'pricing-rules', 'vehicle-types', 'countries', 'notif-settings', 'role-management', 'maintenance-mode', 'contact-info', 'ai-settings']

  useEffect(() => {
    if (!navItems.length) return
    const exists = navItems.some(n => n.id === section) || SETTINGS_SUBSECTIONS.includes(section)
    if (!exists) setSection(navItems[0].id)
  }, [section, navItems])

  const handleViewDriverOrders = (driverId: string, filterType?: string) => {
    let sf = ''
    if (filterType === 'COMPLETED') sf = 'DELIVERED' // or COMPLETED based on your statuses
    else if (filterType === 'CANCELLED') sf = 'CANCELLED'
    else if (filterType === 'ACTIVE_NOW') sf = 'IN_TRANSIT' // or assign, en_route maybe. Let's just leave it empty and let backend handle search or just show 'ASSIGNED', 'EN_ROUTE', 'AT_PICKUP', 'IN_TRANSIT'. Since we can only pass one status to string, wait, let's just pass nothing for 'Assign_any' and let them see all, or better we add 'ACTIVE' meta status, but for now we will just pass no status for ACTIVE_NOW so they see all driver's orders and can filter. Or if statusFilter is limited, we just leave it blank.
    setOrderJumpFilter({ driverId, statusFilter: sf })
    setSection('orders')
  }

  const sectionTitle = navItems.find(n => n.id === section) ?? ({
    'cargo-types': { icon: <LuBox size={16} />, label: tr('sb_st_cargo') },
    'pricing-rules': { icon: <LuSettings size={16} />, label: tr('sb_st_pricing') },
    'vehicle-types': { icon: <LuTruck size={16} />, label: tr('sb_st_vehicles') },
    'countries': { icon: <LuGlobe size={16} />, label: tr('sb_st_countries') },
    'notif-settings': { icon: <LuBell size={16} />, label: tr('sb_st_notif') },
    'maintenance-mode': { icon: <LuWrench size={16} />, label: tr('sb_st_maintenance') },
    'role-management': { icon: <LuKey size={16} />, label: tr('sb_st_roles') },
    'security-events': { icon: <LuShieldCheck size={16} />, label: tr('sb_st_security') },
    'cross-border': { icon: <LuGlobe size={16} />, label: tr('sb_st_cross') },
    'reports': { icon: <LuChartBar size={16} />, label: tr('sb_st_reports') },
    'contact-info': { icon: <LuPhone size={16} />, label: tr('sb_st_contact') },
    'ai-settings': { icon: <LuLink size={16} />, label: tr('sb_st_ai') },
    'car-owners': { icon: <LuCar size={16} />, label: tr('sb_st_car_owners') },
    'settings': { icon: <LuSettings size={16} />, label: tr('sb_st_settings') },
  } as Record<string, { icon: React.ReactNode; label: string }>)[section]

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--clr-bg)', position: 'relative' }}>
      {/* Aurora background */}
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0, overflow: 'hidden' }}>
        <div style={{ position: 'absolute', borderRadius: '50%', filter: 'blur(80px)', opacity: adminTheme === 'LIGHT' ? 0.06 : 0.3, width: '70vmax', height: '70vmax', top: '-25vmax', left: '-20vmax', background: 'radial-gradient(ellipse,#3e6113 0%,#283e0c 40%,transparent 70%)' }} />
        <div style={{ position: 'absolute', borderRadius: '50%', filter: 'blur(80px)', opacity: adminTheme === 'LIGHT' ? 0.05 : 0.25, width: '60vmax', height: '60vmax', bottom: '-20vmax', right: '-15vmax', background: 'radial-gradient(ellipse,#61941f 0%,#71ad25 40%,transparent 70%)' }} />
      </div>

      {/* Mobile overlay (only when NOT pinned) */}
      {!pinned && sidebarOpen && (
        <div onClick={() => setSidebarOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 39, backdropFilter: 'blur(3px)' }} />
      )}

      {/* Sidebar */}
      <aside style={pinned ? {
        position: 'relative', top: 'auto', left: 'auto', height: 'auto', width: 216,
        background: 'var(--clr-bg)', backdropFilter: 'blur(20px)',
        borderRight: '1px solid rgba(255,255,255,0.07)',
        display: 'flex', flexDirection: 'column', zIndex: 10, flexShrink: 0,
        minHeight: '100vh',
      } : {
        position: 'fixed', top: 0, left: 0, height: '100vh', width: 216,
        background: 'var(--clr-bg)', backdropFilter: 'blur(20px)',
        borderRight: '1px solid rgba(255,255,255,0.07)',
        display: 'flex', flexDirection: 'column', zIndex: 40,
        transform: sidebarOpen ? 'translateX(0)' : 'translateX(-100%)',
        transition: 'transform 0.25s cubic-bezier(0.4,0,0.2,1)',
      }}>
        {/* Brand */}
        <div style={{ padding: '1.25rem 1.1rem 0.9rem', borderBottom: '1px solid var(--adm-brand-brd)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
            <img src={logoImg} alt="Afri logistics" style={{ height: 36, width: 'auto', objectFit: 'contain', borderRadius: 6, flexShrink: 0 }} />
            <div style={{ flex: 1 }} />
            <button onClick={togglePin} title={pinned ? tr('sb_unpin') : tr('sb_pin')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: pinned ? 'var(--clr-accent)' : 'var(--clr-muted)', padding: '0.2rem', display: 'flex', alignItems: 'center', borderRadius: 6, transition: 'color 0.18s' }}>
              {pinned ? <LuPinOff size={15} /> : <LuPin size={15} />}
            </button>
          </div>
          <span className="badge badge-cyan" style={{ marginTop: '0.5rem', fontSize: '0.67rem' }}>{tr('sb_admin_panel')}</span>
        </div>

        {/* Nav groups */}
        <nav style={{ flex: 1, padding: '0.5rem 0.45rem 0.65rem', display: 'flex', flexDirection: 'column', gap: 0, overflowY: 'auto' }}>
          {([
            {
              label: tr('sb_group_main'),
              items: [
                ...(can('overview.view') ? [{ id: 'overview' as AdminSection, icon: <LuLayoutDashboard size={15} />, label: tr('sb_overview') }] : []),
                ...(canOpenReports ? [{ id: 'reports' as AdminSection, icon: <LuChartBar size={15} />, label: tr('sb_reports') }] : []),
              ],
            },
            {
              label: tr('sb_group_orders'),
              items: [
                ...(can('orders.manage') ? [{ id: 'orders' as AdminSection, icon: <LuListOrdered size={15} />, label: tr('sb_orders'), count: pendingCounts.orders }] : []),
                ...(can('orders.manage') ? [{ id: 'guest-orders' as AdminSection, icon: <LuUsers size={15} />, label: tr('sb_guest_orders'), count: pendingCounts.guestOrders }] : []),
                ...(can('dispatch.manage') ? [{ id: 'live-drivers' as AdminSection, icon: <LuMapPin size={15} />, label: tr('sb_live_drivers') }] : []),
              ],
            },
            {
              label: tr('sb_group_finance'),
              items: [
                ...(can('payments.approve') ? [{ id: 'payments' as AdminSection, icon: <LuFileText size={15} />, label: tr('sb_payments'), count: pendingCounts.payments + pendingCounts.withdrawals }] : []),
                ...(can('wallet.manage') ? [{ id: 'wallet-adjustment' as AdminSection, icon: <LuHistory size={15} />, label: tr('sb_wallet_adjust') }] : []),
              ],
            },
            {
              label: tr('sb_group_drivers'),
              items: [
                ...(can('drivers.verify') ? [{ id: 'drivers' as AdminSection, icon: <LuTruck size={15} />, label: tr('sb_drivers') }] : []),
                ...(can('drivers.verify') ? [{ id: 'verify-drivers' as AdminSection, icon: <LuBadgeCheck size={15} />, label: tr('sb_verify_drivers') }] : []),
              ],
            },
            {
              label: tr('sb_group_users'),
              items: [
                ...(can('users.manage') ? [{ id: 'shippers' as AdminSection, icon: <LuPackage size={15} />, label: tr('sb_shippers') }] : []),
                ...(can('users.manage') ? [{ id: 'staff' as AdminSection, icon: <LuBriefcase size={15} />, label: tr('sb_staff') }] : []),
              ],
            },
            {
              label: tr('sb_group_logistics'),
              items: [
                ...(user?.role_id === 1 ? [{ id: 'cross-border' as AdminSection, icon: <LuGlobe size={15} />, label: tr('sb_cross_border') }] : []),
                ...(can('vehicles.manage') ? [{ id: 'vehicles' as AdminSection, icon: <LuCar size={15} />, label: tr('sb_vehicles') }] : []),
                ...(can('vehicles.manage') ? [{ id: 'car-owners' as AdminSection, icon: <LuCar size={15} />, label: tr('sb_car_owners') }] : []),
              ],
            },
            {
              label: tr('sb_group_system'),
              items: [
                ...(user?.role_id === 1 ? [{ id: 'security-events' as AdminSection, icon: <LuShieldCheck size={15} />, label: tr('sb_security') }] : []),
                ...(can('settings.manage') || can('notifications.manage') || can('roles.manage') || can('pricing.manage') || can('cargo.manage') ? [{ id: 'settings' as AdminSection, icon: <LuSettings size={15} />, label: tr('sb_settings') }] : []),
                { id: 'profile' as AdminSection, icon: <LuUser size={15} />, label: tr('sb_profile') },
              ],
            },
          ] as { label: string; items: { id: AdminSection; icon: React.ReactNode; label: string; count?: number }[] }[])
            .filter(g => g.items.length > 0)
            .map(group => (
              <div key={group.label} style={{ marginBottom: '0.1rem' }}>
                {/* Section divider */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.55rem 0.5rem 0.18rem 0.3rem' }}>
                  <div style={{ width: 14, height: 1, background: 'var(--adm-nav-hr)', flexShrink: 0 }} />
                  <span style={{ fontSize: '0.57rem', fontWeight: 700, letterSpacing: '0.1em', color: 'var(--adm-nav-lbl)', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{group.label}</span>
                  <div style={{ flex: 1, height: 1, background: 'var(--adm-nav-hr)' }} />
                </div>
                {/* Items */}
                {group.items.map(item => (
                  <button key={item.id} onClick={() => { setSection(item.id); if (!pinned) setSidebarOpen(false) }}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', padding: '0.52rem 0.6rem 0.52rem 0.85rem', borderRadius: 9, border: 'none', background: section === item.id ? 'var(--adm-nav-active-bg)' : 'transparent', color: section === item.id ? 'var(--clr-accent)' : 'var(--clr-muted)', fontFamily: 'inherit', fontSize: '0.83rem', fontWeight: 600, cursor: 'pointer', textAlign: 'left', transition: 'all 0.18s', outline: section === item.id ? '1px solid var(--adm-nav-active-brd)' : 'none', width: '100%' }}>
                    <span style={{ width: 17, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{item.icon}</span>
                    <span style={{ flex: 1 }}>{item.label}</span>
                    {item.count !== undefined && item.count > 0 && (
                      <span style={{ background: 'rgba(251,191,36,0.15)', color: 'var(--kpi-gold)', borderRadius: 99, padding: '0.05rem 0.42rem', fontSize: '0.67rem', fontWeight: 700 }}>{item.count}</span>
                    )}
                  </button>
                ))}
              </div>
            ))
          }
        </nav>

        {/* User footer */}
        <div style={{ padding: '0.7rem 0.9rem', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', marginBottom: '0.55rem' }}>
            <div style={{ width: 30, height: 30, borderRadius: '50%', flexShrink: 0, background: 'linear-gradient(135deg,var(--clr-accent2),var(--clr-accent))', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
              {user?.profile_photo_url ? <img src={user.profile_photo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <LuShield size={14} color="#fff" />}
            </div>
            <div style={{ minWidth: 0 }}>
              <p style={{ fontWeight: 700, fontSize: '0.77rem', color: 'var(--clr-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user?.first_name} {user?.last_name}</p>
              <p style={{ fontSize: '0.65rem', color: 'var(--clr-muted)' }}>{tr('sb_role_label')}</p>
            </div>
          </div>
          <button onClick={() => { logout(); navigate('/login') }} style={{ width: '100%', padding: '0.42rem', borderRadius: 8, border: '1px solid var(--adm-foot-btn-brd)', background: 'var(--adm-foot-btn-bg)', color: 'var(--clr-muted)', fontFamily: 'inherit', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem' }}><LuLogOut size={13} /> {tr('sb_sign_out')}</button>
          <div style={{ width: '100%', marginTop: '0.45rem', display: 'flex', justifyContent: 'center' }}>
            <LanguageToggle compact />
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100vh', overflowY: 'auto', position: 'relative', zIndex: 1 }}>
        {/* Top bar */}
        <header style={{ position: 'sticky', top: 0, zIndex: 30, background: 'var(--clr-bg)', backdropFilter: 'blur(16px)', borderBottom: '1px solid rgba(255,255,255,0.07)', padding: '0.7rem 1.1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button onClick={() => setSidebarOpen(v => !v)} style={{ background: 'none', border: '1px solid var(--adm-menu-btn-brd)', borderRadius: 8, padding: '0.38rem 0.5rem', color: 'var(--clr-muted)', cursor: 'pointer', lineHeight: 1, flexShrink: 0, display: 'flex', alignItems: 'center' }}>
            {sidebarOpen && !pinned ? <LuX size={17} /> : <LuMenu size={17} />}
          </button>
          <div style={{ flex: 1 }}>
            <p style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--clr-text)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>{sectionTitle?.icon} {sectionTitle?.label}</p>
          </div>
          <button onClick={() => { setSection('profile'); if (!pinned) setSidebarOpen(false) }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', overflow: 'hidden', background: 'linear-gradient(135deg,var(--clr-accent2),var(--clr-accent))', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid rgba(97, 148, 31,0.3)' }}>
              {user?.profile_photo_url ? <img src={user.profile_photo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <LuShield size={15} color="#fff" />}
            </div>
          </button>
        </header>

        {/* Section content */}
        <main style={{ flex: 1, padding: '1.25rem 1.1rem 2rem', maxWidth: 840, width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>
          {section === 'overview' && <OverviewSection stats={stats} users={users} onNav={setSection} financeOnly={financeOnly} />}
          {section === 'drivers' && <AdminDriversSection allUsers={drivers} loading={usersLoading} onToggleActive={handleToggleActive} onRefresh={loadUsers} onViewOrders={handleViewDriverOrders} />}
          {section === 'shippers' && <CustomerSection allUsers={shippers} loading={usersLoading} onToggleActive={handleToggleActive} onRefresh={loadUsers} />}
          {section === 'staff' && <StaffManagementSection allUsers={staffUsers} loading={usersLoading} onToggleActive={handleToggleActive} onRefresh={loadUsers} />}
          {section === 'verify-drivers' && <DriverVerificationSection />}
          {section === 'vehicles' && <VehicleManagementSection />}
          {section === 'settings' && <AdminSettingsHub onNav={setSection} />}
          {section === 'orders' && <AdminOrdersSection initialDriverFilter={orderJumpFilter?.driverId} initialStatusFilter={orderJumpFilter?.statusFilter} />}
          {section === 'live-drivers' && <AdminLiveDriversSection />}
          {section === 'guest-orders' && <AdminGuestOrdersSection />}
          {section === 'cargo-types' && <AdminCargoTypesSection />}
          {section === 'pricing-rules' && <AdminPricingRulesSection />}
          {section === 'vehicle-types' && <AdminVehicleTypesSection />}
          {section === 'countries' && <AdminCountriesSection />}
          {section === 'maintenance-mode' && <AdminMaintenanceSection />}
          {section === 'role-management' && <AdminRoleManagementSection onPermissionsSaved={reloadPermissions} />}
          {section === 'security-events' && <AdminSecurityEventsSection />}
          {section === 'cross-border' && <AdminCrossBorderSection />}
          {section === 'car-owners' && <AdminCarOwnersSection />}
          {section === 'reports' && <AdminReportsSection allowedTabs={reportTabsForRole} />}
          {section === 'contact-info' && <AdminContactInfoSection />}
          {section === 'ai-settings' && <AdminAiSettingsSection />}
          {section === 'profile' && <ProfileSection adminTheme={adminTheme} onThemeChange={handleAdminThemeChange} />}
          {section === 'payments' && <AdminPaymentReview />}
          {section === 'wallet-adjustment' && <AdminWalletAdjustment />}
          {section === 'notif-settings' && <AdminNotifSettings />}
        </main>
      </div>

      {/* Toast */}
      {toastMsg && (
        <div style={{ position: 'fixed', bottom: '1.25rem', right: '1.25rem', zIndex: 100, background: 'var(--adm-toast-bg)', border: '1px solid var(--adm-toast-brd)', color: 'var(--clr-text)', padding: '0.65rem 1.1rem', borderRadius: 12, fontSize: '0.85rem', fontWeight: 600, backdropFilter: 'blur(12px)', boxShadow: '0 8px 32px rgba(0,0,0,0.4)', animation: 'slide-in-right 0.2s ease both' }}>
          {toastMsg}
        </div>
      )}

      <AdminBemnetChat aiEnabled={chatAiEnabled} userName={chatUserName} userRole={chatUserRole} />
    </div>
  )
}
