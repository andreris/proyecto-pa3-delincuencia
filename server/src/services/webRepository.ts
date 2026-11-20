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
  RiskLevel,
  SocialPostState,
  SocialPostStatus,
  WebNewsRecord,
  WebSourceConfig
} from '../types.js';
import {
  ALLOWED_SOCIAL_DISTRICT_SET,
  canonicalizeWebUrl,
  matchesAdditionalKeywords,
  matchesIncidentFilterKeys,
  matchesLocationReferences,
  sanitizeAdditionalKeywords,
  sanitizeAllowedDistricts,
  sanitizeExternalText,
  sanitizeIncidentFilterKeys,
  sanitizeLocationRefKeys,
  sanitizeOptionalImageUrl
} from '../utils/sanitize.js';
import { isWithinLimaMetroBounds } from './geocoderService.js';
import { recordAuditLog } from './auditService.js';
import { createIncident, validateDateRange } from './socialRepository.js';

export const DEFAULT_RPP_RSS_URL = 'https://rpp.pe/rss';

export function getConfiguredRppRssUrl(): string {
  const raw = (process.env.RPP_RSS_URL || DEFAULT_RPP_RSS_URL).trim();
  return canonicalizeWebUrl(raw) || DEFAULT_RPP_RSS_URL;
}

