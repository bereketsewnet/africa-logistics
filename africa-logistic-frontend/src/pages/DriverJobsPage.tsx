import { useState, useEffect, useRef, useCallback } from 'react'
import { driverApi } from '../lib/apiClient'
import {
  LuTruck, LuRefreshCw, LuMapPin, LuCheck, LuX, LuBan,
  LuCircleCheck, LuTriangleAlert, LuChevronRight,
  LuSend, LuArrowRight, LuClock, LuCircleDot, LuNavigation,
} from 'react-icons/lu'

// ─── Types ────────────────────────────────────────────────────────────────────
interface Job {
  id: string; reference_code: string; status: string
  cargo_type_name: string; vehicle_type_required: string; estimated_weight_kg: number
  pickup_address: string; delivery_address: string
  estimated_price: number; final_price: number | null; currency: string
  description: string | null
  shipper_first_name: string; shipper_last_name: string; shipper_phone: string
  created_at: string; assigned_at: string | null
}
interface Message { id: string; sender_first_name: string; sender_last_name: string; sender_role_id: number; message: string; created_at: string }

// ─── Helpers ──────────────────────────────────────────────────────────────────
const STATUS_COLOR: Record<string, string> = {
  PENDING:    '#fbbf24',
  ASSIGNED:   '#60a5fa',
  EN_ROUTE:   '#a78bfa',
  AT_PICKUP:  '#fb923c',
  IN_TRANSIT: '#34d399',
  DELIVERED:  '#4ade80',
  CANCELLED:  '#f87171',
}
const STATUS_LABEL: Record<string, string> = {
  PENDING:    'Pending',
  ASSIGNED:   'Assigned',
  EN_ROUTE:   'En Route',
  AT_PICKUP:  'At Pickup',
  IN_TRANSIT: 'In Transit',
  DELIVERED:  'Delivered',
  CANCELLED:  'Cancelled',
}

function statusBadge(status: string) {
  const c = STATUS_COLOR[status] ?? '#94a3b8'
  return (
    <span style={{ fontSize:'0.7rem', fontWeight:700, color:c,
      background:`${c}1a`, border:`1px solid ${c}44`,
      borderRadius:99, padding:'0.18rem 0.6rem', whiteSpace:'nowrap' }}>
      {STATUS_LABEL[status] ?? status}
    </span>
  )
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('en-GB', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })
}

function Spinner() {
  return <span className="spinner" style={{ width:18, height:18, borderWidth:2 }}/>
}

// Next valid statuses a driver can manually set
const DRIVER_STATUS_FLOW: Record<string, string[]> = {
  EN_ROUTE:   ['AT_PICKUP'],
  AT_PICKUP:  [],       // requires OTP
  IN_TRANSIT: [],       // requires OTP
}

// ─── OTP Modal ────────────────────────────────────────────────────────────────
function OtpModal({ title, onConfirm, onClose }: { title: string; onConfirm: (otp: string) => Promise<void>; onClose: () => void }) {
  const [otp, setOtp] = useState('')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

  const handleSubmit = async () => {
    if (otp.length !== 6) { setErr('Enter the 6-digit OTP.'); return }
    setErr(''); setLoading(true)
    try { await onConfirm(otp); onClose() }
    catch (e: any) { setErr(e.response?.data?.message ?? 'Invalid OTP.') }
    finally { setLoading(false) }
  }

  return (
    <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="glass modal-box" style={{ padding:'1.75rem', maxWidth:360, width:'100%' }}>
        <h3 style={{ fontSize:'1rem', fontWeight:800, color:'var(--clr-text)', marginBottom:'0.4rem' }}>{title}</h3>
        <p style={{ fontSize:'0.8rem', color:'var(--clr-muted)', marginBottom:'1.1rem' }}>Enter the 6-digit OTP provided by the shipper.</p>
        {err && <div className="alert alert-error" style={{ marginBottom:'0.75rem' }}><LuTriangleAlert size={13}/> {err}</div>}
        <div className="input-wrap" style={{ marginBottom:'1rem' }}>
          <input id="otp-in" type="text" inputMode="numeric" pattern="[0-9]*" maxLength={6} placeholder=" "
            value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0,6))} autoFocus/>
          <label htmlFor="otp-in">6-Digit OTP</label>
        </div>
        <div style={{ display:'flex', gap:'0.6rem' }}>
          <button className="btn-outline" style={{ flex:1 }} onClick={onClose}>Cancel</button>
          <button className="btn-primary" style={{ flex:2 }} onClick={handleSubmit} disabled={loading || otp.length !== 6}>
            {loading ? <span style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:'0.5rem' }}><Spinner/> Verifying…</span> : 'Confirm OTP'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Job Detail Modal ─────────────────────────────────────────────────────────
