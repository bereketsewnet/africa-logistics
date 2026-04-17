import { useState, useRef, useCallback, useEffect } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import apiClient from '../lib/apiClient'
import PhoneField from '../components/PhoneField'
import { normalisePhone } from '../lib/normalisePhone'
import logoImg from '../assets/logo.webp'
import {
  LuTruck, LuEye, LuEyeOff, LuTriangleAlert, LuPackage, LuSmartphone,
  LuArrowRight, LuCheck, LuCar,
} from 'react-icons/lu'
import { SiTelegram } from 'react-icons/si'
import LanguageToggle from '../components/LanguageToggle'

/* ── Password strength helpers ─────────────────────────────────────── */
function getStrength(pw: string): { score: number; label: string; color: string } {
  if (!pw) return { score: 0, label: '', color: '' }
  let s = 0
  if (pw.length >= 6)  s++
  if (pw.length >= 10) s++
  if (/[A-Z]/.test(pw)) s++
  if (/[0-9]/.test(pw)) s++
  if (/[^A-Za-z0-9]/.test(pw)) s++
  const levels = [
    { label: 'Too short',  color: '#ef4444' },
    { label: 'Weak',       color: '#f59e0b' },
    { label: 'Fair',       color: '#eab308' },
    { label: 'Good',       color: '#22c55e' },
    { label: 'Strong',     color: '#00e5ff' },
    { label: 'Very strong', color: '#39ff14' },
  ]
  return { score: s, ...levels[s] }
}

/* ── OTP input component ────────────────────────────────────────────── */
function OtpInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const boxes = useRef<(HTMLInputElement | null)[]>([])
  const digits = value.padEnd(6, '').split('').slice(0, 6)

  const handleKey = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      e.preventDefault()
      const arr = digits.map(d => d)
      if (arr[i]) {
        arr[i] = ''
        onChange(arr.join(''))
      } else if (i > 0) {
        arr[i - 1] = ''
        onChange(arr.join(''))
        boxes.current[i - 1]?.focus()
      }
    }
  }

  const handleChange = (i: number, raw: string) => {
    const char = raw.replace(/\D/g, '').slice(-1)
    if (!char) return
    const arr = digits.map(d => d)
    arr[i] = char
    onChange(arr.join(''))
    if (i < 5) boxes.current[i + 1]?.focus()
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (text) { onChange(text.padEnd(6, '').slice(0, 6)); boxes.current[Math.min(text.length, 5)]?.focus() }
    e.preventDefault()
  }

  return (
    <div className="otp-grid" onPaste={handlePaste}>
      {[0,1,2,3,4,5].map(i => (
        <input
          key={i}
          ref={el => { boxes.current[i] = el }}
          className={`otp-box${digits[i] ? ' filled' : ''}`}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={digits[i] || ''}
          onChange={e => handleChange(i, e.target.value)}
          onKeyDown={e => handleKey(i, e)}
          onFocus={e => e.target.select()}
          autoComplete="one-time-code"
        />
      ))}
    </div>
  )
}

/* ── Countdown hook ─────────────────────────────────────────────────── */
function useCountdown(seconds: number) {
  const [remaining, setRemaining] = useState(seconds)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const start = useCallback(() => {
    setRemaining(seconds)
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = setInterval(() => {
      setRemaining(r => {
        if (r <= 1) { clearInterval(timerRef.current!); return 0 }
        return r - 1
      })
    }, 1000)
  }, [seconds])

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current) }, [])
  return { remaining, start }
}

