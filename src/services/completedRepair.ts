import { supabase } from '../lib/supabase'
import { t } from '../i18n'

interface CompletedRepairRow {
  id: string
  user_id: string
  diagnosis_id: string
  repair_summary: string | null
  completed_at: string
  feedback_rating: number | null
}

export interface CompletedRepairRecord {
  id: string
  diagnosisId: string
  repairSummary: string | null
  completedAt: string
  feedbackRating: number | null
}

const completionSelect =
  'id, user_id, diagnosis_id, repair_summary, completed_at, feedback_rating'

function toCompletionRecord(row: CompletedRepairRow): CompletedRepairRecord {
  return {
    id: row.id,
    diagnosisId: row.diagnosis_id,
    repairSummary: row.repair_summary,
    completedAt: row.completed_at,
    feedbackRating: row.feedback_rating,
  }
}

function buildRepairSummary(issueTitle: string, diagnosisResult: unknown): string {
  if (!diagnosisResult || typeof diagnosisResult !== 'object') return issueTitle

  const result = diagnosisResult as Record<string, unknown>
  const recommendedFix =
    typeof result.recommendedFix === 'string' ? result.recommendedFix.trim() : ''

  return recommendedFix ? `${issueTitle}\n\n${recommendedFix}` : issueTitle
}

export async function persistCompletedRepair(
  repairSessionId: string | undefined,
  diagnosisId: string | undefined
): Promise<CompletedRepairRecord> {
  if (!repairSessionId || !diagnosisId) {
    throw new Error(t('completion.sessionMissing'))
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    if (authError) console.error('Completion authentication failed:', authError.code)
    throw new Error(t('completion.authRequired'))
  }

  const { data: ownedSession, error: sessionError } = await supabase
    .from('repair_sessions')
    .select('id, user_id, diagnosis_id')
    .eq('id', repairSessionId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (sessionError) {
    console.error('Completion session verification failed:', sessionError.code)
    throw new Error(t('completion.saveError'))
  }
  if (!ownedSession || ownedSession.diagnosis_id !== diagnosisId) {
    throw new Error(t('completion.sessionUnavailable'))
  }

  const { data: diagnosis, error: diagnosisError } = await supabase
    .from('diagnoses')
    .select('id, issue_title, diagnosis_result')
    .eq('id', diagnosisId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (diagnosisError) {
    console.error('Completion diagnosis verification failed:', diagnosisError.code)
    throw new Error(t('completion.saveError'))
  }
  if (!diagnosis) throw new Error(t('completion.sessionUnavailable'))

  const { data: existing, error: lookupError } = await supabase
    .from('completed_repairs')
    .select(completionSelect)
    .eq('user_id', user.id)
    .eq('diagnosis_id', diagnosisId)
    .maybeSingle()

  if (lookupError) {
    console.error('Existing completion lookup failed:', lookupError.code)
    throw new Error(t('completion.saveError'))
  }

  let completion = existing as CompletedRepairRow | null

  if (!completion) {
    const { data: inserted, error: insertError } = await supabase
      .from('completed_repairs')
      .insert({
        user_id: user.id,
        diagnosis_id: diagnosisId,
        repair_summary: buildRepairSummary(diagnosis.issue_title, diagnosis.diagnosis_result),
      })
      .select(completionSelect)
      .single()

    if (insertError?.code === '23505') {
      const { data: racedCompletion, error: retryLookupError } = await supabase
        .from('completed_repairs')
        .select(completionSelect)
        .eq('user_id', user.id)
        .eq('diagnosis_id', diagnosisId)
        .maybeSingle()

      if (retryLookupError || !racedCompletion) {
        console.error('Completion retry lookup failed:', retryLookupError?.code)
        throw new Error(t('completion.saveError'))
      }
      completion = racedCompletion as CompletedRepairRow
    } else if (insertError || !inserted) {
      console.error('Completed repair insert failed:', insertError?.code)
      throw new Error(t('completion.saveError'))
    } else {
      completion = inserted as CompletedRepairRow
    }
  }

  if (completion.user_id !== user.id || completion.diagnosis_id !== diagnosisId) {
    throw new Error(t('completion.sessionUnavailable'))
  }

  const { data: updatedSession, error: updateError } = await supabase
    .from('repair_sessions')
    .update({ status: 'completed', completed_at: completion.completed_at })
    .eq('id', repairSessionId)
    .eq('user_id', user.id)
    .eq('diagnosis_id', diagnosisId)
    .select('id')
    .maybeSingle()

  if (updateError || !updatedSession) {
    console.error('Repair session completion update failed:', updateError?.code)
    throw new Error(t('completion.saveError'))
  }

  return toCompletionRecord(completion)
}