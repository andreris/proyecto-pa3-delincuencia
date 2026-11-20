import {
  IncidentCategory,
  IncidentFilterKey,
  IncidentReport,
  LocationReferenceKey,
  RiskLevel,
  SocialPost,
  SocialPostStatus,
  SocialSourceAudit,
  UserProfile,
  WebNewsItem
} from '../types';

const metaEnv = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
const RAW_BASE_URL = (metaEnv?.VITE_API_BASE_URL || '').trim();

/**
 * Normalizes VITE_API_BASE_URL so same-origin setups like "", "/", or "/api"
 * produce clean "/api/..." routes without ever generating "/api/api/...".
 */
export function normalizeApiBaseUrl(rawBase?: string): string {
  const trimmed = (rawBase ?? '').trim().replace(/\/+$/, '');
  if (!trimmed || trimmed === '/' || trimmed === '/api') {
    return '';
  }
  if (trimmed.endsWith('/api')) {
    return trimmed.slice(0, -4);
  }
  return trimmed;
}

export const API_BASE_URL = normalizeApiBaseUrl(RAW_BASE_URL);

export function buildApiUrl(path: string, baseOverride?: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const base =
    baseOverride !== undefined ? normalizeApiBaseUrl(baseOverride) : API_BASE_URL;
  return base ? `${base}${normalizedPath}` : normalizedPath;
}

export class ApiClientError extends Error {
  public readonly status: number;
  public readonly code?: string;
  public readonly nextAllowedSyncAt?: string;
  public readonly retryAfterSeconds?: number;

  constructor(
    message: string,
    status: number,
    options?: {
      code?: string;
      nextAllowedSyncAt?: string;
      retryAfterSeconds?: number;
    }
  ) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = options?.code;
    this.nextAllowedSyncAt = options?.nextAllowedSyncAt;
    this.retryAfterSeconds = options?.retryAfterSeconds;
  }
}

export interface BackendHealth {
  ok: boolean;
  service?: string;
  mode: 'live' | 'demo_no_token';
  xConfigured: boolean;
  dbType: 'sqlite' | 'postgres';
  timestamp: string;
}

export interface SocialStatusResponse {
  xConfigured: boolean;
  isSyncing: boolean;
  searchQuery: string;
  queryGroups?: string[];
  retentionDays: number;
  filterDistricts?: string[];
  filterIncidentTypes?: IncidentFilterKey[];
  filterLocationRefs?: LocationReferenceKey[];
  additionalKeywords?: string;
  filterDateFrom?: string;
  filterDateTo?: string;
  allowedDistricts?: string[];
  maxPostsPerSync?: number;
  cooldownMinutes?: number;
  canSyncNow?: boolean;
  nextAllowedSyncAt?: string;
  retryAfterSeconds?: number;
  lastSyncAt?: string;
  lastSyncStatus?: 'success' | 'error' | 'idle';
  lastSyncMessage?: string;
  lastImportedCount: number;
  stats: {
    total: number;
    pending: number;
    verified: number;
    discarded: number;
  };
}

let activeSessionToken: string | null = null;
let activeSessionUserKey: string | null = null;
let activeSessionRole: 'user' | 'moderator' | null = null;

export function isBackendConfigured(): boolean {
  return true;
}

export function hasActiveModeratorToken(): boolean {
  return Boolean(activeSessionToken && activeSessionRole === 'moderator');
}

export async function checkBackendHealth(): Promise<BackendHealth | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(buildApiUrl('/api/health'), { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) return null;
    const data = (await res.json()) as Partial<BackendHealth>;
    if (!data.ok || data.service !== 'vigila-pe-api') return null;
    return data as BackendHealth;
  } catch {
    return null;
  }
}

/**
 * Authenticates a moderator by sending MODERATOR_ACCESS_CODE ONLY to POST /api/auth/session.
 * The code is never stored in localStorage, logs, or client state.
 */
