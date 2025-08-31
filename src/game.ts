// Core game math and metadata for Tier 1 (sticks)
import { GAME_TIMING, TIER_3_RECIPES, TIER_4_RECIPES } from './config.js';

export interface Axe {
  key: string;
  name: string;
  level: number;
  clickPower: number;
  cost: number;
}

export interface AutomationType {
  key: string;
  name: string;
  baseRate: number;
  baseCost: number;
  growth: number;
}

export interface Automation {
  lumberjacks: number;
  foremen: number;
  loggingCamps: number;
  sawmills: number;
  arcaneGrove: number;
}

// Tier 2
export interface Pickaxe {
  key: string;
  name: string;
  level: number;
  clickPower: number;
  cost: number;
}

export interface MiningAutomation {
  miners: number;
  smelters: number;
  foundries: number;
  beamMills: number;
  arcaneForge: number;
}

export interface User {
  sticks: number;
  axeLevel: number;
  clickPower: number;
  automation: Automation;
  // Tier 2 state
  beams: number;
  pickaxeLevel: number;
  pickClickPower: number;
  automation2: MiningAutomation;
  rates: {
    sticksPerSec: number;
    beamsPerSec: number;
    pipesPerSec?: number;
    boxesPerSec?: number;
    woodPerSec?: number;
    steelPerSec?: number;
    wheelsPerSec?: number;
    boilersPerSec?: number;
    cabinsPerSec?: number;
    trainsPerSec?: number;
  };
  lastTick: number;
  lastChopAt: number; // timestamp ms for manual chop cooldown
  lifetimeContributed: number; // total contributed to guild
  contributedT1?: number; // per-tier contributions
  contributedT2?: number;
  // Tier 3 state
  role3?: 'forger' | 'welder' | null;
  automation3?: {
    // Forgers
    forge1?: number; // Pipe Foundry
    forge2?: number; // Alloy Smelter
    forge3?: number; // Extrusion Press
    forge4?: number; // Annealing Oven
    forge5?: number; // Coating Line
    // Welders
    weld1?: number; // Welding Rig
    weld2?: number; // Assembly Jig
    weld3?: number; // Robotic Welder
    weld4?: number; // Bracing Station
    weld5?: number; // Finishing Line
  };
  contributedT3?: number;
  // Tier 3: welder passive toggle
  weldPassiveEnabled?: boolean;
  // Tier 3: individual production tracking
  pipesProduced?: number;
    boxesProduced?: number;
  // Tier 4 state
  role4?: 'wheelwright' | 'boilermaker' | 'coachbuilder' | 'mechanic' | 'smithy' | 'lumberjack' | null;
  automation4?: {
    // Wheelwright automations
    wh1?: number; wh2?: number; wh3?: number; wh4?: number; wh5?: number;
    // Boilermaker automations
    bl1?: number; bl2?: number; bl3?: number; bl4?: number; bl5?: number;
    // Coachbuilder automations
    cb1?: number; cb2?: number; cb3?: number; cb4?: number; cb5?: number;
    // Train Assembler automations
    ta1?: number; ta2?: number; ta3?: number; ta4?: number; ta5?: number;
    // Smithy automations
    sm1?: number; sm2?: number; sm3?: number; sm4?: number; sm5?: number;
    // Lumberjack automations
    lj1?: number; lj2?: number; lj3?: number; lj4?: number; lj5?: number;
  };
  prestigeMvpAwards?: number;
  contributedT4?: number;
  wheelsProduced?: number;
  boilersProduced?: number;
  cabinsProduced?: number;
  woodProduced?: number;
  steelProduced?: number;
  trainsProduced?: number;
}

export interface Guild {
  totals: {
    sticks: number;
    beams: number;
    pipes?: number;
    boxes?: number;
    wood?: number;
    steel?: number;
    wheels?: number;
    boilers?: number;
    cabins?: number;
    trains?: number;
  };
  // Shared Tier 3+ inventory
  inventory?: {
    sticks?: number;
    beams?: number;
    pipes: number;
    boxes: number;
    wood?: number;
    steel?: number;
    wheels?: number;
    boilers?: number;
    cabins?: number;
    trains?: number;
  };
  tierProgress: number;
  tierGoal: number;
  // 1 = Sticks, 2 = Iron Beams
  widgetTier?: number;
  // Shared tool levels per tier
  axeLevel?: number;
  pickaxeLevel?: number;
  // Tier 3 shared click upgrades per role
  t3ForgerClickLevel?: number;
  t3WelderClickLevel?: number;
  // Tier 4 shared click upgrades per role
  t4LumberjackClickLevel?: number;
  t4SmithyClickLevel?: number;
  t4WheelwrightClickLevel?: number;
  t4BoilermakerClickLevel?: number;
  t4CoachbuilderClickLevel?: number;
  t4MechanicClickLevel?: number;
  // Prestige system
  prestigePoints?: number;
}

// Typed role helpers
export type Tier3Role = 'forger' | 'welder' | null;
export type Tier4Role = 'lumberjack' | 'smithy' | 'wheelwright' | 'boilermaker' | 'coachbuilder' | 'mechanic' | null;

export function getRole3(user: User): Tier3Role {
  return ((user as any).role3 || null) as Tier3Role;
}
export function getRole4(user: User): Tier4Role {
  return ((user as any).role4 || null) as Tier4Role;
}

// Inventory accessor
export function getGuildInventory(guild: Guild): {
  sticks: number; beams: number; pipes: number; boxes: number; wood: number; steel: number; wheels: number; boilers: number; cabins: number; trains: number;
} {
  const inv = ((guild as any).inventory ||= { sticks: 0, beams: 0, pipes: 0, boxes: 0, wood: 0, steel: 0, wheels: 0, boilers: 0, cabins: 0, trains: 0 });
  inv.sticks ||= 0; inv.beams ||= 0; inv.pipes ||= 0; inv.boxes ||= 0; inv.wood ||= 0; inv.steel ||= 0; inv.wheels ||= 0; inv.boilers ||= 0; inv.cabins ||= 0; inv.trains ||= 0;
  return inv as any;
}

export const AXES: Axe[] = [
  { key: 'hand', name: 'Bare Hands', level: 0, clickPower: 1, cost: 0 },
  { key: 'wood', name: 'Wooden Axe', level: 1, clickPower: 3, cost: 100 },
  { key: 'stone', name: 'Stone Axe', level: 2, clickPower: 8, cost: 1000 },
  { key: 'iron', name: 'Iron Axe', level: 3, clickPower: 20, cost: 10_000 },
  { key: 'steel', name: 'Steel Axe', level: 4, clickPower: 60, cost: 50_000 },
  { key: 'mythic', name: 'Mythic Axe', level: 5, clickPower: 200, cost: 100_000 }
];

export const AUTOMATION: Record<string, AutomationType> = {
  lumberjack: {
    key: 'lumberjacks',
    name: 'Lumberjack',
    baseRate: 0.1, // sticks/sec
    baseCost: 25,
    growth: 1.15
  },
  foreman: {
    key: 'foremen',
    name: 'Foreman',
    baseRate: 0.8,
    baseCost: 250,
    growth: 1.18
  },
  loggingCamp: {
    key: 'loggingCamps',
    name: 'Logging Camp',
    baseRate: 4,
    baseCost: 2000,
    growth: 1.2
  },
  sawmill: {
    key: 'sawmills',
    name: 'Sawmill',
    baseRate: 15,
    baseCost: 9000,
    growth: 1.22
  },
  arcaneGrove: {
    key: 'arcaneGrove',
    name: 'Arcane Grove',
    baseRate: 60,
    baseCost: 30000,
    growth: 1.25
  }
};

// Tier 2 tools and automation
export const PICKAXES: Pickaxe[] = [
  { key: 'hand', name: 'Bare Hands', level: 0, clickPower: 1, cost: 0 },
  { key: 'stone', name: 'Stone Pickaxe', level: 1, clickPower: 3, cost: 100 },
  { key: 'iron', name: 'Iron Pickaxe', level: 2, clickPower: 8, cost: 1_000 },
  { key: 'steel', name: 'Steel Pickaxe', level: 3, clickPower: 20, cost: 10_000 },
  { key: 'titanium', name: 'Titanium Pickaxe', level: 4, clickPower: 60, cost: 100_000 },
  { key: 'mythic', name: 'Mythic Pickaxe', level: 5, clickPower: 200, cost: 1_000_000 }
];

