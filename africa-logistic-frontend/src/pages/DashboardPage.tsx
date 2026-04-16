import { useState, useRef, useEffect, type FormEvent, type ChangeEvent } from 'react'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import apiClient, { authApi, configApi } from '../lib/apiClient'
import aiLogoSrc from '../assets/logo-ai-assistant.webp'
import ShipperOrdersPage from './ShipperOrdersPage'
import DriverJobsPage from './DriverJobsPage'
import DriverReportPage from './DriverReportPage'
import ShipperReportPage from './ShipperReportPage'
import PhoneField from '../components/PhoneField'
import { normalisePhone } from '../lib/normalisePhone'
import WalletDashboard from '../components/WalletDashboard'
import TransactionHistory from '../components/TransactionHistory'
import InvoicesPage from '../components/InvoicesPage'
import ManualPaymentPage from '../components/ManualPaymentPage'
import {
  LuTruck, LuUser, LuShield, LuPackage, LuPhone, LuMail,
  LuIdCard, LuCircleCheck, LuTriangleAlert, LuCamera, LuTrash2,
  LuEye, LuEyeOff, LuLogOut, LuCheck, LuSmartphone, LuArrowLeft,
  LuLock, LuContact, LuBell, LuSun, LuMoon, LuMonitor, LuFileText,
  LuUpload, LuRefreshCw, LuStar, LuWallet, LuMessageSquare,
  LuLifeBuoy, LuClock, LuCar, LuX, LuChevronLeft, LuChevronRight,
  LuHistory, LuPlus, LuMapPin, LuChartColumnBig,
} from 'react-icons/lu'

// ─── Sub-components ──────────────────────────────────────────────────────────

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
      <span style={{ width: 22, textAlign: 'center', flexShrink: 0, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--clr-accent)' }}>{icon}</span>
      <span style={{ fontSize: '0.8rem', color: 'var(--clr-muted)', width: 68, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: '0.875rem', color: 'var(--clr-text)', fontWeight: 500, wordBreak: 'break-all' }}>{value}</span>
    </div>
  )
}

function Divider() {
  return <div style={{ height: 1, background: 'rgba(255,255,255,0.07)', margin: '0.25rem 0' }} />
}

function Spinner({ text }: { text: string }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
      <span className="spinner" />{text}
    </span>
  )
}

function PasswordInput({
  id, label, value, onChange, show, onToggle, hasError,
}: {
  id: string; label: string; value: string; onChange: (v: string) => void
  show: boolean; onToggle: () => void; hasError?: boolean
}) {
  return (
    <div className="input-wrap">
      <input
        id={id} type={show ? 'text' : 'password'} placeholder=" "
        value={value} onChange={e => onChange(e.target.value)} required
        className={hasError ? 'has-error' : ''} style={{ paddingRight: '2.8rem' }}
      />
      <label htmlFor={id}>{label}</label>
      <button type="button" className="input-suffix" onClick={onToggle}>{show ? <LuEyeOff size={16}/> : <LuEye size={16}/>}</button>
    </div>
  )
}

function SectionRow({
  title, sub, open, onToggle, toggleLabel, children,
}: {
  title: string; sub: string; open: boolean
  onToggle: () => void; toggleLabel: string; children?: React.ReactNode
}) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: open ? '1rem' : 0 }}>
        <div>
          <p style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--clr-text)' }}>{title}</p>
          <p style={{ fontSize: '0.78rem', color: 'var(--clr-muted)', marginTop: '0.1rem' }}>{sub}</p>
        </div>
        <button
          className="btn-outline"
          style={{ fontSize: '0.78rem', padding: '0.4rem 0.9rem', flexShrink: 0, marginLeft: '0.75rem' }}
          onClick={onToggle}
        >
          {toggleLabel}
        </button>
      </div>
      {open && children}
    </div>
  )
}

type Tab = 'profile' | 'security' | 'contact' | 'preferences' | 'documents'
type DockPage = 'account' | 'orders' | 'payments' | 'transactions' | 'help' | 'vehicle' | 'shipments' | 'report'



// ── Social icon SVGs ──────────────────────────────────────────────────────────
function IconYouTube() {
  return <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 0 0 .5 6.2 31 31 0 0 0 0 12a31 31 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1C4.5 20.4 12 20.4 12 20.4s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1A31 31 0 0 0 24 12a31 31 0 0 0-.5-5.8zM9.7 15.5V8.5l6.3 3.5-6.3 3.5z"/></svg>
}
function IconTikTok() {
  return <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M19.6 3h-3.2v11.6a3.2 3.2 0 1 1-3.2-3.2c.3 0 .6 0 .9.1V8.1a6.4 6.4 0 1 0 5.6 6.5V8.3a8.7 8.7 0 0 0 5.1 1.6V6.8A5.6 5.6 0 0 1 19.6 3z"/></svg>
}
function IconInstagram() {
  return <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 2.2c3.2 0 3.6 0 4.9.1 3.3.1 4.8 1.7 4.9 4.9.1 1.3.1 1.6.1 4.8s0 3.6-.1 4.8c-.1 3.2-1.7 4.8-4.9 4.9-1.3.1-1.6.1-4.9.1s-3.6 0-4.8-.1c-3.3-.1-4.8-1.7-4.9-4.9C2.2 15.6 2.2 15.3 2.2 12s0-3.6.1-4.8C2.4 3.9 4 2.3 7.2 2.3 8.4 2.2 8.8 2.2 12 2.2zm0-2.2C8.7 0 8.3 0 7.1.1 2.7.3.3 2.7.1 7.1 0 8.3 0 8.7 0 12s0 3.7.1 4.9C.3 21.3 2.7 23.7 7.1 23.9 8.3 24 8.7 24 12 24s3.7 0 4.9-.1c4.4-.2 6.8-2.6 7-7 .1-1.2.1-1.6.1-4.9s0-3.7-.1-4.9C23.7 2.7 21.4.3 16.9.1 15.7 0 15.3 0 12 0zm0 5.8a6.2 6.2 0 1 0 0 12.4A6.2 6.2 0 0 0 12 5.8zm0 10.2a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.4-11.8a1.4 1.4 0 1 0 0 2.8 1.4 1.4 0 0 0 0-2.8z"/></svg>
}
function IconX() {
  return <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M18.3 1.5h3.3L14.3 10l8.6 11.5h-7L10.7 14l-6 7.5H1.4l8-9.1L1.3 1.5h7.1l4.6 6.1zm-1.2 18.5h1.8L7 3.3H5L17.1 20z"/></svg>
}
function IconLinkedIn() {
  return <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M20.4 20.4h-3.6v-5.6c0-1.4 0-3.1-1.9-3.1s-2.2 1.5-2.2 3v5.7H9.2V9h3.4v1.6h.1a3.8 3.8 0 0 1 3.4-1.9c3.6 0 4.3 2.4 4.3 5.5v6.2zM5.3 7.4a2.1 2.1 0 1 1 0-4.2 2.1 2.1 0 0 1 0 4.2zM7.1 20.4H3.5V9h3.6v11.4zM22.2 0H1.8A1.8 1.8 0 0 0 0 1.8v20.4A1.8 1.8 0 0 0 1.8 24h20.4A1.8 1.8 0 0 0 24 22.2V1.8A1.8 1.8 0 0 0 22.2 0z"/></svg>
}
function IconWhatsApp() {
  return <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M17.5 14.4c-.3-.1-1.7-.8-1.9-.9-.3-.1-.5-.1-.7.1-.2.3-.7.9-.9 1.1-.2.2-.3.2-.6.1s-1.2-.5-2.3-1.4a8.7 8.7 0 0 1-1.6-1.9c-.2-.3 0-.4.1-.6l.5-.5c.1-.2.2-.3.3-.5s0-.4 0-.5c0-.2-.7-1.6-1-2.2-.2-.5-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4C9 8.4 8.1 9.3 8.1 11s1.2 3.3 1.4 3.5c.2.2 2.4 3.6 5.8 5.1 2.3 1 3.2 1 4.4.6 1.3-.4 2.2-1.5 2.4-3 .2-1.5.2-2.7 0-2.8z"/><path d="M12 0C5.4 0 0 5.4 0 12c0 2.1.6 4.2 1.6 6L0 24l6.3-1.6A12 12 0 1 0 12 0zm0 21.8a9.8 9.8 0 0 1-5-1.4l-.4-.2-3.7.9.9-3.6-.2-.4A9.8 9.8 0 1 1 12 21.8z"/></svg>
}
function IconTelegram() {
  return <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M11.9 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.5 0 11.9 0zm5.9 8.2-2 9.5c-.1.6-.5.8-1 .5l-2.8-2-1.3 1.3c-.2.2-.4.2-.7.2l.2-2.9 5-4.5c.2-.2 0-.3-.3-.1L7.3 14.8 4.6 13.9c-.6-.2-.6-.6.1-.8l11.5-4.4c.5-.2 1 .1.8.8.1 0 .1 0-.1-.3z"/></svg>
}

// ── Help & Support Page ───────────────────────────────────────────────────────
interface ContactInfo {
  phone1?: string; phone2?: string; email1?: string; email2?: string; po_box?: string
  youtube_url?: string; tiktok_url?: string; instagram_url?: string; x_url?: string
  linkedin_url?: string; whatsapp_number?: string; telegram_url?: string
}

