import polygonClipping from 'polygon-clipping'

export type Pt = { x: number; y: number }
export type Coordinate = [number, number]
export type PolygonGeometry = Coordinate[][][]

export function dist(a: Pt, b: Pt) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

export function pointInPoly(pt: Pt, poly: Pt[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const { x: xi, y: yi } = poly[i]
    const { x: xj, y: yj } = poly[j]
    if (
      (yi > pt.y) !== (yj > pt.y) &&
      pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi
    ) {
      inside = !inside
    }
  }
  return inside
}

export function orientation(a: Pt, b: Pt, c: Pt) {
  return (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y)
}

export function onSegment(a: Pt, b: Pt, c: Pt) {
  return (
    Math.min(a.x, c.x) <= b.x &&
    b.x <= Math.max(a.x, c.x) &&
    Math.min(a.y, c.y) <= b.y &&
    b.y <= Math.max(a.y, c.y)
  )
}

export function segmentsIntersect(a1: Pt, a2: Pt, b1: Pt, b2: Pt) {
  const o1 = orientation(a1, a2, b1)
  const o2 = orientation(a1, a2, b2)
  const o3 = orientation(b1, b2, a1)
  const o4 = orientation(b1, b2, a2)

  if (o1 * o2 < 0 && o3 * o4 < 0) return true

  if (o1 === 0 && onSegment(a1, b1, a2)) return true
  if (o2 === 0 && onSegment(a1, b2, a2)) return true
  if (o3 === 0 && onSegment(b1, a1, b2)) return true
  if (o4 === 0 && onSegment(b1, a2, b2)) return true

  return false
}

export function polygonEdgesIntersect(a: Pt[], b: Pt[]) {
  for (let i = 0; i < a.length; i++) {
    const a1 = a[i]
    const a2 = a[(i + 1) % a.length]
    for (let j = 0; j < b.length; j++) {
      const b1 = b[j]
      const b2 = b[(j + 1) % b.length]
      if (segmentsIntersect(a1, a2, b1, b2)) return true
    }
  }
  return false
}

export function roomsTouchOrOverlap(a: Pt[], b: Pt[]) {
  return (
    a.some(p => pointInPoly(p, b)) ||
    b.some(p => pointInPoly(p, a)) ||
    polygonEdgesIntersect(a, b)
  )
}

export function mergePolygons(a: Pt[], b: Pt[]): Pt[] {
  const polyA: PolygonGeometry = [
    [a.map((p): Coordinate => [p.x, p.y])],
  ]
  const polyB: PolygonGeometry = [
    [b.map((p): Coordinate => [p.x, p.y])],
  ]
  const result = polygonClipping.union(polyA, polyB)
  const merged = result?.[0]?.[0]
  if (!merged) return a
  return merged.map(point => ({ x: point[0], y: point[1] }))
}

export function uid() {
  return Math.random().toString(36).slice(2, 9)
}
