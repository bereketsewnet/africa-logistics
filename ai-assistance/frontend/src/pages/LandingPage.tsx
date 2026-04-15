import { Link } from 'react-router-dom'

const plans = [
  { name: 'Basic', limit: '500 requests/day', price: 'Free', highlight: false },
  { name: 'Pro', limit: '700 requests/day', price: '$9.99/mo', highlight: true },
  { name: 'Ultra', limit: 'Unlimited', price: '$29.99/mo', highlight: false },
]

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Nav */}
      <nav className="flex items-center justify-between px-8 py-4 border-b border-gray-800">
        <span className="text-xl font-bold text-indigo-400">Bemnet AI</span>
        <div className="flex gap-4">
          <Link to="/login" className="text-gray-300 hover:text-white transition">Login</Link>
          <Link to="/register" className="bg-indigo-600 hover:bg-indigo-500 px-4 py-1.5 rounded-lg text-sm font-medium transition">
            Get Started
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="text-center py-24 px-4">
        <h1 className="text-5xl font-extrabold mb-4 bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
          Your AI Logistics Assistant
        </h1>
        <p className="text-gray-400 text-lg max-w-xl mx-auto mb-8">
          Bemnet answers every question about Africa Logistics — shipments, drivers,
          orders, payments — instantly, 24/7, powered by your platform's own knowledge base.
        </p>
        <Link to="/register" className="bg-indigo-600 hover:bg-indigo-500 px-8 py-3 rounded-xl text-lg font-semibold transition">
          Start for Free
        </Link>
      </section>

      {/* Plans */}
      <section className="py-16 px-4">
        <h2 className="text-3xl font-bold text-center mb-10">Choose Your Plan</h2>
        <div className="flex flex-wrap justify-center gap-6">
          {plans.map((p) => (
            <div
              key={p.name}
              className={`rounded-2xl p-8 w-72 border ${
                p.highlight
                  ? 'border-indigo-500 bg-indigo-950'
                  : 'border-gray-700 bg-gray-900'
              }`}
            >
              {p.highlight && (
                <span className="text-xs bg-indigo-500 text-white px-2 py-0.5 rounded-full uppercase font-bold mb-3 inline-block">
                  Popular
                </span>
              )}
              <h3 className="text-2xl font-bold mb-1">{p.name}</h3>
              <p className="text-gray-400 text-sm mb-4">{p.limit}</p>
              <p className="text-3xl font-extrabold mb-6">{p.price}</p>
              <Link to="/register" className="block text-center bg-indigo-600 hover:bg-indigo-500 py-2 rounded-lg transition text-sm font-medium">
                Get Started
              </Link>
            </div>
          ))}
        </div>
      </section>

      <footer className="text-center text-gray-600 text-sm py-8 border-t border-gray-800">
        © 2026 Bemnet AI — Africa Logistics
      </footer>
    </div>
  )
}
