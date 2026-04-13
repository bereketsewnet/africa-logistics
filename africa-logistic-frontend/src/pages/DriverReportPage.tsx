import { useCallback, useEffect, useMemo, useState } from 'react'
import logoImg from '../assets/logo.webp'
import { driverApi } from '../lib/apiClient'
import {
  ResponsiveContainer, AreaChart, Area, PieChart, Pie, Cell,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'
import {
  LuBadgeCheck, LuCalendar, LuChartColumnBig,
  LuClock, LuFileText, LuGlobe, LuRefreshCw,
  LuRoute, LuShieldCheck, LuStar, LuTriangleAlert, LuTruck,
  LuWallet,
} from 'react-icons/lu'

interface DriverSelfReport {
  generated_at: string
  date_range: { from: string; to: string }
  driver: {
    id: string
    name: string
    first_name: string
    last_name: string
    phone_number: string
    email: string
    status: string
    is_verified: boolean
    rating: number
    total_trips: number
    national_id_status: string
    license_status: string
    libre_status: string
    on_time_percentage: number
    total_earned: number
    bonus_earned: number
    average_rating: number
    streak_days: number
    last_trip_date: string | null
    vehicle: {
      plate_number: string
      vehicle_type: string
      max_capacity_kg: number
      driver_submission_status: string
      is_approved: boolean
      is_active: boolean
    } | null
  }
  summary: {
    total_jobs: number
    completed_jobs: number
    active_jobs: number
    cancelled_jobs: number
    failed_jobs: number
    cross_border_jobs: number
    total_distance_km: number
    avg_distance_km: number
    avg_assign_min: number
    avg_delivery_hours: number
    period_earnings: number
    period_avg_rating: number
    reviews_count: number
  }
  daily: { date: string; jobs: number; completed: number; km: number; earnings: number }[]
  status_breakdown: { status: string; count: number }[]
  rating_breakdown: { stars: number; count: number }[]
  recent_jobs: {
    id: string
    reference_code: string
    status: string
    pickup_address: string
    delivery_address: string
    created_at: string
    delivered_at: string | null
    driver_amount: number
    order_value: number
    distance_km: number
    is_cross_border: boolean
  }[]
  recent_feedback: { id: string; stars: number; comment: string; created_at: string; shipper_name: string }[]
  document_reviews: { document_type: string; action: string; reason: string; reviewed_at: string }[]
}

const CHART_COLORS = ['#00e5ff', '#4ade80', '#fbbf24', '#a78bfa', '#fb7185', '#60a5fa']
const STATUS_COLORS: Record<string, string> = {
  ASSIGNED: '#60a5fa',
  EN_ROUTE: '#a78bfa',
  AT_PICKUP: '#fb923c',
  IN_TRANSIT: '#38bdf8',
  AT_BORDER: '#f59e0b',
  IN_CUSTOMS: '#ef4444',
  CUSTOMS_CLEARED: '#10b981',
  DELIVERED: '#4ade80',
  COMPLETED: '#22c55e',
  CANCELLED: '#f87171',
  FAILED: '#ef4444',
  PENDING: '#fbbf24',
}

const fmt = (n: number) => new Intl.NumberFormat('en-ET', { maximumFractionDigits: 0 }).format(n)
const fmtCurrency = (n: number) => 'ETB ' + new Intl.NumberFormat('en-ET', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
const fmtDate = (s: string) => new Date(s).toLocaleDateString('en-ET', { month: 'short', day: 'numeric' })
const fmtDateFull = (s: string) => new Date(s).toLocaleDateString('en-ET', { year: 'numeric', month: 'long', day: 'numeric' })
const fmtDateTime = (s: string) => new Date(s).toLocaleString('en-ET', { dateStyle: 'medium', timeStyle: 'short' })

function KpiCard({ label, value, sub, icon, accent = 'var(--clr-accent)' }: { label: string; value: string; sub?: string; icon: React.ReactNode; accent?: string }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 14, padding: '1rem 1.1rem', display: 'flex', flexDirection: 'column', gap: '0.45rem', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.6rem' }}>
        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--clr-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
        <span style={{ color: accent, display: 'flex', flexShrink: 0 }}>{icon}</span>
      </div>
      <div style={{ fontSize: '1.4rem', lineHeight: 1, fontWeight: 800, color: 'var(--clr-text)' }}>{value}</div>
      {sub && <div style={{ fontSize: '0.72rem', color: 'var(--clr-muted)' }}>{sub}</div>}
    </div>
  )
}

function ChartCard({ title, children, height = 280 }: { title: string; children: React.ReactNode; height?: number }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 14, padding: '1.1rem' }}>
      <p style={{ margin: '0 0 1rem', fontSize: '0.82rem', fontWeight: 700, color: 'var(--clr-text)' }}>{title}</p>
      <div style={{ height, minWidth: 0 }}>{children}</div>
    </div>
  )
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: '#171b28', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: '0.65rem 0.85rem', fontSize: '0.75rem' }}>
      <p style={{ margin: '0 0 0.35rem', color: 'var(--clr-muted)', fontWeight: 700 }}>{label}</p>
      {payload.map((item: any) => (
        <p key={item.dataKey} style={{ margin: '0.15rem 0', color: item.color, fontWeight: 600 }}>
          {item.name}: <span style={{ color: '#fff' }}>{item.dataKey === 'earnings' ? fmtCurrency(Number(item.value)) : fmt(Number(item.value))}</span>
        </p>
      ))}
    </div>
  )
}

