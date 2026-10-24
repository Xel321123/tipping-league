import { Link } from 'react-router-dom'
import { cn } from './ui'

/** Nine-pitch mark: four filled cells = a 4-row coupon with hedges. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={cn('size-8', className)}>
      <rect x="1" y="1" width="30" height="30" rx="8" fill="#0D131C" stroke="#1E2A3A" />
      {[0, 1, 2].map((row) =>
        [0, 1, 2].map((col) => {
          const filled = (row === 0 && col === 0) || (row === 1 && col === 1) || (row === 2 && col === 2) || (row === 0 && col === 1)
          return (
            <rect
              key={`${row}-${col}`}
              x={8 + col * 6}
              y={8 + row * 6}
              width="4"
              height="4"
              rx="1.2"
              fill={filled ? '#C9F45B' : '#26313F'}
            />
          )
        }),
      )}
    </svg>
  )
}

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link to="/" className="group flex items-center gap-2.5">
      <LogoMark className="size-8 shrink-0 transition-transform group-hover:-rotate-3" />
      <span className="leading-none">
        <span className="block text-[13px] font-bold uppercase tracking-[0.2em] text-chalk">
          Tipping
        </span>
        {!compact ? (
          <span className="mt-0.5 block text-[10px] font-medium uppercase tracking-[0.28em] text-muted-2">
            League
          </span>
        ) : null}
      </span>
    </Link>
  )
}
