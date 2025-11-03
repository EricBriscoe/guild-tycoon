**Guild Tycoon — Discord Widget Maker Game**

- Build a collaborative idle/clicker “widget maker” inside your Discord server.
- Tier 1 starts with chopping sticks. Unlock bigger upgrades as a guild.
- Interactive game window uses Discord components (v2) and the `/tycoon` command.

**Features**

- Slash command: `/tycoon` opens an interactive, ephemeral game window.
- Click to chop sticks; upgrade axes to boost click power.
- Hire automation (lumberjacks, foremen, camps, sawmills, arcane grove) for passive sticks/sec.
- Guild-wide progress bar advances with everyone’s earned sticks toward the next tier (tier 2 placeholder).
- Persistent storage via SQLite at `data/guild-tycoon.db` (automatically
  migrates from legacy `data/state.json` on first run).

**Prerequisites**

- Node.js 18+
- A Discord application and bot token

**Setup**

- Copy `.env.example` to `.env` and set values:
  - `DISCORD_TOKEN`: your bot token
  - `DISCORD_CLIENT_ID`: your application (bot) client ID
  - `DISCORD_GUILD_ID` (optional): a dev server ID for instant command registration
- Install deps: `npm install`
- Commands auto-register on startup:
  - By default, the bot registers global commands every time it starts (`GT_REGISTER_ON_START=true`).
  - Set `DISCORD_GUILD_ID` to also purge any legacy guild-scoped commands to avoid duplicates.
  - You can still run `npm run register` to force a one-off registration.
- Start the bot: `npm start`

Background Ticker (optional)

- The game now includes a periodic background updater that applies passive production for all users, even if they aren’t actively checking the UI.
- Configure via environment variables (defaults shown):
  - `GT_BACKGROUND_TICK_ENABLED=true`: set to `false` to disable.
  - `GT_BACKGROUND_TICK_MS=15000`: interval in ms (minimum 1000).
  - `GT_BACKGROUND_TICK_LOG=false`: set to `true` to log per-tick summary.

**Docker**

- Build and run with Compose:
  - Create `.env` (see `.env.example`).
  - `docker compose up -d --build bot`
  - View logs: `docker compose logs -f bot`
  - Data persists in `./data` on the host.
- Command registration:
  - The bot registers commands automatically on startup. No separate step is required.
  - To disable auto-registration, set `GT_REGISTER_ON_START=false` in `.env`.
  - The `register` one-off service remains available if you want to run it manually:
    `docker compose --profile setup run --rm register`.

**How To Play**

- Run `/tycoon` in a server channel to open your own ephemeral control panel.
- Press “Chop” to gain sticks. Buy better axes to increase chop gains.
- Hire automation to generate sticks passively while you’re away.
- Everyone’s earned sticks contribute to the guild’s tier progress bar.
- Tier 2 widget is reserved as a placeholder for now.

**Notes**

- Data is stored in SQLite (`data/guild-tycoon.db`). If a legacy
  `data/state.json` is present, it is migrated into the database once and
  marked as migrated.
- Passive generation is applied automatically in the background and also when you interact/open the UI (no more dependency on someone being online).
- Only server (guild) usage is supported; DMs are not supported.
