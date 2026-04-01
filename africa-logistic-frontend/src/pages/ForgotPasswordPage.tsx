import { useState, useRef, useCallback, useEffect } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import apiClient from '../lib/apiClient'
import PhoneField from '../components/PhoneField'
import { normalisePhone } from '../lib/normalisePhone'
import {
  LuKeyRound, LuEye, LuEyeOff, LuTriangleAlert, LuSmartphone,
  LuShieldCheck,
} from 'react-icons/lu'

/* ── Helpers ───────────────────────────────────────────────────── */
function getStrength(pw: string): { score: number; label: string; color: string } {
  if (!pw) return { score: 0, label: '', color: '' }
  let s = 0
  if (pw.length >= 6)  s++
  if (pw.length >= 10) s++
  if (/[A-Z]/.test(pw)) s++
  if (/[0-9]/.test(pw)) s++
  if (/[^A-Za-z0-9]/.test(pw)) s++
  const levels = [
    { label: 'Too short',   color: '#ef4444' },
    { label: 'Weak',        color: '#f59e0b' },
    { label: 'Fair',        color: '#eab308' },
    { label: 'Good',        color: '#22c55e' },
    { label: 'Strong',      color: '#00e5ff' },
    { label: 'Very strong', color: '#39ff14' },
  ]
  return { score: s, ...levels[s] }
}

function OtpInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const boxes = useRef<(HTMLInputElement | null)[]>([])
  const digits = value.padEnd(6, '').split('').slice(0, 6)

  const handleKey = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      e.preventDefault()
      const arr = [...digits]
      if (arr[i]) { arr[i] = ''; onChange(arr.join('')) }
      else if (i > 0) { arr[i-1] = ''; onChange(arr.join('')); boxes.current[i-1]?.focus() }
    }
  }
  const handleChange = (i: number, raw: string) => {
    const ch = raw.replace(/\D/g,'').slice(-1)
    if (!ch) return
    const arr = [...digits]; arr[i] = ch; onChange(arr.join(''))
    if (i < 5) boxes.current[i+1]?.focus()
  }
  const handlePaste = (e: React.ClipboardEvent) => {
    const t = e.clipboardData.getData('text').replace(/\D/g,'').slice(0,6)
    if (t) { onChange(t.padEnd(6,'').slice(0,6)); boxes.current[Math.min(t.length,5)]?.focus() }
    e.preventDefault()
  }
  return (
    <div className="otp-grid" onPaste={handlePaste}>
      {[0,1,2,3,4,5].map(i => (
        <input key={i} ref={el=>{ boxes.current[i]=el }}
          className={`otp-box${digits[i]?' filled':''}`}
          type="text" inputMode="numeric" maxLength={1}
          value={digits[i]||''} onChange={e=>handleChange(i,e.target.value)}
          onKeyDown={e=>handleKey(i,e)} onFocus={e=>e.target.select()}
          autoComplete="one-time-code" />
      ))}
    </div>
  )
}

function useCountdown(seconds: number) {
  const [remaining, setRemaining] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval>|null>(null)
  const start = useCallback(() => {
    setRemaining(seconds)
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = setInterval(() => {
      setRemaining(r => { if (r<=1){ clearInterval(timerRef.current!); return 0 } return r-1 })
    }, 1000)
  }, [seconds])
  useEffect(()=>()=>{ if(timerRef.current) clearInterval(timerRef.current) },[])
  return { remaining, start }
}

/* ── Component ─────────────────────────────────────────────────── */
type Step = 'phone' | 'otp' | 'newpw' | 'success'

