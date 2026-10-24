# Project plan — Tipping League

## 1. Goal

One place for an eight-person tipping league to see, in real time:

* what the current round's coupons look like against live scores,
* who is leading the table in the active team era,
* how each individual has performed across team and solo rounds,
* and a permanent archive that survives team reshuffles.

Non-goals: handling money, user accounts for the eight players, or automating the
Svenska Spel login. The admin enters coupons; the league reads.

## 2. Constraints that shaped the design

| Constraint | Consequence |
| --- | --- |
| Public repository | No secrets in code. Public values only (`VITE_SUPABASE_URL`, anon key). Admin writes are token-gated in Postgres, never in the bundle. |
| Shared Supabase instance | Everything in the `tipping` schema; `public` untouched. Client sends `Accept-Profile: tipping`. |
| Teams reshuffle every 2–3 years | `team_eras` with start/end dates; `teams` reference an era; coupons reference teams, so history keeps its composition. |
| Two round formats | `rounds.mode` = `team` \| `individual`, enforced by a trigger on `coupons` (team XOR player). |
| Hedged coupons | `coupon_selections.signs text[]` — 1–3 distinct signs; `total_rows` derived by trigger. |
| Different members, different draws | A round stores product + draw id/number; sync resolves matches for that draw, not "the latest". |
| Flaky external API | CORS proxy (Edge Function) + manual per-match override that survives re-syncs. |
| Static hosting | GitHub Pages, hash-free routing via a `404.html` copy of `index.html`. |

## 3. Architecture

```
┌─────────────────────────┐        HTTPS/JSON        ┌────────────────────────────┐
│  React SPA (Pages)      │ ───────────────────────► │  Supabase (shared)         │
│  Vite · TS · Tailwind   │   Accept-Profile:tipping │                            │
│                         │                          │  PostgREST  ──► tipping     │
│  lib/api.ts  ───────────┼─────────────────────────►│    tables + stats views    │
│  lib/admin.ts ──────────┼── rpc(admin_*, token) ──►│    SECURITY DEFINER RPCs   │
│  lib/svenskaSpel.ts     │                          │  Edge Function ss-draw     │
└───────────┬─────────────┘                          └──────────────┬─────────────┘
            │ direct, then proxy fallback                           │
            └──────────────────────────────────────────────────────►│ api.spela.svenskaspel.se
```

