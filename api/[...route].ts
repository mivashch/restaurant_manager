import type { VercelRequest, VercelResponse } from '@vercel/node'
import app from './app.js'

export const config = {
  runtime: 'nodejs',
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const url = `https://${req.headers.host}${req.url}`
  const request = new Request(url, {
    method: req.method ?? 'GET',
    headers: req.headers as Record<string, string>,
  })

  const response = await app.fetch(request)

  res.status(response.status)
  response.headers.forEach((value, key) => res.setHeader(key, value))
  res.send(Buffer.from(await response.arrayBuffer()))
}