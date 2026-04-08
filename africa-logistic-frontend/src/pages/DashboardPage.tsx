import { useState, useRef, useEffect, type FormEvent, type ChangeEvent } from 'react'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import apiClient, { authApi } from '../lib/apiClient'
import PhoneField from '../components/PhoneField'
import { normalisePhone } from '../lib/normalisePhone'
import {
  LuTruck, LuUser, LuShield, LuPackage, LuPhone, LuMail,
  LuIdCard, LuCircleCheck, LuTriangleAlert, LuCamera, LuTrash2,
  LuEye, LuEyeOff, LuLogOut, LuCheck, LuSmartphone, LuArrowLeft,
  LuLock, LuContact, LuBell, LuSun, LuMoon, LuMonitor, LuFileText,
  LuUpload, LuRefreshCw, LuStar, LuWallet, LuMessageSquare,
  LuLifeBuoy, LuClock, LuCar, LuX, LuChevronLeft, LuChevronRight,
} from 'react-icons/lu'

// ─── Sub-components ──────────────────────────────────────────────────────────

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
      <span style={{ width: 22, textAlign: 'center', flexShrink: 0, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--clr-accent)' }}>{icon}</span>
      <span style={{ fontSize: '0.8rem', color: 'var(--clr-muted)', width: 68, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: '0.875rem', color: 'var(--clr-text)', fontWeight: 500, wordBreak: 'break-all' }}>{value}</span>
    </div>
  )
}

function Divider() {
  return <div style={{ height: 1, background: 'rgba(255,255,255,0.07)', margin: '0.25rem 0' }} />
}

function Spinner({ text }: { text: string }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
      <span className="spinner" />{text}
    </span>
  )
}

function PasswordInput({
  id, label, value, onChange, show, onToggle, hasError,
}: {
  id: string; label: string; value: string; onChange: (v: string) => void
  show: boolean; onToggle: () => void; hasError?: boolean
}) {
  return (
    <div className="input-wrap">
      <input
        id={id} type={show ? 'text' : 'password'} placeholder=" "
        value={value} onChange={e => onChange(e.target.value)} required
        className={hasError ? 'has-error' : ''} style={{ paddingRight: '2.8rem' }}
      />
      <label htmlFor={id}>{label}</label>
      <button type="button" className="input-suffix" onClick={onToggle}>{show ? <LuEyeOff size={16}/> : <LuEye size={16}/>}</button>
    </div>
  )
}

function SectionRow({
  title, sub, open, onToggle, toggleLabel, children,
}: {
  title: string; sub: string; open: boolean
  onToggle: () => void; toggleLabel: string; children?: React.ReactNode
}) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: open ? '1rem' : 0 }}>
        <div>
          <p style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--clr-text)' }}>{title}</p>
          <p style={{ fontSize: '0.78rem', color: 'var(--clr-muted)', marginTop: '0.1rem' }}>{sub}</p>
        </div>
        <button
          className="btn-outline"
          style={{ fontSize: '0.78rem', padding: '0.4rem 0.9rem', flexShrink: 0, marginLeft: '0.75rem' }}
          onClick={onToggle}
        >
          {toggleLabel}
        </button>
      </div>
      {open && children}
    </div>
  )
}

type Tab = 'profile' | 'security' | 'contact' | 'preferences' | 'documents'
type DockPage = 'account' | 'orders' | 'payments' | 'messages' | 'help' | 'vehicle' | 'shipments'

