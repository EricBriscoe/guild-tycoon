/**
 * Game Configuration Constants
 * Centralized location for all game balance, timing, and progression values
 */

// Timing Constants
export const GAME_TIMING = {
  CHOP_COOLDOWN_MS: 3_600_000, // 1 hour in milliseconds
  CHOP_REWARD_MULTIPLIER: 3600, // 1 hour worth of production
  DELAYED_ACTION_MS: 60_000, // 1 minute delay for delayed actions
  BACKGROUND_TICK_MS: 15_000, // Default background tick interval
} as const;

// Tier Progression Goals
export const TIER_GOALS = {
  TIER_1: 1_000_000,    // 1M sticks
  TIER_2: 10_000_000,   // 10M beams (10x tier 1)
  TIER_3: 20_000_000,   // 20M boxes (2x tier 2)
  TIER_4: 100_000_000,  // 100M trains
} as const;

// Tier 3 Recipe Constants
export const TIER_3_RECIPES = {
  PIPES_PER_BOX: 6, // 6 pipes needed to make 1 box
} as const;

// Tier 4 Recipe Constants
export const TIER_4_RECIPES = {
  // Material costs for train components
  STEEL_PER_WHEEL: 2,
  WOOD_PER_WHEEL: 1,
  STEEL_PER_BOILER: 3,
  WOOD_PER_CABIN: 4,
  
  // Component costs for trains
  WHEELS_PER_TRAIN: 6,
  BOILERS_PER_TRAIN: 1,
  CABINS_PER_TRAIN: 1,
} as const;

// Tier 1 tools and automation (sticks)
export const AXES = [
  { key: 'hand', name: 'Bare Hands', level: 0, clickPower: 1, cost: 0 },
  { key: 'wood', name: 'Wooden Axe', level: 1, clickPower: 3, cost: 100 },
  { key: 'stone', name: 'Stone Axe', level: 2, clickPower: 8, cost: 1000 },
  { key: 'iron', name: 'Iron Axe', level: 3, clickPower: 20, cost: 10_000 },
  { key: 'steel', name: 'Steel Axe', level: 4, clickPower: 60, cost: 50_000 },
  { key: 'mythic', name: 'Mythic Axe', level: 5, clickPower: 200, cost: 100_000 }
 ] as const;

export const AUTOMATION = {
  lumberjack: { key: 'lumberjacks', name: 'Lumberjack', baseRate: 0.1, baseCost: 25, growth: 1.15 },
  foreman:     { key: 'foremen',      name: 'Foreman',     baseRate: 0.8, baseCost: 250, growth: 1.18 },
  loggingCamp: { key: 'loggingCamps', name: 'Logging Camp',baseRate: 4,   baseCost: 2000, growth: 1.2 },
  sawmill:     { key: 'sawmills',     name: 'Sawmill',     baseRate: 15,  baseCost: 9000, growth: 1.22 },
  arcaneGrove: { key: 'arcaneGrove',  name: 'Arcane Grove',baseRate: 60,  baseCost: 30000, growth: 1.25 }
} as const;

// Tier 2 tools and automation (beams)
export const PICKAXES = [
  { key: 'hand', name: 'Bare Hands', level: 0, clickPower: 1, cost: 0 },
  { key: 'stone', name: 'Stone Pickaxe', level: 1, clickPower: 3, cost: 100 },
  { key: 'iron', name: 'Iron Pickaxe', level: 2, clickPower: 8, cost: 1_000 },
  { key: 'steel', name: 'Steel Pickaxe', level: 3, clickPower: 20, cost: 10_000 },
  { key: 'titanium', name: 'Titanium Pickaxe', level: 4, clickPower: 60, cost: 100_000 },
  { key: 'mythic', name: 'Mythic Pickaxe', level: 5, clickPower: 200, cost: 1_000_000 }
 ] as const;

export const AUTOMATION_T2 = {
  miner:     { key: 'miners',    name: 'Miner',       baseRate: 0.1, baseCost: 25,   growth: 1.15 },
  smelter:   { key: 'smelters',  name: 'Smelter',     baseRate: 0.8, baseCost: 250,  growth: 1.18 },
  foundry:   { key: 'foundries', name: 'Foundry',     baseRate: 4,   baseCost: 2000, growth: 1.2 },
  beamMill:  { key: 'beamMills', name: 'Beam Mill',   baseRate: 15,  baseCost: 9000, growth: 1.22 },
  arcaneForge:{ key: 'arcaneForge',name: 'Arcane Forge',baseRate: 60, baseCost: 30000, growth: 1.25 }
} as const;

