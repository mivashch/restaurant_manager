import type { Pt } from './geometry'

export type CartItem = { id: number; name: string; price: number; quantity: number }

export function parseCartItems(raw: string | null): CartItem[] {
  if (!raw) return []
  try { return JSON.parse(raw) } catch { return [] }
}

export function formatTime(value: string) {
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export type KitchenOrder = {
  order_id: number
  table_id?: number | null
  items?: string | null
  status: string
  created_at: string
  item_name?: string | null
  quantity?: number | null
  ordered_by?: string | null
  restaurant_tables?: { table_number?: number | null } | null
}

export function formatItems(order: KitchenOrder) {
  if (order.item_name) {
    return `${order.item_name}${order.quantity ? ` × ${order.quantity}` : ''}`
  }
  if (!order.items) {
    return 'No items'
  }
  try {
    const parsed = JSON.parse(order.items)
    if (Array.isArray(parsed)) {
      return parsed
        .map((item: Record<string, unknown>) => {
          const name = item.name ?? item.item_name ?? item.title ?? 'Item'
          const quantity = item.quantity ?? item.qty ?? 1
          return `${name} × ${quantity}`
        })
        .join('\n')
    }
    return typeof parsed === 'string' ? parsed : JSON.stringify(parsed)
  } catch {
    return order.items
  }
}

export function fitViewBox(
  plan: { rooms: Array<{ vertices: Pt[] }>; tables: Array<{ x: number; y: number }> },
  svgWidth = 1000,
  svgHeight = 650,
  tableRadius = 18,
) {
  const pts = [
    ...plan.tables.map(t => ({ x: t.x, y: t.y })),
    ...plan.rooms.flatMap(r => r.vertices),
  ]
  if (!pts.length) return `0 0 ${svgWidth} ${svgHeight}`
  const pad = 48
  const minX = Math.min(...pts.map(p => p.x)) - pad - tableRadius
  const minY = Math.min(...pts.map(p => p.y)) - pad - tableRadius
  const maxX = Math.max(...pts.map(p => p.x)) + pad + tableRadius
  const maxY = Math.max(...pts.map(p => p.y)) + pad + tableRadius
  return `${minX} ${minY} ${maxX - minX} ${maxY - minY}`
}
