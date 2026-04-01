/**
 * Auth Service (src/services/auth.service.ts)
 *
 * Pure database query functions for authentication.
 * Each function accepts the MySQL pool (fastify.db) as its first argument
 * and returns typed results. No HTTP request/reply objects here —
 * this layer only talks to the database.
 */
import { v4 as uuidv4 } from 'uuid';
// ─── Query Functions ──────────────────────────────────────────────────────────
/**
 * Find a user by their phone number.
 * Returns the user row (with role name) or null if not found.
 */
export async function findUserByPhone(db, phoneNumber) {
    const [rows] = await db.query(`SELECT u.*, r.role_name
     FROM users u
     JOIN roles r ON u.role_id = r.id
     WHERE u.phone_number = ?
     LIMIT 1`, [phoneNumber]);
    return rows[0] ?? null;
}
/**
 * Find a user by their internal UUID.
 * Used by the GET /api/auth/me protected endpoint.
 */
export async function findUserById(db, userId) {
    const [rows] = await db.query(`SELECT u.*, r.role_name
     FROM users u
     JOIN roles r ON u.role_id = r.id
     WHERE u.id = ?
     LIMIT 1`, [userId]);
    return rows[0] ?? null;
}
/**
 * Find a user by their Telegram ID.
 * Used during Telegram Mini App login.
 */
export async function findUserByTelegramId(db, telegramId) {
    const [rows] = await db.query(`SELECT u.*, r.role_name
     FROM users u
     JOIN roles r ON u.role_id = r.id
     WHERE u.telegram_id = ?
     LIMIT 1`, [telegramId]);
    return rows[0] ?? null;
}
/**
 * Create a new user in the `users` table.
 *
 * @param roleId  2 = Shipper, 3 = Driver (as per the schema seed data)
 * @returns The newly created user's UUID
 */
export async function createUser(db, data) {
    const userId = uuidv4(); // Generate a UUID for the new user
    await db.query(`INSERT INTO users
       (id, role_id, phone_number, password_hash, first_name, last_name, is_phone_verified, is_active)
     VALUES (?, ?, ?, ?, ?, ?, TRUE, TRUE)`, [
        userId,
        data.roleId,
        data.phoneNumber,
        data.passwordHash,
        data.firstName,
        data.lastName,
    ]);
    return userId;
}
/**
 * Find an existing Telegram user or create a new one (Shipper role by default).
 * This is the "find or create" pattern for Telegram login.
 *
 * @returns The user row after find or create
 */
export async function findOrCreateTelegramUser(db, data) {
    // Try to find existing user by Telegram ID
    const existing = await findUserByTelegramId(db, data.telegramId);
    if (existing)
        return existing;
    // Not found — create a new Shipper account linked to this Telegram ID
    const userId = uuidv4();
    await db.query(`INSERT INTO users
       (id, role_id, phone_number, telegram_id, first_name, last_name, is_phone_verified, is_active)
     VALUES (?, 2, ?, ?, ?, ?, FALSE, TRUE)`, [userId, data.phoneNumber, data.telegramId, data.firstName, data.lastName]);
    // Fetch and return the full row with role name
    const newUser = await findUserById(db, userId);
    if (!newUser)
        throw new Error('Failed to retrieve newly created Telegram user.');
    return newUser;
}
// ─── Email verification helpers ─────────────────────────────────────────────
export async function createEmailVerification(db, userId, newEmail, token, expiresAt) {
    const id = uuidv4();
    await db.query(`INSERT INTO email_verifications (id, user_id, new_email, token, expires_at) VALUES (?, ?, ?, ?, ?)`, [id, userId, newEmail, token, expiresAt]);
    return id;
}
export async function findEmailVerificationByToken(db, token) {
    const [rows] = await db.query(`SELECT * FROM email_verifications WHERE token = ? LIMIT 1`, [token]);
    return rows[0] ?? null;
}
export async function markEmailVerificationUsed(db, id) {
    await db.query(`UPDATE email_verifications SET used = 1 WHERE id = ?`, [id]);
}
// ─── Phone change request helpers ───────────────────────────────────────────
export async function createPhoneChangeRequest(db, userId, newPhone, expiresAt) {
    const id = uuidv4();
    await db.query(`INSERT INTO phone_change_requests (id, user_id, new_phone, expires_at) VALUES (?, ?, ?, ?)`, [id, userId, newPhone, expiresAt]);
    return id;
}
export async function findPhoneChangeRequest(db, userId, newPhone) {
    const [rows] = await db.query(`SELECT * FROM phone_change_requests WHERE user_id = ? AND new_phone = ? LIMIT 1`, [userId, newPhone]);
    return rows[0] ?? null;
}
export async function deletePhoneChangeRequest(db, id) {
    await db.query(`DELETE FROM phone_change_requests WHERE id = ?`, [id]);
}
// ─── Profile updates ───────────────────────────────────────────────────────
export async function updateUserProfile(db, userId, data) {
    const fields = [];
    const values = [];
    if (data.firstName !== undefined) {
        fields.push('first_name = ?');
        values.push(data.firstName);
    }
    if (data.lastName !== undefined) {
        fields.push('last_name = ?');
        values.push(data.lastName);
    }
    if (data.profilePhotoUrl !== undefined) {
        fields.push('profile_photo_url = ?');
        values.push(data.profilePhotoUrl);
    }
    if (fields.length === 0)
        return;
    values.push(userId);
    await db.query(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, values);
}
export async function updateUserPassword(db, userId, passwordHash) {
    await db.query(`UPDATE users SET password_hash = ? WHERE id = ?`, [passwordHash, userId]);
}
export async function updateUserEmail(db, userId, email) {
    await db.query(`UPDATE users SET email = ?, is_email_verified = 1 WHERE id = ?`, [email, userId]);
}
export async function updateUserPhone(db, userId, phone) {
    await db.query(`UPDATE users SET phone_number = ?, is_phone_verified = 1 WHERE id = ?`, [phone, userId]);
}
