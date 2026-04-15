import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { apiClient } from '../lib/apiClient'

export default function RegisterPage() {
  const navigate = useNavigate()
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [apiKey, setApiKey] = useState<string | null>(null)
  const [customerId, setCustomerId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await apiClient.post('/auth/register', form)
      setApiKey(res.data.api_key)
      setCustomerId(res.data.customer_id)
      // Store the key so the chat client can use it immediately
      localStorage.setItem('bemnet_api_key', res.data.api_key)
    } catch (err: any) {
      setError(err.response?.data?.detail ?? 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  const copyKey = () => {
    if (apiKey) {
      navigator.clipboard.writeText(apiKey)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  if (apiKey) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
        <div className="bg-gray-900 rounded-2xl p-8 w-full max-w-md border border-gray-700">
          <div className="text-green-400 text-4xl mb-4 text-center">✓</div>
          <h1 className="text-2xl font-bold text-white text-center mb-1">Account Created!</h1>
          <p className="text-gray-400 text-sm text-center mb-6">Customer ID: <span className="font-mono text-indigo-400">{customerId}</span></p>

          <div className="bg-yellow-950 border border-yellow-600 rounded-xl p-4 mb-4">
            <p className="text-yellow-400 font-semibold text-sm mb-2">⚠ Save your API key — shown once only</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-gray-950 text-green-400 text-xs p-2 rounded-lg break-all font-mono">
                {apiKey}
              </code>
              <button
                onClick={copyKey}
                className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs px-3 py-2 rounded-lg transition shrink-0"
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </div>

          <button
            onClick={() => navigate('/login')}
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-2.5 rounded-xl font-medium transition"
          >
            Go to Login
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="bg-gray-900 rounded-2xl p-8 w-full max-w-md border border-gray-700">
        <h1 className="text-2xl font-bold text-white mb-1">Create Account</h1>
        <p className="text-gray-400 text-sm mb-6">Get your API key and start using Bemnet AI</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-300 mb-1">Name</label>
            <input
              type="text"
              required
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2.5 text-white outline-none focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-300 mb-1">Email</label>
            <input
              type="email"
              required
              value={form.email}
              onChange={e => setForm({ ...form, email: e.target.value })}
              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2.5 text-white outline-none focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-300 mb-1">Password</label>
            <input
              type="password"
              required
              minLength={8}
              value={form.password}
              onChange={e => setForm({ ...form, password: e.target.value })}
              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2.5 text-white outline-none focus:border-indigo-500"
            />
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white py-2.5 rounded-xl font-medium transition"
          >
            {loading ? 'Creating account…' : 'Create Account'}
          </button>
        </form>

        <p className="text-gray-500 text-sm text-center mt-4">
          Already have an account?{' '}
          <Link to="/login" className="text-indigo-400 hover:underline">Login</Link>
        </p>
      </div>
    </div>
  )
}
