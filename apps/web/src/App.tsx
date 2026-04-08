import { useEffect, useState } from 'react'
import type { HealthResponse } from '@restaurant-manager/shared'

export default function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json())
      .then((data: HealthResponse) => setHealth(data))
      .catch(() => setError('API unavailable'))
  }, [])

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center p-8">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-1">Restaurant Manager</h1>
        <p className="text-gray-500 mb-8">Test page. Pipeline configured.</p>

        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400 mb-3">
          API Status
        </h2>

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-red-700 text-sm">
            {error}
          </div>
        )}

        {health && (
          <pre className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm text-gray-700 font-mono">
            {JSON.stringify(health, null, 2)}
          </pre>
        )}

        {!health && !error && (
          <p className="text-gray-400 text-sm animate-pulse">Loading...</p>
        )}
      </div>
    </main>
  )
}