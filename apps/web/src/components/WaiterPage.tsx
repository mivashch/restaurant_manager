import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import type { Plan, Room, Pt } from './FloorPlanEditor'

type Status = 'available' | 'occupied'
type TableStatuses = Record<number, Status>

const W = 1000
const H = 650
const TR = 18

function pointInPoly(pt: Pt, poly: Pt[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const { x: xi, y: yi } = poly[i], { x: xj, y: yj } = poly[j]
    if ((yi > pt.y) !== (yj > pt.y) && pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi)
      inside = !inside
  }
  return inside
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
  const [plan, setPlan] = useState<Plan | null>(null)
  const [statuses, setStatuses] = useState<TableStatuses>({})
  const [loading, setLoading] = useState(true)
  const svgRef = useRef<SVGSVGElement>(null)

  // load floor plan
  useEffect(() => {
    fetch('/api/floor-plan')
      .then(r => r.json())
      .then(json => {
        if (json.data) setPlan(json.data.data as Plan)
      })
      .finally(() => setLoading(false))
  }, [])

  // load initial statuses
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

  // realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('table-status-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'restaurant_tables' },
        payload => {
          const row = (payload.new ?? payload.old) as { table_number: number; status: Status }
          if (row?.table_number != null) {
            setStatuses(prev => ({ ...prev, [row.table_number]: row.status }))
          }
        }
      )
      .subscribe((status, err) => {
        if (err) console.error('Realtime subscription error:', err)
        else console.log('Realtime channel status:', status)
      })

    return () => { supabase.removeChannel(channel) }
  }, [])

  async function toggleTable(num: number) {
    const current = statuses[num] ?? 'available'
    const next: Status = current === 'available' ? 'occupied' : 'available'
    setStatuses(prev => ({ ...prev, [num]: next }))
    await fetch(`/api/tables/${num}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: next }),
    })
  }

  return (
    <div className="min-h-screen bg-neutral-50 flex flex-col">
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
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-neutral-400 animate-pulse">Loading…</p>
        ) : !plan || plan.tables.length === 0 ? (
          <p className="text-sm text-neutral-400">No floor plan configured yet.</p>
        ) : (
          <div className="rounded-xl overflow-hidden border border-neutral-200 bg-white">
            <svg
              ref={svgRef}
              viewBox={`0 0 ${W} ${H}`}
              className="w-full"
              style={{ height: '70vh' }}
            >
              <defs>
                <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                  <path d="M40 0L0 0 0 40" fill="none" stroke="#f3f4f6" strokeWidth="1" />
                </pattern>
              </defs>
              <rect width={W} height={H} fill="url(#grid)" />

              {plan.rooms.map(room => (
                <RoomPolygon key={room.id} room={room} />
              ))}

              {plan.tables.map(t => {
                const status = statuses[t.num] ?? 'available'
                const occupied = status === 'occupied'
                return (
                  <g
                    key={t.id}
                    onClick={() => toggleTable(t.num)}
                    className="cursor-pointer"
                  >
                    <circle
                      cx={t.x} cy={t.y} r={TR + 4}
                      fill="transparent"
                    />
                    <circle
                      cx={t.x} cy={t.y} r={TR}
                      fill={occupied ? '#ef4444' : '#22c55e'}
                      stroke="white"
                      strokeWidth={2}
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
      </main>
    </div>
  )
}