function statusPill(label: string, tone: string) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0.22rem 0.55rem', borderRadius: 999, border: `1px solid ${tone}44`, background: `${tone}18`, color: tone, fontSize: '0.68rem', fontWeight: 700, whiteSpace: 'nowrap' }}>
      {label}
    </span>
  )
}

export default function DriverReportPage() {
  const today = new Date()
  const defaultTo = today.toISOString().slice(0, 10)
  const defaultFrom = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  const [from, setFrom] = useState(defaultFrom)
  const [to, setTo] = useState(defaultTo)
  const [report, setReport] = useState<DriverSelfReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async (f = from, t = to) => {
    setLoading(true)
    setError('')
    try {
      const { data } = await driverApi.getReport({ from: f, to: t })
      setReport(data.report)
    } catch {
      setError('Failed to load your driver report. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [from, to])

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const statusData = useMemo(() => (
    (report?.status_breakdown ?? []).map((row) => ({
      name: row.status,
      value: row.count,
      fill: STATUS_COLORS[row.status] ?? '#94a3b8',
    }))
  ), [report])

  const ratingData = useMemo(() => {
    const map = new Map((report?.rating_breakdown ?? []).map((row) => [row.stars, row.count]))
    return [5, 4, 3, 2, 1].map((stars) => ({ stars: `${stars}★`, count: map.get(stars) ?? 0 }))
  }, [report])

  const driver = report?.driver
  const summary = report?.summary

  return (
    <div className="page-shell" style={{ alignItems: 'flex-start' }}>
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .driver-report-grid-2 { display: grid; grid-template-columns: 1.25fr 0.95fr; gap: 1rem; }
        .driver-report-grid-even { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
        .driver-report-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(165px, 1fr)); gap: 0.85rem; }
        .driver-report-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; }
        .driver-report-scroll table { min-width: 760px; }
        @media (max-width: 980px) {
          .driver-report-grid-2, .driver-report-grid-even { grid-template-columns: 1fr; }
        }
        @media (max-width: 640px) {
          .driver-report-scroll table { min-width: 560px; }
        }
      `}</style>

      <div style={{ width: '100%', maxWidth: 1220, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.65rem', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '0.75rem 1rem' }}>
          <LuCalendar size={14} style={{ color: 'var(--clr-muted)', flexShrink: 0 }} />
          {(['From', 'To'] as const).map((label, index) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <label style={{ fontSize: '0.72rem', color: 'var(--clr-muted)', fontWeight: 600 }}>{label}</label>
              <input
                type="date"
                value={index === 0 ? from : to}
                max={index === 0 ? to : undefined}
                min={index === 1 ? from : undefined}
                onChange={(e) => index === 0 ? setFrom(e.target.value) : setTo(e.target.value)}
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '0.3rem 0.55rem', color: 'var(--clr-text)', fontSize: '0.78rem', fontFamily: 'inherit', colorScheme: 'dark' }}
              />
            </div>
          ))}
          {[{ label: '7D', days: 7 }, { label: '30D', days: 30 }, { label: '90D', days: 90 }, { label: '1Y', days: 365 }].map((preset) => {
            const f = new Date(today.getTime() - preset.days * 86400000).toISOString().slice(0, 10)
            const active = from === f && to === defaultTo
            return (
              <button
                key={preset.label}
                onClick={() => { setFrom(f); setTo(defaultTo); load(f, defaultTo) }}
                style={{ padding: '0.28rem 0.65rem', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: active ? 'rgba(0,229,255,0.12)' : 'rgba(255,255,255,0.04)', color: active ? 'var(--clr-accent)' : 'var(--clr-muted)', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                {preset.label}
              </button>
            )
          })}
          <div style={{ flex: 1 }} />
          <button
            onClick={() => load(from, to)}
            disabled={loading}
            style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.38rem 0.85rem', borderRadius: 9, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.06)', color: 'var(--clr-text)', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            <LuRefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} /> Apply
          </button>
        </div>

        {error && (
          <div style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 10, padding: '0.7rem 1rem', fontSize: '0.8rem', color: '#f87171', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <LuTriangleAlert size={14} /> {error}
          </div>
        )}

        {loading && !report && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4rem', gap: '0.7rem', color: 'var(--clr-muted)' }}>
            <LuRefreshCw size={18} style={{ animation: 'spin 1s linear infinite', color: 'var(--clr-accent)' }} /> Loading driver report…
          </div>
        )}

        {report && driver && summary && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', background: 'linear-gradient(135deg, rgba(56,189,248,0.08), rgba(129,140,248,0.07))', border: '1px solid rgba(56,189,248,0.16)', borderRadius: 16, padding: '1.2rem 1.35rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', minWidth: 0 }}>
                <img src={logoImg} alt="Africa Logistics" style={{ height: 46, width: 'auto', objectFit: 'contain', borderRadius: 8 }} />
                <div style={{ minWidth: 0 }}>
                  <p style={{ margin: 0, fontWeight: 800, fontSize: '1rem', color: 'var(--clr-text)' }}>Driver General Report</p>
                  <p style={{ margin: '0.15rem 0 0', fontSize: '0.78rem', color: 'var(--clr-muted)' }}>{driver.name || `${driver.first_name} ${driver.last_name}`.trim()}</p>
                  <div style={{ marginTop: '0.45rem', display: 'flex', flexWrap: 'wrap', gap: '0.45rem' }}>
                    {statusPill(driver.status.replaceAll('_', ' '), STATUS_COLORS[driver.status] ?? '#60a5fa')}
                    {driver.is_verified ? statusPill('Verified', '#4ade80') : statusPill('Pending Verification', '#fbbf24')}
                    {driver.vehicle?.vehicle_type ? statusPill(driver.vehicle.vehicle_type, '#a78bfa') : statusPill('No Active Vehicle', '#94a3b8')}
                  </div>
                </div>
              </div>
              <div style={{ textAlign: 'right', minWidth: 220 }}>
                <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--clr-muted)' }}>Report Period</p>
                <p style={{ margin: 0, fontWeight: 700, fontSize: '0.84rem', color: 'var(--clr-text)' }}>{fmtDateFull(report.date_range.from)} — {fmtDateFull(report.date_range.to)}</p>
                <p style={{ margin: '0.2rem 0 0', fontSize: '0.7rem', color: 'var(--clr-muted)' }}>Generated: {fmtDateTime(report.generated_at)}</p>
              </div>
            </div>

            <div className="driver-report-kpis">
              <KpiCard label="Total Jobs" value={fmt(summary.total_jobs)} sub={`${fmt(summary.completed_jobs)} completed`} icon={<LuTruck size={18} />} />
              <KpiCard label="Active Jobs" value={fmt(summary.active_jobs)} sub="currently moving" icon={<LuClock size={18} />} accent="#fbbf24" />
              <KpiCard label="Period Earnings" value={fmtCurrency(summary.period_earnings)} sub={`${fmtCurrency(driver.total_earned)} lifetime`} icon={<LuWallet size={18} />} accent="#4ade80" />
              <KpiCard label="Distance" value={`${fmt(summary.total_distance_km)} km`} sub={`${summary.avg_distance_km.toFixed(1)} km average`} icon={<LuRoute size={18} />} accent="#34d399" />
              <KpiCard label="Average Rating" value={(summary.period_avg_rating || driver.average_rating || driver.rating || 0).toFixed(2)} sub={`${fmt(summary.reviews_count)} reviews in range`} icon={<LuStar size={18} />} accent="#fbbf24" />
              <KpiCard label="Cross-Border" value={fmt(summary.cross_border_jobs)} sub={`${summary.avg_delivery_hours.toFixed(1)}h avg delivery`} icon={<LuGlobe size={18} />} accent="#a78bfa" />
            </div>

            <div className="driver-report-grid-2">
              <ChartCard title="Daily Jobs, Completions & Earnings" height={290}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={report.daily} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="drvJobs" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#00e5ff" stopOpacity={0.32} />
                        <stop offset="95%" stopColor="#00e5ff" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="drvEarn" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#4ade80" stopOpacity={0.26} />
                        <stop offset="95%" stopColor="#4ade80" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis dataKey="date" tickFormatter={fmtDate} tick={{ fill: '#9ca3af', fontSize: 10 }} tickLine={false} axisLine={false} />
                    <YAxis yAxisId="left" tick={{ fill: '#9ca3af', fontSize: 10 }} tickLine={false} axisLine={false} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fill: '#9ca3af', fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(value) => `${(Number(value) / 1000).toFixed(0)}k`} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend wrapperStyle={{ fontSize: '0.72rem' }} />
                    <Area yAxisId="left" type="monotone" dataKey="jobs" name="Jobs" stroke="#00e5ff" fill="url(#drvJobs)" strokeWidth={2} dot={false} />
                    <Area yAxisId="left" type="monotone" dataKey="completed" name="Completed" stroke="#fbbf24" fillOpacity={0} strokeWidth={2} dot={false} />
                    <Area yAxisId="right" type="monotone" dataKey="earnings" name="Earnings" stroke="#4ade80" fill="url(#drvEarn)" strokeWidth={2} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Job Status Breakdown" height={290}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={statusData} cx="42%" cy="50%" innerRadius={55} outerRadius={92} paddingAngle={2} dataKey="value">
                      {statusData.map((entry, index) => <Cell key={entry.name + index} fill={entry.fill} />)}
                    </Pie>
                    <Tooltip formatter={(value: any, name: any) => [fmt(Number(value)), name]} contentStyle={{ background: '#171b28', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, fontSize: '0.74rem' }} />
                    <Legend iconSize={9} wrapperStyle={{ fontSize: '0.7rem', paddingLeft: '0.45rem' }} />
                  </PieChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>

            <div className="driver-report-grid-even">
              <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 14, padding: '1.1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.9rem' }}>
                  <LuBadgeCheck size={16} style={{ color: 'var(--clr-accent)' }} />
                  <p style={{ margin: 0, fontWeight: 700, fontSize: '0.83rem', color: 'var(--clr-text)' }}>Driver Snapshot</p>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
                  <div>
                    <p style={{ margin: '0 0 0.3rem', fontSize: '0.68rem', color: 'var(--clr-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Phone</p>
                    <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--clr-text)', fontWeight: 600 }}>{driver.phone_number || '—'}</p>
                  </div>
                  <div>
                    <p style={{ margin: '0 0 0.3rem', fontSize: '0.68rem', color: 'var(--clr-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Email</p>
                    <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--clr-text)', fontWeight: 600, wordBreak: 'break-word' }}>{driver.email || '—'}</p>
                  </div>
                  <div>
                    <p style={{ margin: '0 0 0.3rem', fontSize: '0.68rem', color: 'var(--clr-muted)', textTransform: 'uppercase', fontWeight: 700 }}>On-Time Rate</p>
                    <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--clr-text)', fontWeight: 600 }}>{driver.on_time_percentage.toFixed(1)}%</p>
                  </div>
                  <div>
                    <p style={{ margin: '0 0 0.3rem', fontSize: '0.68rem', color: 'var(--clr-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Streak</p>
                    <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--clr-text)', fontWeight: 600 }}>{fmt(driver.streak_days)} days</p>
                  </div>
                  <div>
                    <p style={{ margin: '0 0 0.3rem', fontSize: '0.68rem', color: 'var(--clr-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Last Trip</p>
                    <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--clr-text)', fontWeight: 600 }}>{driver.last_trip_date ? fmtDateTime(driver.last_trip_date) : '—'}</p>
                  </div>
                  <div>
                    <p style={{ margin: '0 0 0.3rem', fontSize: '0.68rem', color: 'var(--clr-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Documents</p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                      {statusPill(`National ID: ${driver.national_id_status}`, driver.national_id_status === 'APPROVED' ? '#4ade80' : driver.national_id_status === 'REJECTED' ? '#f87171' : '#fbbf24')}
                      {statusPill(`License: ${driver.license_status}`, driver.license_status === 'APPROVED' ? '#4ade80' : driver.license_status === 'REJECTED' ? '#f87171' : '#fbbf24')}
                      {statusPill(`Libre: ${driver.libre_status}`, driver.libre_status === 'APPROVED' ? '#4ade80' : driver.libre_status === 'REJECTED' ? '#f87171' : '#fbbf24')}
                    </div>
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <p style={{ margin: '0 0 0.3rem', fontSize: '0.68rem', color: 'var(--clr-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Vehicle</p>
                    {driver.vehicle ? (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem' }}>
                        {statusPill(driver.vehicle.vehicle_type, '#a78bfa')}
                        {statusPill(driver.vehicle.plate_number, '#60a5fa')}
                        {statusPill(`${fmt(driver.vehicle.max_capacity_kg)} kg`, '#34d399')}
                        {statusPill(driver.vehicle.is_approved ? 'Approved' : 'Pending Approval', driver.vehicle.is_approved ? '#4ade80' : '#fbbf24')}
                      </div>
                    ) : (
                      <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--clr-muted)' }}>No active vehicle assigned yet.</p>
                    )}
                  </div>
                </div>
              </div>

              <ChartCard title="Rating Distribution" height={270}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={ratingData} layout="vertical" margin={{ top: 5, right: 20, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" horizontal={false} />
                    <XAxis type="number" tick={{ fill: '#9ca3af', fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} />
                    <YAxis type="category" dataKey="stars" tick={{ fill: '#9ca3af', fontSize: 10 }} tickLine={false} axisLine={false} width={40} />
                    <Tooltip formatter={(value: any) => [fmt(Number(value)), 'Reviews']} contentStyle={{ background: '#171b28', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, fontSize: '0.74rem' }} />
                    <Bar dataKey="count" name="Reviews" radius={[0, 4, 4, 0]} maxBarSize={18}>
                      {ratingData.map((_, index) => <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>

            <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 14, overflow: 'hidden' }}>
              <div style={{ padding: '1rem 1.1rem', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <LuChartColumnBig size={15} style={{ color: 'var(--clr-accent)' }} />
                <p style={{ margin: 0, fontWeight: 700, fontSize: '0.83rem', color: 'var(--clr-text)' }}>Recent Jobs</p>
              </div>
              <div className="driver-report-scroll">
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                      {['Ref', 'Status', 'Pickup', 'Delivery', 'Distance', 'Earnings', 'Created'].map((label) => (
                        <th key={label} style={{ padding: '0.7rem 1rem', textAlign: 'left', color: 'var(--clr-muted)', fontWeight: 600, fontSize: '0.7rem', letterSpacing: '0.05em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {report.recent_jobs.length > 0 ? report.recent_jobs.map((job, index) => (
                      <tr key={job.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: index % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)' }}>
                        <td style={{ padding: '0.7rem 1rem', fontWeight: 700, color: 'var(--clr-text)' }}>{job.reference_code}</td>
                        <td style={{ padding: '0.7rem 1rem' }}>{statusPill(job.status, STATUS_COLORS[job.status] ?? '#94a3b8')}</td>
                        <td style={{ padding: '0.7rem 1rem', maxWidth: 180 }}><span style={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{job.pickup_address || '—'}</span></td>
                        <td style={{ padding: '0.7rem 1rem', maxWidth: 180 }}><span style={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{job.delivery_address || '—'}</span></td>
                        <td style={{ padding: '0.7rem 1rem', color: 'var(--clr-muted)' }}>{job.distance_km.toFixed(1)} km</td>
                        <td style={{ padding: '0.7rem 1rem', color: '#4ade80', fontWeight: 700 }}>{fmtCurrency(job.driver_amount)}</td>
                        <td style={{ padding: '0.7rem 1rem', color: 'var(--clr-muted)' }}>{fmtDateTime(job.created_at)}</td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan={7} style={{ padding: '1rem', textAlign: 'center', color: 'var(--clr-muted)' }}>No jobs found in this period.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="driver-report-grid-even">
              <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 14, padding: '1.1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.9rem' }}>
                  <LuStar size={15} style={{ color: '#fbbf24' }} />
                  <p style={{ margin: 0, fontWeight: 700, fontSize: '0.83rem', color: 'var(--clr-text)' }}>Recent Shipper Feedback</p>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
                  {report.recent_feedback.length > 0 ? report.recent_feedback.map((item) => (
                    <div key={item.id} style={{ padding: '0.85rem', borderRadius: 12, border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.02)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.6rem', marginBottom: '0.35rem' }}>
                        <span style={{ color: 'var(--clr-text)', fontSize: '0.8rem', fontWeight: 700 }}>{item.shipper_name}</span>
                        <span style={{ color: '#fbbf24', fontSize: '0.78rem', fontWeight: 700 }}>{item.stars}★</span>
                      </div>
                      <p style={{ margin: '0 0 0.35rem', color: item.comment ? 'var(--clr-text)' : 'var(--clr-muted)', fontSize: '0.78rem', lineHeight: 1.55 }}>{item.comment || 'No written comment.'}</p>
                      <p style={{ margin: 0, color: 'var(--clr-muted)', fontSize: '0.68rem' }}>{fmtDateTime(item.created_at)}</p>
                    </div>
                  )) : (
                    <p style={{ margin: 0, color: 'var(--clr-muted)', fontSize: '0.8rem' }}>No rating feedback yet.</p>
                  )}
                </div>
              </div>

              <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 14, padding: '1.1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.9rem' }}>
                  <LuFileText size={15} style={{ color: 'var(--clr-accent)' }} />
                  <p style={{ margin: 0, fontWeight: 700, fontSize: '0.83rem', color: 'var(--clr-text)' }}>Document Review History</p>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
                  {report.document_reviews.length > 0 ? report.document_reviews.map((item, index) => {
                    const tone = item.action === 'APPROVED' ? '#4ade80' : '#f87171'
                    return (
                      <div key={item.document_type + item.reviewed_at + index} style={{ padding: '0.85rem', borderRadius: 12, border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.02)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.6rem', marginBottom: '0.35rem' }}>
                          <span style={{ color: 'var(--clr-text)', fontSize: '0.8rem', fontWeight: 700 }}>{item.document_type.replaceAll('_', ' ')}</span>
                          {statusPill(item.action, tone)}
                        </div>
                        <p style={{ margin: '0 0 0.35rem', color: item.reason ? 'var(--clr-text)' : 'var(--clr-muted)', fontSize: '0.78rem', lineHeight: 1.55 }}>{item.reason || 'No review note provided.'}</p>
                        <p style={{ margin: 0, color: 'var(--clr-muted)', fontSize: '0.68rem' }}>{fmtDateTime(item.reviewed_at)}</p>
                      </div>
                    )
                  }) : (
                    <p style={{ margin: 0, color: 'var(--clr-muted)', fontSize: '0.8rem' }}>No document review history available yet.</p>
                  )}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.45rem', padding: '0.2rem 0.15rem', fontSize: '0.7rem', color: 'var(--clr-muted)' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}><LuShieldCheck size={13} /> Driver self-report</span>
              <span>Generated on {fmtDateTime(report.generated_at)}</span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}