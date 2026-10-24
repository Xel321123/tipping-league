# Tasks

Definition of done for every phase: `npm run typecheck` and `npm run build` pass, the
feature works against the real schema, and the README/PROJECT_PLAN describe it accurately.

## Phase 0 — Repository & tooling ✅

- [x] Public GitHub repo, MIT-compatible layout, `.gitignore` covering env + Supabase state
- [x] Vite 8 + React 19 + TS strict + Tailwind v4, single `tsconfig.json`
- [x] `.env.example` documenting the two public variables
- [x] GitHub Pages workflow (typecheck → build → deploy, `404.html` SPA copy)
- [x] Deterministic icon script (stdlib only)

## Phase 1 — Schema (`tipping`) ✅

- [x] `create schema tipping` + grants + default privileges
- [x] Players, team eras, teams (2 players), rounds, matches, coupons, selections
- [x] Era boundaries + one-team-per-era + mode/owner triggers
- [x] `signs_valid()` and `total_rows` derivation
- [x] Derived round status trigger
- [x] RLS on every table, `SELECT`-only for clients, blanket grants revoked
- [x] Stats views (`v_coupon_scores`, `v_team_stats`, `v_player_stats`, `v_round_winners`,
      `v_pick_distribution`) with `security_invoker`
- [x] Seed: 8 players, two eras, eight teams

**DoD:** migrations apply cleanly on a fresh database, `anon` can read and cannot write.

## Phase 2 — Admin API ✅

- [x] bcrypt passcode, forced rotation, throttled login
- [x] 12-hour session tokens (hashed at rest)
- [x] `admin_save_player/era/team`, `admin_delete_team`
- [x] `admin_save_round`, `admin_delete_round`
- [x] `admin_sync_matches` (upsert, preserves manual outcomes)
- [x] `admin_set_match_state` (score, status, outcome override, clear)
- [x] `admin_save_coupon` / `admin_delete_coupon` with full server-side validation
- [x] Internal helpers not executable by `anon`

**DoD:** every write path callable from the client with a token, rejected without one;
no client role has table-level write grants.

## Phase 3 — Read UI ✅

- [x] Live board: spotlight round, match strip with live scores + pick distribution
- [x] Coupon cards colour-coded by state, hits, rows alive, perfect badge
- [x] Team table by era, medals, wins/perfect/hit %
- [x] Player cards combining team + solo coupons, current team
- [x] History by year, winners, era compositions
- [x] Round detail (matches + coupons + winner)
- [x] Loading skeletons, error notes with retry, empty states
- [x] Responsive from 320 px up, reduced-motion support

**DoD:** all four views render real data with no console errors; polling refreshes the
board every 30 s while visible.

## Phase 4 — Admin console ✅

- [x] Passcode gate + forced rotation screen
- [x] Rounds: create/edit/delete, product + draw number, match count, sync
- [x] Coupons: round/owner picker, 1/X/2 toggles, hedge preview, edit + delete
- [x] Results: score inputs, status, outcome buttons, FT-from-score, sync, per-row save
- [x] League: players, eras (single active), teams per era
- [x] All mutations show inline success/error feedback

**DoD:** a full weekend can be created, synced, filled and settled without touching SQL.

## Phase 5 — External data ✅

- [x] Draw normaliser (fixtures, kickoff, live score, final outcome, cancellations)
- [x] Direct fetch + Edge Function proxy fallback + actionable error
- [x] Manual override survives re-sync
- [x] Documented the retired `topptipset` route and the working products

**DoD:** sync works in a browser over CORS; with the proxy down, manual entry still works.

## Phase 6 — Launch

- [ ] Apply migrations to the shared instance, add `tipping` to exposed schemas
- [ ] Seed players/eras/teams, rotate the admin passcode
- [ ] Deploy `ss-draw`
- [x] Set Pages variables, enable Pages, verify the deployed URL
- [ ] First real round: sync draw → enter coupons → watch it live

## Backlog

- [ ] Player-facing coupon entry (magic-link auth + RLS on `auth.uid()`)
- [ ] Per-round form sparkline on the table
- [ ] CSV export of a season
- [ ] Push notification when a round is settled
- [ ] Optional PWA install + offline shell
- [ ] Draw picker (list open draws from the proxy instead of typing a number)