* **Reads** go straight to tables/views. RLS allows `SELECT` for `anon`.
* **Writes** only through `admin_*` RPCs which call `assert_admin(token)`.
* **Time** is stored as `timestamptz`; era membership is compared in `Europe/Stockholm`
  local dates (the league's calendar).

## 4. Schema

| Table | Purpose | Notable constraints |
| --- | --- | --- |
| `players` | the eight humans | unique name |
| `team_eras` | cohort + dates | one active era (partial unique index) |
| `teams` | 2 players, one era | distinct players, unique name per era, one team per player per era (trigger) |
| `rounds` | weekend / draw | mode check, status check, `match_count` 1–13 |
| `round_matches` | fixtures + live state | unique `(round_id, match_number)`, outcome check |
| `coupons` | one per team or per player per round | partial unique indexes, mode/owner trigger |
| `coupon_selections` | one row per match | unique `(coupon_id, match_number)`, `signs_valid()` check |
| `admin_config`, `admin_sessions`, `admin_login_attempts` | admin auth | bcrypt hash, sha256 token hashes, 8 failures / 10 min lockout |

Derived views: `v_coupon_selection_state` (per-match), `v_coupon_scores` (per coupon),
`v_pick_distribution`, `v_team_stats`, `v_player_stats`, `v_round_winners`.

### Scoring semantics

* resolved = `outcome` (final) or `current_result` (live, provisional)
* hit = `resolved = any(signs)`
* rows alive = `∏ len(signs)` over unresolved matches, `0` once a resolved match is missed
* cancelled match = void (neither hit nor miss, all rows survive)
* round status = derived (all decided → completed, any live/kicked off → live)
* team wins = coupon with max hits among fully resolved coupons in a completed round (ties shared)

## 5. Svenska Spel integration

Endpoints used (`/draw/1/{product}/draws[/{drawNumber}]`):

* `topptipset` (8) — **collection endpoint retired**, per-draw documents still work:
  `GET /draw/1/topptipset/draws/4405` → 200, while `GET /draw/1/topptipset/draws`
  returns *"No route found"*. A Topptipset round therefore stores its draw number.
* `europatipset` (13, Premier League + Europe) — verified working
* `stryktipset` (13) — verified working
* `maltipset` — verified working, currently returns no draws

Normalisation (`src/lib/svenskaSpel.ts`):

| Upstream | Ours |
| --- | --- |
| `drawEvents[].eventNumber` | `match_number` |
| `participants[type=home/away].name` | `home_team` / `away_team` |
| `match.matchStart` | `kickoff` |
| `result[type=2]` (Fulltime) | `outcome` (1/X/2) when `statusId = 31` |
| `result[type=9]` (Current) | `current_result`, live scores |
| `event.cancelled` | `cancelled` / `match_status = cancelled` |

**Three Topptipset pools share one draw-number series.** `topptipset` (25), `topptipsetextra`
(24) and `topptipsetstryk` (23) each return different fixtures for the same draw number, so a
round always stores product + draw. The admin selects the product; the round shows it and
links to the matching spela.se result page.

**Not available upstream: payouts.** The draw carries `currentNetSale`, `rowPrice` and
`fund` (rollover), but no prize table — and `result/*` routes are gone. Topptipset has one
variable prize group (8/8 rows, 70% of stakes). Winnings are therefore recorded per coupon
by the admin (`coupons.winnings`) and aggregated in `v_team_stats`, `v_player_stats` and
`v_player_era_stats`.

CORS: the API returns no `Access-Control-Allow-Origin`. The client tries direct fetch,
then the `ss-draw` Edge Function, then tells the admin to enter data manually. Manual
outcomes are preserved by `admin_sync_matches` (`coalesce(excluded.outcome, existing)`),
and `admin_set_match_state` is the explicit override (null clears).

## 6. Security checklist (verified in the migration)

- [x] RLS enabled on every table in `tipping`
- [x] `SELECT`-only policies for `anon` / `authenticated`; no write policies
- [x] Blanket grants revoked after table creation; explicit `SELECT` re-granted
- [x] All mutations behind `SECURITY DEFINER` functions with `assert_admin`
- [x] `search_path` pinned on every `SECURITY DEFINER` function
- [x] Internal helpers (`assert_admin`, triggers, `signs_valid`) not executable by clients
- [x] Views use `security_invoker = true` so RLS applies
- [x] Passcode stored as bcrypt hash; session tokens as SHA-256 hashes
- [x] Login throttled (8 failures / 10 minutes) + forced passcode rotation on first use
- [x] No secret ever reaches a `VITE_*` variable
- [x] `supabase/.temp/` git-ignored (contains linked project refs)

## 7. Key decisions

1. **No Supabase Auth.** Eight friends, one admin, no per-user login in the brief. A
   single token-gated admin is the smallest thing that satisfies "zero trust" without
   inventing accounts for people who will never sign in.
2. **Scoring in SQL, not TypeScript.** One implementation of the hit/row logic, used by
   both the live board and the leaderboards. The client only paints cells.
3. **Client-side assembly.** The round bundle is 5 small queries joined in memory
   (`fetchRoundBundle`) rather than a deep PostgREST embed — easier to reason about, fewer
   surprises with nested ordering.
4. **`match_count` is flexible (1–13).** Keeps the 8-match model as default but lets a
   13-match Europatipset draw work while Topptipset's API is dark.
5. **Status derived by trigger.** No manual "mark completed" switch to forget.
6. **Font subsetting + lazy admin chunk.** Public bundle stays small; the admin console
   loads only when visited.

## 8. Risks / follow-ups

| Risk | Mitigation |
| --- | --- |
| Svenska Spel changes payload shape | Normaliser is isolated in one file; manual override always available |
| API rate limiting | Proxy caches 15–30 s; admin can disable polling by using manual results |
| Shared instance schemas drift | Migrations are the only writer; `tipping` never touches `public` |
| Admin passcode loss | Reset via SQL: `update tipping.admin_config set passcode_hash = extensions.crypt('<new>', extensions.gen_salt('bf',10)), must_change_passcode = false;` |
| Future per-player logins | `coupons.player_id` + RLS policies on `auth.uid()` can be layered without schema changes |
