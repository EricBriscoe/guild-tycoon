import {
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  TextDisplayBuilder,
  ContainerBuilder,
  SectionBuilder,
  ThumbnailBuilder
} from 'discord.js';
import {
  AXES,
  AUTOMATION,
  AUTOMATION_T2,
  AUTOMATION_T3_FORGE,
  AUTOMATION_T3_WELD,
  AUTOMATION_T4_LUMBERJACK,
  AUTOMATION_T4_SMITHY,
  AUTOMATION_T4_WHEEL,
  AUTOMATION_T4_BOILER,
  AUTOMATION_T4_COACH,
  AUTOMATION_T4_MECHANIC,
  axeByLevel,
  getNextAxe,
  getNextPick,
  pickByLevel,
  automationCost,
  canAfford,
  totalAutomationRate,
  totalAutomationRateT2,
  Guild,
  User,
  CHOP_COOLDOWN_MS,
  CHOP_REWARD_MULTIPLIER,
  T3_PIPE_PER_BOX
} from './game.js';
import { t3ForgerClickBase, t3WelderClickBase, t3ClickUpgradeCost, t3ClickUpgradeName, t4ClickUpgradeCost, t4ClickUpgradeName, t4LumberjackClickBase, t4SmithyClickBase, t4WheelwrightClickBase, t4BoilermakerClickBase, t4CoachbuilderClickBase, t4MechanicClickBase, T3_CLICK_LEVEL_MAX, T4_CLICK_LEVEL_MAX } from './game.js';

function fmt(n: number): string {
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2) + 'B';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(2) + 'K';
  return Math.floor(n).toString();
}

// Format small rates to 2 decimals, large using fmt()
function rateFmt(n: number): string {
  if (!isFinite(n)) return '0.00';
  if (Math.abs(n) < 1000) return n.toFixed(2);
  return fmt(n);
}

function progressBar(current: number, goal: number, width: number = 18): string {
  const ratio = Math.max(0, Math.min(1, goal > 0 ? current / goal : 0));
  const filled = Math.round(ratio * width);
  const empty = width - filled;
  return '█'.repeat(filled) + '░'.repeat(empty) + ` ${Math.floor(ratio * 100)}%`;
}

