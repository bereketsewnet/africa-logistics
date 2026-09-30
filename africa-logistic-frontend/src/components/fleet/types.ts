/**
 * Shared fleet types (src/components/fleet/types.ts)
 *
 * Used by the individual car-owner dashboard, the company fleet screens and the
 * admin review sections, so a vehicle means the same thing in all three.
 *
 * Note every id is `string`. The database columns are CHAR(36) UUIDs; the admin
 * page previously typed them `number`, which is why its call sites wrap every id
 * in String().
 */

/** Admin approval. Set by staff, read-only to the owner. */
export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED'

/** Day-to-day availability. Controlled by the owner or company. */
export type OperationalStatus = 'ACTIVE' | 'INACTIVE' | 'MAINTENANCE' | 'OUT_OF_SERVICE'

export const OPERATIONAL_STATUSES: readonly OperationalStatus[] = [
  'ACTIVE',
  'INACTIVE',
  'MAINTENANCE',
  'OUT_OF_SERVICE',
]

/** A vehicle as the owner/company sees it. */
export interface FleetVehicle {
  id: string
  plate_number: string
  vehicle_type: string
  make?: string | null
  model: string | null
  color: string | null
  year: number | null
  max_capacity_kg: number | null
  description: string | null
  status: ApprovalStatus
  operational_status?: OperationalStatus
  operational_status_note?: string | null
  admin_note: string | null
  assigned_driver_id: string | null
  assigned_driver_name: string | null
  assigned_driver_phone: string | null
  vehicle_photo_url?: string | null
  libre_url?: string | null
  created_at: string
}

/**
 * A driver the owner may pick. Deliberately narrow — phone, email, address and
 * internal driver data stay private to the platform.
 */
export interface EligibleDriver {
  id: string
  first_name: string
  last_name: string | null
  profile_photo_url: string | null
  status: 'AVAILABLE' | 'ON_JOB' | 'OFFLINE'
  rating: number | null
  total_trips: number
  national_id_url: string
  license_url: string
  national_id_status: 'APPROVED'
  license_status: 'APPROVED'
  is_currently_assigned: number
}

/** Envelope the paginated list endpoints return. */
export interface PaginationMeta {
  total: number
  page: number
  limit: number
  pages: number
}
