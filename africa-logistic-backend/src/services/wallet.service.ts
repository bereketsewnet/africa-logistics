import { Pool, RowDataPacket } from 'mysql2/promise'
import { randomUUID } from 'crypto'

export interface WalletRow extends RowDataPacket {
  id: string
  user_id: string
  balance: number
  currency: string
  total_earned: number
  total_spent: number
  total_withdrawn: number
  is_locked: number
  lock_reason: string | null
  created_at: string
  updated_at: string
}

export interface WalletTransactionRow extends RowDataPacket {
  id: string
  wallet_id: string
  order_id: string | null
  transaction_type: string
  amount: number
  description: string
  reference_code: string | null
  status: string
  related_user_id: string | null
  metadata: string | null
  created_at: string
  processed_at: string | null
}

/**
 * Get or create wallet for a user
 */
export async function getOrCreateWallet(db: Pool, userId: string): Promise<WalletRow> {
  const [rows] = await db.query<WalletRow[]>(
    `SELECT * FROM wallets WHERE user_id = ?`,
    [userId]
  )

  if (rows.length > 0) {
    return rows[0]
  }

  // Create wallet if doesn't exist
  const walletId = randomUUID()
  await db.query(
    `INSERT INTO wallets (id, user_id, balance, currency) VALUES (?, ?, 0.00, 'ETB')`,
    [walletId, userId]
  )

  return {
    id: walletId,
    user_id: userId,
    balance: 0,
    currency: 'ETB',
    total_earned: 0,
    total_spent: 0,
    total_withdrawn: 0,
    is_locked: 0,
    lock_reason: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  } as WalletRow
}

/**
 * Get wallet balance (checks for lock)
 */
export async function getWalletBalance(db: Pool, userId: string): Promise<{ balance: number; isLocked: boolean; lockReason: string | null }> {
  const wallet = await getOrCreateWallet(db, userId)
  return {
    balance: Number(wallet.balance),
    isLocked: Boolean(wallet.is_locked),
    lockReason: wallet.lock_reason,
  }
}

/**
 * Add transaction to wallet (Double-Entry Ledger)
 * This is the CORE function — always use this to record money movements
 * Returns the transaction ID for reference
 */
export async function addWalletTransaction(
  db: Pool,
  userId: string,
  transactionType: 'CREDIT' | 'DEBIT' | 'COMMISSION' | 'TIP' | 'REFUND' | 'BONUS' | 'ADMIN_ADJUSTMENT',
  amount: number,
  description: string,
  orderId?: string,
  referenceCode?: string,
  relatedUserId?: string,
  metadata?: Record<string, any>
): Promise<string> {
  if (amount <= 0) {
    throw new Error('Transaction amount must be greater than 0')
  }

  const wallet = await getOrCreateWallet(db, userId)
  const transactionId = randomUUID()

  // Determine sign based on transaction type
  let amountSign = 1
  let newBalance = Number(wallet.balance)

  switch (transactionType) {
    case 'CREDIT':
    case 'BONUS':
    case 'REFUND':
      amountSign = 1 // Add to wallet
      newBalance += amount
      break
    case 'DEBIT':
    case 'COMMISSION':
    case 'TIP':
    case 'ADMIN_ADJUSTMENT':
      amountSign = -1 // Remove from wallet
      newBalance -= amount
      break
  }

  // Start transaction
  const conn = await db.getConnection()
  try {
    await conn.beginTransaction()

    // Check if wallet is locked (except for REFUND/ADMIN_ADJUSTMENT which override lock)
    if (transactionType !== 'REFUND' && transactionType !== 'ADMIN_ADJUSTMENT') {
      const [walletCheck] = await conn.query<WalletRow[]>(
        `SELECT is_locked FROM wallets WHERE id = ? FOR UPDATE`,
        [wallet.id]
      )
      if (walletCheck[0]?.is_locked) {
        throw new Error(`Wallet is locked: ${walletCheck[0]?.lock_reason || 'Unknown reason'}`)
      }
    }

    // Check balance before debit (but allow admin to go negative for refunds)
    if (amountSign === -1 && newBalance < 0 && transactionType !== 'ADMIN_ADJUSTMENT') {
      throw new Error(`Insufficient wallet balance. Required: ${amount}, Available: ${Number(wallet.balance)}`)
    }

    // Prevent negative balance unless it's admin adjustment
    if (newBalance < 0 && transactionType !== 'ADMIN_ADJUSTMENT') {
      throw new Error('Insufficient funds')
    }

    // Insert immutable transaction record
    await conn.query(
      `INSERT INTO wallet_transactions 
       (id, wallet_id, order_id, transaction_type, amount, description, reference_code, status, related_user_id, metadata, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'COMPLETED', ?, ?, NOW())`,
      [
        transactionId,
        wallet.id,
        orderId || null,
        transactionType,
        amount,
        description,
        referenceCode || null,
        relatedUserId || null,
        metadata ? JSON.stringify(metadata) : null,
      ]
    )

    // Update wallet balance
    const updateField = transactionType === 'CREDIT' || transactionType === 'BONUS' || transactionType === 'REFUND'
      ? 'total_earned' : 'total_spent'

    await conn.query(
      `UPDATE wallets 
       SET balance = balance + ?, ${updateField} = ${updateField} + ?, updated_at = NOW()
       WHERE id = ?`,
      [amountSign * amount, amount, wallet.id]
    )

    await conn.commit()
  } catch (error) {
    await conn.rollback()
    throw error
  } finally {
    conn.release()
  }

  return transactionId
}

