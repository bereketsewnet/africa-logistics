import { useState, useEffect, useCallback, useRef } from 'react'
import apiClient from '../lib/apiClient'
import logoImg from '../assets/logo.webp'
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar,
  PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend,
} from 'recharts'
import {
  LuListOrdered, LuFileText, LuTruck, LuGlobe,
  LuDownload, LuRefreshCw, LuCalendar, LuTrendingUp,
  LuTrendingDown, LuPackage, LuCircleCheck, LuCircleX,
  LuClock, LuUsers, LuMapPin, LuChartColumnBig, LuActivity,
  LuTriangleAlert, LuWallet, LuBanknote, LuArrowDownLeft,
  LuArrowUpRight, LuReceipt, LuCoins, LuShieldCheck, LuUser,
  LuStar, LuThumbsUp, LuBadgeCheck, LuBan, LuCircleDot,
  LuRoute, LuContainer, LuArrowRight, LuWeight, LuTimer,
} from 'react-icons/lu'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'
import { useLanguage } from '../context/LanguageContext'

// ─── Types ────────────────────────────────────────────────────────────────────

interface OrderReport {
  generated_at: string
  date_range: { from: string; to: string }
  summary: {
    total_orders: number
    normal_orders: number
    guest_orders: number
    total_revenue: number
    avg_order_value: number
    active_drivers: number
    total_distance_km: number
    completed_orders: number
    cancelled_orders: number
    failed_orders: number
    active_orders: number
  }
  comparison: { prev_total_orders: number; prev_total_revenue: number }
  by_status: Record<string, number>
  by_payment_status: Record<string, number>
  daily_trend: { date: string; orders: number; normal_orders: number; guest_orders: number; revenue: number; completed: number }[]
  top_routes: { pickup: string; delivery: string; count: number; total_revenue: number; avg_distance_km: number }[]
  cargo_breakdown: { cargo_type: string; count: number; revenue: number }[]
  delivery_time: { avg_hours: number | null; min_hours: number | null; max_hours: number | null }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number) => new Intl.NumberFormat('en-ET', { maximumFractionDigits: 0 }).format(n)
const fmtCurrency = (n: number) => 'ETB ' + new Intl.NumberFormat('en-ET', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
const fmtDate = (s: string) => new Date(s).toLocaleDateString('en-ET', { month: 'short', day: 'numeric' })
const fmtDateFull = (s: string) => new Date(s).toLocaleDateString('en-ET', { year: 'numeric', month: 'long', day: 'numeric' })

const STATUS_COLORS: Record<string, string> = {
  PENDING: '#fbbf24', ASSIGNED: '#60a5fa', EN_ROUTE: '#34d399', AT_PICKUP: '#a78bfa',
  IN_TRANSIT: '#38bdf8', AT_BORDER: '#f97316', IN_CUSTOMS: '#fb923c',
  CUSTOMS_CLEARED: '#4ade80', DELIVERED: '#22c55e', COMPLETED: '#16a34a',
  CANCELLED: '#f87171', FAILED: '#ef4444',
}
const CHART_COLORS = ['#61941f', '#a78bfa', '#34d399', '#fbbf24', '#f97316', '#f87171', '#60a5fa']

function pct(val: number, prev: number) {
  if (!prev) return null
  return (((val - prev) / prev) * 100).toFixed(1)
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

interface KpiProps {
  label: string
  value: string
  sub?: string
  change?: string | null
  icon: React.ReactNode
  accent?: string
}

function KpiCard({ label, value, sub, change, icon, accent = 'var(--clr-accent)' }: KpiProps) {
  const up = change ? parseFloat(change) > 0 : null
  return (
    <div className="rpt-kpi-card" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 14, padding: '1.1rem 1.2rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 0, right: 0, width: 80, height: 80, background: `radial-gradient(circle at top right, ${accent}18, transparent 70%)`, pointerEvents: 'none' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--clr-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
        <span style={{ color: accent, opacity: 0.85, display: 'flex' }}>{icon}</span>
      </div>
      <div style={{ fontSize: '1.55rem', fontWeight: 800, color: 'var(--clr-text)', lineHeight: 1 }}>{value}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
        {change != null && (
          <span style={{ fontSize: '0.68rem', fontWeight: 700, color: up ? '#4ade80' : '#f87171', display: 'flex', alignItems: 'center', gap: '0.15rem' }}>
            {up ? <LuTrendingUp size={11} /> : <LuTrendingDown size={11} />}
            {Math.abs(parseFloat(change))}%
          </span>
        )}
        {sub && <span style={{ fontSize: '0.68rem', color: 'var(--clr-muted)' }}>{sub}</span>}
      </div>
    </div>
  )
}

// ─── Section Wrapper ──────────────────────────────────────────────────────────

function ChartCard({ title, children, height = 280 }: { title: string; children: React.ReactNode; height?: number }) {
  return (
    <div className="rpt-chart-card" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 14, padding: '1.2rem' }}>
      <p className="rpt-chart-title" style={{ margin: '0 0 1rem', fontWeight: 700, fontSize: '0.83rem', color: 'var(--clr-text)' }}>{title}</p>
      <div className="rpt-chart-body" style={{ height, minWidth: 0, overflow: 'hidden' }}>{children}</div>
    </div>
  )
}

// ─── Custom Tooltip ───────────────────────────────────────────────────────────

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: '#1a1f2e', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: '0.65rem 0.9rem', fontSize: '0.74rem' }}>
      <p style={{ margin: '0 0 0.4rem', fontWeight: 700, color: 'var(--clr-muted)' }}>{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ margin: '0.15rem 0', color: p.color, fontWeight: 600 }}>
          {p.name}: <span style={{ color: '#fff' }}>{typeof p.value === 'number' && p.dataKey === 'revenue' ? fmtCurrency(p.value) : fmt(p.value)}</span>
        </p>
      ))}
    </div>
  )
}

// ─── Order Report Page ────────────────────────────────────────────────────────

