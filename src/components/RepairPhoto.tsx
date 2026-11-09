import { useSyncExternalStore, type ReactNode } from 'react'
import { getLocale, subscribeLocale, t } from '../i18n'
import type { ResolvedMedia } from '../utils/useResolvedMedia'

interface RepairPhotoProps {
  /** The image for this specific step, when it has one. */
  stepMedia?: ResolvedMedia
  /** The repair's own photo, used when the step has no image or it fails to load. */
  sessionMedia: ResolvedMedia
  /** Overlays drawn on top (AR marks, gradients). */
  children?: ReactNode
  className?: string
  aspectClass?: string
}

// The picture at the top of the guide and checklist. It always shows something useful:
//   1. the step's own image, if it has one and it loads;
//   2. otherwise the repair's own photo;
//   3. while a private photo is being signed, a quiet loading state;
//   4. otherwise a clean appliance illustration (never an empty box).
export default function RepairPhoto({
  stepMedia,
  sessionMedia,
  children,
  className = '',
  aspectClass = 'aspect-video',
}: RepairPhotoProps) {
  useSyncExternalStore(subscribeLocale, getLocale)

  const active =
    stepMedia?.status === 'ready' && stepMedia.src
      ? stepMedia
      : sessionMedia.status === 'ready' && sessionMedia.src
        ? sessionMedia
        : null
  const loading =
    active === null &&
    (stepMedia?.status === 'loading' || sessionMedia.status === 'loading')

  return (
    <div className={`relative ${aspectClass} overflow-hidden rounded-xl bg-surface-high ${className}`}>
      {active && active.src ? (
        // Full-resolution original (signed URLs carry no resize transform), drawn at full
        // strength with object-cover. image-rendering stays at the browser default: its
        // smooth resampling is correct for photos, whereas crisp-edges / pixelated are
        // meant for pixel art and would make a photo look jagged.
        <img
          key={active.src}
          src={active.src}
          alt={t('guide.photoAlt')}
          decoding="async"
          fetchPriority="high"
          draggable={false}
          onError={active.onError}
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : loading ? (
        <div role="status" className="absolute inset-0 animate-pulse bg-surface-high">
          <span className="sr-only">{t('common.loading')}</span>
        </div>
      ) : (
        <ApplianceIllustration />
      )}
      {children}
    </div>
  )
}

function ApplianceIllustration() {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-text-subtle">
      <svg
        role="img"
        aria-label={t('guide.photoPlaceholderAlt')}
        viewBox="0 0 130 96"
        className="h-20 w-28"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="22" y="8" width="56" height="80" rx="8" />
        <line x1="22" y1="26" x2="78" y2="26" />
        <circle cx="34" cy="17" r="2.5" />
        <circle cx="44" cy="17" r="2.5" />
        <circle cx="50" cy="58" r="17" />
        <circle cx="50" cy="58" r="8" />
        <circle cx="106" cy="30" r="9" />
        <line x1="100" y1="37" x2="88" y2="62" />
      </svg>
      <p className="px-6 text-center text-xs">{t('guide.photoPlaceholder')}</p>
    </div>
  )
}
