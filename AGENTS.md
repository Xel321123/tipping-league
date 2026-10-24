# AGENTS.md — working on Tipping League

Read this before changing anything. It is the contract for humans and coding agents.

## Non-negotiables

1. **Schema isolation.** Everything lives in `tipping`. Never create, alter or read
   objects in `public`. The instance is shared with other projects. The Supabase client
   is pinned with `db: { schema: 'tipping' }` — do not create a second client without it.
2. **No secrets in the client.** Only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
   (publishable/anon). Never `service_role`, never a DB password, never a PAT. Vite
   inlines `VITE_*` into the bundle.
3. **No client writes.** `anon`/`authenticated` have `SELECT` only. Every mutation is an
   `admin_*` RPC that first calls `tipping.assert_admin(p_token)`.
4. **Validation belongs in Postgres.** Client-side checks are UX; the same rule must be a
   CHECK, trigger, index or RPC guard.
5. **One scoring implementation.** Hit/row/perfect logic lives in the SQL views. The
   client may only paint cells (`cellState`) or preview a draft (`tallySelections`).
   Do not add a third definition of "hit".
6. **RLS stays on.** New tables get `ENABLE ROW LEVEL SECURITY`, explicit policies, and an
   explicit grant — default privileges on the schema grant too much.
7. **Views are `security_invoker = true`.** They must not bypass RLS. If a view is queried
   by another view, the underlying view needs `SELECT` too.

## Commands

```bash
npm install
npm run dev          # Vite, http://localhost:5173
npm run typecheck    # tsc --noEmit — must pass before commit
npm run build        # typecheck + production build
python3 scripts/gen-icons.py
./scripts/apply-migrations.sh --seed                 # shared instance: SQL via Management API
supabase db push                                     # dedicated project only
supabase functions deploy ss-draw --no-verify-jwt    # CORS proxy
```

## Code conventions

* TypeScript strict, `noUncheckedIndexedAccess`. No `any` in app code; use `unknown` +
  narrowing at API boundaries.
* React 19 function components, hooks only, no class components.
* Data access goes through `src/lib/api.ts` (reads) and `src/lib/admin.ts` (writes).
  Components never call `supabase` directly.
* Tailwind only — no CSS-in-JS, no component library. Use the tokens and component
  classes in `src/index.css` (`panel`, `btn`, `field`, `chip`, `label`, `cell-*`).
* Every async screen handles three states: loading (skeleton), error (retry), empty.
* Never leave a raw Postgres error in the UI — `toApiError()` maps them to human text.
* Round/match numbers are 1-based everywhere.

## Domain rules to preserve

* 8 players, 4 teams of 2. `teams` never change players in place — a reshuffle is a new
  `team_eras` row + new teams.
* One coupon per team per round in `team` mode; one per player per round in `individual`
  mode. Enforced by partial unique indexes + `enforce_coupon_mode`.
* `coupon_selections.signs` ⊆ `{1,X,2}`, 1–3 values, no duplicates.
* A cancelled match is void: never a hit, never a miss.
* Live results are provisional. Only `outcome` turns a cell green; `current_result` is amber.
* `topptipset` is the schema default but its public API route is currently dead — use
  `europatipset` when you need a live draw, and keep `match_count` flexible.

## Testing expectations

* Typecheck and production build must pass — treat both as the minimum gate.
* SQL changes: apply on a scratch database first, then verify with real `SELECT`s
  (`v_coupon_scores` totals, `anon` insert rejection, `admin_*` without token).
* UI changes: check 320 px, 768 px and 1280 px widths, and keyboard focus on the admin forms.
