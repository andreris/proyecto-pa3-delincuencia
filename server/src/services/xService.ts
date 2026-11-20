import { DatabaseAdapter } from '../db/types.js';
import { AuthenticatedUser, SocialPostRecord } from '../types.js';
import {
  sanitizeExternalText,
  sanitizeXPostUrl,
  suggestMetadataFromText
} from '../utils/sanitize.js';
import {
  getOrCreateSocialConfig,
  insertSocialPostsDeduped,
  updateSyncMetadata
} from './socialRepository.js';
import { recordAuditLog } from './auditService.js';

export const HARD_MAX_POSTS_PER_SYNC = 10;
export const DEFAULT_COOLDOWN_MINUTES = 60;

export interface XApiTweet {
  id: string;
  text: string;
  created_at?: string;
  lang?: string;
}

export interface XApiRecentSearchResponse {
  data?: XApiTweet[];
  meta?: {
    newest_id?: string;
    oldest_id?: string;
    result_count?: number;
    next_token?: string;
  };
  errors?: Array<{ message?: string; title?: string; detail?: string }>;
}

export type FetchLike = (
  input: string | URL,
  init?: RequestInit
) => Promise<{
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  json(): Promise<unknown>;
}>;

export interface SyncResult {
  fetchedCount: number;
  importedCount: number;
  duplicatesSkipped: number;
  queryUsed: string;
  maxPostsLimit: number;
  cooldownMinutes: number;
  nextAllowedSyncAt: string;
  rateLimitRemaining?: number;
  rateLimitReset?: string;
  importedPosts: SocialPostRecord[];
}

export class SyncConflictError extends Error {
  constructor(message = 'Ya hay una sincronización con X en curso. Intenta en unos segundos.') {
    super(message);
    this.name = 'SyncConflictError';
  }
}

export class XConfigurationError extends Error {
  constructor(message = 'X_BEARER_TOKEN no está configurado en el servidor.') {
    super(message);
    this.name = 'XConfigurationError';
  }
}

export class XRateLimitError extends Error {
  public readonly resetAt?: string;
  constructor(message: string, resetAt?: string) {
    super(message);
    this.name = 'XRateLimitError';
    this.resetAt = resetAt;
  }
}

export class XCreditsError extends Error {
  constructor(
    message = 'La cuenta de X API no tiene créditos suficientes en este momento. Mostrando Modo demo.'
  ) {
    super(message);
    this.name = 'XCreditsError';
  }
}

export class XSyncCooldownError extends Error {
  public readonly nextAllowedSyncAt: string;
  public readonly retryAfterSeconds: number;

