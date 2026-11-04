import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useAuth } from './authContext'
import { clearSession, getSession } from '../services/repairSession'
import { buildRepairPlan } from '../services/repairPlanner'
import {
  assistantContextFromSession,
  type AssistantContext as RepairAssistantContext,
} from '../services/assistantService'
import type { ChatRole } from '../services/historyService'
import { AssistantContext, type AssistantMessage, type AssistantState } from './assistantContext'

function initialRepairContext() {
  const session = getSession()
  const steps = session?.steps ?? (
    session?.diagnosis ? buildRepairPlan(session.diagnosis) : []
  )
  return assistantContextFromSession(
    session?.diagnosis,
    session?.description ?? '',
    steps,
    session?.currentStep ?? 0,
    session?.historySessionId
  )
}

export default function AssistantProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth()
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState<AssistantMessage[]>([])
  const [mockMode, setMockMode] = useState(true)
  const [repairContext, setRepairContext] = useState<RepairAssistantContext | null>(
    initialRepairContext
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
  }, [authLoading, user?.id])

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
    user,
  ])

  return <AssistantContext.Provider value={value}>{children}</AssistantContext.Provider>
}
