import type {
  DiagnosisResult,
  RepairVerification,
} from '../types/repair'

import { supabase } from '../lib/supabase'
import { AnalysisError } from '../types/analysis'
import {
  diagnosisFromEnvelope,
  errorFromEnvelope,
  verificationFromEnvelope,
} from './analysisContract'

const supportedImageTypes = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
])

const MAX_IMAGE_BYTES = 5 * 1024 * 1024

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function invocationError(error: unknown): AnalysisError {
  const context = isRecord(error) ? error.context : undefined
  if (context instanceof Response) {
    const status = context.status
    return status === 401
      ? new AnalysisError('unauthenticated', false)
      : status === 403
        ? new AnalysisError('forbidden', false)
        : status === 429
          ? new AnalysisError('rate_limited', true)
          : status === 400
            ? new AnalysisError('invalid_input', false)
            : new AnalysisError('service_unavailable', true)
  }
  return new AnalysisError('service_unavailable', true)
}

async function invocationErrorWithContract(error: unknown): Promise<AnalysisError> {
  const context = isRecord(error) ? error.context : undefined
  if (context instanceof Response) {
    if (context.status === 401) {
      return new AnalysisError('unauthenticated', false)
    }
    try {
      const contractError = errorFromEnvelope(await context.clone().json())
      if (contractError) return contractError
    } catch {
      // Fall back to the HTTP status when the gateway body is not valid JSON.
    }
  }
  return invocationError(error)
}

// Convert image into Base64
export async function imageToBase64(blob: Blob): Promise<string> {
  if (blob.size === 0) {
    throw new Error('The selected image is empty.')
  }

  if (blob.size > MAX_IMAGE_BYTES) {
    throw new Error('Use an image smaller than 5 MB.')
  }

  if (!supportedImageTypes.has(blob.type.toLowerCase())) {
    throw new Error('Use a JPEG, PNG, or WebP image.')
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onloadend = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('The selected image could not be read.'))
        return
      }

      const result = reader.result
      const base64 = result.includes(',')
        ? result.split(',')[1]
        : result

      resolve(base64)
    }

    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

// Real AI image diagnosis
export async function analyzeImage(
  imageBlob: Blob,
  description: string
): Promise<DiagnosisResult> {
  if (!supabase) {
    throw new AnalysisError('configuration_error', false)
  }

  if (!description.trim() || description.length > 500) {
    throw new AnalysisError('invalid_input', false)
  }

  const base64 = await imageToBase64(imageBlob)
  const mediaType = imageBlob.type.toLowerCase()

  let response
  try {
    response = await supabase.functions.invoke(
      'analyze-image',
      {
        body: {
          imageBase64: base64,
          mediaType,
          description,
        },
      }
    )
  } catch {
    throw new AnalysisError('service_unavailable', true)
  }

  const { data, error } = response
  if (error) throw await invocationErrorWithContract(error)
  if (!data) throw new AnalysisError('invalid_response', true)

  return diagnosisFromEnvelope(data)
}

// Repair verification parameters
export interface VerifyRepairParams {
  afterImage: Blob | string
  beforeImage?: Blob | string | null
  issueName: string
  description: string
  stepsSummary: string
  locale: string
  note?: string
}

interface EncodedImage {
  imageBase64: string
  mediaType: string
}

async function resolveImage(
  image: Blob | string | null | undefined
): Promise<EncodedImage | undefined> {
  if (!image) return undefined

  if (typeof image === 'string') {
    const match = image.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/i)
    if (!match) throw new AnalysisError('invalid_input', false)
    return { mediaType: match[1].toLowerCase(), imageBase64: match[2] }
  }

  return {
    mediaType: image.type.toLowerCase(),
    imageBase64: await imageToBase64(image),
  }
}

export async function verifyRepair(
  params: VerifyRepairParams
): Promise<RepairVerification> {
  // Direct service-level offline check for verify as well
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new Error('You are offline. Please connect to the internet and try again.')
  }

  if (!supabase) {
    throw new AnalysisError('configuration_error', false)
  }

  const afterImage = await resolveImage(params.afterImage)
  const beforeImage = await resolveImage(params.beforeImage)

  if (!afterImage) {
    throw new AnalysisError('invalid_input', false)
  }

  let response
  try {
    response = await supabase.functions.invoke(
      'analyze-image',
      {
        body: {
          mode: 'verify',
          afterImage,
          beforeImage,
          issueName: params.issueName,
          description: params.description,
          stepsSummary: params.stepsSummary,
          locale: params.locale,
          note: params.note,
        },
      }
    )
  } catch (error) {
    throw invocationError(error)
  }
  const { data, error } = response

  if (error) {
    throw await invocationErrorWithContract(error)
  }
  return verificationFromEnvelope(data)
}