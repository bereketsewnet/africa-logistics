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
  const isOromo = lang === 'om'
  
  const getFlag = () => {
    if (isAmharic) return '🇪🇹'
    if (isOromo) return '🌳' // Using a tree/generic for Oromo or Ethiopian flag
    return '🌐'
  }
  
  const getTitle = () => {
    if (isAmharic) return 'ወደ ኦሮምኛ ቀይር' // Switch to Oromo
    if (isOromo) return 'Jijjiirraa gara Afaan Ingiliffaa' // Switch to English
    return 'Switch to Amharic'
  }

  const getLabel = () => {
    if (isAmharic) return 'አማርኛ'
    if (isOromo) return 'Afaan Oromoo'
    return 'English'
  }

  // Compact (icon-only) mode — used when sidebar/dock is collapsed
  if (compact) {
    return (
      <button
        onClick={toggleLang}
        title={getTitle()}
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
        {getFlag()}
      </button>
    )
  }

  const getBg = () => {
    if (isAmharic) return 'linear-gradient(135deg, rgba(0,150,80,0.25), rgba(252,209,22,0.18), rgba(239,51,64,0.18))'
    if (isOromo) return 'linear-gradient(135deg, rgba(0,0,0,0.25), rgba(239,51,64,0.18), rgba(255,255,255,0.18))'
    return 'rgba(255,255,255,0.07)'
  }
  
  const getDotColor = () => {
    if (isAmharic) return '#fcd116' // Yellow
    if (isOromo) return '#ef3340' // Red
    return 'var(--clr-accent)'
  }

  return (
    <button
      onClick={toggleLang}
      title={getTitle()}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.35rem',
        padding: '0.38rem 0.75rem',
        borderRadius: 99,
        border: '1px solid rgba(255,255,255,0.15)',
        background: getBg(),
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
        {getFlag()}
      </span>
      <span>{getLabel()}</span>
      <span style={{
        width: 5, height: 5, borderRadius: '50%',
        background: getDotColor(),
        flexShrink: 0,
      }}/>
    </button>
  )
}