export const AUTOMATION_T2: Record<string, AutomationType> = {
  miner: {
    key: 'miners',
    name: 'Miner',
    baseRate: 0.1, // beams/sec
    baseCost: 25,
    growth: 1.15
  },
  smelter: {
    key: 'smelters',
    name: 'Smelter',
    baseRate: 0.8,
    baseCost: 250,
    growth: 1.18
  },
  foundry: {
    key: 'foundries',
    name: 'Foundry',
    baseRate: 4,
    baseCost: 2000,
    growth: 1.2
  },
  beamMill: {
    key: 'beamMills',
    name: 'Beam Mill',
    baseRate: 15,
    baseCost: 9000,
    growth: 1.22
  },
  arcaneForge: {
    key: 'arcaneForge',
    name: 'Arcane Forge',
    baseRate: 60,
    baseCost: 30000,
    growth: 1.25
  }
};

// Unified manual click power progression used by higher tiers (levels 0..5)
// Matches Tier 1/2 tool clickPower sequence: 1, 3, 8, 20, 60, 200
export const CLICK_POWER_BY_LEVEL: Readonly<number[]> = [1, 3, 8, 20, 60, 200] as const;
export function clickPowerByLevel(level: number): number {
  const idx = Math.max(0, Math.min(CLICK_POWER_BY_LEVEL.length - 1, level|0));
  return CLICK_POWER_BY_LEVEL[idx];
}

export function getNextAxe(level: number): Axe | null {
  return AXES.find(a => a.level === level + 1) || null;
}

export function axeByLevel(level: number): Axe {
  return AXES.find(a => a.level === level) || AXES[0];
}

export function getNextPick(level: number): Pickaxe | null {
  return PICKAXES.find(a => a.level === level + 1) || null;
}

export function pickByLevel(level: number): Pickaxe {
  return PICKAXES.find(a => a.level === level) || PICKAXES[0];
}

// Manual collection: 12x longer cooldown and 12x payout
export const CHOP_COOLDOWN_MS = GAME_TIMING.CHOP_COOLDOWN_MS;
export const CHOP_REWARD_MULTIPLIER = GAME_TIMING.CHOP_REWARD_MULTIPLIER;

export function automationCost(def: AutomationType, owned: number, user?: User): number {
  const baseCost = Math.floor(def.baseCost * Math.pow(def.growth, owned));
  if (user?.prestigeMvpAwards) {
    return Math.floor(baseCost * Math.pow(0.99, user.prestigeMvpAwards));
  }
  return baseCost;
}

export function canAfford(sticks: number, cost: number): boolean {
  return sticks + 1e-6 >= cost;
}

export function totalAutomationRate(automation: Automation): number {
  let r = 0;
  r += automation.lumberjacks * AUTOMATION.lumberjack.baseRate;
  r += automation.foremen * AUTOMATION.foreman.baseRate;
  r += automation.loggingCamps * AUTOMATION.loggingCamp.baseRate;
  r += automation.sawmills * AUTOMATION.sawmill.baseRate;
  r += automation.arcaneGrove * AUTOMATION.arcaneGrove.baseRate;
  return r;
}

export function totalAutomationRateT2(automation: MiningAutomation): number {
  let r = 0;
  r += automation.miners * AUTOMATION_T2.miner.baseRate;
  r += automation.smelters * AUTOMATION_T2.smelter.baseRate;
  r += automation.foundries * AUTOMATION_T2.foundry.baseRate;
  r += automation.beamMills * AUTOMATION_T2.beamMill.baseRate;
  r += automation.arcaneForge * AUTOMATION_T2.arcaneForge.baseRate;
  return r;
}

export function applyPassiveTicks(user: User, tier: number, now: number = Date.now()): number {
  const dt = Math.max(0, (now - (user.lastTick || now)) / 1000);
  let gained = 0;
  if (tier === 1) {
    const rate = totalAutomationRate(user.automation);
    gained = rate * dt;
    // Do not store personal currency; guild inventory is the single source of truth
    user.rates.sticksPerSec = rate;
  } else if (tier === 2) {
    const rate = totalAutomationRateT2(user.automation2);
    gained = rate * dt;
    // Do not store personal currency; guild inventory is the single source of truth
    user.rates.beamsPerSec = rate;
  }
  user.lastTick = now;
  return gained;
}

export function clickChop(guild: Guild, user: User, tier: number, now: number = Date.now()): { ok: true; gained: number } | { ok: false; reason: string; remainingMs: number } {
  const last = user.lastChopAt || 0;
  const remaining = Math.max(0, (last + CHOP_COOLDOWN_MS) - now);
  if (remaining > 0) {
    return { ok: false, reason: 'Cooldown', remainingMs: remaining };
  }
  let amount = 0;
  if (tier === 1) {
    const lvl = ((guild as any).axeLevel || 0) as number;
    const axe = axeByLevel(lvl);
    amount = axe.clickPower * CHOP_REWARD_MULTIPLIER;
    // Do not store personal currency; guild inventory is the single source of truth
  } else if (tier === 2) {
    const lvl = ((guild as any).pickaxeLevel || 0) as number;
    const pick = pickByLevel(lvl);
    amount = pick.clickPower * CHOP_REWARD_MULTIPLIER;
    // Do not store personal currency; guild inventory is the single source of truth
  }
  user.lastChopAt = now;
  return { ok: true, gained: amount };
}

export function tryBuyAxeShared(guild: Guild): { ok: boolean; reason?: string; next?: Axe } {
  const lvl = ((guild as any).axeLevel || 0) as number;
  const next = getNextAxe(lvl);
  if (!next) return { ok: false, reason: 'Max axe reached' };
  (guild as any).inventory = (guild as any).inventory || { sticks: 0, beams: 0, pipes: 0, boxes: 0 };
  const inv = (guild as any).inventory.sticks || 0;
  if (!canAfford(inv, next.cost)) return { ok: false, reason: 'Not enough sticks (guild)' };
  (guild as any).inventory.sticks = inv - next.cost;
  (guild as any).axeLevel = next.level;
  // Recompute progress from shared inventory for current tier
  if (((guild as any).widgetTier || 1) === 1) {
    const invNow = ((guild as any).inventory?.sticks || 0);
    (guild as any).tierProgress = Math.min(guild.tierGoal, invNow);
  }
  return { ok: true, next };
}

export function tryBuyPickShared(guild: Guild): { ok: boolean; reason?: string; next?: Pickaxe } {
  const lvl = ((guild as any).pickaxeLevel || 0) as number;
  const next = getNextPick(lvl);
  if (!next) return { ok: false, reason: 'Max pickaxe reached' };
  (guild as any).inventory = (guild as any).inventory || { sticks: 0, beams: 0, pipes: 0, boxes: 0 };
  const inv = (guild as any).inventory.beams || 0;
  if (!canAfford(inv, next.cost)) return { ok: false, reason: 'Not enough beams (guild)' };
  (guild as any).inventory.beams = inv - next.cost;
  (guild as any).pickaxeLevel = next.level;
  // Recompute progress from shared inventory for current tier
  if (((guild as any).widgetTier || 1) === 2) {
    const invNow = ((guild as any).inventory?.beams || 0);
    (guild as any).tierProgress = Math.min(guild.tierGoal, invNow);
  }
  return { ok: true, next };
}

