import { createClient } from '@supabase/supabase-js'
import { env } from '../config/env'

const supabaseUrl = env.supabaseUrl
const supabasePublishableKey = env.supabasePublishableKey

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error('Missing Supabase environment variables. Check .env.local')
}

export const supabase = createClient(supabaseUrl, supabasePublishableKey)