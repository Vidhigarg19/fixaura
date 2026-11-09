import { Suspense } from 'react'
import { FixtureBanner } from '../config/devFixtures'

interface FixtureBannerSlotProps {
  /** The fixture name shown in the banner. */
  name: string
}

/**
 * DEV-ONLY banner that marks a screen as showing test data.
 * In a production build `FixtureBanner` is `null` (see config/devFixtures.ts), so this renders
 * nothing and the fixture code is not part of the bundle. Callers decide WHEN a fixture is
 * active (for example `source.isFixture`) and pass the name.
 */
export default function FixtureBannerSlot({ name }: FixtureBannerSlotProps) {
  if (!FixtureBanner) return null
  return (
    <Suspense fallback={null}>
      <FixtureBanner name={name} />
    </Suspense>
  )
}