export function tryBuyAutomation(guild: Guild, user: User, kind: string, tier: number): { ok: boolean; reason?: string; def?: AutomationType; newOwned?: number; cost?: number } {
  if (tier === 1) {
    const def = AUTOMATION[kind];
    if (!def) return { ok: false, reason: 'Invalid automation kind' };
    const owned = user.automation[def.key as keyof Automation] || 0;
    const cost = automationCost(def, owned, user);
    (guild as any).inventory = (guild as any).inventory || { sticks: 0, beams: 0, pipes: 0, boxes: 0 };
    const inv = (guild as any).inventory.sticks || 0;
    if (!canAfford(inv, cost)) return { ok: false, reason: 'Not enough sticks (guild)' };
    (guild as any).inventory.sticks = inv - cost;
    (user.automation as any)[def.key] = owned + 1;
    user.rates.sticksPerSec = totalAutomationRate(user.automation);
    if (((guild as any).widgetTier || 1) === 1) {
      const invNow = ((guild as any).inventory?.sticks || 0);
      (guild as any).tierProgress = Math.min(guild.tierGoal, invNow);
    }
    return { ok: true, def, newOwned: owned + 1, cost };
  } else {
    const def = AUTOMATION_T2[kind];
    if (!def) return { ok: false, reason: 'Invalid automation kind' };
    const owned = (user.automation2 as any)[def.key] || 0;
    const cost = automationCost(def, owned, user);
    (guild as any).inventory = (guild as any).inventory || { sticks: 0, beams: 0, pipes: 0, boxes: 0 };
    const inv = (guild as any).inventory.beams || 0;
    if (!canAfford(inv, cost)) return { ok: false, reason: 'Not enough beams (guild)' };
    (guild as any).inventory.beams = inv - cost;
    (user.automation2 as any)[def.key] = owned + 1;
    user.rates.beamsPerSec = totalAutomationRateT2(user.automation2);
    if (((guild as any).widgetTier || 1) === 2) {
      const invNow = ((guild as any).inventory?.beams || 0);
      (guild as any).tierProgress = Math.min(guild.tierGoal, invNow);
    }
    return { ok: true, def, newOwned: owned + 1, cost };
  }
}

export function applyGuildProgress(guild: Guild, added: number, tier: number): { tierUp: boolean } {
  const before = guild.tierProgress;
  if (tier === 1) {
    guild.totals.sticks += added;
    (guild as any).inventory = (guild as any).inventory || { sticks: 0, beams: 0, pipes: 0, boxes: 0 };
    (guild as any).inventory.sticks = ((guild as any).inventory.sticks || 0) + added;
  } else if (tier === 2) {
    guild.totals.beams += added;
    (guild as any).inventory = (guild as any).inventory || { sticks: 0, beams: 0, pipes: 0, boxes: 0 };
    (guild as any).inventory.beams = ((guild as any).inventory.beams || 0) + added;
  }
  // Make progress reflect current shared inventory (spending can reduce progress)
  const tierNow = (guild as any).widgetTier || 1;
  if (tierNow === 1) {
    const inv = ((guild as any).inventory?.sticks || 0);
    guild.tierProgress = Math.min(guild.tierGoal, inv);
  } else if (tierNow === 2) {
    const inv = ((guild as any).inventory?.beams || 0);
    guild.tierProgress = Math.min(guild.tierGoal, inv);
  }
  // No longer auto-advance on reaching goal; advancement happens via button
  return { tierUp: false };
}

// Advance to the next tier only when explicitly triggered by the user.
// Supports advancing 1->2, 2->3, 3->4, and 4->prestige when progress goal is met.
export function advanceTierIfReady(guild: Guild): { tierUp: boolean } {
  const currentTier = (guild as any).widgetTier || 1;
  if (currentTier === 1 && guild.tierProgress >= guild.tierGoal) {
    (guild as any).widgetTier = 2;
    guild.tierProgress = 0;
    guild.tierGoal = guild.tierGoal * 10; // Tier 2 takes 10x time
    return { tierUp: true };
  } else if (currentTier === 2 && guild.tierProgress >= guild.tierGoal) {
    (guild as any).widgetTier = 3;
    guild.tierProgress = 0;
    // Tier 3 approximately twice as long as Tier 2
    guild.tierGoal = (guild.tierGoal || 10000000) * 2;
    return { tierUp: true };
  } else if (currentTier === 3 && guild.tierProgress >= guild.tierGoal) {
    (guild as any).widgetTier = 4;
    guild.tierProgress = 0;
    // Tier 4 goal: 100 million trains
    guild.tierGoal = 100_000_000;
    return { tierUp: true };
  } else if (currentTier === 4 && guild.tierProgress >= guild.tierGoal) {
    // Prestige: reset to tier 1 but add prestige point
    (guild as any).widgetTier = 1;
    guild.tierProgress = 0;
    guild.tierGoal = 1_000_000; // Reset to original tier 1 goal
    (guild as any).prestigePoints = ((guild as any).prestigePoints || 0) + 1;
    return { tierUp: true };
  }
  return { tierUp: false };
}

// Tier 3 — Steel Pipes (forgers) and Steel Boxes (welders)
export const T3_PIPE_PER_BOX = TIER_3_RECIPES.PIPES_PER_BOX; // from config

// Tier 3 Shared Click Upgrades (per-role, guild-shared)
export const T3_CLICK_LEVEL_MAX = 5 as const;
export const T3_CLICK_FORGER = { baseCostPipes: 600, growth: 1.25 } as const;
export const T3_CLICK_WELDER = { baseCostBoxes: 60, growth: 1.25 } as const;

// Tier 3 Click Upgrade Names (level 0..5; 5 is Mythic)
export const T3_FORGER_CLICK_NAMES = [
  'Bare Tongs',
  'Bronze Hammer',
  'Iron Hammer',
  'Steel Anvil',
  'Arcane Forge',
  'Mythic Forge'
] as const;
export const T3_WELDER_CLICK_NAMES = [
  'Bare Torch',
  'Arc Torch',
  'Precision Jig',
  'Robotic Arm',
  'Flux Core Rig',
  'Mythic Welder'
] as const;

export function t3ClickUpgradeName(role: 'forger' | 'welder', level: number): string {
  const idx = Math.max(0, Math.min(5, level));
  return role === 'forger' ? T3_FORGER_CLICK_NAMES[idx] : T3_WELDER_CLICK_NAMES[idx];
}

// Tier 4 Click Upgrade Names per role (0..5; 5 is Mythic)
export const T4_LUMBERJACK_CLICK_NAMES = [
  'Bare Hands',
  'Forest Hatchet',
  'Timber Axe',
  'Motor Chainsaw',
  'Logging Skidder',
  'Worldroot Timberlord'
] as const;
export const T4_SMITHY_CLICK_NAMES = [
  'Bare Tongs',
  'Coal Forge',
  'Anvil & Hammer',
  'Power Hammer',
  'Blast Furnace',
  'Starforge Crucible'
] as const;
export const T4_WHEELWRIGHT_CLICK_NAMES = [
  'Hand Spoke Shave',
  'Wood Lathe',
  'Rim Former',
  'Alloy Press',
  'Dynamic Balancer',
  'Ouroboros Wheelworks'
] as const;
export const T4_BOILERMAKER_CLICK_NAMES = [
  'Tin Snips',
  'Sheet Roller',
  'Shell Welder',
  'Rivet Gun',
  'Pressure Tester',
  'Leviathan Boilerhouse'
] as const;
export const T4_COACHBUILDER_CLICK_NAMES = [
  'Carpentry Chisel',
  'Upholstery Kit',
  'Panel Bender',
  'Paint Booth',
  'Finish Line',
  'Sovereign Coachworks'
] as const;
export const T4_MECHANIC_CLICK_NAMES = [
  'Socket Wrench',
  'Engine Hoist',
  'Hydraulic Table',
  'Coupler Jig',
  'Assembly Line',
  'Celestial Locomotive'
] as const;

export function t4ClickUpgradeName(
  role: 'lumberjack' | 'smithy' | 'wheelwright' | 'boilermaker' | 'coachbuilder' | 'mechanic',
  level: number
): string {
  const idx = Math.max(0, Math.min(5, level));
  switch (role) {
    case 'lumberjack': return T4_LUMBERJACK_CLICK_NAMES[idx];
    case 'smithy': return T4_SMITHY_CLICK_NAMES[idx];
    case 'wheelwright': return T4_WHEELWRIGHT_CLICK_NAMES[idx];
    case 'boilermaker': return T4_BOILERMAKER_CLICK_NAMES[idx];
    case 'coachbuilder': return T4_COACHBUILDER_CLICK_NAMES[idx];
    case 'mechanic':
    default: return T4_MECHANIC_CLICK_NAMES[idx];
  }
}

