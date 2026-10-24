import { useEffect, useState } from 'react'
import { fetchLeagueContext } from '../lib/api'
import { deleteEra, deletePlayer, deleteTeam, saveEra, savePlayer, saveTeam } from '../lib/admin'
import { formatDate } from '../lib/format'
import { useAsync } from '../hooks/useAsync'
import {
  Badge,
  Button,
  Card,
  Field,
  InlineNote,
  SectionHeader,
  TextInput,
  cn,
} from '../components/ui'
import type { Player, Team, TeamEra } from '../lib/types'

interface Flash {
  tone: 'ok' | 'error'
  text: string
}

export function AdminLeague({ token }: { token: string }) {
  const context = useAsync(() => fetchLeagueContext(), [])
  const [flash, setFlash] = useState<Flash | null>(null)

  const refresh = () => {
    context.refresh()
  }

  // Feedback must be visible without scrolling back to the top of the page.
  useEffect(() => {
    if (!flash) return
    const timer = window.setTimeout(() => setFlash(null), 7000)
    return () => window.clearTimeout(timer)
  }, [flash])

  return (
    <div className="space-y-4">
      {flash ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
          <div
            role="status"
            aria-live="polite"
            className={cn(
              'pointer-events-auto max-w-md rounded-xl border px-4 py-2.5 text-sm shadow-lg backdrop-blur',
              flash.tone === 'ok'
                ? 'border-lime/40 bg-lime/10 text-lime'
                : 'border-rose/40 bg-rose/10 text-rose',
            )}
          >
            {flash.text}
          </div>
        </div>
      ) : null}
      {context.error ? <InlineNote tone="rose">{context.error}</InlineNote> : null}

      <PlayersCard
        token={token}
        players={context.data?.players ?? []}
        onSaved={refresh}
        onFlash={setFlash}
      />
      <ErasCard token={token} eras={context.data?.eras ?? []} onSaved={refresh} onFlash={setFlash} />
      <TeamsCard
        token={token}
        teams={context.data?.teams ?? []}
        eras={context.data?.eras ?? []}
        players={context.data?.players ?? []}
        onSaved={refresh}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
function PlayersCard({
  token,
  players,
  onSaved,
  onFlash,
}: {
  token: string
  players: Player[]
  onSaved: () => void
  onFlash: (flash: Flash) => void
}) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  async function add() {
    if (!name.trim()) return
    setBusy(true)
    try {
      await savePlayer(token, { name })
      setName('')
      onSaved()
      onFlash({ tone: 'ok', text: 'Player added.' })
    } catch (cause) {
      onFlash({ tone: 'error', text: cause instanceof Error ? cause.message : 'Could not add player' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="p-4">
      <SectionHeader
        eyebrow={`${players.length} players`}
        title="Players"
        description="Eight humans, one row each. They keep their identity across every era."
      />

      <div className="mt-4 flex flex-wrap items-end gap-2">
        <Field label="New player" className="min-w-[12rem] flex-1">
          <TextInput
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Full name"
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                void add()
              }
            }}
          />
        </Field>
        <Button onClick={add} loading={busy} disabled={!name.trim()}>
          Add player
        </Button>
      </div>

      <ul className="mt-4 space-y-1.5">
        {players.map((player) => (
          <PlayerRow key={player.id} player={player} token={token} onSaved={onSaved} onFlash={onFlash} />
        ))}
        {players.length === 0 ? (
          <li className="rounded-xl border border-line-soft bg-surface-2/40 px-3 py-4 text-center text-xs text-muted">
            No players yet.
          </li>
        ) : null}
      </ul>
    </Card>
  )
}

