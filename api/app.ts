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

app.get('/floor-plans', async (c) => {
  const { data, error } = await supabase
    .from('floor_plans')
    .select('*')
    .order('floor_number', { ascending: true })

  if (error) return c.json({ data: null, error: error.message }, 500)
  return c.json({ data: data ?? [], error: null })
})

// Kept for backward-compat (returns floor 1)
app.get('/floor-plan', async (c) => {
  const { data, error } = await supabase
    .from('floor_plans')
    .select('*')
    .order('floor_number', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (error) return c.json({ data: null, error: error.message }, 500)
  return c.json({ data, error: null })
})

async function syncTablesForFloor(prevTableNums: number[], tables: Array<{ num: number }>): Promise<string | null> {
  const tableNums = tables?.map((t) => t.num) ?? []

  const toDelete = prevTableNums.filter(n => !tableNums.includes(n))
  if (toDelete.length) {
    const { error } = await supabase.from('restaurant_tables').delete().in('table_number', toDelete)
    if (error) return error.message
  }

  const toInsert = tableNums.filter(n => !prevTableNums.includes(n))
  if (toInsert.length) {
    const { error } = await supabase.from('restaurant_tables').upsert(
      toInsert.map(num => ({ table_number: num, status: 'available' })),
      { onConflict: 'table_number' },
    )
    if (error) return error.message
  }

  return null
}

async function cleanupOrphanTables(): Promise<string | null> {
  const { data: allFloors, error: readError } = await supabase.from('floor_plans').select('data')
  if (readError) return readError.message

  const validNums = new Set(
    (allFloors ?? []).flatMap(f =>
      ((f.data as { tables?: Array<{ num: number }> })?.tables ?? []).map(t => t.num)
    )
  )

  if (validNums.size === 0) {
    const { error } = await supabase.from('restaurant_tables').delete().neq('table_number', 0)
    return error?.message ?? null
  }

  const nums = [...validNums]
  const { error } = await supabase
    .from('restaurant_tables')
    .delete()
    .not('table_number', 'in', `(${nums.join(',')})`)
  return error?.message ?? null
}

app.post('/floor-plan', async (c) => {
  const body = await c.req.json<{
    id?: number
    floor_number?: number
    name?: string
    rooms: unknown
    tables: Array<{ num: number }>
  }>()

  const { id, floor_number = 1, name, rooms, tables } = body
  const now = new Date().toISOString()

  let prevTableNums: number[] = []
  let prevPlanData: unknown = null
  if (id) {
    const { data: prev } = await supabase
      .from('floor_plans')
      .select('data')
      .eq('id', id)
      .single()
    prevTableNums = (prev?.data as { tables?: Array<{ num: number }> })?.tables?.map(t => t.num) ?? []
    prevPlanData = prev?.data ?? null
  }

  let result: { data: unknown; error: { message: string } | null }

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
      .insert({ name: name ?? `Floor ${floor_number}`, floor_number, data: { rooms, tables } })
      .select()
      .single()
    result = { data, error }
  }

  if (result.error) {
    return c.json({ data: null, error: result.error.message }, 500)
  }

  const syncErr = await syncTablesForFloor(prevTableNums, tables)
  if (syncErr) {
    if (id && prevPlanData != null) {
      await supabase.from('floor_plans').update({ data: prevPlanData }).eq('id', id)
    } else if (!id) {
      const insertedId = (result.data as { id?: number } | null)?.id
      if (insertedId) await supabase.from('floor_plans').delete().eq('id', insertedId)
    }
    return c.json({ data: null, error: syncErr }, 500)
  }

  const orphanErr = await cleanupOrphanTables()
  if (orphanErr) return c.json({ data: result.data, error: orphanErr }, 500)

  return c.json({ data: result.data, error: null })
})

app.get('/tables/locked', async c => {
  const { data, error } = await supabase
    .from('restaurant_tables')
    .select('table_number')
    .neq('status', 'available')

  if (error) {
    return c.json({ data: null, error: error.message }, 500)
  }

  const lockedTableNumbers = [
    ...new Set((data ?? []).map(table => table.table_number)),
  ]

  return c.json({ data: lockedTableNumbers, error: null })
})

