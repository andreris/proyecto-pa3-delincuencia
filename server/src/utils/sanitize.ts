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

export const ALLOWED_SOCIAL_DISTRICTS = [
  'Lima',
  'Callao',
  'Comas',
  'Los Olivos',
  'San Juan de Lurigancho',
  'San Martín de Porres',
  'Santiago de Surco',
  'Villa El Salvador',
  'Miraflores',
  'Ate',
  'Chorrillos'
] as const;

export const ALLOWED_SOCIAL_DISTRICT_SET = new Set<string>(ALLOWED_SOCIAL_DISTRICTS);

export const DEFAULT_X_BASE_KEYWORDS = 'robo OR asalto OR extorsion OR inseguridad';

/**
 * Normalizes text by decomposing accents/diacritics, converting to lowercase,
 * and collapsing repeated whitespace for reliable geographical matching.
 */
export function normalizeForMatching(input: string): string {
  if (!input || typeof input !== 'string') return '';
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function hasBalancedParentheses(input: string): boolean {
  let depth = 0;
  for (const ch of input) {
    if (ch === '(') depth += 1;
    else if (ch === ')') {
      depth -= 1;
      if (depth < 0) return false;
    }
  }
  return depth === 0;
}

/**
 * Normalizes an array of user-supplied districts to only the allowed Lima/Callao districts.
 */
export function sanitizeAllowedDistricts(districts?: string[]): string[] {
  if (!Array.isArray(districts)) return [];
  const normalizedMap = new Map<string, string>(
    ALLOWED_SOCIAL_DISTRICTS.map(d => [normalizeForMatching(d), d])
  );
  const result: string[] = [];
  for (const item of districts) {
    if (typeof item !== 'string') continue;
    const key = normalizeForMatching(item);
    const canonical = normalizedMap.get(key);
    if (canonical && !result.includes(canonical)) {
      result.push(canonical);
    }
  }
  return result;
}

/**
 * Formats an allowed district for X API v2 query syntax (quoting multi-word districts).
 */
function formatDistrictForXQuery(district: string): string {
  return /\s/.test(district) ? `"${district}"` : district;
}

/**
 * Builds a valid X API v2 Recent Search query with balanced parentheses,
 * strict Spanish non-retweet filters, and allowed Lima/Callao districts.
 */
export function buildXRecentSearchQuery(
  selectedDistricts?: string[],
  customBaseQuery?: string
): string {
  const validDistricts = sanitizeAllowedDistricts(selectedDistricts);
  const targetDistricts =
    validDistricts.length > 0 ? validDistricts : [...ALLOWED_SOCIAL_DISTRICTS];

  let baseKeywords = (customBaseQuery || '').trim();
  if (baseKeywords) {
    // Strip trailing/inline operators that we enforce explicitly
    baseKeywords = baseKeywords
      .replace(/\blang:es\b/gi, '')
      .replace(/-is:retweet\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();

    // If user left unbalanced parentheses in custom keywords, sanitize them safely
    if (!hasBalancedParentheses(baseKeywords)) {
      baseKeywords = baseKeywords.replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim();
    }
  }

  if (!baseKeywords || baseKeywords.length < 3) {
    baseKeywords = DEFAULT_X_BASE_KEYWORDS;
  }

  // Wrap base keywords cleanly without double outer parens
  let wrappedBase = baseKeywords;
  const startsWithParen = baseKeywords.startsWith('(') && baseKeywords.endsWith(')');
  if (!startsWithParen || !hasBalancedParentheses(baseKeywords.slice(1, -1))) {
    wrappedBase = `(${baseKeywords})`;
  }

  const districtClause = `(${targetDistricts.map(formatDistrictForXQuery).join(' OR ')})`;
  const fullQuery = `${wrappedBase} ${districtClause} lang:es -is:retweet`;

  if (!hasBalancedParentheses(fullQuery)) {
    return `(${DEFAULT_X_BASE_KEYWORDS}) ${districtClause} lang:es -is:retweet`;
  }

  return fullQuery;
}

// Specific multi-word districts MUST come before bare "Lima"
const ALLOWED_DISTRICT_PATTERNS: Array<{ district: string; regex: RegExp }> = [
  { district: 'San Juan de Lurigancho', regex: /\b(san juan de lurigancho|sjl)\b/ },
  { district: 'San Martín de Porres', regex: /\b(san martin de porres|smp)\b/ },
  { district: 'Santiago de Surco', regex: /\b(santiago de surco|surco)\b/ },
  { district: 'Villa El Salvador', regex: /\b(villa el salvador|ves)\b/ },
  { district: 'Los Olivos', regex: /\blos olivos\b/ },
  { district: 'Comas', regex: /\bcomas\b/ },
  { district: 'Miraflores', regex: /\bmiraflores\b/ },
  { district: 'Chorrillos', regex: /\bchorrillos\b/ },
  { district: 'Callao', regex: /\bcallao\b/ },
  { district: 'Ate', regex: /\b(ate vitarte|vitarte|distrito de ate|ate)\b/ },
  {
    district: 'Lima',
    regex: /\b(cercado de lima|lima cercado|centro de lima|lima centro|lima metropolitana|lima)\b/
  }
];

const FOREIGN_LOCATION_PATTERNS: Array<{ label: string; regex: RegExp }> = [
  { label: 'Honduras', regex: /\b(honduras|tegucigalpa|san pedro sula|comayagua)\b/ },
  { label: 'México', regex: /\b(mexico|cdmx|ciudad de mexico|guadalajara|monterrey|tijuana|ecatepec)\b/ },
  { label: 'Colombia', regex: /\b(colombia|bogota|medellin|cali|barranquilla|cartagena)\b/ },
  { label: 'Venezuela', regex: /\b(venezuela|caracas|maracaibo|barquisimeto)\b/ },
  { label: 'Ecuador', regex: /\b(ecuador|quito|guayaquil|cuenca)\b/ },
  { label: 'Chile', regex: /\b(chile|santiago de chile|valparaiso|concepcion|antofagasta)\b/ },
  { label: 'Argentina', regex: /\b(argentina|buenos aires|rosario|mendoza)\b/ },
  { label: 'Bolivia', regex: /\b(bolivia|la paz|santa cruz de la sierra|cochabamba)\b/ },
  { label: 'El Salvador', regex: /\b(el salvador|san salvador)\b/ },
  { label: 'Guatemala', regex: /\bguatemala\b/ },
  { label: 'Nicaragua', regex: /\b(nicaragua|managua)\b/ },
  { label: 'Costa Rica', regex: /\bcosta rica\b/ },
  { label: 'Panamá', regex: /\bpanama\b/ },
  { label: 'España', regex: /\b(espana|madrid|barcelona|sevilla)\b/ },
  { label: 'República Dominicana', regex: /\b(republica dominicana|santo domingo)\b/ },
  { label: 'Estados Unidos', regex: /\b(estados unidos|miami|nueva york|los angeles)\b/ }
];

export function detectAllowedDistrict(text: string): string | undefined {
  const normalized = normalizeForMatching(text);
  if (!normalized) return undefined;

  for (const entry of ALLOWED_DISTRICT_PATTERNS) {
    if (entry.regex.test(normalized)) {
      return entry.district;
    }
  }
  return undefined;
}

export function detectForeignLocation(text: string): string | undefined {
  const normalized = normalizeForMatching(text);
  if (!normalized) return undefined;

  for (const entry of FOREIGN_LOCATION_PATTERNS) {
    if (entry.regex.test(normalized)) {
      return entry.label;
    }
  }
  return undefined;
}

export function isRetweetPost(
  rawText: string,
  referencedTweets?: Array<{ type: string }>
): boolean {
  if (/^\s*rt\s+@/i.test(rawText || '')) {
    return true;
  }
  if (Array.isArray(referencedTweets)) {
    return referencedTweets.some(ref => ref.type === 'retweeted');
  }
  return false;
}

/**
 * Infers a suggested category, risk level, and optional allowed district hint
 * ONLY as a preliminary aid for human moderators.
 * Never infers exact coordinates or accuses individuals.
 */
export function suggestMetadataFromText(text: string): {
  suggestedCategory: IncidentCategory;
  suggestedRiskLevel: RiskLevel;
  suggestedDistrict?: string;
} {
  const normalized = normalizeForMatching(text);

  let suggestedCategory: IncidentCategory = 'otro';
  let suggestedRiskLevel: RiskLevel = 'informativo';

  if (/extorsion|cupo|cobro de cupos|amenaza/.test(normalized)) {
    suggestedCategory = 'extorsion';
    suggestedRiskLevel = 'alto';
  } else if (/asalto|mano armada|pistola|balacera|encanon/.test(normalized)) {
    suggestedCategory = 'asalto';
    suggestedRiskLevel = 'alto';
  } else if (/choque|accidente|atropello|volcadura/.test(normalized)) {
    suggestedCategory = 'accidente';
    suggestedRiskLevel = 'alto';
  } else if (/arrebato|celular|cartera|bolso/.test(normalized)) {
    suggestedCategory = 'hurto_menor';
    suggestedRiskLevel = 'medio';
  } else if (/robo|robaron|autopartes|hurto/.test(normalized)) {
    suggestedCategory = 'robo';
    suggestedRiskLevel = 'medio';
  } else if (/sospechos|merode|inseguridad|alerta/.test(normalized)) {
    suggestedCategory = 'actividad_sospechosa';
    suggestedRiskLevel = 'medio';
  }

  const suggestedDistrict = detectAllowedDistrict(text);

  return {
    suggestedCategory,
    suggestedRiskLevel,
    suggestedDistrict
  };
}

export interface XPostValidationOutcome {
  accepted: boolean;
  detectedDistrict: string;
  suggestedCategory: IncidentCategory;
  suggestedRiskLevel: RiskLevel;
  discardReason?: string;
}

/**
 * Mandatory server-side validation pass after receiving posts from X API v2:
 * - Rejects retweets
 * - Rejects posts mentioning foreign countries/cities
 * - Requires identifying one of the allowed Lima Metropolitana / Callao districts
 * - Enforces optional moderator-selected district & date filters
 */
export function validateAndClassifyXPost(options: {
  text: string;
  publishedAt?: string;
  referencedTweets?: Array<{ type: string }>;
  selectedDistricts?: string[];
  dateFrom?: string;
  dateTo?: string;
}): XPostValidationOutcome {
  const safeText = sanitizeExternalText(options.text, 500);
  const meta = suggestMetadataFromText(safeText);
  const detectedDistrict = meta.suggestedDistrict || 'Sin distrito';

  if (isRetweetPost(options.text, options.referencedTweets)) {
    return {
      accepted: false,
      detectedDistrict,
      suggestedCategory: meta.suggestedCategory,
      suggestedRiskLevel: meta.suggestedRiskLevel,
      discardReason: 'Retuit descartado automáticamente (solo se admiten publicaciones originales).'
    };
  }

  const foreignLabel = detectForeignLocation(safeText);
  if (foreignLabel) {
    return {
      accepted: false,
      detectedDistrict: 'Sin distrito',
      suggestedCategory: meta.suggestedCategory,
      suggestedRiskLevel: meta.suggestedRiskLevel,
      discardReason: `Ubicación extranjera detectada (${foreignLabel}), fuera de Lima Metropolitana y Callao.`
    };
  }

  if (!meta.suggestedDistrict || !ALLOWED_SOCIAL_DISTRICT_SET.has(meta.suggestedDistrict)) {
    return {
      accepted: false,
      detectedDistrict: 'Sin distrito',
      suggestedCategory: meta.suggestedCategory,
      suggestedRiskLevel: meta.suggestedRiskLevel,
      discardReason: 'No identifica un distrito permitido de Lima Metropolitana o Callao.'
    };
  }

  const allowedFilter = sanitizeAllowedDistricts(options.selectedDistricts);
  if (allowedFilter.length > 0 && !allowedFilter.includes(meta.suggestedDistrict)) {
    return {
      accepted: false,
      detectedDistrict: meta.suggestedDistrict,
      suggestedCategory: meta.suggestedCategory,
      suggestedRiskLevel: meta.suggestedRiskLevel,
      discardReason: `El distrito detectado (${meta.suggestedDistrict}) no coincide con el filtro seleccionado.`
    };
  }

  if (options.publishedAt && (options.dateFrom || options.dateTo)) {
    const publishedMs = new Date(options.publishedAt).getTime();
    if (Number.isFinite(publishedMs)) {
      if (options.dateFrom) {
        const fromMs = new Date(`${options.dateFrom}T00:00:00.000Z`).getTime();
        if (publishedMs < fromMs) {
          return {
            accepted: false,
            detectedDistrict: meta.suggestedDistrict,
            suggestedCategory: meta.suggestedCategory,
            suggestedRiskLevel: meta.suggestedRiskLevel,
            discardReason: `Publicación anterior a la fecha mínima (${options.dateFrom}).`
          };
        }
      }
      if (options.dateTo) {
        const toMs = new Date(`${options.dateTo}T23:59:59.999Z`).getTime();
        if (publishedMs > toMs) {
          return {
            accepted: false,
            detectedDistrict: meta.suggestedDistrict,
            suggestedCategory: meta.suggestedCategory,
            suggestedRiskLevel: meta.suggestedRiskLevel,
            discardReason: `Publicación posterior a la fecha máxima (${options.dateTo}).`
          };
        }
      }
    }
  }

  return {
    accepted: true,
    detectedDistrict: meta.suggestedDistrict,
    suggestedCategory: meta.suggestedCategory,
    suggestedRiskLevel: meta.suggestedRiskLevel
  };
}

/**
 * Approximate public center coordinates per district for when a moderator
 * explicitly selects/confirms a district (always jittered slightly for privacy).
 */
export const DISTRICT_APPROX_CENTERS: Record<string, { lat: number; lng: number }> = {
  Lima: { lat: -12.0464, lng: -77.0428 },
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
  Independencia: { lat: -11.9904, lng: -77.0542 },
  Chorrillos: { lat: -12.1695, lng: -77.0181 }
};
