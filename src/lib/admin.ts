import { db, toApiError } from './supabase'
import { invalidateLeagueContext } from './api'
import type { MatchStatus, RoundMode, Sign } from './types'

interface RpcError {
  message?: string
  details?: string
  hint?: string
  code?: string
}

async function rpc<T>(fn: string, args: Record<string, unknown>, fallback: string): Promise<T> {
  const { data, error } = await db().rpc(fn, args)
  if (error) throw toApiError(error as RpcError, fallback)
  return data as T
}

export interface LoginResult {
  token: string
  expires_at: string
  must_change_passcode: boolean
}

export function adminLogin(passcode: string): Promise<LoginResult> {
  return rpc<LoginResult>('admin_login', { p_passcode: passcode }, 'Sign-in failed')
}

export interface SessionCheck {
  valid: boolean
  expires_at: string | null
  must_change_passcode: boolean
}

export function adminSessionValid(token: string): Promise<SessionCheck> {
  return rpc<SessionCheck>('admin_session_valid', { p_token: token }, 'Session check failed')
}

export function adminLogout(token: string): Promise<void> {
  return rpc<void>('admin_logout', { p_token: token }, 'Sign-out failed')
}

export function adminChangePasscode(token: string, passcode: string): Promise<void> {
  return rpc<void>(
    'admin_change_passcode',
    { p_token: token, p_new_passcode: passcode },
    'Could not change the passcode',
  )
}

export function savePlayer(
  token: string,
  input: { id?: string | null; name: string; nickname?: string | null; isActive?: boolean },
): Promise<string> {
  invalidateLeagueContext()
  return rpc<string>(
    'admin_save_player',
    {
      p_token: token,
      p_id: input.id ?? null,
      p_name: input.name,
      p_nickname: input.nickname ?? null,
      p_is_active: input.isActive ?? true,
    },
    'Could not save the player',
  )
}

export function saveEra(
  token: string,
  input: {
    id?: string | null
    name: string
    startDate: string
    endDate?: string | null
    isActive?: boolean
    notes?: string | null
  },
): Promise<string> {
  invalidateLeagueContext()
  return rpc<string>(
    'admin_save_era',
    {
      p_token: token,
      p_id: input.id ?? null,
      p_name: input.name,
      p_start_date: input.startDate,
      p_end_date: input.endDate ?? null,
      p_is_active: input.isActive ?? true,
      p_notes: input.notes ?? null,
    },
    'Could not save the era',
  )
}

export function saveTeam(
  token: string,
  input: {
    id?: string | null
    eraId: string
    name: string
    player1Id: string
    player2Id: string
  },
): Promise<string> {
  invalidateLeagueContext()
  return rpc<string>(
    'admin_save_team',
    {
      p_token: token,
      p_id: input.id ?? null,
      p_era_id: input.eraId,
      p_name: input.name,
      p_player_1_id: input.player1Id,
      p_player_2_id: input.player2Id,
    },
    'Could not save the team',
  )
}

export function deleteTeam(token: string, id: string): Promise<void> {
  invalidateLeagueContext()
  return rpc<void>('admin_delete_team', { p_token: token, p_id: id }, 'Could not delete the team')
}

export function deleteEra(token: string, id: string): Promise<void> {
  invalidateLeagueContext()
  return rpc<void>('admin_delete_era', { p_token: token, p_id: id }, 'Could not delete the era')
}

export function deletePlayer(token: string, id: string): Promise<void> {
  invalidateLeagueContext()
  return rpc<void>('admin_delete_player', { p_token: token, p_id: id }, 'Could not delete the player')
}

export interface RoundInput {
  id?: string | null
  title: string
  mode: RoundMode
  product: string
  drawId?: string | null
  drawNumber?: number | null
  roundDate: string
  matchCount: number
  notes?: string | null
}

export function saveRound(token: string, input: RoundInput): Promise<string> {
  return rpc<string>(
    'admin_save_round',
    {
      p_token: token,
      p_id: input.id ?? null,
      p_title: input.title,
      p_mode: input.mode,
      p_product: input.product,
      p_draw_id: input.drawId ?? null,
      p_draw_number: input.drawNumber ?? null,
      p_round_date: input.roundDate,
      p_match_count: input.matchCount,
      p_notes: input.notes ?? null,
    },
    'Could not save the round',
  )
}

export function deleteRound(token: string, id: string): Promise<void> {
  return rpc<void>('admin_delete_round', { p_token: token, p_id: id }, 'Could not delete the round')
}

export interface SyncMatchInput {
  match_number: number
  home_team: string
  away_team: string
  kickoff?: string | null
  home_score?: number | null
  away_score?: number | null
  match_status?: MatchStatus
  current_result?: Sign | null
  outcome?: Sign | null
  cancelled?: boolean
}

export function syncMatches(
  token: string,
  roundId: string,
  matches: SyncMatchInput[],
): Promise<number> {
  return rpc<number>(
    'admin_sync_matches',
    { p_token: token, p_round_id: roundId, p_matches: matches },
    'Could not save the matches',
  )
}

export function setMatchState(
  token: string,
  input: {
    roundId: string
    matchNumber: number
    homeScore?: number | null
    awayScore?: number | null
    matchStatus?: MatchStatus | null
    outcome?: Sign | null
    cancelled?: boolean | null
  },
): Promise<void> {
  return rpc<void>(
    'admin_set_match_state',
    {
      p_token: token,
      p_round_id: input.roundId,
      p_match_number: input.matchNumber,
      p_home_score: input.homeScore ?? null,
      p_away_score: input.awayScore ?? null,
      p_match_status: input.matchStatus ?? null,
      p_outcome: input.outcome ?? null,
      p_cancelled: input.cancelled ?? null,
    },
    'Could not update the match',
  )
}

export function saveCoupon(
  token: string,
  input: {
    roundId: string
    teamId?: string | null
    playerId?: string | null
    selections: Array<{ match_number: number; signs: Sign[] }>
    note?: string | null
  },
): Promise<string> {
  return rpc<string>(
    'admin_save_coupon',
    {
      p_token: token,
      p_round_id: input.roundId,
      p_team_id: input.teamId ?? null,
      p_player_id: input.playerId ?? null,
      p_selections: input.selections,
      p_note: input.note ?? null,
    },
    'Could not save the coupon',
  )
}

export function deleteCoupon(token: string, id: string): Promise<void> {
  return rpc<void>('admin_delete_coupon', { p_token: token, p_coupon_id: id }, 'Could not delete the coupon')
}
