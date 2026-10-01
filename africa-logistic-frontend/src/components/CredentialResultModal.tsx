import { useState } from 'react'
import { LuCopy, LuCheck, LuTriangleAlert, LuX, LuCircleCheck } from 'react-icons/lu'

/**
 * Shown after creating an account or reissuing a password.
 *
 * It exists because the result used to be a three-second toast, which cannot hold a
 * credential somebody has to read and pass on. When the SMS fails — and with the
 * current provider campaign it always does — the password is the only copy in
 * existence: it is generated server-side, stored as a bcrypt hash, and never
 * recoverable afterwards. A toast that vanished meant the account was unusable and
 * the only remedy was resetting it again.
 */
export interface CredentialResult {
  /** The person or company the account belongs to, for the heading. */
  name: string
  phone_number?: string | null
  /** Present only when the SMS failed; the server omits it on success. */
  password?: string | null
  sms_sent?: boolean
  message?: string
}

export default function CredentialResultModal({ result, onClose }: {
  result: CredentialResult
  onClose: () => void
}) {
  const [copied, setCopied] = useState<'password' | 'both' | null>(null)

  const copy = async (text: string, which: 'password' | 'both') => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(which)
      window.setTimeout(() => setCopied(null), 2000)
    } catch {
      // Clipboard is blocked on insecure origins and in some browsers. The value is
      // on screen and selectable, so this is not worth an error message.
    }
  }

  const smsFailed = result.sms_sent === false && Boolean(result.password)

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
      onClick={onClose}>
      <div className="glass" style={{ borderRadius: 18, padding: '1.5rem', maxWidth: 440, width: '100%', position: 'relative' }}
        onClick={e => e.stopPropagation()}>
        <button onClick={onClose} aria-label="Close"
          style={{ position: 'absolute', top: '0.85rem', right: '0.85rem', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--clr-muted)' }}>
          <LuX size={18} />
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.6rem' }}>
          {smsFailed
            ? <LuTriangleAlert size={18} color="#fbbf24" />
            : <LuCircleCheck size={18} color="var(--kpi-green)" />}
          <h3 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--clr-text)' }}>
            {smsFailed ? 'Give them this password' : 'Login details sent'}
          </h3>
        </div>

        <p style={{ fontSize: '0.82rem', color: 'var(--clr-muted)', lineHeight: 1.55, margin: '0 0 1rem' }}>
          {result.message}
        </p>

        {smsFailed ? (
          <>
            <div className="glass-inner" style={{ padding: '0.9rem 1rem', marginBottom: '0.9rem' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--clr-muted)', marginBottom: '0.2rem' }}>
                Sign in with
              </div>
              <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--clr-text)', marginBottom: '0.7rem' }}>
                {result.phone_number ?? '—'}
              </div>

              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--clr-muted)', marginBottom: '0.2rem' }}>
                Password
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {/* Monospace and selectable: this gets read aloud down a phone line
                    as often as it gets copied, so ambiguous glyphs matter. */}
                <code style={{ flex: 1, fontSize: '1.05rem', fontWeight: 700, letterSpacing: '0.04em', color: 'var(--clr-accent)', background: 'rgba(97,148,31,0.08)', padding: '0.5rem 0.7rem', borderRadius: 8, userSelect: 'all', wordBreak: 'break-all' }}>
                  {result.password}
                </code>
                <button onClick={() => copy(String(result.password), 'password')} title="Copy password"
                  style={{ padding: '0.5rem 0.6rem', borderRadius: 8, border: '1px solid rgba(255,255,255,0.14)', background: 'rgba(255,255,255,0.05)', color: copied === 'password' ? 'var(--kpi-green)' : 'var(--clr-text)', cursor: 'pointer', display: 'flex' }}>
                  {copied === 'password' ? <LuCheck size={15} /> : <LuCopy size={15} />}
                </button>
              </div>
            </div>

            <p style={{ fontSize: '0.76rem', color: 'var(--clr-muted)', lineHeight: 1.5, margin: '0 0 1rem' }}>
              This is the only time the password can be shown — it is stored encrypted and
              cannot be read back. If you lose it, use <strong style={{ color: 'var(--clr-text)' }}>Resend
              login</strong> to issue a new one.
            </p>

            <button
              onClick={() => copy(`Afri Logistics\nPhone: ${result.phone_number ?? ''}\nPassword: ${result.password}`, 'both')}
              style={{ width: '100%', padding: '0.6rem', borderRadius: 10, border: '1px solid rgba(96,165,250,0.35)', background: 'rgba(96,165,250,0.1)', color: '#60a5fa', fontFamily: 'inherit', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer', marginBottom: '0.6rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}>
              {copied === 'both' ? <><LuCheck size={14} /> Copied</> : <><LuCopy size={14} /> Copy phone and password together</>}
            </button>
          </>
        ) : (
          <div className="glass-inner" style={{ padding: '0.85rem 1rem', marginBottom: '0.9rem', fontSize: '0.84rem', color: 'var(--clr-text)' }}>
            Sent by SMS to <strong>{result.phone_number ?? 'their phone'}</strong>.
          </div>
        )}

        <button onClick={onClose} className="btn-primary" style={{ width: '100%', padding: '0.65rem', fontWeight: 800 }}>
          Done
        </button>
      </div>
    </div>
  )
}
