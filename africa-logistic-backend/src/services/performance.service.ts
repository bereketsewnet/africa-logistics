import { Pool, RowDataPacket } from 'mysql2/promise'
import { addWalletTransaction } from './wallet.service.js'

export interface DriverPerformanceMetrics extends RowDataPacket {
  id: string
  driver_id: string
  total_trips: number
  on_time_trips: number
  late_trips: number
  cancelled_trips: number
  average_rating: number
  total_earned: number
  on_time_percentage: number
  bonus_earned: number
  last_trip_date: string | null
  streak_days: number
}

/**
 * Initialize performance metrics for a driver
 */
export async function initializeDriverMetrics(db: Pool, driverId: string): Promise<string> {
  const { randomUUID } = await import('crypto')
  const metricsId = randomUUID()

  await db.query(
    `INSERT INTO driver_performance_metrics 
     (id, driver_id, total_trips, on_time_trips, average_rating, bonus_earned)
     VALUES (?, ?, 0, 0, 0, 0)`,
    [metricsId, driverId]
  )

  return metricsId
}

/**
 * Get or create driver performance metrics
 */
export async function getOrCreateDriverMetrics(db: Pool, driverId: string): Promise<DriverPerformanceMetrics> {
  const [rows] = await db.query<DriverPerformanceMetrics[]>(
    `SELECT * FROM driver_performance_metrics WHERE driver_id = ?`,
    [driverId]
  )

  if (rows.length > 0) {
    return rows[0]
  }

  // Create if doesn't exist
  await initializeDriverMetrics(db, driverId)
  return await getOrCreateDriverMetrics(db, driverId)
}

/**
 * Update driver metrics after order completion
 * Called when delivery OTP is verified
 */
export async function updateDriverMetricsAfterDelivery(
  db: Pool,
  driverId: string,
  orderId: string,
  wasOnTime: boolean,
  deliveryRating?: number
): Promise<void> {
  const metrics = await getOrCreateDriverMetrics(db, driverId)

  // Increment trip count
  const newTotalTrips = metrics.total_trips + 1
  const newOnTimeTrips = wasOnTime ? metrics.on_time_trips + 1 : metrics.on_time_trips
  const onTimePercentage = (newOnTimeTrips / newTotalTrips) * 100

  // Update average rating if provided
  let newAverageRating = metrics.average_rating
  if (deliveryRating && deliveryRating >= 1 && deliveryRating <= 5) {
    newAverageRating = (metrics.average_rating * metrics.total_trips + deliveryRating) / newTotalTrips
  }

  await db.query(
    `UPDATE driver_performance_metrics 
     SET total_trips = ?, on_time_trips = ?, on_time_percentage = ?, average_rating = ?, last_trip_date = NOW()
     WHERE driver_id = ?`,
    [newTotalTrips, newOnTimeTrips, onTimePercentage, newAverageRating, driverId]
  )
}

/**
 * Calculate bonus amount based on performance
 * Bonus rules:
 *   - Tier 1: 50+ trips, 90%+ on-time, 4.5+ rating → 500 ETB bonus
 *   - Tier 2: 20+ trips, 80%+ on-time, 4.0+ rating → 200 ETB bonus
 *   - Tier 3: 10+ trips, 70%+ on-time, 3.5+ rating → 50 ETB bonus
 *   - Streak bonus: +50 ETB for each day of consecutive trips
 */
export function calculatePerformanceBonus(metrics: DriverPerformanceMetrics): {
  bonusAmount: number
  tier: string
  reasons: string[]
} {
  let bonusAmount = 0
  const reasons: string[] = []
  let tier = 'NONE'

  const totalTrips = metrics.total_trips
  const onTimePercentage = metrics.on_time_percentage
  const avgRating = metrics.average_rating
  const streakDays = metrics.streak_days

  // Tier 1: Premium performer
  if (totalTrips >= 50 && onTimePercentage >= 90 && avgRating >= 4.5) {
    bonusAmount += 500
    tier = 'TIER_1_PREMIUM'
    reasons.push(`Premium tier: ${totalTrips} trips, ${onTimePercentage.toFixed(1)}% on-time, ${avgRating.toFixed(2)} rating`)
  }
  // Tier 2: Good performer
  else if (totalTrips >= 20 && onTimePercentage >= 80 && avgRating >= 4.0) {
    bonusAmount += 200
    tier = 'TIER_2_GOOD'
    reasons.push(`Good tier: ${totalTrips} trips, ${onTimePercentage.toFixed(1)}% on-time, ${avgRating.toFixed(2)} rating`)
  }
  // Tier 3: Competent performer
  else if (totalTrips >= 10 && onTimePercentage >= 70 && avgRating >= 3.5) {
    bonusAmount += 50
    tier = 'TIER_3_COMPETENT'
    reasons.push(`Competent tier: ${totalTrips} trips, ${onTimePercentage.toFixed(1)}% on-time, ${avgRating.toFixed(2)} rating`)
  }

  // Streak bonus
  if (streakDays > 0) {
    const streakBonus = streakDays * 50 // 50 ETB per day
    bonusAmount += streakBonus
    reasons.push(`Streak bonus: ${streakDays} days × 50 ETB = ${streakBonus} ETB`)
  }

  return { bonusAmount, tier, reasons }
}

