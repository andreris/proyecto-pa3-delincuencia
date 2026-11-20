import crypto from 'node:crypto';
import { DatabaseAdapter } from '../db/types.js';
import {
  AuthenticatedUser,
  IncidentCategory,
  IncidentFilterKey,
  IncidentReportRecord,
  LocationConfidence,
  LocationReferenceKey,
  LocationSource,
  LocationStatus,
  ReportStatus,
  RiskLevel,
  SocialPostRecord,
  SocialPostState,
  SocialPostStatus,
  SocialSourceConfig
} from '../types.js';
import {
  ALLOWED_SOCIAL_DISTRICT_SET,
  buildXRecentSearchQueries,
  DISTRICT_APPROX_CENTERS,
  matchesIncidentFilterKeys,
  matchesLocationReferences,
  obfuscateCoordinatesForPublicMap,
  sanitizeAdditionalKeywords,
  sanitizeAllowedDistricts,
  sanitizeExternalText,
  sanitizeIncidentFilterKeys,
  sanitizeLocationRefKeys,
  sanitizePublicLocationLabel,
  sanitizeXPostUrl
} from '../utils/sanitize.js';
import { isWithinLimaMetroBounds } from './geocoderService.js';
import { recordAuditLog } from './auditService.js';

export const DEFAULT_X_QUERY = buildXRecentSearchQueries().preview;

interface IncidentRow {
  id: string;
  category: IncidentCategory;
  risk_level: RiskLevel;
  title: string;
  description: string;
  date: string;
  time: string;
  district: string;
  approx_lat: number;
  approx_lng: number;
  approx_address: string;
  status: ReportStatus;
  is_demo: number;
  evidence_note: string | null;
  false_report_flags: number;
  helpful_count: number;
  reported_by_role: IncidentReportRecord['reportedByRole'];
  source: 'citizen' | 'x';
  source_url: string | null;
  location_status: LocationStatus | null;
  location_confidence: LocationConfidence | null;
  location_source: LocationSource | null;
  created_at: string;
}

interface SocialPostRow {
  id: string;
  platform: 'x';
  external_post_id: string;
  post_url: string;
  text: string;
  published_at: string;
  imported_at: string;
  query_used: string;
  status: SocialPostStatus;
  suggested_category: IncidentCategory;
  suggested_risk_level: RiskLevel;
  suggested_district: string | null;
  latitude: number | null;
  longitude: number | null;
  location_label: string | null;
  location_confidence: LocationConfidence | null;
  location_status: LocationStatus | null;
  location_source: LocationSource | null;
  is_lima_validated: number | null;
  confirmed_location_description: string | null;
  moderator_id: string | null;
  moderator_name: string | null;
  review_reason: string | null;
  reviewed_at: string | null;
  linked_incident_id: string | null;
}

interface SocialConfigRow {
  id: string;
  search_query: string;
  retention_days: number;
  filter_districts: string | null;
  filter_incident_types: string | null;
  filter_location_refs: string | null;
  additional_keywords: string | null;
  filter_date_from: string | null;
  filter_date_to: string | null;
  last_sync_at: string | null;
  last_sync_status: 'success' | 'error' | 'idle' | null;
  last_sync_message: string | null;
  last_imported_count: number;
  updated_at: string;
  updated_by: string | null;
}

function parseFilterDistricts(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return sanitizeAllowedDistricts(Array.isArray(parsed) ? parsed : []);
  } catch {
    return [];
  }
}

function parseFilterIncidentTypes(raw: string | null | undefined): IncidentFilterKey[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return sanitizeIncidentFilterKeys(parsed);
  } catch {
    return [];
  }
}

function parseFilterLocationRefs(raw: string | null | undefined): LocationReferenceKey[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return sanitizeLocationRefKeys(parsed);
  } catch {
    return [];
  }
}

export function isValidIsoDateOnly(value: string | undefined): boolean {
  if (!value) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
}

export function validateDateRange(dateFrom?: string, dateTo?: string): {
  dateFrom?: string;
  dateTo?: string;
} {
  const cleanFrom = dateFrom?.trim() || undefined;
  const cleanTo = dateTo?.trim() || undefined;

  if (cleanFrom && !isValidIsoDateOnly(cleanFrom)) {
    throw new Error('BAD_REQUEST: Formato de "Fecha desde" inválido. Usa YYYY-MM-DD.');
  }
  if (cleanTo && !isValidIsoDateOnly(cleanTo)) {
    throw new Error('BAD_REQUEST: Formato de "Fecha hasta" inválido. Usa YYYY-MM-DD.');
  }
  if (cleanFrom && cleanTo && cleanFrom > cleanTo) {
    throw new Error('BAD_REQUEST: La fecha desde no puede ser posterior a la fecha hasta.');
  }
  return { dateFrom: cleanFrom, dateTo: cleanTo };
}

function mapIncidentRow(row: IncidentRow): IncidentReportRecord {
  return {
    id: row.id,
    category: row.category,
    riskLevel: row.risk_level,
    title: row.title,
    description: row.description,
    date: row.date,
    time: row.time,
    district: row.district,
    approxLocation: {
      lat: Number(row.approx_lat),
      lng: Number(row.approx_lng),
      address: row.approx_address
    },
    status: row.status,
    isDemo: Boolean(row.is_demo),
    evidenceNote: row.evidence_note ?? undefined,
    falseReportFlags: Number(row.false_report_flags),
    helpfulCount: Number(row.helpful_count),
    reportedByRole: row.reported_by_role,
    source: row.source || 'citizen',
    sourceUrl: row.source_url ?? undefined,
    locationStatus: row.location_status ?? undefined,
    locationConfidence: row.location_confidence ?? undefined,
    locationSource: row.location_source ?? undefined,
    createdAt: row.created_at
  };
}