function ComingSoon({ title, icon, desc }: { title: string; icon: React.ReactNode; desc: string }) {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'70vh', padding:'2rem 1rem' }}>
      <div className="glass page-enter" style={{ padding:'3rem 2rem', textAlign:'center', maxWidth:360, width:'100%' }}>
        <div style={{ width:72, height:72, borderRadius:'50%', background:'rgba(0,229,255,0.07)', border:'1px solid rgba(0,229,255,0.15)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 1.5rem', color:'var(--clr-muted)' }}>
          {icon}
        </div>
        <h2 style={{ fontSize:'1.3rem', fontWeight:800, color:'var(--clr-text)', marginBottom:'0.4rem' }}>{title}</h2>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:'0.4rem', color:'var(--clr-accent)', fontSize:'0.8rem', fontWeight:700, marginBottom:'0.75rem' }}>
          <LuClock size={13}/> Coming Soon
        </div>
        <p style={{ fontSize:'0.84rem', color:'var(--clr-muted)', lineHeight:1.65 }}>{desc}</p>
        <div style={{ marginTop:'1.75rem', height:3, borderRadius:99, background:'rgba(255,255,255,0.06)', overflow:'hidden' }}>
          <div style={{ height:'100%', width:'28%', borderRadius:99, background:'linear-gradient(90deg,var(--clr-accent2),var(--clr-accent))' }}/>
        </div>
        <p style={{ fontSize:'0.68rem', color:'rgba(100,116,139,0.7)', marginTop:'0.4rem' }}>28% complete</p>
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const { user, logout, updateUser, refreshUser } = useAuth()
  const navigate = useNavigate()

  const roleLabel = user?.role_id === 1 ? 'Admin' : user?.role_id === 2 ? 'Shipper' : user?.role_id === 3 ? 'Driver' : user?.role_name ?? 'User'
  const roleIcon  = user?.role_id === 1 ? <LuShield size={30}/> : user?.role_id === 2 ? <LuPackage size={30}/> : user?.role_id === 3 ? <LuTruck size={30}/> : <LuUser size={30}/>

  const [activeTab, setActiveTab] = useState<Tab>('profile')

  // ── Theme preference ───────────────────────────────────────────────────────
  const [themeVal,   setThemeVal]   = useState<'LIGHT' | 'DARK' | 'SYSTEM'>('SYSTEM')
  const [themeLoading, setThemeLoading] = useState(false)
  const [themeMsg,   setThemeMsg]   = useState('')

  // Apply theme to <html data-theme="…"> — 'dark'|'light'|'system'
  const applyTheme = (t: 'LIGHT' | 'DARK' | 'SYSTEM') => {
    document.documentElement.setAttribute('data-theme', t.toLowerCase())
  }

  // Load theme from user object (already fetched on login via /auth/me)
  useEffect(() => {
    const saved = (user?.theme_preference ?? 'SYSTEM') as 'LIGHT' | 'DARK' | 'SYSTEM'
    setThemeVal(saved)
    applyTheme(saved)
  }, [user?.id])

  // React to OS-level preference changes when SYSTEM theme is active
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: light)')
    const handler = () => { if (themeVal === 'SYSTEM') applyTheme('SYSTEM') }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [themeVal])

  const handleSetTheme = async (t: 'LIGHT' | 'DARK' | 'SYSTEM') => {
    setThemeVal(t)
    applyTheme(t)
    setThemeLoading(true); setThemeMsg('')
    try {
      await apiClient.put('/profile/theme', { theme: t })
      setThemeMsg('Theme saved.')
      setTimeout(() => setThemeMsg(''), 2500)
    } catch { setThemeMsg('Failed to save theme.') }
    finally { setThemeLoading(false) }
  }

  // ── Notification preferences ────────────────────────────────────────────────
  const [notifPrefs, setNotifPrefs] = useState({ sms_enabled: 1, email_enabled: 1, browser_enabled: 1, telegram_enabled: 1, order_updates: 1, promotions: 0 })
  const [notifLoading, setNotifLoading] = useState(false)
  const [notifMsg,   setNotifMsg]   = useState('')

  useEffect(() => {
    apiClient.get('/profile/notifications').then(r => {
      if (r.data.preferences) setNotifPrefs(r.data.preferences)
    }).catch(() => {})
  }, [])

  const handleToggleNotif = async (key: keyof typeof notifPrefs) => {
    const next = { ...notifPrefs, [key]: notifPrefs[key] ? 0 : 1 }
    setNotifPrefs(next); setNotifLoading(true); setNotifMsg('')
    try {
      await apiClient.put('/profile/notifications', {
        sms_enabled: !!next.sms_enabled, email_enabled: !!next.email_enabled,
        browser_enabled: !!next.browser_enabled, telegram_enabled: !!next.telegram_enabled,
        order_updates: !!next.order_updates, promotions: !!next.promotions,
      })
      setNotifMsg('Preferences saved.')
      setTimeout(() => setNotifMsg(''), 2500)
    } catch { setNotifMsg('Failed to save.') }
    finally { setNotifLoading(false) }
  }

  // ── Driver documents ────────────────────────────────────────────────────────
  const [driverProfile, setDriverProfile] = useState<any>(null)
  const [docsLoading,   setDocsLoading]   = useState(false)
  const [docsError,     setDocsError]     = useState('')
  const [docsSuccess,   setDocsSuccess]   = useState('')
  const [uploadingDoc,  setUploadingDoc]  = useState<string | null>(null)

  useEffect(() => {
    if (user?.role_id === 3) {
      setDocsLoading(true)
      apiClient.get('/profile/driver').then(r => setDriverProfile(r.data.driver_profile)).catch(() => {}).finally(() => setDocsLoading(false))
    }
  }, [user?.role_id])

  const handleDocUpload = async (docKey: 'national_id' | 'license' | 'libre', file: File) => {
    if (file.size > 8 * 1024 * 1024) { setDocsError('Max file size is 8 MB'); return }
    setDocsError(''); setDocsSuccess(''); setUploadingDoc(docKey)
    const reader = new FileReader()
    reader.onload = async () => {
      try {
        await apiClient.post('/profile/driver/documents', { [docKey]: reader.result as string })
        const r = await apiClient.get('/profile/driver')
        setDriverProfile(r.data.driver_profile)
        setDocsSuccess(`${docKey.replace('_', ' ')} uploaded successfully.`)
        setTimeout(() => setDocsSuccess(''), 3000)
      } catch (err: any) {
        setDocsError(err.response?.data?.message || 'Upload failed.')
      } finally { setUploadingDoc(null) }
    }
    reader.readAsDataURL(file)
  }

  type TabDef = { id: Tab; icon: React.ReactNode; label: string }
  const [activePage, setActivePage] = useState<DockPage>('account')

  // ── Dock expand/collapse state ─────────────────────────────────────────────
  const DOCK_KEY = 'dash_dock_v3'
  const [dockExpanded, setDockExpanded] = useState(() => {
    const saved = localStorage.getItem(DOCK_KEY)
    return saved === 'true'   // default: collapsed
  })
  const toggleDock = () => {
    const next = !dockExpanded
    setDockExpanded(next)
    localStorage.setItem(DOCK_KEY, String(next))
  }

  // ── Driver Vehicle ─────────────────────────────────────────────────────────
  interface DriverVehicle {
    id: string; plate_number: string; vehicle_type: string; max_capacity_kg: number
    vehicle_photo_url: string | null; libre_url: string | null; description: string | null
    is_approved: number; driver_submission_status: 'PENDING' | 'APPROVED' | 'REJECTED' | null
  }
  const [myVehicles,   setMyVehicles]   = useState<DriverVehicle[]>([])
  const [vehicleLoading, setVehicleLoading] = useState(false)
  const [vehicleToast, setVehicleToast] = useState('')
  const [showVehicleForm, setShowVehicleForm] = useState(false)
  const [vForm, setVForm] = useState({ plate_number:'', vehicle_type:'Truck', max_capacity_kg:'', description:'' })
  const [vPhoto, setVPhoto]   = useState('')
  const [vLibre, setVLibre]   = useState('')
  const [vSubmitting, setVSubmitting] = useState(false)
  const [vFormError, setVFormError]   = useState('')
  const vPhotoRef = useRef<HTMLInputElement>(null)
  const vLibreRef = useRef<HTMLInputElement>(null)

  const vehicleTypes = ['Truck', 'Van', 'Pickup', 'Motorcycle', 'Cargo Bike', 'Mini Truck', 'Trailer', 'Other']
  const _apiBase = (import.meta.env.VITE_API_BASE_URL as string ?? '').replace(/\/api$/, '')
  const absUrl = (raw: string | null | undefined) => !raw ? null : raw.startsWith('http') ? raw : `${_apiBase}${raw}`
  const vToast = (msg: string) => { setVehicleToast(msg); setTimeout(() => setVehicleToast(''), 3000) }

  const loadMyVehicles = () => {
    if (user?.role_id !== 3) return
    setVehicleLoading(true)
    apiClient.get('/profile/driver/vehicles').then(r => setMyVehicles(r.data.vehicles ?? [])).catch(() => {}).finally(() => setVehicleLoading(false))
  }

  useEffect(() => {
    if (activePage === 'vehicle') loadMyVehicles()
  }, [activePage]) // eslint-disable-line

  const handleVFileSelect = (setter: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return
    if (file.size > 8 * 1024 * 1024) { setVFormError('Max 8 MB'); return }
    const reader = new FileReader()
    reader.onload = () => setter(reader.result as string)
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const handleVSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setVFormError('')
    if (!vForm.plate_number.trim()) { setVFormError('Plate number required'); return }
    const cap = parseFloat(vForm.max_capacity_kg)
    if (isNaN(cap) || cap <= 0) { setVFormError('Enter valid capacity'); return }
    setVSubmitting(true)
    try {
      const payload: Record<string, unknown> = {
        plate_number: vForm.plate_number.trim(),
        vehicle_type: vForm.vehicle_type,
        max_capacity_kg: cap,
        description: vForm.description.trim() || undefined,
      }
      if (vPhoto) payload.vehicle_photo = vPhoto
      if (vLibre) payload.libre_file = vLibre
      await apiClient.post('/profile/driver/vehicles', payload)
      vToast('Vehicle submitted for review!')
      setShowVehicleForm(false)
      setVForm({ plate_number:'', vehicle_type:'Truck', max_capacity_kg:'', description:'' })
      setVPhoto(''); setVLibre('')
      loadMyVehicles()
    } catch (err: any) { setVFormError(err.response?.data?.message ?? 'Submission failed.') }
    finally { setVSubmitting(false) }
  }

  // ── Photo ──────────────────────────────────────────────────────────────────
  const photoInput    = useRef<HTMLInputElement>(null)
  const [photoLoading, setPhotoLoading] = useState(false)
  const [photoError,   setPhotoError]   = useState('')

  const handlePhotoChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) { setPhotoError('Max file size is 5 MB'); return }
    setPhotoError(''); setPhotoLoading(true)
    const reader = new FileReader()
    reader.onload = async () => {
      try {
        await authApi.updateProfile({
          profile_photo_base64: reader.result as string,
          profile_photo_filename: file.name,
        })
        await refreshUser()
      } catch (err: any) {
        setPhotoError(err.response?.data?.message || 'Photo upload failed.')
      } finally {
        setPhotoLoading(false)
        if (photoInput.current) photoInput.current.value = ''
      }
    }
    reader.readAsDataURL(file)
  }

  const handleDeletePhoto = async () => {
    setPhotoError(''); setPhotoLoading(true)
    try {
      await authApi.deleteProfilePhoto()
      updateUser({ profile_photo_url: null })
    } catch (err: any) {
      setPhotoError(err.response?.data?.message || 'Failed to remove photo.')
    } finally {
      setPhotoLoading(false)
    }
  }

  // ── Edit name ─────────────────────────────────────────────────────────────
  const [editFirst,   setEditFirst]   = useState(user?.first_name ?? '')
  const [editLast,    setEditLast]    = useState(user?.last_name ?? '')
  const [nameLoading, setNameLoading] = useState(false)
  const [nameError,   setNameError]   = useState('')
  const [nameSuccess, setNameSuccess] = useState(false)

  const handleSaveName = async (e: FormEvent) => {
    e.preventDefault()
    if (!editFirst.trim()) { setNameError('First name is required'); return }
    setNameError(''); setNameLoading(true)
    try {
      await authApi.updateProfile({ first_name: editFirst.trim(), last_name: editLast.trim() })
      updateUser({ first_name: editFirst.trim(), last_name: editLast.trim() })
      setNameSuccess(true)
      setTimeout(() => setNameSuccess(false), 3000)
    } catch (err: any) {
      setNameError(err.response?.data?.message || 'Failed to update name.')
    } finally {
      setNameLoading(false)
    }
  }

  // ── Change Password ────────────────────────────────────────────────────────
  const [showPwForm, setShowPwForm] = useState(false)
  const [currentPw,  setCurrentPw]  = useState('')
  const [newPw,      setNewPw]      = useState('')
  const [confirmPw,  setConfirmPw]  = useState('')
  const [showPw,     setShowPw]     = useState(false)
  const [pwLoading,  setPwLoading]  = useState(false)
  const [pwError,    setPwError]    = useState('')
  const [pwSuccess,  setPwSuccess]  = useState(false)

  const handleChangePassword = async (e: FormEvent) => {
    e.preventDefault()
    if (newPw !== confirmPw) { setPwError("Passwords don't match"); return }
    if (newPw.length < 6)    { setPwError('Minimum 6 characters'); return }
    setPwError(''); setPwLoading(true)
    try {
      await authApi.changePassword(currentPw, newPw)
      setPwSuccess(true); setCurrentPw(''); setNewPw(''); setConfirmPw('')
      setTimeout(() => { setPwSuccess(false); setShowPwForm(false) }, 2500)
    } catch (err: any) {
      setPwError(err.response?.data?.message || 'Failed to change password.')
    } finally {
      setPwLoading(false)
    }
  }

  // ── Email ──────────────────────────────────────────────────────────────────
  const [showEmailForm, setShowEmailForm] = useState(false)
  const [emailInput,    setEmailInput]    = useState('')
  const [emailLoading,  setEmailLoading]  = useState(false)
  const [emailError,    setEmailError]    = useState('')
  const [emailSent,     setEmailSent]     = useState(false)

  const handleLinkEmail = async (e: FormEvent) => {
    e.preventDefault()
    setEmailError(''); setEmailLoading(true)
    try {
      await authApi.requestEmailLink(emailInput)
      setEmailSent(true)
    } catch (err: any) {
      setEmailError(err.response?.data?.message || 'Failed to send link.')
    } finally {
      setEmailLoading(false)
    }
  }

  // ── Phone change ───────────────────────────────────────────────────────────
  const [showPhoneForm, setShowPhoneForm] = useState(false)
  const [phoneStep,     setPhoneStep]     = useState<'input' | 'otp'>('input')
  const [newPhone,      setNewPhone]      = useState<string>('')
  const [phoneOtp,      setPhoneOtp]      = useState('')
  const [phoneLoading,  setPhoneLoading]  = useState(false)
  const [phoneError,    setPhoneError]    = useState('')
  const [phoneSuccess,  setPhoneSuccess]  = useState(false)

  const handleRequestPhoneOtp = async (e: FormEvent) => {
    e.preventDefault()
    const normalised = normalisePhone(newPhone ?? '')
    if (!normalised) { setPhoneError('Enter a valid phone number'); return }
    setPhoneError(''); setPhoneLoading(true)
    try {
      await authApi.requestPhoneChange(normalised)
      setPhoneStep('otp')
    } catch (err: any) {
      setPhoneError(err.response?.data?.message || 'Failed to send OTP.')
    } finally {
      setPhoneLoading(false)
    }
  }

  const handleVerifyPhoneOtp = async (e: FormEvent) => {
    e.preventDefault()
    const normalised = normalisePhone(newPhone ?? '')
    setPhoneError(''); setPhoneLoading(true)
    try {
      await authApi.verifyPhoneChange(normalised, phoneOtp)
      updateUser({ phone_number: normalised })
      setPhoneSuccess(true)
      setTimeout(() => {
        setPhoneSuccess(false); setShowPhoneForm(false)
        setPhoneStep('input'); setNewPhone(''); setPhoneOtp('')
      }, 2500)
    } catch (err: any) {
      setPhoneError(err.response?.data?.message || 'Invalid OTP.')
    } finally {
      setPhoneLoading(false)
    }
  }

  // ── Delete account ─────────────────────────────────────────────────────────
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleteConfirm,   setDeleteConfirm]   = useState('')
  const [deleteLoading,   setDeleteLoading]   = useState(false)
  const [deleteError,     setDeleteError]     = useState('')

  const handleDeleteAccount = async () => {
    if (deleteConfirm !== 'DELETE') { setDeleteError('Type DELETE to confirm'); return }
    setDeleteError(''); setDeleteLoading(true)
    try {
      throw new Error('Account deletion not yet enabled.')
    } catch (err: any) {
      setDeleteError(err.message || 'Failed to delete account.')
      setDeleteLoading(false)
    }
  }

  const handleLogout = () => { logout(); navigate('/login') }
  const photoUrl = user?.profile_photo_url

  const tabs: TabDef[] = [
    { id: 'profile',     icon: <LuUser size={14}/>,     label: 'Profile'     },
    { id: 'security',    icon: <LuLock size={14}/>,     label: 'Security'    },
    { id: 'contact',     icon: <LuContact size={14}/>,  label: 'Contact'     },
    { id: 'preferences', icon: <LuBell size={14}/>,     label: 'Prefs'       },
    ...(user?.role_id === 3 ? [{ id: 'documents' as Tab, icon: <LuFileText size={14}/>, label: 'Docs' }] : []),
  ]

  // ── Dock items ─────────────────────────────────────────────────────────────
  const dockItems: { id: DockPage; icon: React.ReactNode; label: string; soon?: boolean }[] = [
    { id: 'account',   icon: <LuUser size={19}/>,          label: 'My Account'    },
    ...(user?.role_id === 3 ? [{ id: 'vehicle' as DockPage, icon: <LuCar size={19}/>, label: 'My Vehicle' }] : []),
    ...(user?.role_id === 2 ? [{ id: 'shipments' as DockPage, icon: <LuPackage size={19}/>, label: 'My Shipments' }] : []),
    { id: 'orders',    icon: <LuPackage size={19}/>,       label: 'My Orders',    soon: true },
    { id: 'payments',  icon: <LuWallet size={19}/>,        label: 'Payments',     soon: true },
    { id: 'messages',  icon: <LuMessageSquare size={19}/>, label: 'Messages',     soon: true },
    { id: 'help',      icon: <LuLifeBuoy size={19}/>,      label: 'Help & Support', soon: true },
  ]

  return (
    <div className="aurora-bg" style={{ minHeight: '100vh' }}>
      <div className="aurora-orb aurora-orb-1" />

      {/* ── MOBILE BOTTOM DOCK ── */}
      <div className="dash-dock-mobile">
        {dockItems.map(item => (
          <button key={item.id}
            onClick={() => { if (!item.soon) setActivePage(item.id) }}
            title={item.soon ? `${item.label} — Coming Soon` : item.label}
            className={`dock-btn${activePage === item.id ? ' dock-btn-active' : ''}${item.soon ? ' dock-btn-soon' : ''}`}>
            <span className="dock-icon">{item.icon}</span>
            <span className="dock-label">{item.label}</span>
            {item.soon && <span className="dock-soon-dot"/>}
          </button>
        ))}
      </div>

      {/* ── DESKTOP LEFT DOCK ── */}
      <div className={`dash-dock-desktop${dockExpanded ? ' dock-expanded' : ''}`}>
        <div className="dock-avatar">
          {photoUrl
            ? <img src={photoUrl} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }}/>
            : roleIcon}
        </div>
        <div className="dock-divider"/>
        {dockItems.map(item => (
          <button key={item.id}
            onClick={() => { if (!item.soon) setActivePage(item.id) }}
            title={item.soon ? `${item.label} — Coming Soon` : item.label}
            className={`dock-btn${activePage === item.id ? ' dock-btn-active' : ''}${item.soon ? ' dock-btn-soon' : ''}`}
            style={{ flexDirection: dockExpanded ? 'row' : 'column', justifyContent: dockExpanded ? 'flex-start' : 'center', padding: dockExpanded ? '0.6rem 0.85rem' : '0.65rem 0.5rem', gap: dockExpanded ? '0.65rem' : '0.2rem' }}>
            <span className="dock-icon">{item.icon}</span>
            {dockExpanded && <span className="dock-item-label">{item.label}</span>}
            {item.soon && <span className="dock-soon-dot"/>}
          </button>
        ))}
        <div style={{ flex:1 }}/>
        <div className="dock-divider"/>
        <button onClick={toggleDock} className="dock-btn dock-toggle-btn"
          title={dockExpanded ? 'Collapse' : 'Expand'}>
          {dockExpanded ? <LuChevronLeft size={15}/> : <LuChevronRight size={15}/>}
        </button>
        <button onClick={handleLogout} className="dock-btn" title="Sign out"
          style={{ flexDirection:'column', gap:'0.2rem', padding:'0.65rem 0.5rem' }}>
          <LuLogOut size={18}/>
          {dockExpanded && <span className="dock-item-label">Sign Out</span>}
        </button>
      </div>

      {/* ── Main content area ── */}
      <div className={`dash-main${dockExpanded ? ' dock-wide' : ''}`}>
        {activePage === 'account' && (
          <div className="page-shell" style={{ alignItems:'flex-start' }}>
            <div style={{ width:'100%', maxWidth:560, display:'flex', flexDirection:'column', gap:'1.25rem' }}>

              {/* Header card */}
              <div className="glass page-enter" style={{ padding:'1.75rem' }}>
                <div style={{ display:'flex', alignItems:'flex-start', gap:'1.1rem' }}>
                  <div style={{ position:'relative', flexShrink:0 }}>
                    <div style={{ width:76, height:76, borderRadius:'50%', background: photoUrl ? 'transparent' : 'linear-gradient(135deg,var(--clr-accent2),var(--clr-accent))', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'2rem', overflow:'hidden', border:'2.5px solid rgba(0,229,255,0.3)', boxShadow:'0 0 24px rgba(0,229,255,0.2)' }}>
                      {photoUrl ? <img src={photoUrl} alt="Profile" style={{ width:'100%', height:'100%', objectFit:'cover' }}/> : roleIcon}
                    </div>
                    <button title="Change photo" onClick={() => photoInput.current?.click()} disabled={photoLoading}
                      style={{ position:'absolute', bottom:0, right:0, width:26, height:26, borderRadius:'50%', background:'var(--clr-accent)', border:'2px solid rgba(0,0,0,0.4)', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', boxShadow:'0 2px 8px rgba(0,0,0,0.5)' }}>
                      {photoLoading ? '…' : <LuCamera size={13}/>}
                    </button>
                    <input ref={photoInput} type="file" accept="image/jpeg,image/png,image/webp" style={{ display:'none' }} onChange={handlePhotoChange} />
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:'0.6rem', flexWrap:'wrap' }}>
                      <h1 style={{ fontSize:'1.2rem', fontWeight:800, color:'var(--clr-text)' }}>{user?.first_name} {user?.last_name}</h1>
                      <span className="badge badge-cyan">{roleLabel}</span>
                    </div>
                    <p style={{ color:'var(--clr-muted)', fontSize:'0.83rem', marginTop:'0.15rem' }}>{user?.phone_number}</p>
                    {user?.email && (
                      <p style={{ color:'var(--clr-muted)', fontSize:'0.78rem', marginTop:'0.1rem' }}>
                        {user.email}{' '}
                        {user.is_email_verified
                          ? <span style={{ color:'#4ade80', fontSize:'0.72rem', display:'inline-flex', alignItems:'center', gap:'0.2rem' }}><LuCircleCheck size={12}/> verified</span>
                          : <span style={{ color:'#fbbf24', fontSize:'0.72rem' }}>(pending)</span>}
                      </p>
                    )}
                    {photoError && <p style={{ color:'#fca5a5', fontSize:'0.77rem', marginTop:'0.3rem' }}>{photoError}</p>}
                    {photoUrl && (
                      <button className="btn-outline" style={{ marginTop:'0.5rem', fontSize:'0.73rem', padding:'0.28rem 0.7rem', display:'flex', alignItems:'center', gap:'0.35rem' }}
                        onClick={handleDeletePhoto} disabled={photoLoading}>
                        <LuTrash2 size={13}/> Remove photo
                      </button>
                    )}
                  </div>
                  {/* Sign out only visible on mobile (desktop uses dock) */}
                  <button className="btn-outline dash-signout-mobile" style={{ flexShrink:0, fontSize:'0.78rem', display:'flex', alignItems:'center', gap:'0.35rem' }} onClick={handleLogout}>
                    <LuLogOut size={14}/>
                  </button>
                </div>
              </div>

              {/* Account sub-tabs */}
              <div style={{ display:'flex', gap:'0.4rem', background:'rgba(255,255,255,0.04)', borderRadius:14, padding:'0.32rem' }}>
                {tabs.map(t => (
                  <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
                    flex:1, padding:'0.5rem 0.35rem', border:'none', borderRadius:10,
                    background: activeTab === t.id ? 'rgba(0,229,255,0.12)' : 'transparent',
                    color: activeTab === t.id ? 'var(--clr-accent)' : 'var(--clr-muted)',
                    fontFamily:'inherit', fontSize:'0.78rem', fontWeight:600,
                    cursor:'pointer', transition:'all 0.18s',
                    display:'flex', alignItems:'center', justifyContent:'center', gap:'0.35rem',
                    outline: activeTab === t.id ? '1px solid rgba(0,229,255,0.2)' : 'none',
                  }}>
                    {t.icon}{t.label}
                  </button>
                ))}
              </div>

          {/* Profile tab */}
          {activeTab === 'profile' && (
            <div className="glass step-enter" style={{ padding: '1.75rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {user?.role_id === 3 && driverProfile && driverProfile.is_verified !== 1 && (() => {
                const completedDocs = (driverProfile.national_id_url ? 1 : 0) + (driverProfile.license_url ? 1 : 0) + (driverProfile.libre_url ? 1 : 0)
                const pct = Math.round((completedDocs / 3) * 100)
                return (
                  <div className="glass-inner" style={{ padding:'1rem', display:'flex', flexDirection:'column', gap:'0.6rem', borderLeft:'3px solid var(--clr-accent)' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                      <p style={{ fontWeight:700, fontSize:'0.875rem', color:'var(--clr-text)', display:'flex', alignItems:'center', gap:'0.4rem' }}>
                        <LuUpload size={14} color="var(--clr-accent)"/> Verification Progress
                      </p>
                      <span style={{ fontSize:'0.75rem', color:'var(--clr-muted)', fontWeight:600 }}>{completedDocs}/3 docs</span>
                    </div>
                    <div style={{ height:5, borderRadius:99, background:'rgba(255,255,255,0.08)', overflow:'hidden' }}>
                      <div style={{ height:'100%', width:`${pct}%`, borderRadius:99, background:'linear-gradient(90deg,var(--clr-accent2),var(--clr-accent))', transition:'width 0.4s' }}/>
                    </div>
                    <p style={{ fontSize:'0.78rem', color:'var(--clr-muted)', lineHeight:1.5 }}>
                      {completedDocs === 0 ? 'Upload your verification documents to get started.' : `${completedDocs} of 3 documents uploaded — ${3 - completedDocs} remaining.`}
                    </p>
                    <button onClick={() => setActiveTab('documents')} style={{ alignSelf:'flex-start', padding:'0.32rem 0.8rem', borderRadius:8, border:'1px solid rgba(0,229,255,0.25)', background:'rgba(0,229,255,0.07)', color:'var(--clr-accent)', fontFamily:'inherit', fontSize:'0.78rem', fontWeight:700, cursor:'pointer' }}>
                      Go to Documents →
                    </button>
                  </div>
                )
              })()}
              <h2 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--clr-text)', display:'flex', alignItems:'center', gap:'0.45rem' }}><LuUser size={16}/> Profile Information</h2>
              <div className="glass-inner" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                <InfoRow icon={<LuIdCard size={15}/>}       label="User ID" value={user?.id ? user.id.slice(0, 8) + '…' : '—'} />
                <InfoRow icon={<LuPhone size={15}/>}        label="Phone"   value={user?.phone_number ?? '—'} />
                <InfoRow icon={<LuMail size={15}/>}         label="Email"   value={user?.email || '— not linked'} />
                <InfoRow icon={<LuShield size={15}/>}       label="Role"    value={roleLabel} />
                <InfoRow icon={<LuCircleCheck size={15}/>}  label="Status"  value={user?.is_active ? 'Active' : 'Suspended'} />
              </div>
              <Divider />
              <form onSubmit={handleSaveName} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <p style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--clr-text)' }}>Display Name</p>
                {nameError   && <div className="alert alert-error"><LuTriangleAlert size={14}/> {nameError}</div>}
                {nameSuccess && <div className="alert alert-success" style={{display:'flex',alignItems:'center',gap:'0.4rem'}}><LuCheck size={14}/> Name saved!</div>}
                <div style={{ display: 'flex', gap: '0.65rem' }}>
                  <div className="input-wrap" style={{ flex: 1 }}>
                    <input id="ef" type="text" placeholder=" " value={editFirst} onChange={e => setEditFirst(e.target.value)} required />
                    <label htmlFor="ef">First name</label>
                  </div>
                  <div className="input-wrap" style={{ flex: 1 }}>
                    <input id="el" type="text" placeholder=" " value={editLast} onChange={e => setEditLast(e.target.value)} />
                    <label htmlFor="el">Last name</label>
                  </div>
                </div>
                <button type="submit" className="btn-primary" disabled={nameLoading}>
                  {nameLoading ? <Spinner text="Saving…" /> : 'Save Name'}
                </button>
              </form>
            </div>
          )}

          {/* Security tab */}
          {activeTab === 'security' && (
            <div className="glass step-enter" style={{ padding: '1.75rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <h2 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--clr-text)', display:'flex', alignItems:'center', gap:'0.45rem' }}><LuLock size={16}/> Security</h2>
              <SectionRow
                title="Password" sub="Update your login password"
                open={showPwForm} onToggle={() => { setShowPwForm(v => !v); setPwError(''); setPwSuccess(false) }}
                toggleLabel={showPwForm ? 'Cancel' : 'Change'}
              >
                <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }} className="step-enter">
                  {pwError   && <div className="alert alert-error"><LuTriangleAlert size={14}/> {pwError}</div>}
                  {pwSuccess && <div className="alert alert-success" style={{display:'flex',alignItems:'center',gap:'0.4rem'}}><LuCheck size={14}/> Password updated!</div>}
                  <PasswordInput id="cpw-cur" label="Current password"          value={currentPw} onChange={setCurrentPw} show={showPw} onToggle={() => setShowPw(v => !v)} />
                  <PasswordInput id="cpw-new" label="New password (min 6 chars)" value={newPw}     onChange={setNewPw}     show={showPw} onToggle={() => setShowPw(v => !v)} />
                  <PasswordInput id="cpw-cfg" label="Confirm new password"      value={confirmPw} onChange={setConfirmPw} show={showPw} onToggle={() => setShowPw(v => !v)}
                    hasError={!!(confirmPw && confirmPw !== newPw)} />
                  <button type="submit" className="btn-primary" disabled={pwLoading}>
                    {pwLoading ? <Spinner text="Saving…" /> : 'Update Password'}
                  </button>
                </form>
              </SectionRow>
              <Divider />
              <div className="danger-card">
                <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#fca5a5', marginBottom: '0.5rem', display:'flex', alignItems:'center', gap:'0.4rem' }}><LuTriangleAlert size={15}/> Danger Zone</h3>
                <p style={{ fontSize: '0.82rem', color: 'var(--clr-muted)', marginBottom: '1rem' }}>
                  Permanently delete your account and all associated data.
                </p>
                <button onClick={() => { setShowDeleteModal(true); setDeleteConfirm(''); setDeleteError('') }}
                  style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5', fontFamily: 'inherit', fontSize: '0.875rem', fontWeight: 600, padding: '0.6rem 1.2rem', borderRadius: 10, cursor: 'pointer', transition: 'all 0.2s' }}>
                  Delete My Account
                </button>
              </div>
            </div>
          )}

          {/* Contact tab */}
          {activeTab === 'contact' && (
            <div className="glass step-enter" style={{ padding: '1.75rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <h2 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--clr-text)', display:'flex', alignItems:'center', gap:'0.45rem' }}><LuSmartphone size={16}/> Contact Details</h2>

              <SectionRow
                title="Email Address"
                sub={user?.email ? `${user.email}${user.is_email_verified ? ' ✓' : ' (unverified)'}` : 'Link an email for recovery & notifications'}
                open={showEmailForm}
                onToggle={() => { setShowEmailForm(v => !v); setEmailError(''); setEmailSent(false) }}
                toggleLabel={showEmailForm ? 'Cancel' : user?.email ? 'Change' : 'Link'}
              >
                {emailSent ? (
                  <div className="alert alert-success step-enter" style={{display:'flex',alignItems:'center',gap:'0.4rem'}}>
                    <LuCheck size={14}/> Verification link sent to <strong>{emailInput}</strong>. Check your inbox and click the link.
                  </div>
                ) : (
                  <form onSubmit={handleLinkEmail} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }} className="step-enter">
                    {emailError && <div className="alert alert-error"><LuTriangleAlert size={14}/> {emailError}</div>}
                    <div className="input-wrap">
                      <input id="em-in" type="email" placeholder=" " value={emailInput}
                        onChange={e => setEmailInput(e.target.value)} required autoComplete="email" />
                      <label htmlFor="em-in">Email address</label>
                    </div>
                    <button type="submit" className="btn-primary" disabled={emailLoading}>
                      {emailLoading ? <Spinner text="Sending…" /> : 'Send Verification Link'}
                    </button>
                  </form>
                )}
              </SectionRow>

              <Divider />

              <SectionRow
                title="Phone Number" sub={user?.phone_number ?? 'Your verified phone'}
                open={showPhoneForm}
                onToggle={() => { setShowPhoneForm(v => !v); setPhoneError(''); setPhoneSuccess(false); setPhoneStep('input'); setPhoneOtp(''); setNewPhone('') }}
                toggleLabel={showPhoneForm ? 'Cancel' : 'Change'}
              >
                {phoneSuccess ? (
                  <div className="alert alert-success step-enter" style={{display:'flex',alignItems:'center',gap:'0.4rem'}}><LuCheck size={14}/> Phone number updated!</div>
                ) : phoneStep === 'input' ? (
                  <form onSubmit={handleRequestPhoneOtp} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }} className="step-enter">
                    {phoneError && <div className="alert alert-error"><LuTriangleAlert size={14}/> {phoneError}</div>}
                    <p style={{ fontSize: '0.8rem', color: 'var(--clr-muted)' }}>Enter your new number. An OTP will be sent to verify it.</p>
                    <PhoneField value={newPhone} onChange={setNewPhone} id="new-phone" />
                    <button type="submit" className="btn-primary" disabled={phoneLoading}>
                      {phoneLoading ? <Spinner text="Sending OTP…" /> : 'Send OTP to New Number'}
                    </button>
                  </form>
                ) : (
                  <form onSubmit={handleVerifyPhoneOtp} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }} className="step-enter">
                    {phoneError && <div className="alert alert-error"><LuTriangleAlert size={14}/> {phoneError}</div>}
                    <p style={{ fontSize: '0.8rem', color: 'var(--clr-muted)' }}>
                      OTP sent to <strong style={{ color: 'var(--clr-text)' }}>{normalisePhone(newPhone ?? '')}</strong>. Enter it below.
                    </p>
                    <div className="input-wrap">
                      <input id="ph-otp" type="text" inputMode="numeric" placeholder=" " maxLength={6}
                        value={phoneOtp} onChange={e => setPhoneOtp(e.target.value.replace(/\D/g, ''))} required />
                      <label htmlFor="ph-otp">6-digit OTP</label>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button type="button" className="btn-outline" style={{ flex: 1, display:'flex', alignItems:'center', gap:'0.3rem', justifyContent:'center' }}
                        onClick={() => setPhoneStep('input')} disabled={phoneLoading}><LuArrowLeft size={14}/> Back</button>
                      <button type="submit" className="btn-primary" style={{ flex: 2 }}
                        disabled={phoneLoading || phoneOtp.length < 6}>
                        {phoneLoading ? <Spinner text="Verifying…" /> : 'Verify & Update'}
                      </button>
                    </div>
                  </form>
                )}
              </SectionRow>
            </div>
          )}

          {/* Preferences tab */}
          {activeTab === 'preferences' && (
            <div className="glass step-enter" style={{ padding: '1.75rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {/* Theme */}
              <div>
                <h2 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--clr-text)', display:'flex', alignItems:'center', gap:'0.45rem', marginBottom:'1rem' }}><LuSun size={16}/> Display Theme</h2>
                <div style={{ display:'flex', gap:'0.6rem' }}>
                  {([['LIGHT', <LuSun size={15}/>, 'Light'], ['DARK', <LuMoon size={15}/>, 'Dark'], ['SYSTEM', <LuMonitor size={15}/>, 'System']] as const).map(([val, icon, label]) => (
                    <button key={val} onClick={() => handleSetTheme(val)} disabled={themeLoading}
                      style={{
                        flex: 1, padding: '0.7rem 0.5rem', borderRadius: 12, border: '1px solid',
                        borderColor: themeVal === val ? 'var(--clr-accent)' : 'rgba(255,255,255,0.10)',
                        background: themeVal === val ? 'rgba(0,229,255,0.10)' : 'rgba(255,255,255,0.03)',
                        color: themeVal === val ? 'var(--clr-accent)' : 'var(--clr-muted)',
                        fontFamily: 'inherit', fontSize: '0.82rem', fontWeight: 600,
                        cursor: 'pointer', transition: 'all 0.18s',
                        display:'flex', flexDirection:'column', alignItems:'center', gap:'0.35rem',
                      }}>
                      {icon}{label}
                    </button>
                  ))}
                </div>
                {themeMsg && <p style={{ fontSize:'0.78rem', color: themeMsg.includes('Failed') ? 'var(--clr-danger)' : '#86efac', marginTop:'0.5rem' }}>{themeMsg}</p>}
              </div>

              <Divider />

              {/* Notifications */}
              <div>
                <h2 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--clr-text)', display:'flex', alignItems:'center', gap:'0.45rem', marginBottom:'0.25rem' }}><LuBell size={16}/> Notifications</h2>
                <p style={{ fontSize:'0.78rem', color:'var(--clr-muted)', marginBottom:'1rem' }}>SMS is reserved for critical alerts only.</p>
                {notifMsg && <div className={`alert ${notifMsg.includes('Failed') ? 'alert-error' : 'alert-success'}`} style={{marginBottom:'0.75rem',display:'flex',alignItems:'center',gap:'0.4rem'}}><LuCheck size={13}/> {notifMsg}</div>}
                <div style={{ display:'flex', flexDirection:'column', gap:'0' }}>
                  {([
                    { key: 'sms_enabled',     icon: <LuSmartphone size={15}/>, label: 'SMS Alerts',            sub: 'Critical updates only — order status, OTPs' },
                    { key: 'email_enabled',   icon: <LuMail size={15}/>,       label: 'Email Notifications',   sub: 'Order summaries, receipts, account alerts' },
                    { key: 'browser_enabled', icon: <LuBell size={15}/>,       label: 'Browser Notifications', sub: 'Real-time web push alerts while browsing' },
                    { key: 'telegram_enabled', icon: <LuMessageSquare size={15}/>, label: 'Telegram Alerts',       sub: 'Real-time alerts via Telegram bot' },
                    { key: 'order_updates',   icon: <LuTruck size={15}/>,                label: 'Order Updates',         sub: 'Status changes on your logistics orders' },
                    { key: 'promotions',      icon: <LuStar size={15}/>,       label: 'Promotions',            sub: 'News, offers and platform announcements' },
                  ] as { key: keyof typeof notifPrefs; icon: React.ReactNode; label: string; sub: string }[]).map(({ key, icon, label, sub }, i, arr) => (
                    <div key={key} style={{ display:'flex', alignItems:'center', gap:'0.85rem', padding:'0.9rem 0', borderBottom: i < arr.length-1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                      <span style={{ color:'var(--clr-accent)', display:'flex', alignItems:'center', flexShrink:0 }}>{icon}</span>
                      <div style={{ flex:1 }}>
                        <p style={{ fontSize:'0.875rem', fontWeight:600, color:'var(--clr-text)' }}>{label}</p>
                        <p style={{ fontSize:'0.75rem', color:'var(--clr-muted)', marginTop:'0.1rem' }}>{sub}</p>
                      </div>
                      <button onClick={() => handleToggleNotif(key)} disabled={notifLoading}
                        style={{
                          width: 44, height: 24, borderRadius: 99, border: 'none', cursor: 'pointer',
                          background: notifPrefs[key] ? 'var(--clr-accent)' : 'rgba(255,255,255,0.12)',
                          transition: 'background 0.2s', flexShrink: 0, position: 'relative',
                        }}>
                        <span style={{
                          position:'absolute', top: 3, left: notifPrefs[key] ? 23 : 3,
                          width: 18, height: 18, borderRadius: '50%',
                          background: notifPrefs[key] ? '#080b14' : 'var(--clr-muted)',
                          transition: 'left 0.2s',
                        }} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Driver Documents tab */}
          {activeTab === 'documents' && user?.role_id === 3 && (
            <div className="glass step-enter" style={{ padding: '1.75rem', display:'flex', flexDirection:'column', gap:'1.25rem' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <h2 style={{ fontSize:'0.95rem', fontWeight:700, color:'var(--clr-text)', display:'flex', alignItems:'center', gap:'0.45rem' }}><LuFileText size={16}/> Verification Documents</h2>
                <button className="btn-outline" style={{ fontSize:'0.75rem', padding:'0.35rem 0.7rem', display:'flex', alignItems:'center', gap:'0.35rem' }}
                  onClick={() => { setDocsLoading(true); apiClient.get('/profile/driver').then(r => setDriverProfile(r.data.driver_profile)).catch(()=>{}).finally(()=>setDocsLoading(false)) }}>
                  <LuRefreshCw size={13}/> Refresh
                </button>
              </div>

              {driverProfile?.is_verified === 1 && (
                <div className="alert alert-success" style={{ display:'flex', alignItems:'center', gap:'0.5rem', fontWeight:700 }}>
                  <LuCircleCheck size={15}/> Your account is fully verified!
                </div>
              )}
              {driverProfile?.rejection_reason && (
                <div className="alert alert-error">
                  <LuTriangleAlert size={14}/> Rejected: {driverProfile.rejection_reason}
                </div>
              )}

              {docsError   && <div className="alert alert-error"><LuTriangleAlert size={14}/> {docsError}</div>}
              {docsSuccess && <div className="alert alert-success" style={{display:'flex',alignItems:'center',gap:'0.4rem'}}><LuCheck size={14}/> {docsSuccess}</div>}

              {docsLoading ? (
                <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', color:'var(--clr-muted)', fontSize:'0.875rem', padding:'1rem 0' }}>
                  <span className="spinner" /> Loading…
                </div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:'0.85rem' }}>
                  {([
                    { key: 'national_id', label: 'National ID',             urlKey: 'national_id_url', statusKey: 'national_id_status' },
                    { key: 'license',     label: "Driver's License",        urlKey: 'license_url',     statusKey: 'license_status'     },
                    { key: 'libre',       label: 'Libre (Vehicle Ownership)', urlKey: 'libre_url',     statusKey: 'libre_status'       },
                  ] as { key: 'national_id'|'license'|'libre'; label: string; urlKey: string; statusKey: string }[]).map(doc => {
                    const rawUrl = driverProfile?.[doc.urlKey] as string | null
                    const apiBase = (import.meta.env.VITE_API_BASE_URL as string ?? '').replace(/\/api$/, '')
                    const url = rawUrl ? (rawUrl.startsWith('http') ? rawUrl : `${apiBase}${rawUrl}`) : null
                    const status = (driverProfile?.[doc.statusKey] ?? 'NOT UPLOADED') as string
                    const statusColor = status === 'APPROVED' ? '#4ade80' : status === 'REJECTED' ? '#fca5a5' : status === 'PENDING' ? '#fbbf24' : 'var(--clr-muted)'
                    const inputId = `doc-${doc.key}`
                    return (
                      <div key={doc.key} className="glass-inner" style={{ padding:'1rem', display:'flex', flexDirection:'column', gap:'0.65rem' }}>
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                          <p style={{ fontWeight:600, fontSize:'0.875rem', color:'var(--clr-text)' }}>{doc.label}</p>
                          <span style={{ fontSize:'0.73rem', fontWeight:700, color: statusColor, background: `${statusColor}18`, border: `1px solid ${statusColor}44`, borderRadius:99, padding:'0.2rem 0.6rem' }}>
                            {status}
                          </span>
                        </div>
                        {url && (
                          <a href={url} target="_blank" rel="noopener noreferrer"
                            style={{ fontSize:'0.78rem', color:'var(--clr-accent)', display:'flex', alignItems:'center', gap:'0.3rem', textDecoration:'none' }}>
                            <LuFileText size={13}/> View uploaded file ↗
                          </a>
                        )}
                        <label htmlFor={inputId} style={{
                          display:'flex', alignItems:'center', justifyContent:'center', gap:'0.5rem',
                          padding:'0.6rem', borderRadius:10, border:'1px dashed rgba(255,255,255,0.18)',
                          color: uploadingDoc === doc.key ? 'var(--clr-accent)' : 'var(--clr-muted)',
                          cursor: uploadingDoc ? 'not-allowed' : 'pointer',
                          fontSize:'0.82rem', fontWeight:600, transition:'all 0.18s',
                          background: 'rgba(255,255,255,0.02)',
                        }}>
                          {uploadingDoc === doc.key ? <><span className="spinner" /> Uploading…</> : <><LuUpload size={14}/> {url ? 'Replace' : 'Upload'} file</>}
                        </label>
                        <input id={inputId} type="file" accept="image/jpeg,image/png,image/webp,application/pdf"
                          style={{ display:'none' }} disabled={!!uploadingDoc}
                          onChange={e => { const f = e.target.files?.[0]; if(f) handleDocUpload(doc.key, f); e.target.value='' }} />
                        <p style={{ fontSize:'0.72rem', color:'var(--clr-muted)' }}>Accepted: JPG, PNG, WEBP, PDF · Max 8 MB</p>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          <p style={{ textAlign: 'center', fontSize: '0.73rem', color: 'var(--clr-muted)', paddingBottom: '1rem' }}>
            Africa Logistics Platform · v1.0
          </p>
            </div>
          </div>
        )}

        {activePage === 'shipments' && user?.role_id === 2 && (
          <div className="page-shell" style={{ alignItems:'flex-start' }}>
            <div style={{ width:'100%', maxWidth:560, display:'flex', flexDirection:'column', gap:'1.25rem' }}>
              {/* Shipper Hero */}
              <div className="glass page-enter" style={{ padding:'1.75rem' }}>
                <div style={{ display:'flex', alignItems:'center', gap:'1rem', marginBottom:'1.25rem' }}>
                  <div style={{ width:52, height:52, borderRadius:'50%', background:'linear-gradient(135deg,var(--clr-accent2),var(--clr-accent))', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                    <LuPackage size={24} color="#080b14"/>
                  </div>
                  <div>
                    <h2 style={{ fontSize:'1.1rem', fontWeight:800, color:'var(--clr-text)', marginBottom:'0.15rem' }}>Shipper Hub</h2>
                    <p style={{ fontSize:'0.8rem', color:'var(--clr-muted)' }}>Welcome back, {user?.first_name}</p>
                  </div>
                </div>
                {/* Quick stats */}
                <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'0.65rem', marginBottom:'1.25rem' }}>
                  {([['Total Orders','0',<LuPackage size={16}/>],['Active','0',<LuTruck size={16}/>],['Completed','0',<LuCircleCheck size={16}/>]] as const).map(([label, val, icon]) => (
                    <div key={label} className="glass-inner" style={{ padding:'0.9rem 0.65rem', textAlign:'center', display:'flex', flexDirection:'column', gap:'0.35rem', alignItems:'center' }}>
                      <span style={{ color:'var(--clr-accent)', opacity:0.8 }}>{icon}</span>
                      <span style={{ fontSize:'1.4rem', fontWeight:800, color:'var(--clr-text)', lineHeight:1 }}>{val}</span>
                      <span style={{ fontSize:'0.68rem', color:'var(--clr-muted)', fontWeight:600 }}>{label}</span>
                    </div>
                  ))}
                </div>
                {/* Booking CTA */}
                <div style={{ background:'rgba(0,229,255,0.05)', border:'1px solid rgba(0,229,255,0.15)', borderRadius:12, padding:'1rem 1.1rem', display:'flex', alignItems:'center', gap:'0.85rem' }}>
                  <LuClock size={20} color="var(--clr-accent)" style={{ flexShrink:0 }}/>
                  <div style={{ flex:1 }}>
                    <p style={{ fontWeight:700, fontSize:'0.875rem', color:'var(--clr-text)', marginBottom:'0.2rem' }}>Order booking is coming soon</p>
                    <p style={{ fontSize:'0.78rem', color:'var(--clr-muted)', lineHeight:1.5 }}>You'll be able to book trucks, track deliveries, and manage invoices all in one place.</p>
                  </div>
                </div>
              </div>
              {/* Notification reminder */}
              <div className="glass page-enter" style={{ padding:'1.25rem 1.5rem' }}>
                <div style={{ display:'flex', alignItems:'center', gap:'0.75rem' }}>
                  <LuBell size={18} color="var(--clr-accent)" style={{ flexShrink:0 }}/>
                  <div style={{ flex:1 }}>
                    <p style={{ fontWeight:700, fontSize:'0.875rem', color:'var(--clr-text)', marginBottom:'0.15rem' }}>Stay Notified</p>
                    <p style={{ fontSize:'0.78rem', color:'var(--clr-muted)' }}>Configure SMS, email and Telegram alerts in your preferences.</p>
                  </div>
                  <button onClick={() => { setActivePage('account'); setTimeout(() => setActiveTab('preferences'), 50) }}
                    style={{ padding:'0.38rem 0.8rem', borderRadius:8, border:'1px solid rgba(0,229,255,0.25)', background:'rgba(0,229,255,0.07)', color:'var(--clr-accent)', fontFamily:'inherit', fontSize:'0.75rem', fontWeight:700, cursor:'pointer', flexShrink:0 }}>
                    Settings
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
        {activePage === 'orders'   && <ComingSoon title="Orders" icon={<LuPackage size={30}/>} desc="Track and manage your logistics orders, delivery timelines and status updates in real time." />}
        {activePage === 'payments' && <ComingSoon title="Payments" icon={<LuWallet size={30}/>} desc="View invoices, payment history and manage your billing information securely." />}
        {activePage === 'messages' && <ComingSoon title="Messages" icon={<LuMessageSquare size={30}/>} desc="Communicate directly with drivers and dispatchers through the in-app secure messaging channel." />}
        {activePage === 'help'     && <ComingSoon title="Help & Support" icon={<LuLifeBuoy size={30}/>} desc="Access guides, FAQs and contact customer support for any platform-related issues." />}

        {/* ── My Vehicle (drivers only) ── */}
        {activePage === 'vehicle' && user?.role_id === 3 && (
          <div className="page-shell" style={{ alignItems:'flex-start' }}>
            <div style={{ width:'100%', maxWidth:560, display:'flex', flexDirection:'column', gap:'1.25rem' }}>
              <div className="glass page-enter" style={{ padding:'1.5rem' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1rem', gap:'0.5rem', flexWrap:'wrap' }}>
                  <h2 style={{ fontSize:'1rem', fontWeight:800, color:'var(--clr-text)', display:'flex', alignItems:'center', gap:'0.45rem' }}><LuCar size={17}/> My Vehicle</h2>
                  <div style={{ display:'flex', gap:'0.4rem' }}>
                    <button onClick={loadMyVehicles} disabled={vehicleLoading}
                      style={{ display:'flex', alignItems:'center', gap:'0.35rem', padding:'0.3rem 0.65rem', borderRadius:8, border:'1px solid rgba(255,255,255,0.1)', background:'rgba(255,255,255,0.04)', color:'var(--clr-muted)', fontFamily:'inherit', fontSize:'0.72rem', fontWeight:600, cursor:'pointer' }}>
                      <LuRefreshCw size={12}/> Refresh
                    </button>
                    {!showVehicleForm && (
                      <button onClick={() => { setShowVehicleForm(true); setVFormError('') }}
                        style={{ display:'flex', alignItems:'center', gap:'0.35rem', padding:'0.3rem 0.75rem', borderRadius:8, border:'none', background:'var(--clr-accent)', color:'#080b14', fontFamily:'inherit', fontSize:'0.75rem', fontWeight:700, cursor:'pointer' }}>
                        + Submit Vehicle
                      </button>
                    )}
                  </div>
                </div>

                <p style={{ fontSize:'0.8rem', color:'var(--clr-muted)', marginBottom:'1rem', lineHeight:1.6 }}>
                  Own a vehicle? Submit it for admin approval. Once approved, it will be assigned to your driver profile.
                </p>

                {vehicleLoading ? (
                  <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', padding:'1.5rem', color:'var(--clr-muted)', fontSize:'0.875rem', justifyContent:'center' }}>
                    <span className="spinner"/> Loading…
                  </div>
                ) : myVehicles.length === 0 && !showVehicleForm ? (
                  <div style={{ padding:'2rem', textAlign:'center', color:'var(--clr-muted)', fontSize:'0.875rem', background:'rgba(255,255,255,0.02)', borderRadius:12, border:'1px dashed rgba(255,255,255,0.08)' }}>
                    <LuCar size={32} style={{ opacity:0.3, display:'block', margin:'0 auto 0.75rem' }}/>
                    No vehicles submitted yet.<br/>
                    <span style={{ fontSize:'0.78rem' }}>Click <strong style={{ color:'var(--clr-accent)' }}>Submit Vehicle</strong> above to get started.</span>
                  </div>
                ) : (
                  <div style={{ display:'flex', flexDirection:'column', gap:'0.65rem' }}>
                    {myVehicles.map(v => {
                      const st = v.driver_submission_status
                      const sColor = st === 'APPROVED' ? '#4ade80' : st === 'REJECTED' ? '#fca5a5' : '#fbbf24'
                      const imgUrl = absUrl(v.vehicle_photo_url)
                      return (
                        <div key={v.id} className="glass-inner" style={{ padding:'0.9rem 1rem', display:'flex', alignItems:'flex-start', gap:'0.75rem' }}>
                          <div style={{ width:44, height:44, borderRadius:10, flexShrink:0, background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.1)', display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden' }}>
                            {imgUrl ? <img src={imgUrl} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }}/> : <LuCar size={20} color="var(--clr-muted)"/>}
                          </div>
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ display:'flex', alignItems:'center', gap:'0.4rem', flexWrap:'wrap', marginBottom:'0.2rem' }}>
                              <span style={{ fontWeight:700, fontSize:'0.9rem', color:'var(--clr-text)' }}>{v.plate_number}</span>
                              <span className="badge badge-cyan" style={{ fontSize:'0.67rem' }}>{v.vehicle_type}</span>
                              <span style={{ fontSize:'0.68rem', fontWeight:700, color:sColor, background:`${sColor}18`, border:`1px solid ${sColor}44`, borderRadius:99, padding:'0.15rem 0.5rem' }}>
                                {st ?? 'PENDING'}
                              </span>
                            </div>
                            <p style={{ fontSize:'0.73rem', color:'var(--clr-muted)' }}>{v.max_capacity_kg} kg{v.description ? ` · ${v.description}` : ''}</p>
                            {v.libre_url && (
                              <a href={absUrl(v.libre_url)!} target="_blank" rel="noopener noreferrer" style={{ fontSize:'0.7rem', color:'var(--clr-accent)', display:'inline-flex', alignItems:'center', gap:'0.2rem', marginTop:'0.2rem', textDecoration:'none' }}>
                                <LuFileText size={11}/> View Libre ↗
                              </a>
                            )}
                            {st === 'PENDING' && (
                              <p style={{ fontSize:'0.73rem', color:'#fbbf24', marginTop:'0.25rem', display:'flex', alignItems:'center', gap:'0.3rem' }}>
                                <LuClock size={11}/> Under review by admin
                              </p>
                            )}
                            {st === 'APPROVED' && (
                              <p style={{ fontSize:'0.73rem', color:'#4ade80', marginTop:'0.25rem', display:'flex', alignItems:'center', gap:'0.3rem' }}>
                                <LuCircleCheck size={11}/> Approved — vehicle assigned to your profile
                              </p>
                            )}
                            {st === 'REJECTED' && (
                              <p style={{ fontSize:'0.73rem', color:'#fca5a5', marginTop:'0.25rem', display:'flex', alignItems:'center', gap:'0.3rem' }}>
                                <LuTriangleAlert size={11}/> Rejected — you may submit a new vehicle
                              </p>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Submit vehicle form */}
                {showVehicleForm && (
                  <div style={{ marginTop:'1rem', borderTop:'1px solid rgba(255,255,255,0.06)', paddingTop:'1rem' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'0.85rem' }}>
                      <h3 style={{ fontSize:'0.9rem', fontWeight:700, color:'var(--clr-text)' }}>Submit Your Vehicle</h3>
                      <button onClick={() => { setShowVehicleForm(false); setVFormError(''); setVPhoto(''); setVLibre('') }}
                        style={{ background:'none', border:'none', cursor:'pointer', color:'var(--clr-muted)', padding:0, display:'flex', alignItems:'center' }}>
                        <LuX size={16}/>
                      </button>
                    </div>
                    <form onSubmit={handleVSubmit} style={{ display:'flex', flexDirection:'column', gap:'0.75rem' }}>
                      {vFormError && <div className="alert alert-error"><LuTriangleAlert size={13}/> {vFormError}</div>}
                      <div className="input-wrap">
                        <input id="v-plate" type="text" placeholder=" " value={vForm.plate_number} onChange={e => setVForm(f => ({ ...f, plate_number: e.target.value }))} required/>
                        <label htmlFor="v-plate">Plate Number *</label>
                      </div>
                      <div className="input-wrap">
                        <select id="v-type" value={vForm.vehicle_type} onChange={e => setVForm(f => ({ ...f, vehicle_type: e.target.value }))}
                          style={{ background:'transparent', border:'none', color:'var(--clr-text)', fontFamily:'inherit', fontSize:'0.9rem', width:'100%', outline:'none', paddingTop:'1.1rem' }}>
                          {vehicleTypes.map(t => <option key={t} value={t} style={{ background:'#0f172a' }}>{t}</option>)}
                        </select>
                        <label htmlFor="v-type" style={{ top:'0.35rem', fontSize:'0.7rem', color:'var(--clr-accent)' }}>Vehicle Type</label>
                      </div>
                      <div className="input-wrap">
                        <input id="v-cap" type="number" placeholder=" " min="1" step="1" value={vForm.max_capacity_kg} onChange={e => setVForm(f => ({ ...f, max_capacity_kg: e.target.value }))} required/>
                        <label htmlFor="v-cap">Max Capacity (kg) *</label>
                      </div>
                      <div className="input-wrap">
                        <input id="v-desc" type="text" placeholder=" " value={vForm.description} onChange={e => setVForm(f => ({ ...f, description: e.target.value }))}/>
                        <label htmlFor="v-desc">Description (optional)</label>
                      </div>
                      {/* Photo */}
                      <label htmlFor="v-photo" style={{ display:'flex', alignItems:'center', gap:'0.5rem', padding:'0.6rem', borderRadius:10, border:'1px dashed rgba(255,255,255,0.18)', color: vPhoto ? 'var(--clr-accent)' : 'var(--clr-muted)', cursor:'pointer', fontSize:'0.82rem', fontWeight:600, background:'rgba(255,255,255,0.02)' }}>
                        <LuCamera size={14}/> {vPhoto ? 'Vehicle photo selected ✓' : 'Add vehicle photo (optional)'}
                      </label>
                      <input id="v-photo" ref={vPhotoRef} type="file" accept="image/jpeg,image/png,image/webp" style={{ display:'none' }} onChange={handleVFileSelect(setVPhoto)}/>
                      {/* Libre */}
                      <label htmlFor="v-libre" style={{ display:'flex', alignItems:'center', gap:'0.5rem', padding:'0.6rem', borderRadius:10, border:'1px dashed rgba(255,255,255,0.18)', color: vLibre ? 'var(--clr-accent)' : 'var(--clr-muted)', cursor:'pointer', fontSize:'0.82rem', fontWeight:600, background:'rgba(255,255,255,0.02)' }}>
                        <LuFileText size={14}/> {vLibre ? 'Libre document selected ✓' : 'Upload libre document (optional)'}
                      </label>
                      <input id="v-libre" ref={vLibreRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" style={{ display:'none' }} onChange={handleVFileSelect(setVLibre)}/>
                      <div style={{ display:'flex', gap:'0.6rem' }}>
                        <button type="button" className="btn-outline" style={{ flex:1 }} onClick={() => { setShowVehicleForm(false); setVFormError(''); setVPhoto(''); setVLibre('') }}>Cancel</button>
                        <button type="submit" className="btn-primary" style={{ flex:2 }} disabled={vSubmitting}>
                          {vSubmitting ? <Spinner text="Submitting…"/> : 'Submit for Review'}
                        </button>
                      </div>
                    </form>
                  </div>
                )}

                {vehicleToast && (
                  <div style={{ position:'fixed', bottom:'5.5rem', right:'1.25rem', zIndex:200, background:'rgba(0,229,255,0.12)', border:'1px solid rgba(0,229,255,0.25)', color:'var(--clr-text)', padding:'0.65rem 1.1rem', borderRadius:12, fontSize:'0.85rem', fontWeight:600, backdropFilter:'blur(12px)' }}>
                    {vehicleToast}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {showDeleteModal && (
        <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) setShowDeleteModal(false) }}>
          <div className="glass modal-box" style={{ padding: '2rem' }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#fca5a5', marginBottom: '0.5rem' }}>Delete Account</h2>
            <p style={{ color: 'var(--clr-muted)', fontSize: '0.875rem', marginBottom: '1.25rem' }}>
              This will permanently erase your account. Type <strong style={{ color: 'var(--clr-text)' }}>DELETE</strong> to confirm.
            </p>
            {deleteError && <div className="alert alert-error" style={{ marginBottom: '1rem' }}><LuTriangleAlert size={14}/> {deleteError}</div>}
            <div className="input-wrap" style={{ marginBottom: '1rem' }}>
              <input id="del-confirm" type="text" placeholder=" "
                value={deleteConfirm} onChange={e => setDeleteConfirm(e.target.value)} autoComplete="off" />
              <label htmlFor="del-confirm">Type DELETE</label>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button className="btn-outline" style={{ flex: 1 }} onClick={() => setShowDeleteModal(false)}>Cancel</button>
              <button disabled={deleteLoading || deleteConfirm !== 'DELETE'} onClick={handleDeleteAccount}
                style={{
                  flex: 1, padding: '0.75rem', borderRadius: 12, border: 'none',
                  background: deleteConfirm === 'DELETE' ? '#ef4444' : 'rgba(239,68,68,0.3)',
                  color: '#fff', fontFamily: 'inherit', fontSize: '0.875rem', fontWeight: 700,
                  cursor: deleteConfirm === 'DELETE' ? 'pointer' : 'not-allowed', transition: 'all 0.2s',
                }}>
                {deleteLoading ? <Spinner text="Deleting…" /> : 'Delete Forever'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
