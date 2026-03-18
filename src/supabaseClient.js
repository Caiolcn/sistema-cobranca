import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || 'https://zvlnkkmcytjtridiojxx.supabase.co'
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp2bG5ra21jeXRqdHJpZGlvanh4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU5OTMxMDQsImV4cCI6MjA4MTU2OTEwNH0.LkZZaIGVmqkdh0tFfNIVgQKzwCntuoFcRasqdahUzzA'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
export const SUPABASE_URL = supabaseUrl
export const SUPABASE_ANON_KEY = supabaseAnonKey
export const FUNCTIONS_URL = `${supabaseUrl}/functions/v1`