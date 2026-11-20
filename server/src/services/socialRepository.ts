import crypto from 'node:crypto';
import { DatabaseAdapter } from '../db/types.js';
import {
  AuthenticatedUser,
  IncidentCategory,
  IncidentReportRecord,
  ReportStatus,
  RiskLevel,
  SocialPostRecord,
  SocialPostStatus,
  SocialSourceConfig
} from '../types.js';
import {
  DISTRICT_APPROX_CENTERS,
  sanitizeExternalText,
  sanitizeXPostUrl
} from '../utils/sanitize.js';
import { recordAuditLog } from './auditService.js';

export const DEFAULT_X_QUERY = 'robo OR asalto OR extorsión OR inseguridad lang:es -is:retweet';

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
  last_sync_at: string | null;
  last_sync_status: 'success' | 'error' | 'idle' | null;
  last_sync_message: string | null;
  last_imported_count: number;
  updated_at: string;
  updated_by: string | null;
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
    createdAt: row.created_at
  };
}

function mapSocialPostRow(row: SocialPostRow): SocialPostRecord {
  // Note: author_username is intentionally NEVER returned in API DTOs
  return {
    id: row.id,
    platform: row.platform,
    externalPostId: row.external_post_id,
    postUrl: sanitizeXPostUrl(row.post_url, row.external_post_id),
    text: sanitizeExternalText(row.text, 500),
    publishedAt: row.published_at,
    importedAt: row.imported_at,
    queryUsed: row.query_used,
    status: row.status,
    suggestedCategory: row.suggested_category,
    suggestedRiskLevel: row.suggested_risk_level,
    suggestedDistrict: row.suggested_district ?? undefined,
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
    return {
      id: existing.id,
      searchQuery: existing.search_query,
      retentionDays: Number(existing.retention_days),
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
    `INSERT INTO social_configs (id, search_query, retention_days, last_sync_status, last_imported_count, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    ['x-default', DEFAULT_X_QUERY, Number(process.env.SOCIAL_RETENTION_DAYS || 30), 'idle', 0, now]
  );

  return {
    id: 'x-default',
    searchQuery: DEFAULT_X_QUERY,
    retentionDays: Number(process.env.SOCIAL_RETENTION_DAYS || 30),
    lastSyncStatus: 'idle',
    lastImportedCount: 0,
    updatedAt: now
  };
}

export async function updateSocialConfig(
  db: DatabaseAdapter,
  updates: { searchQuery?: string; retentionDays?: number },
  actor: AuthenticatedUser
): Promise<SocialSourceConfig> {
  const current = await getOrCreateSocialConfig(db);
  const nextQuery = updates.searchQuery
    ? sanitizeExternalText(updates.searchQuery, 250)
    : current.searchQuery;
  const nextRetention =
    typeof updates.retentionDays === 'number' && Number.isFinite(updates.retentionDays)
      ? Math.max(1, Math.min(365, Math.floor(updates.retentionDays)))
      : current.retentionDays;
  const now = new Date().toISOString();

  await db.execute(
    `UPDATE social_configs
     SET search_query = ?, retention_days = ?, updated_at = ?, updated_by = ?
     WHERE id = ?`,
    [nextQuery, nextRetention, now, actor.name, 'x-default']
  );

  await recordAuditLog(db, {
    actionType: 'social_query_updated',
    actorId: actor.uid,
    actorName: actor.name,
    actorRole: actor.role,
    targetType: 'social_config',
    targetId: 'x-default',
    details: `Consulta actualizada ("${nextQuery}"), retención: ${nextRetention} días.`
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
}

/**
 * Inserts a batch of normalized X posts while deduplicating by external_post_id.
 */
export async function insertSocialPostsDeduped(
  db: DatabaseAdapter,
  posts: Array<Omit<SocialPostRecord, 'id' | 'importedAt' | 'status'>>
): Promise<{ imported: SocialPostRecord[]; duplicatesSkipped: number }> {
  const imported: SocialPostRecord[] = [];
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

    const result = await db.execute(
      `INSERT INTO social_posts (
        id, platform, external_post_id, post_url, text, published_at, imported_at,
        author_username, query_used, status, suggested_category, suggested_risk_level, suggested_district
      ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, 'Pendiente de validación', ?, ?, ?)
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
        post.suggestedCategory,
        post.suggestedRiskLevel,
        post.suggestedDistrict ?? null
      ]
    );

    if (result.changes === 0) {
      duplicatesSkipped += 1;
      continue;
    }

    imported.push({
      id,
      platform: 'x',
      externalPostId: post.externalPostId,
      postUrl: safeUrl,
      text: safeText,
      publishedAt: post.publishedAt,
      importedAt,
      queryUsed: post.queryUsed,
      status: 'Pendiente de validación',
      suggestedCategory: post.suggestedCategory,
      suggestedRiskLevel: post.suggestedRiskLevel,
      suggestedDistrict: post.suggestedDistrict
    });
  }

  return { imported, duplicatesSkipped };
}

