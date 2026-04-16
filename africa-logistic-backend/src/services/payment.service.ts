import { Pool, RowDataPacket } from 'mysql2/promise'
import { randomUUID } from 'crypto'
import { addWalletTransaction, getOrCreateWallet, checkSufficientBalance } from './wallet.service.js'
import { sendPushToUser, sendPushToRole } from './push.service.js'
import { sendEmail } from './email.service.js'

export interface OrderCharge extends RowDataPacket {
  id: string
  order_id: string
  charge_type: string
  amount: number
  description: string | null
  is_optional: number
}

/**
 * Calculate complete order pricing based on distance, weight, cargo type
 * This returns the BASE price BEFORE tip/charges
 */
export async function calculateOrderPrice(
  db: Pool,
  distanceKm: number,
  weightKg: number,
  vehicleType: string,
  cityId?: number
): Promise<{
  baseFare: number
  perKmCost: number
  citySurcharge: number
  weightCost: number
  subtotal: number
}> {
  // Get pricing rule for vehicle type
  const [pricingRows] = await db.query<any[]>(
    `SELECT * FROM pricing_rules WHERE vehicle_type = ? AND is_active = 1 LIMIT 1`,
    [vehicleType]
  )

  if (pricingRows.length === 0) {
    throw new Error(`No pricing rule found for vehicle type: ${vehicleType}`)
  }

  const pricing = pricingRows[0]
  const baseFare = Number(pricing.base_fare)
  const perKmRate = Number(pricing.per_km_rate)
  const perKgRate = Number(pricing.per_kg_rate || 0)
  const citySurcharge = Number(pricing.city_surcharge)

  // Calculate components
  const perKmCost = distanceKm * perKmRate
  const weightCost = (weightKg || 0) * perKgRate
  const subtotal = baseFare + perKmCost + weightCost + citySurcharge

  return {
    baseFare,
    perKmCost,
    citySurcharge,
    weightCost,
    subtotal: Math.max(subtotal, baseFare), // Minimum is base fare
  }
}

/**
 * Get all pending charges (tips, extra fees, etc.) for an order
 */
export async function getOrderCharges(db: Pool, orderId: string): Promise<{
  charges: OrderCharge[]
  totalOptional: number
  totalApproved: number
}> {
  const [charges] = await db.query<OrderCharge[]>(
    `SELECT * FROM order_charges WHERE order_id = ? AND status IN ('PENDING','APPROVED','APPLIED')`,
    [orderId]
  )

  let totalOptional = 0
  let totalApproved = 0

  for (const charge of charges) {
    const amount = Number(charge.amount)
    if (charge.is_optional) {
      totalOptional += amount
    } else {
      totalApproved += amount
    }
  }

  return {
    charges,
    totalOptional,
    totalApproved,
  }
}

/**
 * Add a charge to an order (tip, extra fees, etc.)
 */
export async function addOrderCharge(
  db: Pool,
  orderId: string,
  chargeType: 'TIP' | 'WAITING_TIME' | 'LOADING_FEE' | 'SPECIAL_HANDLING' | 'OTHER',
  amount: number,
  description: string | null,
  addedByUserId: string,
  isOptional: boolean = true
): Promise<string> {
  const chargeId = randomUUID()
  await db.query(
    `INSERT INTO order_charges (id, order_id, charge_type, amount, description, added_by, is_optional, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING')`,
    [chargeId, orderId, chargeType, amount, description, addedByUserId, isOptional ? 1 : 0]
  )
  return chargeId
}

/**
 * Calculate FINAL price for order (including commission and charges)
 * This is what gets split between shipper, driver, and platform
 */
export async function calculateFinalOrderPrice(
  db: Pool,
  orderId: string,
  basePrice: number,
  driverId?: string
): Promise<{
  basePrice: number
  approvedCharges: number
  commissionRate: number
  commission: number
  driverEarning: number
  shipperCost: number
  total: number
}> {
  // Get approved charges for this order
  const { charges, totalApproved } = await getOrderCharges(db, orderId)

  // Get driver's commission rate (from settings or default)
  const commissionRate = 0.15 // 15% platform commission (configurable)

  const subtotalWithCharges = basePrice + totalApproved
  const commission = subtotalWithCharges * commissionRate
  const driverEarning = subtotalWithCharges - commission

  return {
    basePrice,
    approvedCharges: totalApproved,
    commissionRate,
    commission,
    driverEarning,
    shipperCost: subtotalWithCharges, // What shipper pays
    total: subtotalWithCharges, // Alias for clarity
  }
}

/**
 * Check if wallet balance is sufficient for order
 */
