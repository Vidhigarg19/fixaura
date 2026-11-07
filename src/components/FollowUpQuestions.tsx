import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from 'react'
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react'
import { getLocale, subscribeLocale, t } from '../i18n'
import { FollowUpUnavailableError, submitFollowUpAnswers, type FollowUpResult } from '../services/followUpClient'
import { mapAnalysisError } from '../utils/analysisError'
import {
  ANSWER_PROBLEM_KEYS,
  MAX_SHORT_TEXT,
  cleanAnswers,
  validateAnswers,
  type AnswerProblem,
  type FollowUpAnswers,
  type FollowUpQuestion,
} from '../utils/followUpValidation'
import { createRequestGuard } from '../utils/requestGuard'

interface FollowUpQuestionsProps {
  questions: FollowUpQuestion[]
  sessionId: string
  /** Called with the server's latest result. The page decides what to do with it. */
  onResult: (result: FollowUpResult) => void
}

type SubmitState = 'idle' | 'submitting' | 'error' | 'unavailable' | 'done'

const ERROR_KEYS = {
  offline: 'followUp.errorOffline',
  unauthenticated: 'followUp.errorUnauthenticated',
  invalid_input: 'followUp.errorInvalidInput',
  busy: 'followUp.errorBusy',
  unavailable: 'followUp.errorUnavailable',
} as const

