import { SCHEMA_NOTE, config } from '../lib/env'
import { LogoMark } from '../components/Logo'
import { Badge, Card } from '../components/ui'

export function SetupScreen({ error }: { error?: string | null }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col justify-center px-4 py-10">
      <div className="mb-6 flex items-center gap-3">
        <LogoMark className="size-10" />
        <div>
          <div className="text-sm font-bold uppercase tracking-[0.2em]">Tipping</div>
          <div className="text-[10px] uppercase tracking-[0.28em] text-muted-2">League</div>
        </div>
      </div>

      <Card className="p-5">
        <Badge tone="amber">Configuration needed</Badge>
        <h1 className="mt-3 text-xl font-semibold tracking-tight">Connect the Supabase project</h1>
        <p className="mt-2 text-sm text-muted">
          The app reads its connection details from two public environment variables. They are baked
          into the bundle at build time, so set them in <code className="text-chalk">.env</code> for
          local development or in the deploy workflow for production.
        </p>

        <pre className="mt-4 overflow-x-auto rounded-xl border border-line bg-ink/70 p-3 text-[11.5px] leading-relaxed text-muted">
{`VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<publishable-or-anon-key>`}
        </pre>

        <p className="mt-3 text-xs text-muted-2">
          Only the anon/publishable key belongs here. Never a service_role key.
        </p>

        <div className="mt-4 rounded-xl border border-line-soft bg-surface-2/50 p-3 text-xs text-muted">
          <span className="font-medium text-chalk">Schema:</span> <code>{config.schema}</code> — {SCHEMA_NOTE}
        </div>

        {error ? (
          <div className="mt-4 rounded-xl border border-rose/25 bg-rose/[0.06] p-3 text-xs text-rose">
            {error}
          </div>
        ) : null}

        <p className="mt-4 text-xs text-muted-2">
          Setup steps, migrations and the Svenska Spel sync are documented in{' '}
          <code className="text-muted">README.md</code>.
        </p>
      </Card>
    </div>
  )
}
