import { useEffect, useState } from 'react'
import type { User } from '@restaurant-manager/shared'

type RunnerOrder = {
  order_id: number
  status: string
  created_at: string
  restaurant_tables: {
    table_number: number
  } | null
  item_name?: string
  quantity?: number
  ordered_by?: string
  prepared_by?: string
}

function formatReadyTime(value: string) {
  return new Date(value).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function RunnerPage({
  user,
  onBack,
}: {
  user: User
  onBack: () => void
}) {
  const [orders, setOrders] = useState<RunnerOrder[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadOrders(silent = false) {
      try {
        const res = await fetch('/api/orders/runner')
        const json = await res.json().catch(() => null)

        if (!res.ok || json?.error) {
          if (!silent) setOrders([])
          return
        }

        const normalized = (json?.data ?? []).map((order: RunnerOrder) => ({
          ...order,
          item_name: order.item_name ?? 'Order',
          quantity: order.quantity ?? 1,
          ordered_by: order.ordered_by ?? user.name,
          prepared_by: order.prepared_by ?? 'Kitchen',
        }))

        setOrders(normalized)
      } catch {
        if (!silent) setOrders([])
      } finally {
        if (!silent) setLoading(false)
      }
    }

    loadOrders()
    const interval = window.setInterval(() => loadOrders(true), 3000)

    return () => window.clearInterval(interval)
  }, [user.name])

  async function handleDelivered(orderId: number) {
    try {
      const res = await fetch(`/api/orders/${orderId}/take`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runnerId: user.id }),
      })

      const json = await res.json().catch(() => null)

      if (!res.ok || json?.error) {
        return
      }

      setOrders(prev => prev.filter(order => order.order_id !== orderId))
    } catch {
      //
    }
  }

  return (
    <div className="min-h-screen bg-neutral-100 flex flex-col">
      <header className="bg-white border-b border-neutral-200 px-6 py-4 flex items-center justify-between">
        <span className="text-sm font-medium tracking-widest uppercase text-neutral-400">
          Restaurant Table Management
        </span>
        <span className="text-sm font-medium text-neutral-500">
          Runner • {user.name}
        </span>
      </header>

      <main className="flex-1 px-6 py-5">
        <button
          onClick={onBack}
          className="text-base text-sky-700 hover:text-sky-800 transition mb-5"
        >
          go back
        </button>

        {loading ? (
          <p className="text-sm text-neutral-400">Loading…</p>
        ) : orders.length === 0 ? (
          <p className="text-sm text-neutral-400">No ready orders.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {orders.map(order => (
              <div
                key={order.order_id}
                className="bg-white rounded-2xl shadow-sm p-4 w-full border-2 border-emerald-300"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xl font-semibold text-neutral-900 leading-none">
                      {order.item_name ?? 'Order'}
                    </p>

                    <p className="mt-2 text-sm text-neutral-600 leading-none">
                      Table {order.restaurant_tables?.table_number ?? '—'} • Quantity:{' '}
                      {order.quantity ?? 1}
                    </p>
                  </div>

                  <p className="text-sm text-slate-400 whitespace-nowrap">
                    {formatReadyTime(order.created_at)}
                  </p>
                </div>

                <p className="mt-4 text-sm text-slate-400">
                  Ordered by {order.ordered_by ?? 'Waiter'} • Prepared by{' '}
                  {order.prepared_by ?? 'Kitchen'}
                </p>

                <button
                  onClick={() => handleDelivered(order.order_id)}
                  className="mt-5 w-full h-11 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold transition flex items-center justify-center gap-2"
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    className="shrink-0"
                    aria-hidden="true"
                  >
                    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
                    <path
                      d="M8 12.5L10.8 15.3L16.5 9.5"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  Mark as Delivered
                </button>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}