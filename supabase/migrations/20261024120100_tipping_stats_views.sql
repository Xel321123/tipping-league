-- ============================================================================
--  Tipping League — scoring + statistics views
--
--  Scoring rules (single source of truth, used by both the live board and the
--  leaderboards):
--    * A match is "resolved" once it has a final `outcome` or a live
--      `current_result`. Live results are provisional and may still flip.
--    * A coupon "hit" = at least one of its signs matches the resolved result.
--    * A cancelled match is void: it counts as neither hit nor miss and every
--      row survives it.
--    * "Rows alive" = product of signs per unresolved match, and 0 as soon as
--      any resolved match was missed. That is the classic rema count.
--
--  All views are security_invoker so RLS of the querying role applies.
-- ============================================================================

create or replace view tipping.v_coupon_selection_state
with (security_invoker = true) as
select
  s.coupon_id,
  s.match_number,
  s.signs,
  c.round_id,
  c.team_id,
  c.player_id,
  m.home_team,
  m.away_team,
  m.kickoff,
  m.match_status,
  m.cancelled,
  m.outcome,
  m.current_result,
  case
    when m.cancelled then null
    else coalesce(m.outcome, m.current_result)
  end as effective_result,
  case
    when m.cancelled then null
    when coalesce(m.outcome, m.current_result) is null then null
    else coalesce(m.outcome, m.current_result) = any (s.signs)
  end as is_hit
from tipping.coupon_selections s
join tipping.coupons c on c.id = s.coupon_id
join tipping.round_matches m
  on m.round_id = c.round_id
 and m.match_number = s.match_number;

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
  end as rows_alive
from tipping.v_coupon_selection_state cs
join tipping.coupons c on c.id = cs.coupon_id
group by cs.coupon_id, cs.round_id, cs.team_id, cs.player_id;

create or replace view tipping.v_pick_distribution
with (security_invoker = true) as
select
  c.round_id,
  s.match_number,
  (count(*) filter (where '1' = any (s.signs)))::int as picks_1,
  (count(*) filter (where 'X' = any (s.signs)))::int as picks_x,
  (count(*) filter (where '2' = any (s.signs)))::int as picks_2,
  count(*)::int as coupons
from tipping.coupon_selections s
join tipping.coupons c on c.id = s.coupon_id
group by c.round_id, s.match_number;

-- Best coupon(s) per completed round. Ties are all winners.
-- Declared before the aggregate views: v_team_stats and v_player_stats both
-- reference it, and view dependencies must already exist.
create or replace view tipping.v_round_winners
with (security_invoker = true) as
select
  s.round_id,
  s.coupon_id,
  s.team_id,
  s.player_id,
  s.hits,
  s.matches,
  s.total_rows
from tipping.v_coupon_scores s
join tipping.rounds r on r.id = s.round_id
where r.status = 'completed'
  and s.decidable > 0
  and s.resolved = s.decidable
  and s.hits = (
    select max(s2.hits)
    from tipping.v_coupon_scores s2
    join tipping.rounds r2 on r2.id = s2.round_id
    where s2.round_id = s.round_id
      and r2.status = 'completed'
      and s2.resolved = s2.decidable
  );

-- Team standings, scoped to an era by the caller.
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
  ) as wins
from tipping.teams t
join tipping.team_eras e on e.id = t.era_id
join tipping.players p1 on p1.id = t.player_1_id
join tipping.players p2 on p2.id = t.player_2_id
left join tipping.coupons c on c.team_id = t.id
left join tipping.v_coupon_scores s on s.coupon_id = c.id
group by t.id, t.name, t.era_id, e.name, e.start_date, e.end_date,
         t.player_1_id, p1.name, t.player_2_id, p2.name;

-- Individual player stats: own coupons in meetup rounds + every team coupon
-- their team submitted while the era pinned that composition.
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
    ) as wins
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
  coalesce(a.wins, 0) as wins
from tipping.players p
left join agg a on a.player_id = p.id;

-- Best coupon(s) per completed round. Ties are all winners.
-- (Declared earlier in this file, before the views that depend on it.)

grant select on
  tipping.v_coupon_scores,
  tipping.v_coupon_selection_state,
  tipping.v_pick_distribution,
  tipping.v_team_stats,
  tipping.v_player_stats,
  tipping.v_round_winners
to anon, authenticated;

-- v_coupon_selection_state must stay readable: v_coupon_scores is
-- security_invoker, so the querying role needs privileges on it too.
