import path from 'node:path';
import { DatabaseAdapter } from './types.js';
import { SqliteAdapter } from './sqliteAdapter.js';
import { PostgresAdapter } from './postgresAdapter.js';

export type { DatabaseAdapter } from './types.js';

export async function createDatabase(customDbUrl?: string): Promise<DatabaseAdapter> {
  const databaseUrl = (customDbUrl ?? process.env.DATABASE_URL ?? '').trim();

  let adapter: DatabaseAdapter;
  if (databaseUrl.startsWith('postgres://') || databaseUrl.startsWith('postgresql://')) {
    adapter = new PostgresAdapter(databaseUrl);
  } else if (databaseUrl === ':memory:') {
    adapter = new SqliteAdapter(':memory:');
  } else {
    const sqlitePath = databaseUrl.startsWith('sqlite://')
      ? databaseUrl.replace('sqlite://', '')
      : databaseUrl || path.resolve(process.cwd(), 'server', 'data', 'vigila.db');
    adapter = new SqliteAdapter(sqlitePath);
  }

  await adapter.init();
  return adapter;
}
