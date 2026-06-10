import { useState, useEffect, useRef } from 'react'
import { usePersistedState } from '../lib/usePersistedState'
import { supabase } from '../lib/supabase'
import { fitViewBox, parseCartItems, formatTime } from '../lib/order-utils'
import type { CartItem } from '../lib/order-utils'
import type { Plan, Room } from './FloorPlanEditor'
import type { MenuItem } from './MenuEditor'
import type { User } from '@restaurant-manager/shared'

type WaiterTab = 'floor' | 'deliveries'
type Status = 'available' | 'occupied' | 'reserved'
type TableStatuses = Record<number, Status>

type FloorData = {
  id: number
  floor_number: number
  name: string
  data: Plan
}

type DeliveryOrder = {
  order_id: number
  table_id: number
  items: string | null
  created_at: string
  restaurant_tables: { table_number: number } | null
}

type OrderRecord = {
  order_id: number
  items: string | null
  status: string
  created_at: string
}

const TABLE_RADIUS = 18

const STATUS_COLOR: Record<Status, string> = {
  available: '#22c55e',
  occupied: '#ef4444',
  reserved: '#f59e0b',
}

function RoomPolygon({ room }: { room: Room }) {
  return (
    <polygon
      points={room.vertices.map(p => `${p.x},${p.y}`).join(' ')}
      fill={room.obstacle ? '#e5e7eb' : '#f0fdf4'}
      stroke={room.obstacle ? '#9ca3af' : '#86efac'}
      strokeWidth={2}
    />
  )
}

