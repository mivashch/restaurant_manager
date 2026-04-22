import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { supabase } from './supabase.js'
import type { Role } from '@restaurant-manager/shared'

const app = new Hono().basePath('/api')

type MockOrder = {
  order_id: number
  status: 'open' | 'new' | 'preparing' | 'ready' | 'served'
  created_at: string
  restaurant_tables: {
    table_number: number
  } | null
  item_name: string
  quantity: number
  ordered_by: string
  prepared_by?: string
}

let mockOrders: MockOrder[] = [
  {
    order_id: 201,
    status: 'open',
    created_at: new Date().toISOString(),
    restaurant_tables: { table_number: 4 },
    item_name: 'Grilled Salmon',
    quantity: 1,
    ordered_by: 'Joanne Doje',
  },
  {
    order_id: 202,
    status: 'preparing',
    created_at: new Date().toISOString(),
    restaurant_tables: { table_number: 2 },
    item_name: 'Caesar Salad',
    quantity: 2,
    ordered_by: 'Joanne Doje',
  },
]

app.use('*', cors())

app.get('/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() })
})

app.post('/auth/login', async (c) => {
  const body = await c.req.json<{ privateId?: string }>()
  const privateId = body?.privateId?.trim()

  if (!privateId) {
    return c.json({ data: null, error: 'Private ID is required' }, 400)
  }

  const { data, error } = await supabase
    .from('users')
    .select('user_id, username, roles(name)')
    .eq('username', privateId)
    .single()

  if (error || !data) {
    return c.json({ data: null, error: 'Invalid Private ID' }, 401)
  }

  const rolesData = data.roles as unknown as { name: string } | null
  const roleName = rolesData?.name as Role | undefined

  return c.json({
    data: {
      user: {
        id: String(data.user_id),
        name: data.username,
        roles: roleName ? [roleName] : [],
      },
    },
    error: null,
  })
})

app.get('/floor-plan', async (c) => {
  const { data, error } = await supabase
    .from('floor_plans')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    return c.json({ data: null, error: error.message }, 500)
  }

  return c.json({ data, error: null })
})

app.post('/floor-plan', async (c) => {
  const body = await c.req.json<{
    id?: number
    name?: string
    rooms: unknown
    tables: Array<{ num: number }>
  }>()

  const { id, name, rooms, tables } = body
  const now = new Date().toISOString()

  let result:
    | { data: unknown; error: { message: string } | null }
    | {
        data: unknown
        error: Error | null
      }

  if (id) {
    const { data, error } = await supabase
      .from('floor_plans')
      .update({ data: { rooms, tables }, updated_at: now })
      .eq('id', id)
      .select()
      .single()

    result = { data, error }
  } else {
    const { data, error } = await supabase
      .from('floor_plans')
      .insert({ name: name ?? 'Main Floor', data: { rooms, tables } })
      .select()
      .single()

    result = { data, error }
  }

  if (!result.error && tables?.length) {
    await supabase.from('restaurant_tables').upsert(
      tables.map((t) => ({
        table_number: t.num,
        status: 'available',
      })),
      { onConflict: 'table_number', ignoreDuplicates: true },
    )
  }

  return c.json({
    data: result.data,
    error: result.error?.message ?? null,
  })
})

app.patch('/tables/:num/status', async (c) => {
  const num = Number(c.req.param('num'))
  const { status } = await c.req.json<{ status: string }>()

  const { data, error } = await supabase
    .from('restaurant_tables')
    .upsert({ table_number: num, status }, { onConflict: 'table_number' })
    .select()
    .single()

  return c.json({ data, error: error?.message ?? null })
})

app.get('/orders/kitchen', (c) => {
  const data = mockOrders.filter((order) =>
    ['open', 'new', 'preparing'].includes(order.status),
  )

  return c.json({ data, error: null })
})

app.patch('/orders/:id/start', (c) => {
  const orderId = Number(c.req.param('id'))

  if (!orderId) {
    return c.json({ data: null, error: 'Invalid order id' }, 400)
  }

  const order = mockOrders.find((o) => o.order_id === orderId)

  if (!order) {
    return c.json({ data: null, error: 'Order not found' }, 404)
  }

  if (!['open', 'new'].includes(order.status)) {
    return c.json({ data: null, error: 'Order cannot be started' }, 400)
  }

  order.status = 'preparing'

  return c.json({ data: order, error: null })
})

app.patch('/orders/:id/ready', (c) => {
  const orderId = Number(c.req.param('id'))

  if (!orderId) {
    return c.json({ data: null, error: 'Invalid order id' }, 400)
  }

  const order = mockOrders.find((o) => o.order_id === orderId)

  if (!order) {
    return c.json({ data: null, error: 'Order not found' }, 404)
  }

  if (order.status !== 'preparing') {
    return c.json({ data: null, error: 'Order is not preparing' }, 400)
  }

  order.status = 'ready'
  order.prepared_by = 'Kitchen'

  return c.json({ data: order, error: null })
})

app.get('/orders/runner', (c) => {
  const data = mockOrders.filter((order) => order.status === 'ready')
  return c.json({ data, error: null })
})

app.patch('/orders/:id/take', async (c) => {
  const orderId = Number(c.req.param('id'))

  if (!orderId) {
    return c.json({ data: null, error: 'Invalid order id' }, 400)
  }

  const order = mockOrders.find((o) => o.order_id === orderId)

  if (!order) {
    return c.json({ data: null, error: 'Order not found' }, 404)
  }

  if (order.status !== 'ready') {
    return c.json({ data: null, error: 'Order is not ready' }, 400)
  }

  order.status = 'served'

  return c.json({ data: order, error: null })
})

export default app