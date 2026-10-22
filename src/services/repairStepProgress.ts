import { supabase } from '../lib/supabase'
import { t } from '../i18n'

export async function saveCompletedRepairStep(
  repairSessionId: string | undefined,
  stepId: string
): Promise<void> {
  if (!repairSessionId) {
    throw new Error(t('guide.progressSessionMissing'))
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    if (authError) console.error('Repair progress authentication failed:', authError)
    throw new Error(t('guide.progressAuthRequired'))
  }

  const { data: ownedSession, error: sessionError } = await supabase
    .from('repair_sessions')
    .select('id')
    .eq('id', repairSessionId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (sessionError) {
    console.error('Repair session ownership check failed:', sessionError.code)
    throw new Error(t('guide.progressSaveError'))
  }
  if (!ownedSession) {
    throw new Error(t('guide.progressSessionUnavailable'))
  }

  const { error: progressError } = await supabase
    .from('repair_step_progress')
    .upsert(
      {
        repair_session_id: repairSessionId,
        step_id: stepId,
        status: 'completed',
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: 'repair_session_id,step_id',
        defaultToNull: false,
      }
    )

  if (progressError) {
    console.error('Repair step progress save failed:', progressError)
    throw new Error(t('guide.progressSaveError'))
  }
}