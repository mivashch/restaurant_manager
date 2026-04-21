import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { Role, User } from '../packages/shared/src/index.js'

const app = new Hono().basePath('/api')

app.use('*', cors())

// TODO: replace with Supabase query when DB is integrated
const USERS: Record<string, User> = {
  'ADMIN-001': { id: 'ADMIN-001', name: 'Admin User', roles: ['admin', 'waiter', 'kitchen', 'runner'] },
  'WAITER-001': { id: 'WAITER-001', name: 'Waiter One', roles: ['waiter', 'runner'] },
  'KITCHEN-001': { id: 'KITCHEN-001', name: 'Kitchen Staff', roles: ['kitchen'] },
  'RUNNER-001': { id: 'RUNNER-001', name: 'Runner One', roles: ['runner'] },
}

app.get('/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() })
})

app.post('/auth/login', async (c) => {
  const body = await c.req.json<{ privateId?: string }>()
  const privateId = body?.privateId?.trim()

  if (!privateId) {
    return c.json({ data: null, error: 'Private ID is required' }, 400)
  }

  const user = USERS[privateId]
  if (!user) {
    return c.json({ data: null, error: 'Invalid Private ID' }, 401)
  }

  return c.json({ data: { user }, error: null })
})

export default app
export type { Role }