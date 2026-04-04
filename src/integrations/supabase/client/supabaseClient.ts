import { createClient } from '@supabase/supabase-js'
import { getEnv } from '../../../app/config/env'

const env = getEnv()

if (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_ANON_KEY) {
	throw new Error(
		'Faltan VITE_SUPABASE_URL y/o VITE_SUPABASE_ANON_KEY en .env. Reinicia el servidor de desarrollo despues de configurarlas.',
	)
}

const supabaseUrl = env.VITE_SUPABASE_URL
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
