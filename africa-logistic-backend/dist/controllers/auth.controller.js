/**
 * Auth Controller (src/controllers/auth.controller.ts)
 *
 * This file contains the handler functions for each auth endpoint.
 * Controllers are the "middle layer":
 *   - They receive the HTTP request from the route
 *   - Call the service layer (DB queries, OTP logic)
 *   - Send back an HTTP response
 *
 * They do NOT contain SQL queries directly — that lives in auth.service.ts
 */
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { generateAndSendOtp, verifyOtp } from '../services/otp.service.js';
import { findUserByPhone, findUserById, createUser, findOrCreateTelegramUser, } from '../services/auth.service.js';
import { v4 as uuidv4 } from 'uuid';
import { createEmailVerification, findEmailVerificationByToken, markEmailVerificationUsed, createPhoneChangeRequest, findPhoneChangeRequest, deletePhoneChangeRequest, updateUserProfile, updateUserPassword, updateUserEmail, updateUserPhone } from '../services/auth.service.js';
import { sendVerificationEmail, sendPasswordResetEmail } from '../services/email.service.js';
import { notifyAdminsOfEvent } from '../services/push.service.js';
import fs from 'fs';
import path from 'path';
// ─── Handlers ─────────────────────────────────────────────────────────────────
/**
 * POST /api/auth/register/request-otp
 * Step 1 of registration: check phone doesn't exist, then send OTP via Twilio.
 */
export async function requestOtpHandler(request, reply) {
    const { phone_number } = request.body;
    // Check if this phone number is already registered
    const existing = await findUserByPhone(request.server.db, phone_number);
    if (existing) {
        return reply.status(409).send({
            success: false,
            message: 'This phone number is already registered. Please log in.',
        });
    }
    // Generate OTP and send it via Twilio SMS (or console.log in dev mode)
    try {
        await generateAndSendOtp(phone_number);
    }
    catch (err) {
        request.server.log.error({ err }, 'Failed to send OTP');
        return reply.status(503).send({ success: false, message: 'Unable to send OTP at this time. Please try again later.' });
    }
    return reply.send({
        success: true,
        message: `OTP sent to ${phone_number}. It expires in 10 minutes.`,
    });
}
/**
 * POST /api/auth/register/verify
 * Step 2 of registration: verify OTP, hash password, create user, return JWT.
 */
export async function verifyOtpHandler(request, reply) {
    const { phone_number, otp, new_password, role_id = 2, // Default to Shipper if not specified
    first_name = 'User', // Defaults; client should ideally provide these
    last_name = '', } = request.body;
    // Validate role_id — only 2 (Shipper) or 3 (Driver) allowed for self-registration
    if (![2, 3].includes(role_id)) {
        return reply.status(400).send({ success: false, message: 'Invalid role_id. Use 2 (Shipper) or 3 (Driver).' });
    }
    // Verify the OTP submitted by the user
    const isValid = verifyOtp(phone_number, otp);
    if (!isValid) {
        return reply.status(400).send({
            success: false,
            message: 'Invalid or expired OTP. Please request a new one.',
        });
    }
    // Hash the password with bcrypt (12 salt rounds = secure but not slow)
    const passwordHash = await bcrypt.hash(new_password, 12);
    // Create the user in the database
    const userId = await createUser(request.server.db, {
        phoneNumber: phone_number,
        passwordHash,
        roleId: role_id,
        firstName: first_name,
        lastName: last_name,
    });
    notifyAdminsOfEvent(request.server.db, 'New Account Registration', `${first_name} ${last_name}`.trim() + ` registered as ${role_id === 3 ? 'Driver' : 'Shipper'}.`, '/admin').catch(() => { });
    // Sign and return a JWT token
    const token = request.server.jwt.sign({ id: userId, phone_number, role_id }, { expiresIn: process.env.JWT_EXPIRES_IN || '1d' });
    return reply.status(201).send({
        success: true,
        message: 'Account created successfully.',
        token,
        user: { id: userId, phone_number, role_id },
    });
}
/**
 * POST /api/auth/login
 * Accepts phone_number + password, verifies hash, returns JWT.
 */
