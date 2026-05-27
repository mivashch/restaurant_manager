import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { User } from '@restaurant-manager/shared'

type RunnerOrder = {
  order_id: number
  table_id: number
  items: string | null
  status: 'new' | 'preparing' | 'ready' | 'served'
  created_at: string
  restaurant_tables?: { table_number: number } | null
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
  const [tableMap, setTableMap] = useState<Record<number, number>>({})
  const [loading, setLoading] = useState(true)
  const [processingId, setProcessingId] = useState<number | null>(null)

  useEffect(() => {
    async function loadTableMap() {
      try {
        const { data, error } = await supabase.from('restaurant_tables').select('table_id, table_number')
        if (error) throw error
        if (data) {
          const map: Record<number, number> = {}
          data.forEach(t => { map[t.table_id] = t.table_number })
          setTableMap(map)
        }
      } catch (err) {
        console.error('Failed to load table map:', err) 
      }
    }

    async function loadOrders() {
      try {
        const { data, error } = await supabase
          .from('orders')
          .select('*, restaurant_tables(table_number)')
          .eq('status', 'ready')
          .order('created_at', { ascending: true })

        if (error) {
          console.error('Error loading orders:', error)
          alert('Failed to load runner orders. Please refresh.')
          return
        }

        setOrders(data as RunnerOrder[])
      } catch (err) {
        console.error('Error loading orders:', err)
        alert('Failed to load runner orders. Please refresh.')
      } finally {
        setLoading(false)
      }
    }

    loadTableMap()
    loadOrders()

    const channel = supabase
      .channel('runner-orders')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
        },
        (payload) => {
          const order = payload.new as RunnerOrder | null
          const oldOrder = payload.old as RunnerOrder | null


          if (payload.eventType === 'INSERT') {
            if (order && order.status === 'ready') {
              setOrders((prev) => {
                const exists = prev.find((o) => o.order_id === order.order_id)
                if (exists) return prev
                return [...prev, order].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
              })
            }
          } else if (payload.eventType === 'UPDATE') {
            if (order) {
              if (order.status === 'ready') {
                setOrders((prev) => {
                  const exists = prev.find((o) => o.order_id === order.order_id)
                  if (exists) return prev.map((o) => o.order_id === order.order_id ? { ...o, ...order } : o)
                  return [...prev, order].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
                })
              } else {
                setOrders((prev) => prev.filter((o) => o.order_id !== order.order_id))
              }
            }
          } else if (payload.eventType === 'DELETE') {
            if (oldOrder) {
              setOrders((prev) => prev.filter((o) => o.order_id !== oldOrder.order_id))
            }
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  async function handleDelivered(orderId: number) {
    setProcessingId(orderId) 
    try {
      const { error } = await supabase
        .from('orders')
        .update({ 
          status: 'served',
          runner_id: user.id
        })
        .eq('order_id', orderId)

      if (error) {
        console.error('Error updating order:', error)
        alert('Failed to update order. Please try again.') 
      }
    } catch (err) {
      console.error('Error updating order:', err)
      alert('An unexpected error occurred. Please try again.') 
    } finally {
      setProcessingId(null) 
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
            {orders.map((order) => (
              <div
                key={order.order_id}
                className="bg-white rounded-2xl shadow-sm p-4 w-full border-2 border-emerald-300 bg-emerald-50 transition-colors"
              >
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div>
                    <p className="text-xs font-semibold uppercase text-neutral-500 tracking-wider">
                      Order #{order.order_id}
                    </p>
                    <p className="text-2xl font-bold text-neutral-900 mt-1">
                      {}
                      Table {tableMap[order.table_id] ?? order.restaurant_tables?.table_number ?? order.table_id}
                    </p>
                  </div>
                  <p className="text-sm text-slate-500 whitespace-nowrap">
                    {formatReadyTime(order.created_at)}
                  </p>
                </div>

                {order.items && (
                  <div className="mb-4 p-3 bg-white rounded-lg border border-neutral-200">
                    <p className="text-sm font-medium text-neutral-700">Items:</p>
                    <p className="text-sm text-neutral-600 mt-1">{order.items}</p>
                  </div>
                )}

                <button
                  onClick={() => handleDelivered(order.order_id)}
                  disabled={processingId === order.order_id}
                  className="mt-4 w-full h-11 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-sm font-semibold transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
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
                  {processingId === order.order_id ? 'Delivering...' : 'Mark as Delivered'}
                </button>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}