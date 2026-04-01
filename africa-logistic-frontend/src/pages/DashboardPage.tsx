import { useState, useRef, type FormEvent, type ChangeEvent } from 'react'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import { authApi } from '../lib/apiClient'
import PhoneField from '../components/PhoneField'
import { normalisePhone } from '../lib/normalisePhone'
import {
  LuTruck, LuUser, LuShield, LuPackage, LuPhone, LuMail,
  LuIdCard, LuCircleCheck, LuTriangleAlert, LuCamera, LuTrash2,
  LuEye, LuEyeOff, LuLogOut, LuCheck, LuSmartphone, LuArrowLeft,
  LuLock, LuContact,
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

type Tab = 'profile' | 'security' | 'contact'

export default function DashboardPage() {
  const { user, logout, updateUser, refreshUser } = useAuth()
  const navigate = useNavigate()

  const roleLabel = user?.role_id === 1 ? 'Admin' : user?.role_id === 2 ? 'Shipper' : user?.role_id === 3 ? 'Driver' : user?.role_name ?? 'User'
  const roleIcon  = user?.role_id === 1 ? <LuShield size={30}/> : user?.role_id === 2 ? <LuPackage size={30}/> : user?.role_id === 3 ? <LuTruck size={30}/> : <LuUser size={30}/>

  const [activeTab, setActiveTab] = useState<Tab>('profile')

  type TabDef = { id: Tab; icon: React.ReactNode; label: string }

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
    { id: 'profile',  icon: <LuUser size={15}/>,    label: 'Profile'  },
    { id: 'security', icon: <LuLock size={15}/>,    label: 'Security' },
    { id: 'contact',  icon: <LuContact size={15}/>, label: 'Contact'  },
  ]

  return (
    <div className="aurora-bg">
      <div className="aurora-orb aurora-orb-1" />
      <div className="page-shell">
        <div style={{ width: '100%', maxWidth: 540, display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

          {/* Header card */}
          <div className="glass page-enter" style={{ padding: '1.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1.1rem' }}>
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <div style={{
                  width: 76, height: 76, borderRadius: '50%',
                  background: photoUrl ? 'transparent' : 'linear-gradient(135deg,var(--clr-accent2),var(--clr-accent))',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '2rem', overflow: 'hidden',
                  border: '2.5px solid rgba(0,229,255,0.3)',
                  boxShadow: '0 0 24px rgba(0,229,255,0.2)',
                }}>
                  {photoUrl
                    ? <img src={photoUrl} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : roleIcon}
                </div>
                <button
                  title="Change photo" onClick={() => photoInput.current?.click()} disabled={photoLoading}
                  style={{
                    position: 'absolute', bottom: 0, right: 0, width: 26, height: 26, borderRadius: '50%',
                    background: 'var(--clr-accent)', border: '2px solid rgba(0,0,0,0.4)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', fontSize: '0.72rem', boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
                  }}
                >
                  {photoLoading ? '…' : <LuCamera size={13}/>}
                </button>
                <input ref={photoInput} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }} onChange={handlePhotoChange} />
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                  <h1 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--clr-text)' }}>
                    {user?.first_name} {user?.last_name}
                  </h1>
                  <span className="badge badge-cyan">{roleLabel}</span>
                </div>
                <p style={{ color: 'var(--clr-muted)', fontSize: '0.83rem', marginTop: '0.15rem' }}>{user?.phone_number}</p>
                {user?.email && (
                  <p style={{ color: 'var(--clr-muted)', fontSize: '0.78rem', marginTop: '0.1rem' }}>
                    {user.email}{' '}
                    {user.is_email_verified
                      ? <span style={{ color: '#4ade80', fontSize: '0.72rem', display:'inline-flex', alignItems:'center', gap:'0.2rem' }}><LuCircleCheck size={12}/> verified</span>
                      : <span style={{ color: '#fbbf24', fontSize: '0.72rem' }}>(pending)</span>}
                  </p>
                )}
                {photoError && <p style={{ color: '#fca5a5', fontSize: '0.77rem', marginTop: '0.3rem' }}>{photoError}</p>}
                {photoUrl && (
                  <button className="btn-outline" style={{ marginTop: '0.5rem', fontSize: '0.73rem', padding: '0.28rem 0.7rem', display:'flex', alignItems:'center', gap:'0.35rem' }}
                    onClick={handleDeletePhoto} disabled={photoLoading}>
                    <LuTrash2 size={13}/> Remove photo
                  </button>
                )}
              </div>

              <button className="btn-outline" style={{ flexShrink: 0, fontSize: '0.8rem', display:'flex', alignItems:'center', gap:'0.4rem' }} onClick={handleLogout}>
                <LuLogOut size={14}/> Sign out
              </button>
            </div>
          </div>

          {/* Tab bar */}
          <div style={{ display: 'flex', gap: '0.5rem', background: 'rgba(255,255,255,0.04)', borderRadius: 14, padding: '0.35rem' }}>
            {tabs.map(t => (
              <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
                flex: 1, padding: '0.55rem 0.5rem', border: 'none', borderRadius: 10,
                background: activeTab === t.id ? 'rgba(0,229,255,0.12)' : 'transparent',
                color: activeTab === t.id ? 'var(--clr-accent)' : 'var(--clr-muted)',
                fontFamily: 'inherit', fontSize: '0.82rem', fontWeight: 600,
                cursor: 'pointer', transition: 'all 0.18s',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
                outline: activeTab === t.id ? '1px solid rgba(0,229,255,0.2)' : 'none',
              }}>
                <span>{t.icon}</span>{t.label}
              </button>
            ))}
          </div>

          {/* Profile tab */}
          {activeTab === 'profile' && (
            <div className="glass step-enter" style={{ padding: '1.75rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
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

          <p style={{ textAlign: 'center', fontSize: '0.73rem', color: 'var(--clr-muted)', paddingBottom: '1rem' }}>
            Africa Logistics Platform · v1.0
          </p>
        </div>
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
