// Core game math and metadata for Tier 1 (sticks)

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
}

export interface Guild {
  totals: {
    sticks: number;
    beams: number;
    pipes?: number;
    boxes?: number;
  };
  // Shared Tier 3 inventory
  inventory?: {
    sticks?: number;
    beams?: number;
    pipes: number;
    boxes: number;
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
export const CHOP_COOLDOWN_MS = 3_600_000; // 3600s = 60m
export const CHOP_REWARD_MULTIPLIER = 3600;

export function automationCost(def: AutomationType, owned: number): number {
  return Math.floor(def.baseCost * Math.pow(def.growth, owned));
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
    const cost = automationCost(def, owned);
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
    const cost = automationCost(def, owned);
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
// Supports advancing 1->2 and 2->3 when progress goal is met.
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
  }
  return { tierUp: false };
}

// Tier 3 — Steel Pipes (forgers) and Steel Boxes (welders)
export const T3_PIPE_PER_BOX = 6; // 6 pipes per 1 box

// Tier 3 Shared Click Upgrades (per-role, guild-shared)
export const T3_CLICK_FORGER = { baseCostPipes: 600, growth: 1.25 } as const;
export const T3_CLICK_WELDER = { baseCostBoxes: 60, growth: 1.25 } as const;

export function t3ForgerClickBase(guild: Guild): number {
  const lvl = (guild as any).t3ForgerClickLevel || 0;
  return 1 + lvl; // base pipes-per-click units before multiplier
}

export function t3WelderClickBase(guild: Guild): number {
  const lvl = (guild as any).t3WelderClickLevel || 0;
  return (1 + lvl) / 3; // base boxes-per-click units before multiplier
}

export function t3ClickUpgradeCost(role: 'forger' | 'welder', level: number): number {
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
  const role = (user as any).role3 || null;
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
  const role = (user as any).role3 || null;
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
  const cost = automationCost(def, owned);
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
  guild.inventory = guild.inventory || { pipes: 0, boxes: 0 };
  guild.totals.pipes = guild.totals.pipes || 0;
  guild.totals.boxes = guild.totals.boxes || 0;

  // Apply forging first
  if (pipesMade > 0) {
    guild.inventory.pipes += pipesMade;
    guild.totals.pipes += pipesMade;
    (user as any).lifetimeContributed = (user as any).lifetimeContributed + pipesMade;
    (user as any).contributedT3 = ((user as any).contributedT3 || 0) + pipesMade; // credit in pipe-equivalents
    (user as any).pipesProduced = ((user as any).pipesProduced || 0) + pipesMade; // track individual pipes production
  }

  // Apply welding limited by available pipes
  let boxesMade = 0;
  if (boxesPotential > 0) {
    const maxBoxes = guild.inventory.pipes / T3_PIPE_PER_BOX;
    boxesMade = Math.min(boxesPotential, maxBoxes);
    const consumed = boxesMade * T3_PIPE_PER_BOX;
    guild.inventory.pipes -= consumed;
    guild.inventory.boxes += boxesMade;
    guild.totals.boxes += boxesMade;
    // credit welder in pipe-equivalents for parity with forgers
    (user as any).lifetimeContributed = (user as any).lifetimeContributed + consumed;
    (user as any).contributedT3 = ((user as any).contributedT3 || 0) + consumed;
    (user as any).boxesProduced = ((user as any).boxesProduced || 0) + boxesMade; // track individual boxes production
  }
  // Progress reflects current shared inventory of boxes at Tier 3
  if ((guild as any).widgetTier === 3) {
    const invBoxes = guild.inventory.boxes || 0;
    guild.tierProgress = Math.min(guild.tierGoal, invBoxes);
  }
  return { pipesMade, boxesMade };
}

// Buy Tier 3 shared click upgrade for a role. Spends shared inventory.
export function tryBuyT3ClickUpgrade(guild: Guild, role: 'forger' | 'welder'): { ok: boolean; reason?: string; newLevel?: number; cost?: number } {
  (guild as any).inventory = (guild as any).inventory || { pipes: 0, boxes: 0 };
  if (role === 'forger') {
    const lvl = (guild as any).t3ForgerClickLevel || 0;
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
