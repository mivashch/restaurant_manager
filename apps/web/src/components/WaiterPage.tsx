import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import type { Plan, Room } from './FloorPlanEditor'
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

interface Props {
  user: User
  onBack: () => void
}

export default function WaiterPage({ user, onBack }: Props) {
  const [plan, setPlan] = useState<Plan | null>(null)
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

  function handleTableClick(num: number) {
    setActionModalTable(num)
  }

  async function updateTableStatus(num: number, nextStatus: Status) {
    const current = statuses[num] ?? 'available'
    setStatuses(prev => ({ ...prev, [num]: nextStatus }))
    setActionModalTable(null) 

    const res = await fetch(`/api/tables/${num}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: nextStatus }),
    })

    if (!res.ok) {
      setStatuses(prev => ({ ...prev, [num]: current })) 
      alert('Failed to update table status.')
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

      const { error } = await supabase
        .from('orders')
        .insert({
          table_id: tableData.table_id,
          waiter_id: user.id, 
          items: orderItems,
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
        </div>
      )}
    </div>
  )
}