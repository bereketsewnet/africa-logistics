import { useEffect, useState } from 'react'
import { apiClient } from '../../lib/apiClient'

interface Key {
  id: number; user: { name: string; email: string }
  label: string; key_prefix: string; revoked: boolean
  last_used_at: string | null; created_at: string
}

export default function AdminKeysTab() {
  const [keys, setKeys] = useState<Key[]>([])
  const [loading, setLoading] = useState(true)

  const load = () => apiClient.get('/admin/keys').then(r => setKeys(r.data)).finally(() => setLoading(false))
  useEffect(() => { load() }, [])

  const revoke = async (id: number) => {
    if (!confirm('Revoke this key?')) return
    await apiClient.delete(`/admin/keys/${id}`)
    load()
  }

  return (
    <div className="p-8 max-w-4xl">
      <h1 className="text-2xl font-bold text-white mb-6">🔑 All API Keys</h1>
      {loading ? <p className="text-gray-500">Loading…</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-400 text-left border-b border-gray-800">
                <th className="pb-2 pr-5">User</th>
                <th className="pb-2 pr-5">Label</th>
                <th className="pb-2 pr-5">Prefix</th>
                <th className="pb-2 pr-5">Status</th>
                <th className="pb-2">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {keys.map(k => (
                <tr key={k.id}>
                  <td className="py-3 pr-5">
                    <p className="text-white">{k.user.name}</p>
                    <p className="text-gray-500 text-xs">{k.user.email}</p>
                  </td>
                  <td className="py-3 pr-5 text-gray-300">{k.label}</td>
                  <td className="py-3 pr-5 font-mono text-gray-400 text-xs">{k.key_prefix}…</td>
                  <td className="py-3 pr-5">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${k.revoked ? 'bg-red-900 text-red-400' : 'bg-green-900 text-green-400'}`}>
                      {k.revoked ? 'Revoked' : 'Active'}
                    </span>
                  </td>
                  <td className="py-3">
                    {!k.revoked && (
                      <button onClick={() => revoke(k.id)} className="text-xs text-red-400 hover:text-red-300 border border-red-800 px-2 py-0.5 rounded">
                        Revoke
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
