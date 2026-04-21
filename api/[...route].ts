import type { VercelRequest, VercelResponse } from '@vercel/node'
import app from './app.js'

export const config = {
  runtime: 'nodejs',
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const url = `https://${req.headers.host}${req.url}`
  const method = req.method ?? 'GET'
  const hasBody = method !== 'GET' && method !== 'HEAD'
  const request = new Request(url, {
    method,
    headers: req.headers as Record<string, string>,
    body: hasBody && req.body != null ? JSON.stringify(req.body) : undefined,
  })

  const response = await app.fetch(request)

  res.status(response.status)
  response.headers.forEach((value, key) => res.setHeader(key, value))
  res.send(Buffer.from(await response.arrayBuffer()))
}