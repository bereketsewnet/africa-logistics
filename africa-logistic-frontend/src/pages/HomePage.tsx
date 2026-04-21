import { Link } from 'react-router-dom'
import { useRef, useEffect, useState, useCallback } from 'react'
import {
  Truck, Package, Globe2, Shield, BarChart3, Clock,
  ArrowRight, ChevronRight, MapPin, Phone, Mail, Send,
  Menu, X, Star, CheckCircle2, Warehouse, Route,
  Users, Zap, FileText, Headphones, Sun, Moon,
} from 'lucide-react'
import logoImg from '../assets/logo.webp'
import { configApi } from '../lib/apiClient'
import './HomePage.css'

/* ─── Types ─── */
interface ContactInfo {
  phone1?: string; phone2?: string
  email1?: string; email2?: string
  po_box?: string
  whatsapp_number?: string; telegram_url?: string
  youtube_url?: string; tiktok_url?: string
  instagram_url?: string; x_url?: string; linkedin_url?: string
}

/* ─── Static data ─── */
const SERVICES = [
  { icon: Truck,     title: 'Freight Transport',    color: '#22d3ee', bg: 'rgba(34,211,238,.1)',  border: 'rgba(34,211,238,.15)',  desc: 'Reliable road freight across Africa with real-time GPS tracking and automated dispatch.' },
  { icon: Globe2,    title: 'Cross-Border Shipping', color: '#a78bfa', bg: 'rgba(167,139,250,.1)', border: 'rgba(167,139,250,.15)', desc: 'Seamless customs clearance, HS code management, and cross-border documentation.' },
  { icon: Package,   title: 'Last-Mile Delivery',    color: '#34d399', bg: 'rgba(52,211,153,.1)',  border: 'rgba(52,211,153,.15)',  desc: 'Fast, verified last-mile delivery with OTP confirmation at pickup and dropoff.' },
  { icon: Warehouse, title: 'Warehousing',           color: '#fbbf24', bg: 'rgba(251,191,36,.1)',  border: 'rgba(251,191,36,.15)',  desc: 'Secure warehousing and inventory management at strategic African locations.' },
  { icon: Route,     title: 'Route Optimization',   color: '#f87171', bg: 'rgba(248,113,113,.1)', border: 'rgba(248,113,113,.15)', desc: 'AI-powered route planning to minimize cost and delivery time across regions.' },
  { icon: FileText,  title: 'Digital Documentation', color: '#818cf8', bg: 'rgba(129,140,248,.1)', border: 'rgba(129,140,248,.15)', desc: 'Automated invoicing, BOL generation, and digital proof of delivery.' },
]

const STATS = [
  { icon: Package,   value: 5000, suffix: '+', label: 'Deliveries Completed' },
  { icon: Globe2,    value: 15,   suffix: '+', label: 'Countries Covered' },
  { icon: Clock,     value: 99,   suffix: '%', label: 'On-Time Rate' },
  { icon: Headphones, value: 24,  suffix: '/7', label: 'Support Available' },
]

const WHY_US = [
  { icon: Shield,     title: 'Fully Insured',       desc: 'Every shipment is insured end-to-end for your complete peace of mind.' },
  { icon: Clock,      title: 'Real-Time Tracking',  desc: 'Track your cargo live on the map — from pickup all the way to delivery.' },
  { icon: BarChart3,  title: 'Transparent Pricing', desc: 'Instant quotes with no hidden fees. Pay exactly what you see.' },
  { icon: Headphones, title: 'Dedicated Support',   desc: '24/7 customer support with a dedicated account manager for every client.' },
]

const TESTIMONIALS = [
  { quote: 'Africa Logistics transformed our supply chain. Deliveries that took weeks now arrive in days.', author: 'Yohannes T.', role: 'Operations Manager, Addis Coffee Export', stars: 5 },
  { quote: 'The cross-border documentation feature saved us countless hours of manual customs work.', author: 'Amara K.', role: 'Logistics Director, Nairobi Trading Co.', stars: 5 },
  { quote: 'Best freight platform in East Africa. The real-time tracking gives us complete visibility.', author: 'Samuel M.', role: 'CEO, Kampala Distributors', stars: 5 },
]

