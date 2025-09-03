import fs from 'node:fs';
import path from 'node:path';
import initSqlJs from 'sql.js';
import { pool } from '../db.js';
import { initState } from '../state.js';

async function main() {
  const sqlitePath = process.env.SQLITE_PATH || path.join(process.cwd(), 'data', 'guild-tycoon.db');
  if (!fs.existsSync(sqlitePath)) {
    console.error(`SQLite file not found at ${sqlitePath}`);
    process.exit(1);
  }
  console.log(`Reading SQLite from ${sqlitePath}`);
  const filebuffer = fs.readFileSync(sqlitePath);
  const SQL = await initSqlJs();
  const sqldb = new SQL.Database(new Uint8Array(filebuffer));

  const queryAll = (sql: string): any[] => {
    const res = sqldb.exec(sql);
    if (!res.length) return [];
    const { columns, values } = res[0];
    return values.map((row: any[]) => Object.fromEntries(row.map((v, i) => [columns[i], v])));
  };

  // Ensure schema exists in Postgres (creates tables/indexes)
  await initState();

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const guilds = queryAll('SELECT * FROM guilds');
    for (const g of guilds) {
      await client.query(`INSERT INTO guilds (id, created_at, widget_tier, prestige_points) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`, [g.id, g.created_at, g.widget_tier, g.prestige_points ?? 0]);
    }

    const simpleCopy = [
      { table: 'tier1_guild', cols: ['guild_id','tier_progress','tier_goal','total_sticks','inv_sticks','axe_level'] },
      { table: 'tier2_guild', cols: ['guild_id','tier_progress','tier_goal','total_beams','inv_beams','pickaxe_level'] },
      { table: 'tier3_guild', cols: ['guild_id','tier_progress','tier_goal','inv_pipes','inv_boxes','total_pipes','total_boxes','forger_click_level','welder_click_level'] },
      { table: 'tier4_guild', cols: ['guild_id','tier_progress','tier_goal','inv_wheels','inv_boilers','inv_cabins','inv_trains','inv_wood','inv_steel','total_wheels','total_boilers','total_cabins','total_trains','total_wood','total_steel','wheel_click_level','boiler_click_level','coach_click_level','lumber_click_level','smith_click_level','mech_click_level'] },
      { table: 'users', cols: ['guild_id','user_id','last_tick','last_chop_at','lifetime_contributed','prestige_mvp_awards'] },
      { table: 'tier1_users', cols: ['guild_id','user_id','sticks','axe_level','click_power','lumberjacks','foremen','logging_camps','sawmills','arcane_grove','rate_sticks_per_sec','contributed_t1'] },
      { table: 'tier2_users', cols: ['guild_id','user_id','beams','pickaxe_level','pick_click_power','miners','smelters','foundries','beam_mills','arcane_forge','rate_beams_per_sec','contributed_t2'] },
      { table: 'tier3_users', cols: ['guild_id','user_id','role','f1','f2','f3','f4','f5','w1','w2','w3','w4','w5','rate_pipes_per_sec','rate_boxes_per_sec','contributed_t3','weld_enabled','pipes_produced','boxes_produced'] },
      { table: 'tier4_users', cols: ['guild_id','user_id','role','wh1','wh2','wh3','wh4','wh5','bl1','bl2','bl3','bl4','bl5','cb1','cb2','cb3','cb4','cb5','lj1','lj2','lj3','lj4','lj5','sm1','sm2','sm3','sm4','sm5','ta1','ta2','ta3','ta4','ta5','rate_wheels_per_sec','rate_boilers_per_sec','rate_cabins_per_sec','rate_wood_per_sec','rate_steel_per_sec','rate_trains_per_sec','contributed_t4','wheels_produced','boilers_produced','cabins_produced','wood_produced','steel_produced','trains_produced','wheel_enabled','boiler_enabled','coach_enabled','mech_enabled'] },
    ];

    for (const cfg of simpleCopy) {
      const rows = queryAll(`SELECT ${cfg.cols.join(',')} FROM ${cfg.table}`);
      if (!rows.length) continue;
      const placeholders = cfg.cols.map((_, i) => `$${i + 1}`).join(',');
      const sql = `INSERT INTO ${cfg.table} (${cfg.cols.join(',')}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`;
      for (const r of rows) {
        const vals = cfg.cols.map(c => (r as any)[c]);
        await client.query(sql, vals);
      }
    }

    await client.query('COMMIT');
    console.log('Migration complete.');
  } catch (e) {
    console.error('Migration failed:', e);
    try { await client.query('ROLLBACK'); } catch {}
    process.exit(1);
  } finally {
    client.release();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
