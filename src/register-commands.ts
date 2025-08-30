import 'dotenv/config';
import { REST, Routes, SlashCommandBuilder } from 'discord.js';

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
const guildId = process.env.DISCORD_GUILD_ID;

if (!token || !clientId) {
  console.error('Missing DISCORD_TOKEN or DISCORD_CLIENT_ID. See .env.example');
  process.exit(1);
}

const commands = [
  new SlashCommandBuilder()
    .setName('tycoon')
    .setDescription('Open the Guild Tycoon game window')
    .toJSON(),
  new SlashCommandBuilder()
    .setName('top')
    .setDescription('Show the top contributors in this server')
    .toJSON()
];

const rest = new REST({ version: '10' }).setToken(token);

async function main(): Promise<void> {
  try {
    if (guildId) {
      console.log(`Registering guild commands for ${guildId}...`);
      const data = await rest.put(
        Routes.applicationGuildCommands(clientId!, guildId),
        { body: commands }
      ) as any[];
      console.log(`Registered ${data.length} command(s) to guild ${guildId}.`);
    } else {
      console.log('Registering global commands (may take up to 1 hour to appear)...');
      const data = await rest.put(
        Routes.applicationCommands(clientId!),
        { body: commands }
      ) as any[];
      console.log(`Registered ${data.length} global command(s).`);
    }
  } catch (err) {
    console.error('Failed to register commands:', err);
    process.exit(1);
  }
}

main();
