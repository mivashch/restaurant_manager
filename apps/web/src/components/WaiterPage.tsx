import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import type { Plan, Room } from './FloorPlanEditor'
import type { MenuItem } from './MenuEditor'

type Status = 'available' | 'occupied' | 'reserved'
type TableStatuses = Record<number, Status>

type CartItem = { id: number; name: string; price: number; quantity: number }

type FloorData = {
  id: number
  floor_number: number
  name: string
  data: Plan
}

const SVG_WIDTH = 1000
const SVG_HEIGHT = 650
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

interface Props {
  onBack: () => void
}

export default function WaiterPage({ onBack }: Props) {
  const [floors, setFloors] = useState<FloorData[]>([])
  const [activeFloor, setActiveFloor] = useState(1)
  const [statuses, setStatuses] = useState<TableStatuses>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [menuItems, setMenuItems] = useState<MenuItem[]>([])
  const [menuCategory, setMenuCategory] = useState('All')
  const [menuSearch, setMenuSearch] = useState('')
  const [cart, setCart] = useState<CartItem[]>([])
  const [actionModalTable, setActionModalTable] = useState<number | null>(null)
  const [orderModalTable, setOrderModalTable] = useState<number | null>(null)
  const [submitting, setSubmitting] = useState(false)

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
          setActiveFloor(json.data[0].floor_number)
        }
      })
      .catch(() => setError('Failed to load floor plans'))
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
      .then(r => r.json())
      .then(json => { if (json.data) setMenuItems(json.data) })

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

  // Cart helpers
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

  // Action Menu Functions
  function handleTableClick(num: number) {
    setActionModalTable(num)
  }

  async function updateTableStatus(num: number, nextStatus: Status) {
    const current = statuses[num] ?? 'available'
    setStatuses(prev => ({ ...prev, [num]: nextStatus }))
    setActionModalTable(null) // Close action menu

    const res = await fetch(`/api/tables/${num}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: nextStatus }),
    })

    if (!res.ok) {
      setStatuses(prev => ({ ...prev, [num]: current })) // Revert on failure
      alert('Failed to update table status.')
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

      const { error } = await supabase
        .from('orders')
        .insert({
          table_id: tableData.table_id,
          waiter_id: 2,
          items: JSON.stringify(cart),
          status: 'new',
        })

      if (error) throw error

      await updateTableStatus(orderModalTable, 'occupied')
      setOrderModalTable(null)
    } catch (err) {
      console.error('Error submitting order:', err)
      alert('Failed to submit order. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }


  const currentPlan = floors.find(f => f.floor_number === activeFloor)?.data ?? null

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

        {/* Floor tabs */}
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

              {(statuses[actionModalTable] ?? 'available') === 'occupied' ? (
                <button onClick={handleOpenOrderModal} className="w-full py-3 rounded-xl bg-neutral-800 text-white text-sm font-semibold hover:bg-neutral-700 transition">
                  Create Order
                </button>
              ) : (
                <div className="w-full py-3 rounded-xl bg-neutral-100 text-neutral-400 text-sm font-semibold text-center cursor-not-allowed">
                  Create Order (mark as Occupied first)
                </div>
              )}
              
              <button onClick={() => setActionModalTable(null)} className="mt-2 w-full py-3 rounded-xl text-neutral-500 text-sm font-medium hover:bg-neutral-50 transition">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ORDER MODAL */}
      {orderModalTable !== null && (() => {
        const categories = ['All', ...Array.from(new Set(menuItems.map(i => i.category)))]
        const q = menuSearch.trim().toLowerCase()
        const visibleItems = menuItems.filter(i => {
          const matchSearch = !q || i.name.toLowerCase().includes(q) || i.description.toLowerCase().includes(q)
          const matchCategory = menuCategory === 'All' || i.category === menuCategory
          return matchSearch && matchCategory
        })
        const total = cart.reduce((s, ci) => s + ci.price * ci.quantity, 0)

        return (
          <div className="fixed inset-0 bg-neutral-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg border border-neutral-100 flex flex-col max-h-[90vh]">
              {/* Header */}
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

              {/* Category tabs — hidden when searching */}
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

              {/* Menu items */}
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

              {/* Cart summary + actions */}
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
    </div>
  )
}