export async function authenticateModeratorSession(
  user: UserProfile | null,
  moderatorCode: string
): Promise<{
  token: string;
  user: { uid: string; name: string; email: string; role: 'moderator' };
}> {
  const uid = user?.uid || 'mod-session-' + Date.now().toString(36);
  const name = user?.name || 'Moderador Vigila.pe';
  const email = user?.email || 'moderacion@vigila.pe';

  const res = await fetch(buildApiUrl('/api/auth/session'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      uid,
      name,
      email,
      role: 'moderator',
      moderatorCode
    })
  });

  const data = (await res.json().catch(() => ({}))) as {
    token?: string;
    user?: { uid: string; name: string; email: string; role: 'user' | 'moderator' };
    error?: string;
  };

  if (res.status === 403) {
    activeSessionToken = null;
    activeSessionUserKey = null;
    activeSessionRole = null;
    throw new ApiClientError(data.error || 'Código de moderador inválido', 403);
  }

  if (!res.ok || !data.token || data.user?.role !== 'moderator') {
    throw new ApiClientError(
      data.error || 'No se pudo autenticar la sesión de moderador.',
      res.status || 500
    );
  }

  activeSessionToken = data.token;
  activeSessionRole = 'moderator';
  activeSessionUserKey = `${uid}:moderator:${email}`;

  return {
    token: data.token,
    user: {
      uid: data.user.uid,
      name: data.user.name,
      email: data.user.email,
      role: 'moderator'
    }
  };
}

/**
 * Creates/reuses a backend session token via same-origin or configured base URL.
 * Never requests moderator role without an explicit moderatorCode verification.
 */
export async function ensureBackendSession(user: UserProfile | null): Promise<string | null> {
  if (!user) return null;

  // If already holding a verified moderator token in memory, reuse it
  if (activeSessionToken && activeSessionRole === 'moderator') {
    return activeSessionToken;
  }

  // Never auto-escalate to moderator without MODERATOR_ACCESS_CODE modal authentication
  const requestedRole: 'user' = 'user';
  const userKey = `${user.uid}:${requestedRole}:${user.email}`;
  if (activeSessionToken && activeSessionUserKey === userKey) {
    return activeSessionToken;
  }

  try {
    const res = await fetch(buildApiUrl('/api/auth/session'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uid: user.uid,
        name: user.name,
        email: user.email,
        role: requestedRole
      })
    });
    if (!res.ok) {
      activeSessionToken = null;
      activeSessionRole = null;
      return null;
    }
    const data = (await res.json()) as { token?: string };
    activeSessionToken = data.token || null;
    activeSessionRole = activeSessionToken ? 'user' : null;
    activeSessionUserKey = userKey;
    return activeSessionToken;
  } catch {
    return null;
  }
}

export function clearBackendSession(): void {
  activeSessionToken = null;
  activeSessionUserKey = null;
  activeSessionRole = null;
}

async function authorizedFetch(
  path: string,
  user: UserProfile | null,
  init: RequestInit = {}
): Promise<Response> {
  const token = await ensureBackendSession(user);
  const headers = new Headers(init.headers);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  return fetch(buildApiUrl(path), {
    ...init,
    headers
  });
}

export async function fetchBackendIncidents(
  user: UserProfile | null,
  includePending = false
): Promise<IncidentReport[]> {
  const query = includePending ? '?includePending=true' : '';
  const res = await authorizedFetch(`/api/incidents${query}`, user);
  const data = (await res.json()) as { incidents?: IncidentReport[]; error?: string };
  if (!res.ok) {
    throw new ApiClientError(
      data.error || 'Error al cargar incidentes del servidor.',
      res.status
    );
  }
  return data.incidents || [];
}

