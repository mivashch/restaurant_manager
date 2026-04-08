import { handle } from 'hono/vercel'
import app from '../apps/api/src/index'

export const config = {
  runtime: 'nodejs',
}

export default handle(app)