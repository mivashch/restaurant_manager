import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { User } from '@restaurant-manager/shared'

type KitchenOrder = {
  order_id: number
  table_id: number
  items: string | null
  status: 'new' | 'preparing' | 'ready' | 'served'
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
  const [tableMap, setTableMap] = useState<Record<number, number>>({})
  const [loading, setLoading] = useState(true)
  const [processingId, setProcessingId] = useState<number | null>(null)

  useEffect(() => {

    async function loadTableMap() {
      const { data } = await supabase.from('restaurant_tables').select('table_id, table_number')
      if (data) {
        const map: Record<number, number> = {}
        data.forEach(t => { map[t.table_id] = t.table_number })
        setTableMap(map)
      }
    }
    
    async function loadOrders() {
      try {
        const { data, error } = await supabase
          .from('orders')
          .select('*')
          .in('status', ['new', 'preparing'])
          .order('created_at', { ascending: true })

        if (error) {
          console.error('Error loading orders:', error)
          alert('Failed to load kitchen orders. Please refresh.')
          return
        }

        setOrders(data as KitchenOrder[])
      } catch (err) {
        console.error('Error loading orders:', err)
        alert('Failed to load kitchen orders. Please refresh.')
      } finally {
        setLoading(false)
      }
    }

    loadTableMap()
    loadOrders()

    const channel = supabase
      .channel('kitchen-orders')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        (payload) => {
          const oldOrder = payload.old as KitchenOrder | null
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
             loadOrders()
          } else if (payload.eventType === 'DELETE') {
            if (oldOrder) {
              setOrders((prev) => prev.filter((o) => o.order_id !== oldOrder.order_id))
            }
          }
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  async function updateStatus(orderId: number, status: 'preparing' | 'ready') {
    setProcessingId(orderId) 
    try {
      const { error } = await supabase
        .from('orders')
        .update({ status })
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
                        Table {tableMap[order.table_id] ?? order.table_id}
                      </p>
                    </div>
                    <p className="text-sm text-slate-500 whitespace-nowrap">
                      {formatTime(order.created_at)}
                    </p>
                  </div>

                  {order.items && (
                    <div className="mb-4 p-3 bg-white rounded-lg border border-neutral-200">
                      <p className="text-sm font-medium text-neutral-700">Items:</p>
                      <p className="text-sm text-neutral-600 mt-1">{order.items}</p>
                    </div>
                  )}

                  {isPreparing ? (
                    <button
                      onClick={() => updateStatus(order.order_id, 'ready')}
                      disabled={processingId === order.order_id}
                      className="mt-4 w-full h-11 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {processingId === order.order_id ? 'Marking...' : 'Mark as Ready'}
                    </button>
                  ) : (
                    <button
                      onClick={() => updateStatus(order.order_id, 'preparing')}
                      disabled={processingId === order.order_id}
                      className="mt-4 w-full h-11 rounded-xl bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {processingId === order.order_id ? 'Starting...' : 'Start Preparing'}
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