/* ── Main component ─────────────────────────────────────────────────── */
export default function RegisterPage() {
  const { login } = useAuth()
  const navigate  = useNavigate()

  const [step, setStep] = useState<1 | 2 | 3>(1)

  // Step 1
  const [phone, setPhone] = useState('')

  // Step 2
  const [otp, setOtp] = useState('')

  // Step 3
  const [firstName, setFirstName] = useState('')
  const [lastName,  setLastName]  = useState('')
  const [roleId,    setRoleId]    = useState<2 | 3 | 6>(2)
  const [password,  setPassword]  = useState('')
  const [showPw,    setShowPw]    = useState(false)

  const [error,   setError]   = useState('')
  const [loading, setLoading] = useState(false)

  const { remaining, start: startTimer } = useCountdown(120)

  const strength = getStrength(password)

  /* Step 1 → send OTP */
  const handleRequestOtp = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await apiClient.post('/auth/register/request-otp', { phone_number: normalisePhone(phone) })
      setStep(2)
      startTimer()
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to send OTP. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  /* Step 2 → verify OTP, move to step 3 */
  const handleVerifyOtp = async (e: FormEvent) => {
    e.preventDefault()
    if (otp.replace(/\D/g,'').length < 6) { setError('Enter all 6 digits'); return }
    setError('')
    setStep(3)
  }

  /* Step 3 → create account */
  const handleCreate = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { data } = await apiClient.post('/auth/register/verify', {
        phone_number: normalisePhone(phone),
        otp:          otp.replace(/\D/g,''),
        new_password: password,
        role_id:      roleId,
        first_name:   firstName,
        last_name:    lastName,
      })
      await login(data.token)
      navigate('/dashboard')
    } catch (err: any) {
      setError(err.response?.data?.message || 'Registration failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const stepTitle = ['Enter phone number', 'Verify OTP', 'Set up profile'][step - 1]

  return (
    <div className="aurora-bg">
      <div className="aurora-orb aurora-orb-1" />
      <div className="page-shell centered">
        <div className="glass page-enter" style={{ width: '100%', maxWidth: 460, padding: '2.5rem 2rem' }}>

          {/* Language toggle */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.6rem' }}>
            <LanguageToggle />
          </div>

          {/* Logo */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', marginBottom: '1.5rem' }}>
            <img
              src={logoImg}
              alt="Africa Logistics"
              style={{ height: 64, width: 'auto', objectFit: 'contain', marginBottom: '0.5rem', borderRadius: 10, display: 'block' }}
            />
            <p style={{ color: 'var(--clr-muted)', marginTop: '0.25rem', fontSize: '0.875rem' }}>
              {stepTitle}
            </p>
          </div>

          {/* Step dots */}
          <div className="step-dots" style={{ marginBottom: '1.75rem' }}>
            {[1,2,3].map(n => (
              <div key={n} className={`step-dot${step === n ? ' active' : step > n ? ' done' : ''}`} />
            ))}
          </div>

          {/* Error */}
          {error && (
            <div className="alert alert-error" style={{ marginBottom: '1.25rem' }}>
              <LuTriangleAlert size={15} /> {error}
            </div>
          )}

          {/* ── STEP 1: Phone ── */}
          {step === 1 && (
            <form key="s1" className="step-enter" onSubmit={handleRequestOtp}
              style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <span className="phone-label">Phone number</span>
                <PhoneField id="reg-phone" value={phone} onChange={setPhone} />
              </div>
              <button type="submit" className="btn-primary" disabled={loading}>
                {loading
                  ? <span style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:'0.5rem' }}><span className="spinner" /> Sending OTP…</span>
                  : <span style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:'0.5rem' }}>Send OTP via SMS <LuArrowRight size={16}/></span>}
              </button>
              <div className="divider">or</div>
              <button type="button" className="btn-telegram">
                <SiTelegram size={20} />
                Register with Telegram
              </button>
            </form>
          )}

          {/* ── STEP 2: OTP ── */}
          {step === 2 && (
            <form key="s2" className="step-enter" onSubmit={handleVerifyOtp}
              style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div className="alert alert-info" style={{ fontSize: '0.85rem', display:'flex', alignItems:'center', gap:'0.4rem' }}>
                <LuSmartphone size={15}/> OTP sent to <strong>{normalisePhone(phone)}</strong>{' '}
                <button type="button" className="link-accent" style={{ fontSize:'0.8rem', background:'none', border:'none', cursor:'pointer', padding:0 }}
                  onClick={() => { setStep(1); setOtp(''); setError('') }}>
                  Change
                </button>
              </div>
              <div>
                <p style={{ color: 'var(--clr-muted)', fontSize: '0.85rem', marginBottom: '0.85rem', textAlign: 'center' }}>
                  Enter the 6-digit code
                </p>
                <OtpInput value={otp} onChange={setOtp} />
              </div>
              <div style={{ textAlign: 'center', fontSize: '0.85rem', color: 'var(--clr-muted)' }}>
                {remaining > 0 ? (
                  <>Resend in <span className="countdown">{Math.floor(remaining/60)}:{String(remaining%60).padStart(2,'0')}</span></>
                ) : (
                  <button type="button" className="link-accent" style={{ background:'none', border:'none', cursor:'pointer', padding:0, fontSize:'0.85rem' }}
                    onClick={() => { handleRequestOtp({ preventDefault: ()=>{} } as any) }}>
                    Resend OTP
                  </button>
                )}
              </div>
              <button type="submit" className="btn-primary" disabled={otp.replace(/\D/g,'').length < 6}>
                Verify Code →
              </button>
            </form>
          )}

          {/* ── STEP 3: Profile + Password ── */}
          {step === 3 && (
            <form key="s3" className="step-enter" onSubmit={handleCreate}
              style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div className="input-wrap">
                  <input id="fn" type="text" placeholder=" " value={firstName}
                    onChange={e => setFirstName(e.target.value)} required autoComplete="given-name" />
                  <label htmlFor="fn">First name</label>
                </div>
                <div className="input-wrap">
                  <input id="ln" type="text" placeholder=" " value={lastName}
                    onChange={e => setLastName(e.target.value)} autoComplete="family-name" />
                  <label htmlFor="ln">Last name</label>
                </div>
              </div>

              {/* Role selector */}
              <div>
                <p style={{ color: 'var(--clr-muted)', fontSize: '0.78rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.6rem' }}>
                  I am a…
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem' }}>
                  {([{ id: 2, icon: <LuPackage size={16}/>, label: 'Shipper' }, { id: 3, icon: <LuTruck size={16}/>, label: 'Driver' }, { id: 6, icon: <LuCar size={16}/>, label: 'Car Owner' }] as const).map(r => (
                    <button key={r.id} type="button"
                      style={{
                        padding: '0.75rem',
                        borderRadius: 12,
                        border: `1.5px solid ${roleId === r.id ? 'var(--clr-accent)' : 'rgba(255,255,255,0.12)'}`,
                        background: roleId === r.id ? 'rgba(0,229,255,0.08)' : 'rgba(255,255,255,0.04)',
                        color: roleId === r.id ? 'var(--clr-accent)' : 'var(--clr-muted)',
                        fontFamily: 'inherit',
                        fontSize: '0.875rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        boxShadow: roleId === r.id ? '0 0 12px rgba(0,229,255,0.15)' : 'none',
                      }}
                      onClick={() => setRoleId(r.id as 2 | 3 | 6)}>
                      <span style={{display:'flex',alignItems:'center',gap:'0.4rem'}}>{r.icon} {r.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Password */}
              <div>
                <div className="input-wrap">
                  <input id="new-pw" type={showPw ? 'text' : 'password'} placeholder=" "
                    value={password} onChange={e => setPassword(e.target.value)}
                    required minLength={6} style={{ paddingRight: '2.8rem' }} autoComplete="new-password" />
                  <label htmlFor="new-pw">Password</label>
                  <button type="button" className="input-suffix" onClick={() => setShowPw(v=>!v)}>
                    {showPw ? <LuEyeOff size={16}/> : <LuEye size={16}/>}
                  </button>
                </div>
                {password && (
                  <>
                    <div className="strength-track">
                      <div className="strength-fill" style={{ width: `${(strength.score / 5) * 100}%`, background: strength.color }} />
                    </div>
                    <p style={{ fontSize: '0.75rem', color: strength.color, marginTop: '0.3rem', fontWeight: 600 }}>
                      {strength.label}
                    </p>
                  </>
                )}
              </div>

              <button type="submit" className="btn-primary" disabled={loading} style={{ marginTop: '0.25rem' }}>
                {loading ? <span style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:'0.5rem' }}>
                  <span className="spinner" /> Creating account…</span>
                  : <span style={{display:'flex',alignItems:'center',gap:'0.4rem'}}><LuCheck size={16}/> Create My Account</span>}
              </button>
            </form>
          )}

          {/* Login link */}
          <p style={{ textAlign: 'center', color: 'var(--clr-muted)', fontSize: '0.875rem', marginTop: '1.5rem' }}>
            Already have an account?{' '}
            <Link to="/login" className="link-accent">Sign in</Link>
          </p>

        </div>
      </div>
    </div>
  )
}