/**
 * Reverse a wallet transaction (creates opposing transaction)
 */
export async function reverseWalletTransaction(
  db: Pool,
  transactionId: string,
  reversalReason: string,
  reversedBy: string
): Promise<void> {
  const conn = await db.getConnection()
  try {
    await conn.beginTransaction()

    // Get original transaction
    const [txns] = await conn.query<WalletTransactionRow[]>(
      `SELECT * FROM wallet_transactions WHERE id = ? FOR UPDATE`,
      [transactionId]
    )

    if (txns.length === 0) {
      throw new Error('Transaction not found')
    }

    const originalTxn = txns[0]

    // Determine reversal type
    let reversalType
    switch (originalTxn.transaction_type) {
      case 'CREDIT':
      case 'BONUS':
      case 'REFUND':
        reversalType = 'DEBIT' // Reverse credit with debit
        break
      case 'DEBIT':
      case 'COMMISSION':
      case 'TIP':
        reversalType = 'CREDIT' // Reverse debit with credit
        break
      default:
        reversalType = 'ADMIN_ADJUSTMENT'
    }

    // Create reversing transaction
    const reversalId = randomUUID()
    await conn.query(
      `INSERT INTO wallet_transactions 
       (id, wallet_id, order_id, transaction_type, amount, description, reference_code, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'COMPLETED', NOW())`,
      [
        reversalId,
        originalTxn.wallet_id,
        originalTxn.order_id,
        reversalType,
        originalTxn.amount,
        `Reversal: ${reversalReason}`,
        null,
      ]
    )

    // Update wallet balance to undo the original transaction
    const amountSign = ['CREDIT', 'BONUS', 'REFUND'].includes(originalTxn.transaction_type) ? -1 : 1
    await conn.query(
      `UPDATE wallets 
       SET balance = balance + ?, updated_at = NOW()
       WHERE id = ?`,
      [amountSign * originalTxn.amount, originalTxn.wallet_id]
    )

    // Mark original as reversed
    await conn.query(
      `UPDATE wallet_transactions 
       SET status = 'REVERSED', reversed_at = NOW(), reversed_by = ?, reversal_reason = ?
       WHERE id = ?`,
      [reversedBy, reversalReason, transactionId]
    )

    await conn.commit()
  } catch (error) {
    await conn.rollback()
    throw error
  } finally {
    conn.release()
  }
}

/**
 * Check if wallet has sufficient balance for order
 */
export async function checkSufficientBalance(db: Pool, userId: string, amount: number): Promise<boolean> {
  const wallet = await getOrCreateWallet(db, userId)
  return Number(wallet.balance) >= amount
}

/**
 * Get transaction history for a wallet
 */
export async function getWalletTransactionHistory(
  db: Pool,
  userId: string,
  limit: number = 50,
  offset: number = 0
): Promise<{ transactions: WalletTransactionRow[]; total: number }> {
  const wallet = await getOrCreateWallet(db, userId)

  const [totalRows] = await db.query<any[]>(
    `SELECT COUNT(*) as total FROM wallet_transactions WHERE wallet_id = ?`,
    [wallet.id]
  )

  const [transactions] = await db.query<WalletTransactionRow[]>(
    `SELECT * FROM wallet_transactions 
     WHERE wallet_id = ? 
     ORDER BY created_at DESC 
     LIMIT ? OFFSET ?`,
    [wallet.id, limit, offset]
  )

  return {
    transactions,
    total: totalRows[0].total,
  }
}

/**
 * Lock wallet (for audit, dispute, etc.)
 */
export async function lockWallet(db: Pool, userId: string, reason: string): Promise<void> {
  const wallet = await getOrCreateWallet(db, userId)
  await db.query(
    `UPDATE wallets SET is_locked = 1, lock_reason = ? WHERE id = ?`,
    [reason, wallet.id]
  )
}

/**
 * Unlock wallet
 */
export async function unlockWallet(db: Pool, userId: string): Promise<void> {
  const wallet = await getOrCreateWallet(db, userId)
  await db.query(
    `UPDATE wallets SET is_locked = 0, lock_reason = NULL WHERE id = ?`,
    [wallet.id]
  )
}

/**
 * Get total stats for admin dashboard
 */
export async function getWalletStats(db: Pool): Promise<{
  totalWallets: number
  totalBalance: number
  totalEarned: number
  totalSpent: number
}> {
  const [stats] = await db.query<any[]>(
    `SELECT 
       COUNT(*) as total_wallets,
       COALESCE(SUM(balance), 0) as total_balance,
       COALESCE(SUM(total_earned), 0) as total_earned,
       COALESCE(SUM(total_spent), 0) as total_spent
     FROM wallets
     WHERE is_locked = 0`
  )

  return {
    totalWallets: stats[0].total_wallets || 0,
    totalBalance: Number(stats[0].total_balance || 0),
    totalEarned: Number(stats[0].total_earned || 0),
    totalSpent: Number(stats[0].total_spent || 0),
  }
}