  constructor(message: string, nextAllowedSyncAt: string, retryAfterSeconds: number) {
    super(message);
    this.name = 'XSyncCooldownError';
    this.nextAllowedSyncAt = nextAllowedSyncAt;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export function getSyncMaxPosts(): number {
  const raw = Number(process.env.X_SYNC_MAX_POSTS ?? HARD_MAX_POSTS_PER_SYNC);
  if (!Number.isFinite(raw) || raw < 1) {
    return HARD_MAX_POSTS_PER_SYNC;
  }
  // Strict server-side hard cap: never exceed 10 posts per sync
  return Math.min(Math.floor(raw), HARD_MAX_POSTS_PER_SYNC);
}

export function getSyncCooldownMinutes(): number {
  const raw = (process.env.X_SYNC_COOLDOWN_MINUTES ?? '').trim();
  if (!raw) return DEFAULT_COOLDOWN_MINUTES;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return DEFAULT_COOLDOWN_MINUTES;
  }
  return Math.floor(parsed);
}

export function computeNextAllowedSync(lastSyncAt?: string): {
  nextAllowedSyncAt?: string;
  canSyncNow: boolean;
  cooldownMinutes: number;
  retryAfterSeconds: number;
} {
  const cooldownMinutes = getSyncCooldownMinutes();
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

export class XService {
  private isSyncing = false;
  private readonly fetchImpl: FetchLike;
  private readonly apiBaseUrl: string;

  constructor(options?: { fetchImpl?: FetchLike; apiBaseUrl?: string }) {
    this.fetchImpl = options?.fetchImpl || (globalThis.fetch as unknown as FetchLike);
    this.apiBaseUrl = options?.apiBaseUrl || 'https://api.x.com/2';
  }

  public isTokenConfigured(): boolean {
    return Boolean(this.getBearerToken());
  }

  public isSyncInProgress(): boolean {
    return this.isSyncing;
  }

  private getBearerToken(): string {
    return (process.env.X_BEARER_TOKEN || '').trim();
  }

  /**
   * Executes a single low-consumption official X API v2 Recent Search request (no pagination),
   * strictly capped at max_results=10 and <= 10 posts per sync, with 60-minute cooldown
   * and deduplication by external_post_id.
   */
  public async syncRecentPublicPosts(
    db: DatabaseAdapter,
    moderator: AuthenticatedUser
  ): Promise<SyncResult> {
    if (this.isSyncing) {
      throw new SyncConflictError();
    }

    const token = this.getBearerToken();
    if (!token) {
      throw new XConfigurationError(
        'X_BEARER_TOKEN no está configurado en el backend. La app continuará funcionando en Modo demo.'
      );
    }

    const config = await getOrCreateSocialConfig(db);
    const maxPostsLimit = getSyncMaxPosts();
    const cooldownState = computeNextAllowedSync(config.lastSyncAt);

    if (!cooldownState.canSyncNow && cooldownState.nextAllowedSyncAt) {
      const nextDate = new Date(cooldownState.nextAllowedSyncAt);
      const formattedTime = nextDate.toLocaleTimeString('es-PE', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'America/Lima'
      });
      const remainingMinutes = Math.max(1, Math.ceil(cooldownState.retryAfterSeconds / 60));
      throw new XSyncCooldownError(
        `Solo se permite una sincronización exitosa cada ${cooldownState.cooldownMinutes} minutos. Podrás volver a sincronizar a partir de las ${formattedTime} (en aprox. ${remainingMinutes} min).`,
        cooldownState.nextAllowedSyncAt,
        cooldownState.retryAfterSeconds
      );
    }

    this.isSyncing = true;
    const query = config.searchQuery;

    try {
      // Single request only — no pagination, no next_token loop, max_results=10
      const params = new URLSearchParams({
        query,
        max_results: String(HARD_MAX_POSTS_PER_SYNC),
        // Privacy-minimal fields: public post text & timestamp only.
        // No user profile expansion, no followers, no private messages, no geo.
        'tweet.fields': 'created_at,lang'
      });

      const endpoint = `${this.apiBaseUrl}/tweets/search/recent?${params.toString()}`;
      const response = await this.fetchImpl(endpoint, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json'
        }
      });

      let rateLimitRemaining: number | undefined;
      let rateLimitReset: string | undefined;
      const remHeader = response.headers.get('x-rate-limit-remaining');
      const resetHeader = response.headers.get('x-rate-limit-reset');
      if (remHeader !== null && !Number.isNaN(Number(remHeader))) {
        rateLimitRemaining = Number(remHeader);
      }
      if (resetHeader && !Number.isNaN(Number(resetHeader))) {
        rateLimitReset = new Date(Number(resetHeader) * 1000).toISOString();
      }

      if (response.status === 402) {
        throw new XCreditsError();
      }

      if (response.status === 429) {
        throw new XRateLimitError(
          'Límite de consultas de X API alcanzado. Espera antes de volver a sincronizar.',
          rateLimitReset
        );
      }

      if (response.status === 401 || response.status === 403) {
        throw new Error(
          'Credenciales de X API rechazadas o sin permisos suficientes para búsqueda reciente.'
        );
      }

      const payload = (await response.json()) as XApiRecentSearchResponse;

      if (!response.ok) {
        const detail = payload?.errors?.[0]?.detail || payload?.errors?.[0]?.message || `HTTP ${response.status}`;
        if (/credit|billing|quota|tier/i.test(detail)) {
          throw new XCreditsError(
            'Créditos o cuota de X API agotados. Puedes seguir operando con Modo demo.'
          );
        }
        throw new Error(`Error al consultar X API v2: ${detail}`);
      }

      const rawTweets = Array.isArray(payload.data) ? payload.data : [];
      // Enforce strict server-side cap regardless of upstream/mock payload size
      const cappedTweets = rawTweets
        .filter(t => t && typeof t.id === 'string' && typeof t.text === 'string')
        .slice(0, maxPostsLimit);

      const normalizedPosts = cappedTweets.map(tweet => {
        const safeText = sanitizeExternalText(tweet.text, 500);
        const meta = suggestMetadataFromText(safeText);
        return {
          platform: 'x' as const,
          externalPostId: tweet.id,
          postUrl: sanitizeXPostUrl(`https://x.com/i/web/status/${tweet.id}`, tweet.id),
          text: safeText,
          publishedAt: tweet.created_at || new Date().toISOString(),
          queryUsed: query,
          suggestedCategory: meta.suggestedCategory,
          suggestedRiskLevel: meta.suggestedRiskLevel,
          suggestedDistrict: meta.suggestedDistrict
        };
      });

      const { imported, duplicatesSkipped } = await insertSocialPostsDeduped(db, normalizedPosts);
      const syncTimestamp = new Date().toISOString();
      const nextAllowedSyncAt = new Date(
        new Date(syncTimestamp).getTime() + cooldownState.cooldownMinutes * 60 * 1000
      ).toISOString();
      const message = `Sincronización completada: ${imported.length} nuevas publicaciones (máx. ${maxPostsLimit}), ${duplicatesSkipped} duplicadas omitidas.`;

      await updateSyncMetadata(db, {
        lastSyncAt: syncTimestamp,
        lastSyncStatus: 'success',
        lastSyncMessage: message,
        lastImportedCount: imported.length
      });

      await recordAuditLog(db, {
        actionType: 'x_sync',
        actorId: moderator.uid,
        actorName: moderator.name,
        actorRole: moderator.role,
        targetType: 'social_config',
        targetId: 'x-default',
        details: `${message} Consulta: "${query}".`
      });

      return {
        fetchedCount: cappedTweets.length,
        importedCount: imported.length,
        duplicatesSkipped,
        queryUsed: query,
        maxPostsLimit,
        cooldownMinutes: cooldownState.cooldownMinutes,
        nextAllowedSyncAt,
        rateLimitRemaining,
        rateLimitReset,
        importedPosts: imported
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error desconocido en sincronización con X.';
      await updateSyncMetadata(db, {
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
