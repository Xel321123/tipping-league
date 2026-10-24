const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() ?? ''
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() ?? ''
const schema = (import.meta.env.VITE_SUPABASE_SCHEMA as string | undefined)?.trim() || 'tipping'

/**
 * Only public configuration reaches the browser. The anon/publishable key is
 * safe here by design: row level security in Postgres is the security boundary.
 */
export const config = {
  url,
  anonKey,
  schema,
  isConfigured: Boolean(url && anonKey),
} as const

export const SCHEMA_NOTE = `Add "${schema}" to Supabase → Project Settings → API → Exposed schemas, then reload.`
