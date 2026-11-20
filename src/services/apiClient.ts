import {
  IncidentCategory,
  IncidentReport,
  RiskLevel,
  SocialPost,
  SocialPostStatus,
  SocialSourceAudit,
  UserProfile
} from '../types';

const RAW_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').trim();
export const API_BASE_URL = RAW_BASE_URL.replace(/\/+$/, '');

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
  retentionDays: number;
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

function buildUrl(path: string): string {
  return API_BASE_URL ? `${API_BASE_URL}${path}` : path;
}

export function isBackendConfigured(): boolean {
  return true;
}

export async function checkBackendHealth(): Promise<BackendHealth | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(buildUrl('/api/health'), { signal: controller.signal });
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

export async function ensureBackendSession(user: UserProfile | null): Promise<string | null> {
  if (!API_BASE_URL || !user) return null;
  const userKey = `${user.uid}:${user.role}:${user.email}`;
  if (activeSessionToken && activeSessionUserKey === userKey) {
    return activeSessionToken;
  }

  try {
    const res = await fetch(buildUrl('/api/auth/session'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uid: user.uid,
        name: user.name,
        email: user.email,
        role: user.role
      })
    });
    if (!res.ok) {
      activeSessionToken = null;
      return null;
    }
    const data = (await res.json()) as { token?: string };
    activeSessionToken = data.token || null;
    activeSessionUserKey = userKey;
    return activeSessionToken;
  } catch {
    return null;
  }
}

export function clearBackendSession(): void {
  activeSessionToken = null;
  activeSessionUserKey = null;
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

  return fetch(buildUrl(path), {
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
    throw new Error(data.error || 'Error al cargar incidentes del servidor.');
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
    throw new Error(data.error || 'No se pudo moderar el incidente en el servidor.');
  }
  return data.incident;
}

export async function fetchSocialStatus(user: UserProfile | null): Promise<SocialStatusResponse> {
  const res = await authorizedFetch('/api/social/status', user);
  const data = (await res.json()) as SocialStatusResponse & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || 'No se pudo obtener el estado de fuentes sociales.');
  }
  return data;
}

export async function updateSocialConfig(
  user: UserProfile | null,
  payload: { searchQuery?: string; retentionDays?: number }
): Promise<{ searchQuery: string; retentionDays: number }> {
  const res = await authorizedFetch('/api/social/config', user, {
    method: 'PUT',
    body: JSON.stringify(payload)
  });
  const data = (await res.json()) as {
    config?: { searchQuery: string; retentionDays: number };
    error?: string;
  };
  if (!res.ok || !data.config) {
    throw new Error(data.error || 'No se pudo guardar la configuración de búsqueda.');
  }
  return data.config;
}

export async function triggerXSync(user: UserProfile | null): Promise<{
  message: string;
  result: {
    fetchedCount: number;
    importedCount: number;
    duplicatesSkipped: number;
    queryUsed: string;
  };
  stats: SocialStatusResponse['stats'];
}> {
  const res = await authorizedFetch('/api/social/x/sync', user, {
    method: 'POST'
  });
  const data = (await res.json()) as {
    message?: string;
    result?: {
      fetchedCount: number;
      importedCount: number;
      duplicatesSkipped: number;
      queryUsed: string;
    };
    stats?: SocialStatusResponse['stats'];
    error?: string;
  };
  if (!res.ok || !data.result || !data.stats) {
    throw new Error(data.error || 'No se pudo sincronizar con X.');
  }
  return {
    message: data.message || 'Sincronización completada.',
    result: data.result,
    stats: data.stats
  };
}

export async function fetchSocialPosts(
  user: UserProfile | null,
  status?: SocialPostStatus
): Promise<{ posts: SocialPost[]; stats: SocialStatusResponse['stats'] }> {
  const qs = status ? `?status=${encodeURIComponent(status)}` : '';
  const res = await authorizedFetch(`/api/social/posts${qs}`, user);
  const data = (await res.json()) as {
    posts?: SocialPost[];
    stats?: SocialStatusResponse['stats'];
    error?: string;
  };
  if (!res.ok) {
    throw new Error(data.error || 'No se pudieron cargar las publicaciones de X.');
  }
  return {
    posts: data.posts || [],
    stats: data.stats || { total: 0, pending: 0, verified: 0, discarded: 0 }
  };
}

export async function reviewBackendSocialPost(
  user: UserProfile | null,
  postId: string,
  payload: {
    action: 'create_report' | 'link_incident' | 'discard';
    reviewReason?: string;
    district?: string;
    category?: IncidentCategory;
    riskLevel?: RiskLevel;
    title?: string;
    description?: string;
    approxAddress?: string;
    approxLat?: number;
    approxLng?: number;
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
    throw new Error(data.error || 'No se pudo procesar la revisión de la publicación.');
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
    throw new Error(data.error || 'No se pudo cargar la bitácora de auditoría.');
  }
  return data.logs || [];
}
