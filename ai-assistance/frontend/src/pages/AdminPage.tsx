import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../lib/authStore'

const nav = [
  { to: '/admin/users',    label: '👥 Users' },
  { to: '/admin/payments', label: '💳 Payments' },
  { to: '/admin/usage',    label: '📊 Usage' },
  { to: '/admin/keys',     label: '🔑 Keys' },
  { to: '/admin/plans',    label: '⭐ Plans' },
  { to: '/admin/sessions', label: '💬 Sessions' },
]

export default function AdminPage() {
  const logout = useAuthStore(s => s.logout)
  const navigate = useNavigate()

  return (
    <div className="flex min-h-screen bg-gray-950 text-white">
      <aside className="w-60 bg-gray-900 border-r border-gray-800 flex flex-col">
        <div className="px-5 py-5 border-b border-gray-800">
          <span className="text-lg font-bold text-purple-400">Bemnet Admin</span>
        </div>
        <nav className="flex-1 py-4 space-y-1 px-3">
          {nav.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `block px-3 py-2 rounded-lg text-sm transition ${
                  isActive ? 'bg-purple-700 text-white font-medium' : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="px-3 py-4 border-t border-gray-800 space-y-1">
          <NavLink to="/dashboard" className="block px-3 py-2 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-gray-800 transition">
            ← User Dashboard
          </NavLink>
          <button
            onClick={() => { logout(); navigate('/login') }}
            className="w-full text-left px-3 py-2 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-gray-800 transition"
          >
            🚪 Logout
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto"><Outlet /></main>
    </div>
  )
}
