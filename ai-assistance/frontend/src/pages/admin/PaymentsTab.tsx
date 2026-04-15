import { useEffect, useState } from 'react'
import { apiClient } from '../../lib/apiClient'

interface Payment {
  id: number; user: { name: string; email: string }
  plan: string; status: string; receipt_path: string
  notes: string | null; created_at: string
}

export default function AdminPaymentsTab() {
  const [payments, setPayments] = useState<Payment[]>([])
  const [filter, setFilter] = useState('pending')
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(true)

  const load = () => {
    setLoading(true)
    apiClient.get(`/admin/payments?status=${filter}`).then(r => setPayments(r.data)).finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [filter])

  const review = async (id: number, action: 'approve' | 'reject') => {
    await apiClient.patch(`/admin/payments/${id}/${action}`, { notes: note || null })
    setNote('')
    load()
  }

  return (
    <div className="p-8 max-w-4xl">
      <h1 className="text-2xl font-bold text-white mb-5">💳 Payments</h1>
      <div className="flex gap-2 mb-5">
        {['pending', 'approved', 'rejected'].map(s => (
          <button key={s} onClick={() => setFilter(s)}
            className={`capitalize text-sm px-4 py-1.5 rounded-lg transition ${filter === s ? 'bg-purple-700 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
            {s}
          </button>
        ))}
      </div>

      {loading ? <p className="text-gray-500">Loading…</p> : payments.length === 0 ? (
        <p className="text-gray-600">No {filter} payments.</p>
      ) : (
        <div className="space-y-4">
          {payments.map(p => (
            <div key={p.id} className="bg-gray-900 border border-gray-700 rounded-2xl p-5">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <p className="text-white font-medium">{p.user.name} <span className="text-gray-400 text-sm">({p.user.email})</span></p>
                  <p className="text-gray-400 text-sm capitalize mt-0.5">{p.plan} plan · {new Date(p.created_at).toLocaleDateString()}</p>
                  {p.notes && <p className="text-gray-500 text-xs mt-1">Note: {p.notes}</p>}
                </div>
                <span className={`text-xs px-2.5 py-1 rounded-full capitalize ${
                  p.status === 'pending' ? 'bg-yellow-900 text-yellow-400' :
                  p.status === 'approved' ? 'bg-green-900 text-green-400' :
                  'bg-red-900 text-red-400'
                }`}>{p.status}</span>
              </div>
              {p.status === 'pending' && (
                <div className="flex items-center gap-3 mt-2">
                  <input
                    value={note} onChange={e => setNote(e.target.value)}
                    placeholder="Optional note…"
                    className="flex-1 bg-gray-800 border border-gray-600 rounded-lg px-3 py-1.5 text-sm text-white outline-none focus:border-purple-500"
                  />
                  <button onClick={() => review(p.id, 'approve')} className="bg-green-700 hover:bg-green-600 text-white text-sm px-4 py-1.5 rounded-lg transition">Approve</button>
                  <button onClick={() => review(p.id, 'reject')} className="bg-red-800 hover:bg-red-700 text-white text-sm px-4 py-1.5 rounded-lg transition">Reject</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
