export type ApiResponse<T> = {
  data: T
  error: null
} | {
  data: null
  error: string
}

export type HealthResponse = {
  status: 'ok'
  timestamp: string
}

export type Role = 'admin' | 'waiter' | 'kitchen' | 'runner'

export type User = {
  id: string
  name: string
  roles: Role[]
}

export type LoginRequest = {
  privateId: string
}

export type LoginResponse = {
  user: User
}