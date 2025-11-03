import { SlashCommandBuilder, REST, Routes } from 'discord.js';

// Export the shared command definitions so both the bot and the
// one-off registrar use the exact same payload.
export const commands = [
  new SlashCommandBuilder()
    .setName('tycoon')
    .setDescription('Open the Guild Tycoon game window')
    .toJSON(),
  new SlashCommandBuilder()
    .setName('top')
    .setDescription('Show the top contributors in this server')
    .toJSON(),
  {
    type: 1,
    name: 'activity',
    description: 'Show passive activity status for a role',
    options: [
      {
        type: 3, // String
        name: 'role',
        description: 'Role to check',
        required: true,
        autocomplete: true
      }
    ]
  } as any,
  {
    type: 1,
    name: 'blame',
    description: 'Graph per-user spend for a role (last 12 hours)',
    options: [
      {
        type: 3, // String
        name: 'role',
        description: 'Role to analyze',
        required: true,
        autocomplete: true
      }
    ]
  } as any,
];

/**
 * Registers the shared command set globally. If a guildId is provided,
 * it also purges any existing guild-scoped commands to avoid duplicates.
 * Returns the number of commands registered.
 */
export async function registerGlobalCommands(token: string, clientId: string, guildId?: string): Promise<number> {
  const rest = new REST({ version: '10' }).setToken(token);

  // Register GLOBAL commands
  const data = await rest.put(
    Routes.applicationCommands(clientId),
    { body: commands }
  ) as any[];

  // Best-effort: purge guild-scoped commands when guildId provided
  if (guildId) {
    try {
      await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: [] });
    } catch (e) {
      // Non-fatal — keep going if purge fails
      console.warn('[commands] Failed to purge guild commands (non-fatal):', e as any);
    }
  }

  return Array.isArray(data) ? data.length : 0;
}

