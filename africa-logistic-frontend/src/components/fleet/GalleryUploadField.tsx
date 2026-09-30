import { useRef, useState } from 'react'
import { LuImagePlus, LuX } from 'react-icons/lu'

const MAX_BYTES = 8 * 1024 * 1024

/**
 * Up to `max` images as base64, matching the platform fleet form. Optional,
 * like every other upload here.
 */
export default function GalleryUploadField({
  label = 'Gallery',
  max = 5,
  value,
  onChange,
  disabled,
}: {
  label?: string
  max?: number
  value: string[]
  onChange: (images: string[]) => void
  disabled?: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState('')
  const remaining = max - value.length

  const handleSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (files.length === 0) return

    const accepted = files.slice(0, remaining)
    if (files.length > remaining) setError(`Only ${max} images allowed — extra files were ignored.`)
    else setError('')

    const tooBig = accepted.find(f => f.size > MAX_BYTES)
    if (tooBig) {
      setError('Each image must be smaller than 8MB.')
      return
    }

    // Read every file before setting state once, so images cannot arrive out of
    // order or overwrite one another.
    Promise.all(accepted.map(file => new Promise<string>(resolve => {
      const reader = new FileReader()
      reader.onload = ev => resolve((ev.target?.result as string) ?? '')
      reader.readAsDataURL(file)
    }))).then(encoded => onChange([...value, ...encoded.filter(Boolean)]))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
      <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--clr-text)' }}>
        {label} — up to {max} images (optional)
      </label>

      {value.length > 0 && (
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {value.map((img, i) => (
            <div key={i} style={{ position: 'relative', width: 74, height: 56, borderRadius: 9, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}>
              <img src={img} alt={`Gallery ${i + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              <button type="button" onClick={() => onChange(value.filter((_, idx) => idx !== i))} disabled={disabled}
                aria-label={`Remove image ${i + 1}`}
                style={{ position: 'absolute', top: 2, right: 2, width: 18, height: 18, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,0.65)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
                <LuX size={10} />
              </button>
            </div>
          ))}
        </div>
      )}

      {remaining > 0 && (
        <button type="button" onClick={() => inputRef.current?.click()} disabled={disabled}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', padding: '0.65rem', borderRadius: 10, border: '1px dashed rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.02)', color: 'var(--clr-muted)', fontFamily: 'inherit', fontSize: '0.8rem', fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer' }}>
          <LuImagePlus size={14} /> Add gallery images ({remaining} left)
        </button>
      )}

      {error && <span style={{ fontSize: '0.72rem', color: '#f87171' }}>{error}</span>}
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={handleSelect} style={{ display: 'none' }} />
    </div>
  )
}
