import { useEffect, useState } from 'react'
import { apiClient } from '../../lib/apiClient'

interface UserUsage { user_id: number; name: string; email: string; total: number }

export default function AdminUsageTab() {
  const [rows, setRows] = useState<UserUsage[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    apiClient.get('/admin/usage').then(r => setRows(r.data)).finally(() => setLoading(false))
  }, [])

  const maxTotal = Math.max(...rows.map(r => r.total), 1)

  return (
    <div className="p-8 max-w-3xl">
      <h1 className="text-2xl font-bold text-white mb-6">📊 Usage Overview</h1>
      {loading ? <p className="text-gray-500">Loading…</p> : rows.length === 0 ? (
        <p className="text-gray-600">No usage data yet.</p>
      ) : (
        <div className="space-y-3">
          {rows.map(r => (
            <div key={r.user_id} className="bg-gray-900 border border-gray-700 rounded-xl px-5 py-4">
              <div className="flex justify-between items-center mb-2">
                <div>
                  <p className="text-white font-medium text-sm">{r.name}</p>
                  <p className="text-gray-500 text-xs">{r.email}</p>
                </div>
                <span className="text-indigo-400 font-bold">{r.total.toLocaleString()}</span>
              </div>
              <div className="w-full bg-gray-700 rounded-full h-1.5">
                <div
                  className="h-1.5 bg-purple-500 rounded-full"
                  style={{ width: `${(r.total / maxTotal) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
