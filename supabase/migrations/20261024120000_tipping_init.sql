-- ============================================================================
--  Tipping League — core schema (isolated `tipping` schema)
--
--  This app SHARES a Supabase instance with other projects. Everything lives in
--  the dedicated `tipping` schema; the `public` schema is never touched.
--
--  Security model
--  --------------
--  * All application tables have RLS enabled.
--  * `anon` / `authenticated` get SELECT only on league-visible tables/views.
--  * There is NO insert/update/delete grant for client roles. Every write goes
--    through a token-gated SECURITY DEFINER function in
--    20261024120200_tipping_admin_api.sql.
--  * `pgcrypto` (bcrypt + random tokens) is used from the `extensions` schema.
-- ============================================================================

create schema if not exists tipping;

grant usage on schema tipping to anon, authenticated, service_role;

alter default privileges in schema tipping grant all on tables to anon, authenticated, service_role;
alter default privileges in schema tipping grant all on routines to anon, authenticated, service_role;
alter default privileges in schema tipping grant all on sequences to anon, authenticated, service_role;

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Helper: is this a legal 1/X/2 pole (single, half hedge or full hedge)?
-- ---------------------------------------------------------------------------
create or replace function tipping.signs_valid(signs text[])
returns boolean
language sql
immutable
as $$
  select signs is not null
     and coalesce(array_length(signs, 1), 0) between 1 and 3
     and signs <@ array['1', 'X', '2']::text[]
     and (select count(distinct x) from unnest(signs) as x)
         = coalesce(array_length(signs, 1), 0);
$$;

comment on function tipping.signs_valid(text[]) is
  'True for non-empty, duplicate-free subsets of {1,X,2}.';

-- ---------------------------------------------------------------------------
-- 1. Players (8 humans; row identity is reused across every era)
-- ---------------------------------------------------------------------------
create table tipping.players (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  nickname   text,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  constraint players_name_unique unique (name),
  constraint players_name_not_blank check (btrim(name) <> '')
);

comment on table tipping.players is 'The humans. Team membership is expressed per era, never as a column here.';

-- ---------------------------------------------------------------------------
-- 2. Team eras — a cohort of fixed teams plus the dates it was in force.
--    Exactly one era may be active at a time.
-- ---------------------------------------------------------------------------
create table tipping.team_eras (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  start_date date not null,
  end_date   date,
  is_active  boolean not null default true,
  notes      text,
  created_at timestamptz not null default now(),
  constraint team_eras_name_unique unique (name),
  constraint team_eras_dates check (end_date is null or end_date > start_date)
);

create unique index team_eras_only_one_active
  on tipping.team_eras ((is_active))
  where is_active;

create index team_eras_start on tipping.team_eras (start_date desc);

-- ---------------------------------------------------------------------------
-- 3. Teams — two players, pinned to one era.
-- ---------------------------------------------------------------------------
create table tipping.teams (
  id          uuid primary key default gen_random_uuid(),
  era_id      uuid not null references tipping.team_eras(id) on delete cascade,
  name        text not null,
  player_1_id uuid not null references tipping.players(id) on delete restrict,
  player_2_id uuid not null references tipping.players(id) on delete restrict,
  created_at  timestamptz not null default now(),
  constraint teams_distinct_players check (player_1_id <> player_2_id),
  constraint teams_name_per_era unique (era_id, name),
  constraint teams_name_not_blank check (btrim(name) <> '')
);

create index teams_era on tipping.teams (era_id);
create index teams_p1 on tipping.teams (player_1_id);
create index teams_p2 on tipping.teams (player_2_id);

-- A player may only appear once per era (in either slot of any team).
create or replace function tipping.enforce_one_team_per_era()
returns trigger
language plpgsql
as $$
begin
  if exists (
    select 1
    from tipping.teams t
    where t.era_id = new.era_id
      and t.id is distinct from new.id
      and (
        new.player_1_id in (t.player_1_id, t.player_2_id)
        or new.player_2_id in (t.player_1_id, t.player_2_id)
      )
  ) then
    raise exception 'Player is already in a team for this era'
      using errcode = '23505';
  end if;
  return new;
end;
$$;

create trigger teams_one_per_era
  before insert or update of era_id, player_1_id, player_2_id on tipping.teams
  for each row execute function tipping.enforce_one_team_per_era();

