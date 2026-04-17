import { useState, useEffect } from 'react'
import apiClient from '../lib/apiClient'
import jsPDF from 'jspdf'
import { useLanguage } from '../context/LanguageContext'
import {
  LuArrowDownLeft, LuArrowUpRight, LuTrendingUp, LuWallet,
  LuSearch, LuChevronLeft, LuChevronRight, LuTriangleAlert, LuDownload,
} from 'react-icons/lu'

interface Transaction {
  id: string
  order_id?: string
  type: 'CREDIT' | 'DEBIT' | 'COMMISSION' | 'TIP' | 'REFUND' | 'BONUS' | 'ADMIN_ADJUSTMENT'
  amount: number
  description: string
  reference_code?: string
  status?: string
  created_at: string
}

type FilterType = 'ALL' | 'CREDIT' | 'DEBIT' | 'BONUS' | 'TIP' | 'REFUND'

export default function TransactionHistoryPage() {
  const { t: tr } = useLanguage()
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [filteredTransactions, setFilteredTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [filterType, setFilterType] = useState<FilterType>('ALL')
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(false)

  const ITEMS_PER_PAGE = 20

  const fetchTransactions = async (offset: number) => {
    try {
      setError('')
      const { data } = await apiClient.get('/profile/wallet/transactions', {
        params: { limit: ITEMS_PER_PAGE, offset }
      })
      setTransactions(data.transactions || [])
      setHasMore(data.total > offset + ITEMS_PER_PAGE)
      setPage(offset / ITEMS_PER_PAGE)
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load transactions')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTransactions(0)
  }, [])

  useEffect(() => {
    let filtered = transactions

    // Filter by type
    if (filterType !== 'ALL') {
      filtered = filtered.filter(tx => tx.type === filterType)
    }

    // Filter by search term
    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      filtered = filtered.filter(tx =>
        tx.description.toLowerCase().includes(term) ||
        (tx.reference_code ?? '').toLowerCase().includes(term)
      )
    }

    setFilteredTransactions(filtered)
  }, [transactions, filterType, searchTerm])

  const handlePrevPage = () => {
    if (page > 0) {
      fetchTransactions((page - 1) * ITEMS_PER_PAGE)
    }
  }

  const handleNextPage = () => {
    if (hasMore) {
      fetchTransactions((page + 1) * ITEMS_PER_PAGE)
    }
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
        return <LuArrowDownLeft size={18} />
      case 'DEBIT':
      case 'COMMISSION':
        return <LuArrowUpRight size={18} />
      case 'TIP':
        return <LuTrendingUp size={18} />
      default:
        return <LuWallet size={18} />
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

  const getTransactionLabel = (type: Transaction['type']) => {
    const labels: Record<Transaction['type'], string> = {
      CREDIT: tr('tx_credit'),
      DEBIT: tr('tx_debit'),
      COMMISSION: tr('tx_commission'),
      TIP: tr('tx_tip'),
      REFUND: tr('tx_refund'),
      BONUS: tr('tx_bonus'),
      ADMIN_ADJUSTMENT: tr('tx_adjustment')
    }
    return labels[type] || type
  }

  const downloadReceipt = (tx: Transaction) => {
    const doc = new jsPDF()
    const isCredit = ['CREDIT', 'BONUS', 'REFUND'].includes(tx.type)
    const amountLine = `${isCredit ? '+' : '-'} ${formatCurrency(tx.amount)}`

    doc.setFontSize(18)
    doc.text('Africa Logistics', 20, 20)
    doc.setFontSize(12)
    doc.text('Wallet Transaction Receipt', 20, 30)

    doc.setFontSize(11)
    doc.text(`Receipt ID: ${tx.id}`, 20, 45)
    doc.text(`Date: ${new Date(tx.created_at).toLocaleString('en-ET')}`, 20, 53)
    doc.text(`Type: ${getTransactionLabel(tx.type)}`, 20, 61)
    doc.text(`Status: ${tx.status ?? 'PROCESSED'}`, 20, 69)
    doc.text(`Amount: ${amountLine}`, 20, 77)
    doc.text(`Description: ${tx.description}`, 20, 85)
    doc.text(`Reference: ${tx.reference_code ?? 'N/A'}`, 20, 93)

    doc.setFontSize(9)
    doc.text('This is a system-generated receipt.', 20, 110)

    doc.save(`wallet-receipt-${tx.id}.pdf`)
  }

  if (loading) {
    return (
      <div style={{ padding: '1.5rem', textAlign: 'center' }}>
        <div style={{ display: 'inline-block' }} className="spinner" />
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header */}
      <div className="glass" style={{ padding: '1.5rem' }}>
        <h3 style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--clr-text)', marginBottom: '1rem' }}>
          {tr('txhist_title')}
        </h3>

        {/* Search & Filter Bar */}
        <div style={{
          display: 'grid', gap: '0.75rem',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))'
        }}>
          {/* Search */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '0.75rem',
            padding: '0.75rem 1rem', background: 'rgba(255,255,255,0.04)',
            borderRadius: '10px', border: '1px solid rgba(255,255,255,0.08)',
          }}>
            <LuSearch size={16} style={{ color: 'var(--clr-muted)' }} />
            <input
              type="text"
              placeholder={tr('txhist_search_ph')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                flex: 1, background: 'transparent', border: 'none',
                color: 'var(--clr-text)', fontSize: '0.9rem',
                outline: 'none', fontFamily: 'inherit'
              }}
            />
          </div>

          {/* Filter */}
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as FilterType)}
            style={{
              padding: '0.75rem 1rem', background: 'rgba(255,255,255,0.04)',
              borderRadius: '10px', border: '1px solid rgba(255,255,255,0.08)',
              color: 'var(--clr-text)', fontFamily: 'inherit', fontSize: '0.9rem',
              cursor: 'pointer'
            }}
          >
            <option value="ALL">{tr('txhist_filter_all')}</option>
            <option value="CREDIT">{tr('txhist_filter_credits')}</option>
            <option value="DEBIT">{tr('txhist_filter_debits')}</option>
            <option value="BONUS">{tr('txhist_filter_bonuses')}</option>
            <option value="TIP">{tr('txhist_filter_tips')}</option>
            <option value="REFUND">{tr('txhist_filter_refunds')}</option>
          </select>
        </div>
      </div>

      {/* Transactions List */}
      {error && (
        <div className="glass" style={{ padding: '1rem', borderLeft: '3px solid var(--clr-danger)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'var(--clr-danger)' }}>
            <LuTriangleAlert size={18} />
            <span>{error}</span>
          </div>
        </div>
      )}

      <div className="glass" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {filteredTransactions.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--clr-muted)' }}>
            <LuWallet size={40} style={{ margin: '0 auto 1rem', opacity: 0.3 }} />
            <p>{tr('txhist_no_found')}</p>
          </div>
        ) : (
          <>
            {filteredTransactions.map((tx) => (
              <div key={tx.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '1rem', background: 'rgba(255,255,255,0.02)', borderRadius: '12px',
                border: '1px solid rgba(255,255,255,0.05)', transition: 'all 0.2s',
                flexWrap: 'wrap', gap: '0.5rem'
              }}
                className="hover-lift"
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flex: 1, minWidth: '200px' }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: '50%',
                    background: `${getTransactionColor(tx.type)}20`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: getTransactionColor(tx.type), flexShrink: 0
                  }}>
                    {getTransactionIcon(tx.type)}
                  </div>
                  <div>
                    <p style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--clr-text)', marginBottom: '0.25rem' }}>
                      {tx.description}
                    </p>
                    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.8rem', background: `${getTransactionColor(tx.type)}15`, color: getTransactionColor(tx.type), padding: '0.3rem 0.6rem', borderRadius: '6px', fontWeight: 600 }}>
                        {getTransactionLabel(tx.type)}
                      </span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--clr-muted)' }}>
                        {new Date(tx.created_at).toLocaleDateString('en-ET', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                    </div>
                  </div>
                </div>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: '220px', justifyContent: 'flex-end'
                }}>
                  <div style={{
                    fontSize: '1.1rem', fontWeight: 700,
                    color: ['CREDIT', 'BONUS', 'REFUND'].includes(tx.type) ? 'var(--clr-neon)' : 'var(--clr-danger)',
                    minWidth: '120px', textAlign: 'right'
                  }}>
                    {['CREDIT', 'BONUS', 'REFUND'].includes(tx.type) ? '+' : '-'}{formatCurrency(tx.amount)}
                  </div>
                  <button
                    onClick={() => downloadReceipt(tx)}
                    style={{
                      padding: '0.45rem 0.7rem', borderRadius: '8px', border: '1px solid rgba(0,229,255,0.25)',
                      background: 'rgba(0,229,255,0.08)', color: 'var(--clr-accent)', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem', fontWeight: 700
                    }}
                    className="hover-lift"
                  >
                    <LuDownload size={14} /> {tr('txhist_receipt_btn')}
                  </button>
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      {/* Pagination */}
      {transactions.length > 0 && (
        <div style={{
          display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '1rem',
          padding: '1rem'
        }}>
          <button
            onClick={handlePrevPage}
            disabled={page === 0}
            style={{
              padding: '0.5rem 1rem', borderRadius: '8px', border: 'none',
              background: page === 0 ? 'rgba(255,255,255,0.03)' : 'rgba(0,229,255,0.1)',
              color: page === 0 ? 'var(--clr-muted)' : 'var(--clr-accent)',
              cursor: page === 0 ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              fontWeight: 600, fontSize: '0.9rem',
              transition: 'all 0.2s'
            }}
            className="hover-lift"
          >
            <LuChevronLeft size={16} /> {tr('txhist_previous')}
          </button>

          <span style={{ color: 'var(--clr-muted)', fontSize: '0.9rem', fontWeight: 600 }}>
          {tr('txhist_page')} {page + 1}
          </span>

          <button
            onClick={handleNextPage}
            disabled={!hasMore}
            style={{
              padding: '0.5rem 1rem', borderRadius: '8px', border: 'none',
              background: !hasMore ? 'rgba(255,255,255,0.03)' : 'rgba(0,229,255,0.1)',
              color: !hasMore ? 'var(--clr-muted)' : 'var(--clr-accent)',
              cursor: !hasMore ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              fontWeight: 600, fontSize: '0.9rem',
              transition: 'all 0.2s'
            }}
            className="hover-lift"
          >
            {tr('txhist_next')} <LuChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  )
}
