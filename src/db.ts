import { Pool, PoolClient } from 'pg';

const connectionString = process.env.DATABASE_URL;

export const pool = new Pool(
  connectionString
    ? { connectionString, max: Number(process.env.PG_POOL_MAX || 10) }
    : {
        host: process.env.PGHOST || 'localhost',
        port: Number(process.env.PGPORT || 5432),
        user: process.env.PGUSER || 'postgres',
        password: process.env.PGPASSWORD || 'postgres',
        database: process.env.PGDATABASE || 'guild_tycoon',
        max: Number(process.env.PG_POOL_MAX || 10),
      }
);

export async function exec(sql: string): Promise<void> {
  // Run multiple statements safely by splitting on semicolons.
  const statements = sql
    .split(/;\s*\n|;\s*$/g)
    .map(s => s.trim())
    .filter(Boolean);
  for (const stmt of statements) {
    await pool.query(stmt);
  }
}

function rewritePlaceholders(sql: string) {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

export async function qOne<T = any>(sql: string, ...params: any[]): Promise<T | undefined> {
  const text = rewritePlaceholders(sql);
  const { rows } = await pool.query({ text, values: params });
  return rows[0] as T | undefined;
}

export async function qAll<T = any>(sql: string, ...params: any[]): Promise<T[]> {
  const text = rewritePlaceholders(sql);
  const { rows } = await pool.query({ text, values: params });
  return rows as T[];
}

export async function qRun(sql: string, ...params: any[]): Promise<{ changes: number }> {
  const text = rewritePlaceholders(sql);
  const { rowCount } = await pool.query({ text, values: params });
  return { changes: rowCount || 0 };
}

export async function transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const res = await fn(client);
    await client.query('COMMIT');
    return res;
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    throw e;
  } finally {
    client.release();
  }
}

export async function qOneTx<T = any>(client: PoolClient, sql: string, ...params: any[]): Promise<T | undefined> {
  const text = rewritePlaceholders(sql);
  const { rows } = await client.query({ text, values: params });
  return rows[0] as T | undefined;
}

export async function qAllTx<T = any>(client: PoolClient, sql: string, ...params: any[]): Promise<T[]> {
  const text = rewritePlaceholders(sql);
  const { rows } = await client.query({ text, values: params });
  return rows as T[];
}

export async function qRunTx(client: PoolClient, sql: string, ...params: any[]): Promise<{ changes: number }> {
  const text = rewritePlaceholders(sql);
  const { rowCount } = await client.query({ text, values: params });
  return { changes: rowCount || 0 };
}