export async function validateOrderPayment(db: Pool, shipperId: string, orderTotal: number): Promise<{
  hasSufficientBalance: boolean
  currentBalance: number
  shortfall: number
}> {
  const wallet = await getOrCreateWallet(db, shipperId)
  const currentBalance = Number(wallet.balance)
  const hasSufficientBalance = currentBalance >= orderTotal
  const shortfall = hasSufficientBalance ? 0 : orderTotal - currentBalance

  return {
    hasSufficientBalance,
    currentBalance,
    shortfall,
  }
}

/**
 * Process FINAL payment settlement when order marked COMPLETED (OTP verified on delivery)
 * DEDUCTS from shipper wallet and CREDITS to ADMIN wallet (platform holds funds).
 * Admin then manually pays driver via wallet credit or bank transfer.
 */
export async function settleOrderPayment(
  db: Pool,
  orderId: string,
  shipperUserId: string,
  driverUserId: string,
  shipperAmount: number,
  driverAmount: number,
  commissionAmount: number,
  referenceCode: string
): Promise<{
  shipperTransactionId: string
  driverTransactionId: string
  success: boolean
}> {
  // Find super admin (role_id = 1) to credit
  const [adminRows] = await db.query<any[]>(
    `SELECT id FROM users WHERE role_id = 1 AND is_active = 1 ORDER BY created_at ASC LIMIT 1`
  )
  const adminUserId: string = adminRows[0]?.id ?? shipperUserId // fallback to shipper if no admin (shouldn't happen)

  // Deduct from shipper
  const shipperTxId = await addWalletTransaction(
    db,
    shipperUserId,
    'DEBIT',
    shipperAmount,
    `Order payment - ${referenceCode}`,
    orderId,
    referenceCode,
    adminUserId,
    { type: 'order_settlement', role: 'shipper', driver_id: driverUserId }
  )

  // Credit to admin wallet (platform holds money until admin pays driver)
  const adminTxId = await addWalletTransaction(
    db,
    adminUserId,
    'CREDIT',
    shipperAmount,
    `Order received from shipper - ${referenceCode}`,
    orderId,
    referenceCode,
    shipperUserId,
    { type: 'order_settlement', role: 'admin', shipper_id: shipperUserId, driver_id: driverUserId, commission: commissionAmount }
  )

  await db.query(
    `UPDATE orders SET payment_status = 'SETTLED', final_price = ? WHERE id = ?`,
    [shipperAmount, orderId]
  )

  return {
    shipperTransactionId: shipperTxId,
    driverTransactionId: adminTxId, // reusing field name — now points to admin credit tx
    success: true,
  }
}

/**
 * Admin pays driver from admin wallet (with optional commission cut).
 * Net = grossAmount - commission. Net credited to driver, deducted from admin.
 */
export async function adminPayDriverWallet(
  db: Pool,
  orderId: string,
  driverId: string,
  adminId: string,
  grossAmount: number,
  commissionType: 'PERCENT' | 'FIXED' | 'NONE',
  commissionValue: number,
  referenceCode: string,
  note?: string
): Promise<{ paymentId: string; netAmount: number; commissionAmount: number }> {
  const { randomUUID } = await import('crypto')

  let commissionAmount = 0
  if (commissionType === 'PERCENT') {
    commissionAmount = grossAmount * (commissionValue / 100)
  } else if (commissionType === 'FIXED') {
    commissionAmount = commissionValue
  }
  commissionAmount = Math.max(0, Math.min(commissionAmount, grossAmount))
  const netAmount = grossAmount - commissionAmount

  if (netAmount <= 0) throw new Error('Net amount after commission must be greater than 0')

  // Debit admin wallet by net amount (commission stays in admin wallet)
  const adminTxId = await addWalletTransaction(
    db,
    adminId,
    'DEBIT',
    netAmount,
    `Driver payment (net) - ${referenceCode}${note ? ` | ${note}` : ''}`,
    orderId,
    referenceCode,
    driverId,
    { type: 'driver_payout', commission_type: commissionType, commission_value: commissionValue, commission_amount: commissionAmount, gross: grossAmount }
  )

  // Record commission retained (informational CREDIT of 0 net effect — just a record)
  if (commissionAmount > 0) {
    await addWalletTransaction(
      db,
      adminId,
      'COMMISSION',
      commissionAmount,
      `Commission retained - ${referenceCode}`,
      orderId,
      referenceCode,
      driverId,
      { type: 'commission_retained', driver_id: driverId }
    ).catch(() => {}) // non-blocking, informational only
  }

  // Credit driver wallet
  const driverTxId = await addWalletTransaction(
    db,
    driverId,
    'CREDIT',
    netAmount,
    `Payment from admin - ${referenceCode}${note ? ` | ${note}` : ''}`,
    orderId,
    referenceCode,
    adminId,
    { type: 'driver_payout', gross: grossAmount, commission_amount: commissionAmount, commission_type: commissionType }
  )

  // Record in order_driver_payments
  const paymentId = randomUUID()
  await db.query(
    `INSERT INTO order_driver_payments
       (id, order_id, driver_id, admin_id, payment_type, gross_amount, commission_type, commission_value, commission_amount, net_amount, note, driver_tx_id, admin_debit_tx_id)
     VALUES (?, ?, ?, ?, 'WALLET', ?, ?, ?, ?, ?, ?, ?, ?)`,
    [paymentId, orderId, driverId, adminId, grossAmount, commissionType, commissionValue, commissionAmount, netAmount, note || null, driverTxId, adminTxId]
  )

  // Mark order driver_payout_status
  await db.query(
    `UPDATE orders SET driver_payout_status = 'WALLET_PAID' WHERE id = ?`,
    [orderId]
  )

  return { paymentId, netAmount, commissionAmount }
}

