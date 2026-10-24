// Supabase Edge Function: ss-sync
//
// Keeps a round's fixtures/scores in step with Svenska Spel without needing an
// admin session, so the public board is not stuck on yesterday's results.
//
// The service key never leaves this function; the DB side is restricted to
// service_role and throttled to one pull per round per 30 seconds.
//
// Call:
//   GET /functions/v1/ss-sync?round=<uuid>
//   GET /functions/v1/ss-sync?all=1        (every live round)
//
// Deploy:
//   supabase functions deploy ss-sync --project-ref <ref> --no-verify-jwt

const UPSTREAM = 'https://api.spela.svenskaspel.se'
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_KEY =
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SECRET_KEY') ?? ''

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' },
  })
}

type Sign = '1' | 'X' | '2'

const signFromScore = (home: number, away: number): Sign =>
  home > away ? '1' : home === away ? 'X' : '2'

function toScore(value: unknown): number | null {
  const next = Number(value)
  return Number.isFinite(next) ? next : null
}

// Mirrors src/lib/svenskaSpel.ts — keep the two in step.
function normalizeDraw(draw: Record<string, unknown>, limit = 13) {
  const events = [...((draw.drawEvents as Record<string, unknown>[]) ?? [])].sort(
    (a, b) => Number(a.eventNumber) - Number(b.eventNumber),
  )

  return events.slice(0, limit).map((event, index) => {
    const match = (event.match ?? {}) as Record<string, unknown>
    const participants = (match.participants as Record<string, string>[]) ?? []
    const description = String(event.eventDescription ?? '')
    const [descriptionHome, descriptionAway] = description.split(/\s+-\s+|\s+–\s+/)
    const home = participants.find((p) => p.type === 'home')?.name ?? descriptionHome?.trim() ?? '?'
    const away = participants.find((p) => p.type === 'away')?.name ?? descriptionAway?.trim() ?? '?'

    const lines = (match.result as Record<string, string>[]) ?? []
    const fullTime = lines.find((line) => Number(line.type) === 2)
    const current = lines.find((line) => Number(line.type) === 9)

    const cancelled = Boolean(event.cancelled)
    const statusId = Number(match.statusId)
    const finished = match.sportEventStatus === 'Ended' || statusId === 31
    const live =
      !cancelled &&
      !finished &&
      (match.sportEventStatus === 'Live' ||
        (Number.isFinite(statusId) && statusId > 0 && statusId !== 31))

    const matchStatus = cancelled
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
      homeScore !== null && awayScore !== null && matchStatus !== 'not_started'
        ? signFromScore(homeScore, awayScore)
        : null

    return {
      match_number: Number(event.eventNumber) || index + 1,
      home_team: home,
      away_team: away,
      kickoff: (match.matchStart as string) ?? null,
      home_score: homeScore,
      away_score: awayScore,
      match_status: matchStatus,
      current_result: currentResult,
      outcome,
      cancelled,
    }
  })
}

function rest(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Accept-Profile': 'tipping',
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
}

async function syncRound(roundId: string) {
  const lookup = await rest(
    `rounds?id=eq.${roundId}&select=id,title,svenska_spel_product,draw_number,status,api_synced_at`,
  )
  if (!lookup.ok) return { roundId, error: `round lookup ${lookup.status}` }
  const [round] = (await lookup.json()) as Record<string, unknown>[]
  if (!round) return { roundId, error: 'round not found' }

  const product = String(round.svenska_spel_product ?? '')
  const drawNumber = Number(round.draw_number)
  if (!product || !Number.isFinite(drawNumber) || drawNumber <= 0) {
    return { roundId, error: 'round has no product/draw number' }
  }

  const syncedAt = round.api_synced_at ? Date.parse(String(round.api_synced_at)) : 0
  if (syncedAt && Date.now() - syncedAt < 30_000) {
    return { roundId, skipped: 'fresh' }
  }

  const upstream = await fetch(`${UPSTREAM}/draw/1/${encodeURIComponent(product)}/draws/${drawNumber}`, {
    headers: { Accept: 'application/json', 'User-Agent': 'tipping-league/1.0' },
  })
  if (!upstream.ok) return { roundId, error: `svenska spel ${upstream.status}` }

  const payload = (await upstream.json()) as { draw?: Record<string, unknown> }
  const matches = normalizeDraw(payload.draw ?? {})
  if (matches.length === 0) return { roundId, error: 'draw has no matches' }

  const rpc = await rest('rpc/sync_matches_from_api', {
    method: 'POST',
    headers: { 'Content-Profile': 'tipping' },
    body: JSON.stringify({ p_round_id: roundId, p_matches: matches }),
  })

  if (!rpc.ok) {
    const detail = (await rpc.text()).slice(0, 200)
    return { roundId, error: `sync rpc ${rpc.status}`, detail }
  }

  const count = await rpc.json()
  return { roundId, title: round.title, draw: drawNumber, synced: count }
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (!SERVICE_KEY) return json({ error: 'Service key missing' }, 500)

  const url = new URL(request.url)
  const roundId = url.searchParams.get('round')
  const all = url.searchParams.get('all')

  try {
    if (roundId) {
      if (!/^[0-9a-f-]{36}$/i.test(roundId)) return json({ error: 'Invalid round id' }, 400)
      return json(await syncRound(roundId))
    }

    if (all) {
      const list = await rest(`rounds?status=eq.live&select=id`)
      if (!list.ok) return json({ error: `round list ${list.status}` }, 502)
      const rounds = (await list.json()) as { id: string }[]
      const results = []
      for (const row of rounds.slice(0, 5)) results.push(await syncRound(row.id))
      return json({ synced: results.length, results })
    }

    return json({ error: 'Pass ?round=<uuid> or ?all=1' }, 400)
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'sync failed' }, 502)
  }
})