export async function loginHandler(request, reply) {
    const { phone_number, password } = request.body;
    // Look up the user
    const user = await findUserByPhone(request.server.db, phone_number);
    if (!user) {
        // Use a generic message to avoid leaking whether the phone is registered
        return reply.status(401).send({ success: false, message: 'Invalid credentials.' });
    }
    // Check if account is active (not suspended)
    if (!user.is_active) {
        return reply.status(403).send({ success: false, message: 'Your account has been suspended.' });
    }
    // Check password exists (Telegram-only accounts have no password)
    if (!user.password_hash) {
        return reply.status(401).send({ success: false, message: 'This account uses Telegram login. No password set.' });
    }
    // Compare submitted password against the stored hash
    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
        return reply.status(401).send({ success: false, message: 'Invalid credentials.' });
    }
    // Issue JWT
    const token = request.server.jwt.sign({ id: user.id, phone_number: user.phone_number, role_id: user.role_id }, { expiresIn: process.env.JWT_EXPIRES_IN || '1d' });
    return reply.send({
        success: true,
        message: 'Login successful.',
        token,
        user: {
            id: user.id,
            phone_number: user.phone_number,
            role_id: user.role_id,
            role_name: user.role_name,
            first_name: user.first_name,
            last_name: user.last_name,
        },
    });
}
/**
 * POST /api/auth/telegram
 * Validates the Telegram Mini App `initData` HMAC-SHA256 signature,
 * then finds or creates the user and returns a JWT.
 *
 * Telegram Docs: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
export async function telegramAuthHandler(request, reply) {
    const { initData } = request.body;
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
        return reply.status(500).send({ success: false, message: 'Telegram bot token not configured on server.' });
    }
    // ── Validate HMAC-SHA256 signature ─────────────────────────────────────────
    // 1. Parse the initData query string
    const params = new URLSearchParams(initData);
    const receivedHash = params.get('hash');
    if (!receivedHash) {
        return reply.status(400).send({ success: false, message: 'Missing hash in initData.' });
    }
    // 2. Remove 'hash' from params and sort remaining keys alphabetically
    params.delete('hash');
    const dataCheckString = Array.from(params.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${k}=${v}`)
        .join('\n');
    // 3. Compute HMAC: secret = HMAC-SHA256("WebAppData", botToken)
    const secretKey = crypto
        .createHmac('sha256', 'WebAppData')
        .update(botToken)
        .digest();
    const computedHash = crypto
        .createHmac('sha256', secretKey)
        .update(dataCheckString)
        .digest('hex');
    // 4. Compare securely (timing-safe)
    const hashesMatch = crypto.timingSafeEqual(Buffer.from(receivedHash, 'hex'), Buffer.from(computedHash, 'hex'));
    if (!hashesMatch) {
        return reply.status(401).send({ success: false, message: 'Invalid Telegram initData signature.' });
    }
    // ── Parse Telegram user data ───────────────────────────────────────────────
    const userDataRaw = params.get('user');
    if (!userDataRaw) {
        return reply.status(400).send({ success: false, message: 'No user data in initData.' });
    }
    const tgUser = JSON.parse(userDataRaw);
    // ── Find or create user ───────────────────────────────────────────────────
    const user = await findOrCreateTelegramUser(request.server.db, {
        telegramId: String(tgUser.id),
        firstName: tgUser.first_name,
        lastName: tgUser.last_name ?? '',
        // Telegram doesn't always provide phone; use a placeholder
        phoneNumber: tgUser.phone_number ?? `tg_${tgUser.id}`,
    });
    const token = request.server.jwt.sign({ id: user.id, phone_number: user.phone_number, role_id: user.role_id }, { expiresIn: process.env.JWT_EXPIRES_IN || '1d' });
    return reply.send({
        success: true,
        message: 'Telegram login successful.',
        token,
        user: {
            id: user.id,
            phone_number: user.phone_number,
            role_id: user.role_id,
            first_name: user.first_name,
        },
    });
}
/**
 * GET /api/auth/me
 * Protected route — returns the logged-in user's full profile.
 * The JWT middleware runs BEFORE this handler and populates request.user.
 */