// Tier 3 automation (pipes, boxes)
export const AUTOMATION_T3_FORGE = {
  forge1: { key: 'forge1', name: 'Pipe Foundry',   baseRate: 0.5,       baseCost: 50,   growth: 1.15 },
  forge2: { key: 'forge2', name: 'Alloy Smelter',  baseRate: 1.0,       baseCost: 200,  growth: 1.16 },
  forge3: { key: 'forge3', name: 'Extrusion Press',baseRate: 2.0,       baseCost: 800,  growth: 1.18 },
  forge4: { key: 'forge4', name: 'Annealing Oven', baseRate: 4.0,       baseCost: 3200, growth: 1.2 },
  forge5: { key: 'forge5', name: 'Coating Line',   baseRate: 8.0,       baseCost: 12800,growth: 1.22 }
} as const;
export const AUTOMATION_T3_WELD = {
  weld1: { key: 'weld1', name: 'Welding Rig',     baseRate: (0.5) / 3, baseCost: 50,   growth: 1.15 },
  weld2: { key: 'weld2', name: 'Assembly Jig',    baseRate: (1.0) / 3, baseCost: 200,  growth: 1.16 },
  weld3: { key: 'weld3', name: 'Robotic Welder',  baseRate: (2.0) / 3, baseCost: 800,  growth: 1.18 },
  weld4: { key: 'weld4', name: 'Bracing Station', baseRate: (4.0) / 3, baseCost: 3200, growth: 1.2 },
  weld5: { key: 'weld5', name: 'Finishing Line',  baseRate: (8.0) / 3, baseCost: 12800,growth: 1.22 }
} as const;

// Tier 4 automation (wood, steel, wheels, boilers, cabins, trains)
export const AUTOMATION_T4_WHEEL = {
  wh1: { key: 'wh1', name: 'Spoke Shop',   baseRate: 0.5, baseCost: 10,   growth: 1.14 },
  wh2: { key: 'wh2', name: 'Lathe Line',   baseRate: 1.0, baseCost: 40,   growth: 1.15 },
  wh3: { key: 'wh3', name: 'Press Form',   baseRate: 2.0, baseCost: 160,  growth: 1.17 },
  wh4: { key: 'wh4', name: 'Rim Forge',    baseRate: 4.0, baseCost: 640,  growth: 1.19 },
  wh5: { key: 'wh5', name: 'Balancing Rig',baseRate: 8.0, baseCost: 2560, growth: 1.21 }
} as const;
export const AUTOMATION_T4_BOILER = {
  bl1: { key: 'bl1', name: 'Tube Rack',     baseRate: 0.4, baseCost: 8,    growth: 1.14 },
  bl2: { key: 'bl2', name: 'Sheet Roller',  baseRate: 0.8, baseCost: 32,   growth: 1.15 },
  bl3: { key: 'bl3', name: 'Shell Welder',  baseRate: 1.6, baseCost: 128,  growth: 1.17 },
  bl4: { key: 'bl4', name: 'Rivet Station', baseRate: 3.2, baseCost: 512,  growth: 1.19 },
  bl5: { key: 'bl5', name: 'Pressure Tester', baseRate: 6.4, baseCost: 2048, growth: 1.21 }
} as const;
export const AUTOMATION_T4_COACH = {
  cb1: { key: 'cb1', name: 'Carpentry Bench', baseRate: 0.3, baseCost: 6,    growth: 1.14 },
  cb2: { key: 'cb2', name: 'Upholstery Line', baseRate: 0.6, baseCost: 24,   growth: 1.15 },
  cb3: { key: 'cb3', name: 'Panel Bender',    baseRate: 1.2, baseCost: 96,   growth: 1.17 },
  cb4: { key: 'cb4', name: 'Paint Booth',     baseRate: 2.4, baseCost: 384,  growth: 1.19 },
  cb5: { key: 'cb5', name: 'Finishing Line',  baseRate: 4.8, baseCost: 1536, growth: 1.21 }
} as const;
export const AUTOMATION_T4_LUMBERJACK = {
  lj1: { key: 'lj1', name: 'Basic Axe',      baseRate: 0.8,  baseCost: 16,    growth: 1.13 },
  lj2: { key: 'lj2', name: 'Crosscut Saw',  baseRate: 1.6,  baseCost: 64,    growth: 1.14 },
  lj3: { key: 'lj3', name: 'Titanium Axe', baseRate: 3.2,  baseCost: 256,   growth: 1.16 },
  lj4: { key: 'lj4', name: 'Logging Crane', baseRate: 6.4,  baseCost: 1024,  growth: 1.18 },
  lj5: { key: 'lj5', name: 'Tree Processor',baseRate: 12.8, baseCost: 4096,  growth: 1.20 }
} as const;
export const AUTOMATION_T4_SMITHY = {
  sm1: { key: 'sm1', name: 'Forge Bellows', baseRate: 0.6, baseCost: 12,   growth: 1.13 },
  sm2: { key: 'sm2', name: 'Anvil Station', baseRate: 1.2, baseCost: 48,   growth: 1.14 },
  sm3: { key: 'sm3', name: 'Quench Tank',   baseRate: 2.4, baseCost: 192,  growth: 1.16 },
  sm4: { key: 'sm4', name: 'Power Hammer',  baseRate: 4.8, baseCost: 768,  growth: 1.18 },
  sm5: { key: 'sm5', name: 'Giga Furnace', baseRate: 9.6, baseCost: 3072, growth: 1.20 }
} as const;
export const AUTOMATION_T4_MECHANIC = {
  ta1: { key: 'ta1', name: 'Assembly Jig',  baseRate: 0.2, baseCost: 4,    growth: 1.15 },
  ta2: { key: 'ta2', name: 'Coupling Tools',baseRate: 0.4, baseCost: 16,   growth: 1.16 },
  ta3: { key: 'ta3', name: 'Hydraulic Lift',baseRate: 0.8, baseCost: 64,   growth: 1.18 },
  ta4: { key: 'ta4', name: 'Rolling Crane', baseRate: 1.6, baseCost: 256,  growth: 1.2 },
  ta5: { key: 'ta5', name: 'Assembly Line', baseRate: 3.2, baseCost: 1024, growth: 1.22 }
} as const;

