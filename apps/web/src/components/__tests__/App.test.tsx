import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../../App'

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('App', () => {
  it('renders the sign-in screen when no user is stored', () => {
    render(<App />)
    expect(screen.getByText('Sign in')).toBeDefined()
    expect(screen.getByPlaceholderText('Enter your private ID')).toBeDefined()
  })

  it('shows the role selection screen after successful login', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        data: {
          user: { id: '1', name: 'WAITER-001', roles: ['waiter', 'kitchen'] },
        },
        error: null,
      }),
    })
    vi.stubGlobal('fetch', mockFetch)

    render(<App />)

    const input = screen.getByPlaceholderText('Enter your private ID')
    const button = screen.getByText('Continue')

    await userEvent.type(input, 'WAITER-001')
    await userEvent.click(button)

    await waitFor(() => {
      expect(screen.getByText('Choose role')).toBeDefined()
    })

    expect(screen.getByText('Waiter')).toBeDefined()
    expect(screen.getByText('Kitchen')).toBeDefined()
    expect(screen.getByText('Admin')).toBeDefined()
  })

  it('shows error on failed login', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ data: null, error: 'Invalid Private ID' }),
    })
    vi.stubGlobal('fetch', mockFetch)

    render(<App />)

    const input = screen.getByPlaceholderText('Enter your private ID')
    const button = screen.getByText('Continue')

    await userEvent.type(input, 'INVALID')
    await userEvent.click(button)

    await waitFor(() => {
      expect(screen.getByText('Invalid Private ID')).toBeDefined()
    })
  })

  it('restores user session from localStorage', () => {
    localStorage.setItem('rm_user', JSON.stringify({
      id: '1', name: 'WAITER-001', roles: ['waiter'],
    }))

    render(<App />)
    expect(screen.getByText('Choose role')).toBeDefined()
    expect(screen.getByText('Welcome, WAITER-001')).toBeDefined()
  })

  it('shows logout button when user is logged in', () => {
    localStorage.setItem('rm_user', JSON.stringify({
      id: '1', name: 'ADMIN-001', roles: ['admin'],
    }))

    render(<App />)
    expect(screen.getByText('Sign out')).toBeDefined()
  })
})