/**
 * Admin records bank transfer to driver. Deducts from admin wallet immediately.
 * Receipt URL is optional proof.
 */
export async function adminBankTransferDriver(
  db: Pool,
  orderId: string,
  driverId: string,
  adminId: string,
  amount: number,
  referenceCode: string,
  receiptUrl?: string,
  note?: string
): Promise<{ paymentId: string }> {
  const { randomUUID } = await import('crypto')

  if (amount <= 0) throw new Error('Amount must be greater than 0')

  // Debit admin wallet
  const adminTxId = await addWalletTransaction(
    db,
    adminId,
    'DEBIT',
    amount,
    `Bank transfer to driver - ${referenceCode}${note ? ` | ${note}` : ''}`,
    orderId,
    referenceCode,
    driverId,
    { type: 'bank_transfer_out', driver_id: driverId, receipt_url: receiptUrl }
  )

  // Record in order_driver_payments
  const paymentId = randomUUID()
  await db.query(
    `INSERT INTO order_driver_payments
       (id, order_id, driver_id, admin_id, payment_type, gross_amount, commission_type, commission_value, commission_amount, net_amount, receipt_url, note, admin_debit_tx_id)
     VALUES (?, ?, ?, ?, 'BANK_TRANSFER', ?, 'NONE', 0, 0, ?, ?, ?, ?)`,
    [paymentId, orderId, driverId, adminId, amount, amount, receiptUrl || null, note || null, adminTxId]
  )

  // Mark order driver_payout_status
  await db.query(
    `UPDATE orders SET driver_payout_status = 'BANK_TRANSFERRED' WHERE id = ?`,
    [orderId]
  )

  return { paymentId }
}

/**
 * Add optional TIP to order (shipper adds after delivery, before completing)
 */
export async function addTipToOrder(
  db: Pool,
  orderId: string,
  shipperId: string,
  driverId: string,
  tipAmount: number,
  rating: number
): Promise<string> {
  // Validate tip amount
  if (tipAmount < 0 || tipAmount > 50000) {
    throw new Error('Tip must be between 0 and 50,000 ETB')
  }

  // Add as optional charge
  const chargeId = await addOrderCharge(
    db,
    orderId,
    'TIP',
    tipAmount,
    `Tip for delivery (${rating}★${rating >= 4 ? ' - Excellent' : rating >= 3 ? ' - Good' : ' - Average'})`,
    shipperId,
    true // Optional = shipper can choose to apply
  )

  return chargeId
}

/**
 * Apply/approve a charge to the order (system marks it as APPLIED)
 */
export async function applyOrderCharge(
  db: Pool,
  chargeId: string,
  approvedBy: string
): Promise<void> {
  await db.query(
    `UPDATE order_charges 
     SET status = 'APPLIED', approved_at = NOW(), approved_by = ?
     WHERE id = ?`,
    [approvedBy, chargeId]
  )
}

/**
 * Process manual deposit/refund for wallet (admin)
 * Creates a ManualPaymentRecord + corresponding wallet transaction
 */