export async function meHandler(request, reply) {
    // request.user is populated by @fastify/jwt after the authenticate hook runs
    const userId = request.user.id;
    const user = await findUserById(request.server.db, userId);
    if (!user) {
        return reply.status(404).send({ success: false, message: 'User not found.' });
    }
    // Return profile without the password hash
    const { password_hash, ...profile } = user;
    return reply.send({ success: true, user: profile });
}
/**
 * POST /api/auth/change-password
 * Authenticated: change current password to a new one
 */
export async function changePasswordHandler(request, reply) {
    const userId = request.user.id;
    const { current_password, new_password } = request.body;
    const user = await findUserById(request.server.db, userId);
    if (!user)
        return reply.status(404).send({ success: false, message: 'User not found.' });
    if (!user.password_hash)
        return reply.status(400).send({ success: false, message: 'No password set on this account.' });
    const match = await bcrypt.compare(current_password, user.password_hash);
    if (!match)
        return reply.status(401).send({ success: false, message: 'Current password is incorrect.' });
    const newHash = await bcrypt.hash(new_password, 12);
    await updateUserPassword(request.server.db, userId, newHash);
    return reply.send({ success: true, message: 'Password updated successfully.' });
}
/**
 * POST /api/auth/request-email-link
 * Authenticated: request to link or change email — sends a verification link
 */
export async function requestEmailLinkHandler(request, reply) {
    const userId = request.user.id;
    const { email } = request.body;
    // Check email not used by another user
    const existing = await request.server.db.query('SELECT id FROM users WHERE email = ? LIMIT 1', [email]);
    const rows = existing[0];
    if (rows.length > 0) {
        return reply.status(409).send({ success: false, message: 'Email already in use.' });
    }
    const token = crypto.randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ');
    await createEmailVerification(request.server.db, userId, email, token, expiresAt);
    try {
        await sendVerificationEmail(email, token);
    }
    catch (err) {
        request.server.log.error({ err }, 'Failed to send verification email');
        return reply.status(500).send({ success: false, message: 'Failed to send verification email.' });
    }
    return reply.send({ success: true, message: 'Verification email sent.' });
}
/**
 * GET /api/auth/verify-email?token=...
 * Public: verifies token and updates user's email
 */
export async function verifyEmailHandler(request, reply) {
    const { token } = request.query;
    if (!token)
        return reply.status(400).send({ success: false, message: 'Missing token.' });
    const record = await findEmailVerificationByToken(request.server.db, token);
    if (!record)
        return reply.status(404).send({ success: false, message: 'Invalid or expired token.' });
    if (record.used)
        return reply.status(400).send({ success: false, message: 'Token already used.' });
    if (new Date(record.expires_at) < new Date())
        return reply.status(400).send({ success: false, message: 'Token expired.' });
    await updateUserEmail(request.server.db, record.user_id, record.new_email);
    await markEmailVerificationUsed(request.server.db, record.id);
    return reply.send({ success: true, message: 'Email verified and linked to your account.' });
}
/**
 * POST /api/auth/request-phone-change
 * Authenticated: request OTP to new phone number
 */
export async function requestPhoneChangeHandler(request, reply) {
    const userId = request.user.id;
    const { new_phone } = request.body;
    // Ensure not used by another user
    const [rows] = await request.server.db.query('SELECT id FROM users WHERE phone_number = ? LIMIT 1', [new_phone]);
    if (rows.length > 0)
        return reply.status(409).send({ success: false, message: 'Phone already in use.' });
    // Generate OTP and send to new phone
    try {
        await generateAndSendOtp(new_phone);
    }
    catch (err) {
        request.server.log.error({ err }, 'Failed to send OTP for phone change');
        return reply.status(503).send({ success: false, message: 'Unable to send OTP at this time. Please try again later.' });
    }
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ');
    await createPhoneChangeRequest(request.server.db, userId, new_phone, expiresAt);
    return reply.send({ success: true, message: 'OTP sent to new phone. Verify to complete change.' });
}
/**
 * POST /api/auth/verify-phone-change
 * Authenticated: verify OTP sent to new phone and update user's phone
 */
