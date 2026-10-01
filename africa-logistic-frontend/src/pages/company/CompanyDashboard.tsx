import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import { companyApi } from '../../lib/apiClient'
import LanguageToggle from '../../components/LanguageToggle'
import { useLanguage } from '../../context/LanguageContext'
import {
  LuBuilding2, LuTruck, LuUsers, LuUser, LuLogOut, LuLayoutDashboard,
  LuChevronLeft, LuChevronRight, LuSun, LuMoon, LuTriangleAlert,
} from 'react-icons/lu'
import { absoluteUploadUrl } from '../../lib/uploadUrl'
import CompanyOverviewPanel from './CompanyOverviewPanel'
import CompanyFleetPanel from './CompanyFleetPanel'
import CompanyDriversPanel from './CompanyDriversPanel'
import CompanyProfilePanel from './CompanyProfilePanel'

type CompanyView = 'overview' | 'fleet' | 'drivers' | 'profile'

export interface CompanyStats {
  vehicles: number
  vehicles_approved: number
  vehicles_pending: number
  vehicles_rejected: number
  vehicles_active: number
  vehicles_with_driver: number
  vehicles_dispatchable: number
  drivers: number
  drivers_verified: number
  drivers_pending: number
}

/**
 * The transport company's own portal.
 *
 * Kept out of CarOwnerDashboard.tsx rather than bolted onto it: that file is
 * already 717 lines for a handful of trucks, and a fleet screen for hundreds is
 * a different shape of problem. Splitting also means an individual car owner
 * never downloads any of this — CarPortalEntry lazy-loads one or the other.
 *
 * The dock markup, its `dash_dock_v3` key and the `car-theme` toggle are copied
 * from the individual portal on purpose, so someone who works in both sees the
 * same furniture in the same place.
 */