export function t3ForgerClickBase(guild: Guild): number {
  const lvl = Math.min((guild as any).t3ForgerClickLevel || 0, T3_CLICK_LEVEL_MAX);
  // Base pipes per click follows Tier 1/2 sequence
  return clickPowerByLevel(lvl);
}

export function t3WelderClickBase(guild: Guild): number {
  const lvl = Math.min((guild as any).t3WelderClickLevel || 0, T3_CLICK_LEVEL_MAX);
  // Welders craft boxes; align pipe consumption per click to the same sequence
  // Boxes per click = (pipes-per-click) / PIPES_PER_BOX
  return clickPowerByLevel(lvl) / T3_PIPE_PER_BOX;
}

export function t3ClickUpgradeCost(role: 'forger' | 'welder', level: number): number {
  if (level >= T3_CLICK_LEVEL_MAX) return Number.POSITIVE_INFINITY;
  if (role === 'forger') return Math.floor(T3_CLICK_FORGER.baseCostPipes * Math.pow(T3_CLICK_FORGER.growth, level));
  return Math.floor(T3_CLICK_WELDER.baseCostBoxes * Math.pow(T3_CLICK_WELDER.growth, level));
}

// Tier 3 Automation (5 per role)
export const AUTOMATION_T3_FORGE: Record<string, AutomationType> = {
  forge1: { key: 'forge1', name: 'Pipe Foundry', baseRate: 0.5, baseCost: 50, growth: 1.15 },
  forge2: { key: 'forge2', name: 'Alloy Smelter', baseRate: 1.0, baseCost: 200, growth: 1.16 },
  forge3: { key: 'forge3', name: 'Extrusion Press', baseRate: 2.0, baseCost: 800, growth: 1.18 },
  forge4: { key: 'forge4', name: 'Annealing Oven', baseRate: 4.0, baseCost: 3200, growth: 1.2 },
  forge5: { key: 'forge5', name: 'Coating Line', baseRate: 8.0, baseCost: 12800, growth: 1.22 }
};
export const AUTOMATION_T3_WELD: Record<string, AutomationType> = {
  weld1: { key: 'weld1', name: 'Welding Rig', baseRate: (0.5) / 3, baseCost: 50, growth: 1.15 },
  weld2: { key: 'weld2', name: 'Assembly Jig', baseRate: (1.0) / 3, baseCost: 200, growth: 1.16 },
  weld3: { key: 'weld3', name: 'Robotic Welder', baseRate: (2.0) / 3, baseCost: 800, growth: 1.18 },
  weld4: { key: 'weld4', name: 'Bracing Station', baseRate: (4.0) / 3, baseCost: 3200, growth: 1.2 },
  weld5: { key: 'weld5', name: 'Finishing Line', baseRate: (8.0) / 3, baseCost: 12800, growth: 1.22 }
};

export function totalAutomationRateT3Forger(user: User): number {
  const a = user.automation3 || {};
  let r = 0;
  r += (a.forge1 || 0) * AUTOMATION_T3_FORGE.forge1.baseRate;
  r += (a.forge2 || 0) * AUTOMATION_T3_FORGE.forge2.baseRate;
  r += (a.forge3 || 0) * AUTOMATION_T3_FORGE.forge3.baseRate;
  r += (a.forge4 || 0) * AUTOMATION_T3_FORGE.forge4.baseRate;
  r += (a.forge5 || 0) * AUTOMATION_T3_FORGE.forge5.baseRate;
  return r;
}

export function totalAutomationRateT3Welder(user: User): number {
  const a = user.automation3 || {};
  let r = 0;
  r += (a.weld1 || 0) * AUTOMATION_T3_WELD.weld1.baseRate;
  r += (a.weld2 || 0) * AUTOMATION_T3_WELD.weld2.baseRate;
  r += (a.weld3 || 0) * AUTOMATION_T3_WELD.weld3.baseRate;
  r += (a.weld4 || 0) * AUTOMATION_T3_WELD.weld4.baseRate;
  r += (a.weld5 || 0) * AUTOMATION_T3_WELD.weld5.baseRate;
  return r;
}

export function applyPassiveTicksT3(guild: Guild, user: User, now: number = Date.now()): { pipes: number; boxesPotential: number } {
  const dt = Math.max(0, (now - (user.lastTick || now)) / 1000);
  let pipes = 0;
  let boxesPotential = 0;
  const role = getRole3(user);
  if (role === 'forger') {
    const rate = totalAutomationRateT3Forger(user);
    pipes = rate * dt;
    user.rates.pipesPerSec = rate;
  } else if (role === 'welder') {
    const rate = totalAutomationRateT3Welder(user);
    const enabled = (user as any).weldPassiveEnabled !== false; // default ON
    boxesPotential = enabled ? rate * dt : 0;
    user.rates.boxesPerSec = rate;
  }
  user.lastTick = now;
  return { pipes, boxesPotential };
}

export function clickTier3(guild: Guild, user: User, now: number = Date.now()): { ok: true; pipes: number; boxesPotential: number } | { ok: false; reason: string; remainingMs: number } {
  const last = user.lastChopAt || 0;
  const remaining = Math.max(0, (last + CHOP_COOLDOWN_MS) - now);
  if (remaining > 0) {
    return { ok: false, reason: 'Cooldown', remainingMs: remaining };
  }
  const role = getRole3(user);
  let pipes = 0;
  let boxesPotential = 0;
  if (role === 'forger') {
    pipes = t3ForgerClickBase(guild) * CHOP_REWARD_MULTIPLIER;
  } else if (role === 'welder') {
    boxesPotential = t3WelderClickBase(guild) * CHOP_REWARD_MULTIPLIER;
  }
  user.lastChopAt = now;
  return { ok: true, pipes, boxesPotential };
}

export function tryBuyAutomationT3(guild: Guild, user: User, kind: keyof typeof AUTOMATION_T3_FORGE | keyof typeof AUTOMATION_T3_WELD): { ok: boolean; reason?: string; def?: AutomationType; newOwned?: number; cost?: number } {
  const def = ((AUTOMATION_T3_FORGE as any)[kind] || (AUTOMATION_T3_WELD as any)[kind]) as AutomationType | undefined;
  if (!def) return { ok: false, reason: 'Invalid automation kind' };
  const prop = def.key;
  const owned = ((user.automation3 as any)?.[prop] || 0) as number;
  const cost = automationCost(def, owned, user);
  // Determine currency by role and kind
  const isForge = (kind as string).startsWith('forge');
  const isWeld = (kind as string).startsWith('weld');
  const role = (user as any).role3 || null;
  if (isForge && role !== 'forger') return { ok: false, reason: 'Must be a Forger to buy this' };
  if (isWeld && role !== 'welder') return { ok: false, reason: 'Must be a Welder to buy this' };
  guild.inventory = guild.inventory || { pipes: 0, boxes: 0 };
  if (isForge) {
    if (!canAfford(guild.inventory.pipes || 0, cost)) return { ok: false, reason: 'Not enough pipes' };
    guild.inventory.pipes = (guild.inventory.pipes || 0) - cost;
  } else {
    if (!canAfford(guild.inventory.boxes || 0, cost)) return { ok: false, reason: 'Not enough boxes' };
    guild.inventory.boxes = (guild.inventory.boxes || 0) - cost;
  }
  user.automation3 = user.automation3 || {};
  (user.automation3 as any)[prop] = owned + 1;
  // Recompute Tier 3 progress from shared boxes inventory
  if (((guild as any).widgetTier || 1) === 3) {
    const invBoxes = (guild.inventory.boxes || 0);
    (guild as any).tierProgress = Math.min(guild.tierGoal, invBoxes);
  }
  return { ok: true, def, newOwned: owned + 1, cost };
}

