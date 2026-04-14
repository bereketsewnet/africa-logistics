/**
 * Protected Route (src/components/ProtectedRoute.tsx)
 */

import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import logoImg from '../assets/logo.webp'

interface ProtectedRouteProps {
  children: React.ReactNode
  allowedRoles?: number[]
}

// ── Animated cargo-truck splash screen ───────────────────────────────────────
function SplashLoader() {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      background: 'radial-gradient(ellipse at 30% 40%, #0d1535 0%, #080b14 60%)',
      overflow: 'hidden',
    }}>
      {/* Background aurora glows */}
      <div style={{ position:'absolute', width:'70vmax', height:'70vmax', top:'-25vmax', left:'-20vmax', borderRadius:'50%', background:'radial-gradient(ellipse,rgba(124,58,237,0.22) 0%,transparent 70%)', filter:'blur(60px)', pointerEvents:'none' }}/>
      <div style={{ position:'absolute', width:'55vmax', height:'55vmax', bottom:'-20vmax', right:'-15vmax', borderRadius:'50%', background:'radial-gradient(ellipse,rgba(0,229,255,0.15) 0%,transparent 70%)', filter:'blur(60px)', pointerEvents:'none' }}/>

      {/* Main stage */}
      <div style={{ position:'relative', width:340, maxWidth:'90vw', userSelect:'none' }}>

        {/* Title */}
        <div style={{ textAlign:'center', marginBottom:'2rem', animation:'splash-title-in 0.7s 0.1s cubic-bezier(0.4,0,0.2,1) both' }}>
          <img src={logoImg} alt="Africa Logistics" style={{ height:40, objectFit:'contain', marginBottom:'0.75rem' }} onError={e => { (e.target as HTMLImageElement).style.display='none' }}/>
          <p style={{ fontSize:'0.78rem', letterSpacing:'0.18em', textTransform:'uppercase', color:'rgba(0,229,255,0.6)', fontWeight:600, margin:0 }}>Logistics Platform</p>
        </div>

        {/* Road scene */}
        <div style={{ position:'relative', height:120, marginBottom:'1.5rem' }}>

          {/* Smoke particles */}
          {[0,1,2].map(i => (
            <div key={i} style={{
              position:'absolute', left:108+(i*4), top:28-(i*6),
              width:8+(i*3), height:8+(i*3), borderRadius:'50%',
              background:'rgba(180,200,255,0.18)',
              animation:`smoke-rise 1.4s ${0.15*i}s ease-out infinite`,
            }}/>
          ))}

          {/* Truck SVG */}
          <div style={{ position:'absolute', left:'50%', top:12, transform:'translateX(-50%)', animation:'truck-drive 1.4s 0.2s cubic-bezier(0.4,0,0.2,1) both' }}>
            <svg width="160" height="80" viewBox="0 0 160 80" fill="none" xmlns="http://www.w3.org/2000/svg">
              {/* Trailer body */}
              <rect x="0" y="18" width="100" height="42" rx="4" fill="url(#trailerGrad)" stroke="rgba(0,229,255,0.35)" strokeWidth="1.2"/>
              {/* Trailer door lines */}
              <line x1="33" y1="18" x2="33" y2="60" stroke="rgba(0,229,255,0.2)" strokeWidth="1"/>
              <line x1="66" y1="18" x2="66" y2="60" stroke="rgba(0,229,255,0.2)" strokeWidth="1"/>
              {/* Trailer text */}
              <text x="50" y="43" textAnchor="middle" fontSize="8" fontWeight="700" fill="rgba(0,229,255,0.55)" fontFamily="sans-serif">AFRICA LOGISTICS</text>
              {/* Cab body */}
              <rect x="100" y="24" width="48" height="36" rx="5" fill="url(#cabGrad)" stroke="rgba(0,229,255,0.4)" strokeWidth="1.2"/>
              {/* Windshield */}
              <path d="M104 28 L104 44 L142 44 L142 38 Q138 28 128 28 Z" fill="rgba(0,229,255,0.14)" stroke="rgba(0,229,255,0.3)" strokeWidth="1"/>
              {/* Headlight */}
              <rect x="144" y="34" width="8" height="5" rx="2" fill="#fbbf24" opacity="0.9"/>
              <line x1="152" y1="36.5" x2="160" y2="33" stroke="rgba(251,191,36,0.5)" strokeWidth="1.5"/>
              <line x1="152" y1="36.5" x2="160" y2="36.5" stroke="rgba(251,191,36,0.35)" strokeWidth="1"/>
              {/* Grill */}
              <rect x="143" y="42" width="10" height="10" rx="1.5" fill="rgba(0,229,255,0.1)" stroke="rgba(0,229,255,0.25)" strokeWidth="0.8"/>
              {[0,1,2].map(i=><line key={i} x1="143" y1={44+i*3} x2="153" y2={44+i*3} stroke="rgba(0,229,255,0.2)" strokeWidth="0.6"/>)}
              {/* Connector hitch */}
              <rect x="96" y="38" width="6" height="6" rx="1" fill="rgba(100,116,139,0.6)"/>
              {/* Rear wheels (trailer) */}
              {[14,30].map(x=>(
                <g key={x}>
                  <circle cx={x} cy="62" r="10" fill="#1e293b" stroke="rgba(0,229,255,0.3)" strokeWidth="1.2"/>
                  <circle cx={x} cy="62" r="5" fill="#0f172a" stroke="rgba(0,229,255,0.2)" strokeWidth="0.8"/>
                  <circle cx={x} cy="62" r="1.5" fill="rgba(0,229,255,0.5)"/>
                  <animateTransform attributeName="transform" type="rotate" from={`0 ${x} 62`} to={`360 ${x} 62`} dur="0.6s" repeatCount="indefinite"/>
                </g>
              ))}
              {/* Front wheels (cab) */}
              {[118,138].map(x=>(
                <g key={x}>
                  <circle cx={x} cy="62" r="9" fill="#1e293b" stroke="rgba(0,229,255,0.3)" strokeWidth="1.2"/>
                  <circle cx={x} cy="62" r="4.5" fill="#0f172a" stroke="rgba(0,229,255,0.2)" strokeWidth="0.8"/>
                  <circle cx={x} cy="62" r="1.5" fill="rgba(0,229,255,0.5)"/>
                  <animateTransform attributeName="transform" type="rotate" from={`0 ${x} 62`} to={`360 ${x} 62`} dur="0.6s" repeatCount="indefinite"/>
                </g>
              ))}
              {/* Ground shadow */}
              <ellipse cx="78" cy="74" rx="75" ry="4" fill="rgba(0,0,0,0.35)"/>
              <defs>
                <linearGradient id="trailerGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#1e3a5f" stopOpacity="0.95"/>
                  <stop offset="100%" stopColor="#0f172a"/>
                </linearGradient>
                <linearGradient id="cabGrad" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#1e40af" stopOpacity="0.9"/>
                  <stop offset="100%" stopColor="#1e293b"/>
                </linearGradient>
              </defs>
            </svg>
          </div>

          {/* Animated dashed road */}
          <div style={{ position:'absolute', bottom:0, left:0, right:0, height:3, overflow:'hidden', borderRadius:2 }}>
            <div style={{
              display:'flex', gap:14, width:'200%',
              animation:'road-scroll 0.7s linear infinite',
            }}>
              {Array.from({length:24}).map((_,i)=>(
                <div key={i} style={{ flexShrink:0, width:28, height:3, borderRadius:99, background:i%2===0?'rgba(0,229,255,0.45)':'transparent' }}/>
              ))}
            </div>
          </div>

          {/* Dust puffs */}
          {[0,1].map(i=>(
            <div key={i} style={{
              position:'absolute', left:62+(i*12), bottom:6,
              width:10, height:10, borderRadius:'50%',
              background:'rgba(100,116,139,0.3)',
              animation:`dust-puff 0.9s ${i*0.3}s ease-out infinite`,
            }}/>
          ))}
        </div>

        {/* Progress bar */}
        <div style={{ background:'rgba(255,255,255,0.06)', borderRadius:99, height:3, overflow:'hidden', marginBottom:'1.25rem' }}>
          <div style={{ height:'100%', borderRadius:99, background:'linear-gradient(90deg,#7c3aed,#00e5ff)', animation:'progress-fill 1.8s cubic-bezier(0.4,0,0.2,1) infinite' }}/>
        </div>

        {/* Loading text with dots */}
        <div style={{ textAlign:'center', display:'flex', alignItems:'center', justifyContent:'center', gap:'0.5rem' }}>
          <span style={{ fontSize:'0.8rem', fontWeight:600, color:'rgba(148,163,184,0.8)', letterSpacing:'0.05em' }}>Loading</span>
          <div style={{ display:'flex', gap:3 }}>
            {[0,1,2].map(i=>(
              <span key={i} style={{ display:'inline-block', width:5, height:5, borderRadius:'50%', background:'var(--clr-accent)', animation:`dot-bounce 1.2s ${i*0.2}s ease-in-out infinite` }}/>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const { user, isLoading } = useAuth()

  if (isLoading) return <SplashLoader />

  if (!user) return <Navigate to="/login" replace />

  if (allowedRoles && !allowedRoles.includes(user.role_id)) {
    const target = [1, 4, 5].includes(user.role_id) ? '/admin' : '/dashboard'
    return <Navigate to={target} replace />
  }

  return <>{children}</>
}

