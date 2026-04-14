/**
 * Withdrawal Service
 * Handles all logic for user-initiated wallet withdrawals with admin review.
 */

import { randomUUID } from 'crypto'
import fs from 'fs'
import path from 'path'
import { Pool } from 'mysql2/promise'
import { addWalletTransaction, getOrCreateWallet } from './wallet.service.js'
import { sendPushToUser } from './push.service.js'
import { sendEmail } from './email.service.js'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BankDetails {
  bank_name: string
  account_number: string
  account_name: string
  method?: string   // e.g. 'Bank Transfer', 'Mobile Money'
}

export interface CreateWithdrawalInput {
  amount: number
  bank_details: BankDetails
  notes?: string
  proof_image_base64?: string  // optional receipt/document
}

export interface ApproveWithdrawalInput {
  approved_amount: number
  admin_note?: string
  admin_image_base64?: string
  commission_rate?: number  // override global rate if provided
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getCommissionRate(db: Pool): Promise<number> {
  const [[row]] = await db.query<any[]>(
    `SELECT config_value FROM system_config WHERE config_key = 'withdrawal_commission_rate'`
  )
  const raw = row?.config_value
  const parsed = parseFloat(raw)
  return isNaN(parsed) ? 15 : parsed
}

async function getAdminUserId(db: Pool): Promise<string | null> {
  const [[row]] = await db.query<any[]>(
    `SELECT id FROM users WHERE role_id = 1 AND is_active = 1 ORDER BY created_at ASC LIMIT 1`
  )
  return row?.id ?? null
}

function saveBase64File(base64Data: string, subDir: string, baseName: string): string | null {
  try {
    const match = base64Data.match(/^data:([a-zA-Z0-9+/]+\/[a-zA-Z0-9+/]+);base64,(.+)$/)
    const raw = match ? match[2] : base64Data
    const mime = match ? match[1] : 'image/jpeg'
    const extMap: Record<string, string> = {
      'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png',
      'image/webp': 'webp', 'application/pdf': 'pdf',
    }
    const ext = extMap[mime] ?? 'jpg'
    const dir = path.join(process.cwd(), 'uploads', subDir)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    const filename = `${baseName}_${Date.now()}.${ext}`
    fs.writeFileSync(path.join(dir, filename), Buffer.from(raw, 'base64'))
    return `/uploads/${subDir}/${filename}`
  } catch {
    return null
  }
}

// ─── Create Withdrawal Request (user-initiated) ───────────────────────────────

export async function createWithdrawalRequest(
  db: Pool,
  userId: string,
  roleId: number,
  input: CreateWithdrawalInput
): Promise<string> {
  const { amount, bank_details, notes } = input

  if (!amount || amount <= 0) {
    throw new Error('Withdrawal amount must be greater than 0')
  }
  if (amount > 10_000_000) {
    throw new Error('Withdrawal amount exceeds maximum limit')
  }
  if (!bank_details?.bank_name?.trim() || !bank_details?.account_number?.trim() || !bank_details?.account_name?.trim()) {
    throw new Error('Bank details (bank name, account number, account name) are required')
  }

  // Check wallet balance
  const wallet = await getOrCreateWallet(db, userId)
  const currentBalance = Number(wallet.balance)
  if (currentBalance < amount) {
    throw new Error(`Insufficient balance. Available: ${currentBalance.toFixed(2)} ETB`)
  }

  // Check for existing PENDING request to prevent duplicates
  const [[pendingRow]] = await db.query<any[]>(
    `SELECT id FROM withdrawal_requests WHERE user_id = ? AND status = 'PENDING' LIMIT 1`,
    [userId]
  )
  if (pendingRow) {
    throw new Error('You already have a pending withdrawal request. Please wait for it to be reviewed.')
  }

  // Handle optional proof image
  let proofImageUrl: string | null = null
  if (input.proof_image_base64) {
    proofImageUrl = saveBase64File(input.proof_image_base64, 'withdrawals', `wr_${userId}`)
  }

  const id = randomUUID()
  await db.query(
    `INSERT INTO withdrawal_requests 
       (id, user_id, role_id, amount_requested, bank_details, notes, proof_image_url, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING')`,
    [id, userId, roleId, amount, JSON.stringify(bank_details), notes ?? null, proofImageUrl]
  )

  return id
}

// ─── Get user's own withdrawal requests ──────────────────────────────────────

export async function getMyWithdrawalRequests(
  db: Pool,
  userId: string,
  limit = 20,
  offset = 0
): Promise<{ requests: any[]; total: number }> {
  const [[{ total }]] = await db.query<any[]>(
    `SELECT COUNT(*) as total FROM withdrawal_requests WHERE user_id = ?`,
    [userId]
  )

  const [rows] = await db.query<any[]>(
    `SELECT id, amount_requested, amount_approved, bank_details, notes, proof_image_url,
            status, admin_note, admin_image_url, commission_rate, commission_amount,
            created_at, reviewed_at
     FROM withdrawal_requests
     WHERE user_id = ?
     ORDER BY created_at DESC
     LIMIT ? OFFSET ?`,
    [userId, limit, offset]
  )

  const requests = rows.map(r => ({
    ...r,
    bank_details: typeof r.bank_details === 'string' ? JSON.parse(r.bank_details) : r.bank_details,
    amount_requested: Number(r.amount_requested),
    amount_approved: r.amount_approved !== null ? Number(r.amount_approved) : null,
    commission_rate: r.commission_rate !== null ? Number(r.commission_rate) : null,
    commission_amount: r.commission_amount !== null ? Number(r.commission_amount) : null,
  }))

  return { requests, total: Number(total) }
}

// ─── Admin: List all withdrawal requests ─────────────────────────────────────

export async function listWithdrawalRequests(
  db: Pool,
  params: { status?: string; limit?: number; offset?: number }
): Promise<{ requests: any[]; total: number }> {
  const { status = 'ALL', limit = 20, offset = 0 } = params

  const whereClauses: string[] = []
  const queryParams: any[] = []

  if (status !== 'ALL') {
    whereClauses.push('wr.status = ?')
    queryParams.push(status)
  }

  const whereStr = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : ''

  const [[{ total }]] = await db.query<any[]>(
    `SELECT COUNT(*) as total FROM withdrawal_requests wr ${whereStr}`,
    queryParams
  )

  const [rows] = await db.query<any[]>(
    `SELECT wr.id, wr.user_id, wr.role_id, wr.amount_requested, wr.amount_approved,
            wr.bank_details, wr.notes, wr.proof_image_url,
            wr.status, wr.admin_note, wr.admin_image_url,
            wr.commission_rate, wr.commission_amount,
            wr.transaction_id, wr.reviewed_by, wr.reviewed_at, wr.created_at,
            u.first_name, u.last_name, u.phone_number, u.email,
            u.role_id as user_role_id,
            w.balance as current_balance
     FROM withdrawal_requests wr
     JOIN users u ON u.id = wr.user_id
     LEFT JOIN wallets w ON w.user_id = wr.user_id
     ${whereStr}
     ORDER BY wr.created_at DESC
     LIMIT ? OFFSET ?`,
    [...queryParams, limit, offset]
  )

  const requests = rows.map(r => ({
    ...r,
    bank_details: typeof r.bank_details === 'string' ? JSON.parse(r.bank_details) : r.bank_details,
    user_name: `${r.first_name} ${r.last_name}`,
    user_phone: r.phone_number ?? null,
    user_email: r.email ?? null,
    current_balance: Number(r.current_balance ?? 0),
    amount_requested: Number(r.amount_requested),
    amount_approved: r.amount_approved !== null ? Number(r.amount_approved) : null,
    commission_rate: r.commission_rate !== null ? Number(r.commission_rate) : null,
    commission_amount: r.commission_amount !== null ? Number(r.commission_amount) : null,
  }))

  return { requests, total: Number(total) }
}

// ─── Admin: Approve withdrawal request ───────────────────────────────────────

export async function approveWithdrawalRequest(
  db: Pool,
  requestId: string,
  adminUserId: string,
  input: ApproveWithdrawalInput
): Promise<void> {
  const { approved_amount, admin_note } = input

  if (!approved_amount || approved_amount <= 0) {
    throw new Error('Approved amount must be greater than 0')
  }

  // Fetch request with user info
  const [[req]] = await db.query<any[]>(
    `SELECT wr.*, u.email, u.first_name, u.last_name, u.role_id as user_role_id
     FROM withdrawal_requests wr
     JOIN users u ON u.id = wr.user_id
     WHERE wr.id = ?`,
    [requestId]
  )

  if (!req) throw new Error('Withdrawal request not found')
  if (req.status !== 'PENDING') throw new Error('Only PENDING requests can be approved')

  if (approved_amount > Number(req.amount_requested)) {
    throw new Error('Approved amount cannot exceed the requested amount')
  }

  // Handle optional admin image
  let adminImageUrl: string | null = null
  if (input.admin_image_base64) {
    adminImageUrl = saveBase64File(input.admin_image_base64, 'withdrawals/proofs', `admin_${requestId}`)
  }

  // Determine commission (drivers only, role_id = 3)
  const isDriver = Number(req.user_role_id) === 3
  const defaultRate = isDriver ? await getCommissionRate(db) : 0
  const commissionRate = isDriver
    ? (input.commission_rate !== undefined && input.commission_rate >= 0 ? input.commission_rate : defaultRate)
    : 0
  const commissionAmount = isDriver ? parseFloat((approved_amount * commissionRate / 100).toFixed(2)) : 0
  const netDeducted = approved_amount // We debit the full approved amount from the user

  // Debit user wallet (full approved amount)
  const txId = await addWalletTransaction(
    db,
    req.user_id,
    'DEBIT',
    netDeducted,
    `Withdrawal - ${req.bank_details.bank_name ?? 'Bank'} · ${req.bank_details.account_number ?? ''}`.trim(),
    undefined,
    undefined,
    adminUserId,
    { type: 'withdrawal', request_id: requestId, commission_rate: commissionRate }
  )

  // Credit commission to admin wallet (drivers only)
  let commissionTxId: string | null = null
  if (isDriver && commissionAmount > 0) {
    const adminId = await getAdminUserId(db)
    if (adminId) {
      commissionTxId = await addWalletTransaction(
        db,
        adminId,
        'CREDIT',
        commissionAmount,
        `Withdrawal commission from ${req.first_name} ${req.last_name} (${commissionRate}%)`,  
        undefined,
        undefined,
        req.user_id,
        { type: 'withdrawal_commission', request_id: requestId }
      )
    }
  }

  // Update request record
  await db.query(
    `UPDATE withdrawal_requests
     SET status = 'APPROVED',
         amount_approved = ?,
         admin_note = ?,
         admin_image_url = ?,
         commission_rate = ?,
         commission_amount = ?,
         transaction_id = ?,
         commission_transaction_id = ?,
         reviewed_by = ?,
         reviewed_at = NOW()
     WHERE id = ?`,
    [
      approved_amount, admin_note ?? null, adminImageUrl,
      isDriver ? commissionRate : null,
      isDriver ? commissionAmount : null,
      txId, commissionTxId,
      adminUserId, requestId
    ]
  )

  // Notifications
  const bankDetails = typeof req.bank_details === 'string' ? JSON.parse(req.bank_details) : req.bank_details

  try {
    await sendPushToUser(db, req.user_id, {
      title: 'Withdrawal Approved',
      body: `Your withdrawal of ${approved_amount.toFixed(2)} ETB has been approved and sent to ${bankDetails.bank_name}.`,
      url: '/wallet',
      data: { type: 'withdrawal_approved', request_id: requestId }
    })
  } catch { /* non-blocking */ }

  if (req.email) {
    try {
      await sendEmail({
        to: req.email,
        subject: `Withdrawal Approved — ${approved_amount.toFixed(2)} ETB`,
        text: [
          `Dear ${req.first_name},`,
          '',
          `Your withdrawal request has been approved.`,
          '',
          `Approved Amount: ${approved_amount.toFixed(2)} ETB`,
          `Destination: ${bankDetails.bank_name} · ${bankDetails.account_number}`,
          isDriver && commissionAmount > 0
            ? `Platform fee (${commissionRate}%): ${commissionAmount.toFixed(2)} ETB`
            : '',
          admin_note ? `Note from admin: ${admin_note}` : '',
          '',
          'Please allow 1–3 business days for the transfer to reflect.',
        ].filter(l => l !== null).join('\n')
      })
    } catch { /* non-blocking */ }
  }
}

// ─── Admin: Reject withdrawal request ────────────────────────────────────────

export async function rejectWithdrawalRequest(
  db: Pool,
  requestId: string,
  adminUserId: string,
  reason: string
): Promise<void> {
  if (!reason?.trim()) throw new Error('Rejection reason is required')

  const [[req]] = await db.query<any[]>(
    `SELECT wr.*, u.email, u.first_name FROM withdrawal_requests wr
     JOIN users u ON u.id = wr.user_id
     WHERE wr.id = ?`,
    [requestId]
  )

  if (!req) throw new Error('Withdrawal request not found')
  if (req.status !== 'PENDING') throw new Error('Only PENDING requests can be rejected')

  await db.query(
    `UPDATE withdrawal_requests
     SET status = 'REJECTED', admin_note = ?, reviewed_by = ?, reviewed_at = NOW()
     WHERE id = ?`,
    [reason, adminUserId, requestId]
  )

  try {
    await sendPushToUser(db, req.user_id, {
      title: 'Withdrawal Rejected',
      body: `Your withdrawal request was rejected: ${reason}`,
      url: '/wallet',
      data: { type: 'withdrawal_rejected', request_id: requestId }
    })
  } catch { /* non-blocking */ }

  if (req.email) {
    try {
      await sendEmail({
        to: req.email,
        subject: 'Withdrawal Request Rejected',
        text: `Dear ${req.first_name},\n\nYour withdrawal request of ${Number(req.amount_requested).toFixed(2)} ETB has been rejected.\n\nReason: ${reason}\n\nIf you believe this is an error, please contact our support team.`
      })
    } catch { /* non-blocking */ }
  }
}
