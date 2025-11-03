import 'dotenv/config';
import { commands as sharedCommands, registerGlobalCommands } from './commands.js';

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
const guildId = process.env.DISCORD_GUILD_ID; // optional: only used to purge old guild commands

if (!token || !clientId) {
  console.error('Missing DISCORD_TOKEN or DISCORD_CLIENT_ID. See .env.example');
  process.exit(1);
}

// Reference the shared command JSON definitions
const commands = sharedCommands;

async function main(): Promise<void> {
  try {
    console.log('Registering global commands (may take up to 1 hour to appear)...');
    const count = await registerGlobalCommands(token!, clientId!, guildId);
    console.log(`Registered ${count} global command(s).`);
  } catch (err) {
    console.error('Failed to register commands:', err);
    process.exit(1);
  }
}

main();
