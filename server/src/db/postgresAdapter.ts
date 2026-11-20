import { Pool } from 'pg';
import { DatabaseAdapter, SqlParam } from './types.js';
import {
  CONFIG_COLUMN_MIGRATIONS,
  INCIDENT_COLUMN_MIGRATIONS,
  SCHEMA_STATEMENTS,
  SOCIAL_POST_COLUMN_MIGRATIONS
} from './schema.js';

function toPostgresPlaceholders(sql: string): string {
  let index = 0;
  return sql.replace(/\?/g, () => {
    index += 1;
    return `$${index}`;
  });
}

export class PostgresAdapter implements DatabaseAdapter {
  public readonly dialect = 'postgres' as const;
  private pool: Pool;

  constructor(databaseUrl: string) {
    this.pool = new Pool({
      connectionString: databaseUrl,
      ssl: databaseUrl.includes('sslmode=require') || process.env.NODE_ENV === 'production'
        ? { rejectUnauthorized: false }
        : undefined
    });
  }

  async init(): Promise<void> {
    for (const stmt of SCHEMA_STATEMENTS) {
      await this.pool.query(stmt);
    }
    for (const alterStmt of [
      ...CONFIG_COLUMN_MIGRATIONS,
      ...SOCIAL_POST_COLUMN_MIGRATIONS,
      ...INCIDENT_COLUMN_MIGRATIONS
    ]) {
      try {
        await this.pool.query(alterStmt.replace('ADD COLUMN ', 'ADD COLUMN IF NOT EXISTS '));
      } catch {
        // Ignore if column already exists
      }
    }
  }

  async query<T = Record<string, unknown>>(sql: string, params: SqlParam[] = []): Promise<T[]> {
    const pgSql = toPostgresPlaceholders(sql);
    const result = await this.pool.query(pgSql, params);
    return result.rows as T[];
  }

  async get<T = Record<string, unknown>>(sql: string, params: SqlParam[] = []): Promise<T | undefined> {
    const rows = await this.query<T>(sql, params);
    return rows[0];
  }

  async execute(sql: string, params: SqlParam[] = []): Promise<{ changes: number }> {
    const pgSql = toPostgresPlaceholders(sql);
    const result = await this.pool.query(pgSql, params);
    return { changes: result.rowCount ?? 0 };
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
