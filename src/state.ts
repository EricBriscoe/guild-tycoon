import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { Guild, User, applyPassiveTicks, applyGuildProgress, applyPassiveTicksT3, applyTier3GuildFlows } from './game.js';

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
      widget_tier INTEGER NOT NULL
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
      PRIMARY KEY (guild_id, user_id),
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
  `);

  // Ensure inventory columns exist for T1/T2 guilds
  const t1cols = db!.prepare(`PRAGMA table_info(tier1_guild)`).all() as Array<{ name: string }>;
  const t1have = new Set(t1cols.map(c => c.name));
  if (!t1have.has('inv_sticks')) db!.exec(`ALTER TABLE tier1_guild ADD COLUMN inv_sticks REAL NOT NULL DEFAULT 0`);
  if (!t1have.has('axe_level')) db!.exec(`ALTER TABLE tier1_guild ADD COLUMN axe_level INTEGER NOT NULL DEFAULT 0`);
  const t2cols = db!.prepare(`PRAGMA table_info(tier2_guild)`).all() as Array<{ name: string }>;
  const t2have = new Set(t2cols.map(c => c.name));
  if (!t2have.has('inv_beams')) db!.exec(`ALTER TABLE tier2_guild ADD COLUMN inv_beams REAL NOT NULL DEFAULT 0`);
  if (!t2have.has('pickaxe_level')) db!.exec(`ALTER TABLE tier2_guild ADD COLUMN pickaxe_level INTEGER NOT NULL DEFAULT 0`);

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

  // Ensure click-level columns exist on tier3_guild
  const t3gcols = db!.prepare(`PRAGMA table_info(tier3_guild)`).all() as Array<{ name: string }>;
  const haveG = new Set(t3gcols.map(c => c.name));
  if (!haveG.has('forger_click_level')) db!.exec(`ALTER TABLE tier3_guild ADD COLUMN forger_click_level INTEGER NOT NULL DEFAULT 0`);
  if (!haveG.has('welder_click_level')) db!.exec(`ALTER TABLE tier3_guild ADD COLUMN welder_click_level INTEGER NOT NULL DEFAULT 0`);
}

function ensureGuild(guildId: string): void {
  const row = db!.prepare('SELECT id FROM guilds WHERE id = ?').get(guildId);
  if (!row) {
    const g = defaultGuildState(guildId);
    db!.prepare(`INSERT INTO guilds (id, created_at, widget_tier) VALUES (?, ?, ?)`)
      .run(g.id, g.createdAt, g.widgetTier);
    db!.prepare(`INSERT INTO tier1_guild (guild_id, tier_progress, tier_goal, total_sticks, inv_sticks, axe_level) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(g.id, 0, 1000000, 0, 0, 0);
    db!.prepare(`INSERT INTO tier2_guild (guild_id, tier_progress, tier_goal, total_beams, inv_beams, pickaxe_level) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(g.id, 0, 10000000, 0, 0, 0);
    db!.prepare(`INSERT INTO tier3_guild (guild_id, tier_progress, tier_goal, inv_pipes, inv_boxes, total_pipes, total_boxes, forger_click_level, welder_click_level) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0)`)
      .run(g.id, 0, 20000000, 0, 0, 0, 0);
  }
}

function ensureUser(guildId: string, userId: string): void {
  const base = db!.prepare('SELECT user_id FROM users WHERE guild_id = ? AND user_id = ?').get(guildId, userId);
  if (!base) {
    const now = Date.now();
    db!.prepare(`INSERT INTO users (guild_id, user_id, last_tick, last_chop_at, lifetime_contributed) VALUES (?, ?, ?, ?, 0)`) 
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
  // Ensure individual production tracking columns exist (run once per user check)
  const t3cols = db!.prepare(`PRAGMA table_info(tier3_users)`).all() as Array<{ name: string }>;
  const t3have = new Set(t3cols.map(c => c.name));
  if (!t3have.has('pipes_produced')) db!.exec(`ALTER TABLE tier3_users ADD COLUMN pipes_produced REAL NOT NULL DEFAULT 0`);
  if (!t3have.has('boxes_produced')) db!.exec(`ALTER TABLE tier3_users ADD COLUMN boxes_produced REAL NOT NULL DEFAULT 0`);
}

function loadGuild(guildId: string): GuildState {
  ensureGuild(guildId);
  const row = db!.prepare(`SELECT id, created_at, widget_tier FROM guilds WHERE id = ?`).get(guildId) as any;
  const t1 = db!.prepare(`SELECT tier_progress, tier_goal, total_sticks, inv_sticks, axe_level FROM tier1_guild WHERE guild_id = ?`).get(guildId) as any;
  const t2 = db!.prepare(`SELECT tier_progress, tier_goal, total_beams, inv_beams, pickaxe_level FROM tier2_guild WHERE guild_id = ?`).get(guildId) as any;
  const t3 = db!.prepare(`SELECT tier_progress, tier_goal, inv_pipes, inv_boxes, total_pipes, total_boxes, forger_click_level, welder_click_level FROM tier3_guild WHERE guild_id = ?`).get(guildId) as any;
  const currentTier = row.widget_tier || 1;
  return {
    id: row.id,
    createdAt: row.created_at,
    widgetTier: currentTier,
    tierProgress: currentTier === 1 ? (t1?.tier_progress || 0) : currentTier === 2 ? (t2?.tier_progress || 0) : (t3?.tier_progress || 0),
    tierGoal: currentTier === 1 ? (t1?.tier_goal || 1000000) : currentTier === 2 ? (t2?.tier_goal || 10000000) : (t3?.tier_goal || 20000000),
    totals: { sticks: t1?.total_sticks || 0, beams: t2?.total_beams || 0, pipes: t3?.total_pipes || 0, boxes: t3?.total_boxes || 0 },
    inventory: { sticks: t1?.inv_sticks || 0, beams: t2?.inv_beams || 0, pipes: t3?.inv_pipes || 0, boxes: t3?.inv_boxes || 0 },
    axeLevel: t1?.axe_level || 0,
    pickaxeLevel: t2?.pickaxe_level || 0,
    t3ForgerClickLevel: t3?.forger_click_level || 0,
    t3WelderClickLevel: t3?.welder_click_level || 0
  };
}

function loadUser(guildId: string, userId: string): User {
  ensureGuild(guildId);
  ensureUser(guildId, userId);
  const base = db!.prepare(`
    SELECT last_tick, last_chop_at, lifetime_contributed
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
  return {
    sticks: t1?.sticks || 0,
    lastTick: base?.last_tick || Date.now(),
    lastChopAt: base?.last_chop_at || 0,
    beams: t2?.beams || 0,
    lifetimeContributed: base?.lifetime_contributed || 0,
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
    rates: { sticksPerSec: t1?.rate_sticks_per_sec || 0, beamsPerSec: t2?.rate_beams_per_sec || 0, pipesPerSec: t3?.rate_pipes_per_sec || 0, boxesPerSec: t3?.rate_boxes_per_sec || 0 },
    weldPassiveEnabled: (t3?.weld_enabled ?? 1) !== 0,
    pipesProduced: t3?.pipes_produced || 0,
    boxesProduced: t3?.boxes_produced || 0
  };
}

