import { useEffect, useRef, useState } from 'react'
import { fetchRoundBundle, fetchRounds } from '../lib/api'
import { setMatchState, syncMatches } from '../lib/admin'
import { loadDraw } from '../lib/svenskaSpel'
import { signFromScore } from '../lib/scores'
import { formatDateTime, relativeTime } from '../lib/format'
import { useAsync } from '../hooks/useAsync'
import { Badge, Button, Card, InlineNote, SectionHeader, Skeleton, cn } from '../components/ui'
import { RoundSelect } from './shared'
import type { MatchStatus, RoundMatch, Sign } from '../lib/types'

const STATUS_OPTIONS: Array<{ value: MatchStatus; label: string }> = [
  { value: 'not_started', label: 'Not started' },
  { value: 'live', label: 'Live' },
  { value: 'finished', label: 'Finished' },
  { value: 'cancelled', label: 'Cancelled' },
]

export function AdminResults({ token }: { token: string }) {
  const rounds = useAsync(() => fetchRounds(50), [])
  const [roundId, setRoundId] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [autoSync, setAutoSync] = useState(true)
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)

  useEffect(() => {
    if (roundId || !rounds.data?.length) return
    const preferred = rounds.data.find((round) => round.status !== 'completed') ?? rounds.data[0]
    if (preferred) setRoundId(preferred.id)
  }, [rounds.data, roundId])

  const bundle = useAsync(
    () => (roundId ? fetchRoundBundle(roundId) : Promise.resolve(null)),
    [roundId],
    { enabled: Boolean(roundId), pollMs: 60_000 },
  )

  const round = bundle.data?.round ?? null
  const matches = bundle.data?.matches ?? []
  const settled = matches.filter((match) => match.outcome !== null).length

  async function sync(options: { quiet?: boolean } = {}) {
    if (!round || syncing) return
    setSyncing(true)
    if (!options.quiet) setMessage(null)
    try {
      const payload = await loadDraw(
        round.svenska_spel_product,
        round.draw_number ?? undefined,
      )
      if (payload.normalized.length === 0) throw new Error('The draw returned no matches yet.')
      const count = await syncMatches(token, round.id, payload.normalized)
      bundle.refresh()
      rounds.refresh()
      if (!options.quiet) {
        setMessage({
          tone: 'ok',
          text: `Updated ${count} matches from ${payload.draw.productName ?? round.svenska_spel_product}${payload.viaProxy ? ' via proxy' : ''}. Manual outcomes were kept.`,
        })
      }
    } catch (cause) {
      setMessage({ tone: 'error', text: cause instanceof Error ? cause.message : 'Sync failed' })
    } finally {
      setSyncing(false)
    }
  }

  // Match days: keep pulling scores while this tab is open, so the live board
  // never depends on somebody remembering to press the button.
  const syncRef = useRef(sync)
  syncRef.current = sync
  useEffect(() => {
    if (!autoSync || !round || round.status === 'completed') return
    const timer = setInterval(() => {
      if (document.hidden) return
      void syncRef.current({ quiet: true })
    }, 60_000)
    return () => clearInterval(timer)
  }, [autoSync, round?.id, round?.status]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <SectionHeader
          eyebrow="Results"
          title="Live scores & manual override"
          description="Sync pulls the draw. Anything you set by hand wins over a later sync."
          actions={
            <>
              <Badge tone={settled === matches.length && matches.length > 0 ? 'lime' : 'neutral'}>
                {settled}/{matches.length} settled
              </Badge>
              {round?.api_synced_at ? <Badge>synced {relativeTime(round.api_synced_at)}</Badge> : null}
            </>
          }
        />

        <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <RoundSelect
            rounds={rounds.data ?? []}
            value={roundId}
            onChange={setRoundId}
            hint={round ? formatDateTime(round.round_date) : undefined}
          />
          <Button variant="ghost" onClick={() => void sync()} loading={syncing} disabled={!round}>
            Sync from Svenska Spel
          </Button>
        </div>

        <label className="mt-2 flex w-fit items-center gap-1.5 text-[11px] text-muted-2">
          <input
            type="checkbox"
            checked={autoSync}
            onChange={(event) => setAutoSync(event.target.checked)}
            className="size-3.5 accent-lime"
          />
          auto-sync every 60s while this tab is open
        </label>

        {message ? (
          <div className="mt-3">
            <InlineNote tone={message.tone === 'ok' ? 'lime' : 'rose'}>{message.text}</InlineNote>
          </div>
        ) : null}
        {bundle.error ? (
          <div className="mt-3">
            <InlineNote tone="rose">{bundle.error}</InlineNote>
          </div>
        ) : null}
      </Card>

      {bundle.loading && !bundle.data ? <Skeleton className="h-72 w-full" /> : null}

      {!bundle.loading && matches.length === 0 ? (
        <Card className="px-4 py-8 text-center text-sm text-muted">
          No matches for this round yet. Sync the draw, or add a round with fixtures first.
        </Card>
      ) : null}

      {matches.length > 0 ? (
        <Card className="divide-y divide-line-soft overflow-hidden">
          <div className="hidden items-center gap-3 px-4 py-2 sm:flex">
            <span className="label w-6">#</span>
            <span className="label flex-1">Match</span>
            <span className="label w-32 text-center">Score</span>
            <span className="label w-28">Status</span>
            <span className="label w-36 text-right">Outcome</span>
          </div>
          {matches.map((match) => (
            <MatchResultRow
              key={`${match.id}-${match.outcome ?? 'none'}-${match.last_synced_at ?? ''}`}
              match={match}
              roundId={roundId}
              token={token}
              onSaved={() => {
                bundle.refresh()
                rounds.refresh()
              }}
            />
          ))}
        </Card>
      ) : null}
    </div>
  )
}

