import { useEffect, useState } from 'react'
import { apiClient } from '../../lib/apiClient'

interface Payment {
  id: number
  plan: string
  status: 'pending' | 'approved' | 'rejected'
  notes: string | null
  created_at: string
  reviewed_at: string | null
}

const statusBadge = {
  pending:  'bg-yellow-900 text-yellow-400',
  approved: 'bg-green-900 text-green-400',
  rejected: 'bg-red-900 text-red-400',
}

export default function PaymentHistoryPage() {
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    apiClient.get('/payments/my')
      .then(r => setPayments(r.data))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="p-8 max-w-3xl">
      <h1 className="text-2xl font-bold text-white mb-6">🧾 Payment History</h1>

      {loading ? (
        <p className="text-gray-500">Loading…</p>
      ) : payments.length === 0 ? (
        <p className="text-gray-600">No payments submitted yet.</p>
      ) : (
        <div className="space-y-3">
          {payments.map(p => (
            <div key={p.id} className="bg-gray-900 border border-gray-700 rounded-xl px-5 py-4">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-white font-medium capitalize">{p.plan} Plan</p>
                  <p className="text-gray-500 text-xs mt-0.5">
                    Submitted {new Date(p.created_at).toLocaleDateString()}
                  </p>
                  {p.reviewed_at && (
                    <p className="text-gray-500 text-xs">
                      Reviewed {new Date(p.reviewed_at).toLocaleDateString()}
                    </p>
                  )}
                  {p.notes && <p className="text-gray-400 text-xs mt-1">Note: {p.notes}</p>}
                </div>
                <span className={`text-xs px-2.5 py-1 rounded-full capitalize font-medium ${statusBadge[p.status]}`}>
                  {p.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
