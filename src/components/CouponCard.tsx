import { cellState } from '../lib/scores'
import { formatRows } from '../lib/format'
import { cn } from './ui'
import type { CouponCard as CouponCardModel, RoundMatch } from '../lib/types'

const STATE_CLASS: Record<'pending' | 'live' | 'void' | 'hit' | 'miss', string> = {
  pending: 'cell-pending',
  live: 'cell-live',
  void: 'cell-void',
  hit: 'cell-hit',
  miss: 'cell-miss',
}

export function CouponCardView({
  card,
  matches,
  onOpen,
}: {
  card: CouponCardModel
  matches: RoundMatch[]
  onOpen?: () => void
}) {
  const matchByNumber = new Map(matches.map((match) => [match.match_number, match]))
  const numbers = matches.map((match) => match.match_number)
  const hits = card.score?.hits ?? 0
  const total = card.score?.matches ?? matches.length
  const rowsAlive = card.score?.rows_alive ?? 0
  const perfect = card.score?.perfect ?? false
  const out = (card.score?.misses ?? 0) > 0

  const columns = numbers.length > 8 ? 'grid-cols-5 sm:grid-cols-7' : 'grid-cols-4 sm:grid-cols-8'

  return (
    <article
      className={cn(
        'panel relative overflow-hidden p-4 transition-colors',
        onOpen && 'cursor-pointer hover:border-line/70 hover:bg-surface-2/60',
      )}
      onClick={onOpen}
    >
      {perfect ? (
        <span className="absolute right-0 top-0 rounded-bl-lg bg-lime px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-[#0a1004]">
          Perfect
        </span>
      ) : null}

      <header className="flex items-start justify-between gap-3 pr-10">
        <div className="min-w-0">
          <h3 className="truncate text-[15px] font-semibold tracking-tight text-chalk">{card.owner}</h3>
          <p className="mt-0.5 truncate text-[11px] text-muted-2">{card.ownerDetail}</p>
        </div>
        <div className="text-right">
          <div className="tnum text-2xl font-semibold leading-none tracking-tight">
            <span className={out ? 'text-rose' : perfect ? 'text-lime' : 'text-chalk'}>{hits}</span>
            <span className="text-sm font-medium text-muted-2">/{total}</span>
          </div>
          <div className="label mt-1">hits</div>
        </div>
      </header>

      <div className={cn('mt-3.5 grid gap-1.5', columns)}>
        {numbers.map((number) => {
          const signs = card.selections[number] ?? []
          const match = matchByNumber.get(number)
          const state = cellState(match, signs)

          return (
            <div
              key={number}
              className={cn('cell', STATE_CLASS[state])}
              title={`Match ${number}${match ? ` · ${match.home_team} vs ${match.away_team}` : ''} · picks ${signs.join('') || '—'}`}
            >
              <span className="text-[9px] font-medium opacity-50">{number}</span>
              <span className="tnum text-[12.5px] leading-none tracking-tight">
                {signs.length > 0 ? signs.join('') : '·'}
              </span>
            </div>
          )
        })}
      </div>

      <footer className="mt-3 flex items-center justify-between gap-2 text-[11px]">
        <span className="text-muted-2">
          <span className="tnum text-muted">{formatRows(rowsAlive)}</span> of{' '}
          <span className="tnum">{formatRows(card.score?.total_rows ?? card.coupon.total_rows)}</span> rows alive
        </span>
        {out ? (
          <span className="font-medium text-rose">Out</span>
        ) : perfect ? (
          <span className="font-medium text-lime">Perfect</span>
        ) : card.score && card.score.resolved > 0 ? (
          <span className="text-amber">In play</span>
        ) : (
          <span className="text-muted-2">Not started</span>
        )}
      </footer>
    </article>
  )
}
