import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  LuMessageSquare, LuSend, LuUsers, LuSearch, LuX, LuTriangleAlert,
  LuRefreshCw, LuCopy, LuHistory, LuPhone, LuCheck, LuPlus,
} from 'react-icons/lu'
import { adminSmsApi } from '../lib/apiClient'

/**
 * Send an SMS to anyone — one person or a whole audience.
 *
 * The screen is built around one rule: **nobody should be able to spend money
 * by accident.** Every message costs credits per recipient, and Amharic costs
 * more than double English, so the cost is shown while the message is still
 * being typed, the recipient list is resolved and priced before sending, and
 * the send itself asks for confirmation naming the number of people and credits.
 *
 * Sending is chunked because the provider has no bulk endpoint — a campaign is
 * a loop of single sends — so the progress bar is drawn here rather than
 * waiting on one long request that would time out.
 */

const CHUNK = 20   // matches the server's per-request cap

interface Recipient { phone: string; name?: string | null; problem?: string }
interface Group { id: string; label: string; count: number }
interface Company { id: string; name: string; driver_count: number }
interface RecentNumber { phone: string; name: string | null; last_sent: string; times: number }
interface RecentMessage {
  id: string; body: string; segments: number; is_unicode: boolean
  recipient_count: number; sent_count: number; failed_count: number
  sent_by: string | null; created_at: string
}
interface Prepared {
  segments: number; is_unicode: boolean
  total: number; sendable: number; blocked: number; credits: number
  recipients: Recipient[]; problems: Recipient[]; unicode_note: string | null
}

/** Mirrors the server's estimateSegments so the counter moves as you type. */
function segmentsOf(text: string): { segments: number; unicode: boolean; perSegment: number } {
  const GSM = "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?"
    + "¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà^{}\\[~]|€"
  const unicode = [...text].some(c => !GSM.includes(c))
  const single = unicode ? 70 : 160
  const multi = unicode ? 66 : 153
  const len = [...text].length
  const segments = len === 0 ? 0 : len <= single ? 1 : Math.ceil(len / multi)
  return { segments, unicode, perSegment: segments <= 1 ? single : multi }
}