const FOOTER_LINKS = [
  { title: 'Services', items: [{ label: 'Freight Transport', href: '#services' }, { label: 'Cross-Border', href: '#services' }, { label: 'Last-Mile', href: '#services' }, { label: 'Warehousing', href: '#services' }] },
  { title: 'Company',  items: [{ label: 'About Us', href: '#about' }, { label: 'Contact', href: '#contact' }, { label: 'Careers', href: '#' }, { label: 'Blog', href: '#' }] },
  { title: 'Legal',    items: [{ label: 'Privacy Policy', href: '#' }, { label: 'Terms of Service', href: '#' }, { label: 'Insurance', href: '#' }] },
]

const MARQUEE_ITEMS = [
  '5,000+ Deliveries', '15+ Countries', '99% On-Time Rate',
  '500+ Verified Drivers', '24/7 Support', '4.9★ Rating',
  'Addis · Nairobi · Kampala', 'Real-Time GPS Tracking',
]

/* ─── Hooks ─── */
function useReveal(threshold = 0.1) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setVisible(true); obs.disconnect() }
    }, { threshold })
    obs.observe(el)
    return () => obs.disconnect()
  }, [threshold])
  return [ref, visible] as const
}

/* ─── Scroll-reveal wrapper ─── */
function Reveal({
  children, className = '', delay = 0, dir = 'up',
}: {
  children: React.ReactNode
  className?: string
  delay?: number
  dir?: 'up' | 'left' | 'right' | 'scale'
}) {
  const [ref, visible] = useReveal(0.08)
  const cls = { up: 'hp-reveal', left: 'hp-reveal-left', right: 'hp-reveal-right', scale: 'hp-reveal-scale' }[dir]
  return (
    <div
      ref={ref}
      className={`${cls}${visible ? ' visible' : ''} ${className}`}
      style={{ transitionDelay: visible ? `${delay}s` : '0s' }}
    >
      {children}
    </div>
  )
}

/* ─── 3D Tilt Card ─── */
function TiltCard({ children, className = '', intensity = 12 }: { children: React.ReactNode; className?: string; intensity?: number }) {
  const ref = useRef<HTMLDivElement>(null)

  const onMove = useCallback((e: React.MouseEvent) => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const x = (e.clientX - r.left) / r.width - 0.5
    const y = (e.clientY - r.top) / r.height - 0.5
    el.style.transition = 'transform .12s ease'
    el.style.transform = `perspective(900px) rotateX(${-y * intensity}deg) rotateY(${x * intensity}deg) scale3d(1.02,1.02,1.02)`
  }, [intensity])

  const onLeave = useCallback(() => {
    const el = ref.current
    if (!el) return
    el.style.transition = 'transform .55s cubic-bezier(0.23,1,0.32,1)'
    el.style.transform = 'perspective(900px) rotateX(0deg) rotateY(0deg) scale3d(1,1,1)'
  }, [])

  return (
    <div ref={ref} onMouseMove={onMove} onMouseLeave={onLeave} className={className} style={{ transformStyle: 'preserve-3d', willChange: 'transform' }}>
      {children}
    </div>
  )
}

/* ─── Animated counter ─── */
function Counter({ target, suffix = '' }: { target: number; suffix?: string }) {
  const [count, setCount] = useState(0)
  const ref = useRef<HTMLSpanElement>(null)
  const done = useRef(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !done.current) {
        done.current = true
        const dur = 1800
        const t0 = performance.now()
        const tick = (now: number) => {
          const p = Math.min((now - t0) / dur, 1)
          setCount(Math.round((1 - Math.pow(1 - p, 3)) * target))
          if (p < 1) requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      }
    }, { threshold: 0.3 })
    obs.observe(el)
    return () => obs.disconnect()
  }, [target])

  return <span ref={ref}>{count}{suffix}</span>
}

/* ─── Scroll Progress ─── */
function ScrollProgress() {
  const [pct, setPct] = useState(0)
  useEffect(() => {
    const fn = () => {
      const d = document.documentElement
      setPct((d.scrollTop / (d.scrollHeight - d.clientHeight)) * 100)
    }
    window.addEventListener('scroll', fn, { passive: true })
    return () => window.removeEventListener('scroll', fn)
  }, [])
  return (
    <div className="hp-scroll-bar">
      <div className="hp-scroll-fill" style={{ width: `${pct}%` }} />
    </div>
  )
}

