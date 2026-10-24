import { formatPct } from '../lib/format'
import { fetchLeagueContext, fetchPlayerStats } from '../lib/api'
import { useAsync } from '../hooks/useAsync'
import { Badge, Card, EmptyState, ErrorNote, Skeleton, cn } from '../components/ui'
import type { PlayerStats, Team } from '../lib/types'

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
  const stats = useAsync(() => fetchPlayerStats(), [])

  const activeEra = context.data?.eras.find((era) => era.is_active)
  const activeTeams = (context.data?.teams ?? []).filter((team) => team.era_id === activeEra?.id)
  const names = new Map((context.data?.players ?? []).map((player) => [player.id, player.name]))

  const ranked = [...(stats.data ?? [])].sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins
    if (b.perfect_rounds !== a.perfect_rounds) return b.perfect_rounds - a.perfect_rounds
    const pctA = a.hit_pct ?? -1
    const pctB = b.hit_pct ?? -1
    return pctB - pctA
  })

  return (
    <div className="space-y-5">
      <div>
        <div className="label">Individuals</div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Player stats</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Every coupon a player touched: joint team coupons plus their own entries at meetups. Team
          composition is resolved from the era the round was played in, never from today&apos;s teams.
        </p>
      </div>

      {context.error ? <ErrorNote message={context.error} onRetry={context.refresh} /> : null}
      {stats.error ? <ErrorNote message={stats.error} onRetry={stats.refresh} /> : null}

      {stats.loading && !stats.data ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((key) => (
            <Skeleton key={key} className="h-44 w-full" />
          ))}
        </div>
      ) : ranked.length === 0 ? (
        <EmptyState title="No players yet" description="Add the eight players in the admin panel to get started." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {ranked.map((player, index) => (
            <PlayerCard
              key={player.player_id}
              player={player}
              index={index}
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
            <span className="text-chalk">Hits</span> — individual signs that matched the final result,
            across every coupon the player is credited with.
          </li>
          <li>
            <span className="text-chalk">Hit%</span> — hits divided by decided signs, so a live round does
            not drag the average down.
          </li>
          <li>
            <span className="text-chalk">Wins</span> — rounds where their coupon was (joint) top of the
            board.
          </li>
        </ul>
      </Card>
    </div>
  )
}

function PlayerCard({
  player,
  index,
  team,
  names,
}: {
  player: PlayerStats
  index: number
  team?: Team
  names: Map<string, string>
}) {
  const pct = player.hit_pct ?? 0

  return (
    <Card className="p-4">
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
        <div className="text-right text-[11px] text-muted-2">
          <div>
            <span className="tnum text-chalk">{player.total_hits}</span>/
            <span className="tnum">{player.total_resolved || '—'}</span> hits
          </div>
          <div>
            <span className="tnum text-chalk">{player.rounds_played}</span> rounds
          </div>
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
    </Card>
  )
}
