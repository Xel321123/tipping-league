// Offline schema + RLS verification for the `tipping` schema.
//
// PGlite is real Postgres 17 compiled to WASM: triggers, RLS, grants,
// SECURITY DEFINER and views all behave exactly as they do on Supabase.
// pgcrypto is not bundled, so its four primitives are stubbed — everything
// else runs unmodified.
//
//   npm run verify:schema
//
// Exits non-zero on any failure, so it can gate CI.

import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const migrationsDir = join(root, 'supabase', 'migrations')
const seedFile = join(root, 'supabase', 'seed.sql')

const PGCRYPTO_SHIM = `
create schema if not exists extensions;
create or replace function extensions.gen_random_bytes(n int) returns bytea
  language sql volatile as $$ select decode(repeat(md5(random()::text), 2), 'hex') $$;
create or replace function extensions.gen_salt(kind text, rounds int default 6) returns text
  language sql immutable as $$ select 'shim-salt' $$;
create or replace function extensions.crypt(pw text, salt text) returns text
  language sql immutable as $$ select md5(pw) $$;
create or replace function extensions.digest(t text, algo text) returns bytea
  language sql immutable as $$ select decode(md5(t), 'hex') $$;
`

const db = new PGlite()
let pass = 0
let fail = 0
const failures = []

