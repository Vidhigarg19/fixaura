// Pure validation helpers for the capture page (no DOM, easy to test).
import { MAX_DESCRIPTION_LENGTH } from '../config/limits'

export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
export const MAX_INPUT_BYTES = 10 * 1024 * 1024
/** Matches the cap enforced by the analysis service client (5 MB). */
export const MAX_OUTPUT_BYTES = 5 * 1024 * 1024
export const MAX_IMAGE_SIDE = 1280
export const JPEG_QUALITY = 0.85
/** Guards against decoding absurdly large images. */
export const MAX_PIXELS = 100_000_000

export const MIN_DESCRIPTION_LENGTH = 10
export { MAX_DESCRIPTION_LENGTH }

export type ImageProblem = 'empty' | 'type' | 'too_large' | 'decode'

export const IMAGE_PROBLEM_KEYS: Record<ImageProblem, string> = {
  empty: 'capture.photoProcessingError',
  type: 'capture.unsupportedImage',
  too_large: 'capture.imageTooLarge',
  decode: 'capture.photoProcessingError',
}

export function validateImageFile(file: { type: string; size: number }): ImageProblem | null {
  if (!(ALLOWED_IMAGE_TYPES as readonly string[]).includes(file.type.toLowerCase())) return 'type'
  if (file.size <= 0) return 'empty'
  if (file.size > MAX_INPUT_BYTES) return 'too_large'
  return null
}

/** Scales so the longest side is at most maxSide. Never upscales. */
export function fitWithin(
  width: number,
  height: number,
  maxSide: number = MAX_IMAGE_SIDE
): { width: number; height: number } {
  const longest = Math.max(width, height)
  const scale = longest > 0 ? Math.min(1, maxSide / longest) : 1
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

export type DescriptionProblem = 'too_short' | 'too_long'

export function validateDescription(text: string): DescriptionProblem | null {
  if (text.trim().length < MIN_DESCRIPTION_LENGTH) return 'too_short'
  if (text.length > MAX_DESCRIPTION_LENGTH) return 'too_long'
  return null
}