export function applyTier3GuildFlows(guild: Guild, user: User, delta: { pipes?: number; boxesPotential?: number }): { pipesMade: number; boxesMade: number } {
  let pipesMade = Math.max(0, delta.pipes || 0);
  let boxesPotential = Math.max(0, delta.boxesPotential || 0);
  const inv = getGuildInventory(guild) as any;
  guild.totals.pipes = guild.totals.pipes || 0;
  guild.totals.boxes = guild.totals.boxes || 0;

  // Apply forging first
  if (pipesMade > 0) {
    inv.pipes += pipesMade;
    guild.totals.pipes += pipesMade;
    (user as any).lifetimeContributed = (user as any).lifetimeContributed + pipesMade;
    (user as any).contributedT3 = ((user as any).contributedT3 || 0) + pipesMade; // credit in pipe-equivalents
    (user as any).pipesProduced = ((user as any).pipesProduced || 0) + pipesMade; // track individual pipes production
  }

  // Apply welding limited by available pipes
  let boxesMade = 0;
  if (boxesPotential > 0) {
    const maxBoxes = inv.pipes / T3_PIPE_PER_BOX;
    boxesMade = Math.min(boxesPotential, maxBoxes);
    const consumed = boxesMade * T3_PIPE_PER_BOX;
    inv.pipes -= consumed;
    inv.boxes += boxesMade;
    guild.totals.boxes += boxesMade;
    // credit welder in pipe-equivalents for parity with forgers
    (user as any).lifetimeContributed = (user as any).lifetimeContributed + consumed;
    (user as any).contributedT3 = ((user as any).contributedT3 || 0) + consumed;
    (user as any).boxesProduced = ((user as any).boxesProduced || 0) + boxesMade; // track individual boxes production
  }
  // Progress reflects current shared inventory of boxes at Tier 3
  if ((guild as any).widgetTier === 3) {
    const invBoxes = inv.boxes || 0;
    guild.tierProgress = Math.min(guild.tierGoal, invBoxes);
  }
  return { pipesMade, boxesMade };
}

// Calculate MVP (highest average contribution % across all tiers) and award them
// MVP calculation lives in state to avoid circular imports

// Reset guild to tier 1 state for prestige
export function resetGuildForPrestige(guild: Guild): void {
  // Reset tier and progress
  (guild as any).widgetTier = 1;
  guild.tierProgress = 0;
  guild.tierGoal = 1_000_000;
  
  // Reset all totals but keep prestige points
  guild.totals = { sticks: 0, beams: 0, pipes: 0, boxes: 0, wood: 0, steel: 0, wheels: 0, boilers: 0, cabins: 0, trains: 0 };
  
  // Reset all inventory
  (guild as any).inventory = { sticks: 0, beams: 0, pipes: 0, boxes: 0, wood: 0, steel: 0, wheels: 0, boilers: 0, cabins: 0, trains: 0 };
  
  // Reset all shared tool levels
  (guild as any).axeLevel = 0;
  (guild as any).pickaxeLevel = 0;
  (guild as any).t3ForgerClickLevel = 0;
  (guild as any).t3WelderClickLevel = 0;
  (guild as any).t4LumberjackClickLevel = 0;
  (guild as any).t4SmithyClickLevel = 0;
  (guild as any).t4WheelwrightClickLevel = 0;
  (guild as any).t4BoilermakerClickLevel = 0;
  (guild as any).t4CoachbuilderClickLevel = 0;
  (guild as any).t4MechanicClickLevel = 0;
}

// Buy Tier 3 shared click upgrade for a role. Spends shared inventory.
export function tryBuyT3ClickUpgrade(guild: Guild, role: 'forger' | 'welder'): { ok: boolean; reason?: string; newLevel?: number; cost?: number } {
  (guild as any).inventory = (guild as any).inventory || { pipes: 0, boxes: 0 };
  if (role === 'forger') {
    const lvl = (guild as any).t3ForgerClickLevel || 0;
    if (lvl >= T3_CLICK_LEVEL_MAX) return { ok: false, reason: 'Max level reached' };
    const cost = t3ClickUpgradeCost('forger', lvl);
    const inv = (guild as any).inventory.pipes || 0;
    if (!canAfford(inv, cost)) return { ok: false, reason: 'Not enough pipes' };
    (guild as any).inventory.pipes = inv - cost;
    (guild as any).t3ForgerClickLevel = lvl + 1;
    if (((guild as any).widgetTier || 1) === 3) {
      const invBoxes = ((guild as any).inventory?.boxes || 0);
      (guild as any).tierProgress = Math.min(guild.tierGoal, invBoxes);
    }
    return { ok: true, newLevel: lvl + 1, cost };
  } else {
    const lvl = (guild as any).t3WelderClickLevel || 0;
    if (lvl >= T3_CLICK_LEVEL_MAX) return { ok: false, reason: 'Max level reached' };
    const cost = t3ClickUpgradeCost('welder', lvl);
    const inv = (guild as any).inventory.boxes || 0;
    if (!canAfford(inv, cost)) return { ok: false, reason: 'Not enough boxes' };
    (guild as any).inventory.boxes = inv - cost;
    (guild as any).t3WelderClickLevel = lvl + 1;
    if (((guild as any).widgetTier || 1) === 3) {
      const invBoxes = ((guild as any).inventory?.boxes || 0);
      (guild as any).tierProgress = Math.min(guild.tierGoal, invBoxes);
    }
    return { ok: true, newLevel: lvl + 1, cost };
  }
}

// Tier 4 — Trains (wheels, boilers, cabins)
// Base materials: wood (from lumberjacks) and steel (from smithy)
export const T4_STEEL_PER_WHEEL = TIER_4_RECIPES.STEEL_PER_WHEEL;
export const T4_WOOD_PER_WHEEL = TIER_4_RECIPES.WOOD_PER_WHEEL;
export const T4_STEEL_PER_BOILER = TIER_4_RECIPES.STEEL_PER_BOILER;
export const T4_WOOD_PER_CABIN = TIER_4_RECIPES.WOOD_PER_CABIN;
export const T4_WHEELS_PER_TRAIN = TIER_4_RECIPES.WHEELS_PER_TRAIN;
export const T4_BOILERS_PER_TRAIN = TIER_4_RECIPES.BOILERS_PER_TRAIN;
export const T4_CABINS_PER_TRAIN = TIER_4_RECIPES.CABINS_PER_TRAIN;

// Tier 4 Shared Click Upgrades (per-role)
export const T4_CLICK_LEVEL_MAX = 5 as const;
export const T4_CLICK_LUMBERJACK = { baseCostWood: 50, growth: 1.25 } as const;
export const T4_CLICK_SMITHY = { baseCostSteel: 30, growth: 1.25 } as const;
export const T4_CLICK_WHEELWRIGHT = { baseCostWheels: 40, growth: 1.25 } as const;
export const T4_CLICK_BOILER = { baseCostBoilers: 20, growth: 1.25 } as const;
export const T4_CLICK_COACH = { baseCostCabins: 10, growth: 1.25 } as const;
export const T4_CLICK_MECHANIC = { baseCostTrains: 5, growth: 1.25 } as const;

