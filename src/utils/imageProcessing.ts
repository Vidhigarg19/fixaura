import {
  JPEG_QUALITY,
  MAX_IMAGE_SIDE,
  MAX_OUTPUT_BYTES,
  MAX_PIXELS,
  fitWithin,
  validateImageFile,
  type ImageProblem,
} from './captureValidation'

export class ImageProcessingError extends Error {
  readonly problem: ImageProblem

  constructor(problem: ImageProblem) {
    super(problem)
    this.name = 'ImageProcessingError'
    this.problem = problem
  }
}

export interface ProcessedImage {
  blob: Blob
  dataUrl: string
}

interface DecodedImage {
  source: CanvasImageSource
  width: number
  height: number
  release: () => void
}

async function decodeImage(file: File): Promise<DecodedImage> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        release: () => bitmap.close(),
      }
    } catch {
      // Fall back to an <img> element below.
    }
  }

  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new ImageProcessingError('decode'))
      image.src = url
    })
    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      release: () => URL.revokeObjectURL(url),
    }
  } catch (error) {
    URL.revokeObjectURL(url)
    throw error instanceof ImageProcessingError ? error : new ImageProcessingError('decode')
  }
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new ImageProcessingError('decode'))),
      'image/jpeg',
      JPEG_QUALITY
    )
  })
}

/**
 * Validates, decodes, scales to at most 1280 px on the longest side and re-encodes as
 * JPEG (about 0.85). Re-drawing through a canvas also drops EXIF metadata.
 */
export async function processImageFile(file: File): Promise<ProcessedImage> {
  const problem = validateImageFile(file)
  if (problem) throw new ImageProcessingError(problem)

  const decoded = await decodeImage(file)
  try {
    if (decoded.width <= 0 || decoded.height <= 0) throw new ImageProcessingError('decode')
    if (decoded.width * decoded.height > MAX_PIXELS) throw new ImageProcessingError('too_large')

    const { width, height } = fitWithin(decoded.width, decoded.height, MAX_IMAGE_SIDE)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) throw new ImageProcessingError('decode')
    // JPEG has no transparency: paint white first so transparent PNGs do not turn black.
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, width, height)
    context.drawImage(decoded.source, 0, 0, width, height)

    const blob = await canvasToBlob(canvas)
    if (blob.size > MAX_OUTPUT_BYTES) throw new ImageProcessingError('too_large')
    return { blob, dataUrl: canvas.toDataURL('image/jpeg', JPEG_QUALITY) }
  } finally {
    decoded.release()
  }
}
