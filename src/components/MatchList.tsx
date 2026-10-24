import { cn } from './ui'
import { formatTime, matchStatusLabel, untilLabel } from '../lib/format'
import type { PickDistribution, RoundMatch, Sign } from '../lib/types'

export function SignBox({ sign, tone = 'neutral' }: { sign: Sign; tone?: 'neutral' | 'lime' | 'amber' }) {
  const styles =
    tone === 'lime'
      ? 'border-lime/40 bg-lime/15 text-lime'
      : tone === 'amber'
        ? 'border-amber/40 bg-amber/12 text-amber'
        : 'border-line bg-surface-2 text-chalk'
  return (
    <span
      className={cn(
        'tnum inline-flex size-6 items-center justify-center rounded-md border text-xs font-bold',
        styles,
      )}
    >
      {sign}
    </span>
  )
}

function PicksBar({ dist }: { dist: PickDistribution }) {
  const total = dist.picks_1 + dist.picks_x + dist.picks_2
  if (!total) return null
  const p1 = Math.round((100 * dist.picks_1) / total)
  const px = Math.round((100 * dist.picks_x) / total)
  const p2 = Math.max(0, 100 - p1 - px)

  return (
    <div className="mt-2">
      <div className="flex h-1 overflow-hidden rounded-full bg-surface-3">
        <div className="bg-sky/70" style={{ width: `${p1}%` }} />
        <div className="bg-muted-2/50" style={{ width: `${px}%` }} />
        <div className="bg-lime/70" style={{ width: `${p2}%` }} />
      </div>
      <div className="tnum mt-1 flex gap-2.5 text-[10px] text-muted-2">
        <span>1 {p1}%</span>
        <span>X {px}%</span>
        <span>2 {p2}%</span>
        <span className="ml-auto">{dist.coupons} coupons</span>
      </div>
    </div>
  )
}

function ScoreCell({ value, live }: { value: number | null; live: boolean }) {
  return (
    <span
      className={cn(
        'tnum inline-flex min-w-5 justify-center text-sm font-semibold',
        live ? 'text-amber' : value === null ? 'text-muted-2' : 'text-chalk',
      )}
    >
      {value === null ? '–' : value}
    </span>
  )
}

export function MatchList({
  matches,
  picks,
  showPicks = true,
}: {
  matches: RoundMatch[]
  picks?: PickDistribution[]
  showPicks?: boolean
}) {
  const pickMap = new Map((picks ?? []).map((p) => [p.match_number, p]))

  return (
    <ul className="divide-y divide-line-soft">
      {matches.map((match) => {
        const live = match.match_status === 'live'
        const finished = match.outcome !== null || match.match_status === 'finished'
        const effective = match.outcome ?? match.current_result

        return (
          <li
            key={match.id}
            className="grid grid-cols-[1.6rem_minmax(0,1fr)_auto] items-start gap-3 px-3.5 py-3 sm:px-4"
          >
            <span className="tnum pt-0.5 text-xs font-medium text-muted-2">
              {String(match.match_number).padStart(2, '0')}
            </span>

            <div className="min-w-0">
              <div className="flex items-center justify-between gap-3">
                <span className="truncate text-[13.5px] font-medium text-chalk">{match.home_team}</span>
                <ScoreCell value={match.home_score} live={live} />
              </div>
              <div className="mt-0.5 flex items-center justify-between gap-3">
                <span className="truncate text-[13.5px] text-muted">{match.away_team}</span>
                <ScoreCell value={match.away_score} live={live} />
              </div>

              {showPicks && pickMap.has(match.match_number) ? (
                <PicksBar dist={pickMap.get(match.match_number)!} />
              ) : null}
            </div>

            <div className="flex min-w-[4.25rem] flex-col items-end gap-1 text-right">
              {match.cancelled ? (
                <span className="chip border-line bg-transparent text-muted-2">Void</span>
              ) : live ? (
                <span className="chip border-amber/30 bg-amber/10 text-amber">
                  <span className="live-dot inline-block size-1.5 rounded-full bg-current" />
                  Live
                </span>
              ) : finished ? (
                <span className="chip border-line bg-surface-2/60 text-muted">FT</span>
              ) : (
                <>
                  <span className="tnum text-[11px] text-muted">{formatTime(match.kickoff)}</span>
                  <span className="text-[10px] text-muted-2">{untilLabel(match.kickoff)}</span>
                </>
              )}

              {effective ? <SignBox sign={effective} tone={finished ? 'lime' : 'amber'} /> : null}
              <span className="sr-only">{matchStatusLabel(match.match_status)}</span>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
