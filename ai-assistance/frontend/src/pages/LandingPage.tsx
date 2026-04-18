import { Link } from 'react-router-dom'
import { motion, useInView, useScroll, useTransform, useMotionValue, useSpring, AnimatePresence } from 'framer-motion'
import { useRef, useEffect, useState, useCallback } from 'react'
import {
  Key,
  BarChart3,
  Zap,
  Shield,
  LayoutDashboard,
  ArrowRight,
  Check,
  Sparkles,
  Send,
  ChevronRight,
  Globe,
  GitFork,
  Bot,
  Cpu,
  BrainCircuit,
  Layers,
  Menu,
  X,
} from 'lucide-react'

/* ─── Easing ─── */
const ease = [0.25, 0.46, 0.45, 0.94] as [number, number, number, number]

/* ─── Animation Variants ─── */
const fadeUp = {
  hidden: { opacity: 0, y: 40 },
  visible: (i: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, delay: i * 0.1, ease },
  }),
}

const fadeIn = {
  hidden: { opacity: 0 },
  visible: (i: number = 0) => ({
    opacity: 1,
    transition: { duration: 0.8, delay: i * 0.12, ease },
  }),
}

const scaleIn = {
  hidden: { opacity: 0, scale: 0.85 },
  visible: (i: number = 0) => ({
    opacity: 1,
    scale: 1,
    transition: { duration: 0.7, delay: i * 0.1, ease },
  }),
}

const staggerContainer = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1 } },
}

/* ─── 3D Tilt Card ─── */
function TiltCard({
  children,
  className = '',
}: {
  children: React.ReactNode
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const rotateX = useSpring(useTransform(y, [-0.5, 0.5], [8, -8]), { stiffness: 200, damping: 20 })
  const rotateY = useSpring(useTransform(x, [-0.5, 0.5], [-8, 8]), { stiffness: 200, damping: 20 })

  const handleMouse = useCallback((e: React.MouseEvent) => {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    x.set((e.clientX - rect.left) / rect.width - 0.5)
    y.set((e.clientY - rect.top) / rect.height - 0.5)
  }, [x, y])

  const handleLeave = useCallback(() => {
    x.set(0)
    y.set(0)
  }, [x, y])

  return (
    <motion.div
      ref={ref}
      onMouseMove={handleMouse}
      onMouseLeave={handleLeave}
      style={{ rotateX, rotateY, transformStyle: 'preserve-3d' }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

/* ─── Animated Section Wrapper ─── */
function Section({
  children,
  className = '',
  id,
}: {
  children: React.ReactNode
  className?: string
  id?: string
}) {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-60px' })
  return (
    <motion.section
      ref={ref}
      id={id}
      initial="hidden"
      animate={inView ? 'visible' : 'hidden'}
      variants={staggerContainer}
      className={className}
    >
      {children}
    </motion.section>
  )
}

/* ─── Floating 3D Particles ─── */
function FloatingParticles() {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
      {Array.from({ length: 30 }).map((_, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full"
          style={{
            width: Math.random() * 4 + 1,
            height: Math.random() * 4 + 1,
            left: `${Math.random() * 100}%`,
            top: `${Math.random() * 100}%`,
            background: `rgba(${130 + Math.random() * 60}, ${140 + Math.random() * 60}, 248, ${0.15 + Math.random() * 0.3})`,
          }}
          animate={{
            y: [0, -40 - Math.random() * 60, 0],
            x: [0, (Math.random() - 0.5) * 30, 0],
            opacity: [0.2, 0.6, 0.2],
          }}
          transition={{
            duration: 4 + Math.random() * 6,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: Math.random() * 5,
          }}
        />
      ))}
    </div>
  )
}

/* ─── Abstract Grid Background ─── */
function GridBackground() {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `
            linear-gradient(rgba(148,163,184,0.3) 1px, transparent 1px),
            linear-gradient(90deg, rgba(148,163,184,0.3) 1px, transparent 1px)
          `,
          backgroundSize: '60px 60px',
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[var(--bg-primary)]" />
    </div>
  )
}

/* ─── Animated Counter ─── */
function AnimatedCounter({ value, suffix = '' }: { value: string; suffix?: string }) {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true })
  const numericPart = value.replace(/[^0-9.]/g, '')
  const prefix = value.replace(/[0-9.]/g, '')
  const target = parseFloat(numericPart) || 0
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (!inView || !target) return
    let frame: number
    const duration = 1500
    const start = performance.now()
    const animate = (now: number) => {
      const progress = Math.min((now - start) / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setCount(eased * target)
      if (progress < 1) frame = requestAnimationFrame(animate)
    }
    frame = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(frame)
  }, [inView, target])

  if (!target) return <span>{value}{suffix}</span>

  return (
    <span ref={ref}>
      {prefix}{target % 1 !== 0 ? count.toFixed(1) : Math.round(count)}{suffix}
    </span>
  )
}

