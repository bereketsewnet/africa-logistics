import { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import { FiSun, FiMoon, FiGlobe } from 'react-icons/fi'
import { useLanguage } from '../context/LanguageContext'
import { useThemeLogo } from '../lib/useThemeLogo'
import './AfricaLogisticsHero.css'

type AfricaLogisticsHeroProps = {
  backgroundImage?: string
}

/* Nav items → in-page anchors. Labels are resolved via t() at render time. */
const navItems: { key: string; fallback: string; href: string }[] = [
  { key: 'hp_menu_home', fallback: 'Home', href: '#home' },
  { key: 'about_us_badge', fallback: 'About Us', href: '#about' },
  { key: 'svc_badge', fallback: 'Our Services', href: '#services' },
  { key: 'team_badge', fallback: 'Our Team', href: '#team' },
  { key: 'contact_us_badge', fallback: 'Contact Us', href: '#contact' },
]

const featureKeys: { titleKey: string; titleFallback: string; descKey: string; descFallback: string }[] = [
  { titleKey: 'hero_intro_feat1_title', titleFallback: 'Premier Logistics', descKey: 'hero_intro_feat1_desc', descFallback: "Ethiopia's leading local & cross-country provider." },
  { titleKey: 'hero_intro_feat2_title', titleFallback: 'Reliable Network', descKey: 'hero_intro_feat2_desc', descFallback: 'Strategic matching for efficient, cost-effective transport.' },
  { titleKey: 'hero_intro_feat3_title', titleFallback: 'Tailored Solutions', descKey: 'hero_intro_feat3_desc', descFallback: 'Bespoke logistics management for unique needs.' },
]

const ACTIVE_HREF = '#home'

export default function AfricaLogisticsHero({
  backgroundImage = '/bg.webp',
}: AfricaLogisticsHeroProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [languageOpen, setLanguageOpen] = useState(false)
  const { lang, setLang, t } = useLanguage()
  const logoImg = useThemeLogo()

  const [theme, setTheme] = useState<'LIGHT' | 'DARK'>(() => {
    const attr = document.documentElement.getAttribute('data-theme')
    if (attr === 'dark') return 'DARK'
    if (attr === 'light') return 'LIGHT'
    return (localStorage.getItem('login-theme') as 'LIGHT' | 'DARK' | null) ?? 'LIGHT'
  })
  const lightTheme = theme === 'LIGHT'

  useEffect(() => {
    const sync = () => {
      const attr = document.documentElement.getAttribute('data-theme')
      setTheme(attr === 'dark' ? 'DARK' : 'LIGHT')
    }
    const observer = new MutationObserver(sync)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])

  const toggleTheme = useCallback(() => {
    const next: 'LIGHT' | 'DARK' = theme === 'LIGHT' ? 'DARK' : 'LIGHT'
    setTheme(next)
    localStorage.setItem('login-theme', next)
    document.documentElement.setAttribute('data-theme', next.toLowerCase())
  }, [theme])

  const chooseLanguage = (value: string) => {
    setLang(value as 'en' | 'am' | 'om')
    setLanguageOpen(false)
  }

  const langLabel = lang === 'en' ? 'EN' : lang === 'am' ? 'AM' : 'OM'

  /* ── Hero background carousel ──
     3 slides, auto-advancing every SLIDE_MS; the bottom-right control lets
     you step manually (which also restarts the auto timer + progress fill).
     Slides are <img> layers so a not-yet-added image gracefully falls back
     to the first background instead of showing a blank dark slide. */
  const heroSlides = [backgroundImage, '/images/hero-2.webp', '/images/hero-3.webp']
  const SLIDE_MS = 6000
  const [slide, setSlide] = useState(0)
  const goSlide = useCallback((dir: number) => {
    setSlide(s => (s + dir + heroSlides.length) % heroSlides.length)
  }, [heroSlides.length])
  useEffect(() => {
    const id = setTimeout(() => setSlide(s => (s + 1) % heroSlides.length), SLIDE_MS)
    return () => clearTimeout(id)
  }, [slide, heroSlides.length])

  /* The desktop nav pill + centered logo only have room to coexist above a
     width that depends on how long the active language's labels are
     (Afaan Oromo runs noticeably longer than English). A hidden probe,
     always rendered in desktop-pill styling, measures the real content
     width for the current language so the layout switches to the
     hamburger/dropdown nav exactly when it would otherwise overlap the
     logo — instead of guessing at a single fixed breakpoint.
     useLayoutEffect runs before paint, so there's no flash of a
     colliding desktop layout. */
  const navProbeRef = useRef<HTMLDivElement>(null)
  const [compact, setCompact] = useState(true)

  useLayoutEffect(() => {
    const HEADER_PAD = 27
    const LOGO_HALF_WIDTH = 101
    const SAFETY_GAP = 20
    const PHONE_FLOOR = 700

    const evaluate = () => {
      const navWidth = navProbeRef.current?.getBoundingClientRect().width ?? 0
      const required = 2 * (HEADER_PAD + navWidth + SAFETY_GAP + LOGO_HALF_WIDTH)
      setCompact(window.innerWidth < PHONE_FLOOR || window.innerWidth < required)
    }

    evaluate()
    window.addEventListener('resize', evaluate)
    return () => window.removeEventListener('resize', evaluate)
  }, [lang])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setMenuOpen(false); setLanguageOpen(false) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className={`alh-frame${compact ? ' alh-compact' : ''}`}>
      {/* Hidden probe: measures how wide the desktop nav pill would be for
          the current language, independent of whichever mode is visible. */}
      <div className="alh-nav-probe" ref={navProbeRef} aria-hidden="true">
        {navItems.map(({ key, fallback }) => (
          <span key={key}>{t(key) || fallback}</span>
        ))}
      </div>

      <section className="alh-card" aria-label="Afri Logistics introduction">
        {/* Background carousel + dark overlay */}
        {heroSlides.map((src, i) => (
          <img
            key={i}
            src={src}
            alt=""
            aria-hidden="true"
            className={`alh-bg${i === slide ? ' is-active' : ''}`}
            onError={e => {
              if (e.currentTarget.src.indexOf(backgroundImage) === -1) e.currentTarget.src = backgroundImage
            }}
          />
        ))}
        <div className="alh-overlay" />

        {/* ═══ Header ═══ */}
        <div className="alh-header">
          {/* Nav pill */}
          <nav
            id="main-navigation"
            className={`alh-nav${menuOpen ? ' alh-nav-open' : ''}`}
            aria-label="Primary navigation"
          >
            {navItems.map(({ key, fallback, href }) => (
              <a
                key={key}
                href={href}
                onClick={() => setMenuOpen(false)}
                className={href === ACTIVE_HREF ? 'alh-active' : undefined}
              >
                {t(key) || fallback}
              </a>
            ))}
          </nav>

          {/* Logo cutout */}
          <a href="#home" className="alh-logo" aria-label="Afri Logistics home">
            <img src={logoImg} alt="Afri Logistics" />
          </a>

          {/* Hamburger (mobile) */}
          <button
            className={`alh-burger${menuOpen ? ' alh-open' : ''}`}
            type="button"
            aria-label={menuOpen ? 'Close navigation' : 'Open navigation'}
            aria-expanded={menuOpen}
            aria-controls="main-navigation"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            <span /><span /><span />
          </button>

          {/* Right actions */}
          <div className="alh-actions">
            {/* Language */}
            <div className="alh-lang-wrap">
              <button
                type="button"
                onClick={() => setLanguageOpen(!languageOpen)}
                aria-expanded={languageOpen}
                aria-label="Select language"
                className="alh-icon-btn"
              >
                <FiGlobe className="alh-dot" />
                {langLabel}
              </button>
              {languageOpen && (
                <div className="alh-lang-menu">
                  <button onClick={() => chooseLanguage('en')}>English</button>
                  <button onClick={() => chooseLanguage('am')}>አማርኛ</button>
                  <button onClick={() => chooseLanguage('om')}>Afaan Oromoo</button>
                </div>
              )}
            </div>

            {/* Theme toggle */}
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={lightTheme ? 'Switch to dark theme' : 'Switch to light theme'}
              className="alh-icon-btn alh-square"
            >
              {lightTheme ? <FiSun /> : <FiMoon />}
            </button>

            {/* Create Order */}
            <Link to="/register" className="alh-btn alh-btn-outline alh-create-order">
              {t('aord_create_order') || 'Create Order'}
            </Link>

            {/* Sign In */}
            <Link to="/login" className="alh-btn alh-btn-solid">
              {t('login_sign_in_btn') || 'Sign In'}
            </Link>
          </div>
        </div>

        {/* ═══ Hero copy ═══ */}
        <div id="home" className="alh-copy">
          <h1>
            {t('hero_intro_title_1') || 'Delivering Excellence'}
            <br />
            {t('hero_intro_title_2') || 'in Every Mile.'}
          </h1>
          <p>
            {t('hero_intro_sub') || "Afri Logistics is Ethiopia's premier logistics company specializing in local and cross-country delivery services."}
          </p>
          <a href="#start" className="alh-cta">
            {t('hp_get_started') || 'Get Started'}
            <span className="alh-arrow">&rarr;</span>
          </a>
        </div>

        {/* ═══ Feature columns ═══ */}
        <div className="alh-features">
          {featureKeys.map(({ titleKey, titleFallback, descKey, descFallback }) => (
            <article key={titleKey}>
              <h2>{t(titleKey) || titleFallback}</h2>
              <p>{t(descKey) || descFallback}</p>
            </article>
          ))}
        </div>

        {/* ═══ Slider control ═══ */}
        <div className="alh-slider">
          <div className="alh-slider-inner">
            <button type="button" aria-label="Previous background" onClick={() => goSlide(-1)}>&larr;</button>
            <button type="button" aria-label="Next background" onClick={() => goSlide(1)}>&rarr;</button>
            <span className="alh-progress"><i key={slide} style={{ animationDuration: `${SLIDE_MS}ms` }} /></span>
            <span className="alh-count">{String(slide + 1).padStart(2, '0')}</span>
          </div>
        </div>
      </section>
    </div>
  )
}
