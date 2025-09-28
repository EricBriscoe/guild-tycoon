import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { PoolClient } from 'pg';
import { exec, qAll, qAllTx, qOne, qOneTx, qRun, qRunTx, transaction } from './db.js';
import { Guild, User, applyPassiveTicks, applyGuildProgress, applyPassiveTicksT3, applyTier3GuildFlows, applyPassiveTicksT4, applyTier4GuildFlows, T3_PIPE_PER_BOX, T4_WOOD_PER_WHEEL, T4_STEEL_PER_WHEEL, T4_STEEL_PER_BOILER, T4_WOOD_PER_CABIN, T4_WHEELS_PER_TRAIN, T4_BOILERS_PER_TRAIN, T4_CABINS_PER_TRAIN, AUTOMATION_T3_FORGE, AUTOMATION_T3_WELD, AUTOMATION_T4_LUMBERJACK, AUTOMATION_T4_SMITHY, AUTOMATION_T4_WHEEL, AUTOMATION_T4_BOILER, AUTOMATION_T4_COACH, AUTOMATION_T4_MECHANIC, AutomationType } from './game.js';
import { TIER_GOALS, computeTierGoal } from './config.js';

const DATA_DIR = path.join(process.cwd(), 'data');

interface GuildState extends Guild {
  id: string;
  createdAt: number;
  widgetTier: number;
}

function totalAutomationCost(def: AutomationType, owned: number): number {
  owned = Math.max(0, Math.floor(owned || 0));
  if (owned <= 0) return 0;
  let total = 0;
  let cost = def.baseCost;
  for (let i = 0; i < owned; i++) {
    total += Math.floor(cost);
    cost *= def.growth;
  }
  return total;
}