export default function ForgotPasswordPage() {
  const navigate = useNavigate()

  const [step,    setStep]    = useState<Step>('phone')
  const [phone,   setPhone]   = useState('')
  const [otp,     setOtp]     = useState('')
  const [newPw,   setNewPw]   = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [showPw,  setShowPw]  = useState(false)
  const [error,   setError]   = useState('')
  const [loading, setLoading] = useState(false)

  const { remaining, start: startTimer } = useCountdown(120)
  const strength = getStrength(newPw)

  /* Step 1 — request OTP */
  const handleRequestOtp = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await apiClient.post('/auth/forgot-password/request-otp', { phone_number: normalisePhone(phone) })
      setStep('otp')
      startTimer()
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to send OTP. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  /* Step 2 — verify OTP */
  const handleVerifyOtp = async (e: FormEvent) => {
    e.preventDefault()
    if (otp.replace(/\D/g,'').length < 6) { setError('Enter all 6 digits'); return }
    setError('')
    setStep('newpw')
  }

  /* Step 3 — set new password */
  const handleSetPassword = async (e: FormEvent) => {
    e.preventDefault()
    if (newPw !== confirmPw) { setError('Passwords do not match'); return }
    if (newPw.length < 6)    { setError('Password must be at least 6 characters'); return }
    setError('')
    setLoading(true)
    try {
      await apiClient.post('/auth/forgot-password/reset', {
        phone_number:  normalisePhone(phone),
        otp:           otp.replace(/\D/g,''),
        new_password:  newPw,
      })
      setStep('success')
    } catch (err: any) {
      setError(err.response?.data?.message || 'Reset failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const stepIndex = { phone: 0, otp: 1, newpw: 2, success: 3 }[step]

  return (
    <div className="aurora-bg">
      <div className="aurora-orb aurora-orb-1" />
      <div className="page-shell centered">
        <div className="glass page-enter" style={{ width: '100%', maxWidth: 440, padding: '2.5rem 2rem' }}>

          {/* Logo */}
          <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
            <div className="logo-glow" style={{ display:'flex', justifyContent:'center', marginBottom: '0.6rem' }}>
              <LuKeyRound size={44} color="var(--clr-accent)" strokeWidth={1.5} />
            </div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#e2e8f0', letterSpacing: '-0.02em' }}>
              Reset Password
            </h1>
            <p style={{ color: 'var(--clr-muted)', marginTop: '0.3rem', fontSize: '0.875rem' }}>
              We'll send an OTP to your phone
            </p>
          </div>

          {/* Step dots (3 steps, success is separate) */}
          {step !== 'success' && (
            <div className="step-dots" style={{ marginBottom: '1.75rem' }}>
              {[0,1,2].map(n => (
                <div key={n} className={`step-dot${stepIndex === n ? ' active' : stepIndex > n ? ' done' : ''}`} />
              ))}
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="alert alert-error" style={{ marginBottom: '1.25rem' }}>
              <LuTriangleAlert size={15} /> {error}
            </div>
          )}

          {/* ── PHONE ── */}
          {step === 'phone' && (
            <form key="fp1" className="step-enter" onSubmit={handleRequestOtp}
              style={{ display:'flex', flexDirection:'column', gap:'1rem' }}>
              <div>
                <span className="phone-label">Your registered phone number</span>
                <PhoneField id="fp-phone" value={phone} onChange={setPhone} />
              </div>
              <button type="submit" className="btn-primary" disabled={loading}>
                {loading
                  ? <span style={{display:'flex',alignItems:'center',justifyContent:'center',gap:'0.5rem'}}><span className="spinner"/>Sending OTP…</span>
                  : 'Send Reset Code →'}
              </button>
            </form>
          )}

          {/* ── OTP ── */}
          {step === 'otp' && (
            <form key="fp2" className="step-enter" onSubmit={handleVerifyOtp}
              style={{ display:'flex', flexDirection:'column', gap:'1.25rem' }}>
              <div className="alert alert-info" style={{ fontSize:'0.85rem', display:'flex', alignItems:'center', gap:'0.4rem' }}>
                <LuSmartphone size={15}/> Code sent to <strong>{normalisePhone(phone)}</strong>{' '}
                <button type="button" className="link-accent"
                  style={{ fontSize:'0.8rem', background:'none', border:'none', cursor:'pointer', padding:0 }}
                  onClick={() => { setStep('phone'); setOtp(''); setError('') }}>
                  Change
                </button>
              </div>
              <div>
                <p style={{ color:'var(--clr-muted)', fontSize:'0.85rem', marginBottom:'0.85rem', textAlign:'center' }}>
                  Enter the 6-digit code
                </p>
                <OtpInput value={otp} onChange={setOtp} />
              </div>
              <div style={{ textAlign:'center', fontSize:'0.85rem', color:'var(--clr-muted)' }}>
                {remaining > 0
                  ? <>Resend in <span className="countdown">{Math.floor(remaining/60)}:{String(remaining%60).padStart(2,'0')}</span></>
                  : <button type="button" className="link-accent"
                      style={{ background:'none', border:'none', cursor:'pointer', padding:0, fontSize:'0.85rem' }}
                      onClick={() => handleRequestOtp({ preventDefault:()=>{} } as any)}>
                      Resend Code
                    </button>
                }
              </div>
              <button type="submit" className="btn-primary" disabled={otp.replace(/\D/g,'').length < 6}>
                Verify Code →
              </button>
            </form>
          )}

          {/* ── NEW PASSWORD ── */}
          {step === 'newpw' && (
            <form key="fp3" className="step-enter" onSubmit={handleSetPassword}
              style={{ display:'flex', flexDirection:'column', gap:'1rem' }}>
              <div>
                <div className="input-wrap">
                  <input id="fp-pw" type={showPw ? 'text' : 'password'} placeholder=" "
                    value={newPw} onChange={e => setNewPw(e.target.value)}
                    required minLength={6} style={{ paddingRight:'2.8rem' }} autoComplete="new-password" />
                  <label htmlFor="fp-pw">New password</label>
                  <button type="button" className="input-suffix" onClick={() => setShowPw(v=>!v)}>
                    {showPw ? <LuEyeOff size={16}/> : <LuEye size={16}/>}
                  </button>
                </div>
                {newPw && (
                  <>
                    <div className="strength-track">
                      <div className="strength-fill" style={{ width:`${(strength.score/5)*100}%`, background:strength.color }} />
                    </div>
                    <p style={{ fontSize:'0.75rem', color:strength.color, marginTop:'0.3rem', fontWeight:600 }}>
                      {strength.label}
                    </p>
                  </>
                )}
              </div>
              <div className="input-wrap">
                <input id="fp-cpw" type={showPw ? 'text' : 'password'} placeholder=" "
                  value={confirmPw} onChange={e => setConfirmPw(e.target.value)}
                  required className={confirmPw && confirmPw !== newPw ? 'has-error' : ''} autoComplete="new-password" />
                <label htmlFor="fp-cpw">Confirm new password</label>
              </div>
              {confirmPw && confirmPw !== newPw && (
                <p style={{ fontSize:'0.78rem', color:'var(--clr-danger)', marginTop:'-0.5rem' }}>Passwords don't match</p>
              )}
              <button type="submit" className="btn-primary" disabled={loading || newPw !== confirmPw || newPw.length < 6}>
                {loading
                  ? <span style={{display:'flex',alignItems:'center',justifyContent:'center',gap:'0.5rem'}}><span className="spinner"/>Saving…</span>
                  : 'Set New Password ✓'}
              </button>
            </form>
          )}

          {/* ── SUCCESS ── */}
          {step === 'success' && (
            <div key="fp4" className="step-enter" style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:'1.25rem', textAlign:'center' }}>
              <div className="success-ring" style={{display:'flex',alignItems:'center',justifyContent:'center'}}>
                <LuShieldCheck size={36} color="#39ff14" strokeWidth={2} />
              </div>
              <div>
                <h2 style={{ fontSize:'1.2rem', fontWeight:700, color:'var(--clr-text)', marginBottom:'0.4rem' }}>
                  Password Reset!
                </h2>
                <p style={{ color:'var(--clr-muted)', fontSize:'0.875rem' }}>
                  Your password has been updated successfully.
                </p>
              </div>
              <button className="btn-primary" onClick={() => navigate('/login')} style={{ maxWidth:240 }}>
                Go to Sign In
              </button>
            </div>
          )}

          {/* Back to login */}
          {step !== 'success' && (
            <p style={{ textAlign:'center', color:'var(--clr-muted)', fontSize:'0.875rem', marginTop:'1.5rem' }}>
              Remember your password?{' '}
              <Link to="/login" className="link-accent">Sign in</Link>
            </p>
          )}

        </div>
      </div>
    </div>
  )
}
