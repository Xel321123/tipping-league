import type { MatchStatus, RoundMatch, Sign } from './types'

export function signFromScore(home: number, away: number): Sign {
  if (home > away) return '1'
  if (home === away) return 'X'
  return '2'
}

export function effectiveResult(match: RoundMatch): Sign | null {
  if (match.cancelled) return null
  return match.outcome ?? match.current_result
}

/**
 * Colour state for one sign cell on one coupon card.
 * Live hits stay amber — only a final outcome turns a cell green.
 */
export function cellState(
  match: RoundMatch | undefined,
  signs: Sign[] | undefined,
): 'pending' | 'live' | 'void' | 'hit' | 'miss' {
  if (!match || !signs || signs.length === 0) return 'pending'
  if (match.cancelled) return 'void'

  const effective = effectiveResult(match)
  if (!effective) return 'pending'
  if (!signs.includes(effective)) return 'miss'
  return match.outcome ? 'hit' : 'live'
}

export interface LiveTally {
  hits: number
  resolved: number
  total: number
  misses: number
  alive: boolean
  rowsAlive: number
}

/**
 * Client-side mirror of the SQL scoring view — used only for optimistic
 * previews while a round is being edited in the admin panel.
 */
export function tallySelections(
  matches: RoundMatch[],
  selections: Record<number, Sign[]>,
): LiveTally {
  let hits = 0
  let resolved = 0
  let misses = 0
  let activeRows = 1

  for (const match of matches) {
    const signs = selections[match.match_number] ?? []
    if (match.cancelled) continue
    const effective = effectiveResult(match)
    if (!effective) {
      activeRows *= Math.max(signs.length, 1)
      continue
    }
    resolved += 1
    if (signs.includes(effective)) {
      hits += 1
    } else {
      misses += 1
      activeRows = 0
    }
  }

  return {
    hits,
    resolved,
    total: matches.length,
    misses,
    alive: misses === 0,
    rowsAlive: activeRows,
  }
}

export const MATCH_STATUS: readonly MatchStatus[] = [
  'not_started',
  'live',
  'finished',
  'cancelled',
]

export const SIGNS: readonly Sign[] = ['1', 'X', '2']
