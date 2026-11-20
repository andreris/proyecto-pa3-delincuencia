import { LocationConfidence } from '../types.js';

export interface GeocodeResult {
  accepted: boolean;
  latitude?: number;
  longitude?: number;
  locationLabel?: string;
  countryCode?: string;
  provinceOrState?: string;
  district?: string;
  confidence?: LocationConfidence;
  isForeign?: boolean;
  isOutsideLima?: boolean;
  reason?: string;
}

export type GeocodeFetchLike = (
  input: string | URL,
  init?: RequestInit
) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

interface NominatimItem {
  lat?: string;
  lon?: string;
  display_name?: string;
  importance?: number;
  address?: {
    country?: string;
    country_code?: string;
    state?: string;
    region?: string;
    province?: string;
    city?: string;
    town?: string;
    suburb?: string;
    city_district?: string;
    road?: string;
  };
}

/**
 * Bounding box strictly covering Lima Metropolitana (excludes Callao port strip where possible
 * and checked explicitly alongside address fields).
 */
export const LIMA_METRO_BOUNDS = {
  minLat: -12.55,
  maxLat: -11.55,
  minLng: -77.15,
  maxLng: -76.62
};

export function isWithinLimaMetroBounds(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= LIMA_METRO_BOUNDS.minLat &&
    lat <= LIMA_METRO_BOUNDS.maxLat &&
    lng >= LIMA_METRO_BOUNDS.minLng &&
    lng <= LIMA_METRO_BOUNDS.maxLng
  );
}

function normalizeGeoString(val?: string): string {
  return (val || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Geocodes a candidate address/place using OpenStreetMap Nominatim and enforces
 * strict country (PE) and Lima Metropolitana validation.
 * Never invents coordinates when no valid match is returned.
 */
export class GeocoderService {
  private readonly fetchImpl?: GeocodeFetchLike;
  private readonly customGeocoder?: (
    query: string,
    district?: string
  ) => Promise<GeocodeResult | null>;

  constructor(options?: {
    fetchImpl?: GeocodeFetchLike;
    customGeocoder?: (query: string, district?: string) => Promise<GeocodeResult | null>;
  }) {
    this.fetchImpl = options?.fetchImpl;
    this.customGeocoder = options?.customGeocoder;
  }

  public async geocodeCandidate(
    candidateText: string,
    district?: string
  ): Promise<GeocodeResult | null> {
    const cleanCandidate = candidateText.trim();
    if (!cleanCandidate) return null;

    if (this.customGeocoder) {
      return this.customGeocoder(cleanCandidate, district);
    }

    const fetcher =
      this.fetchImpl || (globalThis.fetch as unknown as GeocodeFetchLike | undefined);
    if (!fetcher) return null;

    const searchQuery = district
      ? `${cleanCandidate}, ${district}, Lima, Perú`
      : `${cleanCandidate}, Lima, Perú`;

    const params = new URLSearchParams({
      q: searchQuery,
      format: 'jsonv2',
      addressdetails: '1',
      limit: '3',
      'accept-language': 'es'
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);

    try {
      const response = await fetcher(
        `https://nominatim.openstreetmap.org/search?${params.toString()}`,
        {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            'User-Agent': 'VigilaPe-GeoSecurity/1.0'
          },
          signal: controller.signal
        }
      );

      if (!response.ok) return null;

      const items = (await response.json()) as NominatimItem[];
      if (!Array.isArray(items) || items.length === 0) {
        return null;
      }

      // Inspect results carefully
      for (const item of items) {
        const lat = Number(item.lat);
        const lng = Number(item.lon);
        const addr = item.address || {};
        const countryCode = normalizeGeoString(addr.country_code);
        const stateText = normalizeGeoString(
          `${addr.state || ''} ${addr.region || ''} ${addr.province || ''} ${addr.city || ''}`
        );
        const fullText = normalizeGeoString(item.display_name);

        if (countryCode && countryCode !== 'pe') {
          continue;
        }

        if (/\b(callao|bellavista|la perla|la punta|ventanilla|carmen de la legua|mi peru)\b/.test(stateText + ' ' + fullText)) {
          continue;
        }

        const isLimaProvince =
          stateText.includes('lima') || fullText.includes('lima metropolitana');
        if (!isLimaProvince || !isWithinLimaMetroBounds(lat, lng)) {
          continue;
        }

        const hasRoad = Boolean(addr.road);
        const confidence: LocationConfidence = hasRoad ? 'high' : 'medium';

        return {
          accepted: true,
          latitude: Number(lat.toFixed(5)),
          longitude: Number(lng.toFixed(5)),
          locationLabel: item.display_name?.split(',').slice(0, 3).join(', ').trim() || cleanCandidate,
          countryCode: 'pe',
          provinceOrState: 'Lima',
          district: addr.city_district || addr.suburb || district,
          confidence
        };
      }

      // If first hit clearly belongs to another country or outside Lima, reject explicitly
      const first = items[0];
      const firstCountry = normalizeGeoString(first.address?.country_code);
      if (firstCountry && firstCountry !== 'pe') {
        return {
          accepted: false,
          countryCode: firstCountry,
          isForeign: true,
          reason: `País no confirmado: geocodificador devolvió país ${firstCountry.toUpperCase()}.`
        };
      }

      return {
        accepted: false,
        countryCode: firstCountry || undefined,
        isOutsideLima: true,
        reason: 'Ubicación fuera de Lima Metropolitana según geocodificador.'
      };
    } catch {
      // Network unavailable or timeout -> never invent coordinates
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }
}
