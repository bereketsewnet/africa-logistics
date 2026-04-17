import { useState, useEffect, useRef } from 'react'
import apiClient from '../lib/apiClient'
import { walletApi } from '../lib/apiClient'
import { useLanguage } from '../context/LanguageContext'
import {
  LuWallet, LuArrowDownLeft, LuArrowUpRight, LuTrendingUp, LuRefreshCw,
  LuLock, LuTriangleAlert, LuBanknote, LuClock, LuCheck, LuX,
  LuChevronDown, LuChevronUp, LuUpload, LuImage, LuStar, LuZap,
} from 'react-icons/lu'

const UPLOADS_BASE = (import.meta.env.VITE_API_BASE_URL as string).replace(/\/api\/?$/, '')

/* ── Interfaces ─────────────────────────────────────────────────────────── */
interface Wallet {
  id: string
  balance: number
  currency: string
  total_earned: number
  total_spent: number
  is_locked: boolean
  lock_reason?: string
}
interface Transaction {
  id: string
  type: 'CREDIT' | 'DEBIT' | 'COMMISSION' | 'TIP' | 'REFUND' | 'BONUS' | 'ADMIN_ADJUSTMENT'
  amount: number
  description: string
  created_at: string
}
interface WithdrawalRequest {
  id: string
  amount_requested: number
  amount_approved: number | null
  bank_details: { bank_name: string; account_number: string; account_name: string; method?: string }
  notes: string | null
  proof_image_url: string | null
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  admin_note: string | null
  admin_image_url: string | null
  commission_rate: number | null
  commission_amount: number | null
  created_at: string
  reviewed_at: string | null
}