function mapSocialPostState(status: SocialPostStatus): SocialPostState {
  if (status === 'Verificado') return 'verified';
  if (status === 'Descartado') return 'discarded';
  return 'pending_validation';
}

function mapSocialPostRow(row: SocialPostRow): SocialPostRecord {
  // Note: author_username is intentionally NEVER returned in API DTOs
  const detectedDistrict = row.suggested_district ?? undefined;
  const lat =
    row.latitude !== null && row.latitude !== undefined && Number.isFinite(Number(row.latitude))
      ? Number(row.latitude)
      : null;
  const lng =
    row.longitude !== null && row.longitude !== undefined && Number.isFinite(Number(row.longitude))
      ? Number(row.longitude)
      : null;
  const locationStatus: LocationStatus = row.location_status || 'unknown';
  const locationConfidence: LocationConfidence = row.location_confidence || 'low';
  const locationSource: LocationSource = row.location_source || 'none';

  return {
    id: row.id,
    platform: row.platform,
    source: 'x',
    externalPostId: row.external_post_id,
    postUrl: sanitizeXPostUrl(row.post_url, row.external_post_id),
    text: sanitizeExternalText(row.text, 500),
    publishedAt: row.published_at,
    importedAt: row.imported_at,
    queryUsed: row.query_used,
    status: row.status,
    state: mapSocialPostState(row.status),
    suggestedCategory: row.suggested_category,
    suggestedRiskLevel: row.suggested_risk_level,
    suggestedDistrict: detectedDistrict,
    detectedDistrict: detectedDistrict || 'Sin distrito',
    district: detectedDistrict || 'Sin distrito',
    latitude: lat,
    longitude: lng,
    locationLabel: row.location_label ?? undefined,
    locationConfidence,
    locationStatus,
    locationSource,
    isLimaValidated: Boolean(row.is_lima_validated),
    confirmedLocationDescription: row.confirmed_location_description ?? undefined,
    moderatorId: row.moderator_id ?? undefined,
    moderatorName: row.moderator_name ?? undefined,
    reviewReason: row.review_reason ?? undefined,
    reviewedAt: row.reviewed_at ?? undefined,
    linkedIncidentId: row.linked_incident_id ?? undefined
  };
}

export async function getOrCreateSocialConfig(db: DatabaseAdapter): Promise<SocialSourceConfig> {
  const existing = await db.get<SocialConfigRow>(
    `SELECT * FROM social_configs WHERE id = ?`,
    ['x-default']
  );

  if (existing) {
    const filterDistricts = parseFilterDistricts(existing.filter_districts);
    const filterIncidentTypes = parseFilterIncidentTypes(existing.filter_incident_types);
    const filterLocationRefs = parseFilterLocationRefs(existing.filter_location_refs);
    const additionalKeywords = sanitizeAdditionalKeywords(existing.additional_keywords || '');
    const built = buildXRecentSearchQueries({
      selectedDistricts: filterDistricts,
      incidentTypes: filterIncidentTypes,
      locationReferences: filterLocationRefs,
      additionalKeywords
    });

    return {
      id: existing.id,
      searchQuery: built.preview,
      queryGroups: built.queries,
      retentionDays: Number(existing.retention_days),
      filterDistricts,
      filterIncidentTypes,
      filterLocationRefs,
      additionalKeywords,
      filterDateFrom: existing.filter_date_from ?? undefined,
      filterDateTo: existing.filter_date_to ?? undefined,
      lastSyncAt: existing.last_sync_at ?? undefined,
      lastSyncStatus: existing.last_sync_status ?? 'idle',
      lastSyncMessage: existing.last_sync_message ?? undefined,
      lastImportedCount: Number(existing.last_imported_count || 0),
      updatedAt: existing.updated_at,
      updatedBy: existing.updated_by ?? undefined
    };
  }

  const now = new Date().toISOString();
  const defaultBuilt = buildXRecentSearchQueries();
  await db.execute(
    `INSERT INTO social_configs (
       id, search_query, retention_days, filter_districts, filter_incident_types,
       filter_location_refs, additional_keywords, filter_date_from, filter_date_to,
       last_sync_status, last_imported_count, updated_at
     ) VALUES (?, ?, ?, '[]', '[]', '[]', '', NULL, NULL, ?, ?, ?)`,
    ['x-default', defaultBuilt.preview, Number(process.env.SOCIAL_RETENTION_DAYS || 30), 'idle', 0, now]
  );

  return {
    id: 'x-default',
    searchQuery: defaultBuilt.preview,
    queryGroups: defaultBuilt.queries,
    retentionDays: Number(process.env.SOCIAL_RETENTION_DAYS || 30),
    filterDistricts: [],
    filterIncidentTypes: [],
    filterLocationRefs: [],
    additionalKeywords: '',
    lastSyncStatus: 'idle',
    lastImportedCount: 0,
    updatedAt: now
  };
}

