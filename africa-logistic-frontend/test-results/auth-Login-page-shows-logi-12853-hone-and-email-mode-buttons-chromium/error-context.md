# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: auth.spec.ts >> Login page >> shows login page with phone and email mode buttons
- Location: tests/auth.spec.ts:13:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('button', { name: /phone/i })
Expected: visible
Error: strict mode violation: getByRole('button', { name: /phone/i }) resolved to 2 elements:
    1) <button type="button">…</button> aka getByRole('button', { name: 'Phone', exact: true })
    2) <button type="button">…</button> aka getByRole('button', { name: 'Demo account (click to fill)' })

Call log:
  - Expect "toBeVisible" with timeout 10000ms
  - waiting for getByRole('button', { name: /phone/i })

```

# Page snapshot

```yaml
- generic [ref=e5]:
  - generic [ref=e6]:
    - img "Africa Logistics" [ref=e7]
    - paragraph [ref=e8]: Sign in to your account
  - generic [ref=e9]:
    - button "Phone" [ref=e10] [cursor=pointer]:
      - img [ref=e11]
      - text: Phone
    - button "Email" [ref=e13] [cursor=pointer]:
      - img [ref=e14]
      - text: Email
  - generic [ref=e17]:
    - generic [ref=e18]:
      - generic [ref=e19]: Phone number
      - generic [ref=e21]:
        - generic [ref=e22] [cursor=pointer]:
          - combobox "Phone number country" [ref=e23]:
            - option "International"
            - option "Afghanistan"
            - option "Åland Islands"
            - option "Albania"
            - option "Algeria"
            - option "American Samoa"
            - option "Andorra"
            - option "Angola"
            - option "Anguilla"
            - option "Antigua and Barbuda"
            - option "Argentina"
            - option "Armenia"
            - option "Aruba"
            - option "Ascension Island"
            - option "Australia"
            - option "Austria"
            - option "Azerbaijan"
            - option "Bahamas"
            - option "Bahrain"
            - option "Bangladesh"
            - option "Barbados"
            - option "Belarus"
            - option "Belgium"
            - option "Belize"
            - option "Benin"
            - option "Bermuda"
            - option "Bhutan"
            - option "Bolivia"
            - option "Bonaire, Sint Eustatius and Saba"
            - option "Bosnia and Herzegovina"
            - option "Botswana"
            - option "Brazil"
            - option "British Indian Ocean Territory"
            - option "Brunei Darussalam"
            - option "Bulgaria"
            - option "Burkina Faso"
            - option "Burundi"
            - option "Cambodia"
            - option "Cameroon"
            - option "Canada"
            - option "Cape Verde"
            - option "Cayman Islands"
            - option "Central African Republic"
            - option "Chad"
            - option "Chile"
            - option "China"
            - option "Christmas Island"
            - option "Cocos (Keeling) Islands"
            - option "Colombia"
            - option "Comoros"
            - option "Congo"
            - option "Congo, Democratic Republic of the"
            - option "Cook Islands"
            - option "Costa Rica"
            - option "Cote d'Ivoire"
            - option "Croatia"
            - option "Cuba"
            - option "Curaçao"
            - option "Cyprus"
            - option "Czech Republic"
            - option "Denmark"
            - option "Djibouti"
            - option "Dominica"
            - option "Dominican Republic"
            - option "Ecuador"
            - option "Egypt"
            - option "El Salvador"
            - option "Equatorial Guinea"
            - option "Eritrea"
            - option "Estonia"
            - option "Ethiopia" [selected]
            - option "Falkland Islands"
            - option "Faroe Islands"
            - option "Federated States of Micronesia"
            - option "Fiji"
            - option "Finland"
            - option "France"
            - option "French Guiana"
            - option "French Polynesia"
            - option "Gabon"
            - option "Gambia"
            - option "Georgia"
            - option "Germany"
            - option "Ghana"
            - option "Gibraltar"
            - option "Greece"
            - option "Greenland"
            - option "Grenada"
            - option "Guadeloupe"
            - option "Guam"
            - option "Guatemala"
            - option "Guernsey"
            - option "Guinea"
            - option "Guinea-Bissau"
            - option "Guyana"
            - option "Haiti"
            - option "Holy See (Vatican City State)"
            - option "Honduras"
            - option "Hong Kong"
            - option "Hungary"
            - option "Iceland"
            - option "India"
            - option "Indonesia"
            - option "Iran"
            - option "Iraq"
            - option "Ireland"
            - option "Isle of Man"
            - option "Israel"
            - option "Italy"
            - option "Jamaica"
            - option "Japan"
            - option "Jersey"
            - option "Jordan"
            - option "Kazakhstan"
            - option "Kenya"
            - option "Kiribati"
            - option "Kosovo"
            - option "Kuwait"
            - option "Kyrgyzstan"
            - option "Laos"
            - option "Latvia"
            - option "Lebanon"
            - option "Lesotho"
            - option "Liberia"
            - option "Libya"
            - option "Liechtenstein"
            - option "Lithuania"
            - option "Luxembourg"
            - option "Macao"
            - option "Madagascar"
            - option "Malawi"
            - option "Malaysia"
            - option "Maldives"
            - option "Mali"
            - option "Malta"
            - option "Marshall Islands"
            - option "Martinique"
            - option "Mauritania"
            - option "Mauritius"
            - option "Mayotte"
            - option "Mexico"
            - option "Moldova"
            - option "Monaco"
            - option "Mongolia"
            - option "Montenegro"
            - option "Montserrat"
            - option "Morocco"
            - option "Mozambique"
            - option "Myanmar"
            - option "Namibia"
            - option "Nauru"
            - option "Nepal"
            - option "Netherlands"
            - option "New Caledonia"
            - option "New Zealand"
            - option "Nicaragua"
            - option "Niger"
            - option "Nigeria"
            - option "Niue"
            - option "Norfolk Island"
            - option "North Korea"
            - option "North Macedonia"
            - option "Northern Mariana Islands"
            - option "Norway"
            - option "Oman"
            - option "Pakistan"
            - option "Palau"
            - option "Palestine"
            - option "Panama"
            - option "Papua New Guinea"
            - option "Paraguay"
            - option "Peru"
            - option "Philippines"
            - option "Poland"
            - option "Portugal"
            - option "Puerto Rico"
            - option "Qatar"
            - option "Reunion"
            - option "Romania"
            - option "Russia"
            - option "Rwanda"
            - option "Saint Barthélemy"
            - option "Saint Helena"
            - option "Saint Kitts and Nevis"
            - option "Saint Lucia"
            - option "Saint Martin (French Part)"
            - option "Saint Pierre and Miquelon"
            - option "Saint Vincent and the Grenadines"
            - option "Samoa"
            - option "San Marino"
            - option "Sao Tome and Principe"
            - option "Saudi Arabia"
            - option "Senegal"
            - option "Serbia"
            - option "Seychelles"
            - option "Sierra Leone"
            - option "Singapore"
            - option "Sint Maarten"
            - option "Slovakia"
            - option "Slovenia"
            - option "Solomon Islands"
            - option "Somalia"
            - option "South Africa"
            - option "South Korea"
            - option "South Sudan"
            - option "Spain"
            - option "Sri Lanka"
            - option "Sudan"
            - option "Suriname"
            - option "Svalbard and Jan Mayen"
            - option "Swaziland"
            - option "Sweden"
            - option "Switzerland"
            - option "Syria"
            - option "Taiwan"
            - option "Tajikistan"
            - option "Tanzania"
            - option "Thailand"
            - option "Timor-Leste"
            - option "Togo"
            - option "Tokelau"
            - option "Tonga"
            - option "Trinidad and Tobago"
            - option "Tristan da Cunha"
            - option "Tunisia"
            - option "Turkey"
            - option "Turkmenistan"
            - option "Turks and Caicos Islands"
            - option "Tuvalu"
            - option "Uganda"
            - option "Ukraine"
            - option "United Arab Emirates"
            - option "United Kingdom"
            - option "United States"
            - option "Uruguay"
            - option "Uzbekistan"
            - option "Vanuatu"
            - option "Venezuela"
            - option "Vietnam"
            - option "Virgin Islands, British"
            - option "Virgin Islands, U.S."
            - option "Wallis and Futuna"
            - option "Western Sahara"
            - option "Yemen"
            - option "Zambia"
            - option "Zimbabwe"
          - img [ref=e25]
        - textbox "965 500 639" [ref=e27]: "+251"
    - generic [ref=e28]:
      - textbox "Password" [ref=e29]:
        - /placeholder: " "
      - generic: Password
      - button "Toggle password visibility" [ref=e30] [cursor=pointer]:
        - img [ref=e31]
    - link "Forgot password?" [ref=e35] [cursor=pointer]:
      - /url: /forgot-password
    - button "Sign In" [ref=e36] [cursor=pointer]:
      - generic [ref=e37]:
        - img [ref=e38]
        - text: Sign In
  - generic [ref=e41]: or continue with
  - button "Continue with Telegram" [ref=e42] [cursor=pointer]:
    - img [ref=e43]
    - text: Continue with Telegram
  - paragraph [ref=e45]:
    - text: Don't have an account?
    - link "Create one" [ref=e46] [cursor=pointer]:
      - /url: /register
  - 'button "Demo account (click to fill) Phone: +251 911 000 001 Password: Admin1234" [ref=e47] [cursor=pointer]':
    - paragraph [ref=e48]:
      - img [ref=e49]
      - text: Demo account
      - generic [ref=e51]: (click to fill)
    - paragraph [ref=e52]: "Phone: +251 911 000 001"
    - paragraph [ref=e53]: "Password: Admin1234"
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
> 14  |     await expect(page.getByRole('button', { name: /phone/i })).toBeVisible()
      |                                                                ^ Error: expect(locator).toBeVisible() failed
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
  36  |     await page.getByRole('button', { name: /sign in|log in/i }).click()
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
```