export default function CompanyDashboard() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const { t } = useLanguage()

  const [view, setView] = useState<CompanyView>('overview')
  const [company, setCompany] = useState<any | null>(null)
  const [stats, setStats] = useState<CompanyStats | null>(null)
  const [err, setErr] = useState('')
  const [toast, setToast] = useState('')

  // ── Theme ────────────────────────────────────────────────────────────────
  const [carTheme, setCarTheme] = useState<'LIGHT' | 'DARK'>(() =>
    (localStorage.getItem('car-theme') as 'LIGHT' | 'DARK' | null) ?? 'LIGHT'
  )
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', carTheme.toLowerCase())
  }, [])
  const handleCarTheme = (next: 'LIGHT' | 'DARK') => {
    setCarTheme(next)
    localStorage.setItem('car-theme', next)
    document.documentElement.setAttribute('data-theme', next.toLowerCase())
  }

  // ── Dock expand/collapse — same key as the shipper/driver portal ──────────
  const DOCK_KEY = 'dash_dock_v3'
  const [dockExpanded, setDockExpanded] = useState(() => localStorage.getItem(DOCK_KEY) === 'true')
  const toggleDock = () => {
    const next = !dockExpanded
    setDockExpanded(next)
    localStorage.setItem(DOCK_KEY, String(next))
  }

  const loadProfile = useCallback(async () => {
    try {
      const { data } = await companyApi.profile()
      setCompany(data.company)
      setStats(data.stats)
      setErr('')
    } catch (e: any) {
      setErr(e.response?.data?.message ?? 'Could not load your company.')
    }
  }, [])

  useEffect(() => { loadProfile() }, [loadProfile])

  // Adding or removing a truck or driver changes the header counts, so a toast
  // from either panel also refreshes the summary.
  const showToast = (message: string) => {
    setToast(message)
    loadProfile()
    window.setTimeout(() => setToast(''), 5000)
  }

  const handleLogout = () => { logout(); navigate('/login') }

  const NAV: { id: CompanyView; label: string; icon: React.ReactNode }[] = [
    { id: 'overview', label: t('cmp_nav_overview'), icon: <LuLayoutDashboard size={19} /> },
    { id: 'fleet',   label: t('cmp_nav_fleet'),   icon: <LuTruck size={19} /> },
    { id: 'drivers', label: t('cmp_nav_drivers'), icon: <LuUsers size={19} /> },
    { id: 'profile', label: t('cmp_nav_company'), icon: <LuUser size={19} /> },
  ]

  const suspended = company && ['SUSPENDED', 'REJECTED'].includes(company.status)

  return (
    <div className="aurora-bg" style={{ minHeight: '100vh' }}>
      <div className="aurora-orb aurora-orb-1" />

      {/* ── MOBILE BOTTOM DOCK ── */}
      <div className="dash-dock-mobile">
        {NAV.map(item => (
          <button key={item.id} onClick={() => setView(item.id)} title={item.label}
            className={`dock-btn${view === item.id ? ' dock-btn-active' : ''}`}>
            <span className="dock-icon">{item.icon}</span>
            <span className="dock-label">{item.label}</span>
          </button>
        ))}
      </div>

      {/* ── DESKTOP LEFT DOCK ── */}
      <div className={`dash-dock-desktop${dockExpanded ? ' dock-expanded' : ''}`}>
        <div className="dock-avatar">
          {user?.profile_photo_url
            ? <img src={absoluteUploadUrl(user.profile_photo_url)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <LuBuilding2 size={18} />}
        </div>
        <div className="dock-divider" />
        {NAV.map(item => (
          <button key={item.id} onClick={() => setView(item.id)} title={item.label}
            className={`dock-btn${view === item.id ? ' dock-btn-active' : ''}`}
            style={{ flexDirection: dockExpanded ? 'row' : 'column', justifyContent: dockExpanded ? 'flex-start' : 'center', padding: dockExpanded ? '0.6rem 0.85rem' : '0.65rem 0.5rem', gap: dockExpanded ? '0.65rem' : '0.2rem' }}>
            <span className="dock-icon">{item.icon}</span>
            {dockExpanded && <span className="dock-item-label">{item.label}</span>}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <div className="dock-divider" />
        <button onClick={() => handleCarTheme(carTheme === 'LIGHT' ? 'DARK' : 'LIGHT')}
          className="dock-btn" title={carTheme === 'LIGHT' ? 'Switch to dark mode' : 'Switch to light mode'}
          style={{ flexDirection: dockExpanded ? 'row' : 'column', justifyContent: dockExpanded ? 'flex-start' : 'center', padding: dockExpanded ? '0.6rem 0.85rem' : '0.65rem 0.5rem', gap: dockExpanded ? '0.65rem' : '0.2rem' }}>
          <span className="dock-icon">{carTheme === 'LIGHT' ? <LuMoon size={18} /> : <LuSun size={18} />}</span>
          {dockExpanded && <span className="dock-item-label">{carTheme === 'LIGHT' ? 'Dark mode' : 'Light mode'}</span>}
        </button>
        <div style={{ alignSelf: 'stretch', padding: '0.4rem 0.5rem', display: 'flex', justifyContent: 'center' }}>
          <LanguageToggle compact={!dockExpanded} />
        </div>
        <button onClick={toggleDock} className="dock-btn dock-toggle-btn" title={dockExpanded ? 'Collapse' : 'Expand'}>
          {dockExpanded ? <LuChevronLeft size={15} /> : <LuChevronRight size={15} />}
        </button>
        <button onClick={handleLogout} className="dock-btn" title={t('sign_out')}
          style={{ flexDirection: 'column', gap: '0.2rem', padding: '0.65rem 0.5rem' }}>
          <LuLogOut size={18} />
          {dockExpanded && <span className="dock-item-label">{t('sign_out')}</span>}
        </button>
      </div>

      {/* ── Main content ── */}
      <div className={`dash-main${dockExpanded ? ' dock-wide' : ''}`}>
        <div className="page-shell" style={{ alignItems: 'flex-start' }}>
          <div style={{ width: '100%', maxWidth: 1180, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>

            {err && <div className="alert alert-error"><LuTriangleAlert size={14} /> {err}</div>}
            {toast && <div className="alert alert-success">{toast}</div>}

            {/* Company header */}
            <div className="glass" style={{ padding: '1.1rem 1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '0.3rem' }}>
                <LuBuilding2 size={20} style={{ color: 'var(--clr-accent)' }} />
                <span style={{ fontWeight: 800, fontSize: '1.15rem', color: 'var(--clr-text)' }}>
                  {company?.company_name ?? user?.company_name ?? 'My Company'}
                </span>
                {company && (
                  <span style={{
                    padding: '0.2rem 0.6rem', borderRadius: 999, fontSize: '0.72rem', fontWeight: 700,
                    background: company.status === 'APPROVED' ? 'rgba(52,211,153,0.15)' : 'rgba(251,191,36,0.15)',
                    color: company.status === 'APPROVED' ? '#34d399' : '#fbbf24',
                  }}>{company.status}</span>
                )}
              </div>

              {company?.status === 'PENDING' && (
                <p style={{ fontSize: '0.8rem', color: 'var(--clr-muted)', margin: '0.3rem 0 0', lineHeight: 1.5 }}>
                  Your company is awaiting approval. You can add your vehicles and drivers now —
                  they will be ready to carry loads once Afri Logistics approves them.
                </p>
              )}
              {suspended && (
                <div className="alert alert-error" style={{ marginTop: '0.6rem', fontSize: '0.8rem' }}>
                  <LuTriangleAlert size={13} /> Your company account is {String(company.status).toLowerCase()}, so it is
                  read-only. Contact Afri Logistics to restore it.
                  {company.admin_note && <> Reason: {company.admin_note}</>}
                </div>
              )}

              {stats && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(104px,1fr))', gap: '0.5rem', marginTop: '0.9rem' }}>
                  {[
                    { label: t('cmp_stat_vehicles'), value: stats.vehicles },
                    { label: t('cmp_stat_ready'), value: stats.vehicles_dispatchable, tone: 'var(--kpi-green)' },
                    { label: t('cmp_stat_awaiting'), value: stats.vehicles_pending, tone: stats.vehicles_pending > 0 ? 'var(--kpi-gold)' : undefined },
                    { label: t('cmp_stat_crewed'), value: stats.vehicles_with_driver },
                    { label: t('cmp_stat_drivers'), value: stats.drivers },
                    { label: t('cmp_stat_unverified'), value: stats.drivers_pending, tone: stats.drivers_pending > 0 ? 'var(--kpi-gold)' : undefined },
                  ].map(s => (
                    <div key={s.label} className="glass-inner" style={{ padding: '0.6rem 0.7rem', textAlign: 'center' }}>
                      <div style={{ fontSize: '1.2rem', fontWeight: 800, color: s.tone ?? 'var(--clr-text)' }}>{s.value}</div>
                      <div style={{ fontSize: '0.68rem', color: 'var(--clr-muted)', fontWeight: 600, marginTop: '0.1rem' }}>{s.label}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {view === 'overview' && <CompanyOverviewPanel onNavigate={setView} />}
            {view === 'fleet' && <CompanyFleetPanel onToast={showToast} readOnly={Boolean(suspended)} />}
            {view === 'drivers' && <CompanyDriversPanel onToast={showToast} readOnly={Boolean(suspended)} />}
            {view === 'profile' && <CompanyProfilePanel company={company} stats={stats} />}
          </div>
        </div>
      </div>
    </div>
  )
}
