import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { fetchRoundBundle, fetchRounds, syncRoundFromApi } from '../lib/api'
import { formatDateTime, formatRows, untilLabel } from '../lib/format'
import { useAsync } from '../hooks/useAsync'
import { useTick } from '../hooks/useAsync'
import { CouponCardView } from '../components/CouponCard'
import { MatchList } from '../components/MatchList'
import { RoundHeader } from '../components/RoundHeader'
import { Badge, Button, Card, EmptyState, ErrorNote, SectionHeader, Skeleton, Stat, cn } from '../components/ui'
import type { Round, RoundBundle } from '../lib/types'

export function LiveBoardPage() {
  useTick(30_000)
  const [params, setParams] = useSearchParams()

  // Several rounds can run at once (a team coupon round and a meetup round, or
  // two draws on the same weekend). Load the list and let ?r=<id> pick one.
  const rounds = useAsync(() => fetchRounds(40), [], { pollMs: 60_000 })
  const allRounds = rounds.data ?? []
  const liveRounds = allRounds.filter((round) => round.status === 'live')
  const upcoming = [...allRounds]
    .filter((round) => round.status === 'upcoming')
    .sort((a, b) => a.round_date.localeCompare(b.round_date))

  // When nothing is live, fall back to the most recent round(s) — usually the
  // two halves of the same matchday — and label them as not live.
  const newest = [...allRounds].sort((a, b) => b.round_date.localeCompare(a.round_date))[0] ?? null
  const recentRounds = newest
    ? allRounds
        .filter(
          (round) =>
            round.draw_number !== null &&
            round.draw_number === newest.draw_number &&
            round.status !== 'upcoming',
        )
        .sort((a, b) => b.round_date.localeCompare(a.round_date))
        .slice(0, 3)
    : []
  const group = liveRounds.length > 0 ? liveRounds : recentRounds
  const isLive = liveRounds.length > 0

  const requestedId = params.get('r')
  const fallback = group[0] ?? upcoming[0] ?? allRounds[0] ?? null
  const spot = allRounds.find((round) => round.id === requestedId) ?? fallback
  const roundId = spot?.id ?? null

  const selectRound = (id: string) => {
    const next = new URLSearchParams(params)
    next.set('r', id)
    setParams(next, { replace: true })
  }

  const bundle = useAsync<RoundBundle | null>(
    () => (roundId ? fetchRoundBundle(roundId) : Promise.resolve(null)),
    [roundId],
    { pollMs: 30_000 },
  )

  const [syncing, setSyncing] = useState(false)

  const refreshNow = useCallback(async () => {
    if (!roundId) return
    setSyncing(true)
    try {
      await syncRoundFromApi(roundId)
      rounds.refresh()
      bundle.refresh()
    } finally {
      window.setTimeout(() => setSyncing(false), 400)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundId])

  // Keep the board honest without an admin tab open: pull the draw, then re-read.
  useEffect(() => {
    if (!roundId) return
    let cancelled = false
    void refreshNow()
    const timer = window.setInterval(() => {
      if (!document.hidden) void refreshNow()
    }, 60_000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
      void cancelled
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundId])

  if (rounds.error) {
    return (
      <div className="space-y-4">
        <ErrorNote message={rounds.error} onRetry={rounds.refresh} />
      </div>
    )
  }

  if (rounds.loading && !rounds.data && !bundle.data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-40 w-full" />
        <div className="grid gap-3 sm:grid-cols-2">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
        <Skeleton className="h-72 w-full" />
      </div>
    )
  }

  if (!spot) {
    return (
      <div className="space-y-6">
        <PageIntro />
        <EmptyState
          title="No rounds yet"
          description="Create the first round in the admin panel, then sync the draw from Svenska Spel. Coupons and results will light up here automatically."
          action={
            <Link to="/admin" className="btn btn-primary">
              Open admin
            </Link>
          }
        />
      </div>
    )
  }

  const data = bundle.data
  const round = data?.round ?? spot
  const matches = data?.matches ?? []
  const coupons = data?.coupons ?? []
  const decided = matches.filter((match) => match.outcome !== null).length
  const leader = coupons.find((card) => (card.score?.hits ?? 0) > 0)
  const nextKickoff = matches
    .map((match) => match.kickoff)
    .filter((value): value is string => typeof value === 'string' && new Date(value).getTime() > Date.now())
    .sort()[0]

  const refreshing = bundle.loading || rounds.loading

  return (
    <div className="space-y-5">
      {group.length > 1 ? (
        <LiveRoundSwitcher
          rounds={group}
          activeId={round.id}
          onSelect={selectRound}
          live={isLive}
        />
      ) : null}

      <RoundHeader
        round={round}
        matches={matches}
        updatedAt={bundle.updatedAt}
        onRefresh={() => void refreshNow()}
        refreshing={syncing || refreshing}
        actions={
          <Badge tone={round.status === 'live' ? 'amber' : 'neutral'}>
            {round.status === 'live' ? 'Updated every 30s' : formatDateTime(round.round_date)}
          </Badge>
        }
      />

      {bundle.error ? <ErrorNote message={bundle.error} onRetry={bundle.refresh} /> : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Leading coupon"
          value={leader ? `${leader.score?.hits ?? 0}/${matches.length}` : '—'}
          sub={leader?.owner ?? 'No hits yet'}
          tone={leader ? 'lime' : 'neutral'}
        />
        <Stat
          label="Matches settled"
          value={`${decided}/${matches.length}`}
          sub={nextKickoff ? `next kickoff ${untilLabel(nextKickoff)}` : 'all kickoffs played'}
        />
        <Stat
          label="Coupons in"
          value={formatRows(coupons.length)}
          sub={round.mode === 'team' ? 'one per team' : 'one per player'}
          tone="sky"
        />
        <Stat
          label="Live rows"
          value={formatRows(coupons.reduce((sum, card) => sum + (card.score?.rows_alive ?? 0), 0))}
          sub={`of ${formatRows(coupons.reduce((sum, card) => sum + (card.score?.total_rows ?? 0), 0))} submitted`}
          tone="amber"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3">
            <SectionHeader eyebrow="Draw" title="Matches" />
            <span className="text-[11px] text-muted-2">
              {matches.length > 0 ? `${matches.length} in pool` : 'not synced'}
            </span>
          </div>
          {matches.length === 0 ? (
            <div className="px-4 pb-6 pt-2 text-sm text-muted">
              No matches loaded yet.{' '}
              <Link to="/admin" className="text-lime hover:underline">
                Sync the draw in admin
              </Link>
              .
            </div>
          ) : (
            <MatchList matches={matches} picks={data?.picks} />
          )}
        </Card>

        <div className="space-y-3">
          <SectionHeader
            eyebrow="Coupons"
            title="How the league stands"
            description="Green is banked, amber is still in play, red is dead."
          />
          {coupons.length === 0 ? (
            <Card className="px-4 py-8 text-center text-sm text-muted">
              No coupons submitted for this round yet.
            </Card>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              {coupons.map((card) => (
                <CouponCardView key={card.coupon.id} card={card} matches={matches} />
              ))}
            </div>
          )}
        </div>
      </div>

      {round.status === 'completed' ? (
        <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <div className="label">Round closed</div>
            <p className="mt-1 text-sm text-muted">
              Full coupon breakdown and every past round live in the history archive.
            </p>
          </div>
          <div className="flex gap-2">
            <Link to={`/history/${round.id}`} className="btn btn-ghost btn-sm">
              Round detail
            </Link>
            <Link to="/table" className="btn btn-primary btn-sm">
              Standings
            </Link>
          </div>
        </Card>
      ) : null}
    </div>
  )
}

function LiveRoundSwitcher({
  rounds,
  activeId,
  onSelect,
  live,
}: {
  rounds: Round[]
  activeId: string
  onSelect: (id: string) => void
  live: boolean
}) {
  return (
    <div
      className="flex flex-wrap items-center gap-1.5 rounded-2xl border border-line-soft bg-surface-2/40 p-1.5"
      role="group"
      aria-label="Live rounds"
    >
      <span className="px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-2">
        {rounds.length} {live ? 'live now' : 'recent · not live'}
      </span>
      {rounds.map((round) => {
        const active = round.id === activeId
        return (
          <button
            key={round.id}
            type="button"
            aria-pressed={active}
            onClick={() => onSelect(round.id)}
            className={cn(
              'flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs transition-colors',
              active
                ? live
                  ? 'bg-amber/15 text-amber ring-1 ring-inset ring-amber/30'
                  : 'bg-chalk/10 text-chalk ring-1 ring-inset ring-line'
                : 'text-muted hover:bg-surface-3 hover:text-chalk',
            )}
          >
            <span
              className={cn(
                'h-1.5 w-1.5 rounded-full',
                live ? (active ? 'bg-amber' : 'bg-amber/40') : 'bg-muted-2/50',
              )}
            />
            <span className="max-w-[12rem] truncate font-medium">{round.title}</span>
            <span className="text-[10px] text-muted-2">{round.mode === 'team' ? 'team' : 'solo'}</span>
          </button>
        )
      })}
    </div>
  )
}

function PageIntro() {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <div className="label">Season board</div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Live tipping board</h1>
        <p className="mt-1 max-w-xl text-sm text-muted">
          One joint coupon per team, or eight solo coupons at a meetup. Results resolve straight from
          the Svenska Spel draw.
        </p>
      </div>
      <Button variant="ghost" size="sm" onClick={() => window.location.reload()}>
        Reload
      </Button>
    </div>
  )
}
