export const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS incidents (
    id TEXT PRIMARY KEY,
    category TEXT NOT NULL,
    risk_level TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    date TEXT NOT NULL,
    time TEXT NOT NULL,
    district TEXT NOT NULL,
    approx_lat DOUBLE PRECISION NOT NULL,
    approx_lng DOUBLE PRECISION NOT NULL,
    approx_address TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Pendiente de validación',
    is_demo INTEGER NOT NULL DEFAULT 0,
    evidence_note TEXT,
    false_report_flags INTEGER NOT NULL DEFAULT 0,
    helpful_count INTEGER NOT NULL DEFAULT 1,
    reported_by_role TEXT NOT NULL DEFAULT 'Ciudadano',
    source TEXT NOT NULL DEFAULT 'citizen',
    source_url TEXT,
    created_at TEXT NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS social_posts (
    id TEXT PRIMARY KEY,
    platform TEXT NOT NULL DEFAULT 'x',
    external_post_id TEXT NOT NULL UNIQUE,
    post_url TEXT NOT NULL,
    text TEXT NOT NULL,
    published_at TEXT NOT NULL,
    imported_at TEXT NOT NULL,
    author_username TEXT,
    query_used TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Pendiente de validación',
    suggested_category TEXT NOT NULL,
    suggested_risk_level TEXT NOT NULL,
    suggested_district TEXT,
    moderator_id TEXT,
    moderator_name TEXT,
    review_reason TEXT,
    reviewed_at TEXT,
    linked_incident_id TEXT
  )`,

  `CREATE TABLE IF NOT EXISTS social_configs (
    id TEXT PRIMARY KEY,
    search_query TEXT NOT NULL,
    retention_days INTEGER NOT NULL DEFAULT 30,
    filter_districts TEXT NOT NULL DEFAULT '[]',
    filter_date_from TEXT,
    filter_date_to TEXT,
    last_sync_at TEXT,
    last_sync_status TEXT,
    last_sync_message TEXT,
    last_imported_count INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL,
    updated_by TEXT
  )`,

  `CREATE TABLE IF NOT EXISTS audit_log (
    id TEXT PRIMARY KEY,
    action_type TEXT NOT NULL,
    actor_id TEXT NOT NULL,
    actor_name TEXT NOT NULL,
    actor_role TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id TEXT,
    details TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,

  `CREATE INDEX IF NOT EXISTS idx_social_posts_status ON social_posts(status)`,
  `CREATE INDEX IF NOT EXISTS idx_social_posts_published_at ON social_posts(published_at)`,
  `CREATE INDEX IF NOT EXISTS idx_incidents_status_source ON incidents(status, source)`,
  `CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at)`
];

export const CONFIG_COLUMN_MIGRATIONS = [
  `ALTER TABLE social_configs ADD COLUMN filter_districts TEXT NOT NULL DEFAULT '[]'`,
  `ALTER TABLE social_configs ADD COLUMN filter_date_from TEXT`,
  `ALTER TABLE social_configs ADD COLUMN filter_date_to TEXT`
];
