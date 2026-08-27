import { useEffect, useState } from 'react'
import apiClient, { walletApi } from '../lib/apiClient'
import { LuUpload, LuTriangleAlert, LuCheck, LuCamera, LuFileText, LuLandmark, LuCopy } from 'react-icons/lu'

interface CompanyBankAccount {
  id: number
  bank_name: string
  account_number: string
  account_holder_name: string
  logo_url: string | null
  description: string | null
}

const API_UPLOAD_BASE = ((import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '').replace(/\/api\/?$/, '')
const logoUrl = (url: string | null) => !url ? '' : url.startsWith('http') ? url : `${API_UPLOAD_BASE}${url.startsWith('/') ? '' : '/'}${url}`

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
  const [bankAccounts, setBankAccounts] = useState<CompanyBankAccount[]>([])
  const [selectedBankId, setSelectedBankId] = useState<number | null>(null)
  const [banksLoading, setBanksLoading] = useState(true)
  const [banksError, setBanksError] = useState('')
  const [copiedBankId, setCopiedBankId] = useState<number | null>(null)
  const selectedBank = bankAccounts.find(bank => bank.id === selectedBankId) ?? null

  useEffect(() => {
    let mounted = true
    walletApi.getBankAccounts()
      .then(({ data }) => {
        if (!mounted) return
        const accounts = data.bank_accounts ?? []
        setBankAccounts(accounts)
        setSelectedBankId(accounts[0]?.id ?? null)
        setBanksError(accounts.length === 0 ? 'No company bank accounts are currently available. Please contact support.' : '')
      })
      .catch((err: any) => {
        if (!mounted) return
        setBankAccounts([])
        setSelectedBankId(null)
        setBanksError(err.response?.data?.message ?? 'Could not load company bank accounts. Please retry.')
      })
      .finally(() => { if (mounted) setBanksLoading(false) })
    return () => { mounted = false }
  }, [])

  const copyAccountNumber = async (bank: CompanyBankAccount) => {
    try {
      await navigator.clipboard.writeText(bank.account_number)
      setCopiedBankId(bank.id)
      setTimeout(() => setCopiedBankId(null), 1800)
    } catch {
      setError('Could not copy the account number. Please copy it manually.')
    }
  }

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

    if (!selectedBank) {
      setError('Please select a company bank account.')
      return
    }

    setLoading(true)

    try {
      await apiClient.post('/profile/wallet/manual-payment', {
        amount: Number(amount),
        bank_account_id: selectedBank.id,
        payment_method: `${selectedBank.bank_name} (${selectedBank.account_number})`,
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
          <select
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
            style={{
              width: '100%', padding: '0.85rem 1rem', background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px',
              color: 'var(--clr-text)', fontSize: '1rem', fontFamily: 'inherit',
              outline: 'none', cursor: 'pointer'
            }}
          >
            <option value="">Select an amount</option>
            <option value="100">100 ብር</option>
            <option value="200">200 ብር</option>
            <option value="500">500 ብር</option>
            <option value="1000">1,000 ብር</option>
            <option value="2000">2,000 ብር</option>
            <option value="5000">5,000 ብር</option>
            <option value="10000">10,000 ብር</option>
            <option value="20000">20,000 ብር</option>
            <option value="50000">50,000 ብር</option>
          </select>
        </div>

        {/* Company bank accounts */}
        <div>
          <label style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--clr-text)', display: 'block', marginBottom: '0.65rem' }}>
            Deposit to a Company Bank Account <span style={{ color: 'var(--clr-danger)' }}>*</span>
          </label>
          {banksLoading ? (
            <div style={{ padding: '1rem', borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)', color: 'var(--clr-muted)', fontSize: '0.84rem', textAlign: 'center' }}>Loading company bank accounts…</div>
          ) : banksError ? (
            <div style={{ padding: '0.85rem 1rem', borderRadius: 10, border: '1px solid rgba(251,191,36,0.25)', background: 'rgba(251,191,36,0.07)', color: 'var(--kpi-gold)', fontSize: '0.82rem', display: 'flex', gap: '0.55rem', alignItems: 'flex-start' }}>
              <LuTriangleAlert size={16} style={{ flexShrink: 0, marginTop: 1 }} /> {banksError}
            </div>
          ) : (
            <div style={{ display: 'grid', gap: '0.75rem' }}>
              <div
                role="radiogroup"
                aria-label="Company bank accounts"
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                  gap: '0.45rem',
                  maxHeight: 150,
                  overflowY: 'auto',
                  padding: '0.15rem 0.2rem 0.15rem 0',
                }}
              >
                {bankAccounts.map(bank => {
                  const selected = selectedBankId === bank.id
                  return (
                    <button
                      key={bank.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => { setSelectedBankId(bank.id); setError('') }}
                      title={bank.bank_name}
                      style={{
                        minHeight: 42,
                        padding: '0.55rem 0.7rem',
                        borderRadius: 9,
                        cursor: 'pointer',
                        background: selected ? 'rgba(97,148,31,0.14)' : 'rgba(255,255,255,0.03)',
                        border: `1px solid ${selected ? 'rgba(97,148,31,0.55)' : 'rgba(255,255,255,0.09)'}`,
                        color: selected ? 'var(--clr-accent)' : 'var(--clr-text)',
                        fontFamily: 'inherit',
                        fontSize: '0.76rem',
                        fontWeight: selected ? 800 : 650,
                        lineHeight: 1.3,
                        overflowWrap: 'anywhere',
                        transition: 'background 0.18s, border-color 0.18s, color 0.18s',
                      }}
                    >
                      {bank.bank_name}
                    </button>
                  )
                })}
              </div>

              {selectedBank && (
                <div style={{ padding: '0.85rem', borderRadius: 12, background: 'rgba(97,148,31,0.08)', border: '1px solid rgba(97,148,31,0.28)' }}>
                  <div style={{ display: 'flex', gap: '0.7rem', alignItems: 'center', marginBottom: '0.65rem' }}>
                    <div style={{ width: 44, height: 44, borderRadius: 9, flexShrink: 0, overflow: 'hidden', background: '#fff', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {selectedBank.logo_url ? <img src={logoUrl(selectedBank.logo_url)} alt={`${selectedBank.bank_name} logo`} style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : <LuLandmark size={20} style={{ color: 'var(--clr-accent)' }} />}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontWeight: 800, fontSize: '0.88rem', color: 'var(--clr-text)', lineHeight: 1.3 }}>{selectedBank.bank_name}</p>
                      <p style={{ fontSize: '0.7rem', color: 'var(--clr-muted)', marginTop: 3 }}>{selectedBank.account_holder_name}</p>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.55rem 0.65rem', borderRadius: 8, background: 'rgba(0,0,0,0.13)' }}>
                    <span style={{ flex: 1, fontFamily: 'monospace', fontSize: '0.9rem', fontWeight: 800, color: 'var(--clr-accent)', wordBreak: 'break-all' }}>{selectedBank.account_number}</span>
                    <button type="button" onClick={() => copyAccountNumber(selectedBank)} title="Copy account number" aria-label={`Copy ${selectedBank.bank_name} account number`} style={{ border: 'none', background: 'transparent', color: copiedBankId === selectedBank.id ? 'var(--kpi-green)' : 'var(--clr-muted)', cursor: 'pointer', padding: 4, display: 'flex' }}>
                      {copiedBankId === selectedBank.id ? <LuCheck size={16} /> : <LuCopy size={16} />}
                    </button>
                  </div>
                  {selectedBank.description && <p style={{ fontSize: '0.72rem', lineHeight: 1.45, color: 'var(--clr-muted)', marginTop: '0.6rem' }}>{selectedBank.description}</p>}
                </div>
              )}
            </div>
          )}
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
                  borderRadius: '12px', border: '1px solid rgba(97, 148, 31,0.2)',
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
                    borderRadius: '12px', border: '1px solid rgba(97, 148, 31,0.2)'
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
                padding: '2rem', background: 'rgba(62,97,19,0.07)', border: '2px dashed rgba(62,97,19,0.3)',
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
          disabled={loading || banksLoading || !selectedBankId || !amount || !proof}
          style={{
            padding: '1rem', background: 'linear-gradient(135deg,#3e6113,#71ad25)',
            border: 'none', borderRadius: '10px', color: '#fff',
            fontWeight: 700, cursor: loading || banksLoading || !selectedBankId || !amount || !proof ? 'not-allowed' : 'pointer',
            fontSize: '1rem', fontFamily: 'inherit', transition: 'all 0.3s',
            opacity: loading || banksLoading || !selectedBankId || !amount || !proof ? 0.6 : 1,
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
