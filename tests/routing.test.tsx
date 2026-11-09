import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { t } from '../src/i18n'
import { TEST_USER, resetSupabaseMock, setSignedInUser, functionsInvoke } from './helpers/supabaseMock'
import { renderAppAt } from './helpers/renderApp'
import { seedSession } from './helpers/fixtures'

vi.mock('../src/lib/supabase', async () => ({ supabase: (await import('./helpers/supabaseMock')).supabase }))
vi.mock('../src/lib/test-supabase', () => ({ testSupabaseConnection: vi.fn(async () => true) }))

// Characterization of src/App.tsx: what each of the 16 routes does today.
// "lands on" is the path the browser ends up at; "marker" is something visible there.

const heading = (text: string) => screen.findByRole('heading', { name: text })

beforeEach(() => {
  resetSupabaseMock()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('routing: signed out', () => {
  const cases: Array<{
    path: string
    lands: string
    marker: () => Promise<unknown>
  }> = [
    { path: '/login', lands: '/login', marker: () => heading(t('auth.welcomeTitle')) },
    { path: '/auth', lands: '/login', marker: () => heading(t('auth.welcomeTitle')) },
    { path: '/signup', lands: '/signup', marker: () => heading(t('auth.createTitle')) },
    {
      path: '/',
      lands: '/',
      marker: async () => {
        const h1 = await screen.findByRole('heading', { level: 1 })
        expect(h1.textContent).toContain(t('landing.heroLine1'))
      },
    },
    { path: '/capture', lands: '/capture', marker: () => heading(t('capture.loginRequired')) },
    { path: '/camera', lands: '/camera', marker: () => heading(t('capture.loginRequired')) },
    {
      path: '/diagnosis',
      lands: '/diagnosis',
      marker: () => screen.findByRole('link', { name: t('diagnosis.ctaRetake') }),
    },
    { path: '/tools', lands: '/capture', marker: () => heading(t('capture.loginRequired')) },
    { path: '/guide', lands: '/capture', marker: () => heading(t('capture.loginRequired')) },
    { path: '/verify', lands: '/capture', marker: () => heading(t('capture.loginRequired')) },
    { path: '/completed', lands: '/completed', marker: () => screen.findByText(t('completion.notCompleted')) },
    { path: '/dashboard', lands: '/login', marker: () => heading(t('auth.welcomeTitle')) },
    { path: '/diagnosis-history', lands: '/login', marker: () => heading(t('auth.welcomeTitle')) },
    { path: '/nearby-shops', lands: '/login', marker: () => heading(t('auth.welcomeTitle')) },
    { path: '/history', lands: '/login', marker: () => heading(t('auth.welcomeTitle')) },
    {
      path: '/no-such-page',
      lands: '/',
      marker: async () => {
        const h1 = await screen.findByRole('heading', { level: 1 })
        expect(h1.textContent).toContain(t('landing.heroLine1'))
      },
    },
  ]

  it.each(cases)('$path -> $lands', async ({ path, lands, marker }) => {
    renderAppAt(path)
    await marker()
    await waitFor(() => expect(window.location.pathname).toBe(lands))
  })

  it('covers all 16 routes defined in App.tsx', () => {
    expect(cases).toHaveLength(16)
  })
})

describe('routing: signed in', () => {
  beforeEach(() => {
    setSignedInUser(TEST_USER)
  })

  it('/login sends a signed-in user to /dashboard', async () => {
    renderAppAt('/login')
    await heading(t('dashboard.title'))
    expect(window.location.pathname).toBe('/dashboard')
  })

  it('/dashboard renders the dashboard with the three links', async () => {
    renderAppAt('/dashboard')
    await heading(t('dashboard.title'))
    for (const key of ['dashboard.startDiagnosis', 'dashboard.repairHistory', 'dashboard.diagnosisHistory']) {
      expect(screen.getByText(t(key))).toBeTruthy()
    }
  })

  it('/diagnosis-history renders its empty state', async () => {
    renderAppAt('/diagnosis-history')
    await heading(t('diagnosisHistory.title'))
    expect(await screen.findByText(t('diagnosisHistory.empty'))).toBeTruthy()
  })

  it('/history renders the repair history page', async () => {
    renderAppAt('/history')
    await heading(t('history.title'))
    expect(window.location.pathname).toBe('/history')
  })

  it('/nearby-shops without a valid diagnosis session redirects to /dashboard', async () => {
    renderAppAt('/nearby-shops')
    await heading(t('dashboard.title'))
    expect(window.location.pathname).toBe('/dashboard')
  })

  it('/nearby-shops with a valid diagnosis session renders the page', async () => {
    seedSession()
    renderAppAt('/nearby-shops')
    await heading(t('nearby.title'))
    expect(window.location.pathname).toBe('/nearby-shops')
  })

  it('no route sends a request to an edge function', async () => {
    renderAppAt('/dashboard')
    await heading(t('dashboard.title'))
    expect(functionsInvoke).not.toHaveBeenCalled()
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })
})

