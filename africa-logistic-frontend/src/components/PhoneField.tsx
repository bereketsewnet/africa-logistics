/**
 * PhoneField — country-picker + flag input
 *
 * Wraps `react-phone-number-input` and normalises the raw value so:
 *   "0965500639"  → "+251965500639"  (leading 0 stripped, country code prepended)
 *   "965500639"   → "+251965500639"
 *   "+251965500639" stays as-is
 *
 * The `onChange` callback always receives a fully-qualified E.164 string or ''.
 */

import PhoneInput from 'react-phone-number-input'
import 'react-phone-number-input/style.css'
import type { Value as PhoneValue } from 'react-phone-number-input'

interface Props {
  value: string
  onChange: (v: string) => void
  id?: string
}

export default function PhoneField({ value, onChange, id = 'phone-field' }: Props) {
  return (
    <div className="phone-field-wrap">
      <PhoneInput
        id={id}
        international
        defaultCountry="ET"
        value={value as PhoneValue}
        onChange={(v) => onChange(v ?? '')}
        placeholder="965 500 639"
        smartCaret
      />
    </div>
  )
}