export function renderTycoon(guild: Guild, user: User) {
  const tier = (guild as any).widgetTier || 1;
  if (tier === 4) {
    // Tier 4: Trains
    const role = (user as any).role4 || null;
    const now = Date.now();
    const remainingMs = Math.max(0, (user.lastChopAt || 0) + CHOP_COOLDOWN_MS - now);
    const readyAtSec = Math.floor(((user.lastChopAt || 0) + CHOP_COOLDOWN_MS) / 1000);
    const chopReady = remainingMs <= 0;
    const chopSeconds = Math.ceil(remainingMs / 1000);
    const perClick = {
      lumberjack: t4LumberjackClickBase(guild) * CHOP_REWARD_MULTIPLIER,
      smithy: t4SmithyClickBase(guild) * CHOP_REWARD_MULTIPLIER,
      wheelwright: t4WheelwrightClickBase(guild) * CHOP_REWARD_MULTIPLIER,
      boilermaker: t4BoilermakerClickBase(guild) * CHOP_REWARD_MULTIPLIER,
      coachbuilder: t4CoachbuilderClickBase(guild) * CHOP_REWARD_MULTIPLIER,
      mechanic: t4MechanicClickBase(guild) * CHOP_REWARD_MULTIPLIER
    } as any;
    const nextChopLine = chopReady ? 'Next Action: Ready now' : `Next Action: <t:${readyAtSec}:R> • <t:${readyAtSec}:T>`;

    const header = new TextDisplayBuilder()
      .setContent('# 🎮 Guild Tycoon — Tier 4: Trains 🚂\n\nHarvest, forge, craft parts, and assemble trains.');

    if (!role) {
      const chooseHeader = new TextDisplayBuilder().setContent('## Choose Your Role');
      const roles = [
        { key: 'lumberjack', label: 'Lumberjack — Harvests wood', emoji: '🌲' },
        { key: 'smithy', label: 'Smithy — Forges steel', emoji: '⚒️' },
        { key: 'wheelwright', label: 'Wheelwright — Crafts wheels (2 wood + 1 steel)', emoji: '🛞' },
        { key: 'boilermaker', label: 'Boilermaker — Builds boilers (3 steel)', emoji: '🔥' },
        { key: 'coachbuilder', label: 'Coachbuilder — Builds cabins (4 wood)', emoji: '🚃' },
        { key: 'mechanic', label: 'Mechanic — Assembles trains (6 wheels + 1 boiler + 1 cabin)', emoji: '🚂' }
      ];
      const sections = roles.map(r => new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${r.emoji} ${r.label}`))
        .setButtonAccessory(new ButtonBuilder().setCustomId(`tycoon:t4:choose:${r.key}`).setStyle(ButtonStyle.Primary).setLabel(`Become ${r.key[0].toUpperCase()}${r.key.slice(1)}`))
      );
      const inv = (guild as any).inventory || {};
      const guildSection = new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`## Guild • Tier 4 Progress`),
          new TextDisplayBuilder().setContent(`Inventory: Wood ${fmt(inv.wood || 0)} • Steel ${fmt(inv.steel || 0)} • Wheels ${fmt(inv.wheels || 0)} • Boilers ${fmt(inv.boilers || 0)} • Cabins ${fmt(inv.cabins || 0)} • Trains ${fmt(inv.trains || 0)}\n**Tier Progress (trains):** ${fmt(guild.tierProgress)} / ${fmt(guild.tierGoal)}\n${progressBar(guild.tierProgress, guild.tierGoal)}`)
        )
        .setButtonAccessory(
          new ButtonBuilder().setCustomId('tycoon:tier4:advance').setStyle(guild.tierProgress >= guild.tierGoal ? ButtonStyle.Success : ButtonStyle.Secondary).setDisabled(!(guild.tierProgress >= guild.tierGoal)).setLabel(guild.tierProgress >= guild.tierGoal ? 'Enter Prestige' : 'Prestige Locked')
        );
      const container = new ContainerBuilder()
        .setAccentColor(0xf39c12)
        .addTextDisplayComponents(header, chooseHeader)
        .addSectionComponents(...sections, guildSection);
      return { components: [container], flags: (MessageFlags as any).IsComponentsV2 };
    }

    // Role is chosen
    const rateForRole = (r: string) => (r === 'lumberjack' ? (user as any).rates?.woodPerSec : r === 'smithy' ? (user as any).rates?.steelPerSec : r === 'wheelwright' ? (user as any).rates?.wheelsPerSec : r === 'boilermaker' ? (user as any).rates?.boilersPerSec : r === 'coachbuilder' ? (user as any).rates?.cabinsPerSec : (user as any).rates?.trainsPerSec) || 0;
    const roleActionLabel = (r: string) => r === 'lumberjack' ? 'Chop' : r === 'smithy' ? 'Forge' : r === 'wheelwright' ? 'Craft' : r === 'boilermaker' ? 'Build' : r === 'coachbuilder' ? 'Carve' : 'Assemble';
    const unitLabel = (r: string) => r === 'lumberjack' ? 'wood' : r === 'smithy' ? 'steel' : r === 'wheelwright' ? 'wheels' : r === 'boilermaker' ? 'boilers' : r === 'coachbuilder' ? 'cabins' : 'trains';
    let productionToggle: any = null;
    let resourceControl: any = null;
    const playerRole = new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## You\nRole: ${role} • Rate: ${rateFmt(rateForRole(role))}/s\n${nextChopLine}`))
      .setButtonAccessory(new ButtonBuilder().setCustomId('tycoon:chop').setStyle(chopReady ? ButtonStyle.Primary : ButtonStyle.Secondary).setDisabled(!chopReady).setLabel(chopReady ? `${roleActionLabel(role)} (+${fmt(perClick[role])} ${unitLabel(role)})` : `Cooling (${chopSeconds}s)`));

    // Role-based passive toggle for Tier 4 consumers
    if (role === 'wheelwright') {
      const on = (user as any).wheelPassiveEnabled !== false;
      const toggleId = on ? 'tycoon:t4toggle:wheel:off' : 'tycoon:t4toggle:wheel:on';
      const label = on ? 'Passive Wheels: On' : 'Passive Wheels: Off';
      productionToggle = new SectionBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent('Production Control')).setButtonAccessory(new ButtonBuilder().setCustomId(toggleId).setStyle(on ? ButtonStyle.Primary : ButtonStyle.Secondary).setLabel(label));
    } else if (role === 'boilermaker') {
      const on = (user as any).boilerPassiveEnabled !== false;
      const toggleId = on ? 'tycoon:t4toggle:boiler:off' : 'tycoon:t4toggle:boiler:on';
      const label = on ? 'Passive Boilers: On' : 'Passive Boilers: Off';
      productionToggle = new SectionBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent('Production Control')).setButtonAccessory(new ButtonBuilder().setCustomId(toggleId).setStyle(on ? ButtonStyle.Primary : ButtonStyle.Secondary).setLabel(label));
    } else if (role === 'coachbuilder') {
      const on = (user as any).coachPassiveEnabled !== false;
      const toggleId = on ? 'tycoon:t4toggle:coach:off' : 'tycoon:t4toggle:coach:on';
      const label = on ? 'Passive Cabins: On' : 'Passive Cabins: Off';
      productionToggle = new SectionBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent('Production Control')).setButtonAccessory(new ButtonBuilder().setCustomId(toggleId).setStyle(on ? ButtonStyle.Primary : ButtonStyle.Secondary).setLabel(label));
    } else if (role === 'mechanic') {
      const on = (user as any).mechPassiveEnabled !== false;
      const toggleId = on ? 'tycoon:t4toggle:mech:off' : 'tycoon:t4toggle:mech:on';
      const label = on ? 'Passive Trains: On' : 'Passive Trains: Off';
      productionToggle = new SectionBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent('Production Control')).setButtonAccessory(new ButtonBuilder().setCustomId(toggleId).setStyle(on ? ButtonStyle.Primary : ButtonStyle.Secondary).setLabel(label));
    }

    // Upstream control to pause downstream auto-consumers
    if (role === 'lumberjack' || role === 'smithy' || role === 'wheelwright' || role === 'boilermaker' || role === 'coachbuilder') {
      resourceControl = new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('Resource Control'))
        .setButtonAccessory(new ButtonBuilder().setCustomId('tycoon:t4:disable:consumers').setStyle(ButtonStyle.Danger).setLabel('Pause Auto-Consumers'));
    }

    // Click upgrade section (shared per role)
    const levelMap: any = {
      lumberjack: (guild as any).t4LumberjackClickLevel || 0,
      smithy: (guild as any).t4SmithyClickLevel || 0,
      wheelwright: (guild as any).t4WheelwrightClickLevel || 0,
      boilermaker: (guild as any).t4BoilermakerClickLevel || 0,
      coachbuilder: (guild as any).t4CoachbuilderClickLevel || 0,
      mechanic: (guild as any).t4MechanicClickLevel || 0
    };
    const currencyInvMap: any = {
      lumberjack: (guild as any).inventory?.wood || 0,
      smithy: (guild as any).inventory?.steel || 0,
      wheelwright: (guild as any).inventory?.wheels || 0,
      boilermaker: (guild as any).inventory?.boilers || 0,
      coachbuilder: (guild as any).inventory?.cabins || 0,
      mechanic: (guild as any).inventory?.trains || 0
    };
    const lvl = levelMap[role];
    const isMax4 = lvl >= T4_CLICK_LEVEL_MAX;
    const cost = isMax4 ? 0 : t4ClickUpgradeCost(role as any, lvl);
    const canBuyClick = !isMax4 && canAfford(currencyInvMap[role], cost);
    const currentName = t4ClickUpgradeName(role as any, Math.min(lvl, T4_CLICK_LEVEL_MAX));
    const nextName = isMax4 ? 'Maxed' : t4ClickUpgradeName(role as any, lvl + 1);
    const clickSection = new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `## ${role[0].toUpperCase()}${role.slice(1)} Click Upgrade (Shared)\n` +
        `Current: ${currentName} • +${fmt(perClick[role])} ${unitLabel(role)}/click\n` +
        (isMax4 ? `Next: Maxed` : `Next: ${nextName} — Cost ${fmt(cost)} ${unitLabel(role)}`)
      ))
      .setButtonAccessory(
        new ButtonBuilder()
          .setCustomId(`tycoon:buy:t4click:${role}`)
          .setStyle(canBuyClick ? ButtonStyle.Success : ButtonStyle.Secondary)
          .setDisabled(!canBuyClick)
          .setLabel(isMax4 ? 'Maxed' : 'Buy Upgrade')
      );

    // Automation sections per role
    const inv = (guild as any).inventory || {};
    const autoSections: any[] = [];
    function pushAuto(defs: any, owned: any, emoji: string, name: string, key: string, invAmt: number) {
      const def = (defs as any)[key];
      const cost = automationCost(def, owned[key] || 0);
      const afford = canAfford(invAmt, cost);
      autoSections.push(new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${emoji} **${name}**\nOwned: ${owned[key] || 0} • +${def.baseRate.toFixed(2)}/s each`))
        .setButtonAccessory(new ButtonBuilder().setCustomId(`tycoon:buy:auto:${key}`).setStyle(afford ? ButtonStyle.Success : ButtonStyle.Secondary).setDisabled(!afford).setLabel(`${fmt(cost)}`))
      );
    }
    if (role === 'lumberjack') {
      const owned = (user as any).automation4 || {};
      const defs = AUTOMATION_T4_LUMBERJACK as any;
      const invAmt = inv.wood || 0;
      pushAuto(defs, owned, '🪵', 'Hand Axe', 'lj1', invAmt);
      pushAuto(defs, owned, '🪚', 'Crosscut Saw', 'lj2', invAmt);
      pushAuto(defs, owned, '🪓', 'Felling Wedge', 'lj3', invAmt);
      pushAuto(defs, owned, '🏗️', 'Logging Crane', 'lj4', invAmt);
      pushAuto(defs, owned, '🌲', 'Tree Processor', 'lj5', invAmt);
    } else if (role === 'smithy') {
      const owned = (user as any).automation4 || {};
      const defs = AUTOMATION_T4_SMITHY as any;
      const invAmt = inv.steel || 0;
      pushAuto(defs, owned, '🔥', 'Forge Bellows', 'sm1', invAmt);
      pushAuto(defs, owned, '🛠️', 'Anvil Station', 'sm2', invAmt);
      pushAuto(defs, owned, '💧', 'Quench Tank', 'sm3', invAmt);
      pushAuto(defs, owned, '🔨', 'Power Hammer', 'sm4', invAmt);
      pushAuto(defs, owned, '🏭', 'Blast Furnace', 'sm5', invAmt);
    } else if (role === 'wheelwright') {
      const owned = (user as any).automation4 || {};
      const defs = AUTOMATION_T4_WHEEL as any;
      const invAmt = inv.wheels || 0;
      pushAuto(defs, owned, '🛞', 'Spoke Shop', 'wh1', invAmt);
      pushAuto(defs, owned, '🛞', 'Lathe Line', 'wh2', invAmt);
      pushAuto(defs, owned, '🛞', 'Press Form', 'wh3', invAmt);
      pushAuto(defs, owned, '🛞', 'Rim Forge', 'wh4', invAmt);
      pushAuto(defs, owned, '🛞', 'Balancing Rig', 'wh5', invAmt);
    } else if (role === 'boilermaker') {
      const owned = (user as any).automation4 || {};
      const defs = AUTOMATION_T4_BOILER as any;
      const invAmt = inv.boilers || 0;
      pushAuto(defs, owned, '🔥', 'Tube Rack', 'bl1', invAmt);
      pushAuto(defs, owned, '🔥', 'Sheet Roller', 'bl2', invAmt);
      pushAuto(defs, owned, '🔥', 'Shell Welder', 'bl3', invAmt);
      pushAuto(defs, owned, '🔥', 'Rivet Station', 'bl4', invAmt);
      pushAuto(defs, owned, '🔥', 'Pressure Tester', 'bl5', invAmt);
    } else if (role === 'coachbuilder') {
      const owned = (user as any).automation4 || {};
      const defs = AUTOMATION_T4_COACH as any;
      const invAmt = inv.cabins || 0;
      pushAuto(defs, owned, '🚃', 'Carpentry Bench', 'cb1', invAmt);
      pushAuto(defs, owned, '🚃', 'Upholstery Line', 'cb2', invAmt);
      pushAuto(defs, owned, '🚃', 'Panel Bender', 'cb3', invAmt);
      pushAuto(defs, owned, '🚃', 'Paint Booth', 'cb4', invAmt);
      pushAuto(defs, owned, '🚃', 'Finishing Line', 'cb5', invAmt);
    } else if (role === 'mechanic') {
      const owned = (user as any).automation4 || {};
      const defs = AUTOMATION_T4_MECHANIC as any;
      const invAmt = inv.trains || 0;
      pushAuto(defs, owned, '🚂', 'Assembly Jig', 'ta1', invAmt);
      pushAuto(defs, owned, '🚂', 'Coupling Tools', 'ta2', invAmt);
      pushAuto(defs, owned, '🚂', 'Hydraulic Lift', 'ta3', invAmt);
      pushAuto(defs, owned, '🚂', 'Rolling Crane', 'ta4', invAmt);
      pushAuto(defs, owned, '🚂', 'Assembly Line', 'ta5', invAmt);
    }

    const refreshSection = new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent('Refresh Data'))
      .setButtonAccessory(new ButtonBuilder().setCustomId('tycoon:refresh').setStyle(ButtonStyle.Secondary).setEmoji('🔄').setLabel('Refresh'));

    const inv2 = (guild as any).inventory || {};
    const guildSection = new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## Guild • Tier 4 Progress\n**Inventory:** Wood ${fmt(inv2.wood || 0)} • Steel ${fmt(inv2.steel || 0)} • Wheels ${fmt(inv2.wheels || 0)} • Boilers ${fmt(inv2.boilers || 0)} • Cabins ${fmt(inv2.cabins || 0)} • Trains ${fmt(inv2.trains || 0)}\n**Tier Progress (trains):** ${fmt(guild.tierProgress)} / ${fmt(guild.tierGoal)}\n${progressBar(guild.tierProgress, guild.tierGoal)}`))
      .setButtonAccessory(new ButtonBuilder().setCustomId('tycoon:tier4:advance').setStyle(guild.tierProgress >= guild.tierGoal ? ButtonStyle.Success : ButtonStyle.Secondary).setDisabled(!(guild.tierProgress >= guild.tierGoal)).setLabel(guild.tierProgress >= guild.tierGoal ? 'Enter Prestige' : 'Prestige Locked'));

    const container = new ContainerBuilder()
      .setAccentColor(0xf39c12)
      .addTextDisplayComponents(header)
      .addSectionComponents(
        playerRole,
        ...(productionToggle ? [productionToggle] : []),
        ...(resourceControl ? [resourceControl] : []),
        refreshSection,
        guildSection,
        clickSection,
        ...autoSections
      );
    return { components: [container], flags: (MessageFlags as any).IsComponentsV2 };
  } else if (tier === 3) {
    // Tier 3: Steel Boxes
    const role = (user as any).role3 || null;
    const now = Date.now();
    const remainingMs = Math.max(0, (user.lastChopAt || 0) + CHOP_COOLDOWN_MS - now);
    const readyAtSec = Math.floor(((user.lastChopAt || 0) + CHOP_COOLDOWN_MS) / 1000);
    const chopReady = remainingMs <= 0;
    const chopSeconds = Math.ceil(remainingMs / 1000);
    const perClickPipes = t3ForgerClickBase(guild) * CHOP_REWARD_MULTIPLIER;
    const perClickBoxes = t3WelderClickBase(guild) * CHOP_REWARD_MULTIPLIER;
    const nextChopLine = chopReady ? 'Next Action: Ready now' : `Next Action: <t:${readyAtSec}:R> • <t:${readyAtSec}:T>`;

    const owned3 = {
      forge1: (user as any).automation3?.forge1 || 0,
      forge2: (user as any).automation3?.forge2 || 0,
      forge3: (user as any).automation3?.forge3 || 0,
      forge4: (user as any).automation3?.forge4 || 0,
      forge5: (user as any).automation3?.forge5 || 0,
      weld1: (user as any).automation3?.weld1 || 0,
      weld2: (user as any).automation3?.weld2 || 0,
      weld3: (user as any).automation3?.weld3 || 0,
      weld4: (user as any).automation3?.weld4 || 0,
      weld5: (user as any).automation3?.weld5 || 0
    };
    const costs3 = {
      forge1: automationCost((AUTOMATION_T3_FORGE as any).forge1, owned3.forge1),
      forge2: automationCost((AUTOMATION_T3_FORGE as any).forge2, owned3.forge2),
      forge3: automationCost((AUTOMATION_T3_FORGE as any).forge3, owned3.forge3),
      forge4: automationCost((AUTOMATION_T3_FORGE as any).forge4, owned3.forge4),
      forge5: automationCost((AUTOMATION_T3_FORGE as any).forge5, owned3.forge5),
      weld1: automationCost((AUTOMATION_T3_WELD as any).weld1, owned3.weld1),
      weld2: automationCost((AUTOMATION_T3_WELD as any).weld2, owned3.weld2),
      weld3: automationCost((AUTOMATION_T3_WELD as any).weld3, owned3.weld3),
      weld4: automationCost((AUTOMATION_T3_WELD as any).weld4, owned3.weld4),
      weld5: automationCost((AUTOMATION_T3_WELD as any).weld5, owned3.weld5)
    } as any;
    const invPipes = (guild as any).inventory?.pipes || 0;
    const invBoxes = (guild as any).inventory?.boxes || 0;
    const canBuy3 = {
      forge1: canAfford(invPipes, (costs3 as any).forge1),
      forge2: canAfford(invPipes, (costs3 as any).forge2),
      forge3: canAfford(invPipes, (costs3 as any).forge3),
      forge4: canAfford(invPipes, (costs3 as any).forge4),
      forge5: canAfford(invPipes, (costs3 as any).forge5),
      weld1: canAfford(invBoxes, (costs3 as any).weld1),
      weld2: canAfford(invBoxes, (costs3 as any).weld2),
      weld3: canAfford(invBoxes, (costs3 as any).weld3),
      weld4: canAfford(invBoxes, (costs3 as any).weld4),
      weld5: canAfford(invBoxes, (costs3 as any).weld5)
    } as any;

    const header = new TextDisplayBuilder()
      .setContent('# 🎮 Guild Tycoon — Tier 3: Steel Boxes 📦\n\nCoordinate forgers and welders to craft steel boxes.');

    let player: any;
    if (!role) {
      const chooseHeader = new TextDisplayBuilder().setContent('## Choose Your Role');
      const forgerSection = new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent('🔧 Forger — Forges steel pipes')
        )
        .setButtonAccessory(
          new ButtonBuilder().setCustomId('tycoon:t3:choose:forger').setStyle(ButtonStyle.Primary).setLabel('Become Forger')
        );
      const welderSection = new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent('🔩 Welder — Welds pipes into boxes (6 pipes → 1 box)')
        )
        .setButtonAccessory(
          new ButtonBuilder().setCustomId('tycoon:t3:choose:welder').setStyle(ButtonStyle.Primary).setLabel('Become Welder')
        );

      const readyForTier4_choose = guild.tierProgress >= guild.tierGoal;
      const guildSection = new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent('## Guild • Tier 3 Progress'),
          new TextDisplayBuilder().setContent(`**Inventory:** Pipes ${fmt((guild as any).inventory?.pipes || 0)} • Boxes ${fmt((guild as any).inventory?.boxes || 0)}\n**Tier Progress (boxes):** ${fmt(guild.tierProgress)} / ${fmt(guild.tierGoal)}\n${progressBar(guild.tierProgress, guild.tierGoal)}`)
        )
        .setButtonAccessory(
          new ButtonBuilder()
            .setCustomId('tycoon:tier4:advance')
            .setStyle(readyForTier4_choose ? ButtonStyle.Success : ButtonStyle.Secondary)
            .setDisabled(!readyForTier4_choose)
            .setLabel(readyForTier4_choose ? 'Enter Tier 4' : 'Tier 4 Locked')
        );

      const container = new ContainerBuilder()
        .setAccentColor(0x9b59b6)
        .addTextDisplayComponents(header, chooseHeader)
        .addSectionComponents(forgerSection, welderSection, guildSection);
      return { components: [container], flags: (MessageFlags as any).IsComponentsV2 };
    }

    // Role is chosen
    const roleLine = role === 'forger'
      ? `Role: Forger • Pipes rate: ${rateFmt((user as any).rates?.pipesPerSec || 0)}/s`
      : `Role: Welder • Boxes rate: ${rateFmt((user as any).rates?.boxesPerSec || 0)}/s\nUses ${T3_PIPE_PER_BOX} pipes/box`;
    const actionLabel = role === 'forger'
      ? (chopReady ? `Forge (+${fmt(perClickPipes)} pipes)` : `Cooling (${chopSeconds}s)`) 
      : (chopReady ? `Weld (+${fmt(perClickBoxes)} boxes)` : `Cooling (${chopSeconds}s)`);
    const playerRole = new SectionBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`## You\n${roleLine}\n${nextChopLine}`)
      )
      .setButtonAccessory(
        new ButtonBuilder()
          .setCustomId('tycoon:chop')
          .setStyle(chopReady ? ButtonStyle.Primary : ButtonStyle.Secondary)
          .setDisabled(!chopReady)
          .setLabel(actionLabel)
      );

    const switchTarget = role === 'forger' ? 'welder' : 'forger';
    // Always route through confirm warning for any role switch
    const switchCustomId = `tycoon:t3:switch:${switchTarget}`;
    const switchBtn = new ButtonBuilder().setCustomId(switchCustomId).setStyle(ButtonStyle.Secondary).setLabel(`Switch to ${switchTarget === 'forger' ? 'Forger' : 'Welder'}`);
    const switchRole = new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`Change Role`))
      .setButtonAccessory(switchBtn);

    let weldControls: any = null;
    let resourceControl: any = null;
    if (role === 'welder') {
      const enabled = (user as any).weldPassiveEnabled !== false;
      const toggleId = enabled ? 'tycoon:t3:weldtoggle:off' : 'tycoon:t3:weldtoggle:on';
      const label = enabled ? 'Passive Welding: On' : 'Passive Welding: Off';
      weldControls = new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('Welding Control'))
        .setButtonAccessory(new ButtonBuilder().setCustomId(toggleId).setStyle(enabled ? ButtonStyle.Primary : ButtonStyle.Secondary).setLabel(label));
    } else if (role === 'forger') {
      // Upstream control: allow forgers to pause downstream auto-consumers (welders)
      resourceControl = new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('Resource Control'))
        .setButtonAccessory(
          new ButtonBuilder()
            .setCustomId('tycoon:t3:disable:consumers')
            .setStyle(ButtonStyle.Danger)
            .setLabel('Pause Auto-Consumers')
        );
    }

    const refreshSection = new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent('Refresh Data'))
      .setButtonAccessory(
        new ButtonBuilder().setCustomId('tycoon:refresh').setStyle(ButtonStyle.Secondary).setEmoji('🔄').setLabel('Refresh')
      );

    // Shared click upgrade per role — show only the viewer's role
    const fLvl = ((guild as any).t3ForgerClickLevel || 0) as number;
    const wLvl = ((guild as any).t3WelderClickLevel || 0) as number;
    const fCost = t3ClickUpgradeCost('forger', fLvl);
    const wCost = t3ClickUpgradeCost('welder', wLvl);
    const canBuyClickForger = canAfford(invPipes, fCost);
    const canBuyClickWelder = canAfford(invBoxes, wCost);
    let clickSection: any;
    if (role === 'forger') {
      const currentName = t3ClickUpgradeName('forger', fLvl);
      const isMax3F = fLvl >= T3_CLICK_LEVEL_MAX;
      const nextName = isMax3F ? 'Maxed' : t3ClickUpgradeName('forger', fLvl + 1);
      const perClick = t3ForgerClickBase(guild) * CHOP_REWARD_MULTIPLIER;
      clickSection = new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `## Forger Click Upgrade (Shared)\n`+
            `Current: ${currentName} • +${fmt(perClick)} pipes/click\n`+
            (isMax3F ? `Next: Maxed` : `Next: ${nextName} — Cost ${fmt(fCost)} pipes`)
          )
        )
        .setButtonAccessory(
          new ButtonBuilder()
            .setCustomId('tycoon:buy:t3click:forger')
            .setStyle((!isMax3F && canBuyClickForger) ? ButtonStyle.Success : ButtonStyle.Secondary)
            .setDisabled(isMax3F || !canBuyClickForger)
            .setLabel(isMax3F ? 'Maxed' : 'Buy Upgrade')
        );
    } else {
      const currentName = t3ClickUpgradeName('welder', wLvl);
      const isMax3W = wLvl >= T3_CLICK_LEVEL_MAX;
      const nextName = isMax3W ? 'Maxed' : t3ClickUpgradeName('welder', wLvl + 1);
      const perClick = t3WelderClickBase(guild) * CHOP_REWARD_MULTIPLIER;
      clickSection = new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `## Welder Click Upgrade (Shared)\n`+
            `Current: ${currentName} • +${fmt(perClick)} boxes/click\n`+
            (isMax3W ? `Next: Maxed` : `Next: ${nextName} — Cost ${fmt(wCost)} boxes`)
          )
        )
        .setButtonAccessory(
          new ButtonBuilder()
            .setCustomId('tycoon:buy:t3click:welder')
            .setStyle((!isMax3W && canBuyClickWelder) ? ButtonStyle.Success : ButtonStyle.Secondary)
            .setDisabled(isMax3W || !canBuyClickWelder)
            .setLabel(isMax3W ? 'Maxed' : 'Buy Upgrade')
        );
    }

    const readyForTier4 = guild.tierProgress >= guild.tierGoal;
    const guildSection = new SectionBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`## Guild • Tier 3 Progress\n**Inventory:** Pipes ${fmt((guild as any).inventory?.pipes || 0)} • Boxes ${fmt((guild as any).inventory?.boxes || 0)}\n**Tier Progress (boxes):** ${fmt(guild.tierProgress)} / ${fmt(guild.tierGoal)}\n${progressBar(guild.tierProgress, guild.tierGoal)}`)
      )
      .setButtonAccessory(
        new ButtonBuilder()
          .setCustomId('tycoon:tier4:advance')
          .setStyle(readyForTier4 ? ButtonStyle.Success : ButtonStyle.Secondary)
          .setDisabled(!readyForTier4)
          .setLabel(readyForTier4 ? 'Enter Tier 4' : 'Tier 4 Locked')
      );

    // Automation purchase sections depending on role
    const autoSections: any[] = [];
    if (role === 'forger') {
      autoSections.push(
        new SectionBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(`🏭 **Pipe Foundry**\nOwned: ${owned3.forge1} • +${(AUTOMATION_T3_FORGE as any).forge1.baseRate.toFixed(2)}/s each`)).setButtonAccessory(new ButtonBuilder().setCustomId('tycoon:buy:auto:forge1').setStyle((canBuy3 as any).forge1 ? ButtonStyle.Success : ButtonStyle.Secondary).setDisabled(!(canBuy3 as any).forge1).setLabel(`${fmt((costs3 as any).forge1)}`)),
        new SectionBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(`🔥 **Alloy Smelter**\nOwned: ${owned3.forge2} • +${(AUTOMATION_T3_FORGE as any).forge2.baseRate.toFixed(2)}/s each`)).setButtonAccessory(new ButtonBuilder().setCustomId('tycoon:buy:auto:forge2').setStyle((canBuy3 as any).forge2 ? ButtonStyle.Success : ButtonStyle.Secondary).setDisabled(!(canBuy3 as any).forge2).setLabel(`${fmt((costs3 as any).forge2)}`)),
        new SectionBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(`🧱 **Extrusion Press**\nOwned: ${owned3.forge3} • +${(AUTOMATION_T3_FORGE as any).forge3.baseRate.toFixed(2)}/s each`)).setButtonAccessory(new ButtonBuilder().setCustomId('tycoon:buy:auto:forge3').setStyle((canBuy3 as any).forge3 ? ButtonStyle.Success : ButtonStyle.Secondary).setDisabled(!(canBuy3 as any).forge3).setLabel(`${fmt((costs3 as any).forge3)}`)),
        new SectionBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(`🔥 **Annealing Oven**\nOwned: ${owned3.forge4} • +${(AUTOMATION_T3_FORGE as any).forge4.baseRate.toFixed(2)}/s each`)).setButtonAccessory(new ButtonBuilder().setCustomId('tycoon:buy:auto:forge4').setStyle((canBuy3 as any).forge4 ? ButtonStyle.Success : ButtonStyle.Secondary).setDisabled(!(canBuy3 as any).forge4).setLabel(`${fmt((costs3 as any).forge4)}`)),
        new SectionBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(`✨ **Coating Line**\nOwned: ${owned3.forge5} • +${(AUTOMATION_T3_FORGE as any).forge5.baseRate.toFixed(2)}/s each`)).setButtonAccessory(new ButtonBuilder().setCustomId('tycoon:buy:auto:forge5').setStyle((canBuy3 as any).forge5 ? ButtonStyle.Success : ButtonStyle.Secondary).setDisabled(!(canBuy3 as any).forge5).setLabel(`${fmt((costs3 as any).forge5)}`))
      );
    } else {
      autoSections.push(
        new SectionBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(`🔧 **Welding Rig**\nOwned: ${owned3.weld1} • +${(AUTOMATION_T3_WELD as any).weld1.baseRate.toFixed(2)}/s each (unconstrained)`)).setButtonAccessory(new ButtonBuilder().setCustomId('tycoon:buy:auto:weld1').setStyle((canBuy3 as any).weld1 ? ButtonStyle.Success : ButtonStyle.Secondary).setDisabled(!(canBuy3 as any).weld1).setLabel(`${fmt((costs3 as any).weld1)}`)),
        new SectionBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(`🛠️ **Assembly Jig**\nOwned: ${owned3.weld2} • +${(AUTOMATION_T3_WELD as any).weld2.baseRate.toFixed(2)}/s each`)).setButtonAccessory(new ButtonBuilder().setCustomId('tycoon:buy:auto:weld2').setStyle((canBuy3 as any).weld2 ? ButtonStyle.Success : ButtonStyle.Secondary).setDisabled(!(canBuy3 as any).weld2).setLabel(`${fmt((costs3 as any).weld2)}`)),
        new SectionBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(`🤖 **Robotic Welder**\nOwned: ${owned3.weld3} • +${(AUTOMATION_T3_WELD as any).weld3.baseRate.toFixed(2)}/s each`)).setButtonAccessory(new ButtonBuilder().setCustomId('tycoon:buy:auto:weld3').setStyle((canBuy3 as any).weld3 ? ButtonStyle.Success : ButtonStyle.Secondary).setDisabled(!(canBuy3 as any).weld3).setLabel(`${fmt((costs3 as any).weld3)}`)),
        new SectionBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(`🧱 **Bracing Station**\nOwned: ${owned3.weld4} • +${(AUTOMATION_T3_WELD as any).weld4.baseRate.toFixed(2)}/s each`)).setButtonAccessory(new ButtonBuilder().setCustomId('tycoon:buy:auto:weld4').setStyle((canBuy3 as any).weld4 ? ButtonStyle.Success : ButtonStyle.Secondary).setDisabled(!(canBuy3 as any).weld4).setLabel(`${fmt((costs3 as any).weld4)}`)),
        new SectionBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(`✨ **Finishing Line**\nOwned: ${owned3.weld5} • +${(AUTOMATION_T3_WELD as any).weld5.baseRate.toFixed(2)}/s each`)).setButtonAccessory(new ButtonBuilder().setCustomId('tycoon:buy:auto:weld5').setStyle((canBuy3 as any).weld5 ? ButtonStyle.Success : ButtonStyle.Secondary).setDisabled(!(canBuy3 as any).weld5).setLabel(`${fmt((costs3 as any).weld5)}`))
      );
    }

    const container = new ContainerBuilder()
      .setAccentColor(0x9b59b6)
      .addTextDisplayComponents(header)
      .addSectionComponents(
        playerRole,
        switchRole,
        ...(weldControls ? [weldControls] : []),
        ...(resourceControl ? [resourceControl] : []),
        refreshSection,
        clickSection,
        guildSection,
        ...autoSections
      );
    return { components: [container], flags: (MessageFlags as any).IsComponentsV2 };
  }
  if (tier === 2) {
    // Tier 2: Iron Beams
    const pick = pickByLevel(((guild as any).pickaxeLevel || 0));
    const nextPick = getNextPick(((guild as any).pickaxeLevel || 0));
    const now = Date.now();
    const remainingMs = Math.max(0, (user.lastChopAt || 0) + CHOP_COOLDOWN_MS - now);
    const readyAtSec = Math.floor(((user.lastChopAt || 0) + CHOP_COOLDOWN_MS) / 1000);
    const chopReady = remainingMs <= 0;
    const chopSeconds = Math.ceil(remainingMs / 1000);
    const perClick = pick.clickPower * CHOP_REWARD_MULTIPLIER;
    const cooldownSec = Math.floor(CHOP_COOLDOWN_MS / 1000);
    const nextChopLine = chopReady ? 'Next Strike: Ready now' : `Next Strike: <t:${readyAtSec}:R> • <t:${readyAtSec}:T>`;

    const owned2 = {
      miners: (user as any).automation2?.miners || 0,
      smelters: (user as any).automation2?.smelters || 0,
      foundries: (user as any).automation2?.foundries || 0,
      beamMills: (user as any).automation2?.beamMills || 0,
      arcaneForge: (user as any).automation2?.arcaneForge || 0
    };

    const costs2 = {
      miners: automationCost(AUTOMATION_T2.miner, owned2.miners),
      smelters: automationCost(AUTOMATION_T2.smelter, owned2.smelters),
      foundries: automationCost(AUTOMATION_T2.foundry, owned2.foundries),
      beamMills: automationCost(AUTOMATION_T2.beamMill, owned2.beamMills),
      arcaneForge: automationCost(AUTOMATION_T2.arcaneForge, owned2.arcaneForge)
    };

    const invBeams = (guild as any).inventory?.beams || 0;
    const canBuy2 = {
      pick: nextPick ? canAfford(invBeams, nextPick.cost) : false,
      miners: canAfford(invBeams, costs2.miners),
      smelters: canAfford(invBeams, costs2.smelters),
      foundries: canAfford(invBeams, costs2.foundries),
      beamMills: canAfford(invBeams, costs2.beamMills),
      arcaneForge: canAfford(invBeams, costs2.arcaneForge)
    };

    const header = new TextDisplayBuilder()
      .setContent('# 🎮 Guild Tycoon — Tier 2: Iron Beams 🏗️\n\nForge ahead with iron beams and stronger tools.');

    const player = new SectionBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`## You\n**Inventory (Beams):** ${fmt(((guild as any).inventory?.beams) || 0)}  •  **Rate:** ${rateFmt((user as any).rates?.beamsPerSec || 0)}/s\n**Pickaxe:** ${pick.name} (manual +${fmt(perClick)} every ${cooldownSec}s)\n${nextChopLine}\n**Automation:** ⛏️ x${owned2.miners}, 🔥 x${owned2.smelters}, 🏭 x${owned2.foundries}, 🧱 x${owned2.beamMills}, ✨ x${owned2.arcaneForge}`)
      )
      .setButtonAccessory(
        new ButtonBuilder()
          .setCustomId('tycoon:chop')
          .setStyle(chopReady ? ButtonStyle.Primary : ButtonStyle.Secondary)
          .setEmoji('⛏️')
          .setDisabled(!chopReady)
          .setLabel(chopReady ? `Strike (+${fmt(perClick)})` : `Cooling (${chopSeconds}s)`)
      );

    const refreshSection = new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent('Refresh Data'))
      .setButtonAccessory(
        new ButtonBuilder().setCustomId('tycoon:refresh').setStyle(ButtonStyle.Secondary).setEmoji('🔄').setLabel('Refresh')
      );

    const readyForTier3 = guild.tierProgress >= guild.tierGoal;
    const guildSection = new SectionBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`## Guild • Tier 3 Progress\n**Inventory (Beams):** ${fmt(((guild as any).inventory?.beams) || 0)}\n**Total Beams:** ${fmt((guild.totals as any).beams || 0)}\n**Tier Progress:** ${fmt(guild.tierProgress)} / ${fmt(guild.tierGoal)}\n${progressBar(guild.tierProgress, guild.tierGoal)}`)
      )
      .setButtonAccessory(
        new ButtonBuilder().setCustomId('tycoon:tier3:advance').setStyle(readyForTier3 ? ButtonStyle.Success : ButtonStyle.Secondary).setDisabled(!readyForTier3).setLabel(readyForTier3 ? 'Enter Tier 3' : 'Tier 3 Locked')
      );

    const pickSection = new SectionBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`## Pickaxe Upgrade\n**Next:** ${nextPick ? `${nextPick.name} — Cost ${fmt(nextPick.cost)}` : 'Maxed'}`)
      )
      .setButtonAccessory(
        new ButtonBuilder()
          .setCustomId('tycoon:buy:pick')
          .setStyle(canBuy2.pick ? ButtonStyle.Success : ButtonStyle.Secondary)
          .setDisabled(!canBuy2.pick || !nextPick)
          .setEmoji('🛠️')
          .setLabel(nextPick ? `Buy (${fmt(nextPick.cost)})` : 'Maxed')
      );

    const minerSection = new SectionBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`⛏️ **Miner**\nOwned: ${owned2.miners} • +${(AUTOMATION_T2.miner.baseRate).toFixed(2)}/s each`)
      )
      .setButtonAccessory(
        new ButtonBuilder().setCustomId('tycoon:buy:auto:miner').setStyle(canBuy2.miners ? ButtonStyle.Success : ButtonStyle.Secondary).setDisabled(!canBuy2.miners).setLabel(`${fmt(costs2.miners)}`)
      );

    const smelterSection = new SectionBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`🔥 **Smelter**\nOwned: ${owned2.smelters} • +${(AUTOMATION_T2.smelter.baseRate).toFixed(2)}/s each`)
      )
      .setButtonAccessory(
        new ButtonBuilder().setCustomId('tycoon:buy:auto:smelter').setStyle(canBuy2.smelters ? ButtonStyle.Success : ButtonStyle.Secondary).setDisabled(!canBuy2.smelters).setLabel(`${fmt(costs2.smelters)}`)
      );

    const foundrySection = new SectionBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`🏭 **Foundry**\nOwned: ${owned2.foundries} • +${(AUTOMATION_T2.foundry.baseRate).toFixed(2)}/s each`)
      )
      .setButtonAccessory(
        new ButtonBuilder().setCustomId('tycoon:buy:auto:foundry').setStyle(canBuy2.foundries ? ButtonStyle.Success : ButtonStyle.Secondary).setDisabled(!canBuy2.foundries).setLabel(`${fmt(costs2.foundries)}`)
      );

    const beamMillSection = new SectionBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`🧱 **Beam Mill**\nOwned: ${owned2.beamMills} • +${(AUTOMATION_T2.beamMill.baseRate).toFixed(2)}/s each`)
      )
      .setButtonAccessory(
        new ButtonBuilder().setCustomId('tycoon:buy:auto:beamMill').setStyle(canBuy2.beamMills ? ButtonStyle.Success : ButtonStyle.Secondary).setDisabled(!canBuy2.beamMills).setLabel(`${fmt(costs2.beamMills)}`)
      );

    const arcaneForgeSection = new SectionBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`✨ **Arcane Forge**\nOwned: ${owned2.arcaneForge} • +${(AUTOMATION_T2.arcaneForge.baseRate).toFixed(2)}/s each`)
      )
      .setButtonAccessory(
        new ButtonBuilder().setCustomId('tycoon:buy:auto:arcaneForge').setStyle(canBuy2.arcaneForge ? ButtonStyle.Success : ButtonStyle.Secondary).setDisabled(!canBuy2.arcaneForge).setLabel(`${fmt(costs2.arcaneForge)}`)
      );

    const container = new ContainerBuilder()
      .setAccentColor(0x3498db)
      .addTextDisplayComponents(header)
      .addSectionComponents(
        player,
        refreshSection,
        guildSection,
        pickSection,
        minerSection,
        smelterSection,
        foundrySection,
        beamMillSection,
        arcaneForgeSection
      );

    return { components: [container], flags: MessageFlags.IsComponentsV2 };
  }
  const axe = axeByLevel(((guild as any).axeLevel || 0));
  const nextAxe = getNextAxe(((guild as any).axeLevel || 0));
  const now = Date.now();
  const remainingMs = Math.max(0, (user.lastChopAt || 0) + CHOP_COOLDOWN_MS - now);
  const chopReady = remainingMs <= 0;
  const chopSeconds = Math.ceil(remainingMs / 1000);
  const perClick = axe.clickPower * CHOP_REWARD_MULTIPLIER;
  const cooldownSec = Math.floor(CHOP_COOLDOWN_MS / 1000);
  const readyAtSec = Math.floor(((user.lastChopAt || 0) + CHOP_COOLDOWN_MS) / 1000);
  const nextChopLine = chopReady
    ? 'Next Chop: Ready now'
    : `Next Chop: <t:${readyAtSec}:R> • <t:${readyAtSec}:T>`;

  const owned = {
    lumberjacks: user.automation.lumberjacks || 0,
    foremen: user.automation.foremen || 0,
    loggingCamps: user.automation.loggingCamps || 0,
    sawmills: user.automation.sawmills || 0,
    arcaneGrove: user.automation.arcaneGrove || 0
  };

  const costs = {
    lumberjacks: automationCost(AUTOMATION.lumberjack, owned.lumberjacks),
    foremen: automationCost(AUTOMATION.foreman, owned.foremen),
    loggingCamps: automationCost(AUTOMATION.loggingCamp, owned.loggingCamps),
    sawmills: automationCost(AUTOMATION.sawmill, owned.sawmills),
    arcaneGrove: automationCost(AUTOMATION.arcaneGrove, owned.arcaneGrove)
  };

  const invSticks = (guild as any).inventory?.sticks || 0;
  const canBuy = {
    axe: nextAxe ? canAfford(invSticks, nextAxe.cost) : false,
    lumberjacks: canAfford(invSticks, costs.lumberjacks),
    foremen: canAfford(invSticks, costs.foremen),
    loggingCamps: canAfford(invSticks, costs.loggingCamps),
    sawmills: canAfford(invSticks, costs.sawmills),
    arcaneGrove: canAfford(invSticks, costs.arcaneGrove)
  };

  // Components v2 with inline buttons using sections
  const headerText = new TextDisplayBuilder()
    .setContent('# 🎮 Guild Tycoon — Tier 1: Sticks 🪵\n\nWork together to craft ever-better widgets. Start by chopping sticks!');

  // Player stats section with chop button inline
  const playerSection = new SectionBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## You\n**Inventory (Sticks):** ${fmt(((guild as any).inventory?.sticks) || 0)}  •  **Rate:** ${rateFmt(user.rates.sticksPerSec)}/s\n**Axe:** ${axe.name} (manual +${fmt(perClick)} every ${cooldownSec}s)\n${nextChopLine}\n**Automation:** 🪵 x${owned.lumberjacks}, 🧑‍🏭 x${owned.foremen}, ⛺ x${owned.loggingCamps}, 🪚 x${owned.sawmills}, ✨ x${owned.arcaneGrove}`)
    )
    .setButtonAccessory(
      new ButtonBuilder()
        .setCustomId('tycoon:chop')
        .setStyle(chopReady ? ButtonStyle.Primary : ButtonStyle.Secondary)
        .setEmoji('🪓')
        .setDisabled(!chopReady)
        .setLabel(chopReady ? `Chop (+${fmt(perClick)})` : `Cooling (${chopSeconds}s)`)
    );

  // Refresh control
  const refreshSection = new SectionBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent('Refresh Data'))
    .setButtonAccessory(
      new ButtonBuilder()
        .setCustomId('tycoon:refresh')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('🔄')
        .setLabel('Refresh')
    );

  // Guild stats section with tier 2 button inline
  const readyForTier2 = guild.tierProgress >= guild.tierGoal;
  const guildSection = new SectionBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## Guild • Tier 2 Progress\n**Inventory (Sticks):** ${fmt(((guild as any).inventory?.sticks) || 0)}\n**Total Sticks:** ${fmt(guild.totals.sticks)}\n**Tier Progress:** ${fmt(guild.tierProgress)} / ${fmt(guild.tierGoal)}\n${progressBar(guild.tierProgress, guild.tierGoal)}`)
    )
    .setButtonAccessory(
      new ButtonBuilder()
        .setCustomId('tycoon:tier2:advance')
        .setStyle(readyForTier2 ? ButtonStyle.Success : ButtonStyle.Secondary)
        .setDisabled(!readyForTier2)
        .setLabel(readyForTier2 ? 'Enter Tier 2' : 'Tier 2 Locked')
    );

  // Axe upgrade section with buy button inline
  const axeSection = new SectionBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## Axe Upgrade\n**Next:** ${nextAxe ? `${nextAxe.name} — Cost ${fmt(nextAxe.cost)}` : 'Maxed'}`)
    )
    .setButtonAccessory(
      new ButtonBuilder()
        .setCustomId('tycoon:buy:axe')
        .setStyle(canBuy.axe ? ButtonStyle.Success : ButtonStyle.Secondary)
        .setDisabled(!canBuy.axe || !nextAxe)
        .setEmoji('🛠️')
        .setLabel(nextAxe ? `Buy (${fmt(nextAxe.cost)})` : 'Maxed')
    );

  // Automation sections with inline buy buttons
  const lumberjackSection = new SectionBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`🪵 **Lumberjack**\nOwned: ${owned.lumberjacks} • +${(AUTOMATION.lumberjack.baseRate).toFixed(2)}/s each`)
    )
    .setButtonAccessory(
      new ButtonBuilder()
        .setCustomId('tycoon:buy:auto:lumberjack')
        .setStyle(canBuy.lumberjacks ? ButtonStyle.Success : ButtonStyle.Secondary)
        .setDisabled(!canBuy.lumberjacks)
        .setLabel(`${fmt(costs.lumberjacks)}`)
    );

  const foremanSection = new SectionBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`🧑‍🏭 **Foreman**\nOwned: ${owned.foremen} • +${(AUTOMATION.foreman.baseRate).toFixed(2)}/s each`)
    )
    .setButtonAccessory(
      new ButtonBuilder()
        .setCustomId('tycoon:buy:auto:foreman')
        .setStyle(canBuy.foremen ? ButtonStyle.Success : ButtonStyle.Secondary)
        .setDisabled(!canBuy.foremen)
        .setLabel(`${fmt(costs.foremen)}`)
    );

  const campSection = new SectionBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`⛺ **Logging Camp**\nOwned: ${owned.loggingCamps} • +${(AUTOMATION.loggingCamp.baseRate).toFixed(2)}/s each`)
    )
    .setButtonAccessory(
      new ButtonBuilder()
        .setCustomId('tycoon:buy:auto:loggingCamp')
        .setStyle(canBuy.loggingCamps ? ButtonStyle.Success : ButtonStyle.Secondary)
        .setDisabled(!canBuy.loggingCamps)
        .setLabel(`${fmt(costs.loggingCamps)}`)
    );

  const sawmillSection = new SectionBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`🪚 **Sawmill**\nOwned: ${owned.sawmills} • +${(AUTOMATION.sawmill.baseRate).toFixed(2)}/s each`)
    )
    .setButtonAccessory(
      new ButtonBuilder()
        .setCustomId('tycoon:buy:auto:sawmill')
        .setStyle(canBuy.sawmills ? ButtonStyle.Success : ButtonStyle.Secondary)
        .setDisabled(!canBuy.sawmills)
        .setLabel(`${fmt(costs.sawmills)}`)
    );

  const groveSection = new SectionBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`✨ **Arcane Grove**\nOwned: ${owned.arcaneGrove} • +${(AUTOMATION.arcaneGrove.baseRate).toFixed(2)}/s each`)
    )
    .setButtonAccessory(
      new ButtonBuilder()
        .setCustomId('tycoon:buy:auto:arcaneGrove')
        .setStyle(canBuy.arcaneGrove ? ButtonStyle.Success : ButtonStyle.Secondary)
        .setDisabled(!canBuy.arcaneGrove)
        .setLabel(`${fmt(costs.arcaneGrove)}`)
    );

  // Main container with all sections and inline buttons
  const mainContainer = new ContainerBuilder()
    .setAccentColor(0x2ecc71)
    .addTextDisplayComponents(headerText)
    .addSectionComponents(
      playerSection,
      refreshSection,
      guildSection,
      axeSection,
      lumberjackSection,
      foremanSection,
      campSection,
      sawmillSection,
      groveSection
    );

  return {
    components: [mainContainer],
    flags: (MessageFlags as any).IsComponentsV2
  };
}