function MapModal({
  floors,
  targetTableNum,
  onClose,
}: {
  floors: FloorData[]
  targetTableNum: number
  onClose: () => void
}) {
  const targetFloor = floors.find(f => f.data.tables.some(t => t.num === targetTableNum))
  const [mapFloor, setMapFloor] = useState(targetFloor?.floor_number ?? floors[0]?.floor_number ?? 1)

  const currentPlan = floors.find(f => f.floor_number === mapFloor)?.data ?? null

  return (
    <div className="fixed inset-0 bg-neutral-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl border border-neutral-100 overflow-y-auto max-h-[92vh]">
        <div className="px-6 pt-5 pb-3 border-b border-neutral-100 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-neutral-800">Delivery Map</h2>
            <p className="text-sm text-neutral-400">Table {targetTableNum} highlighted</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-xl text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition text-xl"
          >
            ×
          </button>
        </div>

        {floors.length > 1 && (
          <div className="flex items-center gap-0 border-b border-neutral-200 px-4 shrink-0">
            {floors.map(floor => (
              <button
                key={floor.floor_number}
                onClick={() => setMapFloor(floor.floor_number)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  mapFloor === floor.floor_number
                    ? 'border-neutral-800 text-neutral-800'
                    : 'border-transparent text-neutral-400 hover:text-neutral-600'
                }`}
              >
                {floor.name}
              </button>
            ))}
          </div>
        )}

        <div className="p-4 overflow-hidden">
          {currentPlan && (
            <div className="rounded-xl overflow-hidden border border-neutral-200 bg-white">
              <svg
                viewBox={fitViewBox(currentPlan)}
                className="w-full h-auto"
              >
                <defs>
                  <pattern id="map-grid" width="40" height="40" patternUnits="userSpaceOnUse">
                    <path d="M40 0L0 0 0 40" fill="none" stroke="#f3f4f6" strokeWidth="1" />
                  </pattern>
                </defs>
                <rect x="-9999" y="-9999" width="99999" height="99999" fill="url(#map-grid)" />

                {currentPlan.rooms.map(room => (
                  <RoomPolygon key={room.id} room={room} />
                ))}

                {currentPlan.tables.map(t => {
                  const isTarget = t.num === targetTableNum
                  return (
                    <g key={t.id}>
                      {isTarget && (
                        <>
                          <circle cx={t.x} cy={t.y} r={TABLE_RADIUS + 12} fill="#ef4444" opacity="0.15">
                            <animate attributeName="r" values={`${TABLE_RADIUS + 8};${TABLE_RADIUS + 18};${TABLE_RADIUS + 8}`} dur="1.5s" repeatCount="indefinite" />
                            <animate attributeName="opacity" values="0.3;0.05;0.3" dur="1.5s" repeatCount="indefinite" />
                          </circle>
                          <circle cx={t.x} cy={t.y} r={TABLE_RADIUS + 4} fill="none" stroke="#ef4444" strokeWidth="2.5" opacity="0.7" />
                        </>
                      )}
                      <circle
                        cx={t.x} cy={t.y} r={TABLE_RADIUS}
                        fill={isTarget ? '#ef4444' : '#94a3b8'}
                        stroke="white" strokeWidth={2}
                      />
                      <text
                        x={t.x} y={t.y}
                        textAnchor="middle" dominantBaseline="central"
                        fill="white" fontSize={13} fontWeight="bold"
                        style={{ pointerEvents: 'none' }}
                      >
                        {t.num}
                      </text>
                    </g>
                  )
                })}
              </svg>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function BillModal({
  tableNum,
  tableId,
  onClose,
  onClearTable,
}: {
  tableNum: number
  tableId: number
  onClose: () => void
  onClearTable: () => void
}) {
  const [orders, setOrders] = useState<OrderRecord[]>([])
  const [loading, setLoading] = useState(true)
  const occupiedAtRef = useRef<string | null>(null)

  useEffect(() => {
    async function load() {
      // Get the session start time for this table
      const { data: tableRow } = await supabase
        .from('restaurant_tables')
        .select('occupied_at')
        .eq('table_id', tableId)
        .single()

      const occupiedAt = tableRow?.occupied_at ?? null
      occupiedAtRef.current = occupiedAt

      let query = supabase
        .from('orders')
        .select('order_id, items, status, created_at')
        .eq('table_id', tableId)
        .order('created_at', { ascending: true })

      if (occupiedAt) query = query.gte('created_at', occupiedAt)

      const { data, error: queryError } = await query
      if (queryError) {
        console.error('Error loading bill orders:', queryError)
        alert('Failed to load orders for this table.')
      }
      setOrders((data ?? []) as OrderRecord[])
      setLoading(false)
    }

    load()

    const channel = supabase
      .channel(`bill-orders-${tableId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'orders', filter: `table_id=eq.${tableId}` },
        payload => {
          const o = payload.new as OrderRecord
          const oa = occupiedAtRef.current
          if (oa && new Date(o.created_at) < new Date(oa)) return
          setOrders(prev => [...prev, o].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()))
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [tableId])

  const allItems = orders.flatMap(o => parseCartItems(o.items))
  const grouped = allItems.reduce<Record<string, CartItem>>((acc, item) => {
    const key = String(item.id)
    if (acc[key]) acc[key] = { ...acc[key], quantity: acc[key].quantity + item.quantity }
    else acc[key] = { ...item }
    return acc
  }, {})
  const groupedItems = Object.values(grouped)
  const total = groupedItems.reduce((s, i) => s + i.price * i.quantity, 0)
  const hasActiveOrders = orders.some(o => ['new', 'preparing', 'ready'].includes(o.status))

  return (
    <div className="fixed inset-0 bg-neutral-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm border border-neutral-100">
        <div className="px-6 pt-6 pb-4 border-b border-neutral-100 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-neutral-800">Bill</h2>
            <p className="text-sm text-neutral-400 mt-0.5">Table {tableNum}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition text-xl">×</button>
        </div>

        {loading ? (
          <p className="px-6 py-6 text-sm text-neutral-400">Loading…</p>
        ) : groupedItems.length === 0 ? (
          <p className="px-6 py-6 text-sm text-neutral-400">No orders for this table.</p>
        ) : (
          <div className="px-6 py-4">
            <ul className="space-y-2.5">
              {groupedItems.map(item => (
                <li key={item.id} className="flex items-center justify-between text-sm">
                  <span className="text-neutral-700">
                    <span className="font-semibold">{item.quantity}×</span> {item.name}
                  </span>
                  <span className="font-medium text-neutral-900 ml-4 shrink-0">
                    {(item.price * item.quantity).toFixed(2)}
                  </span>
                </li>
              ))}
            </ul>
            <div className="flex items-center justify-between text-base font-bold text-neutral-900 pt-4 mt-3 border-t border-neutral-200">
              <span>Total</span>
              <span>{total.toFixed(2)}</span>
            </div>
          </div>
        )}

        <div className="px-6 pb-6 pt-2 flex flex-col gap-2">
          <button
            onClick={onClearTable}
            disabled={loading || hasActiveOrders}
            className={`w-full py-3 rounded-xl text-white text-sm font-semibold transition ${loading || hasActiveOrders ? 'bg-neutral-300 cursor-not-allowed' : 'bg-neutral-800 hover:bg-neutral-700'}`}
          >
            Clear Table
          </button>
          {hasActiveOrders && (
            <p className="text-xs text-rose-500 text-center -mt-1">
              Active orders must be served or delivered first
            </p>
          )}
          <button
            onClick={onClose}
            className="w-full py-3 rounded-xl border border-neutral-200 text-neutral-600 text-sm font-medium hover:bg-neutral-50 transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

interface Props {
  user: User
  onBack: () => void
}

export default function WaiterPage({ user, onBack }: Props) {
  const [waiterTab, setWaiterTab] = usePersistedState<WaiterTab>('rm_waiter_tab', 'floor')
  const [floors, setFloors] = useState<FloorData[]>([])
  const [activeFloor, setActiveFloor] = usePersistedState('rm_waiter_floor', 1)
  const [statuses, setStatuses] = useState<TableStatuses>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [menuItems, setMenuItems] = useState<MenuItem[]>([])
  const [menuCategory, setMenuCategory] = useState('All')
  const [menuSearch, setMenuSearch] = useState('')
  const [cart, setCart] = useState<CartItem[]>([])
  const [actionModalTable, setActionModalTable] = useState<number | null>(null)
  const [actionModalError, setActionModalError] = useState<string | null>(null)
  const [orderModalTable, setOrderModalTable] = useState<number | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const [deliveries, setDeliveries] = useState<DeliveryOrder[]>([])
  const [deliveriesLoading, setDeliveriesLoading] = useState(true)
  const [mapTargetTable, setMapTargetTable] = useState<number | null>(null)
  const [billModal, setBillModal] = useState<{ tableNum: number; tableId: number } | null>(null)

  // table_id → table_number (and reverse) stored in refs to avoid stale closures
  const tableMapRef = useRef<Record<number, number>>({})
  const tableNumToIdRef = useRef<Record<number, number>>({})

  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    fetch('/api/floor-plans')
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then(json => {
        if (json.data?.length) {
          setFloors(json.data as FloorData[])
          const valid = (json.data as FloorData[]).find(f => f.floor_number === activeFloor)
          if (!valid) setActiveFloor(json.data[0].floor_number)
        }
      })
      .catch(() => setError('Failed to load floor plans'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    supabase
      .from('restaurant_tables')
      .select('table_id, table_number, status')
      .then(({ data }) => {
        if (!data) return
        const statusMap: TableStatuses = {}
        const idMap: Record<number, number> = {}
        const numToId: Record<number, number> = {}
        data.forEach(t => {
          statusMap[t.table_number] = t.status as Status
          idMap[t.table_id] = t.table_number
          numToId[t.table_number] = t.table_id
        })
        setStatuses(statusMap)
        tableMapRef.current = idMap
        tableNumToIdRef.current = numToId
      })
  }, [])

  useEffect(() => {
    const channel = supabase
      .channel('table-status-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'restaurant_tables' },
        payload => {
          if (payload.eventType === 'DELETE') {
            const old = payload.old as { table_id: number; table_number: number }
            if (old?.table_number != null) {
              setStatuses(prev => {
                const next = { ...prev }
                delete next[old.table_number]
                return next
              })
              const next = { ...tableMapRef.current }
              delete next[old.table_id]
              tableMapRef.current = next
            }
          } else {
            const row = payload.new as { table_id: number; table_number: number; status: Status }
            if (row?.table_number != null) {
              setStatuses(prev => ({ ...prev, [row.table_number]: row.status }))
              tableMapRef.current = { ...tableMapRef.current, [row.table_id]: row.table_number }
              tableNumToIdRef.current = { ...tableNumToIdRef.current, [row.table_number]: row.table_id }
              if (row.status !== 'occupied') {
                setBillModal(prev => prev?.tableNum === row.table_number ? null : prev)
              }
            }
          }
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  useEffect(() => {
    fetch('/api/menu')
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then(json => { if (json.data) setMenuItems(json.data) })
      .catch(() => setError('Failed to load menu'))

    const channel = supabase
      .channel('menu-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'menu_items' },
        payload => {
          if (payload.eventType === 'DELETE') {
            const old = payload.old as { menu_item_id: number }
            setMenuItems(prev => prev.filter(i => i.id !== old.menu_item_id))
          } else {
            const row = payload.new as {
              menu_item_id: number; name: string; category: string
              price: number; description: string; is_available: boolean; sort_order: number
            }
            const mapped: MenuItem = {
              id: row.menu_item_id, name: row.name, category: row.category,
              price: Number(row.price), description: row.description ?? '',
              available: row.is_available, sort_order: row.sort_order,
            }
            setMenuItems(prev => {
              const exists = prev.find(i => i.id === mapped.id)
              return exists ? prev.map(i => i.id === mapped.id ? mapped : i) : [...prev, mapped]
            })
          }
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  useEffect(() => {
    async function loadDeliveries() {
      try {
        const { data, error: err } = await supabase
          .from('orders')
          .select('order_id, table_id, items, created_at, restaurant_tables(table_number)')
          .eq('status', 'ready')
          .order('created_at', { ascending: true })

        if (err) { console.error('Error loading deliveries:', err); return }
        setDeliveries(data as unknown as DeliveryOrder[])
      } catch (err) {
        console.error('Error loading deliveries:', err)
      } finally {
        setDeliveriesLoading(false)
      }
    }

    loadDeliveries()

    const channel = supabase
      .channel('delivery-orders')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        payload => {
          const order = payload.new as { order_id: number; table_id: number; items: string | null; created_at: string; status: string } | null
          const oldOrder = payload.old as { order_id: number } | null

          if (payload.eventType === 'INSERT') {
            if (order?.status === 'ready') {
              const tableNum = tableMapRef.current[order.table_id] ?? null
              const enriched: DeliveryOrder = {
                order_id: order.order_id, table_id: order.table_id,
                items: order.items, created_at: order.created_at,
                restaurant_tables: tableNum != null ? { table_number: tableNum } : null,
              }
              setDeliveries(prev => {
                if (prev.find(o => o.order_id === order.order_id)) return prev
                return [...prev, enriched].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
              })
            }
          } else if (payload.eventType === 'UPDATE') {
            if (order?.status === 'ready') {
              const tableNum = tableMapRef.current[order.table_id] ?? null
              const enriched: DeliveryOrder = {
                order_id: order.order_id, table_id: order.table_id,
                items: order.items, created_at: order.created_at,
                restaurant_tables: tableNum != null ? { table_number: tableNum } : null,
              }
              setDeliveries(prev => {
                const exists = prev.find(o => o.order_id === order.order_id)
                if (exists) return prev.map(o => o.order_id === order.order_id ? enriched : o)
                return [...prev, enriched].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
              })
            } else {
              setDeliveries(prev => prev.filter(o => o.order_id !== order?.order_id))
            }
          } else if (payload.eventType === 'DELETE') {
            if (oldOrder) setDeliveries(prev => prev.filter(o => o.order_id !== oldOrder.order_id))
          }
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  function addToCart(item: MenuItem) {
    setCart(c => {
      const existing = c.find(ci => ci.id === item.id)
      if (existing) return c.map(ci => ci.id === item.id ? { ...ci, quantity: ci.quantity + 1 } : ci)
      return [...c, { id: item.id, name: item.name, price: item.price, quantity: 1 }]
    })
  }

  function setQty(id: number, qty: number) {
    if (qty <= 0) setCart(c => c.filter(ci => ci.id !== id))
    else setCart(c => c.map(ci => ci.id === id ? { ...ci, quantity: qty } : ci))
  }

  function handleTableClick(num: number) {
    setActionModalError(null)
    setActionModalTable(num)
  }

  async function tryMarkAvailable(num: number) {
    if (statuses[num] === 'occupied') {
      const tableId = tableNumToIdRef.current[num]
      if (tableId != null) {
        const { data } = await supabase
          .from('orders')
          .select('order_id')
          .eq('table_id', tableId)
          .in('status', ['new', 'preparing', 'ready'])
          .limit(1)
        if (data && data.length > 0) {
          setActionModalError('Cannot clear table — orders are still active.')
          return
        }
      }
    }
    updateTableStatus(num, 'available')
  }

  async function updateTableStatus(num: number, nextStatus: Status): Promise<boolean> {
    const current = statuses[num] ?? 'available'
    setStatuses(prev => ({ ...prev, [num]: nextStatus }))
    setActionModalTable(null)
    setActionModalError(null)

    try {
      const res = await fetch(`/api/tables/${num}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      })

      if (!res.ok) {
        setStatuses(prev => ({ ...prev, [num]: current }))
        alert('Failed to update table status.')
        return false
      }
      return true
    } catch {
      setStatuses(prev => ({ ...prev, [num]: current }))
      alert('Failed to update table status.')
      return false
    }
  }

  function handleOpenOrderModal() {
    if (actionModalTable) {
      setCart([])
      setMenuCategory('All')
      setMenuSearch('')
      setOrderModalTable(actionModalTable)
      setActionModalTable(null)
    }
  }

  async function submitOrder() {
    if (!orderModalTable || cart.length === 0) return

    setSubmitting(true)
    try {
      const { data: tableData, error: tableError } = await supabase
        .from('restaurant_tables')
        .select('table_id')
        .eq('table_number', orderModalTable)
        .single()

      if (tableError || !tableData) {
        alert('Error: Table not registered in the database.')
        return
      }

      const occupiedOk = await updateTableStatus(orderModalTable, 'occupied')
      if (!occupiedOk) return

      const { error: insertError } = await supabase
        .from('orders')
        .insert({
          table_id: tableData.table_id,
          waiter_id: Number(user.id),
          items: JSON.stringify(cart),
          status: 'new',
        })

      if (insertError) throw insertError

      setOrderModalTable(null)
    } catch (err) {
      console.error('Error submitting order:', err)
      alert('Failed to submit order. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelivered(orderId: number) {
    try {
      const { error: err } = await supabase
        .from('orders')
        .update({ status: 'served' })
        .eq('order_id', orderId)

      if (err) {
        console.error('Error updating order:', err)
        alert('Failed to mark order as delivered. Please try again.')
      }
    } catch (err) {
      console.error('Error updating order:', err)
      alert('Failed to mark order as delivered. Please try again.')
    }
  }

  const currentPlan = floors.find(f => f.floor_number === activeFloor)?.data ?? null
  const q = menuSearch.trim().toLowerCase()

  return (
    <div className="min-h-screen bg-neutral-50 flex flex-col relative">
      <header className="bg-white border-b border-neutral-200 px-6 py-4 flex items-center justify-between">
        <span className="text-sm font-medium tracking-widest uppercase text-neutral-400">
          Restaurant Table Management
        </span>
        <button
          onClick={onBack}
          className="text-xs text-neutral-400 hover:text-neutral-600 transition underline underline-offset-4"
        >
          Back to roles
        </button>
      </header>

      <main className="flex-1 flex flex-col px-6 py-6">
        {/* Tab selector */}
        <div className="flex items-center gap-2 mb-6">
          <button
            onClick={() => setWaiterTab('floor')}
            className={`px-5 py-2 rounded-lg text-base font-semibold transition-colors ${
              waiterTab === 'floor'
                ? 'bg-neutral-900 text-white'
                : 'text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100'
            }`}
          >
            Floor Plan
          </button>
          <button
            onClick={() => setWaiterTab('deliveries')}
            className={`relative px-5 py-2 rounded-lg text-base font-semibold transition-colors ${
              waiterTab === 'deliveries'
                ? 'bg-neutral-900 text-white'
                : 'text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100'
            }`}
          >
            Deliveries
            {deliveries.length > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[20px] h-5 px-1.5 rounded-full bg-red-500 text-white text-xs font-bold flex items-center justify-center leading-none">
                {deliveries.length}
              </span>
            )}
          </button>
        </div>

        {/* ── Floor Plan Tab ── */}
        {waiterTab === 'floor' && (
          <>
            <div className="flex items-center gap-6 mb-4">
              <h1 className="text-xl font-semibold text-neutral-800">Floor plan</h1>
              <div className="flex items-center gap-4 text-xs text-neutral-500">
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-emerald-500 inline-block" />
                  Available
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-red-500 inline-block" />
                  Occupied
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-amber-400 inline-block" />
                  Reserved
                </span>
              </div>
            </div>

            {!loading && !error && floors.length > 0 && (
              <div className="flex items-center gap-0 border-b border-neutral-200 mb-4">
                {floors.map(floor => (
                  <button
                    key={floor.floor_number}
                    onClick={() => setActiveFloor(floor.floor_number)}
                    className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                      activeFloor === floor.floor_number
                        ? 'border-neutral-800 text-neutral-800'
                        : 'border-transparent text-neutral-400 hover:text-neutral-600'
                    }`}
                  >
                    {floor.name}
                  </button>
                ))}
              </div>
            )}

            {loading ? (
              <p className="text-sm text-neutral-400 animate-pulse">Loading…</p>
            ) : error ? (
              <p className="text-sm text-red-400">{error}</p>
            ) : !currentPlan || currentPlan.tables.length === 0 ? (
              <p className="text-sm text-neutral-400">No floor plan configured yet.</p>
            ) : (
              <div className="rounded-xl overflow-hidden border border-neutral-200 bg-white">
                <svg
                  ref={svgRef}
                  viewBox={fitViewBox(currentPlan)}
                  className="w-full"
                  style={{ height: '70vh' }}
                >
                  <defs>
                    <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                      <path d="M40 0L0 0 0 40" fill="none" stroke="#f3f4f6" strokeWidth="1" />
                    </pattern>
                  </defs>
                  <rect x="-9999" y="-9999" width="99999" height="99999" fill="url(#grid)" />

                  {currentPlan.rooms.map(room => (
                    <RoomPolygon key={room.id} room={room} />
                  ))}

                  {currentPlan.tables.map(t => {
                    const status = statuses[t.num] ?? 'available'
                    return (
                      <g
                        key={t.id}
                        onClick={() => handleTableClick(t.num)}
                        className="cursor-pointer hover:opacity-80 transition-opacity"
                      >
                        <circle cx={t.x} cy={t.y} r={TABLE_RADIUS + 4} fill="transparent" />
                        <circle
                          cx={t.x} cy={t.y} r={TABLE_RADIUS}
                          fill={STATUS_COLOR[status]} stroke="white" strokeWidth={2}
                          className="transition-colors duration-300"
                        />
                        <text
                          x={t.x} y={t.y}
                          textAnchor="middle" dominantBaseline="central"
                          fill="white" fontSize={13} fontWeight="bold"
                          style={{ pointerEvents: 'none' }}
                        >
                          {t.num}
                        </text>
                      </g>
                    )
                  })}
                </svg>
              </div>
            )}
          </>
        )}

        {/* ── Deliveries Tab ── */}
        {waiterTab === 'deliveries' && (
          <>
            {deliveriesLoading ? (
              <p className="text-sm text-neutral-400 animate-pulse">Loading…</p>
            ) : deliveries.length === 0 ? (
              <p className="text-sm text-neutral-400">No orders ready for delivery.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {deliveries.map(order => {
                  const items = parseCartItems(order.items)
                  const tableNum = order.restaurant_tables?.table_number ?? tableMapRef.current[order.table_id]
                  return (
                    <div
                      key={order.order_id}
                      className="bg-emerald-50 rounded-2xl shadow-sm p-4 w-full border-2 border-emerald-300"
                    >
                      <div className="flex items-start justify-between gap-4 mb-3">
                        <div>
                          <p className="text-xs font-semibold uppercase text-neutral-500 tracking-wider">
                            Order #{order.order_id}
                          </p>
                          <p className="text-2xl font-bold text-neutral-900 mt-1">
                            Table {tableNum ?? order.table_id}
                          </p>
                        </div>
                        <p className="text-sm text-slate-500 whitespace-nowrap">
                          {formatTime(order.created_at)}
                        </p>
                      </div>

                      {items.length > 0 && (
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
                      )}

                      <div className="flex flex-col gap-2">
                        {tableNum != null && (
                          <button
                            onClick={() => setMapTargetTable(tableNum)}
                            className="w-full h-10 rounded-xl border border-neutral-200 bg-white text-neutral-700 text-sm font-medium hover:bg-neutral-50 transition flex items-center justify-center gap-2"
                          >
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
                              <circle cx="12" cy="9" r="2.5" />
                            </svg>
                            Show on map
                          </button>
                        )}
                        <button
                          onClick={() => handleDelivered(order.order_id)}
                          className="w-full h-11 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-sm font-semibold transition-colors flex items-center justify-center gap-2"
                        >
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
                            <path d="M8 12.5L10.8 15.3L16.5 9.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                          Mark as Delivered
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </main>

      {/* ACTION MODAL */}
      {actionModalTable !== null && (
        <div className="fixed inset-0 bg-neutral-900/40 backdrop-blur-sm z-40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 border border-neutral-100">
            <h2 className="text-xl font-semibold text-neutral-800 mb-1">Table {actionModalTable}</h2>
            <p className="text-sm text-neutral-500 mb-6">Select an action</p>

            <div className="flex flex-col gap-3">
              <button onClick={() => tryMarkAvailable(actionModalTable)} className="w-full py-3 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 text-sm font-semibold hover:bg-emerald-100 transition">
                Mark as Available
              </button>
              {actionModalError && (
                <p className="text-xs text-rose-500 -mt-1 text-center">{actionModalError}</p>
              )}
              <button onClick={() => updateTableStatus(actionModalTable, 'occupied')} className="w-full py-3 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 text-sm font-semibold hover:bg-rose-100 transition">
                Mark as Occupied
              </button>
              <button onClick={() => updateTableStatus(actionModalTable, 'reserved')} className="w-full py-3 rounded-xl border border-amber-200 bg-amber-50 text-amber-700 text-sm font-semibold hover:bg-amber-100 transition">
                Mark as Reserved
              </button>

              <hr className="my-2 border-neutral-100" />

              {(statuses[actionModalTable] ?? 'available') === 'occupied' ? (
                <>
                  <button onClick={handleOpenOrderModal} className="w-full py-3 rounded-xl bg-neutral-800 text-white text-sm font-semibold hover:bg-neutral-700 transition">
                    Create Order
                  </button>
                  <button
                    onClick={() => {
                      const tableId = tableNumToIdRef.current[actionModalTable]
                      if (tableId != null) {
                        setBillModal({ tableNum: actionModalTable, tableId })
                        setActionModalTable(null)
                      }
                    }}
                    className="w-full py-3 rounded-xl border border-neutral-200 text-neutral-700 text-sm font-semibold hover:bg-neutral-50 transition"
                  >
                    View Bill
                  </button>
                </>
              ) : (
                <div className="w-full py-3 rounded-xl bg-neutral-100 text-neutral-400 text-sm font-semibold text-center cursor-not-allowed">
                  Create Order (mark as Occupied first)
                </div>
              )}

              <button onClick={() => { setActionModalTable(null); setActionModalError(null) }} className="mt-2 w-full py-3 rounded-xl text-neutral-500 text-sm font-medium hover:bg-neutral-50 transition">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ORDER MODAL */}
      {orderModalTable !== null && (() => {
        const categories = ['All', ...Array.from(new Set(menuItems.map(i => i.category)))]
        const visibleItems = menuItems.filter(i => {
          const matchSearch = !q || i.name.toLowerCase().includes(q) || i.description.toLowerCase().includes(q)
          const matchCategory = menuCategory === 'All' || i.category === menuCategory
          return matchSearch && matchCategory
        })
        const total = cart.reduce((s, ci) => s + ci.price * ci.quantity, 0)

        return (
          <div className="fixed inset-0 bg-neutral-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg border border-neutral-100 flex flex-col max-h-[90vh]">
              <div className="px-6 pt-6 pb-3 border-b border-neutral-100 shrink-0">
                <h2 className="text-xl font-semibold text-neutral-800">New Order</h2>
                <p className="text-sm text-neutral-400 mt-0.5 mb-3">Table {orderModalTable}</p>
                <input
                  type="search"
                  placeholder="Search menu…"
                  value={menuSearch}
                  onChange={e => setMenuSearch(e.target.value)}
                  className="w-full px-4 py-2 rounded-xl border border-neutral-200 text-sm bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-neutral-800 transition"
                />
              </div>

              {!q && (
                <div className="flex items-center gap-0 px-6 border-b border-neutral-100 shrink-0 overflow-x-auto">
                  {categories.map(cat => (
                    <button
                      key={cat}
                      onClick={() => setMenuCategory(cat)}
                      className={`px-3 py-2.5 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${
                        menuCategory === cat
                          ? 'border-neutral-800 text-neutral-800'
                          : 'border-transparent text-neutral-400 hover:text-neutral-600'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              )}

              <div className="flex-1 overflow-y-auto">
                {menuItems.length === 0 ? (
                  <p className="px-6 py-8 text-sm text-neutral-400 text-center">No menu items configured yet.</p>
                ) : visibleItems.length === 0 ? (
                  <p className="px-6 py-8 text-sm text-neutral-400 text-center">Nothing found.</p>
                ) : (
                  <ul className="divide-y divide-neutral-50">
                    {visibleItems.map(item => {
                      const inCart = cart.find(ci => ci.id === item.id)
                      const unavailable = !item.available
                      return (
                        <li key={item.id} className={`flex items-center gap-3 px-6 py-3 transition-colors ${unavailable ? 'opacity-50' : 'hover:bg-neutral-50'}`}>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className={`text-sm font-medium truncate ${unavailable ? 'text-neutral-400 line-through' : 'text-neutral-800'}`}>{item.name}</p>
                              {unavailable && <span className="text-xs text-neutral-400 bg-neutral-100 px-1.5 py-0.5 rounded shrink-0">Unavailable</span>}
                            </div>
                            {item.description && (
                              <p className="text-xs text-neutral-400 truncate">{item.description}</p>
                            )}
                          </div>
                          <span className="text-sm text-neutral-500 shrink-0">{item.price.toFixed(2)}</span>
                          {unavailable ? (
                            <div className="w-6 h-6 shrink-0" />
                          ) : inCart ? (
                            <div className="flex items-center gap-1 shrink-0">
                              <button onClick={() => setQty(item.id, inCart.quantity - 1)} className="w-6 h-6 rounded-full border border-neutral-200 text-neutral-600 text-sm flex items-center justify-center hover:border-neutral-400 transition">−</button>
                              <span className="w-5 text-center text-sm font-medium text-neutral-800">{inCart.quantity}</span>
                              <button onClick={() => setQty(item.id, inCart.quantity + 1)} className="w-6 h-6 rounded-full bg-neutral-800 text-white text-sm flex items-center justify-center hover:bg-neutral-700 transition">+</button>
                            </div>
                          ) : (
                            <button onClick={() => addToCart(item)} className="w-6 h-6 rounded-full bg-neutral-800 text-white text-sm flex items-center justify-center hover:bg-neutral-700 transition shrink-0">+</button>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>

              <div className="px-6 py-4 border-t border-neutral-100 shrink-0">
                {cart.length > 0 && (
                  <div className="mb-3 space-y-1">
                    {cart.map(ci => (
                      <div key={ci.id} className="flex justify-between text-sm text-neutral-600">
                        <span>{ci.quantity}× {ci.name}</span>
                        <span className="font-medium text-neutral-800">{(ci.price * ci.quantity).toFixed(2)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between text-sm font-semibold text-neutral-800 pt-1 border-t border-neutral-100 mt-1">
                      <span>Total</span>
                      <span>{total.toFixed(2)}</span>
                    </div>
                  </div>
                )}
                <div className="flex gap-3">
                  <button onClick={() => setOrderModalTable(null)} disabled={submitting} className="flex-1 py-3 rounded-xl border border-neutral-200 text-neutral-600 text-sm font-medium hover:bg-neutral-50 transition disabled:opacity-50">
                    Cancel
                  </button>
                  <button onClick={submitOrder} disabled={cart.length === 0 || submitting} className="flex-1 py-3 rounded-xl bg-neutral-800 text-white text-sm font-medium hover:bg-neutral-700 disabled:opacity-50 transition">
                    {submitting ? 'Sending…' : `Send to Kitchen${cart.length > 0 ? ` (${cart.reduce((s, ci) => s + ci.quantity, 0)})` : ''}`}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      {/* MAP MODAL */}
      {mapTargetTable !== null && floors.length > 0 && (
        <MapModal
          floors={floors}
          targetTableNum={mapTargetTable}
          onClose={() => setMapTargetTable(null)}
        />
      )}

      {/* BILL MODAL */}
      {billModal !== null && (
        <BillModal
          tableNum={billModal.tableNum}
          tableId={billModal.tableId}
          onClose={() => setBillModal(null)}
          onClearTable={async () => {
            const ok = await updateTableStatus(billModal.tableNum, 'available')
            if (ok) setBillModal(null)
          }}
        />
      )}
    </div>
  )
}