function saveGuild(g: GuildState): void {
  db!.prepare(`UPDATE guilds SET widget_tier = ? WHERE id = ?`).run(g.widgetTier, g.id);
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
  // Persist progress/goal only for active tier
  if ((g as any).widgetTier === 1) {
    db!.prepare(`UPDATE tier1_guild SET tier_progress = ?, tier_goal = ? WHERE guild_id = ?`).run(g.tierProgress, g.tierGoal, g.id);
  } else if ((g as any).widgetTier === 2) {
    db!.prepare(`UPDATE tier2_guild SET tier_progress = ?, tier_goal = ? WHERE guild_id = ?`).run(g.tierProgress, g.tierGoal, g.id);
  } else if ((g as any).widgetTier === 3) {
    db!.prepare(`UPDATE tier3_guild SET tier_progress = ?, tier_goal = ? WHERE guild_id = ?`).run(g.tierProgress, g.tierGoal, g.id);
  }
}

function saveUser(guildId: string, userId: string, u: User): void {
  db!.prepare(`UPDATE users SET last_tick = ?, last_chop_at = ?, lifetime_contributed = ? WHERE guild_id = ? AND user_id = ?`)
    .run(u.lastTick, u.lastChopAt || 0, u.lifetimeContributed || 0, guildId, userId);
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
  } else {
    const stmt = db!.prepare(`
      SELECT user_id as userId, contributed_t3 as contributed
      FROM tier3_users
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

export function getUserContributionByTier(guildId: string, tier: number, userId: string): number {
  if (tier === 1) {
    const row = db!.prepare(`SELECT contributed_t1 AS c FROM tier1_users WHERE guild_id = ? AND user_id = ?`).get(guildId, userId) as any;
    return row?.c ?? 0;
  } else if (tier === 2) {
    const row = db!.prepare(`SELECT contributed_t2 AS c FROM tier2_users WHERE guild_id = ? AND user_id = ?`).get(guildId, userId) as any;
    return row?.c ?? 0;
  } else {
    const row = db!.prepare(`SELECT contributed_t3 AS c FROM tier3_users WHERE guild_id = ? AND user_id = ?`).get(guildId, userId) as any;
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
  } else {
    const row = db!.prepare(`SELECT COUNT(1) AS higher FROM tier3_users WHERE guild_id = ? AND contributed_t3 > ?`).get(guildId, contrib) as any;
    rank = 1 + (row?.higher ?? 0);
  }
  return { rank, contributed: contrib };
}

export function initState(): void {
  initDb();
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
    for (const r of rows) {
      const uid = r.user_id;
      if (exclude && uid === exclude) continue;
      const u = loadUser(gid, uid);
      if (tier === 3) {
        const delta = applyPassiveTicksT3(guild, u, ts);
        const res = applyTier3GuildFlows(guild, u, delta);
        total += (res.boxesMade || 0); // count boxes toward overall tick total
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

export function saveNow(): void {
  // No-op: SQLite writes are immediate within transaction
}
