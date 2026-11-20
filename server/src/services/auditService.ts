import crypto from 'node:crypto';
import { DatabaseAdapter } from '../db/types.js';
import { SocialSourceAuditRecord } from '../types.js';

interface AuditRow {
  id: string;
  action_type: SocialSourceAuditRecord['actionType'];
  actor_id: string;
  actor_name: string;
  actor_role: string;
  target_type: SocialSourceAuditRecord['targetType'];
  target_id: string | null;
  details: string;
  created_at: string;
}

export async function recordAuditLog(
  db: DatabaseAdapter,
  entry: Omit<SocialSourceAuditRecord, 'id' | 'createdAt'>
): Promise<SocialSourceAuditRecord> {
  const record: SocialSourceAuditRecord = {
    id: `AUD-${crypto.randomUUID().slice(0, 8)}`,
    ...entry,
    createdAt: new Date().toISOString()
  };

  await db.execute(
    `INSERT INTO audit_log (id, action_type, actor_id, actor_name, actor_role, target_type, target_id, details, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      record.id,
      record.actionType,
      record.actorId,
      record.actorName,
      record.actorRole,
      record.targetType,
      record.targetId ?? null,
      record.details,
      record.createdAt
    ]
  );

  return record;
}

export async function listAuditLogs(
  db: DatabaseAdapter,
  limit = 50
): Promise<SocialSourceAuditRecord[]> {
  const safeLimit = Math.min(Math.max(1, limit), 200);
  const rows = await db.query<AuditRow>(
    `SELECT id, action_type, actor_id, actor_name, actor_role, target_type, target_id, details, created_at
     FROM audit_log
     ORDER BY created_at DESC
     LIMIT ?`,
    [safeLimit]
  );

  return rows.map(row => ({
    id: row.id,
    actionType: row.action_type,
    actorId: row.actor_id,
    actorName: row.actor_name,
    actorRole: row.actor_role,
    targetType: row.target_type,
    targetId: row.target_id ?? undefined,
    details: row.details,
    createdAt: row.created_at
  }));
}
