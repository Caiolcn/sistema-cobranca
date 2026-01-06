import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://zvlnkkmcytjtridiojxx.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp2bG5ra21jeXRqdHJpZGlvanh4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU5OTMxMDQsImV4cCI6MjA4MTU2OTEwNH0.LkZZaIGVmqkdh0tFfNIVgQKzwCntuoFcRasqdahUzzA'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)