/* ─── Data ─── */
const features = [
  {
    icon: BrainCircuit,
    title: 'AI Chat Assistant',
    desc: 'Conversational AI with RAG — understands your business data and answers with contextual precision.',
    gradient: 'from-violet-500 to-indigo-500',
  },
  {
    icon: Key,
    title: 'API Key Management',
    desc: 'Generate, rotate, and revoke API keys with full audit trail and usage tracking.',
    gradient: 'from-cyan-500 to-blue-500',
  },
  {
    icon: BarChart3,
    title: 'Real-time Analytics',
    desc: 'Live dashboards with usage trends, rate limits, and intelligent anomaly detection.',
    gradient: 'from-emerald-500 to-teal-500',
  },
  {
    icon: Zap,
    title: 'Streaming Responses',
    desc: 'Sub-200ms latency with real-time token streaming — answers appear instantly.',
    gradient: 'from-amber-500 to-orange-500',
  },
  {
    icon: Shield,
    title: 'Enterprise Security',
    desc: 'JWT auth, RBAC, rate limiting, encrypted storage, and complete audit logging.',
    gradient: 'from-rose-500 to-pink-500',
  },
  {
    icon: LayoutDashboard,
    title: 'Admin Control Panel',
    desc: 'Full visibility over users, payments, plans, sessions, and system health.',
    gradient: 'from-indigo-500 to-purple-500',
  },
]

const steps = [
  {
    num: '01',
    title: 'Create Account',
    desc: 'Sign up in 30 seconds. No credit card required.',
    icon: Layers,
  },
  {
    num: '02',
    title: 'Integrate or Chat',
    desc: 'Use the web chat or integrate via our REST API with a single key.',
    icon: Cpu,
  },
  {
    num: '03',
    title: 'Scale & Monitor',
    desc: 'Upgrade plans as you grow. Track every request in real-time.',
    icon: BarChart3,
  },
]

const plans = [
  {
    name: 'Starter',
    price: 'Free',
    period: '',
    limit: '500 requests / day',
    highlight: false,
    features: ['AI Chat Assistant', 'Single API Key', 'Usage Dashboard', 'Community Support'],
  },
  {
    name: 'Pro',
    price: '$9.99',
    period: '/mo',
    limit: '700 requests / day',
    highlight: true,
    features: [
      'Everything in Starter',
      'Multiple API Keys',
      'Priority Response',
      'Advanced Analytics',
      'Email Support',
    ],
  },
  {
    name: 'Ultra',
    price: '$29.99',
    period: '/mo',
    limit: 'Unlimited',
    highlight: false,
    features: [
      'Everything in Pro',
      'Unlimited Requests',
      'Dedicated Support',
      'Custom Integrations',
      'SLA Guarantee',
    ],
  },
]

const trustedLogos = ['OpenAI', 'Vercel', 'Stripe', 'AWS', 'Notion']

/* ═══════════════════════════════════════════════
   Landing Page
   ═══════════════════════════════════════════════ */
export default function LandingPage() {
  const { scrollYProgress } = useScroll()
  const scaleProgress = useTransform(scrollYProgress, [0, 1], [1, 0.97])

  return (
    <motion.div
      style={{ scale: scaleProgress }}
      className="min-h-screen bg-[var(--bg-primary)] text-slate-300 overflow-x-hidden"
    >
      <Navbar />
      <Hero />
      <TrustedBy />
      <Features />
      <HowItWorks />
      <Pricing />
      <Testimonials />
      <CtaBanner />
      <Footer />
    </motion.div>
  )
}

