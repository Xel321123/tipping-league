import { useEffect, useState, type FormEvent } from 'react'
import { fetchRounds } from '../lib/api'
import { deleteRound, saveRound, syncMatches } from '../lib/admin'
import { loadDraw, PRODUCT_OPTIONS } from '../lib/svenskaSpel'
import { fromDateTimeInput, relativeTime, toDateTimeInput } from '../lib/format'
import { useAsync } from '../hooks/useAsync'
import { Badge, Button, Card, Field, InlineNote, SectionHeader, Skeleton, TextInput } from '../components/ui'
import { RoundRow } from './shared'
import type { Round, RoundMode } from '../lib/types'

interface Draft {
  title: string
  roundDate: string
  mode: RoundMode
  product: string
  drawNumber: string
  matchCount: number
  notes: string
}

function emptyDraft(): Draft {
  return {
    title: '',
    roundDate: toDateTimeInput(new Date().toISOString()),
    mode: 'team',
    product: 'topptipset',
    drawNumber: '',
    matchCount: 8,
    notes: '',
  }
}

function draftFromRound(round: Round): Draft {
  return {
    title: round.title,
    roundDate: toDateTimeInput(round.round_date),
    mode: round.mode,
    product: round.svenska_spel_product,
    drawNumber: round.draw_number ? String(round.draw_number) : '',
    matchCount: round.match_count,
    notes: round.notes ?? '',
  }
}

