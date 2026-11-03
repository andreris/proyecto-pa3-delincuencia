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
  createdAt: string;
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