// Leaderboard render for /top with user-inspect panel
export function renderLeaderboard(
  guild: Guild,
  tier: number,
  top: Array<{ userId: string; contributed: number; role?: 'forger' | 'welder' | 'lumberjack' | 'smithy' | 'wheelwright' | 'boilermaker' | 'coachbuilder' | 'mechanic'; produced?: number }>,
  selectedUserId?: string,
  selectedUser?: User,
  options?: { 
    viewerId?: string; 
    viewerRank?: number; 
    viewerContributed?: number;
    roleTotals?: Record<string, number>;
    viewerRole?: string | null;
    viewerProduced?: number;
  }
) {
  const headerTitle = 'Top Contributors';
  const MAX_ROWS = 4; // keep total component count well under 40
  top = top.slice(0, MAX_ROWS);
  const header = new TextDisplayBuilder()
    .setContent(`# ${headerTitle} — Tier ${tier} ${tier === 1 ? '(Sticks)' : tier === 2 ? '(Iron Beams)' : tier === 3 ? '(Steel Boxes)' : '(Trains)'}\n`);

  const listSections: any[] = [];
  const totalContributions = top.reduce((sum, t) => sum + t.contributed, 0);
  // Full-guild totals by role for Tier 3/4, provided by caller (required for accurate %)
  const totalsByRole: Record<string, number> = options?.roleTotals || {};
  
  const medalIcon = (i: number) => (i === 0 ? '🥇 ' : i === 1 ? '🥈 ' : i === 2 ? '🥉 ' : '');
  for (let i = 0; i < top.length; i++) {
    const row = top[i];
    const isSelected = row.userId === selectedUserId;
    
    let displayValue: number, totalForPercentage: number, valueLabel: string;
    if ((tier === 3 || tier === 4) && (row as any).role) {
      // Show production data for Tier 3/4 with role-based totals
      displayValue = (row as any).produced || 0;
      const userRole = (row as any).role as string;
      totalForPercentage = (totalsByRole[userRole] ?? 0);
      if (userRole === 'forger') valueLabel = 'pipes';
      else if (userRole === 'welder') valueLabel = 'boxes';
      else if (userRole === 'lumberjack') valueLabel = 'wood';
      else if (userRole === 'smithy') valueLabel = 'steel';
      else if (userRole === 'wheelwright') valueLabel = 'wheels';
      else if (userRole === 'boilermaker') valueLabel = 'boilers';
      else if (userRole === 'coachbuilder') valueLabel = 'cabins';
      else if (userRole === 'mechanic') valueLabel = 'trains';
      else valueLabel = '';
    } else {
      // Show contribution data for Tier 1 & 2
      displayValue = row.contributed;
      totalForPercentage = totalContributions;
      valueLabel = '';
    }
    
    const bar = progressBar(displayValue, Math.max(1, totalForPercentage), 18);
    const roleIcon = (tier === 3 || tier === 4) && (row as any).role
      ? ((row as any).role === 'forger' ? '🔧 '
        : (row as any).role === 'welder' ? '🔩 '
        : (row as any).role === 'lumberjack' ? '🌲 '
        : (row as any).role === 'smithy' ? '⚒️ '
        : (row as any).role === 'wheelwright' ? '🛞 '
        : (row as any).role === 'boilermaker' ? '🔥 '
        : (row as any).role === 'coachbuilder' ? '🚃 '
        : (row as any).role === 'mechanic' ? '🚂 ' : '')
      : '';
    const prefix = `${medalIcon(i)}${i + 1}.`;
    const title = `${prefix} ${roleIcon}<@${row.userId}> — ${fmt(displayValue)}${valueLabel ? ' ' + valueLabel : ''}`;
    const section = new SectionBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`**${title}**\n${bar}`)
      )
      .setButtonAccessory(
        new ButtonBuilder()
          .setCustomId(`top:view:${row.userId}`)
          .setStyle(isSelected ? ButtonStyle.Primary : ButtonStyle.Secondary)
          .setLabel(isSelected ? 'Viewing' : 'View')
      );
    listSections.push(section);
  }

  let inspect: any | undefined;
  if (selectedUser && selectedUserId) {
    if (tier === 1) {
      const owned = selectedUser.automation || { lumberjacks: 0, foremen: 0, loggingCamps: 0, sawmills: 0, arcaneGrove: 0 };
      const rate = selectedUser.rates?.sticksPerSec || 0;
      inspect = new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`## Inspect: <@${selectedUserId}>`),
          new TextDisplayBuilder().setContent(
            `Rate: ${rateFmt(rate)}/s\nAutomation:\n` +
            `• Lumberjacks: ${owned.lumberjacks}\n` +
            `• Foremen: ${owned.foremen}\n` +
            `• Logging Camps: ${owned.loggingCamps}\n` +
            `• Sawmills: ${owned.sawmills}\n` +
            `• Arcane Grove: ${owned.arcaneGrove}`
          )
        )
        .setButtonAccessory(
          new ButtonBuilder().setCustomId('top:noop:inspect').setStyle(ButtonStyle.Secondary).setDisabled(true).setLabel('Inspecting')
        );
    } else if (tier === 2) {
      const a2 = (selectedUser as any).automation2 || { miners: 0, smelters: 0, foundries: 0, beamMills: 0, arcaneForge: 0 };
      const rate = (selectedUser as any).rates?.beamsPerSec || 0;
      inspect = new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `## Inspect: <@${selectedUserId}>\n`+
            `Rate: ${rateFmt(rate)}/s\n`+
            `• Miners: ${a2.miners}\n• Smelters: ${a2.smelters}\n• Foundries: ${a2.foundries}\n• Beam Mills: ${a2.beamMills}\n• Arcane Forge: ${a2.arcaneForge}`
          )
        )
        .setButtonAccessory(new ButtonBuilder().setCustomId('top:noop:inspect').setStyle(ButtonStyle.Secondary).setDisabled(true).setLabel('Inspecting'));
    } else {
      const role = (selectedUser as any).role3 || null;
      const a3 = (selectedUser as any).automation3 || {};
      const rate = role === 'forger' ? ((selectedUser as any).rates?.pipesPerSec || 0) : ((selectedUser as any).rates?.boxesPerSec || 0);
      const list = role === 'forger'
        ? `• Pipe Foundry: ${a3.forge1 || 0}\n• Alloy Smelter: ${a3.forge2 || 0}\n• Extrusion Press: ${a3.forge3 || 0}\n• Annealing Oven: ${a3.forge4 || 0}\n• Coating Line: ${a3.forge5 || 0}`
        : `• Welding Rig: ${a3.weld1 || 0}\n• Assembly Jig: ${a3.weld2 || 0}\n• Robotic Welder: ${a3.weld3 || 0}\n• Bracing Station: ${a3.weld4 || 0}\n• Finishing Line: ${a3.weld5 || 0}`;
      inspect = new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `## Inspect: <@${selectedUserId}> — ${role ? role[0].toUpperCase() + role.slice(1) : 'Unassigned'}\n`+
            `Rate: ${rateFmt(rate)}/s\n${list}`
          )
        )
        .setButtonAccessory(new ButtonBuilder().setCustomId('top:noop:inspect').setStyle(ButtonStyle.Secondary).setDisabled(true).setLabel('Inspecting'));
    }
  }

  // Fallback when there are no top users yet
  if (listSections.length === 0) {
    listSections.push(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent('No contributions yet.')
        )
        .setButtonAccessory(new ButtonBuilder().setCustomId('top:noop:fallback').setStyle(ButtonStyle.Secondary).setDisabled(true).setLabel('—'))
    );
  }

  // Include viewer rank (mention viewer to avoid ambiguity in non-ephemeral message)
  if (options?.viewerId && !top.find(t => t.userId === options.viewerId)) {
    let youValue = options.viewerContributed || 0;
    let youTotal = totalContributions;
    let youLabel = '';
    if ((tier === 3 || tier === 4) && options.viewerRole) {
      youValue = options.viewerProduced || 0;
      youTotal = (options.roleTotals?.[options.viewerRole] ?? youTotal);
      const r = options.viewerRole;
      if (r === 'forger') youLabel = 'pipes';
      else if (r === 'welder') youLabel = 'boxes';
      else if (r === 'lumberjack') youLabel = 'wood';
      else if (r === 'smithy') youLabel = 'steel';
      else if (r === 'wheelwright') youLabel = 'wheels';
      else if (r === 'boilermaker') youLabel = 'boilers';
      else if (r === 'coachbuilder') youLabel = 'cabins';
      else if (r === 'mechanic') youLabel = 'trains';
    }
    const bar = progressBar(youValue, Math.max(1, youTotal), 18);
    const valueText = youLabel ? `${fmt(youValue)} ${youLabel}` : `${fmt(youValue)}`;
    listSections.push(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`**<@${options.viewerId}> • #${options.viewerRank || 0} — ${valueText}**\n${bar}`)
        )
        .setButtonAccessory(new ButtonBuilder().setCustomId('top:noop:viewer').setStyle(ButtonStyle.Secondary).setDisabled(true).setLabel('Viewer'))
    );
  }

  const container = new ContainerBuilder()
    .setAccentColor(tier === 1 ? 0x2ecc71 : 0x3498db)
    .addTextDisplayComponents(header)
    .addSectionComponents(
      ...listSections,
      ...(inspect ? [inspect] as any[] : [])
    );

  return { components: [container], flags: (MessageFlags as any).IsComponentsV2 };
}