export function AdminRounds({ token }: { token: string }) {
  const rounds = useAsync(() => fetchRounds(80), [])
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)

  const editingRound = rounds.data?.find((round) => round.id === editingId) ?? null

  useEffect(() => {
    if (editingRound) setDraft(draftFromRound(editingRound))
  }, [editingRound?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }))

  async function submit(event: FormEvent) {
    event.preventDefault()
    const roundDate = fromDateTimeInput(draft.roundDate)
    if (!draft.title.trim()) return setMessage({ tone: 'error', text: 'Give the round a title.' })
    if (!roundDate) return setMessage({ tone: 'error', text: 'Pick a round date.' })

    setBusy(true)
    setMessage(null)
    try {
      const id = await saveRound(token, {
        id: editingId,
        title: draft.title,
        mode: draft.mode,
        product: draft.product,
        drawNumber: draft.drawNumber ? Number(draft.drawNumber) : null,
        drawId: draft.drawNumber,
        roundDate,
        matchCount: draft.matchCount,
        notes: draft.notes || null,
      })
      setEditingId(id)
      rounds.refresh()
      setMessage({ tone: 'ok', text: editingId ? 'Round updated.' : 'Round created — now sync the draw.' })
    } catch (cause) {
      setMessage({ tone: 'error', text: cause instanceof Error ? cause.message : 'Could not save' })
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!editingId) return
    if (!window.confirm('Delete this round with all its matches and coupons?')) return
    setBusy(true)
    try {
      await deleteRound(token, editingId)
      setEditingId(null)
      setDraft(emptyDraft())
      rounds.refresh()
      setMessage({ tone: 'ok', text: 'Round deleted.' })
    } catch (cause) {
      setMessage({ tone: 'error', text: cause instanceof Error ? cause.message : 'Could not delete' })
    } finally {
      setBusy(false)
    }
  }

  async function sync() {
    if (!editingId) {
      setMessage({ tone: 'error', text: 'Save the round first, then sync the draw.' })
      return
    }
    setSyncing(true)
    setMessage(null)
    try {
      const drawNumber = draft.drawNumber ? Number(draft.drawNumber) : undefined
      const payload = await loadDraw(draft.product, drawNumber)
      if (payload.normalized.length === 0) {
        throw new Error('That draw has no matches yet. Check the product or draw number.')
      }

      const resolvedDraw = payload.draw.drawNumber ?? drawNumber ?? null
      await syncMatches(token, editingId, payload.normalized)
      await saveRound(token, {
        id: editingId,
        title: draft.title,
        mode: draft.mode,
        product: draft.product,
        drawNumber: resolvedDraw,
        drawId: resolvedDraw ? String(resolvedDraw) : null,
        roundDate: fromDateTimeInput(draft.roundDate) ?? new Date().toISOString(),
        matchCount: payload.normalized.length,
        notes: draft.notes || null,
      })

      setDraft((current) => ({
        ...current,
        drawNumber: resolvedDraw ? String(resolvedDraw) : current.drawNumber,
        matchCount: payload.normalized.length,
      }))
      rounds.refresh()
      setMessage({
        tone: 'ok',
        text: `Synced ${payload.normalized.length} matches from ${payload.draw.productName ?? draft.product}${resolvedDraw ? ` #${resolvedDraw}` : ''}${payload.viaProxy ? ' (via proxy)' : ''}.`,
      })
    } catch (cause) {
      setMessage({
        tone: 'error',
        text: cause instanceof Error ? cause.message : 'Could not sync the draw',
      })
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      <Card className="p-4">
        <SectionHeader
          eyebrow={editingId ? 'Editing round' : 'New round'}
          title={editingId ? (editingRound?.title ?? 'Round') : 'Create a round'}
          actions={
            editingId ? (
              <Button
                variant="quiet"
                size="sm"
                onClick={() => {
                  setEditingId(null)
                  setDraft(emptyDraft())
                  setMessage(null)
                }}
              >
                New instead
              </Button>
            ) : null
          }
        />

        <form className="mt-4 space-y-3" onSubmit={submit}>
          <Field label="Title" hint="e.g. “Matchday 9 · Topptipset”">
            <TextInput
              value={draft.title}
              onChange={(event) => set('title', event.target.value)}
              placeholder="Matchday 9"
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Round date">
              <TextInput
                type="datetime-local"
                value={draft.roundDate}
                onChange={(event) => set('roundDate', event.target.value)}
              />
            </Field>
            <Field label="Mode" hint="Team = one joint coupon, individual = meetup">
              <select
                className="field"
                value={draft.mode}
                onChange={(event) => set('mode', event.target.value as RoundMode)}
              >
                <option value="team">Team coupon</option>
                <option value="individual">Individual (meetup)</option>
              </select>
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-[1.4fr_1fr_0.8fr]">
            <Field label="Product">
              <select
                className="field"
                value={draft.product}
                onChange={(event) => {
                  const product = event.target.value
                  const option = PRODUCT_OPTIONS.find((candidate) => candidate.value === product)
                  setDraft((current) => ({
                    ...current,
                    product,
                    matchCount: option?.matches ?? current.matchCount,
                  }))
                }}
              >
                {PRODUCT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label="Draw number"
              hint={
                PRODUCT_OPTIONS.find((option) => option.value === draft.product)?.needsDrawNumber
                  ? 'Required for Topptipset'
                  : 'Blank = latest'
              }
            >
              <TextInput
                inputMode="numeric"
                value={draft.drawNumber}
                onChange={(event) => set('drawNumber', event.target.value.replace(/[^0-9]/g, ''))}
                placeholder="2619"
              />
            </Field>
            <Field label="Matches">
              <TextInput
                inputMode="numeric"
                value={draft.matchCount}
                onChange={(event) =>
                  set('matchCount', Math.min(13, Math.max(1, Number(event.target.value) || 1)))
                }
              />
            </Field>
          </div>

          <Field label="Notes (optional)">
            <TextInput
              value={draft.notes}
              onChange={(event) => set('notes', event.target.value)}
              placeholder="Anything the league should know"
            />
          </Field>

          {message ? (
            <InlineNote tone={message.tone === 'ok' ? 'lime' : 'rose'}>{message.text}</InlineNote>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button type="submit" loading={busy}>
              {editingId ? 'Save changes' : 'Create round'}
            </Button>
            <Button variant="ghost" onClick={sync} loading={syncing} disabled={!editingId}>
              Sync draw
            </Button>
            {editingId ? (
              <Button variant="danger" onClick={remove} disabled={busy}>
                Delete
              </Button>
            ) : null}
          </div>

          <p className="text-[11px] text-muted-2">
            Sync pulls fixtures, kickoff times and results from Svenska Spel. A manual outcome you set
            later is never overwritten by a re-sync.
          </p>
        </form>
      </Card>

      <Card className="p-4">
        <SectionHeader
          eyebrow="Rounds"
          title="Recent & upcoming"
          actions={
            <Button variant="ghost" size="sm" onClick={rounds.refresh} loading={rounds.loading}>
              Refresh
            </Button>
          }
        />

        <div className="mt-3 space-y-2">
          {rounds.loading && !rounds.data ? <Skeleton className="h-16 w-full" /> : null}
          {rounds.data?.length === 0 ? (
            <p className="rounded-xl border border-line-soft bg-surface-2/40 px-3 py-6 text-center text-xs text-muted">
              No rounds yet.
            </p>
          ) : null}
          {(rounds.data ?? []).map((round) => (
            <RoundRow
              key={round.id}
              round={round}
              selected={round.id === editingId}
              onSelect={() => {
                setEditingId(round.id)
                setMessage(null)
              }}
              meta={
                round.api_synced_at ? (
                  <Badge>{`synced ${relativeTime(round.api_synced_at)}`}</Badge>
                ) : null
              }
            />
          ))}
        </div>
      </Card>
    </div>
  )
}