// Late-game surplus production bonuses
// Intent: upstream producers eventually outpace downstream consumers without
// changing early/mid game pacing. Thresholds are set high so they rarely affect
// time-to-tier goals unless a guild invests very heavily.
export const PRODUCTION_SURPLUS = {
  T3_FORGE: { THRESHOLD_UNITS: 100, MAX_BONUS: 1.0 },         // up to +100% at ~2x threshold
  T4_LUMBERJACK: { THRESHOLD_UNITS: 100, MAX_BONUS: 1.0 },
  T4_SMITHY: { THRESHOLD_UNITS: 100, MAX_BONUS: 1.0 },
  T4_WHEEL: { THRESHOLD_UNITS: 100, MAX_BONUS: 1.0 },
  T4_BOILER: { THRESHOLD_UNITS: 100, MAX_BONUS: 1.0 },
  T4_COACH: { THRESHOLD_UNITS: 100, MAX_BONUS: 1.0 }
} as const;

// Click Upgrade Base Costs and Growth Rates
export const CLICK_UPGRADES = {
  TIER_3: {
    FORGER: { baseCostPipes: 600, growth: 1.25 },
    WELDER: { baseCostBoxes: 60, growth: 1.25 },
  },
  TIER_4: {
    LUMBERJACK: { baseCostWood: 50, growth: 1.25 },
    SMITHY: { baseCostSteel: 30, growth: 1.25 },
    WHEELWRIGHT: { baseCostWheels: 40, growth: 1.25 },
    BOILERMAKER: { baseCostBoilers: 20, growth: 1.25 },
    COACHBUILDER: { baseCostCabins: 10, growth: 1.25 },
    TRAINASSEMBLER: { baseCostTrains: 5, growth: 1.25 },
  },
} as const;

// Database Performance Settings
export const DATABASE = {
  WAL_MODE: 'WAL',
  SYNCHRONOUS: 'NORMAL',
  FOREIGN_KEYS: 'ON',
} as const;

// UI Color Schemes by Tier
export const UI_COLORS = {
  TIER_1: 0x2ecc71, // Green
  TIER_2: 0x3498db, // Blue  
  TIER_3: 0x9b59b6, // Purple
  TIER_4: 0xf39c12, // Orange
  WARNING: 0xe67e22, // Orange for confirmations
} as const;

// Prestige System
export const PRESTIGE = {
  MVP_COST_REDUCTION: 0.99, // 1% cost reduction per MVP award
} as const;

// Error Codes for better error handling
export const ERROR_CODES = {
  INSUFFICIENT_FUNDS: 'INSUFFICIENT_FUNDS',
  COOLDOWN_ACTIVE: 'COOLDOWN_ACTIVE',
  INVALID_ROLE: 'INVALID_ROLE',
  MAX_LEVEL_REACHED: 'MAX_LEVEL_REACHED',
  DATABASE_ERROR: 'DATABASE_ERROR',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
} as const;

// Validation Patterns
export const VALIDATION = {
  DISCORD_ID_PATTERN: /^\d{17,19}$/, // Discord snowflake IDs
  MAX_AUTOMATION_LEVEL: 1000, // Prevent overflow
  MAX_CONTRIBUTION: Number.MAX_SAFE_INTEGER,
} as const;

// Environment Variable Defaults
export const ENV_DEFAULTS = {
  BACKGROUND_TICK_ENABLED: 'true',
  BACKGROUND_TICK_MS: '15000',
  BACKGROUND_TICK_LOG: 'false',
} as const;
