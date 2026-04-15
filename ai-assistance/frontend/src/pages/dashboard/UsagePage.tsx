import { useEffect, useState } from 'react'
import { apiClient } from '../../lib/apiClient'

interface DailyUsage { date: string; count: number }
interface UsageData {
  today: { used: number; limit: number; unlimited: boolean }
  daily: DailyUsage[]
  role: string
}

export default function UsagePage() {
  const [data, setData] = useState<UsageData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    apiClient.get('/api/usage')
      .then(r => setData(r.data))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="p-8 text-gray-500">Loading…</div>
  if (!data) return <div className="p-8 text-red-400">Failed to load usage data</div>

  const pct = data.today.unlimited ? 100 : Math.min(100, Math.round((data.today.used / data.today.limit) * 100))
  const barColor = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-yellow-500' : 'bg-indigo-500'
  const maxDay = Math.max(...data.daily.map(d => d.count), 1)

  return (
    <div className="p-8 max-w-3xl">
      <h1 className="text-2xl font-bold text-white mb-6">📊 Usage</h1>

      {/* Today */}
      <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 mb-6">
        <div className="flex justify-between items-center mb-3">
          <span className="text-gray-300 font-medium">Today's Usage</span>
          <span className="text-sm text-gray-400">
            {data.today.used} / {data.today.unlimited ? '∞' : data.today.limit} requests
          </span>
        </div>
        <div className="w-full bg-gray-700 rounded-full h-3">
          <div
            className={`h-3 rounded-full transition-all ${barColor}`}
            style={{ width: `${data.today.unlimited ? 20 : pct}%` }}
          />
        </div>
        <div className="flex justify-between mt-2 text-xs text-gray-500">
          <span>Plan: <span className="capitalize text-indigo-400">{data.role}</span></span>
          {!data.today.unlimited && <span>{pct}% used</span>}
        </div>
      </div>

      {/* Daily chart — last 30 days */}
      <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6">
        <h2 className="text-gray-300 font-medium mb-4">Last 30 Days</h2>
        {data.daily.length === 0 ? (
          <p className="text-gray-600 text-sm">No usage recorded yet.</p>
        ) : (
          <div className="flex items-end gap-1 h-28">
            {data.daily.slice(-30).map(d => (
              <div key={d.date} className="flex-1 flex flex-col items-center group relative">
                <div
                  className="w-full bg-indigo-700 hover:bg-indigo-500 rounded-sm transition"
                  style={{ height: `${(d.count / maxDay) * 100}%`, minHeight: '2px' }}
                />
                <div className="absolute bottom-full mb-1 hidden group-hover:block bg-gray-700 text-xs text-white px-1.5 py-0.5 rounded whitespace-nowrap">
                  {d.date}: {d.count}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
