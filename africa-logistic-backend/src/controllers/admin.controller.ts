import { FastifyRequest, FastifyReply } from 'fastify'

/**
 * GET /api/admin/users
 * Returns all users with stats. Admin-only.
 */
export async function adminGetUsersHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const db = request.server.db

  // Verify caller is admin (role_id = 1)
  const caller = request.user as { id: string; role_id: number }
  if (caller.role_id !== 1) {
    return reply.status(403).send({ message: 'Admin access required.' })
  }

  const [users] = await db.query<any[]>(`
    SELECT
      u.id,
      u.first_name,
      u.last_name,
      u.phone_number,
      u.email,
      u.is_active,
      u.is_phone_verified,
      u.is_email_verified,
      u.created_at,
      u.profile_photo_url,
      r.id   AS role_id,
      r.name AS role_name
    FROM users u
    LEFT JOIN roles r ON r.id = u.role_id
    ORDER BY u.created_at DESC
  `)

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const stats = {
    total_users:    users.length,
    active_users:   users.filter((u: any) => u.is_active).length,
    total_admins:   users.filter((u: any) => u.role_id === 1).length,
    total_shippers: users.filter((u: any) => u.role_id === 2).length,
    total_drivers:  users.filter((u: any) => u.role_id === 3).length,
    new_today:      users.filter((u: any) => new Date(u.created_at) >= today).length,
  }

  return reply.send({ users, stats })
}

/**
 * PATCH /api/admin/users/:id/toggle-active
 * Flips the is_active flag for a user. Admin-only.
 */
export async function adminToggleActiveHandler(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  const db = request.server.db
  const caller = request.user as { id: string; role_id: number }

  if (caller.role_id !== 1) {
    return reply.status(403).send({ message: 'Admin access required.' })
  }

  const { id } = request.params

  // Prevent admin from suspending themselves
  if (id === caller.id) {
    return reply.status(400).send({ message: 'Cannot suspend your own account.' })
  }

  const [[target]] = await db.query<any[]>(
    'SELECT id, is_active FROM users WHERE id = ?',
    [id],
  )

  if (!target) {
    return reply.status(404).send({ message: 'User not found.' })
  }

  const newActive = target.is_active ? 0 : 1
  await db.query('UPDATE users SET is_active = ? WHERE id = ?', [newActive, id])

  return reply.send({ id, is_active: newActive })
}
