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
