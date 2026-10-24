-- ============================================================================
--  Winnings (SEK) per coupon, aggregated per team / player / era.
--
--  Why manual? Svenska Spel's draw API exposes turnover (`currentNetSale`),
--  row price (`rowPrice`) and rollover (`fund`), but NOT the payout. Topptipset
--  has one variable prize group (70% of stakes, 8/8 rows) and the published
--  per-row payout is not in the API, and there is no result/payout endpoint.
--  The admin therefore records what each coupon actually returned.
-- ============================================================================

alter table tipping.coupons
  add column winnings numeric(12, 2) not null default 0
    check (winnings >= 0);

comment on column tipping.coupons.winnings is
  'Actual payout for this coupon in SEK, entered by the admin from the Svenska Spel settlement.';

-- ---------------------------------------------------------------------------
-- Coupon scores gain the payout (appended, so CREATE OR REPLACE is legal).
-- ---------------------------------------------------------------------------
create or replace view tipping.v_coupon_scores
with (security_invoker = true) as
select
  cs.coupon_id,
  cs.round_id,
  cs.team_id,
  cs.player_id,
  max(c.total_rows) as total_rows,
  max(c.note) as note,
  count(*)::int as matches,
  (count(*) filter (where cs.cancelled is false))::int as decidable,
  (count(*) filter (where cs.is_hit is not null))::int as resolved,
  (count(*) filter (where cs.is_hit))::int as hits,
  (count(*) filter (where cs.is_hit is false))::int as misses,
  (
    (count(*) filter (where cs.cancelled is false)) > 0
    and (count(*) filter (where cs.is_hit is not null))
        = (count(*) filter (where cs.cancelled is false))
    and (count(*) filter (where cs.is_hit is false)) = 0
  ) as perfect,
  case
    when (count(*) filter (where cs.is_hit is false)) > 0 then 0
    else coalesce(
      round(exp(sum(ln(array_length(cs.signs, 1))) filter (where cs.is_hit is null)))::bigint,
      1
    )
  end as rows_alive,
  max(c.winnings) as winnings
from tipping.v_coupon_selection_state cs
join tipping.coupons c on c.id = cs.coupon_id
group by cs.coupon_id, cs.round_id, cs.team_id, cs.player_id;

-- ---------------------------------------------------------------------------
-- Team totals gain winnings.
-- ---------------------------------------------------------------------------
create or replace view tipping.v_team_stats
with (security_invoker = true) as
select
  t.id as team_id,
  t.name as team_name,
  t.era_id,
  e.name as era_name,
  e.start_date as era_start,
  e.end_date as era_end,
  t.player_1_id,
  p1.name as player_1_name,
  t.player_2_id,
  p2.name as player_2_name,
  (count(s.coupon_id))::int as rounds_played,
  (count(*) filter (where s.perfect))::int as perfect_rounds,
  coalesce(sum(s.hits), 0)::int as total_hits,
  coalesce(sum(s.resolved), 0)::int as total_resolved,
  coalesce(sum(s.matches), 0)::int as total_matches,
  coalesce(sum(s.total_rows), 0)::bigint as total_rows,
  case
    when coalesce(sum(s.resolved), 0) = 0 then null
    else round(100.0 * sum(s.hits) / sum(s.resolved), 1)::float8
  end as hit_pct,
  case
    when count(s.coupon_id) = 0 then null
    else round(sum(s.hits)::numeric / count(s.coupon_id), 2)::float8
  end as avg_hits,
  (
    select count(*)::int
    from tipping.v_round_winners w
    where w.team_id = t.id
  ) as wins,
  coalesce(sum(s.winnings), 0)::numeric(12, 2) as total_winnings
from tipping.teams t
join tipping.team_eras e on e.id = t.era_id
join tipping.players p1 on p1.id = t.player_1_id
join tipping.players p2 on p2.id = t.player_2_id
left join tipping.coupons c on c.team_id = t.id
left join tipping.v_coupon_scores s on s.coupon_id = c.id
group by t.id, t.name, t.era_id, e.name, e.start_date, e.end_date,
         t.player_1_id, p1.name, t.player_2_id, p2.name;

