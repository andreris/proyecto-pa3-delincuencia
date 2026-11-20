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

export interface IncidentReport {
  id: string;
  category: IncidentCategory;
  riskLevel: RiskLevel;
  title: string;
  description: string;
  date: string; // ISO string or readable format
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
  source?: 'citizen' | 'x';
  sourceUrl?: string;
  locationStatus?: LocationStatus;
  locationConfidence?: LocationConfidence;
  locationSource?: LocationSource;
  createdAt: string;
}

export type SocialPostStatus = 'Pendiente de validación' | 'Verificado' | 'Descartado';

export interface SocialPost {
  id: string;
  platform: 'x';
  source?: 'x';
  externalPostId: string;
  postUrl: string;
  text: string;
  publishedAt: string;
  importedAt: string;
  authorUsername?: string;
  queryUsed: string;
  status: SocialPostStatus;
  state?: 'pending_validation' | 'verified' | 'discarded';
  suggestedCategory: IncidentCategory;
  suggestedRiskLevel: RiskLevel;
  suggestedDistrict?: string;
  detectedDistrict?: string;
  district?: string;
  latitude?: number | null;
  longitude?: number | null;
  locationLabel?: string;
  locationConfidence?: LocationConfidence;
  locationStatus?: LocationStatus;
  locationSource?: LocationSource;
  isLimaValidated?: boolean;
  confirmedLocationDescription?: string;
  moderatorId?: string;
  moderatorName?: string;
  reviewReason?: string;
  reviewedAt?: string;
  linkedIncidentId?: string;
  isDemo?: boolean;
}

export interface SocialSourceAudit {
  id: string;
  actionType:
    | 'x_sync'
    | 'social_post_approved'
    | 'social_post_saved'
    | 'social_post_linked'
    | 'social_post_discarded'
    | 'social_query_updated'
    | 'incident_verified'
    | 'incident_discarded'
    | 'retention_cleanup';
  actorId: string;
  actorName: string;
  actorRole: string;
  targetType: 'social_post' | 'incident' | 'social_config' | 'system';
  targetId?: string;
  details: string;
  createdAt: string;
}

export interface SocialSyncStatus {
  backendAvailable: boolean;
  xConfigured: boolean;
  isDemoMode: boolean;
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

export type UserType = 'peaton' | 'conductor' | 'comerciante';

export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  district: string;
  userType: UserType;
  role: 'user' | 'moderator';
  avatarInitials: string;
  joinedDate: string;
}

export interface TrustedContact {
  id: string;
  name: string;
  phone: string;
  relationship: string;
  isConfirmed: boolean;
  createdAt: string;
}

export interface PreventiveRoute {
  id: string;
  name: string;
  origin: { name: string; lat: number; lng: number };
  destination: { name: string; lat: number; lng: number };
  mainPath: [number, number][]; // [lat, lng] coordinates
  altPath: [number, number][];
  exposureLevel: 'menor' | 'medio' | 'mayor';
  altExposureLevel: 'menor' | 'medio' | 'mayor';
  distanceKm: number;
  durationMinutes: number;
  incidentCountNear: number;
  lightingQuality: 'Buena' | 'Regular' | 'Baja';
  patrolFrequency: 'Frecuente (Serenazgo y PNP)' | 'Moderada' | 'Baja';
  safetyNotes: string[];
}

export interface ModerationLog {
  id: string;
  reportId: string;
  reportTitle: string;
  action: 'verificado' | 'descartado' | 'marcado_inapropiado';
  moderatorName: string;
  timestamp: string;
  reason?: string;
}
