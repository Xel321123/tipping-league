import type { ReactNode } from 'react'
import { formatDateTime, formatPct, relativeTime } from '../lib/format'
import type { Round, RoundMatch } from '../lib/types'
import { Badge, Button, LiveDot, cn } from './ui'

export function StatusBadge({ status }: { status: Round['status'] }) {
  if (status === 'live') {
    return (
      <Badge tone="amber">
        <LiveDot /> Live
      </Badge>
    )
  }
  if (status === 'completed') return <Badge tone="lime">Final</Badge>
  return <Badge>Upcoming</Badge>
}

export function RoundHeader({
  round,
  matches,
  actions,
  updatedAt,
  onRefresh,
  refreshing = false,
}: {
  round: Round
  matches: RoundMatch[]
  actions?: ReactNode
  updatedAt?: number | null
  onRefresh?: () => void
  refreshing?: boolean
}) {
  const resolved = matches.filter(
    (match) => !match.cancelled && (match.outcome !== null || match.current_result !== null),
  ).length
  const progress = matches.length > 0 ? (100 * resolved) / matches.length : 0

  return (
    <section className="panel relative overflow-hidden">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-lime/40 to-transparent"
        aria-hidden="true"
      />
      <div className="flex flex-col gap-4 p-4 sm:p-5 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={round.status} />
            <Badge>{round.mode === 'team' ? 'Team coupon' : 'Meetup · solo'}</Badge>
            <Badge>
              {round.svenska_spel_product}
              {round.draw_number ? ` · #${round.draw_number}` : ''}
            </Badge>
            <Badge>{round.match_count} matches</Badge>
          </div>

          <h1 className="mt-3 text-2xl font-semibold leading-tight tracking-tight text-chalk sm:text-[28px]">
            {round.title}
          </h1>
          <p className="mt-1 text-sm text-muted">{formatDateTime(round.round_date)}</p>
        </div>

        <div className="flex shrink-0 flex-col items-start gap-2 md:items-end">
          {actions}
          <div className="flex items-center gap-2 md:justify-end">
            {onRefresh ? (
              <Button variant="ghost" size="sm" onClick={onRefresh} loading={refreshing}>
                Refresh
              </Button>
            ) : null}
            {updatedAt ? (
              <span className="text-[11px] text-muted-2">updated {relativeTime(new Date(updatedAt).toISOString())}</span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 border-t border-line-soft px-4 py-2.5 sm:px-5">
        <span className="label">Decided</span>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3">
          <div
            className={cn('h-full rounded-full transition-[width] duration-500', progress === 100 ? 'bg-lime' : 'bg-amber')}
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className="tnum text-[11px] text-muted">
          {resolved}/{matches.length} · {formatPct(progress)}
        </span>
      </div>
    </section>
  )
}