function sumAutomationCosts(pairs: Array<{ def: AutomationType; owned: number }>): number {
  let total = 0;
  for (const { def, owned } of pairs) {
    total += totalAutomationCost(def, owned);
  }
  return total;
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
    tierGoal: computeTierGoal(1, 0),
    totals: { sticks: 0, beams: 0 },
    prestigePoints: 0
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
    
    -- Track user purchase/spend events
    CREATE TABLE IF NOT EXISTS purchase_events (
      id BIGSERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      ts BIGINT NOT NULL,
      tier INTEGER NOT NULL,
      role TEXT,
      resource TEXT NOT NULL,
      amount DOUBLE PRECISION NOT NULL,
      kind TEXT NOT NULL,
      item_key TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_purchase_by_guild_ts ON purchase_events(guild_id, ts);
    CREATE INDEX IF NOT EXISTS idx_purchase_by_guild_role_ts ON purchase_events(guild_id, role, ts);
    CREATE INDEX IF NOT EXISTS idx_purchase_by_guild_res_ts ON purchase_events(guild_id, resource, ts);
  `);
}

async function ensureGuildTx(client: PoolClient, guildId: string): Promise<void> {
  const row = await qOneTx(client, 'SELECT id FROM guilds WHERE id = ?', guildId);
  if (!row) {
    const g = defaultGuildState(guildId);
    await qRunTx(client, `INSERT INTO guilds (id, created_at, widget_tier, prestige_points) VALUES (?, ?, ?, 0)`, g.id, g.createdAt, g.widgetTier);
    await qRunTx(client, `INSERT INTO tier1_guild (guild_id, tier_progress, tier_goal, total_sticks, inv_sticks, axe_level) VALUES (?, ?, ?, ?, ?, ?)`, g.id, 0, TIER_GOALS.TIER_1, 0, 0, 0);
    await qRunTx(client, `INSERT INTO tier2_guild (guild_id, tier_progress, tier_goal, total_beams, inv_beams, pickaxe_level) VALUES (?, ?, ?, ?, ?, ?)`, g.id, 0, TIER_GOALS.TIER_2, 0, 0, 0);
    await qRunTx(client, `INSERT INTO tier3_guild (guild_id, tier_progress, tier_goal, inv_pipes, inv_boxes, total_pipes, total_boxes, forger_click_level, welder_click_level) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0)`, g.id, 0, TIER_GOALS.TIER_3, 0, 0, 0, 0);
    await qRunTx(client, `INSERT INTO tier4_guild (guild_id, tier_progress, tier_goal, inv_wheels, inv_boilers, inv_cabins, inv_trains, inv_wood, inv_steel, total_wheels, total_boilers, total_cabins, total_trains, total_wood, total_steel, wheel_click_level, boiler_click_level, coach_click_level, lumber_click_level, smith_click_level, mech_click_level) VALUES (?, ?, ?, 0,0,0,0, 0,0, 0,0,0,0, 0,0, 0,0,0, 0,0,0)`, g.id, 0, TIER_GOALS.TIER_4);
  } else {
    // Backfill missing per-tier guild rows for existing guilds
    const t1 = await qOneTx(client, 'SELECT guild_id FROM tier1_guild WHERE guild_id = ?', guildId);
    if (!t1) {
      await qRunTx(client, `INSERT INTO tier1_guild (guild_id, tier_progress, tier_goal, total_sticks, inv_sticks, axe_level) VALUES (?, ?, ?, ?, ?, ?)`, guildId, 0, TIER_GOALS.TIER_1, 0, 0, 0);
    }
    const t2 = await qOneTx(client, 'SELECT guild_id FROM tier2_guild WHERE guild_id = ?', guildId);
    if (!t2) {
      await qRunTx(client, `INSERT INTO tier2_guild (guild_id, tier_progress, tier_goal, total_beams, inv_beams, pickaxe_level) VALUES (?, ?, ?, ?, ?, ?)`, guildId, 0, TIER_GOALS.TIER_2, 0, 0, 0);
    }
    const t3 = await qOneTx(client, 'SELECT guild_id FROM tier3_guild WHERE guild_id = ?', guildId);
    if (!t3) {
      await qRunTx(client, `INSERT INTO tier3_guild (guild_id, tier_progress, tier_goal, inv_pipes, inv_boxes, total_pipes, total_boxes, forger_click_level, welder_click_level) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0)`, guildId, 0, TIER_GOALS.TIER_3, 0, 0, 0, 0);
    }
    const t4 = await qOneTx(client, 'SELECT guild_id FROM tier4_guild WHERE guild_id = ?', guildId);
    if (!t4) {
      await qRunTx(client, `INSERT INTO tier4_guild (guild_id, tier_progress, tier_goal, inv_wheels, inv_boilers, inv_cabins, inv_trains, inv_wood, inv_steel, total_wheels, total_boilers, total_cabins, total_trains, total_wood, total_steel, wheel_click_level, boiler_click_level, coach_click_level, lumber_click_level, smith_click_level, mech_click_level) VALUES (?, ?, ?, 0,0,0,0, 0,0, 0,0,0,0, 0,0, 0,0,0, 0,0,0)`, guildId, 0, TIER_GOALS.TIER_4);
    }
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
    // Rely on table defaults for all fields
    await qRunTx(client, `INSERT INTO tier1_users (guild_id, user_id) VALUES (?, ?)`, guildId, userId);
  }
  const t2 = await qOneTx(client, 'SELECT user_id FROM tier2_users WHERE guild_id = ? AND user_id = ?', guildId, userId);
  if (!t2) {
    await qRunTx(client, `INSERT INTO tier2_users (guild_id, user_id) VALUES (?, ?)`, guildId, userId);
  }
  const t3 = await qOneTx(client, 'SELECT user_id FROM tier3_users WHERE guild_id = ? AND user_id = ?', guildId, userId);
  if (!t3) {
    await qRunTx(client, `INSERT INTO tier3_users (guild_id, user_id) VALUES (?, ?)`, guildId, userId);
  }
  const t4 = await qOneTx(client, 'SELECT user_id FROM tier4_users WHERE guild_id = ? AND user_id = ?', guildId, userId);
  if (!t4) {
    await qRunTx(client, `INSERT INTO tier4_users (guild_id, user_id) VALUES (?, ?)`, guildId, userId);
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
  const prestigePoints = Number(row.prestige_points) || 0;
  // Coerce BIGINT columns returned as strings into numbers where appropriate
  const createdAtNum: number = Number(row.created_at) || Date.now();
  const activeTierGoal = computeTierGoal(currentTier === 1 ? 1 : currentTier === 2 ? 2 : currentTier === 3 ? 3 : 4, prestigePoints);
  const activeTierProgress = currentTier === 1 ? (t1?.tier_progress || 0) : currentTier === 2 ? (t2?.tier_progress || 0) : currentTier === 3 ? (t3?.tier_progress || 0) : (t4?.tier_progress || 0);
  return {
    id: row.id,
    createdAt: createdAtNum,
    widgetTier: currentTier,
    tierProgress: Math.min(activeTierGoal, activeTierProgress),
    // Use config.ts base goals scaled by prestige as the source of truth
    tierGoal: activeTierGoal,
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
    prestigePoints
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

export interface Tier3ProductionRow {
  userId: string;
  role: 'forger' | 'welder' | null;
  pipesProduced: number;
  boxesProduced: number;
  invested: number;
  roi: number;
}

export async function getAllT3UsersProduction(guildId: string): Promise<Tier3ProductionRow[]> {
  const rows = await qAll<any>(
    `SELECT user_id AS "userId",
            role,
            COALESCE(pipes_produced, 0) AS "pipesProduced",
            COALESCE(boxes_produced, 0) AS "boxesProduced",
            COALESCE(f1, 0) AS f1,
            COALESCE(f2, 0) AS f2,
            COALESCE(f3, 0) AS f3,
            COALESCE(f4, 0) AS f4,
            COALESCE(f5, 0) AS f5,
            COALESCE(w1, 0) AS w1,
            COALESCE(w2, 0) AS w2,
            COALESCE(w3, 0) AS w3,
            COALESCE(w4, 0) AS w4,
            COALESCE(w5, 0) AS w5
       FROM tier3_users
       WHERE guild_id = ?`,
    guildId
  );
  return rows.map((r: any) => {
    const role = (r.role || null) as 'forger' | 'welder' | null;
    const produced = role === 'forger' ? (r.pipesProduced || 0) : role === 'welder' ? (r.boxesProduced || 0) : 0;
    const forgeInvestment = sumAutomationCosts([
      { def: AUTOMATION_T3_FORGE.forge1, owned: r.f1 || 0 },
      { def: AUTOMATION_T3_FORGE.forge2, owned: r.f2 || 0 },
      { def: AUTOMATION_T3_FORGE.forge3, owned: r.f3 || 0 },
      { def: AUTOMATION_T3_FORGE.forge4, owned: r.f4 || 0 },
      { def: AUTOMATION_T3_FORGE.forge5, owned: r.f5 || 0 },
    ]);
    const weldInvestment = sumAutomationCosts([
      { def: AUTOMATION_T3_WELD.weld1, owned: r.w1 || 0 },
      { def: AUTOMATION_T3_WELD.weld2, owned: r.w2 || 0 },
      { def: AUTOMATION_T3_WELD.weld3, owned: r.w3 || 0 },
      { def: AUTOMATION_T3_WELD.weld4, owned: r.w4 || 0 },
      { def: AUTOMATION_T3_WELD.weld5, owned: r.w5 || 0 },
    ]);
    const invested = role === 'forger' ? forgeInvestment : role === 'welder' ? weldInvestment : 0;
    const roi = produced > 0 ? produced / (invested > 0 ? invested : 1) : 0;
    return { ...r, role, invested, roi } as Tier3ProductionRow;
  });
}

export interface Tier4ProductionRow {
  userId: string;
  role: 'lumberjack' | 'smithy' | 'wheelwright' | 'boilermaker' | 'coachbuilder' | 'mechanic' | null;
  woodProduced: number;
  steelProduced: number;
  wheelsProduced: number;
  boilersProduced: number;
  cabinsProduced: number;
  trainsProduced: number;
  invested: number;
  roi: number;
}

export async function getAllT4UsersProduction(guildId: string): Promise<Tier4ProductionRow[]> {
  const rows = await qAll<any>(
    `SELECT user_id AS "userId",
            role,
            COALESCE(wood_produced, 0) AS "woodProduced",
            COALESCE(steel_produced, 0) AS "steelProduced",
            COALESCE(wheels_produced, 0) AS "wheelsProduced",
            COALESCE(boilers_produced, 0) AS "boilersProduced",
            COALESCE(cabins_produced, 0) AS "cabinsProduced",
            COALESCE(trains_produced, 0) AS "trainsProduced",
            COALESCE(lj1, 0) AS lj1,
            COALESCE(lj2, 0) AS lj2,
            COALESCE(lj3, 0) AS lj3,
            COALESCE(lj4, 0) AS lj4,
            COALESCE(lj5, 0) AS lj5,
            COALESCE(sm1, 0) AS sm1,
            COALESCE(sm2, 0) AS sm2,
            COALESCE(sm3, 0) AS sm3,
            COALESCE(sm4, 0) AS sm4,
            COALESCE(sm5, 0) AS sm5,
            COALESCE(wh1, 0) AS wh1,
            COALESCE(wh2, 0) AS wh2,
            COALESCE(wh3, 0) AS wh3,
            COALESCE(wh4, 0) AS wh4,
            COALESCE(wh5, 0) AS wh5,
            COALESCE(bl1, 0) AS bl1,
            COALESCE(bl2, 0) AS bl2,
            COALESCE(bl3, 0) AS bl3,
            COALESCE(bl4, 0) AS bl4,
            COALESCE(bl5, 0) AS bl5,
            COALESCE(cb1, 0) AS cb1,
            COALESCE(cb2, 0) AS cb2,
            COALESCE(cb3, 0) AS cb3,
            COALESCE(cb4, 0) AS cb4,
            COALESCE(cb5, 0) AS cb5,
            COALESCE(ta1, 0) AS ta1,
            COALESCE(ta2, 0) AS ta2,
            COALESCE(ta3, 0) AS ta3,
            COALESCE(ta4, 0) AS ta4,
            COALESCE(ta5, 0) AS ta5
       FROM tier4_users
       WHERE guild_id = ?`,
    guildId
  );
  return rows.map((r: any) => {
    const role = (r.role || null) as Tier4ProductionRow['role'];
    let produced = 0;
    if (role === 'lumberjack') produced = r.woodProduced || 0;
    else if (role === 'smithy') produced = r.steelProduced || 0;
    else if (role === 'wheelwright') produced = r.wheelsProduced || 0;
    else if (role === 'boilermaker') produced = r.boilersProduced || 0;
    else if (role === 'coachbuilder') produced = r.cabinsProduced || 0;
    else if (role === 'mechanic') produced = r.trainsProduced || 0;

    const invested = role === 'lumberjack' ? sumAutomationCosts([
      { def: AUTOMATION_T4_LUMBERJACK.lj1, owned: r.lj1 || 0 },
      { def: AUTOMATION_T4_LUMBERJACK.lj2, owned: r.lj2 || 0 },
      { def: AUTOMATION_T4_LUMBERJACK.lj3, owned: r.lj3 || 0 },
      { def: AUTOMATION_T4_LUMBERJACK.lj4, owned: r.lj4 || 0 },
      { def: AUTOMATION_T4_LUMBERJACK.lj5, owned: r.lj5 || 0 },
    ]) : role === 'smithy' ? sumAutomationCosts([
      { def: AUTOMATION_T4_SMITHY.sm1, owned: r.sm1 || 0 },
      { def: AUTOMATION_T4_SMITHY.sm2, owned: r.sm2 || 0 },
      { def: AUTOMATION_T4_SMITHY.sm3, owned: r.sm3 || 0 },
      { def: AUTOMATION_T4_SMITHY.sm4, owned: r.sm4 || 0 },
      { def: AUTOMATION_T4_SMITHY.sm5, owned: r.sm5 || 0 },
    ]) : role === 'wheelwright' ? sumAutomationCosts([
      { def: AUTOMATION_T4_WHEEL.wh1, owned: r.wh1 || 0 },
      { def: AUTOMATION_T4_WHEEL.wh2, owned: r.wh2 || 0 },
      { def: AUTOMATION_T4_WHEEL.wh3, owned: r.wh3 || 0 },
      { def: AUTOMATION_T4_WHEEL.wh4, owned: r.wh4 || 0 },
      { def: AUTOMATION_T4_WHEEL.wh5, owned: r.wh5 || 0 },
    ]) : role === 'boilermaker' ? sumAutomationCosts([
      { def: AUTOMATION_T4_BOILER.bl1, owned: r.bl1 || 0 },
      { def: AUTOMATION_T4_BOILER.bl2, owned: r.bl2 || 0 },
      { def: AUTOMATION_T4_BOILER.bl3, owned: r.bl3 || 0 },
      { def: AUTOMATION_T4_BOILER.bl4, owned: r.bl4 || 0 },
      { def: AUTOMATION_T4_BOILER.bl5, owned: r.bl5 || 0 },
    ]) : role === 'coachbuilder' ? sumAutomationCosts([
      { def: AUTOMATION_T4_COACH.cb1, owned: r.cb1 || 0 },
      { def: AUTOMATION_T4_COACH.cb2, owned: r.cb2 || 0 },
      { def: AUTOMATION_T4_COACH.cb3, owned: r.cb3 || 0 },
      { def: AUTOMATION_T4_COACH.cb4, owned: r.cb4 || 0 },
      { def: AUTOMATION_T4_COACH.cb5, owned: r.cb5 || 0 },
    ]) : role === 'mechanic' ? sumAutomationCosts([
      { def: AUTOMATION_T4_MECHANIC.ta1, owned: r.ta1 || 0 },
      { def: AUTOMATION_T4_MECHANIC.ta2, owned: r.ta2 || 0 },
      { def: AUTOMATION_T4_MECHANIC.ta3, owned: r.ta3 || 0 },
      { def: AUTOMATION_T4_MECHANIC.ta4, owned: r.ta4 || 0 },
      { def: AUTOMATION_T4_MECHANIC.ta5, owned: r.ta5 || 0 },
    ]) : 0;

    const roi = produced > 0 ? produced / (invested > 0 ? invested : 1) : 0;
    return { ...r, role, invested, roi } as Tier4ProductionRow;
  });
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
  if (tier === 3) {
    const rows = await getAllT3UsersProduction(guildId);
    const filtered = rows
      .map(r => {
        const role = r.role || null;
        const produced = role === 'forger' ? (r.pipesProduced || 0) : role === 'welder' ? (r.boxesProduced || 0) : 0;
        return { ...r, role, produced };
      })
      .filter(r => r.role && r.produced > 0);
    const userRow = filtered.find(r => r.userId === userId);
    const userRoi = userRow ? (rtoi(userRow.roi) || 0) : 0;
    const userProduced = userRow ? (userRow.produced || 0) : 0;
    const higher = filtered.filter(r => {
      const roi = rtoi(r.roi);
      if (roi > userRoi + 1e-9) return true;
      if (Math.abs(roi - userRoi) <= 1e-9) {
        const produced = r.produced || 0;
        return produced > userProduced + 1e-6;
      }
      return false;
    }).length;
    const rank = userRow ? higher + 1 : filtered.length + 1;
    return { rank, contributed: userRoi };
  }
  if (tier === 4) {
    const rows = await getAllT4UsersProduction(guildId);
    const filtered = rows
      .map(r => {
        const role = r.role || null;
        let produced = 0;
        if (role === 'lumberjack') produced = r.woodProduced || 0;
        else if (role === 'smithy') produced = r.steelProduced || 0;
        else if (role === 'wheelwright') produced = r.wheelsProduced || 0;
        else if (role === 'boilermaker') produced = r.boilersProduced || 0;
        else if (role === 'coachbuilder') produced = r.cabinsProduced || 0;
        else if (role === 'mechanic') produced = r.trainsProduced || 0;
        return { ...r, role, produced };
      })
      .filter(r => r.role && r.produced > 0);
    const userRow = filtered.find(r => r.userId === userId);
    const userRoi = userRow ? (rtoi(userRow.roi) || 0) : 0;
    const userProduced = userRow ? (userRow.produced || 0) : 0;
    const higher = filtered.filter(r => {
      const roi = rtoi(r.roi);
      if (roi > userRoi + 1e-9) return true;
      if (Math.abs(roi - userRoi) <= 1e-9) {
        const produced = r.produced || 0;
        return produced > userProduced + 1e-6;
      }
      return false;
    }).length;
    const rank = userRow ? higher + 1 : filtered.length + 1;
    return { rank, contributed: userRoi };
  }

  const contrib = await getUserContributionByTier(guildId, tier, userId);
  let rank = 1;
  if (tier === 1) {
    const row: any = await qOne(`SELECT COUNT(1) AS higher FROM tier1_users WHERE guild_id = ? AND contributed_t1 > ?`, guildId, contrib);
    rank = 1 + (row?.higher ?? 0);
  } else if (tier === 2) {
    const row: any = await qOne(`SELECT COUNT(1) AS higher FROM tier2_users WHERE guild_id = ? AND contributed_t2 > ?`, guildId, contrib);
    rank = 1 + (row?.higher ?? 0);
  }
  return { rank, contributed: contrib };
}

function rtoi(n: number | null | undefined): number {
  if (!isFinite(n as number) || !n) return 0;
  return Number(n);
}

export async function initState(): Promise<void> {
  await initDb();
}

export async function computeAndAwardMvp(guildId: string): Promise<string | null> {
  try {
    return await transaction(async client => {
      type RoiSummary = { sum: number; count: number; totalProduced: number };
      const roiByUser = new Map<string, RoiSummary>();

      const addRoi = (userId: string, roi: number, produced: number) => {
        if (!userId) return;
        if (!(roi > 0 || produced > 0)) return;
        const entry = roiByUser.get(userId) || { sum: 0, count: 0, totalProduced: 0 };
        entry.sum += roi;
        entry.count += 1;
        entry.totalProduced += produced;
        roiByUser.set(userId, entry);
      };

      const tier3 = await getAllT3UsersProduction(guildId);
      for (const row of tier3) {
        if (!row.role) continue;
        const produced = row.role === 'forger'
          ? (row.pipesProduced || 0)
          : row.role === 'welder'
            ? (row.boxesProduced || 0)
            : 0;
        addRoi(row.userId, row.roi, produced);
      }

      const tier4 = await getAllT4UsersProduction(guildId);
      for (const row of tier4) {
        if (!row.role) continue;
        addRoi(row.userId, row.roi, (() => {
          switch (row.role) {
            case 'lumberjack': return row.woodProduced || 0;
            case 'smithy': return row.steelProduced || 0;
            case 'wheelwright': return row.wheelsProduced || 0;
            case 'boilermaker': return row.boilersProduced || 0;
            case 'coachbuilder': return row.cabinsProduced || 0;
            case 'mechanic': return row.trainsProduced || 0;
            default: return 0;
          }
        })());
      }

      let bestId: string | null = null;
      let bestAvg = -1;
      let bestCount = 0;
      let bestProduced = 0;
      for (const [userId, info] of roiByUser.entries()) {
        if (info.count <= 0) continue;
        const avg = info.sum / info.count;
        if (avg > bestAvg + 1e-9) {
          bestAvg = avg;
          bestCount = info.count;
          bestProduced = info.totalProduced;
          bestId = userId;
        } else if (Math.abs(avg - bestAvg) <= 1e-9) {
          if (info.count > bestCount || (info.count === bestCount && info.totalProduced > bestProduced)) {
            bestAvg = avg;
            bestCount = info.count;
            bestProduced = info.totalProduced;
            bestId = userId;
          }
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
      if (tier === 4) {
        // Fair Tier 4 processing in phases to avoid one user draining inventory
        type T4D = ReturnType<typeof applyPassiveTicksT4>;
        type T4Rec = { id: string; user: User; role: string | null; delta: T4D };
        const recs: T4Rec[] = [];
        for (const r of rows) {
          const uid = r.user_id;
          if (excludeUserId && uid === excludeUserId) continue;
          const u = await loadUserTx(client, guildId, uid);
          const d = applyPassiveTicksT4(guild, u, now);
          recs.push({ id: uid, user: u, role: (u as any).role4 || null, delta: d });
        }
        // Phase 1: add all base materials
        for (const rec of recs) {
          const d: any = rec.delta || {};
          const only = { woodPotential: Math.max(0, d.woodPotential || 0), steelPotential: Math.max(0, d.steelPotential || 0), wheelsPotential: 0, boilersPotential: 0, cabinsPotential: 0, trainsPotential: 0 } as any;
          if (only.woodPotential > 0 || only.steelPotential > 0) {
            applyTier4GuildFlows(guild, rec.user, only);
          }
        }
        // Helper to scale and apply consumer potentials fairly
        const applyScaled = (key: 'wheelsPotential'|'boilersPotential'|'cabinsPotential'|'trainsPotential', available: number) => {
          const demand = recs.reduce((s, r) => s + Math.max(0, ((r.delta as any)[key] || 0)), 0);
          if (demand <= 0 || available <= 0) return;
          const scale = Math.min(1, available / demand);
          for (const rec of recs) {
            const pot = Math.max(0, ((rec.delta as any)[key] || 0)) * scale;
            if (pot > 0) {
              const d = { woodPotential: 0, steelPotential: 0, wheelsPotential: 0, boilersPotential: 0, cabinsPotential: 0, trainsPotential: 0 } as any;
              d[key] = pot;
              const res = applyTier4GuildFlows(guild, rec.user, d);
              if (key === 'trainsPotential') total += (res.trainsMade || 0);
            }
          }
        };
        // Phase 2: wheelwrights (limited by both materials)
        const invW = ((guild as any).inventory?.wood || 0);
        const invS = ((guild as any).inventory?.steel || 0);
        const canWheels = Math.max(0, Math.min(Math.floor(invW / T4_WOOD_PER_WHEEL), Math.floor(invS / T4_STEEL_PER_WHEEL)));
        applyScaled('wheelsPotential', canWheels);
        // Phase 3: boilermakers (limited by steel)
        const invS2 = ((guild as any).inventory?.steel || 0);
        const canBoilers = Math.max(0, Math.floor(invS2 / T4_STEEL_PER_BOILER));
        applyScaled('boilersPotential', canBoilers);
        // Phase 4: coachbuilders (limited by wood)
        const invW2 = ((guild as any).inventory?.wood || 0);
        const canCabins = Math.max(0, Math.floor(invW2 / T4_WOOD_PER_CABIN));
        applyScaled('cabinsPotential', canCabins);
        // Phase 5: mechanics (limited by components)
        const invWh = ((guild as any).inventory?.wheels || 0);
        const invBo = ((guild as any).inventory?.boilers || 0);
        const invCa = ((guild as any).inventory?.cabins || 0);
        const canTrains = Math.max(0, Math.min(
          Math.floor(invWh / T4_WHEELS_PER_TRAIN),
          Math.floor(invBo / T4_BOILERS_PER_TRAIN),
          Math.floor(invCa / T4_CABINS_PER_TRAIN)
        ));
        applyScaled('trainsPotential', canTrains);
        // Save users
        for (const rec of recs) {
          await saveUserTx(client, guildId, rec.id, rec.user);
          refreshed++;
        }
      } else {
        for (const r of rows) {
          const uid = r.user_id;
          if (excludeUserId && uid === excludeUserId) continue;
          const u = await loadUserTx(client, guildId, uid);
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
          await saveUserTx(client, guildId, uid, u);
          refreshed++;
        }
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
      -- Reset all automation counts across all Tier 4 roles
      wh1 = 0, wh2 = 0, wh3 = 0, wh4 = 0, wh5 = 0,
      bl1 = 0, bl2 = 0, bl3 = 0, bl4 = 0, bl5 = 0,
      cb1 = 0, cb2 = 0, cb3 = 0, cb4 = 0, cb5 = 0,
      lj1 = 0, lj2 = 0, lj3 = 0, lj4 = 0, lj5 = 0,
      sm1 = 0, sm2 = 0, sm3 = 0, sm4 = 0, sm5 = 0,
      ta1 = 0, ta2 = 0, ta3 = 0, ta4 = 0, ta5 = 0,
      -- Reset production rates for all Tier 4 resources and parts
      rate_wheels_per_sec = 0, rate_boilers_per_sec = 0, rate_cabins_per_sec = 0,
      rate_wood_per_sec = 0, rate_steel_per_sec = 0, rate_trains_per_sec = 0,
      -- Reset contribution and produced counters
      contributed_t4 = 0,
      wheels_produced = 0, boilers_produced = 0, cabins_produced = 0,
      wood_produced = 0, steel_produced = 0, trains_produced = 0,
      -- Re-enable all consumers by default
      wheel_enabled = 1, boiler_enabled = 1, coach_enabled = 1, mech_enabled = 1
      WHERE guild_id = ?`, guildId);
    await qRunTx(client, `DELETE FROM purchase_events WHERE guild_id = ?`, guildId);
  });
}