-- ---------------------------------------------------------------------------
-- Player totals gain winnings (a team coupon credits both members in full).
-- ---------------------------------------------------------------------------
create or replace view tipping.v_player_stats
with (security_invoker = true) as
with attribution as (
  select c.id as coupon_id, c.player_id as player_id
  from tipping.coupons c
  where c.player_id is not null
  union all
  select c.id, t.player_1_id
  from tipping.coupons c
  join tipping.teams t on t.id = c.team_id
  where c.team_id is not null
  union all
  select c.id, t.player_2_id
  from tipping.coupons c
  join tipping.teams t on t.id = c.team_id
  where c.team_id is not null
),
agg as (
  select
    a.player_id,
    count(*)::int as rounds_played,
    (count(*) filter (where s.team_id is null))::int as individual_rounds,
    (count(*) filter (where s.team_id is not null))::int as team_rounds,
    coalesce(sum(s.hits), 0)::int as total_hits,
    coalesce(sum(s.resolved), 0)::int as total_resolved,
    (count(*) filter (where s.perfect))::int as perfect_rounds,
    case
      when coalesce(sum(s.resolved), 0) = 0 then null
      else round(100.0 * sum(s.hits) / sum(s.resolved), 1)::float8
    end as hit_pct,
    (
      select count(*)::int
      from tipping.v_round_winners w
      where w.player_id = a.player_id
    ) as wins,
    coalesce(sum(s.winnings), 0)::numeric(12, 2) as total_winnings
  from attribution a
  join tipping.v_coupon_scores s on s.coupon_id = a.coupon_id
  group by a.player_id
)
select
  p.id as player_id,
  p.name,
  p.nickname,
  p.is_active,
  coalesce(a.rounds_played, 0) as rounds_played,
  coalesce(a.individual_rounds, 0) as individual_rounds,
  coalesce(a.team_rounds, 0) as team_rounds,
  coalesce(a.total_hits, 0) as total_hits,
  coalesce(a.total_resolved, 0) as total_resolved,
  coalesce(a.perfect_rounds, 0) as perfect_rounds,
  a.hit_pct,
  coalesce(a.wins, 0) as wins,
  coalesce(a.total_winnings, 0)::numeric(12, 2) as total_winnings
from tipping.players p
left join agg a on a.player_id = p.id;

-- ---------------------------------------------------------------------------
-- Per-era player totals (individual coupons attributed by round date).
-- ---------------------------------------------------------------------------
create or replace view tipping.v_player_era_stats
with (security_invoker = true) as
with attribution as (
  select c.id as coupon_id, t.player_1_id as player_id, t.era_id
  from tipping.coupons c
  join tipping.teams t on t.id = c.team_id
  where c.team_id is not null
  union all
  select c.id, t.player_2_id, t.era_id
  from tipping.coupons c
  join tipping.teams t on t.id = c.team_id
  where c.team_id is not null
  union all
  select c.id, c.player_id, e.id
  from tipping.coupons c
  join tipping.rounds r on r.id = c.round_id
  join tipping.team_eras e
    on (r.round_date at time zone 'Europe/Stockholm')::date >= e.start_date
   and (e.end_date is null
        or (r.round_date at time zone 'Europe/Stockholm')::date <= e.end_date)
  where c.player_id is not null
)
select
  a.player_id,
  p.name as player_name,
  a.era_id,
  e.name as era_name,
  count(*)::int as rounds_played,
  coalesce(sum(s.hits), 0)::int as total_hits,
  coalesce(sum(s.resolved), 0)::int as total_resolved,
  (count(*) filter (where s.perfect))::int as perfect_rounds,
  coalesce(sum(s.winnings), 0)::numeric(12, 2) as total_winnings,
  case
    when coalesce(sum(s.resolved), 0) = 0 then null
    else round(100.0 * sum(s.hits) / sum(s.resolved), 1)::float8
  end as hit_pct
from attribution a
join tipping.players p on p.id = a.player_id
join tipping.team_eras e on e.id = a.era_id
join tipping.v_coupon_scores s on s.coupon_id = a.coupon_id
group by a.player_id, p.name, a.era_id, e.name;

-- ---------------------------------------------------------------------------
-- Record a coupon payout.
-- ---------------------------------------------------------------------------
create or replace function tipping.admin_set_coupon_winnings(
  p_token text,
  p_coupon_id uuid,
  p_winnings numeric
)
returns void
language plpgsql
security definer
set search_path = tipping, public, extensions
as $fn$
begin
  perform tipping.assert_admin(p_token);

  if p_winnings is null or p_winnings < 0 then
    raise exception 'Winnings must be zero or more' using errcode = '22023';
  end if;
  if p_winnings > 10000000 then
    raise exception 'That payout looks wrong (over 10 000 000 kr)' using errcode = '22023';
  end if;

  update tipping.coupons
     set winnings = round(p_winnings, 2),
         updated_at = now()
   where id = p_coupon_id;

  if not found then
    raise exception 'Coupon not found' using errcode = 'P0004';
  end if;
end;
$fn$;

grant select on tipping.v_player_era_stats to anon, authenticated;

revoke execute on function tipping.admin_set_coupon_winnings(text, uuid, numeric) from public;
grant execute on function tipping.admin_set_coupon_winnings(text, uuid, numeric) to anon, authenticated;
