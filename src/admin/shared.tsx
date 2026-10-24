import type { ReactNode } from 'react'
import { StatusBadge } from '../components/RoundHeader'
import { Field, cn } from '../components/ui'
import { formatDateTime } from '../lib/format'
import type { Round, Team, TeamEra } from '../lib/types'
import { productLabel } from '../lib/svenskaSpel'

export function RoundSelect({
  rounds,
  value,
  onChange,
  label = 'Round',
  hint,
}: {
  rounds: Round[]
  value: string
  onChange: (id: string) => void
  label?: string
  hint?: string
}) {
  return (
    <Field label={label} hint={hint}>
      <select className="field" value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">Select a round…</option>
        {rounds.map((round) => (
          <option key={round.id} value={round.id}>
            {round.title} — {formatDateTime(round.round_date)}
            {round.status === 'live' ? ' · live' : round.status === 'completed' ? ' · final' : ''}
          </option>
        ))}
      </select>
    </Field>
  )
}

export function RoundRow({
  round,
  selected,
  onSelect,
  meta,
}: {
  round: Round
  selected?: boolean
  onSelect: () => void
  meta?: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors',
        selected
          ? 'border-lime/40 bg-lime/[0.07]'
          : 'border-line-soft bg-surface-2/40 hover:border-line hover:bg-surface-2',
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-chalk">{round.title}</div>
        <div className="mt-0.5 truncate text-[11px] text-muted-2">
          {formatDateTime(round.round_date)} · {round.mode === 'team' ? 'team' : 'individual'} ·{' '}
          {round.match_count} matches · {productLabel(round.svenska_spel_product)}
          {round.draw_number ? ` #${round.draw_number}` : ''}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {meta}
        <StatusBadge status={round.status} />
      </div>
    </button>
  )
}

/** Teams whose era covered the round date — the ones allowed to submit. */
export function teamsForRound(teams: Team[], eras: TeamEra[], roundDate: string | null): Team[] {
  if (!roundDate) return teams
  const date = roundDate.slice(0, 10)
  const validEraIds = new Set(
    eras
      .filter(
        (era) => date >= era.start_date && (era.end_date === null || date <= era.end_date),
      )
      .map((era) => era.id),
  )
  return teams.filter((team) => validEraIds.has(team.era_id))
}
