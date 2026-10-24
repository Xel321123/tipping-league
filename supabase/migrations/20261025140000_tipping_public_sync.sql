-- ============================================================================
--  Machine path for refreshing a round from Svenska Spel.
--
--  The public board has no admin session, but it must not show yesterday's
--  scores. The `ss-sync` Edge Function holds the service key and calls this
--  function; it is the only caller allowed to execute it.
--
--  Same upsert semantics as admin_sync_matches (a manual outcome wins over an
--  empty payload value), plus:
--    * a 30 second throttle per round, so a busy board cannot hammer the API
--    * status is re-derived afterwards, so a finished draw closes the round
-- ============================================================================

create or replace function tipping.sync_matches_from_api(
  p_round_id uuid,
  p_matches jsonb
)
returns int
language plpgsql
security definer
set search_path = tipping, public, extensions
as $fn$
declare
  v_el      jsonb;
  v_num     int;
  v_count   int := 0;
  v_max     int := 0;
  v_synced  timestamptz;
begin
  if p_matches is null or jsonb_typeof(p_matches) <> 'array' or jsonb_array_length(p_matches) = 0 then
    raise exception 'No matches supplied' using errcode = '22023';
  end if;

  select api_synced_at into v_synced from tipping.rounds where id = p_round_id;
  if not found then
    raise exception 'Round not found' using errcode = 'P0004';
  end if;

  -- Throttle: -1 means "already fresh, nothing done".
  if v_synced is not null and v_synced > now() - interval '30 seconds' then
    return -1;
  end if;

  for v_el in select value from jsonb_array_elements(p_matches) loop
    v_num := (v_el->>'match_number')::int;

    if v_num is null or v_num < 1 or v_num > 13 then
      raise exception 'Invalid match number in payload' using errcode = '22023';
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

-- Only the service role (i.e. the ss-sync Edge Function) may run this.
revoke all on function tipping.sync_matches_from_api(uuid, jsonb) from public, anon, authenticated;
grant execute on function tipping.sync_matches_from_api(uuid, jsonb) to service_role;