/* ─── Navbar ─── */
function Navbar() {
  const { scrollY } = useScroll()
  const bgOpacity = useTransform(scrollY, [0, 100], [0, 0.9])
  const borderOpacity = useTransform(scrollY, [0, 100], [0, 0.08])
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <>
      <motion.nav
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6, ease }}
        className="fixed top-0 left-0 right-0 z-50"
      >
        <motion.div
          className="absolute inset-0 backdrop-blur-xl"
          style={{
            backgroundColor: `rgba(8, 13, 26, ${bgOpacity.get()})`,
            borderBottom: `1px solid rgba(148, 163, 184, ${borderOpacity.get()})`,
          }}
        />
        <div className="relative max-w-7xl mx-auto flex items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center gap-2.5 group">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/20 group-hover:shadow-indigo-500/40 transition-shadow">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <span className="text-lg font-bold text-white tracking-tight">
              Bemnet<span className="text-gradient"> AI</span>
            </span>
          </Link>

          <div className="hidden md:flex items-center gap-1">
            {['Features', 'How It Works', 'Pricing'].map((item) => (
              <a
                key={item}
                href={`#${item.toLowerCase().replace(/ /g, '-')}`}
                className="text-sm text-slate-400 hover:text-white transition-colors px-4 py-2 rounded-lg hover:bg-white/5"
              >
                {item}
              </a>
            ))}
          </div>

          <div className="hidden md:flex items-center gap-3">
            <Link
              to="/login"
              className="text-sm text-slate-300 hover:text-white transition-all px-4 py-2.5 rounded-xl hover:bg-white/5"
            >
              Log in
            </Link>
            <Link
              to="/register"
              className="text-sm font-semibold text-white bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-400 hover:to-violet-500 px-5 py-2.5 rounded-xl transition-all duration-300 shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/40 hover:scale-[1.03]"
            >
              Get Started Free
            </Link>
          </div>

          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden text-slate-400 hover:text-white p-2"
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </motion.nav>

      {/* Mobile menu */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="fixed inset-x-0 top-[64px] z-40 glass-strong border-b border-[var(--border-subtle)] px-6 py-6 md:hidden"
          >
            <div className="flex flex-col gap-3">
              {['Features', 'How It Works', 'Pricing'].map((item) => (
                <a
                  key={item}
                  href={`#${item.toLowerCase().replace(/ /g, '-')}`}
                  onClick={() => setMobileOpen(false)}
                  className="text-slate-300 hover:text-white py-2 transition-colors"
                >
                  {item}
                </a>
              ))}
              <div className="h-px bg-[var(--border-subtle)] my-2" />
              <Link to="/login" className="text-slate-300 hover:text-white py-2">Log in</Link>
              <Link
                to="/register"
                className="text-center font-semibold text-white bg-gradient-to-r from-indigo-500 to-violet-600 px-5 py-3 rounded-xl"
              >
                Get Started Free
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

/* ─── Hero ─── */
function Hero() {
  const { scrollYProgress } = useScroll()
  const heroY = useTransform(scrollYProgress, [0, 0.3], [0, -80])
  const heroOpacity = useTransform(scrollYProgress, [0, 0.25], [1, 0])

  return (
    <motion.section
      style={{ y: heroY, opacity: heroOpacity }}
      className="relative pt-28 pb-16 md:pt-40 md:pb-28 px-6 overflow-hidden min-h-[100vh] flex items-center"
    >
      <GridBackground />
      <FloatingParticles />

      {/* Abstract 3D shapes */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
        {/* Primary glow sphere */}
        <motion.div
          animate={{ y: [0, -30, 0], rotate: [0, 5, 0] }}
          transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute top-16 left-[10%] w-[500px] h-[500px] rounded-full opacity-30"
          style={{
            background: 'radial-gradient(circle at 30% 30%, rgba(99,102,241,0.4), rgba(139,92,246,0.1) 60%, transparent 70%)',
            filter: 'blur(60px)',
          }}
        />
        {/* Secondary glow */}
        <motion.div
          animate={{ y: [0, 25, 0], rotate: [0, -3, 0] }}
          transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
          className="absolute bottom-20 right-[5%] w-[400px] h-[400px] rounded-full opacity-20"
          style={{
            background: 'radial-gradient(circle at 70% 70%, rgba(6,182,212,0.5), rgba(59,130,246,0.1) 60%, transparent 70%)',
            filter: 'blur(80px)',
          }}
        />
        {/* 3D Torus ring */}
        <motion.div
          animate={{ rotate: [0, 360] }}
          transition={{ duration: 40, repeat: Infinity, ease: 'linear' }}
          className="absolute top-[20%] right-[15%] w-[200px] h-[200px] md:w-[300px] md:h-[300px]"
        >
          <div
            className="w-full h-full rounded-full opacity-10"
            style={{
              border: '2px solid rgba(129,140,248,0.3)',
              boxShadow: '0 0 60px rgba(129,140,248,0.1), inset 0 0 60px rgba(129,140,248,0.05)',
              transform: 'perspective(600px) rotateX(60deg)',
            }}
          />
        </motion.div>
        {/* Floating diamond */}
        <motion.div
          animate={{ y: [0, -20, 0], rotate: [45, 50, 45] }}
          transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
          className="absolute bottom-[30%] left-[8%] w-12 h-12 md:w-16 md:h-16"
        >
          <div
            className="w-full h-full rotate-45 rounded-md opacity-20"
            style={{
              background: 'linear-gradient(135deg, rgba(129,140,248,0.5), rgba(167,139,250,0.2))',
              boxShadow: '0 0 40px rgba(129,140,248,0.15)',
            }}
          />
        </motion.div>
        {/* Floating orb small */}
        <motion.div
          animate={{ y: [0, -15, 0], x: [0, 10, 0] }}
          transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut', delay: 3 }}
          className="absolute top-[60%] right-[25%] w-6 h-6 rounded-full opacity-30"
          style={{
            background: 'linear-gradient(135deg, #818cf8, #a78bfa)',
            boxShadow: '0 0 30px rgba(129,140,248,0.3)',
          }}
        />
      </div>

      <div className="relative max-w-5xl mx-auto text-center w-full">
        {/* Badge */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.6, ease }}
          className="inline-flex items-center gap-2.5 px-5 py-2 rounded-full border border-indigo-500/20 bg-indigo-500/5 backdrop-blur-sm text-indigo-300 text-sm mb-8"
        >
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500" />
          </span>
          Powered by RAG + AI Intelligence
        </motion.div>

        {/* Heading */}
        <motion.h1
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.15, ease }}
          className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-extrabold tracking-tight text-white leading-[1.05] mb-7"
        >
          The Future of
          <br />
          <span className="text-gradient bg-gradient-to-r from-indigo-400 via-violet-400 to-cyan-400 bg-clip-text text-transparent">
            AI Assistance
          </span>
        </motion.h1>

        {/* Subtitle */}
        <motion.p
          initial={{ opacity: 0, y: 25 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.3, ease }}
          className="text-lg md:text-xl text-slate-400 max-w-2xl mx-auto mb-12 leading-relaxed"
        >
          Bemnet AI transforms your knowledge base into an intelligent assistant.
          Ask anything, get precise answers — powered by cutting-edge retrieval-augmented generation.
        </motion.p>

        {/* CTAs */}
        <motion.div
          initial={{ opacity: 0, y: 25 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.45, ease }}
          className="flex flex-col sm:flex-row items-center justify-center gap-4"
        >
          <Link
            to="/register"
            className="group relative flex items-center gap-2 text-white font-semibold px-8 py-4 rounded-2xl text-base transition-all duration-300 overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-indigo-500 to-violet-600 transition-all duration-300 group-hover:from-indigo-400 group-hover:to-violet-500" />
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" style={{ boxShadow: 'inset 0 0 40px rgba(255,255,255,0.1)' }} />
            <span className="relative z-10 flex items-center gap-2">
              Start Building Free
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
            </span>
          </Link>
          <a
            href="#features"
            className="group flex items-center gap-2 text-slate-300 hover:text-white border border-white/10 hover:border-white/20 px-8 py-4 rounded-2xl text-base transition-all duration-300 hover:bg-white/5 backdrop-blur-sm"
          >
            Explore Features
            <ChevronRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
          </a>
        </motion.div>

        {/* Stats */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.7, ease }}
          className="mt-20 grid grid-cols-3 gap-8 max-w-xl mx-auto"
        >
          {[
            { value: '99.9%', label: 'Uptime SLA' },
            { value: '<200ms', label: 'Avg Latency' },
            { value: '24/7', label: 'AI Available' },
          ].map(({ value, label }) => (
            <div key={label} className="relative">
              <p className="text-3xl md:text-4xl font-bold text-white">
                <AnimatedCounter value={value} />
              </p>
              <p className="text-sm text-slate-500 mt-1.5">{label}</p>
            </div>
          ))}
        </motion.div>

        {/* 3D Mockup / Abstract visual */}
        <motion.div
          initial={{ opacity: 0, y: 60, scale: 0.92 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 1, delay: 0.9, ease }}
          className="mt-20 relative"
        >
          <TiltCard className="relative mx-auto max-w-3xl perspective-[1200px]">
            <div className="relative rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.06] to-transparent backdrop-blur-sm p-1 shadow-2xl shadow-indigo-500/10">
              <div className="rounded-xl bg-[#0c1221] overflow-hidden">
                {/* Window chrome */}
                <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5">
                  <div className="flex gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-red-500/70" />
                    <div className="w-3 h-3 rounded-full bg-yellow-500/70" />
                    <div className="w-3 h-3 rounded-full bg-green-500/70" />
                  </div>
                  <div className="flex-1 flex justify-center">
                    <div className="px-4 py-1 rounded-md bg-white/5 text-xs text-slate-500">
                      bemnet-ai.app/chat
                    </div>
                  </div>
                </div>
                {/* Chat mockup */}
                <div className="p-6 space-y-4">
                  <div className="flex gap-3 items-start">
                    <div className="w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center shrink-0">
                      <Bot className="w-4 h-4 text-indigo-400" />
                    </div>
                    <div className="flex-1">
                      <div className="bg-white/5 rounded-xl rounded-tl-none px-4 py-3 text-sm text-slate-300 max-w-md">
                        Hello! I'm your AI assistant. I have access to your entire knowledge base. How can I help you today?
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-3 items-start justify-end">
                    <div className="flex-1 flex justify-end">
                      <div className="bg-indigo-500/20 border border-indigo-500/20 rounded-xl rounded-tr-none px-4 py-3 text-sm text-slate-200 max-w-md">
                        What's the total revenue from last quarter?
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-3 items-start">
                    <div className="w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center shrink-0">
                      <Bot className="w-4 h-4 text-indigo-400" />
                    </div>
                    <div className="flex-1">
                      <div className="bg-white/5 rounded-xl rounded-tl-none px-4 py-3 text-sm text-slate-300 max-w-md">
                        <div className="flex items-center gap-2 mb-2">
                          <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                          <span className="text-xs text-indigo-400 font-medium">Analyzing 3 documents...</span>
                        </div>
                        Based on your financial data, the total revenue for Q4 was <span className="text-white font-semibold">$2.4M</span>, up <span className="text-emerald-400 font-semibold">18.3%</span> from the previous quarter.
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            {/* Glow under the card */}
            <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 w-3/4 h-32 bg-indigo-500/10 blur-[80px] rounded-full" />
          </TiltCard>
        </motion.div>
      </div>
    </motion.section>
  )
}

