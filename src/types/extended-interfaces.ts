import { Guild, User } from '../game.js';

// Extended interfaces that include all tier-specific properties
export interface ExtendedGuild extends Guild {
  id: string;
  createdAt: number;
  widgetTier: number;
  inventory: {
    sticks: number;
    beams: number;
    pipes: number;
    boxes: number;
    wood: number;
    steel: number;
    wheels: number;
    boilers: number;
    cabins: number;
    trains: number;
  };
  axeLevel: number;
  pickaxeLevel: number;
  t3ForgerClickLevel: number;
  t3WelderClickLevel: number;
  t4LumberjackClickLevel: number;
  t4SmithyClickLevel: number;
  t4WheelwrightClickLevel: number;
  t4BoilermakerClickLevel: number;
  t4CoachbuilderClickLevel: number;
  t4TrainAssemblerClickLevel: number;
  prestigePoints: number;
}

export interface ExtendedUser extends User {
  contributedT1: number;
  contributedT2: number;
  contributedT3: number;
  contributedT4: number;
  role3: 'forger' | 'welder' | null;
  role4: 'wheelwright' | 'boilermaker' | 'coachbuilder' | 'mechanic' | 'smithy' | 'lumberjack' | null;
  automation3: {
    forge1: number;
    forge2: number;
    forge3: number;
    forge4: number;
    forge5: number;
    weld1: number;
    weld2: number;
    weld3: number;
    weld4: number;
    weld5: number;
  };
  automation4: {
    wh1: number; wh2: number; wh3: number; wh4: number; wh5: number;
    bl1: number; bl2: number; bl3: number; bl4: number; bl5: number;
    cb1: number; cb2: number; cb3: number; cb4: number; cb5: number;
    ta1: number; ta2: number; ta3: number; ta4: number; ta5: number;
    sm1: number; sm2: number; sm3: number; sm4: number; sm5: number;
    lj1: number; lj2: number; lj3: number; lj4: number; lj5: number;
  };
  rates: {
    sticksPerSec: number;
    beamsPerSec: number;
    pipesPerSec: number;
    boxesPerSec: number;
    wheelsPerSec: number;
    boilersPerSec: number;
    cabinsPerSec: number;
    woodPerSec?: number;
    steelPerSec?: number;
    trainsPerSec?: number;
  };
  weldPassiveEnabled: boolean;
  pipesProduced: number;
  boxesProduced: number;
  wheelsProduced: number;
  boilersProduced: number;
  cabinsProduced: number;
  prestigeMvpAwards: number;
  beams: number;
  pickaxeLevel: number;
  pickClickPower: number;
  automation2: {
    miners: number;
    smelters: number;
    foundries: number;
    beamMills: number;
    arcaneForge: number;
  };
}

// Type guards to safely cast between interfaces
export function asExtendedGuild(guild: Guild): ExtendedGuild {
  const extended = guild as any;
  return {
    ...guild,
    id: extended.id || '',
    createdAt: extended.createdAt || Date.now(),
    widgetTier: extended.widgetTier || 1,
    inventory: {
      sticks: extended.inventory?.sticks || 0,
      beams: extended.inventory?.beams || 0,
      pipes: extended.inventory?.pipes || 0,
      boxes: extended.inventory?.boxes || 0,
      wood: extended.inventory?.wood || 0,
      steel: extended.inventory?.steel || 0,
      wheels: extended.inventory?.wheels || 0,
      boilers: extended.inventory?.boilers || 0,
      cabins: extended.inventory?.cabins || 0,
      trains: extended.inventory?.trains || 0,
    },
    axeLevel: extended.axeLevel || 0,
    pickaxeLevel: extended.pickaxeLevel || 0,
    t3ForgerClickLevel: extended.t3ForgerClickLevel || 0,
    t3WelderClickLevel: extended.t3WelderClickLevel || 0,
    t4LumberjackClickLevel: extended.t4LumberjackClickLevel || 0,
    t4SmithyClickLevel: extended.t4SmithyClickLevel || 0,
    t4WheelwrightClickLevel: extended.t4WheelwrightClickLevel || 0,
    t4BoilermakerClickLevel: extended.t4BoilermakerClickLevel || 0,
    t4CoachbuilderClickLevel: extended.t4CoachbuilderClickLevel || 0,
    t4TrainAssemblerClickLevel: extended.t4TrainAssemblerClickLevel || 0,
    prestigePoints: extended.prestigePoints || 0,
  };
}

