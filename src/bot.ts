import 'dotenv/config';
import { Client, GatewayIntentBits, InteractionType, Partials, MessageFlags, Interaction, ChatInputCommandInteraction, ButtonInteraction } from 'discord.js';
import { initState, withGuildAndUser, getTopContributors, getTopContributorsByTier, getTopContributorsByRole, getTopProducersByRole, refreshGuildContributions, initializeTier2ForGuild, getUserRankByTier, refreshAllGuilds, resetAllUsersForPrestige, computeAndAwardMvp, getT3ProductionTotals, getT4ProductionTotals, getUsersByRoleT3, getUsersByRoleT4, getAllT3UsersProduction, getAllT4UsersProduction } from './state.js';
import { renderTycoon, renderLeaderboard, renderRoleSwitchConfirm } from './ui.js';
import { applyPassiveTicks, clickChop, tryBuyAxeShared, tryBuyAutomation, applyGuildProgress, tryBuyPickShared, advanceTierIfReady, applyPassiveTicksT3, applyTier3GuildFlows, tryBuyAutomationT3, clickTier3, tryBuyT3ClickUpgrade, applyPassiveTicksT4, applyTier4GuildFlows, clickTier4, tryBuyAutomationT4, tryBuyT4ClickUpgrade, resetGuildForPrestige, T3_PIPE_PER_BOX, T4_STEEL_PER_WHEEL, T4_WOOD_PER_WHEEL, T4_STEEL_PER_BOILER, T4_WOOD_PER_CABIN, T4_WHEELS_PER_TRAIN, T4_BOILERS_PER_TRAIN, T4_CABINS_PER_TRAIN } from './game.js';
const DEBUG_TOP = (process.env.GT_DEBUG_TOP ?? '').toLowerCase() === 'true';
const dTop = (...args: any[]) => { if (DEBUG_TOP) console.log('[top-debug]', ...args); };
interface DelayedAction {
  tier: 1 | 2 | 3 | 4;
  userId: string;
  guildId: string;
  timestamp: number;
  roleSnapshot: string | null; // Role at time of action
  data: {
    gained?: number;
    pipes?: number;
    boxesPotential?: number;
    wheels?: number;
    boilers?: number;
    cabins?: number;
  };
}

type DelayedChop =
  | { tier: 1 | 2; gained: number }
  | { tier: 3; t3: { role: 'forger' | 'welder' | null; pipes: number; boxesPotential: number } }
  | { tier: 4; t4: { role: 'lumberjack' | 'smithy' | 'wheelwright' | 'boilermaker' | 'coachbuilder' | 'mechanic' | null; wood?: number; steel?: number; wheels?: number; boilers?: number; cabins?: number; trains?: number } };

// Track delayed actions to prevent race conditions
const delayedActions = new Map<string, any>();

function scheduleDelayedAction(action: DelayedAction): void {
  const key = `${action.guildId}:${action.userId}`;
  
  // Cancel any existing delayed action for this user
  const existing = delayedActions.get(key);
  if (existing) {
    clearTimeout(existing);
  }
  
  const timeout = setTimeout(() => {
    delayedActions.delete(key);
    applyDelayedActionSafely(action);
  }, 8000);
  
  delayedActions.set(key, timeout);
}

