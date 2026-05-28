import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { User } from '@restaurant-manager/shared'

type OrderStatus = 'open' | 'new' | 'preparing' | 'ready' | 'served'

type KitchenOrder = {
  order_id: number
  table_id?: number | null
  items?: string | null
  status: OrderStatus
  created_at: string
  item_name?: string | null
  quantity?: number | null
  ordered_by?: string | null
  restaurant_tables?: {
    table_number?: number | null
  } | null
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatItems(order: KitchenOrder) {
  if (order.item_name) {
    return `${order.item_name}${order.quantity ? ` × ${order.quantity}` : ''}`
  }

  if (!order.items) {
    return 'No items'
  }

  try {
    const parsed = JSON.parse(order.items)

    if (Array.isArray(parsed)) {
      return parsed
        .map((item) => {
          const name = item.name ?? item.item_name ?? item.title ?? 'Item'
          const quantity = item.quantity ?? item.qty ?? 1
          return `${name} × ${quantity}`
        })
        .join('\n')
    }

    return typeof parsed === 'string' ? parsed : JSON.stringify(parsed)
  } catch {
    return order.items
  }
}

export default function KitchenPage({
  onBack,
}: {
  user: User
  onBack: () => void
}) {
  const [orders, setOrders] = useState<KitchenOrder[]>([])
  const [tableMap, setTableMap] = useState<Record<number, number>>({})
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [processingId, setProcessingId] = useState<number | null>(null)

  const loadOrders = useCallback(async (showLoader = false) => {
    if (showLoader) {
      setLoading(true)
    }

    setErrorMessage(null)

    try {
      const response = await fetch('/api/orders/kitchen')
      const result = await response.json()

      console.log('KITCHEN API RESPONSE:', result)

      if (!response.ok || result.error) {
        throw new Error(result.error ?? 'Failed to load kitchen orders')
      }

      setOrders((result.data ?? []) as KitchenOrder[])
    } catch (err) {
      console.error('Failed to load kitchen orders:', err)
      setOrders([])
      setErrorMessage(
        err instanceof Error ? err.message : 'Failed to load kitchen orders',
      )
    } finally {
        if (showLoader) {
          setLoading(false)
        }
    }
  }, [])

  useEffect(() => {
    async function loadTableMap() {
      try {
        const { data, error } = await supabase
          .from('restaurant_tables')
          .select('table_id, table_number')

        if (error) throw error

        const map: Record<number, number> = {}

        data?.forEach((table) => {
          map[table.table_id] = table.table_number
        })

        setTableMap(map)
      } catch (err) {
        console.error('Failed to load table map:', err)
      }
    }

    loadTableMap()
    loadOrders(true)

    const channel = supabase
      .channel('kitchen-orders')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        () => {
          loadOrders()
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [loadOrders])

  async function updateStatus(orderId: number, status: 'preparing' | 'ready') {
    setProcessingId(orderId)

    try {
      const { error } = await supabase
        .from('orders')
        .update({ status })
        .eq('order_id', orderId)

      if (error) {
        throw error
      }

      if (status === 'ready') {
        setOrders((prev) => prev.filter((order) => order.order_id !== orderId))
      } else {
        setOrders((prev) =>
          prev.map((order) =>
            order.order_id === orderId ? { ...order, status } : order,
          ),
        )
      }
    } catch (err) {
      console.error('Error updating order:', err)
      alert('Failed to update order. Please try again.')
    } finally {
      setProcessingId(null)
    }
  }

  function getTableNumber(order: KitchenOrder) {
    if (order.restaurant_tables?.table_number != null) {
      return order.restaurant_tables.table_number
    }

    if (order.table_id != null) {
      return tableMap[order.table_id] ?? order.table_id
    }

    return '—'
  }

  return (
    <div className="min-h-screen bg-neutral-100 flex flex-col">
    <header className="bg-white border-b border-neutral-200 px-6 py-4 flex items-center justify-between">
      <span className="text-sm font-medium tracking-widest uppercase text-neutral-400">
        Restaurant Table Management
      </span>

      <div className="flex items-center gap-4">
        <button
          onClick={onBack}
          className="text-xs text-neutral-400 hover:text-neutral-600 transition underline underline-offset-4"
        >
          Back to roles
        </button>
      </div>
    </header>

      <main className="flex-1 px-6 py-5">
        {loading ? (
          <p className="text-sm text-neutral-400">Loading…</p>
        ) : errorMessage ? (
          <p className="text-sm text-red-500">{errorMessage}</p>
        ) : orders.length === 0 ? (
          <p className="text-sm text-neutral-400">
            No orders in kitchen queue.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {orders.map((order) => {
              const isPreparing = order.status === 'preparing'

              return (
                <div
                  key={order.order_id}
                  className={[
                    'bg-white rounded-2xl shadow-sm p-4 w-full border-2 transition-colors',
                    isPreparing
                      ? 'border-emerald-300 bg-emerald-50'
                      : 'border-rose-300 bg-rose-50',
                  ].join(' ')}
                >
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div>
                      <p className="text-xs font-semibold uppercase text-neutral-500 tracking-wider">
                        Order #{order.order_id}
                      </p>
                      <p className="text-2xl font-bold text-neutral-900 mt-1">
                        Table {getTableNumber(order)}
                      </p>
                      <p className="text-xs uppercase text-neutral-400 mt-1">
                        Status: {order.status}
                      </p>
                    </div>

                    <p className="text-sm text-slate-500 whitespace-nowrap">
                      {formatTime(order.created_at)}
                    </p>
                  </div>

                  <div className="mb-4 p-3 bg-white rounded-lg border border-neutral-200">
                    <p className="text-sm font-medium text-neutral-700">
                      Items:
                    </p>
                    <pre className="text-sm text-neutral-600 mt-1 whitespace-pre-wrap font-sans">
                      {formatItems(order)}
                    </pre>
                  </div>

                  {order.ordered_by && (
                    <p className="text-xs text-neutral-500 mb-3">
                      Ordered by: {order.ordered_by}
                    </p>
                  )}

                  {isPreparing ? (
                    <button
                      onClick={() => updateStatus(order.order_id, 'ready')}
                      disabled={processingId === order.order_id}
                      className="mt-4 w-full h-11 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {processingId === order.order_id
                        ? 'Marking...'
                        : 'Mark as Ready'}
                    </button>
                  ) : (
                    <button
                      onClick={() => updateStatus(order.order_id, 'preparing')}
                      disabled={processingId === order.order_id}
                      className="mt-4 w-full h-11 rounded-xl bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {processingId === order.order_id
                        ? 'Starting...'
                        : 'Start Preparing'}
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