function HelpAndSupportPage() {
  const [contact, setContact] = useState<ContactInfo>({})
  const [aiEnabled, setAiEnabled] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([configApi.getContactInfo(), configApi.getAiStatus()])
      .then(([c, a]) => {
        setContact((c.data as any).contact ?? {})
        setAiEnabled(Boolean((a.data as any).ai_enabled))
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'70vh' }}>
      <LuRefreshCw size={26} style={{ color:'var(--clr-accent)', animation:'spin 1s linear infinite' }}/>
    </div>
  )

  const contactItems = [
    ...(contact.phone1 ? [{ href:`tel:${contact.phone1}`,       icon:<LuPhone size={16}/>,  text:contact.phone1,  color:'#00e5ff', bg:'rgba(0,229,255,0.08)',   border:'rgba(0,229,255,0.18)'   }] : []),
    ...(contact.phone2 ? [{ href:`tel:${contact.phone2}`,       icon:<LuPhone size={16}/>,  text:contact.phone2,  color:'#00e5ff', bg:'rgba(0,229,255,0.08)',   border:'rgba(0,229,255,0.18)'   }] : []),
    ...(contact.email1 ? [{ href:`mailto:${contact.email1}`,    icon:<LuMail size={16}/>,   text:contact.email1,  color:'#818cf8', bg:'rgba(129,140,248,0.08)', border:'rgba(129,140,248,0.18)' }] : []),
    ...(contact.email2 ? [{ href:`mailto:${contact.email2}`,    icon:<LuMail size={16}/>,   text:contact.email2,  color:'#818cf8', bg:'rgba(129,140,248,0.08)', border:'rgba(129,140,248,0.18)' }] : []),
    ...(contact.po_box  ? [{ href:undefined,                    icon:<LuMapPin size={16}/>, text:contact.po_box,  color:'#fbbf24', bg:'rgba(251,191,36,0.08)',  border:'rgba(251,191,36,0.18)'  }] : []),
  ]

  const socialLinks = [
    { key:'youtube_url',     url:contact.youtube_url,     icon:<IconYouTube />,   label:'YouTube',   color:'#ff4444', bg:'rgba(255,68,68,0.1)',   border:'rgba(255,68,68,0.22)'   },
    { key:'tiktok_url',      url:contact.tiktok_url,      icon:<IconTikTok />,    label:'TikTok',    color:'#f0f0f0', bg:'rgba(255,255,255,0.06)', border:'rgba(255,255,255,0.12)' },
    { key:'instagram_url',   url:contact.instagram_url,   icon:<IconInstagram />, label:'Instagram', color:'#e1306c', bg:'rgba(225,48,108,0.1)',   border:'rgba(225,48,108,0.22)'  },
    { key:'x_url',           url:contact.x_url,           icon:<IconX />,         label:'X',         color:'#e7e9ea', bg:'rgba(231,233,234,0.06)', border:'rgba(231,233,234,0.12)' },
    { key:'linkedin_url',    url:contact.linkedin_url,    icon:<IconLinkedIn />,  label:'LinkedIn',  color:'#0a9ede', bg:'rgba(10,158,222,0.1)',   border:'rgba(10,158,222,0.22)'  },
    { key:'whatsapp_number', url:contact.whatsapp_number ? `https://wa.me/${contact.whatsapp_number.replace(/\D/g,'')}` : undefined, icon:<IconWhatsApp />, label:'WhatsApp', color:'#25d366', bg:'rgba(37,211,102,0.1)', border:'rgba(37,211,102,0.22)' },
    { key:'telegram_url',    url:contact.telegram_url,    icon:<IconTelegram />,  label:'Telegram',  color:'#2aabee', bg:'rgba(42,171,238,0.1)',   border:'rgba(42,171,238,0.22)'  },
  ].filter(s => s.url)

  const hasContact = contactItems.length > 0
  const nothingToShow = !hasContact && socialLinks.length === 0 && !aiEnabled

  return (
    <div className="page-enter" style={{ padding:'1.75rem 1.25rem 5rem', maxWidth:740, margin:'0 auto', width:'100%' }}>

      {/* ── Hero banner ── */}
      <div style={{ position:'relative', textAlign:'center', padding:'2.5rem 1.5rem 2.25rem', borderRadius:'1.5rem', background:'linear-gradient(155deg,rgba(0,229,255,0.06) 0%,rgba(139,92,246,0.07) 100%)', border:'1px solid rgba(255,255,255,0.07)', marginBottom:'1.5rem', overflow:'hidden' }}>
        <div style={{ position:'absolute', top:-50, right:-50, width:180, height:180, borderRadius:'50%', background:'radial-gradient(circle,rgba(0,229,255,0.1) 0%,transparent 70%)', pointerEvents:'none' }}/>
        <div style={{ position:'absolute', bottom:-30, left:-30, width:130, height:130, borderRadius:'50%', background:'radial-gradient(circle,rgba(139,92,246,0.1) 0%,transparent 70%)', pointerEvents:'none' }}/>
        <div style={{ position:'relative', width:80, height:80, borderRadius:'50%', background:'linear-gradient(135deg,rgba(0,229,255,0.12),rgba(139,92,246,0.12))', border:'1.5px solid rgba(0,229,255,0.22)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 1.25rem', color:'var(--clr-accent)' }}>
          <LuLifeBuoy size={36}/>
        </div>
        <h1 style={{ fontSize:'clamp(1.6rem,4.5vw,2.1rem)', fontWeight:900, color:'var(--clr-text)', margin:'0 0 0.5rem', letterSpacing:'-0.025em' }}>Help &amp; Support</h1>
        <p style={{ fontSize:'0.9rem', color:'var(--clr-muted)', margin:0 }}>Fast, friendly help — whenever you need it</p>
      </div>

      {/* ── AI spotlight ── */}
      {aiEnabled && (
        <div style={{ display:'flex', alignItems:'center', gap:'1.25rem', flexWrap:'wrap', padding:'1.4rem 1.6rem', borderRadius:'1.25rem', background:'linear-gradient(135deg,rgba(99,102,241,0.13) 0%,rgba(139,92,246,0.09) 100%)', border:'1px solid rgba(99,102,241,0.28)', marginBottom:'1.5rem', boxShadow:'0 4px 24px rgba(99,102,241,0.12)' }}>
          <div style={{ width:54, height:54, borderRadius:'14px', background:'rgba(99,102,241,0.18)', border:'1px solid rgba(99,102,241,0.32)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1.7rem', flexShrink:0 }}>🤖</div>
          <div style={{ flex:1, minWidth:150 }}>
            <div style={{ fontWeight:800, color:'var(--clr-text)', fontSize:'1rem', marginBottom:'0.22rem' }}>AI Assistant</div>
            <div style={{ fontSize:'0.8rem', color:'var(--clr-muted)', lineHeight:1.5 }}>Ask anything — instant intelligent answers, 24/7</div>
          </div>
          <button style={{ display:'flex', alignItems:'center', gap:'0.5rem', padding:'0.72rem 1.4rem', borderRadius:'0.75rem', border:'none', cursor:'pointer', background:'linear-gradient(135deg,#6366f1,#8b5cf6)', color:'#fff', fontWeight:700, fontSize:'0.87rem', whiteSpace:'nowrap', boxShadow:'0 4px 16px rgba(99,102,241,0.38)', flexShrink:0 }}>
            <LuMessageSquare size={15}/> Ask AI Assistant
          </button>
        </div>
      )}

      {/* ── Contact + Social grid ── */}
      {(hasContact || socialLinks.length > 0) && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(270px,1fr))', gap:'1rem' }}>

          {/* Contact card */}
          {hasContact && (
            <div className="glass" style={{ borderRadius:'1.25rem', padding:'1.5rem' }}>
              <div style={{ display:'flex', alignItems:'center', gap:'0.55rem', marginBottom:'1.15rem' }}>
                <div style={{ width:30, height:30, borderRadius:'8px', background:'rgba(0,229,255,0.1)', border:'1px solid rgba(0,229,255,0.18)', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--clr-accent)', flexShrink:0 }}>
                  <LuPhone size={13}/>
                </div>
                <span style={{ fontSize:'0.68rem', fontWeight:800, letterSpacing:'0.1em', textTransform:'uppercase', color:'var(--clr-accent)' }}>Contact Us</span>
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:'0.55rem' }}>
                {contactItems.map((item, i) => (
                  item.href
                    ? <a key={i} href={item.href} style={{ display:'flex', alignItems:'center', gap:'0.85rem', padding:'0.75rem 1rem', borderRadius:'0.75rem', background:item.bg, border:`1px solid ${item.border}`, textDecoration:'none' }}>
                        <span style={{ color:item.color, display:'flex', flexShrink:0 }}>{item.icon}</span>
                        <span style={{ fontSize:'0.875rem', fontWeight:500, color:'var(--clr-text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{item.text}</span>
                      </a>
                    : <div key={i} style={{ display:'flex', alignItems:'center', gap:'0.85rem', padding:'0.75rem 1rem', borderRadius:'0.75rem', background:item.bg, border:`1px solid ${item.border}` }}>
                        <span style={{ color:item.color, display:'flex', flexShrink:0 }}>{item.icon}</span>
                        <span style={{ fontSize:'0.875rem', fontWeight:500, color:'var(--clr-text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{item.text}</span>
                      </div>
                ))}
              </div>
            </div>
          )}

          {/* Social links card */}
          {socialLinks.length > 0 && (
            <div className="glass" style={{ borderRadius:'1.25rem', padding:'1.5rem' }}>
              <div style={{ display:'flex', alignItems:'center', gap:'0.55rem', marginBottom:'1.15rem' }}>
                <div style={{ width:30, height:30, borderRadius:'8px', background:'rgba(139,92,246,0.12)', border:'1px solid rgba(139,92,246,0.22)', display:'flex', alignItems:'center', justifyContent:'center', color:'#a78bfa', flexShrink:0 }}>
                  <LuStar size={13}/>
                </div>
                <span style={{ fontSize:'0.68rem', fontWeight:800, letterSpacing:'0.1em', textTransform:'uppercase', color:'#a78bfa' }}>Follow Us</span>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.5rem' }}>
                {socialLinks.map(s => (
                  <a key={s.key} href={s.url} target="_blank" rel="noopener noreferrer"
                    style={{ display:'flex', alignItems:'center', gap:'0.55rem', padding:'0.72rem 0.9rem', borderRadius:'0.75rem', background:s.bg, border:`1px solid ${s.border}`, textDecoration:'none', color:s.color, fontSize:'0.8rem', fontWeight:700 }}>
                    <span style={{ display:'flex', flexShrink:0 }}>{s.icon}</span>
                    <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{s.label}</span>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Empty state ── */}
      {nothingToShow && (
        <div className="glass" style={{ padding:'3.5rem 2rem', textAlign:'center', borderRadius:'1.25rem' }}>
          <LuLifeBuoy size={40} style={{ color:'var(--clr-muted)', opacity:.25, marginBottom:'1rem' }}/>
          <p style={{ fontSize:'0.9rem', color:'var(--clr-muted)', margin:0 }}>Support details coming soon.</p>
        </div>
      )}
    </div>
  )
}

// ── Bemnet AI Chat Widget ─────────────────────────────────────────────────────

interface ChatMsg { id: number; from: 'user'|'bot'; text: string; ts: string }

const BEMNET_GREET = "Hi! I'm **Bemnet**, your AI logistics assistant 👋\nHow can I help you today?"

const SAMPLE_QA: { q: RegExp; a: string }[] = [
  { q: /track|where.*order|order.*status/i,   a: "To track your order, go to **My Jobs** or **My Shipments** in the menu. You'll find real-time status updates there — including pickup, in-transit, and delivery confirmations." },
  { q: /pay|wallet|fund|balance/i,             a: "You can manage your wallet under the **Wallet** section. Add funds, view transaction history, and download invoices all in one place." },
  { q: /docum|verif|approv|kyc/i,              a: "Document verification is reviewed by our admin team within 24 hours. You can check your document status under **Account → Documents**." },
  { q: /price|cost|fee|rate|charg/i,           a: "Pricing is calculated based on route distance, vehicle type, and cargo weight. You'll see the exact quote before confirming any shipment." },
  { q: /driver|assign|pickup/i,                a: "Once your order is confirmed, a nearby verified driver will be assigned automatically. You'll receive a notification when assignment happens." },
  { q: /cancel|refund/i,                       a: "Cancellations can be made before a driver is assigned. For refunds, our support team processes them within 3–5 business days." },
  { q: /contact|email|phone|support/i,         a: "You can reach our support team via the **Help & Support** page in the menu. We're available 24/7 to assist you." },
  { q: /register|sign.?up|account/i,           a: "Registration is quick! Just provide your phone number, verify it with the OTP, and complete your profile. Drivers additionally need to upload their vehicle documents." },
  { q: /hello|hi|hey|good/i,                   a: "Hello! 😊 Great to hear from you. What can I help you with today — tracking, payments, or something else?" },
  { q: /thank/i,                               a: "You're welcome! 🙌 Feel free to ask me anything else." },
]

function fmtTime(d: Date) { return d.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' }) }

function BemnetChat({ aiEnabled }: { aiEnabled: boolean }) {
  const [open, setOpen]     = useState(false)
  const [msgs, setMsgs]     = useState<ChatMsg[]>([])
  const [input, setInput]   = useState('')
  const [typing, setTyping] = useState(false)
  const [mounted, setMounted] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef  = useRef<HTMLInputElement>(null)

  // Animate FAB in
  useEffect(() => { setTimeout(() => setMounted(true), 400) }, [])

  // Seed greeting when chat first opens
  useEffect(() => {
    if (open && msgs.length === 0) {
      setMsgs([{ id: 1, from:'bot', text: BEMNET_GREET, ts: fmtTime(new Date()) }])
    }
    if (open) setTimeout(() => inputRef.current?.focus(), 80)
  }, [open])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior:'smooth' })
  }, [msgs, typing])

  function renderText(text: string) {
    return text.split(/\*\*(.+?)\*\*/g).map((part, i) =>
      i % 2 === 1 ? <strong key={i} style={{ color:'var(--clr-accent)', fontWeight:700 }}>{part}</strong> : part
    )
  }

  function getBotReply(userMsg: string): string {
    for (const { q, a } of SAMPLE_QA) {
      if (q.test(userMsg)) return a
    }
    return "That's a great question! Our team is always improving Bemnet's knowledge base. For now, please visit the **Help & Support** page or contact our team directly — we'll get back to you ASAP. 🚀"
  }

  // Only render if AI is enabled
  if (!aiEnabled) return null

  function send() {
    const text = input.trim()
    if (!text) return
    const now = new Date()
    const userMsg: ChatMsg = { id: Date.now(), from:'user', text, ts: fmtTime(now) }
    setMsgs(prev => [...prev, userMsg])
    setInput('')
    setTyping(true)
    setTimeout(() => {
      setTyping(false)
      const reply: ChatMsg = { id: Date.now()+1, from:'bot', text: getBotReply(text), ts: fmtTime(new Date()) }
      setMsgs(prev => [...prev, reply])
    }, 900 + Math.random()*600)
  }

  return (
    <>
      {/* ── Floating action button ── */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          title="Chat with Bemnet AI"
          style={{
            position:'fixed', bottom:'5rem', right:'1.25rem', zIndex:1200,
            width:58, height:58, borderRadius:'50%', border:'2px solid rgba(0,229,255,0.35)', cursor:'pointer', padding:0,
            background:'rgba(8,11,20,0.85)',
            boxShadow:'0 8px 32px rgba(0,0,0,0.6), 0 0 0 1px rgba(0,229,255,0.12)',
            backdropFilter:'blur(16px)',
            display:'flex', alignItems:'center', justifyContent:'center',
            animation: mounted ? 'fab-pop 0.5s cubic-bezier(0.34,1.56,0.64,1) both, fab-pulse 2.5s 1.5s ease-in-out infinite' : 'none',
            transition:'transform .18s',
          }}
        >
          <img src={aiLogoSrc} alt="Bemnet AI" style={{ width:38, height:38, borderRadius:'50%', objectFit:'cover' }}/>
          {/* Notification badge */}
          <span style={{ position:'absolute', top:2, right:2, width:14, height:14, borderRadius:'50%', background:'#22c55e', border:'2px solid #080b14', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <span style={{ width:6, height:6, borderRadius:'50%', background:'#fff' }}/>
          </span>
        </button>
      )}

      {/* ── Chat panel ── */}
      {open && (
        <div style={{
          position:'fixed', bottom:'1rem', right:'1.25rem', zIndex:1200,
          width:'min(390px, calc(100vw - 2rem))',
          height:'min(580px, calc(100vh - 2rem))',
          display:'flex', flexDirection:'column',
          borderRadius:'1.5rem', overflow:'hidden',
          background:'rgba(8,11,20,0.96)',
          border:'1px solid rgba(99,102,241,0.3)',
          boxShadow:'0 32px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(99,102,241,0.15), inset 0 1px 0 rgba(255,255,255,0.06)',
          backdropFilter:'blur(24px)',
          animation:'chat-open 0.35s cubic-bezier(0.34,1.56,0.64,1) both',
        }}>

          {/* Header */}
          <div style={{
            padding:'1rem 1.1rem 0.9rem', flexShrink:0,
            background:'linear-gradient(135deg,rgba(99,102,241,0.18) 0%,rgba(139,92,246,0.12) 100%)',
            borderBottom:'1px solid rgba(99,102,241,0.2)',
            display:'flex', alignItems:'center', gap:'0.75rem',
          }}>
            {/* Avatar with online ring */}
            <div style={{ position:'relative', flexShrink:0 }}>
              <img src={aiLogoSrc} alt="Bemnet" style={{ width:44, height:44, borderRadius:'50%', objectFit:'cover', border:'2px solid rgba(99,102,241,0.5)' }}/>
              <span style={{ position:'absolute', bottom:1, right:1, width:11, height:11, borderRadius:'50%', background:'#22c55e', border:'2px solid rgba(8,11,20,0.96)' }}/>
            </div>
            <div style={{ flex:1 }}>
              <div style={{ fontWeight:800, fontSize:'0.97rem', color:'#e2e8f0', letterSpacing:'-0.01em' }}>Bemnet</div>
              <div style={{ fontSize:'0.72rem', color:'#22c55e', fontWeight:600, display:'flex', alignItems:'center', gap:'0.3rem' }}>
                <span style={{ width:6, height:6, borderRadius:'50%', background:'#22c55e', display:'inline-block' }}/> Online · AI Assistant
              </div>
            </div>
            {/* Close */}
            <button onClick={() => setOpen(false)} style={{ background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:'50%', width:32, height:32, cursor:'pointer', color:'#94a3b8', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, transition:'all .15s' }}>
              <LuX size={14}/>
            </button>
          </div>

          {/* Messages */}
          <div style={{ flex:1, overflowY:'auto', padding:'1rem 0.9rem', display:'flex', flexDirection:'column', gap:'0.75rem', scrollbarWidth:'thin', scrollbarColor:'rgba(99,102,241,0.3) transparent' }}>
            {msgs.map(msg => (
              <div key={msg.id} style={{ display:'flex', alignItems:'flex-end', gap:'0.5rem', flexDirection: msg.from==='user' ? 'row-reverse' : 'row', animation: msg.from==='user' ? 'msg-in-user 0.28s cubic-bezier(0.4,0,0.2,1) both' : 'msg-in-bot 0.28s cubic-bezier(0.4,0,0.2,1) both' }}>
                {/* Avatar */}
                {msg.from === 'bot' && (
                  <img src={aiLogoSrc} alt="Bemnet" style={{ width:28, height:28, borderRadius:'50%', objectFit:'cover', flexShrink:0, border:'1.5px solid rgba(99,102,241,0.4)' }}/>
                )}
                {msg.from === 'user' && (
                  <div style={{ width:28, height:28, borderRadius:'50%', background:'linear-gradient(135deg,#6366f1,#8b5cf6)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                    <LuUser size={13} color="#fff"/>
                  </div>
                )}
                {/* Bubble */}
                <div style={{ maxWidth:'72%', display:'flex', flexDirection:'column', gap:'0.2rem', alignItems: msg.from==='user' ? 'flex-end' : 'flex-start' }}>
                  <div style={{
                    padding:'0.6rem 0.9rem', borderRadius: msg.from==='user' ? '1.1rem 1.1rem 0.25rem 1.1rem' : '1.1rem 1.1rem 1.1rem 0.25rem',
                    background: msg.from==='user' ? 'linear-gradient(135deg,#6366f1,#8b5cf6)' : 'rgba(255,255,255,0.06)',
                    border: msg.from==='user' ? 'none' : '1px solid rgba(255,255,255,0.08)',
                    fontSize:'0.845rem', lineHeight:1.6, color: msg.from==='user' ? '#fff' : '#e2e8f0', fontWeight:450,
                    boxShadow: msg.from==='user' ? '0 4px 16px rgba(99,102,241,0.3)' : 'none',
                  }}>
                    {renderText(msg.text)}
                  </div>
                  <span style={{ fontSize:'0.65rem', color:'rgba(100,116,139,0.7)', padding:'0 0.2rem' }}>{msg.ts}</span>
                </div>
              </div>
            ))}

            {/* Typing indicator */}
            {typing && (
              <div style={{ display:'flex', alignItems:'flex-end', gap:'0.5rem' }}>
                <img src={aiLogoSrc} alt="Bemnet" style={{ width:28, height:28, borderRadius:'50%', objectFit:'cover', flexShrink:0, border:'1.5px solid rgba(99,102,241,0.4)' }}/>
                <div style={{ padding:'0.7rem 1rem', borderRadius:'1.1rem 1.1rem 1.1rem 0.25rem', background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.08)', display:'flex', gap:'4px', alignItems:'center' }}>
                  {[0,1,2].map(i=><span key={i} style={{ width:7, height:7, borderRadius:'50%', background:'var(--clr-accent)', display:'inline-block', animation:`typing-dot 1.2s ${i*0.2}s ease-in-out infinite` }}/>)}
                </div>
              </div>
            )}
            <div ref={bottomRef}/>
          </div>

          {/* Quick reply chips */}
          <div style={{ padding:'0 0.9rem 0.6rem', display:'flex', gap:'0.4rem', flexWrap:'wrap', flexShrink:0 }}>
            {['Track order','Wallet','Documents','Pricing'].map(q=>(
              <button key={q} onClick={() => { setInput(q); setTimeout(()=>{ const trimmed=q.trim(); if(!trimmed)return; const now=new Date(); setMsgs(prev=>[...prev,{id:Date.now(),from:'user',text:trimmed,ts:fmtTime(now)}]); setInput(''); setTyping(true); setTimeout(()=>{setTyping(false);setMsgs(prev=>[...prev,{id:Date.now()+1,from:'bot',text:getBotReply(trimmed),ts:fmtTime(new Date())}])},900+Math.random()*600) },0) }}
                style={{ padding:'0.35rem 0.75rem', borderRadius:99, background:'rgba(99,102,241,0.12)', border:'1px solid rgba(99,102,241,0.25)', color:'#a5b4fc', fontSize:'0.73rem', fontWeight:600, cursor:'pointer', whiteSpace:'nowrap' }}>
                {q}
              </button>
            ))}
          </div>

          {/* Input bar */}
          <div style={{ padding:'0.75rem 0.9rem 0.9rem', flexShrink:0, borderTop:'1px solid rgba(255,255,255,0.06)', background:'rgba(255,255,255,0.015)', display:'flex', gap:'0.6rem', alignItems:'center' }}>
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key==='Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
              placeholder="Message Bemnet…"
              style={{ flex:1, background:'rgba(255,255,255,0.05)', border:'1px solid rgba(99,102,241,0.25)', borderRadius:'0.85rem', padding:'0.65rem 1rem', color:'#e2e8f0', fontSize:'0.875rem', fontFamily:'inherit', outline:'none', transition:'border-color .2s, box-shadow .2s' }}
              onFocus={e => { e.target.style.borderColor='rgba(99,102,241,0.6)'; e.target.style.boxShadow='0 0 0 3px rgba(99,102,241,0.15)' }}
              onBlur={e => { e.target.style.borderColor='rgba(99,102,241,0.25)'; e.target.style.boxShadow='none' }}
            />
            <button
              onClick={send}
              disabled={!input.trim()}
              style={{ width:42, height:42, borderRadius:'0.75rem', border:'none', cursor:input.trim()?'pointer':'not-allowed', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', background: input.trim()?'linear-gradient(135deg,#6366f1,#8b5cf6)':'rgba(99,102,241,0.2)', transition:'all .2s', boxShadow:input.trim()?'0 4px 14px rgba(99,102,241,0.38)':'none' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={input.trim()?"#fff":"rgba(99,102,241,0.5)"} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
            </button>
          </div>
        </div>
      )}
    </>
  )
}

export default function DashboardPage() {
  const { user, logout, updateUser, refreshUser } = useAuth()
  const navigate = useNavigate()

  const roleLabel = user?.role_id === 1 ? 'Admin' : user?.role_id === 2 ? 'Shipper' : user?.role_id === 3 ? 'Driver' : user?.role_name ?? 'User'
  const roleIcon  = user?.role_id === 1 ? <LuShield size={30}/> : user?.role_id === 2 ? <LuPackage size={30}/> : user?.role_id === 3 ? <LuTruck size={30}/> : <LuUser size={30}/>

  const [activeTab, setActiveTab] = useState<Tab>('profile')

  // ── Theme preference ───────────────────────────────────────────────────────
  const [themeVal,   setThemeVal]   = useState<'LIGHT' | 'DARK' | 'SYSTEM'>('SYSTEM')
  const [themeLoading, setThemeLoading] = useState(false)
  const [themeMsg,   setThemeMsg]   = useState('')

  // Apply theme to <html data-theme="…"> — 'dark'|'light'|'system'
  const applyTheme = (t: 'LIGHT' | 'DARK' | 'SYSTEM') => {
    document.documentElement.setAttribute('data-theme', t.toLowerCase())
  }

  // Load theme from user object (already fetched on login via /auth/me)
  useEffect(() => {
    const saved = (user?.theme_preference ?? 'SYSTEM') as 'LIGHT' | 'DARK' | 'SYSTEM'
    setThemeVal(saved)
    applyTheme(saved)
  }, [user?.id])

  // React to OS-level preference changes when SYSTEM theme is active
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: light)')
    const handler = () => { if (themeVal === 'SYSTEM') applyTheme('SYSTEM') }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [themeVal])

  const handleSetTheme = async (t: 'LIGHT' | 'DARK' | 'SYSTEM') => {
    setThemeVal(t)
    applyTheme(t)
    setThemeLoading(true); setThemeMsg('')
    try {
      await apiClient.put('/profile/theme', { theme: t })
      setThemeMsg('Theme saved.')
      setTimeout(() => setThemeMsg(''), 2500)
    } catch { setThemeMsg('Failed to save theme.') }
    finally { setThemeLoading(false) }
  }

  // ── Notification preferences ────────────────────────────────────────────────
  const [notifPrefs, setNotifPrefs] = useState({ sms_enabled: 1, email_enabled: 1, browser_enabled: 1, telegram_enabled: 1, order_updates: 1, promotions: 0 })
  const [notifLoading, setNotifLoading] = useState(false)
  const [notifMsg,   setNotifMsg]   = useState('')

  useEffect(() => {
    apiClient.get('/profile/notifications').then(r => {
      if (r.data.preferences) setNotifPrefs(r.data.preferences)
    }).catch(() => {})
  }, [])

  const handleToggleNotif = async (key: keyof typeof notifPrefs) => {
    const next = { ...notifPrefs, [key]: notifPrefs[key] ? 0 : 1 }
    setNotifPrefs(next); setNotifLoading(true); setNotifMsg('')
    try {
      await apiClient.put('/profile/notifications', {
        sms_enabled: !!next.sms_enabled, email_enabled: !!next.email_enabled,
        browser_enabled: !!next.browser_enabled, telegram_enabled: !!next.telegram_enabled,
        order_updates: !!next.order_updates, promotions: !!next.promotions,
      })
      setNotifMsg('Preferences saved.')
      setTimeout(() => setNotifMsg(''), 2500)
    } catch { setNotifMsg('Failed to save.') }
    finally { setNotifLoading(false) }
  }

  // ── Driver documents ────────────────────────────────────────────────────────
  const [driverProfile, setDriverProfile] = useState<any>(null)
  const [docsLoading,   setDocsLoading]   = useState(false)
  const [docsError,     setDocsError]     = useState('')
  const [docsSuccess,   setDocsSuccess]   = useState('')
  const [uploadingDoc,  setUploadingDoc]  = useState<string | null>(null)

  useEffect(() => {
    if (user?.role_id === 3) {
      setDocsLoading(true)
      apiClient.get('/profile/driver').then(r => setDriverProfile(r.data.driver_profile)).catch(() => {}).finally(() => setDocsLoading(false))
    }
  }, [user?.role_id])

  const handleDocUpload = async (docKey: 'national_id' | 'license' | 'libre', file: File) => {
    if (file.size > 8 * 1024 * 1024) { setDocsError('Max file size is 8 MB'); return }
    setDocsError(''); setDocsSuccess(''); setUploadingDoc(docKey)
    const reader = new FileReader()
    reader.onload = async () => {
      try {
        await apiClient.post('/profile/driver/documents', { [docKey]: reader.result as string })
        const r = await apiClient.get('/profile/driver')
        setDriverProfile(r.data.driver_profile)
        setDocsSuccess(`${docKey.replace('_', ' ')} uploaded successfully.`)
        setTimeout(() => setDocsSuccess(''), 3000)
      } catch (err: any) {
        setDocsError(err.response?.data?.message || 'Upload failed.')
      } finally { setUploadingDoc(null) }
    }
    reader.readAsDataURL(file)
  }

  type TabDef = { id: Tab; icon: React.ReactNode; label: string }
  const [activePage, setActivePage] = useState<DockPage>('account')
  const [paymentTab, setPaymentTab] = useState<'wallet' | 'transactions' | 'invoices' | 'add-funds'>('wallet')

  // ── Dock expand/collapse state ─────────────────────────────────────────────
  const DOCK_KEY = 'dash_dock_v3'
  const [dockExpanded, setDockExpanded] = useState(() => {
    const saved = localStorage.getItem(DOCK_KEY)
    return saved === 'true'   // default: collapsed
  })
  const toggleDock = () => {
    const next = !dockExpanded
    setDockExpanded(next)
    localStorage.setItem(DOCK_KEY, String(next))
  }

  // ── Driver Vehicle ─────────────────────────────────────────────────────────
  interface DriverVehicle {
    id: string; plate_number: string; vehicle_type: string; max_capacity_kg: number
    vehicle_photo_url: string | null; libre_url: string | null; description: string | null
    is_approved: number; driver_submission_status: 'PENDING' | 'APPROVED' | 'REJECTED' | null
  }
  const [myVehicles,   setMyVehicles]   = useState<DriverVehicle[]>([])
  const [vehicleLoading, setVehicleLoading] = useState(false)
  const [vehicleToast, setVehicleToast] = useState('')
  const [showVehicleForm, setShowVehicleForm] = useState(false)
  const [vForm, setVForm] = useState({ plate_number:'', vehicle_type:'', max_capacity_kg:'', description:'' })
  const [vPhoto, setVPhoto]   = useState('')
  const [vLibre, setVLibre]   = useState('')
  const [vSubmitting, setVSubmitting] = useState(false)
  const [vFormError, setVFormError]   = useState('')
  const [vehicleTypes, setVehicleTypes] = useState<Array<{ id: number; name: string }>>([])
  const vPhotoRef = useRef<HTMLInputElement>(null)
  const vLibreRef = useRef<HTMLInputElement>(null)

  const _apiBase = (import.meta.env.VITE_API_BASE_URL as string ?? '').replace(/\/api$/, '')
  const absUrl = (raw: string | null | undefined) => !raw ? null : raw.startsWith('http') ? raw : `${_apiBase}${raw}`
  const vToast = (msg: string) => { setVehicleToast(msg); setTimeout(() => setVehicleToast(''), 3000) }

  const loadMyVehicles = () => {
    if (user?.role_id !== 3) return
    setVehicleLoading(true)
    apiClient.get('/profile/driver/vehicles').then(r => setMyVehicles(r.data.vehicles ?? [])).catch(() => {}).finally(() => setVehicleLoading(false))
  }

  useEffect(() => {
    if (activePage === 'vehicle') loadMyVehicles()
  }, [activePage]) // eslint-disable-line

  useEffect(() => {
    configApi.getVehicleTypes()
      .then(r => {
        const types = r.data.vehicle_types ?? []
        setVehicleTypes(types)
        if (!vForm.vehicle_type && types[0]?.name) {
          setVForm(f => ({ ...f, vehicle_type: types[0].name }))
        }
      })
      .catch(() => {})
  }, []) // eslint-disable-line

  const handleVFileSelect = (setter: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return
    if (file.size > 8 * 1024 * 1024) { setVFormError('Max 8 MB'); return }
    const reader = new FileReader()
    reader.onload = () => setter(reader.result as string)
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const handleVSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setVFormError('')
    if (!vForm.plate_number.trim()) { setVFormError('Plate number required'); return }
    const cap = parseFloat(vForm.max_capacity_kg)
    if (isNaN(cap) || cap <= 0) { setVFormError('Enter valid capacity'); return }
    setVSubmitting(true)
    try {
      const payload: Record<string, unknown> = {
        plate_number: vForm.plate_number.trim(),
        vehicle_type: vForm.vehicle_type,
        max_capacity_kg: cap,
        description: vForm.description.trim() || undefined,
      }
      if (vPhoto) payload.vehicle_photo = vPhoto
      if (vLibre) payload.libre_file = vLibre
      await apiClient.post('/profile/driver/vehicles', payload)
      vToast('Vehicle submitted for review!')
      setShowVehicleForm(false)
      setVForm({ plate_number:'', vehicle_type: vehicleTypes[0]?.name ?? '', max_capacity_kg:'', description:'' })
      setVPhoto(''); setVLibre('')
      loadMyVehicles()
    } catch (err: any) { setVFormError(err.response?.data?.message ?? 'Submission failed.') }
    finally { setVSubmitting(false) }
  }

  // ── Photo ──────────────────────────────────────────────────────────────────
  const photoInput    = useRef<HTMLInputElement>(null)
  const [photoLoading, setPhotoLoading] = useState(false)
  const [photoError,   setPhotoError]   = useState('')

  const handlePhotoChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) { setPhotoError('Max file size is 5 MB'); return }
    setPhotoError(''); setPhotoLoading(true)
    const reader = new FileReader()
    reader.onload = async () => {
      try {
        await authApi.updateProfile({
          profile_photo_base64: reader.result as string,
          profile_photo_filename: file.name,
        })
        await refreshUser()
      } catch (err: any) {
        setPhotoError(err.response?.data?.message || 'Photo upload failed.')
      } finally {
        setPhotoLoading(false)
        if (photoInput.current) photoInput.current.value = ''
      }
    }
    reader.readAsDataURL(file)
  }

  const handleDeletePhoto = async () => {
    setPhotoError(''); setPhotoLoading(true)
    try {
      await authApi.deleteProfilePhoto()
      updateUser({ profile_photo_url: null })
    } catch (err: any) {
      setPhotoError(err.response?.data?.message || 'Failed to remove photo.')
    } finally {
      setPhotoLoading(false)
    }
  }

  // ── Edit name ─────────────────────────────────────────────────────────────
  const [editFirst,   setEditFirst]   = useState(user?.first_name ?? '')
  const [editLast,    setEditLast]    = useState(user?.last_name ?? '')
  const [nameLoading, setNameLoading] = useState(false)
  const [nameError,   setNameError]   = useState('')
  const [nameSuccess, setNameSuccess] = useState(false)

  const handleSaveName = async (e: FormEvent) => {
    e.preventDefault()
    if (!editFirst.trim()) { setNameError('First name is required'); return }
    setNameError(''); setNameLoading(true)
    try {
      await authApi.updateProfile({ first_name: editFirst.trim(), last_name: editLast.trim() })
      updateUser({ first_name: editFirst.trim(), last_name: editLast.trim() })
      setNameSuccess(true)
      setTimeout(() => setNameSuccess(false), 3000)
    } catch (err: any) {
      setNameError(err.response?.data?.message || 'Failed to update name.')
    } finally {
      setNameLoading(false)
    }
  }

  // ── Change Password ────────────────────────────────────────────────────────
  const [showPwForm, setShowPwForm] = useState(false)
  const [currentPw,  setCurrentPw]  = useState('')
  const [newPw,      setNewPw]      = useState('')
  const [confirmPw,  setConfirmPw]  = useState('')
  const [showPw,     setShowPw]     = useState(false)
  const [pwLoading,  setPwLoading]  = useState(false)
  const [pwError,    setPwError]    = useState('')
  const [pwSuccess,  setPwSuccess]  = useState(false)

  const handleChangePassword = async (e: FormEvent) => {
    e.preventDefault()
    if (newPw !== confirmPw) { setPwError("Passwords don't match"); return }
    if (newPw.length < 6)    { setPwError('Minimum 6 characters'); return }
    setPwError(''); setPwLoading(true)
    try {
      await authApi.changePassword(currentPw, newPw)
      setPwSuccess(true); setCurrentPw(''); setNewPw(''); setConfirmPw('')
      setTimeout(() => { setPwSuccess(false); setShowPwForm(false) }, 2500)
    } catch (err: any) {
      setPwError(err.response?.data?.message || 'Failed to change password.')
    } finally {
      setPwLoading(false)
    }
  }

  // ── Email ──────────────────────────────────────────────────────────────────
  const [showEmailForm, setShowEmailForm] = useState(false)
  const [emailInput,    setEmailInput]    = useState('')
  const [emailLoading,  setEmailLoading]  = useState(false)
  const [emailError,    setEmailError]    = useState('')
  const [emailSent,     setEmailSent]     = useState(false)

  const handleLinkEmail = async (e: FormEvent) => {
    e.preventDefault()
    setEmailError(''); setEmailLoading(true)
    try {
      await authApi.requestEmailLink(emailInput)
      setEmailSent(true)
    } catch (err: any) {
      setEmailError(err.response?.data?.message || 'Failed to send link.')
    } finally {
      setEmailLoading(false)
    }
  }

  // ── Phone change ───────────────────────────────────────────────────────────
  const [showPhoneForm, setShowPhoneForm] = useState(false)
  const [phoneStep,     setPhoneStep]     = useState<'input' | 'otp'>('input')
  const [newPhone,      setNewPhone]      = useState<string>('')
  const [phoneOtp,      setPhoneOtp]      = useState('')
  const [phoneLoading,  setPhoneLoading]  = useState(false)
  const [phoneError,    setPhoneError]    = useState('')
  const [phoneSuccess,  setPhoneSuccess]  = useState(false)

  const handleRequestPhoneOtp = async (e: FormEvent) => {
    e.preventDefault()
    const normalised = normalisePhone(newPhone ?? '')
    if (!normalised) { setPhoneError('Enter a valid phone number'); return }
    setPhoneError(''); setPhoneLoading(true)
    try {
      await authApi.requestPhoneChange(normalised)
      setPhoneStep('otp')
    } catch (err: any) {
      setPhoneError(err.response?.data?.message || 'Failed to send OTP.')
    } finally {
      setPhoneLoading(false)
    }
  }

  const handleVerifyPhoneOtp = async (e: FormEvent) => {
    e.preventDefault()
    const normalised = normalisePhone(newPhone ?? '')
    setPhoneError(''); setPhoneLoading(true)
    try {
      await authApi.verifyPhoneChange(normalised, phoneOtp)
      updateUser({ phone_number: normalised })
      setPhoneSuccess(true)
      setTimeout(() => {
        setPhoneSuccess(false); setShowPhoneForm(false)
        setPhoneStep('input'); setNewPhone(''); setPhoneOtp('')
      }, 2500)
    } catch (err: any) {
      setPhoneError(err.response?.data?.message || 'Invalid OTP.')
    } finally {
      setPhoneLoading(false)
    }
  }

  // ── Delete account ─────────────────────────────────────────────────────────
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleteConfirm,   setDeleteConfirm]   = useState('')
  const [deleteLoading,   setDeleteLoading]   = useState(false)
  const [deleteError,     setDeleteError]     = useState('')

  const handleDeleteAccount = async () => {
    if (deleteConfirm !== 'DELETE') { setDeleteError('Type DELETE to confirm'); return }
    setDeleteError(''); setDeleteLoading(true)
    try {
      throw new Error('Account deletion not yet enabled.')
    } catch (err: any) {
      setDeleteError(err.message || 'Failed to delete account.')
      setDeleteLoading(false)
    }
  }

  const handleLogout = () => { logout(); navigate('/login') }
  const photoUrl = user?.profile_photo_url

  const tabs: TabDef[] = [
    { id: 'profile',     icon: <LuUser size={14}/>,     label: 'Profile'     },
    { id: 'security',    icon: <LuLock size={14}/>,     label: 'Security'    },
    { id: 'contact',     icon: <LuContact size={14}/>,  label: 'Contact'     },
    { id: 'preferences', icon: <LuBell size={14}/>,     label: 'Prefs'       },
    ...(user?.role_id === 3 ? [{ id: 'documents' as Tab, icon: <LuFileText size={14}/>, label: 'Docs' }] : []),
  ]

  // ── Dock items ─────────────────────────────────────────────────────────────
  const dockItems: { id: DockPage; icon: React.ReactNode; label: string; soon?: boolean }[] = [
    { id: 'account',      icon: <LuUser size={19}/>,          label: 'My Account'    },
    ...(user?.role_id === 3 ? [{ id: 'vehicle' as DockPage, icon: <LuCar size={19}/>, label: 'My Vehicle' }] : []),
    ...(user?.role_id === 2 ? [{ id: 'shipments' as DockPage, icon: <LuPackage size={19}/>, label: 'My Shipments' }] : []),
    ...(user?.role_id === 3 ? [{ id: 'orders' as DockPage, icon: <LuTruck size={19}/>, label: 'My Jobs' }] : []),
    ...((user?.role_id === 2 || user?.role_id === 3) ? [{ id: 'report' as DockPage, icon: <LuChartColumnBig size={19}/>, label: 'Report' }] : []),
    { id: 'payments',     icon: <LuWallet size={19}/>,        label: 'Wallet'        },
    { id: 'transactions', icon: <LuHistory size={19}/>,       label: 'History'       },
    { id: 'help',         icon: <LuLifeBuoy size={19}/>,      label: 'Help & Support' },
  ]

  // ── AI enabled state (for Bemnet chat) ────────────────────────────────────
  const [chatAiEnabled, setChatAiEnabled] = useState(false)
  useEffect(() => {
    configApi.getAiStatus().then(r => setChatAiEnabled(Boolean((r.data as any).ai_enabled))).catch(() => {})
  }, [])

  return (
    <div className="aurora-bg" style={{ minHeight: '100vh' }}>
      <div className="aurora-orb aurora-orb-1" />

      {/* ── Bemnet AI floating chat (shipper & driver only) ── */}
      <BemnetChat aiEnabled={chatAiEnabled} />

      {/* ── MOBILE BOTTOM DOCK ── */}
      <div className="dash-dock-mobile">
        {dockItems.map(item => (
          <button key={item.id}
            onClick={() => { if (!item.soon) setActivePage(item.id) }}
            title={item.soon ? `${item.label} — Coming Soon` : item.label}
            className={`dock-btn${activePage === item.id ? ' dock-btn-active' : ''}${item.soon ? ' dock-btn-soon' : ''}`}>
            <span className="dock-icon">{item.icon}</span>
            <span className="dock-label">{item.label}</span>
            {item.soon && <span className="dock-soon-dot"/>}
          </button>
        ))}
      </div>

      {/* ── DESKTOP LEFT DOCK ── */}
      <div className={`dash-dock-desktop${dockExpanded ? ' dock-expanded' : ''}`}>
        <div className="dock-avatar">
          {photoUrl
            ? <img src={photoUrl} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }}/>
            : roleIcon}
        </div>
        <div className="dock-divider"/>
        {dockItems.map(item => (
          <button key={item.id}
            onClick={() => { if (!item.soon) setActivePage(item.id) }}
            title={item.soon ? `${item.label} — Coming Soon` : item.label}
            className={`dock-btn${activePage === item.id ? ' dock-btn-active' : ''}${item.soon ? ' dock-btn-soon' : ''}`}
            style={{ flexDirection: dockExpanded ? 'row' : 'column', justifyContent: dockExpanded ? 'flex-start' : 'center', padding: dockExpanded ? '0.6rem 0.85rem' : '0.65rem 0.5rem', gap: dockExpanded ? '0.65rem' : '0.2rem' }}>
            <span className="dock-icon">{item.icon}</span>
            {dockExpanded && <span className="dock-item-label">{item.label}</span>}
            {item.soon && <span className="dock-soon-dot"/>}
          </button>
        ))}
        <div style={{ flex:1 }}/>
        <div className="dock-divider"/>
        <button onClick={toggleDock} className="dock-btn dock-toggle-btn"
          title={dockExpanded ? 'Collapse' : 'Expand'}>
          {dockExpanded ? <LuChevronLeft size={15}/> : <LuChevronRight size={15}/>}
        </button>
        <button onClick={handleLogout} className="dock-btn" title="Sign out"
          style={{ flexDirection:'column', gap:'0.2rem', padding:'0.65rem 0.5rem' }}>
          <LuLogOut size={18}/>
          {dockExpanded && <span className="dock-item-label">Sign Out</span>}
        </button>
      </div>

      {/* ── Main content area ── */}
      <div className={`dash-main${dockExpanded ? ' dock-wide' : ''}`}>
        {activePage === 'account' && (
          <div className="page-shell" style={{ alignItems:'flex-start' }}>
            <div style={{ width:'100%', maxWidth:560, display:'flex', flexDirection:'column', gap:'1.25rem' }}>

              {/* Header card */}
              <div className="glass page-enter" style={{ padding:'1.75rem' }}>
                <div style={{ display:'flex', alignItems:'flex-start', gap:'1.1rem' }}>
                  <div style={{ position:'relative', flexShrink:0 }}>
                    <div style={{ width:76, height:76, borderRadius:'50%', background: photoUrl ? 'transparent' : 'linear-gradient(135deg,var(--clr-accent2),var(--clr-accent))', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'2rem', overflow:'hidden', border:'2.5px solid rgba(0,229,255,0.3)', boxShadow:'0 0 24px rgba(0,229,255,0.2)' }}>
                      {photoUrl ? <img src={photoUrl} alt="Profile" style={{ width:'100%', height:'100%', objectFit:'cover' }}/> : roleIcon}
                    </div>
                    <button title="Change photo" onClick={() => photoInput.current?.click()} disabled={photoLoading}
                      style={{ position:'absolute', bottom:0, right:0, width:26, height:26, borderRadius:'50%', background:'var(--clr-accent)', border:'2px solid rgba(0,0,0,0.4)', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', boxShadow:'0 2px 8px rgba(0,0,0,0.5)' }}>
                      {photoLoading ? '…' : <LuCamera size={13}/>}
                    </button>
                    <input ref={photoInput} type="file" accept="image/jpeg,image/png,image/webp" style={{ display:'none' }} onChange={handlePhotoChange} />
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:'0.6rem', flexWrap:'wrap' }}>
                      <h1 style={{ fontSize:'1.2rem', fontWeight:800, color:'var(--clr-text)' }}>{user?.first_name} {user?.last_name}</h1>
                      <span className="badge badge-cyan">{roleLabel}</span>
                      {user?.role_id === 3 && driverProfile && (() => {
                        const st: string = driverProfile.status ?? 'OFFLINE'
                        const stColor: Record<string, string> = { AVAILABLE:'#4ade80', ON_JOB:'#60a5fa', OFFLINE:'#94a3b8', SUSPENDED:'#fca5a5' }
                        const stLabel: Record<string, string> = { AVAILABLE:'Available', ON_JOB:'On Job', OFFLINE:'Offline', SUSPENDED:'Suspended' }
                        const c = stColor[st] ?? '#94a3b8'
                        return (
                          <span style={{ display:'inline-flex', alignItems:'center', gap:'0.35rem', padding:'0.2rem 0.6rem', borderRadius:99, border:`1px solid ${c}44`, background:`${c}18`, fontSize:'0.72rem', fontWeight:700, color:c }}>
                            <span style={{ width:6, height:6, borderRadius:'50%', background:c, boxShadow:`0 0 4px ${c}`, display:'inline-block' }}/>
                            {stLabel[st] ?? st}
                          </span>
                        )
                      })()}
                    </div>
                    <p style={{ color:'var(--clr-muted)', fontSize:'0.83rem', marginTop:'0.15rem' }}>{user?.phone_number}</p>
                    {user?.email && (
                      <p style={{ color:'var(--clr-muted)', fontSize:'0.78rem', marginTop:'0.1rem' }}>
                        {user.email}{' '}
                        {user.is_email_verified
                          ? <span style={{ color:'#4ade80', fontSize:'0.72rem', display:'inline-flex', alignItems:'center', gap:'0.2rem' }}><LuCircleCheck size={12}/> verified</span>
                          : <span style={{ color:'#fbbf24', fontSize:'0.72rem' }}>(pending)</span>}
                      </p>
                    )}
                    {photoError && <p style={{ color:'#fca5a5', fontSize:'0.77rem', marginTop:'0.3rem' }}>{photoError}</p>}
                    {photoUrl && (
                      <button className="btn-outline" style={{ marginTop:'0.5rem', fontSize:'0.73rem', padding:'0.28rem 0.7rem', display:'flex', alignItems:'center', gap:'0.35rem' }}
                        onClick={handleDeletePhoto} disabled={photoLoading}>
                        <LuTrash2 size={13}/> Remove photo
                      </button>
                    )}
                  </div>
                  {/* Sign out only visible on mobile (desktop uses dock) */}
                  <button className="btn-outline dash-signout-mobile" style={{ flexShrink:0, fontSize:'0.78rem', display:'flex', alignItems:'center', gap:'0.35rem' }} onClick={handleLogout}>
                    <LuLogOut size={14}/>
                  </button>
                </div>
              </div>

              {/* Driver Rating — always visible */}
              {user?.role_id === 3 && (
                <div className="glass" style={{ padding:'1rem 1.25rem', display:'flex', flexDirection:'column', gap:'0.65rem' }}>
                  <h2 style={{ fontSize:'0.9rem', fontWeight:700, color:'var(--clr-text)', display:'flex', alignItems:'center', gap:'0.45rem', margin:0 }}><LuStar size={15} color="#fbbf24"/> My Rating</h2>
                  {driverProfile ? (
                    driverProfile.rating != null ? (
                      <>
                        <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', flexWrap:'wrap' }}>
                          {[1,2,3,4,5].map(n => <LuStar key={n} size={20} fill={n <= Math.round(driverProfile.rating) ? '#fbbf24' : 'none'} stroke={n <= Math.round(driverProfile.rating) ? '#fbbf24' : 'rgba(255,255,255,0.2)'}/>)}
                          <span style={{ fontSize:'1.2rem', fontWeight:800, color:'#fbbf24', marginLeft:'0.25rem' }}>{Number(driverProfile.rating).toFixed(1)}</span>
                          <span style={{ fontSize:'0.78rem', color:'var(--clr-muted)' }}>/ 5.0</span>
                        </div>
                        {driverProfile.total_trips > 0 && (
                          <p style={{ fontSize:'0.75rem', color:'var(--clr-muted)', margin:0 }}>Based on {driverProfile.total_trips} completed trip{driverProfile.total_trips !== 1 ? 's' : ''}</p>
                        )}
                      </>
                    ) : (
                      <p style={{ fontSize:'0.82rem', color:'var(--clr-muted)', margin:0 }}>No rating yet — complete deliveries to earn your score.</p>
                    )
                  ) : (
                    <p style={{ color:'var(--clr-muted)', fontSize:'0.82rem', margin:0 }}>Loading…</p>
                  )}
                </div>
              )}

              {/* Account sub-tabs */}
              <div style={{ display:'flex', gap:'0.4rem', background:'rgba(255,255,255,0.04)', borderRadius:14, padding:'0.32rem' }}>
                {tabs.map(t => (
                  <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
                    flex:1, padding:'0.5rem 0.35rem', border:'none', borderRadius:10,
                    background: activeTab === t.id ? 'rgba(0,229,255,0.12)' : 'transparent',
                    color: activeTab === t.id ? 'var(--clr-accent)' : 'var(--clr-muted)',
                    fontFamily:'inherit', fontSize:'0.78rem', fontWeight:600,
                    cursor:'pointer', transition:'all 0.18s',
                    display:'flex', alignItems:'center', justifyContent:'center', gap:'0.35rem',
                    outline: activeTab === t.id ? '1px solid rgba(0,229,255,0.2)' : 'none',
                  }}>
                    {t.icon}{t.label}
                  </button>
                ))}
              </div>

          {/* Profile tab */}
          {activeTab === 'profile' && (
            <div className="glass step-enter" style={{ padding: '1.75rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {user?.role_id === 3 && driverProfile && driverProfile.is_verified !== 1 && (() => {
                const completedDocs = (driverProfile.national_id_url ? 1 : 0) + (driverProfile.license_url ? 1 : 0) + (driverProfile.libre_url ? 1 : 0)
                const pct = Math.round((completedDocs / 3) * 100)
                return (
                  <div className="glass-inner" style={{ padding:'1rem', display:'flex', flexDirection:'column', gap:'0.6rem', borderLeft:'3px solid var(--clr-accent)' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                      <p style={{ fontWeight:700, fontSize:'0.875rem', color:'var(--clr-text)', display:'flex', alignItems:'center', gap:'0.4rem' }}>
                        <LuUpload size={14} color="var(--clr-accent)"/> Verification Progress
                      </p>
                      <span style={{ fontSize:'0.75rem', color:'var(--clr-muted)', fontWeight:600 }}>{completedDocs}/3 docs</span>
                    </div>
                    <div style={{ height:5, borderRadius:99, background:'rgba(255,255,255,0.08)', overflow:'hidden' }}>
                      <div style={{ height:'100%', width:`${pct}%`, borderRadius:99, background:'linear-gradient(90deg,var(--clr-accent2),var(--clr-accent))', transition:'width 0.4s' }}/>
                    </div>
                    <p style={{ fontSize:'0.78rem', color:'var(--clr-muted)', lineHeight:1.5 }}>
                      {completedDocs === 0 ? 'Upload your verification documents to get started.' : `${completedDocs} of 3 documents uploaded — ${3 - completedDocs} remaining.`}
                    </p>
                    <button onClick={() => setActiveTab('documents')} style={{ alignSelf:'flex-start', padding:'0.32rem 0.8rem', borderRadius:8, border:'1px solid rgba(0,229,255,0.25)', background:'rgba(0,229,255,0.07)', color:'var(--clr-accent)', fontFamily:'inherit', fontSize:'0.78rem', fontWeight:700, cursor:'pointer' }}>
                      Go to Documents →
                    </button>
                  </div>
                )
              })()}
              <h2 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--clr-text)', display:'flex', alignItems:'center', gap:'0.45rem' }}><LuUser size={16}/> Profile Information</h2>
              <div className="glass-inner" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                <InfoRow icon={<LuIdCard size={15}/>}       label="User ID" value={user?.id ? user.id.slice(0, 8) + '…' : '—'} />
                <InfoRow icon={<LuPhone size={15}/>}        label="Phone"   value={user?.phone_number ?? '—'} />
                <InfoRow icon={<LuMail size={15}/>}         label="Email"   value={user?.email || '— not linked'} />
                <InfoRow icon={<LuShield size={15}/>}       label="Role"    value={roleLabel} />
                <InfoRow icon={<LuCircleCheck size={15}/>}  label="Status"  value={user?.is_active ? 'Active' : 'Suspended'} />
              </div>
              <Divider />
              <form onSubmit={handleSaveName} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <p style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--clr-text)' }}>Display Name</p>
                {nameError   && <div className="alert alert-error"><LuTriangleAlert size={14}/> {nameError}</div>}
                {nameSuccess && <div className="alert alert-success" style={{display:'flex',alignItems:'center',gap:'0.4rem'}}><LuCheck size={14}/> Name saved!</div>}
                <div style={{ display: 'flex', gap: '0.65rem' }}>
                  <div className="input-wrap" style={{ flex: 1 }}>
                    <input id="ef" type="text" placeholder=" " value={editFirst} onChange={e => setEditFirst(e.target.value)} required />
                    <label htmlFor="ef">First name</label>
                  </div>
                  <div className="input-wrap" style={{ flex: 1 }}>
                    <input id="el" type="text" placeholder=" " value={editLast} onChange={e => setEditLast(e.target.value)} />
                    <label htmlFor="el">Last name</label>
                  </div>
                </div>
                <button type="submit" className="btn-primary" disabled={nameLoading}>
                  {nameLoading ? <Spinner text="Saving…" /> : 'Save Name'}
                </button>
              </form>
            </div>
          )}

          {/* Security tab */}
          {activeTab === 'security' && (
            <div className="glass step-enter" style={{ padding: '1.75rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <h2 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--clr-text)', display:'flex', alignItems:'center', gap:'0.45rem' }}><LuLock size={16}/> Security</h2>
              <SectionRow
                title="Password" sub="Update your login password"
                open={showPwForm} onToggle={() => { setShowPwForm(v => !v); setPwError(''); setPwSuccess(false) }}
                toggleLabel={showPwForm ? 'Cancel' : 'Change'}
              >
                <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }} className="step-enter">
                  {pwError   && <div className="alert alert-error"><LuTriangleAlert size={14}/> {pwError}</div>}
                  {pwSuccess && <div className="alert alert-success" style={{display:'flex',alignItems:'center',gap:'0.4rem'}}><LuCheck size={14}/> Password updated!</div>}
                  <PasswordInput id="cpw-cur" label="Current password"          value={currentPw} onChange={setCurrentPw} show={showPw} onToggle={() => setShowPw(v => !v)} />
                  <PasswordInput id="cpw-new" label="New password (min 6 chars)" value={newPw}     onChange={setNewPw}     show={showPw} onToggle={() => setShowPw(v => !v)} />
                  <PasswordInput id="cpw-cfg" label="Confirm new password"      value={confirmPw} onChange={setConfirmPw} show={showPw} onToggle={() => setShowPw(v => !v)}
                    hasError={!!(confirmPw && confirmPw !== newPw)} />
                  <button type="submit" className="btn-primary" disabled={pwLoading}>
                    {pwLoading ? <Spinner text="Saving…" /> : 'Update Password'}
                  </button>
                </form>
              </SectionRow>
              <Divider />
              <div className="danger-card">
                <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#fca5a5', marginBottom: '0.5rem', display:'flex', alignItems:'center', gap:'0.4rem' }}><LuTriangleAlert size={15}/> Danger Zone</h3>
                <p style={{ fontSize: '0.82rem', color: 'var(--clr-muted)', marginBottom: '1rem' }}>
                  Permanently delete your account and all associated data.
                </p>
                <button onClick={() => { setShowDeleteModal(true); setDeleteConfirm(''); setDeleteError('') }}
                  style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5', fontFamily: 'inherit', fontSize: '0.875rem', fontWeight: 600, padding: '0.6rem 1.2rem', borderRadius: 10, cursor: 'pointer', transition: 'all 0.2s' }}>
                  Delete My Account
                </button>
              </div>
            </div>
          )}

          {/* Contact tab */}
          {activeTab === 'contact' && (
            <div className="glass step-enter" style={{ padding: '1.75rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <h2 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--clr-text)', display:'flex', alignItems:'center', gap:'0.45rem' }}><LuSmartphone size={16}/> Contact Details</h2>

              <SectionRow
                title="Email Address"
                sub={user?.email ? `${user.email}${user.is_email_verified ? ' ✓' : ' (unverified)'}` : 'Link an email for recovery & notifications'}
                open={showEmailForm}
                onToggle={() => { setShowEmailForm(v => !v); setEmailError(''); setEmailSent(false) }}
                toggleLabel={showEmailForm ? 'Cancel' : user?.email ? 'Change' : 'Link'}
              >
                {emailSent ? (
                  <div className="alert alert-success step-enter" style={{display:'flex',alignItems:'center',gap:'0.4rem'}}>
                    <LuCheck size={14}/> Verification link sent to <strong>{emailInput}</strong>. Check your inbox and click the link.
                  </div>
                ) : (
                  <form onSubmit={handleLinkEmail} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }} className="step-enter">
                    {emailError && <div className="alert alert-error"><LuTriangleAlert size={14}/> {emailError}</div>}
                    <div className="input-wrap">
                      <input id="em-in" type="email" placeholder=" " value={emailInput}
                        onChange={e => setEmailInput(e.target.value)} required autoComplete="email" />
                      <label htmlFor="em-in">Email address</label>
                    </div>
                    <button type="submit" className="btn-primary" disabled={emailLoading}>
                      {emailLoading ? <Spinner text="Sending…" /> : 'Send Verification Link'}
                    </button>
                  </form>
                )}
              </SectionRow>

              <Divider />

              <SectionRow
                title="Phone Number" sub={user?.phone_number ?? 'Your verified phone'}
                open={showPhoneForm}
                onToggle={() => { setShowPhoneForm(v => !v); setPhoneError(''); setPhoneSuccess(false); setPhoneStep('input'); setPhoneOtp(''); setNewPhone('') }}
                toggleLabel={showPhoneForm ? 'Cancel' : 'Change'}
              >
                {phoneSuccess ? (
                  <div className="alert alert-success step-enter" style={{display:'flex',alignItems:'center',gap:'0.4rem'}}><LuCheck size={14}/> Phone number updated!</div>
                ) : phoneStep === 'input' ? (
                  <form onSubmit={handleRequestPhoneOtp} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }} className="step-enter">
                    {phoneError && <div className="alert alert-error"><LuTriangleAlert size={14}/> {phoneError}</div>}
                    <p style={{ fontSize: '0.8rem', color: 'var(--clr-muted)' }}>Enter your new number. An OTP will be sent to verify it.</p>
                    <PhoneField value={newPhone} onChange={setNewPhone} id="new-phone" />
                    <button type="submit" className="btn-primary" disabled={phoneLoading}>
                      {phoneLoading ? <Spinner text="Sending OTP…" /> : 'Send OTP to New Number'}
                    </button>
                  </form>
                ) : (
                  <form onSubmit={handleVerifyPhoneOtp} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }} className="step-enter">
                    {phoneError && <div className="alert alert-error"><LuTriangleAlert size={14}/> {phoneError}</div>}
                    <p style={{ fontSize: '0.8rem', color: 'var(--clr-muted)' }}>
                      OTP sent to <strong style={{ color: 'var(--clr-text)' }}>{normalisePhone(newPhone ?? '')}</strong>. Enter it below.
                    </p>
                    <div className="input-wrap">
                      <input id="ph-otp" type="text" inputMode="numeric" placeholder=" " maxLength={6}
                        value={phoneOtp} onChange={e => setPhoneOtp(e.target.value.replace(/\D/g, ''))} required />
                      <label htmlFor="ph-otp">6-digit OTP</label>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button type="button" className="btn-outline" style={{ flex: 1, display:'flex', alignItems:'center', gap:'0.3rem', justifyContent:'center' }}
                        onClick={() => setPhoneStep('input')} disabled={phoneLoading}><LuArrowLeft size={14}/> Back</button>
                      <button type="submit" className="btn-primary" style={{ flex: 2 }}
                        disabled={phoneLoading || phoneOtp.length < 6}>
                        {phoneLoading ? <Spinner text="Verifying…" /> : 'Verify & Update'}
                      </button>
                    </div>
                  </form>
                )}
              </SectionRow>
            </div>
          )}

          {/* Preferences tab */}
          {activeTab === 'preferences' && (
            <div className="glass step-enter" style={{ padding: '1.75rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {/* Theme */}
              <div>
                <h2 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--clr-text)', display:'flex', alignItems:'center', gap:'0.45rem', marginBottom:'1rem' }}><LuSun size={16}/> Display Theme</h2>
                <div style={{ display:'flex', gap:'0.6rem' }}>
                  {([['LIGHT', <LuSun size={15}/>, 'Light'], ['DARK', <LuMoon size={15}/>, 'Dark'], ['SYSTEM', <LuMonitor size={15}/>, 'System']] as const).map(([val, icon, label]) => (
                    <button key={val} onClick={() => handleSetTheme(val)} disabled={themeLoading}
                      style={{
                        flex: 1, padding: '0.7rem 0.5rem', borderRadius: 12, border: '1px solid',
                        borderColor: themeVal === val ? 'var(--clr-accent)' : 'rgba(255,255,255,0.10)',
                        background: themeVal === val ? 'rgba(0,229,255,0.10)' : 'rgba(255,255,255,0.03)',
                        color: themeVal === val ? 'var(--clr-accent)' : 'var(--clr-muted)',
                        fontFamily: 'inherit', fontSize: '0.82rem', fontWeight: 600,
                        cursor: 'pointer', transition: 'all 0.18s',
                        display:'flex', flexDirection:'column', alignItems:'center', gap:'0.35rem',
                      }}>
                      {icon}{label}
                    </button>
                  ))}
                </div>
                {themeMsg && <p style={{ fontSize:'0.78rem', color: themeMsg.includes('Failed') ? 'var(--clr-danger)' : '#86efac', marginTop:'0.5rem' }}>{themeMsg}</p>}
              </div>

              <Divider />

              {/* Notifications */}
              <div>
                <h2 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--clr-text)', display:'flex', alignItems:'center', gap:'0.45rem', marginBottom:'0.25rem' }}><LuBell size={16}/> Notifications</h2>
                <p style={{ fontSize:'0.78rem', color:'var(--clr-muted)', marginBottom:'1rem' }}>SMS is reserved for critical alerts only.</p>
                {notifMsg && <div className={`alert ${notifMsg.includes('Failed') ? 'alert-error' : 'alert-success'}`} style={{marginBottom:'0.75rem',display:'flex',alignItems:'center',gap:'0.4rem'}}><LuCheck size={13}/> {notifMsg}</div>}
                <div style={{ display:'flex', flexDirection:'column', gap:'0' }}>
                  {([
                    { key: 'sms_enabled',     icon: <LuSmartphone size={15}/>, label: 'SMS Alerts',            sub: 'Critical updates only — order status, OTPs' },
                    { key: 'email_enabled',   icon: <LuMail size={15}/>,       label: 'Email Notifications',   sub: 'Order summaries, receipts, account alerts' },
                    { key: 'browser_enabled', icon: <LuBell size={15}/>,       label: 'Browser Notifications', sub: 'Real-time web push alerts while browsing' },
                    { key: 'telegram_enabled', icon: <LuMessageSquare size={15}/>, label: 'Telegram Alerts',       sub: 'Real-time alerts via Telegram bot' },
                    { key: 'order_updates',   icon: <LuTruck size={15}/>,                label: 'Order Updates',         sub: 'Status changes on your logistics orders' },
                    { key: 'promotions',      icon: <LuStar size={15}/>,       label: 'Promotions',            sub: 'News, offers and platform announcements' },
                  ] as { key: keyof typeof notifPrefs; icon: React.ReactNode; label: string; sub: string }[]).map(({ key, icon, label, sub }, i, arr) => (
                    <div key={key} style={{ display:'flex', alignItems:'center', gap:'0.85rem', padding:'0.9rem 0', borderBottom: i < arr.length-1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                      <span style={{ color:'var(--clr-accent)', display:'flex', alignItems:'center', flexShrink:0 }}>{icon}</span>
                      <div style={{ flex:1 }}>
                        <p style={{ fontSize:'0.875rem', fontWeight:600, color:'var(--clr-text)' }}>{label}</p>
                        <p style={{ fontSize:'0.75rem', color:'var(--clr-muted)', marginTop:'0.1rem' }}>{sub}</p>
                      </div>
                      <button onClick={() => handleToggleNotif(key)} disabled={notifLoading}
                        style={{
                          width: 44, height: 24, borderRadius: 99, border: 'none', cursor: 'pointer',
                          background: notifPrefs[key] ? 'var(--clr-accent)' : 'rgba(255,255,255,0.12)',
                          transition: 'background 0.2s', flexShrink: 0, position: 'relative',
                        }}>
                        <span style={{
                          position:'absolute', top: 3, left: notifPrefs[key] ? 23 : 3,
                          width: 18, height: 18, borderRadius: '50%',
                          background: notifPrefs[key] ? '#080b14' : 'var(--clr-muted)',
                          transition: 'left 0.2s',
                        }} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Driver Documents tab */}
          {activeTab === 'documents' && user?.role_id === 3 && (
            <div className="glass step-enter" style={{ padding: '1.75rem', display:'flex', flexDirection:'column', gap:'1.25rem' }}>

              {/* ── Availability toggle card ── */}
              {driverProfile && (() => {
                const st: string = driverProfile.status ?? 'OFFLINE'
                const stColor: Record<string, string> = { AVAILABLE:'#4ade80', ON_JOB:'#60a5fa', OFFLINE:'#94a3b8', SUSPENDED:'#fca5a5' }
                const stLabel: Record<string, string> = { AVAILABLE:'Available', ON_JOB:'On Job', OFFLINE:'Offline', SUSPENDED:'Suspended' }
                const c = stColor[st] ?? '#94a3b8'
                return (
                  <div className="glass-inner" style={{ padding:'0.85rem 1rem', display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:'0.5rem' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:'0.5rem' }}>
                      <span style={{ width:8, height:8, borderRadius:'50%', background:c, boxShadow:`0 0 5px ${c}`, display:'inline-block' }}/>
                      <span style={{ fontSize:'0.82rem', fontWeight:700, color:c }}>{stLabel[st] ?? st}</span>
                      {st === 'AVAILABLE' && <span style={{ fontSize:'0.73rem', color:'var(--clr-muted)' }}>— available for orders</span>}
                      {st === 'OFFLINE'   && <span style={{ fontSize:'0.73rem', color:'var(--clr-muted)' }}>— not receiving orders</span>}
                      {st === 'ON_JOB'    && <span style={{ fontSize:'0.73rem', color:'var(--clr-muted)' }}>— delivery in progress</span>}
                      {st === 'SUSPENDED' && <span style={{ fontSize:'0.73rem', color:'#fca5a5' }}>— contact admin</span>}
                    </div>
                    {st === 'AVAILABLE' && (
                      <button onClick={async () => {
                        try { await apiClient.patch('/driver/status', { status:'OFFLINE' }); const r = await apiClient.get('/profile/driver'); setDriverProfile(r.data.driver_profile) } catch { /* ignore */ }
                      }} style={{ padding:'0.3rem 0.85rem', borderRadius:8, border:'1px solid rgba(148,163,184,0.35)', background:'rgba(148,163,184,0.08)', color:'#94a3b8', fontFamily:'inherit', fontSize:'0.75rem', fontWeight:700, cursor:'pointer' }}>
                        Go Offline
                      </button>
                    )}
                    {st === 'OFFLINE' && (
                      <button onClick={async () => {
                        try { await apiClient.patch('/driver/status', { status:'AVAILABLE' }); const r = await apiClient.get('/profile/driver'); setDriverProfile(r.data.driver_profile) } catch { /* ignore */ }
                      }} style={{ padding:'0.3rem 0.85rem', borderRadius:8, border:'1px solid rgba(74,222,128,0.35)', background:'rgba(74,222,128,0.08)', color:'#4ade80', fontFamily:'inherit', fontSize:'0.75rem', fontWeight:700, cursor:'pointer' }}>
                        Go Online
                      </button>
                    )}
                  </div>
                )
              })()}

              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <h2 style={{ fontSize:'0.95rem', fontWeight:700, color:'var(--clr-text)', display:'flex', alignItems:'center', gap:'0.45rem' }}><LuFileText size={16}/> Verification Documents</h2>
                <button className="btn-outline" style={{ fontSize:'0.75rem', padding:'0.35rem 0.7rem', display:'flex', alignItems:'center', gap:'0.35rem' }}
                  onClick={() => { setDocsLoading(true); apiClient.get('/profile/driver').then(r => setDriverProfile(r.data.driver_profile)).catch(()=>{}).finally(()=>setDocsLoading(false)) }}>
                  <LuRefreshCw size={13}/> Refresh
                </button>
              </div>

              {driverProfile?.is_verified === 1 && (
                <div className="alert alert-success" style={{ display:'flex', alignItems:'center', gap:'0.5rem', fontWeight:700 }}>
                  <LuCircleCheck size={15}/> Your account is fully verified!
                </div>
              )}
              {driverProfile?.rejection_reason && (
                <div className="alert alert-error">
                  <LuTriangleAlert size={14}/> Rejected: {driverProfile.rejection_reason}
                </div>
              )}

              {docsError   && <div className="alert alert-error"><LuTriangleAlert size={14}/> {docsError}</div>}
              {docsSuccess && <div className="alert alert-success" style={{display:'flex',alignItems:'center',gap:'0.4rem'}}><LuCheck size={14}/> {docsSuccess}</div>}

              {docsLoading ? (
                <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', color:'var(--clr-muted)', fontSize:'0.875rem', padding:'1rem 0' }}>
                  <span className="spinner" /> Loading…
                </div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:'0.85rem' }}>
                  {([
                    { key: 'national_id', label: 'National ID',             urlKey: 'national_id_url', statusKey: 'national_id_status' },
                    { key: 'license',     label: "Driver's License",        urlKey: 'license_url',     statusKey: 'license_status'     },
                    { key: 'libre',       label: 'Libre (Vehicle Ownership)', urlKey: 'libre_url',     statusKey: 'libre_status'       },
                  ] as { key: 'national_id'|'license'|'libre'; label: string; urlKey: string; statusKey: string }[]).map(doc => {
                    const rawUrl = driverProfile?.[doc.urlKey] as string | null
                    const apiBase = (import.meta.env.VITE_API_BASE_URL as string ?? '').replace(/\/api$/, '')
                    const url = rawUrl ? (rawUrl.startsWith('http') ? rawUrl : `${apiBase}${rawUrl}`) : null
                    const status = (driverProfile?.[doc.statusKey] ?? 'NOT UPLOADED') as string
                    const statusColor = status === 'APPROVED' ? '#4ade80' : status === 'REJECTED' ? '#fca5a5' : status === 'PENDING' ? '#fbbf24' : 'var(--clr-muted)'
                    const inputId = `doc-${doc.key}`
                    return (
                      <div key={doc.key} className="glass-inner" style={{ padding:'1rem', display:'flex', flexDirection:'column', gap:'0.65rem' }}>
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                          <p style={{ fontWeight:600, fontSize:'0.875rem', color:'var(--clr-text)' }}>{doc.label}</p>
                          <span style={{ fontSize:'0.73rem', fontWeight:700, color: statusColor, background: `${statusColor}18`, border: `1px solid ${statusColor}44`, borderRadius:99, padding:'0.2rem 0.6rem' }}>
                            {status}
                          </span>
                        </div>
                        {url && (
                          <a href={url} target="_blank" rel="noopener noreferrer"
                            style={{ fontSize:'0.78rem', color:'var(--clr-accent)', display:'flex', alignItems:'center', gap:'0.3rem', textDecoration:'none' }}>
                            <LuFileText size={13}/> View uploaded file ↗
                          </a>
                        )}
                        <label htmlFor={inputId} style={{
                          display:'flex', alignItems:'center', justifyContent:'center', gap:'0.5rem',
                          padding:'0.6rem', borderRadius:10, border:'1px dashed rgba(255,255,255,0.18)',
                          color: uploadingDoc === doc.key ? 'var(--clr-accent)' : 'var(--clr-muted)',
                          cursor: uploadingDoc ? 'not-allowed' : 'pointer',
                          fontSize:'0.82rem', fontWeight:600, transition:'all 0.18s',
                          background: 'rgba(255,255,255,0.02)',
                        }}>
                          {uploadingDoc === doc.key ? <><span className="spinner" /> Uploading…</> : <><LuUpload size={14}/> {url ? 'Replace' : 'Upload'} file</>}
                        </label>
                        <input id={inputId} type="file" accept="image/jpeg,image/png,image/webp,application/pdf"
                          style={{ display:'none' }} disabled={!!uploadingDoc}
                          onChange={e => { const f = e.target.files?.[0]; if(f) handleDocUpload(doc.key, f); e.target.value='' }} />
                        <p style={{ fontSize:'0.72rem', color:'var(--clr-muted)' }}>Accepted: JPG, PNG, WEBP, PDF · Max 8 MB</p>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}


          <p style={{ textAlign: 'center', fontSize: '0.73rem', color: 'var(--clr-muted)', paddingBottom: '1rem' }}>
            Africa Logistics Platform · v1.0
          </p>
            </div>
          </div>
        )}

        {activePage === 'payments' && (
          <div style={{ padding: '1.25rem 1.1rem 2rem', display: 'flex', flexDirection: 'column', gap: '1.25rem', overflowX: 'hidden', boxSizing: 'border-box', maxWidth: '100%' }}>
            <div className="glass" style={{ padding: '0.75rem 1rem', display: 'flex', gap: '0.5rem', overflow: 'auto' }}>
              <button
                onClick={() => setPaymentTab('wallet')}
                style={{
                  padding: '0.6rem 1rem', borderRadius: '8px', border: 'none',
                  background: paymentTab === 'wallet' ? 'rgba(0,229,255,0.15)' : 'transparent',
                  color: paymentTab === 'wallet' ? 'var(--clr-accent)' : 'var(--clr-muted)',
                  fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem',
                  fontFamily: 'inherit', transition: 'all 0.2s',
                  display: 'flex', alignItems: 'center', gap: '0.4rem', whiteSpace: 'nowrap'
                }}
              >
                <LuWallet size={16} /> Wallet
              </button>
              <button
                onClick={() => setPaymentTab('transactions')}
                style={{
                  padding: '0.6rem 1rem', borderRadius: '8px', border: 'none',
                  background: paymentTab === 'transactions' ? 'rgba(0,229,255,0.15)' : 'transparent',
                  color: paymentTab === 'transactions' ? 'var(--clr-accent)' : 'var(--clr-muted)',
                  fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem',
                  fontFamily: 'inherit', transition: 'all 0.2s',
                  display: 'flex', alignItems: 'center', gap: '0.4rem', whiteSpace: 'nowrap'
                }}
              >
                <LuHistory size={16} /> History
              </button>
              <button
                onClick={() => setPaymentTab('invoices')}
                style={{
                  padding: '0.6rem 1rem', borderRadius: '8px', border: 'none',
                  background: paymentTab === 'invoices' ? 'rgba(0,229,255,0.15)' : 'transparent',
                  color: paymentTab === 'invoices' ? 'var(--clr-accent)' : 'var(--clr-muted)',
                  fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem',
                  fontFamily: 'inherit', transition: 'all 0.2s',
                  display: 'flex', alignItems: 'center', gap: '0.4rem', whiteSpace: 'nowrap'
                }}
              >
                <LuFileText size={16} /> Invoices
              </button>
              <button
                onClick={() => setPaymentTab('add-funds')}
                style={{
                  padding: '0.6rem 1rem', borderRadius: '8px', border: 'none',
                  background: paymentTab === 'add-funds' ? 'rgba(0,229,255,0.15)' : 'transparent',
                  color: paymentTab === 'add-funds' ? 'var(--clr-accent)' : 'var(--clr-muted)',
                  fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem',
                  fontFamily: 'inherit', transition: 'all 0.2s',
                  display: 'flex', alignItems: 'center', gap: '0.4rem', whiteSpace: 'nowrap'
                }}
              >
                <LuPlus size={16} /> Add Funds
              </button>
            </div>

            {paymentTab === 'wallet' && <WalletDashboard />}
            {paymentTab === 'transactions' && <TransactionHistory />}
            {paymentTab === 'invoices' && <InvoicesPage />}
            {paymentTab === 'add-funds' && <ManualPaymentPage onSuccess={() => setPaymentTab('wallet')} />}
          </div>
        )}
        {activePage === 'transactions' && <TransactionHistory />}
        {activePage === 'help'         && <HelpAndSupportPage />}

        {/* ── My Shipments (shippers only) ── */}
        {activePage === 'shipments' && user?.role_id === 2 && <ShipperOrdersPage />}

        {/* ── My Jobs (drivers only) ── */}
        {activePage === 'orders' && user?.role_id === 3 && <DriverJobsPage />}

        {/* ── Driver Report (drivers only) ── */}
        {activePage === 'report' && user?.role_id === 3 && <DriverReportPage />}

        {/* ── Shipper Report (shippers only) ── */}
        {activePage === 'report' && user?.role_id === 2 && <ShipperReportPage />}

        {/* ── My Vehicle (drivers only) ── */}
        {activePage === 'vehicle' && user?.role_id === 3 && (
          <div className="page-shell" style={{ alignItems:'flex-start' }}>
            <div style={{ width:'100%', maxWidth:560, display:'flex', flexDirection:'column', gap:'1.25rem' }}>
              <div className="glass page-enter" style={{ padding:'1.5rem' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1rem', gap:'0.5rem', flexWrap:'wrap' }}>
                  <h2 style={{ fontSize:'1rem', fontWeight:800, color:'var(--clr-text)', display:'flex', alignItems:'center', gap:'0.45rem' }}><LuCar size={17}/> My Vehicle</h2>
                  <div style={{ display:'flex', gap:'0.4rem' }}>
                    <button onClick={loadMyVehicles} disabled={vehicleLoading}
                      style={{ display:'flex', alignItems:'center', gap:'0.35rem', padding:'0.3rem 0.65rem', borderRadius:8, border:'1px solid rgba(255,255,255,0.1)', background:'rgba(255,255,255,0.04)', color:'var(--clr-muted)', fontFamily:'inherit', fontSize:'0.72rem', fontWeight:600, cursor:'pointer' }}>
                      <LuRefreshCw size={12}/> Refresh
                    </button>
                    {!showVehicleForm && (
                      <button onClick={() => { setShowVehicleForm(true); setVFormError('') }}
                        style={{ display:'flex', alignItems:'center', gap:'0.35rem', padding:'0.3rem 0.75rem', borderRadius:8, border:'none', background:'var(--clr-accent)', color:'#080b14', fontFamily:'inherit', fontSize:'0.75rem', fontWeight:700, cursor:'pointer' }}>
                        + Submit Vehicle
                      </button>
                    )}
                  </div>
                </div>

                <p style={{ fontSize:'0.8rem', color:'var(--clr-muted)', marginBottom:'1rem', lineHeight:1.6 }}>
                  Own a vehicle? Submit it for admin approval. Once approved, it will be assigned to your driver profile.
                </p>

                {vehicleLoading ? (
                  <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', padding:'1.5rem', color:'var(--clr-muted)', fontSize:'0.875rem', justifyContent:'center' }}>
                    <span className="spinner"/> Loading…
                  </div>
                ) : myVehicles.length === 0 && !showVehicleForm ? (
                  <div style={{ padding:'2rem', textAlign:'center', color:'var(--clr-muted)', fontSize:'0.875rem', background:'rgba(255,255,255,0.02)', borderRadius:12, border:'1px dashed rgba(255,255,255,0.08)' }}>
                    <LuCar size={32} style={{ opacity:0.3, display:'block', margin:'0 auto 0.75rem' }}/>
                    No vehicles submitted yet.<br/>
                    <span style={{ fontSize:'0.78rem' }}>Click <strong style={{ color:'var(--clr-accent)' }}>Submit Vehicle</strong> above to get started.</span>
                  </div>
                ) : (
                  <div style={{ display:'flex', flexDirection:'column', gap:'0.65rem' }}>
                    {myVehicles.map(v => {
                      const st = v.driver_submission_status
                      const sColor = st === 'APPROVED' ? '#4ade80' : st === 'REJECTED' ? '#fca5a5' : '#fbbf24'
                      const imgUrl = absUrl(v.vehicle_photo_url)
                      return (
                        <div key={v.id} className="glass-inner" style={{ padding:'0.9rem 1rem', display:'flex', alignItems:'flex-start', gap:'0.75rem' }}>
                          <div style={{ width:44, height:44, borderRadius:10, flexShrink:0, background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.1)', display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden' }}>
                            {imgUrl ? <img src={imgUrl} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }}/> : <LuCar size={20} color="var(--clr-muted)"/>}
                          </div>
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ display:'flex', alignItems:'center', gap:'0.4rem', flexWrap:'wrap', marginBottom:'0.2rem' }}>
                              <span style={{ fontWeight:700, fontSize:'0.9rem', color:'var(--clr-text)' }}>{v.plate_number}</span>
                              <span className="badge badge-cyan" style={{ fontSize:'0.67rem' }}>{v.vehicle_type}</span>
                              <span style={{ fontSize:'0.68rem', fontWeight:700, color:sColor, background:`${sColor}18`, border:`1px solid ${sColor}44`, borderRadius:99, padding:'0.15rem 0.5rem' }}>
                                {st ?? 'PENDING'}
                              </span>
                            </div>
                            <p style={{ fontSize:'0.73rem', color:'var(--clr-muted)' }}>{v.max_capacity_kg} kg{v.description ? ` · ${v.description}` : ''}</p>
                            {v.libre_url && (
                              <a href={absUrl(v.libre_url)!} target="_blank" rel="noopener noreferrer" style={{ fontSize:'0.7rem', color:'var(--clr-accent)', display:'inline-flex', alignItems:'center', gap:'0.2rem', marginTop:'0.2rem', textDecoration:'none' }}>
                                <LuFileText size={11}/> View Libre ↗
                              </a>
                            )}
                            {st === 'PENDING' && (
                              <p style={{ fontSize:'0.73rem', color:'#fbbf24', marginTop:'0.25rem', display:'flex', alignItems:'center', gap:'0.3rem' }}>
                                <LuClock size={11}/> Under review by admin
                              </p>
                            )}
                            {st === 'APPROVED' && (
                              <p style={{ fontSize:'0.73rem', color:'#4ade80', marginTop:'0.25rem', display:'flex', alignItems:'center', gap:'0.3rem' }}>
                                <LuCircleCheck size={11}/> Approved — vehicle assigned to your profile
                              </p>
                            )}
                            {st === 'REJECTED' && (
                              <p style={{ fontSize:'0.73rem', color:'#fca5a5', marginTop:'0.25rem', display:'flex', alignItems:'center', gap:'0.3rem' }}>
                                <LuTriangleAlert size={11}/> Rejected — you may submit a new vehicle
                              </p>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Submit vehicle form */}
                {showVehicleForm && (
                  <div style={{ marginTop:'1rem', borderTop:'1px solid rgba(255,255,255,0.06)', paddingTop:'1rem' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'0.85rem' }}>
                      <h3 style={{ fontSize:'0.9rem', fontWeight:700, color:'var(--clr-text)' }}>Submit Your Vehicle</h3>
                      <button onClick={() => { setShowVehicleForm(false); setVFormError(''); setVPhoto(''); setVLibre('') }}
                        style={{ background:'none', border:'none', cursor:'pointer', color:'var(--clr-muted)', padding:0, display:'flex', alignItems:'center' }}>
                        <LuX size={16}/>
                      </button>
                    </div>
                    <form onSubmit={handleVSubmit} style={{ display:'flex', flexDirection:'column', gap:'0.75rem' }}>
                      {vFormError && <div className="alert alert-error"><LuTriangleAlert size={13}/> {vFormError}</div>}
                      <div className="input-wrap">
                        <input id="v-plate" type="text" placeholder=" " value={vForm.plate_number} onChange={e => setVForm(f => ({ ...f, plate_number: e.target.value }))} required/>
                        <label htmlFor="v-plate">Plate Number *</label>
                      </div>
                      <div className="input-wrap">
                        <select id="v-type" value={vForm.vehicle_type} onChange={e => setVForm(f => ({ ...f, vehicle_type: e.target.value }))}
                          style={{ background:'transparent', border:'none', color:'var(--clr-text)', fontFamily:'inherit', fontSize:'0.9rem', width:'100%', outline:'none', paddingTop:'1.1rem' }}>
                          <option value="" style={{ background:'#0f172a' }}>— Select vehicle type —</option>
                          {vehicleTypes.map(t => <option key={t.id} value={t.name} style={{ background:'#0f172a' }}>{t.name}</option>)}
                        </select>
                        <label htmlFor="v-type" style={{ top:'0.35rem', fontSize:'0.7rem', color:'var(--clr-accent)' }}>Vehicle Type</label>
                      </div>
                      <div className="input-wrap">
                        <input id="v-cap" type="number" placeholder=" " min="1" step="1" value={vForm.max_capacity_kg} onChange={e => setVForm(f => ({ ...f, max_capacity_kg: e.target.value }))} required/>
                        <label htmlFor="v-cap">Max Capacity (kg) *</label>
                      </div>
                      <div className="input-wrap">
                        <input id="v-desc" type="text" placeholder=" " value={vForm.description} onChange={e => setVForm(f => ({ ...f, description: e.target.value }))}/>
                        <label htmlFor="v-desc">Description (optional)</label>
                      </div>
                      {/* Photo */}
                      <label htmlFor="v-photo" style={{ display:'flex', alignItems:'center', gap:'0.5rem', padding:'0.6rem', borderRadius:10, border:'1px dashed rgba(255,255,255,0.18)', color: vPhoto ? 'var(--clr-accent)' : 'var(--clr-muted)', cursor:'pointer', fontSize:'0.82rem', fontWeight:600, background:'rgba(255,255,255,0.02)' }}>
                        <LuCamera size={14}/> {vPhoto ? 'Vehicle photo selected ✓' : 'Add vehicle photo (optional)'}
                      </label>
                      <input id="v-photo" ref={vPhotoRef} type="file" accept="image/jpeg,image/png,image/webp" style={{ display:'none' }} onChange={handleVFileSelect(setVPhoto)}/>
                      {/* Libre */}
                      <label htmlFor="v-libre" style={{ display:'flex', alignItems:'center', gap:'0.5rem', padding:'0.6rem', borderRadius:10, border:'1px dashed rgba(255,255,255,0.18)', color: vLibre ? 'var(--clr-accent)' : 'var(--clr-muted)', cursor:'pointer', fontSize:'0.82rem', fontWeight:600, background:'rgba(255,255,255,0.02)' }}>
                        <LuFileText size={14}/> {vLibre ? 'Libre document selected ✓' : 'Upload libre document (optional)'}
                      </label>
                      <input id="v-libre" ref={vLibreRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" style={{ display:'none' }} onChange={handleVFileSelect(setVLibre)}/>
                      <div style={{ display:'flex', gap:'0.6rem' }}>
                        <button type="button" className="btn-outline" style={{ flex:1 }} onClick={() => { setShowVehicleForm(false); setVFormError(''); setVPhoto(''); setVLibre('') }}>Cancel</button>
                        <button type="submit" className="btn-primary" style={{ flex:2 }} disabled={vSubmitting}>
                          {vSubmitting ? <Spinner text="Submitting…"/> : 'Submit for Review'}
                        </button>
                      </div>
                    </form>
                  </div>
                )}

                {vehicleToast && (
                  <div style={{ position:'fixed', bottom:'5.5rem', right:'1.25rem', zIndex:200, background:'rgba(0,229,255,0.12)', border:'1px solid rgba(0,229,255,0.25)', color:'var(--clr-text)', padding:'0.65rem 1.1rem', borderRadius:12, fontSize:'0.85rem', fontWeight:600, backdropFilter:'blur(12px)' }}>
                    {vehicleToast}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {showDeleteModal && (
        <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) setShowDeleteModal(false) }}>
          <div className="glass modal-box" style={{ padding: '2rem' }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#fca5a5', marginBottom: '0.5rem' }}>Delete Account</h2>
            <p style={{ color: 'var(--clr-muted)', fontSize: '0.875rem', marginBottom: '1.25rem' }}>
              This will permanently erase your account. Type <strong style={{ color: 'var(--clr-text)' }}>DELETE</strong> to confirm.
            </p>
            {deleteError && <div className="alert alert-error" style={{ marginBottom: '1rem' }}><LuTriangleAlert size={14}/> {deleteError}</div>}
            <div className="input-wrap" style={{ marginBottom: '1rem' }}>
              <input id="del-confirm" type="text" placeholder=" "
                value={deleteConfirm} onChange={e => setDeleteConfirm(e.target.value)} autoComplete="off" />
              <label htmlFor="del-confirm">Type DELETE</label>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button className="btn-outline" style={{ flex: 1 }} onClick={() => setShowDeleteModal(false)}>Cancel</button>
              <button disabled={deleteLoading || deleteConfirm !== 'DELETE'} onClick={handleDeleteAccount}
                style={{
                  flex: 1, padding: '0.75rem', borderRadius: 12, border: 'none',
                  background: deleteConfirm === 'DELETE' ? '#ef4444' : 'rgba(239,68,68,0.3)',
                  color: '#fff', fontFamily: 'inherit', fontSize: '0.875rem', fontWeight: 700,
                  cursor: deleteConfirm === 'DELETE' ? 'pointer' : 'not-allowed', transition: 'all 0.2s',
                }}>
                {deleteLoading ? <Spinner text="Deleting…" /> : 'Delete Forever'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
