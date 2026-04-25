import { useEffect, useMemo, useState } from 'react'
import apiClient from '../lib/apiClient'
import { LuSearch, LuTriangleAlert, LuPlus, LuMinus, LuSettings } from 'react-icons/lu'
import { useLanguage } from '../context/LanguageContext'

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

interface AdminWallet {
  id: string
  balance: number
  currency: string
  total_earned: number
  total_spent: number
  is_locked: boolean
}

interface AdminWalletTx {
  id: string
  type: 'CREDIT' | 'DEBIT' | 'COMMISSION' | 'TIP' | 'REFUND' | 'BONUS' | 'ADMIN_ADJUSTMENT'
  amount: number
  description: string
  status?: string
  created_at: string
}

type AdjustmentType = 'DEPOSIT' | 'WITHDRAWAL' | 'REFUND' | 'ADJUSTMENT'

export default function AdminWalletAdjustment() {
  const { t: tr } = useLanguage()
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedUser, setSelectedUser] = useState<UserWallet | null>(null)
  const [allUsers, setAllUsers] = useState<UserWallet[]>([])
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
  const [adminWallet, setAdminWallet] = useState<AdminWallet | null>(null)
  const [adminTransactions, setAdminTransactions] = useState<AdminWalletTx[]>([])
  const [refillAmount, setRefillAmount] = useState('')
  const [refillReason, setRefillReason] = useState('')
  const [refilling, setRefilling] = useState(false)

  const mapUsers = (raw: any[]): UserWallet[] => raw.map((u: any) => ({
    user_id: u.id,
    wallet_id: u.wallet_id ?? '',
    first_name: u.first_name,
    last_name: u.last_name,
    email: u.email ?? '',
    phone_number: u.phone_number ?? '',
    current_balance: Number(u.current_balance ?? 0),
    total_earned: Number(u.total_earned ?? 0),
    total_spent: Number(u.total_spent ?? 0),
  }))

  const fetchAdminWalletData = async () => {
    try {
      const [{ data: walletData }, { data: txData }] = await Promise.all([
        apiClient.get('/admin/wallet'),
        apiClient.get('/admin/wallet/transactions', { params: { limit: 8, offset: 0 } })
      ])
      setAdminWallet(walletData.wallet ?? null)
      setAdminTransactions(txData.transactions ?? [])
    } catch {
      // Keep wallet panel resilient; main error banner is reserved for primary actions.
    }
  }

  const handleSearch = async () => {
    setLoading(true)
    setError('')

    try {
      const { data } = await apiClient.get('/admin/users')
      const mapped = mapUsers(data.users ?? [])
      setAllUsers(mapped)
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to search users')
    } finally {
      setLoading(false)
      setSearched(true)
    }
  }

  useEffect(() => {
    handleSearch()
    fetchAdminWalletData()
  }, [])

  useEffect(() => {
    const q = searchTerm.trim().toLowerCase()
    if (!q) {
      setUsers([])
      setError('')
      return
    }

    const matched = allUsers.filter((u) => {
      const fullName = `${u.first_name} ${u.last_name}`.toLowerCase()
      return fullName.includes(q) ||
        (u.email ?? '').toLowerCase().includes(q) ||
        (u.phone_number ?? '').toLowerCase().includes(q)
    })

    setUsers(matched)
    setSearched(true)
    setError(matched.length === 0 ? 'No users found matching that search.' : '')
  }, [searchTerm, allUsers])

  const canSearch = useMemo(() => searchTerm.trim().length > 0, [searchTerm])

  const handleAdminRefill = async () => {
    if (!refillAmount || Number(refillAmount) <= 0) {
      setError('Please enter a valid refill amount')
      return
    }

    setRefilling(true)
    setError('')
    try {
      await apiClient.post('/admin/wallet/refill', {
        amount: Number(refillAmount),
        reason: refillReason || 'Manual admin refill'
      })
      setRefillAmount('')
      setRefillReason('')
      fetchAdminWalletData()
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to refill admin wallet')
    } finally {
      setRefilling(false)
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
        action: adjustmentType,
        amount: Number(adjustmentAmount),
        reason: adjustmentNotes || `${adjustmentType} by admin`
      })

      const amountNum = Number(adjustmentAmount)
      const isCredit = adjustmentType === 'DEPOSIT' || adjustmentType === 'REFUND'
      const newBalance = isCredit
        ? selectedUser.current_balance + amountNum
        : selectedUser.current_balance - amountNum

      setAllUsers((prev) => prev.map((u) => u.user_id === selectedUser.user_id ? { ...u, current_balance: newBalance } : u))
      setUsers((prev) => prev.map((u) => u.user_id === selectedUser.user_id ? { ...u, current_balance: newBalance } : u))
      setSelectedUser((prev) => prev ? { ...prev, current_balance: newBalance } : prev)
      fetchAdminWalletData()

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
            {tr('waj_back')}
          </button>
          <h3 style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--clr-text)' }}>
            {tr('waj_title')}
          </h3>
        </div>

        {/* User Info */}
        <div className="glass" style={{ padding: '1.5rem' }}>
          <h4 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--clr-text)', marginBottom: '1rem' }}>
            {tr('waj_user_info')}
          </h4>
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--clr-muted)' }}>{tr('waj_name')}:</span>
              <span style={{ color: 'var(--clr-text)', fontWeight: 600 }}>
                {selectedUser.first_name} {selectedUser.last_name}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--clr-muted)' }}>{tr('waj_email')}:</span>
              <span style={{ color: 'var(--clr-text)', fontWeight: 600 }}>
                {selectedUser.email}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--clr-muted)' }}>{tr('waj_curr_bal')}:</span>
              <span style={{ color: 'var(--clr-accent)', fontWeight: 700, fontSize: '1.1rem' }}>
                {formatCurrency(selectedUser.current_balance)}
              </span>
            </div>
          </div>
        </div>

        {/* Adjustment Form */}
        <div className="glass" style={{ padding: '1.5rem' }}>
          <h4 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--clr-text)', marginBottom: '1rem' }}>
            {tr('waj_make_adj')}
          </h4>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Type Selection */}
            <div>
              <label style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--clr-text)', display: 'block', marginBottom: '0.5rem' }}>
                {tr('waj_adj_type')}
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '0.5rem' }}>
                {(['DEPOSIT', 'WITHDRAWAL', 'REFUND', 'ADJUSTMENT'] as AdjustmentType[]).map((type) => (
                  <button
                    key={type}
                    onClick={() => setAdjustmentType(type)}
                    style={{
                      padding: '0.75rem', background: adjustmentType === type ? 'linear-gradient(135deg,#3e6113,#71ad25)' : 'rgba(255,255,255,0.04)',
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
                {tr('waj_amount')}
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
                {tr('waj_notes')}
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
                padding: '1rem', background: 'rgba(62,97,19,0.08)',
                border: '1px solid rgba(62,97,19,0.2)', borderRadius: '10px'
              }}>
                <p style={{ fontSize: '0.85rem', color: 'var(--clr-muted)', marginBottom: '0.5rem' }}>
                  {adjustmentType === 'DEPOSIT' || adjustmentType === 'REFUND' ? tr('waj_will_add') : tr('waj_will_deduct')}:
                </p>
                <p style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--clr-accent2)' }}>
                  {adjustmentType === 'DEPOSIT' || adjustmentType === 'REFUND' ? '+' : '-'}{formatCurrency(Number(adjustmentAmount))}
                </p>
                <p style={{ fontSize: '0.8rem', color: 'var(--clr-muted)', marginTop: '0.5rem' }}>
                  {tr('waj_new_bal')}: {formatCurrency(
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
                {tr('waj_cancel')}
              </button>
              <button
                onClick={handleAdjustment}
                disabled={processing || !adjustmentAmount}
                style={{
                  padding: '0.9rem', background: 'linear-gradient(135deg,#3e6113,#71ad25)',
                  border: 'none', borderRadius: '10px', color: '#fff',
                  fontWeight: 700, cursor: processing || !adjustmentAmount ? 'not-allowed' : 'pointer',
                  fontSize: '0.95rem', fontFamily: 'inherit', transition: 'all 0.3s',
                  opacity: processing || !adjustmentAmount ? 0.6 : 1
                }}
                className="hover-lift"
              >
                {processing ? tr('waj_processing') : tr('waj_apply')}
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
            {tr('waj_success_title')}
          </h3>
          <p style={{ fontSize: '0.9rem', color: 'var(--clr-muted)' }}>
            {tr('waj_success_sub')}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Admin Wallet */}
      <div className="glass" style={{ padding: '1.5rem' }}>
        <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--clr-text)', marginBottom: '1rem' }}>
          {tr('waj_admin_wallet')}
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
          <div style={{ padding: '0.9rem', borderRadius: '10px', background: 'rgba(97, 148, 31,0.08)', border: '1px solid rgba(97, 148, 31,0.2)' }}>
            <p style={{ fontSize: '0.8rem', color: 'var(--clr-muted)' }}>{tr('waj_curr_bal_kpi')}</p>
            <p style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--clr-accent)' }}>
              {formatCurrency(adminWallet?.balance ?? 0)}
            </p>
          </div>
          <div style={{ padding: '0.9rem', borderRadius: '10px', background: 'rgba(57,255,20,0.08)', border: '1px solid rgba(57,255,20,0.2)' }}>
            <p style={{ fontSize: '0.8rem', color: 'var(--clr-muted)' }}>{tr('waj_total_in')}</p>
            <p style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--clr-neon)' }}>
              {formatCurrency(adminWallet?.total_earned ?? 0)}
            </p>
          </div>
          <div style={{ padding: '0.9rem', borderRadius: '10px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
            <p style={{ fontSize: '0.8rem', color: 'var(--clr-muted)' }}>{tr('waj_total_out')}</p>
            <p style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--clr-danger)' }}>
              {formatCurrency(adminWallet?.total_spent ?? 0)}
            </p>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '0.6rem', alignItems: 'center', marginBottom: '1rem' }}>
          <input
            type="number"
            placeholder={tr('waj_refill_ph')}
            value={refillAmount}
            onChange={(e) => setRefillAmount(e.target.value)}
            style={{
              padding: '0.7rem 0.85rem', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '8px', color: 'var(--clr-text)', fontFamily: 'inherit', outline: 'none'
            }}
          />
          <input
            type="text"
            placeholder={tr('waj_reason_ph')}
            value={refillReason}
            onChange={(e) => setRefillReason(e.target.value)}
            style={{
              padding: '0.7rem 0.85rem', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '8px', color: 'var(--clr-text)', fontFamily: 'inherit', outline: 'none'
            }}
          />
          <button
            onClick={handleAdminRefill}
            disabled={refilling}
            style={{
              padding: '0.7rem 1rem', background: 'linear-gradient(135deg,#3e6113,#71ad25)', border: 'none', borderRadius: '8px',
              color: '#fff', fontWeight: 700, cursor: refilling ? 'not-allowed' : 'pointer', opacity: refilling ? 0.7 : 1
            }}
            className="hover-lift"
          >
            {refilling ? tr('waj_refilling') : tr('waj_refill_btn')}
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {adminTransactions.slice(0, 6).map((tx) => (
            <div key={tx.id} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem',
              padding: '0.65rem 0.8rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)'
            }}>
              <div>
                <p style={{ fontSize: '0.83rem', color: 'var(--clr-text)', fontWeight: 600 }}>{tx.description}</p>
                <p style={{ fontSize: '0.75rem', color: 'var(--clr-muted)' }}>{new Date(tx.created_at).toLocaleString('en-ET')}</p>
              </div>
              <p style={{ fontSize: '0.92rem', fontWeight: 800, color: tx.type === 'CREDIT' ? 'var(--clr-neon)' : 'var(--clr-danger)' }}>
                {tx.type === 'CREDIT' ? '+' : '-'}{formatCurrency(tx.amount)}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Header */}
      <div className="glass" style={{ padding: '1.5rem' }}>
        <h3 style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--clr-text)', marginBottom: '1rem' }}>
          {tr('waj_title')}
        </h3>
        <p style={{ fontSize: '0.9rem', color: 'var(--clr-muted)', marginBottom: '1rem' }}>
          {tr('waj_subtitle')}
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
              placeholder={tr('waj_search_ph')}
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
            disabled={loading || !canSearch}
            style={{
              padding: '0.75rem 1.5rem', background: 'linear-gradient(135deg,#3e6113,#71ad25)',
              border: 'none', borderRadius: '10px', color: '#fff',
              fontWeight: 600, cursor: loading || !canSearch ? 'not-allowed' : 'pointer',
              fontSize: '0.95rem', fontFamily: 'inherit', transition: 'all 0.3s'
            }}
            className="hover-lift"
          >
            {loading ? tr('waj_loading') : tr('waj_refresh_btn')}
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
            {tr('waj_no_users')}
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
                <p style={{ fontSize: '0.8rem', color: 'var(--clr-muted)', marginBottom: '0.2rem' }}>{tr('waj_balance')}</p>
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
                  padding: '0.6rem 1.2rem', background: 'rgba(97, 148, 31,0.1)',
                  border: '1px solid rgba(97, 148, 31,0.2)', borderRadius: '8px',
                  color: 'var(--clr-accent)', cursor: 'pointer',
                  fontSize: '0.9rem', fontWeight: 600, fontFamily: 'inherit'
                }}
                className="hover-lift"
              >
                {tr('waj_adjust_btn')}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