function applyDelayedActionSafely(action: DelayedAction): void {
  try {
    withGuildAndUser(action.guildId, action.userId, (guild, user) => {
      // Validate state hasn't changed in ways that would invalidate the action
      const currentRole = action.tier === 3 ? (user as any).role3 : 
                         action.tier === 4 ? (user as any).role4 : null;
      
      if (action.roleSnapshot !== currentRole) {
        console.warn(`Skipping delayed action for ${action.userId}: role changed from ${action.roleSnapshot} to ${currentRole}`);
        return null;
      }
      
      // Apply the delayed action based on tier
      if (action.tier === 3 && action.data.pipes !== undefined) {
        applyTier3GuildFlows(guild, user, { 
          pipes: action.data.pipes, 
          boxesPotential: action.data.boxesPotential || 0 
        });
      } else if (action.tier === 4) {
        applyTier4GuildFlows(guild, user, { 
          woodPotential: (action.data as any).wood || 0,
          steelPotential: (action.data as any).steel || 0,
          wheelsPotential: (action.data as any).wheels || 0,
          boilersPotential: (action.data as any).boilers || 0,
          cabinsPotential: (action.data as any).cabins || 0,
          trainsPotential: (action.data as any).trains || 0
        });
      } else if ((action.tier === 1 || action.tier === 2) && action.data.gained !== undefined) {
        applyGuildProgress(guild, action.data.gained, action.tier);
        (user as any).lifetimeContributed = (user as any).lifetimeContributed + action.data.gained;
        if (action.tier === 1) {
          (user as any).contributedT1 = ((user as any).contributedT1 || 0) + action.data.gained;
        } else {
          (user as any).contributedT2 = ((user as any).contributedT2 || 0) + action.data.gained;
        }
      }
      
      return null;
    });
  } catch (error) {
    console.error(`Failed to apply delayed action for ${action.userId}:`, error);
  }
}

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
    await i.update({
      ...(view || {}),
      allowedMentions: { parse: [] as any[] }
    } as any);
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
    // Autocomplete for /activity role
    if ((interaction as any).isAutocomplete?.()) {
      const auto: any = interaction as any;
      if (!interaction.inGuild?.()) {
        await auto.respond([]);
        return;
      }
      if (auto.commandName === 'activity') {
        const guildId = interaction.guildId!;
        let tier = 1;
        withGuildAndUser(guildId, interaction.user.id, (g, u) => { tier = g.widgetTier || 1; });
        const q = (auto.options?.getFocused?.()?.value || auto.options?.getFocused?.() || '').toString().toLowerCase();
        const rolesT3 = [
          { value: 'forger', name: 'Forger' },
          { value: 'welder', name: 'Welder' }
        ];
        const rolesT4 = [
          { value: 'lumberjack', name: 'Lumberjack' },
          { value: 'smithy', name: 'Smithy' },
          { value: 'wheelwright', name: 'Wheelwright' },
          { value: 'boilermaker', name: 'Boilermaker' },
          { value: 'coachbuilder', name: 'Coachbuilder' },
          { value: 'mechanic', name: 'Mechanic' }
        ];
        const source = tier === 3 ? rolesT3 : tier === 4 ? rolesT4 : [];
        const filtered = source.filter(r => r.name.toLowerCase().includes(q) || r.value.includes(q)).slice(0, 25);
        await auto.respond(filtered);
        return;
      }
    }
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
          } else if (tier === 4) {
            const delta4 = applyPassiveTicksT4(guild, user);
            applyTier4GuildFlows(guild, user, delta4);
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
        
        let top: Array<{ userId: string; contributed: number; role?: any; produced?: number }>;
        let roleTotals: Record<string, number> | undefined = undefined;
        let viewerRole: string | null = null;
        let viewerProduced = 0;
        if (tier === 3) {
          // For Tier 3, rank by percent-of-role (produced / total[role])
          const rows = getAllT3UsersProduction(guildId);
          roleTotals = getT3ProductionTotals(guildId) as any;
          const enriched = rows
            .map(r => {
              const role = (r.role || undefined) as any;
              const produced = role === 'forger' ? (r.pipesProduced || 0) : role === 'welder' ? (r.boxesProduced || 0) : 0;
              const total = role ? (roleTotals as any)[role] || 0 : 0;
              const percent = total > 0 ? (produced / total) : 0;
              return { userId: r.userId, contributed: produced, role, produced, percent };
            })
            .filter(x => x.role && x.produced > 0);
          enriched.sort((a, b) => b.percent - a.percent);
          top = enriched;
          viewerRole = (currentUser as any)?.role3 || null;
          if (viewerRole === 'forger') viewerProduced = (currentUser as any).pipesProduced || 0;
          else if (viewerRole === 'welder') viewerProduced = (currentUser as any).boxesProduced || 0;
        } else {
          if (tier === 4) {
            const rows = getAllT4UsersProduction(guildId);
            roleTotals = getT4ProductionTotals(guildId) as any;
            const enriched = rows
              .map(r => {
                const role = (r.role || undefined) as any;
                let produced = 0;
                if (role === 'lumberjack') produced = r.woodProduced || 0;
                else if (role === 'smithy') produced = r.steelProduced || 0;
                else if (role === 'wheelwright') produced = r.wheelsProduced || 0;
                else if (role === 'boilermaker') produced = r.boilersProduced || 0;
                else if (role === 'coachbuilder') produced = r.cabinsProduced || 0;
                else if (role === 'mechanic') produced = r.trainsProduced || 0;
                const total = role ? (roleTotals as any)[role] || 0 : 0;
                const percent = total > 0 ? (produced / total) : 0;
                return { userId: r.userId, contributed: produced, role, produced, percent };
              })
              .filter(x => x.role && x.produced > 0);
            enriched.sort((a, b) => b.percent - a.percent);
            top = enriched;
            viewerRole = (currentUser as any)?.role4 || null;
            if (viewerRole === 'lumberjack') viewerProduced = (currentUser as any).woodProduced || 0;
            else if (viewerRole === 'smithy') viewerProduced = (currentUser as any).steelProduced || 0;
            else if (viewerRole === 'wheelwright') viewerProduced = (currentUser as any).wheelsProduced || 0;
            else if (viewerRole === 'boilermaker') viewerProduced = (currentUser as any).boilersProduced || 0;
            else if (viewerRole === 'coachbuilder') viewerProduced = (currentUser as any).cabinsProduced || 0;
            else if (viewerRole === 'mechanic') viewerProduced = (currentUser as any).trainsProduced || 0;
          } else {
            top = getTopContributorsByTier(guildId, tier, 5);
          }
        }
        
        let selectedUserId = top.length ? top[0].userId : undefined;
        let selectedUser: any = undefined;
        if (selectedUserId) {
          withGuildAndUser(guildId, selectedUserId, (g2, u2) => {
            selectedUser = u2;
          });
        }
        const viewer = getUserRankByTier(guildId, tier, interaction.user.id);
        dTop('slash /top', { tier, roleTotals, viewerRole, viewerProduced, top });
        view = renderLeaderboard(currentGuild, tier, top, selectedUserId, selectedUser, { 
          viewerId: interaction.user.id, 
          viewerRank: viewer.rank, 
          viewerContributed: viewer.contributed,
          roleTotals,
          viewerRole,
          viewerProduced
        });
        await command.reply({
          ...(view || {}),
          allowedMentions: { parse: [] as any[] }
        } as any);
      }
      if (command.commandName === 'activity') {
        if (!(await ensureGuildInteraction(interaction))) return;
        const guildId = interaction.guildId!;
        // Keep state fresh so rates reflect recent automation
        refreshGuildContributions(guildId);
        const roleOpt = (command as any).options?.getString('role') as string | null;
        let tier = 1;
        withGuildAndUser(guildId, interaction.user.id, (g, u) => {
          tier = g.widgetTier || 1;
        });

        // Helper to format small rates consistently
        const rf = (n: number) => {
          if (!isFinite(n) || !n) return '0.00';
          return Math.abs(n) < 1000 ? n.toFixed(2) : Math.floor(n).toString();
        };

        // Helper to build a report for one role
        const buildForRole = (role: string): string => {
          const active: string[] = [];
          const inactive: string[] = [];
          if (tier === 3) {
            if (role !== 'forger' && role !== 'welder') return '';
            const ids = getUsersByRoleT3(guildId, role as any);
            for (const uid of ids) {
              withGuildAndUser(guildId, uid, (g, u) => {
                if (role === 'welder') {
                  const on = (u as any).weldPassiveEnabled !== false;
                  if (on) {
                    const boxesRate = (u as any).rates?.boxesPerSec || 0;
                    const pipesRate = boxesRate * T3_PIPE_PER_BOX;
                    active.push(`<@${uid}> (${rf(pipesRate)} pipes/s)`);
                  } else {
                    inactive.push(`<@${uid}>`);
                  }
                } else {
                  const rate = (u as any).rates?.pipesPerSec || 0;
                  (rate > 0 ? active : inactive).push(`<@${uid}>`);
                }
              });
            }
          } else if (tier === 4) {
            const valid = ['lumberjack','smithy','wheelwright','boilermaker','coachbuilder','mechanic'];
            if (!valid.includes(role)) return '';
            const ids = getUsersByRoleT4(guildId, role as any);
            for (const uid of ids) {
              withGuildAndUser(guildId, uid, (g, u) => {
                const rateKey = role === 'lumberjack' ? 'woodPerSec'
                  : role === 'smithy' ? 'steelPerSec'
                  : role === 'wheelwright' ? 'wheelsPerSec'
                  : role === 'boilermaker' ? 'boilersPerSec'
                  : role === 'coachbuilder' ? 'cabinsPerSec'
                  : 'trainsPerSec';
                const rate = (u as any).rates?.[rateKey] || 0;
                if (rate > 0) {
                  if (role === 'wheelwright') {
                    const steel = rate * T4_STEEL_PER_WHEEL;
                    const wood = rate * T4_WOOD_PER_WHEEL;
                    active.push(`<@${uid}> (${rf(steel)} steel/s, ${rf(wood)} wood/s)`);
                  } else if (role === 'boilermaker') {
                    const steel = rate * T4_STEEL_PER_BOILER;
                    active.push(`<@${uid}> (${rf(steel)} steel/s)`);
                  } else if (role === 'coachbuilder') {
                    const wood = rate * T4_WOOD_PER_CABIN;
                    active.push(`<@${uid}> (${rf(wood)} wood/s)`);
                  } else if (role === 'mechanic') {
                    const wheels = rate * T4_WHEELS_PER_TRAIN;
                    const boilers = rate * T4_BOILERS_PER_TRAIN;
                    const cabins = rate * T4_CABINS_PER_TRAIN;
                    active.push(`<@${uid}> (${rf(wheels)} wheels/s, ${rf(boilers)} boilers/s, ${rf(cabins)} cabins/s)`);
                  } else {
                    // lumberjack/smithy don't consume inputs; just list as active
                    active.push(`<@${uid}>`);
                  }
                } else {
                  inactive.push(`<@${uid}>`);
                }
              });
            }
          } else {
            return `Tier ${tier} has no roles.`;
          }
          const roleTitle = role[0].toUpperCase() + role.slice(1);
          const activeLine = active.length ? active.join(', ') : 'None';
          const inactiveLine = inactive.length ? inactive.join(', ') : 'None';
          return `## ${roleTitle}\nActive: ${activeLine}\nInactive: ${inactiveLine}`;
        };

        let content = '';
        if (tier === 3) {
          const roles = roleOpt ? [roleOpt] : ['forger','welder'];
          content = roles.map(r => buildForRole(r)).filter(Boolean).join('\n\n');
        } else if (tier === 4) {
          const valid = ['lumberjack','smithy','wheelwright','boilermaker','coachbuilder','mechanic'];
          const roles = roleOpt ? [roleOpt] : valid;
          content = roles.map(r => buildForRole(r)).filter(Boolean).join('\n\n');
        } else {
          content = `Tier ${tier} has no roles.`;
        }

        await command.reply({
          content,
          allowedMentions: { parse: [] as any[] },
          flags: MessageFlags.Ephemeral
        } as any);
      }
      return;
    }

    if (interaction.isButton()) {
      const buttonInteraction = interaction as ButtonInteraction;
      if (!(await ensureGuildInteraction(interaction))) return;
      const [prefix, action, sub, sub2] = buttonInteraction.customId.split(':');
      if (prefix === 'top') {
        const guildId = interaction.guildId!;
        refreshGuildContributions(guildId);
        const selectedUserId = action === 'view' ? sub : undefined;
        let view: any;
        let currentUser: any;
        withGuildAndUser(guildId, interaction.user.id, (guild, user) => {
          currentUser = user;
        });
        
        withGuildAndUser(guildId, selectedUserId || interaction.user.id, (guild, selectedUser) => {
          const tier = guild.widgetTier || 1;
          let top: Array<{ userId: string; contributed: number; role?: any; produced?: number; percent?: number }>;
          let roleTotals: Record<string, number> | undefined = undefined;
          if (tier === 3) {
            // For Tier 3, rank by percent-of-role
            const rows = getAllT3UsersProduction(guildId);
            roleTotals = getT3ProductionTotals(guildId) as any;
            const enriched = rows
              .map(r => {
                const role = (r.role || undefined) as any;
                const produced = role === 'forger' ? (r.pipesProduced || 0) : role === 'welder' ? (r.boxesProduced || 0) : 0;
                const total = role ? (roleTotals as any)[role] || 0 : 0;
                const percent = total > 0 ? (produced / total) : 0;
                return { userId: r.userId, contributed: produced, role, produced, percent };
              })
              .filter(x => x.role && x.produced > 0);
            enriched.sort((a, b) => b.percent - a.percent);
            top = enriched;
          } else {
            if (tier === 4) {
              const rows = getAllT4UsersProduction(guildId);
              roleTotals = getT4ProductionTotals(guildId) as any;
              const enriched = rows
                .map(r => {
                  const role = (r.role || undefined) as any;
                  let produced = 0;
                  if (role === 'lumberjack') produced = r.woodProduced || 0;
                  else if (role === 'smithy') produced = r.steelProduced || 0;
                  else if (role === 'wheelwright') produced = r.wheelsProduced || 0;
                  else if (role === 'boilermaker') produced = r.boilersProduced || 0;
                  else if (role === 'coachbuilder') produced = r.cabinsProduced || 0;
                  else if (role === 'mechanic') produced = r.trainsProduced || 0;
                  const total = role ? (roleTotals as any)[role] || 0 : 0;
                  const percent = total > 0 ? (produced / total) : 0;
                  return { userId: r.userId, contributed: produced, role, produced, percent };
                })
                .filter(x => x.role && x.produced > 0);
              enriched.sort((a, b) => b.percent - a.percent);
              top = enriched;
            } else {
              top = getTopContributorsByTier(guildId, tier, 5);
            }
          }
          
          const viewer = getUserRankByTier(guildId, tier, interaction.user.id);
          let viewerRole: string | null = null;
          let viewerProduced = 0;
          withGuildAndUser(guildId, interaction.user.id, (_g, u) => {
            if (tier === 3) {
              viewerRole = (u as any).role3 || null;
              if (viewerRole === 'forger') viewerProduced = (u as any).pipesProduced || 0;
              else if (viewerRole === 'welder') viewerProduced = (u as any).boxesProduced || 0;
            } else if (tier === 4) {
              viewerRole = (u as any).role4 || null;
              if (viewerRole === 'lumberjack') viewerProduced = (u as any).woodProduced || 0;
              else if (viewerRole === 'smithy') viewerProduced = (u as any).steelProduced || 0;
              else if (viewerRole === 'wheelwright') viewerProduced = (u as any).wheelsProduced || 0;
              else if (viewerRole === 'boilermaker') viewerProduced = (u as any).boilersProduced || 0;
              else if (viewerRole === 'coachbuilder') viewerProduced = (u as any).cabinsProduced || 0;
              else if (viewerRole === 'mechanic') viewerProduced = (u as any).trainsProduced || 0;
            }
          });
          dTop('button top:view', { tier, roleTotals, top });
          view = renderLeaderboard(guild, tier, top, selectedUserId, selectedUserId ? selectedUser : undefined, { 
            viewerId: interaction.user.id, 
            viewerRank: viewer.rank, 
            viewerContributed: viewer.contributed,
            roleTotals,
            viewerRole,
            viewerProduced
          });
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
      // Special-case: Tier 4 prestige advance
      if (action === 'tier4' && sub === 'advance') {
        refreshGuildContributions(guildId);
        let view: any;
        let tierUp = false;
        let didPrestige = false;
        withGuildAndUser(guildId, userId, (guild, user) => {
          const current = guild.widgetTier || 1;
          const r = advanceTierIfReady(guild);
          tierUp = r.tierUp;
          if (tierUp && current === 4) {
            // Complete prestige reset + MVP award
            const mvp = computeAndAwardMvp(guildId);
            resetGuildForPrestige(guild);
            didPrestige = true;
          }
          view = renderTycoon(guild, user);
        });
        {
          const ok = await safeUpdate(buttonInteraction, view);
          if (!ok) return;
        }
        if (didPrestige && interaction.channel) {
          const top = getTopContributorsByTier(guildId, 4, 5);
          const lines = top.map((t, i) => `${i + 1}. <@${t.userId}> — ${Math.floor(t.contributed)}`);
          const content = `🏆 Prestige unlocked! Guild reset to Tier 1.\nTop Tier 4 contributors:\n${lines.join('\n') || 'No contributions recorded.'}`;
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
        } else if (tier === 4) {
          const delta = applyPassiveTicksT4(guild, user);
          applyTier4GuildFlows(guild, user, delta);
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
          } else if (tier === 4) {
            const r4 = clickTier4(guild, user) as any;
            if (r4.ok) {
              const role4 = ((user as any).role4 || null) as 'lumberjack' | 'smithy' | 'wheelwright' | 'boilermaker' | 'coachbuilder' | 'mechanic' | null;
              // Defer apply via public announcement; encode only relevant potentials
              const data: any = {};
              if (r4.wood) data.woodPotential = r4.wood;
              if (r4.steel) data.steelPotential = r4.steel;
              if (r4.wheels) data.wheelsPotential = r4.wheels;
              if (r4.boilers) data.boilersPotential = r4.boilers;
              if (r4.cabins) data.cabinsPotential = r4.cabins;
              if (r4.trains) data.trainsPotential = r4.trains;
              // Stash on delayed for messaging
              (delayed as any) = { tier: 4, t4: { role: role4, ...r4 } };
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
          } else if (tier === 4) {
            const res = tryBuyAutomationT4(guild, user, kind as any);
            if (res.ok) {
              // updated next tick
            }
          } else {
            const res = tryBuyAutomation(guild, user, kind, tier);
            if (res.ok) {
              // Updated via state helpers
            }
          }
        } else if (action === 't4' && sub === 'choose') {
          const valid = ['lumberjack','smithy','wheelwright','boilermaker','coachbuilder','mechanic'];
          const choice = valid.includes(sub2 || '') ? (sub2 as any) : null;
          if (choice) {
            const prev = (user as any).role4 || null;
            (user as any).role4 = choice;
            if (prev && prev !== choice) {
              (user as any).automation4 = (user as any).automation4 || {};
              // Do not clear other automations; role switch does not destroy T4 automations by default
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
        } else if (action === 'buy' && sub === 't4click') {
          const role = (sub2 || '') as any;
          const r = tryBuyT4ClickUpgrade(guild, role);
          if (r.ok) {
            // improved manual action shared across that T4 role
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
          } else if (tier === 4 && (d as any).t4) {
            const role = (d as any).t4.role;
            const r4 = (d as any).t4;
            if (role === 'lumberjack') content = `⏳ <@${userId}> will chop +${Math.floor(r4.wood || 0)} wood <t:${applyAtSec}:R> (at <t:${applyAtSec}:T>).`;
            else if (role === 'smithy') content = `⏳ <@${userId}> will forge +${Math.floor(r4.steel || 0)} steel <t:${applyAtSec}:R> (at <t:${applyAtSec}:T>).`;
            else if (role === 'wheelwright') content = `⏳ <@${userId}> will craft +${Math.floor(r4.wheels || 0)} wheels <t:${applyAtSec}:R> (at <t:${applyAtSec}:T>).`;
            else if (role === 'boilermaker') content = `⏳ <@${userId}> will build +${Math.floor(r4.boilers || 0)} boilers <t:${applyAtSec}:R> (at <t:${applyAtSec}:T>).`;
            else if (role === 'coachbuilder') content = `⏳ <@${userId}> will carve +${Math.floor(r4.cabins || 0)} cabins <t:${applyAtSec}:R> (at <t:${applyAtSec}:T>).`;
            else if (role === 'mechanic') content = `⏳ <@${userId}> will assemble +${Math.floor(r4.trains || 0)} trains <t:${applyAtSec}:R> (at <t:${applyAtSec}:T>).`;
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
            } else if ((d as any).tier === 4 && (d as any).t4) {
              withGuildAndUser(guildId, userId, (guild, user) => {
                const r4 = (d as any).t4;
                applyTier4GuildFlows(guild, user, { woodPotential: r4.wood || 0, steelPotential: r4.steel || 0, wheelsPotential: r4.wheels || 0, boilersPotential: r4.boilers || 0, cabinsPotential: r4.cabins || 0, trainsPotential: r4.trains || 0 });
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
