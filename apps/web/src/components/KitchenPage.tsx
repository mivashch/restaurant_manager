import { useEffect, useState } from 'react'
import type { User } from '@restaurant-manager/shared'
import { supabase } from '../lib/supabase'

type KitchenOrder = {
  id: string
  table_number: number
  items: string
  status: 'open' | 'new' | 'preparing' | 'ready' | 'served'
  created_at: string
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
    async function fetchOrders() {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .in('status', ['new', 'preparing'])
        .order('created_at', { ascending: true })

      if (!error && data) {
        setOrders(data as KitchenOrder[])
      }
      setLoading(false)
    }

    fetchOrders()

    const channel = supabase
      .channel('kitchen-orders')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setOrders((prev) => [...prev, payload.new as KitchenOrder])
          } else if (payload.eventType === 'UPDATE') {
            setOrders((prev) => {
              const updatedOrder = payload.new as KitchenOrder
              if (updatedOrder.status === 'ready') {
                return prev.filter((o) => o.id !== updatedOrder.id)
              }
              return prev.map((o) =>
                o.id === updatedOrder.id ? updatedOrder : o,
              )
            })
          } else if (payload.eventType === 'DELETE') {
            setOrders((prev) => prev.filter((o) => o.id !== payload.old.id))
          }
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  async function handleStart(orderId: string) {
    await supabase
      .from('orders')
      .update({ status: 'preparing' })
      .eq('id', orderId)
  }

  async function handleReady(orderId: string) {
    await supabase.from('orders').update({ status: 'ready' }).eq('id', orderId)
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

      <main className="flex-1 px-6 py-5 max-w-7xl mx-auto w-full">
        <button
          onClick={onBack}
          className="text-sm text-sky-700 hover:text-sky-800 transition mb-6 underline underline-offset-4"
        >
          Back to roles
        </button>

        {loading ? (
          <p className="text-sm text-neutral-400 animate-pulse">
            Loading kitchen queue…
          </p>
        ) : orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-neutral-400">
            <svg
              className="w-16 h-16 mb-4 opacity-20"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
              />
            </svg>
            <p>No orders in kitchen queue.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {orders.map((order) => {
              const isPreparing = order.status === 'preparing'

              return (
                <div
                  key={order.id}
                  className={[
                    'bg-white rounded-2xl shadow-sm p-6 w-full border-l-4 transition-all',
                    isPreparing
                      ? 'border-l-emerald-500 border-y border-r border-neutral-200'
                      : 'border-l-rose-500 border-y border-r border-neutral-200',
                  ].join(' ')}
                >
                  <div className="flex items-start justify-between gap-4 mb-4">
                    <div>
                      <span className="inline-flex items-center justify-center px-3 py-1 rounded-full bg-neutral-100 text-neutral-800 text-sm font-bold mb-3">
                        Table {order.table_number}
                      </span>
                      <p className="text-lg font-semibold text-neutral-900 leading-snug whitespace-pre-line">
                        {order.items}
                      </p>
                    </div>
                    <p className="text-xs font-medium text-slate-400 whitespace-nowrap bg-slate-50 px-2 py-1 rounded-md border border-slate-100">
                      {formatTime(order.created_at)}
                    </p>
                  </div>

                  {isPreparing ? (
                    <button
                      onClick={() => handleReady(order.id)}
                      className="mt-6 w-full h-12 rounded-xl bg-emerald-50 text-emerald-700 hover:bg-emerald-600 hover:text-white border border-emerald-200 text-sm font-semibold transition-all shadow-sm cursor-pointer"
                    >
                      Mark as Ready
                    </button>
                  ) : (
                    <button
                      onClick={() => handleStart(order.id)}
                      className="mt-6 w-full h-12 rounded-xl bg-rose-600 hover:bg-rose-700 text-white shadow-sm text-sm font-semibold transition-all cursor-pointer"
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
