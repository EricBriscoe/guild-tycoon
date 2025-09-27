import 'dotenv/config';
import { Client, GatewayIntentBits, InteractionType, Partials, MessageFlags, Interaction, ChatInputCommandInteraction, ButtonInteraction } from 'discord.js';
import { initState, withGuildAndUser, getTopContributors, getTopContributorsByTier, getTopContributorsByRole, getTopProducersByRole, refreshGuildContributions, initializeTier2ForGuild, getUserRankByTier, refreshAllGuilds, resetAllUsersForPrestige, computeAndAwardMvp, getT3ProductionTotals, getT4ProductionTotals, getUsersByRoleT3, getUsersByRoleT4, getAllT3UsersProduction, getAllT4UsersProduction, disableAllWeldersPassive, disableT4ConsumersByRole, logPurchaseEvent, getPurchaseEvents } from './state.js';
import { ChartJSNodeCanvas } from 'chartjs-node-canvas';
import 'chart.js/auto';
import { renderTycoon, renderLeaderboard, renderRoleSwitchConfirm, renderRoleSwitchSelectorT4 } from './ui.js';
import { applyPassiveTicks, clickChop, tryBuyAxeShared, tryBuyAutomation, applyGuildProgress, tryBuyPickShared, advanceTierIfReady, applyPassiveTicksT3, applyTier3GuildFlows, tryBuyAutomationT3, clickTier3, tryBuyT3ClickUpgrade, applyPassiveTicksT4, applyTier4GuildFlows, clickTier4, tryBuyAutomationT4, tryBuyT4ClickUpgrade, resetGuildForPrestige, T3_PIPE_PER_BOX, T4_STEEL_PER_WHEEL, T4_WOOD_PER_WHEEL, T4_STEEL_PER_BOILER, T4_WOOD_PER_CABIN, T4_WHEELS_PER_TRAIN, T4_BOILERS_PER_TRAIN, T4_CABINS_PER_TRAIN } from './game.js';
const DEBUG_TOP = (process.env.GT_DEBUG_TOP ?? '').toLowerCase() === 'true';
const dTop = (...args: any[]) => { if (DEBUG_TOP) console.log('[top-debug]', ...args); };
type DelayedChop =
  | { tier: 1 | 2; gained: number }
  | { tier: 3; t3: { role: 'forger' | 'welder' | null; pipes: number; boxesPotential: number } }
  | { tier: 4; t4: { role: 'lumberjack' | 'smithy' | 'wheelwright' | 'boilermaker' | 'coachbuilder' | 'mechanic' | null; wood?: number; steel?: number; wheels?: number; boilers?: number; cabins?: number; trains?: number } };

// (legacy delayed actions scheduler removed)

const token = process.env.DISCORD_TOKEN;

if (!token) {
  console.error('Missing DISCORD_TOKEN in environment. See .env.example');
  process.exit(1);
}

await initState();

// Background passive production ticker (configurable)
const TICK_ENABLED = (process.env.GT_BACKGROUND_TICK_ENABLED ?? 'true').toLowerCase() !== 'false';
const TICK_MS = Math.max(1000, Number(process.env.GT_BACKGROUND_TICK_MS ?? 15000));
const TICK_LOG = (process.env.GT_BACKGROUND_TICK_LOG ?? 'false').toLowerCase() === 'true';

