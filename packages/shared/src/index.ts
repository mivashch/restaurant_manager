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