export async function processManualPayment(
  db: Pool,
  walletId: string,
  userId: string,
  amount: number,
  actionType: 'DEPOSIT' | 'WITHDRAWAL' | 'REFUND' | 'ADJUSTMENT',
  reason: string,
  proofImageUrl?: string,
  submittedBy?: string,
  approvedBy?: string
): Promise<{
  recordId: string
  transactionId: string
}> {
  const recordId = randomUUID()
  const transactionType = actionType === 'DEPOSIT' ? 'CREDIT' : 'DEBIT'

  // Insert manual payment record
  await db.query(
    `INSERT INTO manual_payment_records 
     (id, wallet_id, amount, action_type, reason, proof_image_url, submitted_by, approved_by, status, approved_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'APPROVED', NOW())`,
    [
      recordId,
      walletId,
      amount,
      actionType,
      reason,
      proofImageUrl || null,
      submittedBy || 'system',
      approvedBy || 'system',
    ]
  )

  // Create corresponding wallet transaction
  const txId = await addWalletTransaction(
    db,
    userId,
    transactionType as any,
    amount,
    `Manual ${actionType}: ${reason}`,
    undefined,
    undefined,
    undefined,
    { manual_payment_record_id: recordId, admin_action: true }
  )

  // Link transaction to payment record
  await db.query(
    `UPDATE manual_payment_records SET transaction_id = ? WHERE id = ?`,
    [txId, recordId]
  )

  return { recordId, transactionId: txId }
}

/**
 * Get all manual payment records for admin review
 */
export async function getPendingManualPayments(
  db: Pool,
  limit: number = 50,
  offset: number = 0,
  status: string = 'PENDING'
): Promise<{ records: any[]; total: number }> {
  const whereClause = status === 'ALL' ? '' : `WHERE mpr.status = 'PENDING'`

  const [totalRows] = await db.query<any[]>(
    `SELECT COUNT(*) as total FROM manual_payment_records mpr ${whereClause}`
  )

  const [records] = await db.query<any[]>(
    `SELECT 
       mpr.*,
       u.phone_number,
       u.first_name,
       u.last_name,
       u.email,
       w.balance
     FROM manual_payment_records mpr
     JOIN wallets w ON w.id = mpr.wallet_id
     JOIN users u ON u.id = w.user_id
     ${whereClause}
     ORDER BY mpr.submitted_at DESC
     LIMIT ? OFFSET ?`,
    [limit, offset]
  )

  return {
    records,
    total: totalRows[0].total,
  }
}

/**
 * Approve manual payment (by admin)
 * Pass userId explicitly to avoid wallet lookup issues
 */
export async function approveManualPayment(
  db: Pool,
  recordId: string,
  userId: string,
  approvedBy: string,
  notes?: string
): Promise<void> {
  const [recordRows] = await db.query<any[]>(
    `SELECT * FROM manual_payment_records WHERE id = ?`,
    [recordId]
  )

  if (recordRows.length === 0) {
    throw new Error('Payment record not found')
  }

  const record = recordRows[0]

  // Create wallet transaction if not already created
  if (!record.transaction_id) {
    const amount = Number(record.amount)
    const isUserCredit = ['DEPOSIT', 'REFUND'].includes(record.action_type)

    // Mirror transfer on admin wallet so platform balance is tracked.
    if (isUserCredit) {
      const adminWallet = await getOrCreateWallet(db, approvedBy)
      const hasBalance = await checkSufficientBalance(db, approvedBy, amount)
      if (!hasBalance) {
        throw new Error('Admin wallet has insufficient balance for this approval')
      }

      await addWalletTransaction(
        db,
        approvedBy,
        'DEBIT',
        amount,
        `Transfer to user wallet approval (${record.action_type})`,
        undefined,
        recordId,
        userId,
        { source: 'admin_wallet', target_wallet_id: record.wallet_id, admin_wallet_id: adminWallet.id }
      )
    } else {
      await addWalletTransaction(
        db,
        approvedBy,
        'CREDIT',
        amount,
        `Transfer from user wallet approval (${record.action_type})`,
        undefined,
        recordId,
        userId,
        { source: 'user_wallet', target_wallet_id: record.wallet_id }
      )
    }

    const txId = await addWalletTransaction(
      db,
      userId,
      isUserCredit ? 'CREDIT' : 'DEBIT',
      amount,
      `Admin ${record.action_type}: ${record.reason}`,
      undefined,
      undefined,
      approvedBy,
      { manual_payment_record_id: recordId, approved_by: approvedBy, balanced_against_admin_wallet: true }
    )

    await db.query(
      `UPDATE manual_payment_records SET transaction_id = ? WHERE id = ?`,
      [txId, recordId]
    )
  }

  // Update record status
  await db.query(
    `UPDATE manual_payment_records 
     SET status = 'APPROVED', approved_at = NOW(), approved_by = ?, notes = ?
     WHERE id = ?`,
    [approvedBy, notes || null, recordId]
  )
}

/**
 * Reject manual payment (by admin)
 */
export async function rejectManualPayment(
  db: Pool,
  recordId: string,
  rejectedBy: string,
  rejectReason: string
): Promise<void> {
  await db.query(
    `UPDATE manual_payment_records 
     SET status = 'REJECTED', notes = ?, approved_by = ?
     WHERE id = ?`,
    [rejectReason, rejectedBy, recordId]
  )
}
