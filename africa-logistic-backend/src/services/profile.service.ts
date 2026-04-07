/**
 * Profile Service (src/services/profile.service.ts)
 *
 * DB query functions for:
 *  - Driver profile & document management
 *  - Notification preferences
 *  - Vehicle CRUD & assignment
 *  - Theme preference updates
 */

import { Pool, RowDataPacket, ResultSetHeader } from 'mysql2/promise'
import { v4 as uuidv4 } from 'uuid'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DriverProfileRow extends RowDataPacket {
  user_id: string
  national_id_url: string | null
  license_url: string | null
  libre_url: string | null
  national_id_status: 'PENDING' | 'APPROVED' | 'REJECTED'
  license_status: 'PENDING' | 'APPROVED' | 'REJECTED'
  libre_status: 'PENDING' | 'APPROVED' | 'REJECTED'
  rejection_reason: string | null
  is_verified: number
  verified_at: string | null
  verified_by_admin_id: string | null
  status: 'AVAILABLE' | 'ON_JOB' | 'OFFLINE' | 'SUSPENDED'
  rating: number | null
  total_trips: number
  // joined from users
  first_name?: string
  last_name?: string
  phone_number?: string
  profile_photo_url?: string | null
  email?: string | null
}

export interface NotificationPrefsRow extends RowDataPacket {
  user_id: string
  sms_enabled: number
  email_enabled: number
  browser_enabled: number
  order_updates: number
  promotions: number
  updated_at: string
}

export interface VehicleRow extends RowDataPacket {
  id: string
  driver_id: string | null
  plate_number: string
  vehicle_type: string
  max_capacity_kg: number
  is_company_owned: number
  vehicle_photo_url: string | null
  description: string | null
  is_active: number
  created_at: string
  updated_at: string
  // joined
  driver_first_name?: string
  driver_last_name?: string
  driver_phone?: string
}

export interface DocumentReviewRow extends RowDataPacket {
  id: string
  driver_id: string
  document_type: 'national_id' | 'license' | 'libre'
  action: 'APPROVED' | 'REJECTED'
  reason: string | null
  reviewed_by: string
  reviewed_at: string
  reviewer_name?: string
}

// ─── Driver Profile ───────────────────────────────────────────────────────────

export async function getDriverProfile(
  db: Pool,
  userId: string
): Promise<DriverProfileRow | null> {
  const [rows] = await db.query<DriverProfileRow[]>(
    `SELECT dp.*, u.first_name, u.last_name, u.phone_number, u.profile_photo_url, u.email
       FROM driver_profiles dp
       JOIN users u ON u.id = dp.user_id
      WHERE dp.user_id = ?
      LIMIT 1`,
    [userId]
  )
  return rows[0] ?? null
}

/** Upsert driver profile row (created on first doc upload if not already there) */
export async function ensureDriverProfile(db: Pool, userId: string): Promise<void> {
  await db.query(
    `INSERT INTO driver_profiles (user_id) VALUES (?) ON DUPLICATE KEY UPDATE user_id = user_id`,
    [userId]
  )
}

export async function updateDriverDocuments(
  db: Pool,
  userId: string,
  docs: {
    nationalIdUrl?: string
    licenseUrl?: string
    libreUrl?: string
  }
): Promise<void> {
  const fields: string[] = []
  const values: any[] = []

  if (docs.nationalIdUrl !== undefined) {
    fields.push('national_id_url = ?', 'national_id_status = ?')
    values.push(docs.nationalIdUrl, 'PENDING')
  }
  if (docs.licenseUrl !== undefined) {
    fields.push('license_url = ?', 'license_status = ?')
    values.push(docs.licenseUrl, 'PENDING')
  }
  if (docs.libreUrl !== undefined) {
    fields.push('libre_url = ?', 'libre_status = ?')
    values.push(docs.libreUrl, 'PENDING')
  }
  if (fields.length === 0) return

  values.push(userId)
  await db.query(
    `UPDATE driver_profiles SET ${fields.join(', ')} WHERE user_id = ?`,
    values
  )
}

/** List all drivers with their profile + doc status (for admin pending view) */
export async function listDriversForAdmin(
  db: Pool,
  filter: 'all' | 'pending' | 'verified' | 'rejected' = 'all'
): Promise<DriverProfileRow[]> {
  let whereClause = ''
  if (filter === 'pending') {
    whereClause = `WHERE dp.is_verified = 0 AND (
      dp.national_id_url IS NOT NULL OR dp.license_url IS NOT NULL OR dp.libre_url IS NOT NULL
    ) AND dp.status != 'SUSPENDED'`
  } else if (filter === 'verified') {
    whereClause = `WHERE dp.is_verified = 1`
  } else if (filter === 'rejected') {
    whereClause = `WHERE dp.rejection_reason IS NOT NULL AND dp.is_verified = 0`
  }

  const [rows] = await db.query<DriverProfileRow[]>(
    `SELECT dp.*, u.first_name, u.last_name, u.phone_number, u.profile_photo_url, u.email
       FROM driver_profiles dp
       JOIN users u ON u.id = dp.user_id
       ${whereClause}
      ORDER BY u.created_at DESC`
  )
  return rows
}

