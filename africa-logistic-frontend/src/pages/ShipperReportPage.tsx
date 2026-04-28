import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLanguage } from '../context/LanguageContext'
import { logoDark } from '../lib/useThemeLogo'
import { orderApi } from '../lib/apiClient'
import {
  ResponsiveContainer, AreaChart, Area, PieChart, Pie, Cell,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'
import {
  LuCalendar, LuChartColumnBig, LuCircleCheck, LuClock,
  LuDollarSign, LuGlobe, LuRefreshCw, LuRoute, LuTriangleAlert,
  LuTruck, LuWallet,
} from 'react-icons/lu'

interface ShipperReport {
  generated_at: string
  date_range: { from: string; to: string }
  shipper: {
    id: string
    first_name: string
    last_name: string
    name: string
    phone_number: string
    email: string
  }
  summary: {
    total_orders: number
    completed_orders: number
    active_orders: number
    cancelled_orders: number
    failed_orders: number
    cross_border_orders: number
    total_spent: number
    avg_order_value: number
    total_distance_km: number
    avg_delivery_hours: number
    paid_orders: number
    unpaid_orders: number
  }
  daily: { date: string; orders: number; completed: number; spent: number; distance_km: number }[]
  by_status: { status: string; count: number }[]
  by_payment: { payment_status: string; count: number }[]
  by_vehicle: { vehicle_type: string; orders: number; spent: number; avg_km: number }[]
  top_routes: { from_city: string; to_city: string; count: number; avg_km: number }[]
  recent_orders: {
    id: string
    reference_code: string
    status: string
    payment_status: string
    pickup_address: string
    delivery_address: string
    created_at: string
    delivered_at: string | null
    amount: number
    distance_km: number
    is_cross_border: boolean
    driver_name: string
  }[]
  feedback: {
    ratings_given: number
    avg_stars_given: number
  }
}

const CHART_COLORS = ['#61941f', '#4ade80', '#fbbf24', '#a78bfa', '#fb7185', '#60a5fa']
const STATUS_COLORS: Record<string, string> = {
  PENDING: '#fbbf24',
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
          {item.name}: <span style={{ color: '#fff' }}>{item.dataKey === 'spent' ? fmtCurrency(Number(item.value)) : fmt(Number(item.value))}</span>
        </p>
      ))}
    </div>
  )
}

function pill(label: string, color: string) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0.22rem 0.55rem', borderRadius: 999, border: `1px solid ${color}44`, background: `${color}18`, color, fontSize: '0.68rem', fontWeight: 700, whiteSpace: 'nowrap' }}>
      {label}
    </span>
  )
}

