import { useState } from 'react'
import apiClient from '../lib/apiClient'
import { LuSearch, LuTriangleAlert, LuPlus, LuMinus, LuSettings } from 'react-icons/lu'

interface UserWallet {
  user_id: string
  wallet_id: string
  first_name: string
  last_name: string
  email: string
  phone_number: string
  current_balance: number
  total_earned: number
  total_spent: number
}

type AdjustmentType = 'DEPOSIT' | 'WITHDRAWAL' | 'REFUND' | 'ADJUSTMENT'

export default function AdminWalletAdjustment() {
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedUser, setSelectedUser] = useState<UserWallet | null>(null)
  const [users, setUsers] = useState<UserWallet[]>([])
  const [searched, setSearched] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Adjustment form
  const [adjustmentType, setAdjustmentType] = useState<AdjustmentType>('DEPOSIT')
  const [adjustmentAmount, setAdjustmentAmount] = useState('')
  const [adjustmentNotes, setAdjustmentNotes] = useState('')
  const [processing, setProcessing] = useState(false)
  const [success, setSuccess] = useState(false)

  const handleSearch = async () => {
    const q = searchTerm.trim().toLowerCase()
    if (!q) {
      setError('Please enter a name, email or phone number')
      return
    }

    setLoading(true)
    setError('')
    setUsers([])

    try {
      const { data } = await apiClient.get('/admin/users')
      const allUsers: any[] = data.users ?? []
      const matched = allUsers.filter((u: any) =>
        (u.email ?? '').toLowerCase().includes(q) ||
        (u.phone_number ?? '').toLowerCase().includes(q) ||
        (`${u.first_name} ${u.last_name}`).toLowerCase().includes(q)
      )
      if (matched.length === 0) {
        setError('No users found matching that search.')
      } else {
        setUsers(matched.map((u: any) => ({
          user_id: u.id,
          wallet_id: '',
          first_name: u.first_name,
          last_name: u.last_name,
          email: u.email ?? '',
          phone_number: u.phone_number ?? '',
          current_balance: 0,
          total_earned: 0,
          total_spent: 0,
        })))
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to search users')
    } finally {
      setLoading(false)
      setSearched(true)
    }
  }

  const handleAdjustment = async () => {
    if (!selectedUser || !adjustmentAmount) {
      setError('Please select a user and enter amount')
      return
    }

    setProcessing(true)
    setError('')

    try {
      await apiClient.post(`/admin/wallets/${selectedUser.user_id}/adjust`, {
        adjustment_type: adjustmentType,
        amount: Number(adjustmentAmount),
        notes: adjustmentNotes || undefined
      })

      setSuccess(true)
      setTimeout(() => {
        setSuccess(false)
        setSelectedUser(null)
        setAdjustmentAmount('')
        setAdjustmentNotes('')
      }, 2000)
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to adjust wallet')
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

  const getAdjustmentIcon = (type: AdjustmentType) => {
    switch (type) {
      case 'DEPOSIT':
      case 'REFUND':
        return <LuPlus size={18} />
      case 'WITHDRAWAL':
      case 'ADJUSTMENT':
        return <LuMinus size={18} />
      default:
        return <LuSettings size={18} />
    }
  }

  if (selectedUser && !success) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {/* Header */}
        <div className="glass" style={{ padding: '1.5rem' }}>
          <button
            onClick={() => setSelectedUser(null)}
            style={{
              background: 'none', border: 'none', color: 'var(--clr-accent)',
              cursor: 'pointer', fontSize: '0.95rem', marginBottom: '1rem',
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              padding: '0.5rem 0', fontWeight: 600, fontFamily: 'inherit'
            }}
            className="hover-opacity"
          >
            ← Back
          </button>
          <h3 style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--clr-text)' }}>
            Wallet Adjustment
          </h3>
        </div>

        {/* User Info */}
        <div className="glass" style={{ padding: '1.5rem' }}>
          <h4 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--clr-text)', marginBottom: '1rem' }}>
            User Information
          </h4>
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--clr-muted)' }}>Name:</span>
              <span style={{ color: 'var(--clr-text)', fontWeight: 600 }}>
                {selectedUser.first_name} {selectedUser.last_name}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--clr-muted)' }}>Email:</span>
              <span style={{ color: 'var(--clr-text)', fontWeight: 600 }}>
                {selectedUser.email}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--clr-muted)' }}>Current Balance:</span>
              <span style={{ color: 'var(--clr-accent)', fontWeight: 700, fontSize: '1.1rem' }}>
                {formatCurrency(selectedUser.current_balance)}
              </span>
            </div>
          </div>
        </div>

        {/* Adjustment Form */}
        <div className="glass" style={{ padding: '1.5rem' }}>
          <h4 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--clr-text)', marginBottom: '1rem' }}>
            Make Adjustment
          </h4>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Type Selection */}
            <div>
              <label style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--clr-text)', display: 'block', marginBottom: '0.5rem' }}>
                Adjustment Type
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '0.5rem' }}>
                {(['DEPOSIT', 'WITHDRAWAL', 'REFUND', 'ADJUSTMENT'] as AdjustmentType[]).map((type) => (
                  <button
                    key={type}
                    onClick={() => setAdjustmentType(type)}
                    style={{
                      padding: '0.75rem', background: adjustmentType === type ? 'linear-gradient(135deg,#7c3aed,#0ea5e9)' : 'rgba(255,255,255,0.04)',
                      border: adjustmentType === type ? 'none' : '1px solid rgba(255,255,255,0.08)',
                      borderRadius: '8px', color: adjustmentType === type ? '#fff' : 'var(--clr-text)',
                      fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem',
                      fontFamily: 'inherit', transition: 'all 0.2s',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem'
                    }}
                    className="hover-lift"
                  >
                    {getAdjustmentIcon(type)}
                    {type}
                  </button>
                ))}
              </div>
            </div>

            {/* Amount Input */}
            <div>
              <label style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--clr-text)', display: 'block', marginBottom: '0.5rem' }}>
                Amount (ብር)
              </label>
              <input
                type="number"
                placeholder="0"
                value={adjustmentAmount}
                onChange={(e) => setAdjustmentAmount(e.target.value)}
                min="0"
                step="100"
                style={{
                  width: '100%', padding: '0.85rem 1rem', background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px',
                  color: 'var(--clr-text)', fontSize: '1rem', fontFamily: 'inherit',
                  outline: 'none'
                }}
              />
            </div>

            {/* Notes */}
            <div>
              <label style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--clr-text)', display: 'block', marginBottom: '0.5rem' }}>
                Notes (reason for adjustment)
              </label>
              <textarea
                placeholder="e.g., Refund for cancelled order #12345"
                value={adjustmentNotes}
                onChange={(e) => setAdjustmentNotes(e.target.value)}
                style={{
                  width: '100%', minHeight: '80px', padding: '0.85rem 1rem',
                  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '10px', color: 'var(--clr-text)', fontSize: '0.95rem',
                  fontFamily: 'inherit', resize: 'none', outline: 'none'
                }}
              />
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

            {/* Preview */}
            {adjustmentAmount && (
              <div style={{
                padding: '1rem', background: 'rgba(124,58,237,0.08)',
                border: '1px solid rgba(124,58,237,0.2)', borderRadius: '10px'
              }}>
                <p style={{ fontSize: '0.85rem', color: 'var(--clr-muted)', marginBottom: '0.5rem' }}>
                  {adjustmentType === 'DEPOSIT' || adjustmentType === 'REFUND' ? 'Will add' : 'Will deduct'}:
                </p>
                <p style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--clr-accent2)' }}>
                  {adjustmentType === 'DEPOSIT' || adjustmentType === 'REFUND' ? '+' : '-'}{formatCurrency(Number(adjustmentAmount))}
                </p>
                <p style={{ fontSize: '0.8rem', color: 'var(--clr-muted)', marginTop: '0.5rem' }}>
                  New balance will be: {formatCurrency(
                    adjustmentType === 'DEPOSIT' || adjustmentType === 'REFUND'
                      ? selectedUser.current_balance + Number(adjustmentAmount)
                      : selectedUser.current_balance - Number(adjustmentAmount)
                  )}
                </p>
              </div>
            )}

            {/* Actions */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <button
                onClick={() => setSelectedUser(null)}
                disabled={processing}
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
                onClick={handleAdjustment}
                disabled={processing || !adjustmentAmount}
                style={{
                  padding: '0.9rem', background: 'linear-gradient(135deg,#7c3aed,#0ea5e9)',
                  border: 'none', borderRadius: '10px', color: '#fff',
                  fontWeight: 700, cursor: processing || !adjustmentAmount ? 'not-allowed' : 'pointer',
                  fontSize: '0.95rem', fontFamily: 'inherit', transition: 'all 0.3s',
                  opacity: processing || !adjustmentAmount ? 0.6 : 1
                }}
                className="hover-lift"
              >
                {processing ? 'Processing...' : 'Apply Adjustment'}
              </button>
            </div>
          </div>
        </div>
      </div>
    )
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
          color: 'var(--clr-neon)', fontSize: '1.8rem'
        }}>
          ✓
        </div>
        <div>
          <h3 style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--clr-text)', marginBottom: '0.3rem' }}>
            Adjustment Applied
          </h3>
          <p style={{ fontSize: '0.9rem', color: 'var(--clr-muted)' }}>
            Wallet has been updated successfully
          </p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header */}
      <div className="glass" style={{ padding: '1.5rem' }}>
        <h3 style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--clr-text)', marginBottom: '1rem' }}>
          Wallet Adjustment
        </h3>
        <p style={{ fontSize: '0.9rem', color: 'var(--clr-muted)', marginBottom: '1rem' }}>
          Deposit, withdraw, or refund funds to user wallets
        </p>

        {/* Search */}
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <div style={{
            flex: 1, display: 'flex', alignItems: 'center', gap: '0.75rem',
            padding: '0.75rem 1rem', background: 'rgba(255,255,255,0.04)',
            borderRadius: '10px', border: '1px solid rgba(255,255,255,0.08)'
          }}>
            <LuSearch size={18} style={{ color: 'var(--clr-muted)' }} />
            <input
              type="text"
              placeholder="Search by email or phone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
              style={{
                flex: 1, background: 'transparent', border: 'none',
                color: 'var(--clr-text)', fontSize: '0.95rem',
                outline: 'none', fontFamily: 'inherit'
              }}
            />
          </div>
          <button
            onClick={handleSearch}
            disabled={loading}
            style={{
              padding: '0.75rem 1.5rem', background: 'linear-gradient(135deg,#7c3aed,#0ea5e9)',
              border: 'none', borderRadius: '10px', color: '#fff',
              fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: '0.95rem', fontFamily: 'inherit', transition: 'all 0.3s'
            }}
            className="hover-lift"
          >
            {loading ? 'Searching...' : 'Search'}
          </button>
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

      {/* Results */}
      {searched && users.length === 0 && !error && (
        <div className="glass" style={{ padding: '2rem', textAlign: 'center' }}>
          <p style={{ color: 'var(--clr-muted)', fontSize: '1rem' }}>
            No users found. Try a different search term.
          </p>
        </div>
      )}

      {users.length > 0 && (
        <div style={{ display: 'grid', gap: '0.75rem' }}>
          {users.map((user) => (
            <div
              key={user.user_id}
              className="glass hover-lift"
              style={{
                padding: '1.25rem', display: 'flex', justifyContent: 'space-between',
                alignItems: 'center', gap: '1rem', flexWrap: 'wrap'
              }}
              onClick={() => setSelectedUser(user)}
            >
              <div style={{ flex: 1, minWidth: '200px' }}>
                <p style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--clr-text)', marginBottom: '0.3rem' }}>
                  {user.first_name} {user.last_name}
                </p>
                <p style={{ fontSize: '0.85rem', color: 'var(--clr-muted)' }}>
                  {user.email}
                </p>
              </div>

              <div style={{ textAlign: 'right' }}>
                <p style={{ fontSize: '0.8rem', color: 'var(--clr-muted)', marginBottom: '0.2rem' }}>Balance</p>
                <p style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--clr-accent)' }}>
                  {formatCurrency(user.current_balance)}
                </p>
              </div>

              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setSelectedUser(user)
                }}
                style={{
                  padding: '0.6rem 1.2rem', background: 'rgba(0,229,255,0.1)',
                  border: '1px solid rgba(0,229,255,0.2)', borderRadius: '8px',
                  color: 'var(--clr-accent)', cursor: 'pointer',
                  fontSize: '0.9rem', fontWeight: 600, fontFamily: 'inherit'
                }}
                className="hover-lift"
              >
                Adjust
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
