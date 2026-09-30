import { useState, useRef, useEffect } from 'react'
import { LuChevronDown, LuCircleCheck, LuCirclePause, LuWrench, LuBan, LuLock } from 'react-icons/lu'
import type { OperationalStatus } from './types'
import { OPERATIONAL_STATUSES } from './types'
import { effectiveVehicleState, operationalLabel } from './vehicleState'

const TONE_COLOR: Record<string, string> = {
  ACTIVE: 'var(--kpi-green, #34d399)',
  INACTIVE: 'var(--clr-muted)',
  MAINTENANCE: 'var(--kpi-gold, #fbbf24)',
  OUT_OF_SERVICE: '#f87171',
}

const ICON: Record<OperationalStatus, React.ComponentType<{ size?: number }>> = {
  ACTIVE: LuCircleCheck,
  INACTIVE: LuCirclePause,
  MAINTENANCE: LuWrench,
  OUT_OF_SERVICE: LuBan,
}

const DESCRIPTION: Record<OperationalStatus, string> = {
  ACTIVE: 'Working and available for jobs',
  INACTIVE: 'Parked — not available for now',
  MAINTENANCE: 'In the workshop for servicing or repair',
  OUT_OF_SERVICE: 'Retired or off the road indefinitely',
}

/**
 * The owner's control over whether a vehicle is working today.
 *
 * Rendered as a SOLID, clickable pill with a caret, while admin approval is an
 * outlined static badge. The different grammar is deliberate: the two axes are
 * independent and must never read as if they contradict each other. Until the
 * admin has approved the vehicle, this control is locked and shows why.
 */
export default function OperationalStatusControl({
  vehicle,
  onChange,
  saving,
}: {
  vehicle: { status: 'PENDING' | 'APPROVED' | 'REJECTED'; operational_status?: OperationalStatus | null }
  onChange: (next: OperationalStatus) => void
  saving?: boolean
}) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const current: OperationalStatus = vehicle.operational_status ?? 'ACTIVE'
  const state = effectiveVehicleState(vehicle)

  // Close on outside click or Escape, so the popover never traps the page.
  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const CurrentIcon = ICON[current]
  const color = state.opControlEnabled ? TONE_COLOR[current] : 'var(--clr-muted)'

  if (!state.opControlEnabled) {
    return (
      <span title={state.reason ?? undefined}
        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.28rem 0.7rem', borderRadius: 999, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--clr-muted)', fontSize: '0.74rem', fontWeight: 700 }}>
        <LuLock size={11} /> {state.reason}
      </span>
    )
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button type="button" onClick={() => setOpen(v => !v)} disabled={saving}
        aria-haspopup="listbox" aria-expanded={open}
        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.3rem 0.75rem', borderRadius: 999, border: 'none', background: color, color: '#08140b', fontFamily: 'inherit', fontSize: '0.74rem', fontWeight: 800, cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.65 : 1 }}>
        <CurrentIcon size={12} />
        {operationalLabel(current)}
        <LuChevronDown size={12} />
      </button>

      {open && (
        <div role="listbox"
          style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 40, minWidth: 250, borderRadius: 12, padding: '0.35rem', background: 'var(--clr-bg, #0f172a)', border: '1px solid rgba(255,255,255,0.14)', boxShadow: '0 18px 44px rgba(0,0,0,0.5)' }}>
          {OPERATIONAL_STATUSES.map(opt => {
            const OptIcon = ICON[opt]
            const active = opt === current
            return (
              <button key={opt} type="button" role="option" aria-selected={active}
                onClick={() => { setOpen(false); if (!active) onChange(opt) }}
                style={{ display: 'flex', width: '100%', alignItems: 'flex-start', gap: '0.5rem', padding: '0.5rem 0.6rem', borderRadius: 9, border: 'none', background: active ? 'rgba(255,255,255,0.08)' : 'transparent', color: 'var(--clr-text)', fontFamily: 'inherit', textAlign: 'left', cursor: 'pointer' }}>
                <OptIcon size={13} />
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: '0.79rem', fontWeight: 700, color: TONE_COLOR[opt] }}>
                    {operationalLabel(opt)}{active ? ' · current' : ''}
                  </span>
                  <span style={{ display: 'block', fontSize: '0.69rem', color: 'var(--clr-muted)', lineHeight: 1.35 }}>
                    {DESCRIPTION[opt]}
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
