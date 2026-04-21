import { config } from 'dotenv'
import { serve } from '@hono/node-server'
import app from '../../../api/app.js'

config({ path: new URL('../../../.env.local', import.meta.url).pathname })

const port = Number(process.env.PORT) || 3001

serve({ fetch: app.fetch, port }, () => {
  console.log(`API running on http://localhost:${port}`)
})