export function t4LumberjackClickBase(guild: Guild): number {
  const lvl = Math.min((guild as any).t4LumberjackClickLevel || 0, T4_CLICK_LEVEL_MAX);
  return clickPowerByLevel(lvl); // wood-per-click units
}
export function t4SmithyClickBase(guild: Guild): number {
  const lvl = Math.min((guild as any).t4SmithyClickLevel || 0, T4_CLICK_LEVEL_MAX);
  return clickPowerByLevel(lvl); // steel-per-click units
}
export function t4WheelwrightClickBase(guild: Guild): number {
  const lvl = Math.min((guild as any).t4WheelwrightClickLevel || 0, T4_CLICK_LEVEL_MAX);
  return clickPowerByLevel(lvl); // wheels-per-click units
}
export function t4BoilermakerClickBase(guild: Guild): number {
  const lvl = Math.min((guild as any).t4BoilermakerClickLevel || 0, T4_CLICK_LEVEL_MAX);
  return clickPowerByLevel(lvl); // boilers-per-click units
}
export function t4CoachbuilderClickBase(guild: Guild): number {
  const lvl = Math.min((guild as any).t4CoachbuilderClickLevel || 0, T4_CLICK_LEVEL_MAX);
  return clickPowerByLevel(lvl); // cabins-per-click units
}
export function t4MechanicClickBase(guild: Guild): number {
  const lvl = Math.min((guild as any).t4MechanicClickLevel || 0, T4_CLICK_LEVEL_MAX);
  return clickPowerByLevel(lvl); // trains-per-click units
}
export function t4ClickUpgradeCost(role: 'lumberjack' | 'smithy' | 'wheelwright' | 'boilermaker' | 'coachbuilder' | 'mechanic', level: number): number {
  if (level >= T4_CLICK_LEVEL_MAX) return Number.POSITIVE_INFINITY;
  if (role === 'lumberjack') return Math.floor(T4_CLICK_LUMBERJACK.baseCostWood * Math.pow(T4_CLICK_LUMBERJACK.growth, level));
  if (role === 'smithy') return Math.floor(T4_CLICK_SMITHY.baseCostSteel * Math.pow(T4_CLICK_SMITHY.growth, level));
  if (role === 'wheelwright') return Math.floor(T4_CLICK_WHEELWRIGHT.baseCostWheels * Math.pow(T4_CLICK_WHEELWRIGHT.growth, level));
  if (role === 'boilermaker') return Math.floor(T4_CLICK_BOILER.baseCostBoilers * Math.pow(T4_CLICK_BOILER.growth, level));
  if (role === 'coachbuilder') return Math.floor(T4_CLICK_COACH.baseCostCabins * Math.pow(T4_CLICK_COACH.growth, level));
  return Math.floor(T4_CLICK_MECHANIC.baseCostTrains * Math.pow(T4_CLICK_MECHANIC.growth, level));
}

// Tier 4 Automation (5 per role)
export const AUTOMATION_T4_WHEEL: Record<string, AutomationType> = {
  wh1: { key: 'wh1', name: 'Spoke Shop', baseRate: 0.5, baseCost: 10, growth: 1.15 },
  wh2: { key: 'wh2', name: 'Lathe Line', baseRate: 1.0, baseCost: 40, growth: 1.16 },
  wh3: { key: 'wh3', name: 'Press Form', baseRate: 2.0, baseCost: 160, growth: 1.18 },
  wh4: { key: 'wh4', name: 'Rim Forge', baseRate: 4.0, baseCost: 640, growth: 1.2 },
  wh5: { key: 'wh5', name: 'Balancing Rig', baseRate: 8.0, baseCost: 2560, growth: 1.22 }
};
export const AUTOMATION_T4_BOILER: Record<string, AutomationType> = {
  bl1: { key: 'bl1', name: 'Tube Rack', baseRate: 0.4, baseCost: 8, growth: 1.15 },
  bl2: { key: 'bl2', name: 'Sheet Roller', baseRate: 0.8, baseCost: 32, growth: 1.16 },
  bl3: { key: 'bl3', name: 'Shell Welder', baseRate: 1.6, baseCost: 128, growth: 1.18 },
  bl4: { key: 'bl4', name: 'Rivet Station', baseRate: 3.2, baseCost: 512, growth: 1.2 },
  bl5: { key: 'bl5', name: 'Pressure Tester', baseRate: 6.4, baseCost: 2048, growth: 1.22 }
};
export const AUTOMATION_T4_COACH: Record<string, AutomationType> = {
  cb1: { key: 'cb1', name: 'Carpentry Bench', baseRate: 0.3, baseCost: 6, growth: 1.15 },
  cb2: { key: 'cb2', name: 'Upholstery Line', baseRate: 0.6, baseCost: 24, growth: 1.16 },
  cb3: { key: 'cb3', name: 'Panel Bender', baseRate: 1.2, baseCost: 96, growth: 1.18 },
  cb4: { key: 'cb4', name: 'Paint Booth', baseRate: 2.4, baseCost: 384, growth: 1.2 },
  cb5: { key: 'cb5', name: 'Finishing Line', baseRate: 4.8, baseCost: 1536, growth: 1.22 }
};
export const AUTOMATION_T4_LUMBERJACK: Record<string, AutomationType> = {
  lj1: { key: 'lj1', name: 'Hand Axe', baseRate: 0.8, baseCost: 16, growth: 1.15 },
  lj2: { key: 'lj2', name: 'Crosscut Saw', baseRate: 1.6, baseCost: 64, growth: 1.16 },
  lj3: { key: 'lj3', name: 'Felling Wedge', baseRate: 3.2, baseCost: 256, growth: 1.18 },
  lj4: { key: 'lj4', name: 'Logging Crane', baseRate: 6.4, baseCost: 1024, growth: 1.2 },
  lj5: { key: 'lj5', name: 'Tree Processor', baseRate: 12.8, baseCost: 4096, growth: 1.22 }
};
export const AUTOMATION_T4_SMITHY: Record<string, AutomationType> = {
  sm1: { key: 'sm1', name: 'Forge Bellows', baseRate: 0.6, baseCost: 12, growth: 1.15 },
  sm2: { key: 'sm2', name: 'Anvil Station', baseRate: 1.2, baseCost: 48, growth: 1.16 },
  sm3: { key: 'sm3', name: 'Quench Tank', baseRate: 2.4, baseCost: 192, growth: 1.18 },
  sm4: { key: 'sm4', name: 'Power Hammer', baseRate: 4.8, baseCost: 768, growth: 1.2 },
  sm5: { key: 'sm5', name: 'Blast Furnace', baseRate: 9.6, baseCost: 3072, growth: 1.22 }
};
export const AUTOMATION_T4_MECHANIC: Record<string, AutomationType> = {
  ta1: { key: 'ta1', name: 'Assembly Jig', baseRate: 0.2, baseCost: 4, growth: 1.15 },
  ta2: { key: 'ta2', name: 'Coupling Tools', baseRate: 0.4, baseCost: 16, growth: 1.16 },
  ta3: { key: 'ta3', name: 'Hydraulic Lift', baseRate: 0.8, baseCost: 64, growth: 1.18 },
  ta4: { key: 'ta4', name: 'Rolling Crane', baseRate: 1.6, baseCost: 256, growth: 1.2 },
  ta5: { key: 'ta5', name: 'Assembly Line', baseRate: 3.2, baseCost: 1024, growth: 1.22 }
};

// Generic automation rate calculation
function calculateAutomationRate(automation: Record<string, number>, definitions: Record<string, AutomationType>): number {
  return Object.entries(definitions).reduce((total, [key, def]) => 
    total + (automation[key] || 0) * def.baseRate, 0);
}

export function totalAutomationRateT4Wheel(u: User): number {
  const a = (u as any).automation4 || {};
  return calculateAutomationRate(a, AUTOMATION_T4_WHEEL);
}

export function totalAutomationRateT4Boiler(u: User): number {
  const a = (u as any).automation4 || {};
  return calculateAutomationRate(a, AUTOMATION_T4_BOILER);
}

export function totalAutomationRateT4Coach(u: User): number {
  const a = (u as any).automation4 || {};
  return calculateAutomationRate(a, AUTOMATION_T4_COACH);
}

export function totalAutomationRateT4Lumberjack(u: User): number {
  const a = (u as any).automation4 || {};
  return calculateAutomationRate(a, AUTOMATION_T4_LUMBERJACK);
}

export function totalAutomationRateT4Smithy(u: User): number {
  const a = (u as any).automation4 || {};
  return calculateAutomationRate(a, AUTOMATION_T4_SMITHY);
}

export function totalAutomationRateT4Mechanic(u: User): number {
  const a = (u as any).automation4 || {};
  return calculateAutomationRate(a, AUTOMATION_T4_MECHANIC);
}

