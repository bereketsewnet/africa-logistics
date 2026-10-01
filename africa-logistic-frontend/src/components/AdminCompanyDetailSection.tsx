import { useState, useEffect, useCallback } from 'react'
import {
  LuArrowLeft, LuBuilding2, LuTruck, LuUsers, LuTriangleAlert,
  LuSend, LuPencil, LuTrash2, LuIdCard,
} from 'react-icons/lu'
import { adminCompanyApi } from '../lib/apiClient'
import AdminCompanyVehiclesSection from './AdminCompanyVehiclesSection'
import AdminCompanyDriversSection from './AdminCompanyDriversSection'

type CompanyStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED'

interface CompanyStats {
  vehicles: number
  vehicles_approved: number
  vehicles_pending: number
  vehicles_active: number
  vehicles_with_driver: number
  drivers: number
  drivers_available: number
}

const STATUS_STYLE: Record<CompanyStatus, { bg: string; color: string; label: string }> = {
  PENDING:   { bg: 'rgba(251,191,36,0.15)', color: '#fbbf24', label: 'Pending' },
  APPROVED:  { bg: 'rgba(52,211,153,0.15)', color: '#34d399', label: 'Approved' },
  REJECTED:  { bg: 'rgba(248,113,113,0.15)', color: '#f87171', label: 'Rejected' },
  SUSPENDED: { bg: 'rgba(148,163,184,0.15)', color: '#94a3b8', label: 'Suspended' },
}

type Tab = 'vehicles' | 'drivers'

/**
 * One company, in full: who they are, their whole fleet and their whole driver
 * roster, each manageable in place.
 *
 * Both panels are the same components used by the standalone Company Vehicles
 * and Company Drivers screens, run in their locked mode. Reusing them rather
 * than writing a second copy is what keeps the two routes to the same data from
 * drifting apart.
 */
