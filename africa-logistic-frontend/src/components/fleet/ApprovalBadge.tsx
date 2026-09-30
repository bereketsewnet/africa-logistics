import { LuCheck, LuClock, LuX } from 'react-icons/lu'
import type { ApprovalStatus } from './types'

/**
 * Admin approval state.
 *
 * Deliberately rendered as a NON-interactive badge. Operational status is a
 * clickable control with a caret, so the two axes never read as rivals even
 * though both have a green and an amber state.
 */
export default function ApprovalBadge({ status }: { status: ApprovalStatus }) {
  const styles: Record<string, { background: string; color: string; label: string }> = {
    PENDING:  { background: 'rgba(251,191,36,0.15)', color: '#fbbf24', label: 'Pending' },
    APPROVED: { background: 'rgba(52,211,153,0.15)', color: '#34d399', label: 'Approved' },
    REJECTED: { background: 'rgba(248,113,113,0.15)', color: '#f87171', label: 'Rejected' },
  }
  const s = styles[status] || styles.PENDING
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
      padding: '0.25rem 0.65rem', borderRadius: 999,
      background: s.background, color: s.color, fontSize: '0.75rem', fontWeight: 700,
    }}>
      {status === 'APPROVED' && <LuCheck size={11}/>}
      {status === 'PENDING' && <LuClock size={11}/>}
      {status === 'REJECTED' && <LuX size={11}/>}
      {s.label}
    </span>
  )
}