-- ---------------------------------------------------------------------------
-- 4. Rounds — one weekend / pool draw.
-- ---------------------------------------------------------------------------
create table tipping.rounds (
  id                    uuid primary key default gen_random_uuid(),
  title                 text not null,
  mode                  text not null default 'team'
                          check (mode in ('team', 'individual')),
  svenska_spel_product  text not null default 'topptipset',
  svenska_spel_draw_id  text,
  draw_number           int,
  match_count           int not null default 8 check (match_count between 1 and 13),
  status                text not null default 'upcoming'
                          check (status in ('upcoming', 'live', 'completed')),
  round_date            timestamptz not null,
  api_synced_at         timestamptz,
  notes                 text,
  created_at            timestamptz not null default now(),
  constraint rounds_title_not_blank check (btrim(title) <> '')
);

create index rounds_date on tipping.rounds (round_date desc);
create index rounds_status on tipping.rounds (status);
create index rounds_draw on tipping.rounds (svenska_spel_product, svenska_spel_draw_id);

-- ---------------------------------------------------------------------------
-- 5. Matches — 8 (or up to 13) rows per round, with live state and a manual
--    `outcome` override that survives API re-syncs.
-- ---------------------------------------------------------------------------
create table tipping.round_matches (
  id              uuid primary key default gen_random_uuid(),
  round_id        uuid not null references tipping.rounds(id) on delete cascade,
  match_number    int not null check (match_number between 1 and 13),
  home_team       text not null,
  away_team       text not null,
  kickoff         timestamptz,
  home_score      int check (home_score >= 0),
  away_score      int check (away_score >= 0),
  match_status    text not null default 'not_started'
                    check (match_status in ('not_started', 'live', 'finished', 'cancelled')),
  current_result  text check (current_result in ('1', 'X', '2')),
  outcome         text check (outcome in ('1', 'X', '2')),
  cancelled       boolean not null default false,
  last_synced_at  timestamptz,
  constraint round_matches_number unique (round_id, match_number),
  constraint round_matches_distinct_teams check (btrim(home_team) <> btrim(away_team))
);

create index round_matches_round on tipping.round_matches (round_id, match_number);

