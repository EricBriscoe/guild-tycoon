import 'dotenv/config';
import { Client, GatewayIntentBits, InteractionType, Partials, MessageFlags, Interaction, ChatInputCommandInteraction, ButtonInteraction } from 'discord.js';
import { initState, withGuildAndUser, getTopContributors, getTopContributorsByTier, getTopContributorsByRole, getTopProducersByRole, refreshGuildContributions, initializeTier2ForGuild, getUserRankByTier, refreshAllGuilds } from './state.js';
import { renderTycoon, renderLeaderboard, renderRoleSwitchConfirm } from './ui.js';
import { applyPassiveTicks, clickChop, tryBuyAxeShared, tryBuyAutomation, applyGuildProgress, tryBuyPickShared, advanceTierIfReady, applyPassiveTicksT3, applyTier3GuildFlows, tryBuyAutomationT3, clickTier3, tryBuyT3ClickUpgrade } from './game.js';
type DelayedChop =
  | { tier: 1 | 2; gained: number }
  | { tier: 3; t3: { role: 'forger' | 'welder' | null; pipes: number; boxesPotential: number } };

const token = process.env.DISCORD_TOKEN;

if (!token) {
  console.error('Missing DISCORD_TOKEN in environment. See .env.example');
  process.exit(1);
}

initState();

// Background passive production ticker (configurable)
const TICK_ENABLED = (process.env.GT_BACKGROUND_TICK_ENABLED ?? 'true').toLowerCase() !== 'false';
const TICK_MS = Math.max(1000, Number(process.env.GT_BACKGROUND_TICK_MS ?? 15000));
const TICK_LOG = (process.env.GT_BACKGROUND_TICK_LOG ?? 'false').toLowerCase() === 'true';

if (TICK_ENABLED) {
  let inFlight = false;
  setInterval(() => {
    if (inFlight) return; // prevent overlap if a tick takes longer
    inFlight = true;
    try {
      const now = Date.now();
      const r = refreshAllGuilds(now);
      if (TICK_LOG) {
        console.log(`[gtick] guilds=${r.guildsProcessed} users=${r.usersRefreshed} totalGained=${Math.floor(r.totalGained)} ts=${now}`);
      }
    } catch (e) {
      console.error('[gtick] error during background refresh:', e);
    } finally {
      inFlight = false;
    }
  }, TICK_MS).unref?.();
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
  partials: [Partials.GuildMember]
});

client.once('clientReady', () => {
  console.log(`Guild Tycoon online as ${client.user?.tag}`);
});

// Utility: swallow Unknown interaction (10062) errors
function isUnknownInteractionError(err: any): boolean {
  const code = (err?.code ?? err?.rawError?.code);
  return code === 10062;
}

async function safeUpdate(i: ButtonInteraction, view: any): Promise<boolean> {
  try {
    await i.update(view);
    return true;
  } catch (e: any) {
    if (isUnknownInteractionError(e)) {
      console.warn('Ignoring Unknown interaction on update');
      return false;
    }
    throw e;
  }
}

async function ensureGuildInteraction(interaction: Interaction): Promise<boolean> {
  if (!interaction.inGuild?.()) {
    if (interaction.isRepliable()) {
      await interaction.reply({ content: 'This game only runs in servers (guilds).', flags: MessageFlags.Ephemeral });
    }
    return false;
  }
  return true;
}