export async function reviewBackendIncident(
  user: UserProfile | null,
  incidentId: string,
  status: 'Verificado' | 'Descartado',
  reason?: string
): Promise<IncidentReport> {
  const res = await authorizedFetch(`/api/incidents/${encodeURIComponent(incidentId)}/review`, user, {
    method: 'PATCH',
    body: JSON.stringify({ status, reason })
  });
  const data = (await res.json()) as { incident?: IncidentReport; error?: string };
  if (!res.ok || !data.incident) {
    throw new ApiClientError(
      data.error || 'No se pudo moderar el incidente en el servidor.',
      res.status
    );
  }
  return data.incident;
}

export async function fetchSocialStatus(user: UserProfile | null): Promise<SocialStatusResponse> {
  const res = await authorizedFetch('/api/social/status', user);
  const data = (await res.json()) as SocialStatusResponse & { error?: string };
  if (!res.ok) {
    throw new ApiClientError(
      data.error || 'No se pudo obtener el estado de fuentes sociales.',
      res.status
    );
  }
  return data;
}

export interface SocialFilterOptions {
  districts?: string[];
  incidentTypes?: IncidentFilterKey[];
  locationReferences?: LocationReferenceKey[];
  additionalKeywords?: string;
  dateFrom?: string;
  dateTo?: string;
}

export async function updateSocialConfig(
  user: UserProfile | null,
  payload: {
    retentionDays?: number;
    filterDistricts?: string[];
    filterIncidentTypes?: IncidentFilterKey[];
    filterLocationRefs?: LocationReferenceKey[];
    additionalKeywords?: string | null;
    filterDateFrom?: string | null;
    filterDateTo?: string | null;
  }
): Promise<{
  searchQuery: string;
  queryGroups?: string[];
  retentionDays: number;
  filterDistricts?: string[];
  filterIncidentTypes?: IncidentFilterKey[];
  filterLocationRefs?: LocationReferenceKey[];
  additionalKeywords?: string;
  filterDateFrom?: string;
  filterDateTo?: string;
}> {
  const res = await authorizedFetch('/api/social/config', user, {
    method: 'PUT',
    body: JSON.stringify(payload)
  });
  const data = (await res.json()) as {
    config?: {
      searchQuery: string;
      queryGroups?: string[];
      retentionDays: number;
      filterDistricts?: string[];
      filterIncidentTypes?: IncidentFilterKey[];
      filterLocationRefs?: LocationReferenceKey[];
      additionalKeywords?: string;
      filterDateFrom?: string;
      filterDateTo?: string;
    };
    error?: string;
  };
  if (!res.ok || !data.config) {
    throw new ApiClientError(
      data.error || 'No se pudo guardar la configuración de búsqueda.',
      res.status
    );
  }
  return data.config;
}

export async function triggerXSync(
  user: UserProfile | null,
  filters?: SocialFilterOptions
): Promise<{
  message: string;
  result: {
    fetchedCount: number;
    importedCount: number;
    discardedCount?: number;
    duplicatesSkipped: number;
    discardReasons?: string[];
    queryUsed: string;
    queryGroups?: string[];
    maxPostsLimit?: number;
    cooldownMinutes?: number;
    nextAllowedSyncAt?: string;
  };
  stats: SocialStatusResponse['stats'];
}> {
  const res = await authorizedFetch('/api/social/x/sync', user, {
    method: 'POST',
    body: filters ? JSON.stringify(filters) : undefined
  });
  const data = (await res.json().catch(() => ({}))) as {
    message?: string;
    code?: string;
    nextAllowedSyncAt?: string;
    retryAfterSeconds?: number;
    result?: {
      fetchedCount: number;
      importedCount: number;
      discardedCount?: number;
      duplicatesSkipped: number;
      discardReasons?: string[];
      queryUsed: string;
      queryGroups?: string[];
      maxPostsLimit?: number;
      cooldownMinutes?: number;
      nextAllowedSyncAt?: string;
    };
    stats?: SocialStatusResponse['stats'];
    error?: string;
  };
  if (!res.ok || !data.result || !data.stats) {
    throw new ApiClientError(data.error || 'No se pudo sincronizar con X.', res.status, {
      code: data.code,
      nextAllowedSyncAt: data.nextAllowedSyncAt,
      retryAfterSeconds: data.retryAfterSeconds
    });
  }
  return {
    message: data.message || 'Sincronización completada.',
    result: data.result,
    stats: data.stats
  };
}