-- ---------------------------------------------------------------------------
-- 6. Coupons — one joint bet per team in team mode, one per player in
--    individual (meetup) mode.
-- ---------------------------------------------------------------------------
create table tipping.coupons (
  id         uuid primary key default gen_random_uuid(),
  round_id   uuid not null references tipping.rounds(id) on delete cascade,
  team_id    uuid references tipping.teams(id) on delete restrict,
  player_id  uuid references tipping.players(id) on delete restrict,
  total_rows int not null default 1 check (total_rows > 0),
  note       text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index coupons_one_per_team_round
  on tipping.coupons (round_id, team_id) where team_id is not null;
create unique index coupons_one_per_player_round
  on tipping.coupons (round_id, player_id) where player_id is not null;
create index coupons_round on tipping.coupons (round_id);
create index coupons_team on tipping.coupons (team_id);
create index coupons_player on tipping.coupons (player_id);

-- Mode / owner must agree with the round.
create or replace function tipping.enforce_coupon_mode()
returns trigger
language plpgsql
as $$
declare
  v_mode text;
begin
  select mode into v_mode from tipping.rounds where id = new.round_id;

  if v_mode is null then
    raise exception 'Round % does not exist', new.round_id using errcode = '23503';
  end if;

  if v_mode = 'team' and (new.team_id is null or new.player_id is not null) then
    raise exception 'A team round coupon needs a team and no player' using errcode = '23514';
  end if;

  if v_mode = 'individual' and (new.player_id is null or new.team_id is not null) then
    raise exception 'An individual round coupon needs a player and no team' using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger coupons_mode_check
  before insert or update of round_id, team_id, player_id on tipping.coupons
  for each row execute function tipping.enforce_coupon_mode();

-- ---------------------------------------------------------------------------
-- 7. Coupon selections — one row per match, with 1/2/3 signs per match.
--    `coupons.total_rows` is derived: the product of the signs per match.
-- ---------------------------------------------------------------------------
create table tipping.coupon_selections (
  id           uuid primary key default gen_random_uuid(),
  coupon_id    uuid not null references tipping.coupons(id) on delete cascade,
  match_number int not null check (match_number between 1 and 13),
  signs        text[] not null,
  created_at   timestamptz not null default now(),
  constraint coupon_selections_unique unique (coupon_id, match_number),
  constraint coupon_selections_valid check (tipping.signs_valid(signs))
);

create index coupon_selections_coupon on tipping.coupon_selections (coupon_id, match_number);

create or replace function tipping.recalc_coupon_rows()
returns trigger
language plpgsql
as $$
declare
  v_coupon uuid := coalesce(new.coupon_id, old.coupon_id);
  v_rows bigint;
begin
  select coalesce(round(exp(sum(ln(array_length(signs, 1)))))::bigint, 1)
    into v_rows
  from tipping.coupon_selections
  where coupon_id = v_coupon;

  update tipping.coupons
     set total_rows = greatest(coalesce(v_rows, 1), 1),
         updated_at = now()
   where id = v_coupon;

  return null;
end;
$$;

create trigger coupon_selections_rowcount
  after insert or update of signs or delete on tipping.coupon_selections
  for each row execute function tipping.recalc_coupon_rows();

create or replace function tipping.touch_coupon()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger coupons_touch
  before update on tipping.coupons
  for each row execute function tipping.touch_coupon();

-- ---------------------------------------------------------------------------
-- Round status is derived, never hand-maintained.
--   all non-cancelled matches decided -> completed
--   any match live / first kickoff passed -> live
--   otherwise                          -> upcoming
-- ---------------------------------------------------------------------------
create or replace function tipping.recalc_round_status(p_round_id uuid)
returns void
language plpgsql
as $$
declare
  v_total   int;
  v_decided int;
  v_live    int;
  v_first   timestamptz;
  v_date    timestamptz;
  v_status  text;
begin
  select count(*),
         count(*) filter (where outcome is not null),
         count(*) filter (where match_status = 'live'),
         min(kickoff)
    into v_total, v_decided, v_live, v_first
  from tipping.round_matches
  where round_id = p_round_id
    and not cancelled;

  select round_date into v_date from tipping.rounds where id = p_round_id;
  if v_date is null then
    return;
  end if;

  if v_total = 0 then
    v_status := case when now() >= v_date then 'live' else 'upcoming' end;
  elsif v_decided >= v_total then
    v_status := 'completed';
  elsif v_live > 0 or v_decided > 0 then
    v_status := 'live';
  elsif (v_first is not null and now() >= v_first - interval '10 minutes')
     or now() >= v_date then
    v_status := 'live';
  else
    v_status := 'upcoming';
  end if;

  update tipping.rounds set status = v_status where id = p_round_id and status <> v_status;
end;
$$;

create or replace function tipping.trg_round_matches_status()
returns trigger language plpgsql as $$
begin
  perform tipping.recalc_round_status(coalesce(new.round_id, old.round_id));
  return null;
end;
$$;

create trigger round_matches_status
  after insert or update or delete on tipping.round_matches
  for each row execute function tipping.trg_round_matches_status();

create or replace function tipping.trg_rounds_status()
returns trigger language plpgsql as $$
begin
  perform tipping.recalc_round_status(new.id);
  return null;
end;
$$;

create trigger rounds_status
  after insert or update of round_date on tipping.rounds
  for each row execute function tipping.trg_rounds_status();

-- ---------------------------------------------------------------------------
-- Row level security: readable league data, zero client write access.
-- ---------------------------------------------------------------------------
alter table tipping.players           enable row level security;
alter table tipping.team_eras         enable row level security;
alter table tipping.teams             enable row level security;
alter table tipping.rounds            enable row level security;
alter table tipping.round_matches     enable row level security;
alter table tipping.coupons           enable row level security;
alter table tipping.coupon_selections enable row level security;

create policy players_read on tipping.players
  for select to anon, authenticated using (true);
create policy team_eras_read on tipping.team_eras
  for select to anon, authenticated using (true);
create policy teams_read on tipping.teams
  for select to anon, authenticated using (true);
create policy rounds_read on tipping.rounds
  for select to anon, authenticated using (true);
create policy round_matches_read on tipping.round_matches
  for select to anon, authenticated using (true);
create policy coupons_read on tipping.coupons
  for select to anon, authenticated using (true);
create policy coupon_selections_read on tipping.coupon_selections
  for select to anon, authenticated using (true);

-- Kill the blanket grants handed out by the default privileges above.
revoke all on all tables in schema tipping from anon, authenticated;

grant select on
  tipping.players,
  tipping.team_eras,
  tipping.teams,
  tipping.rounds,
  tipping.round_matches,
  tipping.coupons,
  tipping.coupon_selections
to anon, authenticated;

-- Internal helpers are not callable through the Data API.
revoke execute on function tipping.signs_valid(text[]) from public, anon, authenticated;
revoke execute on function tipping.enforce_one_team_per_era() from public, anon, authenticated;
revoke execute on function tipping.enforce_coupon_mode() from public, anon, authenticated;
revoke execute on function tipping.recalc_coupon_rows() from public, anon, authenticated;
revoke execute on function tipping.touch_coupon() from public, anon, authenticated;
revoke execute on function tipping.recalc_round_status(uuid) from public, anon, authenticated;
revoke execute on function tipping.trg_round_matches_status() from public, anon, authenticated;
revoke execute on function tipping.trg_rounds_status() from public, anon, authenticated;
