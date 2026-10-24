import { useMemo, useState } from 'react'
import { formatPct, formatSek } from '../lib/format'
import { fetchLeagueContext, fetchPlayerEraStats, fetchPlayerStats } from '../lib/api'
import { useAsync } from '../hooks/useAsync'
import { Badge, Card, EmptyState, ErrorNote, Skeleton, cn } from '../components/ui'
import type { Team } from '../lib/types'

interface PlayerRow {
  player_id: string
  name: string
  is_active: boolean
  rounds_played: number
  total_hits: number
  total_resolved: number
  perfect_rounds: number
  hit_pct: number | null
  wins: number
  total_winnings: number
  individual_rounds: number
}

function currentTeam(teams: Team[], playerId: string): Team | undefined {
  return teams.find((team) => team.player_1_id === playerId || team.player_2_id === playerId)
}

function Partner({ team, playerId, names }: { team?: Team; playerId: string; names: Map<string, string> }) {
  if (!team) return <span className="text-muted-2">No team this era</span>
  const partnerId = team.player_1_id === playerId ? team.player_2_id : team.player_1_id
  return (
    <span className="truncate">
      {team.name} <span className="text-muted-2">· with {names.get(partnerId) ?? '—'}</span>
    </span>
  )
}

export function PlayersPage() {
  const context = useAsync(() => fetchLeagueContext(), [])
  const allTime = useAsync(() => fetchPlayerStats(), [])
  const perEra = useAsync(() => fetchPlayerEraStats(), [])
  const [eraId, setEraId] = useState<'all' | string>('all')
  const [sortBy, setSortBy] = useState<'wins' | 'winnings'>('wins')

  const eras = context.data?.eras ?? []
  const activeEra = eras.find((era) => era.is_active)
  const activeTeams = (context.data?.teams ?? []).filter((team) => team.era_id === activeEra?.id)
  const names = new Map((context.data?.players ?? []).map((player) => [player.id, player.name]))

  const rows = useMemo<PlayerRow[]>(() => {
    if (eraId === 'all') {
      return (allTime.data ?? []).map((player) => ({
        player_id: player.player_id,
        name: player.name,
        is_active: player.is_active,
        rounds_played: player.rounds_played,
        total_hits: player.total_hits,
        total_resolved: player.total_resolved,
        perfect_rounds: player.perfect_rounds,
        hit_pct: player.hit_pct,
        wins: player.wins,
        total_winnings: player.total_winnings,
        individual_rounds: player.individual_rounds,
      }))
    }

    const byId = new Map((context.data?.players ?? []).map((player) => [player.id, player]))
    return (perEra.data ?? [])
      .filter((row) => row.era_id === eraId)
      .map((row) => ({
        player_id: row.player_id,
        name: row.player_name,
        is_active: byId.get(row.player_id)?.is_active ?? true,
        rounds_played: row.rounds_played,
        total_hits: row.total_hits,
        total_resolved: row.total_resolved,
        perfect_rounds: row.perfect_rounds,
        hit_pct: row.hit_pct,
        wins: row.wins,
        total_winnings: row.total_winnings,
        individual_rounds: 0,
      }))
  }, [eraId, allTime.data, perEra.data, context.data])

  const ranked = useMemo(
    () =>
      [...rows].sort((a, b) => {
        if (sortBy === 'winnings') {
          if (b.total_winnings !== a.total_winnings) return b.total_winnings - a.total_winnings
          return (b.hit_pct ?? -1) - (a.hit_pct ?? -1)
        }
        if (b.wins !== a.wins) return b.wins - a.wins
        if (b.perfect_rounds !== a.perfect_rounds) return b.perfect_rounds - a.perfect_rounds
        return (b.hit_pct ?? -1) - (a.hit_pct ?? -1)
      }),
    [rows, sortBy],
  )

  const error = context.error ?? allTime.error ?? perEra.error
  const loading = (allTime.loading || perEra.loading) && !allTime.data

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="label">Individuals</div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Player stats</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Every coupon a player touched: joint team coupons plus their own meetup entries. Switch
            era to see who won the most in that cohort.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1 rounded-full border border-line bg-surface-2/50 p-1">
            <button
              type="button"
              onClick={() => setEraId('all')}
              className={cn(
                'rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                eraId === 'all' ? 'bg-chalk text-ink' : 'text-muted hover:bg-surface-3 hover:text-chalk',
              )}
            >
              All time
            </button>
            {eras.map((era) => (
              <button
                key={era.id}
                type="button"
                onClick={() => setEraId(era.id)}
                className={cn(
                  'rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                  eraId === era.id ? 'bg-chalk text-ink' : 'text-muted hover:bg-surface-3 hover:text-chalk',
                )}
              >
                {era.name}
              </button>
            ))}
          </div>

          <div className="flex gap-1 rounded-full border border-line bg-surface-2/50 p-1">
            {(
              [
                ['wins', 'Most wins'],
                ['winnings', 'Most won'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setSortBy(value)}
                className={cn(
                  'rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                  sortBy === value ? 'bg-chalk text-ink' : 'text-muted hover:bg-surface-3 hover:text-chalk',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error ? <ErrorNote message={error} onRetry={() => { context.refresh(); allTime.refresh(); perEra.refresh() }} /> : null}

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((key) => (
            <Skeleton key={key} className="h-48 w-full" />
          ))}
        </div>
      ) : ranked.length === 0 ? (
        <EmptyState
          title={eraId === 'all' ? 'No players yet' : 'Nobody played in this era yet'}
          description="Add the eight players in the admin panel, or pick another era."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {ranked.map((player, index) => (
            <PlayerCard
              key={player.player_id}
              player={player}
              index={index}
              sortBy={sortBy}
              team={currentTeam(activeTeams, player.player_id)}
              names={names}
            />
          ))}
        </div>
      )}

      <Card className="p-4">
        <div className="label mb-2">Reading the numbers</div>
        <ul className="space-y-1.5 text-sm text-muted">
          <li>
            <span className="text-chalk">Won</span> — the coupon payouts credited to this player.
            A team coupon counts in full for both members, so player totals can exceed the league
            total. Enter payouts in Admin → Results after each round.
          </li>
          <li>
            <span className="text-chalk">Hits</span> — individual signs that matched the final result.
          </li>
          <li>
            <span className="text-chalk">Hit%</span> — hits divided by decided signs, so a live round
            does not drag the average down.
          </li>
          <li>
            <span className="text-chalk">Wins</span> — rounds where their coupon (joint or solo) was
            top of the board.
          </li>
        </ul>
      </Card>
    </div>
  )
}

function PlayerCard({
  player,
  index,
  sortBy,
  team,
  names,
}: {
  player: PlayerRow
  index: number
  sortBy: 'wins' | 'winnings'
  team?: Team
  names: Map<string, string>
}) {
  const pct = player.hit_pct ?? 0

  return (
    <Card className={cn('p-4', sortBy === 'winnings' && index === 0 && player.total_winnings > 0 && 'border-lime/30')}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-[15px] font-semibold tracking-tight text-chalk">{player.name}</h3>
          <p className="mt-0.5 truncate text-[11px] text-muted-2">
            <Partner team={team} playerId={player.player_id} names={names} />
          </p>
        </div>
        <span className={cn('tnum text-xs font-semibold', index === 0 ? 'text-lime' : 'text-muted-2')}>
          #{index + 1}
        </span>
      </div>

      <div className="mt-3 flex items-end justify-between gap-2">
        <div>
          <div className="tnum text-2xl font-semibold leading-none tracking-tight">
            {formatPct(player.hit_pct)}
          </div>
          <div className="label mt-1">hit rate</div>
        </div>
        <div className="text-right">
          <div className="tnum text-lg font-semibold leading-none text-lime">
            {formatSek(player.total_winnings)}
          </div>
          <div className="label mt-1">won</div>
        </div>
      </div>

      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-3">
        <div className="h-full rounded-full bg-lime/80" style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <Badge tone={player.wins > 0 ? 'lime' : 'neutral'}>{player.wins} wins</Badge>
        <Badge>{player.perfect_rounds} perfect</Badge>
        {player.individual_rounds > 0 ? <Badge tone="sky">{player.individual_rounds} solo</Badge> : null}
        {!player.is_active ? <Badge tone="rose">inactive</Badge> : null}
      </div>

      <div className="mt-2 text-[11px] text-muted-2">
        <span className="tnum text-chalk">{player.total_hits}</span>/
        <span className="tnum">{player.total_resolved || '—'}</span> hits ·{' '}
        <span className="tnum text-chalk">{player.rounds_played}</span> rounds
      </div>
    </Card>
  )
}
