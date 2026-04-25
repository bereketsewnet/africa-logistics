import { useState, useEffect } from 'react'
import apiClient from '../lib/apiClient'
import {
  LuTrendingUp, LuStar, LuTruck, LuTriangleAlert, LuZap,
  LuChevronLeft, LuChevronRight,
} from 'react-icons/lu'

interface DriverMetrics {
  user_id: string
  first_name: string
  last_name: string
  email: string
  phone_number: string
  total_trips: number
  on_time_delivery_rate: number
  average_rating: number
  streak_days: number
  last_delivery_date: string | null
  eligible_bonus_tier: 'TIER_1' | 'TIER_2' | 'TIER_3' | 'NOT_ELIGIBLE' | null
  eligible_bonus_amount: number
}

export default function AdminPerformanceBonus() {
  const [metrics, setMetrics] = useState<DriverMetrics[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [processing, setProcessing] = useState(false)
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [sortBy, setSortBy] = useState<'bonus' | 'trips' | 'rating'>('bonus')

  const ITEMS_PER_PAGE = 20

  const fetchMetrics = async (offset: number, sortOverride?: 'bonus' | 'trips' | 'rating') => {
    try {
      setError('')
      const { data } = await apiClient.get('/admin/drivers/performance-metrics', {
        params: { limit: ITEMS_PER_PAGE, offset, sort_by: sortOverride ?? sortBy }
      })
      setMetrics(data.metrics || [])
      setHasMore(data.has_more || false)
      setPage(offset / ITEMS_PER_PAGE)
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load metrics')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchMetrics(0)
  }, [])

  const handleSort = (newSort: 'bonus' | 'trips' | 'rating') => {
    setSortBy(newSort)
    fetchMetrics(0, newSort)
  }

  const handleProcessBonuses = async () => {
    setProcessing(true)
    try {
      const { data } = await apiClient.post('/admin/bonuses/process')
      alert(`Bonuses processed! ${data.processed} drivers received bonuses.`)
      fetchMetrics(0)
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to process bonuses')
    } finally {
      setProcessing(false)
    }
  }

  const handlePrevPage = () => {
    if (page > 0) {
      fetchMetrics((page - 1) * ITEMS_PER_PAGE)
    }
  }

  const handleNextPage = () => {
    if (hasMore) {
      fetchMetrics((page + 1) * ITEMS_PER_PAGE)
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-ET', {
      style: 'currency',
      currency: 'ETB',
      minimumFractionDigits: 0,
    }).format(amount)
  }

  const getBonusTierColor = (tier: string | null) => {
    switch (tier) {
      case 'TIER_1':
        return 'var(--clr-neon)'
      case 'TIER_2':
        return 'var(--clr-accent)'
      case 'TIER_3':
        return 'var(--clr-warning)'
      default:
        return 'var(--clr-muted)'
    }
  }

  const getBonusDescription = (tier: string | null) => {
    switch (tier) {
      case 'TIER_1':
        return '50+ trips, 90%+ on-time, 4.5+ ⭐ → 500 ብር'
      case 'TIER_2':
        return '20+ trips, 80%+ on-time, 4.0+ ⭐ → 200 ብር'
      case 'TIER_3':
        return '10+ trips, 70%+ on-time, 3.5+ ⭐ → 50 ብር'
      default:
        return 'Not eligible for bonus'
    }
  }

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <div style={{ display: 'inline-block' }} className="spinner" />
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header */}
      <div className="glass" style={{ padding: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h3 style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--clr-text)' }}>
              Performance Bonuses
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--clr-muted)', marginTop: '0.3rem' }}>
              Manage driver bonus distribution and metrics
            </p>
          </div>
          <button
            onClick={handleProcessBonuses}
            disabled={processing}
            style={{
              padding: '0.75rem 1.5rem', background: 'linear-gradient(135deg,#3e6113,#71ad25)',
              border: 'none', borderRadius: '8px', color: '#fff',
              fontWeight: 700, cursor: processing ? 'not-allowed' : 'pointer',
              fontSize: '0.95rem', fontFamily: 'inherit', transition: 'all 0.3s',
              opacity: processing ? 0.6 : 1,
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              whiteSpace: 'nowrap'
            }}
            className="hover-lift"
          >
            <LuZap size={16} />
            {processing ? 'Processing...' : 'Process Bonuses'}
          </button>
        </div>

        {/* Sorting Options */}
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {(['bonus', 'trips', 'rating'] as const).map((sort) => (
            <button
              key={sort}
              onClick={() => handleSort(sort)}
              style={{
                padding: '0.5rem 1rem', background: sortBy === sort ? 'rgba(97, 148, 31,0.2)' : 'rgba(255,255,255,0.04)',
                border: sortBy === sort ? '1px solid rgba(97, 148, 31,0.3)' : '1px solid rgba(255,255,255,0.08)',
                borderRadius: '8px', color: sortBy === sort ? 'var(--clr-accent)' : 'var(--clr-text)',
                fontWeight: 600, cursor: 'pointer', fontSize: '0.85rem',
                fontFamily: 'inherit', transition: 'all 0.2s'
              }}
              className="hover-lift"
            >
              {sort === 'bonus' && <LuZap size={14} style={{ marginRight: '0.3rem' }} />}
              {sort === 'trips' && <LuTruck size={14} style={{ marginRight: '0.3rem' }} />}
              {sort === 'rating' && <LuStar size={14} style={{ marginRight: '0.3rem' }} />}
              Sort by {sort === 'bonus' ? 'Bonus' : sort === 'trips' ? 'Trips' : 'Rating'}
            </button>
          ))}
        </div>
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

      {/* Metrics List */}
      <div style={{ display: 'grid', gap: '0.75rem' }}>
        {metrics.length === 0 ? (
          <div className="glass" style={{ padding: '3rem 1rem', textAlign: 'center' }}>
            <p style={{ color: 'var(--clr-muted)', fontSize: '1rem' }}>
              No driver metrics available
            </p>
          </div>
        ) : (
          metrics.map((driver) => (
            <div
              key={driver.user_id}
              className="glass hover-lift"
              style={{
                padding: '1.25rem', display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
                gap: '1rem', alignItems: 'center',
                border: '1px solid rgba(255,255,255,0.08)',
                transition: 'all 0.2s'
              }}
            >
              {/* Driver Info */}
              <div style={{ gridColumn: '1 / -1' }}>
                <p style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--clr-text)', marginBottom: '0.2rem' }}>
                  {driver.first_name} {driver.last_name}
                </p>
                <p style={{ fontSize: '0.8rem', color: 'var(--clr-muted)' }}>
                  {driver.email}
                </p>
              </div>

              {/* Metrics */}
              <div style={{ background: 'rgba(255,255,255,0.02)', padding: '0.75rem', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.05)' }}>
                <p style={{ fontSize: '0.75rem', color: 'var(--clr-muted)', marginBottom: '0.3rem' }}>Trips</p>
                <p style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--clr-text)' }}>
                  {driver.total_trips}
                </p>
              </div>

              <div style={{ background: 'rgba(255,255,255,0.02)', padding: '0.75rem', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.05)' }}>
                <p style={{ fontSize: '0.75rem', color: 'var(--clr-muted)', marginBottom: '0.3rem' }}>On-Time</p>
                <p style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--clr-accent)' }}>
                  {(driver.on_time_delivery_rate * 100).toFixed(0)}%
                </p>
              </div>

              <div style={{ background: 'rgba(255,255,255,0.02)', padding: '0.75rem', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.05)' }}>
                <p style={{ fontSize: '0.75rem', color: 'var(--clr-muted)', marginBottom: '0.3rem' }}>Rating</p>
                <p style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--clr-warning)' }}>
                  {driver.average_rating.toFixed(1)} ⭐
                </p>
              </div>

              <div style={{ background: 'rgba(255,255,255,0.02)', padding: '0.75rem', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.05)' }}>
                <p style={{ fontSize: '0.75rem', color: 'var(--clr-muted)', marginBottom: '0.3rem' }}>Streak</p>
                <p style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--clr-neon)' }}>
                  {driver.streak_days}d
                </p>
              </div>

              {/* Bonus Section */}
              <div style={{ gridColumn: '1 / -1', padding: '1rem', background: 'linear-gradient(135deg,rgba(62,97,19,0.1),rgba(97, 148, 31,0.05))', borderRadius: '10px', border: '1px solid rgba(97, 148, 31,0.2)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
                  <div>
                    <p style={{ fontSize: '0.8rem', color: 'var(--clr-muted)', marginBottom: '0.3rem' }}>Bonus Tier</p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{
                        fontSize: '1rem', fontWeight: 800,
                        color: getBonusTierColor(driver.eligible_bonus_tier)
                      }}>
                        {driver.eligible_bonus_tier || 'Not Eligible'}
                      </span>
                      {driver.eligible_bonus_tier === 'TIER_1' && <LuTrendingUp size={16} style={{ color: 'var(--clr-neon)' }} />}
                    </div>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <p style={{ fontSize: '0.8rem', color: 'var(--clr-muted)', marginBottom: '0.3rem' }}>Eligible Bonus</p>
                    <p style={{
                      fontSize: '1.3rem', fontWeight: 800,
                      color: driver.eligible_bonus_amount > 0 ? 'var(--clr-neon)' : 'var(--clr-muted)'
                    }}>
                      {formatCurrency(driver.eligible_bonus_amount)}
                    </p>
                  </div>

                  <p style={{ fontSize: '0.85rem', color: 'var(--clr-muted)', fontStyle: 'italic' }}>
                    {getBonusDescription(driver.eligible_bonus_tier)}
                  </p>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Pagination */}
      {metrics.length > 0 && (
        <div style={{
          display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '1rem',
          padding: '1rem'
        }}>
          <button
            onClick={handlePrevPage}
            disabled={page === 0}
            style={{
              padding: '0.5rem 1rem', borderRadius: '8px', border: 'none',
              background: page === 0 ? 'rgba(255,255,255,0.03)' : 'rgba(97, 148, 31,0.1)',
              color: page === 0 ? 'var(--clr-muted)' : 'var(--clr-accent)',
              cursor: page === 0 ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              fontWeight: 600, fontSize: '0.9rem', fontFamily: 'inherit',
              transition: 'all 0.2s'
            }}
            className="hover-lift"
          >
            <LuChevronLeft size={16} /> Previous
          </button>

          <span style={{ color: 'var(--clr-muted)', fontSize: '0.9rem', fontWeight: 600 }}>
            Page {page + 1}
          </span>

          <button
            onClick={handleNextPage}
            disabled={!hasMore}
            style={{
              padding: '0.5rem 1rem', borderRadius: '8px', border: 'none',
              background: !hasMore ? 'rgba(255,255,255,0.03)' : 'rgba(97, 148, 31,0.1)',
              color: !hasMore ? 'var(--clr-muted)' : 'var(--clr-accent)',
              cursor: !hasMore ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              fontWeight: 600, fontSize: '0.9rem', fontFamily: 'inherit',
              transition: 'all 0.2s'
            }}
            className="hover-lift"
          >
            Next <LuChevronRight size={16} />
          </button>
        </div>
      )}

      {/* Info Box */}
      <div style={{
        padding: '1rem', background: 'rgba(59,102,255,0.07)',
        border: '1px solid rgba(59,102,255,0.2)', borderRadius: '10px',
        display: 'flex', gap: '0.75rem'
      }}>
        <LuTriangleAlert size={18} style={{ color: 'var(--clr-accent)', flexShrink: 0, marginTop: '0.1rem' }} />
        <div style={{ fontSize: '0.85rem', color: 'var(--clr-muted)', lineHeight: 1.5 }}>
          <strong>System Bonus Tiers (Admin-run):</strong>
          <ul style={{ marginLeft: '1.2rem', marginTop: '0.3rem' }}>
            <li><strong>TIER_1:</strong> 500 ብር - 50+ trips, 90%+ on-time, 4.5+ rating</li>
            <li><strong>TIER_2:</strong> 200 ብር - 20+ trips, 80%+ on-time, 4.0+ rating</li>
            <li><strong>TIER_3:</strong> 50 ብር - 10+ trips, 70%+ on-time, 3.5+ rating</li>
            <li><strong>Streak Bonus:</strong> +50 ብር per day for consecutive deliveries</li>
          </ul>
          <p style={{ marginTop: '0.45rem' }}>
            Shipper tips are separate and controlled by the shipper from order details after delivery.
          </p>
        </div>
      </div>
    </div>
  )
}