export default function ShipperReportPage() {
  const { t: tr } = useLanguage()
  const logoImg = logoDark
  const today = new Date()
  const defaultTo = today.toISOString().slice(0, 10)
  const defaultFrom = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  const [from, setFrom] = useState(defaultFrom)
  const [to, setTo] = useState(defaultTo)
  const [report, setReport] = useState<ShipperReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async (f = from, t = to) => {
    setLoading(true)
    setError('')
    try {
      const { data } = await orderApi.getReport({ from: f, to: t })
      setReport(data.report)
    } catch {
      setError(tr('srpt_error'))
    } finally {
      setLoading(false)
    }
  }, [from, to])

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const statusData = useMemo(() => (
    (report?.by_status ?? []).map((row) => ({
      name: row.status,
      value: row.count,
      fill: STATUS_COLORS[row.status] ?? '#94a3b8',
    }))
  ), [report])

  const paymentData = useMemo(() => (
    (report?.by_payment ?? []).map((row, idx) => ({
      name: row.payment_status,
      value: row.count,
      fill: CHART_COLORS[idx % CHART_COLORS.length],
    }))
  ), [report])

  const summary = report?.summary

  return (
    <div className="page-shell rpt-page" style={{ alignItems: 'flex-start' }}>
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .shipper-report-grid-2 { display: grid; grid-template-columns: 1.25fr 0.95fr; gap: 1rem; }
        .shipper-report-grid-even { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
        .shipper-report-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(165px, 1fr)); gap: 0.85rem; }
        .shipper-report-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; }
        .shipper-report-scroll table { min-width: 760px; }
        @media (max-width: 980px) {
          .shipper-report-grid-2, .shipper-report-grid-even { grid-template-columns: 1fr; }
        }
        @media (max-width: 640px) {
          .shipper-report-scroll table { min-width: 560px; }
        }
      `}</style>

      <div style={{ width: '100%', maxWidth: 1220, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.65rem', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '0.75rem 1rem' }}>
          <LuCalendar size={14} style={{ color: 'var(--clr-muted)', flexShrink: 0 }} />
          {(['From', 'To'] as const).map((label, index) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <label style={{ fontSize: '0.72rem', color: 'var(--clr-muted)', fontWeight: 600 }}>{index === 0 ? tr('rpt_from') : tr('rpt_to')}</label>
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
                style={{ padding: '0.28rem 0.65rem', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: active ? 'rgba(97, 148, 31,0.12)' : 'rgba(255,255,255,0.04)', color: active ? 'var(--clr-accent)' : 'var(--clr-muted)', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
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
            <LuRefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} /> {tr('rpt_apply')}
          </button>
        </div>

        {error && (
          <div style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 10, padding: '0.7rem 1rem', fontSize: '0.8rem', color: '#f87171', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <LuTriangleAlert size={14} /> {error}
          </div>
        )}

        {loading && !report && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4rem', gap: '0.7rem', color: 'var(--clr-muted)' }}>
            <LuRefreshCw size={18} style={{ animation: 'spin 1s linear infinite', color: 'var(--clr-accent)' }} /> {tr('srpt_loading')}
          </div>
        )}

        {report && summary && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', background: 'linear-gradient(135deg, rgba(97, 148, 31,0.08), rgba(167,139,250,0.07))', border: '1px solid rgba(97, 148, 31,0.16)', borderRadius: 16, padding: '1.2rem 1.35rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', minWidth: 0 }}>
                <img src={logoImg} alt="Afri logistics" style={{ height: 46, width: 'auto', objectFit: 'contain', borderRadius: 8 }} />
                <div style={{ minWidth: 0 }}>
                  <p style={{ margin: 0, fontWeight: 800, fontSize: '1rem', color: 'var(--clr-text)' }}>{tr('srpt_general')}</p>
                  <p style={{ margin: '0.15rem 0 0', fontSize: '0.78rem', color: 'var(--clr-muted)' }}>{report.shipper.name || `${report.shipper.first_name} ${report.shipper.last_name}`.trim()}</p>
                  <div style={{ marginTop: '0.45rem', display: 'flex', flexWrap: 'wrap', gap: '0.45rem' }}>
                    {pill(`${fmt(summary.total_orders)} ${tr('srpt_pill_total')}`, '#60a5fa')}
                    {pill(`${fmt(summary.completed_orders)} ${tr('srpt_pill_completed')}`, '#4ade80')}
                    {pill(`${fmt(summary.active_orders)} ${tr('srpt_pill_active')}`, '#fbbf24')}
                  </div>
                </div>
              </div>
              <div style={{ textAlign: 'right', minWidth: 220 }}>
                <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--clr-muted)' }}>{tr('rpt_period')}</p>
                <p style={{ margin: 0, fontWeight: 700, fontSize: '0.84rem', color: 'var(--clr-text)' }}>{fmtDateFull(report.date_range.from)} — {fmtDateFull(report.date_range.to)}</p>
                <p style={{ margin: '0.2rem 0 0', fontSize: '0.7rem', color: 'var(--clr-muted)' }}>{tr('rpt_generated')} {fmtDateTime(report.generated_at)}</p>
              </div>
            </div>

            <div className="shipper-report-kpis">
              <KpiCard label={tr('srpt_kpi_total_orders')} value={fmt(summary.total_orders)} sub={`${fmt(summary.completed_orders)} ${tr('srpt_sub_completed')}`} icon={<LuTruck size={18} />} />
              <KpiCard label={tr('srpt_kpi_active')} value={fmt(summary.active_orders)} sub={`${fmt(summary.cancelled_orders)} ${tr('srpt_sub_cancelled')}`} icon={<LuClock size={18} />} accent="#fbbf24" />
              <KpiCard label={tr('srpt_kpi_spend')} value={fmtCurrency(summary.total_spent)} sub={`${fmtCurrency(summary.avg_order_value)} ${tr('srpt_sub_avg_order')}`} icon={<LuWallet size={18} />} accent="#4ade80" />
              <KpiCard label={tr('srpt_kpi_distance')} value={`${fmt(summary.total_distance_km)} km`} sub={`${summary.avg_delivery_hours.toFixed(1)}${tr('srpt_sub_avg_delivery')}`} icon={<LuRoute size={18} />} accent="#34d399" />
              <KpiCard label={tr('srpt_kpi_payments')} value={`${fmt(summary.paid_orders)} ${tr('srpt_sub_paid')}`} sub={`${fmt(summary.unpaid_orders)} ${tr('srpt_sub_pending')}`} icon={<LuDollarSign size={18} />} accent="#a78bfa" />
              <KpiCard label={tr('srpt_kpi_cross_border')} value={fmt(summary.cross_border_orders)} sub={`${report.feedback.ratings_given} ${tr('srpt_sub_ratings')}`} icon={<LuGlobe size={18} />} accent="#60a5fa" />
            </div>

            <div className="shipper-report-grid-2">
              <ChartCard title={tr('srpt_chart_daily')} height={290}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={report.daily} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="shipOrders" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#61941f" stopOpacity={0.32} />
                        <stop offset="95%" stopColor="#61941f" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="shipSpend" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#4ade80" stopOpacity={0.28} />
                        <stop offset="95%" stopColor="#4ade80" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis dataKey="date" tickFormatter={fmtDate} tick={{ fill: '#9ca3af', fontSize: 10 }} tickLine={false} axisLine={false} />
                    <YAxis yAxisId="left" tick={{ fill: '#9ca3af', fontSize: 10 }} tickLine={false} axisLine={false} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fill: '#9ca3af', fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(value) => `${(Number(value) / 1000).toFixed(0)}k`} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend wrapperStyle={{ fontSize: '0.72rem' }} />
                    <Area yAxisId="left" type="monotone" dataKey="orders" name={tr('srpt_legend_orders')} stroke="#61941f" fill="url(#shipOrders)" strokeWidth={2} dot={false} />
                    <Area yAxisId="left" type="monotone" dataKey="completed" name={tr('srpt_legend_completed')} stroke="#fbbf24" fillOpacity={0} strokeWidth={2} dot={false} />
                    <Area yAxisId="right" type="monotone" dataKey="spent" name={tr('srpt_legend_spent')} stroke="#4ade80" fill="url(#shipSpend)" strokeWidth={2} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title={tr('srpt_chart_status')} height={290}>
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

            <div className="shipper-report-grid-even">
              <ChartCard title={tr('srpt_chart_vehicle')} height={250}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={report.by_vehicle} layout="vertical" margin={{ top: 5, right: 30, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" horizontal={false} />
                    <XAxis type="number" tick={{ fill: '#9ca3af', fontSize: 10 }} tickLine={false} axisLine={false} />
                    <YAxis type="category" dataKey="vehicle_type" tick={{ fill: '#9ca3af', fontSize: 10 }} tickLine={false} axisLine={false} width={85} />
                    <Tooltip formatter={(value: any, name: any) => [name === 'spent' ? fmtCurrency(Number(value)) : fmt(Number(value)), name]} contentStyle={{ background: '#171b28', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, fontSize: '0.74rem' }} />
                    <Legend wrapperStyle={{ fontSize: '0.72rem' }} />
                    <Bar dataKey="orders" name={tr('srpt_legend_orders')} radius={[0, 4, 4, 0]} maxBarSize={16} fill="#60a5fa" />
                    <Bar dataKey="spent" name={tr('srpt_legend_spent')} radius={[0, 4, 4, 0]} maxBarSize={16} fill="#4ade80" />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title={tr('srpt_chart_payment')} height={250}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={paymentData} cx="50%" cy="50%" innerRadius={50} outerRadius={82} paddingAngle={3} dataKey="value">
                      {paymentData.map((entry, index) => <Cell key={entry.name + index} fill={entry.fill} />)}
                    </Pie>
                    <Tooltip formatter={(value: any, name: any) => [fmt(Number(value)), name]} contentStyle={{ background: '#171b28', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, fontSize: '0.74rem' }} />
                    <Legend iconSize={9} wrapperStyle={{ fontSize: '0.72rem' }} />
                  </PieChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>

            <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 14, overflow: 'hidden' }}>
              <div style={{ padding: '1rem 1.1rem', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <LuChartColumnBig size={15} style={{ color: 'var(--clr-accent)' }} />
                <p style={{ margin: 0, fontWeight: 700, fontSize: '0.83rem', color: 'var(--clr-text)' }}>{tr('srpt_recent_orders')}</p>
              </div>
              <div className="shipper-report-scroll">
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                      {[tr('srpt_col_ref'), tr('srpt_col_status'), tr('srpt_col_payment'), tr('srpt_col_pickup'), tr('srpt_col_delivery'), tr('srpt_col_driver'), tr('srpt_col_amount'), tr('srpt_col_created')].map((label) => (
                        <th key={label} style={{ padding: '0.7rem 1rem', textAlign: 'left', color: 'var(--clr-muted)', fontWeight: 600, fontSize: '0.7rem', letterSpacing: '0.05em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {report.recent_orders.length > 0 ? report.recent_orders.map((order, index) => (
                      <tr key={order.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: index % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)' }}>
                        <td style={{ padding: '0.7rem 1rem', fontWeight: 700, color: 'var(--clr-text)' }}>{order.reference_code}</td>
                        <td style={{ padding: '0.7rem 1rem' }}>{pill(order.status, STATUS_COLORS[order.status] ?? '#94a3b8')}</td>
                        <td style={{ padding: '0.7rem 1rem' }}>{pill(order.payment_status, order.payment_status === 'SETTLED' ? '#4ade80' : order.payment_status === 'ESCROWED' ? '#60a5fa' : '#fbbf24')}</td>
                        <td style={{ padding: '0.7rem 1rem', maxWidth: 180 }}><span style={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{order.pickup_address || '—'}</span></td>
                        <td style={{ padding: '0.7rem 1rem', maxWidth: 180 }}><span style={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{order.delivery_address || '—'}</span></td>
                        <td style={{ padding: '0.7rem 1rem', color: 'var(--clr-muted)' }}>{order.driver_name || tr('srpt_unassigned')}</td>
                        <td style={{ padding: '0.7rem 1rem', color: '#4ade80', fontWeight: 700 }}>{fmtCurrency(order.amount)}</td>
                        <td style={{ padding: '0.7rem 1rem', color: 'var(--clr-muted)' }}>{fmtDateTime(order.created_at)}</td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan={8} style={{ padding: '1rem', textAlign: 'center', color: 'var(--clr-muted)' }}>{tr('srpt_no_orders')}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="shipper-report-grid-even">
              <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 14, padding: '1.1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.9rem' }}>
                  <LuRoute size={15} style={{ color: 'var(--clr-accent)' }} />
                  <p style={{ margin: 0, fontWeight: 700, fontSize: '0.83rem', color: 'var(--clr-text)' }}>{tr('srpt_top_routes')}</p>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                  {report.top_routes.length > 0 ? report.top_routes.map((route, index) => (
                    <div key={route.from_city + route.to_city + index} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.6rem', padding: '0.7rem 0.8rem', borderRadius: 10, border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.02)' }}>
                      <div style={{ minWidth: 0 }}>
                        <p style={{ margin: 0, color: 'var(--clr-text)', fontSize: '0.8rem', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{`${route.from_city || 'Unknown'} -> ${route.to_city || 'Unknown'}`}</p>
                        <p style={{ margin: '0.2rem 0 0', color: 'var(--clr-muted)', fontSize: '0.7rem' }}>{route.avg_km.toFixed(1)} {tr('srpt_km_avg')}</p>
                      </div>
                      {pill(`${route.count}`, '#60a5fa')}
                    </div>
                  )) : (
                    <p style={{ margin: 0, color: 'var(--clr-muted)', fontSize: '0.8rem' }}>{tr('srpt_no_routes')}</p>
                  )}
                </div>
              </div>

              <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 14, padding: '1.1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.9rem' }}>
                  <LuCircleCheck size={15} style={{ color: '#4ade80' }} />
                  <p style={{ margin: 0, fontWeight: 700, fontSize: '0.83rem', color: 'var(--clr-text)' }}>{tr('srpt_activity')}</p>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div style={{ padding: '0.8rem', borderRadius: 10, border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.02)' }}>
                    <p style={{ margin: 0, fontSize: '0.68rem', color: 'var(--clr-muted)', textTransform: 'uppercase', fontWeight: 700 }}>{tr('srpt_ratings_given')}</p>
                    <p style={{ margin: '0.25rem 0 0', color: 'var(--clr-text)', fontSize: '1.1rem', fontWeight: 800 }}>{fmt(report.feedback.ratings_given)}</p>
                  </div>
                  <div style={{ padding: '0.8rem', borderRadius: 10, border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.02)' }}>
                    <p style={{ margin: 0, fontSize: '0.68rem', color: 'var(--clr-muted)', textTransform: 'uppercase', fontWeight: 700 }}>{tr('srpt_avg_stars')}</p>
                    <p style={{ margin: '0.25rem 0 0', color: 'var(--clr-text)', fontSize: '1.1rem', fontWeight: 800 }}>{report.feedback.avg_stars_given.toFixed(2)}</p>
                  </div>
                  <div style={{ gridColumn: '1 / -1', padding: '0.8rem', borderRadius: 10, border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.02)' }}>
                    <p style={{ margin: 0, fontSize: '0.68rem', color: 'var(--clr-muted)', textTransform: 'uppercase', fontWeight: 700 }}>{tr('srpt_contact')}</p>
                    <p style={{ margin: '0.22rem 0 0', color: 'var(--clr-text)', fontSize: '0.8rem', fontWeight: 600 }}>{report.shipper.phone_number || '—'} {report.shipper.email ? `| ${report.shipper.email}` : ''}</p>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}