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
   * Executes an official X API v2 Recent Search query for public posts.
   * Respects pagination (bounded to max 2 pages), rate limits, concurrency lock,
   * and deduplicates by external_post_id.
   */
  public async syncRecentPublicPosts(
    db: DatabaseAdapter,
    moderator: AuthenticatedUser,
    options?: { maxPages?: number; maxResultsPerPage?: number }
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

    this.isSyncing = true;
    const config = await getOrCreateSocialConfig(db);
    const query = config.searchQuery;
    const maxPages = Math.min(Math.max(1, options?.maxPages ?? 2), 3);
    const maxResults = Math.min(Math.max(10, options?.maxResultsPerPage ?? 20), 50);

    try {
      const collectedTweets: XApiTweet[] = [];
      let nextToken: string | undefined;
      let rateLimitRemaining: number | undefined;
      let rateLimitReset: string | undefined;

      for (let page = 0; page < maxPages; page += 1) {
        const params = new URLSearchParams({
          query,
          max_results: String(maxResults),
          // Privacy-minimal fields: public post text & timestamp only.
          // No user profile expansion, no followers, no private messages, no geo.
          'tweet.fields': 'created_at,lang'
        });

        if (nextToken) {
          params.set('next_token', nextToken);
        }

        const endpoint = `${this.apiBaseUrl}/tweets/search/recent?${params.toString()}`;
        const response = await this.fetchImpl(endpoint, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json'
          }
        });

        const remHeader = response.headers.get('x-rate-limit-remaining');
        const resetHeader = response.headers.get('x-rate-limit-reset');
        if (remHeader !== null && !Number.isNaN(Number(remHeader))) {
          rateLimitRemaining = Number(remHeader);
        }
        if (resetHeader && !Number.isNaN(Number(resetHeader))) {
          rateLimitReset = new Date(Number(resetHeader) * 1000).toISOString();
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
          throw new Error(`Error al consultar X API v2: ${detail}`);
        }

        if (Array.isArray(payload.data)) {
          collectedTweets.push(...payload.data);
        }

        nextToken = payload.meta?.next_token;
        if (!nextToken) break;
        if (rateLimitRemaining !== undefined && rateLimitRemaining <= 0) break;
      }

      const normalizedPosts = collectedTweets
        .filter(t => t && typeof t.id === 'string' && typeof t.text === 'string')
        .map(tweet => {
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
      const message = `Sincronización completada: ${imported.length} nuevas publicaciones, ${duplicatesSkipped} duplicadas omitidas.`;

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
        fetchedCount: collectedTweets.length,
        importedCount: imported.length,
        duplicatesSkipped,
        queryUsed: query,
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
