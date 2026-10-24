-- ============================================================================
--  Seed: the eight players and two example cohorts.
--
--  Names are placeholders — rename them in Admin → League. The second era is
--  archived on purpose so the History screen demonstrates how a reshuffle
--  keeps old coupons attached to the old teams.
--
--  Run once, after the migrations:
--    supabase db push           (remote)
--    psql "$DATABASE_URL" -f supabase/seed.sql
--  or paste into the SQL editor.
-- ============================================================================

insert into tipping.players (name) values
  ('Alex'), ('Bo'), ('Cisse'), ('Danne'), ('Erik'), ('Filip'), ('Gustav'), ('Hugo')
on conflict (name) do nothing;

insert into tipping.team_eras (name, start_date, end_date, is_active, notes) values
  ('2021–2024', date '2021-08-01', date '2024-07-31', false, 'First cohort'),
  ('2024–2026', date '2024-08-01', null, true, 'Current cohort')
on conflict (name) do nothing;

with era as (
  select id from tipping.team_eras where name = '2021–2024'
),
pairs (team_name, p1, p2) as (
  values
    ('Rovers', 'Alex', 'Cisse'),
    ('Athletic', 'Bo', 'Danne'),
    ('Union', 'Erik', 'Gustav'),
    ('Wanderers', 'Filip', 'Hugo')
)
insert into tipping.teams (era_id, name, player_1_id, player_2_id)
select era.id, pairs.team_name, p1.id, p2.id
from era, pairs
join tipping.players p1 on p1.name = pairs.p1
join tipping.players p2 on p2.name = pairs.p2
on conflict (era_id, name) do nothing;

with era as (
  select id from tipping.team_eras where name = '2024–2026'
),
pairs (team_name, p1, p2) as (
  values
    ('Northlight', 'Alex', 'Bo'),
    ('Harbour', 'Cisse', 'Danne'),
    ('Southbank', 'Erik', 'Filip'),
    ('Westgate', 'Gustav', 'Hugo')
)
insert into tipping.teams (era_id, name, player_1_id, player_2_id)
select era.id, pairs.team_name, p1.id, p2.id
from era, pairs
join tipping.players p1 on p1.name = pairs.p1
join tipping.players p2 on p2.name = pairs.p2
on conflict (era_id, name) do nothing;
