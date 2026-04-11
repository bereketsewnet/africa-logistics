import { useState, useEffect } from 'react'
import apiClient from '../lib/apiClient'
import {
  LuWallet, LuArrowDownLeft, LuArrowUpRight, LuTrendingUp,
  LuRefreshCw, LuLock, LuTriangleAlert,
} from 'react-icons/lu'

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
  status?: string
  created_at: string
}

function LoadingSkeleton() {
  return (
    <div className="glass" style={{ padding: '1.5rem', animation: 'pulse 2s infinite' }}>
      <div style={{ height: 24, background: 'rgba(255,255,255,0.05)', borderRadius: 8, marginBottom: '1rem' }} />
      <div style={{ height: 16, background: 'rgba(255,255,255,0.05)', borderRadius: 8, width: '60%' }} />
    </div>
  )
}

export default function WalletDashboard() {
  const [wallet, setWallet] = useState<Wallet | null>(null)
  const [recentTransactions, setRecentTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refreshing, setRefreshing] = useState(false)

  const fetchWalletData = async () => {
    try {
      setError('')
      const { data } = await apiClient.get('/profile/wallet')
      setWallet(data.wallet)
      setRecentTransactions(data.recent_transactions || [])
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load wallet')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchWalletData()
  }, [])

  const handleRefresh = async () => {
    setRefreshing(true)
    await fetchWalletData()
    setRefreshing(false)
  }

  if (loading) {
    return (
      <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
        <LoadingSkeleton />
        <LoadingSkeleton />
        <LoadingSkeleton />
      </div>
    )
  }

  if (error) {
    return (
      <div className="glass" style={{ padding: '1.5rem', borderLeft: '3px solid var(--clr-danger)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'var(--clr-danger)' }}>
          <LuTriangleAlert size={20} />
          <span>{error}</span>
        </div>
      </div>
    )
  }

  if (!wallet) {
    return (
      <div className="glass" style={{ padding: '2rem', textAlign: 'center' }}>
        <p style={{ color: 'var(--clr-muted)' }}>No wallet data available</p>
      </div>
    )
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-ET', {
      style: 'currency',
      currency: 'ETB',
      minimumFractionDigits: 2,
    }).format(amount)
  }

  const getTransactionIcon = (type: Transaction['type']) => {
    switch (type) {
      case 'CREDIT':
      case 'BONUS':
      case 'REFUND':
        return <LuArrowDownLeft style={{ color: 'var(--clr-neon)' }} />
      case 'DEBIT':
      case 'COMMISSION':
        return <LuArrowUpRight style={{ color: 'var(--clr-danger)' }} />
      case 'TIP':
        return <LuTrendingUp style={{ color: 'var(--clr-warning)' }} />
      default:
        return <LuWallet style={{ color: 'var(--clr-accent)' }} />
    }
  }

  const getTransactionColor = (type: Transaction['type']) => {
    switch (type) {
      case 'CREDIT':
      case 'BONUS':
      case 'REFUND':
        return 'var(--clr-neon)'
      case 'DEBIT':
      case 'COMMISSION':
        return 'var(--clr-danger)'
      case 'TIP':
        return 'var(--clr-warning)'
      default:
        return 'var(--clr-accent)'
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Main Balance Card */}
      <div className="glass" style={{ padding: '2rem', background: 'linear-gradient(135deg,rgba(124,58,237,0.1),rgba(0,229,255,0.05))' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{
              width: 50, height: 50, borderRadius: '12px',
              background: 'rgba(0,229,255,0.1)', border: '1px solid rgba(0,229,255,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--clr-accent)', fontSize: '1.5rem'
            }}>
              <LuWallet size={24} />
            </div>
            <div>
              <p style={{ fontSize: '0.85rem', color: 'var(--clr-muted)', marginBottom: '0.25rem' }}>Available Balance</p>
              <h3 style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--clr-text)' }}>
                {formatCurrency(wallet.balance)}
              </h3>
            </div>
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 36, height: 36, borderRadius: '9px',
            background: 'rgba(0,229,255,0.1)', cursor: 'pointer',
            transition: 'all 0.3s', border: '1px solid rgba(0,229,255,0.2)',
            color: 'var(--clr-accent)'
          }}
            onClick={handleRefresh}
            className="hover-lift"
            title="Refresh wallet"
          >
            <LuRefreshCw size={16} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
          </div>
        </div>

        {/* Status + Lock */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '1rem',
          padding: '1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '12px',
          border: '1px solid rgba(255,255,255,0.05)'
        }}>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: '0.75rem', color: 'var(--clr-muted)', marginBottom: '0.25rem' }}>Wallet Status</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <div style={{
                width: 8, height: 8, borderRadius: '50%',
                background: wallet.is_locked ? 'var(--clr-danger)' : 'var(--clr-neon)'
              }} />
              <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--clr-text)' }}>
                {wallet.is_locked ? 'Locked' : 'Active'}
              </span>
            </div>
          </div>
          <div style={{ width: 1, height: 30, background: 'rgba(255,255,255,0.1)' }} />
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: '0.75rem', color: 'var(--clr-muted)', marginBottom: '0.25rem' }}>Total Earned</p>
            <p style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--clr-neon)' }}>
              +{formatCurrency(wallet.total_earned)}
            </p>
          </div>
          <div style={{ width: 1, height: 30, background: 'rgba(255,255,255,0.1)' }} />
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: '0.75rem', color: 'var(--clr-muted)', marginBottom: '0.25rem' }}>Total Spent</p>
            <p style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--clr-danger)' }}>
              -{formatCurrency(wallet.total_spent)}
            </p>
          </div>
        </div>
      </div>

      {/* Recent Transactions */}
      <div className="glass" style={{ padding: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h4 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--clr-text)' }}>Recent Transactions</h4>
          <a href="#transactions" style={{
            fontSize: '0.8rem', color: 'var(--clr-accent)', textDecoration: 'none',
            fontWeight: 600, transition: 'opacity 0.2s', cursor: 'pointer'
          }}
            className="hover-opacity"
          >
            View all →
          </a>
        </div>

        {recentTransactions.length === 0 ? (
          <p style={{ fontSize: '0.9rem', color: 'var(--clr-muted)', textAlign: 'center', padding: '2rem 0' }}>
            No transactions yet
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {recentTransactions.slice(0, 5).map((tx) => (
              <div key={tx.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '0.75rem', background: 'rgba(255,255,255,0.02)', borderRadius: '10px',
                border: '1px solid rgba(255,255,255,0.05)', transition: 'all 0.2s'
              }}
                className="hover-lift"
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: '50%',
                    background: `${getTransactionColor(tx.type)}20`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: getTransactionColor(tx.type)
                  }}>
                    {getTransactionIcon(tx.type)}
                  </div>
                  <div>
                    <p style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--clr-text)', marginBottom: '0.1rem' }}>
                      {tx.description}
                    </p>
                    <p style={{ fontSize: '0.75rem', color: 'var(--clr-muted)' }}>
                      {new Date(tx.created_at).toLocaleDateString('en-ET', { month: 'short', day: 'numeric', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
                <div style={{
                  fontSize: '1rem', fontWeight: 700,
                  color: ['CREDIT', 'BONUS', 'REFUND'].includes(tx.type) ? 'var(--clr-neon)' : 'var(--clr-danger)'
                }}>
                  {['CREDIT', 'BONUS', 'REFUND'].includes(tx.type) ? '+' : '-'}{formatCurrency(tx.amount)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Info Box */}
      {wallet.is_locked && (
        <div className="glass" style={{ padding: '1rem', background: 'rgba(239,68,68,0.08)', borderLeft: '3px solid var(--clr-danger)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'var(--clr-danger)' }}>
            <LuLock size={18} />
            <div>
              <p style={{ fontSize: '0.9rem', fontWeight: 600 }}>Wallet Locked</p>
              <p style={{ fontSize: '0.8rem', color: 'rgba(239,68,68,0.8)', marginTop: '0.2rem' }}>
                Your wallet is temporarily locked. Contact support for more information.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