function MatchResultRow({
  match,
  roundId,
  token,
  onSaved,
}: {
  match: RoundMatch
  roundId: string
  token: string
  onSaved: () => void
}) {
  const [home, setHome] = useState(match.home_score?.toString() ?? '')
  const [away, setAway] = useState(match.away_score?.toString() ?? '')
  const [status, setStatus] = useState<MatchStatus>(match.match_status)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const live = match.match_status === 'live'

  async function save(overrides?: { outcome?: Sign | null; status?: MatchStatus }) {
    setBusy(true)
    setError(null)
    try {
      await setMatchState(token, {
        roundId,
        matchNumber: match.match_number,
        homeScore: home === '' ? null : Number(home),
        awayScore: away === '' ? null : Number(away),
        matchStatus: overrides?.status ?? status,
        outcome: overrides && 'outcome' in overrides ? overrides.outcome : match.outcome,
      })
      onSaved()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save')
    } finally {
      setBusy(false)
    }
  }

  function autoOutcome() {
    const homeScore = Number(home)
    const awayScore = Number(away)
    if (home === '' || away === '' || Number.isNaN(homeScore) || Number.isNaN(awayScore)) {
      setError('Enter both scores first')
      return
    }
    void save({ outcome: signFromScore(homeScore, awayScore), status: 'finished' })
  }

  return (
    <div className="px-3 py-2.5 sm:px-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="tnum w-6 text-[11px] text-muted-2">{match.match_number}</span>

        <div className="min-w-[9rem] flex-1">
          <div className="truncate text-[13px] font-medium text-chalk">
            {match.home_team} <span className="text-muted-2">v</span> {match.away_team}
          </div>
          <div className="text-[10px] text-muted-2">
            {match.kickoff ? formatDateTime(match.kickoff) : 'kickoff TBC'}
            {live ? ' · live' : ''}
            {match.last_synced_at ? ` · synced ${relativeTime(match.last_synced_at)}` : ''}
          </div>
        </div>

        <div className="flex items-center gap-1">
          <input
            className="field tnum w-12 px-2 py-1 text-center"
            inputMode="numeric"
            value={home}
            onChange={(event) => setHome(event.target.value.replace(/[^0-9]/g, ''))}
            aria-label={`${match.home_team} goals`}
          />
          <span className="text-muted-2">–</span>
          <input
            className="field tnum w-12 px-2 py-1 text-center"
            inputMode="numeric"
            value={away}
            onChange={(event) => setAway(event.target.value.replace(/[^0-9]/g, ''))}
            aria-label={`${match.away_team} goals`}
          />
        </div>

        <select
          className="field w-[7.5rem] px-2 py-1 text-xs"
          value={status}
          onChange={(event) => setStatus(event.target.value as MatchStatus)}
          aria-label="Match status"
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <div className="flex items-center gap-1">
          {(['1', 'X', '2'] as const).map((sign) => {
            const active = match.outcome === sign
            return (
              <button
                key={sign}
                type="button"
                disabled={busy}
                onClick={() => void save({ outcome: active ? null : sign, status: 'finished' })}
                className={cn(
                  'tnum size-8 rounded-lg border text-xs font-bold transition-colors',
                  active
                    ? 'border-lime bg-lime text-[#0a1004]'
                    : 'border-line bg-surface-2 text-muted hover:text-chalk',
                )}
                title={`Set outcome ${sign}`}
              >
                {sign}
              </button>
            )
          })}
          <Button variant="ghost" size="sm" onClick={autoOutcome} disabled={busy} title="Set the outcome from the score">
            auto
          </Button>
          <Button variant={match.outcome === null ? 'primary' : 'ghost'} size="sm" onClick={() => void save()} loading={busy}>
            Save
          </Button>
        </div>
      </div>

      {error ? <p className="mt-1.5 text-[11px] text-rose">{error}</p> : null}
      {match.cancelled ? (
        <p className="mt-1.5 text-[11px] text-muted-2">Void match — counts as neither hit nor miss.</p>
      ) : null}
    </div>
  )
}
