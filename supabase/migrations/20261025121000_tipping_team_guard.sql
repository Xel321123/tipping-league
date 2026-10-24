-- ============================================================================
--  A duplicate-player error should say who and where, not just that it failed.
--  The UI also disables players who already have a team in the selected era;
--  this is the server-side guard for anyone calling the RPC directly.
-- ============================================================================

create or replace function tipping.enforce_one_team_per_era()
returns trigger
language plpgsql
as $$
declare
  v_team text;
  v_player text;
begin
  select t.name
    into v_team
  from tipping.teams t
  where t.era_id = new.era_id
    and t.id is distinct from new.id
    and (
      new.player_1_id in (t.player_1_id, t.player_2_id)
      or new.player_2_id in (t.player_1_id, t.player_2_id)
    )
  limit 1;

  if v_team is not null then
    select p.name
      into v_player
    from tipping.players p
    where p.id in (new.player_1_id, new.player_2_id)
      and exists (
        select 1
        from tipping.teams t
        where t.era_id = new.era_id
          and t.id is distinct from new.id
          and p.id in (t.player_1_id, t.player_2_id)
      )
    limit 1;

    raise exception '% is already in % for this era — edit that team instead',
      coalesce(v_player, 'That player'), v_team
      using errcode = '23505';
  end if;

  return new;
end;
$$;
