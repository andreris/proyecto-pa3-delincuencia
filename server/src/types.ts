export type IncidentCategory =
  | 'robo'
  | 'extorsion'
  | 'asalto'
  | 'accidente'
  | 'actividad_sospechosa'
  | 'hurto_menor'
  | 'otro';

export type RiskLevel = 'alto' | 'medio' | 'informativo';

export type ReportStatus = 'Pendiente de validación' | 'Verificado' | 'Descartado';

export type SocialPostStatus = 'Pendiente de validación' | 'Verificado' | 'Descartado';

export type LocationConfidence = 'high' | 'medium' | 'low';

export type LocationStatus =
  | 'exact_candidate'
  | 'district_only'
  | 'unknown'
  | 'moderator_confirmed';

export type LocationSource =
  | 'text_geocoded'
  | 'x_coordinates'
  | 'x_place'
  | 'district_centroid'
  | 'moderator_manual'
  | 'none';

export interface IncidentReportRecord {
  id: string;
  category: IncidentCategory;
  riskLevel: RiskLevel;
  title: string;
  description: string;
  date: string;
  time: string;
  district: string;
  approxLocation: {
    lat: number;
    lng: number;
    address: string;
  };
  status: ReportStatus;
  isDemo: boolean;
  evidenceNote?: string;
  falseReportFlags: number;
  helpfulCount: number;
  reportedByRole: 'Peatón' | 'Conductor' | 'Comerciante' | 'Ciudadano';
  source: 'citizen' | 'x' | 'rpp';
  sourceUrl?: string;
  locationStatus?: LocationStatus;
  locationConfidence?: LocationConfidence;
  locationSource?: LocationSource;
  createdAt: string;
}

export type SocialPostState = 'pending_validation' | 'verified' | 'discarded';

export interface SocialPostRecord {
  id: string;
  platform: 'x';
  source: 'x';
  externalPostId: string;
  postUrl: string;
  text: string;
  publishedAt: string;
  importedAt: string;
  queryUsed: string;
  status: SocialPostStatus;
  state: SocialPostState;
  suggestedCategory: IncidentCategory;
  suggestedRiskLevel: RiskLevel;
  suggestedDistrict?: string;
  detectedDistrict?: string;
  district?: string;
  latitude?: number | null;
  longitude?: number | null;
  locationLabel?: string;
  locationConfidence: LocationConfidence;
  locationStatus: LocationStatus;
  locationSource: LocationSource;
  isLimaValidated: boolean;
  confirmedLocationDescription?: string;
  moderatorId?: string;
  moderatorName?: string;
  reviewReason?: string;
  reviewedAt?: string;
  linkedIncidentId?: string;
}

export type IncidentFilterKey =
  | 'robo'
  | 'asalto'
  | 'balacera'
  | 'extorsion'
  | 'secuestro'
  | 'arrebato'
  | 'robo_vehiculo'
  | 'actividad_sospechosa';

export type LocationReferenceKey =
  | 'avenida'
  | 'calle'
  | 'jiron'
  | 'cuadra'
  | 'cruce'
  | 'esquina'
  | 'paradero'
  | 'mercado'
  | 'parque'
  | 'estacion';

export interface SocialSourceConfig {
  id: string;
  searchQuery: string;
  queryGroups: string[];
  retentionDays: number;
  filterDistricts: string[];
  filterIncidentTypes: IncidentFilterKey[];
  filterLocationRefs: LocationReferenceKey[];
  additionalKeywords: string;
  filterDateFrom?: string;
  filterDateTo?: string;
  lastSyncAt?: string;
  lastSyncStatus?: 'success' | 'error' | 'idle';
  lastSyncMessage?: string;
  lastImportedCount: number;
  updatedAt: string;
  updatedBy?: string;
}

export interface WebNewsRecord {
  id: string;
  source: 'rpp';
  sourceName: 'RPP Noticias';
  externalId: string;
  title: string;
  excerpt: string;
  publishedAt: string;
  originalUrl: string;
  imageUrl?: string;
  importedAt: string;
  status: SocialPostStatus;
  state: SocialPostState;
  suggestedCategory: IncidentCategory;
  suggestedRiskLevel: RiskLevel;
  district?: string;
  detectedDistrict: string;
  latitude?: number | null;
  longitude?: number | null;
  locationLabel?: string;
  locationConfidence: LocationConfidence;
  locationStatus: LocationStatus;
  locationSource: LocationSource;
  isLimaValidated: boolean;
  confirmedLocationDescription?: string;
  moderatorId?: string;
  moderatorName?: string;
  reviewReason?: string;
  reviewedAt?: string;
  linkedIncidentId?: string;
}

export interface WebSourceConfig {
  id: string;
  source: 'rpp';
  sourceName: 'RPP Noticias';
  rssUrl: string;
  filterDistricts: string[];
  filterIncidentTypes: IncidentFilterKey[];
  filterLocationRefs: LocationReferenceKey[];
  additionalKeywords: string;
  filterDateFrom?: string;
  filterDateTo?: string;
  lastSyncAt?: string;
  lastSyncStatus?: 'success' | 'error' | 'idle';
  lastSyncMessage?: string;
  lastImportedCount: number;
  updatedAt: string;
  updatedBy?: string;
}

export interface SocialSourceAuditRecord {
  id: string;
  actionType:
    | 'x_sync'
    | 'social_post_approved'
    | 'social_post_saved'
    | 'social_post_linked'
    | 'social_post_discarded'
    | 'social_query_updated'
    | 'web_sync'
    | 'web_news_approved'
    | 'web_news_saved'
    | 'web_news_linked'
    | 'web_news_discarded'
    | 'web_filters_updated'
    | 'incident_verified'
    | 'incident_discarded'
    | 'retention_cleanup';
  actorId: string;
  actorName: string;
  actorRole: string;
  targetType: 'social_post' | 'incident' | 'social_config' | 'web_news' | 'web_config' | 'system';
  targetId?: string;
  details: string;
  createdAt: string;
}

export interface AuthenticatedUser {
  uid: string;
  name: string;
  email: string;
  role: 'user' | 'moderator';
}