export function asExtendedUser(user: User): ExtendedUser {
  const extended = user as any;
  return {
    ...user,
    contributedT1: extended.contributedT1 || 0,
    contributedT2: extended.contributedT2 || 0,
    contributedT3: extended.contributedT3 || 0,
    contributedT4: extended.contributedT4 || 0,
    role3: extended.role3 || null,
    role4: extended.role4 || null,
    automation3: {
      forge1: extended.automation3?.forge1 || 0,
      forge2: extended.automation3?.forge2 || 0,
      forge3: extended.automation3?.forge3 || 0,
      forge4: extended.automation3?.forge4 || 0,
      forge5: extended.automation3?.forge5 || 0,
      weld1: extended.automation3?.weld1 || 0,
      weld2: extended.automation3?.weld2 || 0,
      weld3: extended.automation3?.weld3 || 0,
      weld4: extended.automation3?.weld4 || 0,
      weld5: extended.automation3?.weld5 || 0,
    },
    automation4: {
      wh1: extended.automation4?.wh1 || 0, wh2: extended.automation4?.wh2 || 0, wh3: extended.automation4?.wh3 || 0, wh4: extended.automation4?.wh4 || 0, wh5: extended.automation4?.wh5 || 0,
      bl1: extended.automation4?.bl1 || 0, bl2: extended.automation4?.bl2 || 0, bl3: extended.automation4?.bl3 || 0, bl4: extended.automation4?.bl4 || 0, bl5: extended.automation4?.bl5 || 0,
      cb1: extended.automation4?.cb1 || 0, cb2: extended.automation4?.cb2 || 0, cb3: extended.automation4?.cb3 || 0, cb4: extended.automation4?.cb4 || 0, cb5: extended.automation4?.cb5 || 0,
      ta1: extended.automation4?.ta1 || 0, ta2: extended.automation4?.ta2 || 0, ta3: extended.automation4?.ta3 || 0, ta4: extended.automation4?.ta4 || 0, ta5: extended.automation4?.ta5 || 0,
      sm1: extended.automation4?.sm1 || 0, sm2: extended.automation4?.sm2 || 0, sm3: extended.automation4?.sm3 || 0, sm4: extended.automation4?.sm4 || 0, sm5: extended.automation4?.sm5 || 0,
      lj1: extended.automation4?.lj1 || 0, lj2: extended.automation4?.lj2 || 0, lj3: extended.automation4?.lj3 || 0, lj4: extended.automation4?.lj4 || 0, lj5: extended.automation4?.lj5 || 0,
    },
    rates: {
      sticksPerSec: user.rates.sticksPerSec || 0,
      beamsPerSec: user.rates.beamsPerSec || 0,
      pipesPerSec: user.rates.pipesPerSec || 0,
      boxesPerSec: user.rates.boxesPerSec || 0,
      wheelsPerSec: user.rates.wheelsPerSec || 0,
      boilersPerSec: user.rates.boilersPerSec || 0,
      cabinsPerSec: user.rates.cabinsPerSec || 0,
      woodPerSec: extended.rates?.woodPerSec || 0,
      steelPerSec: extended.rates?.steelPerSec || 0,
      trainsPerSec: extended.rates?.trainsPerSec || 0,
    },
    weldPassiveEnabled: extended.weldPassiveEnabled !== false,
    pipesProduced: extended.pipesProduced || 0,
    boxesProduced: extended.boxesProduced || 0,
    wheelsProduced: extended.wheelsProduced || 0,
    boilersProduced: extended.boilersProduced || 0,
    cabinsProduced: extended.cabinsProduced || 0,
    prestigeMvpAwards: extended.prestigeMvpAwards || 0,
    beams: extended.beams || 0,
    pickaxeLevel: extended.pickaxeLevel || 0,
    pickClickPower: extended.pickClickPower || 1,
    automation2: {
      miners: extended.automation2?.miners || 0,
      smelters: extended.automation2?.smelters || 0,
      foundries: extended.automation2?.foundries || 0,
      beamMills: extended.automation2?.beamMills || 0,
      arcaneForge: extended.automation2?.arcaneForge || 0,
    },
  };
}
