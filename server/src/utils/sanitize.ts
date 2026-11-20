import { IncidentCategory, RiskLevel } from '../types.js';

/**
 * Strips HTML tags, control characters, and normalizes whitespace
 * so external text from X cannot inject markup or scripts.
 */
export function sanitizeExternalText(input: string, maxLength = 500): string {
  if (!input || typeof input !== 'string') return '';

  // Remove HTML/script tags and control characters
  const withoutTags = input
    .replace(/<[^>]*>/g, ' ')
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ')
    .replace(/[\u200B-\u200D\uFEFF]/g, '');

  // Collapse repeated whitespace
  const normalized = withoutTags.replace(/\s+/g, ' ').trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

/**
 * Validates that a URL uses HTTPS and belongs to x.com or twitter.com.
 */
export function sanitizeXPostUrl(url: string, externalPostId: string): string {
  try {
    const parsed = new URL(url);
    if (
      parsed.protocol === 'https:' &&
      (parsed.hostname === 'x.com' ||
        parsed.hostname === 'www.x.com' ||
        parsed.hostname === 'twitter.com' ||
        parsed.hostname === 'www.twitter.com')
    ) {
      return parsed.toString();
    }
  } catch {
    // fallback below
  }
  const safeId = externalPostId.replace(/[^0-9a-zA-Z_-]/g, '');
  return `https://x.com/i/web/status/${safeId}`;
}

const DISTRICT_PATTERNS: Array<{ district: string; regex: RegExp }> = [
  { district: 'San Juan de Lurigancho', regex: /\b(san juan de lurigancho|sjl)\b/i },
  { district: 'San Martín de Porres', regex: /\b(san mart[ií]n de porres|smp)\b/i },
  { district: 'Santiago de Surco', regex: /\b(santiago de surco|surco)\b/i },
  { district: 'Villa El Salvador', regex: /\b(villa el salvador|ves)\b/i },
  { district: 'Miraflores', regex: /\bmiraflores\b/i },
  { district: 'Comas', regex: /\bcomas\b/i },
  { district: 'Callao', regex: /\bcallao\b/i },
  { district: 'Los Olivos', regex: /\blos olivos\b/i },
  { district: 'San Isidro', regex: /\bsan isidro\b/i },
  { district: 'San Borja', regex: /\bsan borja\b/i },
  { district: 'La Victoria', regex: /\bla victoria\b/i },
  { district: 'Independencia', regex: /\bindependencia\b/i },
  { district: 'Ate', regex: /\bate\b/i },
  { district: 'Lima (Cercado)', regex: /\b(cercado de lima|centro de lima|lima centro|barrios altos)\b/i }
];

/**
 * Infers a suggested category, risk level, and optional district hint
 * ONLY as a preliminary aid for human moderators.
 * Never infers exact coordinates or accuses individuals.
 */
export function suggestMetadataFromText(text: string): {
  suggestedCategory: IncidentCategory;
  suggestedRiskLevel: RiskLevel;
  suggestedDistrict?: string;
} {
  const lower = text.toLowerCase();

  let suggestedCategory: IncidentCategory = 'otro';
  let suggestedRiskLevel: RiskLevel = 'informativo';

  if (/extorsi[oó]n|cupo|cobro de cupos|amenaza/.test(lower)) {
    suggestedCategory = 'extorsion';
    suggestedRiskLevel = 'alto';
  } else if (/asalto|mano armada|pistola|balacera|encañon/.test(lower)) {
    suggestedCategory = 'asalto';
    suggestedRiskLevel = 'alto';
  } else if (/choque|accidente|atropello|volcadura/.test(lower)) {
    suggestedCategory = 'accidente';
    suggestedRiskLevel = 'alto';
  } else if (/arrebato|celular|cartera|bolso/.test(lower)) {
    suggestedCategory = 'hurto_menor';
    suggestedRiskLevel = 'medio';
  } else if (/robo|robaron|autopartes|hurto/.test(lower)) {
    suggestedCategory = 'robo';
    suggestedRiskLevel = 'medio';
  } else if (/sospechos|merode|inseguridad|alerta/.test(lower)) {
    suggestedCategory = 'actividad_sospechosa';
    suggestedRiskLevel = 'medio';
  }

  let suggestedDistrict: string | undefined;
  for (const entry of DISTRICT_PATTERNS) {
    if (entry.regex.test(text)) {
      suggestedDistrict = entry.district;
      break;
    }
  }

  return {
    suggestedCategory,
    suggestedRiskLevel,
    suggestedDistrict
  };
}

/**
 * Approximate public center coordinates per district for when a moderator
 * explicitly selects/confirms a district (always jittered slightly for privacy).
 */
export const DISTRICT_APPROX_CENTERS: Record<string, { lat: number; lng: number }> = {
  'Lima (Cercado)': { lat: -12.0464, lng: -77.0428 },
  Comas: { lat: -11.9352, lng: -77.0541 },
  'San Juan de Lurigancho': { lat: -11.9865, lng: -77.0042 },
  'Santiago de Surco': { lat: -12.1384, lng: -76.9892 },
  Miraflores: { lat: -12.1215, lng: -77.0302 },
  Callao: { lat: -12.0435, lng: -77.1189 },
  'Los Olivos': { lat: -11.9922, lng: -77.0705 },
  'San Isidro': { lat: -12.0965, lng: -77.0275 },
  Ate: { lat: -12.0268, lng: -76.9187 },
  'San Martín de Porres': { lat: -12.0086, lng: -77.0688 },
  'Villa El Salvador': { lat: -12.2125, lng: -76.9394 },
  'San Borja': { lat: -12.0942, lng: -76.9996 },
  'La Victoria': { lat: -12.0672, lng: -77.0186 },
  Independencia: { lat: -11.9904, lng: -77.0542 }
};
