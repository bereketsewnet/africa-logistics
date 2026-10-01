import { useState, useEffect, useCallback } from 'react'
import {
  LuTruck, LuUsers, LuTriangleAlert, LuRefreshCw, LuClock, LuCircleCheck,
  LuWrench, LuCircleX, LuPlus, LuArrowRight, LuBadgeCheck,
} from 'react-icons/lu'
import { companyApi } from '../../lib/apiClient'

interface DashboardStats {
  vehicles: number
  vehicles_approved: number
  vehicles_pending: number
  vehicles_rejected: number
  vehicles_with_driver: number
  vehicles_dispatchable: number
  drivers: number
  drivers_verified: number
  drivers_pending: number
  op_active: number
  op_inactive: number
  op_maintenance: number
  op_out_of_service: number
}

interface Attention {
  pending_vehicles: Array<{ id: string; plate_number: string; vehicle_type: string }>
  rejected_vehicles: Array<{ id: string; plate_number: string; vehicle_type: string; admin_note: string | null }>
  unverified_drivers: Array<{ id: string; first_name: string; last_name: string | null; phone_number: string; rejection_reason: string | null }>
  idle_vehicles: Array<{ id: string; plate_number: string; vehicle_type: string }>
  idle_drivers: Array<{ id: string; first_name: string; last_name: string | null }>
}

/**
 * The company's overview screen — everything at a glance.
 *
 * Counts alone are not useful to a fleet manager: "3 awaiting approval" tells
 * them something is wrong without telling them which truck. So every number that
 * represents a problem is backed by the actual rows, and the two kinds of idle
 * capacity — an approved truck with nobody to drive it, and a verified driver
 * with no truck — are called out, because those are money sitting still.
 */