// Remove restaurant_tables entries that are no longer referenced by any floor plan
app.post('/tables/cleanup', async (c) => {
  const { data: floors } = await supabase.from('floor_plans').select('data')
  const validNums = new Set(
    (floors ?? []).flatMap(f =>
      ((f.data as { tables?: Array<{ num: number }> })?.tables ?? []).map(t => t.num)
    )
  )

  if (validNums.size === 0) {
    await supabase.from('restaurant_tables').delete().neq('table_number', 0)
  } else {
    const nums = [...validNums]
    await supabase
      .from('restaurant_tables')
      .delete()
      .not('table_number', 'in', `(${nums.join(',')})`)
  }

  return c.json({ data: null, error: null })
})

app.delete('/floor-plan/:id', async (c) => {
  const id = Number(c.req.param('id'))
  if (!id) return c.json({ data: null, error: 'Invalid id' }, 400)

  const { error: deleteError } = await supabase.from('floor_plans').delete().eq('id', id)
  if (deleteError) return c.json({ data: null, error: deleteError.message }, 500)

  const orphanErr = await cleanupOrphanTables()
  if (orphanErr) return c.json({ data: null, error: orphanErr }, 500)

  return c.json({ data: null, error: null })
})

app.patch('/tables/:num/status', async (c) => {
  const num = Number(c.req.param('num'))
  const { status } = await c.req.json<{ status: string }>()

  const update: Record<string, unknown> = { status }

  if (status === 'available' || status === 'reserved') {
    update.occupied_at = null
  } else if (status === 'occupied') {
    // Only set occupied_at when transitioning from a non-occupied state
    const { data: current } = await supabase
      .from('restaurant_tables')
      .select('status')
      .eq('table_number', num)
      .single()

    if (current?.status !== 'occupied') {
      update.occupied_at = new Date().toISOString()
    }
  }

  const { data, error } = await supabase
    .from('restaurant_tables')
    .upsert({ table_number: num, ...update }, { onConflict: 'table_number' })
    .select()
    .single()

  return c.json({ data, error: error?.message ?? null })
})

app.post('/orders/mock', (c) => {
  const dishes = [
    '2x Margherita Pizza\n1x Caesar Salad',
    '1x Beef Burger\n2x French Fries\n1x Cola',
    '3x Spaghetti Carbonara',
    '1x Grilled Salmon\n1x Lemonade',
    '2x Chicken Wings\n1x Beer',
  ]
  const tableNum = Math.ceil(Math.random() * 5)
  const item_name = dishes[Math.floor(Math.random() * dishes.length)]
  const newOrder: MockOrder = {
    order_id: Date.now(),
    status: 'new',
    created_at: new Date().toISOString(),
    restaurant_tables: { table_number: tableNum },
    item_name,
    quantity: 1,
    ordered_by: 'Waiter',
  }
  mockOrders.push(newOrder)
  return c.json({ data: newOrder, error: null })
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

// ── Menu ──────────────────────────────────────────────────────────────────────

const MENU_SELECT = 'menu_item_id, name, category, price, description, is_available, sort_order'

type DbMenuItem = {
  menu_item_id: number
  name: string
  category: string
  price: number
  description: string
  is_available: boolean
  sort_order: number
}

function mapMenuItem(r: DbMenuItem) {
  return {
    id: r.menu_item_id,
    name: r.name,
    category: r.category,
    price: Number(r.price),
    description: r.description ?? '',
    available: r.is_available,
    sort_order: r.sort_order,
  }
}

app.get('/menu', async (c) => {
  const { data, error } = await supabase
    .from('menu_items')
    .select(MENU_SELECT)
    .order('category')
    .order('sort_order')
    .order('name')

  if (error) return c.json({ data: null, error: error.message }, 500)
  return c.json({ data: (data ?? []).map(r => mapMenuItem(r as DbMenuItem)), error: null })
})

app.post('/menu', async (c) => {
  const body = await c.req.json<{
    name: string
    category: string
    price: number
    description?: string
    available?: boolean
    sort_order?: number
  }>()

  const { data, error } = await supabase
    .from('menu_items')
    .insert({
      name: body.name,
      category: body.category,
      price: body.price,
      description: body.description ?? '',
      is_available: body.available ?? true,
      sort_order: body.sort_order ?? 0,
    })
    .select(MENU_SELECT)
    .single()

  if (error) return c.json({ data: null, error: error.message }, 500)
  return c.json({ data: mapMenuItem(data as DbMenuItem), error: null })
})

app.put('/menu/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const body = await c.req.json<{
    name?: string
    category?: string
    price?: number
    description?: string
    available?: boolean
    sort_order?: number
  }>()

  const dbUpdate: Partial<DbMenuItem> = {}
  if (body.name !== undefined) dbUpdate.name = body.name
  if (body.category !== undefined) dbUpdate.category = body.category
  if (body.price !== undefined) dbUpdate.price = body.price
  if (body.description !== undefined) dbUpdate.description = body.description
  if (body.available !== undefined) dbUpdate.is_available = body.available
  if (body.sort_order !== undefined) dbUpdate.sort_order = body.sort_order

  const { data, error } = await supabase
    .from('menu_items')
    .update(dbUpdate)
    .eq('menu_item_id', id)
    .select(MENU_SELECT)
    .single()

  if (error) return c.json({ data: null, error: error.message }, 500)
  return c.json({ data: mapMenuItem(data as DbMenuItem), error: null })
})