export async function updateSocialConfig(
  db: DatabaseAdapter,
  updates: {
    retentionDays?: number;
    filterDistricts?: string[];
    filterIncidentTypes?: IncidentFilterKey[];
    filterLocationRefs?: LocationReferenceKey[];
    additionalKeywords?: string | null;
    filterDateFrom?: string | null;
    filterDateTo?: string | null;
  },
  actor: AuthenticatedUser
): Promise<SocialSourceConfig> {
  const current = await getOrCreateSocialConfig(db);

  const nextDistricts =
    updates.filterDistricts !== undefined
      ? sanitizeAllowedDistricts(updates.filterDistricts)
      : current.filterDistricts;

  const nextIncidentTypes =
    updates.filterIncidentTypes !== undefined
      ? sanitizeIncidentFilterKeys(updates.filterIncidentTypes)
      : current.filterIncidentTypes;

  const nextLocationRefs =
    updates.filterLocationRefs !== undefined
      ? sanitizeLocationRefKeys(updates.filterLocationRefs)
      : current.filterLocationRefs;

  const nextAdditionalKeywords =
    updates.additionalKeywords === null
      ? ''
      : updates.additionalKeywords !== undefined
      ? sanitizeAdditionalKeywords(updates.additionalKeywords)
      : current.additionalKeywords;

  const rawFrom =
    updates.filterDateFrom === null
      ? undefined
      : updates.filterDateFrom !== undefined
      ? updates.filterDateFrom
      : current.filterDateFrom;
  const rawTo =
    updates.filterDateTo === null
      ? undefined
      : updates.filterDateTo !== undefined
      ? updates.filterDateTo
      : current.filterDateTo;

  const validatedDates = validateDateRange(rawFrom, rawTo);

  // Build final query exclusively on backend from structured filter selections (never persist final query as base)
  const built = buildXRecentSearchQueries({
    selectedDistricts: nextDistricts,
    incidentTypes: nextIncidentTypes,
    locationReferences: nextLocationRefs,
    additionalKeywords: nextAdditionalKeywords
  });

  const nextRetention =
    typeof updates.retentionDays === 'number' && Number.isFinite(updates.retentionDays)
      ? Math.max(1, Math.min(365, Math.floor(updates.retentionDays)))
      : current.retentionDays;
  const now = new Date().toISOString();

  await db.execute(
    `UPDATE social_configs
     SET search_query = ?, retention_days = ?, filter_districts = ?,
         filter_incident_types = ?, filter_location_refs = ?, additional_keywords = ?,
         filter_date_from = ?, filter_date_to = ?, updated_at = ?, updated_by = ?
     WHERE id = ?`,
    [
      built.preview,
      nextRetention,
      JSON.stringify(nextDistricts),
      JSON.stringify(nextIncidentTypes),
      JSON.stringify(nextLocationRefs),
      nextAdditionalKeywords,
      validatedDates.dateFrom ?? null,
      validatedDates.dateTo ?? null,
      now,
      actor.name,
      'x-default'
    ]
  );

  await recordAuditLog(db, {
    actionType: 'social_query_updated',
    actorId: actor.uid,
    actorName: actor.name,
    actorRole: actor.role,
    targetType: 'social_config',
    targetId: 'x-default',
    details: `Filtros actualizados (tipos: ${nextIncidentTypes.length > 0 ? nextIncidentTypes.join(', ') : 'Todos'}, ubicación: ${nextLocationRefs.length > 0 ? nextLocationRefs.join(', ') : 'Cualquiera'}, distritos: ${nextDistricts.length > 0 ? nextDistricts.join(', ') : 'Todos'}, adicionales: "${nextAdditionalKeywords || '—'}", fechas: ${validatedDates.dateFrom || '—'} a ${validatedDates.dateTo || '—'}). Grupos X: ${built.queries.length}, retención: ${nextRetention} días.`
  });

  return getOrCreateSocialConfig(db);
}

export async function updateSyncMetadata(
  db: DatabaseAdapter,
  meta: {
    lastSyncAt: string;
    lastSyncStatus: 'success' | 'error';
    lastSyncMessage: string;
    lastImportedCount: number;
  }
): Promise<void> {
  await getOrCreateSocialConfig(db);
  if (meta.lastSyncStatus === 'success') {
    await db.execute(
      `UPDATE social_configs
       SET last_sync_at = ?, last_sync_status = ?, last_sync_message = ?, last_imported_count = ?, updated_at = ?
       WHERE id = ?`,
      [
        meta.lastSyncAt,
        meta.lastSyncStatus,
        meta.lastSyncMessage,
        meta.lastImportedCount,
        meta.lastSyncAt,
        'x-default'
      ]
    );
    return;
  }

  await db.execute(
    `UPDATE social_configs
     SET last_sync_status = ?, last_sync_message = ?, last_imported_count = ?, updated_at = ?
     WHERE id = ?`,
    [
      meta.lastSyncStatus,
      meta.lastSyncMessage,
      meta.lastImportedCount,
      meta.lastSyncAt,
      'x-default'
    ]
  );
}

export interface EvaluatedSocialPostInput {
  platform: 'x';
  externalPostId: string;
  postUrl: string;
  text: string;
  publishedAt: string;
  queryUsed: string;
  suggestedCategory: IncidentCategory;
  suggestedRiskLevel: RiskLevel;
  suggestedDistrict?: string;
  latitude?: number | null;
  longitude?: number | null;
  locationLabel?: string | null;
  locationConfidence?: LocationConfidence;
  locationStatus?: LocationStatus;
  locationSource?: LocationSource;
  isLimaValidated?: boolean;
  status?: SocialPostStatus;
  reviewReason?: string;
}

/**
 * Inserts a batch of normalized & validated X posts while deduplicating by external_post_id.
 * Accepted posts start as "Pendiente de validación"; auto-rejected posts are saved as "Descartado"
 * with their explicit discard reason so moderators can audit them without polluting pending posts.
 */