export async function fetchSocialPosts(
  user: UserProfile | null,
  statusOrFilters?: SocialPostStatus | (SocialFilterOptions & { status?: SocialPostStatus })
): Promise<{ posts: SocialPost[]; stats: SocialStatusResponse['stats'] }> {
  const filters =
    typeof statusOrFilters === 'string'
      ? { status: statusOrFilters }
      : statusOrFilters || {};

  const search = new URLSearchParams();
  if (filters.status) search.set('status', filters.status);
  if (filters.districts && filters.districts.length > 0) {
    search.set('districts', filters.districts.join(','));
  }
  if (filters.incidentTypes && filters.incidentTypes.length > 0) {
    search.set('incidentTypes', filters.incidentTypes.join(','));
  }
  if (filters.locationReferences && filters.locationReferences.length > 0) {
    search.set('locationRefs', filters.locationReferences.join(','));
  }
  if (filters.dateFrom) search.set('dateFrom', filters.dateFrom);
  if (filters.dateTo) search.set('dateTo', filters.dateTo);

  const qs = search.toString() ? `?${search.toString()}` : '';
  const res = await authorizedFetch(`/api/social/posts${qs}`, user);
  const data = (await res.json()) as {
    posts?: SocialPost[];
    stats?: SocialStatusResponse['stats'];
    error?: string;
  };
  if (!res.ok) {
    throw new ApiClientError(
      data.error || 'No se pudieron cargar las publicaciones de X.',
      res.status
    );
  }
  return {
    posts: data.posts || [],
    stats: data.stats || { total: 0, pending: 0, verified: 0, discarded: 0 }
  };
}

export interface GeocodeCandidateResponse {
  accepted: boolean;
  latitude?: number;
  longitude?: number;
  locationLabel?: string;
  confidence?: 'high' | 'medium' | 'low';
  reason?: string;
}

export async function geocodeCandidateAddress(
  user: UserProfile | null,
  query: string,
  district?: string
): Promise<GeocodeCandidateResponse> {
  const res = await authorizedFetch('/api/social/geocode', user, {
    method: 'POST',
    body: JSON.stringify({ query, district })
  });
  const data = (await res.json().catch(() => ({}))) as {
    result?: GeocodeCandidateResponse;
    error?: string;
  };
  if (!res.ok || !data.result) {
    throw new ApiClientError(
      data.error || 'No se pudo geocodificar la referencia en Lima Metropolitana.',
      res.status
    );
  }
  return data.result;
}

