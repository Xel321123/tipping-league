export type Sign = '1' | 'X' | '2'
export type RoundMode = 'team' | 'individual'
export type RoundStatus = 'upcoming' | 'live' | 'completed'
export type MatchStatus = 'not_started' | 'live' | 'finished' | 'cancelled'

export interface Player {
  id: string
  name: string
  nickname: string | null
  is_active: boolean
}

export interface TeamEra {
  id: string
  name: string
  start_date: string
  end_date: string | null
  is_active: boolean
  notes: string | null
}

export interface Team {
  id: string
  era_id: string
  name: string
  player_1_id: string
  player_2_id: string
}

export interface Round {
  id: string
  title: string
  mode: RoundMode
  svenska_spel_product: string
  svenska_spel_draw_id: string | null
  draw_number: number | null
  match_count: number
  status: RoundStatus
  round_date: string
  api_synced_at: string | null
  notes: string | null
}

export interface RoundMatch {
  id: string
  round_id: string
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
  last_synced_at: string | null
}

export interface Coupon {
  id: string
  round_id: string
  team_id: string | null
  player_id: string | null
  total_rows: number
  winnings: number
  note: string | null
  created_at: string
  updated_at: string
}

export interface CouponSelection {
  id: string
  coupon_id: string
  match_number: number
  signs: Sign[]
}

export interface CouponScore {
  coupon_id: string
  round_id: string
  team_id: string | null
  player_id: string | null
  total_rows: number
  note: string | null
  matches: number
  decidable: number
  resolved: number
  hits: number
  misses: number
  perfect: boolean
  rows_alive: number
}

export interface TeamStats {
  team_id: string
  team_name: string
  era_id: string
  era_name: string
  era_start: string
  era_end: string | null
  player_1_id: string
  player_1_name: string
  player_2_id: string
  player_2_name: string
  rounds_played: number
  perfect_rounds: number
  total_hits: number
  total_resolved: number
  total_matches: number
  total_rows: number
  hit_pct: number | null
  avg_hits: number | null
  wins: number
  total_winnings: number
}

export interface PlayerStats {
  player_id: string
  name: string
  nickname: string | null
  is_active: boolean
  rounds_played: number
  individual_rounds: number
  team_rounds: number
  total_hits: number
  total_resolved: number
  perfect_rounds: number
  hit_pct: number | null
  wins: number
  total_winnings: number
}

export interface PlayerEraStats {
  player_id: string
  player_name: string
  era_id: string
  era_name: string
  rounds_played: number
  total_hits: number
  total_resolved: number
  perfect_rounds: number
  total_winnings: number
  hit_pct: number | null
  wins: number
}

export interface RoundWinner {
  round_id: string
  coupon_id: string
  team_id: string | null
  player_id: string | null
  hits: number
  matches: number
  total_rows: number
}

export interface PickDistribution {
  round_id: string
  match_number: number
  picks_1: number
  picks_x: number
  picks_2: number
  coupons: number
}

export interface CouponCard {
  coupon: Coupon
  score: CouponScore | null
  owner: string
  ownerDetail: string
  selections: Record<number, Sign[]>
}

export interface RoundBundle {
  round: Round
  matches: RoundMatch[]
  coupons: CouponCard[]
  picks: PickDistribution[]
}

export interface MatchOutcome {
  match: RoundMatch
  state: 'pending' | 'live' | 'hit' | 'miss' | 'void'
  effective: Sign | null
  signs: Sign[]
}
