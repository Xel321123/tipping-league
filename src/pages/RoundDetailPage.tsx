import { Link, useParams } from 'react-router-dom'
import { fetchRoundBundle, fetchWinners } from '../lib/api'
import { formatDate } from '../lib/format'
import { useAsync } from '../hooks/useAsync'
import { CouponCardView } from '../components/CouponCard'
import { MatchList } from '../components/MatchList'
import { RoundHeader } from '../components/RoundHeader'
import { Badge, Card, EmptyState, ErrorNote, SectionHeader, Skeleton } from '../components/ui'

export function RoundDetailPage() {
  const { roundId = '' } = useParams()
  const bundle = useAsync(() => fetchRoundBundle(roundId), [roundId], { enabled: Boolean(roundId) })
  const winners = useAsync(() => fetchWinners(), [])

  if (bundle.error) {
    return (
      <div className="space-y-4">
        <Link to="/history" className="text-xs text-muted hover:text-chalk">
          ← Back to history
        </Link>
        <ErrorNote message={bundle.error} onRetry={bundle.refresh} />
      </div>
    )
  }

  if (bundle.loading && !bundle.data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-36 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (!bundle.data) {
    return <EmptyState title="Round not found" description="It may have been deleted from the admin panel." />
  }

  const { round, matches, coupons, picks } = bundle.data
  const roundWinners = (winners.data ?? []).filter((winner) => winner.round_id === round.id)
  const winnersLabel = roundWinners
    .map((winner) => {
      const team = coupons.find((card) => card.coupon.id === winner.coupon_id)
      return team ? `${team.owner} ${winner.hits}/${winner.matches}` : `${winner.hits}/${winner.matches}`
    })
    .join(' · ')

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <Link to="/history" className="text-xs text-muted hover:text-chalk">
          ← Back to history
        </Link>
        <Link to="/admin" className="text-xs text-muted hover:text-chalk">
          Edit in admin →
        </Link>
      </div>

      <RoundHeader
        round={round}
        matches={matches}
        actions={<Badge tone="neutral">{formatDate(round.round_date)}</Badge>}
      />

      {round.status === 'completed' && roundWinners.length > 0 ? (
        <Card className="flex flex-wrap items-center justify-between gap-3 border-lime/25 bg-lime/[0.05] p-4">
          <div>
            <div className="label text-lime/80">Round winner{roundWinners.length > 1 ? 's' : ''}</div>
            <p className="mt-1 text-sm font-medium text-chalk">{winnersLabel || '—'}</p>
          </div>
          <Badge tone="lime">{roundWinners[0]?.hits}/{roundWinners[0]?.matches} correct</Badge>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
        <Card className="overflow-hidden">
          <div className="px-4 py-3">
            <SectionHeader eyebrow="Draw" title="Matches" />
          </div>
          {matches.length === 0 ? (
            <p className="px-4 pb-5 text-sm text-muted">No matches recorded for this round.</p>
          ) : (
            <MatchList matches={matches} picks={picks} />
          )}
        </Card>

        <div className="space-y-3">
          <SectionHeader eyebrow={`${coupons.length} submitted`} title="Coupons" />
          {coupons.length === 0 ? (
            <Card className="px-4 py-8 text-center text-sm text-muted">No coupons for this round.</Card>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {coupons.map((card) => (
                <CouponCardView key={card.coupon.id} card={card} matches={matches} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
