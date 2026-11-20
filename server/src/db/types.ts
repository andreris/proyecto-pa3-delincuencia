export type DbDialect = 'sqlite' | 'postgres';

export type SqlParam = string | number | boolean | null;

export interface DatabaseAdapter {
  dialect: DbDialect;
  init(): Promise<void>;
  query<T = Record<string, unknown>>(sql: string, params?: SqlParam[]): Promise<T[]>;
  get<T = Record<string, unknown>>(sql: string, params?: SqlParam[]): Promise<T | undefined>;
  execute(sql: string, params?: SqlParam[]): Promise<{ changes: number }>;
  close(): Promise<void>;
}
