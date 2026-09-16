import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from 'react'
import {
  LuBookOpen, LuPlus, LuPencil, LuTrash2, LuToggleLeft, LuToggleRight,
  LuImage, LuX, LuSave, LuTriangleAlert, LuExternalLink,
} from 'react-icons/lu'
import { adminOrderApi } from '../lib/apiClient'

interface DocumentationEntry {
  id: number
  title: string
  description: string | null
  link_url: string
  image_url: string | null
  is_active: number
}

const DEFAULT_IMAGE = '/images/documentation-default.svg'
const API_UPLOAD_BASE = ((import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '').replace(/\/api\/?$/, '')
const imageUrl = (url: string | null) => !url ? DEFAULT_IMAGE : url.startsWith('http') ? url : `${API_UPLOAD_BASE}${url.startsWith('/') ? '' : '/'}${url}`
const emptyForm = { title: '', link_url: '', description: '', is_active: true }

export default function AdminDocumentationLibrary() {
  const [entries, setEntries] = useState<DocumentationEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<DocumentationEntry | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [preview, setPreview] = useState('')
  const [imageBase64, setImageBase64] = useState('')
  const [removeImage, setRemoveImage] = useState(false)
  const [saving, setSaving] = useState(false)
  const [actionId, setActionId] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const showToast = (message: string) => { setToast(message); window.setTimeout(() => setToast(''), 3500) }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await adminOrderApi.listDocumentation()
      setEntries(data.documentation ?? [])
    } catch (err: any) {
      showToast(err.response?.data?.message ?? 'Failed to load documentation.')
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => { load() }, [load])

  const openCreate = () => {
    setEditing(null); setForm(emptyForm); setPreview(''); setImageBase64(''); setRemoveImage(false); setError(''); setModalOpen(true)
  }
  const openEdit = (entry: DocumentationEntry) => {
    setEditing(entry)
    setForm({ title: entry.title, link_url: entry.link_url, description: entry.description ?? '', is_active: Boolean(entry.is_active) })
    setPreview(entry.image_url ? imageUrl(entry.image_url) : '')
    setImageBase64(''); setRemoveImage(false); setError(''); setModalOpen(true)
  }

  const handleImage = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { setError('Image must be a JPG, PNG, or WebP file.'); return }
    if (file.size > 2 * 1024 * 1024) { setError('Image must be smaller than 2MB.'); return }
    const reader = new FileReader()
    reader.onload = () => { const value = String(reader.result ?? ''); setImageBase64(value); setPreview(value); setRemoveImage(false); setError('') }
    reader.readAsDataURL(file)
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const title = form.title.trim(), linkUrl = form.link_url.trim()
    if (!title || !linkUrl) { setError('Documentation title and link are required.'); return }
    if (!/^https?:\/\//i.test(linkUrl)) { setError('The documentation link must start with http:// or https://.'); return }
    setSaving(true); setError('')
    const payload = {
      title, link_url: linkUrl, description: form.description.trim(), is_active: form.is_active,
      ...(imageBase64 ? { image_base64: imageBase64 } : {}),
      ...(removeImage ? { remove_image: true } : {}),
    }
    try {
      if (editing) { await adminOrderApi.updateDocumentation(editing.id, payload); showToast('Documentation entry updated.') }
      else { await adminOrderApi.createDocumentation(payload); showToast('Documentation entry created.') }
      setModalOpen(false); await load()
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Failed to save documentation.')
    } finally { setSaving(false) }
  }

  const toggleActive = async (entry: DocumentationEntry) => {
    setActionId(entry.id)
    try {
      await adminOrderApi.updateDocumentation(entry.id, { is_active: !entry.is_active })
      setEntries(items => items.map(item => item.id === entry.id ? { ...item, is_active: item.is_active ? 0 : 1 } : item))
      showToast(entry.is_active ? 'Documentation entry hidden from the website.' : 'Documentation entry published.')
    } catch (err: any) { showToast(err.response?.data?.message ?? 'Failed to update documentation.') }
    finally { setActionId(null) }
  }
  const remove = async (entry: DocumentationEntry) => {
    if (!window.confirm(`Delete “${entry.title}”? This cannot be undone.`)) return
    setActionId(entry.id)
    try { await adminOrderApi.deleteDocumentation(entry.id); setEntries(items => items.filter(item => item.id !== entry.id)); showToast('Documentation entry deleted.') }
    catch (err: any) { showToast(err.response?.data?.message ?? 'Failed to delete documentation.') }
    finally { setActionId(null) }
  }

  const inputStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '0.62rem 0.75rem', borderRadius: 9, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)', color: 'var(--clr-text)', fontFamily: 'inherit', fontSize: '0.84rem', outline: 'none' }
  const labelStyle: React.CSSProperties = { display: 'block', marginBottom: 5, fontSize: '0.72rem', fontWeight: 700, color: 'var(--clr-muted)' }
  const iconButton: React.CSSProperties = { width: 32, height: 32, borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: 'var(--clr-text)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }

  return <div style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
      <div>
        <h2 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--clr-text)', display: 'flex', alignItems: 'center', gap: '0.45rem' }}><LuBookOpen size={18} /> Documentation Library</h2>
        <p style={{ fontSize: '0.78rem', color: 'var(--clr-muted)', marginTop: '0.25rem' }}>Publish documentation, video guides, and useful links on the public homepage.</p>
      </div>
      <button className="btn-primary" onClick={openCreate} style={{ padding: '0.5rem 0.9rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}><LuPlus size={15} /> Add Documentation</button>
    </div>
    <div style={{ padding: '0.7rem 0.9rem', borderRadius: 10, background: 'rgba(59,130,246,0.07)', border: '1px solid rgba(59,130,246,0.18)', color: 'var(--clr-muted)', fontSize: '0.75rem', lineHeight: 1.5 }}>Active entries appear below Contact Us. A custom image is optional; the branded documentation artwork is used automatically when one is not uploaded.</div>
    {loading ? <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--clr-muted)' }}>Loading documentation…</div> : entries.length === 0 ? <div className="glass-inner" style={{ padding: '2.5rem 1rem', textAlign: 'center' }}><LuBookOpen size={34} style={{ color: 'var(--clr-muted)', opacity: 0.55, marginBottom: '0.65rem' }} /><p style={{ fontWeight: 700, color: 'var(--clr-text)', fontSize: '0.9rem' }}>No documentation published yet</p><p style={{ color: 'var(--clr-muted)', fontSize: '0.75rem', marginTop: '0.25rem' }}>Add guides, video links, or downloadable resources for website visitors.</p></div> : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '0.75rem' }}>
      {entries.map(entry => <article key={entry.id} className="glass-inner" style={{ overflow: 'hidden', opacity: entry.is_active ? 1 : 0.62 }}>
        <img src={imageUrl(entry.image_url)} onError={event => { event.currentTarget.src = DEFAULT_IMAGE }} alt="" style={{ width: '100%', height: 112, display: 'block', objectFit: 'cover', background: 'rgba(97,148,31,0.08)' }} />
        <div style={{ padding: '0.75rem' }}><div style={{ display: 'flex', gap: '0.4rem', alignItems: 'flex-start', justifyContent: 'space-between' }}><p style={{ color: 'var(--clr-text)', fontWeight: 800, fontSize: '0.84rem', lineHeight: 1.35 }}>{entry.title}</p><span style={{ flexShrink: 0, fontSize: '0.62rem', fontWeight: 800, borderRadius: 99, padding: '0.12rem 0.42rem', color: entry.is_active ? 'var(--kpi-green)' : 'var(--clr-muted)', background: entry.is_active ? 'rgba(74,222,128,0.1)' : 'rgba(148,163,184,0.1)' }}>{entry.is_active ? 'LIVE' : 'HIDDEN'}</span></div>
          {entry.description && <p style={{ color: 'var(--clr-muted)', fontSize: '0.7rem', lineHeight: 1.45, marginTop: '0.3rem', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{entry.description}</p>}
          <a href={entry.link_url} target="_blank" rel="noopener noreferrer" style={{ marginTop: '0.55rem', display: 'flex', alignItems: 'center', gap: '0.25rem', color: 'var(--clr-accent)', fontSize: '0.7rem', fontWeight: 700, textDecoration: 'none', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}><LuExternalLink size={12} /> Open link</a>
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', marginTop: '0.65rem', paddingTop: '0.55rem', display: 'flex', justifyContent: 'flex-end', gap: '0.35rem' }}><button onClick={() => toggleActive(entry)} disabled={actionId === entry.id} title={entry.is_active ? 'Hide from website' : 'Publish on website'} style={{ ...iconButton, border: 'none', background: 'transparent', color: entry.is_active ? 'var(--kpi-green)' : 'var(--clr-muted)' }}>{entry.is_active ? <LuToggleRight size={24} /> : <LuToggleLeft size={24} />}</button><button onClick={() => openEdit(entry)} title="Edit" style={iconButton}><LuPencil size={13} /></button><button onClick={() => remove(entry)} disabled={actionId === entry.id} title="Delete" style={{ ...iconButton, color: '#f87171', borderColor: 'rgba(239,68,68,0.2)', background: 'rgba(239,68,68,0.06)' }}><LuTrash2 size={13} /></button></div>
        </div>
      </article>)}
    </div>}
    {modalOpen && <div className="modal-backdrop" onClick={event => { if (event.target === event.currentTarget && !saving) setModalOpen(false) }}><form onSubmit={submit} className="glass modal-box" style={{ width: 'min(520px,calc(100vw - 2rem))', maxHeight: '90vh', overflowY: 'auto', padding: '1.25rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}><h3 style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--clr-text)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}><LuBookOpen size={16} /> {editing ? 'Edit Documentation' : 'Add Documentation'}</h3><button type="button" onClick={() => setModalOpen(false)} disabled={saving} style={{ border: 'none', background: 'transparent', color: 'var(--clr-muted)', cursor: 'pointer' }}><LuX size={18} /></button></div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}><div><label style={labelStyle}>Documentation title *</label><input required style={inputStyle} value={form.title} onChange={e => setForm(current => ({ ...current, title: e.target.value }))} maxLength={180} placeholder="e.g. How to place an order" /></div><div><label style={labelStyle}>Documentation or video link *</label><input required type="url" style={inputStyle} value={form.link_url} onChange={e => setForm(current => ({ ...current, link_url: e.target.value }))} maxLength={2048} placeholder="https://youtube.com/... or https://..." /></div><div><label style={labelStyle}>Description (optional)</label><textarea style={{ ...inputStyle, minHeight: 82, resize: 'vertical' }} value={form.description} onChange={e => setForm(current => ({ ...current, description: e.target.value }))} maxLength={5000} placeholder="Briefly explain what visitors will find…" /></div><div><label style={labelStyle}>Cover image (optional, max 2MB)</label>{preview ? <div style={{ width: 150, height: 84, position: 'relative', borderRadius: 10, border: '1px solid rgba(255,255,255,0.12)', overflow: 'hidden' }}><img src={preview} alt="Documentation preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /><button type="button" onClick={() => { setPreview(''); setImageBase64(''); setRemoveImage(true) }} aria-label="Remove image" style={{ position: 'absolute', right: 3, top: 3, width: 22, height: 22, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,0.65)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><LuX size={12} /></button></div> : <label style={{ ...inputStyle, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.45rem', borderStyle: 'dashed', cursor: 'pointer', color: 'var(--clr-muted)' }}><LuImage size={15} /> Select JPG, PNG, or WebP<input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleImage} style={{ display: 'none' }} /></label>}</div><label style={{ padding: '0.65rem 0.75rem', borderRadius: 9, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}><span><strong style={{ display: 'block', color: 'var(--clr-text)', fontSize: '0.8rem' }}>Publish on website</strong><span style={{ color: 'var(--clr-muted)', fontSize: '0.68rem' }}>Visible below Contact Us</span></span><input type="checkbox" checked={form.is_active} onChange={e => setForm(current => ({ ...current, is_active: e.target.checked }))} style={{ width: 17, height: 17, accentColor: 'var(--clr-accent)' }} /></label>{error && <div className="alert alert-error"><LuTriangleAlert size={14} /> {error}</div>}<div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.2rem' }}><button type="button" className="btn-outline" onClick={() => setModalOpen(false)} disabled={saving}>Cancel</button><button type="submit" className="btn-primary" disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}><LuSave size={14} /> {saving ? 'Saving…' : 'Save Documentation'}</button></div></div>
    </form></div>}
    {toast && <div style={{ position: 'fixed', right: '1.25rem', bottom: '1.25rem', zIndex: 250, borderRadius: 11, padding: '0.65rem 1rem', background: 'var(--adm-toast-bg)', border: '1px solid var(--adm-toast-brd)', color: 'var(--clr-text)', fontSize: '0.8rem', fontWeight: 700 }}>{toast}</div>}
  </div>
}
