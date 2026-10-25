import type { DiagnosisResult, RepairStep } from '../types/repair'
import { supabase } from './supabase'

export type RepairStatus = 'in_progress' | 'completed'
export type ChatRole = 'user' | 'assistant'

export interface HistorySession {
  id: string
  user_id: string
  title: string | null
  description: string | null
  issue_name: string
  diagnosis: DiagnosisResult
  steps: RepairStep[]
  current_step: number
  status: RepairStatus
  image_path: string | null
  created_at: string
  updated_at: string
  completed_at: string | null
  message_count: number
}

export interface HistoryMessage {
  id: string
  session_id: string
  user_id: string
  role: ChatRole
  content: string
  created_at: string
}

type SessionRow = Omit<HistorySession, 'message_count'>

async function getUserId(): Promise<string | null> {
  if (!supabase) return null
  const { data, error } = await supabase.auth.getUser()
  if (error) throw new Error(`Unable to verify your account: ${error.message}`)
  return data.user?.id ?? null
}

function readableError(action: string, error: { message: string }) {
  return new Error(`${action}: ${error.message}`)
}

export async function createSession(
  diagnosis: DiagnosisResult,
  steps: RepairStep[],
  description: string
): Promise<HistorySession | null> {
  const userId = await getUserId()
  if (!supabase || !userId) return null
  const row = {
    user_id: userId,
    title: diagnosis.issueName,
    description,
    issue_name: diagnosis.issueName,
    diagnosis,
    steps,
    current_step: 0,
    status: 'in_progress' as const,
  }
  const { data, error } = await supabase
    .from('repair_sessions')
    .insert(row)
    .select('*')
    .single()
  if (error) throw readableError('Unable to save this repair', error)
  return { ...(data as SessionRow), message_count: 0 }
}

export async function updateProgress(
  sessionId: string,
  stepIndex: number
): Promise<HistorySession | null> {
  const userId = await getUserId()
  if (!supabase || !userId) return null
  const { data, error } = await supabase
    .from('repair_sessions')
    .update({ current_step: stepIndex })
    .eq('id', sessionId)
    .eq('user_id', userId)
    .select('*')
    .maybeSingle()
  if (error) throw readableError('Unable to save repair progress', error)
  return data ? { ...(data as SessionRow), message_count: 0 } : null
}

export async function completeSession(sessionId: string): Promise<HistorySession | null> {
  const userId = await getUserId()
  if (!supabase || !userId) return null
  const { data, error } = await supabase
    .from('repair_sessions')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('id', sessionId)
    .eq('user_id', userId)
    .select('*')
    .maybeSingle()
  if (error) throw readableError('Unable to mark this repair complete', error)
  return data ? { ...(data as SessionRow), message_count: 0 } : null
}

export async function listSessions(): Promise<HistorySession[]> {
  const userId = await getUserId()
  if (!supabase || !userId) return []
  const { data, error } = await supabase
    .from('repair_sessions')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
  if (error) throw readableError('Unable to load repair history', error)

  const sessions = (data ?? []) as SessionRow[]
  if (!sessions.length) return []
  const { data: messageRows, error: messageError } = await supabase
    .from('chat_messages')
    .select('session_id')
    .eq('user_id', userId)
    .in('session_id', sessions.map((session) => session.id))
  if (messageError) throw readableError('Unable to load repair message counts', messageError)
  const counts = new Map<string, number>()
  for (const row of messageRows ?? []) {
    counts.set(row.session_id, (counts.get(row.session_id) ?? 0) + 1)
  }
  return sessions.map((session) => ({
    ...session,
    message_count: counts.get(session.id) ?? 0,
  }))
}

export async function getSession(id: string): Promise<HistorySession | null> {
  const userId = await getUserId()
  if (!supabase || !userId) return null
  const { data, error } = await supabase
    .from('repair_sessions')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw readableError('Unable to load this repair', error)
  if (!data) return null
  const { count, error: countError } = await supabase
    .from('chat_messages')
    .select('id', { count: 'exact', head: true })
    .eq('session_id', id)
    .eq('user_id', userId)
  if (countError) throw readableError('Unable to load repair messages', countError)
  return { ...(data as SessionRow), message_count: count ?? 0 }
}

export async function getMessages(sessionId: string): Promise<HistoryMessage[]> {
  const userId = await getUserId()
  if (!supabase || !userId) return []
  const { data, error } = await supabase
    .from('chat_messages')
    .select('*')
    .eq('session_id', sessionId)
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
  if (error) throw readableError('Unable to load repair messages', error)
  return (data ?? []) as HistoryMessage[]
}

export async function addMessage(
  sessionId: string,
  role: ChatRole,
  content: string
): Promise<HistoryMessage | null> {
  const userId = await getUserId()
  if (!supabase || !userId) return null
  const { data, error } = await supabase
    .from('chat_messages')
    .insert({ session_id: sessionId, user_id: userId, role, content })
    .select('*')
    .single()
  if (error) throw readableError('Unable to save your message', error)
  return data as HistoryMessage
}

export async function deleteSession(id: string): Promise<boolean> {
  const userId = await getUserId()
  if (!supabase || !userId) return false
  const { error } = await supabase
    .from('repair_sessions')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)
  if (error) throw readableError('Unable to delete this repair', error)
  return true
}