/* ═══════════════════════════════════════════════
   Navbar
   ═══════════════════════════════════════════════ */
function Navbar() {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState('hero')

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    const ids = ['hero', 'services', 'about', 'contact']
    const observers = ids.map(id => {
      const el = document.getElementById(id)
      if (!el) return null
      const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setActive(id) }, { threshold: 0.35 })
      obs.observe(el)
      return obs
    })
    return () => observers.forEach(o => o?.disconnect())
  }, [])

  const close = useCallback(() => setOpen(false), [])

  const [theme, setTheme] = useState<'LIGHT'|'DARK'>(() =>
    (localStorage.getItem('login-theme') as 'LIGHT'|'DARK'|null) ?? 'LIGHT'
  )
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme.toLowerCase())
  }, [])
  const toggleTheme = useCallback(() => {
    const next: 'LIGHT'|'DARK' = theme === 'LIGHT' ? 'DARK' : 'LIGHT'
    setTheme(next)
    localStorage.setItem('login-theme', next)
    document.documentElement.setAttribute('data-theme', next.toLowerCase())
  }, [theme])

  const links = [
    { label: 'Home', href: '#hero', id: 'hero' },
    { label: 'Services', href: '#services', id: 'services' },
    { label: 'About', href: '#about', id: 'about' },
    { label: 'Contact', href: '#contact', id: 'contact' },
  ]

  return (
    <>
      <nav className={`hp-nav${scrolled ? ' scrolled' : ''}`}>
        <div className="hp-nav-inner">
          <a href="#hero" className="hp-logo">
            <div className="hp-logo-icon"><img src={logoImg} alt="Africa Logistics logo" /></div>
            <div>
              <div className="hp-logo-name">
                Africa{' '}
                <span style={{ background: 'linear-gradient(90deg,#22d3ee,#60a5fa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                  Logistics
                </span>
              </div>
              <span className="hp-logo-sub">Moving Africa Forward</span>
            </div>
          </a>

          <div className="hp-nav-links">
            {links.map(l => (
              <a key={l.id} href={l.href} className={active === l.id ? 'active' : ''} onClick={close}>
                {l.label}
              </a>
            ))}
          </div>

          <div className="hp-nav-actions">
            <button onClick={toggleTheme} className="hp-theme-toggle" aria-label="Toggle theme">
              {theme === 'LIGHT' ? <Moon size={16} /> : <Sun size={16} />}
            </button>
            <Link to="/login" className="hp-nav-ghost">Log in</Link>
            <Link to="/register" className="hp-nav-cta">Get Started</Link>
          </div>

          <button className="hp-mobile-btn" onClick={() => setOpen(o => !o)} aria-label="Toggle menu">
            {open ? <X /> : <Menu />}
          </button>
        </div>
      </nav>

      {open && (
        <div className="hp-mobile-menu">
          {links.map(l => <a key={l.id} href={l.href} onClick={close}>{l.label}</a>)}
          <hr />
          <button onClick={toggleTheme} className="hp-mobile-theme-toggle">
            {theme === 'LIGHT' ? <Moon size={15} /> : <Sun size={15} />}
            {theme === 'LIGHT' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
          </button>
          <Link to="/login" className="hp-nav-ghost" onClick={close} style={{ padding: '12px 8px' }}>Log in</Link>
          <Link to="/register" className="hp-mobile-cta" onClick={close}>Get Started</Link>
        </div>
      )}
    </>
  )
}

/* ═══════════════════════════════════════════════
   Hero
   ═══════════════════════════════════════════════ */
function Hero() {
  const glow1Ref = useRef<HTMLDivElement>(null)
  const progressRef = useRef<HTMLDivElement>(null)

  /* Mouse parallax on glowing orbs */
  useEffect(() => {
    const fn = (e: MouseEvent) => {
      const el = glow1Ref.current
      if (!el) return
      const cx = window.innerWidth / 2
      const cy = window.innerHeight / 2
      const dx = (e.clientX - cx) / cx
      const dy = (e.clientY - cy) / cy
      el.style.transform = `translate(${dx * 28}px, ${dy * 18}px) scale(1)`
    }
    window.addEventListener('mousemove', fn, { passive: true })
    return () => window.removeEventListener('mousemove', fn)
  }, [])

  /* Trigger progress bar animation after mount */
  useEffect(() => {
    const t = setTimeout(() => {
      progressRef.current?.classList.add('animate')
    }, 300)
    return () => clearTimeout(t)
  }, [])

  return (
    <section id="hero" className="hp-hero">
      <div className="hp-hero-bg">
        <div className="hp-hero-grid" />
        <div ref={glow1Ref} className="hp-glow-1" />
        <div className="hp-glow-2" />
        <div className="hp-glow-3" />
        <div className="hp-hero-ring" />
        <div className="hp-hero-ring2" />
        <div className="hp-hero-cube" />
        <div className="hp-hero-dot1" />
        <div className="hp-hero-dot2" />
      </div>

      <div className="hp-hero-content">
        {/* Badge */}
        <div className="hp-hero-badge">
          <span className="hp-live-dot" />
          Trusted Logistics Across Africa
        </div>

        {/* Heading */}
        <h1>
          Moving Africa<br />
          <span className="hp-gradient-text">Forward</span>
        </h1>

        {/* Subtitle */}
        <p className="sub">
          End-to-end logistics for Africa — freight, cross-border shipping, last-mile delivery,
          and real-time tracking. All in one platform.
        </p>

        {/* CTAs */}
        <div className="hp-hero-ctas">
          <Link to="/register" className="hp-btn-cta1">
            Ship Now <ArrowRight />
          </Link>
          <a href="#services" className="hp-btn-cta2">
            Our Services <ChevronRight />
          </a>
        </div>

        {/* 3D Tracking card */}
        <div className="hp-card-wrap">
          <TiltCard className="hp-card-3d" intensity={8}>
            <div className="hp-tracking-card">
              <div className="hp-card-chrome">
                <div className="hp-chrome-dots">
                  <div className="hp-chrome-dot" style={{ background: 'rgba(239,68,68,.7)' }} />
                  <div className="hp-chrome-dot" style={{ background: 'rgba(234,179,8,.7)' }} />
                  <div className="hp-chrome-dot" style={{ background: 'rgba(34,197,94,.7)' }} />
                </div>
                <div className="hp-chrome-url">
                  <span>africa-logistics.app/tracking</span>
                </div>
              </div>
              <div className="hp-card-body">
                <div className="hp-card-header">
                  <div className="hp-card-order">
                    <div className="hp-card-icon"><Package /></div>
                    <div>
                      <div className="hp-card-id">Order #AL-20260419</div>
                      <div className="hp-card-route">Addis Ababa → Nairobi</div>
                    </div>
                  </div>
                  <div className="hp-card-badge">In Transit</div>
                </div>
                <div className="hp-card-path">
                  <div className="hp-card-line">
                    <div className="hp-dot-c" />
                    <div className="hp-line-seg" />
                    <div className="hp-dot-v" />
                  </div>
                  <div className="hp-card-stops">
                    <div>
                      <div className="hp-stop-name">Addis Ababa, Ethiopia</div>
                      <div className="hp-stop-sub">Picked up · Apr 17, 10:30 AM</div>
                    </div>
                    <div>
                      <div className="hp-stop-name">Nairobi, Kenya</div>
                      <div className="hp-stop-sub">ETA · Apr 20, 2:00 PM</div>
                    </div>
                  </div>
                </div>
                <div className="hp-progress-lbl">
                  <span>Progress</span><span>68%</span>
                </div>
                <div className="hp-progress-track">
                  <div ref={progressRef} className="hp-progress-fill" />
                </div>
              </div>
            </div>
          </TiltCard>
          <div className="hp-card-glow" />
        </div>
      </div>
    </section>
  )
}

/* ═══════════════════════════════════════════════
   Marquee
   ═══════════════════════════════════════════════ */
function Marquee() {
  const items = [...MARQUEE_ITEMS, ...MARQUEE_ITEMS]
  return (
    <div className="hp-marquee">
      <div className="hp-marquee-track">
        {items.map((item, i) => (
          <span key={i} className="hp-marquee-item">
            {item}
            <span className="hp-marquee-sep">•</span>
          </span>
        ))}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════
   Stats
   ═══════════════════════════════════════════════ */
function StatsBar() {
  return (
    <section className="hp-stats">
      <div className="hp-container">
        <div className="hp-stats-grid">
          {STATS.map((s, i) => (
            <Reveal key={s.label} delay={i * 0.08}>
              <TiltCard>
                <div className="hp-stat-card">
                  <div className="hp-stat-icon"><s.icon /></div>
                  <div className="hp-stat-value">
                    <Counter target={s.value} suffix={s.suffix} />
                  </div>
                  <div className="hp-stat-label">{s.label}</div>
                </div>
              </TiltCard>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ═══════════════════════════════════════════════
   Services
   ═══════════════════════════════════════════════ */
function Services() {
  return (
    <section id="services" className="hp-section">
      <div className="hp-container">
        <Reveal className="hp-section-head">
          <div className="hp-badge"><Truck /> Our Services</div>
          <h2 className="hp-section-title">
            Complete logistics<br />
            <span className="hp-gradient-text">solutions for Africa</span>
          </h2>
          <p className="hp-section-sub">
            From freight forwarding to last-mile delivery — everything you need to move goods across the continent.
          </p>
        </Reveal>

        <div className="hp-services-grid">
          {SERVICES.map((s, i) => (
            <Reveal key={s.title} delay={i * 0.07} dir="scale">
              <TiltCard className="h-full" intensity={10}>
                <div
                  className="hp-service-card"
                  onMouseEnter={e => {
                    const el = e.currentTarget
                    el.style.borderColor = `${s.color}40`
                    el.style.boxShadow = `0 20px 60px rgba(0,0,0,.25), 0 0 30px ${s.color}18`
                    el.style.background = 'rgba(255,255,255,.045)'
                  }}
                  onMouseLeave={e => {
                    const el = e.currentTarget
                    el.style.borderColor = ''
                    el.style.boxShadow = ''
                    el.style.background = ''
                  }}
                >
                  <div className="hp-service-shine" style={{ background: `radial-gradient(circle, ${s.color} 0%, transparent 70%)` }} />
                  <div className="hp-service-icon" style={{ background: s.bg, border: `1px solid ${s.border}` }}>
                    <s.icon style={{ color: s.color }} />
                  </div>
                  <h3>{s.title}</h3>
                  <p>{s.desc}</p>
                </div>
              </TiltCard>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ═══════════════════════════════════════════════
   About
   ═══════════════════════════════════════════════ */
function About() {
  return (
    <section id="about" className="hp-section alt">
      <div className="hp-container">
        <div className="hp-about-grid">
          <Reveal dir="left">
            <div className="hp-about-text">
              <div className="hp-badge"><Users /> About Us</div>
              <h2 className="hp-about-title">
                Built for Africa,<br />
                <span className="hp-gradient-text">by Africa</span>
              </h2>
              <p>
                Africa Logistics is a technology-driven logistics platform connecting shippers with
                reliable carriers across the continent. We combine cutting-edge technology with deep
                local expertise to solve Africa's toughest logistics challenges.
              </p>
              <p>
                Our mission is to make logistics seamless, transparent, and affordable for every
                business in Africa — from small traders to large enterprises.
              </p>
              <div className="hp-checklist">
                {['Real-Time GPS Tracking', 'Verified Drivers', 'Cross-Border Expertise', 'Digital Payments'].map(item => (
                  <div key={item} className="hp-check-item">
                    <CheckCircle2 /> {item}
                  </div>
                ))}
              </div>
            </div>
          </Reveal>

          <Reveal dir="right" delay={0.12}>
            <TiltCard intensity={9}>
              <div className="hp-about-card">
                <div className="hp-about-stats-grid">
                  {[
                    { icon: Truck,   val: '500+', lbl: 'Verified Drivers' },
                    { icon: Globe2,  val: '15+',  lbl: 'African Countries' },
                    { icon: Package, val: '5K+',  lbl: 'Deliveries' },
                    { icon: Star,    val: '4.9',  lbl: 'Avg Rating' },
                  ].map(({ icon: Icon, val, lbl }) => (
                    <div key={lbl} className="hp-about-stat">
                      <Icon />
                      <div className="hp-about-stat-val">{val}</div>
                      <div className="hp-about-stat-lbl">{lbl}</div>
                    </div>
                  ))}
                </div>
              </div>
            </TiltCard>
          </Reveal>
        </div>
      </div>
    </section>
  )
}

/* ═══════════════════════════════════════════════
   Why Choose Us
   ═══════════════════════════════════════════════ */
function WhyUs() {
  return (
    <section className="hp-section">
      <div className="hp-container">
        <Reveal className="hp-section-head">
          <div className="hp-badge"><Zap /> Why Choose Us</div>
          <h2 className="hp-section-title">
            The advantage of<br />
            <span className="hp-gradient-text">Africa Logistics</span>
          </h2>
        </Reveal>
        <div className="hp-why-grid">
          {WHY_US.map((item, i) => (
            <Reveal key={item.title} delay={i * 0.08} dir={i % 2 === 0 ? 'left' : 'right'}>
              <div className="hp-why-card">
                <div className="hp-why-icon"><item.icon /></div>
                <div className="hp-why-body">
                  <h3>{item.title}</h3>
                  <p>{item.desc}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ═══════════════════════════════════════════════
   Testimonials
   ═══════════════════════════════════════════════ */
function Testimonials() {
  return (
    <section className="hp-section alt">
      <div className="hp-container">
        <Reveal className="hp-section-head">
          <div className="hp-badge">Testimonials</div>
          <h2 className="hp-section-title">What our clients say</h2>
        </Reveal>
        <div className="hp-testi-grid">
          {TESTIMONIALS.map((t, i) => (
            <Reveal key={t.author} delay={i * 0.1} dir="scale">
              <TiltCard intensity={7}>
                <div className="hp-testi-card">
                  <div className="hp-stars">
                    {Array.from({ length: t.stars }).map((_, j) => <Star key={j} />)}
                  </div>
                  <p className="hp-testi-quote">"{t.quote}"</p>
                  <div className="hp-testi-author">{t.author}</div>
                  <div className="hp-testi-role">{t.role}</div>
                </div>
              </TiltCard>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ═══════════════════════════════════════════════
   Contact
   ═══════════════════════════════════════════════ */
function Contact() {
  const [info, setInfo] = useState<ContactInfo>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    configApi.getContactInfo()
      .then(r => setInfo((r.data as any).contact ?? {}))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const socials = [
    { label: 'WhatsApp',    url: info.whatsapp_number ? `https://wa.me/${info.whatsapp_number.replace(/\D/g,'')}` : null },
    { label: 'Telegram',    url: info.telegram_url },
    { label: 'Instagram',   url: info.instagram_url },
    { label: 'YouTube',     url: info.youtube_url },
    { label: 'TikTok',      url: info.tiktok_url },
    { label: 'LinkedIn',    url: info.linkedin_url },
    { label: 'X / Twitter', url: info.x_url },
  ].filter(s => s.url)

  const cards = [
    {
      icon: Phone, color: '#22d3ee', bg: 'rgba(34,211,238,.1)', border: 'rgba(34,211,238,.15)',
      title: 'Call Us',
      content: (
        <>
          {info.phone1 && <a href={`tel:${info.phone1}`} style={{ color: '#22d3ee' }}>{info.phone1}</a>}
          {info.phone2 && <a href={`tel:${info.phone2}`}>{info.phone2}</a>}
          {!info.phone1 && !info.phone2 && <span style={{ color: 'var(--text-3)' }}>No phone available</span>}
        </>
      ),
    },
    {
      icon: Mail, color: '#a78bfa', bg: 'rgba(167,139,250,.1)', border: 'rgba(167,139,250,.15)',
      title: 'Email Us',
      content: (
        <>
          {info.email1 && <a href={`mailto:${info.email1}`} style={{ color: '#a78bfa' }}>{info.email1}</a>}
          {info.email2 && <a href={`mailto:${info.email2}`}>{info.email2}</a>}
          {!info.email1 && !info.email2 && <span style={{ color: 'var(--text-3)' }}>No email available</span>}
        </>
      ),
    },
    {
      icon: MapPin, color: '#34d399', bg: 'rgba(52,211,153,.1)', border: 'rgba(52,211,153,.15)',
      title: 'Visit Us',
      content: info.po_box
        ? <span style={{ color: 'var(--text-2)' }}>{info.po_box}</span>
        : <span style={{ color: 'var(--text-3)' }}>Address not available</span>,
    },
  ]

  return (
    <section id="contact" className="hp-section">
      <div className="hp-container">
        <Reveal className="hp-section-head">
          <div className="hp-badge"><Send /> Contact Us</div>
          <h2 className="hp-section-title">
            Get in touch<br />
            <span className="hp-gradient-text">with our team</span>
          </h2>
          <p className="hp-section-sub">
            Have a question or need a quote? Reach out through any of the channels below.
          </p>
        </Reveal>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '56px 0' }}>
            <div style={{ display: 'inline-block', width: 32, height: 32, border: '2px solid rgba(34,211,238,.25)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin-loader 1s linear infinite' }} />
          </div>
        ) : (
          <>
            <div className="hp-contact-grid">
              {cards.map((c, i) => (
                <Reveal key={c.title} delay={i * 0.09} dir="scale">
                  <TiltCard intensity={10}>
                    <div
                      className="hp-contact-card"
                      onMouseEnter={e => { e.currentTarget.style.borderColor = `${c.color}30` }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = '' }}
                    >
                      <div className="hp-contact-icon" style={{ background: c.bg, border: `1px solid ${c.border}` }}>
                        <c.icon style={{ color: c.color }} />
                      </div>
                      <h3>{c.title}</h3>
                      {c.content}
                    </div>
                  </TiltCard>
                </Reveal>
              ))}
            </div>

            {socials.length > 0 && (
              <Reveal delay={0.2}>
                <div className="hp-social-block">
                  <p className="hp-social-lbl">Find us on</p>
                  <div className="hp-social-links">
                    {socials.map(s => (
                      <a key={s.label} href={s.url!} target="_blank" rel="noopener noreferrer" className="hp-social-link">
                        {s.label}
                      </a>
                    ))}
                  </div>
                </div>
              </Reveal>
            )}
          </>
        )}
      </div>
    </section>
  )
}

/* ═══════════════════════════════════════════════
   Footer
   ═══════════════════════════════════════════════ */
function Footer() {
  return (
    <footer className="hp-footer">
      <div className="hp-container">
        <div className="hp-footer-grid">
          <div className="hp-footer-brand">
            <a href="#hero" className="hp-logo" style={{ textDecoration: 'none' }}>
              <div className="hp-logo-icon"><img src={logoImg} alt="Africa Logistics logo" /></div>
              <div className="hp-logo-name">
                Africa{' '}
                <span style={{ background: 'linear-gradient(90deg,#22d3ee,#60a5fa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                  Logistics
                </span>
              </div>
            </a>
            <p>Technology-driven logistics platform moving goods across Africa with speed, transparency, and reliability.</p>
          </div>
          {FOOTER_LINKS.map(g => (
            <div key={g.title} className="hp-footer-col">
              <h4>{g.title}</h4>
              <ul>{g.items.map(l => <li key={l.label}><a href={l.href}>{l.label}</a></li>)}</ul>
            </div>
          ))}
        </div>
        <div className="hp-footer-bottom">
          <p>© {new Date().getFullYear()} Africa Logistics. All rights reserved.</p>
          <p>Moving Africa Forward</p>
        </div>
      </div>
    </footer>
  )
}

/* ═══════════════════════════════════════════════
   Root
   ═══════════════════════════════════════════════ */
export default function HomePage() {
  return (
    <div className="hp-root">
      <style>{`html { scroll-behavior: smooth; }`}</style>
      <ScrollProgress />
      <Navbar />
      <Hero />
      <Marquee />
      <StatsBar />
      <Services />
      <About />
      <WhyUs />
      <Testimonials />
      <Contact />
      <Footer />
    </div>
  )
}
