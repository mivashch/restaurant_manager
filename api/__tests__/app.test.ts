// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

let mockResult: unknown = { data: [], error: null }

function qb() {
  const self = {
    select: vi.fn(() => self),
    insert: vi.fn(() => self),
    update: vi.fn(() => self),
    delete: vi.fn(() => self),
    upsert: vi.fn(() => self),
    eq: vi.fn(() => self),
    neq: vi.fn(() => self),
    in: vi.fn(() => self),
    ilike: vi.fn(() => self),
    order: vi.fn(() => self),
    limit: vi.fn(() => self),
    gte: vi.fn(() => self),
    single: vi.fn(() => Promise.resolve(mockResult)),
    maybeSingle: vi.fn(() => Promise.resolve(mockResult)),
    then: (onfulfilled: (v: unknown) => unknown) =>
      Promise.resolve(mockResult).then(onfulfilled),
  }
  return self
}

vi.mock('../supabase.js', () => ({
  supabase: {
    from: vi.fn(() => qb()),
    channel: vi.fn(() => ({
      on: vi.fn(() => ({ subscribe: vi.fn() })),
      subscribe: vi.fn(),
    })),
    removeChannel: vi.fn(),
  },
}))

import app from '../app.js'

function setResult(data: unknown, error: { message: string } | null = null) {
  mockResult = { data, error }
}

beforeEach(() => {
  setResult([])
})

// ── Health ───────────────────────────────────────────────────────────────────

describe('GET /api/health', () => {
  it('returns ok status with timestamp', async () => {
    const res = await app.request('/api/health')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('ok')
    expect(body.timestamp).toBeTruthy()
  })
})

// ── Auth ─────────────────────────────────────────────────────────────────────

describe('POST /api/auth/login', () => {
  it('returns 400 when privateId is missing', async () => {
    const res = await app.request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'Content-Type': 'application/json' },
    })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('Private ID is required')
  })

  it('returns 401 when user not found', async () => {
    setResult(null, { message: 'Invalid Private ID' })
    const res = await app.request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ privateId: 'WAITER-999' }),
      headers: { 'Content-Type': 'application/json' },
    })
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toBe('Invalid Private ID')
  })

  it('returns user with roles on success', async () => {
    setResult({
      user_id: 1,
      username: 'WAITER-001',
      user_permissions: [
        { roles: { name: 'waiter' } },
        { roles: { name: 'kitchen' } },
      ],
    })
    const res = await app.request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ privateId: 'WAITER-001' }),
      headers: { 'Content-Type': 'application/json' },
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.user.name).toBe('WAITER-001')
    expect(body.data.user.roles).toEqual(['waiter', 'kitchen'])
  })

  it('filters out null role entries', async () => {
    setResult({
      user_id: 1,
      username: 'WAITER-001',
      user_permissions: [
        { roles: null },
        { roles: { name: 'waiter' } },
      ],
    })
    const res = await app.request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ privateId: 'WAITER-001' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const body = await res.json()
    expect(body.data.user.roles).toEqual(['waiter'])
  })
})

// ── Floor Plans ──────────────────────────────────────────────────────────────

describe('GET /api/floor-plans', () => {
  it('returns floor plans', async () => {
    setResult([
      { id: 1, floor_number: 1, name: 'Floor 1', data: {} },
    ])
    const res = await app.request('/api/floor-plans')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toHaveLength(1)
    expect(body.error).toBeNull()
  })

  it('handles database error', async () => {
    setResult(null, { message: 'DB connection failed' })
    const res = await app.request('/api/floor-plans')
    expect(res.status).toBe(500)
    expect((await res.json()).error).toBe('DB connection failed')
  })
})

describe('GET /api/floor-plan', () => {
  it('returns single floor plan', async () => {
    setResult({ id: 1, floor_number: 1, name: 'Floor 1', data: {} })
    const res = await app.request('/api/floor-plan')
    expect(res.status).toBe(200)
    expect((await res.json()).data.id).toBe(1)
  })
})

// ── Tables ───────────────────────────────────────────────────────────────────

describe('GET /api/tables/locked', () => {
  it('returns unique locked table numbers', async () => {
    setResult([
      { table_number: 1 },
      { table_number: 2 },
      { table_number: 1 },
    ])
    const res = await app.request('/api/tables/locked')
    expect(res.status).toBe(200)
    expect((await res.json()).data).toEqual([1, 2])
  })
})

// ── Orders ───────────────────────────────────────────────────────────────────

describe('GET /api/orders/kitchen', () => {
  it('returns new and preparing orders', async () => {
    setResult([
      { order_id: 1, status: 'new' },
      { order_id: 2, status: 'preparing' },
    ])
    const res = await app.request('/api/orders/kitchen')
    expect(res.status).toBe(200)
    expect((await res.json()).data).toHaveLength(2)
  })
})