export async function verifyPhoneChangeHandler(request, reply) {
    const userId = request.user.id;
    const { new_phone, otp } = request.body;
    // Check there is a pending request
    const reqRecord = await findPhoneChangeRequest(request.server.db, userId, new_phone);
    if (!reqRecord)
        return reply.status(400).send({ success: false, message: 'No pending phone change request.' });
    if (new Date(reqRecord.expires_at) < new Date())
        return reply.status(400).send({ success: false, message: 'Request expired.' });
    // Verify OTP for that phone
    const isValid = verifyOtp(new_phone, otp);
    if (!isValid)
        return reply.status(400).send({ success: false, message: 'Invalid or expired OTP.' });
    // Update user phone
    await updateUserPhone(request.server.db, userId, new_phone);
    await deletePhoneChangeRequest(request.server.db, reqRecord.id);
    return reply.send({ success: true, message: 'Phone number updated.' });
}
/**
 * PUT /api/auth/profile
 * Authenticated: update first/last name, and optionally upload profile photo
 */
export async function updateProfileHandler(request, reply) {
    const userId = request.user.id;
    // Accept base64 image or plain fields
    const firstName = request.body.first_name;
    const lastName = request.body.last_name;
    const photoBase64 = request.body.profile_photo_base64;
    const filenameHint = request.body.profile_photo_filename;
    let photoUrl;
    if (photoBase64) {
        // photoBase64 is expected to be data URL or raw base64. Support both.
        const matches = photoBase64.match(/^data:(image\/[^;]+);base64,(.+)$/);
        let ext = '.jpg';
        let b64data = photoBase64;
        if (matches) {
            const mime = matches[1];
            b64data = matches[2];
            if (mime === 'image/png')
                ext = '.png';
            else if (mime === 'image/webp')
                ext = '.webp';
            else if (mime === 'image/jpeg')
                ext = '.jpg';
        }
        else if (filenameHint) {
            ext = path.extname(filenameHint) || '.jpg';
        }
        const filename = `${uuidv4()}${ext}`;
        const dest = path.join(process.cwd(), 'uploads', filename);
        const buffer = Buffer.from(b64data, 'base64');
        fs.writeFileSync(dest, buffer);
        const apiBase = (process.env.API_BASE_URL || 'https://africa-logistics-api.lula.com.et').replace(/\/$/, '');
        photoUrl = `${apiBase}/uploads/${filename}`;
    }
    await updateUserProfile(request.server.db, userId, { firstName, lastName, profilePhotoUrl: photoUrl });
    return reply.send({ success: true, message: 'Profile updated.' });
}
/**
 * DELETE /api/auth/profile/photo
 * Authenticated: remove profile photo
 */
export async function deleteProfilePhotoHandler(request, reply) {
    const userId = request.user.id;
    const user = await findUserById(request.server.db, userId);
    if (!user)
        return reply.status(404).send({ success: false, message: 'User not found.' });
    if (user.profile_photo_url) {
        // Remove file from disk if present
        try {
            const url = new URL(user.profile_photo_url);
            const filename = path.basename(url.pathname);
            const dest = path.join(process.cwd(), 'uploads', filename);
            if (fs.existsSync(dest))
                fs.unlinkSync(dest);
        }
        catch (err) {
            // ignore
        }
        await updateUserProfile(request.server.db, userId, { profilePhotoUrl: null });
    }
    return reply.send({ success: true, message: 'Profile photo removed.' });
}
/**
 * POST /api/auth/login-email
 * Email + password login — email must be verified (is_email_verified = 1).
 */
export async function loginEmailHandler(request, reply) {
    const { email, password } = request.body;
    const [rows] = await request.server.db.query(`SELECT u.*, r.role_name AS role_name
       FROM users u
       JOIN roles r ON r.id = u.role_id
      WHERE u.email = ? AND u.is_email_verified = 1
      LIMIT 1`, [email]);
    const user = rows[0];
    if (!user) {
        return reply.status(401).send({ success: false, message: 'Email not found or not yet verified.' });
    }
    if (!user.is_active) {
        return reply.status(403).send({ success: false, message: 'Your account has been suspended.' });
    }
    if (!user.password_hash) {
        return reply.status(401).send({ success: false, message: 'This account uses Telegram login. No password set.' });
    }
    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
        return reply.status(401).send({ success: false, message: 'Invalid credentials.' });
    }
    const token = request.server.jwt.sign({ id: user.id, phone_number: user.phone_number, role_id: user.role_id }, { expiresIn: process.env.JWT_EXPIRES_IN || '1d' });
    return reply.send({
        success: true,
        message: 'Login successful.',
        token,
        user: {
            id: user.id,
            phone_number: user.phone_number,
            role_id: user.role_id,
            role_name: user.role_name,
            first_name: user.first_name,
            last_name: user.last_name,
        },
    });
}
/**
 * POST /api/auth/forgot-password-email
 * Request a password reset link sent to a verified email.
 */
