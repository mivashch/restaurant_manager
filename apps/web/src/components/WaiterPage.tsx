import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import type { Plan, Room } from './FloorPlanEditor'
import type { MenuItem } from './MenuEditor'
import type { User } from '@restaurant-manager/shared'

type Status = 'available' | 'occupied' | 'reserved'
type TableStatuses = Record<number, Status>

const SVG_WIDTH = 1000
const SVG_HEIGHT = 650
const TABLE_RADIUS = 18

const STATUS_COLOR: Record<Status, string> = {
  available: '#22c55e', // Emerald
  occupied: '#ef4444',  // Red
  reserved: '#f59e0b',  // Amber
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

function parseCartItems(raw: string | null): CartItem[] {
  if (!raw) return []
  try { return JSON.parse(raw) } catch { return [] }
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
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
  
  const [actionModalTable, setActionModalTable] = useState<number | null>(null)
  const [orderModalTable, setOrderModalTable] = useState<number | null>(null)
  const [orderItems, setOrderItems] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    fetch('/api/floor-plan')
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then(json => {
        if (json.data) setPlan(json.data.data as Plan)
      })
      .catch(() => setError('Failed to load floor plan'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    supabase
      .from('restaurant_tables')
      .select('table_number, status')
      .then(({ data }) => {
        if (!data) return
        const map: TableStatuses = {}
        data.forEach(t => { map[t.table_number] = t.status as Status })
        setStatuses(map)
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
            const old = payload.old as { table_number: number }
            if (old?.table_number != null) {
              setStatuses(prev => {
                const next = { ...prev }
                delete next[old.table_number]
                return next
              })
            }
          } else {
            const row = payload.new as { table_number: number; status: Status }
            if (row?.table_number != null) {
              setStatuses(prev => ({ ...prev, [row.table_number]: row.status }))
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
      setOrderModalTable(actionModalTable)
      setActionModalTable(null)
    }
  }

  async function submitOrder(e: React.FormEvent) {
    e.preventDefault()
    if (!orderModalTable || !orderItems.trim()) return

    setSubmitting(true)
    try {
      const { data: tableData, error: tableError } = await supabase
        .from('restaurant_tables')
        .select('table_id')
        .eq('table_number', orderModalTable)
        .single()

      if (tableError || !tableData) {
        alert('Error: Table not registered in the database.')
        setSubmitting(false)
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

      if (error) throw error

      await updateTableStatus(orderModalTable, 'occupied')

      setOrderItems('')
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

        {loading ? (
          <p className="text-sm text-neutral-400 animate-pulse">Loading…</p>
        ) : error ? (
          <p className="text-sm text-red-400">{error}</p>
        ) : !plan || plan.tables.length === 0 ? (
          <p className="text-sm text-neutral-400">No floor plan configured yet.</p>
        ) : (
          <div className="rounded-xl overflow-hidden border border-neutral-200 bg-white">
            <svg
              ref={svgRef}
              viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
              className="w-full"
              style={{ height: '70vh' }}
            >
              <defs>
                <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                  <path d="M40 0L0 0 0 40" fill="none" stroke="#f3f4f6" strokeWidth="1" />
                </pattern>
              </defs>
              <rect width={SVG_WIDTH} height={SVG_HEIGHT} fill="url(#grid)" />

              {plan.rooms.map(room => (
                <RoomPolygon key={room.id} room={room} />
              ))}

              {plan.tables.map(t => {
                const status = statuses[t.num] ?? 'available'
                return (
                  <g
                    key={t.id}
                    onClick={() => handleTableClick(t.num)}
                    className="cursor-pointer hover:opacity-80 transition-opacity"
                  >
                    <circle cx={t.x} cy={t.y} r={TABLE_RADIUS + 4} fill="transparent" />
                    <circle cx={t.x} cy={t.y} r={TABLE_RADIUS} fill={STATUS_COLOR[status]} stroke="white" strokeWidth={2} className="transition-colors duration-300" />
                    <text x={t.x} y={t.y} textAnchor="middle" dominantBaseline="central" fill="white" fontSize={13} fontWeight="bold" style={{ pointerEvents: 'none' }}>
                      {t.num}
                    </text>
                  </g>
                )
              })}
            </svg>
          </div>
        )}
      </main>

      {/* ACTION MODAL */}
      {actionModalTable !== null && (
        <div className="fixed inset-0 bg-neutral-900/40 backdrop-blur-sm z-40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 border border-neutral-100">
            <h2 className="text-xl font-semibold text-neutral-800 mb-1">Table {actionModalTable}</h2>
            <p className="text-sm text-neutral-500 mb-6">Select an action</p>
            
            <div className="flex flex-col gap-3">
              <button onClick={() => updateTableStatus(actionModalTable, 'available')} className="w-full py-3 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 text-sm font-semibold hover:bg-emerald-100 transition">
                Mark as Available
              </button>
              <button onClick={() => updateTableStatus(actionModalTable, 'occupied')} className="w-full py-3 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 text-sm font-semibold hover:bg-rose-100 transition">
                Mark as Occupied
              </button>
              <button onClick={() => updateTableStatus(actionModalTable, 'reserved')} className="w-full py-3 rounded-xl border border-amber-200 bg-amber-50 text-amber-700 text-sm font-semibold hover:bg-amber-100 transition">
                Mark as Reserved
              </button>
              
              <hr className="my-2 border-neutral-100" />
              
              <button onClick={handleOpenOrderModal} className="w-full py-3 rounded-xl bg-neutral-800 text-white text-sm font-semibold hover:bg-neutral-700 transition">
                Create Order
              </button>
              
              <button onClick={() => setActionModalTable(null)} className="mt-2 w-full py-3 rounded-xl text-neutral-500 text-sm font-medium hover:bg-neutral-50 transition">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ORDER MODAL */}
      {orderModalTable !== null && (
        <div className="fixed inset-0 bg-neutral-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 border border-neutral-100">
            <h2 className="text-xl font-semibold text-neutral-800 mb-1">New Order</h2>
            <p className="text-sm text-neutral-500 mb-6">Creating ticket for Table {orderModalTable}</p>
            
            <form onSubmit={submitOrder}>
              <label className="block text-xs font-medium uppercase tracking-wider text-neutral-400 mb-2">Order Items</label>
              <textarea
                autoFocus
                value={orderItems}
                onChange={e => setOrderItems(e.target.value)}
                placeholder="e.g. 2x Burger, 1x Cola"
                disabled={submitting}
                className="w-full px-4 py-3 rounded-xl border border-neutral-200 bg-neutral-50 text-neutral-800 placeholder-neutral-300 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-800 transition min-h-[120px] resize-none disabled:opacity-50"
              />
              
              <div className="flex gap-3 mt-6">
                <button type="button" onClick={() => setOrderModalTable(null)} disabled={submitting} className="flex-1 py-3 rounded-xl border border-neutral-200 text-neutral-600 text-sm font-medium hover:bg-neutral-50 transition disabled:opacity-50">
                  Cancel
                </button>
                <button type="submit" disabled={!orderItems.trim() || submitting} className="flex-1 py-3 rounded-xl bg-neutral-800 text-white text-sm font-medium hover:bg-neutral-700 disabled:opacity-50 transition">
                  {submitting ? 'Sending…' : 'Send to Kitchen'}
                </button>
              </div>
            </form>
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