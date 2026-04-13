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
  LuTriangleAlert, LuBox,
} from 'react-icons/lu'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'

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
const CHART_COLORS = ['#00e5ff', '#a78bfa', '#34d399', '#fbbf24', '#f97316', '#f87171', '#60a5fa']

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
    <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 14, padding: '1.1rem 1.2rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 0, right: 0, width: 80, height: 80, background: `radial-gradient(circle at top right, ${accent}18, transparent 70%)`, pointerEvents: 'none' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--clr-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
        <span style={{ color: accent, opacity: 0.85, display: 'flex' }}>{icon}</span>
      </div>
      <div style={{ fontSize: '1.55rem', fontWeight: 800, color: 'var(--clr-text)', lineHeight: 1 }}>{value}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
        {change != null && (
          <span style={{ fontSize: '0.68rem', fontWeight: 700, color: up ? '#4ade80' : '#f87171', display: 'flex', alignItems: 'center', gap: '0.15rem' }}>
            {up ? <LuTrendingUp size={11}/> : <LuTrendingDown size={11}/>}
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
    <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 14, padding: '1.2rem' }}>
      <p style={{ margin: '0 0 1rem', fontWeight: 700, fontSize: '0.83rem', color: 'var(--clr-text)' }}>{title}</p>
      <div style={{ height }}>{children}</div>
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
  const today = new Date()
  const defaultTo   = today.toISOString().slice(0, 10)
  const defaultFrom = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  const [from, setFrom]     = useState(defaultFrom)
  const [to, setTo]         = useState(defaultTo)
  const [report, setReport] = useState<OrderReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState('')
  const [downloading, setDownloading] = useState(false)
  const reportRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async (f = from, t = to) => {
    setLoading(true)
    setError('')
    try {
      const { data } = await apiClient.get('/admin/reports/orders', { params: { from: f, to: t } })
      setReport(data.report)
    } catch {
      setError('Failed to load report. Please try again.')
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
      const pageWidth  = pdf.internal.pageSize.getWidth()
      const pageHeight = pdf.internal.pageSize.getHeight()
      const imgWidth   = pageWidth
      const imgHeight  = (canvas.height * pageWidth) / canvas.width
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
  const changeOrders  = s && report?.comparison ? pct(s.total_orders,  report.comparison.prev_total_orders)  : null
  const changeRevenue = s && report?.comparison ? pct(s.total_revenue, report.comparison.prev_total_revenue) : null

  const statusData = report
    ? Object.entries(report.by_status).map(([status, count]) => ({ name: status, value: count, fill: STATUS_COLORS[status] ?? '#888' }))
    : []

  const paymentData = report
    ? Object.entries(report.by_payment_status).map(([status, count]) => ({ name: status, value: count }))
    : []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', width: '100%' }}>
      {/* ─ Controls bar ─ */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.65rem', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '0.7rem 1rem' }}>
        <LuCalendar size={14} style={{ color: 'var(--clr-muted)', flexShrink: 0 }}/>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flex: '0 0 auto' }}>
          <label style={{ fontSize: '0.72rem', color: 'var(--clr-muted)', fontWeight: 600 }}>From</label>
          <input type="date" value={from} max={to} onChange={e => setFrom(e.target.value)}
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '0.28rem 0.55rem', color: 'var(--clr-text)', fontSize: '0.78rem', fontFamily: 'inherit', colorScheme: 'dark' }}/>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flex: '0 0 auto' }}>
          <label style={{ fontSize: '0.72rem', color: 'var(--clr-muted)', fontWeight: 600 }}>To</label>
          <input type="date" value={to} min={from} onChange={e => setTo(e.target.value)}
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '0.28rem 0.55rem', color: 'var(--clr-text)', fontSize: '0.78rem', fontFamily: 'inherit', colorScheme: 'dark' }}/>
        </div>

        {/* Quick presets */}
        {[{ label: '7D', days: 7 }, { label: '30D', days: 30 }, { label: '90D', days: 90 }, { label: '1Y', days: 365 }].map(p => {
          const f = new Date(today.getTime() - p.days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
          const active = from === f && to === defaultTo
          return (
            <button key={p.label} onClick={() => { setFrom(f); setTo(defaultTo); load(f, defaultTo) }}
              style={{ padding: '0.28rem 0.65rem', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: active ? 'rgba(0,229,255,0.12)' : 'rgba(255,255,255,0.04)', color: active ? 'var(--clr-accent)' : 'var(--clr-muted)', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
              {p.label}
            </button>
          )
        })}

        <div style={{ flex: 1 }}/>
        <button onClick={() => load()} disabled={loading}
          style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.38rem 0.85rem', borderRadius: 9, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.06)', color: 'var(--clr-text)', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
          <LuRefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }}/> Apply
        </button>
        <button onClick={handleDownload} disabled={downloading || !report}
          style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.38rem 0.9rem', borderRadius: 9, border: 'none', background: 'var(--clr-accent)', color: '#000', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: (downloading || !report) ? 0.5 : 1 }}>
          <LuDownload size={13}/> {downloading ? 'Generating…' : 'Download PDF'}
        </button>
      </div>

      {error && (
        <div style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 10, padding: '0.7rem 1rem', fontSize: '0.8rem', color: '#f87171', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <LuTriangleAlert size={14}/> {error}
        </div>
      )}

      {loading && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4rem', gap: '0.75rem', color: 'var(--clr-muted)', fontSize: '0.85rem' }}>
          <LuRefreshCw size={18} style={{ animation: 'spin 1s linear infinite', color: 'var(--clr-accent)' }}/> Loading report…
        </div>
      )}

      {/* ─ Printable Report Area ─ */}
      {report && !loading && (
        <div ref={reportRef} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', width: '100%' }}>
          {/* Report Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'linear-gradient(135deg, rgba(0,229,255,0.08), rgba(167,139,250,0.06))', border: '1px solid rgba(0,229,255,0.15)', borderRadius: 14, padding: '1.2rem 1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <img src={logoImg} alt="Africa Logistics" style={{ height: 44, width: 'auto', objectFit: 'contain', borderRadius: 8 }}/>
              <div>
                <p style={{ margin: 0, fontWeight: 800, fontSize: '1rem', color: 'var(--clr-text)' }}>Africa Logistics</p>
                <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--clr-muted)' }}>Order Performance Report</p>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--clr-muted)' }}>Report Period</p>
              <p style={{ margin: 0, fontWeight: 700, fontSize: '0.85rem', color: 'var(--clr-text)' }}>
                {fmtDateFull(report.date_range.from)} — {fmtDateFull(report.date_range.to)}
              </p>
              <p style={{ margin: '0.2rem 0 0', fontSize: '0.7rem', color: 'var(--clr-muted)' }}>
                Generated: {new Date(report.generated_at).toLocaleString('en-ET')}
              </p>
            </div>
          </div>

          {/* ─ KPI Row 1 ─ */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: '0.85rem' }}>
            <KpiCard label="Total Orders" value={fmt(s!.total_orders)} change={changeOrders} sub="vs previous period" icon={<LuListOrdered size={18}/>} />
            <KpiCard label="Normal Orders" value={fmt(s!.normal_orders)} sub="registered shippers" icon={<LuPackage size={18}/>} accent="#60a5fa" />
            <KpiCard label="Guest Orders" value={fmt(s!.guest_orders)} sub="walk-in / call-in" icon={<LuUsers size={18}/>} accent="#a78bfa" />
            <KpiCard label="Completed" value={fmt(s!.completed_orders)} icon={<LuCircleCheck size={18}/>} accent="#4ade80"
              sub={s!.total_orders ? `${((s!.completed_orders / s!.total_orders) * 100).toFixed(1)}% rate` : undefined}/>
            <KpiCard label="Active / In Transit" value={fmt(s!.active_orders)} icon={<LuActivity size={18}/>} accent="#38bdf8" />
            <KpiCard label="Cancelled" value={fmt(s!.cancelled_orders)} icon={<LuCircleX size={18}/>} accent="#f87171"
              sub={s!.total_orders ? `${((s!.cancelled_orders / s!.total_orders) * 100).toFixed(1)}% rate` : undefined}/>
            <KpiCard label="Total Revenue" value={fmtCurrency(s!.total_revenue)} change={changeRevenue} sub="vs previous period" icon={<LuChartColumnBig size={18}/>} accent="#fbbf24" />
            <KpiCard label="Avg Order Value" value={fmtCurrency(s!.avg_order_value)} icon={<LuTrendingUp size={18}/>} accent="#34d399" />
            <KpiCard label="Avg Delivery" value={report.delivery_time.avg_hours != null ? `${report.delivery_time.avg_hours}h` : 'N/A'} sub="hours per order" icon={<LuClock size={18}/>} accent="#fb923c" />
            <KpiCard label="Active Drivers" value={fmt(s!.active_drivers)} sub="in period" icon={<LuTruck size={18}/>} accent="#818cf8" />
          </div>

          {/* ─ Charts Row 1: Daily Trend ─ */}
          <ChartCard title="Order Volume & Revenue — Daily Trend" height={280}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={report.daily_trend} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradOrders" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#00e5ff" stopOpacity={0.35}/>
                    <stop offset="95%" stopColor="#00e5ff" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="gradRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#fbbf24" stopOpacity={0.35}/>
                    <stop offset="95%" stopColor="#fbbf24" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)"/>
                <XAxis dataKey="date" tickFormatter={fmtDate} tick={{ fill: '#9ca3af', fontSize: 10 }} tickLine={false} axisLine={false}/>
                <YAxis yAxisId="orders" tick={{ fill: '#9ca3af', fontSize: 10 }} tickLine={false} axisLine={false}/>
                <YAxis yAxisId="revenue" orientation="right" tick={{ fill: '#9ca3af', fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={v => `${(v/1000).toFixed(0)}k`}/>
                <Tooltip content={<CustomTooltip/>}/>
                <Legend wrapperStyle={{ fontSize: '0.72rem' }}/>
                <Area yAxisId="orders" type="monotone" dataKey="orders" name="Orders" stroke="#00e5ff" fill="url(#gradOrders)" strokeWidth={2} dot={false}/>
                <Area yAxisId="revenue" type="monotone" dataKey="revenue" name="Revenue (ETB)" stroke="#fbbf24" fill="url(#gradRevenue)" strokeWidth={2} dot={false}/>
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* ─ Charts Row 2: Normal vs Guest + Status Pie ─ */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem' }}>
            <ChartCard title="Normal vs Guest Orders — Daily" height={240}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={report.daily_trend} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)"/>
                  <XAxis dataKey="date" tickFormatter={fmtDate} tick={{ fill: '#9ca3af', fontSize: 9 }} tickLine={false} axisLine={false}/>
                  <YAxis tick={{ fill: '#9ca3af', fontSize: 9 }} tickLine={false} axisLine={false}/>
                  <Tooltip content={<CustomTooltip/>}/>
                  <Legend wrapperStyle={{ fontSize: '0.7rem' }}/>
                  <Bar dataKey="normal_orders" name="Normal" fill="#60a5fa" radius={[3, 3, 0, 0]} maxBarSize={20}/>
                  <Bar dataKey="guest_orders"  name="Guest"  fill="#a78bfa" radius={[3, 3, 0, 0]} maxBarSize={20}/>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Orders by Status" height={240}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={statusData} cx="40%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={2} dataKey="value">
                    {statusData.map((entry, i) => <Cell key={i} fill={entry.fill}/>)}
                  </Pie>
                  <Tooltip formatter={(value: any, name: any) => [fmt(Number(value)), name]}
                    contentStyle={{ background: '#1a1f2e', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, fontSize: '0.74rem' }}/>
                  <Legend iconSize={9} wrapperStyle={{ fontSize: '0.7rem', paddingLeft: '0.5rem' }}/>
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          {/* ─ Charts Row 3: Revenue Bar + Payment Status ─ */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '0.85rem' }}>
            <ChartCard title="Daily Revenue Breakdown" height={240}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={report.daily_trend} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)"/>
                  <XAxis dataKey="date" tickFormatter={fmtDate} tick={{ fill: '#9ca3af', fontSize: 9 }} tickLine={false} axisLine={false}/>
                  <YAxis tick={{ fill: '#9ca3af', fontSize: 9 }} tickLine={false} axisLine={false} tickFormatter={v => `${(v/1000).toFixed(0)}k`}/>
                  <Tooltip content={<CustomTooltip/>}/>
                  <Legend wrapperStyle={{ fontSize: '0.7rem' }}/>
                  <Bar dataKey="revenue" name="Revenue" radius={[4, 4, 0, 0]} maxBarSize={24}>
                    {report.daily_trend.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} fillOpacity={0.85}/>)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Payment Status" height={240}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={paymentData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
                    {paymentData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]}/>)}
                  </Pie>
                  <Tooltip formatter={(v: any, n: any) => [fmt(Number(v)), n]}
                    contentStyle={{ background: '#1a1f2e', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, fontSize: '0.74rem' }}/>
                  <Legend iconSize={9} wrapperStyle={{ fontSize: '0.7rem' }}/>
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          {/* ─ Cargo Breakdown ─ */}
          {report.cargo_breakdown.length > 0 && (
            <ChartCard title="Orders by Cargo Type" height={220}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={report.cargo_breakdown} layout="vertical" margin={{ top: 0, right: 60, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" horizontal={false}/>
                  <XAxis type="number" tick={{ fill: '#9ca3af', fontSize: 9 }} tickLine={false} axisLine={false}/>
                  <YAxis type="category" dataKey="cargo_type" tick={{ fill: '#9ca3af', fontSize: 10 }} tickLine={false} axisLine={false} width={90}/>
                  <Tooltip content={<CustomTooltip/>}/>
                  <Bar dataKey="count" name="Orders" radius={[0, 4, 4, 0]} maxBarSize={18}>
                    {report.cargo_breakdown.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]}/>)}
                  </Bar>
                  <Bar dataKey="revenue" name="Revenue" radius={[0, 4, 4, 0]} maxBarSize={18} fill="#fbbf24" fillOpacity={0.7}/>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          )}

          {/* ─ Status Summary Table ─ */}
          <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 14, overflow: 'hidden' }}>
            <div style={{ padding: '1rem 1.2rem', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <LuChartColumnBig size={15} style={{ color: 'var(--clr-accent)' }}/>
              <p style={{ margin: 0, fontWeight: 700, fontSize: '0.83rem', color: 'var(--clr-text)' }}>Status Breakdown</p>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                    {['Status', 'Count', '% of Total', 'Share Bar'].map(h => (
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
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: STATUS_COLORS[status] ?? '#888', flexShrink: 0 }}/>
                            {status}
                          </span>
                        </td>
                        <td style={{ padding: '0.6rem 1.1rem', color: 'var(--clr-text)', fontWeight: 700 }}>{fmt(count)}</td>
                        <td style={{ padding: '0.6rem 1.1rem', color: 'var(--clr-muted)' }}>{pctVal}%</td>
                        <td style={{ padding: '0.6rem 1.1rem', minWidth: 120 }}>
                          <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${pctVal}%`, background: STATUS_COLORS[status] ?? '#888', borderRadius: 3, transition: 'width 0.6s ease' }}/>
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
                <LuMapPin size={15} style={{ color: 'var(--clr-accent)' }}/>
                <p style={{ margin: 0, fontWeight: 700, fontSize: '0.83rem', color: 'var(--clr-text)' }}>Top Routes</p>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                      {['#', 'Pickup', 'Delivery', 'Orders', 'Total Revenue', 'Avg Distance'].map(h => (
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
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.85rem' }}>
              <KpiCard label="Avg Delivery Time" value={`${report.delivery_time.avg_hours}h`} sub="hours from order to delivery" icon={<LuClock size={18}/>} accent="#fb923c"/>
              <KpiCard label="Fastest Delivery" value={`${report.delivery_time.min_hours}h`} sub="minimum hours" icon={<LuTrendingUp size={18}/>} accent="#4ade80"/>
              <KpiCard label="Slowest Delivery" value={`${report.delivery_time.max_hours}h`} sub="maximum hours" icon={<LuTrendingDown size={18}/>} accent="#f87171"/>
            </div>
          )}

          {/* ─ Report Footer ─ */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1rem', borderTop: '1px solid rgba(255,255,255,0.07)', fontSize: '0.68rem', color: 'var(--clr-muted)' }}>
            <span>Africa Logistics — Confidential Business Report</span>
            <span>Generated on {new Date(report.generated_at).toLocaleString('en-ET')}</span>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

// ─── Finance / Drivers / Logistics placeholders ───────────────────────────────

function PlaceholderReportPage({ title, icon }: { title: string; icon: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '5rem 2rem', gap: '1rem', textAlign: 'center', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16 }}>
      <span style={{ opacity: 0.3, color: 'var(--clr-accent)' }}>{icon}</span>
      <p style={{ margin: 0, fontWeight: 700, fontSize: '0.95rem', color: 'var(--clr-text)' }}>{title} Report</p>
      <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--clr-muted)', maxWidth: 340 }}>
        Coming soon — this report is under construction. Check back after the Orders report is finalized.
      </p>
    </div>
  )
}

// ─── Main Reports Section ─────────────────────────────────────────────────────

const REPORT_TABS = [
  { id: 'orders',   label: 'Orders',   icon: <LuListOrdered size={14}/> },
  { id: 'finance',  label: 'Finance',  icon: <LuFileText    size={14}/> },
  { id: 'drivers',  label: 'Drivers',  icon: <LuTruck       size={14}/> },
  { id: 'logistics',label: 'Logistics',icon: <LuGlobe       size={14}/> },
] as const

type ReportTab = typeof REPORT_TABS[number]['id']

export default function AdminReportsSection() {
  const [activeTab, setActiveTab] = useState<ReportTab>('orders')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem', width: '100%' }}>
      {/* Page heading */}
      <div>
        <h2 style={{ margin: '0 0 0.2rem', fontSize: '1rem', fontWeight: 800, color: 'var(--clr-text)', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
            <LuChartColumnBig size={17}/> Reports
        </h2>
        <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--clr-muted)' }}>Analytics &amp; Business Intelligence</p>
      </div>

      {/* Floating nav header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 50, padding: '0.3rem 0.4rem', width: 'fit-content', boxShadow: '0 4px 20px rgba(0,0,0,0.3)' }}>
        {REPORT_TABS.map(tab => {
          const active = activeTab === tab.id
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.42rem 1rem', borderRadius: 50, border: 'none', background: active ? 'var(--clr-accent)' : 'transparent', color: active ? '#000' : 'var(--clr-muted)', fontFamily: 'inherit', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', transition: 'all 0.18s', whiteSpace: 'nowrap' }}>
              {tab.icon} {tab.label}
            </button>
          )
        })}
      </div>

      {/* Tab content */}
      {activeTab === 'orders'    && <OrderReportPage />}
      {activeTab === 'finance'   && <PlaceholderReportPage title="Finance"  icon={<LuBox size={48}/>} />}
      {activeTab === 'drivers'   && <PlaceholderReportPage title="Drivers"  icon={<LuTruck size={48}/>} />}
      {activeTab === 'logistics' && <PlaceholderReportPage title="Logistics" icon={<LuGlobe size={48}/>} />}
    </div>
  )
}
