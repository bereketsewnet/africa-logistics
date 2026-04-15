import { useEffect, useRef, useState } from 'react'
import { apiClient } from '../../lib/apiClient'

interface Plan { id: number; name: string; request_limit: number; price_usd: number; unlimited: boolean }

export default function PlansPage() {
  const [plans, setPlans] = useState<Plan[]>([])
  const [selected, setSelected] = useState<Plan | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    apiClient.get('/plans').then(r => setPlans(r.data))
  }, [])

  const handleUpgrade = async () => {
    if (!selected || !file) return
    setError('')
    setSubmitting(true)
    try {
      const form = new FormData()
      form.append('plan_id', String(selected.id))
      form.append('receipt', file)
      await apiClient.post('/payments/upload', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setSuccess(true)
      setSelected(null)
      setFile(null)
    } catch (err: any) {
      setError(err.response?.data?.detail ?? 'Upload failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="p-8 max-w-3xl">
      <h1 className="text-2xl font-bold text-white mb-6">⭐ Plans & Billing</h1>

      {success && (
        <div className="bg-green-950 border border-green-600 rounded-xl p-4 mb-6 text-green-400 text-sm">
          ✓ Payment receipt submitted! Admin will review within 24 hours.
          <button onClick={() => setSuccess(false)} className="ml-3 text-green-600 hover:text-green-400">Dismiss</button>
        </div>
      )}

      {/* Plan cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        {plans.map(p => (
          <button
            key={p.id}
            onClick={() => setSelected(p)}
            className={`rounded-2xl p-5 text-left border transition ${
              selected?.id === p.id
                ? 'border-indigo-500 bg-indigo-950'
                : 'border-gray-700 bg-gray-900 hover:border-gray-600'
            }`}
          >
            <h3 className="capitalize font-bold text-lg text-white">{p.name}</h3>
            <p className="text-gray-400 text-sm mt-1">
              {p.unlimited ? 'Unlimited requests/day' : `${p.request_limit} requests/day`}
            </p>
            <p className="text-2xl font-extrabold mt-3 text-white">
              {p.price_usd === 0 ? 'Free' : `$${p.price_usd}/mo`}
            </p>
          </button>
        ))}
      </div>

      {/* Upload receipt */}
      {selected && selected.price_usd > 0 && (
        <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6">
          <h2 className="font-semibold text-white mb-1">Upgrade to {selected.name}</h2>
          <p className="text-gray-400 text-sm mb-4">
            Pay ${selected.price_usd}/mo and upload your payment receipt. Admin will activate your plan within 24 hours.
          </p>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            onChange={e => setFile(e.target.files?.[0] ?? null)}
            className="hidden"
          />
          <button
            onClick={() => fileRef.current?.click()}
            className="border border-dashed border-gray-600 hover:border-indigo-500 rounded-xl px-4 py-3 text-gray-400 text-sm w-full mb-4 transition"
          >
            {file ? `✓ ${file.name}` : '📎 Upload receipt (JPEG, PNG, PDF — max 10 MB)'}
          </button>
          {error && <p className="text-red-400 text-sm mb-3">{error}</p>}
          <button
            onClick={handleUpgrade}
            disabled={!file || submitting}
            className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white py-2.5 rounded-xl font-medium transition"
          >
            {submitting ? 'Submitting…' : 'Submit Payment'}
          </button>
        </div>
      )}
    </div>
  )
}
