-- ============================================================================
--  Tipping League — admin API
--
--  There is no Supabase Auth user in this app: it is a friends' league with a
--  single shared admin. Writes therefore never touch the tables directly.
--  Instead every mutation is a SECURITY DEFINER function guarded by a
--  short-lived, server-issued session token:
--
--    admin_login(passcode)  -> bcrypt check -> random 256-bit token
--    admin_*(p_token, ...)  -> sha256(token) lookup + expiry check
--
--  The passcode itself is only ever stored as a bcrypt hash. Because the
--  bootstrap passcode is public (it lives in this repo), the first successful
--  login is forced to set a new one before any other admin call is accepted.
-- ============================================================================

create table tipping.admin_config (
  id                   boolean primary key default true check (id),
  passcode_hash        text not null,
  must_change_passcode boolean not null default true,
  updated_at           timestamptz not null default now()
);

create table tipping.admin_sessions (
  token_hash text primary key,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create table tipping.admin_login_attempts (
  id           bigserial primary key,
  success      boolean not null,
  attempted_at timestamptz not null default now()
);

create index admin_login_attempts_recent on tipping.admin_login_attempts (attempted_at desc);

alter table tipping.admin_config         enable row level security;
alter table tipping.admin_sessions       enable row level security;
alter table tipping.admin_login_attempts enable row level security;

revoke all on tipping.admin_config, tipping.admin_sessions, tipping.admin_login_attempts
  from anon, authenticated;

-- Bootstrap passcode. Forced to change on first login (see README).
insert into tipping.admin_config (id, passcode_hash, must_change_passcode)
values (true, extensions.crypt('tipping-bootstrap', extensions.gen_salt('bf', 10)), true)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Session helpers
-- ---------------------------------------------------------------------------
create or replace function tipping.require_session(p_token text)
returns void
language plpgsql
security definer
set search_path = tipping, public, extensions
as $fn$
begin
  if p_token is null or length(p_token) < 32 then
    raise exception 'Admin sign-in required' using errcode = '28000';
  end if;

  if not exists (
    select 1
    from tipping.admin_sessions
    where token_hash = encode(digest(p_token, 'sha256'), 'hex')
      and expires_at > now()
  ) then
    raise exception 'Admin session expired — sign in again' using errcode = '28000';
  end if;
end;
$fn$;

create or replace function tipping.assert_admin(p_token text)
returns void
language plpgsql
security definer
set search_path = tipping, public, extensions
as $fn$
declare
  v_must_change boolean;
begin
  perform tipping.require_session(p_token);

  select must_change_passcode into v_must_change from tipping.admin_config where id;
  if coalesce(v_must_change, false) then
    raise exception 'Set a new admin passcode before making changes' using errcode = 'P0002';
  end if;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- Auth RPCs (the only ones callable before a passcode change)
-- ---------------------------------------------------------------------------
create or replace function tipping.admin_login(p_passcode text)
returns jsonb
language plpgsql
security definer
set search_path = tipping, public, extensions
as $fn$
declare
  v_hash      text;
  v_must      boolean;
  v_failures  int;
  v_token     text;
  v_expires   timestamptz := now() + interval '12 hours';
begin
  select count(*) into v_failures
  from tipping.admin_login_attempts
  where not success and attempted_at > now() - interval '10 minutes';

  if v_failures >= 8 then
    raise exception 'Too many failed attempts — wait a few minutes'
      using errcode = 'P0003';
  end if;

  select passcode_hash, must_change_passcode
    into v_hash, v_must
  from tipping.admin_config
  where id;

  if v_hash is null or p_passcode is null
     or crypt(p_passcode, v_hash) is distinct from v_hash then
    insert into tipping.admin_login_attempts (success) values (false);
    raise exception 'Invalid passcode' using errcode = '28P01';
  end if;

  insert into tipping.admin_login_attempts (success) values (true);

  -- opportunistic housekeeping
  delete from tipping.admin_sessions where expires_at < now();
  delete from tipping.admin_login_attempts where attempted_at < now() - interval '2 days';

  v_token := encode(gen_random_bytes(32), 'hex');

  insert into tipping.admin_sessions (token_hash, expires_at)
  values (encode(digest(v_token, 'sha256'), 'hex'), v_expires);

  return jsonb_build_object(
    'token', v_token,
    'expires_at', v_expires,
    'must_change_passcode', coalesce(v_must, true)
  );
end;
$fn$;

create or replace function tipping.admin_session_valid(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = tipping, public, extensions
as $fn$
declare
  v_expires timestamptz;
  v_must    boolean;
begin
  select s.expires_at into v_expires
  from tipping.admin_sessions s
  where s.token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex')
    and s.expires_at > now();

  select must_change_passcode into v_must from tipping.admin_config where id;

  return jsonb_build_object(
    'valid', v_expires is not null,
    'expires_at', v_expires,
    'must_change_passcode', coalesce(v_must, true)
  );
end;
$fn$;

create or replace function tipping.admin_logout(p_token text)
returns void
language plpgsql
security definer
set search_path = tipping, public, extensions
as $fn$
begin
  delete from tipping.admin_sessions
  where token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex');
end;
$fn$;

create or replace function tipping.admin_change_passcode(p_token text, p_new_passcode text)
returns void
language plpgsql
security definer
set search_path = tipping, public, extensions
as $fn$
begin
  perform tipping.require_session(p_token);

  if p_new_passcode is null or length(p_new_passcode) < 8 then
    raise exception 'Passcode must be at least 8 characters' using errcode = '22023';
  end if;

  if p_new_passcode = 'tipping-bootstrap' then
    raise exception 'Choose a different passcode than the public bootstrap one'
      using errcode = '22023';
  end if;

  update tipping.admin_config
     set passcode_hash = crypt(p_new_passcode, gen_salt('bf', 10)),
         must_change_passcode = false,
         updated_at = now()
   where id;

  -- every other device has to sign in again
  delete from tipping.admin_sessions
  where token_hash <> encode(digest(p_token, 'sha256'), 'hex');
end;
$fn$;

-- ---------------------------------------------------------------------------
-- League structure
-- ---------------------------------------------------------------------------
create or replace function tipping.admin_save_player(
  p_token text,
  p_id uuid,
  p_name text,
  p_nickname text default null,
  p_is_active boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = tipping, public, extensions
as $fn$
declare
  v_id uuid;
begin
  perform tipping.assert_admin(p_token);

  if p_name is null or btrim(p_name) = '' then
    raise exception 'Player name is required' using errcode = '22023';
  end if;

  if p_id is null then
    insert into tipping.players (name, nickname, is_active)
    values (btrim(p_name), nullif(btrim(coalesce(p_nickname, '')), ''), coalesce(p_is_active, true))
    returning id into v_id;
  else
    update tipping.players
       set name = btrim(p_name),
           nickname = nullif(btrim(coalesce(p_nickname, '')), ''),
           is_active = coalesce(p_is_active, true)
     where id = p_id
    returning id into v_id;

    if v_id is null then
      raise exception 'Player not found' using errcode = 'P0004';
    end if;
  end if;

  return v_id;
end;
$fn$;

create or replace function tipping.admin_save_era(
  p_token text,
  p_id uuid,
  p_name text,
  p_start_date date,
  p_end_date date default null,
  p_is_active boolean default true,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = tipping, public, extensions
as $fn$
declare
  v_id uuid;
begin
  perform tipping.assert_admin(p_token);

  if p_name is null or btrim(p_name) = '' then
    raise exception 'Era name is required' using errcode = '22023';
  end if;
  if p_start_date is null then
    raise exception 'Era start date is required' using errcode = '22023';
  end if;
  if p_end_date is not null and p_end_date <= p_start_date then
    raise exception 'Era end date must be after the start date' using errcode = '22023';
  end if;

  if coalesce(p_is_active, false) then
    update tipping.team_eras
       set is_active = false
     where is_active
       and id is distinct from p_id;
  end if;

  if p_id is null then
    insert into tipping.team_eras (name, start_date, end_date, is_active, notes)
    values (btrim(p_name), p_start_date, p_end_date, coalesce(p_is_active, true), p_notes)
    returning id into v_id;
  else
    update tipping.team_eras
       set name = btrim(p_name),
           start_date = p_start_date,
           end_date = p_end_date,
           is_active = coalesce(p_is_active, true),
           notes = p_notes
     where id = p_id
    returning id into v_id;

    if v_id is null then
      raise exception 'Era not found' using errcode = 'P0004';
    end if;
  end if;

  return v_id;
end;
$fn$;

create or replace function tipping.admin_save_team(
  p_token text,
  p_id uuid,
  p_era_id uuid,
  p_name text,
  p_player_1_id uuid,
  p_player_2_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = tipping, public, extensions
as $fn$
declare
  v_id uuid;
begin
  perform tipping.assert_admin(p_token);

  if p_era_id is null then
    raise exception 'Pick an era for the team' using errcode = '22023';
  end if;
  if p_name is null or btrim(p_name) = '' then
    raise exception 'Team name is required' using errcode = '22023';
  end if;
  if p_player_1_id is null or p_player_2_id is null then
    raise exception 'A team needs exactly two players' using errcode = '22023';
  end if;
  if p_player_1_id = p_player_2_id then
    raise exception 'Pick two different players' using errcode = '22023';
  end if;

  if p_id is null then
    insert into tipping.teams (era_id, name, player_1_id, player_2_id)
    values (p_era_id, btrim(p_name), p_player_1_id, p_player_2_id)
    returning id into v_id;
  else
    update tipping.teams
       set era_id = p_era_id,
           name = btrim(p_name),
           player_1_id = p_player_1_id,
           player_2_id = p_player_2_id
     where id = p_id
    returning id into v_id;

    if v_id is null then
      raise exception 'Team not found' using errcode = 'P0004';
    end if;
  end if;

  return v_id;
end;
$fn$;

create or replace function tipping.admin_delete_team(p_token text, p_id uuid)
returns void
language plpgsql
security definer
set search_path = tipping, public, extensions
as $fn$
begin
  perform tipping.assert_admin(p_token);
  delete from tipping.teams where id = p_id;
exception
  when foreign_key_violation then
    raise exception 'That team already has coupons — delete those rounds instead'
      using errcode = '23503';
end;
$fn$;

-- ---------------------------------------------------------------------------
-- Rounds
-- ---------------------------------------------------------------------------
create or replace function tipping.admin_save_round(
  p_token text,
  p_id uuid,
  p_title text,
  p_mode text,
  p_product text,
  p_draw_id text,
  p_draw_number int,
  p_round_date timestamptz,
  p_match_count int default 8,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = tipping, public, extensions
as $fn$
declare
  v_id uuid;
begin
  perform tipping.assert_admin(p_token);

  if p_title is null or btrim(p_title) = '' then
    raise exception 'Round title is required' using errcode = '22023';
  end if;
  if p_mode not in ('team', 'individual') then
    raise exception 'Mode must be team or individual' using errcode = '22023';
  end if;
  if p_round_date is null then
    raise exception 'Round date is required' using errcode = '22023';
  end if;
  if coalesce(p_match_count, 8) not between 1 and 13 then
    raise exception 'Match count must be between 1 and 13' using errcode = '22023';
  end if;

  if p_id is null then
    insert into tipping.rounds (
      title, mode, svenska_spel_product, svenska_spel_draw_id,
      draw_number, match_count, round_date, notes
    )
    values (
      btrim(p_title), p_mode, coalesce(nullif(btrim(coalesce(p_product, '')), ''), 'topptipset'),
      nullif(btrim(coalesce(p_draw_id, '')), ''), p_draw_number,
      coalesce(p_match_count, 8), p_round_date, p_notes
    )
    returning id into v_id;
  else
    update tipping.rounds
       set title = btrim(p_title),
           mode = p_mode,
           svenska_spel_product = coalesce(nullif(btrim(coalesce(p_product, '')), ''), 'topptipset'),
           svenska_spel_draw_id = nullif(btrim(coalesce(p_draw_id, '')), ''),
           draw_number = p_draw_number,
           match_count = coalesce(p_match_count, 8),
           round_date = p_round_date,
           notes = p_notes
     where id = p_id
    returning id into v_id;

    if v_id is null then
      raise exception 'Round not found' using errcode = 'P0004';
    end if;

    perform tipping.recalc_round_status(v_id);
  end if;

  return v_id;
end;
$fn$;

create or replace function tipping.admin_delete_round(p_token text, p_id uuid)
returns void
language plpgsql
security definer
set search_path = tipping, public, extensions
as $fn$
begin
  perform tipping.assert_admin(p_token);
  delete from tipping.rounds where id = p_id;
end;
$fn$;

-- Upsert the match list for a round (used by the Svenska Spel sync AND by
-- manual entry). A manual `outcome` already stored on a match is preserved
-- unless the caller explicitly sends one.
create or replace function tipping.admin_sync_matches(
  p_token text,
  p_round_id uuid,
  p_matches jsonb
)
returns int
language plpgsql
security definer
set search_path = tipping, public, extensions
as $fn$
declare
  v_el        jsonb;
  v_num       int;
  v_count     int := 0;
  v_max       int := 0;
begin
  perform tipping.assert_admin(p_token);

  if p_matches is null or jsonb_typeof(p_matches) <> 'array' or jsonb_array_length(p_matches) = 0 then
    raise exception 'No matches supplied' using errcode = '22023';
  end if;

  if not exists (select 1 from tipping.rounds where id = p_round_id) then
    raise exception 'Round not found' using errcode = 'P0004';
  end if;

  for v_el in select value from jsonb_array_elements(p_matches) loop
    v_num := (v_el->>'match_number')::int;

    if v_num is null or v_num < 1 or v_num > 13 then
      raise exception 'Invalid match number in payload' using errcode = '22023';
    end if;
    if coalesce(btrim(v_el->>'home_team'), '') = ''
       or coalesce(btrim(v_el->>'away_team'), '') = '' then
      raise exception 'Match % is missing a team name', v_num using errcode = '22023';
    end if;

    insert into tipping.round_matches (
      round_id, match_number, home_team, away_team, kickoff,
      home_score, away_score, match_status, current_result, outcome,
      cancelled, last_synced_at
    )
    values (
      p_round_id, v_num,
      btrim(v_el->>'home_team'), btrim(v_el->>'away_team'),
      nullif(v_el->>'kickoff', '')::timestamptz,
      nullif(v_el->>'home_score', '')::int,
      nullif(v_el->>'away_score', '')::int,
      coalesce(nullif(v_el->>'match_status', ''), 'not_started'),
      nullif(v_el->>'current_result', ''),
      nullif(v_el->>'outcome', ''),
      coalesce((v_el->>'cancelled')::boolean, false),
      now()
    )
    on conflict (round_id, match_number) do update
      set home_team      = excluded.home_team,
          away_team      = excluded.away_team,
          kickoff        = coalesce(excluded.kickoff, tipping.round_matches.kickoff),
          home_score     = coalesce(excluded.home_score, tipping.round_matches.home_score),
          away_score     = coalesce(excluded.away_score, tipping.round_matches.away_score),
          match_status   = excluded.match_status,
          current_result = coalesce(excluded.current_result, tipping.round_matches.current_result),
          outcome        = coalesce(excluded.outcome, tipping.round_matches.outcome),
          cancelled      = excluded.cancelled,
          last_synced_at = now();

    v_count := v_count + 1;
    v_max := greatest(v_max, v_num);
  end loop;

  update tipping.rounds
     set match_count = greatest(match_count, v_max),
         api_synced_at = now()
   where id = p_round_id;

  perform tipping.recalc_round_status(p_round_id);

  return v_count;
end;
$fn$;

-- Manual per-match override: live score, live result and/or final outcome.
create or replace function tipping.admin_set_match_state(
  p_token text,
  p_round_id uuid,
  p_match_number int,
  p_home_score int default null,
  p_away_score int default null,
  p_match_status text default null,
  p_outcome text default null,
  p_cancelled boolean default null
)
returns void
language plpgsql
security definer
set search_path = tipping, public, extensions
as $fn$
declare
  v_result text;
begin
  perform tipping.assert_admin(p_token);

  if p_outcome is not null and p_outcome not in ('1', 'X', '2') then
    raise exception 'Outcome must be 1, X or 2' using errcode = '22023';
  end if;
  if p_match_status is not null
     and p_match_status not in ('not_started', 'live', 'finished', 'cancelled') then
    raise exception 'Invalid match status' using errcode = '22023';
  end if;

  if p_home_score is not null and p_away_score is not null then
    v_result := case
      when p_home_score > p_away_score then '1'
      when p_home_score = p_away_score then 'X'
      else '2'
    end;
  end if;

  update tipping.round_matches
     set home_score = coalesce(p_home_score, home_score),
         away_score = coalesce(p_away_score, away_score),
         match_status = coalesce(p_match_status, match_status),
         current_result = coalesce(v_result, current_result),
         -- explicit override: null clears it (syncs preserve it instead)
         outcome = p_outcome,
         cancelled = coalesce(p_cancelled, cancelled)
   where round_id = p_round_id
     and match_number = p_match_number;

  if not found then
    raise exception 'Match % not found in this round', p_match_number using errcode = 'P0004';
  end if;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- Coupons
-- ---------------------------------------------------------------------------
create or replace function tipping.admin_save_coupon(
  p_token text,
  p_round_id uuid,
  p_team_id uuid,
  p_player_id uuid,
  p_selections jsonb,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = tipping, public, extensions
as $fn$
declare
  v_mode        text;
  v_count       int;
  v_round_date  timestamptz;
  v_coupon      uuid;
  v_el          jsonb;
  v_num         int;
  v_signs       text[];
  v_seen        int;
  v_distinct    int;
begin
  perform tipping.assert_admin(p_token);

  select mode, match_count, round_date
    into v_mode, v_count, v_round_date
  from tipping.rounds
  where id = p_round_id;

  if v_mode is null then
    raise exception 'Round not found' using errcode = 'P0004';
  end if;

  if v_mode = 'team' then
    if p_team_id is null or p_player_id is not null then
      raise exception 'Team rounds take a team coupon' using errcode = '22023';
    end if;

    -- the team must belong to the era that was in force on the round date
    if not exists (
      select 1
      from tipping.teams t
      join tipping.team_eras e on e.id = t.era_id
      where t.id = p_team_id
        and (v_round_date at time zone 'Europe/Stockholm')::date >= e.start_date
        and (e.end_date is null
             or (v_round_date at time zone 'Europe/Stockholm')::date <= e.end_date)
    ) then
      raise exception 'That team did not exist when this round was played'
        using errcode = '22023';
    end if;
  else
    if p_player_id is null or p_team_id is not null then
      raise exception 'Individual rounds take a player coupon' using errcode = '22023';
    end if;
    if not exists (select 1 from tipping.players where id = p_player_id) then
      raise exception 'Player not found' using errcode = 'P0004';
    end if;
  end if;

  if p_selections is null or jsonb_typeof(p_selections) <> 'array' then
    raise exception 'Selections must be an array' using errcode = '22023';
  end if;
  if jsonb_array_length(p_selections) <> v_count then
    raise exception 'Expected % selections, received %', v_count, jsonb_array_length(p_selections)
      using errcode = '22023';
  end if;

  select count(*), count(distinct (value->>'match_number')::int)
    into v_seen, v_distinct
  from jsonb_array_elements(p_selections);

  if v_seen <> v_distinct then
    raise exception 'Duplicate match numbers in selections' using errcode = '22023';
  end if;

  for v_el in select value from jsonb_array_elements(p_selections) loop
    v_num := (v_el->>'match_number')::int;

    if v_num is null or v_num < 1 or v_num > v_count then
      raise exception 'Invalid match number %', v_num using errcode = '22023';
    end if;

    select array_agg(value) into v_signs
    from jsonb_array_elements_text(coalesce(v_el->'signs', '[]'::jsonb));

    if not tipping.signs_valid(v_signs) then
      raise exception 'Invalid signs for match % (use 1, X, 2 — 1 to 3 signs)', v_num
        using errcode = '22023';
    end if;
  end loop;

  select id into v_coupon
  from tipping.coupons
  where round_id = p_round_id
    and (
      (p_team_id is not null and team_id = p_team_id)
      or (p_player_id is not null and player_id = p_player_id)
    );

  if v_coupon is null then
    insert into tipping.coupons (round_id, team_id, player_id, note)
    values (p_round_id, p_team_id, p_player_id, p_note)
    returning id into v_coupon;
  else
    update tipping.coupons
       set note = p_note,
           updated_at = now()
     where id = v_coupon;
  end if;

  delete from tipping.coupon_selections where coupon_id = v_coupon;

  insert into tipping.coupon_selections (coupon_id, match_number, signs)
  select
    v_coupon,
    (e.value->>'match_number')::int,
    array(select jsonb_array_elements_text(e.value->'signs'))
  from jsonb_array_elements(p_selections) as e;

  return v_coupon;
end;
$fn$;

create or replace function tipping.admin_delete_coupon(p_token text, p_coupon_id uuid)
returns void
language plpgsql
security definer
set search_path = tipping, public, extensions
as $fn$
begin
  perform tipping.assert_admin(p_token);
  delete from tipping.coupons where id = p_coupon_id;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- Grants: only the token-gated RPCs are reachable from the Data API.
-- ---------------------------------------------------------------------------
revoke execute on function tipping.require_session(text) from public, anon, authenticated;
revoke execute on function tipping.assert_admin(text) from public, anon, authenticated;

revoke execute on function tipping.admin_login(text) from public;
revoke execute on function tipping.admin_session_valid(text) from public;
revoke execute on function tipping.admin_logout(text) from public;
revoke execute on function tipping.admin_change_passcode(text, text) from public;
revoke execute on function tipping.admin_save_player(text, uuid, text, text, boolean) from public;
revoke execute on function tipping.admin_save_era(text, uuid, text, date, date, boolean, text) from public;
revoke execute on function tipping.admin_save_team(text, uuid, uuid, text, uuid, uuid) from public;
revoke execute on function tipping.admin_delete_team(text, uuid) from public;
revoke execute on function tipping.admin_save_round(text, uuid, text, text, text, text, int, timestamptz, int, text) from public;
revoke execute on function tipping.admin_delete_round(text, uuid) from public;
revoke execute on function tipping.admin_sync_matches(text, uuid, jsonb) from public;
revoke execute on function tipping.admin_set_match_state(text, uuid, int, int, int, text, text, boolean) from public;
revoke execute on function tipping.admin_save_coupon(text, uuid, uuid, uuid, jsonb, text) from public;
revoke execute on function tipping.admin_delete_coupon(text, uuid) from public;

grant execute on function tipping.admin_login(text) to anon, authenticated;
grant execute on function tipping.admin_session_valid(text) to anon, authenticated;
grant execute on function tipping.admin_logout(text) to anon, authenticated;
grant execute on function tipping.admin_change_passcode(text, text) to anon, authenticated;
grant execute on function tipping.admin_save_player(text, uuid, text, text, boolean) to anon, authenticated;
grant execute on function tipping.admin_save_era(text, uuid, text, date, date, boolean, text) to anon, authenticated;
grant execute on function tipping.admin_save_team(text, uuid, uuid, text, uuid, uuid) to anon, authenticated;
grant execute on function tipping.admin_delete_team(text, uuid) to anon, authenticated;
grant execute on function tipping.admin_save_round(text, uuid, text, text, text, text, int, timestamptz, int, text) to anon, authenticated;
grant execute on function tipping.admin_delete_round(text, uuid) to anon, authenticated;
grant execute on function tipping.admin_sync_matches(text, uuid, jsonb) to anon, authenticated;
grant execute on function tipping.admin_set_match_state(text, uuid, int, int, int, text, text, boolean) to anon, authenticated;
grant execute on function tipping.admin_save_coupon(text, uuid, uuid, uuid, jsonb, text) to anon, authenticated;
grant execute on function tipping.admin_delete_coupon(text, uuid) to anon, authenticated;