export async function reviewBackendSocialPost(
  user: UserProfile | null,
  postId: string,
  payload: {
    action: 'approve_and_publish' | 'save_for_review' | 'create_report' | 'link_incident' | 'discard';
    reviewReason?: string;
    district?: string;
    category?: IncidentCategory;
    riskLevel?: RiskLevel;
    title?: string;
    description?: string;
    approxAddress?: string;
    approxLat?: number;
    approxLng?: number;
    latitude?: number;
    longitude?: number;
    locationLabel?: string;
    confirmedLocationDescription?: string;
    movedManually?: boolean;
    linkedIncidentId?: string;
  }
): Promise<{
  post: SocialPost;
  createdIncident?: IncidentReport;
  stats: SocialStatusResponse['stats'];
}> {
  const res = await authorizedFetch(`/api/social/posts/${encodeURIComponent(postId)}/review`, user, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
  const data = (await res.json()) as {
    post?: SocialPost;
    createdIncident?: IncidentReport;
    stats?: SocialStatusResponse['stats'];
    error?: string;
  };
  if (!res.ok || !data.post) {
    throw new ApiClientError(
      data.error || 'No se pudo procesar la revisión de la publicación.',
      res.status
    );
  }
  return {
    post: data.post,
    createdIncident: data.createdIncident,
    stats: data.stats || { total: 0, pending: 0, verified: 0, discarded: 0 }
  };
}

export async function fetchSocialAuditLogs(user: UserProfile | null): Promise<SocialSourceAudit[]> {
  const res = await authorizedFetch('/api/social/audit', user);
  const data = (await res.json()) as { logs?: SocialSourceAudit[]; error?: string };
  if (!res.ok) {
    throw new ApiClientError(
      data.error || 'No se pudo cargar la bitácora de auditoría.',
      res.status
    );
  }
  return data.logs || [];
}

export interface WebStatusResponse {
  rppConfigured: boolean;
  source: 'rpp';
  sourceName: 'RPP Noticias';
  rssUrl: string;
  isSyncing: boolean;
  filterDistricts?: string[];
  filterIncidentTypes?: IncidentFilterKey[];
  filterLocationRefs?: LocationReferenceKey[];
  additionalKeywords?: string;
  filterDateFrom?: string;
  filterDateTo?: string;
  allowedDistricts?: string[];
  maxNewsPerSync?: number;
  cooldownMinutes?: number;
  canSyncNow?: boolean;
  nextAllowedSyncAt?: string;
  retryAfterSeconds?: number;
  lastSyncAt?: string;
  lastSyncStatus?: 'success' | 'error' | 'idle';
  lastSyncMessage?: string;
  lastImportedCount: number;
  stats: {
    total: number;
    pending: number;
    verified: number;
    discarded: number;
  };
}

export async function fetchWebStatus(user: UserProfile | null): Promise<WebStatusResponse> {
  const res = await authorizedFetch('/api/web/status', user);
  const data = (await res.json()) as WebStatusResponse & { error?: string };
  if (!res.ok) {
    throw new ApiClientError(
      data.error || 'No se pudo obtener el estado de fuentes web.',
      res.status
    );
  }
  return data;
}

export async function updateWebConfig(
  user: UserProfile | null,
  payload: {
    filterDistricts?: string[];
    filterIncidentTypes?: IncidentFilterKey[];
    filterLocationRefs?: LocationReferenceKey[];
    additionalKeywords?: string | null;
    filterDateFrom?: string | null;
    filterDateTo?: string | null;
  }
): Promise<void> {
  const res = await authorizedFetch('/api/web/config', user, {
    method: 'PUT',
    body: JSON.stringify(payload)
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) {
    throw new ApiClientError(
      data.error || 'No se pudieron actualizar los filtros de fuentes web.',
      res.status
    );
  }
}

export async function triggerRppSync(
  user: UserProfile | null,
  filters?: SocialFilterOptions
): Promise<{
  message: string;
  result: {
    sourceName: 'RPP Noticias';
    rssUrl: string;
    fetchedCount: number;
    importedCount: number;
    discardedCount: number;
    duplicatesSkipped: number;
    capSkippedCount?: number;
    discardReasons: string[];
    maxNewsLimit: number;
    cooldownMinutes: number;
    nextAllowedSyncAt: string;
  };
  stats: WebStatusResponse['stats'];
}> {
  const res = await authorizedFetch('/api/web/rpp/sync', user, {
    method: 'POST',
    body: filters ? JSON.stringify(filters) : undefined
  });
  const data = (await res.json().catch(() => ({}))) as {
    message?: string;
    code?: string;
    nextAllowedSyncAt?: string;
    retryAfterSeconds?: number;
    result?: {
      sourceName: 'RPP Noticias';
      rssUrl: string;
      fetchedCount: number;
      importedCount: number;
      discardedCount: number;
      duplicatesSkipped: number;
      capSkippedCount?: number;
      discardReasons: string[];
      maxNewsLimit: number;
      cooldownMinutes: number;
      nextAllowedSyncAt: string;
    };
    stats?: WebStatusResponse['stats'];
    error?: string;
  };
  if (!res.ok || !data.result || !data.stats) {
    throw new ApiClientError(
      data.error || 'No se pudo sincronizar con RPP Noticias RSS.',
      res.status,
      {
        code: data.code,
        nextAllowedSyncAt: data.nextAllowedSyncAt,
        retryAfterSeconds: data.retryAfterSeconds
      }
    );
  }
  return {
    message: data.message || 'Sincronización RPP Noticias completada.',
    result: data.result,
    stats: data.stats
  };
}

export async function fetchWebNews(
  user: UserProfile | null,
  filters: SocialFilterOptions & { status?: SocialPostStatus } = {}
): Promise<{ news: WebNewsItem[]; stats: WebStatusResponse['stats'] }> {
  const search = new URLSearchParams();
  if (filters.status) search.set('status', filters.status);
  if (filters.districts && filters.districts.length > 0) {
    search.set('districts', filters.districts.join(','));
  }
  if (filters.incidentTypes && filters.incidentTypes.length > 0) {
    search.set('incidentTypes', filters.incidentTypes.join(','));
  }
  if (filters.locationReferences && filters.locationReferences.length > 0) {
    search.set('locationRefs', filters.locationReferences.join(','));
  }
  if (filters.additionalKeywords) {
    search.set('additionalKeywords', filters.additionalKeywords);
  }
  if (filters.dateFrom) search.set('dateFrom', filters.dateFrom);
  if (filters.dateTo) search.set('dateTo', filters.dateTo);

  const qs = search.toString() ? `?${search.toString()}` : '';
  const res = await authorizedFetch(`/api/web/news${qs}`, user);
  const data = (await res.json()) as {
    news?: WebNewsItem[];
    stats?: WebStatusResponse['stats'];
    error?: string;
  };
  if (!res.ok) {
    throw new ApiClientError(
      data.error || 'No se pudieron cargar las noticias web.',
      res.status
    );
  }
  return {
    news: data.news || [],
    stats: data.stats || { total: 0, pending: 0, verified: 0, discarded: 0 }
  };
}

export async function reviewBackendWebNews(
  user: UserProfile | null,
  newsId: string,
  payload: {
    action:
      | 'approve_and_publish'
      | 'save_for_review'
      | 'save_as_reference'
      | 'link_incident'
      | 'discard';
    reviewReason?: string;
    district?: string;
    category?: IncidentCategory;
    riskLevel?: RiskLevel;
    title?: string;
    description?: string;
    latitude?: number;
    longitude?: number;
    locationLabel?: string;
    confirmedLocationDescription?: string;
    movedManually?: boolean;
    linkedIncidentId?: string;
  }
): Promise<{
  item: WebNewsItem;
  createdIncident?: IncidentReport;
  stats: WebStatusResponse['stats'];
}> {
  const res = await authorizedFetch(`/api/web/news/${encodeURIComponent(newsId)}/review`, user, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
  const data = (await res.json()) as {
    item?: WebNewsItem;
    createdIncident?: IncidentReport;
    stats?: WebStatusResponse['stats'];
    error?: string;
  };
  if (!res.ok || !data.item) {
    throw new ApiClientError(
      data.error || 'No se pudo procesar la revisión de la noticia.',
      res.status
    );
  }
  return {
    item: data.item,
    createdIncident: data.createdIncident,
    stats: data.stats || { total: 0, pending: 0, verified: 0, discarded: 0 }
  };
}

export async function fetchWebAuditLogs(user: UserProfile | null): Promise<SocialSourceAudit[]> {
  const res = await authorizedFetch('/api/web/audit', user);
  const data = (await res.json()) as { logs?: SocialSourceAudit[]; error?: string };
  if (!res.ok) {
    throw new ApiClientError(
      data.error || 'No se pudo cargar la bitácora de auditoría web.',
      res.status
    );
  }
  return data.logs || [];
}
