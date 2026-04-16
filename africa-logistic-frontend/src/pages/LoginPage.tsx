import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import apiClient from '../lib/apiClient'
import PhoneField from '../components/PhoneField'
import { normalisePhone } from '../lib/normalisePhone'
import logoImg from '../assets/logo.webp'
import {
  LuEye, LuEyeOff, LuTriangleAlert,
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

  const demoAccounts = [
    { label: 'Admin', phone: '+251911000001', password: 'Admin1234' },
    { label: 'Shipper', phone: '+251900000001', password: 'Admin1234' },
    { label: 'Driver', phone: '+251965500639', password: 'Admin1234' },
    { label: 'Cashier', phone: '+251911104182', password: 'Admin1234' },
    { label: 'Dispatcher', phone: '+251928664558', password: 'Admin1234' },
    { label: 'Car Owner', phone: '+251912000001', password: 'Admin1234' },
  ]

  const fillDemo = (phoneValue: string, passwordValue: string) => {
    setLoginMode('phone')
    setEmail('')
    setPhone(phoneValue)
    setPassword(passwordValue)
    setError('')
  }

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
      navigate([1, 4, 5].includes(roleId) ? '/admin' : roleId === 6 ? '/car-dashboard' : '/dashboard')
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
        <div className="glass page-enter" style={{ width: '100%', maxWidth: 440, padding: '1.6rem 1.45rem', maxHeight: '92vh', overflowY: 'auto' }}>

          {/* Logo */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', marginBottom: '1.1rem' }}>
            <img
              src={logoImg}
              alt="Africa Logistics"
              style={{ height: 58, width: 'auto', objectFit: 'contain', marginBottom: '0.35rem', borderRadius: 10, display: 'block' }}
            />
            <p style={{ color: 'var(--clr-muted)', marginTop: '0.25rem', fontSize: '0.9rem' }}>
              Sign in to your account
            </p>
          </div>

          {/* Mode switcher */}
          <div style={{
            display: 'flex', gap: '0.5rem', background: 'rgba(255,255,255,0.04)',
            borderRadius: 12, padding: '0.25rem', marginBottom: '0.9rem',
            border: '1px solid rgba(255,255,255,0.07)',
          }}>
            {(['phone', 'email'] as LoginMode[]).map(m => (
              <button
                key={m} type="button"
                onClick={() => { setLoginMode(m); setError('') }}
                style={{
                  flex: 1, padding: '0.48rem 0.7rem', borderRadius: 9,
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
            <div className="alert alert-error" style={{ marginBottom: '0.9rem' }}>
              <LuTriangleAlert size={15} /> {error}
            </div>
          )}

          <form onSubmit={handleSubmit} autoComplete="off" style={{ display: 'flex', flexDirection: 'column', gap: '0.78rem' }}>
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
            <div style={{ textAlign: 'right', marginTop: '-0.12rem' }}>
              <Link to="/forgot-password" className="link-accent" style={{ fontSize: '0.825rem' }}>
                Forgot password?
              </Link>
            </div>

            {/* Submit */}
            <button type="submit" className="btn-primary" disabled={loading} style={{ marginTop: '0.25rem' }}>
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

          {/* Telegram — desktop only */}
          <div className="telegram-desktop-only">
            <div className="divider" style={{ margin: '0.95rem 0' }}>or continue with</div>
            <a
              href="https://t.me/afri_logistics_bot/start"
              target="_blank"
              rel="noopener noreferrer"
              style={{ textDecoration: 'none', display: 'block' }}
            >
              <button
                type="button"
                className="btn-telegram"
                style={{ padding: '0.66rem 0.95rem', width: '100%' }}
              >
                <SiTelegram size={20} />
                Continue with Telegram
              </button>
            </a>
          </div>

          <div style={{ marginTop: '0.85rem' }}>
            <p style={{ fontSize: '0.72rem', color: 'var(--clr-muted)', margin: '0 0 0.45rem', fontWeight: 600 }}>
              Demo quick autofill
            </p>
            <div style={{ display: 'flex', gap: '0.45rem', overflowX: 'auto', paddingBottom: '0.15rem' }}>
              {demoAccounts.map(account => (
                <button
                  key={account.label}
                  type="button"
                  onClick={() => fillDemo(account.phone, account.password)}
                  style={{
                    whiteSpace: 'nowrap',
                    padding: '0.42rem 0.78rem',
                    borderRadius: 999,
                    border: '1px solid rgba(124,58,237,0.32)',
                    background: 'rgba(124,58,237,0.12)',
                    color: '#c4b5fd',
                    fontSize: '0.73rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    flexShrink: 0,
                  }}
                >
                  {account.label}
                </button>
              ))}
            </div>
          </div>

          {/* Register link */}
          <p style={{ textAlign: 'center', color: 'var(--clr-muted)', fontSize: '0.84rem', marginTop: '0.85rem' }}>
            Don't have an account?{' '}
            <Link to="/register" className="link-accent">Create one</Link>
          </p>

        </div>
      </div>
    </div>
  )
}
