import { useEffect, useState } from 'react'
import type { User } from '@restaurant-manager/shared'

type KitchenOrder = {
  order_id: number
  status: 'open' | 'new' | 'preparing' | 'ready' | 'served'
  created_at: string
  restaurant_tables: {
    table_number: number
  } | null
  item_name?: string
  quantity?: number
  ordered_by?: string
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function KitchenPage({
  user,
  onBack,
}: {
  user: User
  onBack: () => void
}) {
  const [orders, setOrders] = useState<KitchenOrder[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadOrders(silent = false) {
      try {
        const res = await fetch('/api/orders/kitchen')
        const json = await res.json().catch(() => null)

        if (!res.ok || json?.error) {
          if (!silent) setOrders([])
          return
        }

        setOrders(json?.data ?? [])
      } catch {
        if (!silent) setOrders([])
      } finally {
        if (!silent) setLoading(false)
      }
    }

    loadOrders()

    const interval = window.setInterval(() => {
      loadOrders(true)
    }, 3000)

    return () => window.clearInterval(interval)
  }, [])

  async function handleStart(orderId: number) {
    try {
      const res = await fetch(`/api/orders/${orderId}/start`, {
        method: 'PATCH',
      })

      const json = await res.json().catch(() => null)

      if (!res.ok || json?.error) {
        return
      }

      setOrders(prev =>
        prev.map(order =>
          order.order_id === orderId
            ? { ...order, status: 'preparing' }
            : order,
        ),
      )
    } catch {
      //
    }
  }

  async function handleReady(orderId: number) {
    try {
      const res = await fetch(`/api/orders/${orderId}/ready`, {
        method: 'PATCH',
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
          Kitchen • {user.name}
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
          <p className="text-sm text-neutral-400">No orders in kitchen queue.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {orders.map(order => {
              const isPreparing = order.status === 'preparing'

              return (
                <div
                  key={order.order_id}
                  className={[
                    'bg-white rounded-2xl shadow-sm p-4 w-full border-2',
                    isPreparing ? 'border-emerald-300' : 'border-rose-300',
                  ].join(' ')}
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
                      {formatTime(order.created_at)}
                    </p>
                  </div>

                  <p className="mt-4 text-sm text-slate-400">
                    Ordered by {order.ordered_by ?? 'Waiter'}
                  </p>

                  {isPreparing ? (
                    <button
                      onClick={() => handleReady(order.order_id)}
                      className="mt-5 w-full h-11 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold transition"
                    >
                      Mark as Ready
                    </button>
                  ) : (
                    <button
                      onClick={() => handleStart(order.order_id)}
                      className="mt-5 w-full h-11 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold transition"
                    >
                      Start Preparing
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}