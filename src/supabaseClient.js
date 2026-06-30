import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || 'https://zvlnkkmcytjtridiojxx.supabase.co'
// Publishable key (sistema novo de API keys do Supabase) — segura no browser, protegida por RLS.
// Substitui a antiga anon key (JWT legado), que será desabilitada no painel.
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY || 'sb_publishable_TJup2m7KppLdq_9gSU6cnA_abutiGBE'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
export const SUPABASE_URL = supabaseUrl
export const SUPABASE_ANON_KEY = supabaseAnonKey
export const FUNCTIONS_URL = `${supabaseUrl}/functions/v1`