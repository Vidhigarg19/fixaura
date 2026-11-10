import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useAuth } from './authContext'
import { clearSession, getSession } from '../services/repairSession'
import { isGuideAvailable } from '../utils/guideAvailability'
import {
  assistantContextFromSession,
  type AssistantContext as RepairAssistantContext,
} from '../services/assistantService'
import type { ChatRole } from '../services/historyService'
import { AssistantContext, type AssistantMessage, type AssistantState } from './assistantContext'

/**
 * V05: while no approved guide exists, the assistant gets the diagnosis context only
 * (issue, description, risk, safety warning) and never repair steps or the AI free-text
 * tool list. This applies on every route, because the context is global and every
 * setter goes through here. Only an approved guide (RepairGuide, behind the gate)
 * supplies steps; a blocked result is always stripped.
 */
function withoutUnapprovedGuidance(
  context: RepairAssistantContext | null,
  approvedGuide = false
): RepairAssistantContext | null {
  if (!context || (approvedGuide && context.severity !== 'high')) return context
  return {
    ...context,
    recommendedTools: [],
    currentStepIndex: 0,
    totalSteps: 0,
    currentStep: null,
  }
}

function initialRepairContext() {
  const session = getSession()
  // Saved or generated steps are never read here: the stored session carries no approved
  // template, so the gate is closed for it.
  const approved = isGuideAvailable(null, { diagnosis: session?.diagnosis ?? null })
  return withoutUnapprovedGuidance(assistantContextFromSession(
    session?.diagnosis,
    session?.description ?? '',
    approved ? session?.steps ?? [] : [],
    session?.currentStep ?? 0,
    session?.historySessionId
  ), approved)
}

export default function AssistantProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth()
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState<AssistantMessage[]>([])
  const [mockMode, setMockMode] = useState(true)
  const [repairContext, setRawRepairContext] = useState<RepairAssistantContext | null>(
    initialRepairContext
  )
  const setRepairContext = useCallback(
    // The only callers that pass steps are RepairGuide's, which run only behind the approved
    // gate. A blocked (high severity) context is still always stripped.
    (context: RepairAssistantContext | null) => setRawRepairContext(withoutUnapprovedGuidance(context, true)),
    []
  )
  const previousUserId = useRef<string | null>(null)

  const appendMessage = useCallback(
    (role: ChatRole, content: string) => {
      const message: AssistantMessage = {
        id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        role,
        content,
        created_at: new Date().toISOString(),
      }
      setMessages((current) => [...current, message])
      return message
    },
    []
  )

  const clearMessages = useCallback(() => setMessages([]), [])

  useEffect(() => {
    if (authLoading) return
    const userId = user?.id ?? null
    if (previousUserId.current !== userId) {
      if (previousUserId.current || !userId) {
        clearSession()
        setIsOpen(false)
        setMessages([])
        setMockMode(true)
        setRepairContext(null)
      }
      previousUserId.current = userId
    }
  }, [authLoading, user?.id, setRepairContext])

  const value = useMemo<AssistantState>(() => ({
    isOpen,
    setIsOpen,
    messages,
    setMessages,
    appendMessage,
    clearMessages,
    mockMode,
    setMockMode,
    repairContext,
    setRepairContext,
    user,
  }), [
    isOpen,
    messages,
    appendMessage,
    clearMessages,
    mockMode,
    repairContext,
    setRepairContext,
    user,
  ])

  return <AssistantContext.Provider value={value}>{children}</AssistantContext.Provider>
}
