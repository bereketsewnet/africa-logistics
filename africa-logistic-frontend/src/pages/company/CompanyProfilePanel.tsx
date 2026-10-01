import { LuBuilding2, LuIdCard, LuMapPin, LuPhone, LuMail } from 'react-icons/lu'
import type { CompanyStats } from './CompanyDashboard'

/**
 * The company's own record, read-only.
 *
 * Name, TIN and licence number are what Afri Logistics approved, so they are not
 * editable here — letting a company rewrite the details behind its own approval
 * would make the approval meaningless. Changes go through Afri Logistics.
 */
export default function CompanyProfilePanel({ company, stats }: {
  company: any | null
  stats: CompanyStats | null
}) {
  if (!company) {
    return <div style={{ color: 'var(--clr-muted)', fontSize: '0.85rem', padding: '1rem 0' }}>Loading…</div>
  }

  const rows: Array<{ icon: React.ReactNode; label: string; value: string | null }> = [
    { icon: <LuBuilding2 size={14} />, label: 'Company name', value: company.company_name },
    { icon: <LuIdCard size={14} />,    label: 'Trade / legal name', value: company.legal_name },
    { icon: <LuIdCard size={14} />,    label: 'TIN', value: company.tin_number },
    { icon: <LuIdCard size={14} />,    label: 'Business licence', value: company.license_number },
    { icon: <LuMapPin size={14} />,    label: 'City', value: company.city },
    { icon: <LuMapPin size={14} />,    label: 'Address', value: company.address_line },
  ]

  const loginRows: Array<{ icon: React.ReactNode; label: string; value: string | null }> = [
    { icon: <LuIdCard size={14} />, label: 'Account holder', value: company.owner_name },
    { icon: <LuPhone size={14} />,  label: 'Phone', value: company.owner_phone },
    { icon: <LuMail size={14} />,   label: 'Email', value: company.owner_email },
  ]

  const card = (title: string, items: typeof rows) => (
    <div className="glass" style={{ padding: '1.1rem 1.25rem' }}>
      <h3 style={{ fontSize: '0.92rem', fontWeight: 800, color: 'var(--clr-text)', marginBottom: '0.85rem' }}>{title}</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: '0.75rem' }}>
        {items.map(r => (
          <div key={r.label}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.72rem', fontWeight: 600, color: 'var(--clr-muted)', marginBottom: '0.2rem' }}>
              {r.icon} {r.label}
            </div>
            <div style={{ fontSize: '0.86rem', color: r.value ? 'var(--clr-text)' : 'var(--clr-muted)', fontWeight: r.value ? 600 : 400 }}>
              {r.value || '—'}
            </div>
          </div>
        ))}
      </div>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {card('Company details', rows)}
      {card('Login', loginRows)}

      {stats && (
        <div className="glass" style={{ padding: '1.1rem 1.25rem' }}>
          <h3 style={{ fontSize: '0.92rem', fontWeight: 800, color: 'var(--clr-text)', marginBottom: '0.85rem' }}>At a glance</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: '0.5rem' }}>
            {[
              { label: 'Vehicles', value: stats.vehicles },
              { label: 'Approved', value: stats.vehicles_approved },
              { label: 'Awaiting approval', value: stats.vehicles_pending },
              { label: 'Rejected', value: stats.vehicles_rejected },
              { label: 'Ready to dispatch', value: stats.vehicles_dispatchable },
              { label: 'Drivers', value: stats.drivers },
              { label: 'Verified drivers', value: stats.drivers_verified },
            ].map(s => (
              <div key={s.label} className="glass-inner" style={{ padding: '0.6rem 0.7rem', textAlign: 'center' }}>
                <div style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--clr-text)' }}>{s.value}</div>
                <div style={{ fontSize: '0.68rem', color: 'var(--clr-muted)', fontWeight: 600, marginTop: '0.1rem' }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <p style={{ fontSize: '0.78rem', color: 'var(--clr-muted)', lineHeight: 1.55, margin: 0 }}>
        To change your company name, TIN or licence number, contact Afri Logistics — these are the
        details your approval was granted against.
      </p>
    </div>
  )
}