app.delete('/menu/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const { error } = await supabase.from('menu_items').delete().eq('menu_item_id', id)
  return c.json({ data: null, error: error?.message ?? null })
})

// ── Users ─────────────────────────────────────────────────────────────────────

type DbUser = {
  user_id: number
  username: string
  roles: { name: string } | null
}

function mapUser(r: DbUser) {
  return { id: r.user_id, username: r.username, role: r.roles?.name ?? '' }
}

const ROLE_PREFIX: Record<string, string> = {
  admin: 'ADMIN',
  waiter: 'WAITER',
  kitchen: 'KITCHEN',
}

app.get('/users', async (c) => {
  const { data, error } = await supabase
    .from('users')
    .select('user_id, username, roles(name)')
    .order('role_id')
    .order('username')

  if (error) return c.json({ data: null, error: error.message }, 500)
  return c.json({ data: (data ?? []).map(r => mapUser(r as unknown as DbUser)), error: null })
})

app.get('/users/next-username', async (c) => {
  const role = c.req.query('role') ?? ''
  const prefix = ROLE_PREFIX[role]
  if (!prefix) return c.json({ data: null, error: 'Invalid role' }, 400)

  const { data, error } = await supabase
    .from('users')
    .select('username')
    .ilike('username', `${prefix}-%`)

  if (error) return c.json({ data: null, error: error.message }, 500)

  const nums = (data ?? [])
    .map(u => parseInt(u.username.slice(prefix.length + 1), 10))
    .filter(n => !isNaN(n))
  const max = nums.length ? Math.max(...nums) : 0
  const username = `${prefix}-${String(max + 1).padStart(3, '0')}`
  return c.json({ data: { username }, error: null })
})

app.post('/users', async (c) => {
  const body = await c.req.json<{ username: string; role: string }>()

  const { data: roleData, error: roleError } = await supabase
    .from('roles')
    .select('role_id')
    .eq('name', body.role)
    .single()

  if (roleError || !roleData) return c.json({ data: null, error: 'Invalid role' }, 400)

  const placeholderHash = `placeholder:${crypto.randomUUID()}`

  const { data, error } = await supabase
    .from('users')
    .insert({ username: body.username.trim(), password_hash: placeholderHash, role_id: roleData.role_id })
    .select('user_id, username, roles(name)')
    .single()

  if (error) return c.json({ data: null, error: error.message }, 500)
  return c.json({ data: mapUser(data as unknown as DbUser), error: null })
})

app.put('/users/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const body = await c.req.json<{ username?: string; role?: string }>()

  const update: { username?: string; role_id?: number } = {}
  if (body.username) update.username = body.username.trim()

  if (body.role) {
    const { data: roleData, error: roleError } = await supabase
      .from('roles')
      .select('role_id')
      .eq('name', body.role)
      .single()

    if (roleError || !roleData) return c.json({ data: null, error: 'Invalid role' }, 400)
    update.role_id = roleData.role_id
  }

  const { data, error } = await supabase
    .from('users')
    .update(update)
    .eq('user_id', id)
    .select('user_id, username, roles(name)')
    .single()

  if (error) return c.json({ data: null, error: error.message }, 500)
  return c.json({ data: mapUser(data as unknown as DbUser), error: null })
})

app.delete('/users/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const { error } = await supabase.from('users').delete().eq('user_id', id)
  return c.json({ data: null, error: error?.message ?? null })
})

export default app