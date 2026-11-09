import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useAuth } from './authContext'
import { clearSession, getSession } from '../services/repairSession'
import { buildRepairPlan } from '../services/repairPlanner'
import { isGuideAvailable } from '../utils/guideAvailability'
import {
  assistantContextFromSession,
  type AssistantContext as RepairAssistantContext,
} from '../services/assistantService'
import type { ChatRole } from '../services/historyService'
import { AssistantContext, type AssistantMessage, type AssistantState } from './assistantContext'

/**
 * While no approved guide exists, the assistant gets the diagnosis context only
 * (issue, description, risk, safety warning) and never repair steps or the AI
 * free-text tool list. This applies on every route, because the context is
 * global and every setter goes through here.
 */
function withoutUnapprovedGuidance(
  context: RepairAssistantContext | null
): RepairAssistantContext | null {
  if (!context || isGuideAvailable()) return context
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
  // Saved or generated steps are not read at all while the guide is unavailable.
  const steps = !isGuideAvailable()
    ? []
    : session?.steps ?? (session?.diagnosis ? buildRepairPlan(session.diagnosis) : [])
  return withoutUnapprovedGuidance(assistantContextFromSession(
    session?.diagnosis,
    session?.description ?? '',
    steps,
    session?.currentStep ?? 0,
    session?.historySessionId
  ))
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
    (context: RepairAssistantContext | null) => setRawRepairContext(withoutUnapprovedGuidance(context)),
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