export function applyPassiveTicksT4(guild: Guild, user: User, now: number = Date.now()): { woodPotential: number; steelPotential: number; wheelsPotential: number; boilersPotential: number; cabinsPotential: number; trainsPotential: number } {
  const dt = Math.max(0, (now - (user.lastTick || now)) / 1000);
  let woodPotential = 0, steelPotential = 0, wheelsPotential = 0, boilersPotential = 0, cabinsPotential = 0, trainsPotential = 0;
  const role = getRole4(user);
  
  if (role === 'lumberjack') {
    const rate = totalAutomationRateT4Lumberjack(user);
    woodPotential = rate * dt;
    (user as any).rates.woodPerSec = rate;
  } else if (role === 'smithy') {
    const rate = totalAutomationRateT4Smithy(user);
    steelPotential = rate * dt;
    (user as any).rates.steelPerSec = rate;
  } else if (role === 'wheelwright') {
    const rate = totalAutomationRateT4Wheel(user);
    wheelsPotential = rate * dt;
    (user as any).rates.wheelsPerSec = rate;
  } else if (role === 'boilermaker') {
    const rate = totalAutomationRateT4Boiler(user);
    boilersPotential = rate * dt;
    (user as any).rates.boilersPerSec = rate;
  } else if (role === 'coachbuilder') {
    const rate = totalAutomationRateT4Coach(user);
    cabinsPotential = rate * dt;
    (user as any).rates.cabinsPerSec = rate;
  } else if (role === 'mechanic') {
    const rate = totalAutomationRateT4Mechanic(user);
    trainsPotential = rate * dt;
    (user as any).rates.trainsPerSec = rate;
  }
  
  user.lastTick = now;
  return { woodPotential, steelPotential, wheelsPotential, boilersPotential, cabinsPotential, trainsPotential };
}

export function clickTier4(guild: Guild, user: User, now: number = Date.now()): { ok: true; wood: number; steel: number; wheels: number; boilers: number; cabins: number; trains: number } | { ok: false; reason: string; remainingMs: number } {
  const last = user.lastChopAt || 0;
  const remaining = Math.max(0, (last + CHOP_COOLDOWN_MS) - now);
  if (remaining > 0) return { ok: false, reason: 'Cooldown', remainingMs: remaining };
  const role = getRole4(user);
  let wood = 0, steel = 0, wheels = 0, boilers = 0, cabins = 0, trains = 0;
  if (role === 'lumberjack') wood = t4LumberjackClickBase(guild) * CHOP_REWARD_MULTIPLIER;
  else if (role === 'smithy') steel = t4SmithyClickBase(guild) * CHOP_REWARD_MULTIPLIER;
  else if (role === 'wheelwright') wheels = t4WheelwrightClickBase(guild) * CHOP_REWARD_MULTIPLIER;
  else if (role === 'boilermaker') boilers = t4BoilermakerClickBase(guild) * CHOP_REWARD_MULTIPLIER;
  else if (role === 'coachbuilder') cabins = t4CoachbuilderClickBase(guild) * CHOP_REWARD_MULTIPLIER;
  else if (role === 'mechanic') trains = t4MechanicClickBase(guild) * CHOP_REWARD_MULTIPLIER;
  user.lastChopAt = now;
  return { ok: true, wood, steel, wheels, boilers, cabins, trains };
}

export function tryBuyAutomationT4(guild: Guild, user: User, kind: keyof typeof AUTOMATION_T4_LUMBERJACK | keyof typeof AUTOMATION_T4_SMITHY | keyof typeof AUTOMATION_T4_WHEEL | keyof typeof AUTOMATION_T4_BOILER | keyof typeof AUTOMATION_T4_COACH | keyof typeof AUTOMATION_T4_MECHANIC): { ok: boolean; reason?: string; def?: AutomationType; newOwned?: number; cost?: number } {
  const def = ((AUTOMATION_T4_LUMBERJACK as any)[kind] || (AUTOMATION_T4_SMITHY as any)[kind] || (AUTOMATION_T4_WHEEL as any)[kind] || (AUTOMATION_T4_BOILER as any)[kind] || (AUTOMATION_T4_COACH as any)[kind] || (AUTOMATION_T4_MECHANIC as any)[kind]) as AutomationType | undefined;
  if (!def) return { ok: false, reason: 'Invalid automation kind' };
  const prop = def.key;
  const owned = ((user.automation4 as any)?.[prop] || 0) as number;
  const cost = automationCost(def, owned, user);
  guild.inventory = guild.inventory || { pipes: 0, boxes: 0 } as any;
  // Currency is the product type
  let currency: 'wood' | 'steel' | 'wheels' | 'boilers' | 'cabins' | 'trains' | null = null;
  if ((AUTOMATION_T4_LUMBERJACK as any)[kind]) currency = 'wood';
  else if ((AUTOMATION_T4_SMITHY as any)[kind]) currency = 'steel';
  else if ((AUTOMATION_T4_WHEEL as any)[kind]) currency = 'wheels';
  else if ((AUTOMATION_T4_BOILER as any)[kind]) currency = 'boilers';
  else if ((AUTOMATION_T4_COACH as any)[kind]) currency = 'cabins';
  else if ((AUTOMATION_T4_MECHANIC as any)[kind]) currency = 'trains';
  const inv = (guild.inventory as any)[currency!] || 0;
  if (!canAfford(inv, cost)) return { ok: false, reason: `Not enough ${currency}` };
  (guild.inventory as any)[currency!] = inv - cost;
  user.automation4 = user.automation4 || {};
  (user.automation4 as any)[prop] = owned + 1;
  return { ok: true, def, newOwned: owned + 1, cost };
}

export function tryBuyT4ClickUpgrade(guild: Guild, role: 'lumberjack' | 'smithy' | 'wheelwright' | 'boilermaker' | 'coachbuilder' | 'mechanic'): { ok: boolean; reason?: string; newLevel?: number; cost?: number } {
  (guild as any).inventory = (guild as any).inventory || {};
  
  if (role === 'lumberjack') {
    const lvl = (guild as any).t4LumberjackClickLevel || 0;
    if (lvl >= T4_CLICK_LEVEL_MAX) return { ok: false, reason: 'Max level reached' };
    const cost = t4ClickUpgradeCost('lumberjack', lvl);
    const inv = (guild as any).inventory.wood || 0;
    if (!canAfford(inv, cost)) return { ok: false, reason: 'Not enough wood' };
    (guild as any).inventory.wood = inv - cost;
    (guild as any).t4LumberjackClickLevel = lvl + 1;
    return { ok: true, newLevel: lvl + 1, cost };
  } else if (role === 'smithy') {
    const lvl = (guild as any).t4SmithyClickLevel || 0;
    if (lvl >= T4_CLICK_LEVEL_MAX) return { ok: false, reason: 'Max level reached' };
    const cost = t4ClickUpgradeCost('smithy', lvl);
    const inv = (guild as any).inventory.steel || 0;
    if (!canAfford(inv, cost)) return { ok: false, reason: 'Not enough steel' };
    (guild as any).inventory.steel = inv - cost;
    (guild as any).t4SmithyClickLevel = lvl + 1;
    return { ok: true, newLevel: lvl + 1, cost };
  } else if (role === 'wheelwright') {
    const lvl = (guild as any).t4WheelwrightClickLevel || 0;
    if (lvl >= T4_CLICK_LEVEL_MAX) return { ok: false, reason: 'Max level reached' };
    const cost = t4ClickUpgradeCost('wheelwright', lvl);
    const inv = (guild as any).inventory.wheels || 0;
    if (!canAfford(inv, cost)) return { ok: false, reason: 'Not enough wheels' };
    (guild as any).inventory.wheels = inv - cost;
    (guild as any).t4WheelwrightClickLevel = lvl + 1;
    return { ok: true, newLevel: lvl + 1, cost };
  } else if (role === 'boilermaker') {
    const lvl = (guild as any).t4BoilermakerClickLevel || 0;
    if (lvl >= T4_CLICK_LEVEL_MAX) return { ok: false, reason: 'Max level reached' };
    const cost = t4ClickUpgradeCost('boilermaker', lvl);
    const inv = (guild as any).inventory.boilers || 0;
    if (!canAfford(inv, cost)) return { ok: false, reason: 'Not enough boilers' };
    (guild as any).inventory.boilers = inv - cost;
    (guild as any).t4BoilermakerClickLevel = lvl + 1;
    return { ok: true, newLevel: lvl + 1, cost };
  } else if (role === 'coachbuilder') {
    const lvl = (guild as any).t4CoachbuilderClickLevel || 0;
    if (lvl >= T4_CLICK_LEVEL_MAX) return { ok: false, reason: 'Max level reached' };
    const cost = t4ClickUpgradeCost('coachbuilder', lvl);
    const inv = (guild as any).inventory.cabins || 0;
    if (!canAfford(inv, cost)) return { ok: false, reason: 'Not enough cabins' };
    (guild as any).inventory.cabins = inv - cost;
    (guild as any).t4CoachbuilderClickLevel = lvl + 1;
    return { ok: true, newLevel: lvl + 1, cost };
  } else { // mechanic
    const lvl = (guild as any).t4MechanicClickLevel || 0;
    if (lvl >= T4_CLICK_LEVEL_MAX) return { ok: false, reason: 'Max level reached' };
    const cost = t4ClickUpgradeCost('mechanic', lvl);
    const inv = (guild as any).inventory.trains || 0;
    if (!canAfford(inv, cost)) return { ok: false, reason: 'Not enough trains' };
    (guild as any).inventory.trains = inv - cost;
    (guild as any).t4MechanicClickLevel = lvl + 1;
    return { ok: true, newLevel: lvl + 1, cost };
  }
}

