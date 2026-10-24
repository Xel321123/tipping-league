-- ============================================================================
--  Attribute round wins to players correctly.
--
--  v_round_winners stores `player_id` only for individual coupons; team coupons
--  carry `team_id` and a null player. The first version counted
--  `w.player_id = player` and therefore never credited team wins to the two
--  players in that team. Count wins through the coupon's owner instead, and
--  scope the per-era view to the era the coupon belongs to.
-- ============================================================================

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
      join tipping.coupons c2 on c2.id = w.coupon_id
      left join tipping.teams t2 on t2.id = c2.team_id
      where c2.player_id = a.player_id
         or t2.player_1_id = a.player_id
         or t2.player_2_id = a.player_id
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
  end as hit_pct,
  (
    select count(*)::int
    from tipping.v_round_winners w
    join tipping.coupons c2 on c2.id = w.coupon_id
    left join tipping.teams t2 on t2.id = c2.team_id
    left join tipping.rounds r2 on r2.id = c2.round_id
    join tipping.team_eras e2
      on e2.id = coalesce(
        t2.era_id,
        (
          select e3.id
          from tipping.team_eras e3
          where (r2.round_date at time zone 'Europe/Stockholm')::date >= e3.start_date
            and (e3.end_date is null
                 or (r2.round_date at time zone 'Europe/Stockholm')::date <= e3.end_date)
          order by e3.start_date desc
          limit 1
        )
      )
    where e2.id = a.era_id
      and (
        c2.player_id = a.player_id
        or t2.player_1_id = a.player_id
        or t2.player_2_id = a.player_id
      )
  ) as wins
from attribution a
join tipping.players p on p.id = a.player_id
join tipping.team_eras e on e.id = a.era_id
join tipping.v_coupon_scores s on s.coupon_id = a.coupon_id
group by a.player_id, p.name, a.era_id, e.name;

grant select on tipping.v_player_era_stats to anon, authenticated;
