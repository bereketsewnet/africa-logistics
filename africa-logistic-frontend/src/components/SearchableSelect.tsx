import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { LuSearch, LuX, LuCheck, LuChevronDown } from 'react-icons/lu'

/**
 * A searchable single-choice control.
 *
 * Built because the admin screens had six hand-rolled `<select>`s listing every
 * driver in the system with no search, which stops being usable the moment a
 * transport company brings a few hundred drivers.
 *
 * The list is rendered through a **portal onto `document.body`**, positioned from
 * the trigger's on-screen rectangle. That is not decoration: these controls live
 * inside modals that scroll (`overflowY: auto`), and an absolutely-positioned list
 * inside one is clipped by it — the options get cut off and the modal itself starts
 * scrolling instead of the list. Escaping to the body means the list is never
 * trapped, and it flips above the field when there is more room there.
 *
 * Ids are `string` throughout: the older interfaces typed them `number` while the
 * database uses CHAR(36) UUIDs, which is why call sites were full of `String(...)`.
 */
export interface SelectOption {
  id: string
  /** Primary line, and what search matches against along with `sub`. */
  label: string
  /** Secondary line — a phone number, a plate, a company. */
  sub?: string | null
  /** Short right-aligned tag, e.g. the fleet a truck belongs to. */
  badge?: string | null
  badgeTone?: 'good' | 'warn' | 'muted'
  disabled?: boolean
}

const BADGE_TONE: Record<string, { bg: string; color: string }> = {
  good:  { bg: 'rgba(52,211,153,0.15)', color: '#34d399' },
  warn:  { bg: 'rgba(251,191,36,0.15)', color: '#fbbf24' },
  muted: { bg: 'rgba(255,255,255,0.08)', color: 'var(--clr-muted)' },
}

interface Position { top: number; left: number; width: number; flipped: boolean; maxHeight: number }

const LIST_MIN_WIDTH = 260
const LIST_MAX_HEIGHT = 300
const GAP = 4

