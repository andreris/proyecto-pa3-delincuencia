import { DatabaseAdapter } from '../db/types.js';
import {
  AuthenticatedUser,
  IncidentFilterKey,
  LocationReferenceKey,
  WebNewsRecord
} from '../types.js';
import {
  sanitizeAdditionalKeywords,
  sanitizeAllowedDistricts,
  sanitizeIncidentFilterKeys,
  sanitizeLocationRefKeys,
  validateAndGeolocateWebNews
} from '../utils/sanitize.js';
import { recordAuditLog } from './auditService.js';
import { GeocoderService } from './geocoderService.js';
import { parseRppRssFeed } from './rssService.js';
import { validateDateRange } from './socialRepository.js';
import {
  EvaluatedWebNewsInput,
  getConfiguredRppRssUrl,
  getExistingWebExternalIds,
  getOrCreateWebConfig,
  insertWebNewsDeduped,
  updateWebSyncMetadata
} from './webRepository.js';

export const HARD_MAX_WEB_NEWS_PER_SYNC = 20;
export const DEFAULT_WEB_COOLDOWN_MINUTES = 15;

export type WebFetchLike = (
  input: string | URL,
  init?: RequestInit
) => Promise<{
  ok: boolean;
  status: number;
  headers?: { get(name: string): string | null };
  text(): Promise<string>;
}>;

export interface WebSyncFiltersInput {
  districts?: string[];
  incidentTypes?: IncidentFilterKey[];
  locationReferences?: LocationReferenceKey[];
  additionalKeywords?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface WebSyncResult {
  sourceName: 'RPP Noticias';
  rssUrl: string;
  fetchedCount: number;
  importedCount: number;
  discardedCount: number;
  duplicatesSkipped: number;
  capSkippedCount: number;
  discardReasons: string[];
  maxNewsLimit: number;
  cooldownMinutes: number;
  nextAllowedSyncAt: string;
  importedNews: WebNewsRecord[];
  discardedNews: WebNewsRecord[];
}

export class WebSyncConflictError extends Error {
  constructor(
    message = 'Ya hay una sincronización de noticias web en curso. Intenta en unos segundos.'
  ) {
    super(message);
    this.name = 'WebSyncConflictError';
  }
}

export class WebDateRangeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WebDateRangeError';
  }
}

export class WebSyncCooldownError extends Error {
  public readonly nextAllowedSyncAt: string;
  public readonly retryAfterSeconds: number;

  constructor(message: string, nextAllowedSyncAt: string, retryAfterSeconds: number) {
    super(message);
    this.name = 'WebSyncCooldownError';
    this.nextAllowedSyncAt = nextAllowedSyncAt;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export function getWebSyncCooldownMinutes(): number {
  const raw = (process.env.WEB_SYNC_COOLDOWN_MINUTES ?? '').trim();
  if (!raw) return DEFAULT_WEB_COOLDOWN_MINUTES;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return DEFAULT_WEB_COOLDOWN_MINUTES;
  }
  return Math.floor(parsed);
}

export function computeNextAllowedWebSync(lastSyncAt?: string): {
  nextAllowedSyncAt?: string;
  canSyncNow: boolean;
  cooldownMinutes: number;
  retryAfterSeconds: number;
} {
  const cooldownMinutes = getWebSyncCooldownMinutes();
  if (!lastSyncAt || cooldownMinutes <= 0) {
    return {
      canSyncNow: true,
      cooldownMinutes,
      retryAfterSeconds: 0
    };
  }

  const lastMs = new Date(lastSyncAt).getTime();
  if (!Number.isFinite(lastMs)) {
    return {
      canSyncNow: true,
      cooldownMinutes,
      retryAfterSeconds: 0
    };
  }

  const nextAllowedMs = lastMs + cooldownMinutes * 60 * 1000;
  const nowMs = Date.now();
  const nextAllowedSyncAt = new Date(nextAllowedMs).toISOString();

  if (nowMs < nextAllowedMs) {
    return {
      nextAllowedSyncAt,
      canSyncNow: false,
      cooldownMinutes,
      retryAfterSeconds: Math.max(1, Math.ceil((nextAllowedMs - nowMs) / 1000))
    };
  }

  return {
    nextAllowedSyncAt,
    canSyncNow: true,
    cooldownMinutes,
    retryAfterSeconds: 0
  };
}

export class WebService {
  private isSyncing = false;
  private readonly fetchImpl: WebFetchLike;
  private readonly geocoder: GeocoderService;

  constructor(options?: {
    fetchImpl?: WebFetchLike;
    geocoder?: GeocoderService;
  }) {
    this.fetchImpl = options?.fetchImpl || (globalThis.fetch as unknown as WebFetchLike);
    this.geocoder = options?.geocoder || new GeocoderService();
  }

  public getGeocoder(): GeocoderService {
    return this.geocoder;
  }

  public isSyncInProgress(): boolean {
    return this.isSyncing;
  }

  public getRssUrl(): string {
    return getConfiguredRppRssUrl();
  }

