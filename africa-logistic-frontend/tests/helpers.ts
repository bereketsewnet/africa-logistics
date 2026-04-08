import { Page } from '@playwright/test'

/**
 * Log in as admin using email mode.
 * Waits until the admin dashboard header is visible.
 */
export async function loginAsAdmin(page: Page) {
  await page.goto('/login')
  // Switch to email mode
  await page.getByRole('button', { name: /email/i }).click()
  await page.locator('#login-email').fill('admin@gmail.com')
  await page.locator('input[type="password"]:not([style*="display: none"])').last().fill('Admin1234')
  await page.getByRole('button', { name: /sign in|log in/i }).click()
  await page.waitForURL('**/admin', { timeout: 15_000 })
}

/**
 * Log in as a regular user (driver/shipper) using email mode.
 */
export async function loginAsUser(page: Page, email: string, password: string) {
  await page.goto('/login')
  await page.getByRole('button', { name: /email/i }).click()
  await page.locator('#login-email').fill(email)
  await page.locator('input[type="password"]:not([style*="display: none"])').last().fill(password)
  await page.getByRole('button', { name: /sign in|log in/i }).click()
  await page.waitForURL('**/dashboard', { timeout: 15_000 })
}

/**
 * Navigate to a specific tab on the user dashboard.
 * Tab names match the button labels: 'Profile' | 'Security' | 'Contact' | 'Preferences' | 'Documents'
 */
export async function goToDashboardTab(page: Page, tabName: string) {
  await page.getByRole('button', { name: new RegExp(`^${tabName}$`, 'i') }).click()
  await page.waitForTimeout(400)
}

/**
 * Navigate to a sidebar section on the admin dashboard.
 */
export async function goToAdminSection(page: Page, sectionLabel: string) {
  await page.getByRole('button', { name: new RegExp(sectionLabel, 'i') }).first().click()
  await page.waitForTimeout(400)
}
