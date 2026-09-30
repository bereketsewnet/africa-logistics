import type { ApprovalStatus, OperationalStatus } from './types'

/**
 * Approval status and operational status are independent, which is exactly how
 * they come to look contradictory — an unapproved truck showing a confident
 * green "Active" is nonsense. This is the single place that reconciles them, so
 * the company table, the individual card and the admin screens all agree.
 */
export interface EffectiveVehicleState {
  /** Which axis the row should lead with. */
  headline: string
  tone: 'good' | 'warn' | 'bad' | 'idle'
  /** Approved AND active — the only combination that may take a job. */
  canDispatch: boolean
  /** Changing operational status is pointless until the vehicle is approved. */
  opControlEnabled: boolean
  /** Why it cannot be dispatched, for a tooltip or helper line. */
  reason: string | null
}

const OPERATIONAL_LABEL: Record<OperationalStatus, string> = {
  ACTIVE: 'Active',
  INACTIVE: 'Inactive',
  MAINTENANCE: 'In maintenance',
  OUT_OF_SERVICE: 'Out of service',
}

const OPERATIONAL_TONE: Record<OperationalStatus, EffectiveVehicleState['tone']> = {
  ACTIVE: 'good',
  INACTIVE: 'idle',
  MAINTENANCE: 'warn',
  OUT_OF_SERVICE: 'bad',
}

export function operationalLabel(status: OperationalStatus): string {
  return OPERATIONAL_LABEL[status] ?? status
}

export function operationalTone(status: OperationalStatus): EffectiveVehicleState['tone'] {
  return OPERATIONAL_TONE[status] ?? 'idle'
}

export function effectiveVehicleState(vehicle: {
  status: ApprovalStatus
  operational_status?: OperationalStatus | null
}): EffectiveVehicleState {
  const op: OperationalStatus = vehicle.operational_status ?? 'ACTIVE'

  // Approval outranks everything: until an admin has approved the vehicle, the
  // operational state is not meaningful and must not be displayed as if it were.
  if (vehicle.status === 'PENDING') {
    return {
      headline: 'Waiting for approval',
      tone: 'warn',
      canDispatch: false,
      opControlEnabled: false,
      reason: 'Waiting for admin approval',
    }
  }
  if (vehicle.status === 'REJECTED') {
    return {
      headline: 'Rejected',
      tone: 'bad',
      canDispatch: false,
      opControlEnabled: false,
      reason: 'Rejected — see the admin note',
    }
  }

  return {
    headline: operationalLabel(op),
    tone: operationalTone(op),
    canDispatch: op === 'ACTIVE',
    opControlEnabled: true,
    reason: op === 'ACTIVE' ? null : `This vehicle is ${operationalLabel(op).toLowerCase()}`,
  }
}
