import { useRef, useState } from 'react'
import { LuUpload, LuFileText, LuX } from 'react-icons/lu'

const MAX_BYTES = 8 * 1024 * 1024

/**
 * One optional file input producing a base64 string, matching how the admin
 * vehicle form already uploads. Every document in this product is optional, so
 * the label says so rather than leaving the owner to guess.
 */
export default function DocumentUploadField({
  label,
  hint,
  accept = 'image/jpeg,image/png,image/webp,application/pdf',
  value,
  onChange,
  disabled,
}: {
  label: string
  hint?: string
  accept?: string
  value: string
  onChange: (base64: string) => void
  disabled?: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState('')
  const isPdf = value.startsWith('data:application/pdf')

  const handleSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    // Reset immediately so re-picking the same file still fires onChange.
    e.target.value = ''
    if (!file) return
    if (file.size > MAX_BYTES) {
      setError('File must be smaller than 8MB.')
      return
    }
    setError('')
    const reader = new FileReader()
    reader.onload = ev => onChange((ev.target?.result as string) ?? '')
    reader.readAsDataURL(file)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
      <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--clr-text)' }}>{label}</label>
      {hint && <span style={{ fontSize: '0.7rem', color: 'var(--clr-muted)' }}>{hint}</span>}

      {value ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <div style={{ width: 74, height: 56, borderRadius: 9, overflow: 'hidden', background: 'rgba(0,0,0,0.18)', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {isPdf
              ? <LuFileText size={22} style={{ color: 'var(--clr-accent)' }} />
              : <img src={value} alt={label} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
          </div>
          <button type="button" onClick={() => onChange('')} disabled={disabled}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', padding: '0.3rem 0.6rem', borderRadius: 8, border: '1px solid rgba(239,68,68,0.35)', background: 'rgba(239,68,68,0.08)', color: '#f87171', fontFamily: 'inherit', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer' }}>
            <LuX size={11} /> Remove
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => inputRef.current?.click()} disabled={disabled}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', padding: '0.65rem', borderRadius: 10, border: '1px dashed rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.02)', color: 'var(--clr-muted)', fontFamily: 'inherit', fontSize: '0.8rem', fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer' }}>
          <LuUpload size={14} /> {label} (optional)
        </button>
      )}

      {error && <span style={{ fontSize: '0.72rem', color: '#f87171' }}>{error}</span>}
      <input ref={inputRef} type="file" accept={accept} onChange={handleSelect} style={{ display: 'none' }} />
    </div>
  )
}
