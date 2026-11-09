// S06 — Durable Repair Session and Progress
//
// Authoritative read layer. The Supabase `repair_sessions` row (plus its
// `repair_step_progress` children) is the single source of truth for an active
// repair. This module fetches and maps that DB state into the frontend
// `RepairSession` shape. It NEVER fabricates a diagnosis or steps: if the DB
// row lacks usable data, callers get a structured "needs recapture" result
// instead of a half-built session.
//
// Authorization: every query is scoped by `user_id = auth.uid()` (and RLS
// enforces the same on the server). The client filter is defensive, not the
// only guard.

import type {
  DiagnosisResult,
  RepairSession,
  RepairStatus,
  RepairStep,
} from '../types/repair'
import { supabase } from '../lib/supabase'
import { isValidDiagnosisResult } from './repairSession'

// The columns the authoritative row carries. Mirrors expected-schema.json.
const SESSION_SELECT =
  'id, user_id, appliance_id, diagnosis_id, title, description, issue_name, diagnosis, steps, current_step, status, image_path, created_at, updated_at, completed_at'

interface RepairSessionRow {
  id?: string
  user_id?: string
  appliance_id?: string | null
  diagnosis_id?: string | null
  title?: string | null
  description?: string | null
  issue_name?: string | null
  diagnosis?: unknown
  steps?: unknown
  current_step?: number | null
  status?: string | null
  image_path?: string | null
  created_at?: string | null
  updated_at?: string | null
  completed_at?: string | null
}

export interface StepProgressEntry {
  stepId: string
  status: 'in_progress' | 'completed'
  updatedAt: string | null
}

/** Outcome of an authoritative rehydration attempt. */
export type RehydrateResult =
  | { kind: 'none' }
  | { kind: 'unauthenticated' }
  | { kind: 'needs_recapture'; reason: string; sessionId: string }
  | {
      kind: 'ready'
      sessionId: string
      diagnosisId: string | null
      applianceId: string | null
      status: RepairStatus
      session: Pick<
        RepairSession,
        'diagnosis' | 'description' | 'steps' | 'currentStep'
      > & { imagePath: string | null }
      stepProgress: StepProgressEntry[]
    }

async function getUserId(): Promise<string | null> {
  if (!supabase) return null
  const { data, error } = await supabase.auth.getUser()
  if (error) throw new Error(`Unable to verify your account: ${error.message}`)
  return data.user?.id ?? null
}

function toStatus(value: unknown): RepairStatus {
  return value === 'completed' ? 'completed' : 'in_progress'
}

function toSteps(value: unknown): RepairStep[] {
  // Only accept an array of plausibly-shaped steps. Anything else -> [] (no fabrication).
  if (!Array.isArray(value)) return []
  return value.filter(
    (s): s is RepairStep =>
      Boolean(s) &&
      typeof s === 'object' &&
      typeof (s as RepairStep).id === 'string' &&
      typeof (s as RepairStep).title === 'string' &&
      typeof (s as RepairStep).instruction === 'string'
  )
}

function clampStep(value: unknown, stepCount: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return 0
  const max = stepCount > 0 ? stepCount - 1 : 0
  return Math.min(Math.floor(value), max)
}

/**
 * Loads the user's latest active (in_progress) repair session from the DB.
 * Returns the most recently updated row, matching the
 * `(user_id, updated_at desc)` index.
 */
export async function getActiveRepairSession(): Promise<RehydrateResult> {
  if (!supabase) return { kind: 'none' }
  const userId = await getUserId()
  if (!userId) return { kind: 'unauthenticated' }

  const { data, error } = await supabase
    .from('repair_sessions')
    .select(SESSION_SELECT)
    .eq('user_id', userId)
    .eq('status', 'in_progress')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw new Error(`Unable to load your active repair: ${error.message}`)
  if (!data) return { kind: 'none' }
  return mapRow(data as RepairSessionRow, userId)
}

/**
 * Loads a specific repair session by id, scoped to the authenticated user.
 * Used to cross-verify a cached `repairSessionId` against the DB.
 */
export async function getRepairSessionById(
  repairSessionId: string
): Promise<RehydrateResult> {
  if (!supabase) return { kind: 'none' }
  const userId = await getUserId()
  if (!userId) return { kind: 'unauthenticated' }

  const { data, error } = await supabase
    .from('repair_sessions')
    .select(SESSION_SELECT)
    .eq('id', repairSessionId)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw new Error(`Unable to load this repair: ${error.message}`)
  if (!data) return { kind: 'none' }
  return mapRow(data as RepairSessionRow, userId)
}

function mapRow(row: RepairSessionRow, userId: string): RehydrateResult {
  const sessionId = typeof row.id === 'string' ? row.id : ''
  // Defensive: the query already filters by user_id, but never trust a row
  // whose ownership does not match the caller.
  if (!sessionId || row.user_id !== userId) {
    return { kind: 'needs_recapture', reason: 'ownership_mismatch', sessionId }
  }

  const diagnosis = row.diagnosis
  if (!isValidDiagnosisResult(diagnosis)) {
    // The row exists but has no usable diagnosis. Do NOT invent one: the user
    // must recapture rather than see a blank or fake result.
    return { kind: 'needs_recapture', reason: 'diagnosis_missing', sessionId }
  }

  const steps = toSteps(row.steps)
  const currentStep = clampStep(row.current_step, steps.length)

  return {
    kind: 'ready',
    sessionId,
    diagnosisId: typeof row.diagnosis_id === 'string' ? row.diagnosis_id : null,
    applianceId: typeof row.appliance_id === 'string' ? row.appliance_id : null,
    status: toStatus(row.status),
    session: {
      diagnosis: diagnosis as DiagnosisResult,
      description: typeof row.description === 'string' ? row.description : '',
      steps,
      currentStep,
      imagePath: typeof row.image_path === 'string' ? row.image_path : null,
    },
    stepProgress: [],
  }
}

/**
 * Reads per-step completion for a session. Ownership is enforced by RLS (the
 * table has no user_id; the policy joins to repair_sessions.user_id).
 */
export async function loadStepProgress(
  repairSessionId: string
): Promise<StepProgressEntry[]> {
  if (!supabase || !repairSessionId) return []
  const { data, error } = await supabase
    .from('repair_step_progress')
    .select('step_id, status, updated_at')
    .eq('repair_session_id', repairSessionId)
  if (error) throw new Error(`Unable to load repair progress: ${error.message}`)
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    stepId: typeof r.step_id === 'string' ? r.step_id : '',
    status: r.status === 'completed' ? 'completed' : 'in_progress',
    updatedAt: typeof r.updated_at === 'string' ? r.updated_at : null,
  }))
}

/**
 * Commits the current step index to the authoritative row. Returns the server
 * value after the write so the caller can reconcile against the DB.
 */
export async function commitCurrentStep(
  repairSessionId: string,
  stepIndex: number
): Promise<number | null> {
  if (!supabase || !repairSessionId) return null
  const userId = await getUserId()
  if (!userId) return null
  const safeIndex = Number.isFinite(stepIndex) && stepIndex >= 0 ? Math.floor(stepIndex) : 0
  const { data, error } = await supabase
    .from('repair_sessions')
    .update({ current_step: safeIndex })
    .eq('id', repairSessionId)
    .eq('user_id', userId)
    .select('current_step')
    .maybeSingle()
  if (error) throw new Error(`Unable to save repair progress: ${error.message}`)
  const value = (data as { current_step?: unknown } | null)?.current_step
  return typeof value === 'number' ? value : null
}
