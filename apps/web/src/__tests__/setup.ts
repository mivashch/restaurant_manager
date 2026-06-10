import '@testing-library/jest-dom/vitest'

vi.stubGlobal('import.meta.env', {
  VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
  VITE_SUPABASE_ANON_KEY: 'test-anon-key',
})
