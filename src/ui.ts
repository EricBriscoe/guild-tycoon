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
import { t3ForgerClickBase, t3WelderClickBase, t3ClickUpgradeCost } from './game.js';

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
  if (tier === 3) {
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
      .setContent('# Guild Tycoon — Tier 3: Steel Boxes\n\nCoordinate forgers and welders to craft steel boxes.');

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

      const guildSection = new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent('## Guild • Tier 3 Progress'),
          new TextDisplayBuilder().setContent(`**Inventory:** Pipes ${fmt((guild as any).inventory?.pipes || 0)} • Boxes ${fmt((guild as any).inventory?.boxes || 0)}\n**Tier Progress (boxes):** ${fmt(guild.tierProgress)} / ${fmt(guild.tierGoal)}\n${progressBar(guild.tierProgress, guild.tierGoal)}`)
        )
        .setButtonAccessory(
          new ButtonBuilder().setCustomId('tycoon:tier4:placeholder').setStyle(ButtonStyle.Secondary).setDisabled(true).setLabel('Tier 4: Coming Soon')
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
    if (role === 'welder') {
      const enabled = (user as any).weldPassiveEnabled !== false;
      const toggleId = enabled ? 'tycoon:t3:weldtoggle:off' : 'tycoon:t3:weldtoggle:on';
      const label = enabled ? 'Passive Welding: On' : 'Passive Welding: Off';
      weldControls = new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('Welding Control'))
        .setButtonAccessory(new ButtonBuilder().setCustomId(toggleId).setStyle(enabled ? ButtonStyle.Primary : ButtonStyle.Secondary).setLabel(label));
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
      clickSection = new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `## Click Upgrades (Shared by Forgers)\nLevel ${fLvl} → +${fmt(t3ForgerClickBase(guild) * CHOP_REWARD_MULTIPLIER)} pipes/click`
          )
        )
        .setButtonAccessory(
          new ButtonBuilder()
            .setCustomId('tycoon:buy:t3click:forger')
            .setStyle(canBuyClickForger ? ButtonStyle.Success : ButtonStyle.Secondary)
            .setDisabled(!canBuyClickForger)
            .setLabel(`Upgrade (${fmt(fCost)} pipes)`)
        );
    } else {
      clickSection = new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `## Click Upgrades (Shared by Welders)\nLevel ${wLvl} → +${fmt(t3WelderClickBase(guild) * CHOP_REWARD_MULTIPLIER)} boxes/click`
          )
        )
        .setButtonAccessory(
          new ButtonBuilder()
            .setCustomId('tycoon:buy:t3click:welder')
            .setStyle(canBuyClickWelder ? ButtonStyle.Success : ButtonStyle.Secondary)
            .setDisabled(!canBuyClickWelder)
            .setLabel(`Upgrade (${fmt(wCost)} boxes)`)
        );
    }

    const guildSection = new SectionBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`## Guild • Tier 3 Progress\n**Inventory:** Pipes ${fmt((guild as any).inventory?.pipes || 0)} • Boxes ${fmt((guild as any).inventory?.boxes || 0)}\n**Tier Progress (boxes):** ${fmt(guild.tierProgress)} / ${fmt(guild.tierGoal)}\n${progressBar(guild.tierProgress, guild.tierGoal)}`)
      )
      .setButtonAccessory(
        new ButtonBuilder().setCustomId('tycoon:tier4:placeholder').setStyle(ButtonStyle.Secondary).setDisabled(true).setLabel('Tier 4: Coming Soon')
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
      .addSectionComponents(playerRole, switchRole, ...(weldControls ? [weldControls] : []), refreshSection, clickSection, guildSection, ...autoSections);
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
      .setContent('# Guild Tycoon — Tier 2: Iron Beams\n\nForge ahead with iron beams and stronger tools.');

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
    .setContent('# Guild Tycoon — Tier 1: Sticks\n\nWork together to craft ever-better widgets. Start by chopping sticks!');

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
  top: Array<{ userId: string; contributed: number; role?: 'forger' | 'welder'; produced?: number }>,
  selectedUserId?: string,
  selectedUser?: User,
  options?: { viewerId?: string; viewerRank?: number; viewerContributed?: number }
) {
  const headerTitle = 'Top Contributors';
  const header = new TextDisplayBuilder()
    .setContent(`# ${headerTitle} — Tier ${tier} ${tier === 1 ? '(Sticks)' : tier === 2 ? '(Iron Beams)' : '(Steel Boxes)'}\n`);

  const listSections: any[] = [];
  const totalContributions = top.reduce((sum, t) => sum + t.contributed, 0);
  
  // For Tier 3, calculate role-specific totals for percentage bars
  let roleProductionTotals: { forgers: number; welders: number } | undefined;
  if (tier === 3) {
    roleProductionTotals = {
      forgers: top.filter(t => (t as any).role === 'forger').reduce((sum, t) => sum + ((t as any).produced || 0), 0),
      welders: top.filter(t => (t as any).role === 'welder').reduce((sum, t) => sum + ((t as any).produced || 0), 0)
    };
  }
  
  const medal = (i: number) => (i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '');
  const avatar = (uid: string) => `https://cdn.discordapp.com/embed/avatars/${Number(uid.slice(-1)) % 5}.png`;
  for (let i = 0; i < top.length; i++) {
    const row = top[i];
    const isSelected = row.userId === selectedUserId;
    
    let displayValue: number, totalForPercentage: number, valueLabel: string;
    if (tier === 3 && (row as any).role) {
      // Show production data for Tier 3
      displayValue = (row as any).produced || 0;
      const userRole = (row as any).role;
      totalForPercentage = userRole === 'forger' ? roleProductionTotals!.forgers : roleProductionTotals!.welders;
      valueLabel = userRole === 'forger' ? 'pipes' : 'boxes';
    } else {
      // Show contribution data for Tier 1 & 2
      displayValue = row.contributed;
      totalForPercentage = totalContributions;
      valueLabel = '';
    }
    
    const bar = progressBar(displayValue, Math.max(1, totalForPercentage), 18);
    const roleIcon = tier === 3 && (row as any).role ? ((row as any).role === 'forger' ? '🔧' : '🔩') : '';
    const title = `${medal(i)} ${i + 1}. ${roleIcon}<@${row.userId}> — ${fmt(displayValue)}${valueLabel ? ' ' + valueLabel : ''}`.trim();
    const section = new SectionBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`**${title}**`),
        new TextDisplayBuilder().setContent(`${bar}`)
      )
      .setThumbnailAccessory(new ThumbnailBuilder().setURL(avatar(row.userId)))
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
          new ButtonBuilder().setCustomId('top:noop').setStyle(ButtonStyle.Secondary).setDisabled(true).setLabel('Inspecting')
        );
    } else if (tier === 2) {
      const a2 = (selectedUser as any).automation2 || { miners: 0, smelters: 0, foundries: 0, beamMills: 0, arcaneForge: 0 };
      const rate = (selectedUser as any).rates?.beamsPerSec || 0;
      inspect = new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`## Inspect: <@${selectedUserId}>`),
          new TextDisplayBuilder().setContent(
            `Rate: ${rateFmt(rate)}/s\nAutomation:\n` +
            `• Miners: ${a2.miners}\n` +
            `• Smelters: ${a2.smelters}\n` +
            `• Foundries: ${a2.foundries}\n` +
            `• Beam Mills: ${a2.beamMills}\n` +
            `• Arcane Forge: ${a2.arcaneForge}`
          )
        )
        .setButtonAccessory(
          new ButtonBuilder().setCustomId('top:noop').setStyle(ButtonStyle.Secondary).setDisabled(true).setLabel('Inspecting')
        );
    } else {
      const role = (selectedUser as any).role3 || null;
      const a3 = (selectedUser as any).automation3 || {};
      const rate = role === 'forger' ? ((selectedUser as any).rates?.pipesPerSec || 0) : ((selectedUser as any).rates?.boxesPerSec || 0);
      const list = role === 'forger'
        ? `• Pipe Foundry: ${a3.forge1 || 0}\n• Alloy Smelter: ${a3.forge2 || 0}\n• Extrusion Press: ${a3.forge3 || 0}\n• Annealing Oven: ${a3.forge4 || 0}\n• Coating Line: ${a3.forge5 || 0}`
        : `• Welding Rig: ${a3.weld1 || 0}\n• Assembly Jig: ${a3.weld2 || 0}\n• Robotic Welder: ${a3.weld3 || 0}\n• Bracing Station: ${a3.weld4 || 0}\n• Finishing Line: ${a3.weld5 || 0}`;
      inspect = new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`## Inspect: <@${selectedUserId}> — ${role ? role[0].toUpperCase() + role.slice(1) : 'Unassigned'}`),
          new TextDisplayBuilder().setContent(
            `Rate: ${rateFmt(rate)}/s\nAutomation:\n` +
            list
          )
        )
        .setButtonAccessory(
          new ButtonBuilder().setCustomId('top:noop').setStyle(ButtonStyle.Secondary).setDisabled(true).setLabel('Inspecting')
        );
    }
  }

  // Fallback when there are no top users yet
  if (listSections.length === 0) {
    listSections.push(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent('No contributions yet.')
        )
        .setThumbnailAccessory(new ThumbnailBuilder().setURL('https://cdn.discordapp.com/embed/avatars/0.png'))
        .setButtonAccessory(new ButtonBuilder().setCustomId('top:noop').setStyle(ButtonStyle.Secondary).setDisabled(true).setLabel('—'))
    );
  }

  // Include viewer rank if not in top list
  if (options?.viewerId && !top.find(t => t.userId === options.viewerId)) {
    const bar = progressBar(options.viewerContributed || 0, Math.max(1, totalContributions), 18);
    listSections.push(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`**You • #${options.viewerRank || 0} — ${fmt(options.viewerContributed || 0)}**`),
          new TextDisplayBuilder().setContent(`${bar}`)
        )
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(avatar(options.viewerId)))
        .setButtonAccessory(new ButtonBuilder().setCustomId('top:noop').setStyle(ButtonStyle.Secondary).setDisabled(true).setLabel('Your Rank'))
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
