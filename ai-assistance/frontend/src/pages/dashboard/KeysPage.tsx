import { useEffect, useState } from 'react'
import { apiClient } from '../../lib/apiClient'

interface ApiKey {
  id: number
  label: string
  key_prefix: string
  revoked: boolean
  last_used_at: string | null
  created_at: string
}

export default function KeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [newLabel, setNewLabel] = useState('')
  const [creating, setCreating] = useState(false)
  const [newKey, setNewKey] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [loading, setLoading] = useState(true)

  const loadKeys = async () => {
    setLoading(true)
    try {
      const res = await apiClient.get('/api/keys')
      setKeys(res.data)
    } finally {
      setLoading(false)
    }
  }

  const createKey = async () => {
    if (!newLabel.trim()) return
    setCreating(true)
    try {
      const res = await apiClient.post('/api/keys', { label: newLabel })
      setNewKey(res.data.api_key)
      setNewLabel('')
      await loadKeys()
    } finally {
      setCreating(false)
    }
  }

  const revoke = async (id: number) => {
    if (!confirm('Revoke this key? It cannot be undone.')) return
    await apiClient.delete(`/api/keys/${id}`)
    await loadKeys()
  }

  const copy = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  useEffect(() => { loadKeys() }, [])

  return (
    <div className="p-8 max-w-3xl">
      <h1 className="text-2xl font-bold text-white mb-6">🔑 API Keys</h1>

      {/* New key reveal */}
      {newKey && (
        <div className="bg-yellow-950 border border-yellow-600 rounded-xl p-4 mb-6">
          <p className="text-yellow-400 font-semibold text-sm mb-2">⚠ New API key — save now, shown once only</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-gray-950 text-green-400 text-xs p-2 rounded-lg break-all font-mono">
              {newKey}
            </code>
            <button onClick={() => copy(newKey)} className="bg-indigo-600 text-white text-xs px-3 py-2 rounded-lg shrink-0">
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <button onClick={() => setNewKey(null)} className="text-gray-500 text-xs mt-2 hover:text-gray-300">Dismiss</button>
        </div>
      )}

      {/* Create form */}
      <div className="flex gap-3 mb-8">
        <input
          value={newLabel}
          onChange={e => setNewLabel(e.target.value)}
          placeholder="Key label (e.g. Production)"
          className="flex-1 bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-indigo-500"
        />
        <button
          onClick={createKey}
          disabled={creating || !newLabel.trim()}
          className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-5 py-2 rounded-lg text-sm font-medium transition"
        >
          {creating ? 'Creating…' : 'Create Key'}
        </button>
      </div>

      {/* Key list */}
      {loading ? (
        <p className="text-gray-500">Loading…</p>
      ) : (
        <div className="space-y-3">
          {keys.map(k => (
            <div key={k.id} className={`bg-gray-900 border rounded-xl px-5 py-4 flex items-center justify-between ${k.revoked ? 'border-gray-800 opacity-50' : 'border-gray-700'}`}>
              <div>
                <p className="text-white font-medium text-sm">{k.label}</p>
                <p className="text-gray-500 text-xs font-mono mt-0.5">{k.key_prefix}…</p>
                <p className="text-gray-600 text-xs mt-0.5">
                  Created {new Date(k.created_at).toLocaleDateString()}
                  {k.last_used_at && ` · Last used ${new Date(k.last_used_at).toLocaleDateString()}`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {k.revoked ? (
                  <span className="text-xs bg-red-900 text-red-400 px-2 py-0.5 rounded-full">Revoked</span>
                ) : (
                  <button
                    onClick={() => revoke(k.id)}
                    className="text-xs text-red-400 hover:text-red-300 border border-red-800 hover:border-red-600 px-3 py-1 rounded-lg transition"
                  >
                    Revoke
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
