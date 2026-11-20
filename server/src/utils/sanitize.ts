import {
  GeocoderService,
  GeocodeResult,
  isWithinLimaMetroBounds
} from '../services/geocoderService.js';
import {
  IncidentCategory,
  LocationConfidence,
  LocationSource,
  LocationStatus,
  RiskLevel
} from '../types.js';

/**
 * Strips HTML tags, control characters, and normalizes whitespace
 * so external text from X cannot inject markup or scripts.
 */
export function sanitizeExternalText(input: string, maxLength = 500): string {
  if (!input || typeof input !== 'string') return '';

  const withoutTags = input
    .replace(/<[^>]*>/g, ' ')
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ')
    .replace(/[\u200B-\u200D\uFEFF]/g, '');

  const normalized = withoutTags.replace(/\s+/g, ' ').trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

/**
 * Sanitizes a public location label/address so exact house numbers, lot/mz,
 * handles, phone numbers, or personal names are never exposed on the public map.
 */
export function sanitizePublicLocationLabel(input: string, fallbackDistrict = 'Lima'): string {
  if (!input || typeof input !== 'string') {
    return `Ubicación aproximada en ${fallbackDistrict}`;
  }

  const cleaned = sanitizeExternalText(input, 180)
    .replace(/@[a-zA-Z0-9_]+/g, '')
    .replace(/\b(?:n[°º.]?\s*\d{1,5}|#\s*\d{1,5}|mz\.?\s*[a-z0-9]+|lt\.?\s*\d{1,4})\b/gi, '')
    .replace(/\b(?:\+?51\s?)?9\d{2}[\s-]?\d{3}[\s-]?\d{3}\b/g, '')
    .replace(/\b\d{8}\b/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  if (!cleaned) {
    return `Ubicación aproximada en ${fallbackDistrict}`;
  }

  return /^ubicaci[oó]n aproximada/i.test(cleaned)
    ? cleaned
    : `Ubicación aproximada — ${cleaned}`;
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

/**
 * Closed list of allowed districts strictly inside Lima Metropolitana, Perú.
 * Explicitly excludes Callao and Callao districts.
 */
export const ALLOWED_SOCIAL_DISTRICTS = [
  'Lima',
  'Ate',
  'Barranco',
  'Breña',
  'Carabayllo',
  'Chorrillos',
  'Comas',
  'El Agustino',
  'Independencia',
  'Jesús María',
  'La Victoria',
  'Lince',
  'Los Olivos',
  'Magdalena del Mar',
  'Miraflores',
  'Pueblo Libre',
  'Puente Piedra',
  'Rímac',
  'San Borja',
  'San Isidro',
  'San Juan de Lurigancho',
  'San Juan de Miraflores',
  'San Martín de Porres',
  'San Miguel',
  'Santa Anita',
  'Santiago de Surco',
  'Surquillo',
  'Villa El Salvador',
  'Villa María del Triunfo'
] as const;

export const ALLOWED_SOCIAL_DISTRICT_SET = new Set<string>(ALLOWED_SOCIAL_DISTRICTS);

/**
 * Core subset used for default X query to respect X API v2's 512-char query cap cleanly.
 */
export const DEFAULT_X_QUERY_DISTRICTS = [
  'Lima',
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
 * Normalizes an array of user-supplied districts to only allowed Lima Metropolitana districts.
 */
export function sanitizeAllowedDistricts(districts?: string[]): string[] {
  if (!Array.isArray(districts)) return [];
  const normalizedMap = new Map<string, string>(
    ALLOWED_SOCIAL_DISTRICTS.map(d => [normalizeForMatching(d), d])
  );
  normalizedMap.set('lima (cercado)', 'Lima');
  normalizedMap.set('cercado de lima', 'Lima');
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

function formatDistrictForXQuery(district: string): string {
  return /\s/.test(district) ? `"${district}"` : district;
}

/**
 * Builds a valid X API v2 Recent Search query with balanced parentheses,
 * strict Spanish non-retweet filters, and allowed Lima Metropolitana districts (<512 chars).
 */
export function buildXRecentSearchQuery(
  selectedDistricts?: string[],
  customBaseQuery?: string
): string {
  const validDistricts = sanitizeAllowedDistricts(selectedDistricts);
  const targetDistricts =
    validDistricts.length > 0 ? validDistricts : [...DEFAULT_X_QUERY_DISTRICTS];

  let baseKeywords = (customBaseQuery || '').trim();
  if (baseKeywords) {
    baseKeywords = baseKeywords
      .replace(/\blang:es\b/gi, '')
      .replace(/-is:retweet\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (!hasBalancedParentheses(baseKeywords)) {
      baseKeywords = baseKeywords.replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim();
    }
  }

  if (!baseKeywords || baseKeywords.length < 3) {
    baseKeywords = DEFAULT_X_BASE_KEYWORDS;
  }

  let wrappedBase = baseKeywords;
  const startsWithParen = baseKeywords.startsWith('(') && baseKeywords.endsWith(')');
  if (!startsWithParen || !hasBalancedParentheses(baseKeywords.slice(1, -1))) {
    wrappedBase = `(${baseKeywords})`;
  }

  let districtTerms = targetDistricts.map(formatDistrictForXQuery);
  let districtClause = `(${districtTerms.join(' OR ')})`;
  let fullQuery = `${wrappedBase} ${districtClause} lang:es -is:retweet`;

  // Keep under X API v2 512-character query cap
  while (fullQuery.length > 490 && districtTerms.length > 1) {
    districtTerms = districtTerms.slice(0, -1);
    districtClause = `(${districtTerms.join(' OR ')})`;
    fullQuery = `${wrappedBase} ${districtClause} lang:es -is:retweet`;
  }

  if (!hasBalancedParentheses(fullQuery)) {
    return `(${DEFAULT_X_BASE_KEYWORDS}) (${DEFAULT_X_QUERY_DISTRICTS.map(formatDistrictForXQuery).join(' OR ')}) lang:es -is:retweet`;
  }

  return fullQuery;
}

// Specific multi-word districts MUST come before bare "Lima"
const ALLOWED_DISTRICT_PATTERNS: Array<{ district: string; regex: RegExp }> = [
  { district: 'San Juan de Lurigancho', regex: /\b(san juan de lurigancho|sjl)\b/ },
  { district: 'San Juan de Miraflores', regex: /\b(san juan de miraflores|sjm)\b/ },
  { district: 'Villa María del Triunfo', regex: /\b(villa maria del triunfo|vmt)\b/ },
  { district: 'San Martín de Porres', regex: /\b(san martin de porres|smp)\b/ },
  { district: 'Santiago de Surco', regex: /\b(santiago de surco|surco)\b/ },
  { district: 'Villa El Salvador', regex: /\b(villa el salvador|ves)\b/ },
  { district: 'Magdalena del Mar', regex: /\b(magdalena del mar|magdalena)\b/ },
  { district: 'Jesús María', regex: /\bjesus maria\b/ },
  { district: 'Pueblo Libre', regex: /\bpueblo libre\b/ },
  { district: 'Puente Piedra', regex: /\bpuente piedra\b/ },
  { district: 'Santa Anita', regex: /\bsanta anita\b/ },
  { district: 'El Agustino', regex: /\bel agustino\b/ },
  { district: 'La Victoria', regex: /\bla victoria\b/ },
  { district: 'San Isidro', regex: /\bsan isidro\b/ },
  { district: 'San Borja', regex: /\bsan borja\b/ },
  { district: 'San Miguel', regex: /\bsan miguel\b/ },
  { district: 'Los Olivos', regex: /\blos olivos\b/ },
  { district: 'Independencia', regex: /\bindependencia\b/ },
  { district: 'Carabayllo', regex: /\bcarabayllo\b/ },
  { district: 'Chorrillos', regex: /\bchorrillos\b/ },
  { district: 'Miraflores', regex: /\bmiraflores\b/ },
  { district: 'Barranco', regex: /\bbarranco\b/ },
  { district: 'Surquillo', regex: /\bsurquillo\b/ },
  { district: 'Comas', regex: /\bcomas\b/ },
  { district: 'Breña', regex: /\bbrena\b/ },
  { district: 'Lince', regex: /\blince\b/ },
  { district: 'Rímac', regex: /\brimac\b/ },
  { district: 'Ate', regex: /\b(ate vitarte|vitarte|distrito de ate|ate)\b/ },
  {
    district: 'Lima',
    regex: /\b(cercado de lima|lima cercado|centro de lima|lima centro|lima metropolitana|lima)\b/
  }
];

const CALLAO_PATTERNS =
  /\b(callao|provincia constitucional del callao|bellavista|la perla|la punta|ventanilla|carmen de la legua|mi peru)\b/;

const FOREIGN_LOCATION_PATTERNS: Array<{ label: string; regex: RegExp }> = [
  { label: 'Honduras', regex: /\b(honduras|tegucigalpa|san pedro sula|comayagua)\b/ },
  { label: 'México', regex: /\b(mexico|cdmx|ciudad de mexico|guadalajara|monterrey|tijuana|ecatepec|puebla|jalisco|veracruz)\b/ },
  { label: 'Colombia', regex: /\b(colombia|bogota|medellin|cali|barranquilla|cartagena|guaviare)\b/ },
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
  { label: 'Estados Unidos', regex: /\b(estados unidos|miami|nueva york|los angeles|ohio)\b/ }
];

const LOCATION_CANDIDATE_REGEX =
  /\b(?:av\.?|avenida|calle|jr\.?|jiron|cuadra|cdra\.?|cruce(?:\s+de)?|interseccion(?:\s+de)?|altura\s+de|alt\.?\s+de|cerca\s+de|paradero|mercado|parque|estacion|ovalo|plaza|puente)\s+[^.!?\n]{3,90}/gi;

/**
 * Extracts a street/landmark location candidate from post text using Peruvian urban cues.
 * Never invents streets or landmarks when none exist.
 */
export function extractLocationCandidate(text: string): string | undefined {
  if (!text || typeof text !== 'string') return undefined;

  // Run regex on accent-stripped copy while slicing original sanitized text indices
  const clean = sanitizeExternalText(text, 400);
  const deaccented = clean.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  const match = LOCATION_CANDIDATE_REGEX.exec(deaccented);
  LOCATION_CANDIDATE_REGEX.lastIndex = 0;

  if (!match) return undefined;

  // Clean trailing conjunctions or punctuation
  let candidate = clean.slice(match.index, match.index + match[0].length).trim();
  candidate = candidate.replace(/[.,;:]+$/, '').trim();

  // Trim overly generic trailing words if candidate runs into end of sentence
  const cutStop = candidate.search(/\b(hace unos|tengan cuidado|reportan|alerta|vecinos)\b/i);
  if (cutStop > 8) {
    candidate = candidate.slice(0, cutStop).replace(/[.,;:]+$/, '').trim();
  }

  return candidate.length >= 5 ? candidate : undefined;
}

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

export function detectCallaoLocation(text: string): string | undefined {
  const normalized = normalizeForMatching(text);
  if (!normalized) return undefined;
  const match = CALLAO_PATTERNS.exec(normalized);
  return match ? match[0] : undefined;
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

/**
 * Offsets coordinates randomly between 200 and 500 meters for public map privacy.
 * Never exposes exact buildings, residences, or personal locations.
 */
export function obfuscateCoordinatesForPublicMap(
  lat: number,
  lng: number,
  distanceMeters?: number
): { lat: number; lng: number } {
  const meters =
    typeof distanceMeters === 'number' && Number.isFinite(distanceMeters)
      ? Math.max(200, Math.min(500, distanceMeters))
      : 200 + Math.random() * 300;
  const angle = Math.random() * 2 * Math.PI;
  const deltaLat = (meters * Math.cos(angle)) / 111320;
  const cosLat = Math.max(0.1, Math.cos((lat * Math.PI) / 180));
  const deltaLng = (meters * Math.sin(angle)) / (111320 * cosLat);

  return {
    lat: Number((lat + deltaLat).toFixed(4)),
    lng: Number((lng + deltaLng).toFixed(4))
  };
}

export interface XGeoInput {
  coordinates?: { lat: number; lng: number };
  place?: {
    countryCode?: string;
    country?: string;
    fullName?: string;
    name?: string;
  };
}

export interface XPostGeolocationOutcome {
  accepted: boolean;
  detectedDistrict: string;
  latitude: number | null;
  longitude: number | null;
  locationLabel: string | null;
  locationConfidence: LocationConfidence;
  locationStatus: LocationStatus;
  locationSource: LocationSource;
  isLimaValidated: boolean;
  suggestedCategory: IncidentCategory;
  suggestedRiskLevel: RiskLevel;
  discardReason?: string;
}

/**
 * Mandatory server-side validation and safe geolocation pipeline for X posts:
 * 1. Rejects retweets.
 * 2. Rejects any foreign country/city (including X place countryCode !== PE).
 * 3. Rejects Callao and Callao districts (closed list = Lima Metropolitana only).
 * 4. Requires explicit evidence of Perú / Lima Metropolitana.
 * 5. Extracts address/place candidate and geocodes via GeocoderService (or treats X coords as candidate).
 * 6. Never invents exact coordinates from a bare district.
 */
export async function validateAndGeolocateXPost(options: {
  text: string;
  publishedAt?: string;
  referencedTweets?: Array<{ type: string }>;
  xGeo?: XGeoInput;
  selectedDistricts?: string[];
  dateFrom?: string;
  dateTo?: string;
  geocoder?: GeocoderService;
}): Promise<XPostGeolocationOutcome> {
  const safeText = sanitizeExternalText(options.text, 500);
  const meta = suggestMetadataFromText(safeText);
  const normalizedText = normalizeForMatching(safeText);

  const rejectUnknown = (reason: string, districtHint = 'Sin distrito'): XPostGeolocationOutcome => ({
    accepted: false,
    detectedDistrict: districtHint,
    latitude: null,
    longitude: null,
    locationLabel: null,
    locationConfidence: 'low',
    locationStatus: 'unknown',
    locationSource: 'none',
    isLimaValidated: false,
    suggestedCategory: meta.suggestedCategory,
    suggestedRiskLevel: meta.suggestedRiskLevel,
    discardReason: reason
  });

  // 1. Retweet check
  if (isRetweetPost(options.text, options.referencedTweets)) {
    return rejectUnknown(
      'Retuit descartado automáticamente (solo se admiten publicaciones originales).',
      meta.suggestedDistrict || 'Sin distrito'
    );
  }

  // 2. Foreign country/city check in text or X place
  const placeCountryCode = normalizeForMatching(options.xGeo?.place?.countryCode || '');
  const placeFullText = normalizeForMatching(
    `${options.xGeo?.place?.fullName || ''} ${options.xGeo?.place?.country || ''}`
  );
  if (placeCountryCode && placeCountryCode !== 'pe') {
    return rejectUnknown(
      `País no confirmado: X place pertenece a ${placeCountryCode.toUpperCase()} (${options.xGeo?.place?.country || 'extranjero'}).`
    );
  }

  const foreignLabel =
    detectForeignLocation(safeText) || detectForeignLocation(placeFullText);
  if (foreignLabel) {
    return rejectUnknown(
      `País no confirmado: ubicación extranjera detectada (${foreignLabel}), fuera de Lima Metropolitana.`
    );
  }

  // 3. Callao exclusion check (text or X place)
  const callaoMatch =
    detectCallaoLocation(safeText) || detectCallaoLocation(placeFullText);
  if (callaoMatch && !meta.suggestedDistrict) {
    return rejectUnknown(
      'Ubicación fuera de Lima Metropolitana: Callao y sus distritos no están incluidos en la lista cerrada.'
    );
  }

  // 4. Validate X coordinates if present (must be inside Lima Metropolitana)
  const xCoords = options.xGeo?.coordinates;
  if (xCoords) {
    if (!isWithinLimaMetroBounds(xCoords.lat, xCoords.lng)) {
      return rejectUnknown(
        'Ubicación fuera de Lima Metropolitana: las coordenadas de X están fuera del área permitida.'
      );
    }
  }

  // 5. Identify allowed Lima Metropolitana district
  const placeDistrict = options.xGeo?.place?.fullName
    ? detectAllowedDistrict(options.xGeo.place.fullName)
    : undefined;
  const detectedDistrict = meta.suggestedDistrict || placeDistrict;

  if (!detectedDistrict || !ALLOWED_SOCIAL_DISTRICT_SET.has(detectedDistrict)) {
    return rejectUnknown(
      'Sin ubicación suficiente: no identifica un distrito permitido de Lima Metropolitana.'
    );
  }

  // Check if Callao explicitly appeared alongside a bare district
  if (callaoMatch) {
    return rejectUnknown(
      'Ubicación fuera de Lima Metropolitana: referencia a Callao no permitida.'
    );
  }

  // 6. Selected district filter check
  const allowedFilter = sanitizeAllowedDistricts(options.selectedDistricts);
  if (allowedFilter.length > 0 && !allowedFilter.includes(detectedDistrict)) {
    return rejectUnknown(
      `El distrito detectado (${detectedDistrict}) no coincide con el filtro seleccionado.`,
      detectedDistrict
    );
  }

  // 7. Date range check
  if (options.publishedAt && (options.dateFrom || options.dateTo)) {
    const publishedMs = new Date(options.publishedAt).getTime();
    if (Number.isFinite(publishedMs)) {
      if (options.dateFrom) {
        const fromMs = new Date(`${options.dateFrom}T00:00:00.000Z`).getTime();
        if (publishedMs < fromMs) {
          return rejectUnknown(
            `Publicación anterior a la fecha mínima (${options.dateFrom}).`,
            detectedDistrict
          );
        }
      }
      if (options.dateTo) {
        const toMs = new Date(`${options.dateTo}T23:59:59.999Z`).getTime();
        if (publishedMs > toMs) {
          return rejectUnknown(
            `Publicación posterior a la fecha máxima (${options.dateTo}).`,
            detectedDistrict
          );
        }
      }
    }
  }

  // 8. Extract street/landmark candidate and evaluate Peru/Lima Metropolitana evidence
  const candidate = extractLocationCandidate(safeText);
  const mentionsLimaOrPeru = /\b(lima metropolitana|lima|peru)\b/.test(normalizedText);
  const xPlaceInLima =
    Boolean(options.xGeo?.place) &&
    (!placeCountryCode || placeCountryCode === 'pe') &&
    (/\blima\b/.test(placeFullText) || Boolean(placeDistrict));
  const xCoordsInLima = Boolean(xCoords && isWithinLimaMetroBounds(xCoords.lat, xCoords.lng));

  let geocodeResult: GeocodeResult | null = null;
  if (candidate && options.geocoder) {
    geocodeResult = await options.geocoder.geocodeCandidate(candidate, detectedDistrict);
    if (geocodeResult && !geocodeResult.accepted) {
      return rejectUnknown(
        geocodeResult.reason ||
          (geocodeResult.isForeign
            ? 'País no confirmado según geocodificador.'
            : 'Ubicación fuera de Lima Metropolitana según geocodificador.'),
        detectedDistrict
      );
    }
  }

  const geocoderConfirmedLima = Boolean(geocodeResult?.accepted);
  const hasDistrictPlusLocalRef = Boolean(candidate);

  const hasLimaPeruEvidence =
    mentionsLimaOrPeru ||
    hasDistrictPlusLocalRef ||
    xPlaceInLima ||
    xCoordsInLima ||
    geocoderConfirmedLima;

  if (!hasLimaPeruEvidence) {
    return rejectUnknown(
      `Distrito ambiguo o país no confirmado: "${detectedDistrict}" no cuenta con evidencia de Lima Metropolitana, Perú.`,
      detectedDistrict
    );
  }

  // 9. Determine exact_candidate vs district_only (NEVER invent street coordinates)
  if (geocodeResult?.accepted && geocodeResult.latitude !== undefined && geocodeResult.longitude !== undefined) {
    return {
      accepted: true,
      detectedDistrict,
      latitude: geocodeResult.latitude,
      longitude: geocodeResult.longitude,
      locationLabel: geocodeResult.locationLabel || candidate || `${detectedDistrict}, Lima`,
      locationConfidence: geocodeResult.confidence || 'high',
      locationStatus: 'exact_candidate',
      locationSource: 'text_geocoded',
      isLimaValidated: true,
      suggestedCategory: meta.suggestedCategory,
      suggestedRiskLevel: meta.suggestedRiskLevel
    };
  }

  if (xCoordsInLima && xCoords) {
    return {
      accepted: true,
      detectedDistrict,
      latitude: Number(xCoords.lat.toFixed(5)),
      longitude: Number(xCoords.lng.toFixed(5)),
      locationLabel: candidate || `Coordenada pública referencial en ${detectedDistrict}, Lima`,
      locationConfidence: candidate ? 'high' : 'medium',
      locationStatus: 'exact_candidate',
      locationSource: 'x_coordinates',
      isLimaValidated: true,
      suggestedCategory: meta.suggestedCategory,
      suggestedRiskLevel: meta.suggestedRiskLevel
    };
  }

  // Only district (or un-geocoded street mention) confirmed in Lima Metropolitana -> district_only (NO invented coords)
  return {
    accepted: true,
    detectedDistrict,
    latitude: null,
    longitude: null,
    locationLabel: candidate
      ? `${candidate} (${detectedDistrict}, Lima Metropolitana)`
      : `Área general de ${detectedDistrict}, Lima Metropolitana`,
    locationConfidence: candidate ? 'medium' : 'low',
    locationStatus: 'district_only',
    locationSource: xPlaceInLima ? 'x_place' : 'district_centroid',
    isLimaValidated: true,
    suggestedCategory: meta.suggestedCategory,
    suggestedRiskLevel: meta.suggestedRiskLevel
  };
}

/**
 * Approximate public district center coordinates strictly for moderator general-area preview
 * when a post is district_only (never used to invent an exact pin).
 */
export const DISTRICT_APPROX_CENTERS: Record<string, { lat: number; lng: number }> = {
  Lima: { lat: -12.0464, lng: -77.0428 },
  'Lima (Cercado)': { lat: -12.0464, lng: -77.0428 },
  Comas: { lat: -11.9352, lng: -77.0541 },
  'San Juan de Lurigancho': { lat: -11.9865, lng: -77.0042 },
  'Santiago de Surco': { lat: -12.1384, lng: -76.9892 },
  Miraflores: { lat: -12.1215, lng: -77.0302 },
  'Los Olivos': { lat: -11.9922, lng: -77.0705 },
  'San Isidro': { lat: -12.0965, lng: -77.0275 },
  Ate: { lat: -12.0268, lng: -76.9187 },
  'San Martín de Porres': { lat: -12.0086, lng: -77.0688 },
  'Villa El Salvador': { lat: -12.2125, lng: -76.9394 },
  'San Borja': { lat: -12.0942, lng: -76.9996 },
  'La Victoria': { lat: -12.0672, lng: -77.0186 },
  Independencia: { lat: -11.9904, lng: -77.0542 },
  Chorrillos: { lat: -12.1695, lng: -77.0181 },
  Barranco: { lat: -12.1485, lng: -77.021 },
  'Jesús María': { lat: -12.0752, lng: -77.0471 },
  Lince: { lat: -12.0835, lng: -77.0345 },
  'Magdalena del Mar': { lat: -12.0912, lng: -77.0705 },
  'Pueblo Libre': { lat: -12.0768, lng: -77.0628 },
  'San Miguel': { lat: -12.0772, lng: -77.0902 },
  Surquillo: { lat: -12.1112, lng: -77.0124 },
  Breña: { lat: -12.0574, lng: -77.0518 },
  Rímac: { lat: -12.0282, lng: -77.0346 },
  'El Agustino': { lat: -12.0432, lng: -77.0012 },
  'Santa Anita': { lat: -12.0435, lng: -76.9712 },
  'San Juan de Miraflores': { lat: -12.1625, lng: -76.9685 },
  'Villa María del Triunfo': { lat: -12.1652, lng: -76.9428 },
  'Puente Piedra': { lat: -11.8665, lng: -77.0768 },
  Carabayllo: { lat: -11.8832, lng: -77.0315 }
};
