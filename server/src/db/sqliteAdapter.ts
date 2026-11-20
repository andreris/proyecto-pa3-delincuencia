import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { DatabaseAdapter, SqlParam } from './types.js';
import { SCHEMA_STATEMENTS } from './schema.js';

export class SqliteAdapter implements DatabaseAdapter {
  public readonly dialect = 'sqlite' as const;
  private db: DatabaseSync;

  constructor(dbPath: string) {
    if (dbPath !== ':memory:') {
      const dir = path.dirname(dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
    this.db = new DatabaseSync(dbPath);
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA foreign_keys = ON;');
  }

  async init(): Promise<void> {
    for (const stmt of SCHEMA_STATEMENTS) {
      this.db.exec(stmt);
    }
  }

  async query<T = Record<string, unknown>>(sql: string, params: SqlParam[] = []): Promise<T[]> {
    const stmt = this.db.prepare(sql);
    const normalizedParams = params.map(p => (typeof p === 'boolean' ? (p ? 1 : 0) : p));
    return stmt.all(...normalizedParams) as T[];
  }

  async get<T = Record<string, unknown>>(sql: string, params: SqlParam[] = []): Promise<T | undefined> {
    const stmt = this.db.prepare(sql);
    const normalizedParams = params.map(p => (typeof p === 'boolean' ? (p ? 1 : 0) : p));
    return stmt.get(...normalizedParams) as T | undefined;
  }

  async execute(sql: string, params: SqlParam[] = []): Promise<{ changes: number }> {
    const stmt = this.db.prepare(sql);
    const normalizedParams = params.map(p => (typeof p === 'boolean' ? (p ? 1 : 0) : p));
    const result = stmt.run(...normalizedParams);
    return { changes: Number(result.changes ?? 0) };
  }

  async close(): Promise<void> {
    this.db.close();
  }
}