/* ─── Trusted By / Logo Ticker ─── */
function TrustedBy() {
  return (
    <Section className="py-16 px-6 border-y border-[var(--border-subtle)]">
      <motion.div variants={fadeIn} className="max-w-5xl mx-auto text-center">
        <p className="text-xs tracking-[0.2em] uppercase text-slate-600 mb-8">
          Trusted by innovative teams
        </p>
        <div className="flex items-center justify-center gap-12 flex-wrap opacity-30">
          {trustedLogos.map((name) => (
            <span key={name} className="text-lg font-bold text-slate-500 tracking-wider">
              {name}
            </span>
          ))}
        </div>
      </motion.div>
    </Section>
  )
}

/* ─── Features ─── */
function Features() {
  return (
    <Section id="features" className="py-24 md:py-36 px-6 relative">
      <GridBackground />
      <div className="relative max-w-6xl mx-auto">
        <motion.div variants={fadeUp} className="text-center mb-20">
          <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-indigo-500/15 bg-indigo-500/5 text-indigo-400 text-xs tracking-wider uppercase mb-6">
            <Sparkles className="w-3 h-3" /> Features
          </span>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mt-2 mb-5 leading-tight">
            Everything you need,
            <br />
            <span className="text-gradient">nothing you don't</span>
          </h2>
          <p className="text-slate-400 max-w-xl mx-auto text-lg">
            A complete AI platform with chat, API access, analytics, and admin tools — beautifully unified.
          </p>
        </motion.div>

        <motion.div
          variants={staggerContainer}
          className="grid md:grid-cols-2 lg:grid-cols-3 gap-5"
        >
          {features.map((f, i) => (
            <TiltCard key={f.title}>
              <motion.div
                variants={fadeUp}
                custom={i}
                className="group relative rounded-2xl p-7 border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/[0.1] transition-all duration-500 h-full"
                style={{ transformStyle: 'preserve-3d' }}
              >
                {/* Gradient hover glow */}
                <div className={`absolute -inset-px rounded-2xl bg-gradient-to-br ${f.gradient} opacity-0 group-hover:opacity-[0.06] transition-opacity duration-500 blur-sm`} />

                <div
                  className={`relative w-12 h-12 rounded-xl bg-gradient-to-br ${f.gradient} bg-opacity-10 flex items-center justify-center mb-5 shadow-lg`}
                  style={{
                    background: `linear-gradient(135deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02))`,
                    border: '1px solid rgba(255,255,255,0.06)',
                  }}
                >
                  <f.icon className="w-5 h-5 text-indigo-400 group-hover:text-indigo-300 transition-colors" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2.5">{f.title}</h3>
                <p className="text-sm text-slate-400 leading-relaxed">{f.desc}</p>
              </motion.div>
            </TiltCard>
          ))}
        </motion.div>
      </div>
    </Section>
  )
}