export default function AdminSmsSection({ onToast }: { onToast: (m: string) => void }) {
  const [tab, setTab] = useState<'compose' | 'history'>('compose')

  const [message, setMessage] = useState('')
  const [manual, setManual] = useState('')
  const [picked, setPicked] = useState<Recipient[]>([])
  const [pickedGroups, setPickedGroups] = useState<Array<{ group: string; company_id?: string; label: string; count: number }>>([])

  const [groups, setGroups] = useState<Group[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [recentNumbers, setRecentNumbers] = useState<RecentNumber[]>([])
  const [recentMessages, setRecentMessages] = useState<RecentMessage[]>([])

  const [search, setSearch] = useState('')
  const [found, setFound] = useState<Recipient[]>([])

  const [prepared, setPrepared] = useState<Prepared | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [result, setResult] = useState<{ sent: number; failed: number; failures: Recipient[] } | null>(null)

  const [history, setHistory] = useState<any[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  const seg = useMemo(() => segmentsOf(message), [message])

  const loadPickers = useCallback(async () => {
    try {
      const [g, n, m] = await Promise.allSettled([
        adminSmsApi.groups(), adminSmsApi.recentNumbers(), adminSmsApi.recentMessages(),
      ])
      if (g.status === 'fulfilled') {
        setGroups(g.value.data.groups ?? [])
        setCompanies(g.value.data.companies ?? [])
      }
      if (n.status === 'fulfilled') setRecentNumbers(n.value.data.numbers ?? [])
      if (m.status === 'fulfilled') setRecentMessages(m.value.data.messages ?? [])
    } catch { /* pickers are conveniences; the screen still works without them */ }
  }, [])

  useEffect(() => { loadPickers() }, [loadPickers])

  useEffect(() => {
    if (search.trim().length < 2) { setFound([]); return }
    const t = setTimeout(async () => {
      try {
        const { data } = await adminSmsApi.searchRecipients(search.trim())
        setFound(data.recipients ?? [])
      } catch { setFound([]) }
    }, 300)
    return () => clearTimeout(t)
  }, [search])

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true)
    try {
      const { data } = await adminSmsApi.history({ limit: 50 })
      setHistory(data.messages ?? [])
    } catch { setHistory([]) }
    finally { setHistoryLoading(false) }
  }, [])

  useEffect(() => { if (tab === 'history') loadHistory() }, [tab, loadHistory])

  const addRecipient = (r: Recipient) => {
    setPrepared(null)
    setPicked(prev => prev.some(p => p.phone === r.phone) ? prev : [...prev, r])
  }
  const addGroup = (group: string, label: string, count: number, company_id?: string) => {
    setPrepared(null)
    setPickedGroups(prev =>
      prev.some(p => p.group === group && p.company_id === company_id)
        ? prev
        : [...prev, { group, company_id, label, count }])
  }

  const manualNumbers = useMemo(
    // Accepts anything people paste: commas, spaces, new lines, semicolons.
    () => manual.split(/[\s,;]+/).map(s => s.trim()).filter(Boolean),
    [manual]
  )

  const roughCount = picked.length + manualNumbers.length + pickedGroups.reduce((n, g) => n + g.count, 0)

  const handlePrepare = async () => {
    setErr(''); setResult(null); setBusy(true)
    try {
      const { data } = await adminSmsApi.prepare({
        message,
        numbers: [...manualNumbers, ...picked.map(p => p.phone)],
        groups: pickedGroups.map(g => ({ group: g.group, company_id: g.company_id })),
      })
      setPrepared(data)
    } catch (e: any) {
      setErr(e.response?.data?.message ?? 'Could not work out who this would go to.')
    } finally { setBusy(false) }
  }

  const handleSend = async () => {
    if (!prepared || prepared.sendable === 0) return
    const ok = window.confirm(
      `Send this message to ${prepared.sendable} ${prepared.sendable === 1 ? 'person' : 'people'}?\n\n`
      + `Cost: about ${prepared.credits} SMS credit${prepared.credits === 1 ? '' : 's'} `
      + `(${prepared.segments} per person).\n\nThis cannot be undone once sent.`
    )
    if (!ok) return

    const list = prepared.recipients
    setBusy(true); setErr(''); setProgress({ done: 0, total: list.length })
    let sent = 0, failed = 0
    const failures: Recipient[] = []
    let campaignId: string | undefined

    try {
      for (let i = 0; i < list.length; i += CHUNK) {
        const chunk = list.slice(i, i + CHUNK)
        const { data } = await adminSmsApi.send({ message, recipients: chunk, campaign_id: campaignId })
        campaignId = data.campaign_id
        sent += data.sent ?? 0
        failed += data.failed ?? 0
        for (const r of data.results ?? []) if (!r.sent) failures.push(r)
        setProgress({ done: Math.min(i + CHUNK, list.length), total: list.length })
      }
      setResult({ sent, failed, failures })
      onToast(`${sent} message${sent === 1 ? '' : 's'} sent${failed ? `, ${failed} failed` : ''}.`)
      setPrepared(null)
      loadPickers()
    } catch (e: any) {
      // Earlier chunks are already sent and paid for — say so rather than
      // implying the whole campaign failed.
      setErr((e.response?.data?.message ?? 'Sending stopped partway.')
        + ` ${sent} message(s) were already sent before it stopped.`)
      setResult({ sent, failed, failures })
    } finally { setBusy(false) }
  }

  const reuse = (m: RecentMessage) => {
    setMessage(m.body); setPrepared(null); setTab('compose')
    onToast('Message copied into the composer — edit it or pick new recipients.')
  }

  const card: React.CSSProperties = { padding: '1rem' }
  const chip: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: '0.3rem', padding: '0.2rem 0.5rem',
    borderRadius: 999, background: 'rgba(97,148,31,0.12)', border: '1px solid rgba(97,148,31,0.35)',
    color: 'var(--clr-accent)', fontSize: '0.74rem', fontWeight: 700,
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
        {([['compose', 'Compose', <LuMessageSquare size={13} />], ['history', 'History', <LuHistory size={13} />]] as const).map(([k, label, icon]) => (
          <button key={k} onClick={() => setTab(k as any)}
            style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.45rem 0.95rem', borderRadius: 9, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.8rem', fontWeight: 700,
              border: `1.5px solid ${tab === k ? 'var(--clr-accent)' : 'rgba(255,255,255,0.1)'}`,
              background: tab === k ? 'rgba(97,148,31,0.1)' : 'rgba(255,255,255,0.04)',
              color: tab === k ? 'var(--clr-accent)' : 'var(--clr-muted)' }}>
            {icon} {label}
          </button>
        ))}
        <span style={{ flex: 1 }} />
        <button onClick={() => { loadPickers(); if (tab === 'history') loadHistory() }}
          style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.3rem 0.7rem', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: 'var(--clr-muted)', fontFamily: 'inherit', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer' }}>
          <LuRefreshCw size={12} /> Refresh
        </button>
      </div>

      {err && <div className="alert alert-error" style={{ fontSize: '0.82rem' }}><LuTriangleAlert size={14} /> {err}</div>}

      {tab === 'compose' && (
        <>
          {/* ── Message ─────────────────────────────────────────────────── */}
          <div className="glass" style={card}>
            <div style={{ fontSize: '0.88rem', fontWeight: 800, color: 'var(--clr-text)', marginBottom: '0.5rem' }}>1. Your message</div>
            <textarea value={message} onChange={e => { setMessage(e.target.value); setPrepared(null) }}
              rows={5} placeholder="Type the message you want to send…"
              style={{ width: '100%', padding: '0.7rem', borderRadius: 10, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)', color: 'var(--clr-text)', fontFamily: 'inherit', fontSize: '0.86rem', lineHeight: 1.5, resize: 'vertical' }} />

            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center', marginTop: '0.5rem', fontSize: '0.76rem', color: 'var(--clr-muted)' }}>
              <span>{[...message].length} characters</span>
              <span>·</span>
              <span style={{ fontWeight: 700, color: seg.segments > 1 ? 'var(--kpi-gold)' : 'var(--clr-text)' }}>
                {seg.segments} SMS {seg.segments === 1 ? 'segment' : 'segments'} per person
              </span>
              <span>·</span>
              <span>{seg.perSegment} characters per segment</span>
            </div>

            {seg.unicode && (
              <div style={{ marginTop: '0.6rem', padding: '0.6rem 0.8rem', borderRadius: 9, border: '1px solid rgba(251,191,36,0.35)', background: 'rgba(251,191,36,0.08)', fontSize: '0.78rem', color: 'var(--clr-muted)', lineHeight: 1.5 }}>
                <strong style={{ color: '#fbbf24' }}>Amharic detected.</strong> A single Ethiopic character
                switches the whole message to Unicode, so each segment holds 70 characters instead of 160 —
                more than double the cost. Writing in English is much cheaper.
              </div>
            )}

            {recentMessages.length > 0 && (
              <div style={{ marginTop: '0.85rem' }}>
                <div style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--clr-muted)', marginBottom: '0.4rem' }}>
                  Recent messages — click to reuse
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', maxHeight: 170, overflowY: 'auto' }}>
                  {recentMessages.map(m => (
                    <button key={m.id} onClick={() => reuse(m)} title="Use this message again"
                      style={{ textAlign: 'left', padding: '0.5rem 0.65rem', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.03)', cursor: 'pointer', fontFamily: 'inherit' }}>
                      <div style={{ fontSize: '0.78rem', color: 'var(--clr-text)', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{m.body}</div>
                      <div style={{ fontSize: '0.69rem', color: 'var(--clr-muted)', marginTop: '0.2rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <span><LuCopy size={10} style={{ verticalAlign: -1 }} /> reuse</span>
                        <span>{m.sent_count} sent{m.failed_count ? `, ${m.failed_count} failed` : ''}</span>
                        {m.sent_by && <span>by {m.sent_by}</span>}
                        <span>{new Date(m.created_at).toLocaleDateString()}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ── Recipients ──────────────────────────────────────────────── */}
          <div className="glass" style={card}>
            <div style={{ fontSize: '0.88rem', fontWeight: 800, color: 'var(--clr-text)', marginBottom: '0.5rem' }}>2. Who gets it</div>

            {(picked.length > 0 || pickedGroups.length > 0) && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginBottom: '0.7rem' }}>
                {pickedGroups.map(g => (
                  <span key={g.group + (g.company_id ?? '')} style={{ ...chip, background: 'rgba(96,165,250,0.12)', borderColor: 'rgba(96,165,250,0.35)', color: '#60a5fa' }}>
                    <LuUsers size={11} /> {g.label} ({g.count})
                    <LuX size={11} style={{ cursor: 'pointer' }}
                      onClick={() => { setPrepared(null); setPickedGroups(p => p.filter(x => !(x.group === g.group && x.company_id === g.company_id))) }} />
                  </span>
                ))}
                {picked.map(p => (
                  <span key={p.phone} style={chip}>
                    {p.name || p.phone}
                    <LuX size={11} style={{ cursor: 'pointer' }}
                      onClick={() => { setPrepared(null); setPicked(prev => prev.filter(x => x.phone !== p.phone)) }} />
                  </span>
                ))}
              </div>
            )}

            {/* Paste numbers */}
            <label style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--clr-muted)', display: 'block', marginBottom: '0.3rem' }}>
              Type or paste phone numbers
            </label>
            <textarea value={manual} onChange={e => { setManual(e.target.value); setPrepared(null) }}
              rows={2} placeholder="0911234567, 0922334455 — separated by commas, spaces or new lines"
              style={{ width: '100%', padding: '0.6rem', borderRadius: 10, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)', color: 'var(--clr-text)', fontFamily: 'inherit', fontSize: '0.82rem', resize: 'vertical' }} />
            {manualNumbers.length > 0 && (
              <div style={{ fontSize: '0.72rem', color: 'var(--clr-muted)', marginTop: '0.25rem' }}>{manualNumbers.length} number(s) typed</div>
            )}

            {/* Search registered people */}
            <label style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--clr-muted)', display: 'block', margin: '0.85rem 0 0.3rem' }}>
              Find someone registered
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: '0.4rem 0.7rem', border: '1px solid rgba(255,255,255,0.12)' }}>
              <LuSearch size={14} style={{ color: 'var(--clr-muted)' }} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or phone number"
                style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: 'var(--clr-text)', fontFamily: 'inherit', fontSize: '0.82rem' }} />
            </div>
            {found.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', marginTop: '0.4rem', maxHeight: 160, overflowY: 'auto' }}>
                {found.map(f => (
                  <button key={f.phone} onClick={() => addRecipient(f)}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', textAlign: 'left', padding: '0.4rem 0.6rem', borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)', cursor: 'pointer', fontFamily: 'inherit' }}>
                    <LuPlus size={12} style={{ color: 'var(--clr-accent)' }} />
                    <span style={{ fontSize: '0.8rem', color: 'var(--clr-text)', fontWeight: 600 }}>{f.name}</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--clr-muted)' }}>{f.phone}</span>
                    <span style={{ marginLeft: 'auto', fontSize: '0.68rem', color: 'var(--clr-muted)' }}>{(f as any).role}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Groups */}
            <label style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--clr-muted)', display: 'block', margin: '0.85rem 0 0.3rem' }}>
              Or send to a whole group
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
              {groups.map(g => (
                <button key={g.id} onClick={() => addGroup(g.id, g.label, g.count)} disabled={g.count === 0}
                  style={{ padding: '0.35rem 0.7rem', borderRadius: 8, border: '1px solid rgba(96,165,250,0.3)', background: 'rgba(96,165,250,0.08)', color: '#60a5fa', fontFamily: 'inherit', fontSize: '0.76rem', fontWeight: 700, cursor: g.count === 0 ? 'not-allowed' : 'pointer', opacity: g.count === 0 ? 0.45 : 1 }}>
                  {g.label} ({g.count})
                </button>
              ))}
            </div>
            {companies.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginTop: '0.4rem' }}>
                {companies.filter(c => c.driver_count > 0).map(c => (
                  <button key={c.id} onClick={() => addGroup('COMPANY_DRIVERS', `${c.name} drivers`, c.driver_count, c.id)}
                    style={{ padding: '0.35rem 0.7rem', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)', color: 'var(--clr-muted)', fontFamily: 'inherit', fontSize: '0.76rem', fontWeight: 600, cursor: 'pointer' }}>
                    {c.name} drivers ({c.driver_count})
                  </button>
                ))}
              </div>
            )}

            {/* Recent numbers */}
            {recentNumbers.length > 0 && (
              <>
                <label style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--clr-muted)', display: 'block', margin: '0.85rem 0 0.3rem' }}>
                  Recent numbers
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', maxHeight: 110, overflowY: 'auto' }}>
                  {recentNumbers.map(n => (
                    <button key={n.phone} onClick={() => addRecipient({ phone: n.phone, name: n.name })}
                      title={`${n.times} message(s), last ${new Date(n.last_sent).toLocaleString()}`}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', padding: '0.28rem 0.55rem', borderRadius: 999, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.03)', color: 'var(--clr-muted)', fontFamily: 'inherit', fontSize: '0.72rem', cursor: 'pointer' }}>
                      <LuPhone size={10} /> {n.name || n.phone}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* ── Review and send ─────────────────────────────────────────── */}
          <div className="glass" style={card}>
            <div style={{ fontSize: '0.88rem', fontWeight: 800, color: 'var(--clr-text)', marginBottom: '0.5rem' }}>3. Check the cost, then send</div>

            {!prepared ? (
              <>
                <p style={{ fontSize: '0.79rem', color: 'var(--clr-muted)', margin: '0 0 0.7rem', lineHeight: 1.5 }}>
                  Nothing is sent yet. This works out exactly who would receive it, removes
                  duplicates, and tells you what it costs.
                </p>
                <button onClick={handlePrepare} disabled={busy || !message.trim() || roughCount === 0} className="btn-primary"
                  style={{ padding: '0.6rem 1.2rem', fontWeight: 800, opacity: (busy || !message.trim() || roughCount === 0) ? 0.5 : 1 }}>
                  {busy ? 'Checking…' : `Check ${roughCount || 'recipients'}`}
                </button>
              </>
            ) : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(110px,1fr))', gap: '0.5rem', marginBottom: '0.85rem' }}>
                  {[
                    { label: 'Will receive it', value: prepared.sendable, tone: 'var(--kpi-green)' },
                    { label: 'Cannot be sent', value: prepared.blocked, tone: prepared.blocked ? '#f87171' : 'var(--clr-muted)' },
                    { label: 'Segments each', value: prepared.segments, tone: 'var(--clr-text)' },
                    { label: 'SMS credits', value: prepared.credits, tone: 'var(--kpi-gold)' },
                  ].map(s => (
                    <div key={s.label} className="glass-inner" style={{ padding: '0.65rem', textAlign: 'center' }}>
                      <div style={{ fontSize: '1.3rem', fontWeight: 800, color: s.tone }}>{s.value}</div>
                      <div style={{ fontSize: '0.68rem', color: 'var(--clr-muted)', fontWeight: 600 }}>{s.label}</div>
                    </div>
                  ))}
                </div>

                {prepared.problems.length > 0 && (
                  <div className="glass-inner" style={{ padding: '0.7rem 0.9rem', marginBottom: '0.8rem', maxHeight: 150, overflowY: 'auto' }}>
                    <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#f87171', marginBottom: '0.3rem' }}>
                      {prepared.problems.length} will be skipped
                    </div>
                    {prepared.problems.map((p, i) => (
                      <div key={i} style={{ fontSize: '0.74rem', color: 'var(--clr-muted)', padding: '0.12rem 0' }}>
                        {p.name ? `${p.name} — ` : ''}{p.phone}: {p.problem}
                      </div>
                    ))}
                  </div>
                )}

                {busy && progress.total > 0 ? (
                  <div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--clr-muted)', marginBottom: '0.3rem' }}>
                      Sending… {progress.done} of {progress.total}
                    </div>
                    <div style={{ height: 8, borderRadius: 999, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                      <div style={{ width: `${Math.round((progress.done / progress.total) * 100)}%`, height: '100%', background: 'var(--clr-accent)', transition: 'width 0.25s' }} />
                    </div>
                    <p style={{ fontSize: '0.73rem', color: 'var(--clr-muted)', marginTop: '0.5rem' }}>Keep this page open until it finishes.</p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <button onClick={handleSend} disabled={busy || prepared.sendable === 0} className="btn-primary"
                      style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.6rem 1.2rem', fontWeight: 800, opacity: (busy || prepared.sendable === 0) ? 0.5 : 1 }}>
                      <LuSend size={14} /> Send to {prepared.sendable}
                    </button>
                    <button onClick={() => setPrepared(null)}
                      style={{ padding: '0.6rem 1rem', borderRadius: 10, border: '1px solid rgba(255,255,255,0.14)', background: 'rgba(255,255,255,0.05)', color: 'var(--clr-text)', fontFamily: 'inherit', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer' }}>
                      Change something
                    </button>
                  </div>
                )}
              </>
            )}

            {result && (
              <div className="glass-inner" style={{ padding: '0.8rem 1rem', marginTop: '0.85rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: 'var(--clr-text)' }}>
                  <LuCheck size={16} style={{ color: 'var(--kpi-green)' }} />
                  <strong>{result.sent}</strong> sent{result.failed > 0 && <>, <strong style={{ color: '#f87171' }}>{result.failed}</strong> failed</>}.
                </div>
                {result.failures.length > 0 && (
                  <div style={{ marginTop: '0.5rem', maxHeight: 150, overflowY: 'auto' }}>
                    {result.failures.map((f, i) => (
                      <div key={i} style={{ fontSize: '0.74rem', color: 'var(--clr-muted)', padding: '0.12rem 0' }}>
                        {f.name ? `${f.name} — ` : ''}{f.phone}: {f.problem ?? (f as any).error}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {tab === 'history' && (
        <div className="glass" style={card}>
          {historyLoading ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--clr-muted)', fontSize: '0.85rem' }}>Loading…</div>
          ) : history.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--clr-muted)', fontSize: '0.85rem' }}>Nothing sent yet.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: 620, overflowY: 'auto' }}>
              {history.map(h => (
                <div key={h.id} className="glass-inner" style={{ padding: '0.6rem 0.8rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', fontSize: '0.78rem' }}>
                    <span style={{ fontWeight: 700, color: 'var(--clr-text)' }}>{h.phone}</span>
                    <span style={{ fontSize: '0.69rem', padding: '0.1rem 0.45rem', borderRadius: 6, background: 'rgba(255,255,255,0.06)', color: 'var(--clr-muted)', fontWeight: 600 }}>{h.purpose}</span>
                    <span style={{ fontSize: '0.72rem', fontWeight: 700, color: ['DELIVERED', 'SENT', 'ACCEPTED'].includes(h.status) ? 'var(--kpi-green)' : '#f87171' }}>{h.status}</span>
                    <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: 'var(--clr-muted)' }}>
                      {h.segments} seg · {new Date(h.created_at).toLocaleString()}
                    </span>
                  </div>
                  {h.body && <div style={{ fontSize: '0.76rem', color: 'var(--clr-muted)', marginTop: '0.3rem', lineHeight: 1.45 }}>{h.body}</div>}
                  {h.error && <div style={{ fontSize: '0.73rem', color: '#f87171', marginTop: '0.2rem' }}>{h.error}</div>}
                </div>
              ))}
            </div>
          )}
          <p style={{ fontSize: '0.73rem', color: 'var(--clr-muted)', marginTop: '0.7rem', lineHeight: 1.5 }}>
            Welcome texts and verification codes show no message text. They carry passwords
            and one-time codes, which are never written to the log.
          </p>
        </div>
      )}
    </div>
  )
}
