import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { DatabaseAdapter } from '../db/types.js';
import { AuthenticatedRequest, requireAuth, requireModerator } from '../middleware/auth.js';
import { listAuditLogs } from '../services/auditService.js';
import { applyRetentionPolicy } from '../services/retentionService.js';
import {
  getOrCreateSocialConfig,
  getSocialPostStats,
  listSocialPosts,
  reviewSocialPost,
  ReviewSocialPostPayload,
  updateSocialConfig
} from '../services/socialRepository.js';
import {
  computeNextAllowedSync,
  getSyncMaxPosts,
  SyncConflictError,
  XConfigurationError,
  XCreditsError,
  XRateLimitError,
  XService,
  XSyncCooldownError
} from '../services/xService.js';
import { SocialPostStatus } from '../types.js';

export function createSocialRouter(db: DatabaseAdapter, xService: XService): Router {
  const router = Router();

  const syncLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 15,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: 'Demasiadas solicitudes de sincronización con X. Espera unos minutos antes de reintentar.'
    }
  });

  const moderationLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: 'Límite de operaciones de moderación alcanzado. Intenta en un minuto.'
    }
  });

  // Moderator-only: view X connection status, query, and counts
  router.get(
    '/status',
    requireAuth,
    requireModerator,
    async (_req: AuthenticatedRequest, res) => {
      try {
        const config = await getOrCreateSocialConfig(db);
        const stats = await getSocialPostStats(db);
        const cooldown = computeNextAllowedSync(config.lastSyncAt);
        res.json({
          xConfigured: xService.isTokenConfigured(),
          isSyncing: xService.isSyncInProgress(),
          searchQuery: config.searchQuery,
          retentionDays: config.retentionDays,
          maxPostsPerSync: getSyncMaxPosts(),
          cooldownMinutes: cooldown.cooldownMinutes,
          canSyncNow: cooldown.canSyncNow,
          nextAllowedSyncAt: cooldown.nextAllowedSyncAt,
          retryAfterSeconds: cooldown.retryAfterSeconds,
          lastSyncAt: config.lastSyncAt,
          lastSyncStatus: config.lastSyncStatus || 'idle',
          lastSyncMessage: config.lastSyncMessage,
          lastImportedCount: config.lastImportedCount,
          stats
        });
      } catch (err) {
        console.error('[social/status] Error:', err);
        res.status(500).json({ error: 'No se pudo obtener el estado de fuentes sociales.' });
      }
    }
  );

  // Moderator-only: update configurable X query & retention policy
  router.put(
    '/config',
    requireAuth,
    requireModerator,
    moderationLimiter,
    async (req: AuthenticatedRequest, res) => {
      try {
        const { searchQuery, retentionDays } = req.body as {
          searchQuery?: string;
          retentionDays?: number;
        };

        if (searchQuery !== undefined && (!searchQuery.trim() || searchQuery.trim().length < 3)) {
          res.status(400).json({
            error: 'La consulta de búsqueda debe tener al menos 3 caracteres.'
          });
          return;
        }

        const updated = await updateSocialConfig(
          db,
          { searchQuery, retentionDays },
          req.authUser!
        );

        res.json({ config: updated });
      } catch (err) {
        console.error('[social/config] Error:', err);
        res.status(500).json({ error: 'No se pudo actualizar la configuración de búsqueda.' });
      }
    }
  );

  // Moderator-only: trigger manual X API v2 recent search sync
  router.post(
    '/x/sync',
    requireAuth,
    requireModerator,
    syncLimiter,
    async (req: AuthenticatedRequest, res) => {
      try {
        const result = await xService.syncRecentPublicPosts(db, req.authUser!);
        const stats = await getSocialPostStats(db);
        res.json({
          message: `Sincronización completada: ${result.importedCount} nuevas publicaciones importadas.`,
          result,
          stats
        });
      } catch (err) {
        if (err instanceof SyncConflictError) {
          res.status(409).json({ error: err.message });
          return;
        }
        if (err instanceof XSyncCooldownError) {
          res.status(429).json({
            error: err.message,
            code: 'X_SYNC_COOLDOWN',
            nextAllowedSyncAt: err.nextAllowedSyncAt,
            retryAfterSeconds: err.retryAfterSeconds
          });
          return;
        }
        if (err instanceof XConfigurationError) {
          res.status(503).json({
            error: err.message,
            code: 'X_TOKEN_MISSING'
          });
          return;
        }
        if (err instanceof XCreditsError) {
          res.status(402).json({
            error: err.message,
            code: 'X_CREDITS_DEPLETED'
          });
          return;
        }
        if (err instanceof XRateLimitError) {
          res.status(429).json({
            error: err.message,
            resetAt: err.resetAt
          });
          return;
        }
        const message = err instanceof Error ? err.message : 'Error al sincronizar con X.';
        res.status(502).json({ error: message });
      }
    }
  );

  // Moderator-only: list imported social posts (pending, verified, discarded)
  router.get(
    '/posts',
    requireAuth,
    requireModerator,
    async (req: AuthenticatedRequest, res) => {
      try {
        const statusParam = req.query.status as SocialPostStatus | undefined;
        const validStatuses: SocialPostStatus[] = [
          'Pendiente de validación',
          'Verificado',
          'Descartado'
        ];
        const filterStatus =
          statusParam && validStatuses.includes(statusParam) ? statusParam : undefined;

        const posts = await listSocialPosts(db, filterStatus);
        const stats = await getSocialPostStats(db);
        res.json({ posts, stats });
      } catch (err) {
        console.error('[social/posts] Error:', err);
        res.status(500).json({ error: 'No se pudieron listar las publicaciones sociales.' });
      }
    }
  );

  // Moderator-only: review a social post (create report, link to existing report, or discard)
  router.patch(
    '/posts/:id/review',
    requireAuth,
    requireModerator,
    moderationLimiter,
    async (req: AuthenticatedRequest, res) => {
      try {
        const postId = String(req.params.id);
        const body = req.body as ReviewSocialPostPayload;

        if (
          !body ||
          !['create_report', 'link_incident', 'discard'].includes(body.action)
        ) {
          res.status(400).json({
            error: 'Acción inválida. Debe ser create_report, link_incident o discard.'
          });
          return;
        }

        const outcome = await reviewSocialPost(db, postId, body, req.authUser!);
        const stats = await getSocialPostStats(db);
        res.json({
          ...outcome,
          stats
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Error al revisar publicación.';
        if (msg.startsWith('NOT_FOUND:')) {
          res.status(404).json({ error: msg.replace('NOT_FOUND:', '').trim() });
          return;
        }
        if (msg.startsWith('BAD_REQUEST:')) {
          res.status(400).json({ error: msg.replace('BAD_REQUEST:', '').trim() });
          return;
        }
        res.status(500).json({ error: 'No se pudo completar la revisión de la publicación.' });
      }
    }
  );

  // Moderator-only: apply retention policy manually
  router.post(
    '/retention/run',
    requireAuth,
    requireModerator,
    moderationLimiter,
    async (_req: AuthenticatedRequest, res) => {
      try {
        const config = await getOrCreateSocialConfig(db);
        const outcome = await applyRetentionPolicy(db, config.retentionDays);
        res.json(outcome);
      } catch (err) {
        console.error('[social/retention/run] Error:', err);
        res.status(500).json({ error: 'No se pudo ejecutar la limpieza de retención.' });
      }
    }
  );

  // Moderator-only: list audit logs
  router.get(
    '/audit',
    requireAuth,
    requireModerator,
    async (req: AuthenticatedRequest, res) => {
      try {
        const limit = Number(req.query.limit || 50);
        const logs = await listAuditLogs(db, Number.isFinite(limit) ? limit : 50);
        res.json({ logs });
      } catch (err) {
        console.error('[social/audit] Error:', err);
        res.status(500).json({ error: 'No se pudo obtener el registro de auditoría.' });
      }
    }
  );

  return router;
}
