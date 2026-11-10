// Limits, timeouts and thresholds. Values are unchanged from where they used to live.
// Some mirror backend limits (description length, image size): do not change them here
// without the backend owner, see docs/ARCHITECTURE.md "Backend contract dependencies".

/** Largest photo the analysis client accepts (bytes). */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024

/** Largest photo accepted for private storage upload (bytes). */
export const MAX_PRIVATE_MEDIA_BYTES = 5 * 1024 * 1024

/** Problem description length limit (characters). The edge function enforces the same 500. */
export const MAX_DESCRIPTION_LENGTH = 500

/** Stored issue title limit (characters). */
export const MAX_ISSUE_NAME_LENGTH = 80

/**
 * D13: stored diagnosis prose (summary, recommended fix, explanation, next-step advice,
 * verification text) limit (characters). Twice the 500 used for descriptions and step
 * instructions, so ordinary results are never cut; a cut ends with "…".
 */
export const MAX_DIAGNOSIS_TEXT_LENGTH = 1000

/** D13: stored tool list limits (items, characters per tool) and verification check label. */
export const MAX_TOOLS = 20
export const MAX_TOOL_LENGTH = 80
export const MAX_CHECK_LABEL_LENGTH = 120

/** Capture description draft limit (characters). */
export const MAX_DRAFT_LENGTH = 500

/** Show the calm "still working" line after this long (ms). */
export const SLOW_REQUEST_MS = 15000

/**
 * How long a page waits for a diagnosis save before offering a retry (ms). Same bound as
 * the nearby search. A save stuck on a read is then abandoned; one stuck on a write is
 * kept (see saveDiagnosisOnce in Pages/Diagnosis.tsx).
 */
export const DIAGNOSIS_SAVE_TIMEOUT_MS = 30000

/** Below this confidence (0 to 100) the low-confidence notice is shown. */
export const CONFIDENCE_THRESHOLD = 70

// ---- Nearby help (OpenStreetMap directory) ----

/** Search radii offered to the user (km). */
export const NEARBY_RADII_KM = [3, 5, 10, 20] as const

/** Upper bound for the whole directory search, including failover (ms). */
export const NEARBY_TOTAL_TIMEOUT_MS = 30000

/** Upper bound for one directory server attempt (ms). */
export const NEARBY_ENDPOINT_TIMEOUT_MS = 18000

/** How long directory results stay in memory (ms). */
export const NEARBY_CACHE_TTL_MS = 2 * 60 * 1000

/** Maximum cached directory searches. */
export const NEARBY_CACHE_MAX_ENTRIES = 10

/** Options for the browser location request. */
export const GEOLOCATION_OPTIONS = {
  enableHighAccuracy: false,
  timeout: 10000,
  maximumAge: 60000,
} as const
