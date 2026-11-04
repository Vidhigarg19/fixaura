import type { DiagnosisResult, RepairStep } from '../types/repair'
import { supabase } from './supabase'

export type RepairStatus = 'in_progress' | 'completed'
export type ChatRole = 'user' | 'assistant'

export interface HistorySession {
  id: string
  user_id: string
  title: string | null
  description: string | null
  issue_name: string | null
  diagnosis: DiagnosisResult | null
  steps: RepairStep[] | null
  current_step: number | null
  status: RepairStatus | null
  image_path: string | null
  created_at: string | null
  updated_at: string | null
  completed_at: string | null
  message_count: number | null
}

export interface HistoryMessage {
  id: string
  session_id: string
  user_id: string
  role: ChatRole
  content: string
  created_at: string
}

type SessionRow = Partial<Omit<HistorySession, 'message_count'>>

export interface ListSessionsResult {
  sessions: HistorySession[]
  messageCountWarning: boolean
}

function normalizeSession(row: SessionRow, messageCount = 0): HistorySession {
  return {
    id: row.id ?? '',
    user_id: row.user_id ?? '',
    title: row.title ?? null,
    description: row.description ?? null,
    issue_name: row.issue_name ?? row.title ?? null,
    diagnosis: row.diagnosis ?? null,
    steps: Array.isArray(row.steps) ? row.steps : [],
    current_step:
      typeof row.current_step === 'number' && Number.isFinite(row.current_step)
        ? row.current_step
        : 0,
    status: row.status === 'completed' ? 'completed' : 'in_progress',
    image_path: row.image_path ?? null,
    created_at: row.created_at ?? null,
    updated_at: row.updated_at ?? null,
    completed_at: row.completed_at ?? null,
    message_count:
      Number.isFinite(messageCount) && messageCount >= 0 ? messageCount : 0,
  }
}

function normalizeMessage(row: Partial<HistoryMessage>): HistoryMessage {
  return {
    id: row.id ?? '',
    session_id: row.session_id ?? '',
    user_id: row.user_id ?? '',
    role: row.role === 'user' ? 'user' : 'assistant',
    content: row.content ?? '',
    created_at: row.created_at ?? '',
  }
}

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
  return normalizeSession(data as SessionRow)
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
  return data ? normalizeSession(data as SessionRow) : null
}

export async function completeSession(
  sessionId: string,
  updatedDiagnosis?: DiagnosisResult
): Promise<HistorySession | null> {
  const userId = await getUserId()
  if (!supabase || !userId) return null
  const payload: Record<string, unknown> = {
    status: 'completed',
    completed_at: new Date().toISOString(),
  }
  if (updatedDiagnosis) {
    payload.diagnosis = updatedDiagnosis
  }
  const { data, error } = await supabase
    .from('repair_sessions')
    .update(payload)
    .eq('id', sessionId)
    .eq('user_id', userId)
    .select('*')
    .maybeSingle()
  if (error) throw readableError('Unable to mark this repair complete', error)
  return data ? normalizeSession(data as SessionRow) : null
}

export async function listSessions(): Promise<ListSessionsResult> {
  const userId = await getUserId()
  if (!supabase || !userId) return { sessions: [], messageCountWarning: false }
  const { data, error } = await supabase
    .from('repair_sessions')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
  if (error) throw readableError('Unable to load repair history', error)

  const sessions = (data ?? []) as SessionRow[]
  if (!sessions.length) return { sessions: [], messageCountWarning: false }

  const counts = new Map<string, number>()
  let messageCountWarning = false
  try {
    const { data: messageRows, error: messageError } = await supabase
      .from('chat_messages')
      .select('session_id')
      .eq('user_id', userId)
      .in('session_id', sessions.map((session) => session.id ?? '').filter(Boolean))
    if (messageError) throw readableError('Unable to load repair message counts', messageError)
    for (const row of messageRows ?? []) {
      if (typeof row.session_id === 'string') {
        counts.set(row.session_id, (counts.get(row.session_id) ?? 0) + 1)
      }
    }
  } catch (reason) {
    console.warn('Unable to load repair message counts:', reason)
    messageCountWarning = true
  }

  return {
    sessions: sessions.map((session) =>
      normalizeSession(session, counts.get(session.id ?? '') ?? 0)
    ),
    messageCountWarning,
  }
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
  let messageCount = 0
  try {
    const { count, error: countError } = await supabase
      .from('chat_messages')
      .select('id', { count: 'exact', head: true })
      .eq('session_id', id)
      .eq('user_id', userId)
    if (countError) throw readableError('Unable to load repair message count', countError)
    messageCount = count ?? 0
  } catch (reason) {
    console.warn('Unable to load repair message count:', reason)
  }
  return normalizeSession(data as SessionRow, messageCount)
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
  return ((data ?? []) as HistoryMessage[]).map((message) => normalizeMessage(message))
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
  return normalizeMessage(data as HistoryMessage)
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