export default function SearchableSelect({
  options, value, onChange, placeholder = 'Search…', emptyLabel = '— None —',
  allowNone = true, disabled, noResultsLabel = 'Nothing matches that search.',
}: {
  options: SelectOption[]
  value: string
  onChange: (id: string) => void
  placeholder?: string
  emptyLabel?: string
  allowNone?: boolean
  disabled?: boolean
  noResultsLabel?: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [pos, setPos] = useState<Position | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)

  const triggerRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const selected = options.find(o => o.id === value) ?? null

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter(o => `${o.label} ${o.sub ?? ''} ${o.badge ?? ''}`.toLowerCase().includes(q))
  }, [options, query])

  /** Measure the trigger and decide whether the list hangs below or above it. */
  const reposition = useCallback(() => {
    const el = triggerRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const below = window.innerHeight - r.bottom - 12
    const above = r.top - 12
    // Flip up only when below is genuinely cramped AND above is roomier, so the
    // list does not jump around for a few pixels' difference.
    const flipped = below < 220 && above > below
    const maxHeight = Math.min(LIST_MAX_HEIGHT, Math.max(160, flipped ? above : below))
    const width = Math.max(r.width, LIST_MIN_WIDTH)
    // Keep it on screen when the trigger sits near the right edge.
    const left = Math.min(Math.max(8, r.left), window.innerWidth - width - 8)
    setPos({
      top: flipped ? r.top - GAP : r.bottom + GAP,
      left, width, flipped, maxHeight,
    })
  }, [])

  useEffect(() => {
    if (!open) { setQuery(''); setPos(null); return }
    reposition()
    inputRef.current?.focus()

    // `true` captures scrolls on any ancestor, including the modal body, so the
    // list tracks the field instead of drifting away from it.
    const onScroll = () => reposition()
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onScroll)
    }
  }, [open, reposition])

  // Close on a click outside both the trigger and the portalled list. The list is
  // not a DOM descendant of the trigger any more, so both have to be checked.
  useEffect(() => {
    if (!open) return
    const onDocPointer = (e: MouseEvent) => {
      const t = e.target as Node
      if (triggerRef.current?.contains(t)) return
      if (listRef.current?.contains(t)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDocPointer)
    return () => document.removeEventListener('mousedown', onDocPointer)
  }, [open])

  useEffect(() => { setActiveIndex(0) }, [query, open])

  const pick = (id: string) => {
    onChange(id)
    setOpen(false)
    triggerRef.current?.focus()
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { setOpen(false); return }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex(i => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const opt = filtered[activeIndex]
      if (opt && !opt.disabled) pick(opt.id)
    }
  }

  const list = open && pos ? createPortal(
    <div ref={listRef}
      style={{
        position: 'fixed',
        top: pos.flipped ? undefined : pos.top,
        bottom: pos.flipped ? window.innerHeight - pos.top : undefined,
        left: pos.left,
        width: pos.width,
        zIndex: 9999,
        background: 'var(--select-pop-bg, #0f172a)',
        border: '1px solid var(--clr-border)',
        borderRadius: 12,
        overflow: 'hidden',
        boxShadow: '0 20px 48px rgba(0,0,0,0.55)',
        display: 'flex',
        flexDirection: 'column',
        maxHeight: pos.maxHeight,
      }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', padding: '0.55rem 0.75rem', borderBottom: '1px solid var(--clr-border)', flexShrink: 0 }}>
        <LuSearch size={14} style={{ color: 'var(--clr-muted)', flexShrink: 0 }} />
        <input ref={inputRef} value={query} onChange={e => setQuery(e.target.value)}
          placeholder={placeholder} onKeyDown={onKeyDown}
          style={{ flex: 1, minWidth: 0, background: 'none', border: 'none', outline: 'none', color: 'var(--clr-text)', fontFamily: 'inherit', fontSize: '0.85rem' }} />
        {query && (
          <button type="button" onClick={() => { setQuery(''); inputRef.current?.focus() }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--clr-muted)', display: 'flex', padding: 0 }}>
            <LuX size={13} />
          </button>
        )}
      </div>

      <div style={{ overflowY: 'auto', overflowX: 'hidden', flex: 1 }}>
        {allowNone && (
          <button type="button" onClick={() => pick('')}
            style={{ width: '100%', textAlign: 'left', padding: '0.6rem 0.8rem', background: 'none', border: 'none', borderBottom: '1px solid var(--clr-border)', color: 'var(--clr-muted)', fontFamily: 'inherit', fontSize: '0.82rem', cursor: 'pointer' }}>
            {emptyLabel}
          </button>
        )}

        {filtered.length === 0 ? (
          <div style={{ padding: '1rem 0.8rem', color: 'var(--clr-muted)', fontSize: '0.82rem', textAlign: 'center' }}>
            {noResultsLabel}
          </div>
        ) : filtered.map((o, i) => {
          const isSelected = o.id === value
          const isActive = i === activeIndex
          const tone = BADGE_TONE[o.badgeTone ?? 'muted']
          return (
            <button key={o.id} type="button" disabled={o.disabled}
              onClick={() => pick(o.id)}
              onMouseEnter={() => setActiveIndex(i)}
              style={{
                width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '0.6rem',
                padding: '0.6rem 0.8rem',
                background: isSelected ? 'rgba(97,148,31,0.14)' : isActive ? 'var(--select-pop-hover, rgba(255,255,255,0.06))' : 'none',
                border: 'none', borderBottom: '1px solid var(--clr-border)',
                fontFamily: 'inherit', cursor: o.disabled ? 'not-allowed' : 'pointer',
                opacity: o.disabled ? 0.45 : 1,
              }}>
              {/* minWidth 0 is what lets the text truncate instead of forcing the
                  row wider and producing a horizontal scrollbar. */}
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--clr-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {o.label}
                </span>
                {o.sub && (
                  <span style={{ display: 'block', fontSize: '0.74rem', color: 'var(--clr-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: '0.1rem' }}>
                    {o.sub}
                  </span>
                )}
              </span>
              {o.badge && (
                <span style={{ flexShrink: 0, fontSize: '0.67rem', fontWeight: 700, padding: '0.15rem 0.5rem', borderRadius: 999, background: tone.bg, color: tone.color, whiteSpace: 'nowrap' }}>
                  {o.badge}
                </span>
              )}
              {isSelected && <LuCheck size={14} style={{ color: 'var(--clr-accent)', flexShrink: 0 }} />}
            </button>
          )
        })}
      </div>
    </div>,
    document.body
  ) : null

  return (
    <>
      <button ref={triggerRef} type="button" disabled={disabled}
        onClick={() => setOpen(o => !o)}
        onKeyDown={e => { if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) { e.preventDefault(); setOpen(true) } }}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: '0.5rem',
          padding: '0.55rem 0.7rem', borderRadius: 10,
          border: `1px solid ${open ? 'var(--clr-accent)' : 'rgba(255,255,255,0.12)'}`,
          background: 'rgba(255,255,255,0.05)', color: 'var(--clr-text)',
          fontFamily: 'inherit', fontSize: '0.85rem', textAlign: 'left',
          cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.55 : 1,
          boxSizing: 'border-box', minWidth: 0, minHeight: 46,
        }}>
        {/* Two lines rather than one long run-on. In a half-width column, a single
            line like "Name · phone · plate · fleet" is just a truncated smear. */}
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: '0.85rem', fontWeight: selected ? 600 : 400, color: selected ? 'var(--clr-text)' : 'var(--clr-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {selected ? selected.label : emptyLabel}
          </span>
          {selected?.sub && (
            <span style={{ display: 'block', fontSize: '0.72rem', color: 'var(--clr-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: '0.05rem' }}>
              {selected.sub}
            </span>
          )}
        </span>
        {selected && allowNone && !disabled && (
          <span role="button" tabIndex={-1} aria-label="Clear"
            onClick={e => { e.stopPropagation(); onChange('') }}
            style={{ display: 'flex', color: 'var(--clr-muted)', flexShrink: 0 }}>
            <LuX size={14} />
          </span>
        )}
        <LuChevronDown size={14} style={{ color: 'var(--clr-muted)', flexShrink: 0, transform: open ? 'rotate(180deg)' : undefined, transition: 'transform 0.15s' }} />
      </button>
      {list}
    </>
  )
}