export async function insertSocialPostsDeduped(
  db: DatabaseAdapter,
  posts: EvaluatedSocialPostInput[]
): Promise<{
  imported: SocialPostRecord[];
  discarded: SocialPostRecord[];
  duplicatesSkipped: number;
}> {
  const imported: SocialPostRecord[] = [];
  const discarded: SocialPostRecord[] = [];
  let duplicatesSkipped = 0;

  for (const post of posts) {
    const existing = await db.get<{ id: string }>(
      `SELECT id FROM social_posts WHERE external_post_id = ?`,
      [post.externalPostId]
    );

    if (existing) {
      duplicatesSkipped += 1;
      continue;
    }

    const id = `SOC-X-${crypto.randomUUID().slice(0, 8)}`;
    const importedAt = new Date().toISOString();
    const safeText = sanitizeExternalText(post.text, 500);
    const safeUrl = sanitizeXPostUrl(post.postUrl, post.externalPostId);
    const status: SocialPostStatus = post.status || 'Pendiente de validación';
    const isDiscarded = status === 'Descartado';
    const safeReason = post.reviewReason
      ? sanitizeExternalText(post.reviewReason, 240)
      : undefined;
    const moderatorName = isDiscarded ? 'Filtro automático Lima Metropolitana' : null;
    const reviewedAt = isDiscarded ? importedAt : null;
    const districtValue = post.suggestedDistrict || (isDiscarded ? 'Sin distrito' : null);

    const latValue =
      typeof post.latitude === 'number' && Number.isFinite(post.latitude)
        ? Number(post.latitude.toFixed(5))
        : null;
    const lngValue =
      typeof post.longitude === 'number' && Number.isFinite(post.longitude)
        ? Number(post.longitude.toFixed(5))
        : null;
    const safeLabel = post.locationLabel
      ? sanitizeExternalText(post.locationLabel, 200)
      : null;
    const locationConfidence: LocationConfidence = post.locationConfidence || 'low';
    const locationStatus: LocationStatus = post.locationStatus || 'unknown';
    const locationSource: LocationSource = post.locationSource || 'none';
    const isLimaValidated = Boolean(post.isLimaValidated && !isDiscarded);

    const result = await db.execute(
      `INSERT INTO social_posts (
        id, platform, external_post_id, post_url, text, published_at, imported_at,
        author_username, query_used, status, suggested_category, suggested_risk_level,
        suggested_district, latitude, longitude, location_label, location_confidence,
        location_status, location_source, is_lima_validated,
        moderator_name, review_reason, reviewed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(external_post_id) DO NOTHING`,
      [
        id,
        'x',
        post.externalPostId,
        safeUrl,
        safeText,
        post.publishedAt,
        importedAt,
        post.queryUsed,
        status,
        post.suggestedCategory,
        post.suggestedRiskLevel,
        districtValue,
        latValue,
        lngValue,
        safeLabel,
        locationConfidence,
        locationStatus,
        locationSource,
        isLimaValidated ? 1 : 0,
        moderatorName,
        safeReason ?? null,
        reviewedAt
      ]
    );

    if (result.changes === 0) {
      duplicatesSkipped += 1;
      continue;
    }

    const record: SocialPostRecord = {
      id,
      platform: 'x',
      source: 'x',
      externalPostId: post.externalPostId,
      postUrl: safeUrl,
      text: safeText,
      publishedAt: post.publishedAt,
      importedAt,
      queryUsed: post.queryUsed,
      status,
      state: mapSocialPostState(status),
      suggestedCategory: post.suggestedCategory,
      suggestedRiskLevel: post.suggestedRiskLevel,
      suggestedDistrict: districtValue ?? undefined,
      detectedDistrict: districtValue ?? 'Sin distrito',
      district: districtValue ?? 'Sin distrito',
      latitude: latValue,
      longitude: lngValue,
      locationLabel: safeLabel ?? undefined,
      locationConfidence,
      locationStatus,
      locationSource,
      isLimaValidated,
      moderatorName: moderatorName ?? undefined,
      reviewReason: safeReason,
      reviewedAt: reviewedAt ?? undefined
    };

    if (isDiscarded) {
      discarded.push(record);
    } else {
      imported.push(record);
    }
  }

  return { imported, discarded, duplicatesSkipped };
}

export interface ListSocialPostsFilter {
  status?: SocialPostStatus;
  districts?: string[];
  incidentTypes?: IncidentFilterKey[];
  locationRefs?: LocationReferenceKey[];
  dateFrom?: string;
  dateTo?: string;
}

