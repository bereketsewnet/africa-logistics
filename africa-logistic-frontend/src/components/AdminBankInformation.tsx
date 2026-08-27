import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from 'react'
import {
  LuLandmark, LuPlus, LuPencil, LuTrash2, LuToggleLeft, LuToggleRight,
  LuImage, LuX, LuSave, LuTriangleAlert,
} from 'react-icons/lu'
import { adminOrderApi } from '../lib/apiClient'

interface BankAccount {
  id: number
  bank_name: string
  account_number: string
  account_holder_name: string
  logo_url: string | null
  description: string | null
  is_active: number
  created_at: string
  updated_at: string
}

const API_UPLOAD_BASE = ((import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '').replace(/\/api\/?$/, '')
const absoluteLogoUrl = (url: string | null) => !url ? '' : url.startsWith('http') ? url : `${API_UPLOAD_BASE}${url.startsWith('/') ? '' : '/'}${url}`

const emptyForm = {
  bank_name: '', account_number: '', account_holder_name: '', description: '', is_active: true,
}

export default function AdminBankInformation() {
  const [accounts, setAccounts] = useState<BankAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<BankAccount | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [logoPreview, setLogoPreview] = useState('')
  const [logoBase64, setLogoBase64] = useState('')
  const [removeLogo, setRemoveLogo] = useState(false)
  const [saving, setSaving] = useState(false)
  const [actionId, setActionId] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const showToast = (message: string) => { setToast(message); setTimeout(() => setToast(''), 3500) }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await adminOrderApi.listBankAccounts()
      setAccounts(data.bank_accounts ?? [])
    } catch (err: any) {
      showToast(err.response?.data?.message ?? 'Failed to load bank information.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm)
    setLogoPreview('')
    setLogoBase64('')
    setRemoveLogo(false)
    setError('')
    setModalOpen(true)
  }

  const openEdit = (account: BankAccount) => {
    setEditing(account)
    setForm({
      bank_name: account.bank_name,
      account_number: account.account_number,
      account_holder_name: account.account_holder_name,
      description: account.description ?? '',
      is_active: Boolean(account.is_active),
    })
    setLogoPreview(absoluteLogoUrl(account.logo_url))
    setLogoBase64('')
    setRemoveLogo(false)
    setError('')
    setModalOpen(true)
  }

  const handleLogo = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Bank logo must be a JPG, PNG, or WebP image.')
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      setError('Bank logo must be smaller than 2MB.')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const value = String(reader.result ?? '')
      setLogoBase64(value)
      setLogoPreview(value)
      setRemoveLogo(false)
      setError('')
    }
    reader.readAsDataURL(file)
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const bankName = form.bank_name.trim()
    const accountNumber = form.account_number.trim()
    const holderName = form.account_holder_name.trim()
    if (!bankName || !accountNumber || !holderName) {
      setError('Bank name, account number, and account holder name are required.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const payload = {
        bank_name: bankName,
        account_number: accountNumber,
        account_holder_name: holderName,
        description: form.description.trim(),
        is_active: form.is_active,
        ...(logoBase64 ? { logo_base64: logoBase64 } : {}),
        ...(removeLogo ? { remove_logo: true } : {}),
      }
      if (editing) {
        await adminOrderApi.updateBankAccount(editing.id, payload)
        showToast('Bank account updated.')
      } else {
        await adminOrderApi.createBankAccount(payload)
        showToast('Bank account created.')
      }
      setModalOpen(false)
      await load()
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Failed to save bank account.')
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (account: BankAccount) => {
    setActionId(account.id)
    try {
      await adminOrderApi.updateBankAccount(account.id, { is_active: !account.is_active })
      setAccounts(prev => prev.map(item => item.id === account.id ? { ...item, is_active: item.is_active ? 0 : 1 } : item))
      showToast(account.is_active ? 'Bank account disabled.' : 'Bank account activated.')
    } catch (err: any) {
      showToast(err.response?.data?.message ?? 'Failed to update bank account.')
    } finally {
      setActionId(null)
    }
  }

  const remove = async (account: BankAccount) => {
    if (!window.confirm(`Delete ${account.bank_name} · ${account.account_number}?`)) return
    setActionId(account.id)
    try {
      await adminOrderApi.deleteBankAccount(account.id)
      setAccounts(prev => prev.filter(item => item.id !== account.id))
      showToast('Bank account deleted.')
    } catch (err: any) {
      showToast(err.response?.data?.message ?? 'Failed to delete bank account.')
    } finally {
      setActionId(null)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', padding: '0.62rem 0.75rem', borderRadius: 9,
    border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)',
    color: 'var(--clr-text)', fontFamily: 'inherit', fontSize: '0.84rem', outline: 'none',
  }
  const labelStyle: React.CSSProperties = { display: 'block', marginBottom: 5, fontSize: '0.72rem', fontWeight: 700, color: 'var(--clr-muted)' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--clr-text)', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
            <LuLandmark size={18} /> Bank Information
          </h2>
          <p style={{ fontSize: '0.78rem', color: 'var(--clr-muted)', marginTop: '0.25rem' }}>
            Configure the company accounts shown to shippers and drivers when they add wallet funds.
          </p>
        </div>
        <button className="btn-primary" onClick={openCreate} style={{ padding: '0.5rem 0.9rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          <LuPlus size={15} /> Add Bank Account
        </button>
      </div>

      <div style={{ padding: '0.7rem 0.9rem', borderRadius: 10, background: 'rgba(59,130,246,0.07)', border: '1px solid rgba(59,130,246,0.18)', color: 'var(--clr-muted)', fontSize: '0.75rem', lineHeight: 1.5 }}>
        Only active accounts appear in Add Funds. Deactivating an account hides it immediately without deleting its configuration.
      </div>

      {loading ? (
        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--clr-muted)' }}>Loading bank information…</div>
      ) : accounts.length === 0 ? (
        <div className="glass-inner" style={{ padding: '2.5rem 1rem', textAlign: 'center' }}>
          <LuLandmark size={34} style={{ color: 'var(--clr-muted)', opacity: 0.55, marginBottom: '0.65rem' }} />
          <p style={{ fontWeight: 700, color: 'var(--clr-text)', fontSize: '0.9rem' }}>No company bank accounts configured</p>
          <p style={{ color: 'var(--clr-muted)', fontSize: '0.75rem', marginTop: '0.25rem' }}>Add the first deposit account to enable bank selection in Add Funds.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
          {accounts.map(account => (
            <div key={account.id} className="glass-inner" style={{ padding: '0.9rem 1rem', display: 'flex', alignItems: 'center', gap: '0.8rem', flexWrap: 'wrap', opacity: account.is_active ? 1 : 0.7 }}>
              <div style={{ width: 48, height: 48, borderRadius: 11, overflow: 'hidden', flexShrink: 0, background: 'rgba(97,148,31,0.1)', border: '1px solid rgba(97,148,31,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {account.logo_url ? <img src={absoluteLogoUrl(account.logo_url)} alt={`${account.bank_name} logo`} style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#fff' }} /> : <LuLandmark size={21} style={{ color: 'var(--clr-accent)' }} />}
              </div>
              <div style={{ flex: 1, minWidth: 180 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                  <p style={{ fontWeight: 800, fontSize: '0.88rem', color: 'var(--clr-text)' }}>{account.bank_name}</p>
                  <span style={{ fontSize: '0.65rem', fontWeight: 800, borderRadius: 99, padding: '0.12rem 0.48rem', color: account.is_active ? 'var(--kpi-green)' : 'var(--clr-muted)', background: account.is_active ? 'rgba(74,222,128,0.1)' : 'rgba(148,163,184,0.1)', border: `1px solid ${account.is_active ? 'rgba(74,222,128,0.25)' : 'rgba(148,163,184,0.2)'}` }}>{account.is_active ? 'ACTIVE' : 'INACTIVE'}</span>
                </div>
                <p style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--clr-accent)', fontSize: '0.82rem', marginTop: 2 }}>{account.account_number}</p>
                <p style={{ color: 'var(--clr-muted)', fontSize: '0.72rem', marginTop: 2 }}>{account.account_holder_name}</p>
                {account.description && <p style={{ color: 'var(--clr-muted)', fontSize: '0.69rem', marginTop: 3, lineHeight: 1.4 }}>{account.description}</p>}
              </div>
              <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
                <button onClick={() => toggleActive(account)} disabled={actionId === account.id} title={account.is_active ? 'Deactivate' : 'Activate'} style={{ border: 'none', background: 'transparent', color: account.is_active ? 'var(--kpi-green)' : 'var(--clr-muted)', cursor: 'pointer', padding: '0.35rem', display: 'flex' }}>
                  {account.is_active ? <LuToggleRight size={25} /> : <LuToggleLeft size={25} />}
                </button>
                <button onClick={() => openEdit(account)} title="Edit" style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: 'var(--clr-text)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><LuPencil size={13} /></button>
                <button onClick={() => remove(account)} disabled={actionId === account.id} title="Delete" style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid rgba(239,68,68,0.2)', background: 'rgba(239,68,68,0.06)', color: '#f87171', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><LuTrash2 size={13} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modalOpen && (
        <div className="modal-backdrop" onClick={event => { if (event.target === event.currentTarget && !saving) setModalOpen(false) }}>
          <form onSubmit={submit} className="glass modal-box" style={{ width: 'min(520px,calc(100vw - 2rem))', maxHeight: '90vh', overflowY: 'auto', padding: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--clr-text)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}><LuLandmark size={16} /> {editing ? 'Edit Bank Account' : 'Add Bank Account'}</h3>
              <button type="button" onClick={() => setModalOpen(false)} disabled={saving} style={{ border: 'none', background: 'transparent', color: 'var(--clr-muted)', cursor: 'pointer' }}><LuX size={18} /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
              <div><label style={labelStyle}>Bank name *</label><input style={inputStyle} value={form.bank_name} onChange={e => setForm(prev => ({ ...prev, bank_name: e.target.value }))} maxLength={120} placeholder="e.g. Commercial Bank of Ethiopia" /></div>
              <div><label style={labelStyle}>Account number *</label><input style={inputStyle} value={form.account_number} onChange={e => setForm(prev => ({ ...prev, account_number: e.target.value }))} maxLength={100} placeholder="Company deposit account number" autoComplete="off" /></div>
              <div><label style={labelStyle}>Account holder name *</label><input style={inputStyle} value={form.account_holder_name} onChange={e => setForm(prev => ({ ...prev, account_holder_name: e.target.value }))} maxLength={160} placeholder="Legal account holder name" /></div>
              <div><label style={labelStyle}>Description (optional)</label><textarea style={{ ...inputStyle, minHeight: 82, resize: 'vertical' }} value={form.description} onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))} maxLength={5000} placeholder="Transfer instructions, branch, reference requirements…" /></div>
              <div>
                <label style={labelStyle}>Bank logo (optional, max 2MB)</label>
                {logoPreview ? (
                  <div style={{ width: 94, height: 72, position: 'relative', borderRadius: 10, border: '1px solid rgba(255,255,255,0.12)', overflow: 'hidden', background: '#fff' }}>
                    <img src={logoPreview} alt="Bank logo preview" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                    <button type="button" onClick={() => { setLogoPreview(''); setLogoBase64(''); setRemoveLogo(true) }} aria-label="Remove logo" style={{ position: 'absolute', right: 3, top: 3, width: 22, height: 22, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,0.65)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><LuX size={12} /></button>
                  </div>
                ) : (
                  <label style={{ ...inputStyle, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.45rem', borderStyle: 'dashed', cursor: 'pointer', color: 'var(--clr-muted)' }}>
                    <LuImage size={15} /> Select JPG, PNG, or WebP
                    <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleLogo} style={{ display: 'none' }} />
                  </label>
                )}
              </div>
              <label style={{ padding: '0.65rem 0.75rem', borderRadius: 9, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
                <span><strong style={{ display: 'block', color: 'var(--clr-text)', fontSize: '0.8rem' }}>Active</strong><span style={{ color: 'var(--clr-muted)', fontSize: '0.68rem' }}>Show this account in Add Funds</span></span>
                <input type="checkbox" checked={form.is_active} onChange={e => setForm(prev => ({ ...prev, is_active: e.target.checked }))} style={{ width: 17, height: 17, accentColor: 'var(--clr-accent)' }} />
              </label>
              {error && <div className="alert alert-error"><LuTriangleAlert size={14} /> {error}</div>}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.2rem' }}>
                <button type="button" className="btn-outline" onClick={() => setModalOpen(false)} disabled={saving}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}><LuSave size={14} /> {saving ? 'Saving…' : 'Save Bank Account'}</button>
              </div>
            </div>
          </form>
        </div>
      )}

      {toast && <div style={{ position: 'fixed', right: '1.25rem', bottom: '1.25rem', zIndex: 250, borderRadius: 11, padding: '0.65rem 1rem', background: 'var(--adm-toast-bg)', border: '1px solid var(--adm-toast-brd)', color: 'var(--clr-text)', fontSize: '0.8rem', fontWeight: 700 }}>{toast}</div>}
    </div>
  )
}
