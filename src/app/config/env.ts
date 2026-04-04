const requiredEnv = {
  VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
  VITE_SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY,
} as const

export function getEnv() {
  const missing = Object.entries(requiredEnv)
    .filter(([, value]) => !value)
    .map(([key]) => key)

  if (missing.length > 0) {
    console.warn(
      `Missing env vars: ${missing.join(', ')}. Supabase features will stay disabled until configured.`,
    )
  }

  return requiredEnv
}
