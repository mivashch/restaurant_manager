import { useState, useEffect } from 'react'

type AppUser = { id: number; username: string; role: string }
type DraftUser = { id?: number; username: string; role: string }

const ROLES = ['admin', 'waiter', 'kitchen', 'runner'] as const
type Role = typeof ROLES[number]

const ROLE_PREFIX: Record<Role, string> = {
  admin: 'ADMIN',
  waiter: 'WAITER',
  kitchen: 'KITCHEN',
  runner: 'RUNNER',
}

const ROLE_COLORS: Record<Role, string> = {
  admin: 'bg-purple-100 text-purple-700',
  waiter: 'bg-blue-100 text-blue-700',
  kitchen: 'bg-orange-100 text-orange-700',
  runner: 'bg-emerald-100 text-emerald-700',
}

function nextUsername(users: AppUser[], role: Role): string {
  const prefix = ROLE_PREFIX[role]
  const nums = users
    .filter(u => u.role === role && u.username.startsWith(prefix + '-'))
    .map(u => parseInt(u.username.slice(prefix.length + 1), 10))
    .filter(n => !isNaN(n))
  const max = nums.length ? Math.max(...nums) : 0
  return `${prefix}-${String(max + 1).padStart(3, '0')}`
}

function UserModal({
  user,
  users,
  onSave,
  onClose,
}: {
  user: DraftUser
  users: AppUser[]
  onSave: (u: DraftUser) => Promise<void>
  onClose: () => void
}) {
  const [form, setForm] = useState<DraftUser>(user)
  const [saving, setSaving] = useState(false)

  function handleRoleChange(role: string) {
    if (!form.id) {
      setForm(f => ({ ...f, role, username: nextUsername(users, role as Role) }))
    } else {
      setForm(f => ({ ...f, role }))
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.username.trim() || !form.role) return
    setSaving(true)
    try { await onSave(form) } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-neutral-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 border border-neutral-100">
        <h2 className="text-xl font-semibold text-neutral-800 mb-6">
          {form.id ? 'Edit user' : 'New user'}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium uppercase tracking-wider text-neutral-400 mb-1">
              Role
            </label>
            <select
              required
              value={form.role}
              onChange={e => handleRoleChange(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-neutral-800 transition"
            >
              {ROLES.map(r => (
                <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium uppercase tracking-wider text-neutral-400 mb-1">
              Private ID
            </label>
            <input
              required
              value={form.username}
              onChange={e => setForm(f => ({ ...f, username: e.target.value.toUpperCase() }))}
              placeholder="e.g. WAITER-002"
              className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-neutral-800 transition"
            />
            <p className="text-xs text-neutral-400 mt-1">
              Цей код співробітник вводить при вході в систему.
            </p>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 rounded-xl border border-neutral-200 text-neutral-600 text-sm font-medium hover:bg-neutral-50 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-3 rounded-xl bg-neutral-800 text-white text-sm font-medium hover:bg-neutral-700 disabled:opacity-50 transition"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function UserManager() {
  const [users, setUsers] = useState<AppUser[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<DraftUser | null>(null)
  const [activeRole, setActiveRole] = useState<string>('All')

  useEffect(() => {
    fetch('/api/users')
      .then(r => r.json())
      .then(json => { if (json.data) setUsers(json.data) })
      .finally(() => setLoading(false))
  }, [])

  const roleTabs = ['All', ...ROLES]
  const visible = activeRole === 'All' ? users : users.filter(u => u.role === activeRole)

  async function saveUser(draft: DraftUser) {
    const method = draft.id ? 'PUT' : 'POST'
    const url = draft.id ? `/api/users/${draft.id}` : '/api/users'
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: draft.username, role: draft.role }),
    })
    const json = await res.json()
    if (!json.data) return
    setUsers(us =>
      draft.id ? us.map(u => u.id === draft.id ? json.data : u) : [...us, json.data]
    )
    setEditing(null)
  }

  async function deleteUser(id: number) {
    if (!confirm('Delete this user? They will no longer be able to log in.')) return
    await fetch(`/api/users/${id}`, { method: 'DELETE' })
    setUsers(us => us.filter(u => u.id !== id))
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex items-end justify-between gap-4">
        <div className="flex items-center gap-0 border-b border-neutral-200 flex-1 min-w-0 overflow-x-auto">
          {roleTabs.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveRole(tab)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${
                activeRole === tab
                  ? 'border-neutral-800 text-neutral-800'
                  : 'border-transparent text-neutral-400 hover:text-neutral-600'
              }`}
            >
              {tab === 'All' ? 'All' : tab.charAt(0).toUpperCase() + tab.slice(1)}
              <span className="ml-1.5 text-xs text-neutral-300">
                {tab === 'All' ? users.length : users.filter(u => u.role === tab).length}
              </span>
            </button>
          ))}
        </div>
        <button
          onClick={() => setEditing({ username: nextUsername(users, 'waiter'), role: 'waiter' })}
          className="px-4 py-2 text-sm font-medium rounded-lg bg-neutral-800 text-white hover:bg-neutral-700 transition shrink-0"
        >
          + Add user
        </button>
      </div>

      {/* Table */}
      {loading ? (
        <p className="text-sm text-neutral-400 animate-pulse">Loading…</p>
      ) : visible.length === 0 ? (
        <p className="text-sm text-neutral-400">No users yet.</p>
      ) : (
        <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-100 bg-neutral-50">
                <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wider text-neutral-400">
                  Private ID
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wider text-neutral-400">
                  Role
                </th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {visible.map(user => (
                <tr key={user.id} className="border-b border-neutral-50 last:border-0 hover:bg-neutral-50 transition-colors">
                  <td className="px-4 py-3 font-mono font-medium text-neutral-800">
                    {user.username}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${ROLE_COLORS[user.role as Role] ?? 'bg-neutral-100 text-neutral-500'}`}>
                      {user.role}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3 justify-end">
                      <button
                        onClick={() => setEditing(user)}
                        className="text-xs text-neutral-400 hover:text-neutral-700 transition"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => deleteUser(user.id)}
                        className="text-xs text-red-400 hover:text-red-600 transition"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <UserModal
          user={editing}
          users={users}
          onSave={saveUser}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}