function JobDetailModal({ job, onClose, onRefresh }: { job: Job; onClose: () => void; onRefresh: () => void }) {
  const [tab, setTab] = useState<'info' | 'chat'>('info')
  const [messages, setMessages] = useState<Message[]>([])
  const [msgText, setMsgText] = useState('')
  const [sending, setSending] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [actionErr, setActionErr] = useState('')
  const [otpModal, setOtpModal] = useState<'pickup' | 'delivery' | null>(null)
  const [localJob, setLocalJob] = useState<Job>(job)
  const msgBottom = useRef<HTMLDivElement>(null)

  const loadMessages = useCallback(async () => {
    const { data } = await driverApi.getMessages(localJob.id)
    setMessages(data.messages ?? [])
    setTimeout(() => msgBottom.current?.scrollIntoView({ behavior:'smooth' }), 100)
  }, [localJob.id])

  useEffect(() => { if (tab === 'chat') loadMessages() }, [tab]) // eslint-disable-line

  const refreshJob = async () => {
    const { data } = await driverApi.getJob(localJob.id)
    setLocalJob(data.job)
    onRefresh()
  }

  const handleSend = async () => {
    if (!msgText.trim()) return
    setSending(true)
    try { await driverApi.sendMessage(localJob.id, msgText.trim()); setMsgText(''); await loadMessages() }
    catch { /* silent */ }
    finally { setSending(false) }
  }

  const handleAccept = async () => {
    setActionErr(''); setActionLoading(true)
    try { await driverApi.acceptJob(localJob.id); await refreshJob() }
    catch (e: any) { setActionErr(e.response?.data?.message ?? 'Failed to accept.') }
    finally { setActionLoading(false) }
  }

  const handleDecline = async () => {
    if (!window.confirm('Decline this job?')) return
    setActionErr(''); setActionLoading(true)
    try { await driverApi.declineJob(localJob.id); onRefresh(); onClose() }
    catch (e: any) { setActionErr(e.response?.data?.message ?? 'Failed to decline.') }
    finally { setActionLoading(false) }
  }

  const handleStatus = async (status: string) => {
    setActionErr(''); setActionLoading(true)
    try { await driverApi.updateStatus(localJob.id, status); await refreshJob() }
    catch (e: any) { setActionErr(e.response?.data?.message ?? 'Failed to update status.') }
    finally { setActionLoading(false) }
  }

  const handlePickupOtp = async (otp: string) => {
    await driverApi.verifyPickup(localJob.id, otp)
    await refreshJob()
  }

  const handleDeliveryOtp = async (otp: string) => {
    await driverApi.verifyDelivery(localJob.id, otp)
    await refreshJob()
  }

  const { status } = localJob
  const nextStatuses = DRIVER_STATUS_FLOW[status] ?? []

  return (
    <>
      <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
        <div className="glass modal-box" style={{ padding:0, maxWidth:500, width:'100%', maxHeight:'90vh', display:'flex', flexDirection:'column' }}>
          {/* Header */}
          <div style={{ padding:'1.25rem 1.5rem 0', flexShrink:0 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'0.75rem' }}>
              <div>
                <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', flexWrap:'wrap' }}>
                  <h2 style={{ fontSize:'1rem', fontWeight:800, color:'var(--clr-text)' }}>{localJob.reference_code}</h2>
                  {statusBadge(status)}
                </div>
                <p style={{ fontSize:'0.75rem', color:'var(--clr-muted)', marginTop:'0.15rem' }}>{fmtDate(localJob.created_at)}</p>
              </div>
              <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--clr-muted)', padding:'0.2rem', display:'flex', alignItems:'center' }}>
                <LuX size={18}/>
              </button>
            </div>
            {/* Tabs */}
            <div style={{ display:'flex', gap:'0.25rem', background:'rgba(255,255,255,0.04)', borderRadius:10, padding:'0.25rem', marginBottom:'1rem' }}>
              {(['info','chat'] as const).map(t => (
                <button key={t} onClick={() => setTab(t)} style={{ flex:1, padding:'0.4rem', border:'none', borderRadius:8, background: tab === t ? 'rgba(0,229,255,0.12)' : 'transparent', color: tab === t ? 'var(--clr-accent)' : 'var(--clr-muted)', fontFamily:'inherit', fontSize:'0.78rem', fontWeight:700, cursor:'pointer', transition:'all 0.15s', outline: tab === t ? '1px solid rgba(0,229,255,0.2)' : 'none' }}>
                  {t === 'info' ? 'Job Details' : 'Chat'}
                </button>
              ))}
            </div>
          </div>

          {/* Body */}
          <div style={{ overflowY:'auto', flex:1, padding:'0 1.5rem 1.25rem' }}>
            {actionErr && <div className="alert alert-error" style={{ marginBottom:'0.75rem' }}><LuTriangleAlert size={13}/> {actionErr}</div>}

            {/* ── Info tab ── */}
            {tab === 'info' && (
              <div style={{ display:'flex', flexDirection:'column', gap:'0.85rem' }}>
                {/* Route */}
                <div className="glass-inner" style={{ padding:'1rem', display:'flex', flexDirection:'column', gap:'0.55rem', fontSize:'0.8rem' }}>
                  {[
                    ['Cargo', localJob.cargo_type_name],
                    ['Vehicle', localJob.vehicle_type_required],
                    ['Weight', `${localJob.estimated_weight_kg} kg`],
                    ['Pickup', localJob.pickup_address],
                    ['Delivery', localJob.delivery_address],
                    ['Fare', `${(localJob.final_price ?? localJob.estimated_price).toLocaleString()} ${localJob.currency}`],
                    ...(localJob.description ? [['Note', localJob.description]] : []),
                  ].map(([l, v]) => (
                    <div key={l} style={{ display:'flex', gap:'0.5rem' }}>
                      <span style={{ color:'var(--clr-muted)', width:70, flexShrink:0 }}>{l}</span>
                      <span style={{ color:'var(--clr-text)', fontWeight:500, wordBreak:'break-word' }}>{v}</span>
                    </div>
                  ))}
                </div>

                {/* Shipper */}
                <div className="glass-inner" style={{ padding:'0.85rem 1rem', display:'flex', alignItems:'center', gap:'0.75rem' }}>
                  <div style={{ width:36, height:36, borderRadius:'50%', background:'rgba(167,139,250,0.1)', border:'1px solid rgba(167,139,250,0.2)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                    <LuCircleDot size={16} color="#a78bfa"/>
                  </div>
                  <div>
                    <p style={{ fontWeight:700, fontSize:'0.85rem', color:'var(--clr-text)' }}>Shipper: {localJob.shipper_first_name} {localJob.shipper_last_name}</p>
                    {localJob.shipper_phone && <p style={{ fontSize:'0.75rem', color:'var(--clr-muted)' }}>{localJob.shipper_phone}</p>}
                  </div>
                </div>

                {/* Action buttons */}
                <div style={{ display:'flex', flexDirection:'column', gap:'0.5rem' }}>
                  {/* Accept/Decline — only when ASSIGNED (waiting acceptance) */}
                  {status === 'ASSIGNED' && (
                    <div style={{ display:'flex', gap:'0.5rem' }}>
                      <button onClick={handleDecline} disabled={actionLoading}
                        style={{ flex:1, padding:'0.65rem', borderRadius:10, border:'1px solid rgba(248,113,113,0.3)', background:'rgba(248,113,113,0.06)', color:'#f87171', fontFamily:'inherit', fontSize:'0.82rem', fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:'0.4rem' }}>
                        {actionLoading ? <Spinner/> : <><LuBan size={14}/> Decline</>}
                      </button>
                      <button onClick={handleAccept} disabled={actionLoading}
                        style={{ flex:2, padding:'0.65rem', borderRadius:10, border:'none', background:'var(--clr-accent)', color:'#080b14', fontFamily:'inherit', fontSize:'0.82rem', fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:'0.4rem' }}>
                        {actionLoading ? <Spinner/> : <><LuCheck size={14}/> Accept Job</>}
                      </button>
                    </div>
                  )}

                  {/* Status transition buttons */}
                  {nextStatuses.map(ns => (
                    <button key={ns} onClick={() => handleStatus(ns)} disabled={actionLoading}
                      style={{ width:'100%', padding:'0.65rem', borderRadius:10, border:'none', background:'var(--clr-accent)', color:'#080b14', fontFamily:'inherit', fontSize:'0.82rem', fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:'0.4rem' }}>
                      {actionLoading ? <Spinner/> : <>Mark as {STATUS_LABEL[ns]}</>}
                    </button>
                  ))}

                  {/* AT_PICKUP → IN_TRANSIT via OTP */}
                  {status === 'AT_PICKUP' && (
                    <button onClick={() => setOtpModal('pickup')}
                      style={{ width:'100%', padding:'0.65rem', borderRadius:10, border:'none', background:'var(--clr-accent)', color:'#080b14', fontFamily:'inherit', fontSize:'0.82rem', fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:'0.4rem' }}>
                      <LuCheck size={14}/> Verify Pickup OTP → In Transit
                    </button>
                  )}

                  {/* IN_TRANSIT → DELIVERED via OTP */}
                  {status === 'IN_TRANSIT' && (
                    <button onClick={() => setOtpModal('delivery')}
                      style={{ width:'100%', padding:'0.65rem', borderRadius:10, border:'none', background:'#4ade80', color:'#080b14', fontFamily:'inherit', fontSize:'0.82rem', fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:'0.4rem' }}>
                      <LuCircleCheck size={14}/> Verify Delivery OTP → Delivered
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* ── Chat tab ── */}
            {tab === 'chat' && (
              <div style={{ display:'flex', flexDirection:'column', height:'100%' }}>
                <div style={{ flex:1, display:'flex', flexDirection:'column', gap:'0.6rem', minHeight:200, maxHeight:340, overflowY:'auto', padding:'0.25rem 0' }}>
                  {messages.length === 0 ? (
                    <div style={{ textAlign:'center', color:'var(--clr-muted)', padding:'2rem', fontSize:'0.85rem' }}>No messages yet.</div>
                  ) : messages.map(m => {
                    const isMe = m.sender_role_id === 3
                    return (
                      <div key={m.id} style={{ display:'flex', flexDirection:'column', alignItems: isMe ? 'flex-end' : 'flex-start' }}>
                        <div style={{ maxWidth:'80%', background: isMe ? 'rgba(0,229,255,0.12)' : 'rgba(255,255,255,0.05)', border: isMe ? '1px solid rgba(0,229,255,0.2)' : '1px solid rgba(255,255,255,0.08)', borderRadius:12, padding:'0.55rem 0.85rem' }}>
                          <p style={{ fontSize:'0.8rem', color:'var(--clr-text)', lineHeight:1.5, wordBreak:'break-word' }}>{m.message}</p>
                        </div>
                        <p style={{ fontSize:'0.65rem', color:'var(--clr-muted)', marginTop:'0.15rem', paddingInline:'0.25rem' }}>{m.sender_first_name} · {fmtDate(m.created_at)}</p>
                      </div>
                    )
                  })}
                  <div ref={msgBottom}/>
                </div>
                {status !== 'DELIVERED' && status !== 'CANCELLED' && (
                  <div style={{ display:'flex', gap:'0.5rem', marginTop:'0.75rem', flexShrink:0 }}>
                    <input value={msgText} onChange={e => setMsgText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
                      placeholder="Send a message…" style={{ flex:1, padding:'0.6rem 0.85rem', borderRadius:10, border:'1px solid rgba(255,255,255,0.1)', background:'rgba(255,255,255,0.04)', color:'var(--clr-text)', fontFamily:'inherit', fontSize:'0.85rem', outline:'none' }}/>
                    <button onClick={handleSend} disabled={sending || !msgText.trim()}
                      style={{ padding:'0.6rem 0.85rem', borderRadius:10, border:'none', background:'var(--clr-accent)', color:'#080b14', cursor:'pointer', display:'flex', alignItems:'center', opacity: sending || !msgText.trim() ? 0.5 : 1 }}>
                      {sending ? <Spinner/> : <LuSend size={16}/>}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* OTP modals */}
      {otpModal === 'pickup' && (
        <OtpModal title="Verify Pickup OTP" onConfirm={handlePickupOtp} onClose={() => setOtpModal(null)}/>
      )}
      {otpModal === 'delivery' && (
        <OtpModal title="Verify Delivery OTP" onConfirm={handleDeliveryOtp} onClose={() => setOtpModal(null)}/>
      )}
    </>
  )
}

// ─── GPS Ping ─────────────────────────────────────────────────────────────────
function GpsPingButton({ activeJobId }: { activeJobId: string | null }) {
  const [pinging, setPinging] = useState(false)
  const [msg, setMsg] = useState('')

  const ping = () => {
    if (!navigator.geolocation) { setMsg('Geolocation not supported.'); return }
    setPinging(true); setMsg('')
    navigator.geolocation.getCurrentPosition(async pos => {
      try {
        await driverApi.pingLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude, order_id: activeJobId ?? undefined, heading: pos.coords.heading ?? undefined, speed_kmh: pos.coords.speed != null ? pos.coords.speed * 3.6 : undefined })
        setMsg('Location updated ✓')
      } catch { setMsg('Ping failed.') }
      finally { setPinging(false); setTimeout(() => setMsg(''), 3000) }
    }, () => { setMsg('Location access denied.'); setPinging(false) })
  }

  return (
    <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', flexWrap:'wrap' }}>
      <button onClick={ping} disabled={pinging}
        style={{ display:'flex', alignItems:'center', gap:'0.4rem', padding:'0.38rem 0.75rem', borderRadius:8, border:'1px solid rgba(0,229,255,0.25)', background:'rgba(0,229,255,0.07)', color:'var(--clr-accent)', fontFamily:'inherit', fontSize:'0.76rem', fontWeight:700, cursor:'pointer' }}>
        {pinging ? <><Spinner/> Pinging…</> : <><LuNavigation size={13}/> Ping My Location</>}
      </button>
      {msg && <span style={{ fontSize:'0.72rem', color: msg.includes('✓') ? '#4ade80' : '#f87171' }}>{msg}</span>}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
type JobTab = 'active' | 'completed'

export default function DriverJobsPage() {
  const [jobTab, setJobTab] = useState<JobTab>('active')
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedJob, setSelectedJob] = useState<Job | null>(null)

  const loadJobs = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await driverApi.listJobs()
      setJobs(data.jobs ?? [])
    } catch { /* silent */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { loadJobs() }, []) // eslint-disable-line

  const active = jobs.filter(j => !['DELIVERED','CANCELLED'].includes(j.status))
  const completed = jobs.filter(j => ['DELIVERED','CANCELLED'].includes(j.status))
  const visible = jobTab === 'active' ? active : completed

  // Find any currently active job (IN_TRANSIT or AT_PICKUP) for GPS ping
  const activeJob = jobs.find(j => ['EN_ROUTE','AT_PICKUP','IN_TRANSIT'].includes(j.status)) ?? null

  return (
    <div className="page-shell" style={{ alignItems:'flex-start' }}>
      <div style={{ width:'100%', maxWidth:620, display:'flex', flexDirection:'column', gap:'1.25rem' }}>

        {/* ── Header ── */}
        <div className="glass page-enter" style={{ padding:'1.5rem' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:'0.75rem', flexWrap:'wrap' }}>
            <div>
              <h2 style={{ fontSize:'1.05rem', fontWeight:800, color:'var(--clr-text)', display:'flex', alignItems:'center', gap:'0.45rem' }}>
                <LuTruck size={18}/> My Jobs
              </h2>
              <p style={{ fontSize:'0.78rem', color:'var(--clr-muted)', marginTop:'0.15rem' }}>
                {active.length} active · {completed.length} completed
              </p>
            </div>
            <div style={{ display:'flex', gap:'0.5rem', alignItems:'center', flexWrap:'wrap' }}>
              <GpsPingButton activeJobId={activeJob?.id ?? null}/>
              <button onClick={loadJobs} disabled={loading}
                style={{ display:'flex', alignItems:'center', gap:'0.35rem', padding:'0.38rem 0.75rem', borderRadius:8, border:'1px solid rgba(255,255,255,0.1)', background:'rgba(255,255,255,0.04)', color:'var(--clr-muted)', fontFamily:'inherit', fontSize:'0.76rem', fontWeight:600, cursor:'pointer' }}>
                <LuRefreshCw size={13}/> Refresh
              </button>
            </div>
          </div>

          {/* Tab switcher */}
          <div style={{ display:'flex', gap:'0.25rem', background:'rgba(255,255,255,0.04)', borderRadius:10, padding:'0.25rem', marginTop:'1rem' }}>
            {(['active','completed'] as JobTab[]).map(t => (
              <button key={t} onClick={() => setJobTab(t)} style={{ flex:1, padding:'0.45rem', border:'none', borderRadius:8, background: jobTab === t ? 'rgba(0,229,255,0.12)' : 'transparent', color: jobTab === t ? 'var(--clr-accent)' : 'var(--clr-muted)', fontFamily:'inherit', fontSize:'0.78rem', fontWeight:700, cursor:'pointer', transition:'all 0.15s', outline: jobTab === t ? '1px solid rgba(0,229,255,0.2)' : 'none', display:'flex', alignItems:'center', justifyContent:'center', gap:'0.35rem' }}>
                {t === 'active' ? <><LuClock size={13}/> Active ({active.length})</> : <><LuCircleCheck size={13}/> Completed ({completed.length})</>}
              </button>
            ))}
          </div>
        </div>

        {/* ── Job List ── */}
        <div className="glass" style={{ padding:'1rem 1.25rem', display:'flex', flexDirection:'column', gap:'0.65rem' }}>
          {loading ? (
            <div style={{ display:'flex', justifyContent:'center', padding:'2.5rem', color:'var(--clr-muted)', gap:'0.65rem', alignItems:'center' }}>
              <Spinner/> Loading jobs…
            </div>
          ) : visible.length === 0 ? (
            <div style={{ textAlign:'center', padding:'3rem 1rem', color:'var(--clr-muted)', fontSize:'0.875rem' }}>
              <LuTruck size={36} style={{ opacity:0.25, display:'block', margin:'0 auto 1rem' }}/>
              {jobTab === 'active' ? 'No active jobs right now.' : 'No completed jobs yet.'}
            </div>
          ) : visible.map(job => (
            <div key={job.id} className="glass-inner" onClick={() => setSelectedJob(job)}
              style={{ padding:'0.9rem 1rem', cursor:'pointer', transition:'background 0.15s' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
              onMouseLeave={e => (e.currentTarget.style.background = '')}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:'0.5rem' }}>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', flexWrap:'wrap', marginBottom:'0.25rem' }}>
                    <span style={{ fontWeight:700, fontSize:'0.88rem', color:'var(--clr-text)' }}>{job.reference_code}</span>
                    {statusBadge(job.status)}
                  </div>
                  <p style={{ fontSize:'0.75rem', color:'var(--clr-muted)', display:'flex', alignItems:'center', gap:'0.35rem', marginBottom:'0.15rem' }}>
                    <LuMapPin size={11}/> {job.pickup_address}
                  </p>
                  <p style={{ fontSize:'0.75rem', color:'var(--clr-muted)', display:'flex', alignItems:'center', gap:'0.35rem' }}>
                    <LuArrowRight size={11}/> {job.delivery_address}
                  </p>
                  <div style={{ display:'flex', gap:'0.65rem', marginTop:'0.4rem', flexWrap:'wrap' }}>
                    <span style={{ fontSize:'0.72rem', color:'var(--clr-muted)' }}>{job.cargo_type_name}</span>
                    <span style={{ fontSize:'0.72rem', color:'var(--clr-muted)' }}>·</span>
                    <span style={{ fontSize:'0.72rem', color:'var(--clr-muted)' }}>{job.vehicle_type_required}</span>
                    <span style={{ fontSize:'0.72rem', color:'var(--clr-muted)' }}>·</span>
                    <span style={{ fontSize:'0.72rem', color:'var(--clr-muted)' }}>{job.estimated_weight_kg} kg</span>
                  </div>
                </div>
                <div style={{ textAlign:'right', flexShrink:0 }}>
                  <p style={{ fontSize:'0.9rem', fontWeight:800, color:'var(--clr-accent)', whiteSpace:'nowrap' }}>
                    {(job.final_price ?? job.estimated_price).toLocaleString()} ETB
                  </p>
                  <p style={{ fontSize:'0.68rem', color:'var(--clr-muted)', marginTop:'0.2rem' }}>{fmtDate(job.created_at).split(',')[0]}</p>
                  <LuChevronRight size={14} style={{ color:'var(--clr-muted)', marginTop:'0.3rem' }}/>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Job Detail Modal ── */}
      {selectedJob && (
        <JobDetailModal
          job={selectedJob}
          onClose={() => setSelectedJob(null)}
          onRefresh={loadJobs}
        />
      )}
    </div>
  )
}
