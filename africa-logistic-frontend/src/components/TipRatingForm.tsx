import { useState } from 'react'
import apiClient from '../lib/apiClient'
import { LuStar, LuTriangleAlert, LuCheck } from 'react-icons/lu'

interface TipRatingFormProps {
  orderId: string
  driverId: string
  onClose?: () => void
  onSuccess?: () => void
}

export default function TipRatingForm({ orderId, driverId: _driverId, onClose, onSuccess }: TipRatingFormProps) {
  const [tipAmount, setTipAmount] = useState(0)
  const [rating, setRating] = useState(0)
  const [hoveredRating, setHoveredRating] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const handleSubmit = async () => {
    if (rating === 0) {
      setError('Please select a rating')
      return
    }

    setLoading(true)
    setError('')

    try {
      await apiClient.post(`/orders/${orderId}/add-tip`, {
        tip_amount: tipAmount,
        rating_stars: rating
      })
      setSuccess(true)
      setTimeout(() => {
        onSuccess?.()
        onClose?.()
      }, 1500)
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to submit tip')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div style={{
        textAlign: 'center', padding: '2rem',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem'
      }}>
        <div style={{
          width: 60, height: 60, borderRadius: '50%',
          background: 'rgba(57,255,20,0.1)', border: '2px solid var(--clr-neon)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--clr-neon)', fontSize: '1.8rem'
        }}>
          <LuCheck size={32} />
        </div>
        <div>
          <h4 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--clr-text)', marginBottom: '0.3rem' }}>
            Thank you!
          </h4>
          <p style={{ fontSize: '0.9rem', color: 'var(--clr-muted)' }}>
            Your tip and rating have been recorded
          </p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div>
        <label style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--clr-text)', display: 'block', marginBottom: '0.75rem' }}>
          How would you rate this delivery?
        </label>
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              onClick={() => setRating(star)}
              onMouseEnter={() => setHoveredRating(star)}
              onMouseLeave={() => setHoveredRating(0)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: '2rem', transition: 'all 0.2s', padding: 0,
                color: (hoveredRating || rating) >= star ? 'var(--clr-warning)' : 'rgba(100,116,139,0.3)',
                transform: (hoveredRating || rating) >= star ? 'scale(1.2)' : 'scale(1)'
              }}
            >
              <LuStar size={32} fill="currentColor" />
            </button>
          ))}
        </div>
        {rating > 0 && (
          <p style={{ fontSize: '0.85rem', color: 'var(--clr-accent)', textAlign: 'center', marginTop: '0.5rem', fontWeight: 600 }}>
            {rating} {rating === 1 ? 'star' : 'stars'}
          </p>
        )}
      </div>

      <div>
        <label style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--clr-text)', display: 'block', marginBottom: '0.75rem' }}>
          Add a tip (optional)
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem', marginBottom: '1rem' }}>
          {[0, 50, 100, 200].map((amount) => (
            <button
              key={amount}
              onClick={() => setTipAmount(amount)}
              style={{
                padding: '0.75rem', background: tipAmount === amount ? 'rgba(0,229,255,0.2)' : 'rgba(255,255,255,0.03)',
                border: tipAmount === amount ? '1.5px solid var(--clr-accent)' : '1px solid rgba(255,255,255,0.08)',
                borderRadius: '10px', color: 'var(--clr-text)', fontWeight: 600,
                cursor: 'pointer', transition: 'all 0.2s', fontSize: '0.9rem',
                fontFamily: 'inherit'
              }}
              className="hover-lift"
            >
              {amount === 0 ? 'Skip' : `+${amount} ብር`}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem' }}>
          <input
            type="number"
            placeholder="Custom amount"
            value={tipAmount}
            onChange={(e) => setTipAmount(Math.max(0, Number(e.target.value)))}
            min="0"
            step="10"
            max="50000"
            style={{
              flex: 1, padding: '0.75rem 1rem', background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px',
              color: 'var(--clr-text)', fontFamily: 'inherit', fontSize: '0.95rem',
              outline: 'none'
            }}
          />
          <span style={{
            display: 'flex', alignItems: 'center', padding: '0.75rem 1rem',
            background: 'rgba(255,255,255,0.03)', borderRadius: '10px',
            color: 'var(--clr-muted)', fontWeight: 600, minWidth: '60px', justifyContent: 'center'
          }}>
            ብር
          </span>
        </div>

        {tipAmount > 0 && (
          <p style={{ fontSize: '0.85rem', color: 'var(--clr-neon)', marginBottom: '1rem', fontWeight: 600 }}>
            Tip amount: {new Intl.NumberFormat('en-ET', { style: 'currency', currency: 'ETB' }).format(tipAmount)}
          </p>
        )}
      </div>

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

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
        <button
          onClick={onClose}
          style={{
            padding: '0.9rem', background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px',
            color: 'var(--clr-text)', fontWeight: 600, cursor: 'pointer',
            fontSize: '0.95rem', fontFamily: 'inherit', transition: 'all 0.2s'
          }}
          className="hover-lift"
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={loading || rating === 0}
          style={{
            padding: '0.9rem', background: 'linear-gradient(135deg,#7c3aed,#0ea5e9)',
            border: 'none', borderRadius: '10px', color: '#fff',
            fontWeight: 700, cursor: loading || rating === 0 ? 'not-allowed' : 'pointer',
            fontSize: '0.95rem', fontFamily: 'inherit', transition: 'all 0.3s',
            opacity: loading || rating === 0 ? 0.6 : 1,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem'
          }}
          className="hover-lift"
        >
          {loading ? (
            <>
              <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>⟳</span> Submitting...
            </>
          ) : (
            'Submit'
          )}
        </button>
      </div>
    </div>
  )
}
