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
  const body = await c.req.json<{ id?: number; name?: string; rooms: unknown; tables: unknown }>()
  const { id, name, rooms, tables } = body
  const now = new Date().toISOString()

  if (id) {
    const { data, error } = await supabase
      .from('floor_plans')
      .update({ data: { rooms, tables }, updated_at: now })
      .eq('id', id)
      .select()
      .single()
    return c.json({ data, error: error?.message ?? null })
  }

  const { data, error } = await supabase
    .from('floor_plans')
    .insert({ name: name ?? 'Main Floor', data: { rooms, tables } })
    .select()
    .single()
  return c.json({ data, error: error?.message ?? null })
})

export default app
