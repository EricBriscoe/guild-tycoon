import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { PoolClient } from 'pg';
import { exec, qAll, qAllTx, qOne, qOneTx, qRun, qRunTx, transaction } from './db.js';
import { Guild, User, applyPassiveTicks, applyGuildProgress, applyPassiveTicksT3, applyTier3GuildFlows, applyPassiveTicksT4, applyTier4GuildFlows, T3_PIPE_PER_BOX } from './game.js';

const DATA_DIR = path.join(process.cwd(), 'data');

interface GuildState extends Guild {
  id: string;
  createdAt: number;
  widgetTier: number;
}

function ensureDataDir(): void {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

function defaultGuildState(guildId: string): GuildState {
  return {
    id: guildId,
    createdAt: Date.now(),
    widgetTier: 1,
    tierProgress: 0,
    tierGoal: 1000000,
    totals: { sticks: 0, beams: 0 }
  };
}

function defaultUserState(now: number = Date.now()): User {
  return {
    sticks: 0,
    lastTick: now,
    lastChopAt: 0,
    lifetimeContributed: 0,
    beams: 0,
    pickaxeLevel: 0,
    pickClickPower: 1,
    axeLevel: 0,
    clickPower: 1,
    automation: {
      lumberjacks: 0,
      foremen: 0,
      loggingCamps: 0,
      sawmills: 0,
      arcaneGrove: 0
    },
    automation2: {
      miners: 0,
      smelters: 0,
      foundries: 0,
      beamMills: 0,
      arcaneForge: 0
    },
    rates: { sticksPerSec: 0, beamsPerSec: 0 }
  };
}

async function initDb(): Promise<void> {
  ensureDataDir();
  await exec(`
    CREATE TABLE IF NOT EXISTS guilds (
      id TEXT PRIMARY KEY,
      created_at BIGINT NOT NULL,
      widget_tier INTEGER NOT NULL,
      prestige_points INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS tier1_guild (
      guild_id TEXT PRIMARY KEY REFERENCES guilds(id) ON DELETE CASCADE,
      tier_progress DOUBLE PRECISION NOT NULL,
      tier_goal DOUBLE PRECISION NOT NULL,
      total_sticks DOUBLE PRECISION NOT NULL,
      inv_sticks DOUBLE PRECISION NOT NULL DEFAULT 0,
      axe_level INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS tier2_guild (
      guild_id TEXT PRIMARY KEY REFERENCES guilds(id) ON DELETE CASCADE,
      tier_progress DOUBLE PRECISION NOT NULL,
      tier_goal DOUBLE PRECISION NOT NULL,
      total_beams DOUBLE PRECISION NOT NULL,
      inv_beams DOUBLE PRECISION NOT NULL DEFAULT 0,
      pickaxe_level INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS tier3_guild (
      guild_id TEXT PRIMARY KEY REFERENCES guilds(id) ON DELETE CASCADE,
      tier_progress DOUBLE PRECISION NOT NULL,
      tier_goal DOUBLE PRECISION NOT NULL,
      inv_pipes DOUBLE PRECISION NOT NULL DEFAULT 0,
      inv_boxes DOUBLE PRECISION NOT NULL DEFAULT 0,
      total_pipes DOUBLE PRECISION NOT NULL DEFAULT 0,
      total_boxes DOUBLE PRECISION NOT NULL DEFAULT 0,
      forger_click_level INTEGER NOT NULL DEFAULT 0,
      welder_click_level INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS users (
      guild_id TEXT NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL,
      last_tick BIGINT NOT NULL,
      last_chop_at BIGINT NOT NULL DEFAULT 0,
      lifetime_contributed DOUBLE PRECISION NOT NULL DEFAULT 0,
      prestige_mvp_awards INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (guild_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS tier4_guild (
      guild_id TEXT PRIMARY KEY REFERENCES guilds(id) ON DELETE CASCADE,
      tier_progress DOUBLE PRECISION NOT NULL,
      tier_goal DOUBLE PRECISION NOT NULL,
      inv_wheels DOUBLE PRECISION NOT NULL DEFAULT 0,
      inv_boilers DOUBLE PRECISION NOT NULL DEFAULT 0,
      inv_cabins DOUBLE PRECISION NOT NULL DEFAULT 0,
      inv_trains DOUBLE PRECISION NOT NULL DEFAULT 0,
      inv_wood DOUBLE PRECISION NOT NULL DEFAULT 0,
      inv_steel DOUBLE PRECISION NOT NULL DEFAULT 0,
      total_wheels DOUBLE PRECISION NOT NULL DEFAULT 0,
      total_boilers DOUBLE PRECISION NOT NULL DEFAULT 0,
      total_cabins DOUBLE PRECISION NOT NULL DEFAULT 0,
      total_trains DOUBLE PRECISION NOT NULL DEFAULT 0,
      total_wood DOUBLE PRECISION NOT NULL DEFAULT 0,
      total_steel DOUBLE PRECISION NOT NULL DEFAULT 0,
      wheel_click_level INTEGER NOT NULL DEFAULT 0,
      boiler_click_level INTEGER NOT NULL DEFAULT 0,
      coach_click_level INTEGER NOT NULL DEFAULT 0,
      lumber_click_level INTEGER NOT NULL DEFAULT 0,
      smith_click_level INTEGER NOT NULL DEFAULT 0,
      mech_click_level INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS tier1_users (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      sticks DOUBLE PRECISION NOT NULL DEFAULT 0,
      axe_level INTEGER NOT NULL DEFAULT 0,
      click_power DOUBLE PRECISION NOT NULL DEFAULT 1,
      lumberjacks INTEGER NOT NULL DEFAULT 0,
      foremen INTEGER NOT NULL DEFAULT 0,
      logging_camps INTEGER NOT NULL DEFAULT 0,
      sawmills INTEGER NOT NULL DEFAULT 0,
      arcane_grove INTEGER NOT NULL DEFAULT 0,
      rate_sticks_per_sec DOUBLE PRECISION NOT NULL DEFAULT 0,
      contributed_t1 DOUBLE PRECISION NOT NULL DEFAULT 0,
      PRIMARY KEY (guild_id, user_id),
      FOREIGN KEY (guild_id, user_id) REFERENCES users(guild_id, user_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS tier2_users (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      beams DOUBLE PRECISION NOT NULL DEFAULT 0,
      pickaxe_level INTEGER NOT NULL DEFAULT 0,
      pick_click_power DOUBLE PRECISION NOT NULL DEFAULT 1,
      miners INTEGER NOT NULL DEFAULT 0,
      smelters INTEGER NOT NULL DEFAULT 0,
      foundries INTEGER NOT NULL DEFAULT 0,
      beam_mills INTEGER NOT NULL DEFAULT 0,
      arcane_forge INTEGER NOT NULL DEFAULT 0,
      rate_beams_per_sec DOUBLE PRECISION NOT NULL DEFAULT 0,
      contributed_t2 DOUBLE PRECISION NOT NULL DEFAULT 0,
      PRIMARY KEY (guild_id, user_id),
      FOREIGN KEY (guild_id, user_id) REFERENCES users(guild_id, user_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS tier3_users (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT,
      f1 INTEGER NOT NULL DEFAULT 0,
      f2 INTEGER NOT NULL DEFAULT 0,
      f3 INTEGER NOT NULL DEFAULT 0,
      f4 INTEGER NOT NULL DEFAULT 0,
      f5 INTEGER NOT NULL DEFAULT 0,
      w1 INTEGER NOT NULL DEFAULT 0,
      w2 INTEGER NOT NULL DEFAULT 0,
      w3 INTEGER NOT NULL DEFAULT 0,
      w4 INTEGER NOT NULL DEFAULT 0,
      w5 INTEGER NOT NULL DEFAULT 0,
      rate_pipes_per_sec DOUBLE PRECISION NOT NULL DEFAULT 0,
      rate_boxes_per_sec DOUBLE PRECISION NOT NULL DEFAULT 0,
      contributed_t3 DOUBLE PRECISION NOT NULL DEFAULT 0,
      weld_enabled INTEGER NOT NULL DEFAULT 1,
      pipes_produced DOUBLE PRECISION NOT NULL DEFAULT 0,
      boxes_produced DOUBLE PRECISION NOT NULL DEFAULT 0,
      PRIMARY KEY (guild_id, user_id),
      FOREIGN KEY (guild_id, user_id) REFERENCES users(guild_id, user_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS tier4_users (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT,
      wh1 INTEGER NOT NULL DEFAULT 0,
      wh2 INTEGER NOT NULL DEFAULT 0,
      wh3 INTEGER NOT NULL DEFAULT 0,
      wh4 INTEGER NOT NULL DEFAULT 0,
      wh5 INTEGER NOT NULL DEFAULT 0,
      bl1 INTEGER NOT NULL DEFAULT 0,
      bl2 INTEGER NOT NULL DEFAULT 0,
      bl3 INTEGER NOT NULL DEFAULT 0,
      bl4 INTEGER NOT NULL DEFAULT 0,
      bl5 INTEGER NOT NULL DEFAULT 0,
      cb1 INTEGER NOT NULL DEFAULT 0,
      cb2 INTEGER NOT NULL DEFAULT 0,
      cb3 INTEGER NOT NULL DEFAULT 0,
      cb4 INTEGER NOT NULL DEFAULT 0,
      cb5 INTEGER NOT NULL DEFAULT 0,
      lj1 INTEGER NOT NULL DEFAULT 0,
      lj2 INTEGER NOT NULL DEFAULT 0,
      lj3 INTEGER NOT NULL DEFAULT 0,
      lj4 INTEGER NOT NULL DEFAULT 0,
      lj5 INTEGER NOT NULL DEFAULT 0,
      sm1 INTEGER NOT NULL DEFAULT 0,
      sm2 INTEGER NOT NULL DEFAULT 0,
      sm3 INTEGER NOT NULL DEFAULT 0,
      sm4 INTEGER NOT NULL DEFAULT 0,
      sm5 INTEGER NOT NULL DEFAULT 0,
      ta1 INTEGER NOT NULL DEFAULT 0,
      ta2 INTEGER NOT NULL DEFAULT 0,
      ta3 INTEGER NOT NULL DEFAULT 0,
      ta4 INTEGER NOT NULL DEFAULT 0,
      ta5 INTEGER NOT NULL DEFAULT 0,
      rate_wheels_per_sec DOUBLE PRECISION NOT NULL DEFAULT 0,
      rate_boilers_per_sec DOUBLE PRECISION NOT NULL DEFAULT 0,
      rate_cabins_per_sec DOUBLE PRECISION NOT NULL DEFAULT 0,
      rate_wood_per_sec DOUBLE PRECISION NOT NULL DEFAULT 0,
      rate_steel_per_sec DOUBLE PRECISION NOT NULL DEFAULT 0,
      rate_trains_per_sec DOUBLE PRECISION NOT NULL DEFAULT 0,
      contributed_t4 DOUBLE PRECISION NOT NULL DEFAULT 0,
      wheels_produced DOUBLE PRECISION NOT NULL DEFAULT 0,
      boilers_produced DOUBLE PRECISION NOT NULL DEFAULT 0,
      cabins_produced DOUBLE PRECISION NOT NULL DEFAULT 0,
      wood_produced DOUBLE PRECISION NOT NULL DEFAULT 0,
      steel_produced DOUBLE PRECISION NOT NULL DEFAULT 0,
      trains_produced DOUBLE PRECISION NOT NULL DEFAULT 0,
      wheel_enabled INTEGER NOT NULL DEFAULT 1,
      boiler_enabled INTEGER NOT NULL DEFAULT 1,
      coach_enabled INTEGER NOT NULL DEFAULT 1,
      mech_enabled INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY (guild_id, user_id),
      FOREIGN KEY (guild_id, user_id) REFERENCES users(guild_id, user_id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_users_lifetime_contributed ON users(guild_id, lifetime_contributed DESC);
    CREATE INDEX IF NOT EXISTS idx_tier1_contributed ON tier1_users(guild_id, contributed_t1 DESC);
    CREATE INDEX IF NOT EXISTS idx_tier2_contributed ON tier2_users(guild_id, contributed_t2 DESC);
    CREATE INDEX IF NOT EXISTS idx_tier3_contributed ON tier3_users(guild_id, contributed_t3 DESC);
    CREATE INDEX IF NOT EXISTS idx_tier4_contributed ON tier4_users(guild_id, contributed_t4 DESC);
    CREATE INDEX IF NOT EXISTS idx_tier3_role_contributed ON tier3_users(guild_id, role, contributed_t3 DESC);
    CREATE INDEX IF NOT EXISTS idx_tier3_role_produced_pipes ON tier3_users(guild_id, role, pipes_produced DESC);
    CREATE INDEX IF NOT EXISTS idx_tier3_role_produced_boxes ON tier3_users(guild_id, role, boxes_produced DESC);
  `);
}

async function ensureGuildTx(client: PoolClient, guildId: string): Promise<void> {
  const row = await qOneTx(client, 'SELECT id FROM guilds WHERE id = ?', guildId);
  if (!row) {
    const g = defaultGuildState(guildId);
    await qRunTx(client, `INSERT INTO guilds (id, created_at, widget_tier, prestige_points) VALUES (?, ?, ?, 0)`, g.id, g.createdAt, g.widgetTier);
    await qRunTx(client, `INSERT INTO tier1_guild (guild_id, tier_progress, tier_goal, total_sticks, inv_sticks, axe_level) VALUES (?, ?, ?, ?, ?, ?)`, g.id, 0, 1000000, 0, 0, 0);
    await qRunTx(client, `INSERT INTO tier2_guild (guild_id, tier_progress, tier_goal, total_beams, inv_beams, pickaxe_level) VALUES (?, ?, ?, ?, ?, ?)`, g.id, 0, 10000000, 0, 0, 0);
    await qRunTx(client, `INSERT INTO tier3_guild (guild_id, tier_progress, tier_goal, inv_pipes, inv_boxes, total_pipes, total_boxes, forger_click_level, welder_click_level) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0)`, g.id, 0, 20000000, 0, 0, 0, 0);
    await qRunTx(client, `INSERT INTO tier4_guild (guild_id, tier_progress, tier_goal, inv_wheels, inv_boilers, inv_cabins, inv_trains, inv_wood, inv_steel, total_wheels, total_boilers, total_cabins, total_trains, total_wood, total_steel, wheel_click_level, boiler_click_level, coach_click_level, lumber_click_level, smith_click_level, mech_click_level) VALUES (?, ?, ?, 0,0,0,0, 0,0, 0,0,0,0, 0,0, 0,0,0, 0,0,0)`, g.id, 0, 100000000);
  }
}

async function ensureUserTx(client: PoolClient, guildId: string, userId: string): Promise<void> {
  const base = await qOneTx(client, 'SELECT user_id FROM users WHERE guild_id = ? AND user_id = ?', guildId, userId);
  if (!base) {
    const now = Date.now();
    await qRunTx(client, `INSERT INTO users (guild_id, user_id, last_tick, last_chop_at, lifetime_contributed, prestige_mvp_awards) VALUES (?, ?, ?, ?, 0, 0)`, guildId, userId, now, 0);
  }
  const t1 = await qOneTx(client, 'SELECT user_id FROM tier1_users WHERE guild_id = ? AND user_id = ?', guildId, userId);
  if (!t1) {
    await qRunTx(client, `INSERT INTO tier1_users (guild_id, user_id, sticks, axe_level, click_power, lumberjacks, foremen, logging_camps, sawmills, arcane_grove, rate_sticks_per_sec, contributed_t1) VALUES (?, ?, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0)`, guildId, userId);
  }
  const t2 = await qOneTx(client, 'SELECT user_id FROM tier2_users WHERE guild_id = ? AND user_id = ?', guildId, userId);
  if (!t2) {
    await qRunTx(client, `INSERT INTO tier2_users (guild_id, user_id, beams, pickaxe_level, pick_click_power, miners, smelters, foundries, beam_mills, arcane_forge, rate_beams_per_sec, contributed_t2) VALUES (?, ?, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0)`, guildId, userId);
  }
  const t3 = await qOneTx(client, 'SELECT user_id FROM tier3_users WHERE guild_id = ? AND user_id = ?', guildId, userId);
  if (!t3) {
    await qRunTx(client, `INSERT INTO tier3_users (guild_id, user_id, role, f1, f2, f3, f4, f5, w1, w2, w3, w4, w5, rate_pipes_per_sec, rate_boxes_per_sec, contributed_t3, weld_enabled, pipes_produced, boxes_produced) VALUES (?, ?, NULL, 0,0,0,0,0, 0,0,0,0,0, 0, 0, 0, 1, 0, 0)`, guildId, userId);
  }
  const t4 = await qOneTx(client, 'SELECT user_id FROM tier4_users WHERE guild_id = ? AND user_id = ?', guildId, userId);
  if (!t4) {
    await qRunTx(client, `INSERT INTO tier4_users (guild_id, user_id, role, wh1, wh2, wh3, wh4, wh5, bl1, bl2, bl3, bl4, bl5, cb1, cb2, cb3, cb4, cb5, lj1, lj2, lj3, lj4, lj5, sm1, sm2, sm3, sm4, sm5, ta1, ta2, ta3, ta4, ta5, rate_wheels_per_sec, rate_boilers_per_sec, rate_cabins_per_sec, rate_wood_per_sec, rate_steel_per_sec, rate_trains_per_sec, contributed_t4, wheels_produced, boilers_produced, cabins_produced, wood_produced, steel_produced, trains_produced, wheel_enabled, boiler_enabled, coach_enabled, mech_enabled) VALUES (?, ?, NULL, 0,0,0,0,0, 0,0,0,0,0, 0,0,0,0,0, 0,0,0,0,0, 0,0,0,0,0, 0,0,0,0,0, 0,0,0, 0,0,0, 0,0,0, 1,1,1,1)`, guildId, userId);
  }
}

async function loadGuildTx(client: PoolClient, guildId: string): Promise<GuildState> {
  await ensureGuildTx(client, guildId);
  const row: any = await qOneTx(client, `SELECT id, created_at, widget_tier, prestige_points FROM guilds WHERE id = ?`, guildId);
  const t1: any = await qOneTx(client, `SELECT tier_progress, tier_goal, total_sticks, inv_sticks, axe_level FROM tier1_guild WHERE guild_id = ?`, guildId);
  const t2: any = await qOneTx(client, `SELECT tier_progress, tier_goal, total_beams, inv_beams, pickaxe_level FROM tier2_guild WHERE guild_id = ?`, guildId);
  const t3: any = await qOneTx(client, `SELECT tier_progress, tier_goal, inv_pipes, inv_boxes, total_pipes, total_boxes, forger_click_level, welder_click_level FROM tier3_guild WHERE guild_id = ?`, guildId);
  const t4: any = await qOneTx(client, `SELECT tier_progress, tier_goal, inv_wheels, inv_boilers, inv_cabins, inv_trains, inv_wood, inv_steel, total_wheels, total_boilers, total_cabins, total_trains, total_wood, total_steel, wheel_click_level, boiler_click_level, coach_click_level, lumber_click_level, smith_click_level, mech_click_level FROM tier4_guild WHERE guild_id = ?`, guildId);
  const currentTier = row.widget_tier || 1;
  // Coerce BIGINT columns returned as strings into numbers where appropriate
  const createdAtNum: number = Number(row.created_at) || Date.now();
  return {
    id: row.id,
    createdAt: createdAtNum,
    widgetTier: currentTier,
    tierProgress: currentTier === 1 ? (t1?.tier_progress || 0) : currentTier === 2 ? (t2?.tier_progress || 0) : currentTier === 3 ? (t3?.tier_progress || 0) : (t4?.tier_progress || 0),
    tierGoal: currentTier === 1 ? (t1?.tier_goal || 1000000) : currentTier === 2 ? (t2?.tier_goal || 10000000) : currentTier === 3 ? (t3?.tier_goal || 20000000) : (t4?.tier_goal || 40000000),
    totals: { sticks: t1?.total_sticks || 0, beams: t2?.total_beams || 0, pipes: t3?.total_pipes || 0, boxes: t3?.total_boxes || 0, wood: t4?.total_wood || 0, steel: t4?.total_steel || 0, wheels: t4?.total_wheels || 0, boilers: t4?.total_boilers || 0, cabins: t4?.total_cabins || 0, trains: t4?.total_trains || 0 },
    inventory: { sticks: t1?.inv_sticks || 0, beams: t2?.inv_beams || 0, pipes: t3?.inv_pipes || 0, boxes: t3?.inv_boxes || 0, wood: t4?.inv_wood || 0, steel: t4?.inv_steel || 0, wheels: t4?.inv_wheels || 0, boilers: t4?.inv_boilers || 0, cabins: t4?.inv_cabins || 0, trains: t4?.inv_trains || 0 },
    axeLevel: t1?.axe_level || 0,
    pickaxeLevel: t2?.pickaxe_level || 0,
    t3ForgerClickLevel: t3?.forger_click_level || 0,
    t3WelderClickLevel: t3?.welder_click_level || 0,
    t4WheelwrightClickLevel: t4?.wheel_click_level || 0,
    t4BoilermakerClickLevel: t4?.boiler_click_level || 0,
    t4CoachbuilderClickLevel: t4?.coach_click_level || 0,
    t4LumberjackClickLevel: t4?.lumber_click_level || 0,
    t4SmithyClickLevel: t4?.smith_click_level || 0,
    t4MechanicClickLevel: t4?.mech_click_level || 0,
    prestigePoints: row.prestige_points || 0
  };
}

async function loadUserTx(client: PoolClient, guildId: string, userId: string): Promise<User> {
  await ensureGuildTx(client, guildId);
  await ensureUserTx(client, guildId, userId);
  const base: any = await qOneTx(client, `
    SELECT last_tick, last_chop_at, lifetime_contributed, prestige_mvp_awards
    FROM users WHERE guild_id = ? AND user_id = ?
  `, guildId, userId);
  const t1: any = await qOneTx(client, `
    SELECT sticks, axe_level, click_power, lumberjacks, foremen, logging_camps, sawmills, arcane_grove, rate_sticks_per_sec, contributed_t1
    FROM tier1_users WHERE guild_id = ? AND user_id = ?
  `, guildId, userId);
  const t2: any = await qOneTx(client, `
    SELECT beams, pickaxe_level, pick_click_power, miners, smelters, foundries, beam_mills, arcane_forge, rate_beams_per_sec, contributed_t2
    FROM tier2_users WHERE guild_id = ? AND user_id = ?
  `, guildId, userId);
  const t3: any = await qOneTx(client, `
    SELECT role, f1, f2, f3, f4, f5, w1, w2, w3, w4, w5, rate_pipes_per_sec, rate_boxes_per_sec, contributed_t3, weld_enabled, pipes_produced, boxes_produced
    FROM tier3_users WHERE guild_id = ? AND user_id = ?
  `, guildId, userId);
  const t4: any = await qOneTx(client, `
    SELECT role, wh1, wh2, wh3, wh4, wh5, bl1, bl2, bl3, bl4, bl5, cb1, cb2, cb3, cb4, cb5,
           lj1, lj2, lj3, lj4, lj5, sm1, sm2, sm3, sm4, sm5, ta1, ta2, ta3, ta4, ta5,
           rate_wheels_per_sec, rate_boilers_per_sec, rate_cabins_per_sec, rate_wood_per_sec, rate_steel_per_sec, rate_trains_per_sec,
           contributed_t4, wheels_produced, boilers_produced, cabins_produced, wood_produced, steel_produced, trains_produced,
           wheel_enabled, boiler_enabled, coach_enabled, mech_enabled
    FROM tier4_users WHERE guild_id = ? AND user_id = ?
  `, guildId, userId);
  // Safely coerce BIGINT timestamps to numbers (pg returns BIGINT as strings)
  const lastTickNum: number = Number(base?.last_tick);
  const lastChopAtNum: number = Number(base?.last_chop_at);
  return {
    sticks: t1?.sticks || 0,
    lastTick: Number.isFinite(lastTickNum) && lastTickNum > 0 ? lastTickNum : Date.now(),
    lastChopAt: Number.isFinite(lastChopAtNum) && lastChopAtNum > 0 ? lastChopAtNum : 0,
    beams: t2?.beams || 0,
    lifetimeContributed: base?.lifetime_contributed || 0,
    prestigeMvpAwards: base?.prestige_mvp_awards || 0,
    contributedT1: t1?.contributed_t1 || 0,
    contributedT2: t2?.contributed_t2 || 0,
    contributedT3: t3?.contributed_t3 || 0,
    axeLevel: t1?.axe_level || 0,
    clickPower: t1?.click_power || 1,
    pickaxeLevel: t2?.pickaxe_level || 0,
    pickClickPower: t2?.pick_click_power || 1,
    automation: {
      lumberjacks: t1?.lumberjacks || 0,
      foremen: t1?.foremen || 0,
      loggingCamps: t1?.logging_camps || 0,
      sawmills: t1?.sawmills || 0,
      arcaneGrove: t1?.arcane_grove || 0
    },
    automation2: {
      miners: t2?.miners || 0,
      smelters: t2?.smelters || 0,
      foundries: t2?.foundries || 0,
      beamMills: t2?.beam_mills || 0,
      arcaneForge: t2?.arcane_forge || 0
    },
    automation3: { forge1: t3?.f1 || 0, forge2: t3?.f2 || 0, forge3: t3?.f3 || 0, forge4: t3?.f4 || 0, forge5: t3?.f5 || 0, weld1: t3?.w1 || 0, weld2: t3?.w2 || 0, weld3: t3?.w3 || 0, weld4: t3?.w4 || 0, weld5: t3?.w5 || 0 },
    role3: t3?.role || null,
    rates: { sticksPerSec: t1?.rate_sticks_per_sec || 0, beamsPerSec: t2?.rate_beams_per_sec || 0, pipesPerSec: t3?.rate_pipes_per_sec || 0, boxesPerSec: t3?.rate_boxes_per_sec || 0, woodPerSec: t4?.rate_wood_per_sec || 0, steelPerSec: t4?.rate_steel_per_sec || 0, wheelsPerSec: t4?.rate_wheels_per_sec || 0, boilersPerSec: t4?.rate_boilers_per_sec || 0, cabinsPerSec: t4?.rate_cabins_per_sec || 0, trainsPerSec: t4?.rate_trains_per_sec || 0 },
    weldPassiveEnabled: (t3?.weld_enabled ?? 1) !== 0,
    pipesProduced: t3?.pipes_produced || 0,
    boxesProduced: t3?.boxes_produced || 0,
    role4: t4?.role || null,
    automation4: { wh1: t4?.wh1 || 0, wh2: t4?.wh2 || 0, wh3: t4?.wh3 || 0, wh4: t4?.wh4 || 0, wh5: t4?.wh5 || 0, bl1: t4?.bl1 || 0, bl2: t4?.bl2 || 0, bl3: t4?.bl3 || 0, bl4: t4?.bl4 || 0, bl5: t4?.bl5 || 0, cb1: t4?.cb1 || 0, cb2: t4?.cb2 || 0, cb3: t4?.cb3 || 0, cb4: t4?.cb4 || 0, cb5: t4?.cb5 || 0, lj1: t4?.lj1 || 0, lj2: t4?.lj2 || 0, lj3: t4?.lj3 || 0, lj4: t4?.lj4 || 0, lj5: t4?.lj5 || 0, sm1: t4?.sm1 || 0, sm2: t4?.sm2 || 0, sm3: t4?.sm3 || 0, sm4: t4?.sm4 || 0, sm5: t4?.sm5 || 0, ta1: t4?.ta1 || 0, ta2: t4?.ta2 || 0, ta3: t4?.ta3 || 0, ta4: t4?.ta4 || 0, ta5: t4?.ta5 || 0 },
    contributedT4: t4?.contributed_t4 || 0,
    wheelsProduced: t4?.wheels_produced || 0,
    boilersProduced: t4?.boilers_produced || 0,
    cabinsProduced: t4?.cabins_produced || 0,
    woodProduced: t4?.wood_produced || 0,
    steelProduced: t4?.steel_produced || 0,
    trainsProduced: t4?.trains_produced || 0,
    wheelPassiveEnabled: (t4?.wheel_enabled ?? 1) !== 0,
    boilerPassiveEnabled: (t4?.boiler_enabled ?? 1) !== 0,
    coachPassiveEnabled: (t4?.coach_enabled ?? 1) !== 0,
    mechPassiveEnabled: (t4?.mech_enabled ?? 1) !== 0
  };
}

async function saveGuildTx(client: PoolClient, g: GuildState): Promise<void> {
  await qRunTx(client, `UPDATE guilds SET widget_tier = ?, prestige_points = ? WHERE id = ?`, g.widgetTier, (g as any).prestigePoints || 0, g.id);
  await qRunTx(client, `UPDATE tier1_guild SET total_sticks = ?, inv_sticks = ?, axe_level = ? WHERE guild_id = ?`, g.totals.sticks, (g as any).inventory?.sticks || 0, (g as any).axeLevel || 0, g.id);
  await qRunTx(client, `UPDATE tier2_guild SET total_beams = ?, inv_beams = ?, pickaxe_level = ? WHERE guild_id = ?`, g.totals.beams, (g as any).inventory?.beams || 0, (g as any).pickaxeLevel || 0, g.id);
  await qRunTx(client, `UPDATE tier3_guild SET total_pipes = ?, total_boxes = ?, inv_pipes = ?, inv_boxes = ?, forger_click_level = ?, welder_click_level = ? WHERE guild_id = ?`, (g as any).totals?.pipes || 0, (g as any).totals?.boxes || 0, (g as any).inventory?.pipes || 0, (g as any).inventory?.boxes || 0, (g as any).t3ForgerClickLevel || 0, (g as any).t3WelderClickLevel || 0, g.id);
  await qRunTx(client, `UPDATE tier4_guild SET 
    total_wheels = ?, total_boilers = ?, total_cabins = ?, total_trains = ?, total_wood = ?, total_steel = ?,
    inv_wheels = ?, inv_boilers = ?, inv_cabins = ?, inv_trains = ?, inv_wood = ?, inv_steel = ?,
    wheel_click_level = ?, boiler_click_level = ?, coach_click_level = ?, lumber_click_level = ?, smith_click_level = ?, mech_click_level = ?
    WHERE guild_id = ?`,
    (g as any).totals?.wheels || 0,
    (g as any).totals?.boilers || 0,
    (g as any).totals?.cabins || 0,
    (g as any).totals?.trains || 0,
    (g as any).totals?.wood || 0,
    (g as any).totals?.steel || 0,
    (g as any).inventory?.wheels || 0,
    (g as any).inventory?.boilers || 0,
    (g as any).inventory?.cabins || 0,
    (g as any).inventory?.trains || 0,
    (g as any).inventory?.wood || 0,
    (g as any).inventory?.steel || 0,
    (g as any).t4WheelwrightClickLevel || 0,
    (g as any).t4BoilermakerClickLevel || 0,
    (g as any).t4CoachbuilderClickLevel || 0,
    (g as any).t4LumberjackClickLevel || 0,
    (g as any).t4SmithyClickLevel || 0,
    (g as any).t4MechanicClickLevel || 0,
    g.id);
  if ((g as any).widgetTier === 1) {
    await qRunTx(client, `UPDATE tier1_guild SET tier_progress = ?, tier_goal = ? WHERE guild_id = ?`, g.tierProgress, g.tierGoal, g.id);
  } else if ((g as any).widgetTier === 2) {
    await qRunTx(client, `UPDATE tier2_guild SET tier_progress = ?, tier_goal = ? WHERE guild_id = ?`, g.tierProgress, g.tierGoal, g.id);
  } else if ((g as any).widgetTier === 3) {
    await qRunTx(client, `UPDATE tier3_guild SET tier_progress = ?, tier_goal = ? WHERE guild_id = ?`, g.tierProgress, g.tierGoal, g.id);
  } else if ((g as any).widgetTier === 4) {
    await qRunTx(client, `UPDATE tier4_guild SET tier_progress = ?, tier_goal = ? WHERE guild_id = ?`, g.tierProgress, g.tierGoal, g.id);
  }
}

async function saveUserTx(client: PoolClient, guildId: string, userId: string, u: User): Promise<void> {
  await qRunTx(client, `UPDATE users SET last_tick = ?, last_chop_at = ?, lifetime_contributed = ?, prestige_mvp_awards = ? WHERE guild_id = ? AND user_id = ?`, u.lastTick, u.lastChopAt || 0, u.lifetimeContributed || 0, (u as any).prestigeMvpAwards || 0, guildId, userId);
  await qRunTx(client, `
    UPDATE tier1_users SET sticks = ?, axe_level = ?, click_power = ?, lumberjacks = ?, foremen = ?, logging_camps = ?, sawmills = ?, arcane_grove = ?, rate_sticks_per_sec = ?, contributed_t1 = ?
    WHERE guild_id = ? AND user_id = ?
  `,
    u.sticks, u.axeLevel, u.clickPower, u.automation.lumberjacks, u.automation.foremen, u.automation.loggingCamps, u.automation.sawmills, u.automation.arcaneGrove,
    u.rates.sticksPerSec, (u as any).contributedT1 || 0, guildId, userId
  );
  await qRunTx(client, `
    UPDATE tier2_users SET beams = ?, pickaxe_level = ?, pick_click_power = ?, miners = ?, smelters = ?, foundries = ?, beam_mills = ?, arcane_forge = ?, rate_beams_per_sec = ?, contributed_t2 = ?
    WHERE guild_id = ? AND user_id = ?
  `,
    (u as any).beams || 0, (u as any).pickaxeLevel || 0, (u as any).pickClickPower || 1, (u as any).automation2?.miners || 0, (u as any).automation2?.smelters || 0, (u as any).automation2?.foundries || 0, (u as any).automation2?.beamMills || 0, (u as any).automation2?.arcaneForge || 0,
    (u as any).rates?.beamsPerSec || 0, (u as any).contributedT2 || 0, guildId, userId
  );
  await qRunTx(client, `
    UPDATE tier3_users SET role = ?, f1 = ?, f2 = ?, f3 = ?, f4 = ?, f5 = ?, w1 = ?, w2 = ?, w3 = ?, w4 = ?, w5 = ?, rate_pipes_per_sec = ?, rate_boxes_per_sec = ?, contributed_t3 = ?, weld_enabled = ?, pipes_produced = ?, boxes_produced = ?
    WHERE guild_id = ? AND user_id = ?
  `,
    (u as any).role3 || null,
    (u as any).automation3?.forge1 || 0,
    (u as any).automation3?.forge2 || 0,
    (u as any).automation3?.forge3 || 0,
    (u as any).automation3?.forge4 || 0,
    (u as any).automation3?.forge5 || 0,
    (u as any).automation3?.weld1 || 0,
    (u as any).automation3?.weld2 || 0,
    (u as any).automation3?.weld3 || 0,
    (u as any).automation3?.weld4 || 0,
    (u as any).automation3?.weld5 || 0,
    (u as any).rates?.pipesPerSec || 0,
    (u as any).rates?.boxesPerSec || 0,
    (u as any).contributedT3 || 0,
    ((u as any).weldPassiveEnabled === false ? 0 : 1),
    (u as any).pipesProduced || 0,
    (u as any).boxesProduced || 0,
    guildId,
    userId
  );
  await qRunTx(client, `
    UPDATE tier4_users SET role = ?,
      wh1 = ?, wh2 = ?, wh3 = ?, wh4 = ?, wh5 = ?,
      bl1 = ?, bl2 = ?, bl3 = ?, bl4 = ?, bl5 = ?,
      cb1 = ?, cb2 = ?, cb3 = ?, cb4 = ?, cb5 = ?,
      lj1 = ?, lj2 = ?, lj3 = ?, lj4 = ?, lj5 = ?,
      sm1 = ?, sm2 = ?, sm3 = ?, sm4 = ?, sm5 = ?,
      ta1 = ?, ta2 = ?, ta3 = ?, ta4 = ?, ta5 = ?,
      rate_wheels_per_sec = ?, rate_boilers_per_sec = ?, rate_cabins_per_sec = ?,
      rate_wood_per_sec = ?, rate_steel_per_sec = ?, rate_trains_per_sec = ?,
      contributed_t4 = ?,
      wheels_produced = ?, boilers_produced = ?, cabins_produced = ?,
      wood_produced = ?, steel_produced = ?, trains_produced = ?,
      wheel_enabled = ?, boiler_enabled = ?, coach_enabled = ?, mech_enabled = ?
    WHERE guild_id = ? AND user_id = ?
  `,
    (u as any).role4 || null,
    (u as any).automation4?.wh1 || 0,
    (u as any).automation4?.wh2 || 0,
    (u as any).automation4?.wh3 || 0,
    (u as any).automation4?.wh4 || 0,
    (u as any).automation4?.wh5 || 0,
    (u as any).automation4?.bl1 || 0,
    (u as any).automation4?.bl2 || 0,
    (u as any).automation4?.bl3 || 0,
    (u as any).automation4?.bl4 || 0,
    (u as any).automation4?.bl5 || 0,
    (u as any).automation4?.cb1 || 0,
    (u as any).automation4?.cb2 || 0,
    (u as any).automation4?.cb3 || 0,
    (u as any).automation4?.cb4 || 0,
    (u as any).automation4?.cb5 || 0,
    (u as any).automation4?.lj1 || 0,
    (u as any).automation4?.lj2 || 0,
    (u as any).automation4?.lj3 || 0,
    (u as any).automation4?.lj4 || 0,
    (u as any).automation4?.lj5 || 0,
    (u as any).automation4?.sm1 || 0,
    (u as any).automation4?.sm2 || 0,
    (u as any).automation4?.sm3 || 0,
    (u as any).automation4?.sm4 || 0,
    (u as any).automation4?.sm5 || 0,
    (u as any).automation4?.ta1 || 0,
    (u as any).automation4?.ta2 || 0,
    (u as any).automation4?.ta3 || 0,
    (u as any).automation4?.ta4 || 0,
    (u as any).automation4?.ta5 || 0,
    (u as any).rates?.wheelsPerSec || 0,
    (u as any).rates?.boilersPerSec || 0,
    (u as any).rates?.cabinsPerSec || 0,
    (u as any).rates?.woodPerSec || 0,
    (u as any).rates?.steelPerSec || 0,
    (u as any).rates?.trainsPerSec || 0,
    (u as any).contributedT4 || 0,
    (u as any).wheelsProduced || 0,
    (u as any).boilersProduced || 0,
    (u as any).cabinsProduced || 0,
    (u as any).woodProduced || 0,
    (u as any).steelProduced || 0,
    (u as any).trainsProduced || 0,
    ((u as any).wheelPassiveEnabled === false ? 0 : 1),
    ((u as any).boilerPassiveEnabled === false ? 0 : 1),
    ((u as any).coachPassiveEnabled === false ? 0 : 1),
    ((u as any).mechPassiveEnabled === false ? 0 : 1),
    guildId,
    userId
  );
}

export async function getTopContributors(guildId: string, limit: number = 10): Promise<Array<{ userId: string; lifetimeContributed: number }>> {
  const rows = await qAll<{ userId: string; lifetimeContributed: number }>(
    `SELECT user_id AS "userId", lifetime_contributed AS "lifetimeContributed" FROM users WHERE guild_id = ? ORDER BY lifetime_contributed DESC LIMIT ?`,
    guildId, limit
  );
  return rows;
}

export async function getTopContributorsByTier(guildId: string, tier: number, limit: number = 10): Promise<Array<{ userId: string; contributed: number }>> {
  if (tier === 1) {
    return qAll(`SELECT user_id AS "userId", contributed_t1 AS "contributed" FROM tier1_users WHERE guild_id = ? ORDER BY contributed_t1 DESC LIMIT ?`, guildId, limit);
  } else if (tier === 2) {
    return qAll(`SELECT user_id AS "userId", contributed_t2 AS "contributed" FROM tier2_users WHERE guild_id = ? ORDER BY contributed_t2 DESC LIMIT ?`, guildId, limit);
  } else if (tier === 3) {
    return qAll(`SELECT user_id AS "userId", contributed_t3 AS "contributed" FROM tier3_users WHERE guild_id = ? ORDER BY contributed_t3 DESC LIMIT ?`, guildId, limit);
  } else {
    return qAll(`SELECT user_id AS "userId", contributed_t4 AS "contributed" FROM tier4_users WHERE guild_id = ? ORDER BY contributed_t4 DESC LIMIT ?`, guildId, limit);
  }
}

export async function getTopContributorsByRole(guildId: string, role: 'forger' | 'welder', limit: number = 10): Promise<Array<{ userId: string; contributed: number }>> {
  return qAll(`SELECT user_id AS "userId", contributed_t3 AS "contributed" FROM tier3_users WHERE guild_id = ? AND role = ? ORDER BY contributed_t3 DESC LIMIT ?`, guildId, role, limit);
}

export async function getTopProducersByRole(guildId: string, role: 'forger' | 'welder', limit: number = 10): Promise<Array<{ userId: string; produced: number }>> {
  const column = role === 'forger' ? 'pipes_produced' : 'boxes_produced';
  const rows = await qAll<any>(
    `SELECT user_id AS "userId", ${column} AS "produced" FROM tier3_users WHERE guild_id = ? AND role = ? ORDER BY ${column} DESC LIMIT ?`,
    guildId, role, limit
  );
  return rows as any[];
}

export async function getAllT3UsersProduction(guildId: string): Promise<Array<{ userId: string; role: 'forger' | 'welder' | null; pipesProduced: number; boxesProduced: number }>> {
  const rows = await qAll<any>(
    `SELECT user_id AS "userId", role, COALESCE(pipes_produced, 0) AS "pipesProduced", COALESCE(boxes_produced, 0) AS "boxesProduced" FROM tier3_users WHERE guild_id = ?`,
    guildId
  );
  return rows as any;
}

export async function getAllT4UsersProduction(guildId: string): Promise<Array<{ userId: string; role: string | null; woodProduced: number; steelProduced: number; wheelsProduced: number; boilersProduced: number; cabinsProduced: number; trainsProduced: number }>> {
  const rows = await qAll<any>(
    `SELECT user_id AS "userId", role,
           COALESCE(wood_produced, 0) AS "woodProduced",
           COALESCE(steel_produced, 0) AS "steelProduced",
           COALESCE(wheels_produced, 0) AS "wheelsProduced",
           COALESCE(boilers_produced, 0) AS "boilersProduced",
           COALESCE(cabins_produced, 0) AS "cabinsProduced",
           COALESCE(trains_produced, 0) AS "trainsProduced"
     FROM tier4_users WHERE guild_id = ?`,
    guildId
  );
  return rows as any;
}

export async function getUsersByRoleT3(guildId: string, role: 'forger' | 'welder'): Promise<string[]> {
  const rows = await qAll<{ userId: string }>(`SELECT user_id AS "userId" FROM tier3_users WHERE guild_id = ? AND role = ?`, guildId, role);
  return rows.map(r => r.userId);
}

export async function getUsersByRoleT4(
  guildId: string,
  role: 'lumberjack' | 'smithy' | 'wheelwright' | 'boilermaker' | 'coachbuilder' | 'mechanic'
): Promise<string[]> {
  const rows = await qAll<{ userId: string }>(`SELECT user_id AS "userId" FROM tier4_users WHERE guild_id = ? AND role = ?`, guildId, role);
  return rows.map(r => r.userId);
}

export async function getT3ProductionTotals(guildId: string): Promise<{ forger: number; welder: number }> {
  const forgerRow: any = await qOne(`SELECT COALESCE(SUM(pipes_produced), 0) AS s FROM tier3_users WHERE guild_id = ? AND role = 'forger'`, guildId);
  const welderRow: any = await qOne(`SELECT COALESCE(SUM(boxes_produced), 0) AS s FROM tier3_users WHERE guild_id = ? AND role = 'welder'`, guildId);
  return { forger: (forgerRow?.s || 0), welder: (welderRow?.s || 0) };
}

export async function getT4ProductionTotals(guildId: string): Promise<{
  lumberjack: number;
  smithy: number;
  wheelwright: number;
  boilermaker: number;
  coachbuilder: number;
  mechanic: number;
}> {
  const wood: any = await qOne(`SELECT COALESCE(SUM(wood_produced), 0) AS s FROM tier4_users WHERE guild_id = ? AND role = 'lumberjack'`, guildId);
  const steel: any = await qOne(`SELECT COALESCE(SUM(steel_produced), 0) AS s FROM tier4_users WHERE guild_id = ? AND role = 'smithy'`, guildId);
  const wheels: any = await qOne(`SELECT COALESCE(SUM(wheels_produced), 0) AS s FROM tier4_users WHERE guild_id = ? AND role = 'wheelwright'`, guildId);
  const boilers: any = await qOne(`SELECT COALESCE(SUM(boilers_produced), 0) AS s FROM tier4_users WHERE guild_id = ? AND role = 'boilermaker'`, guildId);
  const cabins: any = await qOne(`SELECT COALESCE(SUM(cabins_produced), 0) AS s FROM tier4_users WHERE guild_id = ? AND role = 'coachbuilder'`, guildId);
  const trains: any = await qOne(`SELECT COALESCE(SUM(trains_produced), 0) AS s FROM tier4_users WHERE guild_id = ? AND role = 'mechanic'`, guildId);
  return { lumberjack: wood?.s || 0, smithy: steel?.s || 0, wheelwright: wheels?.s || 0, boilermaker: boilers?.s || 0, coachbuilder: cabins?.s || 0, mechanic: trains?.s || 0 };
}

export async function getUserContributionByTier(guildId: string, tier: number, userId: string): Promise<number> {
  if (tier === 1) {
    const row: any = await qOne(`SELECT contributed_t1 AS c FROM tier1_users WHERE guild_id = ? AND user_id = ?`, guildId, userId);
    return row?.c ?? 0;
  } else if (tier === 2) {
    const row: any = await qOne(`SELECT contributed_t2 AS c FROM tier2_users WHERE guild_id = ? AND user_id = ?`, guildId, userId);
    return row?.c ?? 0;
  } else if (tier === 3) {
    const row: any = await qOne(`SELECT contributed_t3 AS c FROM tier3_users WHERE guild_id = ? AND user_id = ?`, guildId, userId);
    return row?.c ?? 0;
  } else {
    const row: any = await qOne(`SELECT contributed_t4 AS c FROM tier4_users WHERE guild_id = ? AND user_id = ?`, guildId, userId);
    return row?.c ?? 0;
  }
}

export async function getUserRankByTier(guildId: string, tier: number, userId: string): Promise<{ rank: number; contributed: number }> {
  const contrib = await getUserContributionByTier(guildId, tier, userId);
  let rank = 1;
  if (tier === 1) {
    const row: any = await qOne(`SELECT COUNT(1) AS higher FROM tier1_users WHERE guild_id = ? AND contributed_t1 > ?`, guildId, contrib);
    rank = 1 + (row?.higher ?? 0);
  } else if (tier === 2) {
    const row: any = await qOne(`SELECT COUNT(1) AS higher FROM tier2_users WHERE guild_id = ? AND contributed_t2 > ?`, guildId, contrib);
    rank = 1 + (row?.higher ?? 0);
  } else if (tier === 3) {
    const row: any = await qOne(`SELECT COUNT(1) AS higher FROM tier3_users WHERE guild_id = ? AND contributed_t3 > ?`, guildId, contrib);
    rank = 1 + (row?.higher ?? 0);
  } else {
    const row: any = await qOne(`SELECT COUNT(1) AS higher FROM tier4_users WHERE guild_id = ? AND contributed_t4 > ?`, guildId, contrib);
    rank = 1 + (row?.higher ?? 0);
  }
  return { rank, contributed: contrib };
}

export async function initState(): Promise<void> {
  await initDb();
}

export async function computeAndAwardMvp(guildId: string): Promise<string | null> {
  try {
    return await transaction(async client => {
      const t1total = (await qOneTx(client, `SELECT COALESCE(SUM(contributed_t1),0) AS s FROM tier1_users WHERE guild_id = ?`, guildId) as any)?.s || 0;
      const t2total = (await qOneTx(client, `SELECT COALESCE(SUM(contributed_t2),0) AS s FROM tier2_users WHERE guild_id = ?`, guildId) as any)?.s || 0;
      const t3total = (await qOneTx(client, `SELECT COALESCE(SUM(contributed_t3),0) AS s FROM tier3_users WHERE guild_id = ?`, guildId) as any)?.s || 0;
      const t4total = (await qOneTx(client, `SELECT COALESCE(SUM(contributed_t4),0) AS s FROM tier4_users WHERE guild_id = ?`, guildId) as any)?.s || 0;
      const grandTotal = t1total + t2total + t3total + t4total;
      if (grandTotal <= 0) return null;

      const t1 = await qAllTx(client, `SELECT user_id, contributed_t1 AS c FROM tier1_users WHERE guild_id = ?`, guildId) as Array<{ user_id: string; c: number }>;
      const t2 = await qAllTx(client, `SELECT user_id, contributed_t2 AS c FROM tier2_users WHERE guild_id = ?`, guildId) as Array<{ user_id: string; c: number }>;
      const t3 = await qAllTx(client, `SELECT user_id, contributed_t3 AS c FROM tier3_users WHERE guild_id = ?`, guildId) as Array<{ user_id: string; c: number }>;
      const t4 = await qAllTx(client, `SELECT user_id, contributed_t4 AS c FROM tier4_users WHERE guild_id = ?`, guildId) as Array<{ user_id: string; c: number }>;
      const m1 = new Map(t1.map(r => [r.user_id, r.c || 0]));
      const m2 = new Map(t2.map(r => [r.user_id, r.c || 0]));
      const m3 = new Map(t3.map(r => [r.user_id, r.c || 0]));
      const m4 = new Map(t4.map(r => [r.user_id, r.c || 0]));

      const users = await qAllTx(client, `SELECT user_id FROM users WHERE guild_id = ?`, guildId) as Array<{ user_id: string }>;
      let bestId: string | null = null;
      let bestShare = -1;
      let tieBreak: [number, number, number, number] = [0,0,0,0];
      for (const u of users) {
        const c1 = m1.get(u.user_id) || 0;
        const c2 = m2.get(u.user_id) || 0;
        const c3 = m3.get(u.user_id) || 0;
        const c4 = m4.get(u.user_id) || 0;
        const sum = c1 + c2 + c3 + c4;
        if (sum <= 0) continue;
        const share = sum / grandTotal;
        const tb: [number, number, number, number] = [c4, c3, c2, c1];
        const better = share > bestShare || (Math.abs(share - bestShare) < 1e-12 && (tb[0] > tieBreak[0] || (tb[0] === tieBreak[0] && (tb[1] > tieBreak[1] || (tb[1] === tieBreak[1] && (tb[2] > tieBreak[2] || (tb[2] === tieBreak[2] && tb[3] > tieBreak[3])))))));
        if (better) {
          bestShare = share;
          bestId = u.user_id;
          tieBreak = tb;
        }
      }
      if (bestId) {
        await qRunTx(client, `UPDATE users SET prestige_mvp_awards = COALESCE(prestige_mvp_awards,0) + 1 WHERE guild_id = ? AND user_id = ?`, guildId, bestId);
      }
      return bestId;
    });
  } catch (e) {
    console.error('computeAndAwardMvp failed:', e);
    return null;
  }
}

export async function getAllGuildIds(): Promise<string[]> {
  const rows = await qAll<{ id: string }>('SELECT id FROM guilds');
  return rows.map(r => r.id);
}

export async function disableAllWeldersPassive(guildId: string): Promise<number> {
  return transaction(async client => {
    const info = await qRunTx(client, `UPDATE tier3_users SET weld_enabled = 0 WHERE guild_id = ? AND role = 'welder' AND weld_enabled != 0`, guildId);
    return info.changes || 0;
  });
}

export async function disableT4ConsumersByRole(
  guildId: string,
  actor: 'lumberjack' | 'smithy' | 'wheelwright' | 'boilermaker' | 'coachbuilder' | 'mechanic'
): Promise<number> {
  return transaction(async client => {
    let changes = 0;
    if (actor === 'lumberjack') {
      changes += (await qRunTx(client, `UPDATE tier4_users SET wheel_enabled = 0 WHERE guild_id = ? AND role = 'wheelwright' AND wheel_enabled != 0`, guildId)).changes;
      changes += (await qRunTx(client, `UPDATE tier4_users SET coach_enabled = 0 WHERE guild_id = ? AND role = 'coachbuilder' AND coach_enabled != 0`, guildId)).changes;
    } else if (actor === 'smithy') {
      changes += (await qRunTx(client, `UPDATE tier4_users SET wheel_enabled = 0 WHERE guild_id = ? AND role = 'wheelwright' AND wheel_enabled != 0`, guildId)).changes;
      changes += (await qRunTx(client, `UPDATE tier4_users SET boiler_enabled = 0 WHERE guild_id = ? AND role = 'boilermaker' AND boiler_enabled != 0`, guildId)).changes;
    } else if (actor === 'wheelwright' || actor === 'boilermaker' || actor === 'coachbuilder') {
      changes += (await qRunTx(client, `UPDATE tier4_users SET mech_enabled = 0 WHERE guild_id = ? AND role = 'mechanic' AND mech_enabled != 0`, guildId)).changes;
    }
    return changes;
  });
}

export async function refreshAllGuilds(now: number = Date.now()): Promise<{ guildsProcessed: number; usersRefreshed: number; totalGained: number }> {
  const guildIds = await getAllGuildIds();
  let usersRefreshed = 0;
  let totalGained = 0;
  for (const gid of guildIds) {
    const r = await refreshGuildContributions(gid, undefined, now);
    usersRefreshed += r.usersRefreshed;
    totalGained += r.totalGained;
  }
  return { guildsProcessed: guildIds.length, usersRefreshed, totalGained };
}

export async function refreshGuildContributions(guildId: string, excludeUserId?: string, now: number = Date.now()): Promise<{ usersRefreshed: number; totalGained: number }> {
  return transaction(async client => {
    const guild = await loadGuildTx(client, guildId);
    const tier = guild.widgetTier || 1;
    const rows = await qAllTx(client, 'SELECT user_id FROM users WHERE guild_id = ?', guildId) as Array<{ user_id: string }>;
    let refreshed = 0;
    let total = 0;

    if (tier === 3) {
      const users: Array<{ id: string; user: User; delta: { pipes: number; boxesPotential: number } }> = [];
      for (const r of rows) {
        const uid = r.user_id;
        if (excludeUserId && uid === excludeUserId) continue;
        const u = await loadUserTx(client, guildId, uid);
        const delta = applyPassiveTicksT3(guild, u, now);
        users.push({ id: uid, user: u, delta: { pipes: Math.max(0, delta.pipes || 0), boxesPotential: Math.max(0, delta.boxesPotential || 0) } });
      }
      for (const rec of users) {
        const { user: u, delta } = rec;
        if (((u as any).role3 || null) === 'forger' && delta.pipes > 0) {
          (guild as any).inventory = (guild as any).inventory || { pipes: 0, boxes: 0 };
          (guild as any).inventory.pipes = ((guild as any).inventory.pipes || 0) + delta.pipes;
          (guild.totals as any).pipes = ((guild.totals as any).pipes || 0) + delta.pipes;
          (u as any).lifetimeContributed = (u as any).lifetimeContributed + delta.pipes;
          (u as any).contributedT3 = ((u as any).contributedT3 || 0) + delta.pipes;
          (u as any).pipesProduced = ((u as any).pipesProduced || 0) + delta.pipes;
        }
      }
      let totalBoxesPotential = 0;
      for (const rec of users) {
        const { user: u, delta } = rec;
        if (((u as any).role3 || null) === 'welder') totalBoxesPotential += delta.boxesPotential || 0;
      }
      const inv = (guild as any).inventory = (guild as any).inventory || { pipes: 0, boxes: 0 };
      const availableBoxes = (inv.pipes || 0) / T3_PIPE_PER_BOX;
      const scale = totalBoxesPotential > 0 ? Math.min(1, availableBoxes / totalBoxesPotential) : 0;
      let sumBoxesMade = 0;
      let sumPipesConsumed = 0;
      for (const rec of users) {
        const { user: u, delta } = rec;
        if (((u as any).role3 || null) !== 'welder') continue;
        const boxesMade = (delta.boxesPotential || 0) * scale;
        const consumed = boxesMade * T3_PIPE_PER_BOX;
        if (boxesMade > 0) {
          (u as any).lifetimeContributed = (u as any).lifetimeContributed + consumed;
          (u as any).contributedT3 = ((u as any).contributedT3 || 0) + consumed;
          (u as any).boxesProduced = ((u as any).boxesProduced || 0) + boxesMade;
        }
        sumBoxesMade += boxesMade;
        sumPipesConsumed += consumed;
      }
      if (sumBoxesMade > 0) {
        inv.pipes = (inv.pipes || 0) - sumPipesConsumed;
        inv.boxes = (inv.boxes || 0) + sumBoxesMade;
        (guild.totals as any).boxes = ((guild.totals as any).boxes || 0) + sumBoxesMade;
        total += sumBoxesMade;
      }
      for (const rec of users) {
        await saveUserTx(client, guildId, rec.id, rec.user);
        refreshed++;
      }
      if ((guild as any).widgetTier === 3) {
        const invBoxes = inv.boxes || 0;
        guild.tierProgress = Math.min(guild.tierGoal, invBoxes);
      }
    } else {
      for (const r of rows) {
        const uid = r.user_id;
        if (excludeUserId && uid === excludeUserId) continue;
        const u = await loadUserTx(client, guildId, uid);
        if (tier === 4) {
          const delta4 = applyPassiveTicksT4(guild, u, now);
          const res4 = applyTier4GuildFlows(guild, u, delta4);
          total += (res4.trainsMade || 0);
        } else {
          const gained = applyPassiveTicks(u, tier, now);
          if (gained > 0) {
            applyGuildProgress(guild, gained, tier);
            if (tier === 1) {
              (u as any).lifetimeContributed = (u as any).lifetimeContributed + gained;
              (u as any).contributedT1 = ((u as any).contributedT1 || 0) + gained;
            } else if (tier === 2) {
              (u as any).lifetimeContributed = (u as any).lifetimeContributed + gained;
              (u as any).contributedT2 = ((u as any).contributedT2 || 0) + gained;
            }
            total += gained;
          }
        }
        await saveUserTx(client, guildId, uid, u);
        refreshed++;
      }
    }
    await saveGuildTx(client, guild);
    return { usersRefreshed: refreshed, totalGained: total };
  });
}

export async function initializeTier2ForGuild(guildId: string): Promise<void> {
  await transaction(async client => {
    await qRunTx(client, `
      UPDATE tier2_users SET
        beams = 0,
        contributed_t2 = 0,
        pickaxe_level = 0,
        pick_click_power = 1,
        miners = 0,
        smelters = 0,
        foundries = 0,
        beam_mills = 0,
        arcane_forge = 0,
        rate_beams_per_sec = 0
      WHERE guild_id = ?
        AND beams = 0
        AND contributed_t2 = 0
    `, guildId);
  });
}

export async function getState(): Promise<{ guildCount: number; userCount: number }> {
  const guildCount = (await qOne<any>('SELECT COUNT(*) AS c FROM guilds'))?.c as number || 0;
  const userCount = (await qOne<any>('SELECT COUNT(*) AS c FROM users'))?.c as number || 0;
  return { guildCount, userCount };
}

export async function withGuildAndUser<T>(guildId: string, userId: string, mutator: (guild: GuildState, user: User) => T): Promise<T> {
  return transaction(async client => {
    const guild = await loadGuildTx(client, guildId);
    const user = await loadUserTx(client, guildId, userId);
    const res = mutator(guild, user);
    await saveGuildTx(client, guild);
    await saveUserTx(client, guildId, userId, user);
    return res;
  });
}

export async function resetAllUsersForPrestige(guildId: string): Promise<void> {
  await transaction(async client => {
    await qRunTx(client, `UPDATE users SET last_tick = ?, last_chop_at = 0, lifetime_contributed = 0 WHERE guild_id = ?`, Date.now(), guildId);
    await qRunTx(client, `UPDATE tier1_users SET 
      sticks = 0, axe_level = 0, click_power = 1, 
      lumberjacks = 0, foremen = 0, logging_camps = 0, sawmills = 0, arcane_grove = 0, 
      rate_sticks_per_sec = 0, contributed_t1 = 0 
      WHERE guild_id = ?`, guildId);
    await qRunTx(client, `UPDATE tier2_users SET 
      beams = 0, pickaxe_level = 0, pick_click_power = 1,
      miners = 0, smelters = 0, foundries = 0, beam_mills = 0, arcane_forge = 0,
      rate_beams_per_sec = 0, contributed_t2 = 0
      WHERE guild_id = ?`, guildId);
    await qRunTx(client, `UPDATE tier3_users SET 
      role = NULL,
      f1 = 0, f2 = 0, f3 = 0, f4 = 0, f5 = 0,
      w1 = 0, w2 = 0, w3 = 0, w4 = 0, w5 = 0,
      rate_pipes_per_sec = 0, rate_boxes_per_sec = 0, contributed_t3 = 0,
      weld_enabled = 1, pipes_produced = 0, boxes_produced = 0
      WHERE guild_id = ?`, guildId);
    await qRunTx(client, `UPDATE tier4_users SET 
      role = NULL,
      wh1 = 0, wh2 = 0, wh3 = 0, wh4 = 0, wh5 = 0,
      bl1 = 0, bl2 = 0, bl3 = 0, bl4 = 0, bl5 = 0,
      cb1 = 0, cb2 = 0, cb3 = 0, cb4 = 0, cb5 = 0,
      rate_wheels_per_sec = 0, rate_boilers_per_sec = 0, rate_cabins_per_sec = 0,
      contributed_t4 = 0, wheels_produced = 0, boilers_produced = 0, cabins_produced = 0
      WHERE guild_id = ?`, guildId);
  });
}

export function saveNow(): void {
  // No-op for Postgres (writes committed in transactions)
}