/** Admin: update individual document status */
export async function reviewDriverDocument(
  db: Pool,
  driverId: string,
  documentType: 'national_id' | 'license' | 'libre',
  action: 'APPROVED' | 'REJECTED',
  reason: string | null,
  adminId: string
): Promise<void> {
  // Update the specific doc status column
  const colMap = {
    national_id: 'national_id_status',
    license: 'license_status',
    libre: 'libre_status',
  }
  const col = colMap[documentType]
  await db.query(
    `UPDATE driver_profiles SET ${col} = ? WHERE user_id = ?`,
    [action, driverId]
  )

  // Log the review
  const reviewId = uuidv4()
  await db.query(
    `INSERT INTO driver_document_reviews (id, driver_id, document_type, action, reason, reviewed_by)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [reviewId, driverId, documentType, action, reason ?? null, adminId]
  )
}

/** Admin: fully verify a driver (all docs approved → set badge + AVAILABLE) */
export async function verifyDriver(
  db: Pool,
  driverId: string,
  adminId: string
): Promise<void> {
  await db.query(
    `UPDATE driver_profiles
        SET is_verified = 1,
            national_id_status = 'APPROVED',
            license_status = 'APPROVED',
            libre_status = 'APPROVED',
            verified_at = NOW(),
            verified_by_admin_id = ?,
            rejection_reason = NULL,
            status = 'AVAILABLE'
      WHERE user_id = ?`,
    [adminId, driverId]
  )
}

/** Admin: reject a driver with a reason */
export async function rejectDriver(
  db: Pool,
  driverId: string,
  reason: string
): Promise<void> {
  await db.query(
    `UPDATE driver_profiles
        SET is_verified = 0,
            rejection_reason = ?,
            status = 'OFFLINE'
      WHERE user_id = ?`,
    [reason, driverId]
  )
}

/** Get document review history for a driver */
export async function getDocumentReviews(db: Pool, driverId: string): Promise<DocumentReviewRow[]> {
  const [rows] = await db.query<DocumentReviewRow[]>(
    `SELECT dr.*, CONCAT(u.first_name, ' ', u.last_name) AS reviewer_name
       FROM driver_document_reviews dr
       JOIN users u ON u.id = dr.reviewed_by
      WHERE dr.driver_id = ?
      ORDER BY dr.reviewed_at DESC`,
    [driverId]
  )
  return rows
}

// ─── Notification Preferences ─────────────────────────────────────────────────

export async function getNotificationPrefs(
  db: Pool,
  userId: string
): Promise<NotificationPrefsRow | null> {
  const [rows] = await db.query<NotificationPrefsRow[]>(
    `SELECT * FROM notification_preferences WHERE user_id = ? LIMIT 1`,
    [userId]
  )
  return rows[0] ?? null
}

export async function upsertNotificationPrefs(
  db: Pool,
  userId: string,
  prefs: {
    sms_enabled?: number
    email_enabled?: number
    browser_enabled?: number
    order_updates?: number
    promotions?: number
  }
): Promise<void> {
  // Build insert with defaults, update on duplicate
  await db.query(
    `INSERT INTO notification_preferences
       (user_id, sms_enabled, email_enabled, browser_enabled, order_updates, promotions)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       sms_enabled     = VALUES(sms_enabled),
       email_enabled   = VALUES(email_enabled),
       browser_enabled = VALUES(browser_enabled),
       order_updates   = VALUES(order_updates),
       promotions      = VALUES(promotions)`,
    [
      userId,
      prefs.sms_enabled     ?? 1,
      prefs.email_enabled   ?? 1,
      prefs.browser_enabled ?? 1,
      prefs.order_updates   ?? 1,
      prefs.promotions      ?? 0,
    ]
  )
}

// ─── Theme Preference ─────────────────────────────────────────────────────────

export async function updateThemePreference(
  db: Pool,
  userId: string,
  theme: 'LIGHT' | 'DARK' | 'SYSTEM'
): Promise<void> {
  await db.query(
    `UPDATE users SET theme_preference = ? WHERE id = ?`,
    [theme, userId]
  )
}

// ─── Vehicles ─────────────────────────────────────────────────────────────────

export async function listVehicles(db: Pool, activeOnly = true): Promise<VehicleRow[]> {
  const [rows] = await db.query<VehicleRow[]>(
    `SELECT v.*,
            u.first_name AS driver_first_name,
            u.last_name  AS driver_last_name,
            u.phone_number AS driver_phone
       FROM vehicles v
       LEFT JOIN users u ON u.id = v.driver_id
      ${activeOnly ? 'WHERE v.is_active = 1' : ''}
      ORDER BY v.created_at DESC`
  )
  return rows
}

export async function getVehicleById(db: Pool, vehicleId: string): Promise<VehicleRow | null> {
  const [rows] = await db.query<VehicleRow[]>(
    `SELECT v.*,
            u.first_name AS driver_first_name,
            u.last_name  AS driver_last_name,
            u.phone_number AS driver_phone
       FROM vehicles v
       LEFT JOIN users u ON u.id = v.driver_id
      WHERE v.id = ?
      LIMIT 1`,
    [vehicleId]
  )
  return rows[0] ?? null
}

export async function createVehicle(
  db: Pool,
  data: {
    plateNumber: string
    vehicleType: string
    maxCapacityKg: number
    isCompanyOwned?: boolean
    vehiclePhotoUrl?: string | null
    description?: string | null
  }
): Promise<string> {
  const id = uuidv4()
  await db.query<ResultSetHeader>(
    `INSERT INTO vehicles
       (id, plate_number, vehicle_type, max_capacity_kg, is_company_owned, vehicle_photo_url, description)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      data.plateNumber,
      data.vehicleType,
      data.maxCapacityKg,
      data.isCompanyOwned ? 1 : 0,
      data.vehiclePhotoUrl ?? null,
      data.description ?? null,
    ]
  )
  return id
}

