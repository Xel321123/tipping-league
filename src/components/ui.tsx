import type { ButtonHTMLAttributes, HTMLAttributes, InputHTMLAttributes, ReactNode } from 'react'

export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

// ---------------------------------------------------------------------------
// Surfaces
// ---------------------------------------------------------------------------
export function Card({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('panel', className)} {...rest}>
      {children}
    </div>
  )
}

export function SectionHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string
  title: string
  description?: string
  actions?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {eyebrow ? <div className="label mb-1">{eyebrow}</div> : null}
        <h2 className="text-lg font-semibold tracking-tight text-chalk sm:text-xl">{title}</h2>
        {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Bits
// ---------------------------------------------------------------------------
type Tone = 'neutral' | 'lime' | 'sky' | 'amber' | 'rose'

const TONES: Record<Tone, string> = {
  neutral: 'border-line bg-surface-2/70 text-muted',
  lime: 'border-lime/30 bg-lime/10 text-lime',
  sky: 'border-sky/30 bg-sky/10 text-sky',
  amber: 'border-amber/30 bg-amber/10 text-amber',
  rose: 'border-rose/30 bg-rose/10 text-rose',
}

export function Badge({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: Tone
  children: ReactNode
  className?: string
}) {
  return <span className={cn('chip', TONES[tone], className)}>{children}</span>
}

export function LiveDot({ className }: { className?: string }) {
  return <span className={cn('live-dot inline-block size-1.5 rounded-full bg-current', className)} />
}

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------
type Variant = 'primary' | 'ghost' | 'quiet' | 'danger'

export function buttonClass(variant: Variant = 'primary', size: 'md' | 'sm' = 'md'): string {
  return cn('btn', `btn-${variant}`, size === 'sm' && 'btn-sm')
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: 'md' | 'sm'
  loading?: boolean
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  className,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      className={cn(buttonClass(variant, size), className)}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <Spinner className="size-3.5" /> : null}
      {children}
    </button>
  )
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cn('size-4 animate-spin text-current', className)} fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Forms
// ---------------------------------------------------------------------------
export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string
  hint?: string
  children: ReactNode
  className?: string
}) {
  return (
    <label className={cn('block', className)}>
      <span className="label mb-1.5 block">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-[11px] text-muted-2">{hint}</span> : null}
    </label>
  )
}

export function TextInput({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn('field', className)} {...rest} />
}

// ---------------------------------------------------------------------------
// States
// ---------------------------------------------------------------------------
export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string
  description?: string
  action?: ReactNode
  icon?: ReactNode
}) {
  return (
    <div className="panel flex flex-col items-center gap-2 px-6 py-12 text-center">
      {icon ? <div className="mb-1 text-muted-2">{icon}</div> : null}
      <p className="text-sm font-semibold text-chalk">{title}</p>
      {description ? <p className="max-w-md text-sm text-muted">{description}</p> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  )
}

export function ErrorNote({
  message,
  hint,
  onRetry,
}: {
  message: string
  hint?: string | null
  onRetry?: () => void
}) {
  return (
    <div className="rounded-2xl border border-rose/25 bg-rose/[0.06] p-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-rose">⚠</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-rose">{message}</p>
          {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
        </div>
        {onRetry ? (
          <Button variant="ghost" size="sm" onClick={onRetry}>
            Retry
          </Button>
        ) : null}
      </div>
    </div>
  )
}

export function InlineNote({ children, tone = 'neutral' }: { children: ReactNode; tone?: Tone }) {
  return (
    <div className={cn('rounded-xl border px-3 py-2 text-xs', TONES[tone])}>{children}</div>
  )
}

export function Stat({
  label,
  value,
  sub,
  tone = 'neutral',
}: {
  label: string
  value: ReactNode
  sub?: string
  tone?: 'neutral' | 'lime' | 'amber' | 'sky'
}) {
  const accent =
    tone === 'lime' ? 'text-lime' : tone === 'amber' ? 'text-amber' : tone === 'sky' ? 'text-sky' : 'text-chalk'
  return (
    <div className="panel px-4 py-3">
      <div className="label">{label}</div>
      <div className={cn('tnum mt-1 text-2xl font-semibold tracking-tight', accent)}>{value}</div>
      {sub ? <div className="mt-0.5 text-[11px] text-muted-2">{sub}</div> : null}
    </div>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-xl bg-surface-2', className)} />
}
