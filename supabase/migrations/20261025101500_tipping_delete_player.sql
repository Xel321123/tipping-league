-- ============================================================================
--  Delete a player.
--
--  Completes the "start fresh" path: remove an era (its teams cascade), then
--  remove the placeholder players and add your own eight. A player who is still
--  in a team, or who owns individual coupons, is protected with a readable
--  message rather than a raw foreign-key violation.
-- ============================================================================

create or replace function tipping.admin_delete_player(p_token text, p_id uuid)
returns void
language plpgsql
security definer
set search_path = tipping, public, extensions
as $fn$
begin
  perform tipping.assert_admin(p_token);

  if not exists (select 1 from tipping.players where id = p_id) then
    raise exception 'Player not found' using errcode = 'P0004';
  end if;

  if exists (
    select 1 from tipping.teams where player_1_id = p_id or player_2_id = p_id
  ) then
    raise exception 'This player is still in a team — delete the team or its era first'
      using errcode = '23503';
  end if;

  if exists (select 1 from tipping.coupons where player_id = p_id) then
    raise exception 'This player has individual coupons — delete those rounds first'
      using errcode = '23503';
  end if;

  delete from tipping.players where id = p_id;
end;
$fn$;

revoke execute on function tipping.admin_delete_player(text, uuid) from public;
grant execute on function tipping.admin_delete_player(text, uuid) to anon, authenticated;
