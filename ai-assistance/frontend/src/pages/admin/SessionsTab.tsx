import { useEffect, useState } from 'react'
import { apiClient } from '../../lib/apiClient'

interface Session {
  id: number; title: string; message_count: number
  user: { name: string; email: string }
  created_at: string; updated_at: string
}

export default function AdminSessionsTab() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    apiClient.get('/admin/sessions').then(r => setSessions(r.data)).finally(() => setLoading(false))
  }, [])

  return (
    <div className="p-8 max-w-4xl">
      <h1 className="text-2xl font-bold text-white mb-6">💬 Chat Sessions</h1>
      {loading ? <p className="text-gray-500">Loading…</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-400 text-left border-b border-gray-800">
                <th className="pb-2 pr-6">Title</th>
                <th className="pb-2 pr-6">User</th>
                <th className="pb-2 pr-4">Messages</th>
                <th className="pb-2">Last Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {sessions.map(s => (
                <tr key={s.id}>
                  <td className="py-3 pr-6 text-white max-w-xs truncate">{s.title}</td>
                  <td className="py-3 pr-6">
                    <p className="text-gray-300">{s.user.name}</p>
                    <p className="text-gray-500 text-xs">{s.user.email}</p>
                  </td>
                  <td className="py-3 pr-4 text-gray-400">{s.message_count}</td>
                  <td className="py-3 text-gray-500">{new Date(s.updated_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