function PlayerRow({
  player,
  token,
  onSaved,
  onFlash,
}: {
  player: Player
  token: string
  onSaved: () => void
  onFlash: (flash: Flash) => void
}) {
  const [name, setName] = useState(player.name)
  const [active, setActive] = useState(player.is_active)
  const [busy, setBusy] = useState(false)
  const dirty = name !== player.name || active !== player.is_active

  async function save() {
    setBusy(true)
    try {
      await savePlayer(token, { id: player.id, name, isActive: active })
      onSaved()
      onFlash({ tone: 'ok', text: 'Player updated.' })
    } catch (cause) {
      onFlash({ tone: 'error', text: cause instanceof Error ? cause.message : 'Could not save' })
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    const ok = window.confirm(
      `Delete ${player.name}? A player who is still in a team (or owns coupons) cannot be removed.`,
    )
    if (!ok) return
    setBusy(true)
    try {
      await deletePlayer(token, player.id)
      onSaved()
      onFlash({ tone: 'ok', text: `${player.name} deleted.` })
    } catch (cause) {
      onFlash({ tone: 'error', text: cause instanceof Error ? cause.message : 'Could not delete' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className="flex flex-wrap items-center gap-2 rounded-xl border border-line-soft bg-surface-2/30 px-2.5 py-2">
      <TextInput
        className="min-w-[8rem] flex-1 py-1.5"
        value={name}
        onChange={(event) => setName(event.target.value)}
        aria-label={`Name for ${player.name}`}
      />
      <label className="flex items-center gap-1.5 text-[11px] text-muted">
        <input
          type="checkbox"
          checked={active}
          onChange={(event) => setActive(event.target.checked)}
          className="size-3.5 accent-lime"
        />
        active
      </label>
      <Button size="sm" variant={dirty ? 'primary' : 'ghost'} onClick={save} loading={busy} disabled={!dirty}>
        Save
      </Button>
      <Button size="sm" variant="danger" onClick={() => void remove()} disabled={busy}>
        Delete
      </Button>
    </li>
  )
}

// ---------------------------------------------------------------------------
function ErasCard({
  token,
  eras,
  onSaved,
  onFlash,
}: {
  token: string
  eras: TeamEra[]
  onSaved: () => void
  onFlash: (flash: Flash) => void
}) {
  const [editing, setEditing] = useState<TeamEra | null>(null)
  const [name, setName] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [active, setActive] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!editing) {
      setName('')
      setStart('')
      setEnd('')
      setActive(false)
      return
    }
    setName(editing.name)
    setStart(editing.start_date)
    setEnd(editing.end_date ?? '')
    setActive(editing.is_active)
  }, [editing])

  async function submit() {
    if (!name.trim() || !start) {
      onFlash({ tone: 'error', text: 'Name and start date are required.' })
      return
    }
    setBusy(true)
    try {
      await saveEra(token, {
        id: editing?.id ?? null,
        name,
        startDate: start,
        endDate: end || null,
        isActive: active,
      })
      setEditing(null)
      onSaved()
      onFlash({ tone: 'ok', text: 'Era saved.' })
    } catch (cause) {
      onFlash({ tone: 'error', text: cause instanceof Error ? cause.message : 'Could not save era' })
    } finally {
      setBusy(false)
    }
  }

  async function remove(era: TeamEra) {
    const ok = window.confirm(
      `Delete ${era.name} and all of its teams? Rounds and coupons are kept, so an era with coupons cannot be removed.`,
    )
    if (!ok) return
    setBusy(true)
    try {
      await deleteEra(token, era.id)
      if (editing?.id === era.id) setEditing(null)
      onSaved()
      onFlash({ tone: 'ok', text: `${era.name} deleted.` })
    } catch (cause) {
      onFlash({ tone: 'error', text: cause instanceof Error ? cause.message : 'Could not delete era' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="p-4">
      <SectionHeader
        eyebrow={`${eras.length} eras`}
        title="Team eras"
        description="A cohort of four teams with a start and end date. Only one era is active at a time."
      />

      <div className="mt-4 grid gap-3 sm:grid-cols-4">
        <Field label="Name" className="sm:col-span-2">
          <TextInput value={name} onChange={(event) => setName(event.target.value)} placeholder="2027–2029 Era" />
        </Field>
        <Field label="Start">
          <TextInput type="date" value={start} onChange={(event) => setStart(event.target.value)} />
        </Field>
        <Field label="End" hint="Blank = open">
          <TextInput type="date" value={end} onChange={(event) => setEnd(event.target.value)} />
        </Field>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1.5 text-[11px] text-muted">
          <input
            type="checkbox"
            checked={active}
            onChange={(event) => setActive(event.target.checked)}
            className="size-3.5 accent-lime"
          />
          active cohort
        </label>
        <Button onClick={submit} loading={busy}>
          {editing ? 'Save era' : 'Create era'}
        </Button>
        {editing ? (
          <Button variant="quiet" onClick={() => setEditing(null)}>
            Cancel
          </Button>
        ) : null}
      </div>

      <ul className="mt-4 space-y-1.5">
        {eras.map((era) => (
          <li
            key={era.id}
            className="flex items-center justify-between gap-2 rounded-xl border border-line-soft bg-surface-2/30 px-3 py-2"
          >
            <div>
              <div className="flex items-center gap-2 text-sm text-chalk">
                {era.name}
                {era.is_active ? <Badge tone="lime">active</Badge> : null}
              </div>
              <div className="text-[11px] text-muted-2">
                {formatDate(era.start_date)} → {era.end_date ? formatDate(era.end_date) : 'present'}
              </div>
            </div>
            <div className="flex shrink-0 gap-1.5">
              <Button size="sm" variant="ghost" onClick={() => setEditing(era)}>
                Edit
              </Button>
              <Button size="sm" variant="danger" onClick={() => void remove(era)} disabled={busy}>
                Delete
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  )
}

// ---------------------------------------------------------------------------
function TeamsCard({
  token,
  teams,
  eras,
  players,
  onSaved,
}: {
  token: string
  teams: Team[]
  eras: TeamEra[]
  players: Player[]
  onSaved: () => void
}) {
  const activeEra = eras.find((era) => era.is_active)?.id ?? eras[0]?.id ?? ''
  const [eraId, setEraId] = useState(activeEra)
  const [editing, setEditing] = useState<Team | null>(null)
  const [name, setName] = useState('')
  const [player1, setPlayer1] = useState('')
  const [player2, setPlayer2] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<Flash | null>(null)

  useEffect(() => {
    if (!eraId && activeEra) setEraId(activeEra)
  }, [activeEra, eraId])

  useEffect(() => {
    setName(editing?.name ?? '')
    setPlayer1(editing?.player_1_id ?? '')
    setPlayer2(editing?.player_2_id ?? '')
    if (editing) setEraId(editing.era_id)
  }, [editing])

  const eraTeams = teams.filter((team) => team.era_id === eraId)
  const nameOf = (id: string) => players.find((player) => player.id === id)?.name ?? '?'
  const eraName = eras.find((era) => era.id === eraId)?.name ?? 'this era'

  // Players already paired in this era (the team being edited keeps its own slots).
  const taken = new Map<string, string>()
  for (const team of eraTeams) {
    if (editing && team.id === editing.id) continue
    taken.set(team.player_1_id, team.name)
    taken.set(team.player_2_id, team.name)
  }
  const freePlayers = players.filter((player) => !taken.has(player.id))

  async function submit() {
    if (!eraId) {
      setNotice({ tone: 'error', text: 'Pick an era for the team.' })
      return
    }
    if (!name.trim()) {
      setNotice({ tone: 'error', text: 'Give the team a name.' })
      return
    }
    if (!player1 || !player2) {
      setNotice({ tone: 'error', text: 'Pick two players for this team.' })
      return
    }
    if (player1 === player2) {
      setNotice({ tone: 'error', text: 'Pick two different players.' })
      return
    }
    if (taken.has(player1) || taken.has(player2)) {
      setNotice({
        tone: 'error',
        text: 'One of those players already has a team in this era — edit that team instead.',
      })
      return
    }

    setBusy(true)
    setNotice(null)
    try {
      await saveTeam(token, {
        id: editing?.id ?? null,
        eraId,
        name,
        player1Id: player1,
        player2Id: player2,
      })
      setEditing(null)
      setName('')
      setPlayer1('')
      setPlayer2('')
      onSaved()
      setNotice({ tone: 'ok', text: `${name.trim()} saved to ${eraName}.` })
    } catch (cause) {
      setNotice({
        tone: 'error',
        text: cause instanceof Error ? cause.message : 'Could not save team',
      })
    } finally {
      setBusy(false)
    }
  }

  async function remove(team: Team) {
    if (!window.confirm(`Delete ${team.name}?`)) return
    setNotice(null)
    try {
      await deleteTeam(token, team.id)
      onSaved()
      setNotice({ tone: 'ok', text: `${team.name} deleted.` })
    } catch (cause) {
      setNotice({
        tone: 'error',
        text: cause instanceof Error ? cause.message : 'Could not delete team',
      })
    }
  }

  return (
    <Card className="p-4">
      <SectionHeader
        eyebrow={`${eraTeams.length} teams`}
        title="Teams"
        description="Two players per team, pinned to one era. Reshuffling means a new era, not editing the old teams."
        actions={
          <select className="field w-auto py-1.5 text-xs" value={eraId} onChange={(event) => setEraId(event.target.value)}>
            {eras.map((era) => (
              <option key={era.id} value={era.id}>
                {era.name}
              </option>
            ))}
          </select>
        }
      />

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label="Team name">
          <TextInput value={name} onChange={(event) => setName(event.target.value)} placeholder="Northlight" />
        </Field>
        <Field label="Era">
          <select className="field" value={eraId} onChange={(event) => setEraId(event.target.value)}>
            {eras.map((era) => (
              <option key={era.id} value={era.id}>
                {era.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Player 1">
          <select className="field" value={player1} onChange={(event) => setPlayer1(event.target.value)}>
            <option value="">Select…</option>
            {players.map((player) => {
              const team = taken.get(player.id)
              return (
                <option key={player.id} value={player.id} disabled={Boolean(team)}>
                  {player.name}
                  {team ? ` — in ${team}` : ''}
                </option>
              )
            })}
          </select>
        </Field>
        <Field label="Player 2">
          <select className="field" value={player2} onChange={(event) => setPlayer2(event.target.value)}>
            <option value="">Select…</option>
            {players.map((player) => {
              const team = taken.get(player.id)
              return (
                <option key={player.id} value={player.id} disabled={Boolean(team)}>
                  {player.name}
                  {team ? ` — in ${team}` : ''}
                </option>
              )
            })}
          </select>
        </Field>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button onClick={submit} loading={busy}>
          {editing ? 'Save team' : 'Add team'}
        </Button>
        {editing ? (
          <Button variant="quiet" onClick={() => setEditing(null)}>
            Cancel
          </Button>
        ) : null}
      </div>

      <p className="mt-2 text-[11px] text-muted-2">
        {freePlayers.length} of {players.length} players still free in {eraName}. Each player can
        hold one team per era — to re-pair someone, edit their team or start a new era.
      </p>

      {notice ? (
        <div className="mt-3">
          <InlineNote tone={notice.tone === 'ok' ? 'lime' : 'rose'}>{notice.text}</InlineNote>
        </div>
      ) : null}

      <ul className="mt-4 space-y-1.5">
        {eraTeams.map((team) => (
          <li
            key={team.id}
            className={cn(
              'flex items-center justify-between gap-2 rounded-xl border px-3 py-2',
              editing?.id === team.id ? 'border-lime/40 bg-lime/[0.06]' : 'border-line-soft bg-surface-2/30',
            )}
          >
            <div>
              <div className="text-sm text-chalk">{team.name}</div>
              <div className="text-[11px] text-muted-2">
                {nameOf(team.player_1_id)} &amp; {nameOf(team.player_2_id)}
              </div>
            </div>
            <div className="flex gap-1.5">
              <Button size="sm" variant="ghost" onClick={() => setEditing(team)}>
                Edit
              </Button>
              <Button size="sm" variant="danger" onClick={() => void remove(team)}>
                Delete
              </Button>
            </div>
          </li>
        ))}
        {eraTeams.length === 0 ? (
          <li className="rounded-xl border border-line-soft bg-surface-2/40 px-3 py-4 text-center text-xs text-muted">
            No teams in this era yet.
          </li>
        ) : null}
      </ul>
    </Card>
  )
}
