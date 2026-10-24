import { useEffect, useMemo, useRef, useState } from 'react'
import { fetchLeagueContext, fetchRoundBundle, fetchRounds } from '../lib/api'
import { deleteCoupon, saveCoupon } from '../lib/admin'
import { SIGNS, tallySelections } from '../lib/scores'
import { formatDateTime, formatRows, relativeTime } from '../lib/format'
import { useAsync } from '../hooks/useAsync'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  InlineNote,
  SectionHeader,
  Skeleton,
  cn,
} from '../components/ui'
import { RoundSelect, teamsForRound } from './shared'
import type { Sign } from '../lib/types'

export function AdminCoupons({ token }: { token: string }) {
  const rounds = useAsync(() => fetchRounds(50), [])
  const context = useAsync(() => fetchLeagueContext(), [])
  const [roundId, setRoundId] = useState('')
  const [teamId, setTeamId] = useState('')
  const [playerId, setPlayerId] = useState('')
  const [selections, setSelections] = useState<Record<number, Sign[]>>({})
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)

  useEffect(() => {
    if (roundId || !rounds.data?.length) return
    // With more than one round running, start on a live one rather than an arbitrary row.
    const preferred =
      rounds.data.find((round) => round.status === 'live') ??
      rounds.data.find((round) => round.status === 'upcoming') ??
      rounds.data[0]
    if (preferred) setRoundId(preferred.id)
  }, [rounds.data, roundId])

  const bundle = useAsync(
    () => (roundId ? fetchRoundBundle(roundId) : Promise.resolve(null)),
    [roundId],
    { enabled: Boolean(roundId) },
  )

  const round = bundle.data?.round ?? null
  const matches = useMemo(() => bundle.data?.matches ?? [], [bundle.data])
  const mode = round?.mode ?? 'team'
  const eligibleTeams = teamsForRound(context.data?.teams ?? [], context.data?.eras ?? [], round?.round_date ?? null)

  // Reset the owner + draft whenever the round changes.
  useEffect(() => {
    setTeamId('')
    setPlayerId('')
    setSelections({})
    setNote('')
    setMessage(null)
  }, [roundId])

  // Load a *saved* coupon when the owner changes. Deliberately keyed on the
  // owner only: picking a team after entering signs must not wipe the draft, and
  // a background refresh of the round must not either.
  const bundleRef = useRef(bundle.data)
  bundleRef.current = bundle.data

  useEffect(() => {
    if (!teamId && !playerId) return
    const existing = (bundleRef.current?.coupons ?? []).find((card) =>
      mode === 'team' ? card.coupon.team_id === teamId : card.coupon.player_id === playerId,
    )
    if (!existing) return
    setSelections({ ...existing.selections })
    setNote(existing.coupon.note ?? '')
    setMessage(null)
  }, [teamId, playerId, mode])

  function toggleSign(matchNumber: number, sign: Sign) {
    setSelections((current) => {
      const signs = current[matchNumber] ?? []
      const next = signs.includes(sign)
        ? signs.filter((candidate) => candidate !== sign)
        : [...signs, sign].sort((a, b) => SIGNS.indexOf(a) - SIGNS.indexOf(b))

      if (next.length === 0) {
        const copy = { ...current }
        delete copy[matchNumber]
        return copy
      }
      return { ...current, [matchNumber]: next }
    })
  }

  const complete = matches.length > 0 && matches.every((match) => (selections[match.match_number]?.length ?? 0) > 0)
  const tally = tallySelections(matches, selections)
  const rows = matches.reduce((product, match) => product * Math.max(selections[match.match_number]?.length ?? 1, 1), 1)
  const ownerChosen = mode === 'team' ? Boolean(teamId) : Boolean(playerId)

  async function submit() {
    if (!round || !ownerChosen) return
    setBusy(true)
    setMessage(null)
    try {
      await saveCoupon(token, {
        roundId: round.id,
        teamId: mode === 'team' ? teamId : null,
        playerId: mode === 'individual' ? playerId : null,
        selections: matches.map((match) => ({
          match_number: match.match_number,
          signs: selections[match.match_number] ?? [],
        })),
        note: note || null,
      })
      bundle.refresh()
      setMessage({ tone: 'ok', text: 'Coupon saved.' })
    } catch (cause) {
      setMessage({ tone: 'error', text: cause instanceof Error ? cause.message : 'Could not save the coupon' })
    } finally {
      setBusy(false)
    }
  }

  async function remove(couponId: string) {
    if (!window.confirm('Delete this coupon?')) return
    setBusy(true)
    try {
      await deleteCoupon(token, couponId)
      bundle.refresh()
      setSelections({})
      setMessage({ tone: 'ok', text: 'Coupon deleted.' })
    } catch (cause) {
      setMessage({ tone: 'error', text: cause instanceof Error ? cause.message : 'Could not delete' })
    } finally {
      setBusy(false)
    }
  }

  const existingCoupons = bundle.data?.coupons ?? []

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      <Card className="p-4">
        <SectionHeader
          eyebrow="Coupon entry"
          title="Selections"
          description="Tap 1, X and 2 to hedge. One sign = single, two = half hedge, three = full hedge."
        />

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <RoundSelect
            rounds={rounds.data ?? []}
            value={roundId}
            onChange={setRoundId}
            hint={round ? formatDateTime(round.round_date) : undefined}
          />

          {mode === 'team' ? (
            <Field label="Team" hint={round ? undefined : 'Pick a round first'}>
              <select className="field" value={teamId} onChange={(event) => setTeamId(event.target.value)}>
                <option value="">Select a team…</option>
                {eligibleTeams.map((team) => {
                  const names = [team.player_1_id, team.player_2_id]
                    .map((id) => context.data?.players.find((player) => player.id === id)?.name ?? '?')
                    .join(' & ')
                  return (
                    <option key={team.id} value={team.id}>
                      {team.name} — {names}
                    </option>
                  )
                })}
              </select>
            </Field>
          ) : (
            <Field label="Player">
              <select className="field" value={playerId} onChange={(event) => setPlayerId(event.target.value)}>
                <option value="">Select a player…</option>
                {(context.data?.players ?? []).map((player) => (
                  <option key={player.id} value={player.id}>
                    {player.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </div>

        {bundle.error ? <InlineNote tone="rose">{bundle.error}</InlineNote> : null}

        {bundle.loading && !bundle.data ? (
          <Skeleton className="mt-4 h-64 w-full" />
        ) : matches.length === 0 ? (
          <p className="mt-4 rounded-xl border border-line-soft bg-surface-2/40 px-3 py-6 text-center text-xs text-muted">
            This round has no matches yet — sync the draw first.
          </p>
        ) : (
          <div className="mt-4 space-y-1.5">
            {matches.map((match) => {
              const signs = selections[match.match_number] ?? []
              return (
                <div
                  key={match.id}
                  className="flex flex-wrap items-center gap-2 rounded-xl border border-line-soft bg-surface-2/30 px-2.5 py-2"
                >
                  <span className="tnum w-5 text-[11px] text-muted-2">{match.match_number}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12.5px] text-chalk">
                      {match.home_team} <span className="text-muted-2">v</span> {match.away_team}
                    </div>
                    {match.outcome || match.current_result ? (
                      <div className="text-[10px] text-muted-2">
                        result {match.outcome ?? match.current_result}
                        {match.home_score !== null ? ` · ${match.home_score}-${match.away_score}` : ''}
                      </div>
                    ) : null}
                  </div>
                  <div className="flex gap-1">
                    {SIGNS.map((sign) => {
                      const active = signs.includes(sign)
                      return (
                        <button
                          key={sign}
                          type="button"
                          onClick={() => toggleSign(match.match_number, sign)}
                          className={cn(
                            'tnum size-8 rounded-lg border text-xs font-bold transition-colors',
                            active
                              ? 'border-lime bg-lime text-[#0a1004]'
                              : 'border-line bg-surface-2 text-muted hover:border-line/70 hover:text-chalk',
                          )}
                        >
                          {sign}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {matches.length > 0 ? (
          <>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-muted-2">
              <Badge tone={complete ? 'lime' : 'neutral'}>
                {matches.filter((match) => (selections[match.match_number]?.length ?? 0) > 0).length}/
                {matches.length} matches filled
              </Badge>
              <Badge>{formatRows(rows)} rows</Badge>
              {tally.misses > 0 ? <Badge tone="rose">already out</Badge> : null}
              {tally.hits > 0 ? <Badge tone="amber">{tally.hits} correct so far</Badge> : null}
            </div>

            <Field label="Note (optional)" className="mt-3">
              <input
                className="field"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="e.g. hedged Saturday, single Sunday"
              />
            </Field>

            {message ? (
              <div className="mt-3">
                <InlineNote tone={message.tone === 'ok' ? 'lime' : 'rose'}>{message.text}</InlineNote>
              </div>
            ) : null}

            <div className="mt-3 flex gap-2">
              <Button onClick={submit} loading={busy} disabled={!complete || !ownerChosen}>
                {existingCoupons.some((card) =>
                  mode === 'team' ? card.coupon.team_id === teamId : card.coupon.player_id === playerId,
                )
                  ? 'Update coupon'
                  : 'Save coupon'}
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setSelections({})
                  setMessage(null)
                }}
              >
                Clear
              </Button>
            </div>
            {!ownerChosen ? (
              <p className="mt-2 text-[11px] text-muted-2">
                Choose a {mode === 'team' ? 'team' : 'player'} to enable saving.
              </p>
            ) : null}
          </>
        ) : null}
      </Card>

      <Card className="p-4">
        <SectionHeader eyebrow={`${existingCoupons.length} in`} title="Coupons this round" />
        {existingCoupons.length === 0 ? (
          <div className="mt-3">
            <EmptyState title="No coupons yet" description="Selections you save appear here." />
          </div>
        ) : (
          <ul className="mt-3 space-y-2">
            {existingCoupons.map((card) => (
              <li
                key={card.coupon.id}
                className="flex items-center justify-between gap-2 rounded-xl border border-line-soft bg-surface-2/40 px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-chalk">{card.owner}</div>
                  <div className="truncate text-[11px] text-muted-2">
                    {card.score ? `${card.score.hits}/${card.score.matches} correct` : 'no score'} ·{' '}
                    {formatRows(card.score?.total_rows ?? card.coupon.total_rows)} rows ·{' '}
                    {relativeTime(card.coupon.updated_at)}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      if (mode === 'team') {
                        setTeamId(card.coupon.team_id ?? '')
                        setPlayerId('')
                      } else {
                        setPlayerId(card.coupon.player_id ?? '')
                        setTeamId('')
                      }
                      setSelections({ ...card.selections })
                      setNote(card.coupon.note ?? '')
                    }}
                  >
                    Edit
                  </Button>
                  <Button variant="danger" size="sm" onClick={() => remove(card.coupon.id)} disabled={busy}>
                    Delete
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
