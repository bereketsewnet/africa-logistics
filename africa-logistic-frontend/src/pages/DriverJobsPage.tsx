import { useState, useEffect, useRef, useCallback } from 'react'
import { driverApi, orderApi } from '../lib/apiClient'
import { useAuth } from '../context/AuthContext'
import {
  LuTruck, LuRefreshCw, LuMapPin, LuCheck, LuX, LuBan,
  LuCircleCheck, LuTriangleAlert, LuChevronRight,
  LuSend, LuArrowRight, LuClock, LuCircleDot, LuNavigation,
  LuMessageSquare, LuSquareCheck, LuSquare, LuFileText, LuUpload,
} from 'react-icons/lu'

// ─── Types ────────────────────────────────────────────────────────────────────
interface Job {
  id: string; reference_code: string; status: string
  cargo_type_name: string; vehicle_type_required: string; estimated_weight_kg: number
  pickup_address: string; delivery_address: string
  estimated_price: number; final_price: number | null; currency?: string
  description: string | null
  shipper_first_name: string; shipper_last_name: string; shipper_phone: string
  created_at: string; assigned_at: string | null
  // Cross-border
  is_cross_border: number
  pickup_country_id: number
  delivery_country_id: number
  border_crossing_ref: string | null
  customs_declaration_ref: string | null
  hs_code: string | null
  shipper_tin: string | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const STATUS_COLOR: Record<string, string> = {
  PENDING:         '#fbbf24',
  ASSIGNED:        '#60a5fa',
  EN_ROUTE:        '#a78bfa',
  AT_PICKUP:       '#fb923c',
  IN_TRANSIT:      '#34d399',
  AT_BORDER:       '#f59e0b',
  IN_CUSTOMS:      '#ef4444',
  CUSTOMS_CLEARED: '#10b981',
  DELIVERED:       '#4ade80',
  CANCELLED:       '#f87171',
}
const STATUS_LABEL: Record<string, string> = {
  PENDING:         'Pending',
  ASSIGNED:        'Assigned',
  EN_ROUTE:        'En Route',
  AT_PICKUP:       'At Pickup',
  IN_TRANSIT:      'In Transit',
  AT_BORDER:       'At Border',
  IN_CUSTOMS:      'In Customs',
  CUSTOMS_CLEARED: 'Customs Cleared',
  DELIVERED:       'Delivered',
  CANCELLED:       'Cancelled',
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
  EN_ROUTE:        ['AT_PICKUP'],
  AT_PICKUP:       [],              // requires OTP
  IN_TRANSIT:      [],              // requires OTP — or AT_BORDER for cross-border
  AT_BORDER:       ['IN_CUSTOMS'],
  IN_CUSTOMS:      ['CUSTOMS_CLEARED'],
  CUSTOMS_CLEARED: ['IN_TRANSIT'],
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
  const [tab, setTab] = useState<'info' | 'chat' | 'docs'>('info')
  const [messages, setMessages] = useState<{ id: string; sender_first_name: string; sender_last_name: string; sender_role_id: number; message: string; created_at: string }[]>([])
  const [msgText, setMsgText] = useState('')
  const [sending, setSending] = useState(false)
  const [unreadChat, setUnreadChat] = useState(false)
  const msgBottom = useRef<HTMLDivElement>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [actionErr, setActionErr] = useState('')
  const [otpModal, setOtpModal] = useState<'pickup' | 'delivery' | null>(null)
  const [localJob, setLocalJob] = useState<Job>(job)
  // Cross-border doc upload state
  const [docType, setDocType] = useState('CHECKPOINT_PHOTO')
  const [docFile, setDocFile] = useState<string>('')
  const [docNotes, setDocNotes] = useState('')
  const [docUploading, setDocUploading] = useState(false)
  const [docErr, setDocErr] = useState('')
  const [docSuccess, setDocSuccess] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  // Cross-border document list (existing uploads)
  const [cbDocs, setCbDocs] = useState<any[]>([])
  const [docsLoading, setDocsLoading] = useState(false)

  // ─── WS for real-time NEW_MESSAGE events ───────────────────────────────────
  const tabRef = useRef<'info' | 'chat' | 'docs'>('info')
  useEffect(() => { tabRef.current = tab }, [tab])

  useEffect(() => {
    const terminal = ['DELIVERED', 'CANCELLED', 'COMPLETED', 'FAILED']
    if (terminal.includes(localJob.status)) return
    const token = localStorage.getItem('auth_token')
    if (!token) return
    const wsBase = (import.meta.env.VITE_API_BASE_URL as string ?? '').replace(/^https/, 'wss').replace(/^http/, 'ws').replace(/\/api$/, '')
    const ws = new WebSocket(`${wsBase}/api/ws/orders/${localJob.id}?token=${encodeURIComponent(token)}`)
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data)
        if (msg.type === 'NEW_MESSAGE' && msg.message) {
          const msgCh = msg.message.channel ?? 'main'
          if (msgCh === 'driver') {
            if (tabRef.current === 'chat') {
              setMessages(prev => prev.find(m => m.id === msg.message.id) ? prev : [...prev, msg.message])
              setTimeout(() => msgBottom.current?.scrollIntoView({ behavior: 'smooth' }), 80)
            } else {
              setUnreadChat(true)
            }
          }
        }
      } catch { /* ignore */ }
    }
    return () => ws.close()
  }, [localJob.id]) // eslint-disable-line
  // ────────────────────────────────────────────────────────────────────

  useEffect(() => { if (tab === 'chat') { setUnreadChat(false); loadMessages() } }, [tab]) // eslint-disable-line

  useEffect(() => {
    if (tab === 'docs') {
      (async () => {
        setDocsLoading(true)
        try {
          const { data } = await orderApi.getCrossBorderDocs(localJob.id)
          setCbDocs(data.documents ?? [])
        } catch {
          setCbDocs([])
        } finally { setDocsLoading(false) }
      })()
    }
  }, [tab, localJob.id])

  const loadMessages = useCallback(async () => {
    const { data } = await driverApi.getMessages(localJob.id, 'driver')
    setMessages(data.messages ?? [])
    setTimeout(() => msgBottom.current?.scrollIntoView({ behavior: 'smooth' }), 100)
  }, [localJob.id])

  const refreshJob = async () => {
    const { data } = await driverApi.getJob(localJob.id)
    setLocalJob(data.job)
    onRefresh()
  }

  const handleSend = async () => {
    if (!msgText.trim()) return
    setSending(true)
    try { await driverApi.sendMessage(localJob.id, msgText.trim(), 'driver'); setMsgText(''); await loadMessages() }
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
  // For cross-border: IN_TRANSIT can also go to AT_BORDER
  const isCrossBorder = !!localJob.is_cross_border

  const handleUploadDoc = async () => {
    if (!docFile) { setDocErr('Please select a file.'); return }
    setDocErr(''); setDocSuccess(''); setDocUploading(true)
    try {
      await driverApi.uploadCrossBorderDoc(localJob.id, { document_type: docType, file_base64: docFile, notes: docNotes || undefined })
      setDocSuccess('Document uploaded successfully. Pending admin review.')
      setDocFile(''); setDocNotes(''); if (fileInputRef.current) fileInputRef.current.value = ''
    } catch (e: any) {
      setDocErr(e.response?.data?.message ?? 'Upload failed.')
    } finally {
      setDocUploading(false)
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => setDocFile(ev.target?.result as string)
    reader.readAsDataURL(file)
  }

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
                  {isCrossBorder && <span style={{ fontSize:'0.65rem', fontWeight:700, color:'#f59e0b', background:'rgba(245,158,11,0.1)', border:'1px solid rgba(245,158,11,0.3)', borderRadius:99, padding:'0.12rem 0.5rem' }}>🌍 Cross-Border</span>}
                </div>
                <p style={{ fontSize:'0.75rem', color:'var(--clr-muted)', marginTop:'0.15rem' }}>{fmtDate(localJob.created_at)}</p>
              </div>
              <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--clr-muted)', padding:'0.2rem', display:'flex', alignItems:'center' }}>
                <LuX size={18}/>
              </button>
            </div>
            {/* Tabs */}
            <div style={{ display:'flex', gap:'0.25rem', background:'rgba(255,255,255,0.04)', borderRadius:10, padding:'0.25rem', marginBottom:'1rem' }}>
              {(isCrossBorder ? ['info','chat','docs'] as const : ['info','chat'] as const).map(t => (
                <button key={t} onClick={() => setTab(t as any)} style={{ flex:1, padding:'0.4rem', border:'none', borderRadius:8, background: tab === t ? 'rgba(0,229,255,0.12)' : 'transparent', color: tab === t ? 'var(--clr-accent)' : 'var(--clr-muted)', fontFamily:'inherit', fontSize:'0.78rem', fontWeight:700, cursor:'pointer', transition:'all 0.15s', outline: tab === t ? '1px solid rgba(0,229,255,0.2)' : 'none', position:'relative' }}>
                  {t === 'info' ? 'Job Details' : t === 'docs' ? <><LuFileText size={12} style={{ marginRight:3 }}/> Docs</> : (
                    <>{unreadChat && tab !== 'chat' && <span style={{ position:'absolute', top:2, right:2, width:7, height:7, borderRadius:'50%', background:'#f87171', boxShadow:'0 0 4px #f87171' }}/>}Admin Chat</>
                  )}
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
                    ['Weight', localJob.estimated_weight_kg != null ? `${localJob.estimated_weight_kg} kg` : '—'],
                    ['Pickup', localJob.pickup_address],
                    ['Delivery', localJob.delivery_address],
                    ['Fare', `${(localJob.final_price ?? localJob.estimated_price).toLocaleString()} ${localJob.currency ?? 'ETB'}`],
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

                  {/* IN_TRANSIT: cross-border can go to AT_BORDER, regular goes to DELIVERED */}
                  {status === 'IN_TRANSIT' && isCrossBorder && (
                    <button onClick={() => handleStatus('AT_BORDER')} disabled={actionLoading}
                      style={{ width:'100%', padding:'0.65rem', borderRadius:10, border:'1px solid rgba(245,158,11,0.3)', background:'rgba(245,158,11,0.08)', color:'#f59e0b', fontFamily:'inherit', fontSize:'0.82rem', fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:'0.4rem' }}>
                      {actionLoading ? <Spinner/> : <>🌍 Arrived at Border Crossing</>}
                    </button>
                  )}
                  {status === 'IN_TRANSIT' && (
                    <button onClick={() => setOtpModal('delivery')}
                      style={{ width:'100%', padding:'0.65rem', borderRadius:10, border:'none', background:'#4ade80', color:'#080b14', fontFamily:'inherit', fontSize:'0.82rem', fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:'0.4rem' }}>
                      <LuCircleCheck size={14}/> Verify Delivery OTP → Delivered
                    </button>
                  )}

                  {/* Cross-border status info banner */}
                  {['AT_BORDER','IN_CUSTOMS','CUSTOMS_CLEARED'].includes(status) && (
                    <div style={{ padding:'0.75rem 1rem', borderRadius:10, background:'rgba(245,158,11,0.06)', border:'1px solid rgba(245,158,11,0.2)', fontSize:'0.78rem', color:'#f59e0b' }}>
                      {status === 'AT_BORDER' && '🛂 Waiting at border. Upload checkpoint photo in the Docs tab.'}
                      {status === 'IN_CUSTOMS' && '📋 Shipment is under customs review.'}
                      {status === 'CUSTOMS_CLEARED' && '✅ Customs cleared! Mark as In Transit to resume delivery.'}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── Docs tab (cross-border only) ── */}
            {tab === 'docs' && isCrossBorder && (
              <div style={{ display:'flex', flexDirection:'column', gap:'1rem' }}>
                <div className="glass-inner" style={{ padding:'0.85rem 1rem', fontSize:'0.8rem' }}>
                  <p style={{ fontWeight:700, color:'var(--clr-text)', marginBottom:'0.5rem' }}>Border Info</p>
                  {[
                    ['Border Ref', localJob.border_crossing_ref],
                    ['Customs Ref', localJob.customs_declaration_ref],
                    ['HS Code', localJob.hs_code],
                    ['Shipper TIN', localJob.shipper_tin],
                  ].map(([l, v]) => v ? (
                    <div key={l} style={{ display:'flex', gap:'0.5rem', marginBottom:'0.3rem' }}>
                      <span style={{ color:'var(--clr-muted)', width:90, flexShrink:0 }}>{l}</span>
                      <span style={{ color:'var(--clr-text)', fontWeight:500, wordBreak:'break-all' }}>{v}</span>
                    </div>
                  ) : null)}
                </div>

                <div className="glass-inner" style={{ padding:'1rem' }}>
                  <p style={{ fontWeight:700, color:'var(--clr-text)', fontSize:'0.85rem', marginBottom:'0.75rem' }}>Upload Document</p>
                  {docErr && <div className="alert alert-error" style={{ marginBottom:'0.6rem', fontSize:'0.78rem' }}><LuTriangleAlert size={12}/> {docErr}</div>}
                  {docSuccess && <div className="alert alert-success" style={{ marginBottom:'0.6rem', fontSize:'0.78rem' }}><LuCheck size={12}/> {docSuccess}</div>}
                  <div style={{ display:'flex', flexDirection:'column', gap:'0.5rem' }}>
                    <select value={docType} onChange={e => setDocType(e.target.value)}
                      style={{ padding:'0.5rem 0.75rem', borderRadius:8, border:'1px solid rgba(255,255,255,0.1)', background:'rgba(255,255,255,0.04)', color:'var(--clr-text)', fontFamily:'inherit', fontSize:'0.8rem', outline:'none' }}>
                      {['CHECKPOINT_PHOTO','COMMERCIAL_INVOICE','BILL_OF_LADING','PACKING_LIST','CERTIFICATE_OF_ORIGIN','OTHER'].map(t => (
                        <option key={t} value={t}>{t.replace(/_/g,' ')}</option>
                      ))}
                    </select>
                    <input ref={fileInputRef} type="file" accept="image/*,application/pdf" onChange={handleFileChange}
                      style={{ padding:'0.4rem', borderRadius:8, border:'1px solid rgba(255,255,255,0.1)', background:'rgba(255,255,255,0.04)', color:'var(--clr-text)', fontSize:'0.78rem' }}/>
                    <input value={docNotes} onChange={e => setDocNotes(e.target.value)} placeholder="Notes (optional)"
                      style={{ padding:'0.5rem 0.75rem', borderRadius:8, border:'1px solid rgba(255,255,255,0.1)', background:'rgba(255,255,255,0.04)', color:'var(--clr-text)', fontFamily:'inherit', fontSize:'0.8rem', outline:'none' }}/>
                    <button onClick={handleUploadDoc} disabled={docUploading || !docFile}
                      style={{ padding:'0.6rem', borderRadius:10, border:'none', background: docFile ? 'var(--clr-accent)' : 'rgba(255,255,255,0.08)', color: docFile ? '#080b14' : 'var(--clr-muted)', fontFamily:'inherit', fontSize:'0.82rem', fontWeight:700, cursor: docFile ? 'pointer' : 'not-allowed', display:'flex', alignItems:'center', justifyContent:'center', gap:'0.4rem' }}>
                      {docUploading ? <Spinner/> : <><LuUpload size={14}/> Upload</>}
                    </button>
                  </div>
                </div>
                <div className="glass-inner" style={{ padding:'0.85rem 1rem', marginTop:'0.6rem' }}>
                  <p style={{ fontWeight:700, color:'var(--clr-text)', marginBottom:'0.6rem', fontSize:'0.85rem' }}>Uploaded Documents</p>
                  {docsLoading ? (
                    <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', color:'var(--clr-muted)', fontSize:'0.8rem' }}><Spinner/> Loading…</div>
                  ) : cbDocs.length === 0 ? (
                    <p style={{ fontSize:'0.78rem', color:'var(--clr-muted)', padding:'0.25rem 0' }}>No documents uploaded yet.</p>
                  ) : (
                    <div style={{ display:'flex', flexDirection:'column', gap:'0.75rem' }}>
                      {cbDocs.map(doc => {
                        const apiBase = (import.meta.env.VITE_API_BASE_URL as string ?? '').replace(/\/api$/, '')
                        const href = doc.file_url?.startsWith('/') ? `${apiBase}${doc.file_url}` : doc.file_url
                        const statusColor  = doc.status === 'APPROVED' ? '#10b981' : doc.status === 'REJECTED' ? '#f87171' : '#f59e0b'
                        const statusBg     = doc.status === 'APPROVED' ? 'rgba(16,185,129,0.12)' : doc.status === 'REJECTED' ? 'rgba(248,113,113,0.12)' : 'rgba(245,158,11,0.12)'
                        const borderColor  = doc.status === 'APPROVED' ? 'rgba(16,185,129,0.25)' : doc.status === 'REJECTED' ? 'rgba(248,113,113,0.25)' : 'rgba(245,158,11,0.25)'
                        const statusLabel  = doc.status === 'APPROVED' ? '✓ Approved' : doc.status === 'REJECTED' ? '✗ Rejected' : '⏳ Pending Review'
                        return (
                          <div key={doc.id} style={{ background:'rgba(255,255,255,0.03)', border:`1px solid ${borderColor}`, borderRadius:12, padding:'0.75rem 0.9rem', display:'flex', flexDirection:'column', gap:'0.4rem' }}>
                            {/* Doc type + status badge */}
                            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:'0.5rem', flexWrap:'wrap' }}>
                              <span style={{ fontSize:'0.82rem', fontWeight:700, color:'var(--clr-text)' }}>
                                {doc.document_type?.replace(/_/g,' ')}
                              </span>
                              <span style={{ fontSize:'0.7rem', fontWeight:700, color: statusColor, background: statusBg, border:`1px solid ${borderColor}`, borderRadius:99, padding:'0.15rem 0.55rem', letterSpacing:'0.04em', textTransform:'uppercase', whiteSpace:'nowrap' }}>
                                {statusLabel}
                              </span>
                            </div>

                            {/* Upload notes */}
                            {doc.notes && <p style={{ fontSize:'0.73rem', color:'var(--clr-muted)', margin:0, fontStyle:'italic' }}>"{doc.notes}"</p>}

                            {/* Uploader + date */}
                            <div style={{ fontSize:'0.71rem', color:'var(--clr-muted)' }}>
                              By {doc.uploader_first_name ?? 'You'} {doc.uploader_last_name ?? ''} · {new Date(doc.created_at).toLocaleString()}
                            </div>

                            {/* View link */}
                            <a href={href} target="_blank" rel="noreferrer"
                              style={{ fontSize:'0.74rem', color:'var(--clr-accent)', display:'inline-flex', alignItems:'center', gap:'0.25rem', width:'fit-content' }}>
                              <LuFileText size={12}/> View document ↗
                            </a>

                            {/* Approved with notes */}
                            {doc.status === 'APPROVED' && doc.review_notes && (
                              <div style={{ padding:'0.4rem 0.6rem', borderRadius:8, background:'rgba(16,185,129,0.08)', border:'1px solid rgba(16,185,129,0.2)', fontSize:'0.73rem', color:'#10b981' }}>
                                <b>Review note:</b> {doc.review_notes}
                              </div>
                            )}

                            {/* Rejected: show reason */}
                            {doc.status === 'REJECTED' && (
                              <div style={{ padding:'0.4rem 0.6rem', borderRadius:8, background:'rgba(248,113,113,0.08)', border:'1px solid rgba(248,113,113,0.2)', fontSize:'0.73rem', color:'#f87171' }}>
                                <b>Reason for rejection:</b> {doc.review_notes || 'No reason provided.'}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── Admin Chat tab ── */}
            {tab === 'chat' && (
              <div style={{ display:'flex', flexDirection:'column', height:'100%' }}>
                <p style={{ fontSize:'0.72rem', color:'var(--clr-muted)', marginBottom:'0.5rem', flexShrink:0 }}>This chat is with Admin / Support only.</p>
                <div style={{ flex:1, display:'flex', flexDirection:'column', gap:'0.6rem', minHeight:200, maxHeight:340, overflowY:'auto', padding:'0.25rem 0' }}>
                  {messages.length === 0 ? (
                    <div style={{ textAlign:'center', color:'var(--clr-muted)', padding:'2rem', fontSize:'0.85rem' }}>No messages yet. Send a message to Admin.</div>
                  ) : messages.map(m => {
                    const isMe = m.sender_role_id === 3
                    const roleLabel = m.sender_role_id === 1 ? 'Admin' : m.sender_role_id === 4 ? 'Staff' : 'You'
                    return (
                      <div key={m.id} style={{ display:'flex', flexDirection:'column', alignItems: isMe ? 'flex-end' : 'flex-start' }}>
                        <div style={{ maxWidth:'80%', background: isMe ? 'rgba(0,229,255,0.12)' : 'rgba(255,255,255,0.05)', border: isMe ? '1px solid rgba(0,229,255,0.2)' : '1px solid rgba(255,255,255,0.08)', borderRadius:12, padding:'0.55rem 0.85rem' }}>
                          <p style={{ fontSize:'0.8rem', color:'var(--clr-text)', lineHeight:1.5, wordBreak:'break-word' }}>{m.message}</p>
                        </div>
                        <p style={{ fontSize:'0.65rem', color:'var(--clr-muted)', marginTop:'0.15rem', paddingInline:'0.25rem' }}>{m.sender_first_name} · {roleLabel} · {fmtDate(m.created_at)}</p>
                      </div>
                    )
                  })}
                  <div ref={msgBottom}/>
                </div>
                <div style={{ display:'flex', gap:'0.5rem', marginTop:'0.75rem', flexShrink:0 }}>
                  <input value={msgText} onChange={e => setMsgText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
                    placeholder="Message Admin…" style={{ flex:1, padding:'0.6rem 0.85rem', borderRadius:10, border:'1px solid rgba(255,255,255,0.1)', background:'rgba(255,255,255,0.04)', color:'var(--clr-text)', fontFamily:'inherit', fontSize:'0.85rem', outline:'none' }}/>
                  <button onClick={handleSend} disabled={sending || !msgText.trim()}
                    style={{ padding:'0.6rem 0.85rem', borderRadius:10, border:'none', background:'var(--clr-accent)', color:'#080b14', cursor:'pointer', display:'flex', alignItems:'center', opacity: sending || !msgText.trim() ? 0.5 : 1 }}>
                    {sending ? <Spinner/> : <LuSend size={16}/>}
                  </button>
                </div>
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
  const [autoPing, setAutoPing] = useState(true)
  const [intervalSec, setIntervalSec] = useState<10 | 20 | 30>(20)
  const [geoPerm, setGeoPerm] = useState<'granted' | 'denied' | 'prompt' | 'unknown'>('unknown')
  const timerRef = useRef<number | null>(null)
  const inFlightRef = useRef(false)

  const clearTimer = useCallback(() => {
    if (timerRef.current != null) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const ping = useCallback(() => {
    if (!navigator.geolocation) {
      setMsg('Geolocation not supported on this device/browser.')
      return
    }
    if (inFlightRef.current) return

    inFlightRef.current = true
    setPinging(true)
    setMsg('')

    navigator.geolocation.getCurrentPosition(
      async pos => {
        try {
          await driverApi.pingLocation({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            order_id: activeJobId ?? undefined,
            heading: pos.coords.heading ?? undefined,
            speed_kmh: pos.coords.speed != null ? pos.coords.speed * 3.6 : undefined,
          })
          setGeoPerm('granted')
          setMsg('Location updated ✓')
        } catch {
          setMsg('Ping failed. Please try again.')
        } finally {
          setPinging(false)
          inFlightRef.current = false
          setTimeout(() => setMsg(''), 3000)
        }
      },
      err => {
        setPinging(false)
        inFlightRef.current = false
        if (err.code === 1) {
          setGeoPerm('denied')
          setMsg('Location permission denied. Please allow location to share live tracking.')
        } else {
          setMsg('Could not get current location.')
          setTimeout(() => setMsg(''), 3000)
        }
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 5000 }
    )
  }, [activeJobId])

  useEffect(() => {
    if (!navigator.permissions?.query) return
    let mounted = true
    navigator.permissions
      .query({ name: 'geolocation' as PermissionName })
      .then(status => {
        if (!mounted) return
        setGeoPerm(status.state as 'granted' | 'denied' | 'prompt')
        status.onchange = () => setGeoPerm(status.state as 'granted' | 'denied' | 'prompt')
      })
      .catch(() => {})
    return () => { mounted = false }
  }, [])

  useEffect(() => {
    clearTimer()
    if (!autoPing) return
    if (!navigator.geolocation) {
      setMsg('Geolocation not supported on this device/browser.')
      return
    }
    if (geoPerm === 'denied') {
      setMsg('Please allow location permission to enable live tracking.')
      return
    }

    // Trigger immediately, then continue at the selected interval.
    ping()
    timerRef.current = window.setInterval(() => {
      ping()
    }, intervalSec * 1000)

    return clearTimer
  }, [autoPing, intervalSec, geoPerm, ping, clearTimer])

  useEffect(() => {
    return clearTimer
  }, [clearTimer])

  return (
    <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', flexWrap:'wrap' }}>
      <button onClick={ping} disabled={pinging}
        style={{ display:'flex', alignItems:'center', gap:'0.4rem', padding:'0.38rem 0.75rem', borderRadius:8, border:'1px solid rgba(0,229,255,0.25)', background:'rgba(0,229,255,0.07)', color:'var(--clr-accent)', fontFamily:'inherit', fontSize:'0.76rem', fontWeight:700, cursor:'pointer' }}>
        {pinging ? <><Spinner/> Pinging…</> : <><LuNavigation size={13}/> Ping My Location</>}
      </button>
      <button onClick={() => setAutoPing(v => !v)}
        style={{ padding:'0.38rem 0.65rem', borderRadius:8, border:'1px solid rgba(255,255,255,0.12)', background:autoPing ? 'rgba(74,222,128,0.14)' : 'rgba(255,255,255,0.05)', color:autoPing ? '#4ade80' : 'var(--clr-muted)', fontFamily:'inherit', fontSize:'0.72rem', fontWeight:700, cursor:'pointer' }}>
        Auto: {autoPing ? 'ON' : 'OFF'}
      </button>
      <select
        value={intervalSec}
        onChange={e => setIntervalSec(Number(e.target.value) as 10 | 20 | 30)}
        style={{ padding:'0.35rem 0.5rem', borderRadius:8, border:'1px solid rgba(255,255,255,0.12)', background:'rgba(255,255,255,0.04)', color:'var(--clr-text)', fontFamily:'inherit', fontSize:'0.72rem', fontWeight:600 }}
      >
        <option value={10}>10s</option>
        <option value={20}>20s</option>
        <option value={30}>30s</option>
      </select>
      {autoPing && geoPerm === 'prompt' && (
        <span style={{ fontSize:'0.72rem', color:'#fbbf24' }}>Please allow location when your browser asks.</span>
      )}
      {msg && <span style={{ fontSize:'0.72rem', color: msg.includes('✓') ? '#4ade80' : '#f87171' }}>{msg}</span>}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
type JobTab = 'active' | 'completed'

export default function DriverJobsPage() {
  const { user } = useAuth()
  const [jobTab, setJobTab] = useState<JobTab>('active')
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(false)
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null)
  const [selectedJob, setSelectedJob] = useState<Job | null>(null)
  const [selectedJobs, setSelectedJobs] = useState<Set<string>>(new Set())
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({})
  const [bulkLoading, setBulkLoading] = useState(false)
  const [bulkMsg, setBulkMsg] = useState('')

  const loadUnreadCounts = useCallback(() => {
    driverApi.getUnreadCounts().then(r => setUnreadCounts(r.data.counts ?? {})).catch(() => {})
  }, [])

  const loadJobs = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await driverApi.listJobs()
      setJobs(data.jobs ?? [])
      setLastSyncAt(new Date())
    } catch { /* silent */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { loadJobs(); loadUnreadCounts() }, []) // eslint-disable-line

  useEffect(() => {
    const refresh = () => { loadJobs(); loadUnreadCounts() }
    const timer = window.setInterval(refresh, 15000)
    const onFocus = () => refresh()
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh()
    }

    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [loadJobs, loadUnreadCounts])

  const active = jobs.filter(j => !['DELIVERED','CANCELLED'].includes(j.status))
  const completed = jobs.filter(j => ['DELIVERED','CANCELLED'].includes(j.status))
  const visible = jobTab === 'active' ? active : completed

  // Find any currently active job (IN_TRANSIT or AT_PICKUP) for GPS ping
  const activeJob = jobs.find(j => ['EN_ROUTE','AT_PICKUP','IN_TRANSIT'].includes(j.status)) ?? null

  const toggleSelect = (id: string) => {
    setSelectedJobs(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const clearSelection = () => setSelectedJobs(new Set())

  const bulkDeliver = async () => {
    const ids = Array.from(selectedJobs)
    setBulkLoading(true); setBulkMsg('')
    const results = await driverApi.bulkUpdateStatus(ids, 'DELIVERED')
    const failed = results.filter(r => r.status === 'rejected').length
    setBulkMsg(failed === 0 ? `${ids.length} job${ids.length > 1 ? 's' : ''} marked delivered ✓` : `${ids.length - failed} succeeded, ${failed} failed`)
    clearSelection(); loadJobs(); loadUnreadCounts()
    setBulkLoading(false); setTimeout(() => setBulkMsg(''), 4000)
  }

  const bulkCancel = async () => {
    const ids = Array.from(selectedJobs).filter(id => {
      const j = jobs.find(jj => jj.id === id)
      return j && ['PENDING','ASSIGNED'].includes(j.status)
    })
    if (ids.length === 0) { setBulkMsg('No PENDING/ASSIGNED jobs in selection to cancel.'); setTimeout(() => setBulkMsg(''), 3000); return }
    if (!window.confirm(`Cancel ${ids.length} job${ids.length > 1 ? 's' : ''}?`)) return
    setBulkLoading(true); setBulkMsg('')
    const results = await driverApi.bulkUpdateStatus(ids, 'CANCELLED')
    const failed = results.filter(r => r.status === 'rejected').length
    setBulkMsg(failed === 0 ? `${ids.length} job${ids.length > 1 ? 's' : ''} cancelled ✓` : `${ids.length - failed} succeeded, ${failed} failed`)
    clearSelection(); loadJobs(); loadUnreadCounts()
    setBulkLoading(false); setTimeout(() => setBulkMsg(''), 4000)
  }

  return (
    <div className="page-shell" style={{ alignItems:'flex-start' }}>
      <div style={{ width:'100%', maxWidth:840, display:'flex', flexDirection:'column', gap:'1.25rem' }}>

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
              <p style={{ fontSize:'0.72rem', color:'var(--clr-muted)', marginTop:'0.15rem' }}>
                Driver: {user?.first_name ?? '—'} {user?.last_name ?? ''}{user?.phone_number ? ` (${user.phone_number})` : ''}
                {lastSyncAt ? ` · Synced ${lastSyncAt.toLocaleTimeString()}` : ''}
              </p>
            </div>
            <div style={{ display:'flex', gap:'0.5rem', alignItems:'center', flexWrap:'wrap' }}>
              <GpsPingButton activeJobId={activeJob?.id ?? null}/>
              <button onClick={() => { loadJobs(); loadUnreadCounts() }} disabled={loading}
                style={{ display:'flex', alignItems:'center', gap:'0.35rem', padding:'0.38rem 0.75rem', borderRadius:8, border:'1px solid rgba(255,255,255,0.1)', background:'rgba(255,255,255,0.04)', color:'var(--clr-muted)', fontFamily:'inherit', fontSize:'0.76rem', fontWeight:600, cursor:'pointer' }}>
                <LuRefreshCw size={13}/> Refresh
              </button>
            </div>
          </div>

          {/* Tab switcher */}
          <div style={{ display:'flex', gap:'0.25rem', background:'rgba(255,255,255,0.04)', borderRadius:10, padding:'0.25rem', marginTop:'1rem' }}>
            {(['active','completed'] as JobTab[]).map(t => (
              <button key={t} onClick={() => { setJobTab(t); clearSelection() }} style={{ flex:1, padding:'0.45rem', border:'none', borderRadius:8, background: jobTab === t ? 'rgba(0,229,255,0.12)' : 'transparent', color: jobTab === t ? 'var(--clr-accent)' : 'var(--clr-muted)', fontFamily:'inherit', fontSize:'0.78rem', fontWeight:700, cursor:'pointer', transition:'all 0.15s', outline: jobTab === t ? '1px solid rgba(0,229,255,0.2)' : 'none', display:'flex', alignItems:'center', justifyContent:'center', gap:'0.35rem' }}>
                {t === 'active' ? <><LuClock size={13}/> Active ({active.length})</> : <><LuCircleCheck size={13}/> Completed ({completed.length})</>}
              </button>
            ))}
          </div>
        </div>

        {/* ── Bulk Action Bar ── */}
        {selectedJobs.size > 0 && (
          <div className="glass" style={{ padding:'0.75rem 1.25rem', display:'flex', alignItems:'center', gap:'0.65rem', flexWrap:'wrap', border:'1px solid rgba(0,229,255,0.2)' }}>
            <span style={{ fontSize:'0.8rem', fontWeight:700, color:'var(--clr-accent)', flex:1, minWidth:120 }}>
              {selectedJobs.size} job{selectedJobs.size > 1 ? 's' : ''} selected
            </span>
            <button onClick={bulkDeliver} disabled={bulkLoading}
              style={{ display:'flex', alignItems:'center', gap:'0.35rem', padding:'0.4rem 0.85rem', borderRadius:8, border:'1px solid rgba(74,222,128,0.3)', background:'rgba(74,222,128,0.1)', color:'#4ade80', fontFamily:'inherit', fontSize:'0.78rem', fontWeight:700, cursor:'pointer', opacity: bulkLoading ? 0.6 : 1 }}>
              <LuCheck size={13}/> Mark Delivered
            </button>
            <button onClick={bulkCancel} disabled={bulkLoading}
              style={{ display:'flex', alignItems:'center', gap:'0.35rem', padding:'0.4rem 0.85rem', borderRadius:8, border:'1px solid rgba(248,113,113,0.3)', background:'rgba(248,113,113,0.08)', color:'#f87171', fontFamily:'inherit', fontSize:'0.78rem', fontWeight:700, cursor:'pointer', opacity: bulkLoading ? 0.6 : 1 }}>
              <LuBan size={13}/> Cancel
            </button>
            <button onClick={clearSelection}
              style={{ display:'flex', alignItems:'center', gap:'0.25rem', padding:'0.38rem 0.6rem', borderRadius:8, border:'1px solid rgba(255,255,255,0.1)', background:'none', color:'var(--clr-muted)', fontFamily:'inherit', fontSize:'0.75rem', cursor:'pointer' }}>
              <LuX size={12}/> Clear
            </button>
            {bulkMsg && <span style={{ fontSize:'0.75rem', color: bulkMsg.includes('✓') ? '#4ade80' : '#fbbf24', width:'100%' }}>{bulkMsg}</span>}
          </div>
        )}
        {!selectedJobs.size && bulkMsg && (
          <div style={{ textAlign:'center', fontSize:'0.78rem', color: bulkMsg.includes('✓') ? '#4ade80' : '#fbbf24', padding:'0.4rem', background:'rgba(255,255,255,0.03)', borderRadius:8 }}>{bulkMsg}</div>
        )}

        {/* ── Job List ── */}
        <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', marginBottom:'1rem' }}>
          {visible.length > 1 && (
            <button onClick={() => {
              if (selectedJobs.size === visible.length) clearSelection()
              else setSelectedJobs(new Set(visible.map(j => j.id)))
            }} style={{ display:'flex', alignItems:'center', gap:'0.35rem', background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)', cursor:'pointer', color:'var(--clr-muted)', fontFamily:'inherit', fontSize:'0.75rem', padding:'0.4rem 0.8rem', borderRadius:8 }}>
              {selectedJobs.size === visible.length
                ? <><LuSquareCheck size={14} color="var(--clr-accent)"/> Deselect All</>
                : <><LuSquare size={14}/> Select All</>}
            </button>
          )}
        </div>

        <div style={{ display:'grid', gap:'1rem', gridTemplateColumns:'repeat(auto-fill, minmax(320px, 1fr))' }}>
          {loading ? (
            <div style={{ gridColumn:'1/-1', display:'flex', justifyContent:'center', padding:'2.5rem', color:'var(--clr-muted)', gap:'0.65rem', alignItems:'center' }}>
              <Spinner/> Loading jobs…
            </div>
          ) : visible.length === 0 ? (
            <div className="glass-inner" style={{ gridColumn:'1/-1', textAlign:'center', padding:'3rem 1rem', color:'var(--clr-muted)', fontSize:'0.875rem' }}>
              <LuTruck size={36} style={{ opacity:0.25, display:'block', margin:'0 auto 1rem' }}/>
              {jobTab === 'active' ? 'No active jobs right now.' : 'No completed jobs yet.'}
            </div>
          ) : visible.map(job => {
            const isSelected = selectedJobs.has(job.id)
            const unread = unreadCounts[job.id] ?? 0
            return (
              <div key={job.id} className="glass-inner"
                style={{ padding:'0.9rem 1rem', cursor:'pointer', transition:'background 0.15s', display:'flex', flexDirection:'column', justifyContent:'space-between', outline: isSelected ? '2px solid rgba(0,229,255,0.35)' : 'none' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
                onMouseLeave={e => (e.currentTarget.style.background = '')}>
                
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:'0.5rem', marginBottom:'0.5rem' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', flexWrap:'wrap' }} onClick={() => setSelectedJob(job)}>
                    <span style={{ fontWeight:800, fontSize:'0.88rem', color:'var(--clr-text)' }}>{job.reference_code}</span>
                    {statusBadge(job.status)}
                    {!!job.is_cross_border && <span style={{ fontSize:'0.63rem', fontWeight:700, color:'#f59e0b', background:'rgba(245,158,11,0.08)', border:'1px solid rgba(245,158,11,0.25)', borderRadius:99, padding:'0.1rem 0.45rem' }}>🌍 Cross-Border</span>}
                    {unread > 0 && (
                      <span style={{ display:'flex', alignItems:'center', gap:'0.25rem', fontSize:'0.68rem', fontWeight:700, color:'#fff', background:'#ef4444', borderRadius:99, padding:'0.12rem 0.45rem', lineHeight:1 }}>
                        <LuMessageSquare size={10}/> {unread}
                      </span>
                    )}
                  </div>
                  <div style={{ textAlign:'right', flexShrink:0 }} onClick={() => setSelectedJob(job)}>
                    <span style={{ fontWeight:800, fontSize:'0.88rem', color:'var(--clr-accent)' }}>{(job.final_price ?? job.estimated_price).toLocaleString()} ETB</span>
                    <div style={{ fontSize:'0.68rem', color:'var(--clr-muted)', marginTop:'0.2rem' }}>
                      {fmtDate(job.created_at).split(',')[0]}
                    </div>
                  </div>
                </div>

                <div style={{ display:'flex', flexDirection:'column', gap:'0.4rem', marginBottom:'0.75rem' }} onClick={() => setSelectedJob(job)}>
                  <p style={{ fontSize:'0.75rem', color:'var(--clr-muted)', display:'flex', alignItems:'center', gap:'0.4rem' }}>
                    <LuMapPin size={12}/> {job.pickup_address}
                  </p>
                  <p style={{ fontSize:'0.75rem', color:'var(--clr-muted)', display:'flex', alignItems:'center', gap:'0.4rem' }}>
                    <LuArrowRight size={12}/> {job.delivery_address}
                  </p>
                </div>

                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-end', gap:'0.5rem' }}>
                  <button
                    onClick={e => { e.stopPropagation(); toggleSelect(job.id) }}
                    style={{ background:'none', border:'none', cursor:'pointer', color: isSelected ? 'var(--clr-accent)' : 'var(--clr-muted)', padding:'0.2rem', display:'flex', alignItems:'center', flexShrink:0, gap:'0.25rem', fontSize:'0.75rem' }}>
                    {isSelected ? <LuSquareCheck size={16}/> : <LuSquare size={16}/>}
                    {isSelected ? 'Selected' : 'Select'}
                  </button>
                  <LuChevronRight size={14} style={{ color:'var(--clr-muted)' }} onClick={() => setSelectedJob(job)}/>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Job Detail Modal ── */}
      {selectedJob && (
        <JobDetailModal
          job={selectedJob}
          onClose={() => { setSelectedJob(null); loadUnreadCounts() }}
          onRefresh={loadJobs}
        />
      )}
    </div>
  )
}