// Confirmation UI for switching into Forger (destructive reset of T3 progress)
export function renderRoleSwitchConfirm(guild: Guild, user: User, targetRole: 'forger' | 'welder') {
  const header = new TextDisplayBuilder().setContent('# Confirm Role Switch');
  const warning = new TextDisplayBuilder().setContent(
    `You are about to switch your Tier 3 role to **${targetRole === 'forger' ? 'Forger' : 'Welder'}**.\n` +
      'This will reset all your Tier 3 upgrades and production rates.\n' +
      '**You will lose all existing progress for your current role.**\n' +
      'This action cannot be undone.'
  );
  const confirmSection = new SectionBuilder()
    .addTextDisplayComponents(warning)
    .setButtonAccessory(
      new ButtonBuilder().setCustomId(`tycoon:t3:confirm:${targetRole}`).setStyle(ButtonStyle.Danger).setLabel('Confirm Switch')
    );
  
  const cancelSection = new SectionBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent('Cancel Role Switch'))
    .setButtonAccessory(
      new ButtonBuilder().setCustomId('tycoon:t3:cancel').setStyle(ButtonStyle.Secondary).setLabel('Cancel')
    );

  const container = new ContainerBuilder()
    .setAccentColor(0xe67e22)
    .addTextDisplayComponents(header)
    .addSectionComponents(confirmSection, cancelSection);

  return { components: [container], flags: MessageFlags.IsComponentsV2 };
}
