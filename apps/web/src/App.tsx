import { useState } from 'react'
import type { User, Role } from '@restaurant-manager/shared'

const ROLE_LABELS: Record<Role, string> = {
  admin: 'Admin',
  waiter: 'Waiter',
  kitchen: 'Kitchen',
  runner: 'Runner',
}

const ALL_ROLES: Role[] = ['admin', 'waiter', 'kitchen', 'runner']

function LoginScreen({ onLogin }: { onLogin: (user: User) => void }) {
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(formData: FormData) {
    const privateId = formData.get('privateId') as string
    setError(null)
    setLoading(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ privateId }),
      })
      const json = await res.json()
      if (!res.ok || json.error) {
        setError(json.error ?? 'Login failed')
      } else {
        onLogin(json.data.user)
      }
    } catch {
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="flex-1 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold text-neutral-800 mb-8">Sign in</h1>
        <form action={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="privateId"
              className="block text-xs font-medium uppercase tracking-wider text-neutral-400 mb-2"
            >
              Private ID
            </label>
            <input
              id="privateId"
              name="privateId"
              type="text"
              placeholder="Enter your private ID"
              className="w-full px-4 py-3 rounded-xl border border-neutral-200 bg-white text-neutral-800 placeholder-neutral-300 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-800 focus:border-transparent transition"
            />
          </div>
          {error && (
            <p className="text-sm text-red-500">{error}</p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl bg-neutral-800 text-white text-sm font-medium hover:bg-neutral-700 active:bg-neutral-900 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Signing in...' : 'Continue'}
          </button>
        </form>
      </div>
    </main>
  )
}

function RoleScreen({ user, onSelect }: { user: User; onSelect: (role: Role) => void }) {
  return (
    <main className="flex-1 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <p className="text-xs font-medium uppercase tracking-wider text-neutral-400 mb-1">
          Welcome, {user.name}
        </p>
        <h1 className="text-2xl font-semibold text-neutral-800 mb-8">Choose role</h1>
        <div className="grid grid-cols-2 gap-3">
          {ALL_ROLES.map((role) => {
            const active = user.roles.includes(role)
            return (
              <button
                key={role}
                onClick={() => onSelect(role)}
                disabled={!active}
                className={[
                  'py-6 rounded-xl border text-sm font-medium transition',
                  active
                    ? 'border-neutral-200 bg-white text-neutral-800 hover:border-neutral-400 hover:bg-neutral-50 cursor-pointer'
                    : 'border-neutral-100 bg-neutral-50 text-neutral-300 cursor-not-allowed',
                ].join(' ')}
              >
                {ROLE_LABELS[role]}
              </button>
            )
          })}
        </div>
      </div>
    </main>
  )
}

export default function App() {
  const [user, setUser] = useState<User | null>(null)
  const [activeRole, setActiveRole] = useState<Role | null>(null)

  if (activeRole) {
    return (
      <div className="min-h-screen bg-neutral-50 flex flex-col">
        <Header />
        <main className="flex-1 flex items-center justify-center px-4">
          <div className="w-full max-w-sm text-center">
            <p className="text-neutral-400 text-sm mb-2 uppercase tracking-widest font-medium">{activeRole}</p>
            <h1 className="text-2xl font-semibold text-neutral-800 mb-8">Dashboard</h1>
            <button
              onClick={() => setActiveRole(null)}
              className="text-sm text-neutral-400 hover:text-neutral-600 transition underline underline-offset-4"
            >
              Back to roles
            </button>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-neutral-50 flex flex-col">
      <Header />
      {user ? (
        <RoleScreen user={user} onSelect={setActiveRole} />
      ) : (
        <LoginScreen onLogin={setUser} />
      )}
    </div>
  )
}

function Header() {
  return (
    <header className="bg-white border-b border-neutral-200 px-6 py-4">
      <span className="text-sm font-medium tracking-widest uppercase text-neutral-400">
        Restaurant Table Management
      </span>
    </header>
  )
}
