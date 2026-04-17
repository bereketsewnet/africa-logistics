/**
 * LanguageToggle component
 *
 * A pill-style toggle button that switches between English and Amharic.
 * Drop anywhere in the UI — it reads/writes via LanguageContext.
 *
 * Props:
 *   compact  — true = icon + code only (for tight navbars), default = false
 */

import { useLanguage } from '../context/LanguageContext'

interface Props {
  compact?: boolean
}

export default function LanguageToggle({ compact = false }: Props) {
  const { lang, toggleLang } = useLanguage()

  const isAmharic = lang === 'am'

  // Compact (icon-only) mode — used when sidebar/dock is collapsed
  if (compact) {
    return (
      <button
        onClick={toggleLang}
        title={isAmharic ? 'Switch to English' : 'ወደ አማርኛ ቀይር'}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          fontSize: '1.25rem',
          lineHeight: 1,
          padding: '0.45rem',
          borderRadius: 8,
          color: 'var(--clr-text)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          transition: 'opacity 0.15s',
        }}
      >
        {isAmharic ? '🇪🇹' : '🌐'}
      </button>
    )
  }

  return (
    <button
      onClick={toggleLang}
      title={isAmharic ? 'Switch to English' : 'ወደ አማርኛ ቀይር'}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.35rem',
        padding: '0.38rem 0.75rem',
        borderRadius: 99,
        border: '1px solid rgba(255,255,255,0.15)',
        background: isAmharic
          ? 'linear-gradient(135deg, rgba(0,150,80,0.25), rgba(252,209,22,0.18), rgba(239,51,64,0.18))'
          : 'rgba(255,255,255,0.07)',
        cursor: 'pointer',
        fontFamily: 'inherit',
        fontSize: '0.78rem',
        fontWeight: 700,
        color: 'var(--clr-text)',
        transition: 'all 0.2s',
        whiteSpace: 'nowrap',
        flexShrink: 0,
        letterSpacing: '0.01em',
      }}
    >
      <span style={{ fontSize: '0.95rem', lineHeight: 1 }}>
        {isAmharic ? '🇪🇹' : '🌐'}
      </span>
      <span>{isAmharic ? 'አማርኛ' : 'English'}</span>
      <span style={{
        width: 5, height: 5, borderRadius: '50%',
        background: isAmharic ? '#4ade80' : 'var(--clr-accent)',
        flexShrink: 0,
      }}/>
    </button>
  )
}