function ok(name, condition, detail = '') {
  if (condition) {
    pass += 1
    console.log(`PASS  ${name}`)
  } else {
    fail += 1
    failures.push(name)
    console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

async function q(sql) {
  const result = await db.query(sql)
  return result.rows
}

async function expectError(name, sql, codeOrText) {
  try {
    await db.exec(sql)
    ok(name, false, 'no error raised')
  } catch (error) {
    const matched =
      (error.code && String(error.code) === String(codeOrText)) ||
      (error.message ?? '').toLowerCase().includes(String(codeOrText).toLowerCase())
    ok(name, Boolean(matched), `got ${error.code}: ${error.message}`)
  }
}

async function main() {
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
  `)
  await db.exec(PGCRYPTO_SHIM)

  const migrations = readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort()

  for (const file of migrations) {
    const sql = readFileSync(join(migrationsDir, file), 'utf8').replace(
      /create extension if not exists pgcrypto with schema extensions;/i,
      '-- pgcrypto stubbed by the harness',
    )
    try {
      await db.exec(sql)
      ok(`migration ${file}`, true)
    } catch (error) {
      ok(`migration ${file}`, false, error.message)
      throw error
    }
  }

  await db.exec(readFileSync(seedFile, 'utf8'))
  ok('seed loads', true)

  const counts = await q(`
    select
      (select count(*) from tipping.players)::int as players,
      (select count(*) from tipping.team_eras)::int as eras,
      (select count(*) from tipping.teams)::int as teams,
      (select count(*) from pg_tables where schemaname = 'public')::int as public_tables
  `)
  ok('8 players seeded', counts[0].players === 8, String(counts[0].players))
  ok('2 eras seeded', counts[0].eras === 2, String(counts[0].eras))
  ok('8 teams seeded', counts[0].teams === 8, String(counts[0].teams))
  ok('public schema untouched', counts[0].public_tables === 0, String(counts[0].public_tables))

  await expectError(
    'player cannot be in two teams of the same era',
    `insert into tipping.teams (era_id, name, player_1_id, player_2_id)
     select era_id, 'Duplicate', player_1_id, player_2_id from tipping.teams limit 1`,
    'already in a team',
  )

  const activeEras = await q(`select count(*)::int as n from tipping.team_eras where is_active`)
  ok('single active era enforced', activeEras[0].n === 1, String(activeEras[0].n))

  // ---- admin auth --------------------------------------------------------
  const login = (await q(`select tipping.admin_login('tipping-bootstrap') as r`))[0].r
  ok('login returns a 64-char token', typeof login.token === 'string' && login.token.length === 64)
  ok('first login demands a passcode change', login.must_change_passcode === true)
  const token = login.token

  await expectError(
    'admin writes blocked until passcode rotated',
    `select tipping.admin_save_round('${token}', null, 'Blocked', 'team', 'europatipset', null, null, now(), 8, null)`,
    'P0002',
  )
  await expectError('invalid passcode rejected', `select tipping.admin_login('wrong-pass')`, 'Invalid passcode')

  await db.exec(`select tipping.admin_change_passcode('${token}', 'league-pass-123')`)
  const relogin = (await q(`select tipping.admin_login('league-pass-123') as r`))[0].r
  ok('new passcode works', relogin.must_change_passcode === false)
  const admin = relogin.token

  await expectError(
    'bogus token cannot write',
    `select tipping.admin_save_player('${'0'.repeat(64)}', null, 'Ghost', null, true)`,
    '28000',
  )

  // ---- round lifecycle ---------------------------------------------------
  const team = (await q(`
    select * from tipping.teams
    where era_id = (select id from tipping.team_eras where is_active)
    order by name limit 1
  `))[0]

  const roundId = (
    await q(`
      select tipping.admin_save_round('${admin}', null, 'Harness Round', 'team', 'europatipset',
        '2619', 2619, now() + interval '1 day', 8, null) as id
    `)
  )[0].id
  ok('round created', Boolean(roundId))

  const fixtures = JSON.stringify(
    Array.from({ length: 8 }, (_, index) => ({
      match_number: index + 1,
      home_team: `Home ${index + 1}`,
      away_team: `Away ${index + 1}`,
      kickoff: new Date(Date.now() + 86_400_000).toISOString(),
      match_status: 'not_started',
      current_result: null,
      outcome: null,
      cancelled: false,
    })),
  )

  await db.exec(`select tipping.admin_sync_matches('${admin}', '${roundId}', '${fixtures}'::jsonb)`)
  const matchCount = await q(`select count(*)::int as n from tipping.round_matches where round_id = '${roundId}'`)
  ok('8 matches synced', matchCount[0].n === 8, String(matchCount[0].n))

  const statusBefore = await q(`select status from tipping.rounds where id = '${roundId}'`)
  ok('new round is upcoming', statusBefore[0].status === 'upcoming', statusBefore[0].status)

  const selections = JSON.stringify(
    Array.from({ length: 8 }, (_, index) => ({
      match_number: index + 1,
      signs: index === 0 ? ['1', 'X'] : ['1'],
    })),
  )

  const couponId = (
    await q(`
      select tipping.admin_save_coupon('${admin}', '${roundId}', '${team.id}', null,
        '${selections}'::jsonb, 'harness') as id
    `)
  )[0].id

  const rows = await q(`select total_rows from tipping.coupons where id = '${couponId}'`)
  ok('total_rows derived from hedge (2 rows)', Number(rows[0].total_rows) === 2, String(rows[0].total_rows))

  await db.exec(`select tipping.admin_save_coupon('${admin}', '${roundId}', '${team.id}', null, '${selections}'::jsonb, null)`)
  const couponCount = await q(`select count(*)::int as n from tipping.coupons where round_id = '${roundId}'`)
  ok('re-saving updates the same coupon (one per team)', couponCount[0].n === 1, String(couponCount[0].n))

  const player = (await q(`select id from tipping.players order by name limit 1`))[0]
  await expectError(
    'team round rejects a player coupon',
    `select tipping.admin_save_coupon('${admin}', '${roundId}', null, '${player.id}', '${selections}'::jsonb, null)`,
    'Team rounds take a team coupon',
  )
  await expectError(
    'incomplete coupon rejected',
    `select tipping.admin_save_coupon('${admin}', '${roundId}', '${team.id}', null,
      '${JSON.stringify([{ match_number: 1, signs: ['1'] }])}'::jsonb, null)`,
    'Expected 8 selections',
  )

  // ---- scoring -----------------------------------------------------------
  await db.exec(`
    select tipping.admin_set_match_state('${admin}', '${roundId}', 1, 2, 0, 'finished', '1', null);
    select tipping.admin_set_match_state('${admin}', '${roundId}', 2, 0, 1, 'finished', '2', null);
  `)

  let score = (await q(`select * from tipping.v_coupon_scores where coupon_id = '${couponId}'`))[0]
  ok('resolved count is 2', Number(score.resolved) === 2, String(score.resolved))
  ok('hits count is 1', Number(score.hits) === 1, String(score.hits))
  ok('miss detected', Number(score.misses) === 1, String(score.misses))
  ok('rows_alive is 0 after a miss', Number(score.rows_alive) === 0, String(score.rows_alive))

  const statusLive = await q(`select status from tipping.rounds where id = '${roundId}'`)
  ok('round is live while matches remain', statusLive[0].status === 'live', statusLive[0].status)

  await db.exec(`select tipping.admin_set_match_state('${admin}', '${roundId}', 2, null, null, 'cancelled', null, true)`)
  score = (await q(`select * from tipping.v_coupon_scores where coupon_id = '${couponId}'`))[0]
  ok('void match is not a miss', Number(score.misses) === 0, String(score.misses))
  ok('rows survive a cancelled match', Number(score.rows_alive) > 0, String(score.rows_alive))
  ok('void match is excluded from decidable', Number(score.decidable) === 7, String(score.decidable))

  await db.exec(
    Array.from({ length: 6 }, (_, index) => index + 3)
      .map((number) => `select tipping.admin_set_match_state('${admin}', '${roundId}', ${number}, 1, 0, 'finished', '1', null);`)
      .join('\n'),
  )

  score = (await q(`select * from tipping.v_coupon_scores where coupon_id = '${couponId}'`))[0]
  ok('7 hits after settlement', Number(score.hits) === 7, String(score.hits))
  ok('7 resolved (one void)', Number(score.resolved) === 7, String(score.resolved))
  ok('coupon is perfect despite the void match', score.perfect === true)

  const statusDone = await q(`select status from tipping.rounds where id = '${roundId}'`)
  ok('round completes when all decided', statusDone[0].status === 'completed', statusDone[0].status)

  const winners = await q(`select * from tipping.v_round_winners where round_id = '${roundId}'`)
  ok('winner recorded', winners.length >= 1 && Number(winners[0].hits) === 7, JSON.stringify(winners[0]))

  const teamStats = await q(`select * from tipping.v_team_stats where team_id = '${team.id}'`)
  ok(
    'team stats aggregate',
    Number(teamStats[0].rounds_played) === 1 && Number(teamStats[0].wins) === 1,
    JSON.stringify(teamStats[0]),
  )

  const playerStats = await q(
    `select * from tipping.v_player_stats where player_id in ('${team.player_1_id}','${team.player_2_id}')`,
  )
  ok('both team players credited', playerStats.length === 2 && Number(playerStats[0].rounds_played) === 1)

  // ---- eras: delete a cohort, but never one that owns coupons -------------
  const throwaway = (
    await q(`select tipping.admin_save_era('${admin}', null, 'Throwaway', date '2020-01-01', date '2020-12-31', false, null) as id`)
  )[0].id
  await db.exec(`select tipping.admin_delete_era('${admin}', '${throwaway}')`)
  const gone = await q(`select count(*)::int as n from tipping.team_eras where id = '${throwaway}'`)
  ok('empty era can be deleted', gone[0].n === 0, String(gone[0].n))

  await expectError(
    'era with coupons cannot be deleted',
    `select tipping.admin_delete_era('${admin}', '${team.era_id}')`,
    'still has',
  )

  // ---- players: deletable when unattached --------------------------------
  const tempPlayer = (
    await q(`select tipping.admin_save_player('${admin}', null, 'Temp Player', null, true) as id`)
  )[0].id
  await db.exec(`select tipping.admin_delete_player('${admin}', '${tempPlayer}')`)
  const playerGone = await q(`select count(*)::int as n from tipping.players where id = '${tempPlayer}'`)
  ok('unattached player can be deleted', playerGone[0].n === 0, String(playerGone[0].n))

  await expectError(
    'player still in a team cannot be deleted',
    `select tipping.admin_delete_player('${admin}', '${team.player_1_id}')`,
    'still in a team',
  )

  // ---- sign validation ---------------------------------------------------
  await expectError(
    'duplicate signs rejected',
    `insert into tipping.coupon_selections (coupon_id, match_number, signs)
     values ('${couponId}', 1, array['1','1'])`,
    'coupon_selections_valid',
  )
  await expectError(
    'non 1/X/2 sign rejected',
    `insert into tipping.coupon_selections (coupon_id, match_number, signs)
     values ('${couponId}', 1, array['4'])`,
    'coupon_selections_valid',
  )

  // ---- RLS / grants ------------------------------------------------------
  await db.exec(`set role anon`)
  const anonPlayers = await q(`select count(*)::int as n from tipping.players`)
  ok('anon can read players', anonPlayers[0].n === 8, String(anonPlayers[0].n))

  const anonStats = await q(`select count(*)::int as n from tipping.v_team_stats`)
  ok('anon can read stats views', anonStats[0].n >= 1, String(anonStats[0].n))

  const anonScores = await q(`select count(*)::int as n from tipping.v_coupon_scores`)
  ok('anon can read coupon scores', anonScores[0].n >= 1, String(anonScores[0].n))

  await expectError('anon cannot insert players', `insert into tipping.players (name) values ('Intruder')`, '42501')
  await expectError('anon cannot read admin_config', `select count(*) from tipping.admin_config`, '42501')
  await expectError('anon cannot read admin_sessions', `select count(*) from tipping.admin_sessions`, '42501')
  await expectError('anon cannot call internal assert_admin', `select tipping.assert_admin('x')`, '42501')
  await expectError('anon cannot delete coupons', `delete from tipping.coupons`, '42501')
  await db.exec(`reset role`)

  // ---- passcode rotation -------------------------------------------------
  const second = (await q(`select tipping.admin_login('league-pass-123') as r`))[0].r.token
  await db.exec(`select tipping.admin_change_passcode('${admin}', 'league-pass-456')`)
  await expectError(
    'rotation invalidates other sessions',
    `select tipping.admin_save_player('${second}', null, 'Nope', null, true)`,
    '28000',
  )

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) {
    console.log('Failures:', failures.join(' | '))
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error('HARNESS ERROR:', error.message)
  process.exitCode = 1
})
