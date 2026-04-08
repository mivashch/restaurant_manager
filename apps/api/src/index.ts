import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import type { HealthResponse } from '@restaurant-manager/shared'

const app = new Hono().basePath('/api')

app.use('*', logger())
app.use('*', cors())

app.get('/health', (c) => {
  const body: HealthResponse = {
    status: 'ok',
    timestamp: new Date().toISOString(),
  }
  return c.json(body)
})

export default app