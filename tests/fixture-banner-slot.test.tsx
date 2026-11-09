import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import FixtureBannerSlot from '../src/components/FixtureBannerSlot'
import { SessionFixtureBanner } from '../src/components/SessionPanels'
import { FixtureBanner } from '../src/config/devFixtures'

// The shared dev banner. In a production build it renders nothing; in tests (a dev build)
// it shows which test data a screen uses. Existing screens must keep showing it the same way.

describe('FixtureBannerSlot', () => {
  it('is available in a dev build (tests run as one)', () => {
    expect(FixtureBanner).not.toBeNull()
  })

  it('shows the fixture name as a status message', async () => {
    render(<FixtureBannerSlot name="blocked_emergency" />)
    const banner = await screen.findByRole('status')
    expect(banner.textContent).toContain('blocked_emergency')
    expect(banner.textContent).toContain('nothing is saved')
  })

  it('SessionFixtureBanner shows nothing without a name and the same banner with one', async () => {
    const empty = render(<SessionFixtureBanner name={null} />)
    expect(empty.container.innerHTML).toBe('')
    empty.unmount()

    render(<SessionFixtureBanner name="session_blocked" />)
    const banner = await screen.findByRole('status')
    expect(banner.textContent).toContain('session_blocked')
  })
})