/* ── Helpers ─────────────────────────────────────────────────────────────── */
const fmt = (n: number) =>
  n.toLocaleString('en-ET', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const TX_META: Record<string, { color: string; bg: string; icon: React.ReactElement; sign: string }> = {
  CREDIT:           { color: '#4ade80', bg: 'rgba(74,222,128,0.12)', icon: <LuArrowDownLeft size={17}/>, sign: '+' },
  BONUS:            { color: '#4ade80', bg: 'rgba(74,222,128,0.12)', icon: <LuStar size={17}/>,          sign: '+' },
  REFUND:           { color: '#4ade80', bg: 'rgba(74,222,128,0.12)', icon: <LuArrowDownLeft size={17}/>, sign: '+' },
  DEBIT:            { color: '#f87171', bg: 'rgba(248,113,113,0.12)', icon: <LuArrowUpRight size={17}/>,  sign: '-' },
  COMMISSION:       { color: '#fbbf24', bg: 'rgba(251,191,36,0.12)',  icon: <LuZap size={17}/>,           sign: '-' },
  TIP:              { color: '#fbbf24', bg: 'rgba(251,191,36,0.12)',  icon: <LuTrendingUp size={17}/>,    sign: '+' },
  ADMIN_ADJUSTMENT: { color: '#a78bfa', bg: 'rgba(167,139,250,0.12)', icon: <LuZap size={17}/>,           sign: '+' },
}

const STATUS_CFG: Record<string, { color: string; bg: string; label: string }> = {
  PENDING:  { color: '#fbbf24', bg: 'rgba(251,191,36,0.1)',  label: '⏳ Pending' },
  APPROVED: { color: '#4ade80', bg: 'rgba(74,222,128,0.1)', label: '✓ Approved' },
  REJECTED: { color: '#f87171', bg: 'rgba(248,113,113,0.1)', label: '✕ Rejected' },
}

/* ── Keyframe styles (injected once) ────────────────────────────────────── */
const STYLE_TAG = `
  @keyframes wlt-pulse-ring {
    0%   { transform: scale(0.9); opacity: 0.8; }
    100% { transform: scale(1.6); opacity: 0; }
  }
  @keyframes wlt-float {
    0%,100% { transform: translateY(0px); }
    50%      { transform: translateY(-6px); }
  }
  @keyframes wlt-shimmer {
    0%   { background-position: -200% center; }
    100% { background-position:  200% center; }
  }
  @keyframes wlt-slide-down {
    from { opacity: 0; transform: translateY(-10px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes wlt-glow {
    0%,100% { box-shadow: 0 0 20px rgba(0,229,255,0.2), 0 0 60px rgba(0,229,255,0.05); }
    50%      { box-shadow: 0 0 35px rgba(0,229,255,0.4), 0 0 80px rgba(0,229,255,0.15); }
  }
  @keyframes wlt-stat-in {
    from { opacity: 0; transform: translateY(12px) scale(0.92); }
    to   { opacity: 1; transform: translateY(0) scale(1); }
  }
  .wlt-card-hero {
    position: relative;
    overflow: hidden;
    border-radius: 20px;
    background: linear-gradient(145deg, rgba(124,58,237,0.18) 0%, rgba(14,165,233,0.12) 50%, rgba(0,229,255,0.08) 100%);
    border: 1px solid rgba(0,229,255,0.18);
    padding: 1.25rem 1.5rem;
    animation: wlt-glow 4s ease-in-out infinite;
  }
  .wlt-card-hero::before {
    content: '';
    position: absolute;
    inset: -2px;
    border-radius: 21px;
    background: linear-gradient(135deg, rgba(0,229,255,0.3), rgba(124,58,237,0.3), rgba(0,229,255,0.1));
    mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
    -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
    mask-composite: exclude;
    -webkit-mask-composite: xor;
    padding: 1px;
    pointer-events: none;
    opacity: 0.6;
  }
  .wlt-orb {
    position: absolute;
    border-radius: 50%;
    pointer-events: none;
    filter: blur(40px);
    opacity: 0.2;
  }
  .wlt-balance-num {
    background: linear-gradient(90deg, #e2e8f0, #00e5ff, #7c3aed, #00e5ff, #e2e8f0);
    background-size: 200% auto;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    animation: wlt-shimmer 4s linear infinite;
    font-size: clamp(2.2rem, 5vw, 3.2rem);
    font-weight: 900;
    letter-spacing: -0.02em;
    line-height: 1;
  }
  .wlt-stat-chip {
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 12px;
    padding: 0.7rem 1rem;
    animation: wlt-stat-in 0.5s ease both;
  }
  .wlt-tx-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.85rem 1rem;
    border-radius: 14px;
    background: rgba(255,255,255,0.02);
    border: 1px solid rgba(255,255,255,0.05);
    transition: all 0.2s;
    cursor: default;
  }
  .wlt-tx-row:hover {
    background: rgba(255,255,255,0.045);
    border-color: rgba(0,229,255,0.12);
    transform: translateX(3px);
  }
  .wlt-wd-card {
    border-radius: 16px;
    padding: 1rem 1.1rem;
    border-left: 3px solid var(--sc);
    background: rgba(255,255,255,0.025);
    border-top: 1px solid rgba(255,255,255,0.06);
    border-right: 1px solid rgba(255,255,255,0.06);
    border-bottom: 1px solid rgba(255,255,255,0.06);
    transition: all 0.2s;
  }
  .wlt-wd-card:hover { background: rgba(255,255,255,0.04); transform: translateX(2px); }
  .wlt-form-slide { animation: wlt-slide-down 0.28s ease; }
  .wlt-withdraw-btn {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.55rem;
    padding: 0.85rem;
    border-radius: 14px;
    border: 1px solid rgba(0,229,255,0.25);
    background: linear-gradient(145deg, rgba(0,229,255,0.08), rgba(124,58,237,0.06));
    color: #00e5ff;
    font-family: inherit;
    font-size: 0.95rem;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.22s;
    margin-top: 1.25rem;
    letter-spacing: 0.02em;
  }
  .wlt-withdraw-btn:hover {
    background: linear-gradient(145deg, rgba(0,229,255,0.14), rgba(124,58,237,0.1));
    border-color: rgba(0,229,255,0.45);
    box-shadow: 0 0 20px rgba(0,229,255,0.15);
    transform: translateY(-1px);
  }
  .wlt-section-title {
    font-size: 0.78rem;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--clr-muted);
    margin-bottom: 0.9rem;
    display: flex;
    align-items: center;
    gap: 0.45rem;
  }
  .wlt-prog-bar {
    height: 4px; border-radius: 99px;
    background: rgba(255,255,255,0.07);
    overflow: hidden;
    margin-top: 0.4rem;
  }
  .wlt-prog-fill {
    height: 100%;
    border-radius: 99px;
    background: linear-gradient(90deg, #7c3aed, #00e5ff);
    transition: width 0.4s ease;
  }
  .wlt-img-thumb {
    width: 64px; height: 64px; object-fit: cover;
    border-radius: 10px;
    border: 1px solid rgba(255,255,255,0.1);
    cursor: pointer;
    transition: transform 0.2s;
  }
  .wlt-img-thumb:hover { transform: scale(1.05); }
  .wlt-drop-zone {
    display: flex; align-items: center; gap: 0.5rem;
    padding: 0.7rem 1rem; border-radius: 12px;
    border: 1.5px dashed rgba(255,255,255,0.15);
    cursor: pointer;
    font-size: 0.83rem; font-weight: 600;
    transition: all 0.18s;
  }
  .wlt-drop-zone:hover { border-color: rgba(0,229,255,0.4); color: #00e5ff; background: rgba(0,229,255,0.04); }
  .wlt-bottom-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
    align-items: start;
  }
  .wlt-bottom-grid > * {
    min-width: 0;
    overflow: hidden;
  }
  .wlt-stats-grid {
    position: relative;
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 0.6rem;
  }
  .wlt-bank-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.65rem;
  }
  @media (max-width: 700px) {
    .wlt-bottom-grid { grid-template-columns: 1fr; }
  }
  @media (max-width: 600px) {
    .wlt-tx-row { flex-wrap: wrap; gap: 0.4rem 0.5rem; padding: 0.7rem 0.75rem; }
    .wlt-tx-amount { width: 100%; text-align: right; padding-top: 0.2rem;
      border-top: 1px solid rgba(255,255,255,0.05); font-size: 0.88rem !important; }
  }
  @media (max-width: 480px) {
    .wlt-card-hero { padding: 1rem 0.85rem; }
    .wlt-balance-num { font-size: clamp(1.5rem, 7vw, 2.2rem); max-width: 100%; word-break: break-all; }
    .wlt-stat-chip { padding: 0.4rem 0.45rem; }
    .wlt-stat-chip p:first-child { font-size: 0.6rem !important; }
    .wlt-stat-chip p:last-child { font-size: 0.78rem !important; }
    .wlt-stats-grid { gap: 0.35rem; }
    .wlt-hero-top { flex-wrap: wrap; gap: 0.5rem; }
    .wlt-hero-icon-row { flex-wrap: wrap; gap: 0.75rem; min-width: 0; }
    .wlt-balance-wrap { min-width: 0; overflow: hidden; }
    .wlt-bank-grid { grid-template-columns: 1fr; }
    .wlt-tx-row { padding: 0.65rem 0.65rem; }
    .wlt-bottom-grid { gap: 0.75rem; }
    .wlt-section-title { font-size: 0.72rem; }
  }
`

/* ── Skeleton ────────────────────────────────────────────────────────────── */
function Skeleton() {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'1rem' }}>
      {[280, 180, 220].map((h, i) => (
        <div key={i} className="glass" style={{ height: h, borderRadius: 20, opacity: 0.4,
            animation: `pulse 1.6s ${i * 0.15}s ease-in-out infinite`,
            background: 'linear-gradient(135deg, rgba(124,58,237,0.1), rgba(0,229,255,0.05))' }} />
      ))}
    </div>
  )
}