client.on('interactionCreate', async (interaction: Interaction) => {
  try {
    if (interaction.type === InteractionType.ApplicationCommand) {
      const command = interaction as ChatInputCommandInteraction;
      if (command.commandName === 'tycoon') {
        if (!(await ensureGuildInteraction(interaction))) return;
        const guildId = interaction.guildId!;
        const userId = interaction.user.id;

        let view: any;
        let tierUp = false;
        withGuildAndUser(guildId, userId, (guild, user) => {
          const tier = guild.widgetTier || 1;
          if (tier === 3) {
            const delta = applyPassiveTicksT3(guild, user);
            applyTier3GuildFlows(guild, user, delta);
          } else {
            const gained = applyPassiveTicks(user, tier);
            if (gained > 0) {
              applyGuildProgress(guild, gained, tier);
              if (tier === 1) user.lifetimeContributed += gained, (user as any).contributedT1 = ((user as any).contributedT1 || 0) + gained;
              if (tier === 2) user.lifetimeContributed += gained, (user as any).contributedT2 = ((user as any).contributedT2 || 0) + gained;
            }
          }
          view = renderTycoon(guild, user);
        });

        // Use flags for ephemeral to avoid deprecation warnings
        await command.reply({ ...view, flags: (((view as any).flags || 0) | MessageFlags.Ephemeral) });
        // No announcement here; advancement happens only via button click
      }
      if (command.commandName === 'top') {
        if (!(await ensureGuildInteraction(interaction))) return;
        const guildId = interaction.guildId!;
        // Ensure all users' passive gains and contributions are current
        refreshGuildContributions(guildId);
        // Use per-tier contributions based on current guild tier
        let view: any;
        let currentGuild: any;
        let tier: number = 1;
        let currentUser: any;
        withGuildAndUser(guildId, interaction.user.id, (guild, user) => {
          currentGuild = guild;
          tier = guild.widgetTier || 1;
          currentUser = user;
        });
        
        let top: Array<{ userId: string; contributed: number; role?: 'forger' | 'welder'; produced?: number }>;
        if (tier === 3) {
          // For Tier 3, show unified leaderboard with production data
          const allT3Users = getTopContributorsByTier(guildId, tier, 10);
          top = allT3Users.map(user => {
            // Get user role and production data
            let role: 'forger' | 'welder' | undefined;
            let produced = 0;
            withGuildAndUser(guildId, user.userId, (g, u) => {
              role = (u as any).role3;
              if (role === 'forger') {
                produced = (u as any).pipesProduced || 0;
              } else if (role === 'welder') {
                produced = (u as any).boxesProduced || 0;
              }
            });
            return { ...user, role, produced };
          });
        } else {
          top = getTopContributorsByTier(guildId, tier, 10);
        }
        
        let selectedUserId = top.length ? top[0].userId : undefined;
        let selectedUser: any = undefined;
        if (selectedUserId) {
          withGuildAndUser(guildId, selectedUserId, (g2, u2) => {
            selectedUser = u2;
          });
        }
        const viewer = getUserRankByTier(guildId, tier, interaction.user.id);
        view = renderLeaderboard(currentGuild, tier, top, selectedUserId, selectedUser, { viewerId: interaction.user.id, viewerRank: viewer.rank, viewerContributed: viewer.contributed });
        await command.reply({ ...view });
      }
      return;
    }

    if (interaction.isButton()) {
      const buttonInteraction = interaction as ButtonInteraction;
      if (!(await ensureGuildInteraction(interaction))) return;
      const [prefix, action, sub, sub2] = buttonInteraction.customId.split(':');
      if (prefix === 'top') {
        const guildId = interaction.guildId!;
        const selectedUserId = action === 'view' ? sub : undefined;
        let view: any;
        let currentUser: any;
        withGuildAndUser(guildId, interaction.user.id, (guild, user) => {
          currentUser = user;
        });
        
        withGuildAndUser(guildId, selectedUserId || interaction.user.id, (guild, selectedUser) => {
          const tier = guild.widgetTier || 1;
          let top: Array<{ userId: string; contributed: number; role?: 'forger' | 'welder'; produced?: number }>;
          if (tier === 3) {
            // For Tier 3, show unified leaderboard with production data
            const allT3Users = getTopContributorsByTier(guildId, tier, 10);
            top = allT3Users.map(user => {
              let role: 'forger' | 'welder' | undefined;
              let produced = 0;
              withGuildAndUser(guildId, user.userId, (g, u) => {
                role = (u as any).role3;
                if (role === 'forger') {
                  produced = (u as any).pipesProduced || 0;
                } else if (role === 'welder') {
                  produced = (u as any).boxesProduced || 0;
                }
              });
              return { ...user, role, produced };
            });
          } else {
            top = getTopContributorsByTier(guildId, tier, 10);
          }
          
          const viewer = getUserRankByTier(guildId, tier, interaction.user.id);
          view = renderLeaderboard(guild, tier, top, selectedUserId, selectedUserId ? selectedUser : undefined, { viewerId: interaction.user.id, viewerRank: viewer.rank, viewerContributed: viewer.contributed });
        });
        {
          const ok = await safeUpdate(buttonInteraction, view);
          if (!ok) return;
        }
        return;
      }
      if (prefix !== 'tycoon') return;

      const guildId = interaction.guildId!;
      const userId = interaction.user.id;

      // Special-case: advancing to Tier 2 should refresh all users first
      if (action === 'tier2' && sub === 'advance') {
        // Bring everyone up to date before advancing tiers
        refreshGuildContributions(guildId);

        let view: any;
        let tierUp = false;
        withGuildAndUser(guildId, userId, (guild, user) => {
          const r = advanceTierIfReady(guild);
          tierUp = r.tierUp;
          if (tierUp) {
            // Immediately initialize Tier 2 state for all users to avoid stale displays
            initializeTier2ForGuild(guildId);
          }
          view = renderTycoon(guild, user);
        });

        {
          const ok = await safeUpdate(buttonInteraction, view);
          if (!ok) return;
        }
        if (tierUp && interaction.channel) {
          const top = getTopContributorsByTier(guildId, 1, 5);
          const lines = top.map((t, i) => `${i + 1}. <@${t.userId}> — ${Math.floor(t.contributed)}`);
          const content = `🎉 The guild has advanced to Tier 2: Iron Beams!\nTop Tier 1 contributors:\n${lines.join('\n') || 'No contributions recorded.'}`;
          await (interaction.channel as any).send({ content });
        }
        return;
      }
      // Special-case: advancing to Tier 3
      if (action === 'tier3' && sub === 'advance') {
        refreshGuildContributions(guildId);
        let view: any;
        let tierUp = false;
        withGuildAndUser(guildId, userId, (guild, user) => {
          const r = advanceTierIfReady(guild);
          tierUp = r.tierUp;
          view = renderTycoon(guild, user);
        });
        {
          const ok = await safeUpdate(buttonInteraction, view);
          if (!ok) return;
        }
        if (tierUp && interaction.channel) {
          const top = getTopContributorsByTier(guildId, 2, 5);
          const lines = top.map((t, i) => `${i + 1}. <@${t.userId}> — ${Math.floor(t.contributed)}`);
          const content = `🎉 The guild has advanced to Tier 3: Steel Boxes!\nTop Tier 2 contributors:\n${lines.join('\n') || 'No contributions recorded.'}`;
          await (interaction.channel as any).send({ content });
        }
        return;
      }

      let view: any;
      let tierUp = false;
      // For delayed manual collection announcement
      let delayed: DelayedChop | null = null;
      withGuildAndUser(guildId, userId, (guild, user) => {
        let customView: any | null = null;
        const tier = guild.widgetTier || 1;
        if (tier === 3) {
          const delta = applyPassiveTicksT3(guild, user);
          applyTier3GuildFlows(guild, user, delta);
        } else {
          const gainedPassive = applyPassiveTicks(user, tier);
          if (gainedPassive > 0) {
            applyGuildProgress(guild, gainedPassive, tier);
            if (tier === 1) user.lifetimeContributed += gainedPassive, (user as any).contributedT1 = ((user as any).contributedT1 || 0) + gainedPassive;
            if (tier === 2) user.lifetimeContributed += gainedPassive, (user as any).contributedT2 = ((user as any).contributedT2 || 0) + gainedPassive;
          }
        }

        if (action === 'chop') {
          if (tier === 3) {
            const res3 = clickTier3(guild, user);
            if ((res3 as any).ok) {
              const role = ((user as any).role3 || null) as 'forger' | 'welder' | null;
              delayed = { tier: 3, t3: { role, pipes: (res3 as any).pipes || 0, boxesPotential: (res3 as any).boxesPotential || 0 } };
              // Do not apply now; applied after public announcement delay
            }
          } else {
            const res = clickChop(guild, user, tier);
            if ((res as any).ok) {
              delayed = { tier: tier as 1 | 2, gained: (res as any).gained || 0 };
              // Do not apply now; applied after public announcement delay
            }
          }
        } else if (action === 'refresh') {
          // no-op beyond passive tick above; just re-render
        } else if (action === 'tier2' && sub === 'advance') {
          const r = advanceTierIfReady(guild);
          tierUp = r.tierUp || tierUp;
        } else if (action === 't3' && sub === 'choose') {
          const choice = sub2 === 'forger' ? 'forger' : 'welder';
          const prev = (user as any).role3 || null;
          (user as any).role3 = choice as any;
          if (prev && prev !== choice) {
            // Reset T3 automation when switching roles
            (user as any).automation3 = {};
            (user as any).rates.pipesPerSec = 0;
            (user as any).rates.boxesPerSec = 0;
          }
        } else if (action === 't3' && sub === 'switch') {
          // Always show confirmation before switching roles
          if (sub2 === 'forger' || sub2 === 'welder') {
            customView = renderRoleSwitchConfirm(guild, user, sub2 as 'forger' | 'welder');
          }
        } else if (action === 't3' && sub === 'confirm' && sub2 === 'forger') {
          const prev = (user as any).role3 || null;
          (user as any).role3 = 'forger';
          if (prev && prev !== 'forger') {
            (user as any).automation3 = {};
            (user as any).rates.pipesPerSec = 0;
            (user as any).rates.boxesPerSec = 0;
          }
        } else if (action === 't3' && sub === 'confirm' && sub2 === 'welder') {
          const prev = (user as any).role3 || null;
          (user as any).role3 = 'welder';
          if (prev && prev !== 'welder') {
            (user as any).automation3 = {};
            (user as any).rates.pipesPerSec = 0;
            (user as any).rates.boxesPerSec = 0;
          }
        } else if (action === 't3' && sub === 'cancel') {
          // No changes; simply fall through to re-render
        } else if (action === 'buy' && sub === 'axe') {
          const res = tryBuyAxeShared(guild);
          if (res.ok) {
            // no guild progress on spending, progress was counted when earning
          }
        } else if (action === 'buy' && sub === 'pick') {
          const res = tryBuyPickShared(guild);
          if (res.ok) {
            // no guild progress on spending
          }
        } else if (action === 'buy' && sub === 'auto') {
          const kind = sub2;
          if (tier === 3) {
            const res = tryBuyAutomationT3(guild, user, kind as any);
            if (res.ok) {
              // updated next tick
            }
          } else {
            const res = tryBuyAutomation(guild, user, kind, tier);
            if (res.ok) {
              // Updated via state helpers
            }
          }
        } else if (action === 't3' && sub === 'weldtoggle') {
          if (sub2 === 'on') {
            (user as any).weldPassiveEnabled = true;
          } else if (sub2 === 'off') {
            (user as any).weldPassiveEnabled = false;
          }
        } else if (action === 'buy' && sub === 't3click') {
          const role = (sub2 === 'forger' ? 'forger' : 'welder') as 'forger' | 'welder';
          const r = tryBuyT3ClickUpgrade(guild, role);
          if (r.ok) {
            // no direct progress; improved manual action is shared across role
          }
        }

        view = customView || renderTycoon(guild, user);
      });

      {
        const ok = await safeUpdate(buttonInteraction, view);
        if (!ok) return;
      }

      // After updating the ephemeral view, announce delayed manual collection publicly and apply after delay
      if (action === 'chop' && delayed && interaction.channel) {
        const d = delayed as DelayedChop;
        try {
          const tier = d.tier as number;
          const applyDelayMs = 60_000; // 1 minute delay before applying collection
          const applyAtSec = Math.floor((Date.now() + applyDelayMs) / 1000);
          let content = '';
          if (tier === 1) {
            const amt = Math.floor((d as any).gained || 0);
            content = `⏳ <@${userId}> is about to collect +${amt} sticks <t:${applyAtSec}:R> (at <t:${applyAtSec}:T>). Spend fast!`;
          } else if (tier === 2) {
            const amt = Math.floor((d as any).gained || 0);
            content = `⏳ <@${userId}> is about to collect +${amt} beams <t:${applyAtSec}:R> (at <t:${applyAtSec}:T>). Spend fast!`;
          } else if (tier === 3 && (d as any).t3) {
            if ((d as any).t3.role === 'forger') {
              const p = Math.floor((d as any).t3.pipes || 0);
              content = `⏳ <@${userId}> is about to forge +${p} pipes <t:${applyAtSec}:R> (at <t:${applyAtSec}:T>). Spend fast!`;
            } else {
              const b = Math.floor((d as any).t3.boxesPotential || 0);
              content = `⏳ <@${userId}> is about to weld up to +${b} boxes (limited by pipe inventory) <t:${applyAtSec}:R> (at <t:${applyAtSec}:T>). Spend fast!`;
            }
          }
          if (content) await (interaction.channel as any).send({ content });
        } catch (e) {
          console.error('announce error:', e);
        }

        // Apply after delay (1 minute)
        setTimeout(() => {
          try {
            if (!d) return;
            if ((d as any).tier === 3 && (d as any).t3) {
              withGuildAndUser(guildId, userId, (guild, user) => {
                applyTier3GuildFlows(guild, user, { pipes: (d as any).t3.pipes || 0, boxesPotential: (d as any).t3.boxesPotential || 0 });
                return null as any;
              });
            } else if ((d as any).gained && (d as any).gained > 0) {
              withGuildAndUser(guildId, userId, (guild, user) => {
                const tier = (d as any).tier as 1 | 2;
                applyGuildProgress(guild, (d as any).gained!, tier);
                if (tier === 1) user.lifetimeContributed += (d as any).gained!, (user as any).contributedT1 = ((user as any).contributedT1 || 0) + (d as any).gained!;
                if (tier === 2) user.lifetimeContributed += (d as any).gained!, (user as any).contributedT2 = ((user as any).contributedT2 || 0) + (d as any).gained!;
                return null as any;
              });
            }
          } catch (e) {
            console.error('delayed apply error:', e);
          }
        }, 60_000).unref?.();
      }
      if (tierUp && interaction.channel) {
        const top = getTopContributorsByTier(guildId, 1, 5);
        const lines = top.map((t, i) => `${i + 1}. <@${t.userId}> — ${Math.floor(t.contributed)}`);
        const content = `🎉 The guild has advanced to Tier 2: Iron Beams!\nTop Tier 1 contributors:\n${lines.join('\n') || 'No contributions recorded.'}`;
        await (interaction.channel as any).send({ content });
      }
      return;
    }
  } catch (err) {
    console.error('Interaction error:', err);
    if (interaction.isRepliable()) {
      const content = 'Something went wrong handling that action.';
      try {
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply({ content });
        } else {
          await interaction.reply({ content, flags: MessageFlags.Ephemeral });
        }
      } catch (e: any) {
        if (isUnknownInteractionError(e)) {
          console.warn('Ignoring Unknown interaction on error reply');
        } else {
          console.error('Failed to send error reply:', e);
        }
      }
    }
  }
});

client.login(token);
