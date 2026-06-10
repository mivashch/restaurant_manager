import { pointInPoly, dist } from './geometry'
import type { Pt } from './geometry'

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

export function clonePlan(plan: Plan): Plan {
  return {
    rooms: plan.rooms.map(room => ({
      ...room,
      vertices: room.vertices.map(point => ({ ...point })),
    })),
    tables: plan.tables.map(table => ({ ...table })),
  }
}

export function plansEqual(a: Plan, b: Plan) {
  return JSON.stringify(a) === JSON.stringify(b)
}

export function getNextTableNumber(tables: TableEl[]) {
  const usedNumbers = new Set(tables.map(t => t.num))
  let nextNumber = 1
  while (usedNumbers.has(nextNumber)) {
    nextNumber++
  }
  return nextNumber
}

export function canPlace(
  pt: Pt,
  rooms: Room[],
  tables: TableEl[],
  tableRadius: number,
) {
  const inRoom = rooms.some(r => !r.obstacle && pointInPoly(pt, r.vertices))
  const inObst = rooms.some(r => r.obstacle && pointInPoly(pt, r.vertices))
  const tooClose = tables.some(t => dist(pt, { x: t.x, y: t.y }) < tableRadius * 2)
  return inRoom && !inObst && !tooClose
}