export async function listSocialPosts(
  db: DatabaseAdapter,
  status?: SocialPostStatus
): Promise<SocialPostRecord[]> {
  // Strictly select safe columns; omit author_username
  const sql = status
    ? `SELECT id, platform, external_post_id, post_url, text, published_at, imported_at,
              query_used, status, suggested_category, suggested_risk_level, suggested_district,
              moderator_id, moderator_name, review_reason, reviewed_at, linked_incident_id
       FROM social_posts
       WHERE status = ?
       ORDER BY published_at DESC`
    : `SELECT id, platform, external_post_id, post_url, text, published_at, imported_at,
              query_used, status, suggested_category, suggested_risk_level, suggested_district,
              moderator_id, moderator_name, review_reason, reviewed_at, linked_incident_id
       FROM social_posts
       ORDER BY imported_at DESC`;

  const rows = await db.query<SocialPostRow>(sql, status ? [status] : []);
  return rows.map(mapSocialPostRow);
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
    evidenceNote?: string;
    reportedByRole?: IncidentReportRecord['reportedByRole'];
    source?: 'citizen' | 'x';
    sourceUrl?: string;
    isDemo?: boolean;
  }
): Promise<IncidentReportRecord> {
  const id = `VIG-${new Date().getFullYear()}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
  const createdAt = new Date().toISOString();

  // Privacy jitter ~100m
  const jitterLat = (Math.random() - 0.5) * 0.0012;
  const jitterLng = (Math.random() - 0.5) * 0.0012;
  const lat = Number((input.approxLocation.lat + jitterLat).toFixed(5));
  const lng = Number((input.approxLocation.lng + jitterLng).toFixed(5));
  const address = sanitizeExternalText(
    input.approxLocation.address || `Zona referencial en ${input.district}`,
    180
  );

  const safeTitle = sanitizeExternalText(input.title, 120);
  const safeDescription = sanitizeExternalText(input.description, 500);
  const safeEvidence = input.evidenceNote
    ? sanitizeExternalText(input.evidenceNote, 300)
    : undefined;

  await db.execute(
    `INSERT INTO incidents (
      id, category, risk_level, title, description, date, time, district,
      approx_lat, approx_lng, approx_address, status, is_demo, evidence_note,
      false_report_flags, helpful_count, reported_by_role, source, source_url, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pendiente de validación', ?, ?, 0, 1, ?, ?, ?, ?)`,
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
      input.isDemo ? 1 : 0,
      safeEvidence ?? null,
      input.reportedByRole || 'Ciudadano',
      input.source || 'citizen',
      input.sourceUrl ?? null,
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
    status: 'Pendiente de validación',
    isDemo: Boolean(input.isDemo),
    evidenceNote: safeEvidence,
    falseReportFlags: 0,
    helpfulCount: 1,
    reportedByRole: input.reportedByRole || 'Ciudadano',
    source: input.source || 'citizen',
    sourceUrl: input.sourceUrl,
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
  action: 'create_report' | 'link_incident' | 'discard';
  reviewReason?: string;
  // Fields when action === 'create_report'
  district?: string;
  category?: IncidentCategory;
  riskLevel?: RiskLevel;
  title?: string;
  description?: string;
  approxAddress?: string;
  approxLat?: number;
  approxLng?: number;
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
        moderatorId: moderator.uid,
        moderatorName: moderator.name,
        reviewReason: reason,
        reviewedAt: now,
        linkedIncidentId: payload.linkedIncidentId
      }
    };
  }

  // action === 'create_report'
  const confirmedDistrict = (payload.district || '').trim();
  if (!confirmedDistrict) {
    throw new Error(
      'BAD_REQUEST: El moderador debe seleccionar o confirmar el distrito y ubicación aproximada antes de crear el reporte.'
    );
  }

  const districtCenter =
    DISTRICT_APPROX_CENTERS[confirmedDistrict] || DISTRICT_APPROX_CENTERS['Lima (Cercado)'];

  const approxLat =
    typeof payload.approxLat === 'number' && Number.isFinite(payload.approxLat)
      ? payload.approxLat
      : districtCenter.lat;
  const approxLng =
    typeof payload.approxLng === 'number' && Number.isFinite(payload.approxLng)
      ? payload.approxLng
      : districtCenter.lng;

  const publishedDate = new Date(post.publishedAt);
  const validDate = !Number.isNaN(publishedDate.getTime()) ? publishedDate : new Date();
  const dateStr = validDate.toISOString().split('T')[0];
  const timeStr = `${String(validDate.getHours()).padStart(2, '0')}:${String(validDate.getMinutes()).padStart(2, '0')}`;

  const createdIncident = await createIncident(db, {
    category: payload.category || post.suggestedCategory,
    riskLevel: payload.riskLevel || post.suggestedRiskLevel,
    title: payload.title || `Alerta ciudadana reportada en ${confirmedDistrict}`,
    description: payload.description || post.text,
    date: dateStr,
    time: timeStr,
    district: confirmedDistrict,
    approxLocation: {
      lat: approxLat,
      lng: approxLng,
      address: payload.approxAddress || `Zona aproximada confirmada en ${confirmedDistrict}`
    },
    evidenceNote: `Fuente externa: X — ${post.postUrl}`,
    reportedByRole: 'Ciudadano',
    source: 'x',
    sourceUrl: post.postUrl,
    isDemo: false
  });

  const reason = sanitizeExternalText(
    payload.reviewReason || `Reporte creado (${createdIncident.id}) en estado Pendiente de validación.`,
    240
  );

  await db.execute(
    `UPDATE social_posts
     SET status = 'Verificado', moderator_id = ?, moderator_name = ?, review_reason = ?, reviewed_at = ?, linked_incident_id = ?
     WHERE id = ?`,
    [moderator.uid, moderator.name, reason, now, createdIncident.id, postId]
  );

  await recordAuditLog(db, {
    actionType: 'social_post_approved',
    actorId: moderator.uid,
    actorName: moderator.name,
    actorRole: moderator.role,
    targetType: 'social_post',
    targetId: postId,
    details: `Publicación X (${post.externalPostId}) convertida en reporte ${createdIncident.id} (Pendiente de validación) en ${confirmedDistrict}.`
  });

  return {
    post: {
      ...post,
      status: 'Verificado',
      moderatorId: moderator.uid,
      moderatorName: moderator.name,
      reviewReason: reason,
      reviewedAt: now,
      linkedIncidentId: createdIncident.id
    },
    createdIncident
  };
}
