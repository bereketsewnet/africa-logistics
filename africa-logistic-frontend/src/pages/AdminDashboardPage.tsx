import {
  useState, useEffect, useCallback, useRef,
  type FormEvent, type ChangeEvent,
} from 'react'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import apiClient, { authApi } from '../lib/apiClient'
import PhoneField from '../components/PhoneField'
import { normalisePhone } from '../lib/normalisePhone'
import {
  LuTruck, LuUser, LuShield, LuPackage, LuPhone, LuMail,
  LuIdCard, LuCircleCheck, LuTriangleAlert, LuCamera, LuTrash2,
  LuEye, LuEyeOff, LuLogOut, LuCheck, LuSmartphone, LuArrowLeft,
  LuLock, LuContact, LuMenu, LuPin, LuPinOff,
  LuUsers, LuChartBar, LuX, LuStar, LuHistory,
} from 'react-icons/lu'

// ─── Shared UI helpers ────────────────────────────────────────────────────────

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
  created_at: string
  profile_photo_url: string | null
}
interface Stats {
  total_users: number; total_admins: number; total_shippers: number
  total_drivers: number; active_users: number; new_today: number
}
type AdminSection = 'overview' | 'users' | 'drivers' | 'shippers' | 'profile'
type ProfileTab = 'profile' | 'security' | 'contact'

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
  const cls: Record<number, string> = { 1: 'badge-cyan', 2: 'badge-purple', 3: 'badge-red' }
  return <span className={`badge ${cls[roleId] ?? 'badge-cyan'}`}>{roleName}</span>
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
          <button className="btn-outline" style={{ fontSize: '0.72rem', padding: '0.3rem 0.7rem' }} onClick={() => onNav('users')}>View all →</button>
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

function UsersListSection({ title, allUsers, loading, onToggleActive }: {
  title: string; allUsers: UserRow[]; loading: boolean; onToggleActive: (u: UserRow) => void
}) {
  const [search, setSearch] = useState('')
  const filtered = allUsers.filter(u => {
    const q = search.toLowerCase()
    return !q || u.first_name.toLowerCase().includes(q) || u.last_name.toLowerCase().includes(q) || u.phone_number.includes(q) || (u.email ?? '').toLowerCase().includes(q)
  })
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <h2 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--clr-text)' }}>{title}</h2>
      <div className="input-wrap">
        <input id="s-search" type="text" placeholder=" " value={search} onChange={e => setSearch(e.target.value)} />
        <label htmlFor="s-search">Search name / phone / email</label>
      </div>
      {loading ? <LoadingSpinner /> : (
        <div className="glass-inner" style={{ overflow: 'hidden' }}>
          {filtered.length === 0 ? (
            <p style={{ padding: '2rem', textAlign: 'center', color: 'var(--clr-muted)', fontSize: '0.875rem' }}>No users found</p>
          ) : filtered.map((u, i) => (
            <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.85rem 1rem', borderBottom: i < filtered.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none', flexWrap: 'wrap' }}>
              <UserAvatar u={u} size={38} />
              <div style={{ flex: 1, minWidth: 110 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--clr-text)' }}>{u.first_name} {u.last_name}</span>
                  <RoleBadge roleId={u.role_id} roleName={u.role_name} />
                  {!u.is_active && <span className="badge badge-red" style={{ fontSize: '0.67rem' }}>Suspended</span>}
                </div>
                <p style={{ fontSize: '0.75rem', color: 'var(--clr-muted)', marginTop: '0.15rem' }}>{u.phone_number}</p>
                {u.email && <p style={{ fontSize: '0.7rem', color: 'var(--clr-muted)' }}>{u.email}</p>}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.3rem', flexShrink: 0 }}>
                <span style={{ fontSize: '0.68rem', color: 'var(--clr-muted)' }}>{new Date(u.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                <button onClick={() => onToggleActive(u)} style={{
                  padding: '0.28rem 0.65rem', borderRadius: 7, border: '1px solid',
                  borderColor: u.is_active ? 'rgba(239,68,68,0.35)' : 'rgba(74,222,128,0.35)',
                  background: u.is_active ? 'rgba(239,68,68,0.08)' : 'rgba(74,222,128,0.08)',
                  color: u.is_active ? '#fca5a5' : '#4ade80',
                  fontFamily: 'inherit', fontSize: '0.7rem', fontWeight: 600, cursor: 'pointer',
                }}>{u.is_active ? 'Suspend' : 'Activate'}</button>
              </div>
            </div>
          ))}
        </div>
      )}
      <p style={{ fontSize: '0.73rem', color: 'var(--clr-muted)', textAlign: 'right' }}>{filtered.length} shown</p>
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

  const drivers  = users.filter(u => u.role_id === 3)
  const shippers = users.filter(u => u.role_id === 2)

  const navItems: { id: AdminSection; icon: React.ReactNode; label: string; count?: number }[] = [
    { id: 'overview',  icon: <LuChartBar size={16}/>, label: 'Overview'  },
    { id: 'users',     icon: <LuUsers size={16}/>,     label: 'All Users',  count: users.length    },
    { id: 'shippers',  icon: <LuPackage size={16}/>,   label: 'Shippers',   count: shippers.length },
    { id: 'drivers',   icon: <LuTruck size={16}/>,     label: 'Drivers',    count: drivers.length  },
    { id: 'profile',   icon: <LuUser size={16}/>,      label: 'My Profile' },
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
          {section === 'overview' && <OverviewSection stats={stats} users={users} onNav={setSection} />}
          {section === 'users'    && <UsersListSection title="All Users"  allUsers={users}    loading={usersLoading} onToggleActive={handleToggleActive} />}
          {section === 'drivers'  && <UsersListSection title="Drivers"    allUsers={drivers}  loading={usersLoading} onToggleActive={handleToggleActive} />}
          {section === 'shippers' && <UsersListSection title="Shippers"   allUsers={shippers} loading={usersLoading} onToggleActive={handleToggleActive} />}
          {section === 'profile'  && <ProfileSection />}
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
