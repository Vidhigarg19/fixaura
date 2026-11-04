import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { User } from '@supabase/supabase-js'
import { clearSession } from '../services/repairSession'
import { supabase } from '../services/supabase'
import { AuthContext } from './authContext'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(Boolean(supabase))
  const [error, setError] = useState<string | null>(
    supabase ? null : 'Supabase authentication is not configured.'
  )
  const previousUserId = useRef<string | null>(null)

  useEffect(() => {
    if (!supabase) return

    let active = true
    let authEventVersion = 0
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'INITIAL_SESSION') return
      authEventVersion += 1
      const nextUser = session?.user ?? null
      if (previousUserId.current && previousUserId.current !== nextUser?.id) {
        clearSession()
      }
      previousUserId.current = nextUser?.id ?? null
      setUser(nextUser)
      setError(null)
      setLoading(false)
    })

    void (async () => {
      const { data, error: sessionError } = await supabase.auth.getSession()
      if (!active || authEventVersion > 0) return
      if (sessionError) throw sessionError
      if (!data.session) {
        setUser(null)
        setLoading(false)
        return
      }

      const { data: verified, error: verificationError } =
        await supabase.auth.getUser(data.session.access_token)
      if (!active || authEventVersion > 0) return
      if (verificationError) throw verificationError
      previousUserId.current = verified.user?.id ?? null
      setUser(verified.user)
      setLoading(false)
    })().catch((sessionError: unknown) => {
      if (!active || authEventVersion > 0) return
      setError(sessionError instanceof Error ? sessionError.message : 'Unable to verify your session.')
      setUser(null)
      setLoading(false)
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  const signOut = useCallback(async () => {
    if (!supabase) throw new Error('Supabase authentication is not configured.')
    const { error: signOutError } = await supabase.auth.signOut()
    if (signOutError) throw signOutError
  }, [])

  const value = useMemo(
    () => ({ user, loading, error, signOut }),
    [user, loading, error, signOut]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
