import { useState, useRef, useEffect } from 'react'
import polygonClipping from "polygon-clipping"

// ── Types ─────────────────────────────────────────────────────────────────────

export type Pt = { x: number; y: number }

export type Room = {
  id: string
  vertices: Pt[]
  obstacle: boolean
}

export type TableEl = {
  id: string
  num: number
  x: number
  y: number
}

export type Plan = { rooms: Room[]; tables: TableEl[] }

type Mode = 'draw' | 'place' | 'erase'

// ── Geometry ──────────────────────────────────────────────────────────────────

function uid() { return Math.random().toString(36).slice(2, 9) }
function dist(a: Pt, b: Pt) { return Math.hypot(a.x - b.x, a.y - b.y) }

function centroid(pts: Pt[]): Pt {
  return {
    x: pts.reduce((s, p) => s + p.x, 0) / pts.length,
    y: pts.reduce((s, p) => s + p.y, 0) / pts.length
  }
}

function pointInPoly(pt: Pt, poly: Pt[]): boolean {
  let inside = false

  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const { x: xi, y: yi } = poly[i]
    const { x: xj, y: yj } = poly[j]

    if (
      (yi > pt.y) !== (yj > pt.y) &&
      pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi
    ) {
      inside = !inside
    }
  }

  return inside
}

function orientation(a: Pt, b: Pt, c: Pt) {
  return (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y)
}

function onSegment(a: Pt, b: Pt, c: Pt) {
  return (
    Math.min(a.x, c.x) <= b.x &&
    b.x <= Math.max(a.x, c.x) &&
    Math.min(a.y, c.y) <= b.y &&
    b.y <= Math.max(a.y, c.y)
  )
}

function segmentsIntersect(a1: Pt, a2: Pt, b1: Pt, b2: Pt) {
  const o1 = orientation(a1, a2, b1)
  const o2 = orientation(a1, a2, b2)
  const o3 = orientation(b1, b2, a1)
  const o4 = orientation(b1, b2, a2)

  if (o1 * o2 < 0 && o3 * o4 < 0) return true

  if (o1 === 0 && onSegment(a1, b1, a2)) return true
  if (o2 === 0 && onSegment(a1, b2, a2)) return true
  if (o3 === 0 && onSegment(b1, a1, b2)) return true
  if (o4 === 0 && onSegment(b1, a2, b2)) return true

  return false
}

function polygonEdgesIntersect(a: Pt[], b: Pt[]) {
  for (let i = 0; i < a.length; i++) {
    const a1 = a[i]
    const a2 = a[(i + 1) % a.length]

    for (let j = 0; j < b.length; j++) {
      const b1 = b[j]
      const b2 = b[(j + 1) % b.length]

      if (segmentsIntersect(a1, a2, b1, b2)) return true
    }
  }

  return false
}

function roomsTouchOrOverlap(a: Pt[], b: Pt[]) {
  return (
    a.some(p => pointInPoly(p, b)) ||
    b.some(p => pointInPoly(p, a)) ||
    polygonEdgesIntersect(a, b)
  )
}

function mergePolygons(a: Pt[], b: Pt[]): Pt[] {
  const polyA = [[a.map(p => [p.x, p.y])]]
  const polyB = [[b.map(p => [p.x, p.y])]]

  const result = polygonClipping.union(polyA, polyB)
  const merged = result?.[0]?.[0]

  if (!merged) return a

  return merged.map((point: number[]) => ({
    x: point[0],
    y: point[1],
  }))
}

function mergeRoomIntoExisting(
  rooms: Room[],
  newVertices: Pt[],
  tables: TableEl[]
) {
  const hasTablesInside = tables.some(table =>
    pointInPoly({ x: table.x, y: table.y }, newVertices)
  )

  const roomContainingNewPolygon = rooms.find(
    room =>
      !room.obstacle &&
      pointInPoly(centroid(newVertices), room.vertices) &&
      !polygonEdgesIntersect(room.vertices, newVertices)
  )

  if (roomContainingNewPolygon) {
    if (hasTablesInside) return rooms

    const obstaclesToMerge = rooms.filter(
      room =>
        room.obstacle &&
        roomsTouchOrOverlap(room.vertices, newVertices)
    )

    if (obstaclesToMerge.length > 0) {
      const otherRooms = rooms.filter(
        room =>
          !room.obstacle ||
          !roomsTouchOrOverlap(room.vertices, newVertices)
      )

      const mergedObstacleVertices = obstaclesToMerge.reduce(
        (acc, room) => mergePolygons(acc, room.vertices),
        newVertices
      )

      return [
        ...otherRooms,
        {
          id: obstaclesToMerge[0].id,
          vertices: mergedObstacleVertices,
          obstacle: true,
        },
      ]
    }

    return [
      ...rooms,
      {
        id: uid(),
        vertices: newVertices,
        obstacle: true,
      },
    ]
  }

  const roomsToMerge = rooms.filter(
    room =>
      !room.obstacle &&
      roomsTouchOrOverlap(room.vertices, newVertices)
  )

  if (roomsToMerge.length > 0) {
    const normalRooms = rooms.filter(
      room =>
        !room.obstacle &&
        !roomsTouchOrOverlap(room.vertices, newVertices)
    )

    const obstacleRooms = rooms.filter(room => room.obstacle)

    const mergedVertices = roomsToMerge.reduce(
      (acc, room) => mergePolygons(acc, room.vertices),
      newVertices
    )

    return [
      ...normalRooms,
      {
        id: roomsToMerge[0].id,
        vertices: mergedVertices,
        obstacle: false,
      },
      ...obstacleRooms,
    ]
  }

  return [
    ...rooms,
    {
      id: uid(),
      vertices: newVertices,
      obstacle: false,
    },
  ]
}

