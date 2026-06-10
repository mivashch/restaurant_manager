// @vitest-environment node
import { describe, it, expect } from 'vitest'
import type {
  ApiResponse,
  HealthResponse,
  Role,
  User,
  LoginRequest,
  LoginResponse,
} from '../src/index.js'

describe('shared types', () => {
  it('ApiResponse success shape is valid', () => {
    const res: ApiResponse<string> = { data: 'hello', error: null }
    expect(res.data).toBe('hello')
    expect(res.error).toBeNull()
  })

  it('ApiResponse error shape is valid', () => {
    const res: ApiResponse<string> = { data: null, error: 'oops' }
    expect(res.data).toBeNull()
    expect(res.error).toBe('oops')
  })

  it('HealthResponse shape is valid', () => {
    const h: HealthResponse = { status: 'ok', timestamp: new Date().toISOString() }
    expect(h.status).toBe('ok')
    expect(h.timestamp).toBeTruthy()
  })

  it('Role is one of the valid values', () => {
    const roles: Role[] = ['admin', 'waiter', 'kitchen', 'superadmin']
    expect(roles).toHaveLength(4)
    expect(roles).toContain('admin')
    expect(roles).toContain('superadmin')
  })

  it('User shape is valid', () => {
    const u: User = { id: '1', name: 'Alice', roles: ['waiter', 'kitchen'] }
    expect(u.id).toBe('1')
    expect(u.name).toBe('Alice')
    expect(u.roles).toHaveLength(2)
  })

  it('LoginRequest shape is valid', () => {
    const req: LoginRequest = { privateId: 'WAITER-001' }
    expect(req.privateId).toBe('WAITER-001')
  })

  it('LoginResponse shape is valid', () => {
    const user: User = { id: '1', name: 'Alice', roles: ['waiter'] }
    const res: LoginResponse = { user }
    expect(res.user.name).toBe('Alice')
  })
})
