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
  XDateRangeError,
  XRateLimitError,
  XService,
  XSyncCooldownError
} from '../services/xService.js';
import {
  ALLOWED_SOCIAL_DISTRICTS,
  sanitizeIncidentFilterKeys,
  sanitizeLocationRefKeys
} from '../utils/sanitize.js';
import {
  IncidentFilterKey,
  LocationReferenceKey,
  SocialPostStatus
} from '../types.js';

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

  // Moderator-only: view X connection status, structured filters, read-only query preview, and counts
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
          queryGroups: config.queryGroups,
          retentionDays: config.retentionDays,
          filterDistricts: config.filterDistricts,
          filterIncidentTypes: config.filterIncidentTypes,
          filterLocationRefs: config.filterLocationRefs,
          additionalKeywords: config.additionalKeywords,
          filterDateFrom: config.filterDateFrom,
          filterDateTo: config.filterDateTo,
          allowedDistricts: [...ALLOWED_SOCIAL_DISTRICTS],
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

  // Moderator-only: update structured visual filters & retention policy (query built strictly on backend)
  router.put(
    '/config',
    requireAuth,
    requireModerator,
    moderationLimiter,
    async (req: AuthenticatedRequest, res) => {
      try {
        const {
          retentionDays,
          filterDistricts,
          filterIncidentTypes,
          filterLocationRefs,
          additionalKeywords,
          filterDateFrom,
          filterDateTo
        } = req.body as {
          retentionDays?: number;
          filterDistricts?: string[];
          filterIncidentTypes?: IncidentFilterKey[];
          filterLocationRefs?: LocationReferenceKey[];
          additionalKeywords?: string | null;
          filterDateFrom?: string | null;
          filterDateTo?: string | null;
        };

        if (typeof additionalKeywords === 'string' && additionalKeywords.trim().length > 80) {
          res.status(400).json({
            error: 'Las palabras adicionales permiten un máximo de 80 caracteres.'
          });
          return;
        }

        const updated = await updateSocialConfig(
          db,
          {
            retentionDays,
            filterDistricts,
            filterIncidentTypes,
            filterLocationRefs,
            additionalKeywords,
            filterDateFrom,
            filterDateTo
          },
          req.authUser!
        );

        res.json({ config: updated });
      } catch (err) {
        const msg = err instanceof Error ? err.message : '';
        if (msg.startsWith('BAD_REQUEST:')) {
          res.status(400).json({ error: msg.replace('BAD_REQUEST:', '').trim() });
          return;
        }
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
        const body = (req.body || {}) as {
          districts?: string[];
          incidentTypes?: IncidentFilterKey[];
          locationReferences?: LocationReferenceKey[];
          additionalKeywords?: string;
          dateFrom?: string;
          dateTo?: string;
        };
        const hasFiltersInBody =
          body.districts !== undefined ||
          body.incidentTypes !== undefined ||
          body.locationReferences !== undefined ||
          body.additionalKeywords !== undefined ||
          body.dateFrom !== undefined ||
          body.dateTo !== undefined;

        const result = await xService.syncRecentPublicPosts(
          db,
          req.authUser!,
          hasFiltersInBody
            ? {
                districts: body.districts,
                incidentTypes: body.incidentTypes,
                locationReferences: body.locationReferences,
                additionalKeywords: body.additionalKeywords,
                dateFrom: body.dateFrom,
                dateTo: body.dateTo
              }
            : undefined
        );
        const stats = await getSocialPostStats(db);
        res.json({
          message: `Sincronización completada: ${result.importedCount} nuevas publicaciones importadas, ${result.discardedCount} descartadas.`,
          result,
          stats
        });
      } catch (err) {
        if (err instanceof SyncConflictError) {
          res.status(409).json({ error: err.message });
          return;
        }
        if (err instanceof XDateRangeError) {
          res.status(400).json({
            error: err.message,
            code: 'X_INVALID_DATE_RANGE'
          });
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

  // Moderator-only: list imported social posts (pending, verified, discarded) with visual filters
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

        const rawDistricts = typeof req.query.districts === 'string' ? req.query.districts : '';
        const districts = rawDistricts
          .split(',')
          .map(d => d.trim())
          .filter(Boolean);

        const rawIncidentTypes =
          typeof req.query.incidentTypes === 'string' ? req.query.incidentTypes : '';
        const incidentTypes = sanitizeIncidentFilterKeys(
          rawIncidentTypes
            .split(',')
            .map(t => t.trim())
            .filter(Boolean)
        );

        const rawLocationRefs =
          typeof req.query.locationRefs === 'string' ? req.query.locationRefs : '';
        const locationRefs = sanitizeLocationRefKeys(
          rawLocationRefs
            .split(',')
            .map(r => r.trim())
            .filter(Boolean)
        );

        const dateFrom =
          typeof req.query.dateFrom === 'string' ? req.query.dateFrom.trim() || undefined : undefined;
        const dateTo =
          typeof req.query.dateTo === 'string' ? req.query.dateTo.trim() || undefined : undefined;

        const posts = await listSocialPosts(db, {
          status: filterStatus,
          districts: districts.length > 0 ? districts : undefined,
          incidentTypes: incidentTypes.length > 0 ? incidentTypes : undefined,
          locationRefs: locationRefs.length > 0 ? locationRefs : undefined,
          dateFrom,
          dateTo
        });
        const stats = await getSocialPostStats(db);
        res.json({ posts, stats });
      } catch (err) {
        const msg = err instanceof Error ? err.message : '';
        if (msg.startsWith('BAD_REQUEST:')) {
          res.status(400).json({ error: msg.replace('BAD_REQUEST:', '').trim() });
          return;
        }
        console.error('[social/posts] Error:', err);
        res.status(500).json({ error: 'No se pudieron listar las publicaciones sociales.' });
      }
    }
  );

  // Moderator-only: geocode a candidate address within Lima Metropolitana, Perú
  router.post(
    '/geocode',
    requireAuth,
    requireModerator,
    moderationLimiter,
    async (req: AuthenticatedRequest, res) => {
      try {
        const { query, district } = (req.body || {}) as {
          query?: string;
          district?: string;
        };
        if (!query || !query.trim() || query.trim().length < 3) {
          res.status(400).json({
            error: 'Ingresa una calle, avenida o lugar de al menos 3 caracteres para geocodificar.'
          });
          return;
        }

        const result = await xService.getGeocoder().geocodeCandidate(query.trim(), district?.trim());
        if (!result) {
          res.status(404).json({
            error:
              'No se encontraron coordenadas verificadas en Lima Metropolitana, Perú para esa referencia.'
          });
          return;
        }
        if (!result.accepted) {
          res.status(400).json({
            error: result.reason || 'Ubicación fuera de Lima Metropolitana, Perú.',
            result
          });
          return;
        }

        res.json({ result });
      } catch (err) {
        console.error('[social/geocode] Error:', err);
        res.status(500).json({ error: 'No se pudo consultar el geocodificador.' });
      }
    }
  );

  // Moderator-only: review a social post (approve_and_publish, save_for_review, create_report, link_incident, or discard)
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
          ![
            'approve_and_publish',
            'save_for_review',
            'create_report',
            'link_incident',
            'discard'
          ].includes(body.action)
        ) {
          res.status(400).json({
            error:
              'Acción inválida. Debe ser approve_and_publish, save_for_review, create_report, link_incident o discard.'
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
