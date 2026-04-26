import { test, expect } from '@playwright/test'
import { loginAsAdmin } from './helpers'

// ─────────────────────────────────────────────────────────────────────────────
// Login page
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Login page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login')
  })

  test('shows login page with phone and email mode buttons', async ({ page }) => {
    await expect(page.getByRole('button', { name: /phone/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /email/i })).toBeVisible()
    await expect(page.getByAltText(/Afri logistics/i)).toBeVisible()
  })

  test('switches between phone and email mode', async ({ page }) => {
    // Default is phone mode — email input should not be visible
    await expect(page.locator('#login-email')).not.toBeVisible()

    // Switch to email mode
    await page.getByRole('button', { name: /^email$/i }).click()
    await expect(page.locator('#login-email')).toBeVisible()

    // Switch back to phone mode
    await page.getByRole('button', { name: /^phone$/i }).click()
    await expect(page.locator('#login-email')).not.toBeVisible()
  })

  test('shows error on wrong email credentials', async ({ page }) => {
    await page.getByRole('button', { name: /^email$/i }).click()
    await page.locator('#login-email').fill('wrong@email.com')
    await page.locator('input[type="password"]:not([style*="display: none"])').last().fill('wrongpassword')
    await page.getByRole('button', { name: /sign in|log in/i }).click()

    await expect(page.locator('.alert-error')).toBeVisible({ timeout: 10_000 })
  })

  test('shows error on wrong password for valid email', async ({ page }) => {
    await page.getByRole('button', { name: /^email$/i }).click()
    await page.locator('#login-email').fill('admin@gmail.com')
    await page.locator('input[type="password"]:not([style*="display: none"])').last().fill('WrongPass999')
    await page.getByRole('button', { name: /sign in|log in/i }).click()

    await expect(page.locator('.alert-error')).toBeVisible({ timeout: 10_000 })
  })

  test('admin logs in and lands on /admin', async ({ page }) => {
    await loginAsAdmin(page)
    await expect(page).toHaveURL(/\/admin$/)
    // Admin badge in sidebar
    await expect(page.getByText(/admin panel/i)).toBeVisible()
  })

  test('has link to register page', async ({ page }) => {
    await page.getByRole('link', { name: /create account|register|sign up/i }).click()
    await expect(page).toHaveURL(/\/register/)
  })

  test('has link to forgot password page', async ({ page }) => {
    await page.getByRole('link', { name: /forgot/i }).click()
    await expect(page).toHaveURL(/\/forgot-password/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Register page
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Register page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/register')
  })

  test('shows the register form', async ({ page }) => {
    // Role selection buttons (Driver / Shipper)
    await expect(page.getByRole('button', { name: /driver/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /shipper/i })).toBeVisible()
  })

  test('shows validation error for empty submit', async ({ page }) => {
    // Try to advance without filling anything
    await page.getByRole('button', { name: /next|continue|send otp/i }).first().click()
    // Should either stay on register or show an error — not navigate away
    await expect(page).toHaveURL(/\/register/)
  })

  test('shows password strength indicator as you type', async ({ page }) => {
    const pwInput = page.locator('input#pw, input[placeholder*="password" i]').first()
    if (await pwInput.isVisible()) {
      await pwInput.fill('weak')
      await expect(page.getByText(/weak|too short|fair|good|strong/i)).toBeVisible()
      await pwInput.fill('StrongPass123!')
      await expect(page.getByText(/strong/i)).toBeVisible()
    }
  })

  test('has link back to login', async ({ page }) => {
    await page.getByRole('link', { name: /sign in|log in|already have/i }).click()
    await expect(page).toHaveURL(/\/login/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Forgot Password page
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Forgot Password page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/forgot-password')
  })

  test('shows the forgot password form', async ({ page }) => {
    // Should have a mode toggle (phone/email) and a request button
    await expect(page.getByRole('button', { name: /phone|email/i }).first()).toBeVisible()
  })

  test('shows error for unknown email', async ({ page }) => {
    // Switch to email mode if not already
    const emailBtn = page.getByRole('button', { name: /^email$/i })
    if (await emailBtn.isVisible()) await emailBtn.click()

    const emailInput = page.locator('input[type="email"], input[id*="email"]').first()
    await emailInput.fill('nobody@nowhere.com')
    await page.getByRole('button', { name: /send otp|request otp|reset/i }).first().click()

    await expect(page.locator('.alert-error')).toBeVisible({ timeout: 10_000 })
  })

  test('has link back to login', async ({ page }) => {
    await page.getByRole('link', { name: /back to login|sign in/i }).click()
    await expect(page).toHaveURL(/\/login/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Protected routes redirect
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Protected routes', () => {
  test('unauthenticated user is redirected from /dashboard to /login', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/login/, { timeout: 8_000 })
  })

  test('unauthenticated user is redirected from /admin to /login', async ({ page }) => {
    await page.goto('/admin')
    await expect(page).toHaveURL(/\/login/, { timeout: 8_000 })
  })
})
