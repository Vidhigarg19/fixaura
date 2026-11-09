import { supabase } from '../lib/supabase';
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
    return persistAndReturnFailure(sessionId, 'professional_review', [
      'Automated visual comparison service encountered an unexpected error.'
    ], [
      'Exercise caution and consult a certified technician to confirm safety.'
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
  if (notes && (notes.toLowerCase().includes('spark') || notes.toLowerCase().includes('smoke'))) {
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