function getNextTableNumber(tables: TableEl[]) {
  const usedNumbers = new Set(tables.map(t => t.num))

  let nextNumber = 1

  while (usedNumbers.has(nextNumber)) {
    nextNumber++
  }

  return nextNumber
}

function canPlace(pt: Pt, rooms: Room[], tables: TableEl[]) {
  const inRoom = rooms.some(r => !r.obstacle && pointInPoly(pt, r.vertices))
  const inObst = rooms.some(r => r.obstacle && pointInPoly(pt, r.vertices))
  const tooClose = tables.some(t => dist(pt, { x: t.x, y: t.y }) < TR * 2)

  return inRoom && !inObst && !tooClose
}

// ── Constants ─────────────────────────────────────────────────────────────────

const W = 1000
const H = 650
const SNAP = 18
const TR = 18

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  initial?: Plan
  planId?: number
  tableNumOffset?: number
  onSave: (plan: Plan & { id?: number }) => Promise<void>
}

export default function FloorPlanEditor({
  initial,
  planId,
  tableNumOffset,
  onSave
}: Props) {
  const [rooms, setRooms] = useState<Room[]>(initial?.rooms ?? [])
  const [tables, setTables] = useState<TableEl[]>(initial?.tables ?? [])
  const [draft, setDraft] = useState<Pt[]>([])
  const [cursor, setCursor] = useState<Pt | null>(null)
  const [mode, setMode] = useState<Mode>('draw')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    if (initial) {
      setRooms(initial.rooms)
      setTables(initial.tables)
    }
  }, [initial])

  function toSvgPt(e: React.MouseEvent): Pt {
    const svg = svgRef.current!
    const pt = svg.createSVGPoint()

    pt.x = e.clientX
    pt.y = e.clientY

    const { x, y } = pt.matrixTransform(svg.getScreenCTM()!.inverse())

    return { x, y }
  }

  function handleClick(e: React.MouseEvent) {
    const p = toSvgPt(e)

    if (mode === 'draw') {
      if (draft.length >= 3 && dist(p, draft[0]) < SNAP) {
        setRooms(rs => mergeRoomIntoExisting(rs, draft, tables))
        setDraft([])
      } else {
        setDraft(d => [...d, p])
      }
    }

    if (mode === 'place' && canPlace(p, rooms, tables)) {
      const nextNum = getNextTableNumber(tables)

      setTables(ts => [
        ...ts,
        {
          id: uid(),
          num: nextNum,
          x: p.x,
          y: p.y,
        },
      ])
    }
  }

  function eraseRoom(id: string, e: React.MouseEvent) {
    e.stopPropagation()

    const room = rooms.find(r => r.id === id)

    setRooms(rs => rs.filter(r => r.id !== id))

    if (room && !room.obstacle) {
      setTables(ts => {
        const kept = ts.filter(
          t => !pointInPoly({ x: t.x, y: t.y }, room.vertices)
        )

        return kept.map((t, i) => ({
          ...t,
          num: (tableNumOffset ?? 0) + i + 1,
        }))
      })
    }
  }

  function eraseTable(id: string, e: React.MouseEvent) {
    e.stopPropagation()

    const removed = tables.find(t => t.id === id)!

    setTables(ts =>
      ts
        .filter(t => t.id !== id)
        .map(t =>
          t.num > removed.num
            ? { ...t, num: t.num - 1 }
            : t
        )
    )
  }

  async function save() {
    setSaving(true)

    try {
      await onSave({ rooms, tables, id: planId })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  const nearFirst =
    draft.length >= 3 &&
    cursor !== null &&
    dist(cursor, draft[0]) < SNAP

  const snapPt = nearFirst ? draft[0] : cursor

  const hint =
    mode === 'draw'
      ? draft.length === 0
        ? 'Click to place the first vertex.'
        : draft.length < 3
          ? `${3 - draft.length} more point${draft.length === 2 ? '' : 's'} needed.`
          : 'Click near the first point (green) to close the room.'
      : mode === 'place'
        ? 'Click inside a room to place a table. Gray = invalid position.'
        : 'Click a room or table to delete it.'

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        {(['draw', 'place', 'erase'] as Mode[]).map(m => (
          <button
            key={m}
            onClick={() => {
              setMode(m)
              setDraft([])
            }}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition
              ${
                mode === m
                  ? 'bg-neutral-800 text-white border-neutral-800'
                  : 'bg-white text-neutral-700 border-neutral-200 hover:border-neutral-400'
              }`}
          >
            {m === 'draw' ? 'Draw room' : m === 'place' ? 'Place table' : 'Erase'}
          </button>
        ))}

        <button
          onClick={() => {
            setRooms([])
            setTables([])
            setDraft([])
          }}
          className="px-3 py-1.5 text-sm font-medium rounded-lg border border-neutral-200 bg-white text-red-500 hover:border-red-300 transition"
        >
          Clear all
        </button>

        <button
          onClick={save}
          disabled={saving}
          className="ml-auto px-4 py-1.5 text-sm font-medium rounded-lg bg-neutral-800 text-white hover:bg-neutral-700 disabled:opacity-50 transition"
        >
          {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save'}
        </button>
      </div>

      {/* Canvas */}
      <div className="rounded-xl overflow-hidden border border-neutral-200 bg-white select-none">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="w-full"
          style={{
            height: '62vh',
            cursor: mode === 'erase' ? 'default' : 'crosshair',
          }}
          onClick={handleClick}
          onMouseMove={e => setCursor(toSvgPt(e))}
          onMouseLeave={() => setCursor(null)}
        >
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path
                d="M40 0L0 0 0 40"
                fill="none"
                stroke="#f3f4f6"
                strokeWidth="1"
              />
            </pattern>
          </defs>

          <rect width={W} height={H} fill="url(#grid)" />

          {/* Rooms */}
          {rooms.map(room => (
            <polygon
              key={room.id}
              points={room.vertices.map(p => `${p.x},${p.y}`).join(' ')}
              fill={room.obstacle ? '#e5e7eb' : '#f0fdf4'}
              stroke={room.obstacle ? '#9ca3af' : '#86efac'}
              strokeWidth={2}
              className={
                mode === 'erase'
                  ? 'cursor-pointer hover:opacity-60 transition-opacity'
                  : ''
              }
              onClick={mode === 'erase' ? e => eraseRoom(room.id, e) : undefined}
            />
          ))}

          {/* Draft */}
          {draft.length > 0 && (
            <>
              {draft.length > 1 && (
                <polyline
                  points={draft.map(p => `${p.x},${p.y}`).join(' ')}
                  fill="none"
                  stroke="#60a5fa"
                  strokeWidth={2}
                  strokeDasharray="6 3"
                />
              )}

              {cursor && snapPt && (
                <line
                  x1={draft[draft.length - 1].x}
                  y1={draft[draft.length - 1].y}
                  x2={snapPt.x}
                  y2={snapPt.y}
                  stroke="#60a5fa"
                  strokeWidth={2}
                  strokeDasharray="6 3"
                />
              )}

              {draft.map((p, i) => (
                <circle
                  key={i}
                  cx={p.x}
                  cy={p.y}
                  r={i === 0 ? (nearFirst ? SNAP : 6) : 5}
                  fill={i === 0 && nearFirst ? '#22c55e' : '#3b82f6'}
                  stroke="white"
                  strokeWidth={2}
                />
              ))}
            </>
          )}

          {/* Tables */}
          {tables.map(t => (
            <g
              key={t.id}
              className={mode === 'erase' ? 'cursor-pointer' : ''}
              onClick={mode === 'erase' ? e => eraseTable(t.id, e) : undefined}
            >
              <circle
                cx={t.x}
                cy={t.y}
                r={TR}
                fill={mode === 'erase' ? '#ef4444' : '#1f2937'}
                stroke="white"
                strokeWidth={2}
                className="transition-colors"
              />

              <text
                x={t.x}
                y={t.y}
                textAnchor="middle"
                dominantBaseline="central"
                fill="white"
                fontSize={13}
                fontWeight="bold"
                style={{ pointerEvents: 'none' }}
              >
                {t.num}
              </text>
            </g>
          ))}

          {/* Table cursor preview */}
          {mode === 'place' && cursor && (
            <circle
              cx={cursor.x}
              cy={cursor.y}
              r={TR}
              fill={canPlace(cursor, rooms, tables) ? '#1f2937' : '#e5e7eb'}
              stroke={canPlace(cursor, rooms, tables) ? 'white' : '#d1d5db'}
              strokeWidth={2}
              opacity={0.55}
              style={{ pointerEvents: 'none' }}
            />
          )}
        </svg>
      </div>

      <p className="text-xs text-neutral-400">{hint}</p>
    </div>
  )
}