export default function FollowUpQuestions({ questions, sessionId, onResult }: FollowUpQuestionsProps) {
  useSyncExternalStore(subscribeLocale, getLocale)
  const [answers, setAnswers] = useState<FollowUpAnswers>({})
  const [problems, setProblems] = useState<Record<string, AnswerProblem>>({})
  const [state, setState] = useState<SubmitState>('idle')
  const [errorKey, setErrorKey] = useState('')
  const [guard] = useState(createRequestGuard)
  const submitLock = useRef(false)

  // A response that arrives after the user left must do nothing.
  useEffect(() => () => guard.invalidate(), [guard])

  const submitting = state === 'submitting'

  const setAnswer = (id: string, value: string | string[]) => {
    setAnswers((current) => ({ ...current, [id]: value }))
    setProblems((current) => {
      if (!current[id]) return current
      const { [id]: removed, ...rest } = current
      void removed
      return rest
    })
  }

  const toggleMulti = (id: string, option: string) => {
    const current = answers[id]
    const picked = Array.isArray(current) ? current : []
    setAnswer(id, picked.includes(option) ? picked.filter((value) => value !== option) : [...picked, option])
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (submitLock.current) return

    const found = validateAnswers(questions, answers)
    setProblems(found)
    const firstInvalid = questions.find((question) => found[question.id])
    if (firstInvalid) {
      document.getElementById(`followup-q-${firstInvalid.id}`)?.focus()
      return
    }

    submitLock.current = true
    const token = guard.next()
    setState('submitting')
    setErrorKey('')
    try {
      const result = await submitFollowUpAnswers({ sessionId, answers: cleanAnswers(questions, answers) })
      if (!guard.isCurrent(token)) return
      setState('done')
      onResult(result)
    } catch (error) {
      if (!guard.isCurrent(token)) return
      if (error instanceof FollowUpUnavailableError) {
        setState('unavailable')
        return
      }
      const kind = mapAnalysisError(error)
      // Log only the kind: never the answers or any message text.
      console.error('Follow-up submission failed:', { kind })
      setErrorKey(ERROR_KEYS[kind])
      setState('error')
    } finally {
      submitLock.current = false
    }
  }

  const renderChoices = (question: FollowUpQuestion, options: string[], labelFor: (value: string) => string) => {
    const multi = question.type === 'multi_choice'
    const value = answers[question.id]
    return options.map((option) => {
      const checked = multi ? Array.isArray(value) && value.includes(option) : value === option
      const inputId = `followup-${question.id}-${option}`
      return (
        <label
          key={option}
          htmlFor={inputId}
          className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-border px-3 py-2 text-sm text-text-primary has-[:checked]:border-primary has-[:checked]:bg-primary/10"
        >
          <input
            id={inputId}
            type={multi ? 'checkbox' : 'radio'}
            name={`followup-${question.id}`}
            value={option}
            checked={checked}
            disabled={submitting}
            onChange={() => (multi ? toggleMulti(question.id, option) : setAnswer(question.id, option))}
            className="h-5 w-5 shrink-0 accent-[#00f5d4] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          />
          <span>{labelFor(option)}</span>
        </label>
      )
    })
  }

  return (
    <section aria-labelledby="followup-heading" className="glass-panel mb-6 rounded-xl p-6">
      <h2 id="followup-heading" className="text-heading-md mb-1">
        {t('followUp.title')}
      </h2>
      <p className="mb-4 text-sm text-text-secondary">{t('followUp.intro')}</p>

      <form onSubmit={(event) => void submit(event)} noValidate className="space-y-5">
        {questions.map((question) => {
          const problem = problems[question.id]
          const errorId = `followup-error-${question.id}`
          const legend = (
            <>
              {question.label}{' '}
              <span className="text-xs font-normal text-text-subtle">
                ({question.required ? t('followUp.required') : t('followUp.optional')})
              </span>
            </>
          )

          return (
            <div key={question.id}>
              {question.type === 'short_text' ? (
                <>
                  <label htmlFor={`followup-q-${question.id}`} className="mb-2 block text-sm font-medium">
                    {legend}
                  </label>
                  <textarea
                    id={`followup-q-${question.id}`}
                    rows={3}
                    maxLength={MAX_SHORT_TEXT}
                    value={typeof answers[question.id] === 'string' ? (answers[question.id] as string) : ''}
                    disabled={submitting}
                    onChange={(event) => setAnswer(question.id, event.target.value)}
                    placeholder={t('followUp.placeholderText')}
                    aria-invalid={Boolean(problem)}
                    aria-describedby={problem ? errorId : undefined}
                    className="w-full resize-y rounded-xl border border-border bg-background p-3 text-text-primary placeholder:text-text-subtle focus-visible:outline-2 focus-visible:outline-primary"
                  />
                  <p className="mt-1 text-right text-xs text-text-subtle">
                    {(typeof answers[question.id] === 'string' ? (answers[question.id] as string) : '').length}/
                    {MAX_SHORT_TEXT}
                  </p>
                </>
              ) : (
                <fieldset
                  id={`followup-q-${question.id}`}
                  tabIndex={-1}
                  aria-invalid={Boolean(problem)}
                  aria-describedby={problem ? errorId : undefined}
                  className="focus-visible:outline-2 focus-visible:outline-primary"
                >
                  <legend className="mb-2 text-sm font-medium">{legend}</legend>
                  <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                    {question.type === 'yes_no'
                      ? renderChoices(question, ['yes', 'no'], (value) =>
                          value === 'yes' ? t('followUp.yes') : t('followUp.no')
                        )
                      : renderChoices(question, question.options ?? [], (value) => value)}
                  </div>
                </fieldset>
              )}
              {problem && (
                <p id={errorId} role="alert" className="mt-2 flex items-start gap-2 text-sm text-error">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{t(ANSWER_PROBLEM_KEYS[problem])}</span>
                </p>
              )}
            </div>
          )
        })}

        {state === 'unavailable' && (
          <p role="status" className="flex items-start gap-2 rounded-lg border border-warning/40 p-3 text-sm text-warning">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{t('followUp.notAvailable')}</span>
          </p>
        )}
        {state === 'error' && (
          <p role="alert" className="flex items-start gap-2 rounded-lg border border-warning/40 p-3 text-sm text-warning">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{t(errorKey)}</span>
          </p>
        )}
        {state === 'done' && (
          <p role="status" className="flex items-start gap-2 text-sm text-success">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{t('followUp.updated')}</span>
          </p>
        )}
        <p role="status" aria-live="polite" className="sr-only">
          {submitting ? t('followUp.submitting') : ''}
        </p>

        <button
          type="submit"
          disabled={submitting}
          aria-busy={submitting}
          className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 font-semibold text-background disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          {submitting && <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />}
          {submitting ? t('followUp.submitting') : state === 'error' ? t('followUp.retry') : t('followUp.submit')}
        </button>
      </form>
    </section>
  )
}
