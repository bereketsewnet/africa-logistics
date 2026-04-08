# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: auth.spec.ts >> Login page >> shows error on wrong email credentials
- Location: tests/auth.spec.ts:32:3

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.click: Test timeout of 30000ms exceeded.
Call log:
  - waiting for getByRole('button', { name: /sign in|log in/i })
    - locator resolved to <button type="submit" class="btn-primary">…</button>
  - attempting click action
    - waiting for element to be visible, enabled and stable
    - element is visible, enabled and stable
    - scrolling into view if needed

```

# Test source

```ts
  1   | import { test, expect } from '@playwright/test'
  2   | import { loginAsAdmin } from './helpers'
  3   | 
  4   | // ─────────────────────────────────────────────────────────────────────────────
  5   | // Login page
  6   | // ─────────────────────────────────────────────────────────────────────────────
  7   | 
  8   | test.describe('Login page', () => {
  9   |   test.beforeEach(async ({ page }) => {
  10  |     await page.goto('/login')
  11  |   })
  12  | 
  13  |   test('shows login page with phone and email mode buttons', async ({ page }) => {
  14  |     await expect(page.getByRole('button', { name: /phone/i })).toBeVisible()
  15  |     await expect(page.getByRole('button', { name: /email/i })).toBeVisible()
  16  |     await expect(page.getByAltText(/africa logistics/i)).toBeVisible()
  17  |   })
  18  | 
  19  |   test('switches between phone and email mode', async ({ page }) => {
  20  |     // Default is phone mode — email input should not be visible
  21  |     await expect(page.locator('#login-email')).not.toBeVisible()
  22  | 
  23  |     // Switch to email mode
  24  |     await page.getByRole('button', { name: /^email$/i }).click()
  25  |     await expect(page.locator('#login-email')).toBeVisible()
  26  | 
  27  |     // Switch back to phone mode
  28  |     await page.getByRole('button', { name: /^phone$/i }).click()
  29  |     await expect(page.locator('#login-email')).not.toBeVisible()
  30  |   })
  31  | 
  32  |   test('shows error on wrong email credentials', async ({ page }) => {
  33  |     await page.getByRole('button', { name: /^email$/i }).click()
  34  |     await page.locator('#login-email').fill('wrong@email.com')
  35  |     await page.locator('input[type="password"]:not([style*="display: none"])').last().fill('wrongpassword')
> 36  |     await page.getByRole('button', { name: /sign in|log in/i }).click()
      |                                                                 ^ Error: locator.click: Test timeout of 30000ms exceeded.
  37  | 
  38  |     await expect(page.locator('.alert-error')).toBeVisible({ timeout: 10_000 })
  39  |   })
  40  | 
  41  |   test('shows error on wrong password for valid email', async ({ page }) => {
  42  |     await page.getByRole('button', { name: /^email$/i }).click()
  43  |     await page.locator('#login-email').fill('admin@gmail.com')
  44  |     await page.locator('input[type="password"]:not([style*="display: none"])').last().fill('WrongPass999')
  45  |     await page.getByRole('button', { name: /sign in|log in/i }).click()
  46  | 
  47  |     await expect(page.locator('.alert-error')).toBeVisible({ timeout: 10_000 })
  48  |   })
  49  | 
  50  |   test('admin logs in and lands on /admin', async ({ page }) => {
  51  |     await loginAsAdmin(page)
  52  |     await expect(page).toHaveURL(/\/admin$/)
  53  |     // Admin badge in sidebar
  54  |     await expect(page.getByText(/admin panel/i)).toBeVisible()
  55  |   })
  56  | 
  57  |   test('has link to register page', async ({ page }) => {
  58  |     await page.getByRole('link', { name: /create account|register|sign up/i }).click()
  59  |     await expect(page).toHaveURL(/\/register/)
  60  |   })
  61  | 
  62  |   test('has link to forgot password page', async ({ page }) => {
  63  |     await page.getByRole('link', { name: /forgot/i }).click()
  64  |     await expect(page).toHaveURL(/\/forgot-password/)
  65  |   })
  66  | })
  67  | 
  68  | // ─────────────────────────────────────────────────────────────────────────────
  69  | // Register page
  70  | // ─────────────────────────────────────────────────────────────────────────────
  71  | 
  72  | test.describe('Register page', () => {
  73  |   test.beforeEach(async ({ page }) => {
  74  |     await page.goto('/register')
  75  |   })
  76  | 
  77  |   test('shows the register form', async ({ page }) => {
  78  |     // Role selection buttons (Driver / Shipper)
  79  |     await expect(page.getByRole('button', { name: /driver/i })).toBeVisible()
  80  |     await expect(page.getByRole('button', { name: /shipper/i })).toBeVisible()
  81  |   })
  82  | 
  83  |   test('shows validation error for empty submit', async ({ page }) => {
  84  |     // Try to advance without filling anything
  85  |     await page.getByRole('button', { name: /next|continue|send otp/i }).first().click()
  86  |     // Should either stay on register or show an error — not navigate away
  87  |     await expect(page).toHaveURL(/\/register/)
  88  |   })
  89  | 
  90  |   test('shows password strength indicator as you type', async ({ page }) => {
  91  |     const pwInput = page.locator('input#pw, input[placeholder*="password" i]').first()
  92  |     if (await pwInput.isVisible()) {
  93  |       await pwInput.fill('weak')
  94  |       await expect(page.getByText(/weak|too short|fair|good|strong/i)).toBeVisible()
  95  |       await pwInput.fill('StrongPass123!')
  96  |       await expect(page.getByText(/strong/i)).toBeVisible()
  97  |     }
  98  |   })
  99  | 
  100 |   test('has link back to login', async ({ page }) => {
  101 |     await page.getByRole('link', { name: /sign in|log in|already have/i }).click()
  102 |     await expect(page).toHaveURL(/\/login/)
  103 |   })
  104 | })
  105 | 
  106 | // ─────────────────────────────────────────────────────────────────────────────
  107 | // Forgot Password page
  108 | // ─────────────────────────────────────────────────────────────────────────────
  109 | 
  110 | test.describe('Forgot Password page', () => {
  111 |   test.beforeEach(async ({ page }) => {
  112 |     await page.goto('/forgot-password')
  113 |   })
  114 | 
  115 |   test('shows the forgot password form', async ({ page }) => {
  116 |     // Should have a mode toggle (phone/email) and a request button
  117 |     await expect(page.getByRole('button', { name: /phone|email/i }).first()).toBeVisible()
  118 |   })
  119 | 
  120 |   test('shows error for unknown email', async ({ page }) => {
  121 |     // Switch to email mode if not already
  122 |     const emailBtn = page.getByRole('button', { name: /^email$/i })
  123 |     if (await emailBtn.isVisible()) await emailBtn.click()
  124 | 
  125 |     const emailInput = page.locator('input[type="email"], input[id*="email"]').first()
  126 |     await emailInput.fill('nobody@nowhere.com')
  127 |     await page.getByRole('button', { name: /send otp|request otp|reset/i }).first().click()
  128 | 
  129 |     await expect(page.locator('.alert-error')).toBeVisible({ timeout: 10_000 })
  130 |   })
  131 | 
  132 |   test('has link back to login', async ({ page }) => {
  133 |     await page.getByRole('link', { name: /back to login|sign in/i }).click()
  134 |     await expect(page).toHaveURL(/\/login/)
  135 |   })
  136 | })
```