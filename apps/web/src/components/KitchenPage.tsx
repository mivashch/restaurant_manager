import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { User } from '@restaurant-manager/shared'

type CartItem = { id: number; name: string; price: number; quantity: number }

type KitchenOrder = {
  order_id: number
  table_id: number
  waiter_id: number
  items: string | null
  status: 'new' | 'preparing' | 'ready' | 'served'
  created_at: string
  restaurant_tables: { table_number: number } | null
}

function parseItems(raw: string | null): CartItem[] {
  if (!raw) return []
  try { return JSON.parse(raw) } catch { return [] }
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
    async function loadOrders() {
      try {
        const { data, error } = await supabase
          .from('orders')
          .select('*, restaurant_tables(table_number)')
          .in('status', ['new', 'preparing'])
          .order('created_at', { ascending: true })

        if (error) {
          console.error('Error loading orders:', error)
          return
        }

        setOrders(data as KitchenOrder[])
      } catch (err) {
        console.error('Error loading orders:', err)
      } finally {
        setLoading(false)
      }
    }

    loadOrders()

    // Subscribe to realtime changes
    const channel = supabase
      .channel('kitchen-orders')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
        },
        (payload) => {
          const order = payload.new as KitchenOrder | null
          const oldOrder = payload.old as KitchenOrder | null

          if (payload.eventType === 'INSERT') {
            if (order && (order.status === 'new' || order.status === 'preparing')) {
              setOrders((prev) => {
                const exists = prev.find((o) => o.order_id === order.order_id)
                if (exists) return prev
                return [...prev, order].sort(
                  (a, b) =>
                    new Date(a.created_at).getTime() -
                    new Date(b.created_at).getTime()
                )
              })
            }
          } else if (payload.eventType === 'UPDATE') {
            if (order) {
              if (order.status === 'new' || order.status === 'preparing') {
                setOrders((prev) => {
                  const exists = prev.find((o) => o.order_id === order.order_id)
                  if (exists) {
                    return prev.map((o) =>
                      o.order_id === order.order_id ? order : o
                    )
                  }
                  return [...prev, order].sort(
                    (a, b) =>
                      new Date(a.created_at).getTime() -
                      new Date(b.created_at).getTime()
                  )
                })
              } else {
                // Remove from kitchen view if status is ready or served
                setOrders((prev) =>
                  prev.filter((o) => o.order_id !== order.order_id)
                )
              }
            }
          } else if (payload.eventType === 'DELETE') {
            if (oldOrder) {
              setOrders((prev) =>
                prev.filter((o) => o.order_id !== oldOrder.order_id)
              )
            }
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  async function handleStart(orderId: number) {
    try {
      const { error } = await supabase
        .from('orders')
        .update({ status: 'preparing' })
        .eq('order_id', orderId)

      if (error) {
        console.error('Error updating order:', error)
      }
    } catch (err) {
      console.error('Error updating order:', err)
    }
  }

  async function handleReady(orderId: number) {
    try {
      const { error } = await supabase
        .from('orders')
        .update({ status: 'ready' })
        .eq('order_id', orderId)

      if (error) {
        console.error('Error updating order:', error)
      }
    } catch (err) {
      console.error('Error updating order:', err)
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
            {orders.map((order) => {
              const isPreparing = order.status === 'preparing'

              return (
                <div
                  key={order.order_id}
                  className={[
                    'bg-white rounded-2xl shadow-sm p-4 w-full border-2 transition-colors',
                    isPreparing ? 'border-emerald-300 bg-emerald-50' : 'border-rose-300 bg-rose-50',
                  ].join(' ')}
                >
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div>
                      <p className="text-xs font-semibold uppercase text-neutral-500 tracking-wider">
                        Order #{order.order_id}
                      </p>
                      <p className="text-2xl font-bold text-neutral-900 mt-1">
                        Table {order.restaurant_tables?.table_number ?? order.table_id}
                      </p>
                    </div>
                    <p className="text-sm text-slate-500 whitespace-nowrap">
                      {formatTime(order.created_at)}
                    </p>
                  </div>

                  {order.items && (() => {
                    const items = parseItems(order.items)
                    if (!items.length) return null
                    return (
                      <div className="mb-4 p-3 bg-white rounded-lg border border-neutral-200">
                        <ul className="space-y-1">
                          {items.map((item, i) => (
                            <li key={i} className="flex items-center justify-between text-sm">
                              <span className="text-neutral-800">
                                <span className="font-semibold">{item.quantity}×</span> {item.name}
                              </span>
                              <span className="text-neutral-400 ml-2 shrink-0">
                                {(item.price * item.quantity).toFixed(2)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )
                  })()}

                  {isPreparing ? (
                    <button
                      onClick={() => handleReady(order.order_id)}
                      className="mt-4 w-full h-11 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-sm font-semibold transition-colors"
                    >
                      Mark as Ready
                    </button>
                  ) : (
                    <button
                      onClick={() => handleStart(order.order_id)}
                      className="mt-4 w-full h-11 rounded-xl bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white text-sm font-semibold transition-colors"
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