if (TICK_ENABLED) {
  let inFlight = false;
  setInterval(async () => {
    if (inFlight) return; // prevent overlap if a tick takes longer
    inFlight = true;
    try {
      const now = Date.now();
      const r = await refreshAllGuilds(now);
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
    // Autocomplete for /activity and /blame role
    if ((interaction as any).isAutocomplete?.()) {
      const auto: any = interaction as any;
      if (!interaction.inGuild?.()) {
        await auto.respond([]);
        return;
      }
      if (auto.commandName === 'activity' || auto.commandName === 'blame') {
        const guildId = interaction.guildId!;
        let tier = 1;
        await withGuildAndUser(guildId, interaction.user.id, (g, u) => { tier = g.widgetTier || 1; return null; });
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

        // Ensure all users' passive gains are applied so shared inventory reflects everyone
        try { await refreshGuildContributions(guildId); } catch (e) { console.error('pre-tycoon refresh failed:', e); }

        let view: any;
        let tierUp = false;
        await withGuildAndUser(guildId, userId, (guild, user) => {
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
          return null;
        });

        // Use flags for ephemeral to avoid deprecation warnings
        await command.reply({ ...view, flags: (((view as any).flags || 0) | MessageFlags.Ephemeral) });
        // No announcement here; advancement happens only via button click
      }
      if (command.commandName === 'top') {
        if (!(await ensureGuildInteraction(interaction))) return;
        const guildId = interaction.guildId!;
        // Ensure all users' passive gains and contributions are current
        await refreshGuildContributions(guildId);
        // Use per-tier contributions based on current guild tier
        let view: any;
        let currentGuild: any;
        let tier: number = 1;
        let currentUser: any;
        await withGuildAndUser(guildId, interaction.user.id, (guild, user) => {
          currentGuild = guild;
          tier = guild.widgetTier || 1;
          currentUser = user;
          return null;
        });
        
        let top: Array<{ userId: string; contributed: number; role?: any; produced?: number }>;
        let roleTotals: Record<string, number> | undefined = undefined;
        let viewerRole: string | null = null;
        let viewerProduced = 0;
        const dedupeByUserId = <T extends { userId: string }>(arr: T[]): T[] => {
          const seen = new Set<string>();
          const out: T[] = [];
          for (const item of arr) {
            const id = String(item.userId || '');
            if (seen.has(id)) continue;
            seen.add(id);
            out.push(item);
          }
          return out;
        };
        if (tier === 3) {
          // For Tier 3, rank by percent-of-role (produced / total[role])
          const rows = await getAllT3UsersProduction(guildId);
          roleTotals = await getT3ProductionTotals(guildId) as any;
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
          top = dedupeByUserId(enriched);
          viewerRole = (currentUser as any)?.role3 || null;
          if (viewerRole === 'forger') viewerProduced = (currentUser as any).pipesProduced || 0;
          else if (viewerRole === 'welder') viewerProduced = (currentUser as any).boxesProduced || 0;
        } else {
          if (tier === 4) {
            const rows = await getAllT4UsersProduction(guildId);
            roleTotals = await getT4ProductionTotals(guildId) as any;
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
            top = dedupeByUserId(enriched);
            viewerRole = (currentUser as any)?.role4 || null;
            if (viewerRole === 'lumberjack') viewerProduced = (currentUser as any).woodProduced || 0;
            else if (viewerRole === 'smithy') viewerProduced = (currentUser as any).steelProduced || 0;
            else if (viewerRole === 'wheelwright') viewerProduced = (currentUser as any).wheelsProduced || 0;
            else if (viewerRole === 'boilermaker') viewerProduced = (currentUser as any).boilersProduced || 0;
            else if (viewerRole === 'coachbuilder') viewerProduced = (currentUser as any).cabinsProduced || 0;
            else if (viewerRole === 'mechanic') viewerProduced = (currentUser as any).trainsProduced || 0;
          } else {
            top = dedupeByUserId(await getTopContributorsByTier(guildId, tier, 5));
          }
        }
        
        let selectedUserId = top.length ? top[0].userId : undefined;
        let selectedUser: any = undefined;
        if (selectedUserId) {
          await withGuildAndUser(guildId, selectedUserId, (g2, u2) => { selectedUser = u2; return null; });
        }
        const viewer = await getUserRankByTier(guildId, tier, interaction.user.id);
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
        await refreshGuildContributions(guildId);
        const roleOpt = (command as any).options?.getString('role') as string | null;
        let tier = 1;
        await withGuildAndUser(guildId, interaction.user.id, (g, u) => { tier = g.widgetTier || 1; return null; });

        // Helper to format small rates consistently
        const rf = (n: number) => {
          if (!isFinite(n) || !n) return '0.00';
          return Math.abs(n) < 1000 ? n.toFixed(2) : Math.floor(n).toString();
        };

        // Helper to build a report for one role
        const buildForRole = async (role: string): Promise<string> => {
          const active: string[] = [];
          const inactive: string[] = [];
          if (tier === 3) {
            if (role !== 'forger' && role !== 'welder') return '';
            const ids = await getUsersByRoleT3(guildId, role as any);
            for (const uid of ids) {
              await withGuildAndUser(guildId, uid, (g, u) => {
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
                return null;
              });
            }
          } else if (tier === 4) {
            const valid = ['lumberjack','smithy','wheelwright','boilermaker','coachbuilder','mechanic'];
            if (!valid.includes(role)) return '';
            const ids = await getUsersByRoleT4(guildId, role as any);
            for (const uid of ids) {
              await withGuildAndUser(guildId, uid, (g, u) => {
                // Determine passive toggle for consumer roles
                const role4 = role as any;
                const passives = {
                  wheelwright: (u as any).wheelPassiveEnabled !== false,
                  boilermaker: (u as any).boilerPassiveEnabled !== false,
                  coachbuilder: (u as any).coachPassiveEnabled !== false,
                  mechanic: (u as any).mechPassiveEnabled !== false
                } as any;
                const rateKey = role4 === 'lumberjack' ? 'woodPerSec'
                  : role4 === 'smithy' ? 'steelPerSec'
                  : role4 === 'wheelwright' ? 'wheelsPerSec'
                  : role4 === 'boilermaker' ? 'boilersPerSec'
                  : role4 === 'coachbuilder' ? 'cabinsPerSec'
                  : 'trainsPerSec';
                const rate = (u as any).rates?.[rateKey] || 0;
                const consumerPassiveOn = role4 === 'wheelwright' ? passives.wheelwright
                  : role4 === 'boilermaker' ? passives.boilermaker
                  : role4 === 'coachbuilder' ? passives.coachbuilder
                  : role4 === 'mechanic' ? passives.mechanic
                  : true; // producers always on

                if (!consumerPassiveOn || rate <= 0) {
                  inactive.push(`<@${uid}>`);
                } else {
                  if (role4 === 'wheelwright') {
                    const steel = rate * T4_STEEL_PER_WHEEL;
                    const wood = rate * T4_WOOD_PER_WHEEL;
                    active.push(`<@${uid}> (${rf(steel)} steel/s, ${rf(wood)} wood/s)`);
                  } else if (role4 === 'boilermaker') {
                    const steel = rate * T4_STEEL_PER_BOILER;
                    active.push(`<@${uid}> (${rf(steel)} steel/s)`);
                  } else if (role4 === 'coachbuilder') {
                    const wood = rate * T4_WOOD_PER_CABIN;
                    active.push(`<@${uid}> (${rf(wood)} wood/s)`);
                  } else if (role4 === 'mechanic') {
                    const wheels = rate * T4_WHEELS_PER_TRAIN;
                    const boilers = rate * T4_BOILERS_PER_TRAIN;
                    const cabins = rate * T4_CABINS_PER_TRAIN;
                    active.push(`<@${uid}> (${rf(wheels)} wheels/s, ${rf(boilers)} boilers/s, ${rf(cabins)} cabins/s)`);
                  } else {
                    // lumberjack/smithy: list as active if rate > 0
                    active.push(`<@${uid}>`);
                  }
                }
                return null;
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
          const parts = await Promise.all(roles.map(r => buildForRole(r)));
          content = parts.filter(Boolean).join('\n\n');
        } else if (tier === 4) {
          const valid = ['lumberjack','smithy','wheelwright','boilermaker','coachbuilder','mechanic'];
          const roles = roleOpt ? [roleOpt] : valid;
          const parts = await Promise.all(roles.map(r => buildForRole(r)));
          content = parts.filter(Boolean).join('\n\n');
        } else {
          content = `Tier ${tier} has no roles.`;
        }

        await command.reply({
          content,
          allowedMentions: { parse: [] as any[] },
          flags: MessageFlags.Ephemeral
        } as any);
      }
      
      if (command.commandName === 'blame') {
        if (!(await ensureGuildInteraction(interaction))) return;
        const guildId = interaction.guildId!;
        const roleOpt = (command as any).options?.getString('role') as string | null;
        if (!roleOpt) {
          await command.reply({ content: 'Please specify a role.', flags: MessageFlags.Ephemeral } as any);
          return;
        }
        let tier = 1;
        await withGuildAndUser(guildId, interaction.user.id, (g, _u) => { tier = g.widgetTier || 1; return null; });
        const validT3 = ['forger','welder'];
        const validT4 = ['lumberjack','smithy','wheelwright','boilermaker','coachbuilder','mechanic'];
        const valid = tier === 3 ? validT3 : (tier === 4 ? validT4 : []);
        if (!valid.includes(roleOpt)) {
          const hint = valid.length ? `Valid roles for Tier ${tier}: ${valid.join(', ')}` : `Tier ${tier} has no roles.`;
          await command.reply({ content: `Invalid role for current tier. ${hint}`, flags: MessageFlags.Ephemeral } as any);
          return;
        }
        // Aggregate spend per user per hour (12 bins over past 12 hours)
        const now = Date.now();
        const HOUR = 60 * 60 * 1000;
        const HOURS = 12;
        const nowHour = new Date(now);
        nowHour.setMinutes(0, 0, 0);
        const thisHourStart = nowHour.getTime();
        const rangeStart = thisHourStart - (HOURS - 1) * HOUR; // inclusive start
        const events = await getPurchaseEvents(guildId, { tier, role: roleOpt, since: rangeStart, until: now });
        if (!events.length) {
          await command.reply({ content: `No purchases recorded for '${roleOpt}' in the last 12 hours.`, flags: MessageFlags.Ephemeral } as any);
          return;
        }
        // Prepare hour labels and bin mapping (relative labels: -Nh)
        const hourLabels: string[] = [];
        for (let i = 0; i < HOURS; i++) {
          const hoursAgo = (HOURS - 1) - i; // 11,10,...,0
          hourLabels.push(`-${hoursAgo}h`);
        }
        // Build user -> [h0..hN]
        const perUser: Map<string, number[]> = new Map();
        const totalsForRank: Map<string, number> = new Map();
        for (const e of events) {
          const idx = Math.floor((e.ts - rangeStart) / HOUR);
          if (idx < 0 || idx > (HOURS - 1)) continue;
          const arr = perUser.get(e.user_id) || Array(HOURS).fill(0);
          arr[idx] += (e.amount || 0);
          perUser.set(e.user_id, arr);
          totalsForRank.set(e.user_id, (totalsForRank.get(e.user_id) || 0) + (e.amount || 0));
        }
        if (perUser.size === 0) {
          await command.reply({ content: `No purchases recorded for '${roleOpt}' in the last 12 hours.`, flags: MessageFlags.Ephemeral } as any);
          return;
        }
        // Pick top users by total and optionally aggregate the rest as "Others"
        const TOP = 10;
        const ranked = Array.from(totalsForRank.entries()).sort((a,b) => b[1] - a[1]);
        const topUsers = ranked.slice(0, TOP).map(([id]) => id);
        const othersUsers = ranked.slice(TOP).map(([id]) => id);
        // Resolve display names
        const guildAny: any = (command as any).guild;
        const userIds = topUsers;
        let displayNames: Record<string, string> = {};
        try {
          if (!guildAny) throw new Error('Guild not found in interaction');
          const fetched: any = await (guildAny.members as any).fetch({ user: userIds });
          for (const uid of userIds) {
            const m = fetched.get ? fetched.get(uid) : (Array.isArray(fetched) ? fetched.find((x: any) => x.id === uid) : (fetched?.[uid] || null));
            const tag = m?.nickname || m?.user?.globalName || m?.user?.username || uid;
            displayNames[uid] = String(tag);
          }
        } catch (_) {
          for (const uid of userIds) displayNames[uid] = `@${uid}`;
        }
        // Build line datasets (per user)
        const N = topUsers.length + (othersUsers.length ? 1 : 0);
        const colorFor = (i: number) => `hsl(${Math.round((360 * i) / Math.max(1, N))}, 70%, 55%)`;
        const datasets: any[] = [];
        topUsers.forEach((uid, i) => {
          const arr = perUser.get(uid) || Array(HOURS).fill(0);
          datasets.push({
            type: 'line',
            label: displayNames[uid] || uid,
            data: arr.map(v => Math.floor(v)),
            backgroundColor: colorFor(i),
            borderColor: colorFor(i),
            borderWidth: 2,
            pointRadius: 2,
            tension: 0.25,
            fill: false
          });
        });
        if (othersUsers.length) {
          const others = Array(HOURS).fill(0) as number[];
          for (const uid of othersUsers) {
            const arr = perUser.get(uid) || Array(HOURS).fill(0);
            for (let i = 0; i < HOURS; i++) others[i] += arr[i];
          }
          datasets.push({
            type: 'line',
            label: 'Others',
            data: others.map(v => Math.floor(v)),
            backgroundColor: 'rgba(160,160,160,0.6)',
            borderColor: 'rgba(120,120,120,1)',
            borderWidth: 2,
            pointRadius: 2,
            tension: 0.25,
            fill: false
          });
        }
        // Infer resource label for title
        const resource = tier === 3
          ? (roleOpt === 'forger' ? 'pipes' : 'boxes')
          : (t4RoleToResource(roleOpt));
        // Render line chart across daily bins
        const width = 900;
        const height = 480;
        const canvas = new ChartJSNodeCanvas({ width, height, backgroundColour: 'white' });
        const conf: any = {
          type: 'line',
          data: { labels: hourLabels, datasets },
          options: {
            responsive: false,
            plugins: {
              legend: { display: true, position: 'bottom' },
              title: { display: true, text: `Blame — ${roleOpt} (last 12 hours) — ${resource} spent per hour` }
            },
            scales: {
              x: { ticks: { maxTicksLimit: 12 } },
              y: { beginAtZero: true }
            }
          }
        };
        const buffer = await canvas.renderToBuffer(conf);
        await command.reply({
          content: `Spending by role '${roleOpt}' over the last 12 hours (Tier ${tier}).`,
          files: [{ attachment: buffer, name: 'blame.png' }],
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
        await refreshGuildContributions(guildId);
        const selectedUserId = action === 'view' ? sub : undefined;
        let view: any;
        let currentUser: any;
        await withGuildAndUser(guildId, interaction.user.id, (guild, user) => {
          currentUser = user;
          return null;
        });
        
        const res = await withGuildAndUser(guildId, selectedUserId || interaction.user.id, (guild, selectedUser) => {
          return { guild, tier: guild.widgetTier || 1, selectedUser } as any;
        });
        const tier = (res as any).tier as number;
        let top: Array<{ userId: string; contributed: number; role?: any; produced?: number; percent?: number }>;
        let roleTotals: Record<string, number> | undefined = undefined;
        const dedupeByUserId = <T extends { userId: string }>(arr: T[]): T[] => {
          const seen = new Set<string>();
          const out: T[] = [];
          for (const item of arr) {
            const id = String(item.userId || '');
            if (seen.has(id)) continue;
            seen.add(id);
            out.push(item);
          }
          return out;
        };
        if (tier === 3) {
          const rows = await getAllT3UsersProduction(guildId);
          roleTotals = await getT3ProductionTotals(guildId) as any;
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
          top = dedupeByUserId(enriched);
        } else if (tier === 4) {
          const rows = await getAllT4UsersProduction(guildId);
          roleTotals = await getT4ProductionTotals(guildId) as any;
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
          top = dedupeByUserId(enriched);
        } else {
          top = dedupeByUserId(await getTopContributorsByTier(guildId, tier, 5));
        }

        const viewer = await getUserRankByTier(guildId, tier, interaction.user.id);
        let viewerRole: string | null = null;
        let viewerProduced = 0;
        await withGuildAndUser(guildId, interaction.user.id, (_g, u) => {
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
          return null;
        });
        dTop('button top:view', { tier, roleTotals, top });
        view = renderLeaderboard((res as any).guild, tier, top, selectedUserId, selectedUserId ? (res as any).selectedUser : undefined, {
          viewerId: interaction.user.id,
          viewerRank: viewer.rank,
          viewerContributed: viewer.contributed,
          roleTotals,
          viewerRole,
          viewerProduced
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
        await refreshGuildContributions(guildId);

        let view: any;
        let tierUp = false;
        await withGuildAndUser(guildId, userId, (guild, user) => {
          const r = advanceTierIfReady(guild);
          tierUp = r.tierUp;
          if (tierUp) {
            // Immediately initialize Tier 2 state for all users to avoid stale displays
            // initialize after commit
          }
          view = renderTycoon(guild, user);
          return null;
        });
        if (tierUp) await initializeTier2ForGuild(guildId);

        {
          const ok = await safeUpdate(buttonInteraction, view);
          if (!ok) return;
        }
        if (tierUp && interaction.channel) {
          const top = await getTopContributorsByTier(guildId, 1, 5);
          const lines = top.map((t, i) => `${i + 1}. <@${t.userId}> — ${Math.floor(t.contributed)}`);
          const content = `🎉 The guild has advanced to Tier 2: Iron Beams!\nTop Tier 1 contributors:\n${lines.join('\n') || 'No contributions recorded.'}`;
          await (interaction.channel as any).send({ content });
        }
        return;
      }
      // Special-case: advancing to Tier 3
      if (action === 'tier3' && sub === 'advance') {
        await refreshGuildContributions(guildId);
        let view: any;
        let tierUp = false;
        await withGuildAndUser(guildId, userId, (guild, user) => {
          const r = advanceTierIfReady(guild);
          tierUp = r.tierUp;
          view = renderTycoon(guild, user);
          return null;
        });
        {
          const ok = await safeUpdate(buttonInteraction, view);
          if (!ok) return;
        }
        if (tierUp && interaction.channel) {
          const top = await getTopContributorsByTier(guildId, 2, 5);
          const lines = top.map((t, i) => `${i + 1}. <@${t.userId}> — ${Math.floor(t.contributed)}`);
          const content = `🎉 The guild has advanced to Tier 3: Steel Boxes!\nTop Tier 2 contributors:\n${lines.join('\n') || 'No contributions recorded.'}`;
          await (interaction.channel as any).send({ content });
        }
        return;
      }
      // Special-case: Tier 4 prestige advance
      if (action === 'tier4' && sub === 'advance') {
        await refreshGuildContributions(guildId);
        let view: any;
        let tierUp = false;
        let didPrestige = false;
        await withGuildAndUser(guildId, userId, (guild, user) => {
          const current = guild.widgetTier || 1;
          const r = advanceTierIfReady(guild);
          tierUp = r.tierUp;
          if (tierUp && current === 4) {
            // Complete prestige reset + MVP award
            // award MVP and reset (persisted inside state helpers)
            const mvp = null; // computed below after commit
            resetGuildForPrestige(guild);
            didPrestige = true;
          }
          view = renderTycoon(guild, user);
          return null;
        });
        if (tierUp) await computeAndAwardMvp(guildId);
        // After awarding MVP for the completed run, reset all users' state
        if (didPrestige) {
          try {
            await resetAllUsersForPrestige(guildId);
            // Re-render the view to reflect the freshly reset user/guild state
            await withGuildAndUser(guildId, userId, (g2, u2) => { view = renderTycoon(g2, u2); return null; });
          } catch (e) {
            console.error('Failed to reset users for prestige:', e);
          }
        }
        {
          const ok = await safeUpdate(buttonInteraction, view);
          if (!ok) return;
        }
        if (didPrestige && interaction.channel) {
          const top = await getTopContributorsByTier(guildId, 4, 5);
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
      // Defer mass updates that would conflict with the current transaction
      let doPauseT3Consumers = false;
      let doPauseT4Consumers: null | ('lumberjack'|'smithy'|'wheelwright'|'boilermaker'|'coachbuilder') = null;
      // Global refresh flag to update shared inventory from all users' passives
      let doGlobalRefresh = false;
      const purchaseLogs: Array<{ tier: number; role: string | null; resource: string; amount: number; kind: 'automation'|'click_upgrade'|'tool'|'other'; itemKey?: string }>= [];
      await withGuildAndUser(guildId, userId, (guild, user) => {
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
          // Mark to refresh all users after this transaction completes
          doGlobalRefresh = true;
          // no further changes; re-render after refresh
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
            purchaseLogs.push({ tier: 1, role: null, resource: 'sticks', amount: res.next?.cost || 0, kind: 'tool', itemKey: 'axe' });
          }
        } else if (action === 'buy' && sub === 'pick') {
          const res = tryBuyPickShared(guild);
          if (res.ok) {
            purchaseLogs.push({ tier: 2, role: null, resource: 'beams', amount: res.next?.cost || 0, kind: 'tool', itemKey: 'pickaxe' });
          }
        } else if (action === 'buy' && sub === 'auto') {
          const kind = sub2;
          if (tier === 3) {
            const res = tryBuyAutomationT3(guild, user, kind as any);
            if (res.ok) {
              const role3 = (user as any).role3 || null;
              const resource = (kind || '').startsWith('forge') ? 'pipes' : 'boxes';
              purchaseLogs.push({ tier: 3, role: role3, resource, amount: res.cost || 0, kind: 'automation', itemKey: kind || '' });
            }
          } else if (tier === 4) {
            const res = tryBuyAutomationT4(guild, user, kind as any);
            if (res.ok) {
              const role4 = (user as any).role4 || null;
              const resource = t4AutomationKindToResource(kind || '');
              purchaseLogs.push({ tier: 4, role: role4, resource, amount: res.cost || 0, kind: 'automation', itemKey: kind || '' });
            }
          } else {
            const res = tryBuyAutomation(guild, user, kind, tier);
            if (res.ok) {
              const resource = tier === 1 ? 'sticks' : 'beams';
              purchaseLogs.push({ tier, role: null, resource, amount: res.cost || 0, kind: 'automation', itemKey: kind || '' });
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
        } else if (action === 't4' && sub === 'switch') {
          // Show selector + warning; selection buttons directly confirm
          customView = renderRoleSwitchSelectorT4(guild, user);
        } else if (action === 't4' && sub === 'confirm') {
          const valid = ['lumberjack','smithy','wheelwright','boilermaker','coachbuilder','mechanic'];
          const choice = valid.includes(sub2 || '') ? (sub2 as any) : null;
          if (choice) {
            // Destructive role switch for Tier 4: lose progress/upgrades for current role
            (user as any).role4 = choice;
            // Reset all T4 automations and rates for the user (no refunds)
            (user as any).automation4 = { wh1:0, wh2:0, wh3:0, wh4:0, wh5:0, bl1:0, bl2:0, bl3:0, bl4:0, bl5:0, cb1:0, cb2:0, cb3:0, cb4:0, cb5:0, lj1:0, lj2:0, lj3:0, lj4:0, lj5:0, sm1:0, sm2:0, sm3:0, sm4:0, sm5:0, ta1:0, ta2:0, ta3:0, ta4:0, ta5:0 };
            (user as any).rates.woodPerSec = 0;
            (user as any).rates.steelPerSec = 0;
            (user as any).rates.wheelsPerSec = 0;
            (user as any).rates.boilersPerSec = 0;
            (user as any).rates.cabinsPerSec = 0;
            (user as any).rates.trainsPerSec = 0;
            // Reset passive toggles to defaults (enabled for consumers)
            (user as any).wheelPassiveEnabled = true;
            (user as any).boilerPassiveEnabled = true;
            (user as any).coachPassiveEnabled = true;
            (user as any).mechPassiveEnabled = true;
          }
        } else if (action === 't4' && sub === 'cancel') {
          // no-op, just re-render current state
        } else if (action === 't3' && sub === 'weldtoggle') {
          if (sub2 === 'on') {
            (user as any).weldPassiveEnabled = true;
          } else if (sub2 === 'off') {
            (user as any).weldPassiveEnabled = false;
          }
        } else if (action === 't3' && sub === 'disable' && sub2 === 'consumers') {
          // Allow upstream producers (forgers) to pause downstream auto-consumers (welders)
          const role3 = (user as any).role3 || null;
          if (role3 === 'forger') {
            doPauseT3Consumers = true;
          }
        } else if (action === 't4' && sub === 'disable' && sub2 === 'consumers') {
          const r4 = (user as any).role4 || null;
          if (r4 && r4 !== 'mechanic') {
            doPauseT4Consumers = r4 as any;
          }
        } else if (action === 't4toggle') {
          const target = sub as 'wheel'|'boiler'|'coach'|'mech';
          const mode = sub2 as 'on'|'off';
          const on = mode === 'on';
          if (target === 'wheel') (user as any).wheelPassiveEnabled = on;
          else if (target === 'boiler') (user as any).boilerPassiveEnabled = on;
          else if (target === 'coach') (user as any).coachPassiveEnabled = on;
          else if (target === 'mech') (user as any).mechPassiveEnabled = on;
        } else if (action === 'buy' && sub === 't3click') {
          const role = (sub2 === 'forger' ? 'forger' : 'welder') as 'forger' | 'welder';
          const r = tryBuyT3ClickUpgrade(guild, role);
          if (r.ok) {
            const resource = role === 'forger' ? 'pipes' : 'boxes';
            purchaseLogs.push({ tier: 3, role, resource, amount: r.cost || 0, kind: 'click_upgrade', itemKey: role });
          }
        } else if (action === 'buy' && sub === 't4click') {
          const role = (sub2 || '') as any;
          const r = tryBuyT4ClickUpgrade(guild, role);
          if (r.ok) {
            const resource = t4RoleToResource(role);
            purchaseLogs.push({ tier: 4, role, resource, amount: r.cost || 0, kind: 'click_upgrade', itemKey: role });
          }
        }

        view = customView || renderTycoon(guild, user);
      });

        {
          // If requested, refresh shared inventory from all users and re-render
          if (doGlobalRefresh) {
            try { await refreshGuildContributions(guildId); } catch (e) { console.error('button refresh failed:', e); }
            await withGuildAndUser(guildId, userId, (g, u) => { view = renderTycoon(g, u); return null; });
          }
          // Apply deferred mass updates now that the guild/user write is finished
          if (doPauseT3Consumers) {
            try {
              disableAllWeldersPassive(guildId);
            } catch (e) {
              console.error('Failed to pause T3 consumers:', e);
            }
          }
          if (doPauseT4Consumers) {
            try {
              disableT4ConsumersByRole(guildId, doPauseT4Consumers);
            } catch (e) {
              console.error('Failed to pause T4 consumers:', e);
            }
          }
          const ok = await safeUpdate(buttonInteraction, view);
          if (!ok) return;
        }
        // Flush any purchase logs after successful update
        try {
          for (const e of purchaseLogs) {
            await logPurchaseEvent({ guildId, userId, tier: e.tier, role: e.role, resource: e.resource, amount: e.amount, kind: e.kind, itemKey: e.itemKey });
          }
        } catch (e) {
          console.error('Failed to log purchase events:', e);
        }

      // After updating the ephemeral view, announce delayed manual collection publicly and apply after delay
      if (action === 'chop' && delayed && interaction.channel) {
        const d = delayed as DelayedChop;
        // Keep reference to the public announcement so we can clean it up
        let announceMsg: any = null;
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
          if (content) {
            announceMsg = await (interaction.channel as any).send({ content });
          }
        } catch (e) {
          console.error('announce error:', e);
        }

        // Apply after delay, then clean up the public announcement
        const applyDelayMs = 60_000;
        setTimeout(() => {
          (async () => {
            try {
              if (!d) return;
              if ((d as any).tier === 3 && (d as any).t3) {
                await withGuildAndUser(guildId, userId, (guild, user) => {
                  applyTier3GuildFlows(guild, user, { pipes: (d as any).t3.pipes || 0, boxesPotential: (d as any).t3.boxesPotential || 0 });
                  return null as any;
                });
              } else if ((d as any).tier === 4 && (d as any).t4) {
                await withGuildAndUser(guildId, userId, (guild, user) => {
                  const r4 = (d as any).t4;
                  applyTier4GuildFlows(guild, user, { woodPotential: r4.wood || 0, steelPotential: r4.steel || 0, wheelsPotential: r4.wheels || 0, boilersPotential: r4.boilers || 0, cabinsPotential: r4.cabins || 0, trainsPotential: r4.trains || 0 });
                  return null as any;
                });
              } else if ((d as any).gained && (d as any).gained > 0) {
                await withGuildAndUser(guildId, userId, (guild, user) => {
                  const tier = (d as any).tier as 1 | 2;
                  applyGuildProgress(guild, (d as any).gained!, tier);
                  if (tier === 1) user.lifetimeContributed += (d as any).gained!, (user as any).contributedT1 = ((user as any).contributedT1 || 0) + (d as any).gained!;
                  if (tier === 2) user.lifetimeContributed += (d as any).gained!, (user as any).contributedT2 = ((user as any).contributedT2 || 0) + (d as any).gained!;
                  return null as any;
                });
              }
            } catch (e) {
              console.error('delayed apply error:', e);
            } finally {
              // Attempt to delete the announcement message to reduce channel clutter
              try {
                if (announceMsg && typeof announceMsg.delete === 'function') {
                  await announceMsg.delete().catch(() => {});
                }
              } catch (_) {}
            }
          })();
        }, applyDelayMs).unref?.();
      }
      if (tierUp && interaction.channel) {
        const top = await getTopContributorsByTier(guildId, 1, 5);
        const lines = top.map((t: any, i: number) => `${i + 1}. <@${t.userId}> — ${Math.floor(t.contributed)}`);
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

function t4AutomationKindToResource(kind: string): string {
  if ((kind || '').startsWith('wh')) return 'wheels';
  if ((kind || '').startsWith('bl')) return 'boilers';
  if ((kind || '').startsWith('cb')) return 'cabins';
  if ((kind || '').startsWith('lj')) return 'wood';
  if ((kind || '').startsWith('sm')) return 'steel';
  if ((kind || '').startsWith('ta')) return 'trains';
  return 'trains';
}

// T4 role -> resource mapping for purchase logs
function t4RoleToResource(role: string): string {
  switch (role) {
    case 'lumberjack': return 'wood';
    case 'smithy': return 'steel';
    case 'wheelwright': return 'wheels';
    case 'boilermaker': return 'boilers';
    case 'coachbuilder': return 'cabins';
    case 'mechanic': return 'trains';
    default: return 'trains';
  }
}

 
