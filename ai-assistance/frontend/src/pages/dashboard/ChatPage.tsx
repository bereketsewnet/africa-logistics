import { useEffect, useRef, useState } from 'react'
import { apiKeyClient } from '../../lib/apiClient'

interface Message { role: 'user' | 'assistant'; content: string }
interface Session { id: number; title: string; updated_at: string }

export default function ChatPage() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [activeSession, setActiveSession] = useState<number | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  const loadSessions = async () => {
    try {
      const res = await apiKeyClient.get('/api/sessions')
      setSessions(res.data)
    } catch {}
  }

  const loadSession = async (id: number) => {
    setActiveSession(id)
    const res = await apiKeyClient.get(`/api/sessions/${id}`)
    setMessages(res.data.messages)
  }

  const newSession = async () => {
    setActiveSession(null)
    setMessages([])
  }

  const sendMessage = async () => {
    const q = input.trim()
    if (!q || loading) return
    setInput('')
    setLoading(true)

    const userMsg: Message = { role: 'user', content: q }
    setMessages(prev => [...prev, userMsg])

    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL ?? 'http://localhost:8001'}/api/ask`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${localStorage.getItem('bemnet_api_key') ?? ''}`,
          },
          body: JSON.stringify({ question: q, session_id: activeSession }),
        }
      )

      // Update active session from response header
      const sessionId = response.headers.get('x-session-id')
      if (sessionId) setActiveSession(Number(sessionId))

      const reader = response.body?.getReader()
      if (!reader) throw new Error('No stream')

      const decoder = new TextDecoder()
      let assistantText = ''
      setMessages(prev => [...prev, { role: 'assistant', content: '' }])

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value)
        assistantText += chunk
        setMessages(prev => {
          const updated = [...prev]
          updated[updated.length - 1] = { role: 'assistant', content: assistantText }
          return updated
        })
      }

      await loadSessions()
    } catch (err: any) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Error: ${err.message ?? 'Request failed'}`,
      }])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadSessions() }, [])
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  return (
    <div className="flex h-screen">
      {/* Session list */}
      <aside className="w-56 bg-gray-900 border-r border-gray-800 flex flex-col">
        <div className="p-3 border-b border-gray-800">
          <button
            onClick={newSession}
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white text-sm py-2 rounded-lg transition"
          >
            + New Chat
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {sessions.map(s => (
            <button
              key={s.id}
              onClick={() => loadSession(s.id)}
              className={`w-full text-left px-3 py-2.5 text-sm border-b border-gray-800 transition truncate ${
                activeSession === s.id ? 'bg-indigo-900 text-white' : 'text-gray-400 hover:bg-gray-800'
              }`}
            >
              {s.title}
            </button>
          ))}
        </div>
      </aside>

      {/* Chat window */}
      <div className="flex-1 flex flex-col bg-gray-950">
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {messages.length === 0 && (
            <div className="text-center text-gray-600 mt-20">
              <p className="text-4xl mb-3">💬</p>
              <p className="text-lg">Ask Bemnet anything about Africa Logistics</p>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-2xl rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap ${
                m.role === 'user'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-800 text-gray-200'
              }`}>
                {m.content || <span className="animate-pulse text-gray-500">thinking…</span>}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Input bar */}
        <div className="p-4 border-t border-gray-800 flex gap-3">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
            placeholder="Ask a question…"
            disabled={loading}
            className="flex-1 bg-gray-800 border border-gray-600 rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-indigo-500 disabled:opacity-50"
          />
          <button
            onClick={sendMessage}
            disabled={loading || !input.trim()}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white px-5 py-2.5 rounded-xl text-sm font-medium transition"
          >
            {loading ? '…' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  )
}