function OrderReportPage() {
  const { t: tr } = useLanguage()
  const today = new Date()
  const defaultTo = today.toISOString().slice(0, 10)
  const defaultFrom = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  const [from, setFrom] = useState(defaultFrom)
  const [to, setTo] = useState(defaultTo)
  const [report, setReport] = useState<OrderReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [downloading, setDownloading] = useState(false)
  const reportRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async (f = from, t = to) => {
    setLoading(true)
    setError('')
    try {
      const { data } = await apiClient.get('/admin/reports/orders', { params: { from: f, to: t } })
      setReport(data.report)
    } catch {
      setError(tr('arpt_ord_error'))
    } finally {
      setLoading(false)
    }
  }, [from, to])

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleDownload = async () => {
    if (!reportRef.current) return
    setDownloading(true)
    try {
      const canvas = await html2canvas(reportRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#0f1220',
        logging: false,
      })
      const imgData = canvas.toDataURL('image/png')
      const pdf = new jsPDF('p', 'mm', 'a4')
      const pageWidth = pdf.internal.pageSize.getWidth()
      const pageHeight = pdf.internal.pageSize.getHeight()
      const imgWidth = pageWidth
      const imgHeight = (canvas.height * pageWidth) / canvas.width
      let yPos = 0
      let remaining = imgHeight

      while (remaining > 0) {
        pdf.addImage(imgData, 'PNG', 0, -yPos, imgWidth, imgHeight)
        remaining -= pageHeight
        yPos += pageHeight
        if (remaining > 0) pdf.addPage()
      }

      const fileName = `Order_Report_${from}_to_${to}.pdf`
      pdf.save(fileName)
    } catch {
      // silent
    } finally {
      setDownloading(false)
    }
  }

  const s = report?.summary
  const changeOrders = s && report?.comparison ? pct(s.total_orders, report.comparison.prev_total_orders) : null
  const changeRevenue = s && report?.comparison ? pct(s.total_revenue, report.comparison.prev_total_revenue) : null

  const statusData = report
    ? Object.entries(report.by_status).map(([status, count]) => ({ name: status, value: count, fill: STATUS_COLORS[status] ?? '#888' }))
    : []

  const paymentData = report
    ? Object.entries(report.by_payment_status).map(([status, count]) => ({ name: status, value: count }))
    : []

  return (
    <div className="rpt-page" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', width: '100%' }}>
      {/* ─ Controls bar ─ */}
      <div className="rpt-controls" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.65rem', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '0.7rem 1rem' }}>
        <LuCalendar size={14} style={{ color: 'var(--clr-muted)', flexShrink: 0 }} />
        <div className="rpt-controls-field" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flex: '0 0 auto' }}>
          <label style={{ fontSize: '0.72rem', color: 'var(--clr-muted)', fontWeight: 600 }}>{tr('rpt_from')}</label>
          <input type="date" value={from} max={to} onChange={e => setFrom(e.target.value)}
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '0.28rem 0.55rem', color: 'var(--clr-text)', fontSize: '0.78rem', fontFamily: 'inherit', colorScheme: 'dark' }} />
        </div>
        <div className="rpt-controls-field" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flex: '0 0 auto' }}>
          <label style={{ fontSize: '0.72rem', color: 'var(--clr-muted)', fontWeight: 600 }}>{tr('rpt_to')}</label>
          <input type="date" value={to} min={from} onChange={e => setTo(e.target.value)}
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '0.28rem 0.55rem', color: 'var(--clr-text)', fontSize: '0.78rem', fontFamily: 'inherit', colorScheme: 'dark' }} />
        </div>

        {/* Quick presets */}
        {[{ label: '7D', days: 7 }, { label: '30D', days: 30 }, { label: '90D', days: 90 }, { label: '1Y', days: 365 }].map(p => {
          const f = new Date(today.getTime() - p.days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
          const active = from === f && to === defaultTo
          return (
            <button key={p.label} onClick={() => { setFrom(f); setTo(defaultTo); load(f, defaultTo) }}
              style={{ padding: '0.28rem 0.65rem', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: active ? 'rgba(97, 148, 31,0.12)' : 'rgba(255,255,255,0.04)', color: active ? 'var(--clr-accent)' : 'var(--clr-muted)', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
              {p.label}
            </button>
          )
        })}

        <div className="rpt-controls-spacer" style={{ flex: 1 }} />
        <button onClick={() => load()} disabled={loading}
          style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.38rem 0.85rem', borderRadius: 9, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.06)', color: 'var(--clr-text)', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
          <LuRefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} /> {tr('rpt_apply')}
        </button>
        <button onClick={handleDownload} disabled={downloading || !report}
          style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.38rem 0.9rem', borderRadius: 9, border: 'none', background: 'var(--clr-accent)', color: '#000', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: (downloading || !report) ? 0.5 : 1 }}>
          <LuDownload size={13} /> {downloading ? tr('arpt_generating') : tr('arpt_download_pdf')}
        </button>
      </div>

      {error && (
        <div style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 10, padding: '0.7rem 1rem', fontSize: '0.8rem', color: '#f87171', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <LuTriangleAlert size={14} /> {error}
        </div>
      )}

      {loading && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4rem', gap: '0.75rem', color: 'var(--clr-muted)', fontSize: '0.85rem' }}>
          <LuRefreshCw size={18} style={{ animation: 'spin 1s linear infinite', color: 'var(--clr-accent)' }} /> {tr('arpt_ord_loading')}
        </div>
      )}

      {/* ─ Printable Report Area ─ */}
      {report && !loading && (
        <div ref={reportRef} className="rpt-page" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', width: '100%' }}>
          {/* Report Header */}
          <div className="rpt-hdr rpt-report-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'linear-gradient(135deg, rgba(97, 148, 31,0.08), rgba(167,139,250,0.06))', border: '1px solid rgba(97, 148, 31,0.15)', borderRadius: 14, padding: '1.2rem 1.5rem' }}>
            <div className="rpt-report-brand" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <img src={logoImg} alt="Afri logistics" style={{ height: 44, width: 'auto', objectFit: 'contain', borderRadius: 8 }} />
              <div>
                <p style={{ margin: 0, fontWeight: 800, fontSize: '1rem', color: 'var(--clr-text)' }}>Afri logistics</p>
                <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--clr-muted)' }}>{tr('arpt_ord_subtitle')}</p>
              </div>
            </div>
            <div className="rpt-report-meta" style={{ textAlign: 'right' }}>
              <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--clr-muted)' }}>{tr('rpt_period')}</p>
              <p style={{ margin: 0, fontWeight: 700, fontSize: '0.85rem', color: 'var(--clr-text)' }}>
                {fmtDateFull(report.date_range.from)} — {fmtDateFull(report.date_range.to)}
              </p>
              <p style={{ margin: '0.2rem 0 0', fontSize: '0.7rem', color: 'var(--clr-muted)' }}>
                {tr('rpt_generated')}: {new Date(report.generated_at).toLocaleString('en-ET')}
              </p>
            </div>
          </div>

          {/* ─ KPI Row 1 ─ */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: '0.85rem' }}>
            <KpiCard label={tr('arpt_ord_kpi_total')} value={fmt(s!.total_orders)} change={changeOrders} sub={tr('arpt_sub_vs_prev')} icon={<LuListOrdered size={18} />} />
            <KpiCard label={tr('arpt_ord_kpi_normal')} value={fmt(s!.normal_orders)} sub={tr('arpt_sub_reg_shippers')} icon={<LuPackage size={18} />} accent="#60a5fa" />
            <KpiCard label={tr('arpt_ord_kpi_guest')} value={fmt(s!.guest_orders)} sub={tr('arpt_sub_walk_in')} icon={<LuUsers size={18} />} accent="#a78bfa" />
            <KpiCard label={tr('arpt_ord_kpi_completed')} value={fmt(s!.completed_orders)} icon={<LuCircleCheck size={18} />} accent="#4ade80"
              sub={s!.total_orders ? `${((s!.completed_orders / s!.total_orders) * 100).toFixed(1)}% rate` : undefined} />
            <KpiCard label={tr('arpt_ord_kpi_active')} value={fmt(s!.active_orders)} icon={<LuActivity size={18} />} accent="#38bdf8" />
            <KpiCard label={tr('arpt_ord_kpi_cancelled')} value={fmt(s!.cancelled_orders)} icon={<LuCircleX size={18} />} accent="#f87171"
              sub={s!.total_orders ? `${((s!.cancelled_orders / s!.total_orders) * 100).toFixed(1)}% rate` : undefined} />
            <KpiCard label={tr('arpt_ord_kpi_revenue')} value={fmtCurrency(s!.total_revenue)} change={changeRevenue} sub={tr('arpt_sub_vs_prev')} icon={<LuChartColumnBig size={18} />} accent="#fbbf24" />
            <KpiCard label={tr('arpt_ord_kpi_avg_val')} value={fmtCurrency(s!.avg_order_value)} icon={<LuTrendingUp size={18} />} accent="#34d399" />
            <KpiCard label={tr('arpt_ord_kpi_avg_del')} value={report.delivery_time.avg_hours != null ? `${report.delivery_time.avg_hours}h` : 'N/A'} sub={tr('arpt_sub_hours_order')} icon={<LuClock size={18} />} accent="#fb923c" />
            <KpiCard label={tr('arpt_ord_kpi_drivers')} value={fmt(s!.active_drivers)} sub={tr('arpt_sub_in_period')} icon={<LuTruck size={18} />} accent="#818cf8" />
          </div>

          {/* ─ Charts Row 1: Daily Trend ─ */}
          <ChartCard title={tr('arpt_ord_chart_trend')} height={280}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={report.daily_trend} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradOrders" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#61941f" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#61941f" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#fbbf24" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#fbbf24" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="date" tickFormatter={fmtDate} tick={{ fill: '#9ca3af', fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis yAxisId="orders" tick={{ fill: '#9ca3af', fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis yAxisId="revenue" orientation="right" tick={{ fill: '#9ca3af', fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: '0.72rem' }} />
                <Area yAxisId="orders" type="monotone" dataKey="orders" name="Orders" stroke="#61941f" fill="url(#gradOrders)" strokeWidth={2} dot={false} />
                <Area yAxisId="revenue" type="monotone" dataKey="revenue" name="Revenue (ETB)" stroke="#fbbf24" fill="url(#gradRevenue)" strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* ─ Charts Row 2: Normal vs Guest + Status Pie ─ */}
          <div className="rpt-grid-2">
            <ChartCard title={tr('arpt_ord_chart_ng')} height={240}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={report.daily_trend} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="date" tickFormatter={fmtDate} tick={{ fill: '#9ca3af', fontSize: 9 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fill: '#9ca3af', fontSize: 9 }} tickLine={false} axisLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ fontSize: '0.7rem' }} />
                  <Bar dataKey="normal_orders" name="Normal" fill="#60a5fa" radius={[3, 3, 0, 0]} maxBarSize={20} />
                  <Bar dataKey="guest_orders" name="Guest" fill="#a78bfa" radius={[3, 3, 0, 0]} maxBarSize={20} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title={tr('arpt_ord_chart_status')} height={240}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={statusData} cx="40%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={2} dataKey="value">
                    {statusData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                  </Pie>
                  <Tooltip formatter={(value: any, name: any) => [fmt(Number(value)), name]}
                    contentStyle={{ background: '#1a1f2e', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, fontSize: '0.74rem' }} />
                  <Legend iconSize={9} wrapperStyle={{ fontSize: '0.7rem', paddingLeft: '0.5rem' }} />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          {/* ─ Charts Row 3: Revenue Bar + Payment Status ─ */}
          <div className="rpt-grid-21">
            <ChartCard title={tr('arpt_ord_chart_daily')} height={240}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={report.daily_trend} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="date" tickFormatter={fmtDate} tick={{ fill: '#9ca3af', fontSize: 9 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fill: '#9ca3af', fontSize: 9 }} tickLine={false} axisLine={false} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ fontSize: '0.7rem' }} />
                  <Bar dataKey="revenue" name="Revenue" radius={[4, 4, 0, 0]} maxBarSize={24}>
                    {report.daily_trend.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} fillOpacity={0.85} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title={tr('arpt_ord_chart_pay')} height={240}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={paymentData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
                    {paymentData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: any, n: any) => [fmt(Number(v)), n]}
                    contentStyle={{ background: '#1a1f2e', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, fontSize: '0.74rem' }} />
                  <Legend iconSize={9} wrapperStyle={{ fontSize: '0.7rem' }} />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          {/* ─ Cargo Breakdown ─ */}
          {report.cargo_breakdown.length > 0 && (
            <ChartCard title={tr('arpt_ord_chart_cargo')} height={220}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={report.cargo_breakdown} layout="vertical" margin={{ top: 0, right: 60, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" horizontal={false} />
                  <XAxis type="number" tick={{ fill: '#9ca3af', fontSize: 9 }} tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="cargo_type" tick={{ fill: '#9ca3af', fontSize: 10 }} tickLine={false} axisLine={false} width={90} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="count" name="Orders" radius={[0, 4, 4, 0]} maxBarSize={18}>
                    {report.cargo_breakdown.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Bar>
                  <Bar dataKey="revenue" name="Revenue" radius={[0, 4, 4, 0]} maxBarSize={18} fill="#fbbf24" fillOpacity={0.7} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          )}

          {/* ─ Status Summary Table ─ */}
          <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 14, overflow: 'hidden' }}>
            <div style={{ padding: '1rem 1.2rem', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <LuChartColumnBig size={15} style={{ color: 'var(--clr-accent)' }} />
              <p style={{ margin: 0, fontWeight: 700, fontSize: '0.83rem', color: 'var(--clr-text)' }}>{tr('arpt_ord_tbl_status')}</p>
            </div>
            <div className="rpt-table-scroll" style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                    {[tr('arpt_col_status'), tr('arpt_col_count'), tr('arpt_col_pct_total'), tr('arpt_col_share_bar')].map(h => (
                      <th key={h} style={{ padding: '0.65rem 1.1rem', textAlign: 'left', color: 'var(--clr-muted)', fontWeight: 600, fontSize: '0.7rem', letterSpacing: '0.05em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(report.by_status).sort((a, b) => b[1] - a[1]).map(([status, count], i) => {
                    const pctVal = s!.total_orders ? ((count / s!.total_orders) * 100).toFixed(1) : '0'
                    return (
                      <tr key={status} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)' }}>
                        <td style={{ padding: '0.6rem 1.1rem', fontWeight: 600 }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: STATUS_COLORS[status] ?? '#888', flexShrink: 0 }} />
                            {status}
                          </span>
                        </td>
                        <td style={{ padding: '0.6rem 1.1rem', color: 'var(--clr-text)', fontWeight: 700 }}>{fmt(count)}</td>
                        <td style={{ padding: '0.6rem 1.1rem', color: 'var(--clr-muted)' }}>{pctVal}%</td>
                        <td style={{ padding: '0.6rem 1.1rem', minWidth: 120 }}>
                          <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${pctVal}%`, background: STATUS_COLORS[status] ?? '#888', borderRadius: 3, transition: 'width 0.6s ease' }} />
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* ─ Top Routes Table ─ */}
          {report.top_routes.length > 0 && (
            <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 14, overflow: 'hidden' }}>
              <div style={{ padding: '1rem 1.2rem', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <LuMapPin size={15} style={{ color: 'var(--clr-accent)' }} />
                <p style={{ margin: 0, fontWeight: 700, fontSize: '0.83rem', color: 'var(--clr-text)' }}>{tr('arpt_ord_tbl_routes')}</p>
              </div>
              <div className="rpt-table-scroll" style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                      {['#', tr('arpt_col_pickup'), tr('arpt_col_delivery'), tr('arpt_col_orders'), tr('arpt_col_total_revenue'), tr('arpt_col_avg_distance')].map(h => (
                        <th key={h} style={{ padding: '0.65rem 1.1rem', textAlign: 'left', color: 'var(--clr-muted)', fontWeight: 600, fontSize: '0.7rem', letterSpacing: '0.05em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {report.top_routes.map((r, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)' }}>
                        <td style={{ padding: '0.6rem 1.1rem', color: 'var(--clr-muted)', fontWeight: 700 }}>#{i + 1}</td>
                        <td style={{ padding: '0.6rem 1.1rem', maxWidth: 180 }}>
                          <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--clr-text)', fontSize: '0.76rem' }}>{r.pickup ?? '—'}</span>
                        </td>
                        <td style={{ padding: '0.6rem 1.1rem', maxWidth: 180 }}>
                          <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--clr-text)', fontSize: '0.76rem' }}>{r.delivery ?? '—'}</span>
                        </td>
                        <td style={{ padding: '0.6rem 1.1rem', fontWeight: 700, color: 'var(--clr-accent)' }}>{fmt(r.count)}</td>
                        <td style={{ padding: '0.6rem 1.1rem', color: '#fbbf24', fontWeight: 600 }}>{fmtCurrency(r.total_revenue)}</td>
                        <td style={{ padding: '0.6rem 1.1rem', color: 'var(--clr-muted)' }}>{r.avg_distance_km} km</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ─ Delivery Time Summary ─ */}
          {report.delivery_time.avg_hours != null && (
            <div className="rpt-grid-3">
              <KpiCard label={tr('arpt_ord_kpi_avg_del_time')} value={`${report.delivery_time.avg_hours}h`} sub={tr('arpt_sub_hours_order')} icon={<LuClock size={18} />} accent="#fb923c" />
              <KpiCard label={tr('arpt_ord_kpi_fastest')} value={`${report.delivery_time.min_hours}h`} sub={tr('arpt_sub_min_hours')} icon={<LuTrendingUp size={18} />} accent="#4ade80" />
              <KpiCard label={tr('arpt_ord_kpi_slowest')} value={`${report.delivery_time.max_hours}h`} sub={tr('arpt_sub_max_hours')} icon={<LuTrendingDown size={18} />} accent="#f87171" />
            </div>
          )}

          {/* ─ Report Footer ─ */}
          <div className="rpt-footer-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1rem', borderTop: '1px solid rgba(255,255,255,0.07)', fontSize: '0.68rem', color: 'var(--clr-muted)' }}>
            <span>{tr('arpt_ord_footer')}</span>
            <span>Generated on {new Date(report.generated_at).toLocaleString('en-ET')}</span>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

// ─── Finance / Drivers / Logistics placeholders ───────────────────────────────

// ─── Finance Report Types ─────────────────────────────────────────────────────

interface FinanceReport {
  generated_at: string
  date_range: { from: string; to: string }
  revenue: {
    gross_revenue: number; settled_revenue: number; escrowed_revenue: number
    unpaid_revenue: number; total_orders: number; paid_orders: number
    avg_order_revenue: number; prev_gross_revenue: number
  }
  daily_revenue: { date: string; revenue: number; settled: number; escrowed: number; orders: number }[]
  revenue_by_vehicle: { vehicle_type: string; orders: number; revenue: number }[]
  manual_payments: {
    total: number; pending_count: number; approved_count: number; rejected_count: number
    approved_amount: number; pending_amount: number; total_deposits: number
    total_withdrawals: number; total_refunds: number; total_adjustments: number
    prev_approved_amount: number
  }
  manual_payments_daily: { date: string; count: number; approved_amount: number; pending_amount: number }[]
  wallet_by_type: { transaction_type: string; count: number; total_amount: number }[]
  wallet_daily: { date: string; credits: number; debits: number; transactions: number }[]
  top_shippers: { name: string; email: string; phone: string; orders: number; revenue: number }[]
  invoices: {
    total_invoices: number; total_billed: number; total_driver_payout: number
    total_commission: number; total_tips: number; total_extra_charges: number; avg_invoice_amount: number
  }
}

const WALLET_TYPE_COLORS: Record<string, string> = {
  CREDIT: '#4ade80', DEBIT: '#f87171', COMMISSION: '#fbbf24',
  TIP: '#a78bfa', REFUND: '#38bdf8', BONUS: '#34d399', ADMIN_ADJUSTMENT: '#f97316',
}

// ─── Finance Report Page ──────────────────────────────────────────────────────

function FinanceReportPage() {
  const { t: tr } = useLanguage()
  const today = new Date()
  const defaultTo = today.toISOString().slice(0, 10)
  const defaultFrom = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  const [from, setFrom] = useState(defaultFrom)
  const [to, setTo] = useState(defaultTo)
  const [report, setReport] = useState<FinanceReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [downloading, setDownloading] = useState(false)
  const reportRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async (f = from, t = to) => {
    setLoading(true); setError('')
    try {
      const { data } = await apiClient.get('/admin/reports/finance', { params: { from: f, to: t } })
      setReport(data.report)
    } catch { setError(tr('arpt_fin_error')) }
    finally { setLoading(false) }
  }, [from, to])

  useEffect(() => { load() }, []) // eslint-disable-line

  const handleDownload = async () => {
    if (!reportRef.current) return
    setDownloading(true)
    try {
      const canvas = await html2canvas(reportRef.current, { scale: 2, useCORS: true, backgroundColor: '#0f1220', logging: false })
      const imgData = canvas.toDataURL('image/png')
      const pdf = new jsPDF('p', 'mm', 'a4')
      const pw = pdf.internal.pageSize.getWidth()
      const ph = pdf.internal.pageSize.getHeight()
      const ih = (canvas.height * pw) / canvas.width
      let yPos = 0; let rem = ih
      while (rem > 0) {
        pdf.addImage(imgData, 'PNG', 0, -yPos, pw, ih)
        rem -= ph; yPos += ph
        if (rem > 0) pdf.addPage()
      }
      pdf.save(`Finance_Report_${from}_to_${to}.pdf`)
    } catch { /**/ } finally { setDownloading(false) }
  }

  const r = report?.revenue
  const mp = report?.manual_payments
  const inv = report?.invoices
  const changeRev = r ? pct(r.gross_revenue, r.prev_gross_revenue) : null
  const changePay = mp ? pct(mp.approved_amount, mp.prev_approved_amount) : null

  const walletPieData = report?.wallet_by_type.map(w => ({
    name: w.transaction_type, value: w.total_amount, fill: WALLET_TYPE_COLORS[w.transaction_type] ?? '#888'
  })) ?? []

  const vehicleData = report?.revenue_by_vehicle ?? []

  return (
    <div className="rpt-page" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', width: '100%' }}>

      {/* Controls bar */}
      <div className="rpt-controls" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.65rem', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '0.7rem 1rem' }}>
        <LuCalendar size={14} style={{ color: 'var(--clr-muted)', flexShrink: 0 }} />
        {([tr('rpt_from'), tr('rpt_to')]).map((lbl, i) => (
          <div key={lbl} className="rpt-controls-field" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <label style={{ fontSize: '0.72rem', color: 'var(--clr-muted)', fontWeight: 600 }}>{lbl}</label>
            <input type="date" value={i === 0 ? from : to} max={i === 0 ? to : undefined} min={i === 1 ? from : undefined}
              onChange={e => i === 0 ? setFrom(e.target.value) : setTo(e.target.value)}
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '0.28rem 0.55rem', color: 'var(--clr-text)', fontSize: '0.78rem', fontFamily: 'inherit', colorScheme: 'dark' }} />
          </div>
        ))}
        {[{ label: '7D', days: 7 }, { label: '30D', days: 30 }, { label: '90D', days: 90 }, { label: '1Y', days: 365 }].map(p => {
          const f = new Date(today.getTime() - p.days * 86400000).toISOString().slice(0, 10)
          const active = from === f && to === defaultTo
          return (
            <button key={p.label} onClick={() => { setFrom(f); setTo(defaultTo); load(f, defaultTo) }}
              style={{ padding: '0.28rem 0.65rem', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: active ? 'rgba(97, 148, 31,0.12)' : 'rgba(255,255,255,0.04)', color: active ? 'var(--clr-accent)' : 'var(--clr-muted)', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
              {p.label}
            </button>
          )
        })}
        <div className="rpt-controls-spacer" style={{ flex: 1 }} />
        <button onClick={() => load()} disabled={loading}
          style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.38rem 0.85rem', borderRadius: 9, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.06)', color: 'var(--clr-text)', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
          <LuRefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} /> {tr('rpt_apply')}
        </button>
        <button onClick={handleDownload} disabled={downloading || !report}
          style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.38rem 0.9rem', borderRadius: 9, border: 'none', background: 'var(--clr-accent)', color: '#000', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: (downloading || !report) ? 0.5 : 1 }}>
          <LuDownload size={13} /> {downloading ? tr('arpt_generating') : tr('arpt_download_pdf')}
        </button>
      </div>

      {error && (
        <div style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 10, padding: '0.7rem 1rem', fontSize: '0.8rem', color: '#f87171', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <LuTriangleAlert size={14} /> {error}
        </div>
      )}

      {loading && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4rem', gap: '0.75rem', color: 'var(--clr-muted)', fontSize: '0.85rem' }}>
          <LuRefreshCw size={18} style={{ animation: 'spin 1s linear infinite', color: 'var(--clr-accent)' }} /> {tr('arpt_fin_loading')}
        </div>
      )}

      {report && !loading && (
        <div ref={reportRef} className="rpt-page" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', width: '100%' }}>

          {/* Report header */}
          <div className="rpt-hdr rpt-report-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'linear-gradient(135deg, rgba(251,191,36,0.08), rgba(167,139,250,0.06))', border: '1px solid rgba(251,191,36,0.2)', borderRadius: 14, padding: '1.2rem 1.5rem' }}>
            <div className="rpt-report-brand" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <img src={logoImg} alt="Afri logistics" style={{ height: 44, width: 'auto', objectFit: 'contain', borderRadius: 8 }} />
              <div>
                <p style={{ margin: 0, fontWeight: 800, fontSize: '1rem', color: 'var(--clr-text)' }}>Afri logistics</p>
                <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--clr-muted)' }}>{tr('arpt_fin_subtitle')}</p>
              </div>
            </div>
            <div className="rpt-report-meta" style={{ textAlign: 'right' }}>
              <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--clr-muted)' }}>{tr('rpt_period')}</p>
              <p style={{ margin: 0, fontWeight: 700, fontSize: '0.85rem', color: 'var(--clr-text)' }}>
                {fmtDateFull(report.date_range.from)} — {fmtDateFull(report.date_range.to)}
              </p>
              <p style={{ margin: '0.2rem 0 0', fontSize: '0.7rem', color: 'var(--clr-muted)' }}>
                {tr('rpt_generated')}: {new Date(report.generated_at).toLocaleString('en-ET')}
              </p>
            </div>
          </div>

          {/* ─ Revenue KPIs ─ */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(165px, 1fr))', gap: '0.85rem' }}>
            <KpiCard label={tr('arpt_fin_kpi_gross')} value={fmtCurrency(r!.gross_revenue)} change={changeRev} sub={tr('arpt_sub_vs_prev')} icon={<LuChartColumnBig size={18} />} accent="#fbbf24" />
            <KpiCard label={tr('arpt_fin_kpi_settled')} value={fmtCurrency(r!.settled_revenue)} sub={tr('arpt_sub_fully_paid')} icon={<LuCircleCheck size={18} />} accent="#4ade80" />
            <KpiCard label={tr('arpt_fin_kpi_escrow')} value={fmtCurrency(r!.escrowed_revenue)} sub={tr('arpt_sub_await_release')} icon={<LuShieldCheck size={18} />} accent="#38bdf8" />
            <KpiCard label={tr('arpt_fin_kpi_unpaid')} value={fmtCurrency(r!.unpaid_revenue)} sub={tr('arpt_sub_pend_payment')} icon={<LuCircleX size={18} />} accent="#f87171" />
            <KpiCard label={tr('arpt_fin_kpi_avg_val')} value={fmtCurrency(r!.avg_order_revenue)} sub={tr('arpt_sub_per_order')} icon={<LuTrendingUp size={18} />} accent="#34d399" />
            <KpiCard label={tr('arpt_fin_kpi_reviews')} value={fmt(mp!.total)} sub={`${mp!.pending_count} ${tr('arpt_sub_pending_short')}`} icon={<LuReceipt size={18} />} accent="#fbbf24" />
            <KpiCard label={tr('arpt_fin_kpi_approved')} value={fmtCurrency(mp!.approved_amount)} change={changePay} sub={tr('arpt_sub_vs_prev')} icon={<LuCircleCheck size={18} />} accent="#4ade80" />
            <KpiCard label={tr('arpt_fin_kpi_deposits')} value={fmtCurrency(mp!.total_deposits)} sub={tr('arpt_sub_appr_deposits')} icon={<LuArrowDownLeft size={18} />} accent="#60a5fa" />
            <KpiCard label={tr('arpt_fin_kpi_withdrawals')} value={fmtCurrency(mp!.total_withdrawals)} sub={tr('arpt_sub_appr_withdrawals')} icon={<LuArrowUpRight size={18} />} accent="#f97316" />
            <KpiCard label={tr('arpt_fin_kpi_commission')} value={fmtCurrency(inv!.total_commission)} sub={tr('arpt_sub_from_invoices')} icon={<LuCoins size={18} />} accent="#a78bfa" />
            <KpiCard label={tr('arpt_fin_kpi_payouts')} value={fmtCurrency(inv!.total_driver_payout)} sub={tr('arpt_sub_from_invoices')} icon={<LuTruck size={18} />} accent="#818cf8" />
            <KpiCard label={tr('arpt_fin_kpi_tips')} value={fmtCurrency(inv!.total_tips)} sub={tr('arpt_sub_from_customers')} icon={<LuBanknote size={18} />} accent="#34d399" />
          </div>

          {/* ─ Revenue Trend Charts ─ */}
          <ChartCard title={tr('arpt_fin_chart_trend')} height={280}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={report.daily_revenue} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradRevFin" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#fbbf24" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#fbbf24" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradSettled" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#4ade80" stopOpacity={0.30} />
                    <stop offset="95%" stopColor="#4ade80" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradEscrow" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#38bdf8" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="date" tickFormatter={fmtDate} tick={{ fill: '#9ca3af', fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: '#9ca3af', fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: '0.72rem' }} />
                <Area type="monotone" dataKey="revenue" name="Gross (ETB)" stroke="#fbbf24" fill="url(#gradRevFin)" strokeWidth={2} dot={false} />
                <Area type="monotone" dataKey="settled" name="Settled (ETB)" stroke="#4ade80" fill="url(#gradSettled)" strokeWidth={2} dot={false} />
                <Area type="monotone" dataKey="escrowed" name="Escrowed (ETB)" stroke="#38bdf8" fill="url(#gradEscrow)" strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* ─ Vehicle Revenue + Wallet Breakdown ─ */}
          <div className="rpt-grid-2">
            <ChartCard title={tr('arpt_fin_chart_vehicle')} height={240}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={vehicleData} layout="vertical" margin={{ top: 5, right: 50, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" horizontal={false} />
                  <XAxis type="number" tick={{ fill: '#9ca3af', fontSize: 9 }} tickLine={false} axisLine={false} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                  <YAxis type="category" dataKey="vehicle_type" tick={{ fill: '#9ca3af', fontSize: 10 }} tickLine={false} axisLine={false} width={80} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="revenue" name="Revenue (ETB)" radius={[0, 4, 4, 0]} maxBarSize={18}>
                    {vehicleData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title={tr('arpt_fin_chart_wallet')} height={240}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={walletPieData} cx="38%" cy="50%" innerRadius={55} outerRadius={88} paddingAngle={2} dataKey="value">
                    {walletPieData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                  </Pie>
                  <Tooltip formatter={(v: any, n: any) => [fmtCurrency(Number(v)), n]}
                    contentStyle={{ background: '#1a1f2e', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, fontSize: '0.74rem' }} />
                  <Legend iconSize={9} wrapperStyle={{ fontSize: '0.7rem', paddingLeft: '0.5rem' }} />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          {/* ─ Wallet Daily Flow ─ */}
          {report.wallet_daily.length > 0 && (
            <ChartCard title={tr('arpt_fin_chart_flow')} height={260}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={report.wallet_daily} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="date" tickFormatter={fmtDate} tick={{ fill: '#9ca3af', fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fill: '#9ca3af', fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ fontSize: '0.72rem' }} />
                  <Bar dataKey="credits" name="Credits (ETB)" fill="#4ade80" radius={[3, 3, 0, 0]} maxBarSize={22} fillOpacity={0.85} />
                  <Bar dataKey="debits" name="Debits (ETB)" fill="#f87171" radius={[3, 3, 0, 0]} maxBarSize={22} fillOpacity={0.85} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          )}

          {/* ─ Manual Payments Daily ─ */}
          {report.manual_payments_daily.length > 0 && (
            <ChartCard title={tr('arpt_fin_chart_daily')} height={220}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={report.manual_payments_daily} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradApproved" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#4ade80" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#4ade80" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradPending" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#fbbf24" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#fbbf24" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="date" tickFormatter={fmtDate} tick={{ fill: '#9ca3af', fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fill: '#9ca3af', fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ fontSize: '0.72rem' }} />
                  <Area type="monotone" dataKey="approved_amount" name="Approved (ETB)" stroke="#4ade80" fill="url(#gradApproved)" strokeWidth={2} dot={false} />
                  <Area type="monotone" dataKey="pending_amount" name="Pending (ETB)" stroke="#fbbf24" fill="url(#gradPending)" strokeWidth={2} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>
          )}

          {/* ─ Invoice Breakdown ─ */}
          {inv && inv.total_invoices > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(165px, 1fr))', gap: '0.85rem' }}>
              <KpiCard label={tr('arpt_fin_kpi_invoices')} value={fmt(inv.total_invoices)} sub={tr('arpt_sub_for_period')} icon={<LuFileText size={18} />} accent="#60a5fa" />
              <KpiCard label={tr('arpt_fin_kpi_billed')} value={fmtCurrency(inv.total_billed)} sub={tr('arpt_sub_all_invoices')} icon={<LuReceipt size={18} />} accent="#fbbf24" />
              <KpiCard label={tr('arpt_fin_kpi_drv_pay')} value={fmtCurrency(inv.total_driver_payout)} sub={tr('arpt_sub_net_drivers')} icon={<LuTruck size={18} />} accent="#a78bfa" />
              <KpiCard label={tr('arpt_fin_kpi_comm_short')} value={fmtCurrency(inv.total_commission)} sub={tr('arpt_sub_platform_fee')} icon={<LuCoins size={18} />} accent="#34d399" />
              <KpiCard label={tr('arpt_fin_kpi_tips_short')} value={fmtCurrency(inv.total_tips)} sub={tr('arpt_sub_from_customers')} icon={<LuBanknote size={18} />} accent="#4ade80" />
              <KpiCard label={tr('arpt_fin_kpi_extras')} value={fmtCurrency(inv.total_extra_charges)} sub={tr('arpt_sub_fees_surcharges')} icon={<LuWallet size={18} />} accent="#f97316" />
            </div>
          )}

          {/* ─ Manual Payment Summary Table ─ */}
          <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 14, overflow: 'hidden' }}>
            <div style={{ padding: '1rem 1.2rem', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <LuReceipt size={15} style={{ color: '#fbbf24' }} />
              <p style={{ margin: 0, fontWeight: 700, fontSize: '0.83rem', color: 'var(--clr-text)' }}>{tr('arpt_fin_tbl_pay')}</p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 0 }}>
              {[
                { label: tr('arpt_fin_row_total_sub'), value: fmt(mp!.total), color: 'var(--clr-text)' },
                { label: tr('arpt_fin_row_pending'), value: fmt(mp!.pending_count), color: '#fbbf24' },
                { label: tr('arpt_fin_row_approved'), value: fmt(mp!.approved_count), color: '#4ade80' },
                { label: tr('arpt_fin_row_rejected'), value: fmt(mp!.rejected_count), color: '#f87171' },
                { label: tr('arpt_fin_row_pend_amt'), value: fmtCurrency(mp!.pending_amount), color: '#fbbf24' },
                { label: tr('arpt_fin_row_appr_amt'), value: fmtCurrency(mp!.approved_amount), color: '#4ade80' },
                { label: tr('arpt_fin_row_deposits'), value: fmtCurrency(mp!.total_deposits), color: '#60a5fa' },
                { label: tr('arpt_fin_row_withdrawals'), value: fmtCurrency(mp!.total_withdrawals), color: '#f97316' },
                { label: tr('arpt_fin_row_refunds'), value: fmtCurrency(mp!.total_refunds), color: '#38bdf8' },
                { label: tr('arpt_fin_row_adjustments'), value: fmtCurrency(mp!.total_adjustments), color: '#a78bfa' },
              ].map((item) => (
                <div key={item.label} style={{ padding: '0.85rem 1.2rem', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--clr-muted)', fontWeight: 600 }}>{item.label}</span>
                  <span style={{ fontSize: '0.85rem', fontWeight: 800, color: item.color }}>{item.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ─ Wallet Transaction Type Table ─ */}
          {report.wallet_by_type.length > 0 && (
            <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 14, overflow: 'hidden' }}>
              <div style={{ padding: '1rem 1.2rem', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <LuWallet size={15} style={{ color: 'var(--clr-accent)' }} />
                <p style={{ margin: 0, fontWeight: 700, fontSize: '0.83rem', color: 'var(--clr-text)' }}>{tr('arpt_fin_tbl_wallet')}</p>
              </div>
              <div className="rpt-table-scroll" style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                      {[tr('arpt_col_type'), tr('arpt_col_count'), tr('arpt_col_total_amount'), tr('arpt_col_share_bar')].map(h => (
                        <th key={h} style={{ padding: '0.65rem 1.1rem', textAlign: 'left', color: 'var(--clr-muted)', fontWeight: 600, fontSize: '0.7rem', letterSpacing: '0.05em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const totalAmt = report.wallet_by_type.reduce((s, w) => s + w.total_amount, 0)
                      return report.wallet_by_type.map((w, i) => {
                        const pctVal = totalAmt ? ((w.total_amount / totalAmt) * 100).toFixed(1) : '0'
                        const col = WALLET_TYPE_COLORS[w.transaction_type] ?? '#888'
                        return (
                          <tr key={w.transaction_type} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)' }}>
                            <td style={{ padding: '0.6rem 1.1rem', fontWeight: 600 }}>
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                                <span style={{ width: 8, height: 8, borderRadius: '50%', background: col, flexShrink: 0 }} />
                                {w.transaction_type}
                              </span>
                            </td>
                            <td style={{ padding: '0.6rem 1.1rem', color: 'var(--clr-text)', fontWeight: 700 }}>{fmt(w.count)}</td>
                            <td style={{ padding: '0.6rem 1.1rem', color: '#fbbf24', fontWeight: 600 }}>{fmtCurrency(w.total_amount)}</td>
                            <td style={{ padding: '0.6rem 1.1rem', minWidth: 120 }}>
                              <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
                                <div style={{ height: '100%', width: `${pctVal}%`, background: col, borderRadius: 3 }} />
                              </div>
                            </td>
                          </tr>
                        )
                      })
                    })()}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ─ Top Revenue Shippers ─ */}
          {report.top_shippers.length > 0 && (
            <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 14, overflow: 'hidden' }}>
              <div style={{ padding: '1rem 1.2rem', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <LuUser size={15} style={{ color: 'var(--clr-accent)' }} />
                <p style={{ margin: 0, fontWeight: 700, fontSize: '0.83rem', color: 'var(--clr-text)' }}>{tr('arpt_fin_tbl_shippers')}</p>
              </div>
              <div className="rpt-table-scroll" style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                      {['#', tr('arpt_col_name'), tr('arpt_col_contact'), tr('arpt_col_orders'), tr('arpt_col_revenue')].map(h => (
                        <th key={h} style={{ padding: '0.65rem 1.1rem', textAlign: 'left', color: 'var(--clr-muted)', fontWeight: 600, fontSize: '0.7rem', letterSpacing: '0.05em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {report.top_shippers.map((s, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)' }}>
                        <td style={{ padding: '0.6rem 1.1rem', color: 'var(--clr-muted)', fontWeight: 700 }}>#{i + 1}</td>
                        <td style={{ padding: '0.6rem 1.1rem', fontWeight: 700, color: 'var(--clr-text)' }}>{s.name}</td>
                        <td style={{ padding: '0.6rem 1.1rem', color: 'var(--clr-muted)', fontSize: '0.73rem' }}>
                          <div>{s.phone}</div>
                          <div style={{ opacity: 0.7 }}>{s.email}</div>
                        </td>
                        <td style={{ padding: '0.6rem 1.1rem', fontWeight: 700, color: 'var(--clr-accent)' }}>{fmt(s.orders)}</td>
                        <td style={{ padding: '0.6rem 1.1rem', fontWeight: 700, color: '#fbbf24' }}>{fmtCurrency(s.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Report footer */}
          <div className="rpt-footer-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1rem', borderTop: '1px solid rgba(255,255,255,0.07)', fontSize: '0.68rem', color: 'var(--clr-muted)' }}>
            <span>{tr('arpt_fin_footer')}</span>
            <span>Generated on {new Date(report.generated_at).toLocaleString('en-ET')}</span>
          </div>
        </div>
      )}
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

// ─── Driver Report Types ──────────────────────────────────────────────────────

interface DriverReport {
  generated_at: string
  date_range: { from: string; to: string }
  overview: {
    total_drivers: number; verified_drivers: number; available_drivers: number
    on_job_drivers: number; offline_drivers: number; suspended_drivers: number
    avg_profile_rating: number
  }
  performance: {
    total_trips: number; on_time_trips: number; late_trips: number
    cancelled_trips: number; avg_rating: number; total_earned: number
    total_bonus: number; avg_on_time_pct: number
  }
  documents: {
    nat_id_approved: number; nat_id_pending: number
    license_approved: number; license_pending: number
    libre_approved: number; libre_pending: number
  }
  rating_distribution: { stars: number; count: number }[]
  daily_trips: { date: string; completed_trips: number; active_drivers: number }[]
  daily_ratings: { date: string; count: number; avg_stars: number }[]
  top_drivers: {
    name: string; phone: string; email: string; driver_status: string
    total_trips: number; total_earned: number; average_rating: number
    on_time_percentage: number; cancelled_trips: number; bonus_earned: number
  }[]
  vehicle_types: { vehicle_type: string; count: number }[]
  trips_buckets: { bucket: string; drivers: number }[]
}

const STATUS_BADGE: Record<string, { bg: string; color: string }> = {
  AVAILABLE: { bg: 'rgba(74,222,128,0.15)', color: '#4ade80' },
  ON_JOB: { bg: 'rgba(251,191,36,0.15)', color: '#fbbf24' },
  OFFLINE: { bg: 'rgba(156,163,175,0.15)', color: '#9ca3af' },
  SUSPENDED: { bg: 'rgba(248,113,113,0.15)', color: '#f87171' },
}

function StarBar({ stars, count, total }: { stars: number; count: number; total: number }) {
  const pct = total ? (count / total) * 100 : 0
  const colors = ['', '#f87171', '#fb923c', '#fbbf24', '#a3e635', '#4ade80']
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem' }}>
      <span style={{ width: 16, color: '#fbbf24', fontWeight: 700, flexShrink: 0 }}>{stars}★</span>
      <div style={{ flex: 1, height: 7, borderRadius: 4, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: colors[stars] ?? '#888', borderRadius: 4, transition: 'width 0.4s ease' }} />
      </div>
      <span style={{ width: 32, textAlign: 'right', color: 'var(--clr-muted)', fontWeight: 600 }}>{count}</span>
    </div>
  )
}

// ─── Driver Report Page ───────────────────────────────────────────────────────

function DriverReportPage() {
  const { t: tr } = useLanguage()
  const today = new Date()
  const defaultTo = today.toISOString().slice(0, 10)
  const defaultFrom = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  const [from, setFrom] = useState(defaultFrom)
  const [to, setTo] = useState(defaultTo)
  const [report, setReport] = useState<DriverReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [downloading, setDownloading] = useState(false)
  const reportRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async (f = from, t = to) => {
    setLoading(true); setError('')
    try {
      const { data } = await apiClient.get('/admin/reports/drivers', { params: { from: f, to: t } })
      setReport(data.report)
    } catch { setError(tr('arpt_drv_error')) }
    finally { setLoading(false) }
  }, [from, to])

  useEffect(() => { load() }, []) // eslint-disable-line

  const handleDownload = async () => {
    if (!reportRef.current) return
    setDownloading(true)
    try {
      const canvas = await html2canvas(reportRef.current, { scale: 2, useCORS: true, backgroundColor: '#0f1220', logging: false })
      const imgData = canvas.toDataURL('image/png')
      const pdf = new jsPDF('p', 'mm', 'a4')
      const pw = pdf.internal.pageSize.getWidth()
      const ph = pdf.internal.pageSize.getHeight()
      const ih = (canvas.height * pw) / canvas.width
      let yPos = 0; let rem = ih
      while (rem > 0) {
        pdf.addImage(imgData, 'PNG', 0, -yPos, pw, ih)
        rem -= ph; yPos += ph
        if (rem > 0) pdf.addPage()
      }
      pdf.save(`Driver_Report_${from}_to_${to}.pdf`)
    } catch { /**/ } finally { setDownloading(false) }
  }

  const ov = report?.overview
  const pf = report?.performance
  const docs = report?.documents

  const ratingTotal = report?.rating_distribution.reduce((s, r) => s + r.count, 0) ?? 0
  const fullRatingDist = [5, 4, 3, 2, 1].map(s => ({
    stars: s,
    count: report?.rating_distribution.find(r => r.stars === s)?.count ?? 0,
  }))

  const statusPieData = ov ? [
    { name: 'Available', value: ov.available_drivers, fill: '#4ade80' },
    { name: 'On Job', value: ov.on_job_drivers, fill: '#fbbf24' },
    { name: 'Offline', value: ov.offline_drivers, fill: '#6b7280' },
    { name: 'Suspended', value: ov.suspended_drivers, fill: '#f87171' },
  ].filter(d => d.value > 0) : []

  const vehiclePieData = (report?.vehicle_types ?? []).map((v, i) => ({
    name: v.vehicle_type, value: v.count, fill: CHART_COLORS[i % CHART_COLORS.length],
  }))

  return (
    <div className="rpt-page" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', width: '100%' }}>

      {/* Controls bar */}
      <div className="rpt-controls" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.65rem', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '0.7rem 1rem' }}>
        <LuCalendar size={14} style={{ color: 'var(--clr-muted)', flexShrink: 0 }} />
        {([tr('rpt_from'), tr('rpt_to')]).map((lbl, i) => (
          <div key={lbl} className="rpt-controls-field" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <label style={{ fontSize: '0.72rem', color: 'var(--clr-muted)', fontWeight: 600 }}>{lbl}</label>
            <input type="date" value={i === 0 ? from : to} max={i === 0 ? to : undefined} min={i === 1 ? from : undefined}
              onChange={e => i === 0 ? setFrom(e.target.value) : setTo(e.target.value)}
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '0.28rem 0.55rem', color: 'var(--clr-text)', fontSize: '0.78rem', fontFamily: 'inherit', colorScheme: 'dark' }} />
          </div>
        ))}
        {[{ label: '7D', days: 7 }, { label: '30D', days: 30 }, { label: '90D', days: 90 }, { label: '1Y', days: 365 }].map(p => {
          const f = new Date(today.getTime() - p.days * 86400000).toISOString().slice(0, 10)
          const active = from === f && to === defaultTo
          return (
            <button key={p.label} onClick={() => { setFrom(f); setTo(defaultTo); load(f, defaultTo) }}
              style={{ padding: '0.28rem 0.65rem', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: active ? 'rgba(97, 148, 31,0.12)' : 'rgba(255,255,255,0.04)', color: active ? 'var(--clr-accent)' : 'var(--clr-muted)', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
              {p.label}
            </button>
          )
        })}
        <div className="rpt-controls-spacer" style={{ flex: 1 }} />
        <button onClick={() => load()} disabled={loading}
          style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.38rem 0.85rem', borderRadius: 9, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.06)', color: 'var(--clr-text)', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
          <LuRefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} /> {tr('rpt_apply')}
        </button>
        <button onClick={handleDownload} disabled={downloading || !report}
          style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.38rem 0.9rem', borderRadius: 9, border: 'none', background: 'var(--clr-accent)', color: '#000', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: (downloading || !report) ? 0.5 : 1 }}>
          <LuDownload size={13} /> {downloading ? tr('arpt_generating') : tr('arpt_download_pdf')}
        </button>
      </div>

      {error && (
        <div style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 10, padding: '0.7rem 1rem', fontSize: '0.8rem', color: '#f87171', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <LuTriangleAlert size={14} /> {error}
        </div>
      )}

      {loading && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4rem', gap: '0.75rem', color: 'var(--clr-muted)', fontSize: '0.85rem' }}>
          <LuRefreshCw size={18} style={{ animation: 'spin 1s linear infinite', color: 'var(--clr-accent)' }} /> {tr('arpt_drv_loading')}
        </div>
      )}

      {report && !loading && (
        <div ref={reportRef} className="rpt-page" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', width: '100%' }}>

          {/* Report header */}
          <div className="rpt-hdr rpt-report-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'linear-gradient(135deg, rgba(129,140,248,0.08), rgba(52,211,153,0.06))', border: '1px solid rgba(129,140,248,0.2)', borderRadius: 14, padding: '1.2rem 1.5rem' }}>
            <div className="rpt-report-brand" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <img src={logoImg} alt="Afri logistics" style={{ height: 44, width: 'auto', objectFit: 'contain', borderRadius: 8 }} />
              <div>
                <p style={{ margin: 0, fontWeight: 800, fontSize: '1rem', color: 'var(--clr-text)' }}>Afri logistics</p>
                <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--clr-muted)' }}>{tr('arpt_drv_subtitle')}</p>
              </div>
            </div>
            <div className="rpt-report-meta" style={{ textAlign: 'right' }}>
              <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--clr-muted)' }}>{tr('rpt_period')}</p>
              <p style={{ margin: 0, fontWeight: 700, fontSize: '0.85rem', color: 'var(--clr-text)' }}>
                {fmtDateFull(report.date_range.from)} — {fmtDateFull(report.date_range.to)}
              </p>
              <p style={{ margin: '0.2rem 0 0', fontSize: '0.7rem', color: 'var(--clr-muted)' }}>
                {tr('rpt_generated')}: {new Date(report.generated_at).toLocaleString('en-ET')}
              </p>
            </div>
          </div>

          {/* ─ Fleet Overview KPIs ─ */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(165px, 1fr))', gap: '0.85rem' }}>
            <KpiCard label={tr('arpt_drv_kpi_total')} value={fmt(ov!.total_drivers)} sub={tr('arpt_sub_registered')} icon={<LuUsers size={18} />} accent="#818cf8" />
            <KpiCard label={tr('arpt_drv_kpi_verified')} value={fmt(ov!.verified_drivers)} sub={`${ov!.total_drivers ? ((ov!.verified_drivers / ov!.total_drivers) * 100).toFixed(0) : 0}${tr('arpt_sub_pct_fleet')}`} icon={<LuBadgeCheck size={18} />} accent="#4ade80" />
            <KpiCard label={tr('arpt_drv_kpi_available')} value={fmt(ov!.available_drivers)} sub={tr('arpt_sub_ready_jobs')} icon={<LuCircleDot size={18} />} accent="#4ade80" />
            <KpiCard label={tr('arpt_drv_kpi_on_job')} value={fmt(ov!.on_job_drivers)} sub={tr('arpt_sub_curr_active')} icon={<LuTruck size={18} />} accent="#fbbf24" />
            <KpiCard label={tr('arpt_drv_kpi_offline')} value={fmt(ov!.offline_drivers)} sub={tr('arpt_sub_not_available')} icon={<LuClock size={18} />} accent="#6b7280" />
            <KpiCard label={tr('arpt_drv_kpi_suspended')} value={fmt(ov!.suspended_drivers)} sub={tr('arpt_sub_restricted')} icon={<LuBan size={18} />} accent="#f87171" />
            <KpiCard label={tr('arpt_drv_kpi_fleet_rating')} value={`${(ov!.avg_profile_rating || 0).toFixed(2)} ★`} sub={tr('arpt_sub_across_drivers')} icon={<LuStar size={18} />} accent="#fbbf24" />
            <KpiCard label={tr('arpt_drv_kpi_trips')} value={fmt(pf!.total_trips)} sub={tr('arpt_sub_all_time')} icon={<LuPackage size={18} />} accent="#38bdf8" />
            <KpiCard label={tr('arpt_drv_kpi_on_time')} value={`${(pf!.avg_on_time_pct || 0).toFixed(1)}%`} sub={tr('arpt_sub_fleet_avg')} icon={<LuThumbsUp size={18} />} accent="#34d399" />
            <KpiCard label={tr('arpt_drv_kpi_earnings')} value={fmtCurrency(pf!.total_earned)} sub={tr('arpt_sub_drv_payouts')} icon={<LuCoins size={18} />} accent="#a78bfa" />
            <KpiCard label={tr('arpt_drv_kpi_bonuses')} value={fmtCurrency(pf!.total_bonus)} sub={tr('arpt_sub_perf_bonuses')} icon={<LuTrendingUp size={18} />} accent="#34d399" />
            <KpiCard label={tr('arpt_drv_kpi_avg_rating')} value={`${(pf!.avg_rating || 0).toFixed(2)} ★`} sub={tr('arpt_sub_drv_ratings_src')} icon={<LuStar size={18} />} accent="#fbbf24" />
          </div>

          {/* ─ Driver Status Pie + Vehicle Fleet Pie ─ */}
          <div className="rpt-grid-2">
            <ChartCard title={tr('arpt_drv_chart_status')} height={240}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={statusPieData} cx="38%" cy="50%" innerRadius={55} outerRadius={88} paddingAngle={2} dataKey="value">
                    {statusPieData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                  </Pie>
                  <Tooltip formatter={(v: any, n: any) => [fmt(Number(v)), n]}
                    contentStyle={{ background: '#1a1f2e', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, fontSize: '0.74rem' }} />
                  <Legend iconSize={9} wrapperStyle={{ fontSize: '0.7rem', paddingLeft: '0.5rem' }} />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title={tr('arpt_drv_chart_vehicles')} height={240}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={vehiclePieData} cx="38%" cy="50%" innerRadius={55} outerRadius={88} paddingAngle={2} dataKey="value">
                    {vehiclePieData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                  </Pie>
                  <Tooltip formatter={(v: any, n: any) => [fmt(Number(v)), n]}
                    contentStyle={{ background: '#1a1f2e', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, fontSize: '0.74rem' }} />
                  <Legend iconSize={9} wrapperStyle={{ fontSize: '0.7rem', paddingLeft: '0.5rem' }} />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          {/* ─ Daily Completed Trips ─ */}
          {report.daily_trips.length > 0 && (
            <ChartCard title={tr('arpt_drv_chart_trips')} height={260}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={report.daily_trips} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradTrips" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#818cf8" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#818cf8" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradActDrv" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#34d399" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#34d399" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="date" tickFormatter={fmtDate} tick={{ fill: '#9ca3af', fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fill: '#9ca3af', fontSize: 10 }} tickLine={false} axisLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ fontSize: '0.72rem' }} />
                  <Area type="monotone" dataKey="completed_trips" name="Completed Trips" stroke="#818cf8" fill="url(#gradTrips)" strokeWidth={2} dot={false} />
                  <Area type="monotone" dataKey="active_drivers" name="Active Drivers" stroke="#34d399" fill="url(#gradActDrv)" strokeWidth={2} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>
          )}

          {/* ─ Rating Distribution + Trip Buckets ─ */}
          <div className="rpt-grid-2">

            {/* Star rating bars */}
            <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 14, padding: '1.1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
                <LuStar size={15} style={{ color: '#fbbf24' }} />
                <p style={{ margin: 0, fontWeight: 700, fontSize: '0.83rem', color: 'var(--clr-text)' }}>
                  {tr('arpt_drv_rating_dist')}
                  <span style={{ fontSize: '0.7rem', color: 'var(--clr-muted)', fontWeight: 400, marginLeft: '0.5rem' }}>({ratingTotal} reviews in period)</span>
                </p>
              </div>
              {fullRatingDist.map(r => (
                <StarBar key={r.stars} stars={r.stars} count={r.count} total={ratingTotal} />
              ))}
              <div style={{ marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--clr-muted)' }}>
                <span>{tr('arpt_drv_avg_period')}</span>
                <span style={{ color: '#fbbf24', fontWeight: 700 }}>
                  {ratingTotal > 0 ? (report.rating_distribution.reduce((s, r) => s + r.stars * r.count, 0) / ratingTotal).toFixed(2) : '—'} ★
                </span>
              </div>
            </div>

            {/* Trip experience buckets */}
            <ChartCard title={tr('arpt_drv_chart_exp')} height={220}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={report.trips_buckets} layout="vertical" margin={{ top: 5, right: 40, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" horizontal={false} />
                  <XAxis type="number" tick={{ fill: '#9ca3af', fontSize: 9 }} tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="bucket" tick={{ fill: '#9ca3af', fontSize: 10 }} tickLine={false} axisLine={false} width={72} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="drivers" name="Drivers" radius={[0, 4, 4, 0]} maxBarSize={18}>
                    {report.trips_buckets.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          {/* ─ Daily Rating Trend ─ */}
          {report.daily_ratings.length > 0 && (
            <ChartCard title={tr('arpt_drv_chart_ratings')} height={220}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={report.daily_ratings} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="date" tickFormatter={fmtDate} tick={{ fill: '#9ca3af', fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis yAxisId="left" tick={{ fill: '#9ca3af', fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis yAxisId="right" orientation="right" domain={[1, 5]} tick={{ fill: '#9ca3af', fontSize: 10 }} tickLine={false} axisLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ fontSize: '0.72rem' }} />
                  <Bar yAxisId="left" dataKey="count" name="Reviews" fill="#818cf8" radius={[3, 3, 0, 0]} maxBarSize={20} fillOpacity={0.8} />
                  <Bar yAxisId="right" dataKey="avg_stars" name="Avg Stars ★" fill="#fbbf24" radius={[3, 3, 0, 0]} maxBarSize={20} fillOpacity={0.7} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          )}

          {/* ─ Document Verification Summary ─ */}
          {docs && (
            <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 14, overflow: 'hidden' }}>
              <div style={{ padding: '1rem 1.2rem', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <LuBadgeCheck size={15} style={{ color: '#4ade80' }} />
                <p style={{ margin: 0, fontWeight: 700, fontSize: '0.83rem', color: 'var(--clr-text)' }}>{tr('arpt_drv_doc_verif')}</p>
              </div>
              <div className="rpt-grid-3-doc">
                {[
                  { label: tr('arpt_drv_doc_nat_id'), approved: docs.nat_id_approved, pending: docs.nat_id_pending },
                  { label: tr('arpt_drv_doc_license'), approved: docs.license_approved, pending: docs.license_pending },
                  { label: tr('arpt_drv_doc_libre'), approved: docs.libre_approved, pending: docs.libre_pending },
                ].map((doc, i) => (
                  <div key={doc.label} style={{ padding: '1rem 1.2rem', borderRight: i < 2 ? '1px solid rgba(255,255,255,0.07)' : 'none', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    <p style={{ margin: 0, fontWeight: 700, fontSize: '0.78rem', color: 'var(--clr-text)' }}>{doc.label}</p>
                    <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.73rem' }}>
                      <span><span style={{ color: '#4ade80', fontWeight: 700 }}>{fmt(doc.approved)}</span> <span style={{ color: 'var(--clr-muted)' }}>{tr('arpt_drv_doc_approved')}</span></span>
                      <span><span style={{ color: '#fbbf24', fontWeight: 700 }}>{fmt(doc.pending)}</span> <span style={{ color: 'var(--clr-muted)' }}>{tr('arpt_drv_doc_pending')}</span></span>
                    </div>
                    <div style={{ height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                      {(() => {
                        const total = doc.approved + doc.pending
                        const pct = total ? (doc.approved / total) * 100 : 0
                        return <div style={{ height: '100%', width: `${pct}%`, background: '#4ade80', borderRadius: 3 }} />
                      })()}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ─ Top 10 Drivers Table ─ */}
          {report.top_drivers.length > 0 && (
            <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 14, overflow: 'hidden' }}>
              <div style={{ padding: '1rem 1.2rem', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <LuTruck size={15} style={{ color: 'var(--clr-accent)' }} />
                <p style={{ margin: 0, fontWeight: 700, fontSize: '0.83rem', color: 'var(--clr-text)' }}>{tr('arpt_drv_tbl_top')}</p>
              </div>
              <div className="rpt-table-scroll" style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                      {['#', tr('arpt_col_driver'), tr('arpt_col_status'), tr('arpt_col_trips'), tr('arpt_col_earnings'), tr('arpt_col_bonus'), tr('arpt_col_rating'), tr('arpt_col_on_time')].map(h => (
                        <th key={h} style={{ padding: '0.65rem 1rem', textAlign: 'left', color: 'var(--clr-muted)', fontWeight: 600, fontSize: '0.7rem', letterSpacing: '0.05em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {report.top_drivers.map((d, i) => {
                      const badge = STATUS_BADGE[d.driver_status] ?? { bg: 'rgba(255,255,255,0.08)', color: 'var(--clr-muted)' }
                      return (
                        <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)' }}>
                          <td style={{ padding: '0.6rem 1rem', color: 'var(--clr-muted)', fontWeight: 700 }}>#{i + 1}</td>
                          <td style={{ padding: '0.6rem 1rem' }}>
                            <div style={{ fontWeight: 700, color: 'var(--clr-text)' }}>{d.name}</div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--clr-muted)' }}>{d.phone}</div>
                          </td>
                          <td style={{ padding: '0.6rem 1rem' }}>
                            <span style={{ padding: '0.2rem 0.55rem', borderRadius: 20, background: badge.bg, color: badge.color, fontSize: '0.68rem', fontWeight: 700 }}>{d.driver_status}</span>
                          </td>
                          <td style={{ padding: '0.6rem 1rem', fontWeight: 700, color: CHART_COLORS[0] }}>{fmt(d.total_trips)}</td>
                          <td style={{ padding: '0.6rem 1rem', fontWeight: 700, color: '#fbbf24' }}>{fmtCurrency(d.total_earned)}</td>
                          <td style={{ padding: '0.6rem 1rem', fontWeight: 600, color: '#34d399' }}>{fmtCurrency(d.bonus_earned)}</td>
                          <td style={{ padding: '0.6rem 1rem', fontWeight: 700, color: '#fbbf24' }}>
                            {d.average_rating > 0 ? `${d.average_rating.toFixed(2)} ★` : '—'}
                          </td>
                          <td style={{ padding: '0.6rem 1rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                              <div style={{ flex: 1, minWidth: 50, height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                                <div style={{ width: `${d.on_time_percentage}%`, height: '100%', background: d.on_time_percentage >= 80 ? '#4ade80' : d.on_time_percentage >= 60 ? '#fbbf24' : '#f87171', borderRadius: 3 }} />
                              </div>
                              <span style={{ fontSize: '0.7rem', color: 'var(--clr-muted)', flexShrink: 0 }}>{d.on_time_percentage.toFixed(0)}%</span>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Report footer */}
          <div className="rpt-footer-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1rem', borderTop: '1px solid rgba(255,255,255,0.07)', fontSize: '0.68rem', color: 'var(--clr-muted)' }}>
            <span>{tr('arpt_drv_footer')}</span>
            <span>Generated on {new Date(report.generated_at).toLocaleString('en-ET')}</span>
          </div>
        </div>
      )}
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

// ─── Logistics Report Types ───────────────────────────────────────────────────

interface LogisticsReport {
  generated_at: string
  date_range: { from: string; to: string }
  summary: {
    total_orders: number; cross_border_orders: number; delivered: number
    cancelled: number; failed: number; in_transit: number
    avg_distance_km: number; total_distance_km: number; avg_weight_kg: number
    avg_assign_min: number; avg_delivery_min: number
    prev_total_orders: number; prev_delivered: number
  }
  daily: { date: string; orders: number; delivered: number; total_km: number; cross_border: number }[]
  by_vehicle: { vehicle_type: string; orders: number; avg_km: number; revenue: number }[]
  by_cargo: { cargo_type: string; orders: number; avg_km: number; avg_weight_kg: number }[]
  by_status: { status: string; count: number }[]
  cb_documents: { document_type: string; total: number; approved: number; pending: number; rejected: number }[]
  pickup_cities: { city: string; orders: number }[]
  top_routes: { from_city: string; to_city: string; count: number; avg_km: number }[]
  extra_charges: { charge_type: string; count: number; total_amount: number; avg_amount: number; applied: number; pending: number }[]
  stage_times: { from_status: string; to_status: string; avg_minutes: number }[]
}

const STATUS_ORDER_COLORS: Record<string, string> = {
  PENDING: '#9ca3af', ASSIGNED: '#818cf8', EN_ROUTE: '#38bdf8',
  AT_PICKUP: '#fbbf24', IN_TRANSIT: '#60a5fa', AT_BORDER: '#f97316',
  IN_CUSTOMS: '#fb923c', CUSTOMS_CLEARED: '#a3e635',
  DELIVERED: '#4ade80', COMPLETED: '#34d399', CANCELLED: '#f87171', FAILED: '#ef4444',
}

// ─── Logistics Report Page ────────────────────────────────────────────────────

function LogisticsReportPage() {
  const { t: tr } = useLanguage()
  const today = new Date()
  const defaultTo = today.toISOString().slice(0, 10)
  const defaultFrom = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  const [from, setFrom] = useState(defaultFrom)
  const [to, setTo] = useState(defaultTo)
  const [report, setReport] = useState<LogisticsReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [downloading, setDownloading] = useState(false)
  const reportRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async (f = from, t = to) => {
    setLoading(true); setError('')
    try {
      const { data } = await apiClient.get('/admin/reports/logistics', { params: { from: f, to: t } })
      setReport(data.report)
    } catch { setError(tr('arpt_log_error')) }
    finally { setLoading(false) }
  }, [from, to])

  useEffect(() => { load() }, []) // eslint-disable-line

  const handleDownload = async () => {
    if (!reportRef.current) return
    setDownloading(true)
    try {
      const canvas = await html2canvas(reportRef.current, { scale: 2, useCORS: true, backgroundColor: '#0f1220', logging: false })
      const imgData = canvas.toDataURL('image/png')
      const pdf = new jsPDF('p', 'mm', 'a4')
      const pw = pdf.internal.pageSize.getWidth()
      const ph = pdf.internal.pageSize.getHeight()
      const ih = (canvas.height * pw) / canvas.width
      let yPos = 0; let rem = ih
      while (rem > 0) {
        pdf.addImage(imgData, 'PNG', 0, -yPos, pw, ih)
        rem -= ph; yPos += ph
        if (rem > 0) pdf.addPage()
      }
      pdf.save(`Logistics_Report_${from}_to_${to}.pdf`)
    } catch { /**/ } finally { setDownloading(false) }
  }

  const sm = report?.summary
  const changeOrders = sm ? pct(sm.total_orders, sm.prev_total_orders) : null
  const changeDelivery = sm ? pct(sm.delivered, sm.prev_delivered) : null

  const statusPieData = (report?.by_status ?? [])
    .map(s => ({ name: s.status, value: s.count, fill: STATUS_ORDER_COLORS[s.status] ?? '#888' }))

  const fmtMin = (mins: number) => {
    if (!mins || mins <= 0) return '—'
    if (mins < 60) return `${mins.toFixed(0)}m`
    if (mins < 1440) return `${(mins / 60).toFixed(1)}h`
    return `${(mins / 1440).toFixed(1)}d`
  }

  return (
    <div className="rpt-page" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', width: '100%' }}>

      {/* Controls bar */}
      <div className="rpt-controls" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.65rem', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '0.7rem 1rem' }}>
        <LuCalendar size={14} style={{ color: 'var(--clr-muted)', flexShrink: 0 }} />
        {([tr('rpt_from'), tr('rpt_to')]).map((lbl, i) => (
          <div key={lbl} className="rpt-controls-field" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <label style={{ fontSize: '0.72rem', color: 'var(--clr-muted)', fontWeight: 600 }}>{lbl}</label>
            <input type="date" value={i === 0 ? from : to} max={i === 0 ? to : undefined} min={i === 1 ? from : undefined}
              onChange={e => i === 0 ? setFrom(e.target.value) : setTo(e.target.value)}
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '0.28rem 0.55rem', color: 'var(--clr-text)', fontSize: '0.78rem', fontFamily: 'inherit', colorScheme: 'dark' }} />
          </div>
        ))}
        {[{ label: '7D', days: 7 }, { label: '30D', days: 30 }, { label: '90D', days: 90 }, { label: '1Y', days: 365 }].map(p => {
          const f = new Date(today.getTime() - p.days * 86400000).toISOString().slice(0, 10)
          const active = from === f && to === defaultTo
          return (
            <button key={p.label} onClick={() => { setFrom(f); setTo(defaultTo); load(f, defaultTo) }}
              style={{ padding: '0.28rem 0.65rem', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: active ? 'rgba(97, 148, 31,0.12)' : 'rgba(255,255,255,0.04)', color: active ? 'var(--clr-accent)' : 'var(--clr-muted)', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
              {p.label}
            </button>
          )
        })}
        <div className="rpt-controls-spacer" style={{ flex: 1 }} />
        <button onClick={() => load()} disabled={loading}
          style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.38rem 0.85rem', borderRadius: 9, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.06)', color: 'var(--clr-text)', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
          <LuRefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} /> {tr('rpt_apply')}
        </button>
        <button onClick={handleDownload} disabled={downloading || !report}
          style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.38rem 0.9rem', borderRadius: 9, border: 'none', background: 'var(--clr-accent)', color: '#000', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: (downloading || !report) ? 0.5 : 1 }}>
          <LuDownload size={13} /> {downloading ? tr('arpt_generating') : tr('arpt_download_pdf')}
        </button>
      </div>

      {error && (
        <div style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 10, padding: '0.7rem 1rem', fontSize: '0.8rem', color: '#f87171', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <LuTriangleAlert size={14} /> {error}
        </div>
      )}

      {loading && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4rem', gap: '0.75rem', color: 'var(--clr-muted)', fontSize: '0.85rem' }}>
          <LuRefreshCw size={18} style={{ animation: 'spin 1s linear infinite', color: 'var(--clr-accent)' }} /> {tr('arpt_log_loading')}
        </div>
      )}

      {report && !loading && (
        <div ref={reportRef} className="rpt-page" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', width: '100%' }}>

          {/* Report header */}
          <div className="rpt-hdr rpt-report-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'linear-gradient(135deg, rgba(56,189,248,0.08), rgba(74,222,128,0.06))', border: '1px solid rgba(56,189,248,0.2)', borderRadius: 14, padding: '1.2rem 1.5rem' }}>
            <div className="rpt-report-brand" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <img src={logoImg} alt="Afri logistics" style={{ height: 44, width: 'auto', objectFit: 'contain', borderRadius: 8 }} />
              <div>
                <p style={{ margin: 0, fontWeight: 800, fontSize: '1rem', color: 'var(--clr-text)' }}>Afri logistics</p>
                <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--clr-muted)' }}>{tr('arpt_log_subtitle')}</p>
              </div>
            </div>
            <div className="rpt-report-meta" style={{ textAlign: 'right' }}>
              <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--clr-muted)' }}>{tr('rpt_period')}</p>
              <p style={{ margin: 0, fontWeight: 700, fontSize: '0.85rem', color: 'var(--clr-text)' }}>
                {fmtDateFull(report.date_range.from)} — {fmtDateFull(report.date_range.to)}
              </p>
              <p style={{ margin: '0.2rem 0 0', fontSize: '0.7rem', color: 'var(--clr-muted)' }}>
                {tr('rpt_generated')}: {new Date(report.generated_at).toLocaleString('en-ET')}
              </p>
            </div>
          </div>

          {/* ─ KPI Cards ─ */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '0.85rem' }}>
            <KpiCard label={tr('arpt_log_kpi_total')} value={fmt(sm!.total_orders)} change={changeOrders} sub={tr('arpt_sub_vs_prev')} icon={<LuPackage size={18} />} accent="#38bdf8" />
            <KpiCard label={tr('arpt_log_kpi_delivered')} value={fmt(sm!.delivered)} change={changeDelivery} sub={tr('arpt_sub_vs_prev')} icon={<LuCircleCheck size={18} />} accent="#4ade80" />
            <KpiCard label={tr('arpt_log_kpi_in_transit')} value={fmt(sm!.in_transit)} sub={tr('arpt_sub_curr_active')} icon={<LuTruck size={18} />} accent="#fbbf24" />
            <KpiCard label={tr('arpt_log_kpi_cross_border')} value={fmt(sm!.cross_border_orders)} sub={tr('arpt_sub_intl_orders')} icon={<LuGlobe size={18} />} accent="#a78bfa" />
            <KpiCard label={tr('arpt_log_kpi_cancelled')} value={fmt(sm!.cancelled)} sub={tr('arpt_sub_in_period')} icon={<LuCircleX size={18} />} accent="#f87171" />
            <KpiCard label={tr('arpt_log_kpi_total_dist')} value={`${sm!.total_distance_km.toFixed(0)} km`} sub={tr('arpt_sub_all_combined')} icon={<LuRoute size={18} />} accent="#34d399" />
            <KpiCard label={tr('arpt_log_kpi_avg_dist')} value={`${(sm!.avg_distance_km || 0).toFixed(1)} km`} sub={tr('arpt_sub_per_order')} icon={<LuMapPin size={18} />} accent="#60a5fa" />
            <KpiCard label={tr('arpt_log_kpi_avg_weight')} value={sm!.avg_weight_kg > 0 ? `${sm!.avg_weight_kg.toFixed(0)} kg` : '—'} sub={tr('arpt_sub_per_order')} icon={<LuWeight size={18} />} accent="#fb923c" />
            <KpiCard label={tr('arpt_log_kpi_assign_time')} value={fmtMin(sm!.avg_assign_min)} sub={tr('arpt_sub_order_driver')} icon={<LuTimer size={18} />} accent="#fbbf24" />
            <KpiCard label={tr('arpt_log_kpi_del_time')} value={fmtMin(sm!.avg_delivery_min)} sub={tr('arpt_sub_pickup_delivery')} icon={<LuClock size={18} />} accent="#4ade80" />
          </div>

          {/* ─ Daily Volume + Distance ─ */}
          {report.daily.length > 0 && (
            <ChartCard title={tr('arpt_log_chart_volume')} height={270}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={report.daily} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradLogTotal" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#38bdf8" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradLogDel" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#4ade80" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#4ade80" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradLogCB" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#a78bfa" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#a78bfa" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="date" tickFormatter={fmtDate} tick={{ fill: '#9ca3af', fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fill: '#9ca3af', fontSize: 10 }} tickLine={false} axisLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ fontSize: '0.72rem' }} />
                  <Area type="monotone" dataKey="orders" name="Total Orders" stroke="#38bdf8" fill="url(#gradLogTotal)" strokeWidth={2} dot={false} />
                  <Area type="monotone" dataKey="delivered" name="Delivered" stroke="#4ade80" fill="url(#gradLogDel)" strokeWidth={2} dot={false} />
                  <Area type="monotone" dataKey="cross_border" name="Cross-Border" stroke="#a78bfa" fill="url(#gradLogCB)" strokeWidth={2} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>
          )}

          {/* ─ Status Pie + Vehicle Breakdown ─ */}
          <div className="rpt-grid-2">
            <ChartCard title={tr('arpt_ord_chart_status')} height={260}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={statusPieData} cx="38%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={2} dataKey="value">
                    {statusPieData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                  </Pie>
                  <Tooltip formatter={(v: any, n: any) => [fmt(Number(v)), n]}
                    contentStyle={{ background: '#1a1f2e', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, fontSize: '0.74rem' }} />
                  <Legend iconSize={9} wrapperStyle={{ fontSize: '0.68rem', paddingLeft: '0.5rem' }} />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title={tr('arpt_log_chart_vehicle')} height={260}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={report.by_vehicle} layout="vertical" margin={{ top: 5, right: 50, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" horizontal={false} />
                  <XAxis type="number" tick={{ fill: '#9ca3af', fontSize: 9 }} tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="vehicle_type" tick={{ fill: '#9ca3af', fontSize: 10 }} tickLine={false} axisLine={false} width={85} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="orders" name="Orders" radius={[0, 4, 4, 0]} maxBarSize={18}>
                    {report.by_vehicle.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          {/* ─ Daily km chart ─ */}
          {report.daily.some(d => d.total_km > 0) && (
            <ChartCard title={tr('arpt_log_chart_km')} height={220}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={report.daily} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradKm" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#34d399" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#34d399" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="date" tickFormatter={fmtDate} tick={{ fill: '#9ca3af', fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fill: '#9ca3af', fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={v => `${v}km`} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="total_km" name="Distance (km)" stroke="#34d399" fill="url(#gradKm)" strokeWidth={2} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>
          )}

          {/* ─ Cargo Types + Stage Times ─ */}
          <div className="rpt-grid-2">
            {/* Cargo type table */}
            <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 14, overflow: 'hidden' }}>
              <div style={{ padding: '0.9rem 1.2rem', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <LuContainer size={14} style={{ color: '#38bdf8' }} />
                <p style={{ margin: 0, fontWeight: 700, fontSize: '0.83rem', color: 'var(--clr-text)' }}>{tr('arpt_log_tbl_cargo')}</p>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                    {[tr('arpt_col_cargo_type'), tr('arpt_col_orders'), tr('arpt_col_avg_dist'), tr('arpt_col_avg_wt')].map(h => (
                      <th key={h} style={{ padding: '0.5rem 0.9rem', textAlign: 'left', color: 'var(--clr-muted)', fontWeight: 600, fontSize: '0.68rem', textTransform: 'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {report.by_cargo.map((c, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)' }}>
                      <td style={{ padding: '0.55rem 0.9rem', fontWeight: 600, color: 'var(--clr-text)' }}>{c.cargo_type}</td>
                      <td style={{ padding: '0.55rem 0.9rem', fontWeight: 700, color: 'var(--clr-accent)' }}>{fmt(c.orders)}</td>
                      <td style={{ padding: '0.55rem 0.9rem', color: 'var(--clr-muted)' }}>{c.avg_km > 0 ? `${c.avg_km}km` : '—'}</td>
                      <td style={{ padding: '0.55rem 0.9rem', color: 'var(--clr-muted)' }}>{c.avg_weight_kg > 0 ? `${c.avg_weight_kg}kg` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Stage transition times */}
            <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 14, overflow: 'hidden' }}>
              <div style={{ padding: '0.9rem 1.2rem', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <LuTimer size={14} style={{ color: '#fbbf24' }} />
                <p style={{ margin: 0, fontWeight: 700, fontSize: '0.83rem', color: 'var(--clr-text)' }}>{tr('arpt_log_tbl_stages')}</p>
              </div>
              {report.stage_times.length > 0 ? (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                      {[tr('arpt_col_from'), '', tr('arpt_col_to'), tr('arpt_col_avg_time')].map((h, i) => (
                        <th key={i} style={{ padding: '0.5rem 0.75rem', textAlign: 'left', color: 'var(--clr-muted)', fontWeight: 600, fontSize: '0.68rem', textTransform: 'uppercase' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {report.stage_times.map((st, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)' }}>
                        <td style={{ padding: '0.52rem 0.75rem' }}>
                          <span style={{ padding: '0.15rem 0.45rem', borderRadius: 12, background: `${STATUS_ORDER_COLORS[st.from_status] ?? '#888'}22`, color: STATUS_ORDER_COLORS[st.from_status] ?? '#888', fontSize: '0.67rem', fontWeight: 700 }}>{st.from_status}</span>
                        </td>
                        <td style={{ padding: '0.52rem 0', color: 'var(--clr-muted)' }}><LuArrowRight size={11} /></td>
                        <td style={{ padding: '0.52rem 0.75rem' }}>
                          <span style={{ padding: '0.15rem 0.45rem', borderRadius: 12, background: `${STATUS_ORDER_COLORS[st.to_status] ?? '#888'}22`, color: STATUS_ORDER_COLORS[st.to_status] ?? '#888', fontSize: '0.67rem', fontWeight: 700 }}>{st.to_status}</span>
                        </td>
                        <td style={{ padding: '0.52rem 0.75rem', fontWeight: 700, color: '#fbbf24' }}>{fmtMin(st.avg_minutes)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--clr-muted)', fontSize: '0.75rem' }}>{tr('arpt_log_no_stage_data')}</div>
              )}
            </div>
          </div>

          {/* ─ Top Routes ─ */}
          {report.top_routes.length > 0 && (
            <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 14, overflow: 'hidden' }}>
              <div style={{ padding: '1rem 1.2rem', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <LuRoute size={15} style={{ color: '#34d399' }} />
                <p style={{ margin: 0, fontWeight: 700, fontSize: '0.83rem', color: 'var(--clr-text)' }}>{tr('arpt_log_tbl_routes')}</p>
              </div>
              <div className="rpt-table-scroll" style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                      {['#', tr('arpt_col_from'), '', tr('arpt_col_to'), tr('arpt_col_trips'), tr('arpt_col_avg_km')].map((h, i) => (
                        <th key={i} style={{ padding: '0.65rem 1rem', textAlign: 'left', color: 'var(--clr-muted)', fontWeight: 600, fontSize: '0.7rem', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {report.top_routes.map((r, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)' }}>
                        <td style={{ padding: '0.6rem 1rem', color: 'var(--clr-muted)', fontWeight: 700 }}>#{i + 1}</td>
                        <td style={{ padding: '0.6rem 1rem', fontWeight: 600, color: 'var(--clr-text)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.from_city}</td>
                        <td style={{ padding: '0.6rem 0.3rem', color: 'var(--clr-muted)' }}><LuArrowRight size={12} /></td>
                        <td style={{ padding: '0.6rem 1rem', fontWeight: 600, color: 'var(--clr-text)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.to_city}</td>
                        <td style={{ padding: '0.6rem 1rem', fontWeight: 700, color: '#38bdf8' }}>{fmt(r.count)}</td>
                        <td style={{ padding: '0.6rem 1rem', color: 'var(--clr-muted)' }}>{r.avg_km > 0 ? `${r.avg_km} km` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ─ Pickup City Heatmap bar ─ */}
          {report.pickup_cities.length > 0 && (
            <ChartCard title={tr('arpt_log_chart_cities')} height={240}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={report.pickup_cities} layout="vertical" margin={{ top: 5, right: 60, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" horizontal={false} />
                  <XAxis type="number" tick={{ fill: '#9ca3af', fontSize: 9 }} tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="city" tick={{ fill: '#9ca3af', fontSize: 10 }} tickLine={false} axisLine={false} width={150} tickFormatter={v => v.length > 20 ? v.slice(0, 20) + '…' : v} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="orders" name="Orders" radius={[0, 4, 4, 0]} maxBarSize={18}>
                    {report.pickup_cities.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          )}

          {/* ─ Cross-Border Documents ─ */}
          {report.cb_documents.length > 0 && (
            <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 14, overflow: 'hidden' }}>
              <div style={{ padding: '1rem 1.2rem', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <LuGlobe size={15} style={{ color: '#a78bfa' }} />
                <p style={{ margin: 0, fontWeight: 700, fontSize: '0.83rem', color: 'var(--clr-text)' }}>{tr('arpt_log_tbl_cb_docs')}</p>
              </div>
              <div className="rpt-table-scroll" style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                      {[tr('arpt_col_doc_type'), tr('arpt_col_total'), tr('arpt_col_approved'), tr('arpt_col_pending'), tr('arpt_col_rejected'), tr('arpt_col_rate')].map(h => (
                        <th key={h} style={{ padding: '0.65rem 1rem', textAlign: 'left', color: 'var(--clr-muted)', fontWeight: 600, fontSize: '0.7rem', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {report.cb_documents.map((doc, i) => {
                      const approvalRate = doc.total ? ((doc.approved / doc.total) * 100).toFixed(0) : '0'
                      return (
                        <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)' }}>
                          <td style={{ padding: '0.6rem 1rem', fontWeight: 600, color: 'var(--clr-text)' }}>{doc.document_type.replace(/_/g, ' ')}</td>
                          <td style={{ padding: '0.6rem 1rem', fontWeight: 700 }}>{fmt(doc.total)}</td>
                          <td style={{ padding: '0.6rem 1rem', color: '#4ade80', fontWeight: 700 }}>{fmt(doc.approved)}</td>
                          <td style={{ padding: '0.6rem 1rem', color: '#fbbf24', fontWeight: 700 }}>{fmt(doc.pending)}</td>
                          <td style={{ padding: '0.6rem 1rem', color: '#f87171', fontWeight: 700 }}>{fmt(doc.rejected)}</td>
                          <td style={{ padding: '0.6rem 1rem', minWidth: 110 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                              <div style={{ flex: 1, height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.08)' }}>
                                <div style={{ width: `${approvalRate}%`, height: '100%', background: '#4ade80', borderRadius: 3 }} />
                              </div>
                              <span style={{ fontSize: '0.7rem', color: '#4ade80', fontWeight: 700, flexShrink: 0 }}>{approvalRate}%</span>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ─ Extra Charges ─ */}
          {report.extra_charges.length > 0 && (
            <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 14, overflow: 'hidden' }}>
              <div style={{ padding: '1rem 1.2rem', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <LuCoins size={15} style={{ color: '#fbbf24' }} />
                <p style={{ margin: 0, fontWeight: 700, fontSize: '0.83rem', color: 'var(--clr-text)' }}>{tr('arpt_log_tbl_charges')}</p>
              </div>
              <div className="rpt-table-scroll" style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                      {[tr('arpt_col_type'), tr('arpt_col_count'), tr('arpt_col_total_amount'), tr('arpt_col_avg_amount'), tr('arpt_col_applied'), tr('arpt_col_pending')].map(h => (
                        <th key={h} style={{ padding: '0.65rem 1rem', textAlign: 'left', color: 'var(--clr-muted)', fontWeight: 600, fontSize: '0.7rem', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {report.extra_charges.map((ec, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)' }}>
                        <td style={{ padding: '0.6rem 1rem', fontWeight: 600, color: 'var(--clr-text)' }}>{ec.charge_type.replace(/_/g, ' ')}</td>
                        <td style={{ padding: '0.6rem 1rem', fontWeight: 700 }}>{fmt(ec.count)}</td>
                        <td style={{ padding: '0.6rem 1rem', color: '#fbbf24', fontWeight: 700 }}>{fmtCurrency(ec.total_amount)}</td>
                        <td style={{ padding: '0.6rem 1rem', color: 'var(--clr-muted)' }}>{fmtCurrency(ec.avg_amount)}</td>
                        <td style={{ padding: '0.6rem 1rem', color: '#4ade80', fontWeight: 700 }}>{fmt(ec.applied)}</td>
                        <td style={{ padding: '0.6rem 1rem', color: '#fbbf24', fontWeight: 700 }}>{fmt(ec.pending)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Report footer */}
          <div className="rpt-footer-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1rem', borderTop: '1px solid rgba(255,255,255,0.07)', fontSize: '0.68rem', color: 'var(--clr-muted)' }}>
            <span>{tr('arpt_log_footer')}</span>
            <span>Generated on {new Date(report.generated_at).toLocaleString('en-ET')}</span>
          </div>
        </div>
      )}
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

// ─── Main Reports Section ─────────────────────────────────────────────────────

const REPORT_TABS = [
  { id: 'orders', label: 'Orders', icon: <LuListOrdered size={14} /> },
  { id: 'finance', label: 'Finance', icon: <LuFileText size={14} /> },
  { id: 'drivers', label: 'Drivers', icon: <LuTruck size={14} /> },
  { id: 'logistics', label: 'Logistics', icon: <LuGlobe size={14} /> },
] as const

type ReportTab = typeof REPORT_TABS[number]['id']

export default function AdminReportsSection({ allowedTabs }: { allowedTabs?: ReportTab[] }) {
  const { t: tr } = useLanguage()
  const visibleTabs = REPORT_TABS.filter(tab => !allowedTabs || allowedTabs.includes(tab.id))
  const defaultTab = (visibleTabs[0]?.id ?? 'finance') as ReportTab
  const [activeTab, setActiveTab] = useState<ReportTab>(defaultTab)

  useEffect(() => {
    if (!visibleTabs.some(tab => tab.id === activeTab)) {
      setActiveTab(defaultTab)
    }
  }, [activeTab, defaultTab, visibleTabs])

  return (
    <div className="rpt-page" style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem', width: '100%' }}>
      <style>{`
        /* ── Responsive report layout classes ── */
        .rpt-page      { min-width: 0; }
        .rpt-kpi-card  { min-width: 0; }
        .rpt-chart-card, .rpt-chart-body { min-width: 0; }
        .rpt-controls  { min-width: 0; }
        .rpt-controls > * { min-width: 0; }
        .rpt-controls-field { min-width: 0; }
        .rpt-controls-field input { min-width: 135px; max-width: 100%; }
        .rpt-table-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; }
        .rpt-table-scroll table { min-width: 560px; }
        .rpt-grid-2    { display: grid; grid-template-columns: 1fr 1fr; gap: 0.85rem; }
        .rpt-grid-21   { display: grid; grid-template-columns: 2fr 1fr; gap: 0.85rem; }
        .rpt-grid-3    { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.85rem; }
        .rpt-grid-3-doc{ display: grid; grid-template-columns: repeat(3, 1fr); }
        /* Prevent grid children from overflowing / causing recharts -1 */
        .rpt-grid-2 > *, .rpt-grid-21 > *, .rpt-grid-3 > * { min-width: 0; }
        .rpt-hdr       { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; flex-wrap: wrap; }
        .rpt-report-brand { min-width: 0; }
        .rpt-report-meta  { min-width: 220px; }
        .rpt-footer-row{ display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.25rem; }
        .rpt-nav-shell { width: 100%; overflow-x: auto; }
        .rpt-nav-pills { display: inline-flex; align-items: center; gap: 0.3rem; min-width: max-content; max-width: 100%; }
        /* ── Tablet (≤ 980px) ── */
        @media (max-width: 980px) {
          .rpt-grid-2     { grid-template-columns: 1fr; }
          .rpt-grid-21    { grid-template-columns: 1fr; }
          .rpt-grid-3     { grid-template-columns: 1fr 1fr; }
          .rpt-grid-3-doc { grid-template-columns: 1fr 1fr; }
          .rpt-controls-spacer { display: none; }
          .rpt-report-header { padding: 1rem 1.1rem !important; }
        }
        /* ── Mobile (≤ 580px) ── */
        @media (max-width: 580px) {
          .rpt-grid-2     { grid-template-columns: 1fr; }
          .rpt-grid-21    { grid-template-columns: 1fr; }
          .rpt-grid-3     { grid-template-columns: 1fr; }
          .rpt-grid-3-doc { grid-template-columns: 1fr; }
          .rpt-controls { padding: 0.75rem !important; }
          .rpt-controls-field { flex: 1 1 100%; }
          .rpt-controls-field input { width: 100%; min-width: 0; }
          .rpt-table-scroll table { min-width: 460px; }
          .rpt-hdr        { flex-direction: column; align-items: flex-start; }
          .rpt-report-brand { width: 100%; }
          .rpt-report-meta { min-width: 0; width: 100%; }
          .rpt-hdr > *:last-child { text-align: left !important; }
          .rpt-footer-row { flex-direction: column; text-align: center; }
          .rpt-nav-pills  { width: max-content; }
        }
      `}</style>
      {/* Page heading */}
      <div>
        <h2 style={{ margin: '0 0 0.2rem', fontSize: '1rem', fontWeight: 800, color: 'var(--clr-text)', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
          <LuChartColumnBig size={17} /> {tr('arpt_title')}
        </h2>
        <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--clr-muted)' }}>{tr('arpt_subtitle')}</p>
      </div>

      {/* Floating nav header */}
      <div className="rpt-nav-shell">
        <div className="rpt-nav-pills" style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 50, padding: '0.3rem 0.4rem', width: 'fit-content', boxShadow: '0 4px 20px rgba(0,0,0,0.3)' }}>
          {visibleTabs.map(tab => {
            const active = activeTab === tab.id
            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.42rem 1rem', borderRadius: 50, border: 'none', background: active ? 'var(--clr-accent)' : 'transparent', color: active ? '#000' : 'var(--clr-muted)', fontFamily: 'inherit', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', transition: 'all 0.18s', whiteSpace: 'nowrap' }}>
                {tab.icon} {tr(`arpt_tab_${tab.id}`)}
              </button>
            )
          })}
        </div>
      </div>

      {/* Tab content */}
      {activeTab === 'orders' && <OrderReportPage />}
      {activeTab === 'finance' && <FinanceReportPage />}
      {activeTab === 'drivers' && <DriverReportPage />}
      {activeTab === 'logistics' && <LogisticsReportPage />}
    </div>
  )
}