  /**
   * Queries the official RPP Noticias RSS feed strictly from the backend,
   * validates Lima Metropolitana location & active filters, deduplicates by canonical URL,
   * and enforces a hard cap of 20 new imported items per sync.
   */
  public async syncRppNews(
    db: DatabaseAdapter,
    moderator: AuthenticatedUser,
    filtersInput?: WebSyncFiltersInput
  ): Promise<WebSyncResult> {
    if (this.isSyncing) {
      throw new WebSyncConflictError();
    }

    const config = await getOrCreateWebConfig(db);
    const cooldownState = computeNextAllowedWebSync(config.lastSyncAt);

    if (!cooldownState.canSyncNow && cooldownState.nextAllowedSyncAt) {
      const nextDate = new Date(cooldownState.nextAllowedSyncAt);
      const formattedTime = nextDate.toLocaleTimeString('es-PE', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'America/Lima'
      });
      const remainingMinutes = Math.max(1, Math.ceil(cooldownState.retryAfterSeconds / 60));
      throw new WebSyncCooldownError(
        `Solo se permite sincronizar RPP Noticias cada ${cooldownState.cooldownMinutes} minutos. Podrás volver a sincronizar a partir de las ${formattedTime} (en aprox. ${remainingMinutes} min).`,
        cooldownState.nextAllowedSyncAt,
        cooldownState.retryAfterSeconds
      );
    }

    const effectiveDistricts =
      filtersInput?.districts !== undefined
        ? sanitizeAllowedDistricts(filtersInput.districts)
        : config.filterDistricts;

    const effectiveIncidentTypes =
      filtersInput?.incidentTypes !== undefined
        ? sanitizeIncidentFilterKeys(filtersInput.incidentTypes)
        : config.filterIncidentTypes;

    const effectiveLocationRefs =
      filtersInput?.locationReferences !== undefined
        ? sanitizeLocationRefKeys(filtersInput.locationReferences)
        : config.filterLocationRefs;

    const effectiveAdditionalKeywords =
      filtersInput?.additionalKeywords !== undefined
        ? sanitizeAdditionalKeywords(filtersInput.additionalKeywords)
        : config.additionalKeywords;

    const rawFrom =
      filtersInput?.dateFrom !== undefined ? filtersInput.dateFrom : config.filterDateFrom;
    const rawTo =
      filtersInput?.dateTo !== undefined ? filtersInput.dateTo : config.filterDateTo;

    let validatedDates: { dateFrom?: string; dateTo?: string };
    try {
      validatedDates = validateDateRange(rawFrom, rawTo);
    } catch (err) {
      throw new WebDateRangeError(
        err instanceof Error
          ? err.message.replace(/^BAD_REQUEST:\s*/, '')
          : 'Rango de fechas inválido.'
      );
    }

    const { dateFrom, dateTo } = validatedDates;
    const rssUrl = this.getRssUrl();
    this.isSyncing = true;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12_000);
      let response: Awaited<ReturnType<WebFetchLike>>;

      try {
        response = await this.fetchImpl(rssUrl, {
          method: 'GET',
          headers: {
            'User-Agent': 'Vigila.pe-WebMonitor/1.0 (+https://vigila.pe)',
            Accept: 'application/rss+xml, application/xml, text/xml;q=0.9'
          },
          signal: controller.signal
        });
      } finally {
        clearTimeout(timeout);
      }

      if (!response.ok) {
        throw new Error(
          `RPP Noticias RSS respondió con HTTP ${response.status}. Verifica disponibilidad del feed.`
        );
      }

      const xmlText = await response.text();
      const parsedItems = parseRppRssFeed(xmlText);

      // Deduplicate by canonical URL against existing DB and within the same feed
      const existingIds = await getExistingWebExternalIds(
        db,
        parsedItems.map(item => item.externalId)
      );
      const seenInBatch = new Set<string>();
      let preDuplicatesSkipped = 0;
      const uniqueNewItems = [];

      for (const item of parsedItems) {
        if (existingIds.has(item.externalId) || seenInBatch.has(item.externalId)) {
          preDuplicatesSkipped += 1;
          continue;
        }
        seenInBatch.add(item.externalId);
        uniqueNewItems.push(item);
      }

      // Evaluate each unique item and enforce strict hard cap of 20 newly imported items
      const evaluatedToPersist: EvaluatedWebNewsInput[] = [];
      let acceptedCount = 0;
      let capSkippedCount = 0;