export async function updateVehicle(
  db: Pool,
  vehicleId: string,
  data: {
    plateNumber?: string
    vehicleType?: string
    maxCapacityKg?: number
    isCompanyOwned?: boolean
    vehiclePhotoUrl?: string | null
    description?: string | null
    isActive?: boolean
  }
): Promise<void> {
  const fields: string[] = []
  const values: any[] = []

  if (data.plateNumber    !== undefined) { fields.push('plate_number = ?');     values.push(data.plateNumber) }
  if (data.vehicleType    !== undefined) { fields.push('vehicle_type = ?');     values.push(data.vehicleType) }
  if (data.maxCapacityKg  !== undefined) { fields.push('max_capacity_kg = ?');  values.push(data.maxCapacityKg) }
  if (data.isCompanyOwned !== undefined) { fields.push('is_company_owned = ?'); values.push(data.isCompanyOwned ? 1 : 0) }
  if (data.vehiclePhotoUrl !== undefined) { fields.push('vehicle_photo_url = ?'); values.push(data.vehiclePhotoUrl) }
  if (data.description    !== undefined) { fields.push('description = ?');      values.push(data.description) }
  if (data.isActive       !== undefined) { fields.push('is_active = ?');        values.push(data.isActive ? 1 : 0) }

  if (fields.length === 0) return
  values.push(vehicleId)
  await db.query(`UPDATE vehicles SET ${fields.join(', ')} WHERE id = ?`, values)
}

/** Assign a vehicle to a driver. If driver is verified, set status AVAILABLE */
export async function assignVehicleToDriver(
  db: Pool,
  vehicleId: string,
  driverId: string
): Promise<void> {
  // Unassign from any previous driver
  await db.query(
    `UPDATE vehicles SET driver_id = NULL WHERE driver_id = ? AND id != ?`,
    [driverId, vehicleId]
  )
  // Assign vehicle
  await db.query(`UPDATE vehicles SET driver_id = ? WHERE id = ?`, [driverId, vehicleId])

  // If driver is verified → set AVAILABLE
  await db.query(
    `UPDATE driver_profiles
        SET status = 'AVAILABLE'
      WHERE user_id = ? AND is_verified = 1`,
    [driverId]
  )
}

/** Unassign vehicle from driver → driver goes OFFLINE */
export async function unassignVehicle(db: Pool, vehicleId: string): Promise<void> {
  // Get current driver before clearing
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT driver_id FROM vehicles WHERE id = ? LIMIT 1`,
    [vehicleId]
  )
  const driverId = (rows as any[])[0]?.driver_id

  await db.query(`UPDATE vehicles SET driver_id = NULL WHERE id = ?`, [vehicleId])

  if (driverId) {
    await db.query(
      `UPDATE driver_profiles SET status = 'OFFLINE' WHERE user_id = ?`,
      [driverId]
    )
  }
}
