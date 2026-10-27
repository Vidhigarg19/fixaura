import { t, type Locale } from '../i18n'
import type { DiagnosisResult, RepairStep, RiskLevel } from '../types/repair'
import type { HistoryMessage } from './historyService'

export interface AssistantContext {
  description: string
  issueName: string
  severity: RiskLevel
  recommendedTools: string[]
  safetyWarning: string
  currentStepIndex: number
  totalSteps: number
  currentStep: Pick<RepairStep, 'title' | 'instruction' | 'safetyNote'> | null
  sessionId: string | null
}

export interface AssistantReply {
  text: string
  mock: boolean
}

export interface AskAssistantInput {
  message: string
  history: HistoryMessage[]
  context: AssistantContext | null
  locale: Locale
}

type Intent =
  | 'explain'
  | 'why'
  | 'safe'
  | 'troubleshoot'
  | 'tools'
  | 'how'
  | 'repairs'
  | 'fallback'

function interpolate(template: string, values: Record<string, string>) {
  return Object.entries(values).reduce(
    (result, [key, value]) => result.replaceAll(`{${key}}`, value),
    template
  )
}

function matchesAny(message: string, phrases: string[]) {
  return phrases.some((phrase) => message.includes(phrase))
}

function hasImmediateHazard(text: string) {
  const normalized = text.toLocaleLowerCase()
  return matchesAny(normalized, [
    'gas smell',
    'smell of gas',
    'smell gas',
    'smelling gas',
    'gas leak',
    'burning smell',
    'burning',
    'smells burnt',
    'sparks',
    'spark',
    'smoke',
    'exposed wiring',
    'exposed wire',
    'flooding near electricity',
    'flooding',
    'water near electricity',
    'water near electrical',
    'गैस की गंध',
    'गैस की बदबू',
    'गैस लीक',
    'जलने की गंध',
    'जलने की बदबू',
    'चिंगारी',
    'चिंगारियां',
    'धुआँ',
    'धुआं',
    'खुली तार',
    'नंगी तार',
    'बिजली के पास पानी',
    'बिजली के पास बाढ़',
    'पानी और बिजली',
  ])
}

function getIntent(message: string): Intent {
  const normalized = message.toLocaleLowerCase()
  if (matchesAny(normalized, [
    'how does fixaura work',
    'how does this work',
    'fixaura कैसे काम',
    'कैसे काम करता',
  ])) return 'how'
  if (matchesAny(normalized, [
    'what can i repair',
    'what can i fix',
    'कौन सी चीज़ें ठीक',
    'क्या ठीक कर सकता',
    'क्या मरम्मत कर सकता',
  ])) return 'repairs'
  if (matchesAny(normalized, [
    'explain this step',
    'step again',
    'repeat this step',
    'फिर से समझाएँ',
    'फिर से समझाएं',
    'चरण फिर से समझ',
    'इस चरण को फिर',
    'कदम फिर से समझ',
    'दोबारा समझ',
  ])) return 'explain'
  if (matchesAny(normalized, [
    'why is this step',
    'why do i need',
    'why this step',
    'यह चरण क्यों',
    'यह कदम क्यों',
    'क्यों ज़रूरी',
    'क्यों जरूरी',
  ])) return 'why'
  if (matchesAny(normalized, [
    'is this safe',
    'is it safe',
    'safe to do',
    'क्या यह सुरक्षित',
    'क्या यह सेफ',
    'सुरक्षित है',
  ])) return 'safe'
  if (matchesAny(normalized, [
    "what if it doesn't work",
    'what if it does not work',
    'if it fails',
    'does not work',
    'काम न करे',
    'काम नहीं करे',
    'काम नहीं हुआ',
    'विफल',
  ])) return 'troubleshoot'
  if (matchesAny(normalized, [
    'which tool',
    'what tool',
    'tools do i need',
    'कौन सा औज़ार',
    'कौन सा उपकरण',
    'कौनसे औज़ार',
    'कौन से उपकरण',
  ])) return 'tools'
  return 'fallback'
}

export async function askAssistant({
  message,
  history,
  context,
  locale,
}: AskAssistantInput): Promise<AssistantReply> {
  void history

  // TODO(Claude): Replace the mock below with a Supabase Edge Function call
  // that invokes Claude securely. Never put API keys in frontend code.
  const hazardText = [
    message,
    context?.issueName ?? '',
    context?.description ?? '',
    context?.safetyWarning ?? '',
    context?.currentStep?.title ?? '',
    context?.currentStep?.instruction ?? '',
    context?.currentStep?.safetyNote ?? '',
    ...(context?.recommendedTools ?? []),
  ].join(' ')

  if (hasImmediateHazard(hazardText)) {
    return { text: t('assistant.reply.hazard', locale), mock: true }
  }

  await new Promise<void>((resolve) => {
    window.setTimeout(resolve, 600 + Math.floor(Math.random() * 601))
  })

  const intent = getIntent(message)
  const step = context?.currentStep
  const tools = context?.recommendedTools.length
    ? context.recommendedTools.join(locale === 'hi' ? ', ' : ', ')
    : t('assistant.reply.noTools', locale)
  const safetyNote = step?.safetyNote || context?.safetyWarning || t('assistant.reply.noSafetyNote', locale)
  const values = {
    instruction: step?.instruction ?? t('assistant.reply.noStep', locale),
    title: step?.title ?? t('assistant.reply.noStep', locale),
    issue: context?.issueName || t('assistant.reply.currentRepair', locale),
    safety: safetyNote,
    tools,
    step: String((context?.currentStepIndex ?? 0) + 1),
    total: String(context?.totalSteps ?? 0),
  }
  const templateKey = intent === 'explain'
    ? 'assistant.reply.explain'
    : intent === 'why'
      ? 'assistant.reply.why'
      : intent === 'safe'
        ? 'assistant.reply.safe'
        : intent === 'troubleshoot'
          ? 'assistant.reply.troubleshoot'
          : intent === 'tools'
            ? 'assistant.reply.tools'
              : intent === 'how'
                ? 'assistant.reply.how'
                : intent === 'repairs'
                  ? 'assistant.reply.repairs'
                  : 'assistant.reply.fallback'

  return {
    text: interpolate(t(templateKey, locale), values),
    mock: true,
  }
}

export function assistantContextFromSession(
  diagnosis: DiagnosisResult | null | undefined,
  description: string,
  steps: RepairStep[],
  currentStepIndex: number,
  sessionId: string | undefined
): AssistantContext | null {
  if (!diagnosis) return null
  const currentStep = steps[currentStepIndex]
  return {
    description,
    issueName: diagnosis.issueName,
    severity: diagnosis.severity,
    recommendedTools: diagnosis.recommendedTools ?? [],
    safetyWarning: diagnosis.safetyWarning,
    currentStepIndex,
    totalSteps: steps.length,
    currentStep: currentStep
      ? {
          title: currentStep.title,
          instruction: currentStep.instruction,
          safetyNote: currentStep.safetyNote,
        }
      : null,
    sessionId: sessionId ?? null,
  }
}
