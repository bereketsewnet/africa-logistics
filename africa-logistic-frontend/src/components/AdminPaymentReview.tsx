import { useState, useEffect, useRef } from 'react'
import apiClient, { adminOrderApi } from '../lib/apiClient'
import {
  LuCheck, LuX, LuClock, LuEye, LuTriangleAlert, LuChevronLeft,
  LuBanknote, LuUpload, LuArrowDownLeft,
} from 'react-icons/lu'

const UPLOADS_BASE = (import.meta.env.VITE_API_BASE_URL as string).replace(/\/api\/?$/, '')

interface ManualPayment {
  id: string
  wallet_id: string
  user_id: string
  user_name: string
  user_phone: string
  user_email: string
  amount: number
  action_type: string
  reason: string
  proof_image_url: string | null
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  submitted_at: string
  current_balance: number
}

interface WithdrawalRequest {
  id: string
  user_id: string
  role_id: number
  user_name: string
  user_phone: string
  user_email: string
  current_balance: number
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
  reviewed_at: string | null
  created_at: string
}

function commissionPreview(roleId: number, approved: number, rate: number): string | null {
  if (roleId !== 3 || approved <= 0 || rate < 0) return null
  const fee = (approved * rate) / 100
  if (fee <= 0) return null
  return `Platform fee (${rate}%): ${fee.toFixed(2)} ETB → credited to admin wallet`
}

