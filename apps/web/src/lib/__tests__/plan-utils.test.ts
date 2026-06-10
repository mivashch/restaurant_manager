import { describe, it, expect } from 'vitest'
import { clonePlan, plansEqual, getNextTableNumber, canPlace } from '../plan-utils'
import type { Room, TableEl, Plan } from '../plan-utils'

describe('clonePlan', () => {
  it('deep clones a plan', () => {
    const plan: Plan = {
      rooms: [{ id: 'r1', vertices: [{ x: 1, y: 2 }], obstacle: false }],
      tables: [{ id: 't1', num: 1, x: 10, y: 20 }],
    }
    const cloned = clonePlan(plan)
    expect(cloned).toEqual(plan)
    expect(cloned.rooms).not.toBe(plan.rooms)
    expect(cloned.rooms[0].vertices).not.toBe(plan.rooms[0].vertices)
    expect(cloned.tables[0]).not.toBe(plan.tables[0])
  })
})

describe('plansEqual', () => {
  it('returns true for identical plans', () => {
    const a: Plan = { rooms: [], tables: [] }
    const b: Plan = { rooms: [], tables: [] }
    expect(plansEqual(a, b)).toBe(true)
  })

  it('returns false for different plans', () => {
    const a: Plan = { rooms: [], tables: [{ id: 't1', num: 1, x: 0, y: 0 }] }
    const b: Plan = { rooms: [], tables: [] }
    expect(plansEqual(a, b)).toBe(false)
  })
})

describe('getNextTableNumber', () => {
  it('returns 1 for empty tables', () => {
    expect(getNextTableNumber([])).toBe(1)
  })

  it('returns next sequential number', () => {
    const tables: TableEl[] = [
      { id: 't1', num: 1, x: 0, y: 0 },
      { id: 't2', num: 2, x: 0, y: 0 },
    ]
    expect(getNextTableNumber(tables)).toBe(3)
  })

  it('fills gaps', () => {
    const tables: TableEl[] = [
      { id: 't2', num: 2, x: 0, y: 0 },
      { id: 't3', num: 3, x: 0, y: 0 },
    ]
    expect(getNextTableNumber(tables)).toBe(1)
  })

  it('handles non-sequential numbers', () => {
    const tables: TableEl[] = [
      { id: 't1', num: 5, x: 0, y: 0 },
      { id: 't2', num: 3, x: 0, y: 0 },
    ]
    expect(getNextTableNumber(tables)).toBe(1)
  })
})

describe('canPlace', () => {
  const rooms: Room[] = [
    { id: 'r1', vertices: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }], obstacle: false },
    { id: 'r2', vertices: [{ x: 50, y: 50 }, { x: 60, y: 50 }, { x: 60, y: 60 }, { x: 50, y: 60 }], obstacle: true },
  ]
  const tables: TableEl[] = [
    { id: 't1', num: 1, x: 10, y: 10 },
  ]

  it('returns true for valid position', () => {
    expect(canPlace({ x: 50, y: 30 }, rooms, tables, 18)).toBe(true)
  })

  it('returns false when outside all rooms', () => {
    expect(canPlace({ x: 200, y: 200 }, rooms, tables, 18)).toBe(false)
  })

  it('returns false when inside obstacle', () => {
    expect(canPlace({ x: 55, y: 55 }, rooms, tables, 18)).toBe(false)
  })

  it('returns false when too close to another table', () => {
    expect(canPlace({ x: 20, y: 20 }, rooms, tables, 18)).toBe(false)
  })
})