/* ─── How It Works ─── */
function HowItWorks() {
  return (
    <Section id="how-it-works" className="py-24 md:py-36 px-6 relative">
      <div className="max-w-5xl mx-auto">
        <motion.div variants={fadeUp} className="text-center mb-20">
          <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-indigo-500/15 bg-indigo-500/5 text-indigo-400 text-xs tracking-wider uppercase mb-6">
            <Zap className="w-3 h-3" /> How It Works
          </span>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mt-2 mb-5 leading-tight">
            Three steps to
            <br />
            <span className="text-gradient">intelligent answers</span>
          </h2>
          <p className="text-slate-400 max-w-xl mx-auto text-lg">
            From signup to production in minutes. No complex setup, no infrastructure to manage.
          </p>
        </motion.div>

        <div className="relative grid md:grid-cols-3 gap-8 md:gap-6">
          {/* Connecting line */}
          <div className="hidden md:block absolute top-12 left-[20%] right-[20%] h-px">
            <div className="w-full h-full bg-gradient-to-r from-indigo-500/30 via-violet-500/30 to-indigo-500/30" />
            <motion.div
              className="absolute top-0 left-0 h-full bg-gradient-to-r from-indigo-500 to-violet-500"
              initial={{ width: '0%' }}
              whileInView={{ width: '100%' }}
              viewport={{ once: true }}
              transition={{ duration: 1.5, delay: 0.5, ease }}
            />
          </div>

          {steps.map((step, i) => (
            <motion.div
              key={step.num}
              variants={scaleIn}
              custom={i}
              className="relative text-center group"
            >
              <div className="relative inline-flex items-center justify-center w-20 h-20 rounded-2xl mb-6 bg-gradient-to-b from-white/[0.06] to-transparent border border-white/[0.08] group-hover:border-indigo-500/30 transition-all duration-500 shadow-lg shadow-black/20">
                <step.icon className="w-8 h-8 text-indigo-400 group-hover:text-indigo-300 transition-colors" />
                <div className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-[10px] font-bold text-white shadow-lg shadow-indigo-500/30">
                  {step.num.replace('0', '')}
                </div>
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">{step.title}</h3>
              <p className="text-sm text-slate-400 leading-relaxed max-w-[240px] mx-auto">{step.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </Section>
  )
}

/* ─── Pricing ─── */
function Pricing() {
  return (
    <Section id="pricing" className="py-24 md:py-36 px-6 relative">
      <GridBackground />
      <div className="relative max-w-5xl mx-auto">
        <motion.div variants={fadeUp} className="text-center mb-20">
          <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-indigo-500/15 bg-indigo-500/5 text-indigo-400 text-xs tracking-wider uppercase mb-6">
            Pricing
          </span>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mt-2 mb-5 leading-tight">
            Simple, transparent
            <br />
            <span className="text-gradient">pricing</span>
          </h2>
          <p className="text-slate-400 max-w-xl mx-auto text-lg">
            Start free. Scale when you're ready. No hidden fees, no surprises.
          </p>
        </motion.div>

        <motion.div
          variants={staggerContainer}
          className="grid md:grid-cols-3 gap-6 items-stretch perspective-[1200px]"
        >
          {plans.map((plan, i) => (
            <TiltCard key={plan.name}>
              <motion.div
                variants={fadeUp}
                custom={i}
                className={`relative rounded-2xl p-8 flex flex-col transition-all duration-500 h-full ${
                  plan.highlight
                    ? 'border border-indigo-500/30 bg-gradient-to-b from-indigo-950/60 to-[var(--bg-surface)]/40 shadow-2xl shadow-indigo-500/10'
                    : 'border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/[0.1]'
                }`}
              >
                {plan.highlight && (
                  <>
                    <div className="absolute -top-px left-8 right-8 h-px bg-gradient-to-r from-transparent via-indigo-500 to-transparent" />
                    <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                      <span className="bg-gradient-to-r from-indigo-500 to-violet-600 text-white text-xs font-semibold px-4 py-1.5 rounded-full shadow-lg shadow-indigo-500/30">
                        Most Popular
                      </span>
                    </div>
                  </>
                )}

                <div className="mb-8">
                  <h3 className="text-xl font-bold text-white">{plan.name}</h3>
                  <p className="text-sm text-slate-500 mt-1">{plan.limit}</p>
                </div>

                <div className="mb-8">
                  <span className="text-5xl font-extrabold text-white tracking-tight">{plan.price}</span>
                  {plan.period && (
                    <span className="text-slate-500 text-base ml-1">{plan.period}</span>
                  )}
                </div>

                <ul className="space-y-3.5 mb-10 flex-1">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-3 text-sm text-slate-300">
                      <div className="w-5 h-5 rounded-full bg-indigo-500/10 flex items-center justify-center shrink-0 mt-0.5">
                        <Check className="w-3 h-3 text-indigo-400" />
                      </div>
                      {f}
                    </li>
                  ))}
                </ul>

                <Link
                  to="/register"
                  className={`block text-center py-3.5 rounded-xl text-sm font-semibold transition-all duration-300 ${
                    plan.highlight
                      ? 'bg-gradient-to-r from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/40 hover:scale-[1.02]'
                      : 'border border-white/10 text-slate-300 hover:text-white hover:border-white/20 hover:bg-white/5'
                  }`}
                >
                  Get Started
                </Link>
              </motion.div>
            </TiltCard>
          ))}
        </motion.div>
      </div>
    </Section>
  )
}

/* ─── Testimonials ─── */
function Testimonials() {
  const testimonials = [
    {
      quote: "Bemnet AI transformed how our team handles support queries. Response time dropped by 90%.",
      author: "Sarah K.",
      role: "CTO, TechFlow",
    },
    {
      quote: "The API integration took minutes, not days. Best developer experience I've seen in an AI product.",
      author: "Marcus T.",
      role: "Lead Developer, DataPulse",
    },
    {
      quote: "Finally an AI assistant that actually understands our domain data. Game changer for our operations.",
      author: "Amira R.",
      role: "VP Operations, LogiPro",
    },
  ]

  return (
    <Section className="py-24 md:py-36 px-6">
      <div className="max-w-6xl mx-auto">
        <motion.div variants={fadeUp} className="text-center mb-16">
          <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-indigo-500/15 bg-indigo-500/5 text-indigo-400 text-xs tracking-wider uppercase mb-6">
            Testimonials
          </span>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mt-2 mb-5">
            Loved by teams
          </h2>
        </motion.div>

        <motion.div variants={staggerContainer} className="grid md:grid-cols-3 gap-6">
          {testimonials.map((t, i) => (
            <motion.div
              key={t.author}
              variants={fadeUp}
              custom={i}
              className="rounded-2xl p-7 border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] transition-all duration-300"
            >
              <div className="flex gap-1 mb-4">
                {Array.from({ length: 5 }).map((_, j) => (
                  <div key={j} className="w-4 h-4 text-amber-400">★</div>
                ))}
              </div>
              <p className="text-slate-300 text-sm leading-relaxed mb-6 italic">
                "{t.quote}"
              </p>
              <div>
                <p className="text-white font-semibold text-sm">{t.author}</p>
                <p className="text-slate-500 text-xs mt-0.5">{t.role}</p>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </Section>
  )
}

/* ─── CTA Banner ─── */
function CtaBanner() {
  return (
    <Section className="py-24 md:py-32 px-6">
      <motion.div
        variants={fadeUp}
        className="max-w-4xl mx-auto relative rounded-3xl overflow-hidden"
      >
        {/* Multi-layer glow */}
        <div className="absolute inset-0" aria-hidden="true">
          <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/20 via-violet-500/20 to-cyan-500/20 blur-3xl" />
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1/2 h-px bg-gradient-to-r from-transparent via-indigo-500/50 to-transparent" />
        </div>
        <div className="relative border border-white/[0.08] bg-white/[0.02] backdrop-blur-xl rounded-3xl px-8 py-20 md:px-20 md:py-24 text-center">
          <FloatingParticles />
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            whileInView={{ scale: 1, opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, ease }}
            className="relative"
          >
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center mx-auto mb-8 shadow-2xl shadow-indigo-500/30">
              <Sparkles className="w-7 h-7 text-white" />
            </div>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-5 leading-tight">
              Ready to supercharge
              <br />
              <span className="text-gradient">your workflow?</span>
            </h2>
            <p className="text-slate-400 text-lg mb-10 max-w-xl mx-auto">
              Join teams using Bemnet AI to get instant, accurate answers from their data.
            </p>
            <Link
              to="/register"
              className="group inline-flex items-center gap-2 bg-gradient-to-r from-indigo-500 to-violet-600 text-white font-semibold px-10 py-4 rounded-2xl text-base transition-all duration-300 shadow-2xl shadow-indigo-500/25 hover:shadow-indigo-500/40 hover:scale-[1.03]"
            >
              <Send className="w-4 h-4" />
              Start Building Free
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
            </Link>
          </motion.div>
        </div>
      </motion.div>
    </Section>
  )
}

/* ─── Footer ─── */
function Footer() {
  const groups = [
    {
      title: 'Product',
      links: [
        { label: 'Features', href: '#features' },
        { label: 'Pricing', href: '#pricing' },
        { label: 'API Docs', href: '#' },
        { label: 'Changelog', href: '#' },
      ],
    },
    {
      title: 'Company',
      links: [
        { label: 'About', href: '#' },
        { label: 'Blog', href: '#' },
        { label: 'Careers', href: '#' },
        { label: 'Contact', href: '#' },
      ],
    },
    {
      title: 'Legal',
      links: [
        { label: 'Privacy', href: '#' },
        { label: 'Terms', href: '#' },
        { label: 'Security', href: '#' },
      ],
    },
  ]

  return (
    <footer className="border-t border-[var(--border-subtle)]">
      <div className="max-w-6xl mx-auto px-6 py-16">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-10">
          {/* Brand */}
          <div className="col-span-2">
            <div className="flex items-center gap-2.5 mb-5">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
                <Bot className="w-5 h-5 text-white" />
              </div>
              <span className="text-lg font-bold text-white">
                Bemnet<span className="text-gradient"> AI</span>
              </span>
            </div>
            <p className="text-sm text-slate-500 leading-relaxed max-w-xs mb-6">
              AI-powered assistant platform for businesses. Instant answers from
              your own knowledge base.
            </p>
            <div className="flex gap-2.5">
              {[
                { icon: Globe, label: 'Twitter' },
                { icon: GitFork, label: 'GitHub' },
                { icon: Globe, label: 'Website' },
              ].map(({ icon: Icon, label }) => (
                <a
                  key={label}
                  href="#"
                  aria-label={label}
                  className="w-9 h-9 rounded-xl border border-white/[0.06] bg-white/[0.02] flex items-center justify-center text-slate-500 hover:text-white hover:border-white/[0.15] hover:bg-white/[0.05] transition-all duration-300"
                >
                  <Icon className="w-4 h-4" />
                </a>
              ))}
            </div>
          </div>

          {/* Link groups */}
          {groups.map((g) => (
            <div key={g.title}>
              <h4 className="text-sm font-semibold text-white mb-4">{g.title}</h4>
              <ul className="space-y-2.5">
                {g.links.map((l) => (
                  <li key={l.label}>
                    <a
                      href={l.href}
                      className="text-sm text-slate-500 hover:text-slate-300 transition-colors"
                    >
                      {l.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-16 pt-6 border-t border-[var(--border-subtle)] flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-slate-600">
            © {new Date().getFullYear()} Bemnet AI. All rights reserved.
          </p>
          <p className="text-xs text-slate-600">
            Crafted with precision
          </p>
        </div>
      </div>
    </footer>
  )
}
