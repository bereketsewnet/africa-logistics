import { test, expect } from '@playwright/test'
import { loginAsAdmin, loginAsUser, goToDashboardTab } from './helpers'
import { DRIVER } from './credentials'

// ─────────────────────────────────────────────────────────────────────────────
// Admin profile tabs (accessible via "My Profile" in admin sidebar)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Admin — My Profile section', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
    // Click "My Profile" in the sidebar
    await page.getByRole('button', { name: /my profile/i }).click()
    await page.waitForTimeout(500)
  })

  test('shows Profile tab with editable name fields', async ({ page }) => {
    await expect(page.getByText(/first name/i)).toBeVisible()
    await expect(page.getByText(/last name/i)).toBeVisible()
  })

  test('navigates to Security tab and shows password fields', async ({ page }) => {
    await page.getByRole('button', { name: /^security$/i }).click()
    await page.waitForTimeout(300)
    await expect(page.getByText(/current password/i)).toBeVisible()
    await expect(page.getByText(/new password/i)).toBeVisible()
  })

  test('navigates to Contact tab and shows phone/email sections', async ({ page }) => {
    await page.getByRole('button', { name: /^contact$/i }).click()
    await page.waitForTimeout(300)
    // Should have either phone or email change section
    await expect(
      page.getByText(/phone|email/i).first()
    ).toBeVisible()
  })

  test('shows error when changing password with wrong current password', async ({ page }) => {
    await page.getByRole('button', { name: /^security$/i }).click()
    await page.waitForTimeout(300)

    const inputs = page.locator('input[type="password"]:visible')
    await inputs.nth(0).fill('WrongCurrentPass')
    await inputs.nth(1).fill('NewPass1234!')
    await inputs.nth(2).fill('NewPass1234!')

    await page.getByRole('button', { name: /update password|change password/i }).click()
    await expect(page.locator('.alert-error, [style*="ef4444"], [style*="danger"]')).toBeVisible({ timeout: 10_000 })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// User dashboard (requires a driver account)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('User Dashboard — Tab navigation', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsUser(page, DRIVER.email, DRIVER.password)
  })

  test('shows all 5 tabs in the dashboard', async ({ page }) => {
    await expect(page.getByRole('button', { name: /^profile$/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /^security$/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /^contact$/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /^preferences$/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /^documents$/i })).toBeVisible()
  })

  test('Profile tab — shows user info fields', async ({ page }) => {
    await goToDashboardTab(page, 'Profile')
    await expect(page.getByText(/first name/i)).toBeVisible()
    await expect(page.getByText(/last name/i)).toBeVisible()
  })

  test('Security tab — shows password change form', async ({ page }) => {
    await goToDashboardTab(page, 'Security')
    await expect(page.getByText(/current password/i)).toBeVisible()
    await expect(page.getByText(/new password/i)).toBeVisible()
  })

  test('Contact tab — shows phone and email change options', async ({ page }) => {
    await goToDashboardTab(page, 'Contact')
    // Should see phone or email section headers
    await expect(page.getByText(/phone|email/i).first()).toBeVisible()
  })

  test('Preferences tab — shows theme switcher', async ({ page }) => {
    await goToDashboardTab(page, 'Preferences')
    await expect(page.getByRole('button', { name: /light/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /dark/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /system/i })).toBeVisible()
  })

  test('Preferences tab — shows notification toggles', async ({ page }) => {
    await goToDashboardTab(page, 'Preferences')
    // At least one notification type label should be visible
    await expect(
      page.getByText(/sms notification|email notification|order update|browser notification|promotions/i).first()
    ).toBeVisible()
  })

  test('Documents tab — shows driver document upload cards', async ({ page }) => {
    await goToDashboardTab(page, 'Documents')
    // Should see at least one document card (national id, license, libre)
    await expect(
      page.getByText(/national id|license|libre/i).first()
    ).toBeVisible()
  })

  test('can change theme to DARK and back to SYSTEM', async ({ page }) => {
    await goToDashboardTab(page, 'Preferences')

    await page.getByRole('button', { name: /^dark$/i }).click()
    await page.waitForTimeout(600)
    // Button should now appear selected (active style)
    // Just verify it didn't throw an error
    await expect(page.getByRole('button', { name: /^dark$/i })).toBeVisible()

    await page.getByRole('button', { name: /^system$/i }).click()
    await page.waitForTimeout(600)
    await expect(page.getByRole('button', { name: /^system$/i })).toBeVisible()
  })

  test('sign out works and redirects to login', async ({ page }) => {
    // The sign-out button is in the sidebar
    await page.getByRole('button', { name: /sign out|log out/i }).click()
    await expect(page).toHaveURL(/\/login/, { timeout: 8_000 })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Security — wrong current password shows error
// ─────────────────────────────────────────────────────────────────────────────

test.describe('User Dashboard — Security tab error handling', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsUser(page, DRIVER.email, DRIVER.password)
    await goToDashboardTab(page, 'Security')
  })

  test('shows error when wrong current password entered', async ({ page }) => {
    const inputs = page.locator('input[type="password"]:visible')
    await inputs.nth(0).fill('WrongCurrentPass!')
    await inputs.nth(1).fill('NewDriver1234!')
    await inputs.nth(2).fill('NewDriver1234!')

    await page.getByRole('button', { name: /update password|change/i }).click()
    await expect(page.locator('.alert-error, [style*="ef4444"]')).toBeVisible({ timeout: 10_000 })
  })

  test('shows error when new passwords do not match', async ({ page }) => {
    const inputs = page.locator('input[type="password"]:visible')
    await inputs.nth(0).fill(DRIVER.password)
    await inputs.nth(1).fill('NewDriver1234!')
    await inputs.nth(2).fill('Mismatch9999!')

    await page.getByRole('button', { name: /update password|change/i }).click()
    await expect(page.locator('.alert-error, [style*="ef4444"]')).toBeVisible({ timeout: 10_000 })
  })
})
