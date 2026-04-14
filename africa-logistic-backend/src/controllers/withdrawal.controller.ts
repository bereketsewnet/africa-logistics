/**
 * Withdrawal Controller (src/controllers/withdrawal.controller.ts)
 * Handlers for user and admin withdrawal endpoints.
 */

import { FastifyRequest, FastifyReply } from 'fastify'
import {
  createWithdrawalRequest,
  getMyWithdrawalRequests,
  listWithdrawalRequests,
  approveWithdrawalRequest,
  rejectWithdrawalRequest,
} from '../services/withdrawal.service.js'

// ─── User: Submit withdrawal request ─────────────────────────────────────────

export async function submitWithdrawalHandler(
  request: FastifyRequest<{
    Body: {
      amount: number
      bank_details: { bank_name: string; account_number: string; account_name: string; method?: string }
      notes?: string
      proof_image_base64?: string
    }
  }>,
  reply: FastifyReply
) {
  const user = request.user as any
  const { amount, bank_details, notes, proof_image_base64 } = request.body

  if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
    return reply.status(400).send({ success: false, message: 'Amount must be a positive number' })
  }

  try {
    const requestId = await createWithdrawalRequest(
      request.server.db,
      user.id,
      user.role_id,
      { amount: Number(amount), bank_details, notes, proof_image_base64 }
    )

    return reply.status(201).send({
      success: true,
      message: 'Withdrawal request submitted. You will be notified once reviewed.',
      request_id: requestId,
    })
  } catch (err) {
    request.server.log.error(err)
    const msg = err instanceof Error ? err.message : 'Failed to submit withdrawal request'
    return reply.status(400).send({ success: false, message: msg })
  }
}

// ─── User: Get own withdrawal requests ───────────────────────────────────────

export async function getMyWithdrawalsHandler(
  request: FastifyRequest<{ Querystring: { limit?: number; offset?: number } }>,
  reply: FastifyReply
) {
  const user = request.user as any
  const limit = Math.min(Number(request.query.limit ?? 20), 100)
  const offset = Number(request.query.offset ?? 0)

  try {
    const { requests, total } = await getMyWithdrawalRequests(
      request.server.db, user.id, limit, offset
    )
    return reply.send({ success: true, requests, total, limit, offset })
  } catch (err) {
    request.server.log.error(err)
    return reply.status(500).send({ success: false, message: 'Failed to fetch withdrawal requests' })
  }
}

// ─── Admin: List all withdrawal requests ─────────────────────────────────────

export async function adminListWithdrawalsHandler(
  request: FastifyRequest<{ Querystring: { status?: string; limit?: number; offset?: number } }>,
  reply: FastifyReply
) {
  const { status = 'ALL', limit: rawLimit, offset: rawOffset } = request.query
  const limit = Math.min(Number(rawLimit ?? 20), 100)
  const offset = Number(rawOffset ?? 0)

  try {
    const { requests, total } = await listWithdrawalRequests(
      request.server.db, { status, limit, offset }
    )
    return reply.send({ success: true, requests, total, limit, offset })
  } catch (err) {
    request.server.log.error(err)
    return reply.status(500).send({ success: false, message: 'Failed to fetch withdrawal requests' })
  }
}

// ─── Admin: Approve a withdrawal request ─────────────────────────────────────

export async function adminApproveWithdrawalHandler(
  request: FastifyRequest<{
    Params: { requestId: string }
    Body: { approved_amount: number; admin_note?: string; admin_image_base64?: string }
  }>,
  reply: FastifyReply
) {
  const admin = request.user as any
  const { requestId } = request.params
  const { approved_amount, admin_note, admin_image_base64 } = request.body

  if (!approved_amount || isNaN(Number(approved_amount)) || Number(approved_amount) <= 0) {
    return reply.status(400).send({ success: false, message: 'Approved amount must be a positive number' })
  }

  try {
    await approveWithdrawalRequest(
      request.server.db,
      requestId,
      admin.id,
      { approved_amount: Number(approved_amount), admin_note, admin_image_base64 }
    )
    return reply.send({ success: true, message: 'Withdrawal approved. User wallet updated and user notified.' })
  } catch (err) {
    request.server.log.error(err)
    const msg = err instanceof Error ? err.message : 'Failed to approve withdrawal'
    return reply.status(400).send({ success: false, message: msg })
  }
}

// ─── Admin: Reject a withdrawal request ──────────────────────────────────────

export async function adminRejectWithdrawalHandler(
  request: FastifyRequest<{
    Params: { requestId: string }
    Body: { reason: string }
  }>,
  reply: FastifyReply
) {
  const admin = request.user as any
  const { requestId } = request.params
  const { reason } = request.body

  if (!reason?.trim()) {
    return reply.status(400).send({ success: false, message: 'Rejection reason is required' })
  }

  try {
    await rejectWithdrawalRequest(request.server.db, requestId, admin.id, reason)
    return reply.send({ success: true, message: 'Withdrawal rejected. User has been notified.' })
  } catch (err) {
    request.server.log.error(err)
    const msg = err instanceof Error ? err.message : 'Failed to reject withdrawal'
    return reply.status(400).send({ success: false, message: msg })
  }
}
