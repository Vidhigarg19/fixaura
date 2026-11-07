// Pure follow-up question parsing and validation (no DOM, easy to test).

export type QuestionType = 'single_choice' | 'multi_choice' | 'yes_no' | 'short_text'

export interface FollowUpQuestion {
  id: string
  type: QuestionType
  label: string
  options?: string[]
  required: boolean
}

export type FollowUpAnswer = string | string[]
export type FollowUpAnswers = Record<string, FollowUpAnswer>
export type AnswerProblem = 'required' | 'too_long' | 'invalid_choice'

export const MAX_SHORT_TEXT = 200
const MAX_QUESTIONS = 8
const MAX_OPTIONS = 10

const QUESTION_TYPES: readonly QuestionType[] = [
  'single_choice',
  'multi_choice',
  'yes_no',
  'short_text',
]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Defensive parse of whatever the server sent. Invalid questions are dropped. */
export function parseFollowUpQuestions(raw: unknown): FollowUpQuestion[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const questions: FollowUpQuestion[] = []

  for (const item of raw) {
    if (questions.length >= MAX_QUESTIONS) break
    if (!isRecord(item)) continue
    const { id, type, label, options, required } = item
    if (typeof id !== 'string' || !id.trim() || id.length > 64 || seen.has(id)) continue
    if (typeof label !== 'string' || !label.trim() || label.length > 300) continue
    if (!QUESTION_TYPES.includes(type as QuestionType)) continue

    const questionType = type as QuestionType
    let cleanOptions: string[] | undefined
    if (questionType === 'single_choice' || questionType === 'multi_choice') {
      if (!Array.isArray(options)) continue
      cleanOptions = options
        .filter((option): option is string => typeof option === 'string' && option.trim().length > 0)
        .map((option) => option.trim().slice(0, 120))
        .slice(0, MAX_OPTIONS)
      if (cleanOptions.length < 2) continue
    }

    seen.add(id)
    questions.push({
      id,
      type: questionType,
      label: label.trim(),
      ...(cleanOptions ? { options: cleanOptions } : {}),
      // A missing flag is treated as required: the safer reading.
      required: required !== false,
    })
  }
  return questions
}

/** Returns a problem per question id. An empty object means the answers are valid. */
export function validateAnswers(
  questions: FollowUpQuestion[],
  answers: FollowUpAnswers
): Record<string, AnswerProblem> {
  const problems: Record<string, AnswerProblem> = {}

  for (const question of questions) {
    const answer = answers[question.id]

    if (question.type === 'multi_choice') {
      const picked = Array.isArray(answer) ? answer : []
      if (picked.length === 0) {
        if (question.required) problems[question.id] = 'required'
      } else if (picked.some((value) => !question.options?.includes(value))) {
        problems[question.id] = 'invalid_choice'
      }
      continue
    }

    const value = typeof answer === 'string' ? answer : ''
    const trimmed = value.trim()

    if (question.type === 'short_text') {
      if (!trimmed) {
        if (question.required) problems[question.id] = 'required'
      } else if (trimmed.length > MAX_SHORT_TEXT) {
        problems[question.id] = 'too_long'
      }
      continue
    }

    if (!trimmed) {
      if (question.required) problems[question.id] = 'required'
      continue
    }
    const allowed = question.type === 'yes_no' ? ['yes', 'no'] : (question.options ?? [])
    if (!allowed.includes(value)) problems[question.id] = 'invalid_choice'
  }
  return problems
}

/** Only known question ids, trimmed text, no empty optional answers. */
export function cleanAnswers(
  questions: FollowUpQuestion[],
  answers: FollowUpAnswers
): FollowUpAnswers {
  const cleaned: FollowUpAnswers = {}
  for (const question of questions) {
    const answer = answers[question.id]
    if (Array.isArray(answer)) {
      if (answer.length > 0) cleaned[question.id] = answer
    } else if (typeof answer === 'string' && answer.trim()) {
      cleaned[question.id] = question.type === 'short_text' ? answer.trim() : answer
    }
  }
  return cleaned
}

export const ANSWER_PROBLEM_KEYS: Record<AnswerProblem, string> = {
  required: 'followUp.errorRequired',
  too_long: 'followUp.errorTooLong',
  invalid_choice: 'followUp.errorInvalidChoice',
}