export async function listSocialPosts(
  db: DatabaseAdapter,
  filterOrStatus?: SocialPostStatus | ListSocialPostsFilter
): Promise<SocialPostRecord[]> {
  const filters: ListSocialPostsFilter =
    typeof filterOrStatus === 'string'
      ? { status: filterOrStatus }
      : filterOrStatus || {};

  const { dateFrom, dateTo } = validateDateRange(filters.dateFrom, filters.dateTo);

  const conditions: string[] = [];
  const params: Array<string> = [];

  if (filters.status) {
    conditions.push(`status = ?`);
    params.push(filters.status);
  }

  if (filters.districts && filters.districts.length > 0) {
    const includeNoDistrict = filters.districts.includes('Sin distrito');
    const allowedDistricts = sanitizeAllowedDistricts(filters.districts);
    const districtClauses: string[] = [];

    if (allowedDistricts.length > 0) {
      const placeholders = allowedDistricts.map(() => '?').join(', ');
      districtClauses.push(`suggested_district IN (${placeholders})`);
      params.push(...allowedDistricts);
    }

    if (includeNoDistrict) {
      // "Sin distrito" is strictly a discarded-only category, never eligible for pending/verified
      districtClauses.push(
        `((suggested_district IS NULL OR suggested_district = 'Sin distrito') AND status = 'Descartado')`
      );
    }

    if (districtClauses.length > 0) {
      conditions.push(`(${districtClauses.join(' OR ')})`);
    }
  }

  if (dateFrom) {
    conditions.push(`published_at >= ?`);
    params.push(`${dateFrom}T00:00:00.000Z`);
  }

  if (dateTo) {
    conditions.push(`published_at <= ?`);
    params.push(`${dateTo}T23:59:59.999Z`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const orderClause = filters.status ? 'ORDER BY published_at DESC' : 'ORDER BY imported_at DESC, published_at DESC';

  // Strictly select safe columns; omit author_username
  const sql = `SELECT id, platform, external_post_id, post_url, text, published_at, imported_at,
            query_used, status, suggested_category, suggested_risk_level, suggested_district,
            latitude, longitude, location_label, location_confidence, location_status,
            location_source, is_lima_validated, confirmed_location_description,
            moderator_id, moderator_name, review_reason, reviewed_at, linked_incident_id
     FROM social_posts
     ${whereClause}
     ${orderClause}`;

  const rows = await db.query<SocialPostRow>(sql, params);
  let posts = rows.map(mapSocialPostRow);

  const selectedIncidentTypes = sanitizeIncidentFilterKeys(filters.incidentTypes);
  if (selectedIncidentTypes.length > 0) {
    posts = posts.filter(p =>
      matchesIncidentFilterKeys(p.text, selectedIncidentTypes, p.suggestedCategory)
    );
  }

  const selectedLocationRefs = sanitizeLocationRefKeys(filters.locationRefs);
  if (selectedLocationRefs.length > 0) {
    posts = posts.filter(p => matchesLocationReferences(p.text, selectedLocationRefs));
  }

  return posts;
}

export async function getSocialPostStats(
  db: DatabaseAdapter
): Promise<{ total: number; pending: number; verified: number; discarded: number }> {
  const rows = await db.query<{ status: SocialPostStatus; cnt: number | string }>(
    `SELECT status, COUNT(*) as cnt FROM social_posts GROUP BY status`
  );
  const counts = { total: 0, pending: 0, verified: 0, discarded: 0 };
  for (const r of rows) {
    const n = Number(r.cnt);
    counts.total += n;
    if (r.status === 'Pendiente de validación') counts.pending = n;
    if (r.status === 'Verificado') counts.verified = n;
    if (r.status === 'Descartado') counts.discarded = n;
  }
  return counts;
}

export async function listIncidents(
  db: DatabaseAdapter,
  options: { includeUnverifiedX?: boolean } = {}
): Promise<IncidentReportRecord[]> {
  const sql = options.includeUnverifiedX
    ? `SELECT * FROM incidents ORDER BY created_at DESC`
    : `SELECT * FROM incidents
       WHERE status != 'Descartado'
         AND (source != 'x' OR status = 'Verificado')
       ORDER BY created_at DESC`;

  const rows = await db.query<IncidentRow>(sql);
  return rows.map(mapIncidentRow);
}

export async function createIncident(
  db: DatabaseAdapter,
  input: {
    category: IncidentCategory;
    riskLevel: RiskLevel;
    title: string;
    description: string;
    date: string;
    time: string;
    district: string;
    approxLocation: { lat: number; lng: number; address: string };
    status?: ReportStatus;
    evidenceNote?: string;
    reportedByRole?: IncidentReportRecord['reportedByRole'];
    source?: 'citizen' | 'x';
    sourceUrl?: string;
    locationStatus?: LocationStatus;
    locationConfidence?: LocationConfidence;
    locationSource?: LocationSource;
    isDemo?: boolean;
  }
): Promise<IncidentReportRecord> {
  const id = `VIG-${new Date().getFullYear()}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
  const createdAt = new Date().toISOString();
  const initialStatus: ReportStatus = input.status || 'Pendiente de validación';
  const source = input.source || 'citizen';

  // For X-sourced / moderator-confirmed reports, strictly obfuscate 200-500m and label "Ubicación aproximada"
  let lat: number;
  let lng: number;
  let address: string;

  if (source === 'x' || input.locationStatus === 'moderator_confirmed') {
    const obfuscated = obfuscateCoordinatesForPublicMap(
      input.approxLocation.lat,
      input.approxLocation.lng
    );
    lat = obfuscated.lat;
    lng = obfuscated.lng;
    address = sanitizePublicLocationLabel(input.approxLocation.address, input.district);
  } else {
    const jitterLat = (Math.random() - 0.5) * 0.0012;
    const jitterLng = (Math.random() - 0.5) * 0.0012;
    lat = Number((input.approxLocation.lat + jitterLat).toFixed(5));
    lng = Number((input.approxLocation.lng + jitterLng).toFixed(5));
    address = sanitizeExternalText(
      input.approxLocation.address || `Ubicación aproximada en ${input.district}`,
      180
    );
  }

  const safeTitle = sanitizeExternalText(input.title, 120);
  const safeDescription = sanitizeExternalText(input.description, 500);
  const safeEvidence = input.evidenceNote
    ? sanitizeExternalText(input.evidenceNote, 300)
    : undefined;

  await db.execute(
    `INSERT INTO incidents (
      id, category, risk_level, title, description, date, time, district,
      approx_lat, approx_lng, approx_address, status, is_demo, evidence_note,
      false_report_flags, helpful_count, reported_by_role, source, source_url,
      location_status, location_confidence, location_source, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.category,
      input.riskLevel,
      safeTitle,
      safeDescription,
      input.date,
      input.time,
      input.district,
      lat,
      lng,
      address,
      initialStatus,
      input.isDemo ? 1 : 0,
      safeEvidence ?? null,
      input.reportedByRole || 'Ciudadano',
      source,
      input.sourceUrl ?? null,
      input.locationStatus ?? null,
      input.locationConfidence ?? null,
      input.locationSource ?? null,
      createdAt
    ]
  );

  return {
    id,
    category: input.category,
    riskLevel: input.riskLevel,
    title: safeTitle,
    description: safeDescription,
    date: input.date,
    time: input.time,
    district: input.district,
    approxLocation: { lat, lng, address },
    status: initialStatus,
    isDemo: Boolean(input.isDemo),
    evidenceNote: safeEvidence,
    falseReportFlags: 0,
    helpfulCount: 1,
    reportedByRole: input.reportedByRole || 'Ciudadano',
    source,
    sourceUrl: input.sourceUrl,
    locationStatus: input.locationStatus,
    locationConfidence: input.locationConfidence,
    locationSource: input.locationSource,
    createdAt
  };
}

export async function reviewIncident(
  db: DatabaseAdapter,
  incidentId: string,
  status: 'Verificado' | 'Descartado',
  moderator: AuthenticatedUser,
  reason?: string
): Promise<IncidentReportRecord | null> {
  const existing = await db.get<IncidentRow>(`SELECT * FROM incidents WHERE id = ?`, [incidentId]);
  if (!existing) return null;

  await db.execute(`UPDATE incidents SET status = ? WHERE id = ?`, [status, incidentId]);

  await recordAuditLog(db, {
    actionType: status === 'Verificado' ? 'incident_verified' : 'incident_discarded',
    actorId: moderator.uid,
    actorName: moderator.name,
    actorRole: moderator.role,
    targetType: 'incident',
    targetId: incidentId,
    details: `${status}${reason ? `: ${sanitizeExternalText(reason, 200)}` : ''}`
  });

  const updated = await db.get<IncidentRow>(`SELECT * FROM incidents WHERE id = ?`, [incidentId]);
  return updated ? mapIncidentRow(updated) : null;
}

export interface ReviewSocialPostPayload {
  action: 'approve_and_publish' | 'save_for_review' | 'create_report' | 'link_incident' | 'discard';
  reviewReason?: string;
  // Geolocation & report fields
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
  // Field when action === 'link_incident'
  linkedIncidentId?: string;
}

export async function reviewSocialPost(
  db: DatabaseAdapter,
  postId: string,
  payload: ReviewSocialPostPayload,
  moderator: AuthenticatedUser
): Promise<{
  post: SocialPostRecord;
  createdIncident?: IncidentReportRecord;
}> {
  const row = await db.get<SocialPostRow>(
    `SELECT id, platform, external_post_id, post_url, text, published_at, imported_at,
            query_used, status, suggested_category, suggested_risk_level, suggested_district,
            latitude, longitude, location_label, location_confidence, location_status,
            location_source, is_lima_validated, confirmed_location_description,
            moderator_id, moderator_name, review_reason, reviewed_at, linked_incident_id
     FROM social_posts WHERE id = ?`,
    [postId]
  );

  if (!row) {
    throw new Error('NOT_FOUND: Publicación social no encontrada.');
  }

  const post = mapSocialPostRow(row);
  const now = new Date().toISOString();

  if (payload.action === 'discard') {
    const reason = sanitizeExternalText(
      payload.reviewReason || 'Descartado por moderación: no corresponde a incidente verificable.',
      240
    );

    await db.execute(
      `UPDATE social_posts
       SET status = 'Descartado', moderator_id = ?, moderator_name = ?, review_reason = ?, reviewed_at = ?
       WHERE id = ?`,
      [moderator.uid, moderator.name, reason, now, postId]
    );

    await recordAuditLog(db, {
      actionType: 'social_post_discarded',
      actorId: moderator.uid,
      actorName: moderator.name,
      actorRole: moderator.role,
      targetType: 'social_post',
      targetId: postId,
      details: `Publicación X (${post.externalPostId}) descartada. Motivo: ${reason}`
    });

    return {
      post: {
        ...post,
        status: 'Descartado',
        state: 'discarded',
        moderatorId: moderator.uid,
        moderatorName: moderator.name,
        reviewReason: reason,
        reviewedAt: now
      }
    };
  }

  if (payload.action === 'link_incident') {
    if (!payload.linkedIncidentId) {
      throw new Error('BAD_REQUEST: Debes seleccionar un reporte existente para vincular.');
    }

    const incident = await db.get<IncidentRow>(`SELECT * FROM incidents WHERE id = ?`, [
      payload.linkedIncidentId
    ]);
    if (!incident) {
      throw new Error('NOT_FOUND: El reporte de incidente seleccionado no existe.');
    }

    const reason = sanitizeExternalText(
      payload.reviewReason || `Vinculado al reporte ${payload.linkedIncidentId}`,
      240
    );

    await db.execute(
      `UPDATE social_posts
       SET status = 'Verificado', moderator_id = ?, moderator_name = ?, review_reason = ?, reviewed_at = ?, linked_incident_id = ?
       WHERE id = ?`,
      [moderator.uid, moderator.name, reason, now, payload.linkedIncidentId, postId]
    );

    await recordAuditLog(db, {
      actionType: 'social_post_linked',
      actorId: moderator.uid,
      actorName: moderator.name,
      actorRole: moderator.role,
      targetType: 'social_post',
      targetId: postId,
      details: `Publicación X (${post.externalPostId}) vinculada al incidente ${payload.linkedIncidentId}.`
    });

    return {
      post: {
        ...post,
        status: 'Verificado',
        state: 'verified',
        moderatorId: moderator.uid,
        moderatorName: moderator.name,
        reviewReason: reason,
        reviewedAt: now,
        linkedIncidentId: payload.linkedIncidentId
      }
    };
  }

  if (post.status === 'Descartado') {
    throw new Error(
      'BAD_REQUEST: No se puede aprobar ni crear un reporte desde una publicación descartada.'
    );
  }

  // Normalize canonical district from payload or post (explicit payload.district required for publish/create)
  const rawDistrict = (
    payload.action === 'save_for_review'
      ? payload.district || post.suggestedDistrict || ''
      : payload.district || ''
  ).trim();
  const canonicalDistrict = sanitizeAllowedDistricts([rawDistrict])[0] || '';

  if (payload.action === 'save_for_review') {
    if (rawDistrict && !canonicalDistrict) {
      throw new Error(
        'BAD_REQUEST: El distrito debe pertenecer a la lista permitida de Lima Metropolitana.'
      );
    }

    const targetDistrict = canonicalDistrict || post.suggestedDistrict || 'Sin distrito';
    const reqLat = payload.latitude ?? payload.approxLat;
    const reqLng = payload.longitude ?? payload.approxLng;
    const hasCustomCoords =
      typeof reqLat === 'number' &&
      Number.isFinite(reqLat) &&
      typeof reqLng === 'number' &&
      Number.isFinite(reqLng);

    if (hasCustomCoords && !isWithinLimaMetroBounds(reqLat!, reqLng!)) {
      throw new Error(
        'BAD_REQUEST: Las coordenadas seleccionadas están fuera de Lima Metropolitana, Perú.'
      );
    }

    const nextLat = hasCustomCoords ? Number(reqLat!.toFixed(5)) : post.latitude ?? null;
    const nextLng = hasCustomCoords ? Number(reqLng!.toFixed(5)) : post.longitude ?? null;
    const safeDesc = payload.confirmedLocationDescription
      ? sanitizeExternalText(payload.confirmedLocationDescription, 220)
      : post.confirmedLocationDescription;
    const safeLabel = payload.locationLabel
      ? sanitizeExternalText(payload.locationLabel, 200)
      : post.locationLabel;

    const nextStatus: LocationStatus =
      nextLat !== null && nextLng !== null && safeDesc
        ? 'moderator_confirmed'
        : post.locationStatus;
    const nextSource: LocationSource = payload.movedManually
      ? 'moderator_manual'
      : post.locationSource;
    const nextConfidence: LocationConfidence =
      nextLat !== null && nextLng !== null ? 'high' : post.locationConfidence;

    await db.execute(
      `UPDATE social_posts
       SET suggested_district = ?, latitude = ?, longitude = ?, location_label = ?,
           location_confidence = ?, location_status = ?, location_source = ?,
           is_lima_validated = ?, confirmed_location_description = ?,
           moderator_id = ?, moderator_name = ?, reviewed_at = ?
       WHERE id = ?`,
      [
        targetDistrict === 'Sin distrito' ? null : targetDistrict,
        nextLat,
        nextLng,
        safeLabel ?? null,
        nextConfidence,
        nextStatus,
        nextSource,
        canonicalDistrict ? 1 : post.isLimaValidated ? 1 : 0,
        safeDesc ?? null,
        moderator.uid,
        moderator.name,
        now,
        postId
      ]
    );

    await recordAuditLog(db, {
      actionType: 'social_post_saved',
      actorId: moderator.uid,
      actorName: moderator.name,
      actorRole: moderator.role,
      targetType: 'social_post',
      targetId: postId,
      details: `Publicación X (${post.externalPostId}) guardada para revisión posterior en ${targetDistrict} (sin publicar en mapa).`
    });

    return {
      post: {
        ...post,
        status: 'Pendiente de validación',
        state: 'pending_validation',
        suggestedDistrict: targetDistrict === 'Sin distrito' ? undefined : targetDistrict,
        detectedDistrict: targetDistrict,
        district: targetDistrict,
        latitude: nextLat,
        longitude: nextLng,
        locationLabel: safeLabel,
        locationConfidence: nextConfidence,
        locationStatus: nextStatus,
        locationSource: nextSource,
        isLimaValidated: Boolean(canonicalDistrict || post.isLimaValidated),
        confirmedLocationDescription: safeDesc,
        moderatorId: moderator.uid,
        moderatorName: moderator.name,
        reviewedAt: now
      }
    };
  }

  // Approve & publish (direct verified map pin with 200-500m obfuscation) OR legacy create_report (pending verification)
  if (!canonicalDistrict || !ALLOWED_SOCIAL_DISTRICT_SET.has(canonicalDistrict)) {
    throw new Error(
      'BAD_REQUEST: El moderador debe confirmar un distrito permitido de Lima Metropolitana antes de crear el reporte.'
    );
  }

  const reqLat = payload.latitude ?? payload.approxLat ?? post.latitude ?? undefined;
  const reqLng = payload.longitude ?? payload.approxLng ?? post.longitude ?? undefined;

  if (payload.action === 'approve_and_publish') {
    if (
      typeof reqLat !== 'number' ||
      !Number.isFinite(reqLat) ||
      typeof reqLng !== 'number' ||
      !Number.isFinite(reqLng) ||
      !isWithinLimaMetroBounds(reqLat, reqLng)
    ) {
      throw new Error(
        'BAD_REQUEST: Debes fijar un pin válido dentro de Lima Metropolitana en el mapa antes de aprobar y publicar.'
      );
    }

    const confirmedDesc = sanitizeExternalText(
      payload.confirmedLocationDescription || payload.approxAddress || '',
      220
    );
    if (!confirmedDesc || confirmedDesc.length < 4) {
      throw new Error(
        'BAD_REQUEST: La descripción de ubicación confirmada es obligatoria para aprobar y publicar.'
      );
    }

    const publishedDate = new Date(post.publishedAt);
    const validDate = !Number.isNaN(publishedDate.getTime()) ? publishedDate : new Date();
    const dateStr = validDate.toISOString().split('T')[0];
    const timeStr = `${String(validDate.getHours()).padStart(2, '0')}:${String(validDate.getMinutes()).padStart(2, '0')}`;
    const finalSource: LocationSource = payload.movedManually
      ? 'moderator_manual'
      : post.locationSource === 'x_coordinates' || post.locationSource === 'text_geocoded'
      ? post.locationSource
      : 'moderator_manual';

    const createdIncident = await createIncident(db, {
      category: payload.category || post.suggestedCategory,
      riskLevel: payload.riskLevel || post.suggestedRiskLevel,
      title: payload.title || `Alerta ciudadana confirmada en ${canonicalDistrict}`,
      description: payload.description || post.text,
      date: dateStr,
      time: timeStr,
      district: canonicalDistrict,
      approxLocation: {
        lat: reqLat,
        lng: reqLng,
        address: confirmedDesc
      },
      status: 'Verificado',
      evidenceNote: `Fuente externa: X — ${post.postUrl} • Validado por moderación`,
      reportedByRole: 'Ciudadano',
      source: 'x',
      sourceUrl: post.postUrl,
      locationStatus: 'moderator_confirmed',
      locationConfidence: 'high',
      locationSource: finalSource,
      isDemo: false
    });

    const safeLabel = sanitizeExternalText(
      payload.locationLabel || post.locationLabel || confirmedDesc,
      200
    );
    const reason = sanitizeExternalText(
      payload.reviewReason ||
        `Aprobado y publicado (${createdIncident.id}) con ubicación aproximada confirmada.`,
      240
    );

    await db.execute(
      `UPDATE social_posts
       SET status = 'Verificado', suggested_district = ?, latitude = ?, longitude = ?,
           location_label = ?, location_confidence = 'high', location_status = 'moderator_confirmed',
           location_source = ?, is_lima_validated = 1, confirmed_location_description = ?,
           moderator_id = ?, moderator_name = ?, review_reason = ?, reviewed_at = ?, linked_incident_id = ?
       WHERE id = ?`,
      [
        canonicalDistrict,
        Number(reqLat.toFixed(5)),
        Number(reqLng.toFixed(5)),
        safeLabel,
        finalSource,
        confirmedDesc,
        moderator.uid,
        moderator.name,
        reason,
        now,
        createdIncident.id,
        postId
      ]
    );

    await recordAuditLog(db, {
      actionType: 'social_post_approved',
      actorId: moderator.uid,
      actorName: moderator.name,
      actorRole: moderator.role,
      targetType: 'social_post',
      targetId: postId,
      details: `Publicación X (${post.externalPostId}) aprobada y publicada como ${createdIncident.id} en ${canonicalDistrict} (locationStatus=moderator_confirmed, coordenadas ofuscadas 200-500m).`
    });

    return {
      post: {
        ...post,
        status: 'Verificado',
        state: 'verified',
        suggestedDistrict: canonicalDistrict,
        detectedDistrict: canonicalDistrict,
        district: canonicalDistrict,
        latitude: Number(reqLat.toFixed(5)),
        longitude: Number(reqLng.toFixed(5)),
        locationLabel: safeLabel,
        locationConfidence: 'high',
        locationStatus: 'moderator_confirmed',
        locationSource: finalSource,
        isLimaValidated: true,
        confirmedLocationDescription: confirmedDesc,
        moderatorId: moderator.uid,
        moderatorName: moderator.name,
        reviewReason: reason,
        reviewedAt: now,
        linkedIncidentId: createdIncident.id
      },
      createdIncident
    };
  }

  // Legacy 'create_report': requires non-unknown location (or explicit coordinates from moderator)
  if (post.locationStatus === 'unknown' && (reqLat === undefined || reqLng === undefined)) {
    throw new Error(
      'BAD_REQUEST: No hay ubicación suficiente en esta publicación para crear un reporte.'
    );
  }

  const districtCenter =
    DISTRICT_APPROX_CENTERS[canonicalDistrict] || DISTRICT_APPROX_CENTERS['Lima'];
  const approxLat =
    typeof reqLat === 'number' && Number.isFinite(reqLat) ? reqLat : districtCenter.lat;
  const approxLng =
    typeof reqLng === 'number' && Number.isFinite(reqLng) ? reqLng : districtCenter.lng;

  if (!isWithinLimaMetroBounds(approxLat, approxLng)) {
    throw new Error(
      'BAD_REQUEST: Las coordenadas indicadas están fuera de Lima Metropolitana, Perú.'
    );
  }

  const publishedDate = new Date(post.publishedAt);
  const validDate = !Number.isNaN(publishedDate.getTime()) ? publishedDate : new Date();
  const dateStr = validDate.toISOString().split('T')[0];
  const timeStr = `${String(validDate.getHours()).padStart(2, '0')}:${String(validDate.getMinutes()).padStart(2, '0')}`;

  const createdIncident = await createIncident(db, {
    category: payload.category || post.suggestedCategory,
    riskLevel: payload.riskLevel || post.suggestedRiskLevel,
    title: payload.title || `Alerta ciudadana reportada en ${canonicalDistrict}`,
    description: payload.description || post.text,
    date: dateStr,
    time: timeStr,
    district: canonicalDistrict,
    approxLocation: {
      lat: approxLat,
      lng: approxLng,
      address:
        payload.confirmedLocationDescription ||
        payload.approxAddress ||
        `Ubicación aproximada confirmada en ${canonicalDistrict}`
    },
    evidenceNote: `Fuente externa: X — ${post.postUrl}`,
    reportedByRole: 'Ciudadano',
    source: 'x',
    sourceUrl: post.postUrl,
    locationStatus: 'moderator_confirmed',
    locationConfidence: post.locationConfidence || 'medium',
    locationSource: payload.movedManually ? 'moderator_manual' : post.locationSource || 'moderator_manual',
    isDemo: false
  });

  const reason = sanitizeExternalText(
    payload.reviewReason || `Reporte creado (${createdIncident.id}) en estado Pendiente de validación.`,
    240
  );

  await db.execute(
    `UPDATE social_posts
     SET status = 'Verificado', suggested_district = ?, location_status = 'moderator_confirmed',
         moderator_id = ?, moderator_name = ?, review_reason = ?, reviewed_at = ?, linked_incident_id = ?
     WHERE id = ?`,
    [canonicalDistrict, moderator.uid, moderator.name, reason, now, createdIncident.id, postId]
  );

  await recordAuditLog(db, {
    actionType: 'social_post_approved',
    actorId: moderator.uid,
    actorName: moderator.name,
    actorRole: moderator.role,
    targetType: 'social_post',
    targetId: postId,
    details: `Publicación X (${post.externalPostId}) convertida en reporte ${createdIncident.id} (Pendiente de validación) en ${canonicalDistrict}.`
  });

  return {
    post: {
      ...post,
      status: 'Verificado',
      state: 'verified',
      suggestedDistrict: canonicalDistrict,
      detectedDistrict: canonicalDistrict,
      district: canonicalDistrict,
      locationStatus: 'moderator_confirmed',
      moderatorId: moderator.uid,
      moderatorName: moderator.name,
      reviewReason: reason,
      reviewedAt: now,
      linkedIncidentId: createdIncident.id
    },
    createdIncident
  };
}
