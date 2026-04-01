/**
 * normalisePhone
 *
 * Accepts anything a user might type and returns a clean E.164 string
 * so the backend always receives e.g. "+251965500639".
 *
 * Rules:
 *  - Already E.164 (starts with +)  → pass through
 *  - Starts with "00"               → replace "00" with "+"
 *  - Starts with "0" and looks like an Ethiopian local number (9 digits after 0) → +251 + rest
 *  - Bare digits without leading 0  → assume Ethiopian local, prepend +251
 *  - react-phone-number-input value → already E.164, pass through
 */
export function normalisePhone(raw: string): string {
  const s = raw.trim().replace(/[\s\-().]/g, '')
  if (!s) return ''
  if (s.startsWith('+'))  return s
  if (s.startsWith('00')) return '+' + s.slice(2)
  // Local Ethiopian number: starts with 0 followed by 9 digits (total 10)
  if (s.startsWith('0') && s.length === 10) return '+251' + s.slice(1)
  // Bare 9-digit number (no leading 0, no country code) → assume ET
  if (/^\d{9}$/.test(s)) return '+251' + s
  // Fallback – return as-is (react-phone-number-input already gives E.164)
  return s
}
