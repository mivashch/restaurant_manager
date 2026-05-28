import { useState, useEffect } from 'react'
import { usePersistedState } from '../lib/usePersistedState'

type AppUser = { id: number; username: string; role: string; permissions: string[] }
type DraftUser = { id?: number; username: string; role: string; permissions: string[] }

const ROLES = ['admin', 'waiter', 'kitchen', 'superadmin'] as const
type Role = typeof ROLES[number]

const ROLE_COLORS: Record<Role, string> = {
  admin: 'bg-purple-100 text-purple-700',
  waiter: 'bg-blue-100 text-blue-700',
  kitchen: 'bg-orange-100 text-orange-700',
  superadmin: 'bg-red-100 text-red-700',
}

async function fetchNextUsername(role: Role): Promise<string> {
  const res = await fetch(`/api/users/next-username?role=${role}`)
  const json = await res.json().catch(() => null)
  if (!res.ok || !json?.data?.username) throw new Error(json?.error ?? 'Failed to allocate username')
  return json.data.username as string
}

function UserModal({
  user,
  onSave,
  onClose,
}: {
  user: DraftUser
  onSave: (u: DraftUser) => Promise<void>
  onClose: () => void
}) {
  const [form, setForm] = useState<DraftUser>(user)
  const [saving, setSaving] = useState(false)

  async function handleRoleChange(role: string) {
    if (!form.id) {
      try {
        const username = await fetchNextUsername(role as Role)
        setForm(f => ({
          ...f,
          role,
          username,
          permissions: [...new Set([...f.permissions, role])],
        }))
      } catch {
        setForm(f => ({ ...f, role, permissions: [...new Set([...f.permissions, role])] }))
        alert('Failed to allocate username. Please enter manually.')
      }
    } else {
      setForm(f => ({ ...f, role, permissions: [...new Set([...f.permissions, role])] }))
    }
  }

  function togglePermission(r: string) {
    if (r === form.role) return
    setForm(f => ({
      ...f,
      permissions: f.permissions.includes(r)
        ? f.permissions.filter(p => p !== r)
        : [...f.permissions, r],
    }))
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
              Primary role
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
            <label className="block text-xs font-medium uppercase tracking-wider text-neutral-400 mb-2">
              Access permissions
            </label>
            <div className="flex flex-col gap-2">
              {ROLES.map(r => {
                const isPrimary = r === form.role
                const checked = form.permissions.includes(r)
                return (
                  <label
                    key={r}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg border transition cursor-pointer select-none ${
                      isPrimary
                        ? 'border-neutral-200 bg-neutral-50 opacity-60 cursor-not-allowed'
                        : checked
                        ? 'border-neutral-300 bg-white'
                        : 'border-neutral-100 bg-white hover:border-neutral-300'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={isPrimary}
                      onChange={() => togglePermission(r)}
                      className="w-4 h-4 accent-neutral-800"
                    />
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${ROLE_COLORS[r]}`}>
                      {r.charAt(0).toUpperCase() + r.slice(1)}
                    </span>
                    {isPrimary && (
                      <span className="text-xs text-neutral-400 ml-auto">primary</span>
                    )}
                  </label>
                )
              })}
            </div>
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
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<DraftUser | null>(null)
  const [activeRole, setActiveRole] = usePersistedState<string>('rm_user_filter', 'All')

  useEffect(() => {
    fetch('/api/users')
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then(json => { if (json.data) setUsers(json.data) })
      .catch(() => setError('Failed to load users'))
      .finally(() => setLoading(false))
  }, [])

  const roleTabs = ['All', ...ROLES]
  const visible = activeRole === 'All'
    ? users
    : users.filter(u => u.permissions.includes(activeRole))

  async function saveUser(draft: DraftUser) {
    const method = draft.id ? 'PUT' : 'POST'
    const url = draft.id ? `/api/users/${draft.id}` : '/api/users'
    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: draft.username,
          role: draft.role,
          permissions: draft.permissions,
        }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.data) {
        alert(`Failed to save user${json?.error ? `: ${json.error}` : ''}`)
        return
      }
      setUsers(us =>
        draft.id ? us.map(u => u.id === draft.id ? json.data : u) : [...us, json.data]
      )
      setEditing(null)
    } catch {
      alert('Failed to save user. Please try again.')
    }
  }

  async function deleteUser(id: number) {
    if (!confirm('Delete this user? They will no longer be able to log in.')) return
    try {
      const res = await fetch(`/api/users/${id}`, { method: 'DELETE' })
      const json = await res.json().catch(() => null)
      if (!res.ok || json?.error) {
        alert(`Failed to delete user${json?.error ? `: ${json.error}` : ''}`)
        return
      }
      setUsers(us => us.filter(u => u.id !== id))
    } catch {
      alert('Failed to delete user. Please try again.')
    }
  }

  async function handleAddUser() {
    const initialRole: Role = (ROLES as readonly string[]).includes(activeRole)
      ? (activeRole as Role)
      : 'waiter'
    try {
      const username = await fetchNextUsername(initialRole)
      setEditing({ username, role: initialRole, permissions: [initialRole] })
    } catch {
      setEditing({ username: '', role: initialRole, permissions: [initialRole] })
      alert('Failed to allocate username. Please enter manually.')
    }
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
                {tab === 'All'
                  ? users.length
                  : users.filter(u => u.permissions.includes(tab)).length}
              </span>
            </button>
          ))}
        </div>
        <button
          onClick={handleAddUser}
          className="px-4 py-2 text-sm font-medium rounded-lg bg-neutral-800 text-white hover:bg-neutral-700 transition shrink-0"
        >
          + Add user
        </button>
      </div>

      {/* Table */}
      {loading ? (
        <p className="text-sm text-neutral-400 animate-pulse">Loading…</p>
      ) : error ? (
        <p className="text-sm text-red-500">{error}</p>
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
                  Permissions
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
                    <div className="flex flex-wrap gap-1.5">
                      {(user.permissions.length ? user.permissions : [user.role]).map(p => (
                        <span
                          key={p}
                          className={`text-xs font-medium px-2.5 py-1 rounded-full ${ROLE_COLORS[p as Role] ?? 'bg-neutral-100 text-neutral-500'}`}
                        >
                          {p}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3 justify-end">
                      <button
                        onClick={() => setEditing({ ...user })}
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
          onSave={saveUser}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}
