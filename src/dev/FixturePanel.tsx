// DEV-ONLY. Loaded with React.lazy behind `import.meta.env.DEV` (see CameraCapture).
import { FlaskConical } from 'lucide-react'
import { isValidDiagnosisResult } from '../services/repairSession'
import type { FixtureOutcome } from './analysisFixtures'

interface FixturePanelProps {
  name: string
  outcome: FixtureOutcome | null
}

export default function FixturePanel({ name, outcome }: FixturePanelProps) {
  return (
    <div className="space-y-3">
      <div
        role="status"
        className="flex items-center gap-2 rounded-xl border border-warning/50 bg-warning/10 px-4 py-3 text-sm font-semibold text-warning"
      >
        <FlaskConical className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>Fixture (test data): {name}. The real service is not called and nothing is saved.</span>
      </div>

      {outcome && (
        <div className="glass-panel space-y-2 rounded-xl p-4 text-sm text-text-secondary">
          <p className="font-semibold text-text-primary">
            Fixture result (not saved): risk {outcome.data.riskLevel}, next action {outcome.data.nextAction}
            {outcome.adapted.safetyStop ? ' (blocked, no DIY)' : ''}
          </p>
          <p>Observations: {outcome.data.observations.join(' ') || 'none'}</p>
          <p>Possible causes: {outcome.data.possibleCauses.join(', ') || 'none'}</p>
          <p>Evidence strength: {outcome.data.evidenceStrength}</p>
          <p>Limitations: {outcome.data.limitations.join(' ') || 'none'}</p>
          <p>Safety reasons: {outcome.data.safetyReasons.join(' ') || 'none'}</p>
          <p>Follow-up questions: {outcome.data.followUpQuestions.join(' ') || 'none'}</p>
          <p>
            Template: {outcome.data.approvedTemplateId ?? 'none'}, policy {outcome.data.policyVersion}
          </p>
          <p>
            Adapter output accepted by the diagnosis page:{' '}
            {isValidDiagnosisResult(outcome.adapted) ? 'yes' : 'no'}
          </p>
        </div>
      )}
    </div>
  )
}
