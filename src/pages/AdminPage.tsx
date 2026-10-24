import { useState, type FormEvent } from 'react'
import { useAdmin } from '../hooks/useAdmin'
import { Badge, Button, Card, Field, Spinner, TextInput } from '../components/ui'
import { AdminRounds } from '../admin/AdminRounds'
import { AdminCoupons } from '../admin/AdminCoupons'
import { AdminResults } from '../admin/AdminResults'
import { AdminLeague } from '../admin/AdminLeague'

type Tab = 'rounds' | 'coupons' | 'results' | 'league'

const TABS: Array<{ id: Tab; label: string; hint: string }> = [
  { id: 'rounds', label: 'Rounds', hint: 'Create a weekend and pull the draw' },
  { id: 'coupons', label: 'Coupons', hint: 'Enter the 1/X/2 selections' },
  { id: 'results', label: 'Results', hint: 'Live scores and manual overrides' },
  { id: 'league', label: 'League', hint: 'Players, eras and teams' },
]

export function AdminPage() {
  const admin = useAdmin()

  if (!admin.ready) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-muted">
        <Spinner className="size-6" />
      </div>
    )
  }

  if (!admin.token) return <LoginCard />
  if (admin.mustChangePasscode) return <ChangePasscodeCard />
  return <Console />
}

function PasscodePanel({ onClose }: { onClose: () => void }) {
  const admin = useAdmin()
  const [passcode, setPasscode] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (passcode.length < 8) {
      setMessage({ tone: 'error', text: 'Use at least 8 characters.' })
      return
    }
    if (passcode !== confirm) {
      setMessage({ tone: 'error', text: 'The two passcodes do not match.' })
      return
    }
    setBusy(true)
    setMessage(null)
    try {
      await admin.changePasscode(passcode)
      setPasscode('')
      setConfirm('')
      setMessage({ tone: 'ok', text: 'Passcode updated. Other devices were signed out.' })
    } catch (cause) {
      setMessage({ tone: 'error', text: cause instanceof Error ? cause.message : 'Could not change it' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="p-4">
      <form className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end" onSubmit={submit}>
        <Field label="New passcode" hint="At least 8 characters.">
          <TextInput
            type="password"
            autoComplete="new-password"
            value={passcode}
            onChange={(event) => setPasscode(event.target.value)}
          />
        </Field>
        <Field label="Repeat passcode">
          <TextInput
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
          />
        </Field>
        <div className="flex gap-2">
          <Button type="submit" loading={busy} disabled={!passcode || !confirm}>
            Save
          </Button>
          <Button variant="quiet" onClick={onClose}>
            Close
          </Button>
        </div>
      </form>
      {message ? (
        <p
          className={
            message.tone === 'ok'
              ? 'mt-3 rounded-xl border border-lime/25 bg-lime/[0.06] px-3 py-2 text-xs text-lime'
              : 'mt-3 rounded-xl border border-rose/25 bg-rose/[0.06] px-3 py-2 text-xs text-rose'
          }
        >
          {message.text}
        </p>
      ) : null}
    </Card>
  )
}

function LoginCard() {
  const admin = useAdmin()
  const [passcode, setPasscode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!passcode.trim()) return
    setBusy(true)
    setError(null)
    try {
      await admin.signIn(passcode.trim())
      setPasscode('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Sign-in failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <Card className="p-5">
        <Badge tone="lime">Admin</Badge>
        <h1 className="mt-3 text-xl font-semibold tracking-tight">Sign in to manage the league</h1>
        <p className="mt-1 text-sm text-muted">
          One shared passcode for the league admin. Sessions last 12 hours on this device.
        </p>

        <form className="mt-5 space-y-3" onSubmit={submit}>
          <Field label="Passcode" hint="The bootstrap passcode is documented in the README.">
            <TextInput
              type="password"
              autoComplete="current-password"
              value={passcode}
              onChange={(event) => setPasscode(event.target.value)}
              placeholder="••••••••"
              autoFocus
            />
          </Field>
          {error ? (
            <p className="rounded-xl border border-rose/25 bg-rose/[0.06] px-3 py-2 text-xs text-rose">{error}</p>
          ) : null}
          <Button type="submit" className="w-full" loading={busy} disabled={!passcode.trim()}>
            Sign in
          </Button>
        </form>
      </Card>
    </div>
  )
}

function ChangePasscodeCard() {
  const admin = useAdmin()
  const [passcode, setPasscode] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (passcode.length < 8) {
      setError('Use at least 8 characters.')
      return
    }
    if (passcode !== confirm) {
      setError('The two passcodes do not match.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await admin.changePasscode(passcode)
      setPasscode('')
      setConfirm('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not change the passcode')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <Card className="border-amber/30 p-5">
        <Badge tone="amber">Action required</Badge>
        <h1 className="mt-3 text-xl font-semibold tracking-tight">Set your own admin passcode</h1>
        <p className="mt-1 text-sm text-muted">
          The repository ships with a public bootstrap passcode. Replace it before entering data —
          no other admin action is allowed until you do.
        </p>

        <form className="mt-5 space-y-3" onSubmit={submit}>
          <Field label="New passcode" hint="At least 8 characters.">
            <TextInput
              type="password"
              autoComplete="new-password"
              value={passcode}
              onChange={(event) => setPasscode(event.target.value)}
              autoFocus
            />
          </Field>
          <Field label="Repeat passcode">
            <TextInput
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
            />
          </Field>
          {error ? (
            <p className="rounded-xl border border-rose/25 bg-rose/[0.06] px-3 py-2 text-xs text-rose">{error}</p>
          ) : null}
          <div className="flex gap-2">
            <Button type="submit" loading={busy} className="flex-1">
              Save passcode
            </Button>
            <Button variant="quiet" onClick={() => void admin.signOut()}>
              Sign out
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}

function Console() {
  const admin = useAdmin()
  const [tab, setTab] = useState<Tab>('rounds')
  const [passcodeOpen, setPasscodeOpen] = useState(false)
  const token = admin.token
  if (!token) return null

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="label">Admin console</div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">League control</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Every write is validated in Postgres and recorded under the shared admin session.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => setPasscodeOpen((open) => !open)}>
            Passcode
          </Button>
          <Button variant="ghost" size="sm" onClick={() => void admin.signOut()}>
            Sign out
          </Button>
        </div>
      </div>

      {passcodeOpen ? <PasscodePanel onClose={() => setPasscodeOpen(false)} /> : null}

      <div className="flex gap-1 overflow-x-auto rounded-full border border-line bg-surface-2/50 p-1">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={
              item.id === tab
                ? 'whitespace-nowrap rounded-full bg-chalk px-3.5 py-1.5 text-[13px] font-medium text-ink'
                : 'whitespace-nowrap rounded-full px-3.5 py-1.5 text-[13px] font-medium text-muted hover:bg-surface-3 hover:text-chalk'
            }
          >
            {item.label}
          </button>
        ))}
      </div>

      <p className="text-xs text-muted-2">{TABS.find((item) => item.id === tab)?.hint}</p>

      {tab === 'rounds' ? <AdminRounds token={token} /> : null}
      {tab === 'coupons' ? <AdminCoupons token={token} /> : null}
      {tab === 'results' ? <AdminResults token={token} /> : null}
      {tab === 'league' ? <AdminLeague token={token} /> : null}
    </div>
  )
}
