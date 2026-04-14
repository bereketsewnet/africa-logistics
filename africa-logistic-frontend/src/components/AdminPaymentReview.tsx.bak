import { useState, useEffect } from 'react'
import apiClient from '../lib/apiClient'
import {
  LuCheck, LuX, LuClock, LuEye, LuTriangleAlert, LuChevronLeft,
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

export default function AdminPaymentReview() {
  const [payments, setPayments] = useState<ManualPayment[]>([])
  const [selectedPayment, setSelectedPayment] = useState<ManualPayment | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [processing, setProcessing] = useState(false)
  const [notes, setNotes] = useState('')
  const [filterStatus, setFilterStatus] = useState<'PENDING' | 'ALL'>('PENDING')

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

  useEffect(() => {
    fetchPayments(filterStatus)
  }, [filterStatus])

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

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <div style={{ display: 'inline-block' }} className="spinner" />
      </div>
    )
  }

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
      {/* Header */}
      <div className="glass" style={{ padding: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h3 style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--clr-text)' }}>
              Payment Reviews
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--clr-muted)', marginTop: '0.3rem' }}>
              Manage manual payment submissions
            </p>
          </div>
          <div style={{
            background: 'linear-gradient(135deg,rgba(124,58,237,0.2),rgba(0,229,255,0.1))',
            padding: '0.75rem 1.2rem', borderRadius: '10px', border: '1px solid rgba(0,229,255,0.2)',
            display: 'flex', alignItems: 'center', gap: '0.5rem',
            color: 'var(--clr-accent)', fontWeight: 700
          }}>
            <LuClock size={18} />
            <span>{pendingCount} Pending</span>
          </div>
        </div>

        {/* Filter */}
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as 'PENDING' | 'ALL')}
          style={{
            padding: '0.6rem 1rem', background: 'rgba(255,255,255,0.04)',
            borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)',
            color: 'var(--clr-text)', fontFamily: 'inherit', fontSize: '0.9rem',
            cursor: 'pointer'
          }}
        >
          <option value="PENDING">Pending Only</option>
          <option value="ALL">All Payments</option>
        </select>
      </div>

      {/* Error */}
      {error && (
        <div className="glass" style={{ padding: '1rem', borderLeft: '3px solid var(--clr-danger)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'var(--clr-danger)' }}>
            <LuTriangleAlert size={18} />
            <span>{error}</span>
          </div>
        </div>
      )}

      {/* Payments List */}
      {filteredPayments.length === 0 ? (
        <div className="glass" style={{ padding: '3rem 1rem', textAlign: 'center' }}>
          <div style={{
            width: 60, height: 60, borderRadius: '50%',
            background: 'rgba(0,229,255,0.08)', border: '1px solid rgba(0,229,255,0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 1rem', color: 'var(--clr-muted)'
          }}>
            <LuCheck size={32} />
          </div>
          <p style={{ color: 'var(--clr-muted)', fontSize: '1rem', fontWeight: 600 }}>
            {filterStatus === 'PENDING' ? 'No pending payments' : 'No payments found'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '0.75rem' }}>
          {filteredPayments.map((payment) => (
            <div
              key={payment.id}
              className="glass hover-lift"
              style={{
                padding: '1.25rem', display: 'flex', justifyContent: 'space-between',
                alignItems: 'center', gap: '1rem', cursor: 'pointer',
                transition: 'all 0.2s', border: '1px solid rgba(255,255,255,0.08)',
                flexWrap: 'wrap'
              }}
              onClick={() => {
                setSelectedPayment(payment)
                setNotes('')
              }}
            >
              <div style={{ flex: 1, minWidth: '200px' }}>
                <p style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--clr-text)', marginBottom: '0.3rem' }}>
                  {payment.user_name}
                </p>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap', marginTop: '0.5rem', fontSize: '0.85rem' }}>
                  <span style={{ color: 'var(--clr-muted)' }}>
                    {payment.user_email}
                  </span>
                  <span style={{ color: 'var(--clr-muted)' }}>
                    •
                  </span>
                  <span style={{ color: 'var(--clr-muted)' }}>
                    {formatDate(payment.submitted_at)}
                  </span>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                <div style={{ textAlign: 'right', minWidth: '100px' }}>
                  <p style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--clr-accent)' }}>
                    {formatCurrency(payment.amount)}
                  </p>
                  <span style={{
                    fontSize: '0.75rem', fontWeight: 700,
                    color: payment.status === 'PENDING' ? 'var(--clr-warning)' : payment.status === 'APPROVED' ? 'var(--clr-neon)' : 'var(--clr-danger)',
                    background: payment.status === 'PENDING' ? 'rgba(245,158,11,0.1)' : payment.status === 'APPROVED' ? 'rgba(57,255,20,0.1)' : 'rgba(239,68,68,0.1)',
                    padding: '0.25rem 0.6rem', borderRadius: '6px'
                  }}>
                    {payment.status}
                  </span>
                </div>

                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setSelectedPayment(payment)
                    setNotes('')
                  }}
                  style={{
                    padding: '0.6rem 1rem', background: 'rgba(0,229,255,0.1)',
                    border: '1px solid rgba(0,229,255,0.2)', borderRadius: '8px',
                    color: 'var(--clr-accent)', cursor: 'pointer',
                    fontSize: '0.9rem', fontWeight: 600, display: 'flex',
                    alignItems: 'center', gap: '0.4rem', fontFamily: 'inherit',
                    transition: 'all 0.2s'
                  }}
                  className="hover-lift"
                >
                  <LuEye size={16} /> View
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