export default function AdminCompanyDetailSection({
  companyId, companyName, onBack, onToast, onEdit, onReview, onDelete, canDelete, refreshKey = 0,
}: {
  companyId: string
  companyName: string
  /** Changed by the parent after an edit or review, to pull the header fresh. */
  refreshKey?: number
  onBack: () => void
  onToast: (message: string) => void
  onEdit: () => void
  onReview: () => void
  onDelete: () => void
  canDelete: boolean
}) {
  const [company, setCompany] = useState<any | null>(null)
  const [stats, setStats] = useState<CompanyStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [tab, setTab] = useState<Tab>('vehicles')

  const load = useCallback(async () => {
    setLoading(true); setErr('')
    try {
      const { data } = await adminCompanyApi.overview(companyId)
      setCompany(data.company)
      setStats(data.stats)
    } catch (e: any) {
      setErr(e.response?.data?.message ?? 'Could not load this company.')
    } finally { setLoading(false) }
  }, [companyId, refreshKey])

  useEffect(() => { load() }, [load])

  // Adding or removing a vehicle or driver changes the counts in the header,
  // so a toast from either panel also refreshes the summary.
  const handleToast = (message: string) => { onToast(message); load() }

  const st = STATUS_STYLE[(company?.status as CompanyStatus) ?? 'PENDING'] ?? STATUS_STYLE.PENDING

  const statCards: Array<{ label: string; value: number | string; tone?: string }> = stats ? [
    { label: 'Vehicles', value: stats.vehicles },
    { label: 'Approved', value: stats.vehicles_approved },
    { label: 'Pending', value: stats.vehicles_pending, tone: stats.vehicles_pending > 0 ? 'var(--kpi-gold)' : undefined },
    { label: 'Operational', value: stats.vehicles_active },
    { label: 'With a driver', value: stats.vehicles_with_driver },
    { label: 'Drivers', value: stats.drivers },
    { label: 'Available', value: stats.drivers_available },
  ] : []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Back */}
      <button onClick={onBack}
        style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.3rem 0.7rem', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: 'var(--clr-muted)', fontFamily: 'inherit', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}>
        <LuArrowLeft size={13} /> All companies
      </button>

      {err && <div className="alert alert-error"><LuTriangleAlert size={13} /> {err}</div>}

      {/* Header */}
      <div className="glass" style={{ padding: '1.1rem 1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.85rem', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.4rem' }}>
              <LuBuilding2 size={19} style={{ color: 'var(--clr-accent)' }} />
              <span style={{ fontWeight: 800, fontSize: '1.15rem', color: 'var(--clr-text)' }}>
                {company?.company_name ?? companyName}
              </span>
              <span style={{ padding: '0.2rem 0.6rem', borderRadius: 999, background: st.bg, color: st.color, fontSize: '0.72rem', fontWeight: 700 }}>{st.label}</span>
              {company && !company.owner_is_active && <span className="badge badge-red" style={{ fontSize: '0.67rem' }}>Login suspended</span>}
            </div>

            {loading ? (
              <div style={{ fontSize: '0.8rem', color: 'var(--clr-muted)' }}>Loading…</div>
            ) : company && (
              <>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem 1.1rem', fontSize: '0.79rem', color: 'var(--clr-muted)' }}>
                  {company.legal_name && <span>Legal: <strong style={{ color: 'var(--clr-text)' }}>{company.legal_name}</strong></span>}
                  {company.tin_number && <span>TIN: <strong style={{ color: 'var(--clr-text)' }}>{company.tin_number}</strong></span>}
                  {company.license_number && <span>Licence: <strong style={{ color: 'var(--clr-text)' }}>{company.license_number}</strong></span>}
                  {company.city && <span>{company.city}</span>}
                  {company.address_line && <span>{company.address_line}</span>}
                </div>
                <div style={{ fontSize: '0.79rem', color: 'var(--clr-muted)', marginTop: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <LuIdCard size={13} />
                  Login: <strong style={{ color: 'var(--clr-text)' }}>{company.owner_name}</strong> · {company.owner_phone}
                  {company.owner_email ? ` · ${company.owner_email}` : ''}
                </div>
                {company.admin_note && (
                  <div style={{ fontSize: '0.76rem', color: 'var(--clr-muted)', marginTop: '0.3rem', fontStyle: 'italic' }}>Note: {company.admin_note}</div>
                )}
              </>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', alignItems: 'flex-end' }}>
            <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <button onClick={onReview} className="btn-primary" style={{ padding: '0.35rem 0.8rem', fontSize: '0.76rem' }}>
                {company?.status === 'PENDING' ? 'Review' : 'Change status'}
              </button>
              <button onClick={onEdit}
                style={{ padding: '0.3rem 0.6rem', borderRadius: 7, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)', color: 'var(--clr-muted)', fontFamily: 'inherit', fontSize: '0.74rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                <LuPencil size={11} /> Edit
              </button>
            </div>
            <div style={{ display: 'flex', gap: '0.35rem' }}>
              <button onClick={async () => {
                try {
                  const { data } = await adminCompanyApi.resendCredentials(companyId)
                  onToast(data.message ?? 'Credentials sent.')
                } catch (e: any) { onToast(e.response?.data?.message ?? 'Could not send credentials.') }
              }}
                style={{ padding: '0.3rem 0.6rem', borderRadius: 7, border: '1px solid rgba(96,165,250,0.3)', background: 'rgba(96,165,250,0.08)', color: '#60a5fa', fontFamily: 'inherit', fontSize: '0.74rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                <LuSend size={11} /> Resend login
              </button>
              {canDelete && (
                <button onClick={onDelete} title="Delete company and all its vehicles"
                  style={{ padding: '0.3rem 0.55rem', borderRadius: 7, border: '1px solid rgba(239,68,68,0.45)', background: 'rgba(239,68,68,0.12)', color: '#f87171', fontFamily: 'inherit', fontSize: '0.74rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <LuTrash2 size={11} /> Delete
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Counts */}
        {statCards.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(104px,1fr))', gap: '0.5rem', marginTop: '1rem' }}>
            {statCards.map(s => (
              <div key={s.label} className="glass-inner" style={{ padding: '0.6rem 0.7rem', textAlign: 'center' }}>
                <div style={{ fontSize: '1.2rem', fontWeight: 800, color: s.tone ?? 'var(--clr-text)' }}>{s.value}</div>
                <div style={{ fontSize: '0.69rem', color: 'var(--clr-muted)', fontWeight: 600, marginTop: '0.1rem' }}>{s.label}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.4rem' }}>
        {([
          { k: 'vehicles' as const, icon: <LuTruck size={13} />, label: `Vehicles${stats ? ` (${stats.vehicles})` : ''}` },
          { k: 'drivers'  as const, icon: <LuUsers size={13} />, label: `Drivers${stats ? ` (${stats.drivers})` : ''}` },
        ]).map(t => (
          <button key={t.k} onClick={() => setTab(t.k)}
            style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.45rem 0.95rem', borderRadius: 9, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.8rem', fontWeight: 700,
              border: `1.5px solid ${tab === t.k ? 'var(--clr-accent)' : 'rgba(255,255,255,0.1)'}`,
              background: tab === t.k ? 'rgba(97,148,31,0.1)' : 'rgba(255,255,255,0.04)',
              color: tab === t.k ? 'var(--clr-accent)' : 'var(--clr-muted)' }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Panels — the same components the standalone screens use, locked to
          this company so nothing can be filed against the wrong one. */}
      {tab === 'vehicles' ? (
        <AdminCompanyVehiclesSection
          onToast={handleToast}
          lockedCompanyId={companyId}
          lockedCompanyName={company?.company_name ?? companyName}
        />
      ) : (
        <AdminCompanyDriversSection
          onToast={handleToast}
          lockedCompanyId={companyId}
          lockedCompanyName={company?.company_name ?? companyName}
          canPurge={canDelete}
        />
      )}
    </div>
  )
}
