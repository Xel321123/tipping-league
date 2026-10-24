import { db, toApiError } from './supabase'
import type {
  Coupon,
  CouponCard,
  CouponScore,
  CouponSelection,
  PickDistribution,
  Player,
  PlayerEraStats,
  PlayerStats,
  Round,
  RoundBundle,
  RoundMatch,
  RoundWinner,
  Sign,
  Team,
  TeamEra,
  TeamStats,
} from './types'

type QueryResult = { data: unknown; error: unknown }

async function rows<T>(query: PromiseLike<QueryResult>, fallback: string): Promise<T[]> {
  const { data, error } = await query
  if (error) throw toApiError(error as never, fallback)
  return (data ?? []) as T[]
}

async function row<T>(query: PromiseLike<QueryResult>, fallback: string): Promise<T | null> {
  const { data, error } = await query
  if (error) throw toApiError(error as never, fallback)
  return (data as T | null) ?? null
}

// ---------------------------------------------------------------------------
// League context (players / eras / teams) — small, fetched together, cached
// briefly so tab switches do not re-download it.
// ---------------------------------------------------------------------------
export interface LeagueContext {
  players: Player[]
  eras: TeamEra[]
  teams: Team[]
}

let contextCache: { at: number; value: LeagueContext } | null = null
const CONTEXT_TTL = 30_000

export async function fetchLeagueContext(force = false): Promise<LeagueContext> {
  if (!force && contextCache && Date.now() - contextCache.at < CONTEXT_TTL) {
    return contextCache.value
  }
  const client = db()
  const [players, eras, teams] = await Promise.all([
    rows<Player>(client.from('players').select('*').order('name'), 'Could not load players'),
    rows<TeamEra>(
      client.from('team_eras').select('*').order('start_date', { ascending: false }),
      'Could not load eras',
    ),
    rows<Team>(client.from('teams').select('*'), 'Could not load teams'),
  ])
  const value: LeagueContext = { players, eras, teams }
  contextCache = { at: Date.now(), value }
  return value
}

export function invalidateLeagueContext(): void {
  contextCache = null
}

export function playerName(players: Player[], id: string | null): string {
  if (!id) return ''
  return players.find((player) => player.id === id)?.name ?? 'Unknown'
}

// ---------------------------------------------------------------------------
// Rounds
// ---------------------------------------------------------------------------
export async function fetchRounds(limit = 60): Promise<Round[]> {
  return rows<Round>(
    db().from('rounds').select('*').order('round_date', { ascending: false }).limit(limit),
    'Could not load rounds',
  )
}

/** The round the live board should show: live first, then next up, then latest. */
export async function fetchSpotlightRound(): Promise<Round | null> {
  const rounds = await fetchRounds(40)
  if (rounds.length === 0) return null
  const live = rounds.find((round) => round.status === 'live')
  if (live) return live
  const upcoming = [...rounds]
    .filter((round) => round.status === 'upcoming')
    .sort((a, b) => a.round_date.localeCompare(b.round_date))
  if (upcoming[0]) return upcoming[0]
  return rounds[0] ?? null
}

export async function fetchRoundBundle(roundId: string): Promise<RoundBundle> {
  const client = db()
  const round = await row<Round>(
    client.from('rounds').select('*').eq('id', roundId).maybeSingle(),
    'Could not load the round',
  )
  if (!round) throw new Error('That round no longer exists.')

  const [matches, coupons, scores, picks] = await Promise.all([
    rows<RoundMatch>(
      client.from('round_matches').select('*').eq('round_id', roundId).order('match_number'),
      'Could not load matches',
    ),
    rows<Coupon>(client.from('coupons').select('*').eq('round_id', roundId), 'Could not load coupons'),
    rows<CouponScore>(
      client.from('v_coupon_scores').select('*').eq('round_id', roundId),
      'Could not load coupon scores',
    ),
    rows<PickDistribution>(
      client.from('v_pick_distribution').select('*').eq('round_id', roundId),
      'Could not load pick distribution',
    ),
  ])

  const couponIds = coupons.map((coupon) => coupon.id)
  const selections =
    couponIds.length > 0
      ? await rows<CouponSelection>(
          client.from('coupon_selections').select('*').in('coupon_id', couponIds),
          'Could not load selections',
        )
      : []

  const context = await fetchLeagueContext()
  const scoreByCoupon = new Map(scores.map((score) => [score.coupon_id, score]))

  const cards: CouponCard[] = coupons.map((coupon) => {
    const team = coupon.team_id
      ? context.teams.find((candidate) => candidate.id === coupon.team_id)
      : undefined
    const player = coupon.player_id
      ? context.players.find((candidate) => candidate.id === coupon.player_id)
      : undefined

    const owner = team?.name ?? player?.name ?? 'Unknown'
    const ownerDetail = team
      ? [playerName(context.players, team.player_1_id), playerName(context.players, team.player_2_id)]
          .filter(Boolean)
          .join(' & ')
      : coupon.player_id
        ? 'Solo entry'
        : ''

    const signs: Record<number, Sign[]> = {}
    for (const selection of selections) {
      if (selection.coupon_id === coupon.id) {
        signs[selection.match_number] = selection.signs
      }
    }

    return {
      coupon,
      score: scoreByCoupon.get(coupon.id) ?? null,
      owner,
      ownerDetail,
      selections: signs,
    }
  })

  cards.sort((a, b) => {
    const hitsA = a.score?.hits ?? 0
    const hitsB = b.score?.hits ?? 0
    if (hitsB !== hitsA) return hitsB - hitsA
    const rowsA = a.score?.rows_alive ?? 0
    const rowsB = b.score?.rows_alive ?? 0
    if (rowsB !== rowsA) return rowsB - rowsA
    return a.owner.localeCompare(b.owner)
  })

  return { round, matches, coupons: cards, picks }
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------
export async function fetchTeamStats(eraId: string): Promise<TeamStats[]> {
  return rows<TeamStats>(
    db().from('v_team_stats').select('*').eq('era_id', eraId),
    'Could not load the table',
  )
}

export async function fetchPlayerStats(): Promise<PlayerStats[]> {
  return rows<PlayerStats>(
    db().from('v_player_stats').select('*').order('name'),
    'Could not load player stats',
  )
}

export async function fetchPlayerEraStats(): Promise<PlayerEraStats[]> {
  return rows<PlayerEraStats>(
    db().from('v_player_era_stats').select('*'),
    'Could not load per-era player stats',
  )
}

export async function fetchWinners(): Promise<RoundWinner[]> {
  return rows<RoundWinner>(db().from('v_round_winners').select('*'), 'Could not load winners')
}

export async function fetchCouponScoresForRounds(roundIds: string[]): Promise<CouponScore[]> {
  if (roundIds.length === 0) return []
  return rows<CouponScore>(
    db().from('v_coupon_scores').select('*').in('round_id', roundIds),
    'Could not load coupon scores',
  )
}

export type { Sign } from './types'