export function applyTier4GuildFlows(guild: Guild, user: User, delta: { woodPotential?: number; steelPotential?: number; wheelsPotential?: number; boilersPotential?: number; cabinsPotential?: number; trainsPotential?: number }): { woodMade: number; steelMade: number; wheelsMade: number; boilersMade: number; cabinsMade: number; trainsMade: number } {
  const inv = getGuildInventory(guild) as any;
  
  // Initialize all tier 4 inventory and totals
  inv.wood = inv.wood || 0;
  inv.steel = inv.steel || 0;
  inv.wheels = inv.wheels || 0;
  inv.boilers = inv.boilers || 0;
  inv.cabins = inv.cabins || 0;
  inv.trains = inv.trains || 0;
  guild.totals.wood = guild.totals.wood || 0;
  guild.totals.steel = guild.totals.steel || 0;
  guild.totals.wheels = guild.totals.wheels || 0;
  guild.totals.boilers = guild.totals.boilers || 0;
  guild.totals.cabins = guild.totals.cabins || 0;
  guild.totals.trains = guild.totals.trains || 0;

  let woodMade = 0, steelMade = 0, wheelsMade = 0, boilersMade = 0, cabinsMade = 0, trainsMade = 0;
  
  // 1. Lumberjacks produce wood (base material)
  const woodProd = Math.max(0, delta.woodPotential || 0);
  if (woodProd > 0) {
    woodMade = woodProd;
    inv.wood += woodMade;
    guild.totals.wood! += woodMade;
    (user as any).lifetimeContributed = (user as any).lifetimeContributed + woodMade;
    (user as any).contributedT4 = ((user as any).contributedT4 || 0) + woodMade;
    (user as any).woodProduced = ((user as any).woodProduced || 0) + woodMade;
  }
  
  // 2. Smithy produces steel (base material)
  const steelProd = Math.max(0, delta.steelPotential || 0);
  if (steelProd > 0) {
    steelMade = steelProd;
    inv.steel += steelMade;
    guild.totals.steel! += steelMade;
    (user as any).lifetimeContributed = (user as any).lifetimeContributed + steelMade;
    (user as any).contributedT4 = ((user as any).contributedT4 || 0) + steelMade;
    (user as any).steelProduced = ((user as any).steelProduced || 0) + steelMade;
  }
  
  // 3. Wheelwrights make wheels from steel + wood
  const wheelsProd = Math.max(0, delta.wheelsPotential || 0);
  if (wheelsProd > 0) {
    const maxBySteel = Math.floor(inv.steel / T4_STEEL_PER_WHEEL);
    const maxByWood = Math.floor(inv.wood / T4_WOOD_PER_WHEEL);
    wheelsMade = Math.max(0, Math.min(wheelsProd, maxBySteel, maxByWood));
    inv.steel -= wheelsMade * T4_STEEL_PER_WHEEL;
    inv.wood -= wheelsMade * T4_WOOD_PER_WHEEL;
    inv.wheels += wheelsMade;
    guild.totals.wheels! += wheelsMade;
    const contribution = wheelsMade * (T4_STEEL_PER_WHEEL + T4_WOOD_PER_WHEEL);
    (user as any).lifetimeContributed = (user as any).lifetimeContributed + contribution;
    (user as any).contributedT4 = ((user as any).contributedT4 || 0) + contribution;
    (user as any).wheelsProduced = ((user as any).wheelsProduced || 0) + wheelsMade;
  }
  
  // 4. Boilermakers make boilers from steel only
  const boilersProd = Math.max(0, delta.boilersPotential || 0);
  if (boilersProd > 0) {
    const maxBySteel = Math.floor(inv.steel / T4_STEEL_PER_BOILER);
    boilersMade = Math.max(0, Math.min(boilersProd, maxBySteel));
    inv.steel -= boilersMade * T4_STEEL_PER_BOILER;
    inv.boilers += boilersMade;
    guild.totals.boilers! += boilersMade;
    const contribution = boilersMade * T4_STEEL_PER_BOILER;
    (user as any).lifetimeContributed = (user as any).lifetimeContributed + contribution;
    (user as any).contributedT4 = ((user as any).contributedT4 || 0) + contribution;
    (user as any).boilersProduced = ((user as any).boilersProduced || 0) + boilersMade;
  }
  
  // 5. Coachbuilders make cabins from wood only
  const cabinsProd = Math.max(0, delta.cabinsPotential || 0);
  if (cabinsProd > 0) {
    const maxByWood = Math.floor(inv.wood / T4_WOOD_PER_CABIN);
    cabinsMade = Math.max(0, Math.min(cabinsProd, maxByWood));
    inv.wood -= cabinsMade * T4_WOOD_PER_CABIN;
    inv.cabins += cabinsMade;
    guild.totals.cabins! += cabinsMade;
    const contribution = cabinsMade * T4_WOOD_PER_CABIN;
    (user as any).lifetimeContributed = (user as any).lifetimeContributed + contribution;
    (user as any).contributedT4 = ((user as any).contributedT4 || 0) + contribution;
    (user as any).cabinsProduced = ((user as any).cabinsProduced || 0) + cabinsMade;
  }
  
  // 6. Train assemblers assemble trains from components
  const trainsProd = Math.max(0, delta.trainsPotential || 0);
  const maxTrainsByComponents = Math.min(
    Math.floor(inv.wheels / T4_WHEELS_PER_TRAIN),
    Math.floor(inv.boilers / T4_BOILERS_PER_TRAIN),
    Math.floor(inv.cabins / T4_CABINS_PER_TRAIN)
  );
  trainsMade = Math.max(0, Math.min(trainsProd, maxTrainsByComponents));
  if (trainsMade > 0) {
    inv.wheels -= trainsMade * T4_WHEELS_PER_TRAIN;
    inv.boilers -= trainsMade * T4_BOILERS_PER_TRAIN;
    inv.cabins -= trainsMade * T4_CABINS_PER_TRAIN;
    inv.trains += trainsMade;
    guild.totals.trains! += trainsMade;
    const contribution = trainsMade * (T4_WHEELS_PER_TRAIN + T4_BOILERS_PER_TRAIN + T4_CABINS_PER_TRAIN);
    (user as any).lifetimeContributed = (user as any).lifetimeContributed + contribution;
    (user as any).contributedT4 = ((user as any).contributedT4 || 0) + contribution;
    (user as any).trainsProduced = ((user as any).trainsProduced || 0) + trainsMade;
  }
  
  // Tier progress reflects current trains inventory at Tier 4
  if (((guild as any).widgetTier || 1) === 4) {
    const invTrains = inv.trains || 0;
    (guild as any).tierProgress = Math.min(guild.tierGoal, invTrains);
  }
  
  return { woodMade, steelMade, wheelsMade, boilersMade, cabinsMade, trainsMade };
}
