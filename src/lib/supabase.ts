
import { supabase as sharedClient } from '../services/supabase'

if (!sharedClient) {
  throw new Error('Missing Supabase environment variables. Check .env.local')
}

export const supabase = sharedClient
