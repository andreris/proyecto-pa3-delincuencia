import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { DatabaseAdapter } from '../db/types.js';
import { AuthenticatedRequest, requireAuth, requireModerator } from '../middleware/auth.js';
import { listAuditLogs, recordAuditLog } from '../services/auditService.js';
import {
  getOrCreateWebConfig,
  clearAutomaticWebDiscardedNews,
  getWebNewsStats,
  listWebNews,
  reviewWebNewsItem,
  ReviewWebNewsPayload,
  updateWebConfig
} from '../services/webRepository.js';
import {
  computeNextAllowedWebSync,
  HARD_MAX_WEB_NEWS_PER_SYNC,
  WebDateRangeError,
  WebService,
  WebSyncConflictError,
  WebSyncCooldownError
} from '../services/webService.js';
import {
  ALLOWED_SOCIAL_DISTRICTS,
  sanitizeAdditionalKeywords,
  sanitizeIncidentFilterKeys,
  sanitizeLocationRefKeys
} from '../utils/sanitize.js';
import {
  IncidentFilterKey,
  LocationReferenceKey,
  SocialPostStatus
} from '../types.js';

export function createWebRouter(db: DatabaseAdapter, webService: WebService): Router {
  const router = Router();

  const syncLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: 'Demasiadas solicitudes de sincronización RSS. Espera unos minutos antes de reintentar.'
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

  // Moderator-only: status, filters, cooldown, and counters for RPP Noticias RSS
  router.get(
    '/status',
    requireAuth,
    requireModerator,
    async (_req: AuthenticatedRequest, res) => {
      try {
        const config = await getOrCreateWebConfig(db);
        const stats = await getWebNewsStats(db);
        const cooldown = computeNextAllowedWebSync(config.lastSyncAt);

        res.json({
          rppConfigured: true,
          source: 'rpp',
          sourceName: 'RPP Noticias',
          rssUrl: config.rssUrl,
          isSyncing: webService.isSyncInProgress(),
          filterDistricts: config.filterDistricts,
          filterIncidentTypes: config.filterIncidentTypes,
          filterLocationRefs: config.filterLocationRefs,
          additionalKeywords: config.additionalKeywords,
          filterDateFrom: config.filterDateFrom,
          filterDateTo: config.filterDateTo,
          allowedDistricts: [...ALLOWED_SOCIAL_DISTRICTS],
          maxNewsPerSync: HARD_MAX_WEB_NEWS_PER_SYNC,
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
        console.error('[web/status] Error:', err);
        res.status(500).json({ error: 'No se pudo obtener el estado de fuentes web.' });
      }
    }
  );

  // Moderator-only: update visual filters for RPP Noticias RSS
  router.put(
    '/config',
    requireAuth,
    requireModerator,
    moderationLimiter,
    async (req: AuthenticatedRequest, res) => {
      try {
        const {
          filterDistricts,
          filterIncidentTypes,
          filterLocationRefs,
          additionalKeywords,
          filterDateFrom,
          filterDateTo
        } = req.body as {
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

        const updated = await updateWebConfig(
          db,
          {
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
        console.error('[web/config] Error:', err);
        res.status(500).json({ error: 'No se pudieron actualizar los filtros de fuentes web.' });
      }
    }
  );

  // Moderator-only: trigger manual sync from official RPP Noticias RSS feed
  router.post(
    '/rpp/sync',
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

        const result = await webService.syncRppNews(
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
        const stats = await getWebNewsStats(db);

        res.json({
          message: `Sincronización RPP Noticias completada: ${result.importedCount} noticias importadas en revisión, ${result.discardedCount} descartadas, ${result.duplicatesSkipped} duplicadas.`,
          result,
          stats
        });
      } catch (err) {
        if (err instanceof WebSyncConflictError) {
          res.status(409).json({ error: err.message });
          return;
        }
        if (err instanceof WebDateRangeError) {
          res.status(400).json({
            error: err.message,
            code: 'WEB_INVALID_DATE_RANGE'
          });
          return;
        }
        if (err instanceof WebSyncCooldownError) {
          res.status(429).json({
            error: err.message,
            code: 'WEB_SYNC_COOLDOWN',
            nextAllowedSyncAt: err.nextAllowedSyncAt,
            retryAfterSeconds: err.retryAfterSeconds
          });
          return;
        }
        const message =
          err instanceof Error ? err.message : 'Error al sincronizar RPP Noticias RSS.';
        res.status(502).json({ error: message });
      }
    }
  );

  // Moderator-only: list imported web news with filters
  router.get(
    '/news',
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

        const additionalKeywords =
          typeof req.query.additionalKeywords === 'string'
            ? sanitizeAdditionalKeywords(req.query.additionalKeywords)
            : undefined;

        const dateFrom =
          typeof req.query.dateFrom === 'string' ? req.query.dateFrom.trim() || undefined : undefined;
        const dateTo =
          typeof req.query.dateTo === 'string' ? req.query.dateTo.trim() || undefined : undefined;

        const news = await listWebNews(db, {
          status: filterStatus,
          districts: districts.length > 0 ? districts : undefined,
          incidentTypes: incidentTypes.length > 0 ? incidentTypes : undefined,
          locationRefs: locationRefs.length > 0 ? locationRefs : undefined,
          additionalKeywords: additionalKeywords || undefined,
          dateFrom,
          dateTo
        });
        const stats = await getWebNewsStats(db);

        res.json({ news, stats });
      } catch (err) {
        const msg = err instanceof Error ? err.message : '';
        if (msg.startsWith('BAD_REQUEST:')) {
          res.status(400).json({ error: msg.replace('BAD_REQUEST:', '').trim() });
          return;
        }
        console.error('[web/news] Error:', err);
        res.status(500).json({ error: 'No se pudieron listar las noticias web.' });
      }
    }
  );

  // Moderator-only: geocode a candidate reference within Lima Metropolitana
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

        const result = await webService
          .getGeocoder()
          .geocodeCandidate(query.trim(), district?.trim());
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
        console.error('[web/geocode] Error:', err);
        res.status(500).json({ error: 'No se pudo consultar el geocodificador.' });
      }
    }
  );

  // Moderator-only: review a web news item
  router.patch(
    '/news/:id/review',
    requireAuth,
    requireModerator,
    moderationLimiter,
    async (req: AuthenticatedRequest, res) => {
      try {
        const newsId = String(req.params.id);
        const body = req.body as ReviewWebNewsPayload;

        if (
          !body ||
          ![
            'approve_and_publish',
            'save_for_review',
            'save_as_reference',
            'link_incident',
            'discard'
          ].includes(body.action)
        ) {
          res.status(400).json({
            error:
              'Acción inválida. Debe ser approve_and_publish, save_for_review, save_as_reference, link_incident o discard.'
          });
          return;
        }

        const outcome = await reviewWebNewsItem(db, newsId, body, req.authUser!);
        const stats = await getWebNewsStats(db);
        res.json({
          ...outcome,
          stats
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Error al revisar la noticia web.';
        if (msg.startsWith('NOT_FOUND:')) {
          res.status(404).json({ error: msg.replace('NOT_FOUND:', '').trim() });
          return;
        }
        if (msg.startsWith('BAD_REQUEST:')) {
          res.status(400).json({ error: msg.replace('BAD_REQUEST:', '').trim() });
          return;
        }
        res.status(500).json({ error: 'No se pudo completar la revisión de la noticia.' });
      }
    }
  );

  // Moderator-only: clear legacy automatic RSS rejections after filter-rule updates.
  router.delete(
    '/news/automatic-discarded',
    requireAuth,
    requireModerator,
    moderationLimiter,
    async (req: AuthenticatedRequest, res) => {
      try {
        const removed = await clearAutomaticWebDiscardedNews(db);
        await recordAuditLog(db, {
          actionType: 'web_filters_updated',
          actorId: req.authUser!.uid,
          actorName: req.authUser!.name,
          actorRole: req.authUser!.role,
          targetType: 'web_config',
          targetId: 'rpp-default',
          details: `Limpieza de descartes automáticos RSS: ${removed} noticias eliminadas.`
        });
        res.json({ removed, stats: await getWebNewsStats(db) });
      } catch (err) {
        console.error('[web/automatic-discarded] Error:', err);
        res.status(500).json({ error: 'No se pudieron limpiar los descartes automáticos.' });
      }
    }
  );

  // Moderator-only: list audit logs for web sources
  router.get(
    '/audit',
    requireAuth,
    requireModerator,
    async (req: AuthenticatedRequest, res) => {
      try {
        const limit = Number(req.query.limit || 50);
        const allLogs = await listAuditLogs(db, Number.isFinite(limit) ? limit : 50);
        const logs = allLogs.filter(
          log =>
            log.targetType === 'web_news' ||
            log.targetType === 'web_config' ||
            log.actionType.startsWith('web_')
        );
        res.json({ logs });
      } catch (err) {
        console.error('[web/audit] Error:', err);
        res.status(500).json({ error: 'No se pudo obtener la bitácora de fuentes web.' });
      }
    }
  );

  return router;
}
