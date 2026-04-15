import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../lib/authStore'

const nav = [
  { to: '/dashboard/chat',    label: '💬 Chat' },
  { to: '/dashboard/keys',    label: '🔑 API Keys' },
  { to: '/dashboard/usage',   label: '📊 Usage' },
  { to: '/dashboard/plans',   label: '⭐ Plans & Billing' },
  { to: '/dashboard/history', label: '🧾 Payment History' },
]

export default function DashboardPage() {
  const logout = useAuthStore(s => s.logout)
  const user = useAuthStore(s => s.user)
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div className="flex min-h-screen bg-gray-950 text-white">
      {/* Sidebar */}
      <aside className="w-60 bg-gray-900 border-r border-gray-800 flex flex-col">
        <div className="px-5 py-5 border-b border-gray-800">
          <span className="text-lg font-bold text-indigo-400">Bemnet AI</span>
          <p className="text-xs text-gray-500 mt-0.5 truncate">{user?.email}</p>
        </div>

        <nav className="flex-1 py-4 space-y-1 px-3">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `block px-3 py-2 rounded-lg text-sm transition ${
                  isActive
                    ? 'bg-indigo-700 text-white font-medium'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="px-3 py-4 border-t border-gray-800">
          <button
            onClick={handleLogout}
            className="w-full text-left px-3 py-2 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-gray-800 transition"
          >
            🚪 Logout
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
