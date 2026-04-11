import { useState } from 'react'
import apiClient from '../lib/apiClient'
import { LuUpload, LuTriangleAlert, LuCheck, LuCamera, LuFileText } from 'react-icons/lu'

interface ManualPaymentPageProps {
  onSuccess?: () => void
}

export default function ManualPaymentPage({ onSuccess }: ManualPaymentPageProps) {
  const [amount, setAmount] = useState('')
  const [proof, setProof] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [successAmount, setSuccessAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('Bank Transfer')

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        setError('File size must be less than 5MB')
        return
      }
      if (!['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(file.type)) {
        setError('Only JPG, PNG, WebP, or PDF files are allowed')
        return
      }
      setProof(file)
      setError('')

      // Create preview
      const reader = new FileReader()
      reader.onload = (e) => {
        setPreviewUrl(e.target?.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!amount || Number(amount) <= 0) {
      setError('Please enter a valid amount')
      return
    }

    if (!proof) {
      setError('Please attach a payment proof')
      return
    }

    setLoading(true)

    try {
      await apiClient.post('/profile/wallet/manual-payment', {
        amount: Number(amount),
        payment_method: paymentMethod,
        proof_image: previewUrl || undefined,
      })
      setSuccessAmount(amount)
      setSuccess(true)
      setTimeout(() => {
        onSuccess?.()
        setAmount('')
        setProof(null)
        setPreviewUrl('')
        setSuccess(false)
      }, 2000)
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to submit payment')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="glass" style={{
        padding: '3rem 2rem', textAlign: 'center',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem'
      }}>
        <div style={{
          width: 70, height: 70, borderRadius: '50%',
          background: 'rgba(57,255,20,0.1)', border: '2px solid var(--clr-neon)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--clr-neon)', fontSize: '1.8rem',
          animation: 'scale-up 0.5s ease-out'
        }}>
          <LuCheck size={40} />
        </div>
        <div>
          <h3 style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--clr-text)', marginBottom: '0.5rem' }}>
            Payment Submitted
          </h3>
          <p style={{ fontSize: '1rem', color: 'var(--clr-neon)', fontWeight: 700, marginBottom: '0.5rem' }}>
            +{new Intl.NumberFormat('en-ET', { style: 'currency', currency: 'ETB' }).format(Number(successAmount))}
          </p>
          <p style={{ fontSize: '0.9rem', color: 'var(--clr-muted)', lineHeight: 1.5 }}>
            Your payment proof has been submitted for review. <br />
            Admin will verify and credit your wallet within 24 hours.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="glass" style={{ padding: '2rem', maxWidth: '600px', margin: '0 auto' }}>
      <h3 style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--clr-text)', marginBottom: '0.5rem' }}>
        Add Funds to Wallet
      </h3>
      <p style={{ fontSize: '0.9rem', color: 'var(--clr-muted)', marginBottom: '2rem' }}>
        Submit a bank transfer proof to credit your wallet
      </p>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {/* Amount Input */}
        <div>
          <label style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--clr-text)', display: 'block', marginBottom: '0.5rem' }}>
            Amount (ብር)
          </label>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              type="number"
              placeholder="e.g., 1000"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              min="100"
              max="500000"
              step="100"
              required
              style={{
                flex: 1, padding: '0.85rem 1rem', background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px',
                color: 'var(--clr-text)', fontSize: '1rem', fontFamily: 'inherit',
                outline: 'none'
              }}
            />
            <div style={{
              display: 'flex', alignItems: 'center', padding: '0.85rem 1rem',
              background: 'rgba(255,255,255,0.03)', borderRadius: '10px',
              color: 'var(--clr-muted)', fontWeight: 700, minWidth: '60px', justifyContent: 'center'
            }}>
              ብር
            </div>
          </div>
          <p style={{ fontSize: '0.75rem', color: 'var(--clr-muted)', marginTop: '0.4rem' }}>
            Minimum: 100 ብር | Maximum: 500,000 ብር
          </p>
        </div>

        {/* Payment Method */}
        <div>
          <label style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--clr-text)', display: 'block', marginBottom: '0.5rem' }}>
            Payment Method
          </label>
          <select
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value)}
            required
            style={{
              width: '100%', padding: '0.85rem 1rem', background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px',
              color: 'var(--clr-text)', fontSize: '1rem', fontFamily: 'inherit',
              outline: 'none', cursor: 'pointer'
            }}
          >
            <option value="Bank Transfer">Bank Transfer</option>
            <option value="CBE Birr">CBE Birr</option>
            <option value="Telebirr">Telebirr</option>
            <option value="Other">Other</option>
          </select>
        </div>

        {/* File Upload */}
        <div>
          <label style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--clr-text)', display: 'block', marginBottom: '0.75rem' }}>
            Payment Proof <span style={{ color: 'var(--clr-danger)' }}>*</span>
          </label>

          {/* File Input Hidden */}
          <input
            type="file"
            id="proof-upload"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />

          {/* Preview */}
          {previewUrl ? (
            <div style={{ position: 'relative', marginBottom: '1rem' }}>
              {proof?.type === 'application/pdf' ? (
                <div style={{
                  width: '100%', padding: '2rem',
                  borderRadius: '12px', border: '1px solid rgba(0,229,255,0.2)',
                  background: 'rgba(255,255,255,0.03)',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem'
                }}>
                  <LuFileText size={48} style={{ color: 'var(--clr-accent)' }} />
                  <p style={{ fontSize: '0.9rem', color: 'var(--clr-text)', fontWeight: 600 }}>{proof.name}</p>
                  <p style={{ fontSize: '0.8rem', color: 'var(--clr-muted)' }}>PDF document selected</p>
                </div>
              ) : (
                <img
                  src={previewUrl}
                  alt="Preview"
                  style={{
                    width: '100%', maxHeight: '300px', objectFit: 'cover',
                    borderRadius: '12px', border: '1px solid rgba(0,229,255,0.2)'
                  }}
                />
              )}
              <button
                type="button"
                onClick={() => {
                  setProof(null)
                  setPreviewUrl('')
                }}
                style={{
                  position: 'absolute', top: '0.5rem', right: '0.5rem',
                  width: 36, height: 36, borderRadius: '50%',
                  background: 'rgba(0,0,0,0.5)', border: 'none',
                  color: '#fff', cursor: 'pointer', fontSize: '1.2rem',
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}
              >
                ✕
              </button>
            </div>
          ) : (
            <label
              htmlFor="proof-upload"
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                padding: '2rem', background: 'rgba(124,58,237,0.07)', border: '2px dashed rgba(124,58,237,0.3)',
                borderRadius: '12px', cursor: 'pointer', transition: 'all 0.2s'
              }}
              className="hover-lift"
            >
              <LuCamera size={40} style={{ color: 'var(--clr-accent2)', marginBottom: '0.75rem' }} />
              <p style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--clr-text)', marginBottom: '0.25rem' }}>
                Click to upload or drag and drop
              </p>
              <p style={{ fontSize: '0.8rem', color: 'var(--clr-muted)' }}>
                PNG, JPG, WebP, or PDF (Max 5MB)
              </p>
            </label>
          )}

          {proof && (
            <p style={{ fontSize: '0.85rem', color: 'var(--clr-neon)', marginTop: '0.5rem', fontWeight: 600 }}>
              ✓ {proof.name}
            </p>
          )}
        </div>

        {/* Info Box */}
        <div style={{
          padding: '1rem', background: 'rgba(59,102,255,0.07)',
          border: '1px solid rgba(59,102,255,0.2)', borderRadius: '10px',
          display: 'flex', gap: '0.75rem'
        }}>
          <LuTriangleAlert size={18} style={{ color: 'var(--clr-accent)', flexShrink: 0, marginTop: '0.1rem' }} />
          <div style={{ fontSize: '0.85rem', color: 'var(--clr-muted)', lineHeight: 1.5 }}>
            <strong>Please ensure your proof includes:</strong>
            <ul style={{ marginLeft: '1.2rem', marginTop: '0.3rem' }}>
              <li>Transaction ID or confirmation number</li>
              <li>Amount transferred</li>
              <li>Timestamp of transfer</li>
              <li>Clear visibility of payment details</li>
            </ul>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div style={{
            padding: '0.75rem 1rem', background: 'rgba(239,68,68,0.1)',
            border: '1px solid rgba(239,68,68,0.2)', borderRadius: '10px',
            display: 'flex', alignItems: 'flex-start', gap: '0.75rem',
            color: 'var(--clr-danger)'
          }}>
            <LuTriangleAlert size={18} style={{ marginTop: '0.1rem', flexShrink: 0 }} />
            <span style={{ fontSize: '0.9rem' }}>{error}</span>
          </div>
        )}

        {/* Submit Button */}
        <button
          type="submit"
          disabled={loading || !amount || !proof}
          style={{
            padding: '1rem', background: 'linear-gradient(135deg,#7c3aed,#0ea5e9)',
            border: 'none', borderRadius: '10px', color: '#fff',
            fontWeight: 700, cursor: loading || !amount || !proof ? 'not-allowed' : 'pointer',
            fontSize: '1rem', fontFamily: 'inherit', transition: 'all 0.3s',
            opacity: loading || !amount || !proof ? 0.6 : 1,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem'
          }}
          className="hover-lift"
        >
          <LuUpload size={18} />
          {loading ? 'Submitting...' : 'Submit Payment'}
        </button>

        <p style={{ fontSize: '0.8rem', color: 'var(--clr-muted)', textAlign: 'center' }}>
          Your identity is secure. Payment details are verified by our admin team only.
        </p>
      </form>
    </div>
  )
}
