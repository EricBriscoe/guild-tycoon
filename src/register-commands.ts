import 'dotenv/config';
import { REST, Routes, SlashCommandBuilder } from 'discord.js';

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
const guildId = process.env.DISCORD_GUILD_ID; // optional: only used to purge old guild commands

if (!token || !clientId) {
  console.error('Missing DISCORD_TOKEN or DISCORD_CLIENT_ID. See .env.example');
  process.exit(1);
}

// Define the global command set
const commands = [
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

const rest = new REST({ version: '10' }).setToken(token);

async function main(): Promise<void> {
  try {
    // Always register GLOBAL commands
    console.log('Registering global commands (may take up to 1 hour to appear)...');
    const data = await rest.put(
      Routes.applicationCommands(clientId!),
      { body: commands }
    ) as any[];
    console.log(`Registered ${data.length} global command(s).`);

    // Best-effort: purge any existing guild-scoped commands to avoid duplicates (optional)
    if (guildId) {
      try {
        console.log(`Purging any existing guild commands for ${guildId}...`);
        await rest.put(Routes.applicationGuildCommands(clientId!, guildId), { body: [] });
        console.log('Guild commands cleared.');
      } catch (e) {
        console.warn('Failed to purge guild commands (non-fatal):', e as any);
      }
    }
  } catch (err) {
    console.error('Failed to register commands:', err);
    process.exit(1);
  }
}

main();
