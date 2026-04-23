import { useEffect, useState } from 'react'
import type { User } from '@restaurant-manager/shared'
import { supabase } from '../lib/supabase'

type RunnerOrder = {
  id: string
  table_number: number
  items: string
  status: string
  created_at: string
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
    async function fetchOrders() {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('status', 'ready')
        .order('created_at', { ascending: true })

      if (!error && data) {
        setOrders(data as RunnerOrder[])
      }
      setLoading(false)
    }

    fetchOrders()

    const channel = supabase
      .channel('runner-orders-channel')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders' },
        (payload) => {
          const updatedOrder = payload.new as RunnerOrder
          if (updatedOrder.status === 'ready') {
            setOrders((prev) => {
              if (prev.some((o) => o.id === updatedOrder.id)) return prev
              return [...prev, updatedOrder]
            })
          } else if (updatedOrder.status === 'served') {
            setOrders((prev) => prev.filter((o) => o.id !== updatedOrder.id))
          }
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  async function handleDelivered(orderId: string) {
    setOrders((prev) => prev.filter((order) => order.id !== orderId))
    await supabase.from('orders').update({ status: 'served' }).eq('id', orderId)
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

      <main className="flex-1 px-6 py-5 max-w-7xl mx-auto w-full">
        <button
          onClick={onBack}
          className="text-base text-sky-700 hover:text-sky-800 transition mb-5 cursor-pointer underline underline-offset-4"
        >
          Back to roles
        </button>

        {loading ? (
          <p className="text-sm text-neutral-400">Loading…</p>
        ) : orders.length === 0 ? (
          <p className="text-sm text-neutral-400">No ready orders.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {orders.map((order) => (
              <div
                key={order.id}
                className="bg-white rounded-2xl shadow-sm p-4 w-full border-2 border-emerald-300"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xl font-semibold text-neutral-900 leading-tight whitespace-pre-line">
                      {order.items}
                    </p>
                    <p className="mt-2 text-sm font-bold text-neutral-600 bg-neutral-100 inline-block px-2 py-1 rounded">
                      Table {order.table_number}
                    </p>
                  </div>

                  <p className="text-sm text-slate-400 whitespace-nowrap">
                    {formatReadyTime(order.created_at)}
                  </p>
                </div>

                <button
                  onClick={() => handleDelivered(order.id)}
                  className="mt-5 w-full h-11 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold transition flex items-center justify-center gap-2 cursor-pointer"
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    className="shrink-0"
                    aria-hidden="true"
                  >
                    <circle
                      cx="12"
                      cy="12"
                      r="9"
                      stroke="currentColor"
                      strokeWidth="2"
                    />
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