/* ── Withdrawal Form ─────────────────────────────────────────────────────── */
function WithdrawalForm({ balance, onSuccess }: { balance: number; onSuccess: () => void }) {
  const { t: tr } = useLanguage()
  const [amount,      setAmount]      = useState('')
  const [bankName,    setBankName]    = useState('')
  const [accountNum,  setAccountNum]  = useState('')
  const [accountName, setAccountName] = useState('')
  const [method,      setMethod]      = useState('Bank Transfer')
  const [notes,       setNotes]       = useState('')
  const [proofB64,    setProofB64]    = useState<string | null>(null)
  const [proofName,   setProofName]   = useState('')
  const [proofPreview, setProofPreview] = useState<string | null>(null)
  const [submitting,  setSubmitting]  = useState(false)
  const [error,       setError]       = useState('')
  const [success,     setSuccess]     = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const pct = Math.min(100, (parseFloat(amount) / Math.max(balance, 0.01)) * 100)

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) { setError('Max file size is 5 MB'); return }
    const reader = new FileReader()
    reader.onload = () => {
      const res = reader.result as string
      setProofB64(res)
      setProofName(file.name)
      if (file.type.startsWith('image/')) setProofPreview(res)
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    const amt = parseFloat(amount)
    if (isNaN(amt) || amt <= 0) { setError('Enter a valid amount'); return }
    if (amt > balance) { setError(`Amount exceeds available balance (${balance.toFixed(2)} ETB)`); return }
    if (!bankName.trim() || !accountNum.trim() || !accountName.trim()) {
      setError('Bank name, account number, and account name are required')
      return
    }
    setSubmitting(true)
    try {
      await walletApi.submitWithdrawal({
        amount: amt,
        bank_details: { bank_name: bankName.trim(), account_number: accountNum.trim(), account_name: accountName.trim(), method },
        notes: notes.trim() || undefined,
        proof_image_base64: proofB64 ?? undefined,
      })
      setSuccess(true)
      setTimeout(() => { setSuccess(false); onSuccess() }, 2500)
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to submit request. Try again.')
    } finally { setSubmitting(false) }
  }

  if (success) {
    return (
      <div style={{ textAlign:'center', padding:'2rem 1rem', animation:'success-pop 0.4s ease' }}>
        <div style={{ width:64, height:64, borderRadius:'50%', background:'rgba(74,222,128,0.15)', border:'2px solid rgba(74,222,128,0.4)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 1rem', color:'#4ade80' }}>
          <LuCheck size={28}/>
        </div>
        <p style={{ fontWeight:800, color:'#4ade80', fontSize:'1.05rem' }}>{tr('request_submitted')}</p>
        <p style={{ color:'var(--clr-muted)', fontSize:'0.85rem', marginTop:'0.4rem' }}>{tr('request_submitted_sub')}</p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} style={{ display:'flex', flexDirection:'column', gap:'0.85rem' }} className="wlt-form-slide">

      {error && (
        <div style={{ padding:'0.75rem 1rem', borderRadius:'12px', background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.2)', display:'flex', alignItems:'center', gap:'0.5rem', color:'#fca5a5', fontSize:'0.84rem' }}>
          <LuTriangleAlert size={15}/> {error}
        </div>
      )}

      {/* Amount + progress bar */}
      <div>
        <div className="input-wrap">
          <input id="wd-amt" type="number" min="1" step="0.01" placeholder=" "
            value={amount} onChange={e => setAmount(e.target.value)} required />
          <label htmlFor="wd-amt">{tr('amount_label')}</label>
        </div>
        <div style={{ display:'flex', justifyContent:'space-between', marginTop:'0.35rem' }}>
          <span style={{ fontSize:'0.72rem', color:'var(--clr-muted)' }}>
            {tr('available_label')}: <strong style={{ color:'var(--clr-accent)' }}>{balance.toFixed(2)} ETB</strong>
          </span>
          {parseFloat(amount) > 0 && (
            <span style={{ fontSize:'0.72rem', color: parseFloat(amount) > balance ? '#f87171' : 'var(--clr-muted)' }}>
              {pct.toFixed(1)}% {tr('pct_of_balance')}
            </span>
          )}
        </div>
        <div className="wlt-prog-bar">
          <div className="wlt-prog-fill" style={{ width: `${pct}%`, background: pct > 90 ? 'linear-gradient(90deg,#f87171,#ef4444)' : 'linear-gradient(90deg,#7c3aed,#00e5ff)' }} />
        </div>
      </div>

      {/* Bank details */}
      <div className="wlt-bank-grid">
        <div className="input-wrap">
          <input id="wd-bank" type="text" placeholder=" " value={bankName}
            onChange={e => setBankName(e.target.value)} required />
          <label htmlFor="wd-bank">{tr('bank_name')}</label>
        </div>
        <div>
          <select value={method} onChange={e => setMethod(e.target.value)}
            style={{ width:'100%', background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.12)', borderRadius:'12px', color:'var(--clr-text)', padding:'0.85rem 0.9rem', fontFamily:'inherit', fontSize:'0.88rem', outline:'none', cursor:'pointer' }}>
            {['Bank Transfer','Mobile Money','CBE','Awash Bank','Commercial Bank','TeleBirr','Other'].map(m => (
              <option key={m} value={m} style={{ background:'#0d1117' }}>{m}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="input-wrap">
        <input id="wd-acnum" type="text" placeholder=" " value={accountNum}
          onChange={e => setAccountNum(e.target.value)} required />
        <label htmlFor="wd-acnum">{tr('account_number')}</label>
      </div>
      <div className="input-wrap">
        <input id="wd-acname" type="text" placeholder=" " value={accountName}
          onChange={e => setAccountName(e.target.value)} required />
        <label htmlFor="wd-acname">{tr('account_holder')}</label>
      </div>
      <div className="input-wrap">
        <input id="wd-notes" type="text" placeholder=" " value={notes}
          onChange={e => setNotes(e.target.value)} />
        <label htmlFor="wd-notes">{tr('note_optional')}</label>
      </div>

      {/* Proof image upload */}
      <div>
        <label htmlFor="wd-proof" className="wlt-drop-zone"
          style={{ color: proofB64 ? '#00e5ff' : 'var(--clr-muted)' }}>
          <LuUpload size={15}/>
          {proofB64 ? proofName : tr('attach_receipt')}
        </label>
        <input ref={fileRef} id="wd-proof" type="file" accept="image/jpeg,image/png,image/webp,application/pdf"
          style={{ display:'none' }} onChange={handleFileSelect} />
        {proofPreview && (
          <div style={{ display:'flex', alignItems:'center', gap:'0.6rem', marginTop:'0.5rem' }}>
            <img src={proofPreview} alt="preview" className="wlt-img-thumb" />
            <button type="button" onClick={() => { setProofB64(null); setProofName(''); setProofPreview(null) }}
              style={{ background:'none', border:'none', color:'#f87171', fontSize:'0.75rem', cursor:'pointer', fontFamily:'inherit', display:'flex', alignItems:'center', gap:'0.3rem' }}>
              <LuX size={12}/> {tr('remove')}
            </button>
          </div>
        )}
        {proofB64 && !proofPreview && (
          <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', marginTop:'0.5rem' }}>
            <LuImage size={14} style={{ color:'var(--clr-accent)' }}/>
            <span style={{ fontSize:'0.76rem', color:'var(--clr-muted)' }}>{proofName}</span>
            <button type="button" onClick={() => { setProofB64(null); setProofName('') }}
              style={{ background:'none', border:'none', color:'#f87171', fontSize:'0.75rem', cursor:'pointer', fontFamily:'inherit' }}>
              {tr('remove')}
            </button>
          </div>
        )}
      </div>

      <button type="submit" className="btn-primary" disabled={submitting}
        style={{ padding:'0.95rem', borderRadius:'14px', fontWeight:700, fontSize:'0.95rem', letterSpacing:'0.02em' }}>
        {submitting
          ? <><span className="spinner" style={{ width:15, height:15, borderWidth:2, borderTopColor:'#fff' }}/> {tr('submitting')}</>
          : <><LuBanknote size={16}/> {tr('submit_request_btn')}</>
        }
      </button>
    </form>
  )
}

/* ── Withdrawal History Card ─────────────────────────────────────────────── */
function WithdrawalCard({ w }: { w: WithdrawalRequest }) {
  const { t: tr } = useLanguage()
  const cfg = STATUS_CFG[w.status]
  const [open, setOpen] = useState(false)
  return (
    <div className="wlt-wd-card" style={{ '--sc': cfg.color } as React.CSSProperties}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexWrap:'wrap', gap:'0.5rem' }}>
        <div style={{ flex:1, minWidth:120 }}>
          <div style={{ display:'flex', alignItems:'center', gap:'0.55rem', flexWrap:'wrap' }}>
            <span style={{ fontSize:'1.05rem', fontWeight:800, color:'var(--clr-text)' }}>
              {w.amount_requested.toFixed(2)} ETB
            </span>
            <span style={{ padding:'0.18rem 0.65rem', borderRadius:99, background:cfg.bg, color:cfg.color, fontSize:'0.7rem', fontWeight:700, letterSpacing:'0.04em' }}>
              {cfg.label}
            </span>
          </div>
          <p style={{ fontSize:'0.78rem', color:'var(--clr-muted)', marginTop:'0.2rem' }}>
            {w.bank_details.bank_name} · **{w.bank_details.account_number.slice(-4)}
            {w.bank_details.method ? ` · ${w.bank_details.method}` : ''}
          </p>
          <p style={{ fontSize:'0.7rem', color:'rgba(148,163,184,0.45)', marginTop:'0.15rem' }}>
            {new Date(w.created_at).toLocaleString('en-ET', { month:'short', day:'numeric', year:'numeric', hour:'2-digit', minute:'2-digit' })}
          </p>
        </div>
        <button onClick={() => setOpen(v => !v)}
          style={{ background:'none', border:'none', color:'var(--clr-muted)', cursor:'pointer', padding:'0.2rem', display:'flex' }}>
          {open ? <LuChevronUp size={16}/> : <LuChevronDown size={16}/>}
        </button>
      </div>

      {/* Approved amount */}
      {w.status === 'APPROVED' && w.amount_approved !== null && (
        <div style={{ marginTop:'0.5rem', padding:'0.5rem 0.75rem', borderRadius:'10px', background:'rgba(74,222,128,0.07)', border:'1px solid rgba(74,222,128,0.18)', display:'flex', alignItems:'center', gap:'0.5rem' }}>
          <LuCheck size={13} style={{ color:'#4ade80', flexShrink:0 }}/>
          <div>
            <span style={{ fontSize:'0.82rem', color:'#4ade80', fontWeight:700 }}>
              {tr('approved_label')}: {w.amount_approved!.toFixed(2)} ETB
            </span>
            {w.commission_amount && w.commission_amount > 0 && (
              <span style={{ fontSize:'0.74rem', color:'rgba(74,222,128,0.65)', display:'block' }}>
                {tr('platform_fee').replace('{rate}', String(w.commission_rate)).replace('{amount}', w.commission_amount.toFixed(2))}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Expandable details */}
      {open && (
        <div style={{ marginTop:'0.75rem', display:'flex', flexDirection:'column', gap:'0.5rem', animation:'wlt-slide-down 0.2s ease' }}>
          {w.notes && (
            <div style={{ fontSize:'0.8rem', color:'var(--clr-muted)', padding:'0.5rem 0.75rem', borderRadius:'10px', background:'rgba(255,255,255,0.02)', borderLeft:'2px solid rgba(255,255,255,0.1)' }}>
              <span style={{ fontWeight:600 }}>{tr('your_note')}:</span> {w.notes}
            </div>
          )}
          {/* User submitted proof */}
          {w.proof_image_url && (
            <div>
              <p style={{ fontSize:'0.73rem', color:'var(--clr-muted)', marginBottom:'0.35rem', display:'flex', alignItems:'center', gap:'0.3rem' }}>
                <LuImage size={12}/> {tr('your_proof')}
              </p>
              {w.proof_image_url.endsWith('.pdf') ? (
                <a href={`${UPLOADS_BASE}${w.proof_image_url}`} target="_blank" rel="noopener noreferrer"
                  style={{ fontSize:'0.8rem', color:'var(--clr-accent)' }}>{tr('view_pdf')}</a>
              ) : (
                <img src={`${UPLOADS_BASE}${w.proof_image_url}`} alt="Your proof"
                  className="wlt-img-thumb" onClick={() => window.open(`${UPLOADS_BASE}${w.proof_image_url}`, '_blank')} />
              )}
            </div>
          )}
          {/* Admin note */}
          {w.admin_note && (
            <div style={{ fontSize:'0.8rem', color: w.status === 'REJECTED' ? '#fca5a5' : 'var(--clr-muted)', padding:'0.5rem 0.75rem', borderRadius:'10px', background: w.status === 'REJECTED' ? 'rgba(239,68,68,0.06)' : 'rgba(255,255,255,0.02)', borderLeft:`2px solid ${w.status === 'REJECTED' ? 'rgba(239,68,68,0.4)' : 'rgba(0,229,255,0.2)'}` }}>
              <span style={{ fontWeight:600 }}>{tr('admin_note')}:</span> "{w.admin_note}"
            </div>
          )}
          {/* Admin proof image */}
          {w.admin_image_url && (
            <div>
              <p style={{ fontSize:'0.73rem', color:'var(--clr-muted)', marginBottom:'0.35rem', display:'flex', alignItems:'center', gap:'0.3rem' }}>
                <LuImage size={12}/> {tr('admin_confirmation')}
              </p>
              <img src={`${UPLOADS_BASE}${w.admin_image_url}`} alt="Admin confirmation"
                className="wlt-img-thumb" onClick={() => window.open(`${UPLOADS_BASE}${w.admin_image_url}`, '_blank')} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* ── Main WalletDashboard ────────────────────────────────────────────────── */
export default function WalletDashboard() {
  const { t: tr } = useLanguage()
  const [wallet,         setWallet]          = useState<Wallet | null>(null)
  const [recentTxs,      setRecentTxs]       = useState<Transaction[]>([])
  const [withdrawals,    setWithdrawals]      = useState<WithdrawalRequest[]>([])
  const [loading,        setLoading]          = useState(true)
  const [error,          setError]            = useState('')
  const [refreshing,     setRefreshing]       = useState(false)
  const [showWdForm,     setShowWdForm]       = useState(false)
  const [wdLoaded,       setWdLoaded]         = useState(false)

  const fetchWallet = async () => {
    try {
      setError('')
      const { data } = await apiClient.get('/profile/wallet')
      setWallet(data.wallet)
      setRecentTxs(data.recent_transactions || [])
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load wallet')
    } finally { setLoading(false) }
  }

  const fetchWithdrawals = async () => {
    try {
      const { data } = await walletApi.getMyWithdrawals({ limit: 15 })
      setWithdrawals(data.requests ?? [])
      setWdLoaded(true)
    } catch { /* non-blocking */ }
  }

  useEffect(() => { fetchWallet() }, [])
  useEffect(() => { if (!wdLoaded) fetchWithdrawals() }, [wdLoaded]) // eslint-disable-line

  const handleRefresh = async () => {
    setRefreshing(true)
    await Promise.all([fetchWallet(), fetchWithdrawals()])
    setRefreshing(false)
  }

  const onWdSuccess = () => {
    setShowWdForm(false)
    setWdLoaded(false)
    fetchWallet()
  }

  const pendingWd = withdrawals.filter(w => w.status === 'PENDING').length

  if (loading) return <Skeleton />

  if (error) {
    return (
      <div className="glass" style={{ padding:'1.5rem', borderLeft:'3px solid var(--clr-danger)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:'0.75rem', color:'var(--clr-danger)' }}>
          <LuTriangleAlert size={20}/> <span>{error}</span>
        </div>
      </div>
    )
  }

  if (!wallet) return (
    <div className="glass" style={{ padding:'2rem', textAlign:'center' }}>
      <p style={{ color:'var(--clr-muted)' }}>{tr('no_wallet')}</p>
    </div>
  )

  return (
    <>
      {/* Inject keyframes once */}
      <style>{STYLE_TAG}</style>

      <div style={{ width:'100%', display:'flex', flexDirection:'column', gap:'1.25rem' }}>

        {/* ═══ HERO BALANCE CARD ══════════════════════════════════════════ */}
        <div className="wlt-card-hero">
          {/* Background orbs */}
          <div className="wlt-orb" style={{ width:220, height:220, top:-60, right:-60, background:'radial-gradient(circle, #7c3aed 0%, transparent 70%)' }}/>
          <div className="wlt-orb" style={{ width:160, height:160, bottom:-40, left:-30, background:'radial-gradient(circle, #00e5ff 0%, transparent 70%)' }}/>

          {/* Top row */}
          <div className="wlt-hero-top" style={{ position:'relative', display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'1.5rem', flexWrap:'wrap', gap:'0.75rem' }}>
            <div className="wlt-hero-icon-row" style={{ display:'flex', alignItems:'center', gap:'1rem' }}>
              {/* Wallet icon with pulse ring */}
              <div style={{ position:'relative' }}>
                <div style={{ position:'absolute', inset:-6, borderRadius:'50%', border:'2px solid rgba(0,229,255,0.3)', animation:'wlt-pulse-ring 2s ease-out infinite' }}/>
                <div style={{ width:52, height:52, borderRadius:'15px', background:'linear-gradient(135deg, rgba(0,229,255,0.2), rgba(124,58,237,0.2))', border:'1px solid rgba(0,229,255,0.3)', display:'flex', alignItems:'center', justifyContent:'center', color:'#00e5ff', animation:'wlt-float 4s ease-in-out infinite' }}>
                  <LuWallet size={26}/>
                </div>
              </div>
              <div className="wlt-balance-wrap" style={{ minWidth:0, overflow:'hidden' }}>
                <p style={{ fontSize:'0.78rem', textTransform:'uppercase', letterSpacing:'0.1em', color:'var(--clr-muted)', marginBottom:'0.3rem', fontWeight:700 }}>
                  {tr('wlt_available_balance')}
                </p>
                <div className="wlt-balance-num">{fmt(wallet.balance)}</div>
                <p style={{ fontSize:'0.9rem', color:'rgba(148,163,184,0.6)', marginTop:'0.1rem', fontWeight:500 }}>ETB</p>
              </div>
            </div>

            <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:'0.5rem' }}>
              <button onClick={handleRefresh} title="Refresh"
                style={{ width:38, height:38, borderRadius:'11px', background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.1)', color:'var(--clr-muted)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', transition:'all 0.2s' }}>
                <LuRefreshCw size={16} style={{ animation: refreshing ? 'spin 0.8s linear infinite' : 'none' }}/>
              </button>
              <div style={{ display:'flex', alignItems:'center', gap:'0.4rem' }}>
                <span style={{ width:7, height:7, borderRadius:'50%', background: wallet.is_locked ? '#f87171' : '#4ade80', display:'inline-block', boxShadow: wallet.is_locked ? '0 0 6px #ef4444' : '0 0 6px #22c55e' }}/>
                <span style={{ fontSize:'0.73rem', fontWeight:700, color: wallet.is_locked ? '#f87171' : '#4ade80' }}>
                  {wallet.is_locked ? tr('locked_label') : tr('active_label')}
                </span>
              </div>
            </div>
          </div>

          {/* Stats row */}
          <div className="wlt-stats-grid">
            <div className="wlt-stat-chip" style={{ animationDelay:'0.05s' }}>
              <p style={{ fontSize:'0.68rem', color:'var(--clr-muted)', marginBottom:'0.3rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em' }}>{tr('earned')}</p>
              <p style={{ fontSize:'0.92rem', fontWeight:800, color:'#4ade80' }}>+{fmt(wallet.total_earned)}</p>
            </div>
            <div className="wlt-stat-chip" style={{ animationDelay:'0.1s' }}>
              <p style={{ fontSize:'0.68rem', color:'var(--clr-muted)', marginBottom:'0.3rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em' }}>{tr('spent')}</p>
              <p style={{ fontSize:'0.92rem', fontWeight:800, color:'#f87171' }}>-{fmt(wallet.total_spent)}</p>
            </div>
            <div className="wlt-stat-chip" style={{ animationDelay:'0.15s' }}>
              <p style={{ fontSize:'0.68rem', color:'var(--clr-muted)', marginBottom:'0.3rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em' }}>{tr('pending_wd')}</p>
              <p style={{ fontSize:'0.92rem', fontWeight:800, color:'#fbbf24' }}>{pendingWd} wd</p>
            </div>
          </div>

          {/* Withdraw button */}
          {!wallet.is_locked && (
            <button className="wlt-withdraw-btn" onClick={() => setShowWdForm(v => !v)}>
              <LuBanknote size={18}/>
              {showWdForm ? tr('cancel_withdrawal') : tr('request_withdrawal')}
              {showWdForm ? <LuChevronUp size={15}/> : <LuChevronDown size={15}/>}
            </button>
          )}

          {/* Withdrawal form — inline below button */}
          {showWdForm && !wallet.is_locked && (
            <div style={{ position:'relative', marginTop:'1.25rem', padding:'1.5rem', borderRadius:'16px', background:'rgba(0,0,0,0.25)', border:'1px solid rgba(255,255,255,0.08)', backdropFilter:'blur(10px)', animation:'wlt-slide-down 0.28s ease' }}>
              <p className="wlt-section-title"><LuBanknote size={13}/> {tr('withdrawal_req_title')}</p>
              <WithdrawalForm balance={wallet.balance} onSuccess={onWdSuccess} />
            </div>
          )}
        </div>

        {/* ═══ LOCKED WARNING ═════════════════════════════════════════════ */}
        {wallet.is_locked && (
          <div style={{ padding:'1.1rem 1.25rem', borderRadius:'14px', background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.22)', display:'flex', alignItems:'center', gap:'0.85rem' }}>
            <div style={{ width:40, height:40, borderRadius:'11px', background:'rgba(239,68,68,0.15)', border:'1px solid rgba(239,68,68,0.3)', display:'flex', alignItems:'center', justifyContent:'center', color:'#f87171', flexShrink:0 }}>
              <LuLock size={19}/>
            </div>
            <div>
              <p style={{ fontWeight:700, color:'#f87171', fontSize:'0.9rem' }}>{tr('wallet_locked')}</p>
              <p style={{ color:'rgba(248,113,113,0.7)', fontSize:'0.8rem', marginTop:'0.15rem' }}>
                {wallet.lock_reason || tr('locked_default')}
              </p>
            </div>
          </div>
        )}

        <div className="wlt-bottom-grid">
        {/* ═══ WITHDRAWAL HISTORY ═════════════════════════════════════════ */}
        <div className="glass" style={{ padding:'1.25rem' }}>
          <div className="wlt-section-title">
            <LuClock size={14} style={{ color:'var(--clr-accent)' }}/>
            {tr('withdrawal_requests')}
            {withdrawals.length > 0 && (
              <span style={{ background:'rgba(0,229,255,0.1)', color:'var(--clr-accent)', borderRadius:99, fontSize:'0.65rem', fontWeight:800, padding:'0.12rem 0.5rem', marginLeft:'auto' }}>{withdrawals.length}</span>
            )}
          </div>

          {!wdLoaded ? (
            <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', color:'var(--clr-muted)', fontSize:'0.85rem', padding:'0.75rem 0' }}>
              <span className="spinner" style={{ width:16, height:16, borderWidth:2 }}/> {tr('loading_requests')}
            </div>
          ) : withdrawals.length === 0 ? (
            <div style={{ textAlign:'center', padding:'2rem 1rem' }}>
              <div style={{ width:52, height:52, borderRadius:'50%', background:'rgba(0,229,255,0.06)', border:'1px solid rgba(0,229,255,0.12)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 0.75rem', color:'var(--clr-accent)', opacity:0.5 }}>
                <LuBanknote size={22}/>
              </div>
              <p style={{ color:'var(--clr-muted)', fontSize:'0.88rem' }}>{tr('no_withdrawals')}</p>
              <p style={{ color:'rgba(100,116,139,0.5)', fontSize:'0.78rem', marginTop:'0.3rem' }}>{tr('submit_request_above')}</p>
            </div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:'0.6rem' }}>
              {withdrawals.map(w => <WithdrawalCard key={w.id} w={w} />)}
            </div>
          )}
        </div>

        {/* ═══ RECENT TRANSACTIONS ════════════════════════════════════════ */}
        <div className="glass" style={{ padding:'1.25rem' }}>
          <div className="wlt-section-title">
            <LuTrendingUp size={14} style={{ color:'var(--clr-accent)' }}/>
            {tr('recent_transactions')}
          </div>

          {recentTxs.length === 0 ? (
            <div style={{ textAlign:'center', padding:'2rem 1rem' }}>
              <p style={{ color:'var(--clr-muted)', fontSize:'0.88rem' }}>{tr('no_transactions')}</p>
            </div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:'0.5rem' }}>
              {recentTxs.slice(0, 8).map((tx, i) => {
                const meta = TX_META[tx.type] ?? TX_META.DEBIT
                const isPlus = ['+'].includes(meta.sign)
                return (
                  <div key={tx.id} className="wlt-tx-row" style={{ animationDelay: `${i * 0.05}s` }}>
                    <div style={{ display:'flex', alignItems:'center', gap:'0.75rem', flex:1, minWidth:0 }}>
                      <div style={{ width:38, height:38, borderRadius:'12px', background:meta.bg, border:`1px solid ${meta.color}22`, display:'flex', alignItems:'center', justifyContent:'center', color:meta.color, flexShrink:0 }}>
                        {meta.icon}
                      </div>
                      <div style={{ minWidth:0 }}>
                        <p style={{ fontSize:'0.875rem', fontWeight:600, color:'var(--clr-text)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                          {tx.description}
                        </p>
                        <p style={{ fontSize:'0.73rem', color:'var(--clr-muted)', marginTop:'0.1rem' }}>
                          {new Date(tx.created_at).toLocaleString('en-ET', { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' })}
                          <span style={{ marginLeft:'0.35rem', fontSize:'0.65rem', fontWeight:700, color:`${meta.color}99`, textTransform:'uppercase', letterSpacing:'0.04em' }}>{tx.type}</span>
                        </p>
                      </div>
                    </div>
                    <div className="wlt-tx-amount" style={{ fontWeight:800, fontSize:'0.95rem', color: isPlus ? '#4ade80' : '#f87171', whiteSpace:'nowrap', flexShrink:0 }}>
                      {meta.sign}{fmt(tx.amount)}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
        </div>{/* end wlt-bottom-grid */}

      </div>
    </>
  )
}
