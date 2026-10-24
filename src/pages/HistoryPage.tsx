import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchLeagueContext, fetchRounds, fetchWinners } from '../lib/api'
import { formatDate, formatDayMonth, plural } from '../lib/format'
import { useAsync } from '../hooks/useAsync'
import { Badge, Card, EmptyState, ErrorNote, SectionHeader, Skeleton, Stat, cn } from '../components/ui'
import type { Round, RoundWinner } from '../lib/types'

function eraFor(round: Round, eras: { name: string; start_date: string; end_date: string | null }[]): string | null {
  const date = round.round_date.slice(0, 10)
  const match = eras.find(
    (era) => date >= era.start_date && (era.end_date === null || date <= era.end_date),
  )
  return match?.name ?? null
}

export function HistoryPage() {
  const all = useAsync(async () => {
    const [rounds, winners, context] = await Promise.all([
      fetchRounds(120),
      fetchWinners(),
      fetchLeagueContext(),
    ])
    return { rounds, winners, context }
  }, [])

  const [showAll, setShowAll] = useState(false)

  const data = all.data
  const rounds = useMemo(() => {
    const list = data?.rounds ?? []
    const filtered = showAll ? list : list.filter((round) => round.status === 'completed')
    return [...filtered].sort((a, b) => b.round_date.localeCompare(a.round_date))
  }, [data?.rounds, showAll])

  const winnersByRound = useMemo(() => {
    const map = new Map<string, RoundWinner[]>()
    for (const winner of data?.winners ?? []) {
      const list = map.get(winner.round_id) ?? []
      list.push(winner)
      map.set(winner.round_id, list)
    }
    return map
  }, [data?.winners])

  const ownerName = (winner: RoundWinner): string => {
    if (winner.team_id) {
      return data?.context.teams.find((team) => team.id === winner.team_id)?.name ?? 'Team'
    }
    return data?.context.players.find((player) => player.id === winner.player_id)?.name ?? 'Player'
  }

  const completed = (data?.rounds ?? []).filter((round) => round.status === 'completed')
  const perfectCoupons = (data?.winners ?? []).filter((winner) => winner.hits === winner.matches && winner.matches > 0)

  const groups = useMemo(() => {
    const map = new Map<string, Round[]>()
    for (const round of rounds) {
      const year = round.round_date.slice(0, 4)
      const list = map.get(year) ?? []
      list.push(round)
      map.set(year, list)
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]))
  }, [rounds])

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="label">Archive</div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">History</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Every round, its winners and the exact team compositions of the era it belonged to.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowAll((value) => !value)}
          className="btn btn-ghost btn-sm"
        >
          {showAll ? 'Completed only' : 'Include live & upcoming'}
        </button>
      </div>

      {all.error ? <ErrorNote message={all.error} onRetry={all.refresh} /> : null}

      {data ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Rounds played" value={completed.length} sub={`${plural(data.rounds.length, 'round')} on record`} />
          <Stat
            label="Perfect coupons"
            value={perfectCoupons.length}
            sub="all matches correct"
            tone="lime"
          />
          <Stat
            label="Eras"
            value={data.context.eras.length}
            sub={data.context.eras.find((era) => era.is_active)?.name ?? 'none active'}
            tone="sky"
          />
          <Stat
            label="Players all-time"
            value={data.context.players.length}
            sub={`${data.context.teams.length} teams registered`}
          />
        </div>
      ) : null}

      {all.loading && !data ? (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : rounds.length === 0 ? (
        <EmptyState
          title="Nothing archived yet"
          description="Rounds move here automatically once every match has a final outcome."
          action={
            <Link to="/admin" className="btn btn-primary btn-sm">
              Create a round
            </Link>
          }
        />
      ) : (
        <div className="space-y-6">
          {groups.map(([year, yearRounds]) => (
            <section key={year} className="space-y-2">
              <SectionHeader eyebrow={`${yearRounds.length} ${plural(yearRounds.length, 'round')}`} title={year} />
              <div className="space-y-2">
                {yearRounds.map((round) => {
                  const winners = winnersByRound.get(round.id) ?? []
                  const era = eraFor(round, data?.context.eras ?? [])
                  return (
                    <Link
                      key={round.id}
                      to={round.status === 'completed' ? `/history/${round.id}` : `/round/${round.id}`}
                      className={cn(
                        'panel panel-hover flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3',
                      )}
                    >
                      <div className="w-14 shrink-0">
                        <div className="tnum text-sm font-semibold text-chalk">
                          {formatDayMonth(round.round_date)}
                        </div>
                        <div className="text-[10px] text-muted-2">{round.match_count} matches</div>
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-chalk">{round.title}</div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10.5px] text-muted-2">
                          <span>{round.mode === 'team' ? 'Team' : 'Meetup'}</span>
                          <span aria-hidden="true">·</span>
                          <span>
                            {round.svenska_spel_product}
                            {round.draw_number ? ` #${round.draw_number}` : ''}
                          </span>
                          {era ? (
                            <>
                              <span aria-hidden="true">·</span>
                              <span>{era}</span>
                            </>
                          ) : null}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        {round.status !== 'completed' ? (
                          <Badge tone={round.status === 'live' ? 'amber' : 'neutral'}>
                            {round.status === 'live' ? 'Live' : 'Upcoming'}
                          </Badge>
                        ) : winners.length === 0 ? (
                          <Badge>no winner</Badge>
                        ) : (
                          winners.slice(0, 3).map((winner) => (
                            <Badge key={winner.coupon_id} tone="lime">
                              {ownerName(winner)} · {winner.hits}/{winner.matches}
                            </Badge>
                          ))
                        )}
                        {winners.length > 3 ? <Badge>+{winners.length - 3}</Badge> : null}
                      </div>
                    </Link>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      {data && data.context.eras.length > 0 ? (
        <Card className="p-4">
          <SectionHeader
            eyebrow="Cohorts"
            title="Team eras"
            description="A new era is a clean slate for the table while every past coupon keeps its original team."
          />
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {data.context.eras.map((era) => {
              const teams = data.context.teams.filter((team) => team.era_id === era.id)
              return (
                <div key={era.id} className="rounded-xl border border-line-soft bg-surface-2/40 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-chalk">{era.name}</span>
                    {era.is_active ? <Badge tone="lime">active</Badge> : null}
                  </div>
                  <div className="mt-1 text-[11px] text-muted-2">
                    {formatDate(era.start_date)} → {era.end_date ? formatDate(era.end_date) : 'present'}
                  </div>
                  <ul className="mt-2 space-y-1 text-xs text-muted">
                    {teams.length === 0 ? <li>No teams recorded.</li> : null}
                    {teams.map((team) => (
                      <li key={team.id}>
                        <span className="text-chalk">{team.name}</span>
                        {' — '}
                        {data.context.players.find((p) => p.id === team.player_1_id)?.name ?? '?'}
                        {' & '}
                        {data.context.players.find((p) => p.id === team.player_2_id)?.name ?? '?'}
                      </li>
                    ))}
                  </ul>
                </div>
              )
            })}
          </div>
        </Card>
      ) : null}
    </div>
  )
}
