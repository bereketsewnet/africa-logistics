import {
  useState, useEffect, useCallback, useRef,
  type FormEvent, type ChangeEvent,
} from 'react'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import apiClient, { authApi, adminOrderApi } from '../lib/apiClient'
import PhoneField from '../components/PhoneField'
import { normalisePhone } from '../lib/normalisePhone'
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import {
  LuTruck, LuUser, LuShield, LuPackage, LuPhone, LuMail,
  LuIdCard, LuCircleCheck, LuTriangleAlert, LuCamera, LuTrash2,
  LuEye, LuEyeOff, LuLogOut, LuCheck, LuSmartphone, LuArrowLeft,
  LuLock, LuContact, LuMenu, LuPin, LuPinOff,
  LuUsers, LuChartBar, LuX, LuStar, LuHistory,
  LuShieldCheck, LuPencil, LuPlus, LuFileText, LuRefreshCw,
  LuCar, LuBadgeCheck, LuUserPlus, LuBriefcase, LuSearch,
  LuListOrdered, LuSettings, LuBox, LuBan,
  LuLeaf, LuFlame, LuThermometer, LuHeart, LuMonitor, LuArchive, LuGem, LuFish, LuImage,
  LuMapPin, LuMessageSquare, LuSend, LuNavigation,
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
      <button type="button" className="input-suffix" onClick={onToggle}>{show ? <LuEyeOff size={16}/> : <LuEye size={16}/>}</button>
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
      <span style={{ width: 22, textAlign: 'center', flexShrink: 0, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--clr-accent)' }}>{icon}</span>
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
type AdminSection = 'overview' | 'drivers' | 'shippers' | 'staff' | 'verify-drivers' | 'vehicles' | 'orders' | 'live-drivers' | 'guest-orders' | 'cargo-types' | 'pricing-rules' | 'profile'
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
  const roleIcon = u.role_id === 1 ? <LuShield size={iconSize}/> : u.role_id === 2 ? <LuPackage size={iconSize}/> : u.role_id === 3 ? <LuTruck size={iconSize}/> : <LuUser size={iconSize}/>
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
    <span style={{ display:'inline-flex', alignItems:'center', gap:'0.2rem', background:'rgba(74,222,128,0.12)', border:'1px solid rgba(74,222,128,0.3)', color:'#4ade80', borderRadius:99, padding:'0.15rem 0.5rem', fontSize:'0.65rem', fontWeight:700 }}>
      <LuBadgeCheck size={10}/> Verified
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
    <div ref={ref} style={{ position:'relative' }}>
      <button type="button" onClick={() => setOpen(v => !v)} style={{ width:'100%', padding:'0.6rem 0.8rem', borderRadius:10, border:'1px solid rgba(255,255,255,0.18)', background:'rgba(255,255,255,0.08)', color:'var(--clr-text)', fontFamily:'inherit', fontSize:'0.85rem', fontWeight:600, display:'flex', alignItems:'center', justifyContent:'space-between', cursor:'pointer', textAlign:'left', WebkitAppearance:'none', appearance:'none' }}>
        <span>{selected?.label ?? '—'}</span>
        <span style={{ color:'var(--clr-muted)', fontSize:'0.7rem', marginLeft:'0.5rem' }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div style={{ position:'absolute', top:'calc(100% + 4px)', left:0, right:0, background:'#080b16', border:'1px solid rgba(255,255,255,0.16)', borderRadius:10, overflow:'hidden', boxShadow:'0 8px 32px rgba(0,0,0,0.7)', zIndex:9999 }}>
          {options.map(opt => (
            <button key={opt.id} type="button" onClick={() => { onChange(opt.id); setOpen(false) }}
              style={{ display:'block', width:'100%', padding:'0.7rem 0.85rem', border:'none', borderBottom:'1px solid rgba(255,255,255,0.06)', WebkitAppearance:'none', appearance:'none', background: opt.id === value ? 'rgba(0,229,255,0.12)' : '#080b16', color: opt.id === value ? '#00e5ff' : '#cbd5e1', fontFamily:'inherit', fontSize:'0.85rem', fontWeight:600, cursor:'pointer', textAlign:'left', transition:'background 0.12s' }}
              onMouseEnter={e => { if (opt.id !== value) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.07)' }}
              onMouseLeave={e => { if (opt.id !== value) (e.currentTarget as HTMLButtonElement).style.background = '#080b16' }}
            >{opt.label}</button>
          ))}
        </div>
      )}
    </div>
  )
}
function StatCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: number | string; sub?: string }) {
  return (
    <div className="glass-inner" style={{ padding: '1rem 1.1rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.2rem' }}>
        <span style={{ display:'flex', alignItems:'center', color:'var(--clr-accent)' }}>{icon}</span>
        <span style={{ fontSize: '0.7rem', color: 'var(--clr-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
      </div>
      <span style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--clr-text)', lineHeight: 1 }}>{value}</span>
      {sub && <span style={{ fontSize: '0.7rem', color: 'var(--clr-muted)' }}>{sub}</span>}
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

// ─── Overview section ─────────────────────────────────────────────────────────

function OverviewSection({ stats, users, onNav }: { stats: Stats | null; users: UserRow[]; onNav: (s: AdminSection) => void }) {
  const recent = [...users].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 6)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div>
        <h2 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--clr-text)', marginBottom: '1rem', display:'flex', alignItems:'center', gap:'0.45rem' }}><LuChartBar size={17}/> Overview</h2>
        {stats ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(130px,1fr))', gap: '0.65rem' }}>
            <StatCard icon={<LuUsers size={16}/>}        label="Total"    value={stats.total_users}    sub="all users" />
            <StatCard icon={<LuCircleCheck size={16}/>}  label="Active"   value={stats.active_users}   sub="accounts" />
            <StatCard icon={<LuPackage size={16}/>}      label="Shippers" value={stats.total_shippers} />
            <StatCard icon={<LuTruck size={16}/>}        label="Drivers"  value={stats.total_drivers}  />
            <StatCard icon={<LuShield size={16}/>}       label="Admins"   value={stats.total_admins}   />
            <StatCard icon={<LuStar size={16}/>}         label="Today"    value={stats.new_today}      sub="new today" />
          </div>
        ) : <LoadingSpinner />}
      </div>
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--clr-text)', display:'flex', alignItems:'center', gap:'0.4rem' }}><LuHistory size={15}/> Recent Registrations</h3>
          <button className="btn-outline" style={{ fontSize: '0.72rem', padding: '0.3rem 0.7rem' }} onClick={() => onNav('shippers')}>View shippers →</button>
        </div>
        <div className="glass-inner" style={{ overflow: 'hidden' }}>
          {recent.length === 0 ? (
            <p style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--clr-muted)', fontSize: '0.85rem' }}>No users yet</p>
          ) : recent.map((u, i) => (
            <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.7rem 1rem', borderBottom: i < recent.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
              <UserAvatar u={u} size={32} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--clr-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.first_name} {u.last_name}</p>
                <p style={{ fontSize: '0.73rem', color: 'var(--clr-muted)' }}>{u.phone_number}</p>
              </div>
              <RoleBadge roleId={u.role_id} roleName={u.role_name} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Users list section ───────────────────────────────────────────────────────

// ─── Customer section (Shippers / Drivers) ───────────────────────────────────

function CustomerSection({ title, allUsers, loading, onToggleActive, onRefresh }: {
  title: string; allUsers: UserRow[]; loading: boolean
  onToggleActive: (u: UserRow) => void; onRefresh: () => void
}) {
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
        <h2 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--clr-text)', flex: 1 }}>{title}</h2>
        <button onClick={onRefresh} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.3rem 0.7rem', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: 'var(--clr-muted)', fontFamily: 'inherit', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer' }}>
          <LuRefreshCw size={12}/> Refresh
        </button>
      </div>
      <div className="input-wrap">
        <input id="cs-search" type="text" placeholder=" " value={search} onChange={e => setSearch(e.target.value)} />
        <label htmlFor="cs-search"><LuSearch size={12} style={{ verticalAlign: 'middle', marginRight: '0.3rem' }}/>Search name / phone / email</label>
      </div>
      {loading ? <LoadingSpinner /> : (
        <div className="glass-inner" style={{ overflow: 'hidden' }}>
          {filtered.length === 0 ? (
            <p style={{ padding: '2rem', textAlign: 'center', color: 'var(--clr-muted)', fontSize: '0.875rem' }}>No users found</p>
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
                  {!u.is_active && <span className="badge badge-red" style={{ fontSize: '0.67rem' }}>Suspended</span>}
                </div>
                <p style={{ fontSize: '0.75rem', color: 'var(--clr-muted)', marginTop: '0.15rem' }}>{u.phone_number}</p>
                {u.email && <p style={{ fontSize: '0.7rem', color: 'var(--clr-muted)' }}>{u.email}</p>}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.3rem', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                <span style={{ fontSize: '0.68rem', color: 'var(--clr-muted)' }}>{new Date(u.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                <button onClick={() => handleToggle(u)} style={{ padding: '0.28rem 0.65rem', borderRadius: 7, border: '1px solid', borderColor: u.is_active ? 'rgba(239,68,68,0.35)' : 'rgba(74,222,128,0.35)', background: u.is_active ? 'rgba(239,68,68,0.08)' : 'rgba(74,222,128,0.08)', color: u.is_active ? '#fca5a5' : '#4ade80', fontFamily: 'inherit', fontSize: '0.7rem', fontWeight: 600, cursor: 'pointer' }}>
                  {u.is_active ? 'Suspend' : 'Activate'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <p style={{ fontSize: '0.73rem', color: 'var(--clr-muted)', textAlign: 'right' }}>{filtered.length} shown — click a row to view details</p>

      {/* Detail modal */}
      {selected && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }} onClick={() => setSelected(null)}>
          <div className="glass" style={{ borderRadius: 18, padding: '1.5rem', maxWidth: 440, width: '100%', position: 'relative', boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }} onClick={e => e.stopPropagation()}>
            <button onClick={() => setSelected(null)} style={{ position: 'absolute', top: '0.85rem', right: '0.85rem', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--clr-muted)' }}><LuX size={18}/></button>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.4rem' }}>
              <UserAvatar u={selected} size={56} />
              <div>
                <p style={{ fontWeight: 800, fontSize: '1.05rem', color: 'var(--clr-text)' }}>{selected.first_name} {selected.last_name}</p>
                <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.25rem', flexWrap: 'wrap' }}>
                  <RoleBadge roleId={selected.role_id} roleName={selected.role_name} />
                  {userIsVerified(selected) && <VerifiedBadge />}
                  {!selected.is_active && <span className="badge badge-red" style={{ fontSize: '0.67rem' }}>Suspended</span>}
                </div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem 1.5rem', fontSize: '0.8rem', marginBottom: '1.25rem' }}>
              {[
                { label: 'Phone',        value: selected.phone_number },
                { label: 'Email',        value: selected.email || '—' },
                { label: 'Phone Verified', value: selected.is_phone_verified ? '✓ Yes' : '✗ No', clr: selected.is_phone_verified ? '#4ade80' : '#fca5a5' },
                { label: 'Email Verified', value: selected.is_email_verified ? '✓ Yes' : '✗ No', clr: selected.is_email_verified ? '#4ade80' : '#fca5a5' },
                { label: 'Status',       value: selected.is_active ? 'Active' : 'Suspended', clr: selected.is_active ? '#4ade80' : '#fca5a5' },
                { label: 'Registered',   value: new Date(selected.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) },
              ].map(r => (
                <div key={r.label}>
                  <p style={{ color: 'var(--clr-muted)', marginBottom: '0.15rem', fontSize: '0.72rem' }}>{r.label}</p>
                  <p style={{ color: r.clr ?? 'var(--clr-text)', fontWeight: 600 }}>{r.value}</p>
                </div>
              ))}
            </div>
            <button onClick={() => handleToggle(selected)} style={{ width: '100%', padding: '0.6rem', borderRadius: 10, border: '1px solid', borderColor: selected.is_active ? 'rgba(239,68,68,0.35)' : 'rgba(74,222,128,0.35)', background: selected.is_active ? 'rgba(239,68,68,0.1)' : 'rgba(74,222,128,0.1)', color: selected.is_active ? '#fca5a5' : '#4ade80', fontFamily: 'inherit', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer' }}>
              {selected.is_active ? 'Suspend This User' : 'Activate This User'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Staff management section ─────────────────────────────────────────────────

const STAFF_ROLE_OPTIONS = [
  { id: 1, label: 'Admin' },
  { id: 4, label: 'Cashier' },
  { id: 5, label: 'Dispatcher' },
]

function StaffManagementSection({ allUsers, loading, onToggleActive, onRefresh }: {
  allUsers: UserRow[]; loading: boolean
  onToggleActive: (u: UserRow) => void; onRefresh: () => void
}) {
  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [editTarget, setEditTarget] = useState<UserRow | null>(null)
  const [formErr, setFormErr] = useState('')
  const [saving, setSaving] = useState(false)

  // Create form state
  const [cFirst, setCFirst] = useState(''); const [cLast, setCLast] = useState('')
  const [cPhone, setCPhone] = useState(''); const [cEmail, setCEmail] = useState('')
  const [cRole, setCRole]   = useState<number>(4)
  const [cPass, setCPass]   = useState(''); const [showCPass, setShowCPass] = useState(false)

  // Edit form state
  const [eFirst, setEFirst] = useState(''); const [eLast, setELast] = useState('')
  const [eEmail, setEEmail] = useState(''); const [eRole, setERole] = useState<number>(4)
  const [ePass, setEPass]   = useState(''); const [showEPass, setShowEPass] = useState(false)

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
    if (!cFirst.trim() || !cPhone.trim() || !cPass) { setFormErr('First name, phone and password are required'); return }
    if (cPass.length < 6) { setFormErr('Password must be at least 6 characters'); return }
    setFormErr(''); setSaving(true)
    try {
      await apiClient.post('/admin/staff', { first_name: cFirst.trim(), last_name: cLast.trim(), phone_number: cPhone.trim(), email: cEmail.trim() || undefined, role_id: cRole, password: cPass })
      setCFirst(''); setCLast(''); setCPhone(''); setCEmail(''); setCPass(''); setCRole(4)
      setShowCreate(false); onRefresh()
    } catch (err: any) { setFormErr(err.response?.data?.message ?? 'Failed to create staff member') }
    finally { setSaving(false) }
  }

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editTarget) return
    if (!eFirst.trim()) { setFormErr('First name is required'); return }
    setFormErr(''); setSaving(true)
    try {
      await apiClient.put(`/admin/users/${editTarget.id}`, { first_name: eFirst.trim(), last_name: eLast.trim(), email: eEmail.trim() || null, role_id: eRole, new_password: ePass || undefined })
      setEditTarget(null); onRefresh()
    } catch (err: any) { setFormErr(err.response?.data?.message ?? 'Failed to update staff member') }
    finally { setSaving(false) }
  }

  const inputStyle: React.CSSProperties = { width: '100%', padding: '0.6rem 0.8rem', borderRadius: 10, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)', color: 'var(--clr-text)', fontFamily: 'inherit', fontSize: '0.85rem', boxSizing: 'border-box' }
  const labelStyle: React.CSSProperties = { fontSize: '0.75rem', fontWeight: 600, color: 'var(--clr-muted)', marginBottom: '0.35rem', display: 'block' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--clr-text)', flex: 1 }}>Staff Users</h2>
        <button onClick={onRefresh} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.3rem 0.7rem', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: 'var(--clr-muted)', fontFamily: 'inherit', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer' }}>
          <LuRefreshCw size={12}/> Refresh
        </button>
        <button onClick={() => { setFormErr(''); setShowCreate(true) }} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.42rem 0.9rem', borderRadius: 9, border: 'none', background: 'var(--clr-accent)', color: '#000', fontFamily: 'inherit', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer' }}>
          <LuUserPlus size={14}/> Add Staff
        </button>
      </div>
      <div className="input-wrap">
        <input id="sf-search" type="text" placeholder=" " value={search} onChange={e => setSearch(e.target.value)} />
        <label htmlFor="sf-search"><LuSearch size={12} style={{ verticalAlign: 'middle', marginRight: '0.3rem' }}/>Search name / phone / email</label>
      </div>
      {loading ? <LoadingSpinner /> : (
        <div className="glass-inner" style={{ overflow: 'hidden' }}>
          {filtered.length === 0 ? (
            <p style={{ padding: '2rem', textAlign: 'center', color: 'var(--clr-muted)', fontSize: '0.875rem' }}>No staff found</p>
          ) : filtered.map((u, i) => (
            <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.85rem 1rem', borderBottom: i < filtered.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none', flexWrap: 'wrap' }}>
              <UserAvatar u={u} size={40} />
              <div style={{ flex: 1, minWidth: 110 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--clr-text)' }}>{u.first_name} {u.last_name}</span>
                  <RoleBadge roleId={u.role_id} roleName={u.role_name} />
                  {!u.is_active && <span className="badge badge-red" style={{ fontSize: '0.67rem' }}>Suspended</span>}
                </div>
                <p style={{ fontSize: '0.75rem', color: 'var(--clr-muted)', marginTop: '0.15rem' }}>{u.phone_number}</p>
                {u.email && <p style={{ fontSize: '0.7rem', color: 'var(--clr-muted)' }}>{u.email}</p>}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}>
                <button onClick={() => openEdit(u)} style={{ padding: '0.28rem 0.55rem', borderRadius: 7, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)', color: 'var(--clr-muted)', fontFamily: 'inherit', fontSize: '0.7rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <LuPencil size={11}/> Edit
                </button>
                <button onClick={() => onToggleActive(u)} style={{ padding: '0.28rem 0.65rem', borderRadius: 7, border: '1px solid', borderColor: u.is_active ? 'rgba(239,68,68,0.35)' : 'rgba(74,222,128,0.35)', background: u.is_active ? 'rgba(239,68,68,0.08)' : 'rgba(74,222,128,0.08)', color: u.is_active ? '#fca5a5' : '#4ade80', fontFamily: 'inherit', fontSize: '0.7rem', fontWeight: 600, cursor: 'pointer' }}>
                  {u.is_active ? 'Suspend' : 'Activate'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <p style={{ fontSize: '0.73rem', color: 'var(--clr-muted)', textAlign: 'right' }}>{filtered.length} staff members</p>

      {/* Create staff modal */}
      {showCreate && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }} onClick={() => setShowCreate(false)}>
          <div className="glass" style={{ borderRadius: 18, padding: '1.5rem', maxWidth: 440, width: '100%', position: 'relative', boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }} onClick={e => e.stopPropagation()}>
            <button onClick={() => setShowCreate(false)} style={{ position: 'absolute', top: '0.85rem', right: '0.85rem', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--clr-muted)' }}><LuX size={18}/></button>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1.25rem' }}>
              <LuUserPlus size={20} color="var(--clr-accent)"/>
              <h3 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--clr-text)' }}>Add New Staff Member</h3>
            </div>
            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem' }}>
                <div>
                  <label style={labelStyle}>First Name *</label>
                  <input style={inputStyle} placeholder="First name" value={cFirst} onChange={e => setCFirst(e.target.value)} required />
                </div>
                <div>
                  <label style={labelStyle}>Last Name</label>
                  <input style={inputStyle} placeholder="Last name" value={cLast} onChange={e => setCLast(e.target.value)} />
                </div>
              </div>
              <div>
                <label style={labelStyle}>Phone Number *</label>
                <input style={inputStyle} placeholder="+2519..." value={cPhone} onChange={e => setCPhone(e.target.value)} required />
              </div>
              <div>
                <label style={labelStyle}>Email (optional)</label>
                <input style={inputStyle} type="email" placeholder="email@example.com" value={cEmail} onChange={e => setCEmail(e.target.value)} />
              </div>
              <div>
                <label style={labelStyle}>Role *</label>
                <CustomSelect value={cRole} onChange={setCRole} options={STAFF_ROLE_OPTIONS} />
              </div>
              <div>
                <label style={labelStyle}>Password *</label>
                <div style={{ position: 'relative' }}>
                  <input style={{ ...inputStyle, paddingRight: '2.5rem' }} type={showCPass ? 'text' : 'password'} placeholder="Min 6 characters" value={cPass} onChange={e => setCPass(e.target.value)} required />
                  <button type="button" onClick={() => setShowCPass(v => !v)} style={{ position: 'absolute', right: '0.65rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--clr-muted)', padding: 0 }}>
                    {showCPass ? <LuEyeOff size={15}/> : <LuEye size={15}/>}
                  </button>
                </div>
              </div>
              {formErr && <p style={{ color: '#fca5a5', fontSize: '0.8rem', margin: 0 }}>{formErr}</p>}
              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.25rem' }}>
                <button type="button" onClick={() => setShowCreate(false)} style={{ flex: 1, padding: '0.6rem', borderRadius: 10, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)', color: 'var(--clr-muted)', fontFamily: 'inherit', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                <button type="submit" disabled={saving} style={{ flex: 2, padding: '0.6rem', borderRadius: 10, border: 'none', background: 'var(--clr-accent)', color: '#000', fontFamily: 'inherit', fontSize: '0.85rem', fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1 }}>
                  {saving ? 'Creating…' : 'Create Staff Member'}
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
            <button onClick={() => setEditTarget(null)} style={{ position: 'absolute', top: '0.85rem', right: '0.85rem', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--clr-muted)' }}><LuX size={18}/></button>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1.25rem' }}>
              <LuPencil size={18} color="var(--clr-accent)"/>
              <h3 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--clr-text)' }}>Edit {editTarget.first_name} {editTarget.last_name}</h3>
            </div>
            <form onSubmit={handleEdit} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem' }}>
                <div>
                  <label style={labelStyle}>First Name *</label>
                  <input style={inputStyle} placeholder="First name" value={eFirst} onChange={e => setEFirst(e.target.value)} required />
                </div>
                <div>
                  <label style={labelStyle}>Last Name</label>
                  <input style={inputStyle} placeholder="Last name" value={eLast} onChange={e => setELast(e.target.value)} />
                </div>
              </div>
              <div>
                <label style={labelStyle}>Email</label>
                <input style={inputStyle} type="email" placeholder="email@example.com" value={eEmail} onChange={e => setEEmail(e.target.value)} />
              </div>
              <div>
                <label style={labelStyle}>Role</label>
                <CustomSelect value={eRole} onChange={setERole} options={STAFF_ROLE_OPTIONS} />
              </div>
              <div>
                <label style={labelStyle}>New Password (leave blank to keep current)</label>
                <div style={{ position: 'relative' }}>
                  <input style={{ ...inputStyle, paddingRight: '2.5rem' }} type={showEPass ? 'text' : 'password'} placeholder="Leave blank to keep current" value={ePass} onChange={e => setEPass(e.target.value)} />
                  <button type="button" onClick={() => setShowEPass(v => !v)} style={{ position: 'absolute', right: '0.65rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--clr-muted)', padding: 0 }}>
                    {showEPass ? <LuEyeOff size={15}/> : <LuEye size={15}/>}
                  </button>
                </div>
              </div>
              {formErr && <p style={{ color: '#fca5a5', fontSize: '0.8rem', margin: 0 }}>{formErr}</p>}
              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.25rem' }}>
                <button type="button" onClick={() => setEditTarget(null)} style={{ flex: 1, padding: '0.6rem', borderRadius: 10, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)', color: 'var(--clr-muted)', fontFamily: 'inherit', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                <button type="submit" disabled={saving} style={{ flex: 2, padding: '0.6rem', borderRadius: 10, border: 'none', background: 'var(--clr-accent)', color: '#000', fontFamily: 'inherit', fontSize: '0.85rem', fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1 }}>
                  {saving ? 'Saving…' : 'Save Changes'}
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

function ProfileSection() {
  const { user, updateUser, refreshUser } = useAuth()
  const [activeTab, setActiveTab] = useState<ProfileTab>('profile')

  const roleLabel = user?.role_id === 1 ? 'Admin' : user?.role_id === 2 ? 'Shipper' : user?.role_id === 3 ? 'Driver' : user?.role_name ?? 'User'
  const roleIcon  = user?.role_id === 1 ? <LuShield size={28}/> : user?.role_id === 2 ? <LuPackage size={28}/> : user?.role_id === 3 ? <LuTruck size={28}/> : <LuUser size={28}/>

  // Photo
  const photoInput = useRef<HTMLInputElement>(null)
  const [photoLoading, setPhotoLoading] = useState(false)
  const [photoError,   setPhotoError]   = useState('')
  const handlePhotoChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return
    if (file.size > 5 * 1024 * 1024) { setPhotoError('Max 5 MB'); return }
    setPhotoError(''); setPhotoLoading(true)
    const reader = new FileReader()
    reader.onload = async () => {
      try {
        await authApi.updateProfile({ profile_photo_base64: reader.result as string, profile_photo_filename: file.name })
        await refreshUser()
      } catch (err: any) { setPhotoError(err.response?.data?.message || 'Upload failed.') }
      finally { setPhotoLoading(false); if (photoInput.current) photoInput.current.value = '' }
    }
    reader.readAsDataURL(file)
  }
  const handleDeletePhoto = async () => {
    setPhotoError(''); setPhotoLoading(true)
    try { await authApi.deleteProfilePhoto(); updateUser({ profile_photo_url: null }) }
    catch (err: any) { setPhotoError(err.response?.data?.message || 'Failed.') }
    finally { setPhotoLoading(false) }
  }

  // Name
  const [editFirst, setEditFirst] = useState(user?.first_name ?? '')
  const [editLast,  setEditLast]  = useState(user?.last_name ?? '')
  const [nameLoading, setNameLoading] = useState(false)
  const [nameError,   setNameError]   = useState('')
  const [nameSuccess, setNameSuccess] = useState(false)
  const handleSaveName = async (e: FormEvent) => {
    e.preventDefault()
    if (!editFirst.trim()) { setNameError('First name required'); return }
    setNameError(''); setNameLoading(true)
    try {
      await authApi.updateProfile({ first_name: editFirst.trim(), last_name: editLast.trim() })
      updateUser({ first_name: editFirst.trim(), last_name: editLast.trim() })
      setNameSuccess(true); setTimeout(() => setNameSuccess(false), 3000)
    } catch (err: any) { setNameError(err.response?.data?.message || 'Failed.') }
    finally { setNameLoading(false) }
  }

  // Password
  const [showPwForm, setShowPwForm] = useState(false)
  const [currentPw, setCurrentPw] = useState(''); const [newPw, setNewPw] = useState(''); const [confirmPw, setConfirmPw] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [pwLoading, setPwLoading] = useState(false); const [pwError, setPwError] = useState(''); const [pwSuccess, setPwSuccess] = useState(false)
  const handleChangePassword = async (e: FormEvent) => {
    e.preventDefault()
    if (newPw !== confirmPw) { setPwError("Don't match"); return }
    if (newPw.length < 6) { setPwError('Min 6 chars'); return }
    setPwError(''); setPwLoading(true)
    try { await authApi.changePassword(currentPw, newPw); setPwSuccess(true); setCurrentPw(''); setNewPw(''); setConfirmPw(''); setTimeout(() => { setPwSuccess(false); setShowPwForm(false) }, 2500) }
    catch (err: any) { setPwError(err.response?.data?.message || 'Failed.') }
    finally { setPwLoading(false) }
  }

  // Email
  const [showEmailForm, setShowEmailForm] = useState(false)
  const [emailInput, setEmailInput] = useState('')
  const [emailLoading, setEmailLoading] = useState(false); const [emailError, setEmailError] = useState(''); const [emailSent, setEmailSent] = useState(false)
  const handleLinkEmail = async (e: FormEvent) => {
    e.preventDefault(); setEmailError(''); setEmailLoading(true)
    try { await authApi.requestEmailLink(emailInput); setEmailSent(true) }
    catch (err: any) { setEmailError(err.response?.data?.message || 'Failed.') }
    finally { setEmailLoading(false) }
  }

  // Phone change
  const [showPhoneForm, setShowPhoneForm] = useState(false)
  const [phoneStep, setPhoneStep] = useState<'input' | 'otp'>('input')
  const [newPhone, setNewPhone] = useState(''); const [phoneOtp, setPhoneOtp] = useState('')
  const [phoneLoading, setPhoneLoading] = useState(false); const [phoneError, setPhoneError] = useState(''); const [phoneSuccess, setPhoneSuccess] = useState(false)
  const handleRequestPhoneOtp = async (e: FormEvent) => {
    e.preventDefault()
    const n = normalisePhone(newPhone ?? ''); if (!n) { setPhoneError('Invalid phone'); return }
    setPhoneError(''); setPhoneLoading(true)
    try { await authApi.requestPhoneChange(n); setPhoneStep('otp') }
    catch (err: any) { setPhoneError(err.response?.data?.message || 'Failed.') }
    finally { setPhoneLoading(false) }
  }
  const handleVerifyPhoneOtp = async (e: FormEvent) => {
    e.preventDefault()
    const n = normalisePhone(newPhone ?? ''); setPhoneError(''); setPhoneLoading(true)
    try { await authApi.verifyPhoneChange(n, phoneOtp); updateUser({ phone_number: n }); setPhoneSuccess(true); setTimeout(() => { setPhoneSuccess(false); setShowPhoneForm(false); setPhoneStep('input'); setNewPhone(''); setPhoneOtp('') }, 2500) }
    catch (err: any) { setPhoneError(err.response?.data?.message || 'Invalid OTP.') }
    finally { setPhoneLoading(false) }
  }

  // Delete account
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState('')
  const [deleteLoading, setDeleteLoading] = useState(false); const [deleteError, setDeleteError] = useState('')
  const handleDeleteAccount = async () => {
    if (deleteConfirm !== 'DELETE') { setDeleteError('Type DELETE'); return }
    setDeleteError(''); setDeleteLoading(true)
    try { throw new Error('Account deletion not yet enabled.') }
    catch (err: any) { setDeleteError(err.message || 'Failed.'); setDeleteLoading(false) }
  }

  const photoUrl = user?.profile_photo_url
  const tabs: { id: ProfileTab; icon: React.ReactNode; label: string }[] = [
    { id: 'profile', icon: <LuUser size={14}/>, label: 'Profile' },
    { id: 'security', icon: <LuLock size={14}/>, label: 'Security' },
    { id: 'contact', icon: <LuContact size={14}/>, label: 'Contact' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Header card */}
      <div className="glass" style={{ padding: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <div style={{ width: 72, height: 72, borderRadius: '50%', background: photoUrl ? 'transparent' : 'linear-gradient(135deg,var(--clr-accent2),var(--clr-accent))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.9rem', overflow: 'hidden', border: '2.5px solid rgba(0,229,255,0.3)', boxShadow: '0 0 20px rgba(0,229,255,0.2)' }}>
              {photoUrl ? <img src={photoUrl} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : roleIcon}
            </div>
            <button title="Change photo" onClick={() => photoInput.current?.click()} disabled={photoLoading} style={{ position: 'absolute', bottom: 0, right: 0, width: 24, height: 24, borderRadius: '50%', background: 'var(--clr-accent)', border: '2px solid rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: '0.68rem' }}>
              {photoLoading ? '…' : <LuCamera size={12}/>}
            </button>
            <input ref={photoInput} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }} onChange={handlePhotoChange} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <h1 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--clr-text)' }}>{user?.first_name} {user?.last_name}</h1>
              <span className="badge badge-cyan">{roleLabel}</span>
            </div>
            <p style={{ color: 'var(--clr-muted)', fontSize: '0.82rem', marginTop: '0.15rem' }}>{user?.phone_number}</p>
            {user?.email && <p style={{ color: 'var(--clr-muted)', fontSize: '0.76rem', marginTop: '0.1rem' }}>{user.email} {user.is_email_verified ? <span style={{ color: '#4ade80', fontSize: '0.7rem', display:'inline-flex', alignItems:'center', gap:'0.2rem' }}><LuCircleCheck size={11}/></span> : <span style={{ color: '#fbbf24', fontSize: '0.7rem' }}>(pending)</span>}</p>}
            {photoError && <p style={{ color: '#fca5a5', fontSize: '0.75rem', marginTop: '0.25rem' }}>{photoError}</p>}
            {photoUrl && <button className="btn-outline" style={{ marginTop: '0.4rem', fontSize: '0.71rem', padding: '0.25rem 0.65rem', display:'flex', alignItems:'center', gap:'0.3rem' }} onClick={handleDeletePhoto} disabled={photoLoading}><LuTrash2 size={11}/> Remove photo</button>}
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: '0.4rem', background: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: '0.3rem' }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} style={{ flex: 1, padding: '0.5rem', border: 'none', borderRadius: 9, background: activeTab === t.id ? 'rgba(0,229,255,0.12)' : 'transparent', color: activeTab === t.id ? 'var(--clr-accent)' : 'var(--clr-muted)', fontFamily: 'inherit', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', transition: 'all 0.18s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem', outline: activeTab === t.id ? '1px solid rgba(0,229,255,0.2)' : 'none' }}>
            <span>{t.icon}</span>{t.label}
          </button>
        ))}
      </div>

      {/* Profile tab */}
      {activeTab === 'profile' && (
        <div className="glass step-enter" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
          <h2 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--clr-text)', display:'flex', alignItems:'center', gap:'0.4rem' }}><LuUser size={15}/> Profile Information</h2>
          <div className="glass-inner" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            <InfoRow icon={<LuIdCard size={14}/>}      label="User ID" value={user?.id ? user.id.slice(0, 8) + '…' : '—'} />
            <InfoRow icon={<LuPhone size={14}/>}       label="Phone"   value={user?.phone_number ?? '—'} />
            <InfoRow icon={<LuMail size={14}/>}        label="Email"   value={user?.email || '— not linked'} />
            <InfoRow icon={<LuShield size={14}/>}      label="Role"    value={roleLabel} />
            <InfoRow icon={<LuCircleCheck size={14}/>} label="Status"  value={user?.is_active ? 'Active' : 'Suspended'} />
          </div>
          <Divider />
          <form onSubmit={handleSaveName} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <p style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--clr-text)' }}>Display Name</p>
            {nameError   && <div className="alert alert-error"><LuTriangleAlert size={13}/> {nameError}</div>}
            {nameSuccess && <div className="alert alert-success" style={{display:'flex',alignItems:'center',gap:'0.35rem'}}><LuCheck size={13}/> Name saved!</div>}
            <div style={{ display: 'flex', gap: '0.6rem' }}>
              <div className="input-wrap" style={{ flex: 1 }}><input id="ef2" type="text" placeholder=" " value={editFirst} onChange={e => setEditFirst(e.target.value)} required /><label htmlFor="ef2">First name</label></div>
              <div className="input-wrap" style={{ flex: 1 }}><input id="el2" type="text" placeholder=" " value={editLast}  onChange={e => setEditLast(e.target.value)} /><label htmlFor="el2">Last name</label></div>
            </div>
            <button type="submit" className="btn-primary" disabled={nameLoading}>{nameLoading ? <BtnSpinner text="Saving…" /> : 'Save Name'}</button>
          </form>
        </div>
      )}

      {/* Security tab */}
      {activeTab === 'security' && (
        <div className="glass step-enter" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
          <h2 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--clr-text)', display:'flex', alignItems:'center', gap:'0.4rem' }}><LuLock size={15}/> Security</h2>
          <SectionRow title="Password" sub="Update your login password" open={showPwForm} onToggle={() => { setShowPwForm(v => !v); setPwError(''); setPwSuccess(false) }} toggleLabel={showPwForm ? 'Cancel' : 'Change'}>
            <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }} className="step-enter">
              {pwError   && <div className="alert alert-error"><LuTriangleAlert size={13}/> {pwError}</div>}
              {pwSuccess && <div className="alert alert-success" style={{display:'flex',alignItems:'center',gap:'0.35rem'}}><LuCheck size={13}/> Password updated!</div>}
              <PasswordInput id="adm-cpw-cur" label="Current password"          value={currentPw} onChange={setCurrentPw} show={showPw} onToggle={() => setShowPw(v => !v)} />
              <PasswordInput id="adm-cpw-new" label="New password (min 6 chars)" value={newPw}     onChange={setNewPw}     show={showPw} onToggle={() => setShowPw(v => !v)} />
              <PasswordInput id="adm-cpw-cfg" label="Confirm new password"      value={confirmPw} onChange={setConfirmPw} show={showPw} onToggle={() => setShowPw(v => !v)} hasError={!!(confirmPw && confirmPw !== newPw)} />
              <button type="submit" className="btn-primary" disabled={pwLoading}>{pwLoading ? <BtnSpinner text="Saving…" /> : 'Update Password'}</button>
            </form>
          </SectionRow>
          <Divider />
          <div className="danger-card">
            <h3 style={{ fontSize: '0.875rem', fontWeight: 700, color: '#fca5a5', marginBottom: '0.4rem', display:'flex', alignItems:'center', gap:'0.35rem' }}><LuTriangleAlert size={14}/> Danger Zone</h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--clr-muted)', marginBottom: '0.85rem' }}>Permanently delete your account and all data.</p>
            <button onClick={() => { setShowDeleteModal(true); setDeleteConfirm(''); setDeleteError('') }} style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5', fontFamily: 'inherit', fontSize: '0.85rem', fontWeight: 600, padding: '0.55rem 1rem', borderRadius: 10, cursor: 'pointer' }}>Delete My Account</button>
          </div>
        </div>
      )}

      {/* Contact tab */}
      {activeTab === 'contact' && (
        <div className="glass step-enter" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
          <h2 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--clr-text)', display:'flex', alignItems:'center', gap:'0.4rem' }}><LuSmartphone size={15}/> Contact Details</h2>
          <SectionRow title="Email Address" sub={user?.email ? `${user.email}${user.is_email_verified ? ' ✔' : ' (unverified)'}` : 'Link an email for recovery'} open={showEmailForm} onToggle={() => { setShowEmailForm(v => !v); setEmailError(''); setEmailSent(false) }} toggleLabel={showEmailForm ? 'Cancel' : user?.email ? 'Change' : 'Link'}>
            {emailSent ? (
              <div className="alert alert-success step-enter" style={{display:'flex',alignItems:'center',gap:'0.35rem'}}><LuCheck size={13}/> Verification link sent to <strong>{emailInput}</strong>.</div>
            ) : (
              <form onSubmit={handleLinkEmail} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }} className="step-enter">
                {emailError && <div className="alert alert-error"><LuTriangleAlert size={13}/> {emailError}</div>}
                <div className="input-wrap"><input id="adm-em" type="email" placeholder=" " value={emailInput} onChange={e => setEmailInput(e.target.value)} required /><label htmlFor="adm-em">Email address</label></div>
                <button type="submit" className="btn-primary" disabled={emailLoading}>{emailLoading ? <BtnSpinner text="Sending…" /> : 'Send Verification Link'}</button>
              </form>
            )}
          </SectionRow>
          <Divider />
          <SectionRow title="Phone Number" sub={user?.phone_number ?? ''} open={showPhoneForm} onToggle={() => { setShowPhoneForm(v => !v); setPhoneError(''); setPhoneSuccess(false); setPhoneStep('input'); setPhoneOtp(''); setNewPhone('') }} toggleLabel={showPhoneForm ? 'Cancel' : 'Change'}>
            {phoneSuccess ? (
              <div className="alert alert-success step-enter" style={{display:'flex',alignItems:'center',gap:'0.35rem'}}><LuCheck size={13}/> Phone updated!</div>
            ) : phoneStep === 'input' ? (
              <form onSubmit={handleRequestPhoneOtp} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }} className="step-enter">
                {phoneError && <div className="alert alert-error"><LuTriangleAlert size={13}/> {phoneError}</div>}
                <PhoneField value={newPhone} onChange={setNewPhone} id="adm-new-phone" />
                <button type="submit" className="btn-primary" disabled={phoneLoading}>{phoneLoading ? <BtnSpinner text="Sending OTP…" /> : 'Send OTP'}</button>
              </form>
            ) : (
              <form onSubmit={handleVerifyPhoneOtp} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }} className="step-enter">
                {phoneError && <div className="alert alert-error"><LuTriangleAlert size={13}/> {phoneError}</div>}
                <div className="input-wrap"><input id="adm-ph-otp" type="text" inputMode="numeric" placeholder=" " maxLength={6} value={phoneOtp} onChange={e => setPhoneOtp(e.target.value.replace(/\D/g, ''))} required /><label htmlFor="adm-ph-otp">6-digit OTP</label></div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button type="button" className="btn-outline" style={{ flex: 1, display:'flex', alignItems:'center', gap:'0.3rem', justifyContent:'center' }} onClick={() => setPhoneStep('input')} disabled={phoneLoading}><LuArrowLeft size={13}/> Back</button>
                  <button type="submit" className="btn-primary" style={{ flex: 2 }} disabled={phoneLoading || phoneOtp.length < 6}>{phoneLoading ? <BtnSpinner text="Verifying…" /> : 'Verify & Update'}</button>
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
            <p style={{ color: 'var(--clr-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>Type <strong style={{ color: 'var(--clr-text)' }}>DELETE</strong> to confirm.</p>
            {deleteError && <div className="alert alert-error" style={{ marginBottom: '0.75rem' }}><LuTriangleAlert size={13}/> {deleteError}</div>}
            <div className="input-wrap" style={{ marginBottom: '0.75rem' }}><input id="adm-del" type="text" placeholder=" " value={deleteConfirm} onChange={e => setDeleteConfirm(e.target.value)} autoComplete="off" /><label htmlFor="adm-del">Type DELETE</label></div>
            <div style={{ display: 'flex', gap: '0.6rem' }}>
              <button className="btn-outline" style={{ flex: 1 }} onClick={() => setShowDeleteModal(false)}>Cancel</button>
              <button disabled={deleteLoading || deleteConfirm !== 'DELETE'} onClick={handleDeleteAccount} style={{ flex: 1, padding: '0.7rem', borderRadius: 10, border: 'none', background: deleteConfirm === 'DELETE' ? '#ef4444' : 'rgba(239,68,68,0.25)', color: '#fff', fontFamily: 'inherit', fontSize: '0.85rem', fontWeight: 700, cursor: deleteConfirm === 'DELETE' ? 'pointer' : 'not-allowed' }}>{deleteLoading ? <BtnSpinner text="Deleting…" /> : 'Delete Forever'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Driver Verification section ─────────────────────────────────────────────

function DriverVerificationSection() {
  const [filter, setFilter] = useState<'all' | 'pending' | 'verified' | 'rejected'>('pending')
  const [drivers, setDrivers] = useState<DriverRow[]>([])
  const [loading, setLoading] = useState(false)
  const [toastMsg, setToastMsg] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [driverReviews, setDriverReviews] = useState<Record<string, DocReview[]>>({})

  // Reject modal state
  const [rejectModal, setRejectModal] = useState<{ type: 'driver' | 'doc'; driverId: string; docType?: string } | null>(null)
  const [rejectReason, setRejectReason] = useState('')

  const toast = (msg: string) => { setToastMsg(msg); setTimeout(() => setToastMsg(''), 3000) }

  const load = async () => {
    setLoading(true)
    try {
      const { data } = await apiClient.get(`/admin/drivers?filter=${filter}`)
      setDrivers(data.drivers ?? [])
    } catch { toast('Failed to load drivers') }
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
    if (next) loadDriverDetail(next)
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
    } catch (e: any) { toast(e.response?.data?.message ?? 'Action failed') }
    finally { setActionLoading(null); setRejectModal(null); setRejectReason('') }
  }

  const verifyDriver = async (driverId: string) => {
    setActionLoading(`verify-${driverId}`)
    try {
      await apiClient.post(`/admin/drivers/${driverId}/verify`)
      toast('Driver fully verified!')
      await load()
    } catch (e: any) { toast(e.response?.data?.message ?? 'Action failed') }
    finally { setActionLoading(null) }
  }

  const rejectDriverFull = async (driverId: string, reason: string) => {
    if (!reason.trim()) return
    setActionLoading(`reject-${driverId}`)
    try {
      await apiClient.post(`/admin/drivers/${driverId}/reject`, { reason })
      toast('Driver rejected.')
      setDriverReviews(prev => { const next = { ...prev }; delete next[driverId]; return next })
      await load()
    } catch (e: any) { toast(e.response?.data?.message ?? 'Action failed') }
    finally { setActionLoading(null); setRejectModal(null); setRejectReason('') }
  }

  const statusColor = (s: string | null) =>
    s === 'APPROVED' ? '#4ade80' : s === 'REJECTED' ? '#fca5a5' : s === 'PENDING' ? '#fbbf24' : 'var(--clr-muted)'

  const StatusBadge = ({ s, label }: { s: string | null; label?: string }) => (
    <span style={{ fontSize:'0.68rem', fontWeight:700, color: statusColor(s), background:`${statusColor(s)}18`, border:`1px solid ${statusColor(s)}44`, borderRadius:99, padding:'0.15rem 0.5rem', whiteSpace:'nowrap' }}>
      {label ? `${label}: ` : ''}{s ?? 'N/A'}
    </span>
  )

  const filters: { id: typeof filter; label: string }[] = [
    { id: 'pending',  label: 'Pending'  },
    { id: 'verified', label: 'Verified' },
    { id: 'rejected', label: 'Rejected' },
    { id: 'all',      label: 'All'      },
  ]

  const _apiBase = (import.meta.env.VITE_API_BASE_URL as string ?? '').replace(/\/api$/, '')
  const absUrl = (raw: string | null) => raw ? (raw.startsWith('http') ? raw : `${_apiBase}${raw}`) : null

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'1rem' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:'0.5rem' }}>
        <h2 style={{ fontSize:'1rem', fontWeight:800, color:'var(--clr-text)', display:'flex', alignItems:'center', gap:'0.45rem' }}><LuShieldCheck size={17}/> Driver Verification</h2>
        <button className="btn-outline" style={{ fontSize:'0.75rem', padding:'0.35rem 0.7rem', display:'flex', alignItems:'center', gap:'0.35rem' }} onClick={load} disabled={loading}><LuRefreshCw size={13}/> Refresh</button>
      </div>

      {/* Filter tabs */}
      <div style={{ display:'flex', gap:'0.4rem', background:'rgba(255,255,255,0.04)', borderRadius:12, padding:'0.3rem' }}>
        {filters.map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)} style={{ flex:1, padding:'0.45rem', border:'none', borderRadius:9, background: filter===f.id ? 'rgba(0,229,255,0.12)' : 'transparent', color: filter===f.id ? 'var(--clr-accent)' : 'var(--clr-muted)', fontFamily:'inherit', fontSize:'0.78rem', fontWeight:600, cursor:'pointer', transition:'all 0.18s', outline: filter===f.id ? '1px solid rgba(0,229,255,0.2)' : 'none' }}>
            {f.label}
          </button>
        ))}
      </div>

      {loading ? <LoadingSpinner /> : drivers.length === 0 ? (
        <div className="glass-inner" style={{ padding:'2.5rem', textAlign:'center', color:'var(--clr-muted)', fontSize:'0.875rem' }}>No drivers in this filter</div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:'0.65rem' }}>
          {drivers.map(d => {
            const isExpanded = expandedId === d.user_id
            const fullName = `${d.first_name} ${d.last_name}`
            const reviews = driverReviews[d.user_id] ?? []
            return (
              <div key={d.user_id} className="glass-inner" style={{ overflow:'hidden' }}>
                {/* Card header */}
                <div style={{ display:'flex', alignItems:'center', gap:'0.75rem', padding:'0.85rem 1rem', cursor:'pointer' }} onClick={() => handleExpand(d.user_id)}>
                  <div style={{ width:38, height:38, borderRadius:'50%', flexShrink:0, background:'linear-gradient(135deg,var(--clr-accent2),var(--clr-accent))', display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden', border:'2px solid rgba(0,229,255,0.2)' }}>
                    {d.profile_photo_url ? <img src={absUrl(d.profile_photo_url)!} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }}/> : <LuTruck size={16} color="#fff"/>}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:'0.4rem', flexWrap:'wrap' }}>
                      <span style={{ fontWeight:700, fontSize:'0.875rem', color:'var(--clr-text)' }}>{fullName}</span>
                      {d.is_verified === 1 && <span style={{ color:'#4ade80', display:'flex', alignItems:'center', gap:'0.2rem', fontSize:'0.72rem', fontWeight:700 }}><LuBadgeCheck size={12}/> Verified</span>}
                    </div>
                    <p style={{ fontSize:'0.73rem', color:'var(--clr-muted)' }}>{d.phone_number}</p>
                    <div style={{ display:'flex', gap:'0.35rem', flexWrap:'wrap', marginTop:'0.3rem' }}>
                      <StatusBadge s={d.national_id_status} label="ID" />
                      <StatusBadge s={d.license_status}    label="License" />
                      <StatusBadge s={d.libre_status}      label="Libre" />
                    </div>
                  </div>
                  <span style={{ color:'var(--clr-muted)', fontSize:'0.75rem', flexShrink:0, marginLeft:'0.5rem' }}>{isExpanded ? '▲' : '▼'}</span>
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div style={{ borderTop:'1px solid rgba(255,255,255,0.06)', padding:'1rem', display:'flex', flexDirection:'column', gap:'1rem' }}>

                    {/* Overall rejection reason */}
                    {d.rejection_reason && (
                      <div className="alert alert-error" style={{ fontSize:'0.8rem', display:'flex', alignItems:'flex-start', gap:'0.4rem' }}>
                        <LuTriangleAlert size={13} style={{ flexShrink:0, marginTop:2 }}/> 
                        <span><strong>Overall rejection:</strong> {d.rejection_reason}</span>
                      </div>
                    )}

                    {/* Per-document review */}
                    {(['national_id','license','libre'] as const).map(docKey => {
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
                        <div key={docKey} style={{ display:'flex', flexDirection:'column', gap:'0.5rem', padding:'0.75rem', background:'rgba(255,255,255,0.03)', borderRadius:10 }}>
                          <div style={{ display:'flex', alignItems:'flex-start', gap:'0.75rem' }}>
                            <div style={{ flex:1 }}>
                              <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', marginBottom:'0.3rem', flexWrap:'wrap' }}>
                                <span style={{ fontWeight:600, fontSize:'0.82rem', color:'var(--clr-text)', textTransform:'capitalize' }}>{docKey.replace('_',' ')}</span>
                                <StatusBadge s={status} />
                              </div>
                              {url ? (
                                <a href={url} target="_blank" rel="noopener noreferrer" style={{ fontSize:'0.75rem', color:'var(--clr-accent)', display:'flex', alignItems:'center', gap:'0.25rem', textDecoration:'none' }}>
                                  <LuFileText size={12}/> View document ↗
                                </a>
                              ) : (
                                <span style={{ fontSize:'0.73rem', color:'var(--clr-muted)' }}>No document uploaded</span>
                              )}
                              {/* Latest rejection reason for this doc */}
                              {status === 'REJECTED' && latestRejection?.reason && (
                                <p style={{ marginTop:'0.35rem', fontSize:'0.75rem', color:'#fca5a5', display:'flex', alignItems:'flex-start', gap:'0.3rem' }}>
                                  <LuTriangleAlert size={11} style={{ flexShrink:0, marginTop:2 }}/> {latestRejection.reason}
                                </p>
                              )}
                            </div>
                            {url && (
                              <div style={{ display:'flex', gap:'0.4rem', flexShrink:0 }}>
                                <button onClick={() => reviewDoc(d.user_id, docKey, 'APPROVED')} disabled={!!actionLoading || status === 'APPROVED'}
                                  style={{ padding:'0.3rem 0.65rem', borderRadius:7, border:'1px solid rgba(74,222,128,0.35)', background:'rgba(74,222,128,0.08)', color:'#4ade80', fontFamily:'inherit', fontSize:'0.72rem', fontWeight:600, cursor: status === 'APPROVED' ? 'not-allowed' : 'pointer', opacity: status === 'APPROVED' ? 0.5 : 1 }}>
                                  {actionLoading === `${aKey}-APPROVED` ? '…' : '✓ Approve'}
                                </button>
                                <button onClick={() => { setRejectModal({ type:'doc', driverId: d.user_id, docType: docKey }); setRejectReason('') }} disabled={!!actionLoading || status === 'REJECTED'}
                                  style={{ padding:'0.3rem 0.65rem', borderRadius:7, border:'1px solid rgba(239,68,68,0.35)', background:'rgba(239,68,68,0.08)', color:'#fca5a5', fontFamily:'inherit', fontSize:'0.72rem', fontWeight:600, cursor: status === 'REJECTED' ? 'not-allowed' : 'pointer', opacity: status === 'REJECTED' ? 0.5 : 1 }}>
                                  ✕ Reject
                                </button>
                              </div>
                            )}
                          </div>

                          {/* Review history for this document */}
                          {docRejections.length > 0 && (
                            <details style={{ marginTop:'0.2rem' }}>
                              <summary style={{ fontSize:'0.72rem', color:'var(--clr-muted)', cursor:'pointer', userSelect:'none', listStyle:'none', display:'flex', alignItems:'center', gap:'0.3rem', outline:'none' }}>
                                <LuHistory size={11}/> {docRejections.length} rejection{docRejections.length > 1 ? 's' : ''} — view history
                              </summary>
                              <div style={{ marginTop:'0.5rem', display:'flex', flexDirection:'column', gap:'0.3rem' }}>
                                {docRejections.map(r => (
                                  <div key={r.id} style={{ background:'rgba(239,68,68,0.06)', border:'1px solid rgba(239,68,68,0.15)', borderRadius:7, padding:'0.4rem 0.6rem', fontSize:'0.73rem' }}>
                                    <div style={{ display:'flex', justifyContent:'space-between', gap:'0.5rem', flexWrap:'wrap', marginBottom:'0.2rem' }}>
                                      <span style={{ color:'#fca5a5', fontWeight:600 }}>Rejected</span>
                                      <span style={{ color:'var(--clr-muted)' }}>{new Date(r.reviewed_at).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})}</span>
                                    </div>
                                    {r.reason && <p style={{ color:'var(--clr-muted)' }}>{r.reason}</p>}
                                    {r.reviewer_name && <p style={{ color:'var(--clr-muted)', fontSize:'0.68rem', marginTop:'0.15rem' }}>by {r.reviewer_name}</p>}
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
                      <div style={{ display:'flex', gap:'0.5rem', borderTop:'1px solid rgba(255,255,255,0.06)', paddingTop:'0.85rem' }}>
                        <button onClick={() => verifyDriver(d.user_id)} disabled={!!actionLoading}
                          style={{ flex:1, padding:'0.55rem', borderRadius:10, border:'1px solid rgba(74,222,128,0.35)', background:'rgba(74,222,128,0.10)', color:'#4ade80', fontFamily:'inherit', fontSize:'0.82rem', fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:'0.4rem' }}>
                          {actionLoading === `verify-${d.user_id}` ? <><span className="spinner"/>…</> : <><LuShieldCheck size={14}/> Fully Verify</>}
                        </button>
                        <button onClick={() => { setRejectModal({ type:'driver', driverId: d.user_id }); setRejectReason('') }} disabled={!!actionLoading}
                          style={{ flex:1, padding:'0.55rem', borderRadius:10, border:'1px solid rgba(239,68,68,0.35)', background:'rgba(239,68,68,0.08)', color:'#fca5a5', fontFamily:'inherit', fontSize:'0.82rem', fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:'0.4rem' }}>
                          <LuX size={14}/> Reject Driver
                        </button>
                      </div>
                    )}
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
          <div className="glass modal-box" style={{ padding:'1.75rem' }}>
            <h2 style={{ fontSize:'1rem', fontWeight:800, color:'#fca5a5', marginBottom:'0.4rem' }}>
              {rejectModal.type === 'driver' ? 'Reject Driver' : `Reject ${rejectModal.docType?.replace('_',' ')}`}
            </h2>
            <p style={{ fontSize:'0.82rem', color:'var(--clr-muted)', marginBottom:'1rem' }}>Provide a reason (required). The driver will see this reason.</p>
            <div className="input-wrap" style={{ marginBottom:'0.75rem' }}>
              <input id="rej-reason" type="text" placeholder=" " value={rejectReason} onChange={e => setRejectReason(e.target.value)} autoFocus/>
              <label htmlFor="rej-reason">Reason for rejection</label>
            </div>
            <div style={{ display:'flex', gap:'0.6rem' }}>
              <button className="btn-outline" style={{ flex:1 }} onClick={() => { setRejectModal(null); setRejectReason('') }}>Cancel</button>
              <button disabled={!rejectReason.trim() || !!actionLoading}
                onClick={() => {
                  if (rejectModal.type === 'driver') rejectDriverFull(rejectModal.driverId, rejectReason)
                  else reviewDoc(rejectModal.driverId, rejectModal.docType!, 'REJECTED', rejectReason)
                }}
                style={{ flex:1, padding:'0.7rem', borderRadius:10, border:'none', background: rejectReason.trim() ? '#ef4444' : 'rgba(239,68,68,0.25)', color:'#fff', fontFamily:'inherit', fontSize:'0.85rem', fontWeight:700, cursor: rejectReason.trim() ? 'pointer' : 'not-allowed' }}>
                {actionLoading ? <><span className="spinner"/> …</> : 'Confirm Reject'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toastMsg && (
        <div style={{ position:'fixed', bottom:'1.25rem', right:'1.25rem', zIndex:200, background:'rgba(0,229,255,0.12)', border:'1px solid rgba(0,229,255,0.25)', color:'var(--clr-text)', padding:'0.65rem 1.1rem', borderRadius:12, fontSize:'0.85rem', fontWeight:600, backdropFilter:'blur(12px)' }}>
          {toastMsg}
        </div>
      )}
    </div>
  )
}

// ─── Vehicle Management section ───────────────────────────────────────────────

const VEHICLE_TYPES = ['Truck', 'Van', 'Pickup', 'Motorcycle', 'Cargo Bike', 'Mini Truck', 'Trailer', 'Other']

function VehicleManagementSection() {
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
  const [form, setForm] = useState({ plate_number:'', vehicle_type:'Truck', max_capacity_kg:'', is_company_owned: true, description:'', vehicle_photo: '' as string })
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
    } catch { toast('Failed to load vehicles') }
    finally { setLoading(false) }
  }

  const loadSubmissions = async () => {
    setSubsLoading(true)
    try {
      const { data } = await apiClient.get('/admin/vehicles/submissions')
      setSubmissions(data.vehicles ?? [])
    } catch { toast('Failed to load submissions') }
    finally { setSubsLoading(false) }
  }

  useEffect(() => { load() }, [showAll]) // eslint-disable-line
  useEffect(() => { if (vehicleTab === 'submissions') loadSubmissions() }, [vehicleTab]) // eslint-disable-line

  const resetForm = () => {
    setForm({ plate_number:'', vehicle_type:'Truck', max_capacity_kg:'', is_company_owned: true, description:'', vehicle_photo:'' })
    setVehicleGallery([])
    setFormLibre('')
    setFormError('')
  }

  const openCreate = () => { resetForm(); setModal('create') }
  const openEdit = (v: VehicleRow) => {
    setEditTarget(v)
    setForm({ plate_number: v.plate_number, vehicle_type: v.vehicle_type, max_capacity_kg: String(v.max_capacity_kg), is_company_owned: !!v.is_company_owned, description: v.description ?? '', vehicle_photo:'' })
    setVehicleGallery([])
    setFormLibre('')
    setFormError('')
    setModal('edit')
  }

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return
    if (file.size > 8 * 1024 * 1024) { setFormError('Max file size 8 MB'); return }
    const reader = new FileReader()
    reader.onload = () => setForm(f => ({ ...f, vehicle_photo: reader.result as string }))
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const handleGallerySelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return
    files.slice(0, 5 - vehicleGallery.length).forEach(file => {
      if (file.size > 8 * 1024 * 1024) { setFormError('Max file size 8 MB each'); return }
      const reader = new FileReader()
      reader.onload = () => setVehicleGallery(g => g.length < 5 ? [...g, reader.result as string] : g)
      reader.readAsDataURL(file)
    })
    e.target.value = ''
  }

  const handleLibreSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return
    if (file.size > 8 * 1024 * 1024) { setFormError('Max 8 MB'); return }
    const reader = new FileReader()
    reader.onload = () => setFormLibre(reader.result as string)
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setFormError('')
    if (!form.plate_number.trim()) { setFormError('Plate number is required'); return }
    const cap = parseFloat(form.max_capacity_kg)
    if (isNaN(cap) || cap <= 0) { setFormError('Enter valid capacity (kg)'); return }
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
        toast('Vehicle created.')
      } else if (editTarget) {
        await apiClient.put(`/admin/vehicles/${editTarget.id}`, payload)
        toast('Vehicle updated.')
      }
      setModal(null); resetForm(); await load()
    } catch (err: any) { setFormError(err.response?.data?.message ?? 'Failed.') }
    finally { setActionLoading(null) }
  }

  const handleReviewSubmission = async (vehicleId: string, action: 'APPROVED' | 'REJECTED', driverId?: string) => {
    setActionLoading(`review-${vehicleId}-${action}`)
    try {
      await apiClient.post(`/admin/vehicles/${vehicleId}/review`, { action, driver_id: driverId })
      toast(action === 'APPROVED' ? 'Vehicle approved & assigned to driver.' : 'Submission rejected.')
      await loadSubmissions()
    } catch (err: any) { toast(err.response?.data?.message ?? 'Failed') }
    finally { setActionLoading(null) }
  }

  const handleDelete = async (v: VehicleRow) => {
    setActionLoading(`del-${v.id}`)
    try {
      await apiClient.delete(`/admin/vehicles/${v.id}`)
      toast('Vehicle deactivated.'); setDeleteConfirm(null); await load()
    } catch (err: any) { toast(err.response?.data?.message ?? 'Delete failed') }
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
      toast(selectedDriver ? 'Driver assigned.' : 'Driver unassigned.')
      setAssignModal(null); await load()
    } catch (err: any) { toast(err.response?.data?.message ?? 'Failed') }
    finally { setActionLoading(null) }
  }

  const FormModal = ({ title }: { title: string }) => (
    <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) { setModal(null); resetForm() } }}>
      <div className="glass modal-box" style={{ padding:'1.75rem', maxWidth:460, width:'95%', maxHeight:'90vh', overflowY:'auto' }}>
        <h2 style={{ fontSize:'1rem', fontWeight:800, color:'var(--clr-text)', marginBottom:'1.1rem', display:'flex', alignItems:'center', gap:'0.4rem' }}><LuCar size={16}/> {title}</h2>
        <form onSubmit={handleSubmit} style={{ display:'flex', flexDirection:'column', gap:'0.7rem' }}>
          {formError && <div className="alert alert-error"><LuTriangleAlert size={13}/> {formError}</div>}
          <div className="input-wrap"><input id="veh-plate" type="text" placeholder=" " value={form.plate_number} onChange={e => setForm(f => ({ ...f, plate_number: e.target.value }))} required/><label htmlFor="veh-plate">Plate Number *</label></div>
          <div className="input-wrap">
            <select id="veh-type" value={form.vehicle_type} onChange={e => setForm(f => ({ ...f, vehicle_type: e.target.value }))} style={{ background:'transparent', border:'none', color:'var(--clr-text)', fontFamily:'inherit', fontSize:'0.9rem', width:'100%', outline:'none', paddingTop:'1.1rem' }}>
              {VEHICLE_TYPES.map(t => <option key={t} value={t} style={{ background:'#0f172a' }}>{t}</option>)}
            </select>
            <label htmlFor="veh-type" style={{ top:'0.35rem', fontSize:'0.7rem', color:'var(--clr-accent)' }}>Vehicle Type</label>
          </div>
          <div className="input-wrap"><input id="veh-cap" type="number" placeholder=" " min="1" step="1" value={form.max_capacity_kg} onChange={e => setForm(f => ({ ...f, max_capacity_kg: e.target.value }))} required/><label htmlFor="veh-cap">Max Capacity (kg) *</label></div>
          <div className="input-wrap"><input id="veh-desc" type="text" placeholder=" " value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}/><label htmlFor="veh-desc">Description (optional)</label></div>
          {/* company owned toggle */}
          <div style={{ display:'flex', alignItems:'center', gap:'0.65rem' }}>
            <button type="button" onClick={() => setForm(f => ({ ...f, is_company_owned: !f.is_company_owned }))}
              style={{ width:44, height:24, borderRadius:99, border:'none', cursor:'pointer', background: form.is_company_owned ? 'var(--clr-accent)' : 'rgba(255,255,255,0.12)', transition:'background 0.2s', flexShrink:0, position:'relative' }}>
              <span style={{ position:'absolute', top:3, left: form.is_company_owned ? 23 : 3, width:18, height:18, borderRadius:'50%', background: form.is_company_owned ? '#080b14' : 'var(--clr-muted)', transition:'left 0.2s' }}/>
            </button>
            <span style={{ fontSize:'0.85rem', color:'var(--clr-text)' }}>Company-owned vehicle</span>
          </div>
          {/* main photo */}
          <div>
            <p style={{ fontSize:'0.75rem', color:'var(--clr-muted)', marginBottom:'0.35rem', fontWeight:600 }}>Main Photo (optional)</p>
            <label htmlFor="veh-photo" style={{ display:'flex', alignItems:'center', gap:'0.5rem', padding:'0.6rem', borderRadius:10, border:'1px dashed rgba(255,255,255,0.18)', color: form.vehicle_photo ? 'var(--clr-accent)' : 'var(--clr-muted)', cursor:'pointer', fontSize:'0.82rem', fontWeight:600, background:'rgba(255,255,255,0.02)' }}>
              <LuCamera size={14}/> {form.vehicle_photo ? 'Photo selected ✓' : (modal === 'edit' ? 'Replace photo (optional)' : 'Add photo (optional)')}
            </label>
            <input id="veh-photo" ref={photoInputRef} type="file" accept="image/jpeg,image/png,image/webp" style={{ display:'none' }} onChange={handlePhotoSelect}/>
          </div>
          {/* gallery photos */}
          <div>
            <p style={{ fontSize:'0.75rem', color:'var(--clr-muted)', marginBottom:'0.35rem', fontWeight:600 }}>Gallery — up to 5 images (optional)</p>
            <label htmlFor="veh-gallery" style={{ display:'flex', alignItems:'center', gap:'0.5rem', padding:'0.6rem', borderRadius:10, border:'1px dashed rgba(255,255,255,0.18)', color: vehicleGallery.length > 0 ? 'var(--clr-accent)' : 'var(--clr-muted)', cursor: vehicleGallery.length >= 5 ? 'not-allowed' : 'pointer', fontSize:'0.82rem', fontWeight:600, background:'rgba(255,255,255,0.02)', opacity: vehicleGallery.length >= 5 ? 0.5 : 1 }}>
              <LuCamera size={14}/> {vehicleGallery.length > 0 ? `${vehicleGallery.length}/5 selected` : 'Add gallery images'}
            </label>
            <input id="veh-gallery" ref={galleryInputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple style={{ display:'none' }} onChange={handleGallerySelect} disabled={vehicleGallery.length >= 5}/>
            {vehicleGallery.length > 0 && (
              <div style={{ display:'flex', gap:'0.4rem', flexWrap:'wrap', marginTop:'0.5rem' }}>
                {vehicleGallery.map((src, idx) => (
                  <div key={idx} style={{ position:'relative' }}>
                    <img src={src} alt="" style={{ width:56, height:56, borderRadius:8, objectFit:'cover', border:'1px solid rgba(255,255,255,0.12)' }}/>
                    <button type="button" onClick={() => setVehicleGallery(g => g.filter((_,i) => i !== idx))}
                      style={{ position:'absolute', top:-4, right:-4, width:16, height:16, borderRadius:'50%', background:'#ef4444', border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', padding:0 }}>
                      <LuX size={9} color="#fff"/>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          {/* libre document */}
          <div>
            <p style={{ fontSize:'0.75rem', color:'var(--clr-muted)', marginBottom:'0.35rem', fontWeight:600 }}>Libre Document (optional)</p>
            <label htmlFor="veh-libre" style={{ display:'flex', alignItems:'center', gap:'0.5rem', padding:'0.6rem', borderRadius:10, border:'1px dashed rgba(255,255,255,0.18)', color: formLibre ? 'var(--clr-accent)' : 'var(--clr-muted)', cursor:'pointer', fontSize:'0.82rem', fontWeight:600, background:'rgba(255,255,255,0.02)' }}>
              <LuFileText size={14}/> {formLibre ? 'Libre selected ✓' : (modal === 'edit' ? 'Replace libre (optional)' : 'Upload libre (optional)')}
            </label>
            <input id="veh-libre" ref={libreInputRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" style={{ display:'none' }} onChange={handleLibreSelect}/>
          </div>
          <div style={{ display:'flex', gap:'0.6rem', marginTop:'0.25rem' }}>
            <button type="button" className="btn-outline" style={{ flex:1 }} onClick={() => { setModal(null); resetForm() }}>Cancel</button>
            <button type="submit" className="btn-primary" style={{ flex:2 }} disabled={actionLoading === 'form'}>{actionLoading === 'form' ? <><span className="spinner"/> Saving…</> : (modal === 'create' ? 'Create Vehicle' : 'Save Changes')}</button>
          </div>
        </form>
      </div>
    </div>
  )

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'1rem' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:'0.5rem' }}>
        <h2 style={{ fontSize:'1rem', fontWeight:800, color:'var(--clr-text)', display:'flex', alignItems:'center', gap:'0.45rem' }}><LuCar size={17}/> Vehicle Management</h2>
        <div style={{ display:'flex', gap:'0.5rem', alignItems:'center' }}>
          {vehicleTab === 'fleet' && (
            <>
              <div style={{ display:'flex', alignItems:'center', gap:'0.45rem' }}>
                <button type="button" onClick={() => setShowAll(v => !v)}
                  style={{ width:38, height:22, borderRadius:99, border:'none', cursor:'pointer', background: showAll ? 'var(--clr-accent)' : 'rgba(255,255,255,0.12)', transition:'background 0.2s', flexShrink:0, position:'relative' }}>
                  <span style={{ position:'absolute', top:2, left: showAll ? 18 : 2, width:18, height:18, borderRadius:'50%', background: showAll ? '#080b14' : 'var(--clr-muted)', transition:'left 0.2s' }}/>
                </button>
                <span style={{ fontSize:'0.78rem', color:'var(--clr-muted)' }}>Show inactive</span>
              </div>
              <button className="btn-primary" style={{ fontSize:'0.8rem', padding:'0.42rem 0.9rem', display:'flex', alignItems:'center', gap:'0.4rem' }} onClick={openCreate}><LuPlus size={14}/> Add Vehicle</button>
            </>
          )}
          <button className="btn-outline" style={{ fontSize:'0.75rem', padding:'0.35rem 0.7rem', display:'flex', alignItems:'center', gap:'0.35rem' }} onClick={vehicleTab === 'fleet' ? load : loadSubmissions} disabled={loading || subsLoading}><LuRefreshCw size={13}/></button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:'0.4rem', background:'rgba(255,255,255,0.04)', borderRadius:12, padding:'0.3rem' }}>
        {(['fleet','submissions'] as const).map(tab => (
          <button key={tab} onClick={() => setVehicleTab(tab)} style={{ flex:1, padding:'0.45rem', border:'none', borderRadius:9, background: vehicleTab===tab ? 'rgba(0,229,255,0.12)' : 'transparent', color: vehicleTab===tab ? 'var(--clr-accent)' : 'var(--clr-muted)', fontFamily:'inherit', fontSize:'0.78rem', fontWeight:600, cursor:'pointer', transition:'all 0.18s', outline: vehicleTab===tab ? '1px solid rgba(0,229,255,0.2)' : 'none' }}>
            {tab === 'fleet' ? 'Fleet' : `Driver Submissions${submissions.length > 0 ? ` (${submissions.length})` : ''}`}
          </button>
        ))}
      </div>

      {/* Fleet tab */}
      {vehicleTab === 'fleet' && (
        loading ? <LoadingSpinner /> : vehicles.length === 0 ? (
          <div className="glass-inner" style={{ padding:'2.5rem', textAlign:'center', color:'var(--clr-muted)', fontSize:'0.875rem' }}>No vehicles found. Add one above.</div>
        ) : (
          <div className="glass-inner" style={{ overflow:'hidden' }}>
            {vehicles.map((v, i) => {
              const imgUrl = absUrl(v.vehicle_photo_url)
              const gallery: string[] = v.vehicle_images ? (() => { try { return JSON.parse(v.vehicle_images) } catch { return [] } })() : []
              const allImgs = [imgUrl, ...gallery.map(absUrl)].filter(Boolean) as string[]
              return (
                <div key={v.id} style={{ display:'flex', alignItems:'flex-start', gap:'0.75rem', padding:'0.85rem 1rem', borderBottom: i < vehicles.length-1 ? '1px solid rgba(255,255,255,0.05)' : 'none', flexWrap:'wrap' }}>
                  <div style={{ width:52, height:52, borderRadius:10, flexShrink:0, background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.10)', display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden', marginTop:2, cursor: imgUrl ? 'pointer' : 'default' }}
                    onClick={() => imgUrl && setLightbox({ urls: allImgs, index: 0 })}>
                    {imgUrl ? <img src={imgUrl} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }}/> : <LuCar size={18} color="var(--clr-muted)"/>}
                  </div>
                  <div style={{ flex:1, minWidth:110 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:'0.4rem', flexWrap:'wrap' }}>
                      <span style={{ fontWeight:700, fontSize:'0.885rem', color:'var(--clr-text)' }}>{v.plate_number}</span>
                      <span className="badge badge-cyan" style={{ fontSize:'0.67rem' }}>{v.vehicle_type}</span>
                      {!!v.is_company_owned && <span className="badge badge-purple" style={{ fontSize:'0.67rem' }}>Company</span>}
                      {!v.is_active && <span className="badge badge-red" style={{ fontSize:'0.67rem' }}>Inactive</span>}
                      {v.libre_url && <a href={absUrl(v.libre_url)!} target="_blank" rel="noopener noreferrer" style={{ fontSize:'0.65rem', display:'inline-flex', alignItems:'center', gap:'0.15rem', color:'var(--clr-muted)', textDecoration:'none', border:'1px solid rgba(255,255,255,0.10)', borderRadius:5, padding:'0.1rem 0.35rem' }}><LuFileText size={10}/> Libre</a>}
                    </div>
                    <p style={{ fontSize:'0.73rem', color:'var(--clr-muted)', marginTop:'0.1rem' }}>{v.max_capacity_kg} kg · {v.driver_id ? 'Assigned' : 'Unassigned'}</p>
                    {v.description && <p style={{ fontSize:'0.7rem', color:'var(--clr-muted)' }}>{v.description}</p>}
                    {gallery.length > 0 && (
                      <div style={{ display:'flex', gap:'0.3rem', marginTop:'0.4rem', flexWrap:'wrap' }}>
                        {gallery.map((src, gi) => {
                          const u = absUrl(src)
                          return u ? <img key={gi} src={u} alt="" onClick={() => setLightbox({ urls: allImgs, index: gi + 1 })}
                            style={{ width:52, height:52, borderRadius:6, objectFit:'cover', border:'1px solid rgba(255,255,255,0.12)', cursor:'pointer', transition:'transform 0.15s, opacity 0.15s' }}
                            onMouseEnter={e => { e.currentTarget.style.transform='scale(1.08)'; e.currentTarget.style.opacity='0.9' }}
                            onMouseLeave={e => { e.currentTarget.style.transform='scale(1)'; e.currentTarget.style.opacity='1' }}
                          /> : null
                        })}
                      </div>
                    )}
                  </div>
                  <div style={{ display:'flex', gap:'0.35rem', flexShrink:0 }}>
                    <button title="Assign driver" onClick={() => openAssign(v)}
                      style={{ padding:'0.28rem 0.5rem', borderRadius:7, border:'1px solid rgba(0,229,255,0.25)', background:'rgba(0,229,255,0.07)', color:'var(--clr-accent)', fontFamily:'inherit', fontSize:'0.72rem', cursor:'pointer', display:'flex', alignItems:'center', gap:'0.25rem' }}>
                      <LuUser size={12}/> Driver
                    </button>
                    <button title="Edit" onClick={() => openEdit(v)}
                      style={{ padding:'0.28rem 0.5rem', borderRadius:7, border:'1px solid rgba(255,255,255,0.15)', background:'rgba(255,255,255,0.05)', color:'var(--clr-text)', fontFamily:'inherit', fontSize:'0.72rem', cursor:'pointer', display:'flex', alignItems:'center' }}>
                      <LuPencil size={12}/>
                    </button>
                    {!!v.is_active && (
                      <button title="Deactivate" onClick={() => setDeleteConfirm(v)} disabled={!!actionLoading}
                        style={{ padding:'0.28rem 0.5rem', borderRadius:7, border:'1px solid rgba(239,68,68,0.35)', background:'rgba(239,68,68,0.08)', color:'#fca5a5', fontFamily:'inherit', fontSize:'0.72rem', cursor:'pointer', display:'flex', alignItems:'center' }}>
                        <LuTrash2 size={12}/>
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
          <div className="glass-inner" style={{ padding:'2.5rem', textAlign:'center', color:'var(--clr-muted)', fontSize:'0.875rem' }}>No driver vehicle submissions yet.</div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:'0.65rem' }}>
            {submissions.map(v => {
              const imgUrl = absUrl(v.vehicle_photo_url)
              const submitterName = v.submitter_first_name ? `${v.submitter_first_name} ${v.submitter_last_name ?? ''}`.trim() : 'Unknown'
              const sColor = v.driver_submission_status === 'APPROVED' ? '#4ade80' : v.driver_submission_status === 'REJECTED' ? '#fca5a5' : '#fbbf24'
              return (
                <div key={v.id} className="glass-inner" style={{ padding:'0.9rem 1rem', display:'flex', alignItems:'flex-start', gap:'0.75rem', flexWrap:'wrap' }}>
                  <div style={{ width:52, height:52, borderRadius:10, flexShrink:0, background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.10)', display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden', marginTop:2, cursor: imgUrl ? 'pointer' : 'default' }}
                    onClick={() => imgUrl && setLightbox({ urls: [imgUrl], index: 0 })}>
                    {imgUrl ? <img src={imgUrl} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }}/> : <LuCar size={18} color="var(--clr-muted)"/>}
                  </div>
                  <div style={{ flex:1, minWidth:110 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:'0.4rem', flexWrap:'wrap' }}>
                      <span style={{ fontWeight:700, fontSize:'0.885rem', color:'var(--clr-text)' }}>{v.plate_number}</span>
                      <span className="badge badge-cyan" style={{ fontSize:'0.67rem' }}>{v.vehicle_type}</span>
                      <span style={{ fontSize:'0.68rem', fontWeight:700, color:sColor, background:`${sColor}18`, border:`1px solid ${sColor}44`, borderRadius:99, padding:'0.15rem 0.5rem' }}>{v.driver_submission_status ?? 'PENDING'}</span>
                    </div>
                    <p style={{ fontSize:'0.73rem', color:'var(--clr-muted)', marginTop:'0.1rem' }}>By: <strong style={{ color:'var(--clr-text)' }}>{submitterName}</strong> · {v.max_capacity_kg} kg</p>
                    {v.description && <p style={{ fontSize:'0.7rem', color:'var(--clr-muted)' }}>{v.description}</p>}
                    {v.libre_url && <a href={absUrl(v.libre_url)!} target="_blank" rel="noopener noreferrer" style={{ fontSize:'0.65rem', display:'inline-flex', alignItems:'center', gap:'0.15rem', color:'var(--clr-accent)', textDecoration:'none', marginTop:'0.2rem' }}><LuFileText size={10}/> View Libre ↗</a>}
                  </div>
                  {v.driver_submission_status === 'PENDING' && (
                    <div style={{ display:'flex', gap:'0.4rem', flexShrink:0 }}>
                      <button onClick={() => handleReviewSubmission(v.id, 'APPROVED', v.submitted_by_driver_id ?? undefined)} disabled={!!actionLoading}
                        style={{ padding:'0.3rem 0.65rem', borderRadius:7, border:'1px solid rgba(74,222,128,0.35)', background:'rgba(74,222,128,0.08)', color:'#4ade80', fontFamily:'inherit', fontSize:'0.72rem', fontWeight:600, cursor:'pointer', display:'flex', alignItems:'center', gap:'0.25rem' }}>
                        {actionLoading === `review-${v.id}-APPROVED` ? <span className="spinner"/> : null}✓ Approve
                      </button>
                      <button onClick={() => handleReviewSubmission(v.id, 'REJECTED')} disabled={!!actionLoading}
                        style={{ padding:'0.3rem 0.65rem', borderRadius:7, border:'1px solid rgba(239,68,68,0.35)', background:'rgba(239,68,68,0.08)', color:'#fca5a5', fontFamily:'inherit', fontSize:'0.72rem', fontWeight:600, cursor:'pointer', display:'flex', alignItems:'center', gap:'0.25rem' }}>
                        {actionLoading === `review-${v.id}-REJECTED` ? <span className="spinner"/> : null}✕ Reject
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
      {modal === 'create' && <FormModal title="Add New Vehicle" />}
      {modal === 'edit'   && <FormModal title="Edit Vehicle" />}

      {/* Assign driver modal */}
      {assignModal && (
        <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) setAssignModal(null) }}>
          <div className="glass modal-box" style={{ padding:'1.75rem' }}>
            <h2 style={{ fontSize:'1rem', fontWeight:800, color:'var(--clr-text)', marginBottom:'0.35rem', display:'flex', alignItems:'center', gap:'0.4rem' }}><LuTruck size={15}/> Assign Driver</h2>
            <p style={{ fontSize:'0.8rem', color:'var(--clr-muted)', marginBottom:'1rem' }}>Vehicle: <strong style={{ color:'var(--clr-text)' }}>{assignModal.plate_number}</strong></p>
            {driversLoading ? <LoadingSpinner /> : (
              <>
                <div className="input-wrap" style={{ marginBottom:'0.75rem' }}>
                  <select id="drv-sel" value={selectedDriver} onChange={e => setSelectedDriver(e.target.value)}
                    style={{ background:'transparent', border:'none', color:'var(--clr-text)', fontFamily:'inherit', fontSize:'0.9rem', width:'100%', outline:'none', paddingTop:'1.1rem' }}>
                    <option value="" style={{ background:'#0f172a' }}>— Unassign driver —</option>
                    {allDrivers.map(d => (
                      <option key={d.user_id} value={d.user_id} style={{ background:'#0f172a' }}>{d.first_name} {d.last_name} · {d.phone_number}</option>
                    ))}
                  </select>
                  <label htmlFor="drv-sel" style={{ top:'0.35rem', fontSize:'0.7rem', color:'var(--clr-accent)' }}>Verified Driver</label>
                </div>
                <div style={{ display:'flex', gap:'0.6rem' }}>
                  <button className="btn-outline" style={{ flex:1 }} onClick={() => setAssignModal(null)}>Cancel</button>
                  <button className="btn-primary" style={{ flex:2 }} disabled={!!actionLoading} onClick={handleAssign}>
                    {actionLoading ? <><span className="spinner"/> …</> : (selectedDriver ? 'Assign Driver' : 'Unassign')}
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
          <div className="glass modal-box" style={{ padding:'1.75rem' }}>
            <h2 style={{ fontSize:'1rem', fontWeight:800, color:'#fca5a5', marginBottom:'0.4rem', display:'flex', alignItems:'center', gap:'0.4rem' }}><LuTriangleAlert size={15}/> Deactivate Vehicle</h2>
            <p style={{ fontSize:'0.85rem', color:'var(--clr-muted)', marginBottom:'1.1rem' }}>Deactivate <strong style={{ color:'var(--clr-text)' }}>{deleteConfirm.plate_number}</strong>? The vehicle will be hidden but not deleted.</p>
            <div style={{ display:'flex', gap:'0.6rem' }}>
              <button className="btn-outline" style={{ flex:1 }} onClick={() => setDeleteConfirm(null)}>Cancel</button>
              <button disabled={!!actionLoading} onClick={() => handleDelete(deleteConfirm)}
                style={{ flex:1, padding:'0.7rem', borderRadius:10, border:'none', background:'#ef4444', color:'#fff', fontFamily:'inherit', fontSize:'0.85rem', fontWeight:700, cursor:'pointer' }}>
                {actionLoading ? <><span className="spinner"/> …</> : 'Deactivate'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div onClick={() => setLightbox(null)}
          style={{ position:'fixed', inset:0, zIndex:300, background:'rgba(0,0,0,0.88)', display:'flex', alignItems:'center', justifyContent:'center', cursor:'zoom-out', backdropFilter:'blur(6px)' }}>
          <button onClick={() => setLightbox(null)}
            style={{ position:'absolute', top:'1rem', right:'1rem', width:36, height:36, borderRadius:'50%', border:'1px solid rgba(255,255,255,0.2)', background:'rgba(255,255,255,0.1)', color:'#fff', cursor:'pointer', fontSize:'1.1rem', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1 }}>✕</button>
          {lightbox.urls.length > 1 && (
            <>
              <button onClick={e => { e.stopPropagation(); setLightbox(lb => lb ? { ...lb, index: (lb.index - 1 + lb.urls.length) % lb.urls.length } : null) }}
                style={{ position:'absolute', left:'1rem', top:'50%', transform:'translateY(-50%)', width:40, height:40, borderRadius:'50%', border:'1px solid rgba(255,255,255,0.2)', background:'rgba(255,255,255,0.1)', color:'#fff', cursor:'pointer', fontSize:'1.2rem', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1 }}>‹</button>
              <button onClick={e => { e.stopPropagation(); setLightbox(lb => lb ? { ...lb, index: (lb.index + 1) % lb.urls.length } : null) }}
                style={{ position:'absolute', right:'1rem', top:'50%', transform:'translateY(-50%)', width:40, height:40, borderRadius:'50%', border:'1px solid rgba(255,255,255,0.2)', background:'rgba(255,255,255,0.1)', color:'#fff', cursor:'pointer', fontSize:'1.2rem', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1 }}>›</button>
            </>
          )}
          <img src={lightbox.urls[lightbox.index]} alt="" onClick={e => e.stopPropagation()}
            style={{ maxWidth:'90vw', maxHeight:'88vh', borderRadius:14, boxShadow:'0 24px 80px rgba(0,0,0,0.8)', objectFit:'contain', cursor:'default' }}/>
          {lightbox.urls.length > 1 && (
            <div style={{ position:'absolute', bottom:'1.25rem', left:'50%', transform:'translateX(-50%)', display:'flex', gap:'0.4rem' }}>
              {lightbox.urls.map((_, i) => (
                <div key={i} onClick={e => { e.stopPropagation(); setLightbox(lb => lb ? { ...lb, index: i } : null) }}
                  style={{ width: i === lightbox.index ? 20 : 8, height:8, borderRadius:99, background: i === lightbox.index ? '#00e5ff' : 'rgba(255,255,255,0.3)', cursor:'pointer', transition:'all 0.2s' }}/>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Toast */}
      {toastMsg && (
        <div style={{ position:'fixed', bottom:'1.25rem', right:'1.25rem', zIndex:200, background:'rgba(0,229,255,0.12)', border:'1px solid rgba(0,229,255,0.25)', color:'var(--clr-text)', padding:'0.65rem 1.1rem', borderRadius:12, fontSize:'0.85rem', fontWeight:600, backdropFilter:'blur(12px)' }}>
          {toastMsg}
        </div>
      )}
    </div>
  )
}

// ─── Admin Orders Section ────────────────────────────────────────────────────

interface AdminOrder {
  id: string; reference_code: string; status: string
  cargo_type_name: string; vehicle_type: string; weight_kg: number
  pickup_address: string; delivery_address: string
  estimated_price: number; final_price: number | null; currency: string
  shipper_first_name: string; shipper_last_name: string
  driver_first_name: string | null; driver_last_name: string | null
  created_at: string
}
interface OrderStats {
  by_status: Record<string, number>
  total_orders: number
  total_revenue: string | number
}
interface AdminDriver { user_id: string; first_name: string; last_name: string; phone_number: string }
interface AdminVehicle { id: string; plate_number: string; vehicle_type: string; driver_id?: string | null }

const ORDER_STATUS_COLOR: Record<string, string> = {
  PENDING: '#fbbf24', ASSIGNED: '#60a5fa', EN_ROUTE: '#a78bfa',
  AT_PICKUP: '#fb923c', IN_TRANSIT: '#34d399', DELIVERED: '#4ade80', CANCELLED: '#f87171',
}
const ORDER_STATUS_LABEL: Record<string, string> = {
  PENDING: 'Pending', ASSIGNED: 'Assigned', EN_ROUTE: 'En Route',
  AT_PICKUP: 'At Pickup', IN_TRANSIT: 'In Transit', DELIVERED: 'Delivered', CANCELLED: 'Cancelled',
}
function orderBadge(status: string) {
  const c = ORDER_STATUS_COLOR[status] ?? '#94a3b8'
  return <span style={{ fontSize:'0.68rem', fontWeight:700, color:c, background:`${c}1a`, border:`1px solid ${c}44`, borderRadius:99, padding:'0.15rem 0.5rem', whiteSpace:'nowrap' }}>{ORDER_STATUS_LABEL[status] ?? status}</span>
}

function AdminOrdersSection() {
  const [orders, setOrders] = useState<AdminOrder[]>([])
  const [stats, setStats]   = useState<OrderStats | null>(null)
  const [loading, setLoading] = useState(false)
  const [search, setSearch]   = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const LIMIT = 15
  const [toast, setToast] = useState('')
  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3000) }

  // Assign modal
  const [assignOrder, setAssignOrder] = useState<AdminOrder | null>(null)
  const [drivers, setDrivers] = useState<AdminDriver[]>([])
  const [vehicles, setVehicles] = useState<AdminVehicle[]>([])
  const [selDriver, setSelDriver] = useState('')
  const [selVehicle, setSelVehicle] = useState('')
  const [assigning, setAssigning] = useState(false)
  const [detailOrder, setDetailOrder] = useState<any | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)

  // Create Order on behalf state
  const [createOrderModal, setCreateOrderModal] = useState(false)
  const [shippers, setShippers] = useState<Array<{id:string;first_name:string;last_name:string;phone_number:string}>>([])
  const [cargoTypesForCreate, setCargoTypesForCreate] = useState<Array<{id:number;name:string;icon:string|null;icon_url:string|null}>>([])
  const [coForm, setCoForm] = useState({
    shipper_id:'', shipper_search:'',
    cargo_type_id:'', vehicle_type:'',
    estimated_weight_kg:'',
    pickup_address:'', pickup_lat:'', pickup_lng:'',
    delivery_address:'', delivery_lat:'', delivery_lng:'',
    special_instructions:'',
    driver_id:'', vehicle_id:'',
  })
  const [coQuote, setCoQuote] = useState<{estimated_price:number;distance_km:number;base_fare:number;per_km_rate:number;weight_cost?:number;fees_breakdown?:any[]} | null>(null)
  const [coStep, setCoStep] = useState<'form'|'confirm'>('form')
  const [coSaving, setCoSaving] = useState(false)
  const [coErr, setCoErr] = useState('')
  const [coGeoLoading, setCoGeoLoading] = useState<'pickup'|'delivery'|null>(null)
  // Guest mode
  const [coIsGuest, setCoIsGuest] = useState(false)
  const [coGuestName, setCoGuestName] = useState('')
  const [coGuestPhone, setCoGuestPhone] = useState('')
  const [coGuestEmail, setCoGuestEmail] = useState('')
  // Optional image uploads
  const [coCargoImage, setCoCargoImage] = useState<string | null>(null)
  const [coPaymentReceipt, setCoPaymentReceipt] = useState<string | null>(null)

  const loadOrders = useCallback(async (pg = page, sf = statusFilter, q = search) => {
    setLoading(true)
    try {
      const { data } = await adminOrderApi.listOrders({ page: pg, limit: LIMIT, status: sf || undefined, search: q || undefined })
      setOrders(data.orders ?? [])
      setTotal(data.pagination?.total ?? 0)
    } catch { showToast('Failed to load orders') }
    finally { setLoading(false) }
  }, [page, statusFilter, search])

  const loadStats = async () => {
    try { const { data } = await adminOrderApi.getStats(); setStats(data.stats) }
    catch { /* ignore */ }
  }

  useEffect(() => { loadOrders(); loadStats() }, []) // eslint-disable-line
  useEffect(() => { loadOrders(page, statusFilter, search) }, [page, statusFilter]) // eslint-disable-line

  const openAssign = async (o: AdminOrder) => {
    setAssignOrder(o); setSelDriver(''); setSelVehicle('')
    try {
      const [dr, vh] = await Promise.all([apiClient.get('/admin/drivers?filter=verified'), apiClient.get('/admin/vehicles')])
      setDrivers(dr.data.drivers ?? [])
      setVehicles((vh.data.vehicles ?? []).filter((v: any) => v.is_active))
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

  const openOrderDetail = async (id: string) => {
    setLoadingDetail(true)
    setDetailOrder(null)
    try {
      const { data } = await adminOrderApi.getOrder(id)
      setDetailOrder(data.order ?? data)
    } catch { showToast('Failed to load order details') }
    finally { setLoadingDetail(false) }
  }

  const openCreateOrder = async () => {
    setCoForm({ shipper_id:'', shipper_search:'', cargo_type_id:'', vehicle_type:'', estimated_weight_kg:'', pickup_address:'', pickup_lat:'', pickup_lng:'', delivery_address:'', delivery_lat:'', delivery_lng:'', special_instructions:'', driver_id:'', vehicle_id:'' })
    setCoQuote(null); setCoStep('form'); setCoErr('')
    setCoIsGuest(false); setCoGuestName(''); setCoGuestPhone(''); setCoGuestEmail('')
    setCoCargoImage(null); setCoPaymentReceipt(null)
    setCreateOrderModal(true)
    // Load shippers + cargo types + drivers/vehicles if not loaded
    try {
      const [sh, ct, dr, vh] = await Promise.all([
        adminOrderApi.getShippers(),
        apiClient.get('/orders/cargo-types'),
        apiClient.get('/admin/drivers?filter=verified'),
        apiClient.get('/admin/vehicles'),
      ])
      setShippers((sh.data.users ?? []).filter((u: any) => u.role_id === 2))
      setCargoTypesForCreate(ct.data.cargo_types ?? [])
      setDrivers(dr.data.drivers ?? [])
      setVehicles((vh.data.vehicles ?? []).filter((v: any) => v.is_active))
    } catch { setCoErr('Failed to load data') }
  }

  const geocodeAddress = async (addr: string, field: 'pickup'|'delivery') => {
    if (!addr.trim()) return
    setCoGeoLoading(field)
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(addr)}&limit=1`, { headers:{'Accept-Language':'en'} })
      const results = await res.json()
      if (results[0]) {
        const { lat, lon, display_name } = results[0]
        setCoForm(f => field === 'pickup'
          ? { ...f, pickup_lat: lat, pickup_lng: lon, pickup_address: display_name }
          : { ...f, delivery_lat: lat, delivery_lng: lon, delivery_address: display_name }
        )
        setCoQuote(null)
      } else { setCoErr('Address not found') }
    } catch { setCoErr('Geocoding failed') }
    finally { setCoGeoLoading(null) }
  }

  const getCoQuote = async () => {
    setCoErr('')
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
      })
      setCoQuote(data.quote ?? data)
      setCoStep('confirm')
    } catch (e: any) { setCoErr(e.response?.data?.message ?? 'Quote failed') }
  }

  const placeCoOrder = async () => {
    if (!coIsGuest && !coForm.shipper_id) { setCoErr('Select a shipper or toggle Guest mode'); return }
    setCoSaving(true); setCoErr('')
    try {
      const { data } = await adminOrderApi.createOrderOnBehalf({
        ...(coIsGuest
          ? { is_guest: true, guest_name: coGuestName || undefined, guest_phone: coGuestPhone || undefined, guest_email: coGuestEmail || undefined }
          : { shipper_id: coForm.shipper_id }),
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
      })
      showToast(`Order ${data.order?.reference_code ?? ''} created! Pickup OTP: ${data.otps?.pickup_otp}`)
      setCreateOrderModal(false)
      loadOrders(page, statusFilter, search)
    } catch (e: any) { setCoErr(e.response?.data?.message ?? 'Failed to create order') }
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

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'1.25rem' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:'0.5rem' }}>
        <h2 style={{ fontSize:'1rem', fontWeight:800, color:'var(--clr-text)', display:'flex', alignItems:'center', gap:'0.45rem' }}><LuListOrdered size={17}/> Orders</h2>
        <div style={{ display:'flex', gap:'0.5rem' }}>
          <button onClick={() => { loadOrders(); loadStats() }} style={{ display:'flex', alignItems:'center', gap:'0.35rem', padding:'0.3rem 0.7rem', borderRadius:8, border:'1px solid rgba(255,255,255,0.1)', background:'rgba(255,255,255,0.04)', color:'var(--clr-muted)', fontFamily:'inherit', fontSize:'0.72rem', fontWeight:600, cursor:'pointer' }}><LuRefreshCw size={12}/> Refresh</button>
          <button onClick={openCreateOrder} style={{ display:'flex', alignItems:'center', gap:'0.4rem', padding:'0.38rem 0.85rem', borderRadius:8, border:'none', background:'var(--clr-accent)', color:'#000', fontFamily:'inherit', fontSize:'0.8rem', fontWeight:700, cursor:'pointer' }}><LuPlus size={14}/> Create Order</button>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(110px,1fr))', gap:'0.65rem' }}>
          {Object.entries(stats.by_status).map(([status, count]) => (
            <div key={status} className="glass-inner" style={{ padding:'0.75rem 0.85rem', textAlign:'center', cursor:'pointer' }} onClick={() => { setStatusFilter(status); setPage(1) }}>
              <p style={{ fontSize:'1.4rem', fontWeight:800, color: ORDER_STATUS_COLOR[status] ?? 'var(--clr-text)', lineHeight:1 }}>{count}</p>
              <p style={{ fontSize:'0.68rem', color:'var(--clr-muted)', marginTop:'0.2rem', fontWeight:600 }}>{ORDER_STATUS_LABEL[status] ?? status}</p>
            </div>
          ))}
          <div className="glass-inner" style={{ padding:'0.75rem 0.85rem', textAlign:'center' }}>
            <p style={{ fontSize:'1.2rem', fontWeight:800, color:'var(--clr-accent)', lineHeight:1 }}>{Number(stats.total_revenue).toLocaleString()}</p>
            <p style={{ fontSize:'0.68rem', color:'var(--clr-muted)', marginTop:'0.2rem', fontWeight:600 }}>ETB Revenue</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="glass" style={{ padding:'0.75rem 1rem', display:'flex', gap:'0.5rem', flexWrap:'wrap', alignItems:'center' }}>
        <div style={{ flex:1, minWidth:160, display:'flex', alignItems:'center', gap:'0.5rem', background:'rgba(255,255,255,0.04)', borderRadius:8, padding:'0.4rem 0.7rem' }}>
          <LuSearch size={13} style={{ color:'var(--clr-muted)', flexShrink:0 }}/>
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} placeholder="Search ref / address…" style={{ background:'none', border:'none', color:'var(--clr-text)', fontFamily:'inherit', fontSize:'0.8rem', outline:'none', width:'100%' }}/>
          {search && <button onClick={() => { setSearch(''); setPage(1) }} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--clr-muted)', padding:0, display:'flex', alignItems:'center' }}><LuX size={12}/></button>}
        </div>
        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1) }}
          style={{ padding:'0.4rem 0.6rem', borderRadius:8, border:'1px solid rgba(255,255,255,0.1)', background:'rgba(255,255,255,0.04)', color:'var(--clr-text)', fontFamily:'inherit', fontSize:'0.78rem', outline:'none' }}>
          {STATUSES.map(s => <option key={s} value={s} style={{ background:'#0f172a' }}>{s || 'All Statuses'}</option>)}
        </select>
      </div>

      {/* Order list */}
      <div className="glass-inner" style={{ overflow:'hidden' }}>
        {loading ? <LoadingSpinner /> : orders.length === 0 ? (
          <p style={{ padding:'2rem', textAlign:'center', color:'var(--clr-muted)', fontSize:'0.875rem' }}>No orders found.</p>
        ) : orders.map((o, i) => (
          <div key={o.id} style={{ display:'flex', alignItems:'flex-start', gap:'0.75rem', padding:'0.85rem 1rem', borderBottom: i < orders.length-1 ? '1px solid rgba(255,255,255,0.05)' : 'none', flexWrap:'wrap', cursor:'pointer' }} onClick={e => { if ((e.target as HTMLElement).closest('button')) return; openOrderDetail(o.id) }}>
            <div style={{ flex:1, minWidth:120 }}>
              <div style={{ display:'flex', alignItems:'center', gap:'0.45rem', flexWrap:'wrap', marginBottom:'0.2rem' }}>
                <span style={{ fontWeight:700, fontSize:'0.875rem', color:'var(--clr-text)' }}>{o.reference_code}</span>
                {orderBadge(o.status)}
              </div>
              <p style={{ fontSize:'0.73rem', color:'var(--clr-muted)', marginBottom:'0.1rem' }}>Shipper: {o.shipper_first_name} {o.shipper_last_name}</p>
              {o.driver_first_name && <p style={{ fontSize:'0.73rem', color:'var(--clr-muted)' }}>Driver: {o.driver_first_name} {o.driver_last_name}</p>}
              <p style={{ fontSize:'0.7rem', color:'var(--clr-muted)', marginTop:'0.2rem' }}>{o.pickup_address} → {o.delivery_address}</p>
            </div>
            <div style={{ textAlign:'right', flexShrink:0, display:'flex', flexDirection:'column', gap:'0.35rem', alignItems:'flex-end' }}>
              <span style={{ fontWeight:800, fontSize:'0.88rem', color:'var(--clr-accent)' }}>{(o.final_price ?? o.estimated_price).toLocaleString()} ETB</span>
              {o.status === 'PENDING' && (
                <button onClick={() => openAssign(o)} style={{ display:'flex', alignItems:'center', gap:'0.25rem', padding:'0.28rem 0.6rem', borderRadius:7, border:'none', background:'var(--clr-accent)', color:'#080b14', fontFamily:'inherit', fontSize:'0.7rem', fontWeight:700, cursor:'pointer' }}>
                  <LuTruck size={11}/> Assign
                </button>
              )}
              {['PENDING','ASSIGNED'].includes(o.status) && (
                <button onClick={() => handleCancel(o)} style={{ display:'flex', alignItems:'center', gap:'0.25rem', padding:'0.28rem 0.6rem', borderRadius:7, border:'1px solid rgba(248,113,113,0.3)', background:'rgba(248,113,113,0.06)', color:'#f87171', fontFamily:'inherit', fontSize:'0.7rem', fontWeight:700, cursor:'pointer' }}>
                  <LuBan size={11}/> Cancel
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display:'flex', justifyContent:'center', alignItems:'center', gap:'0.5rem' }}>
          <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page===1} style={{ padding:'0.3rem 0.6rem', borderRadius:7, border:'1px solid rgba(255,255,255,0.1)', background:'rgba(255,255,255,0.04)', color:'var(--clr-muted)', cursor:'pointer', opacity:page===1?0.4:1 }}>‹</button>
          <span style={{ fontSize:'0.78rem', color:'var(--clr-muted)' }}>Page {page} of {totalPages} · {total} total</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p+1))} disabled={page===totalPages} style={{ padding:'0.3rem 0.6rem', borderRadius:7, border:'1px solid rgba(255,255,255,0.1)', background:'rgba(255,255,255,0.04)', color:'var(--clr-muted)', cursor:'pointer', opacity:page===totalPages?0.4:1 }}>›</button>
        </div>
      )}

      {/* Assign modal */}
      {assignOrder && (
        <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) setAssignOrder(null) }}>
          <div className="glass modal-box" style={{ padding:'1.75rem' }}>
            <h2 style={{ fontSize:'1rem', fontWeight:800, color:'var(--clr-text)', marginBottom:'0.35rem', display:'flex', alignItems:'center', gap:'0.45rem' }}><LuTruck size={16}/> Assign Driver</h2>
            <p style={{ fontSize:'0.8rem', color:'var(--clr-muted)', marginBottom:'1rem' }}>Order: <strong style={{ color:'var(--clr-accent)' }}>{assignOrder.reference_code}</strong></p>
            <div style={{ display:'flex', flexDirection:'column', gap:'0.75rem' }}>
              <div>
                <label style={{ fontSize:'0.75rem', color:'var(--clr-muted)', fontWeight:600, display:'block', marginBottom:'0.35rem' }}>Driver *</label>
                <select value={selDriver} onChange={e => setSelDriver(e.target.value)} style={{ width:'100%', padding:'0.6rem', borderRadius:9, border:'1px solid rgba(255,255,255,0.15)', background:'rgba(255,255,255,0.05)', color:'var(--clr-text)', fontFamily:'inherit', fontSize:'0.85rem', outline:'none' }}>
                  <option value="" style={{ background:'#0f172a' }}>— Select driver —</option>
                  {drivers.map(d => <option key={d.user_id} value={d.user_id} style={{ background:'#0f172a' }}>{d.first_name} {d.last_name} · {d.phone_number}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize:'0.75rem', color:'var(--clr-muted)', fontWeight:600, display:'block', marginBottom:'0.35rem' }}>Vehicle (optional)</label>
                <select value={selVehicle} onChange={e => setSelVehicle(e.target.value)} style={{ width:'100%', padding:'0.6rem', borderRadius:9, border:'1px solid rgba(255,255,255,0.15)', background:'rgba(255,255,255,0.05)', color:'var(--clr-text)', fontFamily:'inherit', fontSize:'0.85rem', outline:'none' }}>
                  <option value="" style={{ background:'#0f172a' }}>— No vehicle —</option>
                  {vehicles.map(v => <option key={v.id} value={v.id} style={{ background:'#0f172a' }}>{v.plate_number} · {v.vehicle_type}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display:'flex', gap:'0.6rem', marginTop:'1.1rem' }}>
              <button className="btn-outline" style={{ flex:1 }} onClick={() => setAssignOrder(null)}>Cancel</button>
              <button className="btn-primary" style={{ flex:2 }} disabled={!selDriver || assigning} onClick={handleAssign}>
                {assigning ? <BtnSpinner text="Assigning…" /> : 'Confirm Assignment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Order detail modal */}
      {(loadingDetail || detailOrder) && (
        <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) { setDetailOrder(null); setLoadingDetail(false) } }}>
          <div className="glass modal-box" style={{ padding:'1.75rem', maxWidth:520, maxHeight:'85vh', overflowY:'auto' }}>
            {loadingDetail && !detailOrder ? (
              <div style={{ textAlign:'center', padding:'2rem' }}><LoadingSpinner /></div>
            ) : detailOrder && (
              <>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'1rem' }}>
                  <div>
                    <h2 style={{ fontSize:'1rem', fontWeight:800, color:'var(--clr-text)', marginBottom:'0.25rem' }}>{detailOrder.reference_code}</h2>
                    <div style={{ display:'flex', gap:'0.4rem', flexWrap:'wrap' }}>{orderBadge(detailOrder.status)}</div>
                  </div>
                  <button onClick={() => setDetailOrder(null)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--clr-muted)', padding:'0.2rem' }}><LuX size={18}/></button>
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:'0.75rem' }}>
                  {/* Shipper */}
                  <div className="glass-inner" style={{ padding:'0.75rem 1rem' }}>
                    <p style={{ fontSize:'0.7rem', color:'var(--clr-muted)', fontWeight:600, marginBottom:'0.35rem' }}>SHIPPER</p>
                    <p style={{ fontSize:'0.875rem', color:'var(--clr-text)', fontWeight:600 }}>{detailOrder.shipper_first_name} {detailOrder.shipper_last_name}</p>
                    {detailOrder.shipper_phone && <p style={{ fontSize:'0.78rem', color:'var(--clr-muted)' }}>{detailOrder.shipper_phone}</p>}
                  </div>
                  {/* Driver */}
                  {detailOrder.driver_first_name && (
                    <div className="glass-inner" style={{ padding:'0.75rem 1rem' }}>
                      <p style={{ fontSize:'0.7rem', color:'var(--clr-muted)', fontWeight:600, marginBottom:'0.35rem' }}>DRIVER</p>
                      <p style={{ fontSize:'0.875rem', color:'var(--clr-text)', fontWeight:600 }}>{detailOrder.driver_first_name} {detailOrder.driver_last_name}</p>
                      {detailOrder.driver_phone && <p style={{ fontSize:'0.78rem', color:'var(--clr-muted)' }}>{detailOrder.driver_phone}</p>}
                    </div>
                  )}
                  {/* Cargo & Route */}
                  <div className="glass-inner" style={{ padding:'0.75rem 1rem' }}>
                    <p style={{ fontSize:'0.7rem', color:'var(--clr-muted)', fontWeight:600, marginBottom:'0.5rem' }}>SHIPMENT</p>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.5rem 1rem' }}>
                      <div><p style={{ fontSize:'0.7rem', color:'var(--clr-muted)' }}>Cargo Type</p><div style={{ display:'flex', alignItems:'center', gap:'0.4rem', marginTop:'0.15rem' }}><CargoIcon icon={detailOrder.cargo_type_icon} iconUrl={detailOrder.cargo_type_icon_url} size={16} style={{ color:'var(--clr-accent)' }}/><p style={{ fontSize:'0.82rem', color:'var(--clr-text)', fontWeight:600 }}>{detailOrder.cargo_type_name ?? '—'}</p></div></div>
                      <div><p style={{ fontSize:'0.7rem', color:'var(--clr-muted)' }}>Vehicle</p><p style={{ fontSize:'0.82rem', color:'var(--clr-text)', fontWeight:600 }}>{detailOrder.vehicle_type ?? '—'}</p></div>
                      <div><p style={{ fontSize:'0.7rem', color:'var(--clr-muted)' }}>Weight</p><p style={{ fontSize:'0.82rem', color:'var(--clr-text)', fontWeight:600 }}>{detailOrder.estimated_weight_kg != null ? `${detailOrder.estimated_weight_kg} kg` : '—'}</p></div>
                      <div><p style={{ fontSize:'0.7rem', color:'var(--clr-muted)' }}>Distance</p><p style={{ fontSize:'0.82rem', color:'var(--clr-text)', fontWeight:600 }}>{detailOrder.distance_km != null ? `${Number(detailOrder.distance_km).toFixed(1)} km` : '—'}</p></div>
                    </div>
                  </div>
                  {/* Addresses */}
                  <div className="glass-inner" style={{ padding:'0.75rem 1rem' }}>
                    <p style={{ fontSize:'0.7rem', color:'var(--clr-muted)', fontWeight:600, marginBottom:'0.35rem' }}>ROUTE</p>
                    <p style={{ fontSize:'0.78rem', color:'var(--clr-muted)', marginBottom:'0.15rem' }}>From</p>
                    <p style={{ fontSize:'0.85rem', color:'var(--clr-text)', marginBottom:'0.4rem' }}>{detailOrder.pickup_address}</p>
                    <p style={{ fontSize:'0.78rem', color:'var(--clr-muted)', marginBottom:'0.15rem' }}>To</p>
                    <p style={{ fontSize:'0.85rem', color:'var(--clr-text)' }}>{detailOrder.delivery_address}</p>
                  </div>
                  {/* Pricing */}
                  <div className="glass-inner" style={{ padding:'0.75rem 1rem' }}>
                    <p style={{ fontSize:'0.7rem', color:'var(--clr-muted)', fontWeight:600, marginBottom:'0.35rem' }}>PRICING</p>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                      <span style={{ fontSize:'0.78rem', color:'var(--clr-muted)' }}>Estimated</span>
                      <span style={{ fontSize:'0.85rem', color:'var(--clr-text)', fontWeight:700 }}>{Number(detailOrder.estimated_price ?? 0).toLocaleString()} ETB</span>
                    </div>
                    {detailOrder.final_price != null && (
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:'0.25rem' }}>
                        <span style={{ fontSize:'0.78rem', color:'var(--clr-muted)' }}>Final</span>
                        <span style={{ fontSize:'0.9rem', color:'var(--clr-accent)', fontWeight:800 }}>{Number(detailOrder.final_price).toLocaleString()} ETB</span>
                      </div>
                    )}
                  </div>
                  {/* OTPs */}
                  {(detailOrder.pickup_otp || detailOrder.delivery_otp) && (
                    <div className="glass-inner" style={{ padding:'0.75rem 1rem' }}>
                      <p style={{ fontSize:'0.7rem', color:'var(--clr-muted)', fontWeight:600, marginBottom:'0.5rem' }}>ORDER OTPs</p>
                      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.5rem' }}>
                        <div style={{ textAlign:'center', padding:'0.5rem', background:'rgba(0,229,255,0.06)', borderRadius:8, border:'1px solid rgba(0,229,255,0.12)' }}>
                          <p style={{ fontSize:'0.65rem', color:'var(--clr-muted)', fontWeight:600, marginBottom:'0.15rem' }}>PICKUP OTP</p>
                          <p style={{ fontSize:'1.2rem', fontWeight:900, color:'var(--clr-accent)', letterSpacing:3 }}>{detailOrder.pickup_otp ?? '—'}</p>
                        </div>
                        <div style={{ textAlign:'center', padding:'0.5rem', background:'rgba(0,229,255,0.06)', borderRadius:8, border:'1px solid rgba(0,229,255,0.12)' }}>
                          <p style={{ fontSize:'0.65rem', color:'var(--clr-muted)', fontWeight:600, marginBottom:'0.15rem' }}>DELIVERY OTP</p>
                          <p style={{ fontSize:'1.2rem', fontWeight:900, color:'var(--clr-accent)', letterSpacing:3 }}>{detailOrder.delivery_otp ?? '—'}</p>
                        </div>
                      </div>
                    </div>
                  )}
                  {/* Description */}
                  {detailOrder.description && (
                    <div className="glass-inner" style={{ padding:'0.75rem 1rem' }}>
                      <p style={{ fontSize:'0.7rem', color:'var(--clr-muted)', fontWeight:600, marginBottom:'0.25rem' }}>NOTES</p>
                      <p style={{ fontSize:'0.82rem', color:'var(--clr-text)' }}>{detailOrder.description}</p>
                    </div>
                  )}
                  {/* Order Images */}
                  {(detailOrder.order_image_1_url || detailOrder.order_image_2_url) && (
                    <div className="glass-inner" style={{ padding:'0.75rem 1rem' }}>
                      <p style={{ fontSize:'0.7rem', color:'var(--clr-muted)', fontWeight:600, marginBottom:'0.5rem' }}>ORDER IMAGES</p>
                      <div style={{ display:'flex', gap:'0.65rem', flexWrap:'wrap' }}>
                        {detailOrder.order_image_1_url && <img src={getUploadUrl(detailOrder.order_image_1_url)!} alt="Order image 1" style={{ width:120, height:90, objectFit:'cover', borderRadius:8, border:'1px solid rgba(255,255,255,0.1)' }}/>}
                        {detailOrder.order_image_2_url && <img src={getUploadUrl(detailOrder.order_image_2_url)!} alt="Order image 2" style={{ width:120, height:90, objectFit:'cover', borderRadius:8, border:'1px solid rgba(255,255,255,0.1)' }}/>}
                      </div>
                    </div>
                  )}
                  {/* Action buttons */}
                  <div style={{ display:'flex', gap:'0.5rem', flexWrap:'wrap' }}>
                    {detailOrder.status === 'PENDING' && (
                      <button onClick={() => { setDetailOrder(null); openAssign(detailOrder) }} style={{ display:'flex', alignItems:'center', gap:'0.3rem', padding:'0.45rem 0.9rem', borderRadius:8, border:'none', background:'var(--clr-accent)', color:'#080b14', fontFamily:'inherit', fontSize:'0.8rem', fontWeight:700, cursor:'pointer' }}><LuTruck size={13}/> Assign Driver</button>
                    )}
                    {['PENDING','ASSIGNED'].includes(detailOrder.status) && (
                      <button onClick={() => { handleCancel(detailOrder); setDetailOrder(null) }} style={{ display:'flex', alignItems:'center', gap:'0.3rem', padding:'0.45rem 0.9rem', borderRadius:8, border:'1px solid rgba(248,113,113,0.3)', background:'rgba(248,113,113,0.06)', color:'#f87171', fontFamily:'inherit', fontSize:'0.8rem', fontWeight:700, cursor:'pointer' }}><LuBan size={13}/> Cancel Order</button>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Create Order on-behalf modal */}
      {createOrderModal && (
        <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) setCreateOrderModal(false) }}>
          <div className="glass modal-box" style={{ padding:'1.75rem', maxWidth:540, maxHeight:'90vh', overflowY:'auto' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1rem' }}>
              <h2 style={{ fontSize:'1rem', fontWeight:800, color:'var(--clr-text)', display:'flex', alignItems:'center', gap:'0.45rem' }}><LuPlus size={16}/> Create Order (Admin)</h2>
              <button onClick={() => setCreateOrderModal(false)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--clr-muted)' }}><LuX size={18}/></button>
            </div>
            {coErr && <div className="alert alert-error" style={{ marginBottom:'0.75rem' }}><LuTriangleAlert size={13}/> {coErr}</div>}

            {coStep === 'form' ? (
              <div style={{ display:'flex', flexDirection:'column', gap:'0.85rem' }}>
                {/* Customer type toggle */}
                <div style={{ display:'flex', gap:'0.4rem', padding:'0.25rem', background:'rgba(255,255,255,0.04)', borderRadius:10, border:'1px solid rgba(255,255,255,0.08)' }}>
                  {[{ v: false, label: '👤 Registered Shipper' }, { v: true, label: 'Guest Customer' }].map(({ v, label }) => (
                    <button key={String(v)} type="button" onClick={() => setCoIsGuest(v)}
                      style={{ flex:1, padding:'0.45rem 0.5rem', borderRadius:8, border:'none', cursor:'pointer', fontFamily:'inherit', fontSize:'0.78rem', fontWeight:700, transition:'all 0.18s',
                        background: coIsGuest === v ? 'var(--clr-accent)' : 'transparent',
                        color: coIsGuest === v ? '#000' : 'var(--clr-muted)' }}>
                      {label}
                    </button>
                  ))}
                </div>

                {/* Shipper search (registered mode) */}
                {!coIsGuest && (
                  <div>
                    <label style={{ fontSize:'0.73rem', fontWeight:600, color:'var(--clr-muted)', marginBottom:'0.3rem', display:'block' }}>Shipper (customer) *</label>
                    <input value={coForm.shipper_search} onChange={e => setCoForm(f => ({ ...f, shipper_search: e.target.value, shipper_id: '' }))} placeholder="Search by name or phone…"
                      style={{ width:'100%', padding:'0.6rem 0.8rem', borderRadius:9, border:'1px solid rgba(255,255,255,0.12)', background:'rgba(255,255,255,0.05)', color:'var(--clr-text)', fontFamily:'inherit', fontSize:'0.85rem', boxSizing:'border-box' }}/>
                    {coForm.shipper_search && !coForm.shipper_id && (
                      <div style={{ marginTop:'0.25rem', border:'1px solid rgba(255,255,255,0.1)', borderRadius:8, overflow:'hidden', maxHeight:140, overflowY:'auto' }}>
                        {shippers.filter(s => `${s.first_name} ${s.last_name} ${s.phone_number}`.toLowerCase().includes(coForm.shipper_search.toLowerCase())).map(s => (
                          <div key={s.id} onClick={() => setCoForm(f => ({ ...f, shipper_id: s.id, shipper_search: `${s.first_name} ${s.last_name} · ${s.phone_number}` }))}
                            style={{ padding:'0.5rem 0.75rem', cursor:'pointer', background:'rgba(255,255,255,0.04)', borderBottom:'1px solid rgba(255,255,255,0.06)', fontSize:'0.8rem', color:'var(--clr-text)' }}>
                            {s.first_name} {s.last_name} <span style={{ color:'var(--clr-muted)' }}>{s.phone_number}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {coForm.shipper_id && <p style={{ fontSize:'0.72rem', color:'var(--clr-accent)', marginTop:'0.2rem' }}>✓ Shipper selected</p>}
                  </div>
                )}

                {/* Guest fields */}
                {coIsGuest && (
                  <div style={{ display:'flex', flexDirection:'column', gap:'0.6rem', padding:'0.85rem', borderRadius:10, border:'1px solid rgba(0,229,255,0.15)', background:'rgba(0,229,255,0.04)' }}>
                    <p style={{ fontSize:'0.7rem', fontWeight:700, color:'var(--clr-accent)', marginBottom:'0.1rem' }}>GUEST CUSTOMER — all fields optional</p>
                    <div>
                      <label style={{ fontSize:'0.72rem', fontWeight:600, color:'var(--clr-muted)', marginBottom:'0.25rem', display:'block' }}>Name</label>
                      <input value={coGuestName} onChange={e => setCoGuestName(e.target.value)} placeholder="Auto-generated if empty"
                        style={{ width:'100%', padding:'0.6rem 0.8rem', borderRadius:9, border:'1px solid rgba(255,255,255,0.1)', background:'rgba(255,255,255,0.04)', color:'var(--clr-text)', fontFamily:'inherit', fontSize:'0.83rem', boxSizing:'border-box' }}/>
                    </div>
                    <div>
                      <label style={{ fontSize:'0.72rem', fontWeight:600, color:'var(--clr-muted)', marginBottom:'0.25rem', display:'block' }}>Phone</label>
                      <input value={coGuestPhone} onChange={e => setCoGuestPhone(e.target.value)} placeholder="Default: +251900000000"
                        style={{ width:'100%', padding:'0.6rem 0.8rem', borderRadius:9, border:'1px solid rgba(255,255,255,0.1)', background:'rgba(255,255,255,0.04)', color:'var(--clr-text)', fontFamily:'inherit', fontSize:'0.83rem', boxSizing:'border-box' }}/>
                    </div>
                    <div>
                      <label style={{ fontSize:'0.72rem', fontWeight:600, color:'var(--clr-muted)', marginBottom:'0.25rem', display:'block' }}>Email</label>
                      <input type="email" value={coGuestEmail} onChange={e => setCoGuestEmail(e.target.value)} placeholder="Default: guest@afri-logistics.com"
                        style={{ width:'100%', padding:'0.6rem 0.8rem', borderRadius:9, border:'1px solid rgba(255,255,255,0.1)', background:'rgba(255,255,255,0.04)', color:'var(--clr-text)', fontFamily:'inherit', fontSize:'0.83rem', boxSizing:'border-box' }}/>
                    </div>
                  </div>
                )}

                {/* Cargo & Vehicle */}
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.65rem' }}>
                  <div>
                    <label style={{ fontSize:'0.73rem', fontWeight:600, color:'var(--clr-muted)', marginBottom:'0.3rem', display:'block' }}>Cargo Type *</label>
                    <select value={coForm.cargo_type_id} onChange={e => setCoForm(f => ({ ...f, cargo_type_id: e.target.value }))}
                      style={{ width:'100%', padding:'0.6rem', borderRadius:9, border:'1px solid rgba(255,255,255,0.12)', background:'rgba(255,255,255,0.05)', color:'var(--clr-text)', fontFamily:'inherit', fontSize:'0.82rem', outline:'none' }}>
                      <option value="" style={{ background:'#0f172a' }}>— Select —</option>
                      {cargoTypesForCreate.map(ct => <option key={ct.id} value={ct.id} style={{ background:'#0f172a' }}>{ct.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize:'0.73rem', fontWeight:600, color:'var(--clr-muted)', marginBottom:'0.3rem', display:'block' }}>Vehicle Type *</label>
                    <select value={coForm.vehicle_type} onChange={e => setCoForm(f => ({ ...f, vehicle_type: e.target.value }))}
                      style={{ width:'100%', padding:'0.6rem', borderRadius:9, border:'1px solid rgba(255,255,255,0.12)', background:'rgba(255,255,255,0.05)', color:'var(--clr-text)', fontFamily:'inherit', fontSize:'0.82rem', outline:'none' }}>
                      <option value="" style={{ background:'#0f172a' }}>— Select —</option>
                      {VEHICLE_TYPES.map(t => <option key={t} value={t} style={{ background:'#0f172a' }}>{t}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label style={{ fontSize:'0.73rem', fontWeight:600, color:'var(--clr-muted)', marginBottom:'0.3rem', display:'block' }}>Estimated Weight (kg)</label>
                  <input type="number" min="0" step="0.1" value={coForm.estimated_weight_kg} onChange={e => setCoForm(f => ({ ...f, estimated_weight_kg: e.target.value }))} placeholder="Optional"
                    style={{ width:'100%', padding:'0.6rem 0.8rem', borderRadius:9, border:'1px solid rgba(255,255,255,0.12)', background:'rgba(255,255,255,0.05)', color:'var(--clr-text)', fontFamily:'inherit', fontSize:'0.85rem', boxSizing:'border-box' }}/>
                </div>

                {/* Pickup */}
                <div>
                  <label style={{ fontSize:'0.73rem', fontWeight:600, color:'var(--clr-muted)', marginBottom:'0.3rem', display:'block' }}>Pickup Address *</label>
                  <div style={{ display:'flex', gap:'0.4rem' }}>
                    <input value={coForm.pickup_address} onChange={e => setCoForm(f => ({ ...f, pickup_address: e.target.value, pickup_lat:'', pickup_lng:'' }))} placeholder="Enter pickup address…" onKeyDown={e => e.key==='Enter' && geocodeAddress(coForm.pickup_address,'pickup')}
                      style={{ flex:1, padding:'0.6rem 0.8rem', borderRadius:9, border:'1px solid rgba(255,255,255,0.12)', background:'rgba(255,255,255,0.05)', color:'var(--clr-text)', fontFamily:'inherit', fontSize:'0.82rem' }}/>
                    <button type="button" onClick={() => geocodeAddress(coForm.pickup_address,'pickup')} disabled={coGeoLoading==='pickup'}
                      style={{ padding:'0.6rem 0.8rem', borderRadius:9, border:'none', background:'var(--clr-accent)', color:'#000', cursor:'pointer', fontFamily:'inherit', fontSize:'0.75rem', fontWeight:700, flexShrink:0 }}>
                      {coGeoLoading==='pickup' ? '…' : 'Locate'}
                    </button>
                  </div>
                  {coForm.pickup_lat && <p style={{ fontSize:'0.7rem', color:'var(--clr-accent)', marginTop:'0.2rem' }}>✓ {coForm.pickup_lat}, {coForm.pickup_lng}</p>}
                </div>

                {/* Delivery */}
                <div>
                  <label style={{ fontSize:'0.73rem', fontWeight:600, color:'var(--clr-muted)', marginBottom:'0.3rem', display:'block' }}>Delivery Address *</label>
                  <div style={{ display:'flex', gap:'0.4rem' }}>
                    <input value={coForm.delivery_address} onChange={e => setCoForm(f => ({ ...f, delivery_address: e.target.value, delivery_lat:'', delivery_lng:'' }))} placeholder="Enter delivery address…" onKeyDown={e => e.key==='Enter' && geocodeAddress(coForm.delivery_address,'delivery')}
                      style={{ flex:1, padding:'0.6rem 0.8rem', borderRadius:9, border:'1px solid rgba(255,255,255,0.12)', background:'rgba(255,255,255,0.05)', color:'var(--clr-text)', fontFamily:'inherit', fontSize:'0.82rem' }}/>
                    <button type="button" onClick={() => geocodeAddress(coForm.delivery_address,'delivery')} disabled={coGeoLoading==='delivery'}
                      style={{ padding:'0.6rem 0.8rem', borderRadius:9, border:'none', background:'var(--clr-accent)', color:'#000', cursor:'pointer', fontFamily:'inherit', fontSize:'0.75rem', fontWeight:700, flexShrink:0 }}>
                      {coGeoLoading==='delivery' ? '…' : 'Locate'}
                    </button>
                  </div>
                  {coForm.delivery_lat && <p style={{ fontSize:'0.7rem', color:'var(--clr-accent)', marginTop:'0.2rem' }}>✓ {coForm.delivery_lat}, {coForm.delivery_lng}</p>}
                </div>

                {/* Notes */}
                <div>
                  <label style={{ fontSize:'0.73rem', fontWeight:600, color:'var(--clr-muted)', marginBottom:'0.3rem', display:'block' }}>Notes / Instructions</label>
                  <input value={coForm.special_instructions} onChange={e => setCoForm(f => ({ ...f, special_instructions: e.target.value }))} placeholder="Optional…"
                    style={{ width:'100%', padding:'0.6rem 0.8rem', borderRadius:9, border:'1px solid rgba(255,255,255,0.12)', background:'rgba(255,255,255,0.05)', color:'var(--clr-text)', fontFamily:'inherit', fontSize:'0.85rem', boxSizing:'border-box' }}/>
                </div>

                {/* Cargo image upload (optional) */}
                <div>
                  <label style={{ fontSize:'0.73rem', fontWeight:600, color:'var(--clr-muted)', marginBottom:'0.3rem', display:'block' }}>Cargo Image (optional)</label>
                  {coCargoImage ? (
                    <div style={{ position:'relative', display:'inline-block' }}>
                      <img src={coCargoImage} alt="Cargo" style={{ width:100, height:72, objectFit:'cover', borderRadius:8, border:'1px solid rgba(255,255,255,0.12)' }}/>
                      <button type="button" onClick={() => setCoCargoImage(null)} style={{ position:'absolute', top:-6, right:-6, width:20, height:20, borderRadius:'50%', border:'none', background:'#ef4444', color:'#fff', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'0.65rem' }}>✕</button>
                    </div>
                  ) : (
                    <label style={{ display:'flex', alignItems:'center', gap:'0.5rem', padding:'0.5rem 0.85rem', borderRadius:9, border:'1px dashed rgba(255,255,255,0.15)', background:'rgba(255,255,255,0.03)', cursor:'pointer', fontSize:'0.78rem', color:'var(--clr-muted)' }}>
                      <LuImage size={15}/> Click to upload image
                      <input type="file" accept="image/*" style={{ display:'none' }} onChange={e => {
                        const file = e.target.files?.[0]; if (!file) return
                        const reader = new FileReader()
                        reader.onload = ev => setCoCargoImage(ev.target?.result as string)
                        reader.readAsDataURL(file)
                      }}/>
                    </label>
                  )}
                </div>

                {/* Payment receipt upload (optional) */}
                <div>
                  <label style={{ fontSize:'0.73rem', fontWeight:600, color:'var(--clr-muted)', marginBottom:'0.3rem', display:'block' }}>Payment Receipt (optional)</label>
                  {coPaymentReceipt ? (
                    <div style={{ position:'relative', display:'inline-block' }}>
                      <img src={coPaymentReceipt} alt="Receipt" style={{ width:100, height:72, objectFit:'cover', borderRadius:8, border:'1px solid rgba(255,255,255,0.12)' }}/>
                      <button type="button" onClick={() => setCoPaymentReceipt(null)} style={{ position:'absolute', top:-6, right:-6, width:20, height:20, borderRadius:'50%', border:'none', background:'#ef4444', color:'#fff', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'0.65rem' }}>✕</button>
                    </div>
                  ) : (
                    <label style={{ display:'flex', alignItems:'center', gap:'0.5rem', padding:'0.5rem 0.85rem', borderRadius:9, border:'1px dashed rgba(255,255,255,0.15)', background:'rgba(255,255,255,0.03)', cursor:'pointer', fontSize:'0.78rem', color:'var(--clr-muted)' }}>
                      <LuFileText size={15}/> Click to upload receipt
                      <input type="file" accept="image/*,application/pdf" style={{ display:'none' }} onChange={e => {
                        const file = e.target.files?.[0]; if (!file) return
                        const reader = new FileReader()
                        reader.onload = ev => setCoPaymentReceipt(ev.target?.result as string)
                        reader.readAsDataURL(file)
                      }}/>
                    </label>
                  )}
                </div>

                {/* Assign driver (optional) */}
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.65rem' }}>
                  <div>
                    <label style={{ fontSize:'0.73rem', fontWeight:600, color:'var(--clr-muted)', marginBottom:'0.3rem', display:'block' }}>Assign Driver (optional)</label>
                    <select value={coForm.driver_id} onChange={e => {
                      const did = e.target.value
                      const autoVehicle = vehicles.find((v: AdminVehicle) => v.driver_id === did)
                      setCoForm(f => ({ ...f, driver_id: did, vehicle_id: autoVehicle?.id ?? '' }))
                    }} style={{ width:'100%', padding:'0.6rem', borderRadius:9, border:'1px solid rgba(255,255,255,0.12)', background:'rgba(255,255,255,0.05)', color:'var(--clr-text)', fontFamily:'inherit', fontSize:'0.78rem', outline:'none' }}>
                      <option value="" style={{ background:'#0f172a' }}>— None —</option>
                      {drivers.map(d => <option key={d.user_id} value={d.user_id} style={{ background:'#0f172a' }}>{d.first_name} {d.last_name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize:'0.73rem', fontWeight:600, color:'var(--clr-muted)', marginBottom:'0.3rem', display:'block' }}>Vehicle (auto-filled)</label>
                    <select value={coForm.vehicle_id} onChange={e => setCoForm(f => ({ ...f, vehicle_id: e.target.value }))}
                      style={{ width:'100%', padding:'0.6rem', borderRadius:9, border:'1px solid rgba(255,255,255,0.12)', background:'rgba(255,255,255,0.05)', color:'var(--clr-text)', fontFamily:'inherit', fontSize:'0.78rem', outline:'none' }}>
                      <option value="" style={{ background:'#0f172a' }}>— None —</option>
                      {vehicles.map(v => <option key={v.id} value={v.id} style={{ background:'#0f172a' }}>{v.plate_number} · {v.vehicle_type}</option>)}
                    </select>
                  </div>
                </div>

                <button onClick={getCoQuote} style={{ width:'100%', padding:'0.7rem', borderRadius:10, border:'none', background:'var(--clr-accent)', color:'#000', fontFamily:'inherit', fontSize:'0.88rem', fontWeight:700, cursor:'pointer', marginTop:'0.25rem' }}>
                  Get Quote →
                </button>
              </div>
            ) : (
              /* Confirm step */
              <div style={{ display:'flex', flexDirection:'column', gap:'0.85rem' }}>
                <div className="glass-inner" style={{ padding:'1rem' }}>
                  <p style={{ fontSize:'0.7rem', color:'var(--clr-muted)', fontWeight:600, marginBottom:'0.65rem' }}>PRICE BREAKDOWN</p>
                  {[
                    ['Base Fare', `${Number(coQuote?.base_fare ?? 0).toFixed(2)} ETB`],
                    ['Distance Cost', `${Number(coQuote?.distance_km ?? 0).toFixed(1)} km × ${Number(coQuote?.per_km_rate ?? 0)} ETB/km`],
                    ...(coQuote?.weight_cost ? [['Weight Cost', `${Number(coQuote.weight_cost).toFixed(2)} ETB`]] : []),
                    ...(coQuote?.fees_breakdown?.map(f => [f.name, `${Number(f.amount).toFixed(2)} ETB`]) ?? []),
                  ].map(([l, v]) => (
                    <div key={l} style={{ display:'flex', justifyContent:'space-between', fontSize:'0.82rem', marginBottom:'0.3rem' }}>
                      <span style={{ color:'var(--clr-muted)' }}>{l}</span><span style={{ color:'var(--clr-text)' }}>{v}</span>
                    </div>
                  ))}
                  <div style={{ borderTop:'1px solid rgba(255,255,255,0.1)', marginTop:'0.5rem', paddingTop:'0.5rem', display:'flex', justifyContent:'space-between' }}>
                    <span style={{ fontWeight:700, color:'var(--clr-text)' }}>Total</span>
                    <span style={{ fontWeight:800, fontSize:'1rem', color:'var(--clr-accent)' }}>{Number(coQuote?.estimated_price ?? 0).toLocaleString()} ETB</span>
                  </div>
                </div>
                {/* Show uploaded media summary */}
                {(coCargoImage || coPaymentReceipt) && (
                  <div style={{ display:'flex', gap:'0.65rem' }}>
                    {coCargoImage && <div style={{ flex:1, padding:'0.5rem 0.75rem', borderRadius:8, background:'rgba(0,229,255,0.06)', border:'1px solid rgba(0,229,255,0.15)', fontSize:'0.75rem', color:'var(--clr-accent)', display:'flex', alignItems:'center', gap:'0.4rem' }}><LuImage size={13}/> Cargo image ✓</div>}
                    {coPaymentReceipt && <div style={{ flex:1, padding:'0.5rem 0.75rem', borderRadius:8, background:'rgba(0,229,255,0.06)', border:'1px solid rgba(0,229,255,0.15)', fontSize:'0.75rem', color:'var(--clr-accent)', display:'flex', alignItems:'center', gap:'0.4rem' }}><LuFileText size={13}/> Receipt ✓</div>}
                  </div>
                )}
                {coIsGuest && (
                  <div style={{ padding:'0.6rem 0.85rem', borderRadius:8, background:'rgba(0,229,255,0.06)', border:'1px solid rgba(0,229,255,0.15)', fontSize:'0.75rem', color:'var(--clr-accent)' }}>
                    Guest order · {coGuestName || 'Auto-name'} · {coGuestPhone || 'Default phone'} · {coGuestEmail || 'Default email'}
                  </div>
                )}
                <div style={{ display:'flex', gap:'0.5rem' }}>
                  <button onClick={() => setCoStep('form')} className="btn-outline" style={{ flex:1 }}>← Back</button>
                  <button onClick={placeCoOrder} disabled={coSaving || (!coIsGuest && !coForm.shipper_id)} className="btn-primary" style={{ flex:2 }}>
                    {coSaving ? <BtnSpinner text="Creating…"/> : 'Place Order'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {toast && <div style={{ position:'fixed', bottom:'1.25rem', right:'1.25rem', zIndex:200, background:'rgba(0,229,255,0.12)', border:'1px solid rgba(0,229,255,0.25)', color:'var(--clr-text)', padding:'0.65rem 1.1rem', borderRadius:12, fontSize:'0.85rem', fontWeight:600, backdropFilter:'blur(12px)' }}>{toast}</div>}
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
  const [drivers, setDrivers] = useState<LiveDriver[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<LiveDriver | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [chatMsg, setChatMsg] = useState('')
  const [chatSending, setChatSending] = useState(false)
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
    if (d.order_id) {
      try {
        const { data } = await adminOrderApi.getOrderMessages(d.order_id, 'driver')
        setMessages(data.messages ?? [])
      } catch { setMessages([]) }
    } else { setMessages([]) }
  }

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMsg = async () => {
    if (!chatMsg.trim() || !selected?.order_id) return
    setChatSending(true)
    try {
      await adminOrderApi.sendOrderMessage(selected.order_id, chatMsg.trim(), 'driver')
      setChatMsg('')
      const { data } = await adminOrderApi.getOrderMessages(selected.order_id, 'driver')
      setMessages(data.messages ?? [])
    } catch { showToast('Failed to send message') }
    finally { setChatSending(false) }
  }

  const mapDrivers = drivers.filter(d => d.lat != null && d.lng != null)

  /** Haversine great-circle distance in km */
  function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
    const R = 6371, toRad = (d: number) => d * Math.PI / 180
    const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1)
    const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLng/2)**2
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

  /** Vehicle colour for map icons */
  const vehicleColor: Record<string, string> = {
    Truck: '#f97316', 'Mini Truck': '#f59e0b', Van: '#3b82f6', Pickup: '#8b5cf6',
    Motorcycle: '#10b981', 'Cargo Bike': '#6ee7b7', Trailer: '#ef4444',
  }
  function makeDriverIcon(d: LiveDriver) {
    const bg = vehicleColor[d.vehicle_type ?? ''] ?? '#00e5ff'
    return L.divIcon({
      className: '',
      html: `<div style="background:${bg};width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.45);font-size:13px">🚚</div>`,
      iconSize: [28, 28], iconAnchor: [14, 14],
    })
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'1.25rem' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:'0.5rem' }}>
        <h2 style={{ fontSize:'1rem', fontWeight:800, color:'var(--clr-text)', display:'flex', alignItems:'center', gap:'0.45rem' }}>
          <LuMapPin size={17}/> Live Driver Tracking
          <span style={{ fontSize:'0.7rem', color:'var(--clr-muted)', fontWeight:400, marginLeft:'0.35rem' }}>auto-refreshes every 10s</span>
        </h2>
        <button onClick={load} style={{ display:'flex', alignItems:'center', gap:'0.35rem', padding:'0.3rem 0.7rem', borderRadius:8, border:'1px solid rgba(255,255,255,0.1)', background:'rgba(255,255,255,0.04)', color:'var(--clr-muted)', fontFamily:'inherit', fontSize:'0.72rem', fontWeight:600, cursor:'pointer' }}>
          <LuRefreshCw size={12}/> Refresh
        </button>
      </div>

      {loading && drivers.length === 0 ? (
        <LoadingSpinner />
      ) : (
        <div style={{ display:'grid', gridTemplateColumns: selected ? '1fr 1fr' : '1fr', gap:'1rem' }}>
          {/* Map Panel */}
          <div style={{ display:'flex', flexDirection:'column', gap:'0.75rem' }}>
            <div style={{ borderRadius:14, overflow:'hidden', border:'1px solid rgba(255,255,255,0.09)', height:400 }}>
              <MapContainer center={[9.03, 38.74]} zoom={12} style={{ width:'100%', height:'100%' }}>
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap contributors" />
                {mapDrivers.map(d => (
                  <Marker key={d.driver_id} position={[Number(d.lat!), Number(d.lng!)]} icon={makeDriverIcon(d)} eventHandlers={{ click: () => openDriver(d) }}>
                    <Popup>
                      <strong>{d.first_name} {d.last_name}</strong><br/>
                      {d.reference_code ? `Order: ${d.reference_code}` : 'No active order'}<br/>
                      {d.status && <span style={{ color: ORDER_STATUS_COLOR[d.status] ?? '#888' }}>{ORDER_STATUS_LABEL[d.status] ?? d.status}</span>}
                    </Popup>
                  </Marker>
                ))}
                {/* Route lines for drivers with active orders */}
                {mapDrivers.filter(d => d.pickup_lat && d.delivery_lat).map(d => (
                  <Polyline key={`route-${d.driver_id}`}
                    positions={[[Number(d.pickup_lat), Number(d.pickup_lng)], [Number(d.delivery_lat), Number(d.delivery_lng)]]}
                    pathOptions={{ color: vehicleColor[d.vehicle_type ?? ''] ?? '#00e5ff', weight: 2, opacity: 0.35, dashArray: '6 4' }}
                  />
                ))}
                {/* Driver → delivery remaining line */}
                {mapDrivers.filter(d => d.delivery_lat && d.status === 'IN_TRANSIT').map(d => (
                  <Polyline key={`remaining-${d.driver_id}`}
                    positions={[[Number(d.lat), Number(d.lng)], [Number(d.delivery_lat), Number(d.delivery_lng)]]}
                    pathOptions={{ color: '#00e5ff', weight: 2.5, opacity: 0.75 }}
                  />
                ))}
              </MapContainer>
            </div>

            {/* Driver list */}
            <div className="glass-inner" style={{ overflow:'hidden' }}>
              {drivers.length === 0 ? (
                <p style={{ padding:'1.5rem', textAlign:'center', color:'var(--clr-muted)', fontSize:'0.85rem' }}>No drivers with active location data.</p>
              ) : drivers.map((d, i) => (
                <div key={d.driver_id} onClick={() => openDriver(d)}
                  style={{ display:'flex', alignItems:'center', gap:'0.75rem', padding:'0.8rem 1rem', borderBottom: i < drivers.length-1 ? '1px solid rgba(255,255,255,0.05)' : 'none', cursor:'pointer', background: selected?.driver_id === d.driver_id ? 'rgba(0,229,255,0.06)' : 'transparent', transition:'background 0.15s' }}>
                  <div style={{ width:36, height:36, borderRadius:'50%', overflow:'hidden', flexShrink:0, background: vehicleColor[d.vehicle_type ?? ''] ?? 'linear-gradient(135deg,var(--clr-accent2),var(--clr-accent))', display:'flex', alignItems:'center', justifyContent:'center' }}>
                    {d.profile_photo_url ? <img src={d.profile_photo_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }}/> : <LuTruck size={16} color="#fff"/>}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <p style={{ fontWeight:600, fontSize:'0.875rem', color:'var(--clr-text)', marginBottom:'0.1rem' }}>{d.first_name} {d.last_name}</p>
                    <p style={{ fontSize:'0.72rem', color:'var(--clr-muted)' }}>{d.phone_number}</p>
                    {d.vehicle_type && <p style={{ fontSize:'0.68rem', color: vehicleColor[d.vehicle_type] ?? 'var(--clr-muted)', fontWeight:600 }}>{d.vehicle_type}</p>}
                    {d.reference_code && <p style={{ fontSize:'0.7rem', color:'var(--clr-accent)', fontWeight:600 }}>Order: {d.reference_code}</p>}
                  </div>
                  <div style={{ textAlign:'right', flexShrink:0 }}>
                    {d.status ? orderBadge(d.status) : <span className="badge" style={{ fontSize:'0.65rem' }}>Idle</span>}
                    {d.lat != null && <p style={{ fontSize:'0.65rem', color:'var(--clr-muted)', marginTop:'0.2rem' }}><LuNavigation size={9}/> {Number(d.lat).toFixed(4)}, {Number(d.lng!).toFixed(4)}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Detail + Chat Panel */}
          {selected && (
            <div style={{ display:'flex', flexDirection:'column', gap:'0.75rem' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <p style={{ fontWeight:700, fontSize:'0.875rem', color:'var(--clr-text)' }}>{selected.first_name} {selected.last_name}</p>
                <button onClick={() => setSelected(null)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--clr-muted)' }}><LuX size={16}/></button>
              </div>

              {/* Order detail */}
              {selected.order_id ? (
                <div className="glass-inner" style={{ padding:'0.85rem', display:'flex', flexDirection:'column', gap:'0.65rem' }}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                    <span style={{ fontWeight:700, fontSize:'0.85rem', color:'var(--clr-text)' }}>{selected.reference_code}</span>
                    {selected.status && orderBadge(selected.status)}
                  </div>
                  {/* Customer */}
                  <div>
                    <p style={{ fontSize:'0.65rem', color:'var(--clr-muted)', fontWeight:600, marginBottom:'0.2rem' }}>CUSTOMER</p>
                    <p style={{ fontSize:'0.82rem', color:'var(--clr-text)', fontWeight:600 }}>
                      {selected.is_guest_order ? (selected.guest_name ?? 'Guest') : `${selected.shipper_first_name ?? ''} ${selected.shipper_last_name ?? ''}`.trim()}
                    </p>
                    {selected.shipper_phone && !selected.is_guest_order && <p style={{ fontSize:'0.72rem', color:'var(--clr-muted)' }}>{selected.shipper_phone}</p>}
                  </div>
                  {/* Route */}
                  <div>
                    <p style={{ fontSize:'0.65rem', color:'var(--clr-muted)', fontWeight:600, marginBottom:'0.2rem' }}>FROM</p>
                    <p style={{ fontSize:'0.78rem', color:'var(--clr-text)', marginBottom:'0.3rem' }}>{selected.pickup_address ?? '—'}</p>
                    <p style={{ fontSize:'0.65rem', color:'var(--clr-muted)', fontWeight:600, marginBottom:'0.2rem' }}>TO</p>
                    <p style={{ fontSize:'0.78rem', color:'var(--clr-text)' }}>{selected.delivery_address ?? '—'}</p>
                  </div>
                  {/* Cargo */}
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.4rem' }}>
                    <div>
                      <p style={{ fontSize:'0.65rem', color:'var(--clr-muted)' }}>Cargo</p>
                      <div style={{ display:'flex', alignItems:'center', gap:'0.35rem' }}>
                        <CargoIcon icon={selected.cargo_type_icon} iconUrl={selected.cargo_type_icon_url} size={14}/>
                        <p style={{ fontSize:'0.78rem', color:'var(--clr-text)', fontWeight:600 }}>{selected.cargo_type_name ?? '—'}</p>
                      </div>
                    </div>
                    <div><p style={{ fontSize:'0.65rem', color:'var(--clr-muted)' }}>Vehicle</p><p style={{ fontSize:'0.78rem', color:'var(--clr-text)', fontWeight:600 }}>{selected.vehicle_type ?? '—'}</p></div>
                    {selected.estimated_weight_kg != null && <div><p style={{ fontSize:'0.65rem', color:'var(--clr-muted)' }}>Weight</p><p style={{ fontSize:'0.78rem', color:'var(--clr-text)', fontWeight:600 }}>{selected.estimated_weight_kg} kg</p></div>}
                    {selected.distance_km != null && <div><p style={{ fontSize:'0.65rem', color:'var(--clr-muted)' }}>Distance</p><p style={{ fontSize:'0.78rem', color:'var(--clr-text)', fontWeight:600 }}>{Number(selected.distance_km).toFixed(1)} km</p></div>}
                  </div>
                  {/* Progress */}
                  {(() => {
                    const prog = driverProgress(selected)
                    if (!prog) return null
                    return (
                      <div style={{ background:'rgba(0,229,255,0.05)', borderRadius:8, border:'1px solid rgba(0,229,255,0.12)', padding:'0.5rem 0.65rem' }}>
                        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'0.35rem' }}>
                          <span style={{ fontSize:'0.65rem', color:'var(--clr-muted)', fontWeight:600 }}>TRIP PROGRESS</span>
                          <span style={{ fontSize:'0.72rem', color:'var(--clr-accent)', fontWeight:800 }}>{prog.pct}%</span>
                        </div>
                        <div style={{ height:6, borderRadius:3, background:'rgba(255,255,255,0.08)', overflow:'hidden' }}>
                          <div style={{ height:'100%', width:`${prog.pct}%`, background:'var(--clr-accent)', borderRadius:3, transition:'width 0.4s' }}/>
                        </div>
                        <div style={{ display:'flex', justifyContent:'space-between', marginTop:'0.35rem' }}>
                          <span style={{ fontSize:'0.65rem', color:'var(--clr-muted)' }}>Driven: <strong style={{ color:'var(--clr-text)' }}>{prog.kmDriven.toFixed(1)} km</strong></span>
                          <span style={{ fontSize:'0.65rem', color:'var(--clr-muted)' }}>Left: <strong style={{ color:'var(--clr-accent)' }}>{prog.kmLeft.toFixed(1)} km</strong></span>
                        </div>
                        {selected.speed_kmh != null && (
                          <p style={{ fontSize:'0.65rem', color:'var(--clr-muted)', marginTop:'0.2rem' }}>Speed: <strong style={{ color:'var(--clr-text)' }}>{Number(selected.speed_kmh).toFixed(0)} km/h</strong></p>
                        )}
                      </div>
                    )
                  })()}
                  {/* OTPs */}
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.5rem', padding:'0.6rem', background:'rgba(0,229,255,0.06)', borderRadius:8, border:'1px solid rgba(0,229,255,0.12)' }}>
                    <div style={{ textAlign:'center' }}>
                      <p style={{ fontSize:'0.65rem', color:'var(--clr-muted)', fontWeight:600, marginBottom:'0.15rem' }}>PICKUP OTP</p>
                      <p style={{ fontSize:'1.1rem', fontWeight:900, color:'var(--clr-accent)', letterSpacing:2 }}>{selected.pickup_otp ?? '—'}</p>
                    </div>
                    <div style={{ textAlign:'center' }}>
                      <p style={{ fontSize:'0.65rem', color:'var(--clr-muted)', fontWeight:600, marginBottom:'0.15rem' }}>DELIVERY OTP</p>
                      <p style={{ fontSize:'1.1rem', fontWeight:900, color:'var(--clr-accent)', letterSpacing:2 }}>{selected.delivery_otp ?? '—'}</p>
                    </div>
                  </div>
                  {/* Price */}
                  <div style={{ display:'flex', justifyContent:'space-between' }}>
                    <span style={{ fontSize:'0.72rem', color:'var(--clr-muted)' }}>Price</span>
                    <span style={{ fontSize:'0.85rem', fontWeight:800, color:'var(--clr-accent)' }}>
                      {(selected.final_price ?? selected.estimated_price ?? 0).toLocaleString()} ETB
                    </span>
                  </div>
                </div>
              ) : (
                <div className="glass-inner" style={{ padding:'1rem', textAlign:'center', color:'var(--clr-muted)', fontSize:'0.82rem' }}>No active order</div>
              )}

              {/* Chat */}
              {selected.order_id && (
                <div className="glass-inner" style={{ display:'flex', flexDirection:'column', gap:'0', overflow:'hidden' }}>
                  <div style={{ padding:'0.6rem 0.85rem', borderBottom:'1px solid rgba(255,255,255,0.07)', display:'flex', alignItems:'center', gap:'0.4rem' }}>
                    <LuMessageSquare size={14} style={{ color:'var(--clr-accent)' }}/>
                    <span style={{ fontSize:'0.78rem', fontWeight:700, color:'var(--clr-text)' }}>Chat with Driver</span>
                  </div>
                  <div style={{ height:180, overflowY:'auto', padding:'0.65rem 0.85rem', display:'flex', flexDirection:'column', gap:'0.5rem' }}>
                    {messages.length === 0 ? (
                      <p style={{ color:'var(--clr-muted)', fontSize:'0.78rem', textAlign:'center', margin:'auto' }}>No messages yet</p>
                    ) : messages.map(m => (
                      <div key={m.id} style={{ display:'flex', flexDirection:'column', alignItems: m.sender_role === 'Driver' ? 'flex-start' : 'flex-end' }}>
                        <div style={{ maxWidth:'85%', padding:'0.45rem 0.75rem', borderRadius:10, fontSize:'0.8rem', color:'var(--clr-text)',
                          background: m.sender_role === 'Driver' ? 'rgba(255,255,255,0.07)' : 'rgba(0,229,255,0.12)',
                          border: m.sender_role === 'Driver' ? '1px solid rgba(255,255,255,0.09)' : '1px solid rgba(0,229,255,0.18)' }}>
                          {m.message}
                        </div>
                        <span style={{ fontSize:'0.62rem', color:'var(--clr-muted)', marginTop:'0.1rem' }}>{m.sender_name}</span>
                      </div>
                    ))}
                    <div ref={chatEndRef}/>
                  </div>
                  <div style={{ padding:'0.55rem 0.85rem', borderTop:'1px solid rgba(255,255,255,0.07)', display:'flex', gap:'0.5rem' }}>
                    <input value={chatMsg} onChange={e => setChatMsg(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg() } }}
                      placeholder="Message driver…"
                      style={{ flex:1, padding:'0.45rem 0.7rem', borderRadius:8, border:'1px solid rgba(255,255,255,0.1)', background:'rgba(255,255,255,0.04)', color:'var(--clr-text)', fontFamily:'inherit', fontSize:'0.8rem', outline:'none' }}/>
                    <button onClick={sendMsg} disabled={chatSending || !chatMsg.trim()}
                      style={{ padding:'0.45rem 0.75rem', borderRadius:8, border:'none', background:'var(--clr-accent)', color:'#000', cursor:'pointer', display:'flex', alignItems:'center', gap:'0.3rem', fontFamily:'inherit', fontSize:'0.78rem', fontWeight:700, opacity: (!chatMsg.trim() || chatSending) ? 0.5 : 1 }}>
                      <LuSend size={13}/>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {toast && <div style={{ position:'fixed', bottom:'1.25rem', right:'1.25rem', zIndex:200, background:'rgba(0,229,255,0.12)', border:'1px solid rgba(0,229,255,0.25)', color:'var(--clr-text)', padding:'0.65rem 1.1rem', borderRadius:12, fontSize:'0.85rem', fontWeight:600, backdropFilter:'blur(12px)' }}>{toast}</div>}
    </div>
  )
}

// ─── Admin Guest Orders Section ───────────────────────────────────────────────

function AdminGuestOrdersSection() {
  const [orders, setOrders] = useState<AdminOrder[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const LIMIT = 20
  const [detailOrder, setDetailOrder] = useState<any | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [toast, setToast] = useState('')
  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3000) }

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

  const totalPages = Math.max(1, Math.ceil(total / LIMIT))

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'1.25rem' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:'0.5rem' }}>
        <h2 style={{ fontSize:'1rem', fontWeight:800, color:'var(--clr-text)', display:'flex', alignItems:'center', gap:'0.45rem' }}>
          <LuUsers size={17}/> Guest Orders
          {total > 0 && <span className="badge badge-cyan" style={{ fontSize:'0.67rem' }}>{total}</span>}
        </h2>
        <button onClick={() => load(page, search)} style={{ display:'flex', alignItems:'center', gap:'0.35rem', padding:'0.3rem 0.7rem', borderRadius:8, border:'1px solid rgba(255,255,255,0.1)', background:'rgba(255,255,255,0.04)', color:'var(--clr-muted)', fontFamily:'inherit', fontSize:'0.72rem', fontWeight:600, cursor:'pointer' }}>
          <LuRefreshCw size={12}/> Refresh
        </button>
      </div>

      {/* Search */}
      <div className="glass" style={{ padding:'0.75rem 1rem', display:'flex', gap:'0.5rem', alignItems:'center' }}>
        <LuSearch size={13} style={{ color:'var(--clr-muted)', flexShrink:0 }}/>
        <input value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
          onKeyDown={e => e.key === 'Enter' && load(1, search)}
          placeholder="Search by ref code, guest name, or phone…"
          style={{ flex:1, background:'none', border:'none', color:'var(--clr-text)', fontFamily:'inherit', fontSize:'0.8rem', outline:'none' }}/>
        {search && <button onClick={() => { setSearch(''); setPage(1); load(1, '') }} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--clr-muted)', padding:0, display:'flex', alignItems:'center' }}><LuX size={12}/></button>}
        <button onClick={() => load(1, search)} style={{ padding:'0.3rem 0.7rem', borderRadius:7, border:'none', background:'var(--clr-accent)', color:'#000', fontFamily:'inherit', fontSize:'0.72rem', fontWeight:700, cursor:'pointer' }}>Search</button>
      </div>

      {/* List */}
      <div className="glass-inner" style={{ overflow:'hidden' }}>
        {loading ? <LoadingSpinner /> : orders.length === 0 ? (
          <p style={{ padding:'2rem', textAlign:'center', color:'var(--clr-muted)', fontSize:'0.875rem' }}>No guest orders found.</p>
        ) : orders.map((o, i) => (
          <div key={o.id} onClick={() => openDetail(o.id)}
            style={{ display:'flex', alignItems:'flex-start', gap:'0.75rem', padding:'0.85rem 1rem', borderBottom: i < orders.length-1 ? '1px solid rgba(255,255,255,0.05)' : 'none', cursor:'pointer', transition:'background 0.15s' }}>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ display:'flex', alignItems:'center', gap:'0.45rem', flexWrap:'wrap', marginBottom:'0.2rem' }}>
                <span style={{ fontWeight:700, fontSize:'0.875rem', color:'var(--clr-text)' }}>{o.reference_code}</span>
                {orderBadge(o.status)}
                <span className="badge" style={{ fontSize:'0.62rem', background:'rgba(168,85,247,0.15)', color:'#c084fc', border:'1px solid rgba(168,85,247,0.25)' }}>Guest</span>
              </div>
              <p style={{ fontSize:'0.73rem', color:'var(--clr-muted)', marginBottom:'0.1rem' }}>
                {(o as any).guest_name ?? 'Unknown'} · {(o as any).guest_phone ?? '—'}
              </p>
              <p style={{ fontSize:'0.7rem', color:'var(--clr-muted)' }}>{o.pickup_address} → {o.delivery_address}</p>
            </div>
            <div style={{ textAlign:'right', flexShrink:0 }}>
              <span style={{ fontWeight:800, fontSize:'0.88rem', color:'var(--clr-accent)' }}>{(o.final_price ?? o.estimated_price).toLocaleString()} ETB</span>
              <p style={{ fontSize:'0.65rem', color:'var(--clr-muted)', marginTop:'0.2rem' }}>{new Date(o.created_at).toLocaleDateString()}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display:'flex', justifyContent:'center', alignItems:'center', gap:'0.5rem' }}>
          <button onClick={() => setPage(p => Math.max(1,p-1))} disabled={page===1} style={{ padding:'0.3rem 0.6rem', borderRadius:7, border:'1px solid rgba(255,255,255,0.1)', background:'rgba(255,255,255,0.04)', color:'var(--clr-muted)', cursor:'pointer', opacity:page===1?0.4:1 }}>‹</button>
          <span style={{ fontSize:'0.78rem', color:'var(--clr-muted)' }}>Page {page} of {totalPages} · {total} total</span>
          <button onClick={() => setPage(p => Math.min(totalPages,p+1))} disabled={page===totalPages} style={{ padding:'0.3rem 0.6rem', borderRadius:7, border:'1px solid rgba(255,255,255,0.1)', background:'rgba(255,255,255,0.04)', color:'var(--clr-muted)', cursor:'pointer', opacity:page===totalPages?0.4:1 }}>›</button>
        </div>
      )}

      {/* Detail modal */}
      {(loadingDetail || detailOrder) && (
        <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) { setDetailOrder(null); setLoadingDetail(false) } }}>
          <div className="glass modal-box" style={{ padding:'1.75rem', maxWidth:480, maxHeight:'85vh', overflowY:'auto' }}>
            {loadingDetail && !detailOrder ? <div style={{ textAlign:'center', padding:'2rem' }}><LoadingSpinner /></div>
            : detailOrder && (
              <>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'1rem' }}>
                  <div>
                    <h2 style={{ fontSize:'1rem', fontWeight:800, color:'var(--clr-text)', marginBottom:'0.25rem' }}>{detailOrder.reference_code}</h2>
                    <div style={{ display:'flex', gap:'0.4rem', flexWrap:'wrap', alignItems:'center' }}>
                      {orderBadge(detailOrder.status)}
                      <span className="badge" style={{ fontSize:'0.62rem', background:'rgba(168,85,247,0.15)', color:'#c084fc', border:'1px solid rgba(168,85,247,0.25)' }}>Guest Order</span>
                    </div>
                  </div>
                  <button onClick={() => setDetailOrder(null)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--clr-muted)', padding:'0.2rem' }}><LuX size={18}/></button>
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:'0.75rem' }}>
                  {/* Guest info */}
                  <div className="glass-inner" style={{ padding:'0.75rem 1rem' }}>
                    <p style={{ fontSize:'0.7rem', color:'var(--clr-muted)', fontWeight:600, marginBottom:'0.35rem' }}>GUEST CUSTOMER</p>
                    <p style={{ fontSize:'0.875rem', color:'var(--clr-text)', fontWeight:600 }}>{detailOrder.guest_name ?? 'Unknown Guest'}</p>
                    {detailOrder.guest_phone && <p style={{ fontSize:'0.78rem', color:'var(--clr-muted)' }}>{detailOrder.guest_phone}</p>}
                    {detailOrder.guest_email && <p style={{ fontSize:'0.78rem', color:'var(--clr-muted)' }}>{detailOrder.guest_email}</p>}
                  </div>
                  {/* Driver */}
                  {detailOrder.driver_first_name && (
                    <div className="glass-inner" style={{ padding:'0.75rem 1rem' }}>
                      <p style={{ fontSize:'0.7rem', color:'var(--clr-muted)', fontWeight:600, marginBottom:'0.35rem' }}>DRIVER</p>
                      <p style={{ fontSize:'0.875rem', color:'var(--clr-text)', fontWeight:600 }}>{detailOrder.driver_first_name} {detailOrder.driver_last_name}</p>
                      {detailOrder.driver_phone && <p style={{ fontSize:'0.78rem', color:'var(--clr-muted)' }}>{detailOrder.driver_phone}</p>}
                    </div>
                  )}
                  {/* Route */}
                  <div className="glass-inner" style={{ padding:'0.75rem 1rem' }}>
                    <p style={{ fontSize:'0.7rem', color:'var(--clr-muted)', fontWeight:600, marginBottom:'0.35rem' }}>ROUTE</p>
                    <p style={{ fontSize:'0.78rem', color:'var(--clr-muted)', marginBottom:'0.1rem' }}>From</p>
                    <p style={{ fontSize:'0.85rem', color:'var(--clr-text)', marginBottom:'0.4rem' }}>{detailOrder.pickup_address}</p>
                    <p style={{ fontSize:'0.78rem', color:'var(--clr-muted)', marginBottom:'0.1rem' }}>To</p>
                    <p style={{ fontSize:'0.85rem', color:'var(--clr-text)' }}>{detailOrder.delivery_address}</p>
                  </div>
                  {/* Cargo */}
                  <div className="glass-inner" style={{ padding:'0.75rem 1rem' }}>
                    <p style={{ fontSize:'0.7rem', color:'var(--clr-muted)', fontWeight:600, marginBottom:'0.5rem' }}>SHIPMENT</p>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.5rem 1rem' }}>
                      <div><p style={{ fontSize:'0.7rem', color:'var(--clr-muted)' }}>Cargo Type</p><div style={{ display:'flex', alignItems:'center', gap:'0.4rem', marginTop:'0.15rem' }}><CargoIcon icon={detailOrder.cargo_type_icon} iconUrl={detailOrder.cargo_type_icon_url} size={16}/><p style={{ fontSize:'0.82rem', color:'var(--clr-text)', fontWeight:600 }}>{detailOrder.cargo_type_name ?? '—'}</p></div></div>
                      <div><p style={{ fontSize:'0.7rem', color:'var(--clr-muted)' }}>Vehicle</p><p style={{ fontSize:'0.82rem', color:'var(--clr-text)', fontWeight:600 }}>{detailOrder.vehicle_type ?? '—'}</p></div>
                      {detailOrder.estimated_weight_kg != null && <div><p style={{ fontSize:'0.7rem', color:'var(--clr-muted)' }}>Weight</p><p style={{ fontSize:'0.82rem', color:'var(--clr-text)', fontWeight:600 }}>{detailOrder.estimated_weight_kg} kg</p></div>}
                      {detailOrder.distance_km != null && <div><p style={{ fontSize:'0.7rem', color:'var(--clr-muted)' }}>Distance</p><p style={{ fontSize:'0.82rem', color:'var(--clr-text)', fontWeight:600 }}>{Number(detailOrder.distance_km).toFixed(1)} km</p></div>}
                    </div>
                  </div>
                  {/* OTPs */}
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.5rem', padding:'0.7rem', background:'rgba(0,229,255,0.06)', borderRadius:8, border:'1px solid rgba(0,229,255,0.12)' }}>
                    <div style={{ textAlign:'center' }}>
                      <p style={{ fontSize:'0.65rem', color:'var(--clr-muted)', fontWeight:600, marginBottom:'0.2rem' }}>PICKUP OTP</p>
                      <p style={{ fontSize:'1.1rem', fontWeight:900, color:'var(--clr-accent)', letterSpacing:2 }}>{detailOrder.pickup_otp ?? '—'}</p>
                    </div>
                    <div style={{ textAlign:'center' }}>
                      <p style={{ fontSize:'0.65rem', color:'var(--clr-muted)', fontWeight:600, marginBottom:'0.2rem' }}>DELIVERY OTP</p>
                      <p style={{ fontSize:'1.1rem', fontWeight:900, color:'var(--clr-accent)', letterSpacing:2 }}>{detailOrder.delivery_otp ?? '—'}</p>
                    </div>
                  </div>
                  {/* Pricing */}
                  <div className="glass-inner" style={{ padding:'0.75rem 1rem' }}>
                    <p style={{ fontSize:'0.7rem', color:'var(--clr-muted)', fontWeight:600, marginBottom:'0.35rem' }}>PRICING</p>
                    <div style={{ display:'flex', justifyContent:'space-between' }}>
                      <span style={{ fontSize:'0.78rem', color:'var(--clr-muted)' }}>Estimated</span>
                      <span style={{ fontSize:'0.85rem', color:'var(--clr-text)', fontWeight:700 }}>{Number(detailOrder.estimated_price ?? 0).toLocaleString()} ETB</span>
                    </div>
                    {detailOrder.final_price != null && (
                      <div style={{ display:'flex', justifyContent:'space-between', marginTop:'0.25rem' }}>
                        <span style={{ fontSize:'0.78rem', color:'var(--clr-muted)' }}>Final</span>
                        <span style={{ fontSize:'0.9rem', color:'var(--clr-accent)', fontWeight:800 }}>{Number(detailOrder.final_price).toLocaleString()} ETB</span>
                      </div>
                    )}
                  </div>
                  {/* Media */}
                  {(detailOrder.cargo_image_url || detailOrder.payment_receipt_url) && (
                    <div className="glass-inner" style={{ padding:'0.75rem 1rem' }}>
                      <p style={{ fontSize:'0.7rem', color:'var(--clr-muted)', fontWeight:600, marginBottom:'0.5rem' }}>ATTACHMENTS</p>
                      <div style={{ display:'flex', gap:'0.65rem', flexWrap:'wrap' }}>
                        {detailOrder.cargo_image_url && (
                          <div style={{ textAlign:'center' }}>
                            <img src={getUploadUrl(detailOrder.cargo_image_url)!} alt="Cargo" style={{ width:120, height:90, objectFit:'cover', borderRadius:8, border:'1px solid rgba(255,255,255,0.1)' }}/>
                            <p style={{ fontSize:'0.65rem', color:'var(--clr-muted)', marginTop:'0.2rem' }}>Cargo Image</p>
                          </div>
                        )}
                        {detailOrder.payment_receipt_url && (
                          <div style={{ textAlign:'center' }}>
                            <img src={getUploadUrl(detailOrder.payment_receipt_url)!} alt="Receipt" style={{ width:120, height:90, objectFit:'cover', borderRadius:8, border:'1px solid rgba(255,255,255,0.1)' }}/>
                            <p style={{ fontSize:'0.65rem', color:'var(--clr-muted)', marginTop:'0.2rem' }}>Payment Receipt</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {toast && <div style={{ position:'fixed', bottom:'1.25rem', right:'1.25rem', zIndex:200, background:'rgba(0,229,255,0.12)', border:'1px solid rgba(0,229,255,0.25)', color:'var(--clr-text)', padding:'0.65rem 1.1rem', borderRadius:12, fontSize:'0.85rem', fontWeight:600, backdropFilter:'blur(12px)' }}>{toast}</div>}
    </div>
  )
}

// ─── Admin Cargo Types Section ────────────────────────────────────────────────

interface CargoType { id: number; name: string; description: string | null; requires_special_handling: number; icon: string | null; icon_url: string | null; is_active: number }

function AdminCargoTypesSection() {
  const [items, setItems] = useState<CargoType[]>([])
  const [loading, setLoading] = useState(false)
  const [modal, setModal] = useState<'create' | 'edit' | null>(null)
  const [editTarget, setEditTarget] = useState<CargoType | null>(null)
  const [form, setForm] = useState({ name:'', description:'', requires_special_handling: false, icon:'', icon_url:'', is_active: true })
  const [formErr, setFormErr] = useState('')
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState('')
  const [iconMode, setIconMode] = useState<'preset'|'custom'>('preset')
  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3000) }

  const PRESET_ICONS: Array<{ label: string; icon: React.ReactNode; name: string }> = [
    { label:'General', name:'LuPackage', icon:<LuPackage size={20}/> },
    { label:'Box', name:'LuBox', icon:<LuBox size={20}/> },
    { label:'Freight', name:'LuTruck', icon:<LuTruck size={20}/> },
    { label:'Archive', name:'LuArchive', icon:<LuArchive size={20}/> },
    { label:'Fragile', name:'LuHeart', icon:<LuHeart size={20}/> },
    { label:'Electronic', name:'LuMonitor', icon:<LuMonitor size={20}/> },
    { label:'Hazardous', name:'LuTriangleAlert', icon:<LuTriangleAlert size={20}/> },
    { label:'Temp. Sensitive', name:'LuThermometer', icon:<LuThermometer size={20}/> },
    { label:'Organic', name:'LuLeaf', icon:<LuLeaf size={20}/> },
    { label:'Flammable', name:'LuFlame', icon:<LuFlame size={20}/> },
    { label:'Valuable', name:'LuGem', icon:<LuGem size={20}/> },
    { label:'Perishable', name:'LuFish', icon:<LuFish size={20}/> },
  ]

  const load = async () => {
    setLoading(true)
    try { const { data } = await adminOrderApi.listCargoTypes(); setItems(data.cargo_types ?? []) }
    catch { showToast('Failed to load') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, []) // eslint-disable-line

  const openCreate = () => { setForm({ name:'', description:'', requires_special_handling:false, icon:'', icon_url:'', is_active:true }); setIconMode('preset'); setFormErr(''); setEditTarget(null); setModal('create') }
  const openEdit = (c: CargoType) => { setForm({ name:c.name, description:c.description??'', requires_special_handling:!!c.requires_special_handling, icon:c.icon??'', icon_url:c.icon_url??'', is_active:!!c.is_active }); setIconMode(c.icon_url ? 'custom' : 'preset'); setFormErr(''); setEditTarget(c); setModal('edit') }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) { setFormErr('Name required'); return }
    setFormErr(''); setSaving(true)
    try {
      if (modal === 'create') {
        await adminOrderApi.createCargoType({ name:form.name.trim(), description:form.description||undefined, requires_special_handling:form.requires_special_handling, icon:iconMode==='preset'?form.icon||undefined:undefined, icon_url:iconMode==='custom'?form.icon_url||undefined:undefined })
        showToast('Cargo type created.')
      } else if (editTarget) {
        await adminOrderApi.updateCargoType(editTarget.id, { name:form.name.trim(), description:form.description||undefined, requires_special_handling:form.requires_special_handling, icon:iconMode==='preset'?form.icon||undefined:undefined, icon_url:iconMode==='custom'?form.icon_url||undefined:undefined, is_active:form.is_active })
        showToast('Updated.')
      }
      setModal(null); load()
    } catch (err: any) { setFormErr(err.response?.data?.message ?? 'Failed') }
    finally { setSaving(false) }
  }

  const inputStyle: React.CSSProperties = { width:'100%', padding:'0.6rem 0.8rem', borderRadius:9, border:'1px solid rgba(255,255,255,0.12)', background:'rgba(255,255,255,0.05)', color:'var(--clr-text)', fontFamily:'inherit', fontSize:'0.85rem', boxSizing:'border-box' }
  const labelStyle: React.CSSProperties = { fontSize:'0.73rem', fontWeight:600, color:'var(--clr-muted)', marginBottom:'0.3rem', display:'block' }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'1.25rem' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:'0.5rem' }}>
        <h2 style={{ fontSize:'1rem', fontWeight:800, color:'var(--clr-text)', display:'flex', alignItems:'center', gap:'0.45rem' }}><LuBox size={17}/> Cargo Types</h2>
        <div style={{ display:'flex', gap:'0.5rem' }}>
          <button onClick={load} style={{ display:'flex', alignItems:'center', gap:'0.35rem', padding:'0.3rem 0.7rem', borderRadius:8, border:'1px solid rgba(255,255,255,0.1)', background:'rgba(255,255,255,0.04)', color:'var(--clr-muted)', fontFamily:'inherit', fontSize:'0.72rem', fontWeight:600, cursor:'pointer' }}><LuRefreshCw size={12}/></button>
          <button onClick={openCreate} style={{ display:'flex', alignItems:'center', gap:'0.4rem', padding:'0.38rem 0.85rem', borderRadius:8, border:'none', background:'var(--clr-accent)', color:'#000', fontFamily:'inherit', fontSize:'0.8rem', fontWeight:700, cursor:'pointer' }}><LuPlus size={14}/> Add</button>
        </div>
      </div>
      {loading ? <LoadingSpinner /> : (
        <div className="glass-inner" style={{ overflow:'hidden' }}>
          {items.length === 0 ? <p style={{ padding:'2rem', textAlign:'center', color:'var(--clr-muted)' }}>No cargo types.</p>
          : items.map((c, i) => (
            <div key={c.id} style={{ display:'flex', alignItems:'center', gap:'0.75rem', padding:'0.75rem 1rem', borderBottom: i < items.length-1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
              <div style={{ width:36, height:36, borderRadius:8, background:'rgba(0,229,255,0.08)', border:'1px solid rgba(0,229,255,0.15)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, color:'var(--clr-accent)', fontSize:'1rem' }}>
                <CargoIcon icon={c.icon} iconUrl={c.icon_url} size={18}/>
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ display:'flex', alignItems:'center', gap:'0.4rem', flexWrap:'wrap' }}>
                  <span style={{ fontWeight:700, fontSize:'0.875rem', color:'var(--clr-text)' }}>{c.name}</span>
                  {!c.is_active && <span className="badge badge-red" style={{ fontSize:'0.65rem' }}>Inactive</span>}
                  {!!c.requires_special_handling && <span className="badge badge-purple" style={{ fontSize:'0.65rem' }}>Special Handling</span>}
                </div>
                {c.description && <p style={{ fontSize:'0.73rem', color:'var(--clr-muted)', marginTop:'0.1rem' }}>{c.description}</p>}
              </div>
              <button onClick={() => openEdit(c)} style={{ padding:'0.28rem 0.55rem', borderRadius:7, border:'1px solid rgba(255,255,255,0.12)', background:'rgba(255,255,255,0.05)', color:'var(--clr-muted)', fontFamily:'inherit', fontSize:'0.7rem', cursor:'pointer', display:'flex', alignItems:'center', gap:'0.3rem' }}><LuPencil size={11}/> Edit</button>
            </div>
          ))}
        </div>
      )}

      {(modal === 'create' || modal === 'edit') && (
        <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) setModal(null) }}>
          <div className="glass modal-box" style={{ padding:'1.75rem', maxWidth:420 }}>
            <h2 style={{ fontSize:'1rem', fontWeight:800, color:'var(--clr-text)', marginBottom:'1rem' }}>{modal === 'create' ? 'Add Cargo Type' : 'Edit Cargo Type'}</h2>
            <form onSubmit={handleSave} style={{ display:'flex', flexDirection:'column', gap:'0.75rem' }}>
              {formErr && <div className="alert alert-error"><LuTriangleAlert size={13}/> {formErr}</div>}
              <div><label style={labelStyle}>Name *</label><input style={inputStyle} value={form.name} onChange={e => setForm(f => ({ ...f, name:e.target.value }))} required/></div>
              <div><label style={labelStyle}>Description</label><input style={inputStyle} value={form.description} onChange={e => setForm(f => ({ ...f, description:e.target.value }))}/></div>
              {/* Icon picker */}
              <div>
                <label style={labelStyle}>Icon</label>
                <div style={{ display:'flex', gap:'0.5rem', marginBottom:'0.6rem' }}>
                  <button type="button" onClick={() => setIconMode('preset')} style={{ flex:1, padding:'0.4rem', borderRadius:7, border:`1px solid ${iconMode==='preset'?'var(--clr-accent)':'rgba(255,255,255,0.1)'}`, background:iconMode==='preset'?'rgba(0,229,255,0.1)':'rgba(255,255,255,0.04)', color:iconMode==='preset'?'var(--clr-accent)':'var(--clr-muted)', fontFamily:'inherit', fontSize:'0.75rem', fontWeight:600, cursor:'pointer' }}>Preset Icons</button>
                  <button type="button" onClick={() => setIconMode('custom')} style={{ flex:1, padding:'0.4rem', borderRadius:7, border:`1px solid ${iconMode==='custom'?'var(--clr-accent)':'rgba(255,255,255,0.1)'}`, background:iconMode==='custom'?'rgba(0,229,255,0.1)':'rgba(255,255,255,0.04)', color:iconMode==='custom'?'var(--clr-accent)':'var(--clr-muted)', fontFamily:'inherit', fontSize:'0.75rem', fontWeight:600, cursor:'pointer' }}><LuImage size={12}/> Custom Image</button>
                </div>
                {iconMode === 'preset' ? (
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'0.4rem' }}>
                    {PRESET_ICONS.map(p => (
                      <button key={p.name} type="button" onClick={() => setForm(f => ({ ...f, icon:p.name }))}
                        style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:'0.2rem', padding:'0.5rem 0.25rem', borderRadius:8, border:`1px solid ${form.icon===p.name?'var(--clr-accent)':'rgba(255,255,255,0.08)'}`, background:form.icon===p.name?'rgba(0,229,255,0.12)':'rgba(255,255,255,0.03)', color:form.icon===p.name?'var(--clr-accent)':'var(--clr-muted)', cursor:'pointer', fontFamily:'inherit', fontSize:'0.6rem', fontWeight:600 }}>
                        {p.icon}
                        <span style={{ lineHeight:1.1, textAlign:'center' }}>{p.label}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div>
                    {form.icon_url && <img src={form.icon_url} alt="icon preview" style={{ width:56, height:56, borderRadius:8, objectFit:'cover', border:'1px solid rgba(255,255,255,0.1)', marginBottom:'0.4rem' }}/>}
                    <label style={{ display:'flex', alignItems:'center', gap:'0.5rem', padding:'0.5rem 0.75rem', borderRadius:8, border:'1px dashed rgba(255,255,255,0.2)', background:'rgba(255,255,255,0.03)', color:'var(--clr-muted)', cursor:'pointer', fontSize:'0.78rem' }}>
                      <LuImage size={14}/> {form.icon_url ? 'Change image' : 'Upload image'}
                      <input type="file" accept="image/*" style={{ display:'none' }} onChange={e => {
                        const file = e.target.files?.[0]; if (!file) return
                        const reader = new FileReader()
                        reader.onload = ev => setForm(f => ({ ...f, icon_url: ev.target?.result as string }))
                        reader.readAsDataURL(file)
                      }}/>
                    </label>
                  </div>
                )}
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:'0.65rem' }}>
                <button type="button" onClick={() => setForm(f => ({ ...f, requires_special_handling: !f.requires_special_handling }))}
                  style={{ width:38, height:22, borderRadius:99, border:'none', cursor:'pointer', background: form.requires_special_handling ? 'var(--clr-accent)' : 'rgba(255,255,255,0.12)', transition:'background 0.2s', flexShrink:0, position:'relative' }}>
                  <span style={{ position:'absolute', top:2, left: form.requires_special_handling ? 18 : 2, width:18, height:18, borderRadius:'50%', background: form.requires_special_handling ? '#080b14' : 'var(--clr-muted)', transition:'left 0.2s' }}/>
                </button>
                <span style={{ fontSize:'0.85rem', color:'var(--clr-text)' }}>Requires special handling</span>
              </div>
              {modal === 'edit' && (
                <div style={{ display:'flex', alignItems:'center', gap:'0.65rem' }}>
                  <button type="button" onClick={() => setForm(f => ({ ...f, is_active: !f.is_active }))}
                    style={{ width:38, height:22, borderRadius:99, border:'none', cursor:'pointer', background: form.is_active ? 'var(--clr-accent)' : 'rgba(255,255,255,0.12)', transition:'background 0.2s', flexShrink:0, position:'relative' }}>
                    <span style={{ position:'absolute', top:2, left: form.is_active ? 18 : 2, width:18, height:18, borderRadius:'50%', background: form.is_active ? '#080b14' : 'var(--clr-muted)', transition:'left 0.2s' }}/>
                  </button>
                  <span style={{ fontSize:'0.85rem', color:'var(--clr-text)' }}>Active</span>
                </div>
              )}
              <div style={{ display:'flex', gap:'0.6rem', marginTop:'0.25rem' }}>
                <button type="button" className="btn-outline" style={{ flex:1 }} onClick={() => setModal(null)}>Cancel</button>
                <button type="submit" className="btn-primary" style={{ flex:2 }} disabled={saving}>{saving ? <BtnSpinner text="Saving…" /> : modal === 'create' ? 'Create' : 'Save Changes'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {toast && <div style={{ position:'fixed', bottom:'1.25rem', right:'1.25rem', zIndex:200, background:'rgba(0,229,255,0.12)', border:'1px solid rgba(0,229,255,0.25)', color:'var(--clr-text)', padding:'0.65rem 1.1rem', borderRadius:12, fontSize:'0.85rem', fontWeight:600, backdropFilter:'blur(12px)' }}>{toast}</div>}
    </div>
  )
}

// ─── Admin Pricing Rules Section ──────────────────────────────────────────────

interface PricingRule { id: number; vehicle_type: string; base_fare: number; per_km_rate: number; per_kg_rate: number; city_surcharge: number; min_distance_km: number | null; is_active: number; additional_fees: string | null }

function AdminPricingRulesSection() {
  const [items, setItems] = useState<PricingRule[]>([])
  const [loading, setLoading] = useState(false)
  const [modal, setModal] = useState<'create' | 'edit' | null>(null)
  const [editTarget, setEditTarget] = useState<PricingRule | null>(null)
  const [form, setForm] = useState({ vehicle_type:'', base_fare:'', per_km_rate:'', per_kg_rate:'0', min_distance_km:'', is_active: true })
  const [fees, setFees] = useState<Array<{name:string;value:string;type:'fixed'|'percent'}>>([])
  const [newFee, setNewFee] = useState({ name:'', value:'', type:'fixed' as 'fixed'|'percent' })
  const [formErr, setFormErr] = useState('')
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState('')
  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3000) }

  const load = async () => {
    setLoading(true)
    try { const { data } = await adminOrderApi.listPricingRules(); setItems(data.pricing_rules ?? []) }
    catch { showToast('Failed to load') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, []) // eslint-disable-line

  const openCreate = () => { setForm({ vehicle_type:'', base_fare:'', per_km_rate:'', per_kg_rate:'0', min_distance_km:'', is_active:true }); setFees([]); setNewFee({name:'',value:'',type:'fixed'}); setFormErr(''); setEditTarget(null); setModal('create') }
  const openEdit = (p: PricingRule) => {
    const parsedFees = p.additional_fees ? (typeof p.additional_fees === 'string' ? JSON.parse(p.additional_fees) : p.additional_fees) : []
    setForm({ vehicle_type:p.vehicle_type, base_fare:String(p.base_fare), per_km_rate:String(p.per_km_rate), per_kg_rate:String(p.per_kg_rate ?? 0), min_distance_km:p.min_distance_km != null ? String(p.min_distance_km) : '', is_active:!!p.is_active })
    setFees(parsedFees.map((f: any) => ({ name:f.name, value:String(f.value), type:f.type })))
    setNewFee({name:'',value:'',type:'fixed'}); setFormErr(''); setEditTarget(p); setModal('edit')
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.vehicle_type.trim()) { setFormErr('Vehicle type required'); return }
    setFormErr(''); setSaving(true)
    try {
      const parsedFees = fees.filter(f => f.name.trim() && f.value).map(f => ({ name:f.name.trim(), value:parseFloat(f.value), type:f.type }))
      const payload = { vehicle_type:form.vehicle_type.trim(), base_fare:parseFloat(form.base_fare), per_km_rate:parseFloat(form.per_km_rate), per_kg_rate:parseFloat(form.per_kg_rate)||0, min_distance_km:form.min_distance_km ? parseFloat(form.min_distance_km) : undefined, additional_fees: parsedFees.length ? parsedFees : undefined }
      if (modal === 'create') { await adminOrderApi.createPricingRule(payload); showToast('Pricing rule created.') }
      else if (editTarget) { await adminOrderApi.updatePricingRule(editTarget.id, { ...payload, is_active:form.is_active }); showToast('Updated.') }
      setModal(null); load()
    } catch (err: any) { setFormErr(err.response?.data?.message ?? 'Failed') }
    finally { setSaving(false) }
  }

  const inputStyle: React.CSSProperties = { width:'100%', padding:'0.6rem 0.8rem', borderRadius:9, border:'1px solid rgba(255,255,255,0.12)', background:'rgba(255,255,255,0.05)', color:'var(--clr-text)', fontFamily:'inherit', fontSize:'0.85rem', boxSizing:'border-box' }
  const labelStyle: React.CSSProperties = { fontSize:'0.73rem', fontWeight:600, color:'var(--clr-muted)', marginBottom:'0.3rem', display:'block' }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'1.25rem' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:'0.5rem' }}>
        <h2 style={{ fontSize:'1rem', fontWeight:800, color:'var(--clr-text)', display:'flex', alignItems:'center', gap:'0.45rem' }}><LuSettings size={17}/> Pricing Rules</h2>
        <div style={{ display:'flex', gap:'0.5rem' }}>
          <button onClick={load} style={{ display:'flex', alignItems:'center', gap:'0.35rem', padding:'0.3rem 0.7rem', borderRadius:8, border:'1px solid rgba(255,255,255,0.1)', background:'rgba(255,255,255,0.04)', color:'var(--clr-muted)', fontFamily:'inherit', fontSize:'0.72rem', fontWeight:600, cursor:'pointer' }}><LuRefreshCw size={12}/></button>
          <button onClick={openCreate} style={{ display:'flex', alignItems:'center', gap:'0.4rem', padding:'0.38rem 0.85rem', borderRadius:8, border:'none', background:'var(--clr-accent)', color:'#000', fontFamily:'inherit', fontSize:'0.8rem', fontWeight:700, cursor:'pointer' }}><LuPlus size={14}/> Add</button>
        </div>
      </div>
      {loading ? <LoadingSpinner /> : (
        <div className="glass-inner" style={{ overflow:'hidden' }}>
          {items.length === 0 ? <p style={{ padding:'2rem', textAlign:'center', color:'var(--clr-muted)' }}>No rules.</p>
          : items.map((p, i) => (
            <div key={p.id} style={{ display:'flex', alignItems:'center', gap:'0.75rem', padding:'0.75rem 1rem', borderBottom: i < items.length-1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ display:'flex', alignItems:'center', gap:'0.4rem', flexWrap:'wrap', marginBottom:'0.15rem' }}>
                  <span style={{ fontWeight:700, fontSize:'0.875rem', color:'var(--clr-text)' }}>{p.vehicle_type}</span>
                  {!p.is_active && <span className="badge badge-red" style={{ fontSize:'0.65rem' }}>Inactive</span>}
                </div>
                <p style={{ fontSize:'0.73rem', color:'var(--clr-muted)' }}>Base: {p.base_fare} ETB · {p.per_km_rate} ETB/km · {p.per_kg_rate > 0 ? `${p.per_kg_rate} ETB/kg · ` : ''}{p.additional_fees && (typeof p.additional_fees === 'string' ? JSON.parse(p.additional_fees) : p.additional_fees).length > 0 ? `${(typeof p.additional_fees === 'string' ? JSON.parse(p.additional_fees) : p.additional_fees).length} fees` : 'No extra fees'}</p>
              </div>
              <button onClick={() => openEdit(p)} style={{ padding:'0.28rem 0.55rem', borderRadius:7, border:'1px solid rgba(255,255,255,0.12)', background:'rgba(255,255,255,0.05)', color:'var(--clr-muted)', fontFamily:'inherit', fontSize:'0.7rem', cursor:'pointer', display:'flex', alignItems:'center', gap:'0.3rem' }}><LuPencil size={11}/> Edit</button>
            </div>
          ))}
        </div>
      )}

      {(modal === 'create' || modal === 'edit') && (
        <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) setModal(null) }}>
          <div className="glass modal-box" style={{ padding:'1.75rem', maxWidth:480, maxHeight:'88vh', overflowY:'auto' }}>
            <h2 style={{ fontSize:'1rem', fontWeight:800, color:'var(--clr-text)', marginBottom:'1rem' }}>{modal === 'create' ? 'Add Pricing Rule' : 'Edit Pricing Rule'}</h2>
            <form onSubmit={handleSave} style={{ display:'flex', flexDirection:'column', gap:'0.75rem' }}>
              {formErr && <div className="alert alert-error"><LuTriangleAlert size={13}/> {formErr}</div>}
              {/* Vehicle Type dropdown */}
              <div>
                <label style={labelStyle}>Vehicle Type *</label>
                <select style={{ ...inputStyle, outline:'none' }} value={form.vehicle_type} onChange={e => setForm(f => ({ ...f, vehicle_type:e.target.value }))} required>
                  <option value="" style={{ background:'#0f172a' }}>— Select vehicle type —</option>
                  {VEHICLE_TYPES.map(t => <option key={t} value={t} style={{ background:'#0f172a' }}>{t}</option>)}
                </select>
              </div>
              {/* Base fare + per km */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.65rem' }}>
                <div><label style={labelStyle}>Base Fare (ETB) *</label><input style={inputStyle} type="number" min="0" step="0.01" value={form.base_fare} onChange={e => setForm(f => ({ ...f, base_fare:e.target.value }))} required/></div>
                <div><label style={labelStyle}>Per km Rate (ETB) *</label><input style={inputStyle} type="number" min="0" step="0.01" value={form.per_km_rate} onChange={e => setForm(f => ({ ...f, per_km_rate:e.target.value }))} required/></div>
                <div><label style={labelStyle}>Per kg Rate (ETB)</label><input style={inputStyle} type="number" min="0" step="0.0001" value={form.per_kg_rate} onChange={e => setForm(f => ({ ...f, per_kg_rate:e.target.value }))}/></div>
                <div><label style={labelStyle}>Min Distance km</label><input style={inputStyle} type="number" min="0" step="0.1" value={form.min_distance_km} onChange={e => setForm(f => ({ ...f, min_distance_km:e.target.value }))}/></div>
              </div>
              {/* Additional fees manager */}
              <div>
                <label style={labelStyle}>Additional Fees</label>
                <div style={{ display:'flex', flexDirection:'column', gap:'0.4rem', marginBottom:'0.5rem' }}>
                  {fees.map((fee, idx) => (
                    <div key={idx} style={{ display:'flex', alignItems:'center', gap:'0.4rem', padding:'0.4rem 0.65rem', borderRadius:8, background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)' }}>
                      <span style={{ flex:1, fontSize:'0.8rem', color:'var(--clr-text)' }}>{fee.name}</span>
                      <span style={{ fontSize:'0.8rem', color:'var(--clr-accent)', fontWeight:700 }}>{fee.type==='percent' ? `${fee.value}%` : `${fee.value} ETB`}</span>
                      <button type="button" onClick={() => setFees(f => f.filter((_,i) => i!==idx))} style={{ background:'none', border:'none', cursor:'pointer', color:'#f87171', padding:'0.1rem', display:'flex', alignItems:'center' }}><LuX size={13}/></button>
                    </div>
                  ))}
                </div>
                {/* Add new fee row */}
                <div style={{ display:'grid', gridTemplateColumns:'1fr auto auto auto', gap:'0.4rem', alignItems:'center' }}>
                  <input style={{ ...inputStyle, fontSize:'0.78rem', padding:'0.45rem 0.65rem' }} placeholder="Fee name" value={newFee.name} onChange={e => setNewFee(f => ({ ...f, name:e.target.value }))}/>
                  <input style={{ ...inputStyle, width:72, fontSize:'0.78rem', padding:'0.45rem 0.65rem' }} type="number" min="0" step="0.01" placeholder="Value" value={newFee.value} onChange={e => setNewFee(f => ({ ...f, value:e.target.value }))}/>
                  <select style={{ ...inputStyle, width:'auto', fontSize:'0.78rem', padding:'0.45rem 0.55rem', outline:'none' }} value={newFee.type} onChange={e => setNewFee(f => ({ ...f, type:e.target.value as 'fixed'|'percent' }))}>
                    <option value="fixed" style={{ background:'#0f172a' }}>ETB</option>
                    <option value="percent" style={{ background:'#0f172a' }}>%</option>
                  </select>
                  <button type="button" onClick={() => { if (!newFee.name.trim() || !newFee.value) return; setFees(f => [...f, { ...newFee }]); setNewFee({name:'',value:'',type:'fixed'}) }} style={{ padding:'0.45rem 0.65rem', borderRadius:8, border:'none', background:'var(--clr-accent)', color:'#000', fontFamily:'inherit', fontSize:'0.78rem', fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', gap:'0.2rem' }}><LuPlus size={13}/></button>
                </div>
              </div>
              {modal === 'edit' && (
                <div style={{ display:'flex', alignItems:'center', gap:'0.65rem' }}>
                  <button type="button" onClick={() => setForm(f => ({ ...f, is_active: !f.is_active }))}
                    style={{ width:38, height:22, borderRadius:99, border:'none', cursor:'pointer', background: form.is_active ? 'var(--clr-accent)' : 'rgba(255,255,255,0.12)', transition:'background 0.2s', flexShrink:0, position:'relative' }}>
                    <span style={{ position:'absolute', top:2, left: form.is_active ? 18 : 2, width:18, height:18, borderRadius:'50%', background: form.is_active ? '#080b14' : 'var(--clr-muted)', transition:'left 0.2s' }}/>
                  </button>
                  <span style={{ fontSize:'0.85rem', color:'var(--clr-text)' }}>Active</span>
                </div>
              )}
              <div style={{ display:'flex', gap:'0.6rem', marginTop:'0.25rem' }}>
                <button type="button" className="btn-outline" style={{ flex:1 }} onClick={() => setModal(null)}>Cancel</button>
                <button type="submit" className="btn-primary" style={{ flex:2 }} disabled={saving}>{saving ? <BtnSpinner text="Saving…" /> : modal === 'create' ? 'Create' : 'Save Changes'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {toast && <div style={{ position:'fixed', bottom:'1.25rem', right:'1.25rem', zIndex:200, background:'rgba(0,229,255,0.12)', border:'1px solid rgba(0,229,255,0.25)', color:'var(--clr-text)', padding:'0.65rem 1.1rem', borderRadius:12, fontSize:'0.85rem', fontWeight:600, backdropFilter:'blur(12px)' }}>{toast}</div>}
    </div>
  )
}

// ─── Main Admin Dashboard ─────────────────────────────────────────────────────

export default function AdminDashboardPage() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const [section, setSection]       = useState<AdminSection>('overview')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [pinned, setPinned] = useState<boolean>(() => localStorage.getItem('admin-sidebar-pinned') === 'true')
  const [users, setUsers]           = useState<UserRow[]>([])
  const [stats, setStats]           = useState<Stats | null>(null)
  const [usersLoading, setUsersLoading] = useState(false)
  const [toastMsg, setToastMsg]     = useState('')

  const togglePin = () => setPinned(v => { const next = !v; localStorage.setItem('admin-sidebar-pinned', String(next)); return next })
  const showToast = (msg: string) => { setToastMsg(msg); setTimeout(() => setToastMsg(''), 3000) }

  const loadUsers = useCallback(async () => {
    setUsersLoading(true)
    try {
      const { data } = await apiClient.get('/admin/users')
      setUsers(data.users ?? [])
      setStats(data.stats ?? null)
    } catch { showToast('Failed to load users') }
    finally { setUsersLoading(false) }
  }, [])

  useEffect(() => { loadUsers() }, [loadUsers])

  const handleToggleActive = async (u: UserRow) => {
    try {
      await apiClient.patch(`/admin/users/${u.id}/toggle-active`)
      setUsers(prev => prev.map(x => x.id === u.id ? { ...x, is_active: x.is_active ? 0 : 1 } : x))
      showToast(`${u.first_name} ${u.is_active ? 'suspended' : 'activated'}.`)
    } catch { showToast('Action failed.') }
  }

  const drivers    = users.filter(u => u.role_id === 3)
  const shippers   = users.filter(u => u.role_id === 2)
  const staffUsers = users.filter(u => [1, 4, 5].includes(u.role_id))

  const navItems: { id: AdminSection; icon: React.ReactNode; label: string; count?: number }[] = [
    { id: 'overview',       icon: <LuChartBar size={16}/>,     label: 'Overview'         },
    { id: 'shippers',       icon: <LuPackage size={16}/>,      label: 'Shippers',        count: shippers.length },
    { id: 'drivers',        icon: <LuTruck size={16}/>,        label: 'Drivers',         count: drivers.length  },
    { id: 'staff',          icon: <LuBriefcase size={16}/>,    label: 'Staff Users',     count: staffUsers.length },
    { id: 'verify-drivers', icon: <LuShieldCheck size={16}/>,  label: 'Verify Drivers'   },
    { id: 'vehicles',       icon: <LuCar size={16}/>,          label: 'Vehicles'         },
    { id: 'orders',         icon: <LuListOrdered size={16}/>,  label: 'Orders'           },
    { id: 'live-drivers',   icon: <LuMapPin size={16}/>,        label: 'Live Drivers'     },
    { id: 'guest-orders',   icon: <LuUsers size={16}/>,         label: 'Guest Orders'     },
    { id: 'cargo-types',    icon: <LuBox size={16}/>,          label: 'Cargo Types'      },
    { id: 'pricing-rules',  icon: <LuSettings size={16}/>,     label: 'Pricing Rules'    },
    { id: 'profile',        icon: <LuUser size={16}/>,         label: 'My Profile'       },
  ]

  const sectionTitle = navItems.find(n => n.id === section)

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--clr-bg)', position: 'relative' }}>
      {/* Aurora background */}
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0, overflow: 'hidden' }}>
        <div style={{ position: 'absolute', borderRadius: '50%', filter: 'blur(80px)', opacity: 0.3, width: '70vmax', height: '70vmax', top: '-25vmax', left: '-20vmax', background: 'radial-gradient(ellipse,#7c3aed 0%,#4f46e5 40%,transparent 70%)' }} />
        <div style={{ position: 'absolute', borderRadius: '50%', filter: 'blur(80px)', opacity: 0.25, width: '60vmax', height: '60vmax', bottom: '-20vmax', right: '-15vmax', background: 'radial-gradient(ellipse,#00e5ff 0%,#0ea5e9 40%,transparent 70%)' }} />
      </div>

      {/* Mobile overlay (only when NOT pinned) */}
      {!pinned && sidebarOpen && (
        <div onClick={() => setSidebarOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 39, backdropFilter: 'blur(3px)' }} />
      )}

      {/* Sidebar */}
      <aside style={pinned ? {
        position: 'relative', top: 'auto', left: 'auto', height: 'auto', width: 216,
        background: 'rgba(8,11,20,0.94)', backdropFilter: 'blur(20px)',
        borderRight: '1px solid rgba(255,255,255,0.07)',
        display: 'flex', flexDirection: 'column', zIndex: 10, flexShrink: 0,
        minHeight: '100vh',
      } : {
        position: 'fixed', top: 0, left: 0, height: '100vh', width: 216,
        background: 'rgba(8,11,20,0.94)', backdropFilter: 'blur(20px)',
        borderRight: '1px solid rgba(255,255,255,0.07)',
        display: 'flex', flexDirection: 'column', zIndex: 40,
        transform: sidebarOpen ? 'translateX(0)' : 'translateX(-100%)',
        transition: 'transform 0.25s cubic-bezier(0.4,0,0.2,1)',
      }}>
        {/* Brand */}
        <div style={{ padding: '1.25rem 1.1rem 0.9rem', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
            <img src="/logo-with-name.jpeg" alt="Africa Logistics" style={{ height: 36, width: 'auto', objectFit: 'contain', borderRadius: 6, flexShrink: 0 }} />
            <div style={{ flex: 1 }} />
            <button onClick={togglePin} title={pinned ? 'Unpin sidebar' : 'Pin sidebar'} style={{ background: 'none', border: 'none', cursor: 'pointer', color: pinned ? 'var(--clr-accent)' : 'var(--clr-muted)', padding: '0.2rem', display:'flex', alignItems:'center', borderRadius: 6, transition: 'color 0.18s' }}>
              {pinned ? <LuPinOff size={15}/> : <LuPin size={15}/>}
            </button>
          </div>
          <span className="badge badge-cyan" style={{ marginTop: '0.5rem', fontSize: '0.67rem' }}>Admin Panel</span>
        </div>

        {/* Nav items */}
        <nav style={{ flex: 1, padding: '0.65rem 0.55rem', display: 'flex', flexDirection: 'column', gap: '0.1rem', overflowY: 'auto' }}>
          {navItems.map(item => (
            <button key={item.id} onClick={() => { setSection(item.id); if (!pinned) setSidebarOpen(false) }}
              style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.6rem 0.7rem', borderRadius: 10, border: 'none', background: section === item.id ? 'rgba(0,229,255,0.10)' : 'transparent', color: section === item.id ? 'var(--clr-accent)' : 'var(--clr-muted)', fontFamily: 'inherit', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', textAlign: 'left', transition: 'all 0.18s', outline: section === item.id ? '1px solid rgba(0,229,255,0.18)' : 'none', width: '100%' }}>
              <span style={{ width: 18, display:'flex', alignItems:'center', justifyContent:'center', flexShrink: 0 }}>{item.icon}</span>
              <span style={{ flex: 1 }}>{item.label}</span>
              {item.count !== undefined && item.count > 0 && (
                <span style={{ background: section === item.id ? 'rgba(0,229,255,0.2)' : 'rgba(255,255,255,0.08)', color: section === item.id ? 'var(--clr-accent)' : 'var(--clr-muted)', borderRadius: 99, padding: '0.05rem 0.45rem', fontSize: '0.68rem', fontWeight: 700 }}>{item.count}</span>
              )}
            </button>
          ))}
        </nav>

        {/* User footer */}
        <div style={{ padding: '0.7rem 0.9rem', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', marginBottom: '0.55rem' }}>
            <div style={{ width: 30, height: 30, borderRadius: '50%', flexShrink: 0, background: 'linear-gradient(135deg,var(--clr-accent2),var(--clr-accent))', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
              {user?.profile_photo_url ? <img src={user.profile_photo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <LuShield size={14} color="#fff"/>}
            </div>
            <div style={{ minWidth: 0 }}>
              <p style={{ fontWeight: 700, fontSize: '0.77rem', color: 'var(--clr-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user?.first_name} {user?.last_name}</p>
              <p style={{ fontSize: '0.65rem', color: 'var(--clr-muted)' }}>Administrator</p>
            </div>
          </div>
          <button onClick={() => { logout(); navigate('/login') }} style={{ width: '100%', padding: '0.42rem', borderRadius: 8, border: '1px solid rgba(255,255,255,0.09)', background: 'rgba(255,255,255,0.04)', color: 'var(--clr-muted)', fontFamily: 'inherit', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:'0.35rem' }}><LuLogOut size={13}/> Sign out</button>
        </div>
      </aside>

      {/* Main content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: '100vh', position: 'relative', zIndex: 1 }}>
        {/* Top bar */}
        <header style={{ position: 'sticky', top: 0, zIndex: 30, background: 'rgba(8,11,20,0.88)', backdropFilter: 'blur(16px)', borderBottom: '1px solid rgba(255,255,255,0.07)', padding: '0.7rem 1.1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button onClick={() => setSidebarOpen(v => !v)} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '0.38rem 0.5rem', color: 'var(--clr-muted)', cursor: 'pointer', lineHeight: 1, flexShrink: 0, display:'flex', alignItems:'center' }}>
            {sidebarOpen && !pinned ? <LuX size={17}/> : <LuMenu size={17}/>}
          </button>
          <div style={{ flex: 1 }}>
            <p style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--clr-text)', display:'flex', alignItems:'center', gap:'0.4rem' }}>{sectionTitle?.icon} {sectionTitle?.label}</p>
          </div>
          <button onClick={() => { setSection('profile'); if (!pinned) setSidebarOpen(false) }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', overflow: 'hidden', background: 'linear-gradient(135deg,var(--clr-accent2),var(--clr-accent))', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid rgba(0,229,255,0.3)' }}>
              {user?.profile_photo_url ? <img src={user.profile_photo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <LuShield size={15} color="#fff"/>}
            </div>
          </button>
        </header>

        {/* Section content */}
        <main style={{ flex: 1, padding: '1.25rem 1.1rem 2rem', maxWidth: 840, width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>
          {section === 'overview'       && <OverviewSection stats={stats} users={users} onNav={setSection} />}
          {section === 'drivers'        && <CustomerSection title="Drivers"  allUsers={drivers}    loading={usersLoading} onToggleActive={handleToggleActive} onRefresh={loadUsers} />}
          {section === 'shippers'       && <CustomerSection title="Shippers" allUsers={shippers}   loading={usersLoading} onToggleActive={handleToggleActive} onRefresh={loadUsers} />}
          {section === 'staff'          && <StaffManagementSection            allUsers={staffUsers} loading={usersLoading} onToggleActive={handleToggleActive} onRefresh={loadUsers} />}
          {section === 'verify-drivers' && <DriverVerificationSection />}
          {section === 'vehicles'       && <VehicleManagementSection />}
          {section === 'orders'         && <AdminOrdersSection />}
          {section === 'live-drivers'   && <AdminLiveDriversSection />}
          {section === 'guest-orders'   && <AdminGuestOrdersSection />}
          {section === 'cargo-types'    && <AdminCargoTypesSection />}
          {section === 'pricing-rules'  && <AdminPricingRulesSection />}
          {section === 'profile'        && <ProfileSection />}
        </main>
      </div>

      {/* Toast */}
      {toastMsg && (
        <div style={{ position: 'fixed', bottom: '1.25rem', right: '1.25rem', zIndex: 100, background: 'rgba(0,229,255,0.12)', border: '1px solid rgba(0,229,255,0.25)', color: 'var(--clr-text)', padding: '0.65rem 1.1rem', borderRadius: 12, fontSize: '0.85rem', fontWeight: 600, backdropFilter: 'blur(12px)', boxShadow: '0 8px 32px rgba(0,0,0,0.4)', animation: 'slide-in-right 0.2s ease both' }}>
          {toastMsg}
        </div>
      )}
    </div>
  )
}
