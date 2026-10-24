-- ============================================================================
--  Delete a team era (and its teams).
--
--  Eras are the unit a league "starts fresh" with: deleting one removes its
--  teams via ON DELETE CASCADE. Coupons reference teams with ON DELETE RESTRICT,
--  so an era that already has coupons cannot be removed — the function checks
--  first and reports how many coupons are in the way instead of surfacing a raw
--  foreign-key error.
-- ============================================================================

create or replace function tipping.admin_delete_era(p_token text, p_id uuid)
returns void
language plpgsql
security definer
set search_path = tipping, public, extensions
as $fn$
declare
  v_coupons int;
  v_exists  boolean;
begin
  perform tipping.assert_admin(p_token);

  select exists(select 1 from tipping.team_eras where id = p_id) into v_exists;
  if not v_exists then
    raise exception 'Era not found' using errcode = 'P0004';
  end if;

  select count(*)
    into v_coupons
  from tipping.coupons c
  join tipping.teams t on t.id = c.team_id
  where t.era_id = p_id;

  if v_coupons > 0 then
    raise exception 'This era still has % coupon(s) attached — delete those rounds first', v_coupons
      using errcode = '23503';
  end if;

  delete from tipping.team_eras where id = p_id;
end;
$fn$;

revoke execute on function tipping.admin_delete_era(text, uuid) from public;
grant execute on function tipping.admin_delete_era(text, uuid) to anon, authenticated;
