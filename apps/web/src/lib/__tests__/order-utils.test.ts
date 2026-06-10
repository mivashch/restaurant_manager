import { describe, it, expect } from 'vitest'
import { parseCartItems, formatTime, formatItems, fitViewBox } from '../order-utils'
import type { KitchenOrder, CartItem } from '../order-utils'

describe('parseCartItems', () => {
  it('parses valid JSON', () => {
    const result = parseCartItems('[{"id":1,"name":"Burger","price":10,"quantity":2}]')
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Burger')
    expect(result[0].quantity).toBe(2)
  })

  it('returns empty array for null', () => {
    expect(parseCartItems(null)).toEqual([])
  })

  it('returns empty array for invalid JSON', () => {
    expect(parseCartItems('not json')).toEqual([])
  })

  it('returns empty array for empty string', () => {
    expect(parseCartItems('')).toEqual([])
  })
})

describe('formatTime', () => {
  it('formats an ISO string to locale time', () => {
    const result = formatTime('2024-06-10T14:30:00Z')
    expect(result.length).toBeGreaterThanOrEqual(4)
    expect(result).toMatch(/^\d{2}:\d{2}/)
  })
})

describe('formatItems', () => {
  it('returns item_name when present', () => {
    const order: KitchenOrder = {
      order_id: 1, status: 'new', created_at: '',
      item_name: 'Burger', quantity: 2,
    }
    expect(formatItems(order)).toBe('Burger × 2')
  })

  it('returns No items when items is null', () => {
    const order: KitchenOrder = {
      order_id: 1, status: 'new', created_at: '',
      items: null,
    }
    expect(formatItems(order)).toBe('No items')
  })

  it('formats a JSON array', () => {
    const order: KitchenOrder = {
      order_id: 1, status: 'new', created_at: '',
      items: JSON.stringify([
        { name: 'Burger', quantity: 2 },
        { name: 'Fries', quantity: 1 },
      ]),
    }
    expect(formatItems(order)).toBe('Burger × 2\nFries × 1')
  })

  it('handles fallback property names', () => {
    const order: KitchenOrder = {
      order_id: 1, status: 'new', created_at: '',
      items: JSON.stringify([
        { item_name: 'Pizza', qty: 1 },
        { title: 'Salad', quantity: 2 },
      ]),
    }
    expect(formatItems(order)).toBe('Pizza × 1\nSalad × 2')
  })

  it('returns raw string for non-parseable items', () => {
    const order: KitchenOrder = {
      order_id: 1, status: 'new', created_at: '',
      items: 'not json',
    }
    expect(formatItems(order)).toBe('not json')
  })
})

describe('fitViewBox', () => {
  it('returns default viewBox for empty plan', () => {
    const result = fitViewBox({ rooms: [], tables: [] })
    expect(result).toBe('0 0 1000 650')
  })

  it('includes all points with padding', () => {
    const plan = {
      rooms: [{ vertices: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }] }],
      tables: [{ x: 50, y: 50 }],
    }
    const result = fitViewBox(plan)
    const parts = result.split(' ').map(Number)
    expect(parts[0]).toBeLessThan(0) // minX with padding
    expect(parts[1]).toBeLessThan(0) // minY with padding
    expect(parts[2]).toBeGreaterThan(100) // width > bounding box
    expect(parts[3]).toBeGreaterThan(100) // height > bounding box
  })
})