      for (const item of uniqueNewItems) {
        const outcome = await validateAndGeolocateWebNews({
          title: item.title,
          excerpt: item.excerpt,
          publishedAt: item.publishedAt,
          selectedDistricts: effectiveDistricts,
          selectedIncidentTypes: effectiveIncidentTypes,
          selectedLocationRefs: effectiveLocationRefs,
          additionalKeywords: effectiveAdditionalKeywords,
          dateFrom,
          dateTo,
          geocoder: this.geocoder
        });

        if (outcome.accepted) {
          if (acceptedCount >= HARD_MAX_WEB_NEWS_PER_SYNC) {
            capSkippedCount += 1;
            continue;
          }
          acceptedCount += 1;
          evaluatedToPersist.push({
            externalId: item.externalId,
            title: item.title,
            excerpt: item.excerpt,
            publishedAt: item.publishedAt,
            originalUrl: item.originalUrl,
            imageUrl: item.imageUrl,
            suggestedCategory: outcome.suggestedCategory,
            suggestedRiskLevel: outcome.suggestedRiskLevel,
            district: outcome.detectedDistrict,
            latitude: outcome.latitude,
            longitude: outcome.longitude,
            locationLabel: outcome.locationLabel,
            locationConfidence: outcome.locationConfidence,
            locationStatus: outcome.locationStatus,
            locationSource: outcome.locationSource,
            isLimaValidated: outcome.isLimaValidated,
            status: 'Pendiente de validación'
          });
        } else {
          evaluatedToPersist.push({
            externalId: item.externalId,
            title: item.title,
            excerpt: item.excerpt,
            publishedAt: item.publishedAt,
            originalUrl: item.originalUrl,
            imageUrl: item.imageUrl,
            suggestedCategory: outcome.suggestedCategory,
            suggestedRiskLevel: outcome.suggestedRiskLevel,
            district: outcome.detectedDistrict,
            latitude: null,
            longitude: null,
            locationLabel: null,
            locationConfidence: outcome.locationConfidence,
            locationStatus: outcome.locationStatus,
            locationSource: outcome.locationSource,
            isLimaValidated: false,
            status: 'Descartado',
            reviewReason: outcome.discardReason
          });
        }
      }

      const { imported, discarded, duplicatesSkipped: insertDupes } = await insertWebNewsDeduped(
        db,
        evaluatedToPersist
      );
      const totalDuplicatesSkipped = preDuplicatesSkipped + insertDupes;

      const discardReasons = Array.from(
        new Set(
          discarded
            .map(d => d.reviewReason)
            .filter((r): r is string => Boolean(r))
        )
      );

      const syncTimestamp = new Date().toISOString();
      const nextAllowedSyncAt = new Date(
        new Date(syncTimestamp).getTime() + cooldownState.cooldownMinutes * 60 * 1000
      ).toISOString();

      const message = `Sincronización RPP Noticias completada: ${parsedItems.length} leídas, ${imported.length} importadas en revisión (máx. ${HARD_MAX_WEB_NEWS_PER_SYNC}), ${discarded.length} descartadas automáticamente, ${totalDuplicatesSkipped} duplicadas omitidas${capSkippedCount > 0 ? `, ${capSkippedCount} omitidas por límite de 20` : ''}.`;

      await updateWebSyncMetadata(db, {
        lastSyncAt: syncTimestamp,
        lastSyncStatus: 'success',
        lastSyncMessage: message,
        lastImportedCount: imported.length
      });

      const activeFiltersSummary = [
        `tipos: ${effectiveIncidentTypes.length > 0 ? effectiveIncidentTypes.join(', ') : 'Todos'}`,
        `ubicación: ${effectiveLocationRefs.length > 0 ? effectiveLocationRefs.join(', ') : 'Cualquiera'}`,
        `distritos: ${effectiveDistricts.length > 0 ? effectiveDistricts.join(', ') : 'Todos'}`,
        `adicionales: "${effectiveAdditionalKeywords || '—'}"`,
        `fechas: ${dateFrom || '—'} a ${dateTo || '—'}`
      ].join(' | ');

      await recordAuditLog(db, {
        actionType: 'web_sync',
        actorId: moderator.uid,
        actorName: moderator.name,
        actorRole: moderator.role,
        targetType: 'web_config',
        targetId: 'rpp-default',
        details: `Fuente: RPP Noticias (${rssUrl}) • Fecha: ${syncTimestamp} • ${message} • Filtros activos: [${activeFiltersSummary}]${discardReasons.length > 0 ? ` • Motivos de descarte: ${discardReasons.join(' | ')}` : ''}`
      });

      return {
        sourceName: 'RPP Noticias',
        rssUrl,
        fetchedCount: parsedItems.length,
        importedCount: imported.length,
        discardedCount: discarded.length,
        duplicatesSkipped: totalDuplicatesSkipped,
        capSkippedCount,
        discardReasons,
        maxNewsLimit: HARD_MAX_WEB_NEWS_PER_SYNC,
        cooldownMinutes: cooldownState.cooldownMinutes,
        nextAllowedSyncAt,
        importedNews: imported,
        discardedNews: discarded
      };
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Error desconocido al sincronizar RPP Noticias RSS.';
      await updateWebSyncMetadata(db, {
        lastSyncAt: new Date().toISOString(),
        lastSyncStatus: 'error',
        lastSyncMessage: errorMessage,
        lastImportedCount: 0
      });
      throw err;
    } finally {
      this.isSyncing = false;
    }
  }
}
