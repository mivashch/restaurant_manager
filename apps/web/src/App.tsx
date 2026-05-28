import { useState, useEffect } from 'react'
import type { User, Role } from '@restaurant-manager/shared'
import FloorPlanEditor, { type Plan } from './components/FloorPlanEditor'
import { usePersistedState } from './lib/usePersistedState'
import MenuEditor from './components/MenuEditor'
import UserManager from './components/UserManager'
import WaiterPage from './components/WaiterPage'
import KitchenPage from './components/KitchenPage'


type PageRole = 'admin' | 'waiter' | 'kitchen'

const ROLE_LABELS: Record<PageRole, string> = {
  admin: 'Admin',
  waiter: 'Waiter',
  kitchen: 'Kitchen',
}

const ALL_ROLES: PageRole[] = ['admin', 'waiter', 'kitchen']

function canOpenRole(user: User, role: PageRole) {
  return (user.roles as string[]).includes('superadmin') || user.roles.includes(role)

}

// ── Admin page ────────────────────────────────────────────────────────────────

type AdminSection = 'floor' | 'menu' | 'users'

type FloorData = {
  id?: number
  floor_number: number
  name: string
  data: Plan
}

function AdminPage({ onBack }: { onBack: () => void }) {
  const [section, setSection] = usePersistedState<AdminSection>('rm_admin_section', 'floor')
  const [floors, setFloors] = useState<FloorData[]>([])
  const [activeFloor, setActiveFloor] = usePersistedState('rm_admin_floor', 1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/floor-plans')
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then(json => {
        if (json.data?.length) {
          const loaded: FloorData[] = json.data.map((f: { id: number; floor_number: number; name: string; data: Plan }) => ({
            id: f.id,
            floor_number: f.floor_number,
            name: f.name,
            data: f.data as Plan,
          }))
          setFloors(loaded)
          const valid = loaded.find(f => f.floor_number === activeFloor)
          if (!valid) setActiveFloor(loaded[0].floor_number)
        } else {
          setFloors([{ floor_number: 1, name: 'Floor 1', data: { rooms: [], tables: [] } }])
          setActiveFloor(1)
        }
      })
      .catch(() => setError('Failed to load floor plans'))
      .finally(() => setLoading(false))
  }, [])

  function makeSaveHandler(floorNumber: number) {
    return async (data: Plan & { id?: number }) => {
      const floor = floors.find(f => f.floor_number === floorNumber)
      try {
        const res = await fetch('/api/floor-plan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: data.id,
            floor_number: floorNumber,
            name: floor?.name,
            rooms: data.rooms,
            tables: data.tables,
          }),
        })
        const json = await res.json()
        if (!res.ok || json.error || !json.data) {
          alert(`Failed to save floor plan${json.error ? `: ${json.error}` : ''}`)
          return
        }
        if (json.data?.id) {
          setFloors(fs => fs.map(f =>
            f.floor_number === floorNumber
              ? { ...f, id: json.data.id, data: { rooms: data.rooms, tables: data.tables } }
              : f
          ))
        }
      } catch {
        alert('Failed to save floor plan. Please try again.')
      }
    }
  }

  function addFloor() {
    const maxFloor = Math.max(...floors.map(f => f.floor_number), 0)
    const n = maxFloor + 1
    const newFloor: FloorData = {
      floor_number: n,
      name: `Floor ${n}`,
      data: { rooms: [], tables: [] },
    }
    setFloors(fs => [...fs, newFloor])
    setActiveFloor(n)
  }

  async function deleteFloor(floorNumber: number) {
    const floor = floors.find(f => f.floor_number === floorNumber)
    if (floor?.id) {
      try {
        const res = await fetch(`/api/floor-plan/${floor.id}`, { method: 'DELETE' })
        const json = await res.json().catch(() => null)
        if (!res.ok || json?.error) {
          alert(`Failed to delete floor${json?.error ? `: ${json.error}` : ''}`)
          return
        }
      } catch {
        alert('Failed to delete floor. Please try again.')
        return
      }
    }
    const remaining = floors.filter(f => f.floor_number !== floorNumber)
    setFloors(remaining)
    if (activeFloor === floorNumber && remaining.length > 0) {
      setActiveFloor(remaining[0].floor_number)
    }
  }

  const currentFloor = floors.find(f => f.floor_number === activeFloor)

  // Global max table num across all floors except the active one (for offset)
  const tableNumOffset = Math.max(
    0,
    ...floors
      .filter(f => f.floor_number !== activeFloor)
      .flatMap(f => f.data.tables.map(t => t.num))
  )

  return (
    <div className="min-h-screen bg-neutral-50 flex flex-col">
      <header className="bg-white border-b border-neutral-200 px-6 py-4 flex items-center justify-between">
        <span className="text-sm font-medium tracking-widest uppercase text-neutral-400">
          Restaurant Table Management
        </span>
        <button
          onClick={onBack}
          className="text-xs text-neutral-400 hover:text-neutral-600 transition underline underline-offset-4"
        >
          Back to roles
        </button>
      </header>
      <main className="flex-1 flex flex-col px-6 py-6">
        {/* Section tabs */}
        <div className="flex items-center gap-2 mb-6">
          {(['floor', 'menu', 'users'] as AdminSection[]).map(s => (
            <button
              key={s}
              onClick={() => setSection(s)}
              className={`px-5 py-2 rounded-lg text-base font-semibold transition-colors ${
                section === s
                  ? 'bg-neutral-900 text-white'
                  : 'text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100'
              }`}
            >
              {s === 'floor' ? 'Floor plan' : s === 'menu' ? 'Menu' : 'Users'}
            </button>
          ))}
        </div>

        {section === 'menu' && <MenuEditor />}
        {section === 'users' && <UserManager />}

        {section === 'floor' && <>
        {/* Floor tabs */}
        <div className="flex items-center gap-0 border-b border-neutral-200 mb-4">
          {floors.map(floor => (
            <div key={floor.floor_number} className="flex items-center">
              <button
                onClick={() => setActiveFloor(floor.floor_number)}
                className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  activeFloor === floor.floor_number
                    ? 'border-neutral-800 text-neutral-800'
                    : 'border-transparent text-neutral-400 hover:text-neutral-600'
                }`}
              >
                {floor.name}
              </button>
              {floors.length > 1 && (
                <button
                  onClick={() => deleteFloor(floor.floor_number)}
                  title={`Delete ${floor.name}`}
                  className="ml-0.5 mr-1 w-4 h-4 rounded text-neutral-300 hover:text-red-400 text-xs leading-none transition-colors"
                >
                  ×
                </button>
              )}
            </div>
          ))}
          <button
            onClick={addFloor}
            className="px-3 py-2 text-sm text-neutral-400 hover:text-neutral-700 transition-colors"
          >
            + Add floor
          </button>
        </div>

        {loading ? (
          <p className="text-sm text-neutral-400 animate-pulse">Loading…</p>
        ) : error ? (
          <p className="text-sm text-red-500">{error}</p>
        ) : currentFloor ? (
          <FloorPlanEditor
            key={activeFloor}
            initial={currentFloor.data}
            planId={currentFloor.id}
            tableNumOffset={tableNumOffset}
            onSave={makeSaveHandler(activeFloor)}
          />
        ) : null}
        </>}
      </main>
    </div>
  )
}

// ── Login ─────────────────────────────────────────────────────────────────────

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
            <label htmlFor="privateId" className="block text-xs font-medium uppercase tracking-wider text-neutral-400 mb-2">
              Private ID
            </label>
            <input
              id="privateId" name="privateId" type="text"
              placeholder="Enter your private ID"
              className="w-full px-4 py-3 rounded-xl border border-neutral-200 bg-white text-neutral-800 placeholder-neutral-300 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-800 focus:border-transparent transition"
            />
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button
            type="submit" disabled={loading}
            className="w-full py-3 rounded-xl bg-neutral-800 text-white text-sm font-medium hover:bg-neutral-700 active:bg-neutral-900 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Signing in…' : 'Continue'}
          </button>
        </form>
      </div>
    </main>
  )
}

// ── Role selection ────────────────────────────────────────────────────────────

function RoleScreen({ user, onSelect, onLogout }: { user: User; onSelect: (role: PageRole) => void; onLogout: () => void }) {
  return (
    <main className="flex-1 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-baseline justify-between mb-1">
          <p className="text-xs font-medium uppercase tracking-wider text-neutral-400">
            Welcome, {user.name}
          </p>
          <button
            onClick={onLogout}
            className="text-xs text-neutral-400 hover:text-neutral-600 transition underline underline-offset-4"
          >
            Sign out
          </button>
        </div>
        <h1 className="text-2xl font-semibold text-neutral-800 mb-8">Choose role</h1>
        <div className="grid grid-cols-2 gap-3">
          {ALL_ROLES.map(role => {
            const active = canOpenRole(user, role)
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

// ── Root ──────────────────────────────────────────────────────────────────────

const USER_KEY = 'rm_user'
const ROLE_KEY = 'rm_role'

export default function App() {
  const [user, setUser] = useState<User | null>(() => {
    try {
      const stored = localStorage.getItem(USER_KEY)
      return stored ? (JSON.parse(stored) as User) : null
    } catch { return null }
  })
  const [activeRole, setActiveRole] = useState<PageRole | null>(() => {
    try {
      const stored = sessionStorage.getItem(ROLE_KEY)

      if (stored === 'admin' || stored === 'waiter' || stored === 'kitchen') {
        return stored
      }

      return null
    } catch {
      return null
    }
  })

  useEffect(() => {
    if (activeRole) sessionStorage.setItem(ROLE_KEY, activeRole)
    else sessionStorage.removeItem(ROLE_KEY)
  }, [activeRole])

  function handleLogin(u: User) {
    localStorage.setItem(USER_KEY, JSON.stringify(u))
    sessionStorage.removeItem(ROLE_KEY)
    setActiveRole(null)
    setUser(u)
  }

  function handleLogout() {
    localStorage.removeItem(USER_KEY)
    sessionStorage.removeItem(ROLE_KEY)
    setUser(null)
    setActiveRole(null)
  }

  if (activeRole === 'admin') {
    return <AdminPage onBack={() => setActiveRole(null)} />
  }

  if (activeRole === 'waiter' && user) {
    return <WaiterPage user={user} onBack={() => setActiveRole(null)} />
  }
  if (activeRole === 'kitchen' && user) {
    return <KitchenPage user={user} onBack={() => setActiveRole(null)} />
  }

  if (activeRole) {
    return (
      <div className="min-h-screen bg-neutral-50 flex flex-col">
        <Header />
        <main className="flex-1 flex items-center justify-center px-4">
          <div className="w-full max-w-sm text-center">
            <p className="text-neutral-400 text-sm mb-2 uppercase tracking-widest font-medium">
              {activeRole}
            </p>
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
      {user
        ? <RoleScreen user={user} onSelect={setActiveRole} onLogout={handleLogout} />
        : <LoginScreen onLogin={handleLogin} />
      }
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
