import { createClient } from '@supabase/supabase-js'
import { config } from './env'

/**
 * The client is pinned to the isolated `tipping` schema. Every `.from()` and
 * `.rpc()` call is sent with `Accept-Profile: tipping`, so the app can never
 * accidentally read or write another project's tables on the shared instance.
 */
export const sb = config.isConfigured
  ? createClient(config.url, config.anonKey, {
      db: { schema: config.schema },
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { 'x-application-name': 'tipping-league' } },
    })
  : null

export type DbClient = NonNullable<typeof sb>

export function db(): DbClient {
  if (!sb) {
    throw new Error(
      'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.',
    )
  }
  return sb
}

/** PostgREST / Postgres error, flattened into something a human can read. */
export class ApiError extends Error {
  readonly code?: string
  readonly hint?: string

  constructor(message: string, code?: string, hint?: string) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.hint = hint
  }
}

interface SupabaseLikeError {
  message?: string
  details?: string
  hint?: string
  code?: string
}

export function toApiError(error: SupabaseLikeError | null, fallback: string): ApiError {
  if (!error) return new ApiError(fallback)
  const message = error.message?.trim() || fallback

  // A missing schema in "Exposed schemas" surfaces as an opaque 404/schema error.
  if (/schema|PGRST106|PGRST205/i.test(`${error.code ?? ''} ${message}`)) {
    return new ApiError(
      `The "${config.schema}" schema is not reachable through the Data API.`,
      error.code,
      'Supabase → Project Settings → API → Exposed schemas → add the schema, then retry.',
    )
  }

  return new ApiError(message, error.code, error.hint ?? error.details)
}
