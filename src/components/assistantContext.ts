import { createContext, useContext } from 'react'
import type { User } from '@supabase/supabase-js'
import type { AssistantContext as RepairAssistantContext } from '../services/assistantService'
import type { ChatRole, HistoryMessage } from '../services/historyService'

export interface AssistantMessage {
  id: string
  role: ChatRole
  content: string
  created_at: string
}

export interface AssistantState {
  isOpen: boolean
  setIsOpen: (open: boolean) => void
  messages: AssistantMessage[]
  setMessages: (messages: AssistantMessage[] | ((current: AssistantMessage[]) => AssistantMessage[])) => void
  appendMessage: (role: ChatRole, content: string) => AssistantMessage
  clearMessages: () => void
  mockMode: boolean
  setMockMode: (mock: boolean) => void
  repairContext: RepairAssistantContext | null
  setRepairContext: (context: RepairAssistantContext | null) => void
  user: User | null
}

export const AssistantContext = createContext<AssistantState | null>(null)

export function useAssistant() {
  const context = useContext(AssistantContext)
  if (!context) throw new Error('useAssistant must be used within AssistantProvider')
  return context
}

export function useAssistantContext() {
  const { repairContext, setRepairContext } = useAssistant()
  return { repairContext, setRepairContext }
}

export function fromHistoryMessage(message: HistoryMessage): AssistantMessage {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    created_at: message.created_at,
  }
}
