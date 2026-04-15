import { useEffect, useState } from 'react'
import { apiClient } from '../../lib/apiClient'

interface User {
  id: number; customer_id: string; name: string; email: string
  role: string; status: string; created_at: string
}

export default function AdminUsersTab() {
  const [users, setUsers] = useState<User[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  const load = () => apiClient.get('/admin/users').then(r => setUsers(r.data)).finally(() => setLoading(false))
  useEffect(() => { load() }, [])

  const patch = async (id: number, body: object) => {
    await apiClient.patch(`/admin/users/${id}`, body)
    load()
  }

  const filtered = users.filter(u =>
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-white mb-5">👥 Users</h1>
      <input
        value={search} onChange={e => setSearch(e.target.value)}
        placeholder="Search by name or email…"
        className="bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-purple-500 mb-5 w-72"
      />
      {loading ? <p className="text-gray-500">Loading…</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-400 text-left border-b border-gray-800">
                <th className="pb-2 pr-6">Name</th>
                <th className="pb-2 pr-6">Email</th>
                <th className="pb-2 pr-4">Role</th>
                <th className="pb-2 pr-4">Status</th>
                <th className="pb-2">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {filtered.map(u => (
                <tr key={u.id}>
                  <td className="py-3 pr-6 text-white">{u.name}</td>
                  <td className="py-3 pr-6 text-gray-400">{u.email}</td>
                  <td className="py-3 pr-4">
                    <span className="capitalize bg-gray-700 text-gray-300 text-xs px-2 py-0.5 rounded-full">{u.role}</span>
                  </td>
                  <td className="py-3 pr-4">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      u.status === 'active' ? 'bg-green-900 text-green-400' : 'bg-red-900 text-red-400'
                    }`}>{u.status}</span>
                  </td>
                  <td className="py-3 flex gap-2">
                    {u.status === 'active'
                      ? <button onClick={() => patch(u.id, { status: 'suspended' })} className="text-xs text-red-400 hover:text-red-300 border border-red-800 px-2 py-0.5 rounded">Suspend</button>
                      : <button onClick={() => patch(u.id, { status: 'active' })} className="text-xs text-green-400 hover:text-green-300 border border-green-800 px-2 py-0.5 rounded">Activate</button>
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
