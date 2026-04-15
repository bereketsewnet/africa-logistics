import { useEffect, useState } from 'react'
import { apiClient } from '../../lib/apiClient'

interface Plan { id: number; name: string; request_limit: number; price_usd: number }

export default function AdminPlansTab() {
  const [plans, setPlans] = useState<Plan[]>([])
  const [editing, setEditing] = useState<Plan | null>(null)
  const [saving, setSaving] = useState(false)

  const load = () => apiClient.get('/plans').then(r => setPlans(r.data))
  useEffect(() => { load() }, [])

  const save = async () => {
    if (!editing) return
    setSaving(true)
    try {
      await apiClient.put(`/admin/plans/${editing.id}`, {
        request_limit: editing.request_limit,
        price_usd: editing.price_usd,
      })
      setEditing(null)
      load()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-8 max-w-2xl">
      <h1 className="text-2xl font-bold text-white mb-6">⭐ Plans</h1>
      <div className="space-y-4">
        {plans.map(p => (
          <div key={p.id} className="bg-gray-900 border border-gray-700 rounded-2xl p-5">
            {editing?.id === p.id ? (
              <div className="space-y-3">
                <p className="capitalize font-bold text-white text-lg">{p.name}</p>
                <div className="flex gap-4">
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">Daily Limit (0 = unlimited)</label>
                    <input
                      type="number" min={0}
                      value={editing.request_limit}
                      onChange={e => setEditing({ ...editing, request_limit: Number(e.target.value) })}
                      className="bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm outline-none w-36"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">Price (USD/mo)</label>
                    <input
                      type="number" min={0} step={0.01}
                      value={editing.price_usd}
                      onChange={e => setEditing({ ...editing, price_usd: Number(e.target.value) })}
                      className="bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm outline-none w-36"
                    />
                  </div>
                </div>
                <div className="flex gap-3">
                  <button onClick={save} disabled={saving} className="bg-purple-600 hover:bg-purple-500 text-white text-sm px-4 py-1.5 rounded-lg">{saving ? 'Saving…' : 'Save'}</button>
                  <button onClick={() => setEditing(null)} className="text-gray-400 hover:text-white text-sm px-4 py-1.5 rounded-lg border border-gray-600">Cancel</button>
                </div>
              </div>
            ) : (
              <div className="flex justify-between items-center">
                <div>
                  <p className="capitalize font-bold text-white text-lg">{p.name}</p>
                  <p className="text-gray-400 text-sm">{p.request_limit === 0 ? 'Unlimited' : `${p.request_limit} req/day`} · ${p.price_usd}/mo</p>
                </div>
                <button onClick={() => setEditing({ ...p })} className="text-xs border border-gray-600 text-gray-400 hover:text-white px-3 py-1.5 rounded-lg">Edit</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
