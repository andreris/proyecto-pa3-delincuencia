import { DatabaseAdapter } from '../db/types.js';
import { recordAuditLog } from './auditService.js';

export const DEFAULT_RETENTION_DAYS = Number(process.env.SOCIAL_RETENTION_DAYS || 30);

/**
 * Deletes discarded social posts whose review/import timestamp is older
 * than `retentionDays` (default 30 days) to respect data minimization.
 */
export async function applyRetentionPolicy(
  db: DatabaseAdapter,
  retentionDays = DEFAULT_RETENTION_DAYS,
  now = new Date()
): Promise<{ purgedCount: number; cutoffIso: string }> {
  const safeDays = Math.max(1, Math.min(365, Math.floor(retentionDays)));
  const cutoffDate = new Date(now.getTime() - safeDays * 24 * 60 * 60 * 1000);
  const cutoffIso = cutoffDate.toISOString();

  const result = await db.execute(
    `DELETE FROM social_posts
     WHERE status = 'Descartado'
       AND COALESCE(reviewed_at, imported_at) < ?`,
    [cutoffIso]
  );

  if (result.changes > 0) {
    await recordAuditLog(db, {
      actionType: 'retention_cleanup',
      actorId: 'system',
      actorName: 'Sistema Vigila.pe',
      actorRole: 'system',
      targetType: 'system',
      details: `Política de retención (${safeDays} días): ${result.changes} publicaciones descartadas eliminadas.`
    });
  }

  return {
    purgedCount: result.changes,
    cutoffIso
  };
}