export async function forgotPasswordEmailHandler(request, reply) {
    const { email } = request.body;
    const [rows] = await request.server.db.query('SELECT id, email FROM users WHERE email = ? AND is_email_verified = 1 LIMIT 1', [email]);
    // Always return success to avoid leaking whether email is registered
    if (!rows[0]) {
        return reply.send({ success: true, message: 'If that email is registered and verified, a reset link has been sent.' });
    }
    const user = rows[0];
    // Use a short-lived JWT as the reset token (no extra DB column needed)
    const resetToken = request.server.jwt.sign({ id: user.id, purpose: 'email-password-reset' }, { expiresIn: '1h' });
    const frontendBase = (process.env.FRONTEND_BASE_URL || process.env.FRONTEND_URL?.split(',')[0] || 'https://africa-logistics.lula.com.et').replace(/\/$/, '');
    const resetUrl = `${frontendBase}/forgot-password?email_reset_token=${encodeURIComponent(resetToken)}`;
    try {
        await sendPasswordResetEmail(email, resetUrl);
    }
    catch (err) {
        request.server.log.error({ err }, 'Failed to send password reset email');
        return reply.status(500).send({ success: false, message: 'Failed to send reset email.' });
    }
    return reply.send({ success: true, message: 'If that email is registered and verified, a reset link has been sent.' });
}
/**
 * POST /api/auth/forgot-password/request-otp
 * Public: send an OTP to the user's registered phone for password reset.
 */
export async function forgotPasswordRequestOtpHandler(request, reply) {
    const { phone_number } = request.body;
    const user = await findUserByPhone(request.server.db, phone_number);
    if (!user) {
        // Don't reveal whether the number is registered
        return reply.send({ success: true, message: 'If that number is registered, an OTP has been sent.' });
    }
    try {
        await generateAndSendOtp(phone_number);
    }
    catch (err) {
        request.server.log.error({ err }, 'Failed to send forgot-password OTP');
        return reply.status(503).send({ success: false, message: 'Unable to send OTP at this time. Please try again later.' });
    }
    return reply.send({ success: true, message: 'OTP sent. It expires in 10 minutes.' });
}
/**
 * POST /api/auth/forgot-password/reset
 * Public: verify OTP and set a new password.
 */
export async function forgotPasswordResetHandler(request, reply) {
    const { phone_number, otp, new_password } = request.body;
    const isValid = verifyOtp(phone_number, otp);
    if (!isValid) {
        return reply.status(400).send({ success: false, message: 'Invalid or expired OTP.' });
    }
    const user = await findUserByPhone(request.server.db, phone_number);
    if (!user) {
        return reply.status(404).send({ success: false, message: 'User not found.' });
    }
    const newHash = await bcrypt.hash(new_password, 12);
    await updateUserPassword(request.server.db, user.id, newHash);
    return reply.send({ success: true, message: 'Password updated successfully.' });
}
/**
 * POST /api/auth/reset-password-email
 * Validate the JWT reset token and update the password.
 */
export async function resetPasswordEmailHandler(request, reply) {
    const { token, new_password } = request.body;
    let payload;
    try {
        payload = request.server.jwt.verify(token);
    }
    catch {
        return reply.status(400).send({ success: false, message: 'Reset link is invalid or has expired.' });
    }
    if (payload?.purpose !== 'email-password-reset') {
        return reply.status(400).send({ success: false, message: 'Invalid reset token.' });
    }
    const user = await findUserById(request.server.db, payload.id);
    if (!user)
        return reply.status(404).send({ success: false, message: 'User not found.' });
    const newHash = await bcrypt.hash(new_password, 12);
    await updateUserPassword(request.server.db, payload.id, newHash);
    return reply.send({ success: true, message: 'Password updated successfully.' });
}
