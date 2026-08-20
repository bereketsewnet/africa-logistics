import { useRef, useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { isAxiosError } from 'axios'
import {
  Truck, Package, Globe2, Warehouse, Route, Users,
  MapPin, Phone, Mail, Send,
  ShieldCheck, Cpu, HeartHandshake, Settings2, Zap, Sparkles,
  Map as MapIcon, UserPlus, Handshake, Wallet,
  Smartphone, UserCog, Download,
} from 'lucide-react'
import { useThemeLogo } from '../lib/useThemeLogo'
import { configApi } from '../lib/apiClient'
import { TELEGRAM_MINI_APP_URL } from '../lib/telegram'
import AfricaLogisticsHero from '../components/AfricaLogisticsHero'
import phoneMockup from '../assets/phone.webp'
import './HomePage.css'

import { useLanguage } from '../context/LanguageContext'

/* ─── Inline brand icons (lucide dropped social/brand marks) ─── */
type SvgProps = React.SVGProps<SVGSVGElement>
const IconFacebook = (p: SvgProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...p}>
    <path d="M22 12a10 10 0 1 0-11.6 9.9v-7H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.4h-1.2c-1.2 0-1.6.8-1.6 1.6V12h2.7l-.4 2.9h-2.3v7A10 10 0 0 0 22 12z" />
  </svg>
)
const IconInstagram = (p: SvgProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" {...p}>
    <rect x="3" y="3" width="18" height="18" rx="5" />
    <circle cx="12" cy="12" r="4" />
    <circle cx="17.3" cy="6.7" r="1" fill="currentColor" stroke="none" />
  </svg>
)
const IconTikTok = (p: SvgProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...p}>
    <path d="M16.7 3c.4 2.6 1.9 4.1 4.3 4.3v3.1c-1.5.1-2.9-.4-4.2-1.2v6.5a6.5 6.5 0 1 1-5.6-6.4v3.2a3.4 3.4 0 1 0 2.4 3.3V3h3.1Z" />
  </svg>
)
const IconWhatsApp = (p: SvgProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...p}>
    <path d="M12 2a10 10 0 0 0-8.5 15.3L2 22l4.8-1.5A10 10 0 1 0 12 2zm5.3 14.1c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .1-1.7-.1-.4-.1-.9-.3-1.6-.6-2.7-1.2-4.5-4-4.6-4.2-.1-.2-1.1-1.5-1.1-2.8s.7-2 .9-2.2c.2-.3.5-.3.6-.3h.5c.2 0 .4 0 .6.5l.8 1.9c.1.2.1.4 0 .5l-.4.6c-.1.2-.3.3-.1.6.1.3.6 1 1.3 1.6.9.8 1.6 1 1.9 1.2.2.1.4.1.5-.1l.6-.7c.2-.2.3-.2.5-.1l1.7.8c.2.1.4.2.4.3.1.1.1.6-.1 1z" />
  </svg>
)
const IconTelegram = (p: SvgProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...p}>
    <path d="M21.9 4.3 18.7 19.4c-.2 1-.9 1.3-1.8.8l-4.9-3.6-2.4 2.3c-.3.3-.5.5-1 .5l.3-4.9 9-8.1c.4-.3-.1-.5-.6-.2L6 12.7l-4.7-1.5c-1-.3-1-1 .2-1.5l18.4-7.1c.9-.3 1.6.2 1.3 1.6z" />
  </svg>
)

/* ─── Types ─── */
interface ContactInfo {
  phone1?: string; phone2?: string
  email1?: string; email2?: string
  po_box?: string
  whatsapp_number?: string; whatsapp_url?: string; telegram_url?: string
  youtube_url?: string; tiktok_url?: string
  instagram_url?: string; x_url?: string; linkedin_url?: string
  facebook_url?: string
}

/* ═══════════════════════════════════════════════
   Hooks & shared helpers (reused across sections)
   ═══════════════════════════════════════════════ */
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

/* Scroll-reveal wrapper */
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

/* 3D Tilt Card */
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

/* Scroll Progress */
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
   About — "Welcome & Introduction"
   ═══════════════════════════════════════════════ */
