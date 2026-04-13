import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import apiClient from '../lib/apiClient'
import PhoneField from '../components/PhoneField'
import { normalisePhone } from '../lib/normalisePhone'
import {
  LuEye, LuEyeOff, LuTriangleAlert, LuFlaskConical,
  LuLogIn, LuPhone, LuMail,
} from 'react-icons/lu'
import { SiTelegram } from 'react-icons/si'

type LoginMode = 'phone' | 'email'

export default function LoginPage() {
  const { login }   = useAuth()
  const navigate    = useNavigate()

  const [loginMode, setLoginMode] = useState<LoginMode>('phone')
  const [phone,     setPhone]     = useState('')
  const [email,     setEmail]     = useState('')
  const [password,  setPassword]  = useState('')
  const [showPw,    setShowPw]    = useState(false)
  const [error,     setError]     = useState('')
  const [loading,   setLoading]   = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setError('')
    setLoading(true)
    try {
      let data: any
      if (loginMode === 'email') {
        const res = await apiClient.post('/auth/login-email', { email, password })
        data = res.data
      } else {
        const res = await apiClient.post('/auth/login', {
          phone_number: normalisePhone(phone),
          password,
        })
        data = res.data
      }
      await login(data.token)
      const roleId = data.user?.role_id
      navigate([1, 4, 5].includes(roleId) ? '/admin' : '/dashboard')
    } catch (err: any) {
      setError(err.response?.data?.message || 'Login failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="aurora-bg">
      <div className="aurora-orb aurora-orb-1" />
      <div className="page-shell centered">
        <div className="glass page-enter" style={{ width: '100%', maxWidth: 440, padding: '2.5rem 2rem' }}>

          {/* Logo */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', marginBottom: '2rem' }}>
            <img
              src="/logo-with-name.webp"
              alt="Africa Logistics"
              style={{ height: 72, width: 'auto', objectFit: 'contain', marginBottom: '0.5rem', borderRadius: 12, display: 'block' }}
            />
            <p style={{ color: 'var(--clr-muted)', marginTop: '0.25rem', fontSize: '0.9rem' }}>
              Sign in to your account
            </p>
          </div>

          {/* Mode switcher */}
          <div style={{
            display: 'flex', gap: '0.5rem', background: 'rgba(255,255,255,0.04)',
            borderRadius: 12, padding: '0.3rem', marginBottom: '1.25rem',
            border: '1px solid rgba(255,255,255,0.07)',
          }}>
            {(['phone', 'email'] as LoginMode[]).map(m => (
              <button
                key={m} type="button"
                onClick={() => { setLoginMode(m); setError('') }}
                style={{
                  flex: 1, padding: '0.55rem 0.75rem', borderRadius: 9,
                  border: 'none', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
                  transition: 'all 0.2s',
                  background: loginMode === m ? 'linear-gradient(135deg,#7c3aed,#0ea5e9)' : 'transparent',
                  color: loginMode === m ? '#fff' : 'var(--clr-muted)',
                  fontFamily: 'inherit',
                }}
              >
                {m === 'phone' ? <LuPhone size={14}/> : <LuMail size={14}/>}
                {m === 'phone' ? 'Phone' : 'Email'}
              </button>
            ))}
          </div>

          {/* Error */}
          {error && (
            <div className="alert alert-error" style={{ marginBottom: '1.25rem' }}>
              <LuTriangleAlert size={15} /> {error}
            </div>
          )}

          <form onSubmit={handleSubmit} autoComplete="off" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Dummy inputs stop password managers from hijacking real fields */}
            <input type="text"     style={{ display: 'none' }} aria-hidden="true" readOnly />
            <input type="password" style={{ display: 'none' }} aria-hidden="true" readOnly />

            {/* Phone or Email field */}
            {loginMode === 'phone' ? (
              <div>
                <span className="phone-label">Phone number</span>
                <PhoneField id="login-phone" value={phone} onChange={setPhone} />
              </div>
            ) : (
              <div className="input-wrap">
                <input
                  id="login-email"
                  type="email"
                  placeholder=" "
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
                <label htmlFor="login-email">Email address</label>
              </div>
            )}

            {/* Password */}
            <div className="input-wrap">
              <input
                id="login-pw"
                type={showPw ? 'text' : 'password'}
                placeholder=" "
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete="off"
                data-lpignore="true"
                data-form-type="other"
                style={{ paddingRight: '2.8rem' }}
              />
              <label htmlFor="login-pw">Password</label>
              <button
                type="button"
                className="input-suffix"
                onClick={() => setShowPw(v => !v)}
                aria-label="Toggle password visibility"
              >
                {showPw ? <LuEyeOff size={16} /> : <LuEye size={16} />}
              </button>
            </div>

            {/* Forgot link */}
            <div style={{ textAlign: 'right', marginTop: '-0.25rem' }}>
              <Link to="/forgot-password" className="link-accent" style={{ fontSize: '0.825rem' }}>
                Forgot password?
              </Link>
            </div>

            {/* Submit */}
            <button type="submit" className="btn-primary" disabled={loading} style={{ marginTop: '0.5rem' }}>
              {loading ? (
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                  <span className="spinner" /> Signing in…
                </span>
              ) : (
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                  <LuLogIn size={16} /> Sign In
                </span>
              )}
            </button>

          </form>

          {/* Divider */}
          <div className="divider" style={{ margin: '1.5rem 0' }}>or continue with</div>

          {/* Telegram */}
          <button
            type="button"
            className="btn-telegram"
            onClick={() => alert('Telegram login coming soon')}
          >
            <SiTelegram size={20} />
            Continue with Telegram
          </button>

          {/* Register link */}
          <p style={{ textAlign: 'center', color: 'var(--clr-muted)', fontSize: '0.875rem', marginTop: '1.5rem' }}>
            Don't have an account?{' '}
            <Link to="/register" className="link-accent">Create one</Link>
          </p>

          {/* Demo credentials — click to autofill */}
          <button
            type="button"
            onClick={() => { setLoginMode('phone'); setPhone('+251911000001'); setPassword('Admin1234') }}
            style={{
              marginTop:'1.25rem', padding:'0.75rem 1rem', borderRadius:10,
              background:'rgba(124,58,237,0.10)', border:'1px solid rgba(124,58,237,0.25)',
              fontSize:'0.78rem', color:'var(--clr-muted)', width:'100%', textAlign:'left',
              cursor:'pointer', fontFamily:'inherit', transition:'all 0.2s',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(124,58,237,0.20)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'rgba(124,58,237,0.10)')}
          >
            <p style={{ fontWeight:700, color:'#a78bfa', marginBottom:'0.3rem', display:'flex', alignItems:'center', gap:'0.4rem' }}><LuFlaskConical size={14}/> Demo account <span style={{ fontWeight:400, fontSize:'0.72rem' }}>(click to fill)</span></p>
            <p>Phone: <span style={{ color:'var(--clr-text)', fontWeight:600 }}>+251 911 000 001</span></p>
            <p>Password: <span style={{ color:'var(--clr-text)', fontWeight:600 }}>Admin1234</span></p>
          </button>

        </div>
      </div>
    </div>
  )
}
