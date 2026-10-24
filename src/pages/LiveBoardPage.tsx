import { Link } from 'react-router-dom'
import { fetchRoundBundle, fetchSpotlightRound } from '../lib/api'
import { formatDateTime, formatRows, untilLabel } from '../lib/format'
import { useAsync } from '../hooks/useAsync'
import { useTick } from '../hooks/useAsync'
import { CouponCardView } from '../components/CouponCard'
import { MatchList } from '../components/MatchList'
import { RoundHeader } from '../components/RoundHeader'
import { Badge, Button, Card, EmptyState, ErrorNote, SectionHeader, Skeleton, Stat } from '../components/ui'
import type { RoundBundle } from '../lib/types'

export function LiveBoardPage() {
  useTick(30_000)
  const spotlight = useAsync(() => fetchSpotlightRound(), [], { pollMs: 120_000 })
  const roundId = spotlight.data?.id ?? null

  const bundle = useAsync<RoundBundle | null>(
    () => (roundId ? fetchRoundBundle(roundId) : Promise.resolve(null)),
    [roundId],
    { pollMs: 30_000 },
  )

  if (spotlight.error) {
    return (
      <div className="space-y-4">
        <ErrorNote message={spotlight.error} onRetry={spotlight.refresh} />
      </div>
    )
  }

  if (spotlight.loading && !bundle.data) {
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

  if (!spotlight.data) {
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
  const round = data?.round ?? spotlight.data
  const matches = data?.matches ?? []
  const coupons = data?.coupons ?? []
  const decided = matches.filter((match) => match.outcome !== null).length
  const leader = coupons.find((card) => (card.score?.hits ?? 0) > 0)
  const nextKickoff = matches
    .map((match) => match.kickoff)
    .filter((value): value is string => typeof value === 'string' && new Date(value).getTime() > Date.now())
    .sort()[0]

  const refreshing = bundle.loading || spotlight.loading

  return (
    <div className="space-y-5">
      <RoundHeader
        round={round}
        matches={matches}
        updatedAt={bundle.updatedAt}
        onRefresh={() => {
          spotlight.refresh()
          bundle.refresh()
        }}
        refreshing={refreshing}
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