export default function CompanyOverviewPanel({ onNavigate }: {
  onNavigate: (view: 'fleet' | 'drivers') => void
}) {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [attention, setAttention] = useState<Attention | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setErr('')
    try {
      const { data } = await companyApi.dashboard()
      setStats(data.stats)
      setAttention(data.attention)
    } catch (e: any) {
      setErr(e.response?.data?.message ?? 'Could not load your dashboard.')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) {
    return <div style={{ color: 'var(--clr-muted)', fontSize: '0.85rem', padding: '1rem 0' }}>Loading…</div>
  }
  if (err) {
    return <div className="alert alert-error"><LuTriangleAlert size={13} /> {err}</div>
  }
  if (!stats || !attention) return null

  const headline = [
    { label: 'Ready to dispatch', value: stats.vehicles_dispatchable, tone: 'var(--kpi-green)', icon: <LuCircleCheck size={15} />, hint: 'approved and on the road' },
    { label: 'Total vehicles', value: stats.vehicles, tone: undefined, icon: <LuTruck size={15} />, hint: 'in your fleet' },
    { label: 'Crewed', value: stats.vehicles_with_driver, tone: undefined, icon: <LuUsers size={15} />, hint: 'with a driver assigned' },
    { label: 'Drivers', value: stats.drivers, tone: undefined, icon: <LuUsers size={15} />, hint: `${stats.drivers_verified} verified` },
  ]

  const operational = [
    { label: 'On the road', value: stats.op_active, color: 'var(--kpi-green)', icon: <LuCircleCheck size={13} /> },
    { label: 'Idle', value: stats.op_inactive, color: '#94a3b8', icon: <LuClock size={13} /> },
    { label: 'In maintenance', value: stats.op_maintenance, color: '#fbbf24', icon: <LuWrench size={13} /> },
    { label: 'Out of service', value: stats.op_out_of_service, color: '#f87171', icon: <LuCircleX size={13} /> },
  ]

  const approval = [
    { label: 'Approved', value: stats.vehicles_approved, color: 'var(--kpi-green)' },
    { label: 'Awaiting approval', value: stats.vehicles_pending, color: '#fbbf24' },
    { label: 'Rejected', value: stats.vehicles_rejected, color: '#f87171' },
  ]

  // Each block is rendered only when it has something to say, so an all-clear
  // dashboard is genuinely empty rather than a wall of zeroes.
  const blocks: Array<{ key: string; tone: string; title: string; body: React.ReactNode; action?: () => void; actionLabel?: string }> = []

  if (attention.pending_vehicles.length) blocks.push({
    key: 'pending', tone: '#fbbf24',
    title: `${attention.pending_vehicles.length} vehicle${attention.pending_vehicles.length === 1 ? '' : 's'} awaiting Afri Logistics approval`,
    body: attention.pending_vehicles.map(v => `${v.plate_number} (${v.vehicle_type})`).join(' · '),
    action: () => onNavigate('fleet'), actionLabel: 'View fleet',
  })

  if (attention.rejected_vehicles.length) blocks.push({
    key: 'rejected', tone: '#f87171',
    title: `${attention.rejected_vehicles.length} vehicle${attention.rejected_vehicles.length === 1 ? '' : 's'} rejected`,
    body: attention.rejected_vehicles.map(v => `${v.plate_number}${v.admin_note ? ` — ${v.admin_note}` : ''}`).join(' · '),
    action: () => onNavigate('fleet'), actionLabel: 'View fleet',
  })

  if (attention.unverified_drivers.length) blocks.push({
    key: 'unverified', tone: '#fbbf24',
    title: `${attention.unverified_drivers.length} driver${attention.unverified_drivers.length === 1 ? '' : 's'} awaiting verification`,
    body: `${attention.unverified_drivers.map(d => `${d.first_name} ${d.last_name ?? ''}`.trim()).join(' · ')} — they can sign in, but cannot be put on a vehicle yet.`,
    action: () => onNavigate('drivers'), actionLabel: 'View drivers',
  })

  if (attention.idle_vehicles.length) blocks.push({
    key: 'idle-v', tone: '#60a5fa',
    title: `${attention.idle_vehicles.length} vehicle${attention.idle_vehicles.length === 1 ? '' : 's'} on the road with no driver`,
    body: attention.idle_vehicles.map(v => v.plate_number).join(' · '),
    action: () => onNavigate('fleet'), actionLabel: 'Assign a driver',
  })

  if (attention.idle_drivers.length) blocks.push({
    key: 'idle-d', tone: '#60a5fa',
    title: `${attention.idle_drivers.length} verified driver${attention.idle_drivers.length === 1 ? '' : 's'} with no vehicle`,
    body: attention.idle_drivers.map(d => `${d.first_name} ${d.last_name ?? ''}`.trim()).join(' · '),
    action: () => onNavigate('fleet'), actionLabel: 'Assign to a vehicle',
  })

  const bar = (items: Array<{ label: string; value: number; color: string }>, total: number) => (
    <div style={{ display: 'flex', height: 8, borderRadius: 999, overflow: 'hidden', background: 'rgba(255,255,255,0.07)' }}>
      {total > 0 && items.filter(i => i.value > 0).map(i => (
        <div key={i.label} title={`${i.label}: ${i.value}`}
          style={{ width: `${(i.value / total) * 100}%`, background: i.color }} />
      ))}
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--clr-text)', flex: 1 }}>Overview</h2>
        <button onClick={load} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.3rem 0.7rem', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: 'var(--clr-muted)', fontFamily: 'inherit', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer' }}>
          <LuRefreshCw size={12} /> Refresh
        </button>
      </div>

      {/* Headline numbers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: '0.6rem' }}>
        {headline.map(k => (
          <div key={k.label} className="glass" style={{ padding: '0.9rem 1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.72rem', fontWeight: 700, color: 'var(--clr-muted)' }}>
              {k.icon} {k.label}
            </div>
            <div style={{ fontSize: '1.65rem', fontWeight: 800, color: k.tone ?? 'var(--clr-text)', marginTop: '0.25rem', lineHeight: 1.1 }}>{k.value}</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--clr-muted)', marginTop: '0.1rem' }}>{k.hint}</div>
          </div>
        ))}
      </div>

      {/* Breakdowns */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: '0.75rem' }}>
        <div className="glass" style={{ padding: '1rem 1.1rem' }}>
          <h3 style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--clr-text)', marginBottom: '0.7rem' }}>Vehicle status</h3>
          {bar(operational.map(o => ({ label: o.label, value: o.value, color: o.color })), stats.vehicles)}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginTop: '0.7rem' }}>
            {operational.map(o => (
              <div key={o.label} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.78rem' }}>
                <span style={{ color: o.color, display: 'flex' }}>{o.icon}</span>
                <span style={{ flex: 1, color: 'var(--clr-muted)' }}>{o.label}</span>
                <strong style={{ color: 'var(--clr-text)' }}>{o.value}</strong>
              </div>
            ))}
          </div>
        </div>

        <div className="glass" style={{ padding: '1rem 1.1rem' }}>
          <h3 style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--clr-text)', marginBottom: '0.7rem' }}>Approval</h3>
          {bar(approval, stats.vehicles)}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginTop: '0.7rem' }}>
            {approval.map(a => (
              <div key={a.label} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.78rem' }}>
                <span style={{ width: 8, height: 8, borderRadius: 999, background: a.color }} />
                <span style={{ flex: 1, color: 'var(--clr-muted)' }}>{a.label}</span>
                <strong style={{ color: 'var(--clr-text)' }}>{a.value}</strong>
              </div>
            ))}
          </div>
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.09)', marginTop: '0.7rem', paddingTop: '0.6rem', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.78rem' }}>
            <LuBadgeCheck size={13} style={{ color: 'var(--kpi-green)' }} />
            <span style={{ flex: 1, color: 'var(--clr-muted)' }}>Verified drivers</span>
            <strong style={{ color: 'var(--clr-text)' }}>{stats.drivers_verified} of {stats.drivers}</strong>
          </div>
        </div>
      </div>

      {/* Needs attention */}
      <div>
        <h3 style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--clr-text)', marginBottom: '0.6rem' }}>Needs your attention</h3>
        {blocks.length === 0 ? (
          <div className="glass-inner" style={{ padding: '1.4rem', textAlign: 'center', color: 'var(--clr-muted)', fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.45rem' }}>
            <LuCircleCheck size={15} style={{ color: 'var(--kpi-green)' }} />
            {stats.vehicles === 0
              ? 'Nothing yet — add your first vehicle to get started.'
              : 'All clear. Nothing is waiting on you.'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
            {blocks.map(b => (
              <div key={b.key} className="glass-inner" style={{ padding: '0.8rem 0.95rem', borderLeft: `3px solid ${b.tone}` }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--clr-text)' }}>{b.title}</div>
                    <div style={{ fontSize: '0.76rem', color: 'var(--clr-muted)', marginTop: '0.2rem', lineHeight: 1.45 }}>{b.body}</div>
                  </div>
                  {b.action && (
                    <button onClick={b.action}
                      style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', padding: '0.3rem 0.65rem', borderRadius: 7, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)', color: 'var(--clr-text)', fontFamily: 'inherit', fontSize: '0.74rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                      {b.actionLabel} <LuArrowRight size={11} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick actions */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <button onClick={() => onNavigate('fleet')}
          style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.5rem 0.95rem', borderRadius: 9, border: 'none', background: 'var(--clr-accent)', color: '#080b14', fontFamily: 'inherit', fontSize: '0.8rem', fontWeight: 800, cursor: 'pointer' }}>
          <LuPlus size={13} /> Add a vehicle
        </button>
        <button onClick={() => onNavigate('drivers')}
          style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.5rem 0.95rem', borderRadius: 9, border: '1px solid rgba(255,255,255,0.14)', background: 'rgba(255,255,255,0.05)', color: 'var(--clr-text)', fontFamily: 'inherit', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}>
          <LuPlus size={13} /> Add a driver
        </button>
      </div>
    </div>
  )
}
