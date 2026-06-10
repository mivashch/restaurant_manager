import { describe, it, expect } from 'vitest'
import {
  dist,
  pointInPoly,
  orientation,
  onSegment,
  segmentsIntersect,
  polygonEdgesIntersect,
  roomsTouchOrOverlap,
  mergePolygons,
} from '../geometry'
import type { Pt } from '../geometry'

describe('dist', () => {
  it('calculates Euclidean distance', () => {
    expect(dist({ x: 0, y: 0 }, { x: 3, y: 4 })).toBeCloseTo(5)
  })

  it('returns 0 for same point', () => {
    expect(dist({ x: 5, y: 5 }, { x: 5, y: 5 })).toBe(0)
  })
})

describe('pointInPoly', () => {
  const square: Pt[] = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
  ]

  it('returns true for a point inside', () => {
    expect(pointInPoly({ x: 5, y: 5 }, square)).toBe(true)
  })

  it('returns false for a point outside', () => {
    expect(pointInPoly({ x: 20, y: 5 }, square)).toBe(false)
  })

  it('returns false for a point clearly outside', () => {
    expect(pointInPoly({ x: -1, y: -1 }, square)).toBe(false)
  })

  it('handles a triangle', () => {
    const tri: Pt[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 5, y: 10 },
    ]
    expect(pointInPoly({ x: 5, y: 3 }, tri)).toBe(true)
    expect(pointInPoly({ x: 15, y: 3 }, tri)).toBe(false)
  })
})

describe('orientation', () => {
  it('returns 0 for collinear points', () => {
    expect(orientation({ x: 0, y: 0 }, { x: 5, y: 5 }, { x: 10, y: 10 })).toBe(0)
  })

  it('returns negative for clockwise turn', () => {
    const result = orientation({ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 })
    expect(result).toBeLessThan(0)
  })

  it('returns positive for counter-clockwise turn', () => {
    const result = orientation({ x: 0, y: 0 }, { x: 5, y: 5 }, { x: 5, y: 0 })
    expect(result).toBeGreaterThan(0)
  })
})

describe('onSegment', () => {
  it('returns true when point lies on segment', () => {
    expect(onSegment({ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 10, y: 0 })).toBe(true)
  })

  it('returns false when point is outside segment', () => {
    expect(onSegment({ x: 0, y: 0 }, { x: 15, y: 0 }, { x: 10, y: 0 })).toBe(false)
  })

  it('returns false when point is not collinear', () => {
    expect(onSegment({ x: 0, y: 0 }, { x: 5, y: 5 }, { x: 10, y: 0 })).toBe(false)
  })
})

describe('segmentsIntersect', () => {
  it('detects intersecting segments', () => {
    const result = segmentsIntersect(
      { x: 0, y: 0 }, { x: 10, y: 10 },
      { x: 0, y: 10 }, { x: 10, y: 0 },
    )
    expect(result).toBe(true)
  })

  it('returns false for non-intersecting segments', () => {
    const result = segmentsIntersect(
      { x: 0, y: 0 }, { x: 5, y: 0 },
      { x: 6, y: 0 }, { x: 10, y: 0 },
    )
    expect(result).toBe(false)
  })
})

describe('polygonEdgesIntersect', () => {
  it('detects intersecting polygons', () => {
    const a: Pt[] = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }]
    const b: Pt[] = [{ x: 5, y: 5 }, { x: 15, y: 5 }, { x: 15, y: 15 }, { x: 5, y: 15 }]
    expect(polygonEdgesIntersect(a, b)).toBe(true)
  })

  it('returns false for non-intersecting polygons', () => {
    const a: Pt[] = [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }, { x: 0, y: 5 }]
    const b: Pt[] = [{ x: 10, y: 10 }, { x: 15, y: 10 }, { x: 15, y: 15 }, { x: 10, y: 15 }]
    expect(polygonEdgesIntersect(a, b)).toBe(false)
  })
})

describe('roomsTouchOrOverlap', () => {
  it('returns true when one polygon contains a point of another', () => {
    const a: Pt[] = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }]
    const b: Pt[] = [{ x: 2, y: 2 }, { x: 5, y: 2 }, { x: 5, y: 5 }, { x: 2, y: 5 }]
    expect(roomsTouchOrOverlap(a, b)).toBe(true)
  })

  it('returns false for separated polygons', () => {
    const a: Pt[] = [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }, { x: 0, y: 5 }]
    const b: Pt[] = [{ x: 10, y: 10 }, { x: 15, y: 10 }, { x: 15, y: 15 }, { x: 10, y: 15 }]
    expect(roomsTouchOrOverlap(a, b)).toBe(false)
  })
})

describe('mergePolygons', () => {
  it('merges two overlapping polygons', () => {
    const a: Pt[] = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }]
    const b: Pt[] = [{ x: 5, y: 5 }, { x: 15, y: 5 }, { x: 15, y: 15 }, { x: 5, y: 15 }]
    const merged = mergePolygons(a, b)
    expect(merged.length).toBeGreaterThanOrEqual(6)
    expect(merged.every(p => typeof p.x === 'number' && typeof p.y === 'number')).toBe(true)
  })

  it('returns a valid polygon for non-overlapping shapes', () => {
    const a: Pt[] = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }]
    const b: Pt[] = [{ x: 20, y: 20 }, { x: 30, y: 20 }, { x: 30, y: 30 }, { x: 20, y: 30 }]
    const merged = mergePolygons(a, b)
    expect(merged.length).toBeGreaterThanOrEqual(4)
    expect(merged.every(p => typeof p.x === 'number' && typeof p.y === 'number')).toBe(true)
  })
})
