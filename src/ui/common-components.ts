import { ButtonBuilder, ButtonStyle, TextDisplayBuilder, SectionBuilder } from 'discord.js';
import { Guild, User } from '../game.js';
import { ExtendedGuild, ExtendedUser, asExtendedGuild, asExtendedUser } from '../types/extended-interfaces.js';

/**
 * Common UI component builders to reduce duplication across tier rendering
 */

export function createRefreshSection(): SectionBuilder {
  return new SectionBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent('Refresh Data'))
    .setButtonAccessory(
      new ButtonBuilder()
        .setCustomId('tycoon:refresh')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('🔄')
        .setLabel('Refresh')
    );
}

export function createProgressBar(current: number, goal: number, width: number = 18): string {
  const ratio = Math.max(0, Math.min(1, goal > 0 ? current / goal : 0));
  const filled = Math.round(ratio * width);
  const empty = width - filled;
  return '█'.repeat(filled) + '░'.repeat(empty) + ` ${Math.floor(ratio * 100)}%`;
}

export function formatNumber(n: number): string {
  if (!isFinite(n)) return '0';
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2) + 'B';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(2) + 'K';
  return Math.floor(n).toString();
}

export function formatRate(n: number): string {
  if (!isFinite(n)) return '0.00';
  if (Math.abs(n) < 1000) return n.toFixed(2);
  return formatNumber(n);
}

export function createPlayerActionSection(
  role: string | null,
  actionText: string,
  nextActionLine: string,
  chopReady: boolean,
  chopSeconds: number
): SectionBuilder {
  return new SectionBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## You${role ? ` — ${role}` : ''}\n${nextActionLine}`)
    )
    .setButtonAccessory(
      new ButtonBuilder()
        .setCustomId('tycoon:chop')
        .setStyle(chopReady ? ButtonStyle.Primary : ButtonStyle.Secondary)
        .setDisabled(!chopReady)
        .setLabel(chopReady ? actionText : `Cooling (${chopSeconds}s)`)
    );
}

export function createGuildProgressSection(
  tier: number,
  guild: ExtendedGuild,
  tierName: string,
  inventoryText: string,
  canAdvance: boolean,
  advanceButtonId: string,
  advanceLabel: string
): SectionBuilder {
  return new SectionBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## Guild • ${tierName}\n${inventoryText}\n**Progress:** ${formatNumber(guild.tierProgress)} / ${formatNumber(guild.tierGoal)}\n${createProgressBar(guild.tierProgress, guild.tierGoal)}`
      )
    )
    .setButtonAccessory(
      new ButtonBuilder()
        .setCustomId(advanceButtonId)
        .setStyle(canAdvance ? ButtonStyle.Success : ButtonStyle.Secondary)
        .setDisabled(!canAdvance)
        .setLabel(advanceLabel)
    );
}

export function createAutomationSection(
  name: string,
  emoji: string,
  owned: number,
  baseRate: number,
  cost: number,
  canAfford: boolean,
  customId: string
): SectionBuilder {
  return new SectionBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`${emoji} **${name}**\nOwned: ${owned} • +${baseRate.toFixed(2)}/s each`)
    )
    .setButtonAccessory(
      new ButtonBuilder()
        .setCustomId(customId)
        .setStyle(canAfford ? ButtonStyle.Success : ButtonStyle.Secondary)
        .setDisabled(!canAfford)
        .setLabel(formatNumber(cost))
    );
}

export function createToolUpgradeSection(
  toolName: string,
  currentTool: { name: string; cost?: number } | null,
  nextTool: { name: string; cost: number } | null,
  canAfford: boolean,
  customId: string,
  emoji: string = '🛠️'
): SectionBuilder {
  return new SectionBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ${toolName} Upgrade\n**Current:** ${currentTool?.name || 'None'}\n**Next:** ${nextTool ? `${nextTool.name} — Cost ${formatNumber(nextTool.cost)}` : 'Maxed'}`
      )
    )
    .setButtonAccessory(
      new ButtonBuilder()
        .setCustomId(customId)
        .setStyle(canAfford ? ButtonStyle.Success : ButtonStyle.Secondary)
        .setDisabled(!canAfford || !nextTool)
        .setEmoji(emoji)
        .setLabel(nextTool ? `Buy (${formatNumber(nextTool.cost)})` : 'Maxed')
    );
}

export function createRoleSwitchSection(
  currentRole: string | null,
  switchOptions: Array<{ role: string; emoji: string; label: string }>
): SectionBuilder {
  if (!currentRole || switchOptions.length === 0) {
    return new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent('## Role Management\nNo role switching available'))
      .setButtonAccessory(
        new ButtonBuilder()
          .setCustomId('tycoon:noop')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true)
          .setLabel('N/A')
      );
  }

  const option = switchOptions[0]; // For now, just show first option
  return new SectionBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent('## Switch Role\nChange specialization (resets progress)')
    )
    .setButtonAccessory(
      new ButtonBuilder()
        .setCustomId(`tycoon:t${currentRole.includes('forger') || currentRole.includes('welder') ? '3' : '4'}:switch:${option.role}`)
        .setStyle(ButtonStyle.Secondary)
        .setLabel(`${option.emoji} → ${option.label}`)
    );
}

export function calculateCooldownInfo(lastChopAt: number, cooldownMs: number, now: number = Date.now()) {
  const remainingMs = Math.max(0, (lastChopAt || 0) + cooldownMs - now);
  const readyAtSec = Math.floor(((lastChopAt || 0) + cooldownMs) / 1000);
  const chopReady = remainingMs <= 0;
  const chopSeconds = Math.ceil(remainingMs / 1000);
  const nextActionLine = chopReady ? 'Next Action: Ready now' : `Next Action: <t:${readyAtSec}:R> • <t:${readyAtSec}:T>`;
  
  return { remainingMs, readyAtSec, chopReady, chopSeconds, nextActionLine };
}