export function saveNow(): void {
  // No-op for Postgres (writes committed in transactions)
}

// Record a user purchase/spend event
export async function logPurchaseEvent(args: {
  guildId: string;
  userId: string;
  ts?: number;
  tier: number;
  role?: string | null;
  resource: string;
  amount: number;
  kind: 'automation' | 'click_upgrade' | 'tool' | 'other';
  itemKey?: string | null;
}): Promise<void> {
  const { guildId, userId, tier, role, resource, amount, kind } = args;
  const ts = Math.floor((args.ts ?? Date.now()));
  await qRun(
    `INSERT INTO purchase_events (guild_id, user_id, ts, tier, role, resource, amount, kind, item_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    guildId, userId, ts, tier|0, role || null, resource, amount || 0, kind, args.itemKey || null
  );
}

export interface PurchaseEvent { user_id: string; ts: number; amount: number; }

export async function getPurchaseEvents(
  guildId: string,
  opts: { tier?: number; role?: string | null; resource?: string; since?: number; until?: number }
): Promise<PurchaseEvent[]> {
  const role = opts.role || null;
  const resource = opts.resource || null;
  let since = Math.floor(opts.since ?? 0);
  let until = Math.floor(opts.until ?? Date.now());
  if (!Number.isFinite(since)) since = 0;
  if (!Number.isFinite(until)) until = Date.now();
  let sql = `SELECT user_id, ts, amount FROM purchase_events WHERE guild_id = ? AND ts BETWEEN ? AND ?`;
  const params: any[] = [guildId, since, until];
  if (typeof opts.tier === 'number') { sql += ` AND tier = ?`; params.push(opts.tier | 0); }
  if (role) { sql += ` AND role = ?`; params.push(role); }
  if (resource) { sql += ` AND resource = ?`; params.push(resource); }
  sql += ` ORDER BY ts ASC`;
  return await qAll(sql, ...params) as any;
}

export async function getEarliestPurchaseTs(
  guildId: string,
  opts: { tier?: number; role?: string | null; resource?: string }
): Promise<number | null> {
  const role = opts.role || null;
  const resource = opts.resource || null;
  let sql = `SELECT MIN(ts) AS m FROM purchase_events WHERE guild_id = ?`;
  const params: any[] = [guildId];
  if (typeof opts.tier === 'number') { sql += ` AND tier = ?`; params.push(opts.tier | 0); }
  if (role) { sql += ` AND role = ?`; params.push(role); }
  if (resource) { sql += ` AND resource = ?`; params.push(resource); }
  const row: any = await qOne(sql, ...params);
  const m = row?.m;
  return (m !== null && m !== undefined) ? Number(m) : null;
}