export default function AdminPaymentReview() {
  const [activeMainTab, setActiveMainTab] = useState<'payments' | 'withdrawals'>('payments')

  // ── Manual Payments state ──
  const [payments, setPayments] = useState<ManualPayment[]>([])
  const [selectedPayment, setSelectedPayment] = useState<ManualPayment | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [processing, setProcessing] = useState(false)
  const [notes, setNotes] = useState('')
  const [filterStatus, setFilterStatus] = useState<'PENDING' | 'ALL'>('PENDING')

  // ── Withdrawal Requests state ──
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([])
  const [selectedWithdrawal, setSelectedWithdrawal] = useState<WithdrawalRequest | null>(null)
  const [wLoading, setWLoading] = useState(false)
  const [wError, setWError] = useState('')
  const [wFilterStatus, setWFilterStatus] = useState<'PENDING' | 'ALL'>('PENDING')
  const [wProcessing, setWProcessing] = useState(false)
  const [approvedAmount, setApprovedAmount] = useState('')
  const [wCommissionRate, setWCommissionRate] = useState('15')
  const [adminNote, setAdminNote] = useState('')
  const [adminImageB64, setAdminImageB64] = useState<string | null>(null)
  const [adminImageName, setAdminImageName] = useState('')
  const [rejectReason, setRejectReason] = useState('')
  const wImageRef = useRef<HTMLInputElement>(null)

  const fetchPayments = async (status: string) => {
    try {
      setError('')
      setLoading(true)
      const { data } = await apiClient.get('/admin/payments/pending', { params: { status } })
      setPayments(data.payments || [])
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load payments')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchPayments(filterStatus) }, [filterStatus])

  // ── Withdrawal helpers ──────────────────────────────────────────────────────
  const fetchWithdrawals = async (status: string) => {
    try {
      setWError('')
      setWLoading(true)
      const { data } = await adminOrderApi.listWithdrawalRequests({ status })
      setWithdrawals(data.requests || [])
    } catch (err: any) {
      setWError(err.response?.data?.message || 'Failed to load withdrawal requests')
    } finally {
      setWLoading(false)
    }
  }

  useEffect(() => {
    if (activeMainTab === 'withdrawals') fetchWithdrawals(wFilterStatus)
  }, [activeMainTab, wFilterStatus]) // eslint-disable-line

  const handleWImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) { alert('Max file size 5 MB'); return }
    const reader = new FileReader()
    reader.onload = () => { setAdminImageB64(reader.result as string); setAdminImageName(file.name) }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const handleWApprove = async () => {
    if (!selectedWithdrawal) return
    const amt = parseFloat(approvedAmount)
    if (isNaN(amt) || amt <= 0) { alert('Enter a valid approved amount'); return }
    if (amt > selectedWithdrawal.amount_requested) { alert('Approved amount cannot exceed requested amount'); return }
    const rate = parseFloat(wCommissionRate)
    if (isNaN(rate) || rate < 0 || rate > 100) { alert('Commission rate must be between 0 and 100'); return }
    setWProcessing(true)
    try {
      await adminOrderApi.approveWithdrawal(selectedWithdrawal.id, {
        approved_amount: amt,
        admin_note: adminNote || undefined,
        admin_image_base64: adminImageB64 ?? undefined,
        commission_rate: selectedWithdrawal.role_id === 3 ? rate : undefined,
      })
      setSelectedWithdrawal(null)
      setApprovedAmount(''); setAdminNote(''); setAdminImageB64(null); setWCommissionRate('15')
      fetchWithdrawals(wFilterStatus)
      alert('Withdrawal approved successfully')
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to approve withdrawal')
    } finally { setWProcessing(false) }
  }

  const handleWReject = async () => {
    if (!selectedWithdrawal) return
    if (!rejectReason.trim()) { alert('Please provide a rejection reason'); return }
    setWProcessing(true)
    try {
      await adminOrderApi.rejectWithdrawal(selectedWithdrawal.id, { reason: rejectReason })
      setSelectedWithdrawal(null); setRejectReason('')
      fetchWithdrawals(wFilterStatus)
      alert('Withdrawal rejected')
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to reject withdrawal')
    } finally { setWProcessing(false) }
  }
  // ─────────────────────────────────────────────────────────────────────────────

  const handleApprove = async () => {
    if (!selectedPayment) return
    setProcessing(true)
    try {
      await apiClient.post(`/admin/payments/${selectedPayment.id}/approve`, {
        notes: notes || undefined
      })
      setNotes('')
      setSelectedPayment(null)
      fetchPayments(filterStatus)
      alert('Payment approved successfully')
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to approve payment')
    } finally {
      setProcessing(false)
    }
  }

  const handleReject = async () => {
    if (!selectedPayment) return
    if (!notes.trim()) {
      alert('Please provide a rejection reason')
      return
    }
    setProcessing(true)
    try {
      await apiClient.post(`/admin/payments/${selectedPayment.id}/reject`, {
        reason: notes
      })
      setNotes('')
      setSelectedPayment(null)
      fetchPayments(filterStatus)
      alert('Payment rejected')
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to reject payment')
    } finally {
      setProcessing(false)
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-ET', {
      style: 'currency',
      currency: 'ETB',
      minimumFractionDigits: 2,
    }).format(amount)
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-ET', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const filteredPayments = payments
  const pendingCount = payments.filter(p => p.status === 'PENDING').length
  const wPendingCount = withdrawals.filter(w => w.status === 'PENDING').length
  const fmt = (n: number) => n.toFixed(2)

  if (loading && activeMainTab === 'payments') {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <div style={{ display: 'inline-block' }} className="spinner" />
      </div>
    )
  }

  // ── Withdrawal detail panel ─────────────────────────────────────────────────
  if (selectedWithdrawal) {
    const wr = selectedWithdrawal
    const previewAmt = parseFloat(approvedAmount) || 0
    const rateNum = parseFloat(wCommissionRate) || 0
    const preview = commissionPreview(wr.role_id, previewAmt, rateNum)
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <div className="glass" style={{ padding: '1.5rem' }}>
          <button onClick={() => { setSelectedWithdrawal(null); setApprovedAmount(''); setAdminNote(''); setAdminImageB64(null); setRejectReason(''); setWCommissionRate('15') }}
            style={{ background: 'none', border: 'none', color: 'var(--clr-accent)', cursor: 'pointer', fontSize: '0.95rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0', fontWeight: 600, fontFamily: 'inherit' }}>
            <LuChevronLeft size={18} /> Back to Withdrawals
          </button>
          <h3 style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--clr-text)' }}>Withdrawal Review</h3>
        </div>

        {/* User info */}
        <div className="glass" style={{ padding: '1.5rem' }}>
          <h4 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--clr-text)', marginBottom: '1rem' }}>User Information</h4>
          <div style={{ display: 'grid', gap: '0.65rem' }}>
            {[['Name', wr.user_name], ['Phone', wr.user_phone || '—'], ['Email', wr.user_email || '—'], ['Role', wr.role_id === 3 ? 'Driver' : wr.role_id === 2 ? 'Shipper' : 'User']].map(([l, v]) => (
              <div key={l} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: 'var(--clr-muted)', fontSize: '0.9rem' }}>{l}:</span>
                <span style={{ color: 'var(--clr-text)', fontWeight: 600 }}>{v}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Amount details */}
        <div className="glass" style={{ padding: '1.5rem' }}>
          <h4 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--clr-text)', marginBottom: '1rem' }}>Request Details</h4>
          <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', marginBottom: '1.25rem' }}>
            {[{ label: 'Requested', val: `${fmt(wr.amount_requested)} ETB`, clr: 'var(--clr-accent)' },
              { label: 'Current Balance', val: `${fmt(wr.current_balance)} ETB`, clr: 'var(--clr-neon)' },
              { label: 'Status', val: wr.status, clr: wr.status === 'APPROVED' ? '#4ade80' : wr.status === 'REJECTED' ? 'var(--clr-danger)' : '#fbbf24' }
            ].map(({ label, val, clr }) => (
              <div key={label} style={{ padding: '1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.07)' }}>
                <p style={{ fontSize: '0.75rem', color: 'var(--clr-muted)', marginBottom: '0.35rem' }}>{label}</p>
                <p style={{ fontSize: '1.1rem', fontWeight: 800, color: clr }}>{val}</p>
              </div>
            ))}
          </div>
          <div style={{ display: 'grid', gap: '0.6rem', fontSize: '0.88rem' }}>
            <p style={{ color: 'var(--clr-muted)' }}>Bank: <strong style={{ color: 'var(--clr-text)' }}>{wr.bank_details.bank_name}</strong> · Acct: <strong style={{ color: 'var(--clr-text)' }}>{wr.bank_details.account_number}</strong></p>
            <p style={{ color: 'var(--clr-muted)' }}>Account Holder: <strong style={{ color: 'var(--clr-text)' }}>{wr.bank_details.account_name}</strong></p>
            {wr.notes && <p style={{ color: 'var(--clr-muted)', fontStyle: 'italic' }}>Note: "{wr.notes}"</p>}
          </div>
          {wr.proof_image_url && (
            <div style={{ marginTop: '1rem' }}>
              <p style={{ fontSize: '0.82rem', color: 'var(--clr-muted)', marginBottom: '0.5rem' }}>User Proof</p>
              <img src={`${UPLOADS_BASE}${wr.proof_image_url}`} alt="User proof" style={{ maxWidth: '100%', maxHeight: 300, borderRadius: 10, objectFit: 'contain', border: '1px solid rgba(255,255,255,0.08)' }} />
            </div>
          )}
        </div>

        {/* Actions */}
        {wr.status === 'PENDING' ? (
          <div className="glass" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <h4 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--clr-text)' }}>Review Decision</h4>

            {/* Approved amount + commission rate side by side for drivers */}
            <div style={{ display: 'grid', gridTemplateColumns: wr.role_id === 3 ? '1fr 1fr' : '1fr', gap: '0.65rem' }}>
              <div>
                <label style={{ fontSize: '0.85rem', color: 'var(--clr-muted)', display: 'block', marginBottom: '0.4rem' }}>Approved Amount (ETB)</label>
                <input type="number" min="0.01" max={wr.amount_requested} step="0.01"
                  value={approvedAmount} onChange={e => setApprovedAmount(e.target.value)}
                  placeholder={`Max ${fmt(wr.amount_requested)}`}
                  style={{ width: '100%', padding: '0.75rem', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '0.75rem', color: 'var(--clr-text)', fontSize: '1rem', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              {wr.role_id === 3 && (
                <div>
                  <label style={{ fontSize: '0.85rem', color: '#fbbf24', display: 'block', marginBottom: '0.4rem' }}>Platform Fee % (Driver)</label>
                  <input type="number" min="0" max="100" step="0.1"
                    value={wCommissionRate} onChange={e => setWCommissionRate(e.target.value)}
                    placeholder="e.g. 15"
                    style={{ width: '100%', padding: '0.75rem', background: 'rgba(251,191,36,0.04)', border: '1px solid rgba(251,191,36,0.15)', borderRadius: '0.75rem', color: 'var(--clr-text)', fontSize: '1rem', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
                </div>
              )}
            </div>
            {preview && <p style={{ marginTop: '-0.25rem', fontSize: '0.78rem', color: '#fbbf24', padding: '0.4rem 0.75rem', background: 'rgba(251,191,36,0.06)', borderRadius: '8px', border: '1px solid rgba(251,191,36,0.15)' }}>{preview}</p>}

            {/* User's submitted proof image */}
            {wr.proof_image_url && (
              <div>
                <label style={{ fontSize: '0.82rem', color: 'var(--clr-muted)', display: 'block', marginBottom: '0.4rem' }}>User Proof Document</label>
                {wr.proof_image_url.endsWith('.pdf') ? (
                  <a href={`${UPLOADS_BASE}${wr.proof_image_url}`} target="_blank" rel="noopener noreferrer"
                    style={{ color: 'var(--clr-accent)', fontSize: '0.85rem' }}>📄 View PDF</a>
                ) : (
                  <img src={`${UPLOADS_BASE}${wr.proof_image_url}`} alt="User proof"
                    style={{ maxWidth: '100%', maxHeight: 240, borderRadius: 12, objectFit: 'contain', border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer' }}
                    onClick={() => window.open(`${UPLOADS_BASE}${wr.proof_image_url}`, '_blank')} />
                )}
              </div>
            )}

            {/* Admin note */}
            <div>
              <label style={{ fontSize: '0.85rem', color: 'var(--clr-muted)', display: 'block', marginBottom: '0.4rem' }}>Admin Note (optional for approval, required for rejection)</label>
              <textarea value={adminNote} onChange={e => setAdminNote(e.target.value)} rows={3} placeholder="Enter note…"
                style={{ width: '100%', padding: '0.75rem', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '0.75rem', color: 'var(--clr-text)', fontSize: '0.9rem', fontFamily: 'inherit', outline: 'none', resize: 'none', boxSizing: 'border-box' }} />
            </div>

            {/* Reject reason (separate) */}
            <div>
              <label style={{ fontSize: '0.85rem', color: 'var(--clr-danger)', display: 'block', marginBottom: '0.4rem' }}>Rejection Reason (required to reject)</label>
              <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} rows={2} placeholder="Explain why this is rejected…"
                style={{ width: '100%', padding: '0.75rem', background: 'rgba(239,68,68,0.04)', border: '1px solid rgba(239,68,68,0.12)', borderRadius: '0.75rem', color: 'var(--clr-text)', fontSize: '0.9rem', fontFamily: 'inherit', outline: 'none', resize: 'none', boxSizing: 'border-box' }} />
            </div>

            {/* Admin proof image */}
            <div>
              <label htmlFor="admin-proof" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1rem', borderRadius: '0.75rem', border: '1px dashed rgba(255,255,255,0.15)', cursor: 'pointer', color: adminImageB64 ? 'var(--clr-accent)' : 'var(--clr-muted)', fontSize: '0.82rem', fontWeight: 600 }}>
                <LuUpload size={14}/> {adminImageB64 ? adminImageName : 'Attach admin proof (optional)'}
              </label>
              <input ref={wImageRef} id="admin-proof" type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }} onChange={handleWImageSelect} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '0.25rem' }}>
              <button onClick={handleWReject} disabled={wProcessing}
                style={{ padding: '0.9rem', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '10px', color: 'var(--clr-danger)', fontWeight: 700, cursor: wProcessing ? 'not-allowed' : 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', opacity: wProcessing ? 0.6 : 1 }}>
                <LuX size={16}/> {wProcessing ? 'Processing…' : 'Reject'}
              </button>
              <button onClick={handleWApprove} disabled={wProcessing}
                style={{ padding: '0.9rem', background: 'linear-gradient(135deg,#7c3aed,#0ea5e9)', border: 'none', borderRadius: '10px', color: '#fff', fontWeight: 700, cursor: wProcessing ? 'not-allowed' : 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', opacity: wProcessing ? 0.6 : 1 }}>
                <LuCheck size={16}/> {wProcessing ? 'Processing…' : 'Approve & Debit'}
              </button>
            </div>
          </div>
        ) : (
          <div className="glass" style={{ padding: '1.25rem', borderLeft: `3px solid ${wr.status === 'APPROVED' ? '#4ade80' : 'var(--clr-danger)'}` }}>
            <p style={{ fontWeight: 700, color: wr.status === 'APPROVED' ? '#4ade80' : 'var(--clr-danger)', marginBottom: '0.35rem' }}>
              {wr.status === 'APPROVED' ? `Approved: ${fmt(wr.amount_approved ?? 0)} ETB` : 'Rejected'}
            </p>
            {wr.commission_amount ? <p style={{ fontSize: '0.82rem', color: '#fbbf24' }}>Commission credited: {fmt(wr.commission_amount)} ETB</p> : null}
            {wr.admin_note && <p style={{ fontSize: '0.85rem', color: 'var(--clr-muted)', marginTop: '0.35rem', fontStyle: 'italic' }}>"{wr.admin_note}"</p>}
          </div>
        )}
      </div>
    )
  }
  // ─────────────────────────────────────────────────────────────────────────────

  if (selectedPayment) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {/* Header */}
        <div className="glass" style={{ padding: '1.5rem' }}>
          <button
            onClick={() => {
              setSelectedPayment(null)
              setNotes('')
            }}
            style={{
              background: 'none', border: 'none', color: 'var(--clr-accent)',
              cursor: 'pointer', fontSize: '0.95rem', marginBottom: '1rem',
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              padding: '0.5rem 0', fontWeight: 600, fontFamily: 'inherit'
            }}
            className="hover-opacity"
          >
            <LuChevronLeft size={18} /> Back to List
          </button>

          <h3 style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--clr-text)' }}>
            Payment Review
          </h3>
        </div>

        {/* User Info */}
        <div className="glass" style={{ padding: '1.5rem' }}>
          <h4 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--clr-text)', marginBottom: '1rem' }}>
            User Information
          </h4>
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--clr-muted)', fontSize: '0.9rem' }}>Name:</span>
              <span style={{ color: 'var(--clr-text)', fontWeight: 600 }}>
                {selectedPayment.user_name}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--clr-muted)', fontSize: '0.9rem' }}>Email:</span>
              <span style={{ color: 'var(--clr-text)', fontWeight: 600, wordBreak: 'break-all' }}>
                {selectedPayment.user_email || '—'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--clr-muted)', fontSize: '0.9rem' }}>Phone:</span>
              <span style={{ color: 'var(--clr-text)', fontWeight: 600 }}>
                {selectedPayment.user_phone || '—'}
              </span>
            </div>
          </div>
        </div>

        {/* Payment Details */}
        <div className="glass" style={{ padding: '1.5rem' }}>
          <h4 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--clr-text)', marginBottom: '1rem' }}>
            Payment Details
          </h4>
          <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', marginBottom: '1.5rem' }}>
            <div style={{ padding: '1rem', background: 'rgba(0,229,255,0.08)', borderRadius: '10px', border: '1px solid rgba(0,229,255,0.2)' }}>
              <p style={{ fontSize: '0.75rem', color: 'var(--clr-muted)', marginBottom: '0.25rem' }}>Amount</p>
              <p style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--clr-accent)' }}>
                {formatCurrency(selectedPayment.amount)}
              </p>
            </div>
            <div style={{ padding: '1rem', background: 'rgba(124,58,237,0.08)', borderRadius: '10px', border: '1px solid rgba(124,58,237,0.2)' }}>
              <p style={{ fontSize: '0.75rem', color: 'var(--clr-muted)', marginBottom: '0.25rem' }}>Status</p>
              <p style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--clr-accent2)' }}>
                {selectedPayment.status}
              </p>
            </div>
            <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.08)' }}>
              <p style={{ fontSize: '0.75rem', color: 'var(--clr-muted)', marginBottom: '0.25rem' }}>Submitted</p>
              <p style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--clr-text)' }}>
                {formatDate(selectedPayment.submitted_at)}
              </p>
            </div>
          </div>
        </div>

        {/* Proof Image */}
        <div className="glass" style={{ padding: '1.5rem' }}>
          <h4 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--clr-text)', marginBottom: '1rem' }}>
            Payment Proof
          </h4>
          {selectedPayment.proof_image_url ? (
            selectedPayment.proof_image_url.endsWith('.pdf') ? (
              <div style={{
                padding: '2rem', borderRadius: '12px',
                border: '1px solid rgba(0,229,255,0.2)',
                background: 'rgba(255,255,255,0.03)',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem'
              }}>
                <span style={{ fontSize: '3rem' }}>📄</span>
                <a
                  href={`${UPLOADS_BASE}${selectedPayment.proof_image_url}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: 'var(--clr-accent)', fontWeight: 600 }}
                >
                  View PDF Document
                </a>
              </div>
            ) : (
              <img
                src={`${UPLOADS_BASE}${selectedPayment.proof_image_url}`}
                alt="Payment Proof"
                style={{
                  width: '100%', maxHeight: '400px', objectFit: 'contain',
                  borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)',
                  background: 'rgba(255,255,255,0.02)'
                }}
              />
            )
          ) : (
            <div style={{
              padding: '2rem', borderRadius: '12px',
              border: '1px solid rgba(255,255,255,0.08)',
              background: 'rgba(255,255,255,0.02)',
              textAlign: 'center', color: 'var(--clr-muted)'
            }}>
              No payment proof attached
            </div>
          )}
        </div>

        {/* Notes */}
        <div className="glass" style={{ padding: '1.5rem' }}>
          <label style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--clr-text)', display: 'block', marginBottom: '0.75rem' }}>
            {selectedPayment.status === 'PENDING' ? 'Admin Notes' : 'Review Notes'}
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={selectedPayment.status === 'PENDING' ? 'Enter notes (optional)' : 'Enter rejection reason'}
            disabled={selectedPayment.status !== 'PENDING'}
            style={{
              width: '100%', minHeight: '100px', padding: '1rem',
              background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '10px', color: 'var(--clr-text)', fontSize: '0.95rem',
              fontFamily: 'inherit', resize: 'none', outline: 'none'
            }}
          />
        </div>

        {/* Actions */}
        {selectedPayment.status === 'PENDING' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <button
              onClick={handleReject}
              disabled={processing || !notes.trim()}
              style={{
                padding: '1rem', background: 'rgba(239,68,68,0.1)',
                border: '1px solid rgba(239,68,68,0.2)', borderRadius: '10px',
                color: 'var(--clr-danger)', fontWeight: 700, fontSize: '1rem',
                cursor: processing || !notes.trim() ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit', transition: 'all 0.3s',
                opacity: processing || !notes.trim() ? 0.6 : 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem'
              }}
              className="hover-lift"
            >
              <LuX size={18} /> {processing ? 'Rejecting...' : 'Reject'}
            </button>
            <button
              onClick={handleApprove}
              disabled={processing}
              style={{
                padding: '1rem', background: 'linear-gradient(135deg,#7c3aed,#0ea5e9)',
                border: 'none', borderRadius: '10px', color: '#fff',
                fontWeight: 700, fontSize: '1rem', cursor: processing ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit', transition: 'all 0.3s',
                opacity: processing ? 0.6 : 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem'
              }}
              className="hover-lift"
            >
              <LuCheck size={18} /> {processing ? 'Approving...' : 'Approve & Credit'}
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* ── Main Tabs ── */}
      <div className="glass" style={{ padding: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
          <h3 style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--clr-text)' }}>Payment Reviews</h3>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <div style={{ padding: '0.55rem 1rem', borderRadius: '8px', background: 'rgba(0,229,255,0.08)', border: '1px solid rgba(0,229,255,0.15)', display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--clr-accent)', fontWeight: 700, fontSize: '0.85rem' }}>
              <LuClock size={15}/> {pendingCount} manual pending
            </div>
            {wPendingCount > 0 && (
              <div style={{ padding: '0.55rem 1rem', borderRadius: '8px', background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)', display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#fbbf24', fontWeight: 700, fontSize: '0.85rem' }}>
                <LuArrowDownLeft size={15}/> {wPendingCount} withdrawal pending
              </div>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', background: 'rgba(255,255,255,0.03)', padding: '0.4rem', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.07)', width: 'fit-content' }}>
          {(['payments', 'withdrawals'] as const).map(tab => (
            <button key={tab} onClick={() => setActiveMainTab(tab)} style={{ padding: '0.55rem 1.2rem', borderRadius: '7px', border: 'none', fontFamily: 'inherit', fontSize: '0.88rem', fontWeight: 700, cursor: 'pointer', transition: 'all 0.18s', background: activeMainTab === tab ? 'rgba(0,229,255,0.12)' : 'transparent', color: activeMainTab === tab ? 'var(--clr-accent)' : 'var(--clr-muted)', boxShadow: activeMainTab === tab ? '0 0 0 1px rgba(0,229,255,0.2)' : 'none' }}>
              {tab === 'payments' ? (
                <span style={{ display:'flex', alignItems:'center', gap:'0.4rem' }}><LuCheck size={14}/>Manual Payments</span>
              ) : (
                <span style={{ display:'flex', alignItems:'center', gap:'0.4rem' }}><LuBanknote size={14}/>Withdrawal Requests</span>
              )}
            </button>
          ))}
        </div>

        {/* Filter row */}
        {activeMainTab === 'payments' ? (
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as 'PENDING' | 'ALL')}
            style={{ marginTop: '1rem', padding: '0.6rem 1rem', background: 'rgba(255,255,255,0.04)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)', color: 'var(--clr-text)', fontFamily: 'inherit', fontSize: '0.9rem', cursor: 'pointer' }}>
            <option value="PENDING">Pending Only</option>
            <option value="ALL">All Payments</option>
          </select>
        ) : (
          <select value={wFilterStatus} onChange={e => setWFilterStatus(e.target.value as 'PENDING' | 'ALL')}
            style={{ marginTop: '1rem', padding: '0.6rem 1rem', background: 'rgba(255,255,255,0.04)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)', color: 'var(--clr-text)', fontFamily: 'inherit', fontSize: '0.9rem', cursor: 'pointer' }}>
            <option value="PENDING">Pending Only</option>
            <option value="ALL">All Requests</option>
          </select>
        )}
      </div>

      {/* ── Errors ── */}
      {activeMainTab === 'payments' && error && (
        <div className="glass" style={{ padding: '1rem', borderLeft: '3px solid var(--clr-danger)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'var(--clr-danger)' }}>
            <LuTriangleAlert size={18}/> <span>{error}</span>
          </div>
        </div>
      )}
      {activeMainTab === 'withdrawals' && wError && (
        <div className="glass" style={{ padding: '1rem', borderLeft: '3px solid var(--clr-danger)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'var(--clr-danger)' }}>
            <LuTriangleAlert size={18}/> <span>{wError}</span>
          </div>
        </div>
      )}

      {/* ── Manual Payments List ── */}
      {activeMainTab === 'payments' && (
        loading ? (
          <div style={{ padding: '2rem', textAlign: 'center' }}><div style={{ display: 'inline-block' }} className="spinner" /></div>
        ) : filteredPayments.length === 0 ? (
          <div className="glass" style={{ padding: '3rem 1rem', textAlign: 'center' }}>
            <div style={{ width: 60, height: 60, borderRadius: '50%', background: 'rgba(0,229,255,0.08)', border: '1px solid rgba(0,229,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem', color: 'var(--clr-muted)' }}>
              <LuCheck size={32}/>
            </div>
            <p style={{ color: 'var(--clr-muted)', fontSize: '1rem', fontWeight: 600 }}>
              {filterStatus === 'PENDING' ? 'No pending payments' : 'No payments found'}
            </p>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            {filteredPayments.map(payment => (
              <div key={payment.id} className="glass hover-lift" style={{ padding: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', cursor: 'pointer', transition: 'all 0.2s', border: '1px solid rgba(255,255,255,0.08)', flexWrap: 'wrap' }}
                onClick={() => { setSelectedPayment(payment); setNotes('') }}>
                <div style={{ flex: 1, minWidth: '200px' }}>
                  <p style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--clr-text)', marginBottom: '0.3rem' }}>{payment.user_name}</p>
                  <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap', marginTop: '0.5rem', fontSize: '0.85rem' }}>
                    <span style={{ color: 'var(--clr-muted)' }}>{payment.user_email}</span>
                    <span style={{ color: 'var(--clr-muted)' }}>•</span>
                    <span style={{ color: 'var(--clr-muted)' }}>{formatDate(payment.submitted_at)}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                  <div style={{ textAlign: 'right', minWidth: '100px' }}>
                    <p style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--clr-accent)' }}>{formatCurrency(payment.amount)}</p>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: payment.status === 'PENDING' ? 'var(--clr-warning)' : payment.status === 'APPROVED' ? 'var(--clr-neon)' : 'var(--clr-danger)', background: payment.status === 'PENDING' ? 'rgba(245,158,11,0.1)' : payment.status === 'APPROVED' ? 'rgba(57,255,20,0.1)' : 'rgba(239,68,68,0.1)', padding: '0.25rem 0.6rem', borderRadius: '6px' }}>
                      {payment.status}
                    </span>
                  </div>
                  <button onClick={e => { e.stopPropagation(); setSelectedPayment(payment); setNotes('') }}
                    style={{ padding: '0.6rem 1rem', background: 'rgba(0,229,255,0.1)', border: '1px solid rgba(0,229,255,0.2)', borderRadius: '8px', color: 'var(--clr-accent)', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem', fontFamily: 'inherit', transition: 'all 0.2s' }} className="hover-lift">
                    <LuEye size={16}/> View
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* ── Withdrawal Requests List ── */}
      {activeMainTab === 'withdrawals' && (
        wLoading ? (
          <div style={{ padding: '2rem', textAlign: 'center' }}><div style={{ display: 'inline-block' }} className="spinner" /></div>
        ) : withdrawals.length === 0 ? (
          <div className="glass" style={{ padding: '3rem 1rem', textAlign: 'center' }}>
            <div style={{ width: 60, height: 60, borderRadius: '50%', background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem', color: '#fbbf24' }}>
              <LuBanknote size={28}/>
            </div>
            <p style={{ color: 'var(--clr-muted)', fontSize: '1rem', fontWeight: 600 }}>
              {wFilterStatus === 'PENDING' ? 'No pending withdrawal requests' : 'No withdrawal requests found'}
            </p>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            {withdrawals.map(wr => {
              const stColor = wr.status === 'APPROVED' ? '#4ade80' : wr.status === 'REJECTED' ? 'var(--clr-danger)' : '#fbbf24'
              return (
                <div key={wr.id} className="glass hover-lift" style={{ padding: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', cursor: 'pointer', transition: 'all 0.2s', border: `1px solid ${stColor}22`, flexWrap: 'wrap' }}
                  onClick={() => { setSelectedWithdrawal(wr); setApprovedAmount(String(wr.amount_requested)); setWCommissionRate(String(wr.commission_rate ?? 15)); setAdminNote(''); setAdminImageB64(null); setRejectReason('') }}>
                  <div style={{ flex: 1, minWidth: '200px' }}>
                    <p style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--clr-text)', marginBottom: '0.2rem' }}>
                      {wr.user_name} <span style={{ fontSize: '0.75rem', color: wr.role_id === 3 ? '#fbbf24' : 'var(--clr-muted)', fontWeight: 600 }}>({wr.role_id === 3 ? 'Driver' : 'Shipper'})</span>
                    </p>
                    <p style={{ fontSize: '0.8rem', color: 'var(--clr-muted)' }}>{wr.bank_details.bank_name} · {wr.bank_details.account_number}</p>
                    <p style={{ fontSize: '0.75rem', color: 'rgba(148,163,184,0.5)', marginTop: '0.2rem' }}>{new Date(wr.created_at).toLocaleDateString('en-ET', { month: 'short', day: 'numeric', year: '2-digit', hour: '2-digit', minute: '2-digit' })}</p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                    <div style={{ textAlign: 'right', minWidth: '120px' }}>
                      <p style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--clr-accent)' }}>{fmt(wr.amount_requested)} ETB</p>
                      <p style={{ fontSize: '0.73rem', color: 'var(--clr-muted)' }}>Bal: {fmt(wr.current_balance)} ETB</p>
                      <span style={{ fontSize: '0.73rem', fontWeight: 700, color: stColor, background: `${stColor}18`, padding: '0.18rem 0.5rem', borderRadius: '5px' }}>{wr.status}</span>
                    </div>
                    <button onClick={e => { e.stopPropagation(); setSelectedWithdrawal(wr); setApprovedAmount(String(wr.amount_requested)); setWCommissionRate(String(wr.commission_rate ?? 15)); setAdminNote(''); setAdminImageB64(null); setRejectReason('') }}
                      style={{ padding: '0.6rem 1rem', background: 'rgba(0,229,255,0.1)', border: '1px solid rgba(0,229,255,0.2)', borderRadius: '8px', color: 'var(--clr-accent)', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem', fontFamily: 'inherit', transition: 'all 0.2s' }} className="hover-lift">
                      <LuEye size={16}/> Review
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )
      )}
    </div>
  )
}
