import { useMemo } from 'react'
import SearchableSelect, { type SelectOption } from './SearchableSelect'

/**
 * Choose a driver, showing which truck each one is currently on and whose fleet it
 * belongs to.
 *
 * The fleet label is the point. A driver's truck can live in any of three tables, and
 * the old pickers only ever knew about the platform fleet — so a driver crewing a
 * company truck looked identical to one with no vehicle at all. Showing the plate and
 * its fleet is what lets an operator see, before they assign anything, which trucks
 * are actually in play.
 */
export interface DispatchDriver {
  id: string
  first_name: string
  last_name: string | null
  phone_number: string
  driver_status?: string | null
  vehicle_id?: string | null
  plate_number?: string | null
  vehicle_type?: string | null
  vehicle_source?: 'FLEET' | 'CAR_OWNER' | 'COMPANY' | null
  company_name?: string | null
}

const SOURCE_LABEL: Record<string, string> = {
  FLEET: 'Fleet',
  CAR_OWNER: 'Car owner',
  COMPANY: 'Company',
}

/** The plate plus whose truck it is, as one line. */
export function describeDriverVehicle(d: DispatchDriver): string {
  if (!d.plate_number) return 'no vehicle assigned'
  const fleet = d.vehicle_source === 'COMPANY' && d.company_name
    ? d.company_name
    : SOURCE_LABEL[d.vehicle_source ?? ''] ?? ''
  return fleet ? `${d.plate_number} · ${fleet}` : d.plate_number
}

export default function DriverPicker({
  drivers, value, onChange, disabled, emptyLabel = '— No driver —', placeholder = 'Search name or phone',
}: {
  drivers: DispatchDriver[]
  value: string
  onChange: (driverId: string) => void
  disabled?: boolean
  emptyLabel?: string
  placeholder?: string
}) {
  const options = useMemo<SelectOption[]>(() => drivers.map(d => {
    const name = `${d.first_name} ${d.last_name ?? ''}`.trim()
    const hasVehicle = Boolean(d.plate_number)
    return {
      id: String(d.id),
      label: name,
      sub: `${d.phone_number} · ${describeDriverVehicle(d)}`,
      // Nobody is greyed out — a driver with no truck can still take an order, the
      // order simply records no vehicle. The badge is information, not a gate.
      badge: hasVehicle
        ? (d.vehicle_source === 'COMPANY' ? 'Company' : SOURCE_LABEL[d.vehicle_source ?? ''] ?? 'Vehicle')
        : 'No vehicle',
      badgeTone: hasVehicle ? 'good' : 'warn',
    }
  }), [drivers])

  return (
    <SearchableSelect
      options={options}
      value={value}
      onChange={onChange}
      disabled={disabled}
      emptyLabel={emptyLabel}
      placeholder={placeholder}
      noResultsLabel="No driver matches that search."
    />
  )
}