describe('PATCH /api/orders/:id/start', () => {
  it('returns 400 for invalid order id', async () => {
    const res = await app.request('/api/orders/0/start', { method: 'PATCH' })
    expect(res.status).toBe(400)
  })

  it('returns 404 when order not found', async () => {
    setResult(null, { message: 'not found' })
    const res = await app.request('/api/orders/999/start', { method: 'PATCH' })
    expect(res.status).toBe(404)
    expect((await res.json()).error).toBe('Order not found')
  })

  it('rejects starting a non-new order', async () => {
    setResult({ order_id: 1, status: 'preparing' })
    const res = await app.request('/api/orders/1/start', { method: 'PATCH' })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('Order cannot be started')
  })
})

describe('PATCH /api/orders/:id/ready', () => {
  it('rejects making a non-preparing order ready', async () => {
    setResult({ order_id: 1, status: 'new' })
    const res = await app.request('/api/orders/1/ready', { method: 'PATCH' })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('Order is not preparing')
  })
})

describe('PATCH /api/orders/:id/take', () => {
  it('rejects taking a non-ready order', async () => {
    setResult({ order_id: 1, status: 'preparing' })
    const res = await app.request('/api/orders/1/take', { method: 'PATCH' })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('Order is not ready')
  })
})

// ── Menu ─────────────────────────────────────────────────────────────────────

describe('GET /api/menu', () => {
  it('returns mapped menu items', async () => {
    setResult([{
      menu_item_id: 1,
      name: 'Burger',
      category: 'Main',
      price: 12.50,
      description: 'Beef patty',
      is_available: true,
      sort_order: 1,
    }])
    const res = await app.request('/api/menu')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data[0]).toEqual({
      id: 1, name: 'Burger', category: 'Main', price: 12.50,
      description: 'Beef patty', available: true, sort_order: 1,
    })
  })

  it('maps null description to empty string', async () => {
    setResult([{
      menu_item_id: 2, name: 'Fries', category: 'Sides',
      price: 4, description: null, is_available: true, sort_order: 0,
    }])
    const body = await (await app.request('/api/menu')).json()
    expect(body.data[0].description).toBe('')
  })
})

describe('POST /api/menu', () => {
  it('creates a menu item', async () => {
    setResult({
      menu_item_id: 1, name: 'Pizza', category: 'Main',
      price: 15, description: '', is_available: true, sort_order: 0,
    })
    const res = await app.request('/api/menu', {
      method: 'POST',
      body: JSON.stringify({ name: 'Pizza', category: 'Main', price: 15 }),
      headers: { 'Content-Type': 'application/json' },
    })
    expect((await res.json()).data.name).toBe('Pizza')
  })
})

describe('PUT /api/menu/:id', () => {
  it('updates a menu item', async () => {
    setResult({
      menu_item_id: 1, name: 'Updated', category: 'Main',
      price: 10, description: '', is_available: false, sort_order: 0,
    })
    const res = await app.request('/api/menu/1', {
      method: 'PUT',
      body: JSON.stringify({ name: 'Updated', available: false }),
      headers: { 'Content-Type': 'application/json' },
    })
    expect((await res.json()).data.available).toBe(false)
  })
})

describe('DELETE /api/menu/:id', () => {
  it('deletes a menu item', async () => {
    setResult(null)
    const res = await app.request('/api/menu/1', { method: 'DELETE' })
    expect(res.status).toBe(200)
  })
})

// ── Users ────────────────────────────────────────────────────────────────────

describe('GET /api/users', () => {
  it('returns active users', async () => {
    setResult([{
      user_id: 1, username: 'WAITER-001',
      roles: { name: 'waiter' },
      user_permissions: [{ roles: { name: 'waiter' } }],
    }])
    const body = await (await app.request('/api/users')).json()
    expect(body.data[0].username).toBe('WAITER-001')
  })
})

describe('GET /api/users/next-username', () => {
  it('returns error for invalid role', async () => {
    const res = await app.request('/api/users/next-username?role=invalid')
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('Invalid role')
  })

  it('generates sequential username', async () => {
    setResult([{ username: 'WAITER-001' }, { username: 'WAITER-002' }])
    const body = await (await app.request('/api/users/next-username?role=waiter')).json()
    expect(body.data.username).toBe('WAITER-003')
  })

  it('generates first username when none exist', async () => {
    setResult([])
    const body = await (await app.request('/api/users/next-username?role=kitchen')).json()
    expect(body.data.username).toBe('KITCHEN-001')
  })
})

describe('DELETE /api/users/:id', () => {
  it('returns 400 for invalid id', async () => {
    const res = await app.request('/api/users/0', { method: 'DELETE' })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('Invalid user id')
  })

  it('soft-deletes a user', async () => {
    setResult(null)
    const res = await app.request('/api/users/1', { method: 'DELETE' })
    expect(res.status).toBe(200)
  })
})

// ── Floor Plan Versions ──────────────────────────────────────────────────────

describe('GET /api/floor-plans/:id/versions', () => {
  it('returns 400 for invalid id', async () => {
    const res = await app.request('/api/floor-plans/NaN/versions')
    expect(res.status).toBe(400)
  })

  it('returns versions', async () => {
    setResult([{ version_id: 1, plan_data: {}, created_at: '2024-01-01' }])
    const body = await (await app.request('/api/floor-plans/1/versions')).json()
    expect(body.data).toHaveLength(1)
  })
})
