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

const MOCK_ORDERS: RunnerOrder[] = [
  {
    order_id: 101,
    status: 'ready',
    created_at: new Date().toISOString(),
    restaurant_tables: { table_number: 4 },
    item_name: 'Ribeye Steak',
    quantity: 1,
    ordered_by: 'Jounne Doje',
    prepared_by: 'A',
  },
  {
    order_id: 102,
    status: 'ready',
    created_at: new Date().toISOString(),
    restaurant_tables: { table_number: 2 },
    item_name: 'Caesar Salad',
    quantity: 2,
    ordered_by: 'Jounne Doje',
    prepared_by: 'A',
  },
  {
    order_id: 103,
    status: 'ready',
    created_at: new Date().toISOString(),
    restaurant_tables: { table_number: 7 },
    item_name: 'Pasta',
    quantity: 1,
    ordered_by: 'Jounne Doje',
    prepared_by: 'A',
  },
]

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
    async function loadOrders() {
        try {
        const res = await fetch('/api/orders/runner')
        const json = await res.json()

        if (!res.ok || json.error) {
            setOrders(MOCK_ORDERS)
            return
        }

        const normalized = (json.data ?? []).map((order: RunnerOrder) => ({
            ...order,
            item_name: order.item_name ?? 'Ribeye Steak',
            quantity: order.quantity ?? 1,
            ordered_by: order.ordered_by ?? user.name,
            prepared_by: order.prepared_by ?? 'Kitchen',
        }))

        setOrders(normalized.length > 0 ? normalized : MOCK_ORDERS)
        } catch {
        setOrders(MOCK_ORDERS)
        } finally {
        setLoading(false)
        }
    }

    loadOrders()
    }, [user.name])

  async function handleDelivered(orderId: number) {
    try {
      await fetch(`/api/orders/${orderId}/take`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runnerId: user.id }),
      })
    } catch {
      // TODO
    }

    setOrders(prev => prev.filter(order => order.order_id !== orderId))
  }

  return (
    <div className="min-h-screen bg-neutral-50 flex flex-col">
      <header className="bg-white border-b border-neutral-200 px-6 py-4 flex items-center justify-between">
        <span className="text-sm font-medium tracking-widest uppercase text-neutral-400">
          Restaurant Table Management
        </span>
        <span className="text-sm font-medium text-neutral-500">
          Runner
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
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {orders.map(order => (
              <div
                key={order.order_id}
                className="bg-white rounded-2xl border border-neutral-200 shadow-sm p-4 w-full"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[26px] font-semibold text-neutral-900 leading-none">
                      {order.item_name}
                    </p>
                    <p className="mt-2 text-[22px] text-neutral-600 leading-none">
                      Table {order.restaurant_tables?.table_number ?? '—'} • Quantity: {order.quantity}
                    </p>
                  </div>

                  <p className="text-[20px] text-slate-400 whitespace-nowrap">
                    Ready: {formatReadyTime(order.created_at)}
                  </p>
                </div>

                <p className="mt-4 text-[18px] text-slate-400">
                  Ordered by {order.ordered_by} • Prepared by {order.prepared_by}
                </p>

                <button
                  onClick={() => handleDelivered(order.order_id)}
                  className="mt-5 w-full h-14 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-white text-[24px] font-semibold flex items-center justify-center gap-3 transition"
                >
                  <svg
                    width="22"
                    height="22"
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