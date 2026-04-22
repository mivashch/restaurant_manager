import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { supabase } from './supabase.js'
import type { Role } from '@restaurant-manager/shared'

const app = new Hono().basePath('/api')

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

  if (error) return c.json({ data: null, error: error.message }, 500)
  return c.json({ data, error: null })
})

app.post('/floor-plan', async (c) => {
  const body = await c.req.json<{ id?: number; name?: string; rooms: unknown; tables: Array<{ num: number }> }>()
  const { id, name, rooms, tables } = body
  const now = new Date().toISOString()

  let result
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
      tables.map(t => ({ table_number: t.num, status: 'available' })),
      { onConflict: 'table_number', ignoreDuplicates: true }
    )
  }

  return c.json({ data: result.data, error: result.error?.message ?? null })
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

app.get('/orders/runner', async (c) => {
  const { data, error } = await supabase
    .from('orders')
    .select(`
      order_id,
      status,
      created_at,
      restaurant_tables (
        table_number
      ),
      waiter:users!orders_waiter_id_fkey (
        username
      ),
      order_items (
        quantity,
        menu_items (
          name
        )
      )
    `)
    .eq('status', 'ready')
    .order('created_at', { ascending: true })

  if (error) {
    return c.json({ data: null, error: error.message }, 500)
  }

  const normalized = (data ?? []).map((order: any) => {
    const items = order.order_items ?? []
    const firstItem = items[0]
    const totalQuantity = items.reduce(
      (sum: number, item: any) => sum + Number(item.quantity ?? 0),
      0,
    )

    return {
      order_id: order.order_id,
      status: order.status,
      created_at: order.created_at,
      restaurant_tables: order.restaurant_tables,
      item_name: firstItem?.menu_items?.name ?? 'Order',
      quantity: totalQuantity || 1,
      ordered_by: order.waiter?.username ?? 'Waiter',
      prepared_by: 'Kitchen',
    }
  })

  return c.json({ data: normalized, error: null })
})

app.patch('/orders/:id/take', async (c) => {
  const orderId = Number(c.req.param('id'))

  if (!orderId) {
    return c.json({ data: null, error: 'Invalid order id' }, 400)
  }

  const { data, error } = await supabase
    .from('orders')
    .update({ status: 'served' })
    .eq('order_id', orderId)
    .eq('status', 'ready')
    .select()
    .single()

  if (error) {
    return c.json({ data: null, error: error.message }, 500)
  }

  return c.json({ data, error: null })
})

app.get('/orders/kitchen', async (c) => {
  const { data, error } = await supabase
    .from('orders')
    .select(`
      order_id,
      status,
      created_at,
      restaurant_tables (
        table_number
      ),
      waiter:users!orders_waiter_id_fkey (
        username
      ),
      order_items (
        quantity,
        menu_items (
          name
        )
      )
    `)
    .in('status', ['open', 'new', 'preparing'])
    .order('created_at', { ascending: true })

  if (error) {
    return c.json({ data: null, error: error.message }, 500)
  }

  const normalized = (data ?? []).map((order: any) => {
    const items = order.order_items ?? []
    const firstItem = items[0]
    const totalQuantity = items.reduce(
      (sum: number, item: any) => sum + Number(item.quantity ?? 0),
      0,
    )

    return {
      order_id: order.order_id,
      status: order.status,
      created_at: order.created_at,
      restaurant_tables: order.restaurant_tables,
      item_name: firstItem?.menu_items?.name ?? 'Order',
      quantity: totalQuantity || 1,
      ordered_by: order.waiter?.username ?? 'Waiter',
    }
  })

  return c.json({ data: normalized, error: null })
})

app.patch('/orders/:id/start', async (c) => {
  const orderId = Number(c.req.param('id'))

  if (!orderId) {
    return c.json({ data: null, error: 'Invalid order id' }, 400)
  }

  const { data, error } = await supabase
    .from('orders')
    .update({ status: 'preparing' })
    .eq('order_id', orderId)
    .in('status', ['open', 'new'])
    .select()
    .single()

  if (error) {
    return c.json({ data: null, error: error.message }, 500)
  }

  return c.json({ data, error: null })
})

app.patch('/orders/:id/ready', async (c) => {
  const orderId = Number(c.req.param('id'))

  if (!orderId) {
    return c.json({ data: null, error: 'Invalid order id' }, 400)
  }

  const { data, error } = await supabase
    .from('orders')
    .update({ status: 'ready' })
    .eq('order_id', orderId)
    .eq('status', 'preparing')
    .select()
    .single()

  if (error) {
    return c.json({ data: null, error: error.message }, 500)
  }

  return c.json({ data, error: null })
})

export default app