/**
 * Reward performance bonus to driver
 * Called periodically (weekly/biweekly) to credit bonuses
 */
export async function rewardPerformanceBonus(db: Pool, driverId: string): Promise<{
  bonusAmount: number
  tier: string
  transactionId: string
  reasons: string[]
} | null> {
  const metrics = await getOrCreateDriverMetrics(db, driverId)

  // Only reward if minimum trips reached
  if (metrics.total_trips < 10) {
    return null
  }

  const { bonusAmount, tier, reasons } = calculatePerformanceBonus(metrics)

  if (bonusAmount <= 0) {
    return null
  }

  // Credit bonus to wallet
  const txId = await addWalletTransaction(
    db,
    driverId,
    'BONUS',
    bonusAmount,
    `Performance bonus (${tier})`,
    undefined,
    undefined,
    undefined,
    { bonus_tier: tier, metrics: { total_trips: metrics.total_trips, on_time_percentage: metrics.on_time_percentage, average_rating: metrics.average_rating } }
  )

  // Update bonus earned total
  await db.query(
    `UPDATE driver_performance_metrics 
     SET bonus_earned = bonus_earned + ?, updated_at = NOW()
     WHERE driver_id = ?`,
    [bonusAmount, driverId]
  )

  return {
    bonusAmount,
    tier,
    transactionId: txId,
    reasons,
  }
}

/**
 * Update streak (consecutive days of at least one trip)
 * Call this daily or when checking metrics
 */
export async function updateStreakDays(db: Pool, driverId: string): Promise<number> {
  const metrics = await getOrCreateDriverMetrics(db, driverId)

  if (!metrics.last_trip_date) {
    return 0
  }

  const lastTripDate = new Date(metrics.last_trip_date)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  lastTripDate.setHours(0, 0, 0, 0)

  const daysDiff = Math.floor((today.getTime() - lastTripDate.getTime()) / (1000 * 60 * 60 * 24))

  let streakDays = metrics.streak_days

  if (daysDiff === 0) {
    // Same day, streak continues
  } else if (daysDiff === 1) {
    // Next day, streak continues
    streakDays += 1
  } else {
    // Streak broken
    streakDays = 0
  }

  await db.query(
    `UPDATE driver_performance_metrics SET streak_days = ? WHERE driver_id = ?`,
    [streakDays, driverId]
  )

  return streakDays
}

/**
 * Get performance metrics for all drivers (for admin dashboard)
 */
export async function getAllDriverMetrics(
  db: Pool,
  limit: number = 100,
  offset: number = 0,
  sortBy: 'bonus' | 'trips' | 'rating' = 'rating'
): Promise<{ metrics: DriverPerformanceMetrics[]; total: number }> {
  const orderClause =
    sortBy === 'bonus'
      ? 'dpm.bonus_earned DESC, dpm.average_rating DESC'
      : sortBy === 'trips'
        ? 'dpm.total_trips DESC, dpm.average_rating DESC'
        : 'dpm.average_rating DESC, dpm.total_trips DESC'

  const [totalRows] = await db.query<any[]>(
    `SELECT COUNT(*) as total FROM driver_performance_metrics WHERE total_trips > 0`
  )

  const [metrics] = await db.query<DriverPerformanceMetrics[]>(
    `SELECT dpm.*, u.first_name, u.last_name, u.phone_number, u.email
     FROM driver_performance_metrics dpm
     JOIN users u ON u.id = dpm.driver_id
     WHERE dpm.total_trips > 0
     ORDER BY ${orderClause}
     LIMIT ? OFFSET ?`,
    [limit, offset]
  )

  return {
    metrics,
    total: totalRows[0].total,
  }
}

/**
 * Batch process performance bonuses for all eligible drivers
 * Should be called periodically (every 7 days or on-demand)
 */
export async function batchProcessPerformanceBonuses(
  db: Pool
): Promise<{ processed: number; totalBonus: number; details: Array<{ driverId: string; bonus: number; tier: string }> }> {
  const [drivers] = await db.query<any[]>(
    `SELECT id FROM users WHERE role_id = 3 AND is_active = 1`
  )

  let totalProcessed = 0
  let totalBonusAmount = 0
  const details: Array<{ driverId: string; bonus: number; tier: string }> = []

  for (const driver of drivers) {
    try {
      const result = await rewardPerformanceBonus(db, driver.id)
      if (result) {
        totalProcessed++
        totalBonusAmount += result.bonusAmount
        details.push({
          driverId: driver.id,
          bonus: result.bonusAmount,
          tier: result.tier,
        })
      }
    } catch (err) {
      console.error(`Failed to process bonus for driver ${driver.id}:`, err)
    }
  }

  return {
    processed: totalProcessed,
    totalBonus: totalBonusAmount,
    details,
  }
}
