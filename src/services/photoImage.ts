export interface CapturedPhoto {
  blob: Blob
  dataUrl: string
}

export const MAX_IMAGE_SIDE = 1280

export function imageDimensions(width: number, height: number) {
  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(width, height))
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  }
}

export function createPhotoFromCanvas(canvas: HTMLCanvasElement): Promise<CapturedPhoto> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Unable to create an image from the photo.'))
        return
      }
      resolve({ blob, dataUrl: canvas.toDataURL('image/jpeg', 0.85) })
    }, 'image/jpeg', 0.85)
  })
}

export async function createPhotoFromFile(file: File): Promise<CapturedPhoto> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Unsupported image file.')
  }

  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error('Unable to load uploaded image.'))
      image.src = url
    })
    const dimensions = imageDimensions(image.naturalWidth, image.naturalHeight)
    if (!dimensions.width || !dimensions.height) {
      throw new Error('Uploaded image has invalid dimensions.')
    }
    const canvas = document.createElement('canvas')
    canvas.width = dimensions.width
    canvas.height = dimensions.height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Canvas rendering is unavailable.')
    context.drawImage(image, 0, 0, dimensions.width, dimensions.height)
    return await createPhotoFromCanvas(canvas)
  } finally {
    URL.revokeObjectURL(url)
  }
}

export function stopMediaTracks(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop())
}
