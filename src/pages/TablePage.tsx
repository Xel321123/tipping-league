import { useEffect, useState } from 'react'
import { fetchLeagueContext, fetchTeamStats } from '../lib/api'
import { formatDate, formatPct, formatRows } from '../lib/format'
import { useAsync } from '../hooks/useAsync'
import { cn, Card, EmptyState, ErrorNote, SectionHeader, Skeleton } from '../components/ui'
import type { TeamStats } from '../lib/types'

function rankTeams(stats: TeamStats[]): TeamStats[] {
  return [...stats].sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins
    if (b.perfect_rounds !== a.perfect_rounds) return b.perfect_rounds - a.perfect_rounds
    if (b.total_hits !== a.total_hits) return b.total_hits - a.total_hits
    return (b.hit_pct ?? 0) - (a.hit_pct ?? 0)
  })
}

const MEDALS = ['text-lime', 'text-chalk', 'text-amber']

export function TablePage() {
  const context = useAsync(() => fetchLeagueContext(), [])
  const eras = context.data?.eras ?? []
  const [eraId, setEraId] = useState<string | null>(null)

  useEffect(() => {
    if (!eraId && eras.length > 0) {
      setEraId(eras.find((era) => era.is_active)?.id ?? eras[0]!.id)
    }
  }, [eraId, eras])

  const stats = useAsync(
    () => (eraId ? fetchTeamStats(eraId) : Promise.resolve([])),
    [eraId],
    { enabled: Boolean(eraId) },
  )

  const era = eras.find((candidate) => candidate.id === eraId)
  const ranked = rankTeams(stats.data ?? [])

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="label">Standings</div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Team table</h1>
          <p className="mt-1 max-w-xl text-sm text-muted">
            Ranked by round wins, then perfect coupons, then total hits. Each era keeps its own teams,
            so a reshuffle never rewrites history.
          </p>
        </div>

        {eras.length > 0 ? (
          <div className="flex flex-wrap gap-1 rounded-full border border-line bg-surface-2/50 p-1">
            {eras.map((candidate) => (
              <button
                key={candidate.id}
                type="button"
                onClick={() => setEraId(candidate.id)}
                className={cn(
                  'rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                  candidate.id === eraId
                    ? 'bg-chalk text-ink'
                    : 'text-muted hover:bg-surface-3 hover:text-chalk',
                )}
              >
                {candidate.name}
                {candidate.is_active ? <span className="ml-1.5 text-[9px] uppercase">live</span> : null}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {context.error ? <ErrorNote message={context.error} onRetry={context.refresh} /> : null}
      {stats.error ? <ErrorNote message={stats.error} onRetry={stats.refresh} /> : null}

      {era ? (
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-2">
          <span className="chip">
            {formatDate(era.start_date)} → {era.end_date ? formatDate(era.end_date) : 'present'}
          </span>
          {era.is_active ? <span className="chip border-lime/30 bg-lime/10 text-lime">Active cohort</span> : null}
          {era.notes ? <span className="text-muted">{era.notes}</span> : null}
        </div>
      ) : null}

      {stats.loading && !stats.data ? (
        <Skeleton className="h-64 w-full" />
      ) : ranked.length === 0 ? (
        <EmptyState
          title="No teams in this era"
          description="Add teams in the admin panel — two players per team, pinned to the era that was in force."
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-line-soft text-left">
                  <th className="label px-4 py-3 font-semibold">#</th>
                  <th className="label px-2 py-3 font-semibold">Team</th>
                  <th className="label px-2 py-3 text-right font-semibold">R</th>
                  <th className="label px-2 py-3 text-right font-semibold">W</th>
                  <th className="label px-2 py-3 text-right font-semibold">Hits</th>
                  <th className="label hidden px-2 py-3 text-right font-semibold sm:table-cell">8/8</th>
                  <th className="label hidden px-2 py-3 text-right font-semibold sm:table-cell">Rows</th>
                  <th className="label px-4 py-3 text-right font-semibold">Hit%</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {ranked.map((row, index) => (
                  <tr key={row.team_id} className="row-hover">
                    <td className={cn('tnum px-4 py-3 text-sm font-semibold', MEDALS[index] ?? 'text-muted-2')}>
                      {index + 1}
                    </td>
                    <td className="px-2 py-3">
                      <div className="font-medium text-chalk">{row.team_name}</div>
                      <div className="text-[11px] text-muted-2">
                        {row.player_1_name} &amp; {row.player_2_name}
                      </div>
                    </td>
                    <td className="tnum px-2 py-3 text-right text-muted">{row.rounds_played}</td>
                    <td className="tnum px-2 py-3 text-right font-semibold text-lime">{row.wins}</td>
                    <td className="tnum px-2 py-3 text-right">
                      {row.total_hits}
                      <span className="text-muted-2">/{row.total_resolved || row.total_matches}</span>
                    </td>
                    <td className="tnum hidden px-2 py-3 text-right text-muted sm:table-cell">
                      {row.perfect_rounds}
                    </td>
                    <td className="tnum hidden px-2 py-3 text-right text-muted sm:table-cell">
                      {formatRows(row.total_rows)}
                    </td>
                    <td className="tnum px-4 py-3 text-right font-medium text-chalk">{formatPct(row.hit_pct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-1 border-t border-line-soft px-4 py-2.5 text-[10.5px] text-muted-2">
            <span>R rounds · W round wins · Hits correct signs</span>
            <span>8/8 perfect coupons · Rows total rema rows played</span>
          </div>
        </Card>
      )}

      <SectionHeader
        eyebrow="How it counts"
        title="Attribution rules"
        description="Team rounds credit both players. Meetup rounds credit the individual. A cancelled match is void and never breaks a coupon."
      />
    </div>
  )
}
