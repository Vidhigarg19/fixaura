import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { renderAppAt } from './helpers/renderApp'
import { resetSupabaseMock, setSignedInUser, TEST_USER } from './helpers/supabaseMock'

vi.mock('../src/lib/supabase', async () => ({ supabase: (await import('./helpers/supabaseMock')).supabase }))
vi.mock('../src/lib/test-supabase', () => ({ testSupabaseConnection: vi.fn(async () => true) }))
vi.mock('../src/utils/fixtureGate', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/utils/fixtureGate')>()),
  readFixtureName: () => new URLSearchParams(window.location.search).get('fixture'),
}))

describe('route-level fixture banner', () => {
  beforeEach(() => {
    resetSupabaseMock()
    setSignedInUser(TEST_USER)
  })

  it.each(['/tools', '/guide'])('%s shows one accessible banner outside the page content', async (path) => {
    renderAppAt(`${path}?fixture=blocked_emergency`)

    await waitFor(() => {
      const banners = screen
        .getAllByRole('status')
        .filter((status) => status.textContent?.includes('Fixture (test data): blocked_emergency'))
      expect(banners).toHaveLength(1)
      expect(banners[0].closest('main')).toBeNull()
    })
    expect(await screen.findByRole('alert')).toBeTruthy()
  })

  it('does not duplicate the existing in-page banner for a session fixture', async () => {
    renderAppAt('/tools?fixture=session_blocked')

    await waitFor(() => {
      const banners = screen
        .getAllByRole('status')
        .filter((status) => status.textContent?.includes('Fixture (test data): session_blocked'))
      expect(banners).toHaveLength(1)
      expect(banners[0].closest('main')).toBeTruthy()
    })
  })
})
