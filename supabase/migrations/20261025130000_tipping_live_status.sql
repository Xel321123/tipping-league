-- ============================================================================
--  A fixture that is still being played always means the round is live.
--
--  Before: `decided >= total` was checked first, so a premature/accidental
--  outcome on a match that was still live flipped the whole round to
--  'completed' — hiding it from the live board and freezing its coupons.
--  Status is now derived in this order:
--     no fixtures        -> live/upcoming by date
--     any live fixture   -> live
--     every outcome set  -> completed
--     some outcome set   -> live
--     kickoff nearby     -> live
--     otherwise          -> upcoming
-- ============================================================================

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
  elsif v_live > 0 then
    -- A live fixture outranks any outcome already recorded for other matches.
    v_status := 'live';
  elsif v_decided >= v_total then
    v_status := 'completed';
  elsif v_decided > 0 then
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

-- Re-derive every existing round so a stale 'completed' fixes itself.
do $$
declare
  r record;
begin
  for r in select id from tipping.rounds loop
    perform tipping.recalc_round_status(r.id);
  end loop;
end $$;
