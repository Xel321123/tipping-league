import { config } from './env'
import { signFromScore } from './scores'
import type { MatchStatus, Sign } from './types'

const UPSTREAM = 'https://api.spela.svenskaspel.se'
const TIMEOUT_MS = 12_000

export interface SsResultLine {
  type: number
  home: string
  away: string
  description?: string
}

export interface SsParticipant {
  type: string
  name: string
}

export interface SsMatch {
  matchStart?: string
  status?: string
  statusId?: number
  sportEventStatus?: string
  participants?: SsParticipant[]
  result?: SsResultLine[]
}

export interface SsEvent {
  eventNumber: number
  eventDescription?: string
  cancelled?: boolean
  match?: SsMatch
}

export interface SsDraw {
  productName?: string
  drawNumber?: number
  drawState?: string
  regCloseTime?: string
  drawEvents?: SsEvent[]
}

export interface NormalizedMatch {
  match_number: number
  home_team: string
  away_team: string
  kickoff: string | null
  home_score: number | null
  away_score: number | null
  match_status: MatchStatus
  current_result: Sign | null
  outcome: Sign | null
  cancelled: boolean
}

export interface DrawPayload {
  draw: SsDraw
  normalized: NormalizedMatch[]
  viaProxy: boolean
}

function toScore(value: string | undefined): number | null {
  if (value === undefined) return null
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : null
}

function splitDescription(description: string | undefined, index: 0 | 1): string {
  if (!description) return index === 0 ? 'Home' : 'Away'
  const parts = description.split(' - ')
  return (parts[index] ?? parts[0] ?? 'TBC').trim()
}

/** Turn a Svenska Spel draw into the row shape `admin_sync_matches` expects. */
export function normalizeDraw(draw: SsDraw, limit = 13): NormalizedMatch[] {
  const events = [...(draw.drawEvents ?? [])].sort((a, b) => a.eventNumber - b.eventNumber)

  return events.slice(0, limit).map((event, index) => {
    const match = event.match ?? {}
    const participants = match.participants ?? []
    const home = participants.find((p) => p.type === 'home')?.name ?? splitDescription(event.eventDescription, 0)
    const away = participants.find((p) => p.type === 'away')?.name ?? splitDescription(event.eventDescription, 1)

    const lines = match.result ?? []
    const fullTime = lines.find((line) => line.type === 2)
    const current = lines.find((line) => line.type === 9)

    const cancelled = Boolean(event.cancelled)
    const finished = match.sportEventStatus === 'Ended' || match.statusId === 31
    const live =
      !cancelled &&
      !finished &&
      (match.sportEventStatus === 'Live' ||
        (typeof match.statusId === 'number' && match.statusId > 0 && match.statusId !== 31))

    const matchStatus: MatchStatus = cancelled
      ? 'cancelled'
      : finished
        ? 'finished'
        : live
          ? 'live'
          : 'not_started'

    const shown = matchStatus === 'live' ? current : (fullTime ?? current)
    const homeScore = toScore(shown?.home)
    const awayScore = toScore(shown?.away)

    const outcome: Sign | null =
      matchStatus === 'finished' && fullTime
        ? signFromScore(toScore(fullTime.home) ?? 0, toScore(fullTime.away) ?? 0)
        : null

    const currentResult: Sign | null =
      homeScore !== null && awayScore !== null && (matchStatus === 'live' || matchStatus === 'finished')
        ? signFromScore(homeScore, awayScore)
        : null

    return {
      match_number: event.eventNumber || index + 1,
      home_team: home,
      away_team: away,
      kickoff: match.matchStart ?? null,
      home_score: homeScore,
      away_score: awayScore,
      match_status: matchStatus,
      current_result: currentResult,
      outcome,
      cancelled,
    }
  })
}

async function getJson(url: string, headers: Record<string, string>): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const response = await fetch(url, { headers, signal: controller.signal })
    if (!response.ok) {
      throw new Error(`Svenska Spel responded ${response.status}`)
    }
    return (await response.json()) as unknown
  } finally {
    clearTimeout(timer)
  }
}

function proxyUrl(product: string, drawNumber?: number): string {
  const base = `${config.url.replace(/\/+$/, '')}/functions/v1/ss-draw`
  const params = new URLSearchParams({ product })
  if (drawNumber !== undefined) params.set('draw', String(drawNumber))
  return `${base}?${params.toString()}`
}

/**
 * Svenska Spel's API does not send CORS headers, so the browser cannot always
 * read it directly. Strategy:
 *   1. try the public API (works in some browsers / desktop installs),
 *   2. fall back to the `ss-draw` Edge Function deployed with this repo,
 *   3. surface a clear message so the admin can enter results by hand.
 */
export async function loadDraw(product: string, drawNumber?: number): Promise<DrawPayload> {
  // Topptipset exposes per-draw documents only; its collection endpoint was
  // retired, so "latest draw" cannot be resolved and we ask for the number.
  if (!drawNumber && product === 'topptipset') {
    throw new Error(
      'Topptipset has no "latest draw" endpoint — enter its draw number (from spela.svenskaspel.se/topptipset) and sync again.',
    )
  }

  const path = drawNumber
    ? `/draw/1/${encodeURIComponent(product)}/draws/${drawNumber}`
    : `/draw/1/${encodeURIComponent(product)}/draws`

  try {
    const payload = (await getJson(`${UPSTREAM}${path}`, { Accept: 'application/json' })) as {
      draw?: SsDraw
      draws?: SsDraw[]
    }
    const draw = payload.draw ?? payload.draws?.[0]
    if (draw) return { draw, normalized: normalizeDraw(draw), viaProxy: false }
  } catch {
    // fall through to the proxy
  }

  if (!config.isConfigured) {
    throw new Error('Direct access to Svenska Spel failed and no proxy is configured.')
  }

  try {
    const payload = (await getJson(proxyUrl(product, drawNumber), {
      Accept: 'application/json',
      apikey: config.anonKey,
      Authorization: `Bearer ${config.anonKey}`,
    })) as { draw?: SsDraw; draws?: SsDraw[]; error?: string }

    const draw = payload.draw ?? payload.draws?.[0]
    if (draw) return { draw, normalized: normalizeDraw(draw), viaProxy: true }
    throw new Error(payload.error ?? 'The proxy returned no draw')
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'unknown error'
    throw new Error(
      `Live draw sync unavailable (${detail}). Enter the matches and results manually in the admin panel.`,
    )
  }
}

export const PRODUCT_OPTIONS: ReadonlyArray<{
  value: string
  label: string
  matches: number
  needsDrawNumber?: boolean
}> = [
  { value: 'topptipset', label: 'Topptipset', matches: 8, needsDrawNumber: true },
  { value: 'europatipset', label: 'Europatipset', matches: 13 },
  { value: 'stryktipset', label: 'Stryktipset', matches: 13 },
  { value: 'maltipset', label: 'Måltipset', matches: 8 },
]