interface WebNewsRow {
  id: string;
  source: 'rpp';
  source_name: 'RPP Noticias';
  external_id: string;
  title: string;
  excerpt: string;
  published_at: string;
  original_url: string;
  image_url: string | null;
  imported_at: string;
  status: SocialPostStatus;
  suggested_category: IncidentCategory;
  suggested_risk_level: RiskLevel;
  district: string | null;
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

interface WebConfigRow {
  id: string;
  source: 'rpp';
  source_name: 'RPP Noticias';
  rss_url: string;
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

function mapState(status: SocialPostStatus): SocialPostState {
  if (status === 'Verificado') return 'verified';
  if (status === 'Descartado') return 'discarded';
  return 'pending_validation';
}

function mapWebNewsRow(row: WebNewsRow): WebNewsRecord {
  const lat =
    row.latitude !== null && row.latitude !== undefined && Number.isFinite(Number(row.latitude))
      ? Number(row.latitude)
      : null;
  const lng =
    row.longitude !== null && row.longitude !== undefined && Number.isFinite(Number(row.longitude))
      ? Number(row.longitude)
      : null;

  const detectedDistrict = row.district || 'Sin distrito';

  return {
    id: row.id,
    source: 'rpp',
    sourceName: 'RPP Noticias',
    externalId: row.external_id,
    title: sanitizeExternalText(row.title, 220),
    excerpt: sanitizeExternalText(row.excerpt, 360),
    publishedAt: row.published_at,
    originalUrl: canonicalizeWebUrl(row.original_url) || row.original_url,
    imageUrl: sanitizeOptionalImageUrl(row.image_url || undefined),
    importedAt: row.imported_at,
    status: row.status,
    state: mapState(row.status),
    suggestedCategory: row.suggested_category,
    suggestedRiskLevel: row.suggested_risk_level,
    district: row.district ?? undefined,
    detectedDistrict,
    latitude: lat,
    longitude: lng,
    locationLabel: row.location_label ?? undefined,
    locationConfidence: row.location_confidence || 'low',
    locationStatus: row.location_status || 'unknown',
    locationSource: row.location_source || 'none',
    isLimaValidated: Boolean(row.is_lima_validated),
    confirmedLocationDescription: row.confirmed_location_description ?? undefined,
    moderatorId: row.moderator_id ?? undefined,
    moderatorName: row.moderator_name ?? undefined,
    reviewReason: row.review_reason ?? undefined,
    reviewedAt: row.reviewed_at ?? undefined,
    linkedIncidentId: row.linked_incident_id ?? undefined
  };
}

export async function getOrCreateWebConfig(db: DatabaseAdapter): Promise<WebSourceConfig> {
  const rssUrl = getConfiguredRppRssUrl();
  const existing = await db.get<WebConfigRow>(
    `SELECT * FROM web_configs WHERE id = ?`,
    ['rpp-default']
  );

  if (existing) {
    return {
      id: existing.id,
      source: 'rpp',
      sourceName: 'RPP Noticias',
      rssUrl,
      filterDistricts: parseFilterDistricts(existing.filter_districts),
      filterIncidentTypes: parseFilterIncidentTypes(existing.filter_incident_types),
      filterLocationRefs: parseFilterLocationRefs(existing.filter_location_refs),
      additionalKeywords: sanitizeAdditionalKeywords(existing.additional_keywords || ''),
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
  await db.execute(
    `INSERT INTO web_configs (
      id, source, source_name, rss_url, filter_districts, filter_incident_types,
      filter_location_refs, additional_keywords, filter_date_from, filter_date_to,
      last_sync_status, last_imported_count, updated_at
    ) VALUES (?, ?, ?, ?, '[]', '[]', '[]', '', NULL, NULL, ?, ?, ?)`,
    ['rpp-default', 'rpp', 'RPP Noticias', rssUrl, 'idle', 0, now]
  );

  return {
    id: 'rpp-default',
    source: 'rpp',
    sourceName: 'RPP Noticias',
    rssUrl,
    filterDistricts: [],
    filterIncidentTypes: [],
    filterLocationRefs: [],
    additionalKeywords: '',
    lastSyncStatus: 'idle',
    lastImportedCount: 0,
    updatedAt: now
  };
}

export async function updateWebConfig(
  db: DatabaseAdapter,
  updates: {
    filterDistricts?: string[];
    filterIncidentTypes?: IncidentFilterKey[];
    filterLocationRefs?: LocationReferenceKey[];
    additionalKeywords?: string | null;
    filterDateFrom?: string | null;
    filterDateTo?: string | null;
  },
  actor: AuthenticatedUser
): Promise<WebSourceConfig> {
  const current = await getOrCreateWebConfig(db);

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
  const now = new Date().toISOString();

  await db.execute(
    `UPDATE web_configs
     SET filter_districts = ?, filter_incident_types = ?, filter_location_refs = ?,
         additional_keywords = ?, filter_date_from = ?, filter_date_to = ?,
         updated_at = ?, updated_by = ?
     WHERE id = ?`,
    [
      JSON.stringify(nextDistricts),
      JSON.stringify(nextIncidentTypes),
      JSON.stringify(nextLocationRefs),
      nextAdditionalKeywords,
      validatedDates.dateFrom ?? null,
      validatedDates.dateTo ?? null,
      now,
      actor.name,
      'rpp-default'
    ]
  );

  await recordAuditLog(db, {
    actionType: 'web_filters_updated',
    actorId: actor.uid,
    actorName: actor.name,
    actorRole: actor.role,
    targetType: 'web_config',
    targetId: 'rpp-default',
    details: `Filtros web (RPP Noticias) actualizados — tipos: ${nextIncidentTypes.length > 0 ? nextIncidentTypes.join(', ') : 'Todos'}, ubicación: ${nextLocationRefs.length > 0 ? nextLocationRefs.join(', ') : 'Cualquiera'}, distritos: ${nextDistricts.length > 0 ? nextDistricts.join(', ') : 'Todos'}, adicionales: "${nextAdditionalKeywords || '—'}", fechas: ${validatedDates.dateFrom || '—'} a ${validatedDates.dateTo || '—'}.`
  });

  return getOrCreateWebConfig(db);
}

export async function updateWebSyncMetadata(
  db: DatabaseAdapter,
  meta: {
    lastSyncAt: string;
    lastSyncStatus: 'success' | 'error';
    lastSyncMessage: string;
    lastImportedCount: number;
  }
): Promise<void> {
  await getOrCreateWebConfig(db);
  if (meta.lastSyncStatus === 'success') {
    await db.execute(
      `UPDATE web_configs
       SET last_sync_at = ?, last_sync_status = ?, last_sync_message = ?, last_imported_count = ?, updated_at = ?
       WHERE id = ?`,
      [
        meta.lastSyncAt,
        meta.lastSyncStatus,
        meta.lastSyncMessage,
        meta.lastImportedCount,
        meta.lastSyncAt,
        'rpp-default'
      ]
    );
    return;
  }

  await db.execute(
    `UPDATE web_configs
     SET last_sync_status = ?, last_sync_message = ?, last_imported_count = ?, updated_at = ?
     WHERE id = ?`,
    [
      meta.lastSyncStatus,
      meta.lastSyncMessage,
      meta.lastImportedCount,
      meta.lastSyncAt,
      'rpp-default'
    ]
  );
}

export async function getExistingWebExternalIds(
  db: DatabaseAdapter,
  externalIds: string[]
): Promise<Set<string>> {
  const uniqueIds = Array.from(new Set(externalIds.filter(Boolean)));
  if (uniqueIds.length === 0) return new Set();
  const placeholders = uniqueIds.map(() => '?').join(', ');
  const rows = await db.query<{ external_id: string }>(
    `SELECT external_id FROM web_news WHERE external_id IN (${placeholders})`,
    uniqueIds
  );
  return new Set(rows.map(r => r.external_id));
}

export interface EvaluatedWebNewsInput {
  externalId: string;
  title: string;
  excerpt: string;
  publishedAt: string;
  originalUrl: string;
  imageUrl?: string;
  suggestedCategory: IncidentCategory;
  suggestedRiskLevel: RiskLevel;
  district?: string;
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

export async function insertWebNewsDeduped(
  db: DatabaseAdapter,
  items: EvaluatedWebNewsInput[]
): Promise<{
  imported: WebNewsRecord[];
  discarded: WebNewsRecord[];
  duplicatesSkipped: number;
}> {
  const imported: WebNewsRecord[] = [];
  const discarded: WebNewsRecord[] = [];
  let duplicatesSkipped = 0;

  for (const item of items) {
    const canonicalUrl = canonicalizeWebUrl(item.originalUrl) || item.externalId;
    const existing = await db.get<{ id: string }>(
      `SELECT id FROM web_news WHERE external_id = ?`,
      [canonicalUrl]
    );
    if (existing) {
      duplicatesSkipped += 1;
      continue;
    }

    const id = `WEB-RPP-${crypto.randomUUID().slice(0, 8)}`;
    const importedAt = new Date().toISOString();
    const safeTitle = sanitizeExternalText(item.title, 220);
    const safeExcerpt = sanitizeExternalText(item.excerpt, 360);
    const safeImage = sanitizeOptionalImageUrl(item.imageUrl);
    const status: SocialPostStatus = item.status || 'Pendiente de validación';
    const isDiscarded = status === 'Descartado';
    const safeReason = item.reviewReason
      ? sanitizeExternalText(item.reviewReason, 240)
      : undefined;
    const moderatorName = isDiscarded ? 'Filtro automático Lima Metropolitana (RSS)' : null;
    const reviewedAt = isDiscarded ? importedAt : null;
    const districtValue =
      item.district && item.district !== 'Sin distrito' ? item.district : null;

    const latValue =
      typeof item.latitude === 'number' && Number.isFinite(item.latitude)
        ? Number(item.latitude.toFixed(5))
        : null;
    const lngValue =
      typeof item.longitude === 'number' && Number.isFinite(item.longitude)
        ? Number(item.longitude.toFixed(5))
        : null;
    const safeLabel = item.locationLabel ? sanitizeExternalText(item.locationLabel, 200) : null;
    const locationConfidence: LocationConfidence = item.locationConfidence || 'low';
    const locationStatus: LocationStatus = item.locationStatus || 'unknown';
    const locationSource: LocationSource = item.locationSource || 'none';
    const isLimaValidated = Boolean(item.isLimaValidated && !isDiscarded);

    const result = await db.execute(
      `INSERT INTO web_news (
        id, source, source_name, external_id, title, excerpt, published_at, original_url,
        image_url, imported_at, status, suggested_category, suggested_risk_level, district,
        latitude, longitude, location_label, location_confidence, location_status,
        location_source, is_lima_validated, moderator_name, review_reason, reviewed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(external_id) DO NOTHING`,
      [
        id,
        'rpp',
        'RPP Noticias',
        canonicalUrl,
        safeTitle,
        safeExcerpt,
        item.publishedAt,
        canonicalUrl,
        safeImage ?? null,
        importedAt,
        status,
        item.suggestedCategory,
        item.suggestedRiskLevel,
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

    const record: WebNewsRecord = {
      id,
      source: 'rpp',
      sourceName: 'RPP Noticias',
      externalId: canonicalUrl,
      title: safeTitle,
      excerpt: safeExcerpt,
      publishedAt: item.publishedAt,
      originalUrl: canonicalUrl,
      imageUrl: safeImage,
      importedAt,
      status,
      state: mapState(status),
      suggestedCategory: item.suggestedCategory,
      suggestedRiskLevel: item.suggestedRiskLevel,
      district: districtValue ?? undefined,
      detectedDistrict: districtValue ?? 'Sin distrito',
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

export interface ListWebNewsFilter {
  status?: SocialPostStatus;
  districts?: string[];
  incidentTypes?: IncidentFilterKey[];
  locationRefs?: LocationReferenceKey[];
  additionalKeywords?: string;
  dateFrom?: string;
  dateTo?: string;
}

export async function listWebNews(
  db: DatabaseAdapter,
  filters: ListWebNewsFilter = {}
): Promise<WebNewsRecord[]> {
  const { dateFrom, dateTo } = validateDateRange(filters.dateFrom, filters.dateTo);
  const conditions: string[] = [];
  const params: string[] = [];

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
      districtClauses.push(`district IN (${placeholders})`);
      params.push(...allowedDistricts);
    }

    if (includeNoDistrict) {
      districtClauses.push(`(district IS NULL OR district = 'Sin distrito')`);
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
  const sql = `SELECT * FROM web_news ${whereClause} ORDER BY published_at DESC, imported_at DESC`;

  const rows = await db.query<WebNewsRow>(sql, params);
  let items = rows.map(mapWebNewsRow);

  const selectedIncidentTypes = sanitizeIncidentFilterKeys(filters.incidentTypes);
  if (selectedIncidentTypes.length > 0) {
    items = items.filter(item =>
      matchesIncidentFilterKeys(
        `${item.title}. ${item.excerpt}`,
        selectedIncidentTypes,
        item.suggestedCategory
      )
    );
  }

  const selectedLocationRefs = sanitizeLocationRefKeys(filters.locationRefs);
  if (selectedLocationRefs.length > 0) {
    items = items.filter(item =>
      matchesLocationReferences(`${item.title}. ${item.excerpt}`, selectedLocationRefs)
    );
  }

  const cleanKeywords = sanitizeAdditionalKeywords(filters.additionalKeywords);
  if (cleanKeywords) {
    items = items.filter(item =>
      matchesAdditionalKeywords(`${item.title}. ${item.excerpt}`, cleanKeywords)
    );
  }

  return items;
}

export async function getWebNewsStats(
  db: DatabaseAdapter
): Promise<{ total: number; pending: number; verified: number; discarded: number }> {
  const rows = await db.query<{ status: SocialPostStatus; cnt: number | string }>(
    `SELECT status, COUNT(*) as cnt FROM web_news GROUP BY status`
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

export interface ReviewWebNewsPayload {
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
  approxLat?: number;
  approxLng?: number;
  approxAddress?: string;
  locationLabel?: string;
  confirmedLocationDescription?: string;
  movedManually?: boolean;
  linkedIncidentId?: string;
}

export async function reviewWebNewsItem(
  db: DatabaseAdapter,
  newsId: string,
  payload: ReviewWebNewsPayload,
  moderator: AuthenticatedUser
): Promise<{
  item: WebNewsRecord;
  createdIncident?: IncidentReportRecord;
}> {
  const row = await db.get<WebNewsRow>(`SELECT * FROM web_news WHERE id = ?`, [newsId]);
  if (!row) {
    throw new Error('NOT_FOUND: Noticia web no encontrada.');
  }

  const item = mapWebNewsRow(row);
  const now = new Date().toISOString();

  if (payload.action === 'discard') {
    const reason = sanitizeExternalText(
      payload.reviewReason || 'Descartado por moderación: no corresponde a incidente en Lima Metropolitana.',
      240
    );

    await db.execute(
      `UPDATE web_news
       SET status = 'Descartado', moderator_id = ?, moderator_name = ?, review_reason = ?, reviewed_at = ?
       WHERE id = ?`,
      [moderator.uid, moderator.name, reason, now, newsId]
    );

    await recordAuditLog(db, {
      actionType: 'web_news_discarded',
      actorId: moderator.uid,
      actorName: moderator.name,
      actorRole: moderator.role,
      targetType: 'web_news',
      targetId: newsId,
      details: `Noticia RPP (${item.originalUrl}) descartada. Motivo: ${reason}`
    });

    return {
      item: {
        ...item,
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

    const incident = await db.get<{ id: string }>(`SELECT id FROM incidents WHERE id = ?`, [
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
      `UPDATE web_news
       SET status = 'Verificado', moderator_id = ?, moderator_name = ?, review_reason = ?, reviewed_at = ?, linked_incident_id = ?
       WHERE id = ?`,
      [moderator.uid, moderator.name, reason, now, payload.linkedIncidentId, newsId]
    );

    await recordAuditLog(db, {
      actionType: 'web_news_linked',
      actorId: moderator.uid,
      actorName: moderator.name,
      actorRole: moderator.role,
      targetType: 'web_news',
      targetId: newsId,
      details: `Noticia RPP (${item.originalUrl}) vinculada al incidente ${payload.linkedIncidentId}.`
    });

    return {
      item: {
        ...item,
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

  if (item.status === 'Descartado') {
    throw new Error(
      'BAD_REQUEST: No se puede aprobar ni modificar una noticia descartada.'
    );
  }

  const isSaveAction =
    payload.action === 'save_for_review' || payload.action === 'save_as_reference';
  const rawDistrict = (
    isSaveAction ? payload.district || item.district || '' : payload.district || ''
  ).trim();
  const canonicalDistrict = sanitizeAllowedDistricts([rawDistrict])[0] || '';

  if (isSaveAction) {
    if (rawDistrict && !canonicalDistrict) {
      throw new Error(
        'BAD_REQUEST: El distrito debe pertenecer a la lista permitida de Lima Metropolitana.'
      );
    }

    const targetDistrict = canonicalDistrict || item.district || 'Sin distrito';
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

    const nextLat = hasCustomCoords ? Number(reqLat!.toFixed(5)) : item.latitude ?? null;
    const nextLng = hasCustomCoords ? Number(reqLng!.toFixed(5)) : item.longitude ?? null;
    const safeDesc = payload.confirmedLocationDescription
      ? sanitizeExternalText(payload.confirmedLocationDescription, 220)
      : item.confirmedLocationDescription;
    const safeLabel = payload.locationLabel
      ? sanitizeExternalText(payload.locationLabel, 200)
      : item.locationLabel;

    const nextStatus: LocationStatus =
      nextLat !== null && nextLng !== null && safeDesc
        ? 'moderator_confirmed'
        : item.locationStatus;
    const nextSource: LocationSource = payload.movedManually
      ? 'moderator_manual'
      : item.locationSource;
    const nextConfidence: LocationConfidence =
      nextLat !== null && nextLng !== null ? 'high' : item.locationConfidence;

    await db.execute(
      `UPDATE web_news
       SET district = ?, latitude = ?, longitude = ?, location_label = ?,
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
        canonicalDistrict || item.isLimaValidated ? 1 : 0,
        safeDesc ?? null,
        moderator.uid,
        moderator.name,
        now,
        newsId
      ]
    );

    await recordAuditLog(db, {
      actionType: 'web_news_saved',
      actorId: moderator.uid,
      actorName: moderator.name,
      actorRole: moderator.role,
      targetType: 'web_news',
      targetId: newsId,
      details: `Noticia RPP (${item.originalUrl}) guardada como referencia en ${targetDistrict} (sin publicar en mapa).`
    });

    return {
      item: {
        ...item,
        status: 'Pendiente de validación',
        state: 'pending_validation',
        district: targetDistrict === 'Sin distrito' ? undefined : targetDistrict,
        detectedDistrict: targetDistrict,
        latitude: nextLat,
        longitude: nextLng,
        locationLabel: safeLabel,
        locationConfidence: nextConfidence,
        locationStatus: nextStatus,
        locationSource: nextSource,
        isLimaValidated: Boolean(canonicalDistrict || item.isLimaValidated),
        confirmedLocationDescription: safeDesc,
        moderatorId: moderator.uid,
        moderatorName: moderator.name,
        reviewedAt: now
      }
    };
  }

  // Approve & publish requires confirmed district, valid Lima coordinates (pin), and description
  if (!canonicalDistrict || !ALLOWED_SOCIAL_DISTRICT_SET.has(canonicalDistrict)) {
    throw new Error(
      'BAD_REQUEST: No hay ubicación específica confirmada. Selecciona un distrito permitido de Lima Metropolitana o guarda la noticia como referencia.'
    );
  }

  const reqLat = payload.latitude ?? payload.approxLat ?? item.latitude ?? undefined;
  const reqLng = payload.longitude ?? payload.approxLng ?? item.longitude ?? undefined;

  if (
    typeof reqLat !== 'number' ||
    !Number.isFinite(reqLat) ||
    typeof reqLng !== 'number' ||
    !Number.isFinite(reqLng) ||
    !isWithinLimaMetroBounds(reqLat, reqLng)
  ) {
    throw new Error(
      'BAD_REQUEST: La noticia no tiene ubicación específica confirmada en el mapa. Fija un pin válido en Lima Metropolitana o guárdala como referencia.'
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

  const publishedDate = new Date(item.publishedAt);
  const validDate = !Number.isNaN(publishedDate.getTime()) ? publishedDate : new Date();
  const dateStr = validDate.toISOString().split('T')[0];
  const timeStr = `${String(validDate.getHours()).padStart(2, '0')}:${String(validDate.getMinutes()).padStart(2, '0')}`;
  const finalSource: LocationSource = payload.movedManually
    ? 'moderator_manual'
    : item.locationSource === 'text_geocoded'
    ? 'text_geocoded'
    : 'moderator_manual';

  const createdIncident = await createIncident(db, {
    category: payload.category || item.suggestedCategory,
    riskLevel: payload.riskLevel || item.suggestedRiskLevel,
    title: payload.title || item.title,
    description: payload.description || item.excerpt,
    date: dateStr,
    time: timeStr,
    district: canonicalDistrict,
    approxLocation: {
      lat: reqLat,
      lng: reqLng,
      address: confirmedDesc
    },
    status: 'Verificado',
    evidenceNote: `Fuente externa: RPP Noticias — ${item.originalUrl} • Validado por moderación`,
    reportedByRole: 'Ciudadano',
    source: 'rpp',
    sourceUrl: item.originalUrl,
    locationStatus: 'moderator_confirmed',
    locationConfidence: 'high',
    locationSource: finalSource,
    isDemo: false
  });

  const safeLabel = sanitizeExternalText(
    payload.locationLabel || item.locationLabel || confirmedDesc,
    200
  );
  const reason = sanitizeExternalText(
    payload.reviewReason ||
      `Aprobado y publicado (${createdIncident.id}) con ubicación aproximada confirmada.`,
    240
  );

  await db.execute(
    `UPDATE web_news
     SET status = 'Verificado', district = ?, latitude = ?, longitude = ?,
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
      newsId
    ]
  );

  await recordAuditLog(db, {
    actionType: 'web_news_approved',
    actorId: moderator.uid,
    actorName: moderator.name,
    actorRole: moderator.role,
    targetType: 'web_news',
    targetId: newsId,
    details: `Noticia RPP (${item.originalUrl}) aprobada y publicada como ${createdIncident.id} en ${canonicalDistrict} (locationStatus=moderator_confirmed, coordenadas ofuscadas 200-500m).`
  });

  return {
    item: {
      ...item,
      status: 'Verificado',
      state: 'verified',
      district: canonicalDistrict,
      detectedDistrict: canonicalDistrict,
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
