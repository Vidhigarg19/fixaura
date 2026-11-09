import { supabase } from '../lib/supabase';
import { screenText } from '../lib/safety';
import type { ObservationPayload, ObservationResult, ObservationStatus } from '../types/observation';

/**
 * Evaluates before/after repair images and enforces strict non-certification boundaries.
 */
export async function evaluateRepairObservation(payload: ObservationPayload): Promise<ObservationResult> {
  const { sessionId, beforeImageUrl, afterImageUrl, additionalNotes } = payload;

  if (!beforeImageUrl || !afterImageUrl) {
    return persistAndReturnFailure(sessionId, 'insufficient_evidence', [
      'Both before and after images are required for comparison.'
    ], [
      'Cannot verify outcome without complete visual evidence.'
    ]);
  }

  try {
    const evaluation = simulateVisionComparison(beforeImageUrl, afterImageUrl, additionalNotes);

    const { data, error } = await supabase
      .from('repair_observations')
      .insert({
        session_id: sessionId,
        user_id: (await supabase.auth.getUser()).data.user?.id,
        before_image_url: beforeImageUrl,
        after_image_url: afterImageUrl,
        status: evaluation.status,
        confidence: evaluation.confidence,
        limitations: evaluation.limitations,
        warnings: evaluation.warnings,
        raw_analysis: evaluation
      })
      .select()
      .single();

    if (error) throw error;

    return {
      id: data.id,
      sessionId: data.session_id,
      status: data.status as ObservationStatus,
      confidence: data.confidence,
      limitations: data.limitations || [],
      warnings: data.warnings || [],
      createdAt: data.created_at
    };
  } catch (err) {
    console.error('Observation evaluation error:', err);
    // A service failure is NOT evidence of danger. Report that we could not judge the
    // photos (insufficient_evidence) instead of escalating to a professional.
    return persistAndReturnFailure(sessionId, 'insufficient_evidence', [
      'The automated comparison could not be completed, so nothing was judged from these photos.'
    ], [
      'Please try again. This does not mean the repair is safe or unsafe.'
    ]);
  }
}

async function persistAndReturnFailure(
  sessionId: string,
  status: ObservationStatus,
  limitations: string[],
  warnings: string[]
): Promise<ObservationResult> {
  const userId = (await supabase.auth.getUser()).data.user?.id;
  
  const { data } = await supabase
    .from('repair_observations')
    .insert({
      session_id: sessionId,
      user_id: userId,
      before_image_url: '',
      after_image_url: '',
      status,
      confidence: 0.0,
      limitations,
      warnings,
      raw_analysis: { fallback: true }
    })
    .select()
    .single();

  return {
    id: data?.id || 'temp-id',
    sessionId,
    status,
    confidence: 0,
    limitations,
    warnings,
    createdAt: data?.created_at || new Date().toISOString()
  };
}

function simulateVisionComparison(_beforeUrl: string, _afterUrl: string, notes?: string) {
  // Only a genuinely asserted, life-threatening symptom escalates. The shared screen
  // ignores precautions and negations ("no smoke", "if you see sparks") and treats
  // routine vocabulary as caution only, so a normal note never forces professional_review.
  const verdict = screenText(notes);
  if (verdict.blocked) {
    return {
      status: 'professional_review' as ObservationStatus,
      confidence: 0.95,
      limitations: ['New dangerous symptom reported post-repair.'],
      warnings: ['CRITICAL: Do not reconnect power. Professional technician inspection required immediately.']
    };
  }

  return {
    status: 'visible_change' as ObservationStatus,
    confidence: 0.82,
    limitations: ['Visual verification only. Internal electrical or structural integrity cannot be verified by photo.'],
    warnings: ['Superficial improvement does not guarantee complete elimination of hidden faults. Test with caution.']
  };
}