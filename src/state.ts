import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { Guild, User, applyPassiveTicks, applyGuildProgress, applyPassiveTicksT3, applyTier3GuildFlows, applyPassiveTicksT4, applyTier4GuildFlows, T3_PIPE_PER_BOX } from './game.js';

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'guild-tycoon.db');

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

let db: any | null = null;

function initDb(): void {
  ensureDataDir();
  db = new Database(DB_FILE);
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');

  // Fresh, lean schema: base tables + per-tier tables (no destructive drop)
  db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS guilds (
      id TEXT PRIMARY KEY,
      created_at INTEGER NOT NULL,
      widget_tier INTEGER NOT NULL,
      prestige_points INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS tier1_guild (
      guild_id TEXT PRIMARY KEY,
      tier_progress REAL NOT NULL,
      tier_goal REAL NOT NULL,
      total_sticks REAL NOT NULL,
      inv_sticks REAL NOT NULL DEFAULT 0,
      axe_level INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (guild_id) REFERENCES guilds(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS tier2_guild (
      guild_id TEXT PRIMARY KEY,
      tier_progress REAL NOT NULL,
      tier_goal REAL NOT NULL,
      total_beams REAL NOT NULL,
      inv_beams REAL NOT NULL DEFAULT 0,
      pickaxe_level INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (guild_id) REFERENCES guilds(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS tier3_guild (
      guild_id TEXT PRIMARY KEY,
      tier_progress REAL NOT NULL,
      tier_goal REAL NOT NULL,
      inv_pipes REAL NOT NULL,
      inv_boxes REAL NOT NULL,
      total_pipes REAL NOT NULL,
      total_boxes REAL NOT NULL,
      forger_click_level INTEGER NOT NULL DEFAULT 0,
      welder_click_level INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (guild_id) REFERENCES guilds(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS users (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      last_tick INTEGER NOT NULL,
      last_chop_at INTEGER NOT NULL DEFAULT 0,
      lifetime_contributed REAL NOT NULL DEFAULT 0,
      prestige_mvp_awards INTEGER DEFAULT 0,
      PRIMARY KEY (guild_id, user_id),
      FOREIGN KEY (guild_id) REFERENCES guilds(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS tier4_guild (
      guild_id TEXT PRIMARY KEY,
      tier_progress REAL NOT NULL,
      tier_goal REAL NOT NULL,
      inv_wheels REAL NOT NULL,
      inv_boilers REAL NOT NULL,
      inv_cabins REAL NOT NULL,
      inv_trains REAL NOT NULL,
      total_wheels REAL NOT NULL,
      total_boilers REAL NOT NULL,
      total_cabins REAL NOT NULL,
      total_trains REAL NOT NULL,
      wheel_click_level INTEGER NOT NULL DEFAULT 0,
      boiler_click_level INTEGER NOT NULL DEFAULT 0,
      coach_click_level INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (guild_id) REFERENCES guilds(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS tier1_users (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      sticks REAL NOT NULL,
      axe_level INTEGER NOT NULL,
      click_power REAL NOT NULL,
      lumberjacks INTEGER NOT NULL,
      foremen INTEGER NOT NULL,
      logging_camps INTEGER NOT NULL,
      sawmills INTEGER NOT NULL,
      arcane_grove INTEGER NOT NULL,
      rate_sticks_per_sec REAL NOT NULL,
      contributed_t1 REAL NOT NULL DEFAULT 0,
      PRIMARY KEY (guild_id, user_id),
      FOREIGN KEY (guild_id, user_id) REFERENCES users(guild_id, user_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS tier2_users (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      beams REAL NOT NULL DEFAULT 0,
      pickaxe_level INTEGER NOT NULL DEFAULT 0,
      pick_click_power REAL NOT NULL DEFAULT 1,
      miners INTEGER NOT NULL DEFAULT 0,
      smelters INTEGER NOT NULL DEFAULT 0,
      foundries INTEGER NOT NULL DEFAULT 0,
      beam_mills INTEGER NOT NULL DEFAULT 0,
      arcane_forge INTEGER NOT NULL DEFAULT 0,
      rate_beams_per_sec REAL NOT NULL DEFAULT 0,
      contributed_t2 REAL NOT NULL DEFAULT 0,
      PRIMARY KEY (guild_id, user_id),
      FOREIGN KEY (guild_id, user_id) REFERENCES users(guild_id, user_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS tier3_users (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT,
      -- Forger automations
      f1 INTEGER NOT NULL DEFAULT 0,
      f2 INTEGER NOT NULL DEFAULT 0,
      f3 INTEGER NOT NULL DEFAULT 0,
      f4 INTEGER NOT NULL DEFAULT 0,
      f5 INTEGER NOT NULL DEFAULT 0,
      -- Welder automations
      w1 INTEGER NOT NULL DEFAULT 0,
      w2 INTEGER NOT NULL DEFAULT 0,
      w3 INTEGER NOT NULL DEFAULT 0,
      w4 INTEGER NOT NULL DEFAULT 0,
      w5 INTEGER NOT NULL DEFAULT 0,
      rate_pipes_per_sec REAL NOT NULL DEFAULT 0,
      rate_boxes_per_sec REAL NOT NULL DEFAULT 0,
      contributed_t3 REAL NOT NULL DEFAULT 0,
      weld_enabled INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY (guild_id, user_id),
      FOREIGN KEY (guild_id, user_id) REFERENCES users(guild_id, user_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS tier4_users (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT,
      -- Wheelwright automations
      wh1 INTEGER NOT NULL DEFAULT 0,
      wh2 INTEGER NOT NULL DEFAULT 0,
      wh3 INTEGER NOT NULL DEFAULT 0,
      wh4 INTEGER NOT NULL DEFAULT 0,
      wh5 INTEGER NOT NULL DEFAULT 0,
      -- Boilermaker automations
      bl1 INTEGER NOT NULL DEFAULT 0,
      bl2 INTEGER NOT NULL DEFAULT 0,
      bl3 INTEGER NOT NULL DEFAULT 0,
      bl4 INTEGER NOT NULL DEFAULT 0,
      bl5 INTEGER NOT NULL DEFAULT 0,
      -- Coachbuilder automations
      cb1 INTEGER NOT NULL DEFAULT 0,
      cb2 INTEGER NOT NULL DEFAULT 0,
      cb3 INTEGER NOT NULL DEFAULT 0,
      cb4 INTEGER NOT NULL DEFAULT 0,
      cb5 INTEGER NOT NULL DEFAULT 0,
      rate_wheels_per_sec REAL NOT NULL DEFAULT 0,
      rate_boilers_per_sec REAL NOT NULL DEFAULT 0,
      rate_cabins_per_sec REAL NOT NULL DEFAULT 0,
      contributed_t4 REAL NOT NULL DEFAULT 0,
      wheels_produced REAL NOT NULL DEFAULT 0,
      boilers_produced REAL NOT NULL DEFAULT 0,
      cabins_produced REAL NOT NULL DEFAULT 0,
      PRIMARY KEY (guild_id, user_id),
      FOREIGN KEY (guild_id, user_id) REFERENCES users(guild_id, user_id) ON DELETE CASCADE
    );
  `);

  // Run schema migrations once using user_version
  const userVersion = (db!.pragma('user_version', { simple: true }) as number) || 0;
  if (userVersion < 1) {
    // Ensure inventory columns exist for T1/T2 guilds
  const t1cols = db!.prepare(`PRAGMA table_info(tier1_guild)`).all() as Array<{ name: string }>;
  const t1have = new Set(t1cols.map(c => c.name));
  if (!t1have.has('inv_sticks')) db!.exec(`ALTER TABLE tier1_guild ADD COLUMN inv_sticks REAL NOT NULL DEFAULT 0`);
  if (!t1have.has('axe_level')) db!.exec(`ALTER TABLE tier1_guild ADD COLUMN axe_level INTEGER NOT NULL DEFAULT 0`);
  const t2cols = db!.prepare(`PRAGMA table_info(tier2_guild)`).all() as Array<{ name: string }>;
  const t2have = new Set(t2cols.map(c => c.name));
  if (!t2have.has('inv_beams')) db!.exec(`ALTER TABLE tier2_guild ADD COLUMN inv_beams REAL NOT NULL DEFAULT 0`);
  if (!t2have.has('pickaxe_level')) db!.exec(`ALTER TABLE tier2_guild ADD COLUMN pickaxe_level INTEGER NOT NULL DEFAULT 0`);
  
  // Ensure prestige_points column exists on guilds table
  const guildCols = db!.prepare(`PRAGMA table_info(guilds)`).all() as Array<{ name: string }>;
  const guildHave = new Set(guildCols.map(c => c.name));
  if (!guildHave.has('prestige_points')) db!.exec(`ALTER TABLE guilds ADD COLUMN prestige_points INTEGER NOT NULL DEFAULT 0`);

  // Ensure prestige_mvp_awards column exists on users table
  const userCols = db!.prepare(`PRAGMA table_info(users)`).all() as Array<{ name: string }>;
  const userHave = new Set(userCols.map(c => c.name));
  if (!userHave.has('prestige_mvp_awards')) db!.exec(`ALTER TABLE users ADD COLUMN prestige_mvp_awards INTEGER NOT NULL DEFAULT 0`);

  // Ensure tier3_users has all expected columns (add if missing)
  const t3cols = db!.prepare(`PRAGMA table_info(tier3_users)`).all() as Array<{ name: string }>;
  const have = new Set(t3cols.map(c => c.name));
  const add = (name: string, ddl: string) => { if (!have.has(name)) db!.exec(ddl); };
  add('f1', `ALTER TABLE tier3_users ADD COLUMN f1 INTEGER NOT NULL DEFAULT 0`);
  add('f2', `ALTER TABLE tier3_users ADD COLUMN f2 INTEGER NOT NULL DEFAULT 0`);
  add('f3', `ALTER TABLE tier3_users ADD COLUMN f3 INTEGER NOT NULL DEFAULT 0`);
  add('f4', `ALTER TABLE tier3_users ADD COLUMN f4 INTEGER NOT NULL DEFAULT 0`);
  add('f5', `ALTER TABLE tier3_users ADD COLUMN f5 INTEGER NOT NULL DEFAULT 0`);
  add('w1', `ALTER TABLE tier3_users ADD COLUMN w1 INTEGER NOT NULL DEFAULT 0`);
  add('w2', `ALTER TABLE tier3_users ADD COLUMN w2 INTEGER NOT NULL DEFAULT 0`);
  add('w3', `ALTER TABLE tier3_users ADD COLUMN w3 INTEGER NOT NULL DEFAULT 0`);
  add('w4', `ALTER TABLE tier3_users ADD COLUMN w4 INTEGER NOT NULL DEFAULT 0`);
  add('w5', `ALTER TABLE tier3_users ADD COLUMN w5 INTEGER NOT NULL DEFAULT 0`);
  add('weld_enabled', `ALTER TABLE tier3_users ADD COLUMN weld_enabled INTEGER NOT NULL DEFAULT 1`);
  // Produced counters used by /top at Tier 3
  add('pipes_produced', `ALTER TABLE tier3_users ADD COLUMN pipes_produced REAL NOT NULL DEFAULT 0`);
  add('boxes_produced', `ALTER TABLE tier3_users ADD COLUMN boxes_produced REAL NOT NULL DEFAULT 0`);

  // Ensure click-level columns exist on tier3_guild
  const t3gcols = db!.prepare(`PRAGMA table_info(tier3_guild)`).all() as Array<{ name: string }>;
  const haveG = new Set(t3gcols.map(c => c.name));
  if (!haveG.has('forger_click_level')) db!.exec(`ALTER TABLE tier3_guild ADD COLUMN forger_click_level INTEGER NOT NULL DEFAULT 0`);
  if (!haveG.has('welder_click_level')) db!.exec(`ALTER TABLE tier3_guild ADD COLUMN welder_click_level INTEGER NOT NULL DEFAULT 0`);

  // Ensure tier4 tables have expected columns
  const t4gcols = db!.prepare(`PRAGMA table_info(tier4_guild)`).all() as Array<{ name: string }>;
  const have4G = new Set(t4gcols.map(c => c.name));
  const add4G = (name: string, ddl: string) => { if (!have4G.has(name)) db!.exec(ddl); };
  add4G('inv_wheels', `ALTER TABLE tier4_guild ADD COLUMN inv_wheels REAL NOT NULL DEFAULT 0`);
  add4G('inv_boilers', `ALTER TABLE tier4_guild ADD COLUMN inv_boilers REAL NOT NULL DEFAULT 0`);
  add4G('inv_cabins', `ALTER TABLE tier4_guild ADD COLUMN inv_cabins REAL NOT NULL DEFAULT 0`);
  add4G('inv_trains', `ALTER TABLE tier4_guild ADD COLUMN inv_trains REAL NOT NULL DEFAULT 0`);
  add4G('inv_wood', `ALTER TABLE tier4_guild ADD COLUMN inv_wood REAL NOT NULL DEFAULT 0`);
  add4G('inv_steel', `ALTER TABLE tier4_guild ADD COLUMN inv_steel REAL NOT NULL DEFAULT 0`);
  add4G('total_wheels', `ALTER TABLE tier4_guild ADD COLUMN total_wheels REAL NOT NULL DEFAULT 0`);
  add4G('total_boilers', `ALTER TABLE tier4_guild ADD COLUMN total_boilers REAL NOT NULL DEFAULT 0`);
  add4G('total_cabins', `ALTER TABLE tier4_guild ADD COLUMN total_cabins REAL NOT NULL DEFAULT 0`);
  add4G('total_trains', `ALTER TABLE tier4_guild ADD COLUMN total_trains REAL NOT NULL DEFAULT 0`);
  add4G('total_wood', `ALTER TABLE tier4_guild ADD COLUMN total_wood REAL NOT NULL DEFAULT 0`);
  add4G('total_steel', `ALTER TABLE tier4_guild ADD COLUMN total_steel REAL NOT NULL DEFAULT 0`);
  add4G('wheel_click_level', `ALTER TABLE tier4_guild ADD COLUMN wheel_click_level INTEGER NOT NULL DEFAULT 0`);
  add4G('boiler_click_level', `ALTER TABLE tier4_guild ADD COLUMN boiler_click_level INTEGER NOT NULL DEFAULT 0`);
  add4G('coach_click_level', `ALTER TABLE tier4_guild ADD COLUMN coach_click_level INTEGER NOT NULL DEFAULT 0`);
  add4G('lumber_click_level', `ALTER TABLE tier4_guild ADD COLUMN lumber_click_level INTEGER NOT NULL DEFAULT 0`);
  add4G('smith_click_level', `ALTER TABLE tier4_guild ADD COLUMN smith_click_level INTEGER NOT NULL DEFAULT 0`);
  add4G('mech_click_level', `ALTER TABLE tier4_guild ADD COLUMN mech_click_level INTEGER NOT NULL DEFAULT 0`);

  // Create performance indexes for frequently queried columns
  db!.exec(`
    CREATE INDEX IF NOT EXISTS idx_users_lifetime_contributed ON users(guild_id, lifetime_contributed DESC);
    CREATE INDEX IF NOT EXISTS idx_tier1_contributed ON tier1_users(guild_id, contributed_t1 DESC);
    CREATE INDEX IF NOT EXISTS idx_tier2_contributed ON tier2_users(guild_id, contributed_t2 DESC);
    CREATE INDEX IF NOT EXISTS idx_tier3_contributed ON tier3_users(guild_id, contributed_t3 DESC);
    CREATE INDEX IF NOT EXISTS idx_tier4_contributed ON tier4_users(guild_id, contributed_t4 DESC);
    CREATE INDEX IF NOT EXISTS idx_tier3_role_contributed ON tier3_users(guild_id, role, contributed_t3 DESC);
    CREATE INDEX IF NOT EXISTS idx_tier3_role_produced_pipes ON tier3_users(guild_id, role, pipes_produced DESC);
    CREATE INDEX IF NOT EXISTS idx_tier3_role_produced_boxes ON tier3_users(guild_id, role, boxes_produced DESC);
  `);

    db!.pragma(`user_version = 1`);
  }

  // Additional migrations
  if (userVersion < 2) {
    // Ensure Tier 4 user table has all expected columns used by code paths
    const t4ucols = db!.prepare(`PRAGMA table_info(tier4_users)`).all() as Array<{ name: string }>;
    const have4U = new Set(t4ucols.map(c => c.name));
    const add4U = (name: string, ddl: string) => { if (!have4U.has(name)) db!.exec(ddl); };
    add4U('rate_wood_per_sec', `ALTER TABLE tier4_users ADD COLUMN rate_wood_per_sec REAL NOT NULL DEFAULT 0`);
    add4U('rate_steel_per_sec', `ALTER TABLE tier4_users ADD COLUMN rate_steel_per_sec REAL NOT NULL DEFAULT 0`);
    add4U('rate_trains_per_sec', `ALTER TABLE tier4_users ADD COLUMN rate_trains_per_sec REAL NOT NULL DEFAULT 0`);
    add4U('wood_produced', `ALTER TABLE tier4_users ADD COLUMN wood_produced REAL NOT NULL DEFAULT 0`);
    add4U('steel_produced', `ALTER TABLE tier4_users ADD COLUMN steel_produced REAL NOT NULL DEFAULT 0`);
    add4U('trains_produced', `ALTER TABLE tier4_users ADD COLUMN trains_produced REAL NOT NULL DEFAULT 0`);

    // Bump user_version to 2
    db!.pragma(`user_version = 2`);
  }

  if (userVersion < 3) {
    // Clamp any out-of-range shared click levels to [0,5]
    try {
      db!.exec(`
        UPDATE tier3_guild SET forger_click_level = CASE WHEN forger_click_level < 0 THEN 0 WHEN forger_click_level > 5 THEN 5 ELSE forger_click_level END;
        UPDATE tier3_guild SET welder_click_level  = CASE WHEN welder_click_level  < 0 THEN 0 WHEN welder_click_level  > 5 THEN 5 ELSE welder_click_level  END;
        UPDATE tier4_guild SET wheel_click_level   = CASE WHEN wheel_click_level   < 0 THEN 0 WHEN wheel_click_level   > 5 THEN 5 ELSE wheel_click_level   END;
        UPDATE tier4_guild SET boiler_click_level  = CASE WHEN boiler_click_level  < 0 THEN 0 WHEN boiler_click_level  > 5 THEN 5 ELSE boiler_click_level  END;
        UPDATE tier4_guild SET coach_click_level   = CASE WHEN coach_click_level   < 0 THEN 0 WHEN coach_click_level   > 5 THEN 5 ELSE coach_click_level   END;
        UPDATE tier4_guild SET lumber_click_level  = CASE WHEN lumber_click_level  < 0 THEN 0 WHEN lumber_click_level  > 5 THEN 5 ELSE lumber_click_level  END;
        UPDATE tier4_guild SET smith_click_level   = CASE WHEN smith_click_level   < 0 THEN 0 WHEN smith_click_level   > 5 THEN 5 ELSE smith_click_level   END;
        UPDATE tier4_guild SET mech_click_level    = CASE WHEN mech_click_level    < 0 THEN 0 WHEN mech_click_level    > 5 THEN 5 ELSE mech_click_level    END;
      `);
    } catch (e) {
      console.error('Migration clamp click levels failed:', e);
    }
    db!.pragma(`user_version = 3`);
  }
}

function ensureGuild(guildId: string): void {
  const row = db!.prepare('SELECT id FROM guilds WHERE id = ?').get(guildId);
  if (!row) {
    const g = defaultGuildState(guildId);
    db!.prepare(`INSERT INTO guilds (id, created_at, widget_tier, prestige_points) VALUES (?, ?, ?, 0)`)
      .run(g.id, g.createdAt, g.widgetTier);
    db!.prepare(`INSERT INTO tier1_guild (guild_id, tier_progress, tier_goal, total_sticks, inv_sticks, axe_level) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(g.id, 0, 1000000, 0, 0, 0);
    db!.prepare(`INSERT INTO tier2_guild (guild_id, tier_progress, tier_goal, total_beams, inv_beams, pickaxe_level) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(g.id, 0, 10000000, 0, 0, 0);
    db!.prepare(`INSERT INTO tier3_guild (guild_id, tier_progress, tier_goal, inv_pipes, inv_boxes, total_pipes, total_boxes, forger_click_level, welder_click_level) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0)`) 
      .run(g.id, 0, 20000000, 0, 0, 0, 0);
    db!.prepare(`INSERT INTO tier4_guild (guild_id, tier_progress, tier_goal, inv_wheels, inv_boilers, inv_cabins, inv_trains, total_wheels, total_boilers, total_cabins, total_trains, wheel_click_level, boiler_click_level, coach_click_level) VALUES (?, ?, ?, 0,0,0,0, 0,0,0,0, 0,0,0)`) 
      .run(g.id, 0, 100000000);
  }
}

function ensureUser(guildId: string, userId: string): void {
  const base = db!.prepare('SELECT user_id FROM users WHERE guild_id = ? AND user_id = ?').get(guildId, userId);
  if (!base) {
    const now = Date.now();
    db!.prepare(`INSERT INTO users (guild_id, user_id, last_tick, last_chop_at, lifetime_contributed, prestige_mvp_awards) VALUES (?, ?, ?, ?, 0, 0)`) 
      .run(guildId, userId, now, 0);
  }
  const t1 = db!.prepare('SELECT user_id FROM tier1_users WHERE guild_id = ? AND user_id = ?').get(guildId, userId);
  if (!t1) {
    db!.prepare(`INSERT INTO tier1_users (guild_id, user_id, sticks, axe_level, click_power, lumberjacks, foremen, logging_camps, sawmills, arcane_grove, rate_sticks_per_sec, contributed_t1) VALUES (?, ?, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0)`) 
      .run(guildId, userId);
  }
  const t2 = db!.prepare('SELECT user_id FROM tier2_users WHERE guild_id = ? AND user_id = ?').get(guildId, userId);
  if (!t2) {
    db!.prepare(`INSERT INTO tier2_users (guild_id, user_id, beams, pickaxe_level, pick_click_power, miners, smelters, foundries, beam_mills, arcane_forge, rate_beams_per_sec, contributed_t2) VALUES (?, ?, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0)`) 
      .run(guildId, userId);
  }
  const t3 = db!.prepare('SELECT user_id FROM tier3_users WHERE guild_id = ? AND user_id = ?').get(guildId, userId);
  if (!t3) {
    db!.prepare(`INSERT INTO tier3_users (guild_id, user_id, role, f1, f2, f3, f4, f5, w1, w2, w3, w4, w5, rate_pipes_per_sec, rate_boxes_per_sec, contributed_t3, weld_enabled) VALUES (?, ?, NULL, 0,0,0,0,0, 0,0,0,0,0, 0, 0, 0, 1)`) 
      .run(guildId, userId);
  }
  // Ensure tier4_users row exists
  const t4 = db!.prepare('SELECT user_id FROM tier4_users WHERE guild_id = ? AND user_id = ?').get(guildId, userId);
  if (!t4) {
    db!.prepare(`INSERT INTO tier4_users (guild_id, user_id, role, wh1, wh2, wh3, wh4, wh5, bl1, bl2, bl3, bl4, bl5, cb1, cb2, cb3, cb4, cb5, rate_wheels_per_sec, rate_boilers_per_sec, rate_cabins_per_sec, contributed_t4, wheels_produced, boilers_produced, cabins_produced) VALUES (?, ?, NULL, 0,0,0,0,0, 0,0,0,0,0, 0,0,0,0,0, 0, 0, 0, 0, 0, 0, 0)`)
      .run(guildId, userId);
  }
  // Schema upgrades are handled centrally during initDb migrations
}

function loadGuild(guildId: string): GuildState {
  ensureGuild(guildId);
  const row = db!.prepare(`SELECT id, created_at, widget_tier, prestige_points FROM guilds WHERE id = ?`).get(guildId) as any;
  const t1 = db!.prepare(`SELECT tier_progress, tier_goal, total_sticks, inv_sticks, axe_level FROM tier1_guild WHERE guild_id = ?`).get(guildId) as any;
  const t2 = db!.prepare(`SELECT tier_progress, tier_goal, total_beams, inv_beams, pickaxe_level FROM tier2_guild WHERE guild_id = ?`).get(guildId) as any;
  const t3 = db!.prepare(`SELECT tier_progress, tier_goal, inv_pipes, inv_boxes, total_pipes, total_boxes, forger_click_level, welder_click_level FROM tier3_guild WHERE guild_id = ?`).get(guildId) as any;
  const t4 = db!.prepare(`SELECT tier_progress, tier_goal, inv_wheels, inv_boilers, inv_cabins, inv_trains, inv_wood, inv_steel, total_wheels, total_boilers, total_cabins, total_trains, total_wood, total_steel, wheel_click_level, boiler_click_level, coach_click_level, lumber_click_level, smith_click_level, mech_click_level FROM tier4_guild WHERE guild_id = ?`).get(guildId) as any;
  const currentTier = row.widget_tier || 1;
  return {
    id: row.id,
    createdAt: row.created_at,
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

function loadUser(guildId: string, userId: string): User {
  ensureGuild(guildId);
  ensureUser(guildId, userId);
  const base = db!.prepare(`
    SELECT last_tick, last_chop_at, lifetime_contributed, prestige_mvp_awards
    FROM users WHERE guild_id = ? AND user_id = ?
  `).get(guildId, userId) as any;
  const t1 = db!.prepare(`
    SELECT sticks, axe_level, click_power, lumberjacks, foremen, logging_camps, sawmills, arcane_grove, rate_sticks_per_sec, contributed_t1
    FROM tier1_users WHERE guild_id = ? AND user_id = ?
  `).get(guildId, userId) as any;
  const t2 = db!.prepare(`
    SELECT beams, pickaxe_level, pick_click_power, miners, smelters, foundries, beam_mills, arcane_forge, rate_beams_per_sec, contributed_t2
    FROM tier2_users WHERE guild_id = ? AND user_id = ?
  `).get(guildId, userId) as any;
  const t3 = db!.prepare(`
    SELECT role, f1, f2, f3, f4, f5, w1, w2, w3, w4, w5, rate_pipes_per_sec, rate_boxes_per_sec, contributed_t3, weld_enabled, pipes_produced, boxes_produced
    FROM tier3_users WHERE guild_id = ? AND user_id = ?
  `).get(guildId, userId) as any;
  const t4 = db!.prepare(`
    SELECT role, wh1, wh2, wh3, wh4, wh5, bl1, bl2, bl3, bl4, bl5, cb1, cb2, cb3, cb4, cb5,
           lj1, lj2, lj3, lj4, lj5, sm1, sm2, sm3, sm4, sm5, ta1, ta2, ta3, ta4, ta5,
           rate_wheels_per_sec, rate_boilers_per_sec, rate_cabins_per_sec, rate_wood_per_sec, rate_steel_per_sec, rate_trains_per_sec,
           contributed_t4, wheels_produced, boilers_produced, cabins_produced, wood_produced, steel_produced, trains_produced
    FROM tier4_users WHERE guild_id = ? AND user_id = ?
  `).get(guildId, userId) as any;
  return {
    sticks: t1?.sticks || 0,
    lastTick: base?.last_tick || Date.now(),
    lastChopAt: base?.last_chop_at || 0,
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
    // Tier 4
    role4: t4?.role || null,
    automation4: { wh1: t4?.wh1 || 0, wh2: t4?.wh2 || 0, wh3: t4?.wh3 || 0, wh4: t4?.wh4 || 0, wh5: t4?.wh5 || 0, bl1: t4?.bl1 || 0, bl2: t4?.bl2 || 0, bl3: t4?.bl3 || 0, bl4: t4?.bl4 || 0, bl5: t4?.bl5 || 0, cb1: t4?.cb1 || 0, cb2: t4?.cb2 || 0, cb3: t4?.cb3 || 0, cb4: t4?.cb4 || 0, cb5: t4?.cb5 || 0, lj1: t4?.lj1 || 0, lj2: t4?.lj2 || 0, lj3: t4?.lj3 || 0, lj4: t4?.lj4 || 0, lj5: t4?.lj5 || 0, sm1: t4?.sm1 || 0, sm2: t4?.sm2 || 0, sm3: t4?.sm3 || 0, sm4: t4?.sm4 || 0, sm5: t4?.sm5 || 0, ta1: t4?.ta1 || 0, ta2: t4?.ta2 || 0, ta3: t4?.ta3 || 0, ta4: t4?.ta4 || 0, ta5: t4?.ta5 || 0 },
    contributedT4: t4?.contributed_t4 || 0,
    wheelsProduced: t4?.wheels_produced || 0,
    boilersProduced: t4?.boilers_produced || 0,
    cabinsProduced: t4?.cabins_produced || 0,
    woodProduced: t4?.wood_produced || 0,
    steelProduced: t4?.steel_produced || 0,
    trainsProduced: t4?.trains_produced || 0
  };
}

function saveGuild(g: GuildState): void {
  db!.prepare(`UPDATE guilds SET widget_tier = ?, prestige_points = ? WHERE id = ?`).run(g.widgetTier, (g as any).prestigePoints || 0, g.id);
  // Persist totals and inventory
  db!.prepare(`UPDATE tier1_guild SET total_sticks = ?, inv_sticks = ?, axe_level = ? WHERE guild_id = ?`).run(g.totals.sticks, (g as any).inventory?.sticks || 0, (g as any).axeLevel || 0, g.id);
  db!.prepare(`UPDATE tier2_guild SET total_beams = ?, inv_beams = ?, pickaxe_level = ? WHERE guild_id = ?`).run(g.totals.beams, (g as any).inventory?.beams || 0, (g as any).pickaxeLevel || 0, g.id);
  db!.prepare(`UPDATE tier3_guild SET total_pipes = ?, total_boxes = ?, inv_pipes = ?, inv_boxes = ?, forger_click_level = ?, welder_click_level = ? WHERE guild_id = ?`).run(
    (g as any).totals?.pipes || 0,
    (g as any).totals?.boxes || 0,
    (g as any).inventory?.pipes || 0,
    (g as any).inventory?.boxes || 0,
    (g as any).t3ForgerClickLevel || 0,
    (g as any).t3WelderClickLevel || 0,
    g.id
  );
  // Tier 4 guild persistent values
  db!.prepare(`UPDATE tier4_guild SET 
    total_wheels = ?, total_boilers = ?, total_cabins = ?, total_trains = ?, total_wood = ?, total_steel = ?,
    inv_wheels = ?, inv_boilers = ?, inv_cabins = ?, inv_trains = ?, inv_wood = ?, inv_steel = ?,
    wheel_click_level = ?, boiler_click_level = ?, coach_click_level = ?, lumber_click_level = ?, smith_click_level = ?, mech_click_level = ?
    WHERE guild_id = ?`).run(
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
    g.id
  );
  // Persist progress/goal only for active tier
  if ((g as any).widgetTier === 1) {
    db!.prepare(`UPDATE tier1_guild SET tier_progress = ?, tier_goal = ? WHERE guild_id = ?`).run(g.tierProgress, g.tierGoal, g.id);
  } else if ((g as any).widgetTier === 2) {
    db!.prepare(`UPDATE tier2_guild SET tier_progress = ?, tier_goal = ? WHERE guild_id = ?`).run(g.tierProgress, g.tierGoal, g.id);
  } else if ((g as any).widgetTier === 3) {
    db!.prepare(`UPDATE tier3_guild SET tier_progress = ?, tier_goal = ? WHERE guild_id = ?`).run(g.tierProgress, g.tierGoal, g.id);
  } else if ((g as any).widgetTier === 4) {
    db!.prepare(`UPDATE tier4_guild SET tier_progress = ?, tier_goal = ? WHERE guild_id = ?`).run(g.tierProgress, g.tierGoal, g.id);
  }
}

function saveUser(guildId: string, userId: string, u: User): void {
  db!.prepare(`UPDATE users SET last_tick = ?, last_chop_at = ?, lifetime_contributed = ?, prestige_mvp_awards = ? WHERE guild_id = ? AND user_id = ?`)
    .run(u.lastTick, u.lastChopAt || 0, u.lifetimeContributed || 0, (u as any).prestigeMvpAwards || 0, guildId, userId);
  db!.prepare(`
    UPDATE tier1_users SET sticks = ?, axe_level = ?, click_power = ?, lumberjacks = ?, foremen = ?, logging_camps = ?, sawmills = ?, arcane_grove = ?, rate_sticks_per_sec = ?, contributed_t1 = ?
    WHERE guild_id = ? AND user_id = ?
  `).run(
    u.sticks, u.axeLevel, u.clickPower, u.automation.lumberjacks, u.automation.foremen, u.automation.loggingCamps, u.automation.sawmills, u.automation.arcaneGrove,
    u.rates.sticksPerSec, (u as any).contributedT1 || 0, guildId, userId
  );
  db!.prepare(`
    UPDATE tier2_users SET beams = ?, pickaxe_level = ?, pick_click_power = ?, miners = ?, smelters = ?, foundries = ?, beam_mills = ?, arcane_forge = ?, rate_beams_per_sec = ?, contributed_t2 = ?
    WHERE guild_id = ? AND user_id = ?
  `).run(
    (u as any).beams || 0, (u as any).pickaxeLevel || 0, (u as any).pickClickPower || 1, (u as any).automation2?.miners || 0, (u as any).automation2?.smelters || 0, (u as any).automation2?.foundries || 0, (u as any).automation2?.beamMills || 0, (u as any).automation2?.arcaneForge || 0,
    (u as any).rates?.beamsPerSec || 0, (u as any).contributedT2 || 0, guildId, userId
  );
  db!.prepare(`
    UPDATE tier3_users SET role = ?, f1 = ?, f2 = ?, f3 = ?, f4 = ?, f5 = ?, w1 = ?, w2 = ?, w3 = ?, w4 = ?, w5 = ?, rate_pipes_per_sec = ?, rate_boxes_per_sec = ?, contributed_t3 = ?, weld_enabled = ?, pipes_produced = ?, boxes_produced = ?
    WHERE guild_id = ? AND user_id = ?
  `).run(
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
  // Tier 4 users
  db!.prepare(`
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
      wood_produced = ?, steel_produced = ?, trains_produced = ?
    WHERE guild_id = ? AND user_id = ?
  `).run(
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
    guildId,
    userId
  );
}

export function getTopContributors(guildId: string, limit: number = 10): Array<{ userId: string; lifetimeContributed: number }> {
  const stmt = db!.prepare(`
    SELECT user_id as userId, lifetime_contributed as lifetimeContributed
    FROM users
    WHERE guild_id = ?
    ORDER BY lifetime_contributed DESC
    LIMIT ?
  `);
  return stmt.all(guildId, limit) as any[];
}

export function getTopContributorsByTier(guildId: string, tier: number, limit: number = 10): Array<{ userId: string; contributed: number }> {
  if (tier === 1) {
    const stmt = db!.prepare(`
      SELECT user_id as userId, contributed_t1 as contributed
      FROM tier1_users
      WHERE guild_id = ?
      ORDER BY contributed DESC
      LIMIT ?
    `);
    return stmt.all(guildId, limit) as any[];
  } else if (tier === 2) {
    const stmt = db!.prepare(`
      SELECT user_id as userId, contributed_t2 as contributed
      FROM tier2_users
      WHERE guild_id = ?
      ORDER BY contributed DESC
      LIMIT ?
    `);
    return stmt.all(guildId, limit) as any[];
  } else if (tier === 3) {
    const stmt = db!.prepare(`
      SELECT user_id as userId, contributed_t3 as contributed
      FROM tier3_users
      WHERE guild_id = ?
      ORDER BY contributed DESC
      LIMIT ?
    `);
    return stmt.all(guildId, limit) as any[];
  } else {
    const stmt = db!.prepare(`
      SELECT user_id as userId, contributed_t4 as contributed
      FROM tier4_users
      WHERE guild_id = ?
      ORDER BY contributed DESC
      LIMIT ?
    `);
    return stmt.all(guildId, limit) as any[];
  }
}

export function getTopContributorsByRole(guildId: string, role: 'forger' | 'welder', limit: number = 10): Array<{ userId: string; contributed: number }> {
  const stmt = db!.prepare(`
    SELECT user_id as userId, contributed_t3 as contributed
    FROM tier3_users
    WHERE guild_id = ? AND role = ?
    ORDER BY contributed DESC
    LIMIT ?
  `);
  return stmt.all(guildId, role, limit) as any[];
}

export function getTopProducersByRole(guildId: string, role: 'forger' | 'welder', limit: number = 10): Array<{ userId: string; produced: number }> {
  const column = role === 'forger' ? 'pipes_produced' : 'boxes_produced';
  const stmt = db!.prepare(`
    SELECT user_id as userId, ${column} as produced
    FROM tier3_users
    WHERE guild_id = ? AND role = ?
    ORDER BY ${column} DESC
    LIMIT ?
  `);
  return stmt.all(guildId, role, limit) as any[];
}

// List users in a guild by Tier 3 role
export function getUsersByRoleT3(guildId: string, role: 'forger' | 'welder'): string[] {
  const rows = db!.prepare(`SELECT user_id AS userId FROM tier3_users WHERE guild_id = ? AND role = ?`).all(guildId, role) as Array<{ userId: string }>;
  return rows.map(r => r.userId);
}

// List users in a guild by Tier 4 role
export function getUsersByRoleT4(
  guildId: string,
  role: 'lumberjack' | 'smithy' | 'wheelwright' | 'boilermaker' | 'coachbuilder' | 'mechanic'
): string[] {
  const rows = db!.prepare(`SELECT user_id AS userId FROM tier4_users WHERE guild_id = ? AND role = ?`).all(guildId, role) as Array<{ userId: string }>;
  return rows.map(r => r.userId);
}

// Totals for Tier 3 production by role across the guild
export function getT3ProductionTotals(guildId: string): { forger: number; welder: number } {
  const forgerRow = db!.prepare(`SELECT COALESCE(SUM(pipes_produced), 0) AS s FROM tier3_users WHERE guild_id = ? AND role = 'forger'`).get(guildId) as any;
  const welderRow = db!.prepare(`SELECT COALESCE(SUM(boxes_produced), 0) AS s FROM tier3_users WHERE guild_id = ? AND role = 'welder'`).get(guildId) as any;
  return { forger: (forgerRow?.s || 0), welder: (welderRow?.s || 0) };
}

// Totals for Tier 4 production by role across the guild
export function getT4ProductionTotals(guildId: string): {
  lumberjack: number; // wood
  smithy: number;     // steel
  wheelwright: number; // wheels
  boilermaker: number; // boilers
  coachbuilder: number; // cabins
  mechanic: number;    // trains
} {
  const wood = db!.prepare(`SELECT COALESCE(SUM(wood_produced), 0) AS s FROM tier4_users WHERE guild_id = ? AND role = 'lumberjack'`).get(guildId) as any;
  const steel = db!.prepare(`SELECT COALESCE(SUM(steel_produced), 0) AS s FROM tier4_users WHERE guild_id = ? AND role = 'smithy'`).get(guildId) as any;
  const wheels = db!.prepare(`SELECT COALESCE(SUM(wheels_produced), 0) AS s FROM tier4_users WHERE guild_id = ? AND role = 'wheelwright'`).get(guildId) as any;
  const boilers = db!.prepare(`SELECT COALESCE(SUM(boilers_produced), 0) AS s FROM tier4_users WHERE guild_id = ? AND role = 'boilermaker'`).get(guildId) as any;
  const cabins = db!.prepare(`SELECT COALESCE(SUM(cabins_produced), 0) AS s FROM tier4_users WHERE guild_id = ? AND role = 'coachbuilder'`).get(guildId) as any;
  const trains = db!.prepare(`SELECT COALESCE(SUM(trains_produced), 0) AS s FROM tier4_users WHERE guild_id = ? AND role = 'mechanic'`).get(guildId) as any;
  return {
    lumberjack: (wood?.s || 0),
    smithy: (steel?.s || 0),
    wheelwright: (wheels?.s || 0),
    boilermaker: (boilers?.s || 0),
    coachbuilder: (cabins?.s || 0),
    mechanic: (trains?.s || 0)
  };
}

export function getUserContributionByTier(guildId: string, tier: number, userId: string): number {
  if (tier === 1) {
    const row = db!.prepare(`SELECT contributed_t1 AS c FROM tier1_users WHERE guild_id = ? AND user_id = ?`).get(guildId, userId) as any;
    return row?.c ?? 0;
  } else if (tier === 2) {
    const row = db!.prepare(`SELECT contributed_t2 AS c FROM tier2_users WHERE guild_id = ? AND user_id = ?`).get(guildId, userId) as any;
    return row?.c ?? 0;
  } else if (tier === 3) {
    const row = db!.prepare(`SELECT contributed_t3 AS c FROM tier3_users WHERE guild_id = ? AND user_id = ?`).get(guildId, userId) as any;
    return row?.c ?? 0;
  } else {
    const row = db!.prepare(`SELECT contributed_t4 AS c FROM tier4_users WHERE guild_id = ? AND user_id = ?`).get(guildId, userId) as any;
    return row?.c ?? 0;
  }
}

export function getUserRankByTier(guildId: string, tier: number, userId: string): { rank: number; contributed: number } {
  const contrib = getUserContributionByTier(guildId, tier, userId);
  let rank = 1;
  if (tier === 1) {
    const row = db!.prepare(`SELECT COUNT(1) AS higher FROM tier1_users WHERE guild_id = ? AND contributed_t1 > ?`).get(guildId, contrib) as any;
    rank = 1 + (row?.higher ?? 0);
  } else if (tier === 2) {
    const row = db!.prepare(`SELECT COUNT(1) AS higher FROM tier2_users WHERE guild_id = ? AND contributed_t2 > ?`).get(guildId, contrib) as any;
    rank = 1 + (row?.higher ?? 0);
  } else if (tier === 3) {
    const row = db!.prepare(`SELECT COUNT(1) AS higher FROM tier3_users WHERE guild_id = ? AND contributed_t3 > ?`).get(guildId, contrib) as any;
    rank = 1 + (row?.higher ?? 0);
  } else {
    const row = db!.prepare(`SELECT COUNT(1) AS higher FROM tier4_users WHERE guild_id = ? AND contributed_t4 > ?`).get(guildId, contrib) as any;
    rank = 1 + (row?.higher ?? 0);
  }
  return { rank, contributed: contrib };
}

export function initState(): void {
  initDb();
}

// Compute MVP (most valuable player) for a guild across all 4 tiers and award +1 MVP to that user.
// Fairness rule: winner is the user with the highest share of total contributions across all tiers,
// i.e., argmax_u (sum_t contrib_t[u]) / (sum_t total_t). Ties broken by higher Tier 4 contrib, then Tier 3, Tier 2, Tier 1.
export function computeAndAwardMvp(guildId: string): string | null {
  const fn = db!.transaction((gid: string) => {
    // Load totals per tier
    const t1total = (db!.prepare(`SELECT COALESCE(SUM(contributed_t1),0) AS s FROM tier1_users WHERE guild_id = ?`).get(gid) as any).s as number;
    const t2total = (db!.prepare(`SELECT COALESCE(SUM(contributed_t2),0) AS s FROM tier2_users WHERE guild_id = ?`).get(gid) as any).s as number;
    const t3total = (db!.prepare(`SELECT COALESCE(SUM(contributed_t3),0) AS s FROM tier3_users WHERE guild_id = ?`).get(gid) as any).s as number;
    const t4total = (db!.prepare(`SELECT COALESCE(SUM(contributed_t4),0) AS s FROM tier4_users WHERE guild_id = ?`).get(gid) as any).s as number;
    const grandTotal = t1total + t2total + t3total + t4total;
    if (grandTotal <= 0) return null as string | null;

    // Load per-user contributions per tier (one scan each)
    const t1 = db!.prepare(`SELECT user_id, contributed_t1 AS c FROM tier1_users WHERE guild_id = ?`).all(gid) as Array<{ user_id: string; c: number }>;
    const t2 = db!.prepare(`SELECT user_id, contributed_t2 AS c FROM tier2_users WHERE guild_id = ?`).all(gid) as Array<{ user_id: string; c: number }>;
    const t3 = db!.prepare(`SELECT user_id, contributed_t3 AS c FROM tier3_users WHERE guild_id = ?`).all(gid) as Array<{ user_id: string; c: number }>;
    const t4 = db!.prepare(`SELECT user_id, contributed_t4 AS c FROM tier4_users WHERE guild_id = ?`).all(gid) as Array<{ user_id: string; c: number }>;
    const m1 = new Map(t1.map(r => [r.user_id, r.c || 0]));
    const m2 = new Map(t2.map(r => [r.user_id, r.c || 0]));
    const m3 = new Map(t3.map(r => [r.user_id, r.c || 0]));
    const m4 = new Map(t4.map(r => [r.user_id, r.c || 0]));

    // Union of all users from users table
    const users = db!.prepare(`SELECT user_id FROM users WHERE guild_id = ?`).all(gid) as Array<{ user_id: string }>;
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
      db!.prepare(`UPDATE users SET prestige_mvp_awards = COALESCE(prestige_mvp_awards,0) + 1 WHERE guild_id = ? AND user_id = ?`).run(gid, bestId);
    }
    return bestId as string | null;
  });
  try {
    return fn(guildId);
  } catch (e) {
    console.error('computeAndAwardMvp failed:', e);
    return null;
  }
}

// Return all guild IDs known to the database
export function getAllGuildIds(): string[] {
  const rows = db!.prepare('SELECT id FROM guilds').all() as Array<{ id: string }>;
  return rows.map(r => r.id);
}

// Periodic background refresh across all guilds.
// Efficiently applies passive production since each user's last_tick.
export function refreshAllGuilds(now: number = Date.now()): { guildsProcessed: number; usersRefreshed: number; totalGained: number } {
  const guildIds = getAllGuildIds();
  let usersRefreshed = 0;
  let totalGained = 0;
  for (const gid of guildIds) {
    const r = refreshGuildContributions(gid, undefined, now);
    usersRefreshed += r.usersRefreshed;
    totalGained += r.totalGained;
  }
  return { guildsProcessed: guildIds.length, usersRefreshed, totalGained };
}

// Refresh passive gains and contribution counters for all users in a guild.
// Optionally exclude a specific user (e.g., the clicking user already ticked).
export function refreshGuildContributions(guildId: string, excludeUserId?: string, now: number = Date.now()): { usersRefreshed: number; totalGained: number } {
  const result = db!.transaction((gid: string, exclude: string | undefined, ts: number) => {
    const guild = loadGuild(gid);
    const tier = guild.widgetTier || 1;
    const rows = db!.prepare('SELECT user_id FROM users WHERE guild_id = ?').all(gid) as Array<{ user_id: string }>;
    let refreshed = 0;
    let total = 0;

    if (tier === 3) {
      // Fair, ingredient-constrained Tier 3 distribution
      const users: Array<{ id: string; user: User; delta: { pipes: number; boxesPotential: number } }> = [];
      for (const r of rows) {
        const uid = r.user_id;
        if (exclude && uid === exclude) continue;
        const u = loadUser(gid, uid);
        const delta = applyPassiveTicksT3(guild, u, ts);
        users.push({ id: uid, user: u, delta: { pipes: Math.max(0, delta.pipes || 0), boxesPotential: Math.max(0, delta.boxesPotential || 0) } });
      }
      // 1) Apply forging (adds to shared pipe inventory) and credit forgers
      for (const rec of users) {
        const { user: u, delta } = rec;
        if (((u as any).role3 || null) === 'forger' && delta.pipes > 0) {
          // Apply forging
          (guild as any).inventory = (guild as any).inventory || { pipes: 0, boxes: 0 };
          (guild as any).inventory.pipes = ((guild as any).inventory.pipes || 0) + delta.pipes;
          (guild.totals as any).pipes = ((guild.totals as any).pipes || 0) + delta.pipes;
          (u as any).lifetimeContributed = (u as any).lifetimeContributed + delta.pipes;
          (u as any).contributedT3 = ((u as any).contributedT3 || 0) + delta.pipes;
          (u as any).pipesProduced = ((u as any).pipesProduced || 0) + delta.pipes;
        }
      }
      // 2) Compute welder demand and fair allocation under pipe constraints
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
      // Apply shared inventory effects once
      if (sumBoxesMade > 0) {
        inv.pipes = (inv.pipes || 0) - sumPipesConsumed;
        inv.boxes = (inv.boxes || 0) + sumBoxesMade;
        (guild.totals as any).boxes = ((guild.totals as any).boxes || 0) + sumBoxesMade;
        total += sumBoxesMade;
      }
      // Recompute progress for Tier 3 from shared boxes inventory
      if ((guild as any).widgetTier === 3) {
        const invBoxes = inv.boxes || 0;
        guild.tierProgress = Math.min(guild.tierGoal, invBoxes);
      }
      // Persist all users once
      for (const rec of users) {
        saveUser(gid, rec.id, rec.user);
        refreshed++;
      }
    } else {
      // Tiers 1,2,4 original flow per user
      for (const r of rows) {
        const uid = r.user_id;
        if (exclude && uid === exclude) continue;
        const u = loadUser(gid, uid);
        if (tier === 4) {
          const delta4 = applyPassiveTicksT4(guild, u, ts);
          const res4 = applyTier4GuildFlows(guild, u, delta4);
          total += (res4.trainsMade || 0);
        } else {
          const gained = applyPassiveTicks(u, tier, ts);
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
        saveUser(gid, uid, u);
        refreshed++;
      }
    }
    saveGuild(guild);
    return { usersRefreshed: refreshed, totalGained: total };
  });
  return result(guildId, excludeUserId, now);
}

// Initialize Tier 2 fields for all users in a guild right after promotion.
// Does not touch Tier 1 fields. Safe to run multiple times.
export function initializeTier2ForGuild(guildId: string): void {
  const fn = db!.transaction((gid: string) => {
    db!.prepare(`
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
    `).run(gid);
  });
  fn(guildId);
}

// Minimal diagnostic snapshot if needed later (omitted for lean build)
export function getState(): { guildCount: number; userCount: number } {
  const guildCount = (db!.prepare('SELECT COUNT(*) AS c FROM guilds').get() as any).c as number;
  const userCount = (db!.prepare('SELECT COUNT(*) AS c FROM users').get() as any).c as number;
  return { guildCount, userCount };
}

export function withGuildAndUser<T>(guildId: string, userId: string, mutator: (guild: GuildState, user: User) => T): T {
  const fn = db!.transaction((gid: string, uid: string) => {
    const guild = loadGuild(gid);
    const user = loadUser(gid, uid);
    const res = mutator(guild, user);
    saveGuild(guild);
    saveUser(gid, uid, user);
    return res;
  });
  return fn(guildId, userId);
}

// Reset all users in a guild to default state for prestige
export function resetAllUsersForPrestige(guildId: string): void {
  const fn = db!.transaction((gid: string) => {
    try {
      // Reset base user data
      db!.prepare(`UPDATE users SET last_tick = ?, last_chop_at = 0, lifetime_contributed = 0 WHERE guild_id = ?`)
        .run(Date.now(), gid);
      
      // Reset tier 1 users
      db!.prepare(`UPDATE tier1_users SET 
        sticks = 0, axe_level = 0, click_power = 1, 
        lumberjacks = 0, foremen = 0, logging_camps = 0, sawmills = 0, arcane_grove = 0, 
        rate_sticks_per_sec = 0, contributed_t1 = 0 
        WHERE guild_id = ?`).run(gid);
      
      // Reset tier 2 users
      db!.prepare(`UPDATE tier2_users SET 
        beams = 0, pickaxe_level = 0, pick_click_power = 1,
        miners = 0, smelters = 0, foundries = 0, beam_mills = 0, arcane_forge = 0,
        rate_beams_per_sec = 0, contributed_t2 = 0
        WHERE guild_id = ?`).run(gid);
      
      // Reset tier 3 users
      db!.prepare(`UPDATE tier3_users SET 
        role = NULL,
        f1 = 0, f2 = 0, f3 = 0, f4 = 0, f5 = 0,
        w1 = 0, w2 = 0, w3 = 0, w4 = 0, w5 = 0,
        rate_pipes_per_sec = 0, rate_boxes_per_sec = 0, contributed_t3 = 0,
        weld_enabled = 1, pipes_produced = 0, boxes_produced = 0
        WHERE guild_id = ?`).run(gid);
      
      // Reset tier 4 users
      db!.prepare(`UPDATE tier4_users SET 
        role = NULL,
        wh1 = 0, wh2 = 0, wh3 = 0, wh4 = 0, wh5 = 0,
        bl1 = 0, bl2 = 0, bl3 = 0, bl4 = 0, bl5 = 0,
        cb1 = 0, cb2 = 0, cb3 = 0, cb4 = 0, cb5 = 0,
        rate_wheels_per_sec = 0, rate_boilers_per_sec = 0, rate_cabins_per_sec = 0,
        contributed_t4 = 0, wheels_produced = 0, boilers_produced = 0, cabins_produced = 0
        WHERE guild_id = ?`).run(gid);
      
      console.log(`Successfully reset all users for guild ${gid} prestige`);
    } catch (error) {
      console.error(`Failed to reset users for guild ${gid} prestige:`, error);
      throw error; // Will trigger transaction rollback
    }
  });
  
  try {
    fn(guildId);
  } catch (error) {
    console.error(`Transaction failed for prestige reset in guild ${guildId}:`, error);
    throw new Error(`Prestige reset failed for guild ${guildId}. Database may be in inconsistent state.`);
  }
}

// Batch load user data to fix N+1 query problems
export function loadUsersWithRoleData(guildId: string, userIds: string[], tier: number): Map<string, { user: User; role?: string; produced?: number }> {
  const userMap = new Map<string, { user: User; role?: string; produced?: number }>();
  
  if (userIds.length === 0) return userMap;
  
  const fn = db!.transaction((gid: string, uids: string[], t: number) => {
    const placeholders = uids.map(() => '?').join(',');
    
    // Batch load base user data
    const baseUsers = db!.prepare(`
      SELECT user_id, last_tick, last_chop_at, lifetime_contributed, prestige_mvp_awards
      FROM users WHERE guild_id = ? AND user_id IN (${placeholders})
    `).all(gid, ...uids) as any[];
    
    const baseMap = new Map(baseUsers.map(u => [u.user_id, u]));
    
    // Batch load tier-specific data
    let tierUsers: any[] = [];
    if (t === 1) {
      tierUsers = db!.prepare(`
        SELECT user_id, sticks, axe_level, click_power, lumberjacks, foremen, logging_camps, sawmills, arcane_grove, rate_sticks_per_sec, contributed_t1
        FROM tier1_users WHERE guild_id = ? AND user_id IN (${placeholders})
      `).all(gid, ...uids) as any[];
    } else if (t === 2) {
      tierUsers = db!.prepare(`
        SELECT user_id, beams, pickaxe_level, pick_click_power, miners, smelters, foundries, beam_mills, arcane_forge, rate_beams_per_sec, contributed_t2
        FROM tier2_users WHERE guild_id = ? AND user_id IN (${placeholders})
      `).all(gid, ...uids) as any[];
    } else if (t === 3) {
      tierUsers = db!.prepare(`
        SELECT user_id, role, f1, f2, f3, f4, f5, w1, w2, w3, w4, w5, rate_pipes_per_sec, rate_boxes_per_sec, contributed_t3, weld_enabled, pipes_produced, boxes_produced
        FROM tier3_users WHERE guild_id = ? AND user_id IN (${placeholders})
      `).all(gid, ...uids) as any[];
    } else if (t === 4) {
      tierUsers = db!.prepare(`
        SELECT user_id, role,
               wh1, wh2, wh3, wh4, wh5,
               bl1, bl2, bl3, bl4, bl5,
               cb1, cb2, cb3, cb4, cb5,
               lj1, lj2, lj3, lj4, lj5,
               sm1, sm2, sm3, sm4, sm5,
               ta1, ta2, ta3, ta4, ta5,
               rate_wheels_per_sec, rate_boilers_per_sec, rate_cabins_per_sec,
               rate_wood_per_sec, rate_steel_per_sec, rate_trains_per_sec,
               contributed_t4,
               wheels_produced, boilers_produced, cabins_produced,
               wood_produced, steel_produced, trains_produced
        FROM tier4_users WHERE guild_id = ? AND user_id IN (${placeholders})
      `).all(gid, ...uids) as any[];
    }
    
    const tierMap = new Map(tierUsers.map(u => [u.user_id, u]));
    
    // Construct full user objects
    for (const uid of uids) {
      const base = baseMap.get(uid);
      const tier = tierMap.get(uid);
      if (base && tier) {
        const user = constructUserFromRowData(base, tier, t);
        const role = tier.role || undefined;
        const produced = t === 3 ? (role === 'forger' ? tier.pipes_produced : tier.boxes_produced) || 0 : 0;
        userMap.set(uid, { user, role, produced });
      }
    }
    
    return userMap;
  });
  
  return fn(guildId, userIds, tier);
}

function constructUserFromRowData(base: any, tier: any, tierNum: number): User {
  const user: User = {
    sticks: tier.sticks || 0,
    lastTick: base.last_tick || Date.now(),
    lastChopAt: base.last_chop_at || 0,
    beams: tier.beams || 0,
    lifetimeContributed: base.lifetime_contributed || 0,
    prestigeMvpAwards: base.prestige_mvp_awards || 0,
    contributedT1: tier.contributed_t1 || 0,
    contributedT2: tier.contributed_t2 || 0,
    contributedT3: tier.contributed_t3 || 0,
    axeLevel: tier.axe_level || 0,
    clickPower: tier.click_power || 1,
    pickaxeLevel: tier.pickaxe_level || 0,
    pickClickPower: tier.pick_click_power || 1,
    automation: {
      lumberjacks: tier.lumberjacks || 0,
      foremen: tier.foremen || 0,
      loggingCamps: tier.logging_camps || 0,
      sawmills: tier.sawmills || 0,
      arcaneGrove: tier.arcane_grove || 0
    },
    automation2: {
      miners: tier.miners || 0,
      smelters: tier.smelters || 0,
      foundries: tier.foundries || 0,
      beamMills: tier.beam_mills || 0,
      arcaneForge: tier.arcane_forge || 0
    },
    automation3: { 
      forge1: tier.f1 || 0, forge2: tier.f2 || 0, forge3: tier.f3 || 0, forge4: tier.f4 || 0, forge5: tier.f5 || 0, 
      weld1: tier.w1 || 0, weld2: tier.w2 || 0, weld3: tier.w3 || 0, weld4: tier.w4 || 0, weld5: tier.w5 || 0 
    },
    role3: tier.role || null,
    rates: { 
      sticksPerSec: tier.rate_sticks_per_sec || 0, 
      beamsPerSec: tier.rate_beams_per_sec || 0, 
      pipesPerSec: tier.rate_pipes_per_sec || 0, 
      boxesPerSec: tier.rate_boxes_per_sec || 0, 
      wheelsPerSec: tier.rate_wheels_per_sec || 0, 
      boilersPerSec: tier.rate_boilers_per_sec || 0, 
      cabinsPerSec: tier.rate_cabins_per_sec || 0,
      woodPerSec: tier.rate_wood_per_sec || 0,
      steelPerSec: tier.rate_steel_per_sec || 0,
      trainsPerSec: tier.rate_trains_per_sec || 0 
    },
    weldPassiveEnabled: (tier.weld_enabled ?? 1) !== 0,
    pipesProduced: tier.pipes_produced || 0,
    boxesProduced: tier.boxes_produced || 0,
    // Tier 4
    role4: tier.role || null,
    automation4: { 
      wh1: tier.wh1 || 0, wh2: tier.wh2 || 0, wh3: tier.wh3 || 0, wh4: tier.wh4 || 0, wh5: tier.wh5 || 0, 
      bl1: tier.bl1 || 0, bl2: tier.bl2 || 0, bl3: tier.bl3 || 0, bl4: tier.bl4 || 0, bl5: tier.bl5 || 0, 
      cb1: tier.cb1 || 0, cb2: tier.cb2 || 0, cb3: tier.cb3 || 0, cb4: tier.cb4 || 0, cb5: tier.cb5 || 0,
      lj1: tier.lj1 || 0, lj2: tier.lj2 || 0, lj3: tier.lj3 || 0, lj4: tier.lj4 || 0, lj5: tier.lj5 || 0,
      sm1: tier.sm1 || 0, sm2: tier.sm2 || 0, sm3: tier.sm3 || 0, sm4: tier.sm4 || 0, sm5: tier.sm5 || 0,
      ta1: tier.ta1 || 0, ta2: tier.ta2 || 0, ta3: tier.ta3 || 0, ta4: tier.ta4 || 0, ta5: tier.ta5 || 0 
    },
    contributedT4: tier.contributed_t4 || 0,
    wheelsProduced: tier.wheels_produced || 0,
    boilersProduced: tier.boilers_produced || 0,
    cabinsProduced: tier.cabins_produced || 0,
    woodProduced: tier.wood_produced || 0,
    steelProduced: tier.steel_produced || 0,
    trainsProduced: tier.trains_produced || 0
  };
  
  return user;
}

export function saveNow(): void {
  // No-op: SQLite writes are immediate within transaction
}
