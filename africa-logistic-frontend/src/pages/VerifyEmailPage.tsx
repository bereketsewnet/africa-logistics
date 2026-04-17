import { useEffect, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { authApi } from '../lib/apiClient'
import { useLanguage } from '../context/LanguageContext'
import { LuLoader, LuMailCheck, LuMailX, LuArrowRight } from 'react-icons/lu'

type Status = 'loading' | 'success' | 'error'

export default function VerifyEmailPage() {
  const [params]   = useSearchParams()
  const navigate   = useNavigate()
  const { t: tr }  = useLanguage()
  const [status, setStatus]   = useState<Status>('loading')
  const [message, setMessage] = useState('')

  useEffect(() => {
    const token = params.get('token')
    if (!token) {
      setStatus('error')
      setMessage('No verification token found in the URL.')
      return
    }
    authApi.verifyEmail(token)
      .then(() => {
        setStatus('success')
        setMessage('Your email has been verified and linked to your account.')
      })
      .catch((err: any) => {
        setStatus('error')
        setMessage(err.response?.data?.message || 'Verification failed. The link may have expired.')
      })
  }, [params])

  return (
    <div className="aurora-bg">
      <div className="aurora-orb aurora-orb-1" />
      <div className="page-shell centered">
        <div className="glass page-enter" style={{ width: '100%', maxWidth: 420, padding: '2.5rem', textAlign: 'center' }}>
          {status === 'loading' && (
            <>
              <div style={{ display:'flex', justifyContent:'center', marginBottom: '1rem', opacity: 0.7 }}>
                <LuLoader size={48} color="var(--clr-accent)" strokeWidth={1.5} style={{animation:'spin 1s linear infinite'}}/>
              </div>
              <h1 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--clr-text)', marginBottom: '0.5rem' }}>
                {tr('ve_verifying')}
              </h1>
              <p style={{ color: 'var(--clr-muted)', fontSize: '0.9rem' }}>{tr('ve_please_wait')}</p>
            </>
          )}

          {status === 'success' && (
            <>
              <div style={{ display:'flex', justifyContent:'center', marginBottom: '1rem' }}>
                <LuMailCheck size={52} color="#4ade80" strokeWidth={1.5} />
              </div>
              <h1 style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--clr-text)', marginBottom: '0.5rem' }}>
                {tr('ve_success_title')}
              </h1>
              <p style={{ color: 'var(--clr-muted)', fontSize: '0.9rem', marginBottom: '1.75rem' }}>{message}</p>
              <button className="btn-primary" onClick={() => navigate('/dashboard')} style={{display:'flex',alignItems:'center',justifyContent:'center',gap:'0.5rem'}}>
                {tr('ve_go_dashboard')} <LuArrowRight size={16}/>
              </button>
            </>
          )}

          {status === 'error' && (
            <>
              <div style={{ display:'flex', justifyContent:'center', marginBottom: '1rem' }}>
                <LuMailX size={52} color="#fca5a5" strokeWidth={1.5} />
              </div>
              <h1 style={{ fontSize: '1.3rem', fontWeight: 800, color: '#fca5a5', marginBottom: '0.5rem' }}>
                {tr('ve_fail_title')}
              </h1>
              <p style={{ color: 'var(--clr-muted)', fontSize: '0.9rem', marginBottom: '1.75rem' }}>{message}</p>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button className="btn-outline" style={{ flex: 1 }} onClick={() => navigate('/login')}>
                  {tr('ve_back_login')}
                </button>
                <button className="btn-primary" style={{ flex: 1 }} onClick={() => navigate('/dashboard')}>
                  {tr('ve_dashboard')}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
