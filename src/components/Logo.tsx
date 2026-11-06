import { t } from '../i18n'

// Full HomeGenie logo (mascot + wordmark + tagline), transparent PNG, 1000x847.
// The wordmark is part of the artwork, so do not add a separate text label next to it.
const LOGO_ASPECT_RATIO = 1000 / 847

type LogoProps = {
  /** Rendered height in px. Width follows the artwork's aspect ratio. */
  height: number
  alt?: string
  /** Optional responsive overrides, e.g. "h-16 w-auto md:h-[72px]". */
  className?: string
}

export default function Logo({ height, alt = '', className = '' }: LogoProps) {
  return (
    <img
      src="/homegenie-logo.png"
      alt={alt}
      width={Math.round(height * LOGO_ASPECT_RATIO)}
      height={height}
      className={`shrink-0 object-contain ${className}`}
    />
  )
}

// TEMPORARY horizontal lockup: symbol tile + live text wordmark. Replace with a
// genuine horizontal logo file once one exists in /public.
export function BrandLockup({ className = '' }: { className?: string }) {
  const name = t('common.brandName')
  const split = name.startsWith('Home') ? 4 : name.length
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <LogoMark size={40} className="h-10 w-10 rounded-xl" />
      <span className="whitespace-nowrap text-xl font-bold leading-none tracking-tight">
        <span className="text-text-primary">{name.slice(0, split)}</span>
        <span className="text-primary">{name.slice(split)}</span>
      </span>
    </span>
  )
}

type LogoMarkProps = {
  /** Rendered width and height in px (the app icon is square). */
  size: number
  alt?: string
  className?: string
}

// Square app icon (mascot on a rounded navy tile) for small placements.
export function LogoMark({ size, alt = '', className = '' }: LogoMarkProps) {
  return (
    <img
      src="/icon-192.png"
      alt={alt}
      width={size}
      height={size}
      className={`shrink-0 object-contain ${className}`}
    />
  )
}