function About() {
  const { t } = useLanguage()
  const pillars = [
    { icon: Warehouse, label: t('about_pillar_freight') },
    { icon: Package, label: t('about_pillar_warehouse') },
    { icon: Truck, label: t('about_pillar_distribution') },
  ]
  return (
    <section id="about" className="hp-section alt">
      <div className="hp-container">
        <div className="hp-about-grid">
          <Reveal dir="left">
            <div className="hp-about-text">
              <div className="hp-badge"><Users /> {t('about_us_badge')}</div>
              <h2 className="hp-section-title">
                {t('about_intro_title1')}<br />
                <span className="hp-gradient-text">{t('about_intro_title2')}</span>
              </h2>
              <p>{t('about_p1')}</p>
              <p>{t('about_p2')}</p>
              <p>{t('about_p3')}</p>
              <div className="hp-about-pillars">
                {pillars.map(p => (
                  <div key={p.label} className="hp-pillar">
                    <p.icon /> <span>{p.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>

          <Reveal dir="right" delay={0.12}>
            <div className="hp-about-media">
              <div className="hp-about-img hp-about-img--1" role="img" aria-label="Afri Logistics operations" />
              <div className="hp-about-img hp-about-img--2" role="img" aria-label="Port terminal operations" />
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  )
}

/* ═══════════════════════════════════════════════
   Why Choose Us — numbered cards + feature image
   ═══════════════════════════════════════════════ */
function WhyUs() {
  const { t } = useLanguage()
  const items = [
    { icon: ShieldCheck, title: t('why_reliability'), desc: t('why_reliability_desc') },
    { icon: MapPin, title: t('why_local'), desc: t('why_local_desc') },
    { icon: Cpu, title: t('why_tech'), desc: t('why_tech_desc') },
    { icon: HeartHandshake, title: t('why_customer'), desc: t('why_customer_desc') },
  ]
  return (
    <section className="hp-section">
      <div className="hp-container">
        <Reveal className="hp-section-head hp-section-head--left">
          <div className="hp-badge"><Zap /> {t('why_badge')}</div>
          <h2 className="hp-section-title">
            {t('why_title1')} <span className="hp-gradient-text">{t('why_title2')}</span>
          </h2>
          <p className="hp-section-sub">{t('why_intro')}</p>
        </Reveal>

        <div className="hp-why-layout">
          <Reveal dir="left" className="hp-why-media-wrap">
            <div className="hp-why-media" role="img" aria-label="Global logistics" />
          </Reveal>
          <div className="hp-why-grid">
            {items.map((item, i) => (
              <Reveal key={item.title} delay={i * 0.08} dir="scale">
                <div className="hp-why-card">
                  <span className="hp-why-num">{String(i + 1).padStart(2, '0')}</span>
                  <div className="hp-why-icon"><item.icon /></div>
                  <h3>{item.title}</h3>
                  <p>{item.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

/* ═══════════════════════════════════════════════
   Services — numbered 01–05 list
   ═══════════════════════════════════════════════ */
function Services() {
  const { t } = useLanguage()
  const services = [
    { icon: Globe2, title: t('svc_cross'), desc: t('svc_cross_desc') },
    { icon: Truck, title: t('svc_local'), desc: t('svc_local_desc') },
    { icon: Users, title: t('svc_match'), desc: t('svc_match_desc') },
    { icon: Route, title: t('svc_e2e'), desc: t('svc_e2e_desc') },
    { icon: Settings2, title: t('svc_tailored'), desc: t('svc_tailored_desc') },
  ]
  return (
    <section id="services" className="hp-section alt">
      <div className="hp-container">
        <Reveal className="hp-section-head">
          <div className="hp-badge"><Truck /> {t('svc_badge')}</div>
          <h2 className="hp-section-title">
            {t('svc_title1')} <span className="hp-gradient-text">{t('svc_title2')}</span>
          </h2>
          <p className="hp-section-sub">{t('svc_sub')}</p>
        </Reveal>

        <div className="hp-svc-list">
          {services.map((s, i) => (
            <Reveal key={s.title} delay={i * 0.06}>
              <div className="hp-svc-row">
                <span className="hp-svc-index">{String(i + 1).padStart(2, '0')}</span>
                <div className="hp-svc-icon"><s.icon /></div>
                <div className="hp-svc-body">
                  <h3>{s.title}</h3>
                  <p>{s.desc}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal className="hp-svc-closing">
          <p>{t('svc_closing')}</p>
        </Reveal>
      </div>
    </section>
  )
}

/* ═══════════════════════════════════════════════
   New System Features
   ═══════════════════════════════════════════════ */
function NewFeatures() {
  const { t } = useLanguage()
  const feats = [
    { icon: MapIcon, label: t('feat_map'), optional: false },
    { icon: UserPlus, label: t('feat_register'), optional: false },
    { icon: Handshake, label: t('feat_meetup'), optional: false },
    { icon: Wallet, label: t('feat_wallet'), optional: true },
  ]
  return (
    <section className="hp-section">
      <div className="hp-container">
        <Reveal className="hp-section-head">
          <div className="hp-badge"><Sparkles /> {t('feat_badge')}</div>
          <h2 className="hp-section-title">
            {t('feat_title1')} <span className="hp-gradient-text">{t('feat_title2')}</span>
          </h2>
        </Reveal>

        <div className="hp-feat-grid">
          {feats.map((f, i) => (
            <Reveal key={f.label} delay={i * 0.07} dir="scale">
              <TiltCard intensity={8} className="h-full">
                <div className="hp-feat-tile">
                  <div className="hp-feat-icon"><f.icon /></div>
                  <p>
                    {f.label}
                    {f.optional && <span className="hp-feat-tag">{t('feat_optional')}</span>}
                  </p>
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
   Apps for Your Convenience — CTA band
   ═══════════════════════════════════════════════ */
function Apps() {
  const { t } = useLanguage()
  return (
    <section className="hp-section">
      <div className="hp-container">
        <Reveal dir="scale">
          <div className="hp-apps">
            <div className="hp-apps-inner">
              <div className="hp-apps-text">
                <div className="hp-apps-icon"><Smartphone /></div>
                <h2>{t('apps_title1')} {t('apps_title2')}</h2>
                <p>{t('apps_desc')}</p>
                <div className="hp-apps-actions">
                  <a
                    href="/downloads/afri-logistics-android.apk"
                    download="Afri-Logistics-Android.apk"
                    className="hp-apps-btn hp-apps-btn--android"
                    aria-label={`${t('apps_download_android')} — ${t('apps_android_size')}`}
                  >
                    <Download aria-hidden="true" />
                    <span>
                      <strong>{t('apps_download_android')}</strong>
                      <small>{t('apps_android_size')}</small>
                    </span>
                  </a>
                  <a
                    href={TELEGRAM_MINI_APP_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hp-apps-btn hp-apps-btn--telegram"
                    aria-label={t('apps_open_telegram')}
                  >
                    <IconTelegram aria-hidden="true" />
                    <span><strong>{t('apps_open_telegram')}</strong></span>
                  </a>
                </div>
              </div>

              {/* Decorative phone mockup; downloads start only from the CTA. */}
              <div className="hp-apps-phone-wrap">
                <img
                  src={phoneMockup}
                  alt=""
                  className="hp-apps-phone"
                  loading="lazy"
                  decoding="async"
                />
                <span className="hp-apps-phone-badge" aria-hidden="true">APK</span>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  )
}

/* ═══════════════════════════════════════════════
   Team
   ═══════════════════════════════════════════════ */
function Team() {
  const { t } = useLanguage()
  const members = [
    { name: 'Firomsa Imadudin Usman', role: 'Founder & General Manager', icon: UserCog, slug: 'Firomsa' },
    { name: 'Abdellah Dawud Ibrahim', role: 'Head of Freight Forwarding', icon: Globe2, slug: 'Abdellah' },
    { name: 'Abdurezaq Amin Usman', role: 'Operations Manager', icon: Truck, slug: 'Abdurezaq' },
    { name: 'Nasir Kadir Hatiya', role: 'Customer Relations Officer', icon: HeartHandshake, slug: 'Nasir' },
    { name: 'Samira Amin Usman', role: 'Finance & Administration Officer', icon: Wallet, slug: 'Samira' },
  ]
  const initials = (name: string) =>
    name.replace(/^Eng\.\s*/, '').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()

  return (
    <section id="team" className="hp-section alt">
      <div className="hp-container">
        <Reveal className="hp-section-head">
          <div className="hp-badge"><Users /> {t('team_badge')}</div>
          <h2 className="hp-section-title">
            {t('team_title1')} <span className="hp-gradient-text">{t('team_title2')}</span>
          </h2>
        </Reveal>

        <div className="hp-team-grid">
          {members.map((m, i) => (
            <Reveal key={m.name} delay={i * 0.08} dir="scale">
              <TiltCard intensity={9}>
                <div className="hp-team-card">
                  <div className="hp-team-avatar">
                    <span className="hp-team-initials">{initials(m.name)}</span>
                    <img
                      src={`/images/team/${m.slug}.webp`}
                      alt={m.name}
                      className="hp-team-photo"
                      loading="lazy"
                      decoding="async"
                      onError={e => { e.currentTarget.style.display = 'none' }}
                    />
                    <span className="hp-team-role-icon"><m.icon /></span>
                  </div>
                  <div className="hp-team-name">{m.name}</div>
                  <div className="hp-team-role">{m.role}</div>
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
   Contact — info + working form
   ═══════════════════════════════════════════════ */
function Contact() {
  const { t } = useLanguage()
  const [info, setInfo] = useState<ContactInfo>({})
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ name: '', request: '', email: '', phone: '' })
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [msg, setMsg] = useState('')

  useEffect(() => {
    configApi.getContactInfo()
      .then(r => setInfo((r.data as { contact?: ContactInfo }).contact ?? {}))
      .catch(() => { })
      .finally(() => setLoading(false))
  }, [])

  const phone = info.phone1 || '+251 91 155 5575'
  const email = info.email1 || 'info@afri-logistics.com'
  const address = info.po_box || 'Adama Gadaa Street, Adama, Ethiopia'

  const socials: Array<{ label: string; icon: React.ComponentType<SvgProps>; url?: string }> = [
    { label: 'Facebook', icon: IconFacebook, url: info.facebook_url || 'https://www.facebook.com/share/18uywoV22c/' },
    { label: 'TikTok', icon: IconTikTok, url: info.tiktok_url || 'https://tiktok.com/@afrilogistics2' },
    { label: 'Instagram', icon: IconInstagram, url: info.instagram_url },
    { label: 'WhatsApp', icon: IconWhatsApp, url: info.whatsapp_url || (info.whatsapp_number ? `https://wa.me/${info.whatsapp_number.replace(/\D/g, '')}` : 'https://wa.me/message/A7WFYICJ2T5KH1') },
    { label: 'Telegram', icon: IconTelegram, url: info.telegram_url || 'https://t.me/AfriLogisticsOfficial' },
  ]
  const activeSocials = socials.filter((social): social is { label: string; icon: React.ComponentType<SvgProps>; url: string } => Boolean(social.url))

  const cards = [
    { icon: Phone, color: '#71ad25', title: t('contact_call'), value: phone, href: `tel:${phone.replace(/\s/g, '')}` },
    { icon: Mail, color: '#8fc94a', title: t('contact_email_us'), value: email, href: `mailto:${email}` },
    { icon: MapPin, color: '#34d399', title: t('contact_visit'), value: address, href: null as string | null },
  ]

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) { setStatus('error'); setMsg(t('contact_err_name')); return }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) { setStatus('error'); setMsg(t('contact_err_email')); return }
    if (!form.phone.trim()) { setStatus('error'); setMsg(t('contact_err_phone')); return }
    setStatus('loading'); setMsg('')
    try {
      await configApi.submitContact(form)
      setStatus('success'); setMsg(t('contact_success'))
      setForm({ name: '', request: '', email: '', phone: '' })
    } catch (err: unknown) {
      const errorMessage = isAxiosError<{ message?: string }>(err)
        ? err.response?.data?.message
        : undefined
      setStatus('error'); setMsg(errorMessage || t('contact_error'))
    }
  }

  return (
    <section id="contact" className="hp-section">
      <div className="hp-container">
        <Reveal className="hp-section-head">
          <div className="hp-badge"><Send /> {t('contact_us_badge')}</div>
          <h2 className="hp-section-title">
            {t('get_in_touch')}<br />
            <span className="hp-gradient-text">{t('with_our_team')}</span>
          </h2>
          <p className="hp-section-sub">{t('contact_sub')}</p>
        </Reveal>

        <div className="hp-contact-split">
          {/* Left: info cards + socials */}
          <Reveal dir="left" className="hp-contact-info">
            {cards.map(c => (
              <div key={c.title} className="hp-contact-card">
                <div className="hp-contact-icon" style={{ background: `${c.color}1a`, border: `1px solid ${c.color}33` }}>
                  <c.icon style={{ color: c.color }} />
                </div>
                <div className="hp-contact-card-body">
                  <h3>{c.title}</h3>
                  {c.href
                    ? <a href={c.href}>{c.value}</a>
                    : <span>{c.value}</span>}
                </div>
              </div>
            ))}

            <div className="hp-social-block">
              <p className="hp-social-lbl">{t('contact_find_us')}</p>
              <div className="hp-social-links">
                {activeSocials.map(s => (
                  <a key={s.label} href={s.url} target="_blank" rel="noopener noreferrer" className="hp-social-link" aria-label={s.label}>
                    <s.icon /> <span>{s.label}</span>
                  </a>
                ))}
              </div>
            </div>
          </Reveal>

          {/* Right: form */}
          <Reveal dir="right" delay={0.1} className="hp-contact-form-wrap">
            <form className="hp-contact-form" onSubmit={onSubmit} noValidate>
              <h3>{t('contact_form_title')}</h3>
              <div className="hp-field-row">
                <div className="hp-field">
                  <label htmlFor="cf-name">{t('contact_name')}</label>
                  <input id="cf-name" className="hp-input" type="text" value={form.name} onChange={set('name')} placeholder={t('contact_name')} autoComplete="name" />
                </div>
                <div className="hp-field">
                  <label htmlFor="cf-phone">{t('contact_phone')}</label>
                  <input id="cf-phone" className="hp-input" type="tel" value={form.phone} onChange={set('phone')} placeholder={t('contact_phone')} autoComplete="tel" />
                </div>
              </div>
              <div className="hp-field">
                <label htmlFor="cf-email">{t('contact_email')}</label>
                <input id="cf-email" className="hp-input" type="email" value={form.email} onChange={set('email')} placeholder={t('contact_email')} autoComplete="email" />
              </div>
              <div className="hp-field">
                <label htmlFor="cf-request">{t('contact_request')}</label>
                <textarea id="cf-request" className="hp-textarea" rows={4} value={form.request} onChange={set('request')} placeholder={t('contact_request')} />
              </div>

              {status === 'error' && msg && <div className="hp-form-msg error">{msg}</div>}
              {status === 'success' && msg && <div className="hp-form-msg success">{msg}</div>}

              <button type="submit" className="hp-submit" disabled={status === 'loading' || loading}>
                {status === 'loading'
                  ? <><span className="hp-submit-spinner" /> {t('contact_submitting')}</>
                  : <>{t('contact_submit')} <Send /></>}
              </button>
            </form>
          </Reveal>
        </div>
      </div>
    </section>
  )
}

/* ═══════════════════════════════════════════════
   Footer
   ═══════════════════════════════════════════════ */
function Footer() {
  const { t } = useLanguage()
  const logoImg = useThemeLogo()
  const groups: { title: string; items: { label: string; href: string; route?: boolean }[] }[] = [
    {
      title: t('ft_group_company'),
      items: [
        { label: t('hp_menu_home'), href: '#home' },
        { label: t('about_us_badge'), href: '#about' },
        { label: t('svc_badge'), href: '#services' },
        { label: t('contact_us_badge'), href: '#contact' },
      ],
    },
    {
      title: t('ft_group_account'),
      items: [
        { label: t('login_sign_in_btn'), href: '/login', route: true },
        { label: t('aord_create_order'), href: '/login', route: true },
        { label: t('hp_menu_tracking'), href: '/login', route: true },
        { label: t('ve_dashboard'), href: '/login', route: true },
      ],
    },
    {
      title: t('ft_group_legal'),
      items: [
        { label: t('ft_privacy'), href: '#' },
        { label: t('ft_terms'), href: '#' },
      ],
    },
  ]
  return (
    <footer className="hp-footer">
      <div className="hp-container">
        <div className="hp-footer-grid">
          <div className="hp-footer-brand">
            <a href="#home" className="hp-logo" aria-label="Afri Logistics home" style={{ textDecoration: 'none' }}>
              <img src={logoImg} alt="Afri Logistics" className="hp-logo-img hp-logo-img--footer" />
            </a>
            <p>{t('ft_brand_blurb')}</p>
          </div>
          {groups.map(g => (
            <div key={g.title} className="hp-footer-col">
              <h4>{g.title}</h4>
              <ul>
                {g.items.map(l => (
                  <li key={l.label}>
                    {l.route ? <Link to={l.href}>{l.label}</Link> : <a href={l.href}>{l.label}</a>}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="hp-footer-bottom">
          <p>© {new Date().getFullYear()} Afri Logistics. {t('ft_rights')}</p>
          <p>{t('ft_tagline')}</p>
          <p className="hp-footer-credit">
            Made with 🧡 by{' '}
            <a href="https://wubsites.com" target="_blank" rel="noopener noreferrer">WubSites</a>.
          </p>
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
    <>
      <style>{`html { scroll-behavior: smooth; }`}</style>
      <AfricaLogisticsHero />
      <div className="hp-root">
        <ScrollProgress />
        <About />
        <WhyUs />
        <Services />
        <NewFeatures />
        <Apps />
        <Team />
        <Contact />
        <Footer />
      </div>
    </>
  )
}
