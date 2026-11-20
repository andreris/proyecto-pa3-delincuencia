import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import {
  ALLOWED_SOCIAL_DISTRICTS,
  DISTRICT_APPROX_COORDS
} from '../../data/demoData';
import {
  IncidentCategory,
  RiskLevel,
  SocialPost
} from '../../types';
import { sanitizeExternalText } from '../../utils/sanitize';
import { geocodeCandidateAddress } from '../../services/apiClient';
import { useAuth } from '../../context/AuthContext';
import {
  CheckCircle2,
  ExternalLink,
  MapPin,
  Move,
  Save,
  Search,
  ShieldAlert,
  XCircle
} from 'lucide-react';
import { getSafeExternalUrl } from '../../utils/sanitize';

interface SocialPostReviewModalProps {
  post: SocialPost;
  backendAvailable: boolean;
  submitting: boolean;
  sourceTitle?: string;
  sourceUrl?: string;
  initialTitle?: string;
  saveButtonLabel?: string;
  allowSaveWithoutDistrict?: boolean;
  onClose: () => void;
  onApproveAndPublish: (payload: {
    district: string;
    category: IncidentCategory;
    riskLevel: RiskLevel;
    title: string;
    description: string;
    latitude: number;
    longitude: number;
    locationLabel: string;
    confirmedLocationDescription: string;
    movedManually: boolean;
  }) => Promise<void>;
  onSaveForReview: (payload: {
    district: string;
    latitude?: number;
    longitude?: number;
    locationLabel: string;
    confirmedLocationDescription: string;
    movedManually: boolean;
  }) => Promise<void>;
  onDiscard: (reason: string) => Promise<void>;
}

function isWithinLimaBounds(lat: number, lng: number): boolean {
  return lat >= -12.55 && lat <= -11.55 && lng >= -77.15 && lng <= -76.62;
}

export const SocialPostReviewModal: React.FC<SocialPostReviewModalProps> = ({
  post,
  backendAvailable,
  submitting,
  sourceTitle,
  sourceUrl,
  initialTitle,
  saveButtonLabel = 'Guardar para revisión',
  allowSaveWithoutDistrict = false,
  onClose,
  onApproveAndPublish,
  onSaveForReview,
  onDiscard
}) => {
  const { currentUser } = useAuth();
  const initialDistrict =
    post.suggestedDistrict &&
    ALLOWED_SOCIAL_DISTRICTS.includes(
      post.suggestedDistrict as (typeof ALLOWED_SOCIAL_DISTRICTS)[number]
    )
      ? post.suggestedDistrict
      : '';

  const [district, setDistrict] = useState<string>(initialDistrict);
  const [locationLabel, setLocationLabel] = useState<string>(
    post.locationLabel || (initialDistrict ? `Área de ${initialDistrict}, Lima` : '')
  );
  const [confirmedDesc, setConfirmedDesc] = useState<string>(
    post.confirmedLocationDescription ||
      (post.locationStatus === 'exact_candidate' && post.locationLabel
        ? `Zona aproximada cerca de ${post.locationLabel}`
        : '')
  );
  const [category, setCategory] = useState<IncidentCategory>(post.suggestedCategory);
  const [riskLevel, setRiskLevel] = useState<RiskLevel>(post.suggestedRiskLevel);
  const [title, setTitle] = useState<string>(
    initialTitle || `Alerta confirmada en ${initialDistrict || 'Lima Metropolitana'}`
  );
  const [description, setDescription] = useState<string>(sanitizeExternalText(post.text, 450));

  const hasInitialPin =
    typeof post.latitude === 'number' &&
    Number.isFinite(post.latitude) &&
    typeof post.longitude === 'number' &&
    Number.isFinite(post.longitude);

  const [pinCoords, setPinCoords] = useState<{ lat: number; lng: number } | null>(
    hasInitialPin ? { lat: post.latitude!, lng: post.longitude! } : null
  );
  const [manualMoveActive, setManualMoveActive] = useState<boolean>(false);
  const [movedManually, setMovedManually] = useState<boolean>(false);
  const [geocoding, setGeocoding] = useState<boolean>(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const manualMoveRef = useRef<boolean>(manualMoveActive);

  useEffect(() => {
    manualMoveRef.current = manualMoveActive;
  }, [manualMoveActive]);

  // Initialize Leaflet review map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const districtCenter =
      (district && DISTRICT_APPROX_COORDS[district]) || DISTRICT_APPROX_COORDS['Lima'];
    const initialCenter: [number, number] = pinCoords
      ? [pinCoords.lat, pinCoords.lng]
      : [districtCenter.lat, districtCenter.lng];

    const map = L.map(mapContainerRef.current, {
      center: initialCenter,
      zoom: pinCoords ? 15 : 13,
      zoomControl: true,
      attributionControl: true
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors | Vigila.pe'
    }).addTo(map);

    const group = L.layerGroup().addTo(map);
    layerGroupRef.current = group;
    mapRef.current = map;

    map.on('click', (e: L.LeafletMouseEvent) => {
      if (!manualMoveRef.current) return;
      const lat = Number(e.latlng.lat.toFixed(5));
      const lng = Number(e.latlng.lng.toFixed(5));
      if (!isWithinLimaBounds(lat, lng)) {
        setLocalError(
          'El punto elegido está fuera de Lima Metropolitana, Perú. Selecciona una ubicación dentro de Lima.'
        );
        return;
      }
      setLocalError(null);
      setPinCoords({ lat, lng });
      setMovedManually(true);
    });

    const resizeTimer = setTimeout(() => {
      map.invalidateSize();
    }, 180);

    return () => {
      clearTimeout(resizeTimer);
      map.remove();
      mapRef.current = null;
      layerGroupRef.current = null;
    };
  }, []);

  // Re-render marker or district general area circle
  useEffect(() => {
    const map = mapRef.current;
    const group = layerGroupRef.current;
    if (!map || !group) return;

    group.clearLayers();

    if (pinCoords) {
      // Public obfuscation preview circle (350m)
      L.circle([pinCoords.lat, pinCoords.lng], {
        color: '#2563EB',
        weight: 1.5,
        fillColor: '#2563EB',
        fillOpacity: 0.14,
        radius: 350
      }).addTo(group);

      const pinIcon = L.divIcon({
        className: 'moderator-review-pin',
        html: `<div class="w-8 h-8 rounded-full bg-blue-700 border-2 border-white shadow-lg flex items-center justify-center text-white ring-4 ring-blue-300">
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
            <circle cx="12" cy="10" r="3"></circle>
          </svg>
        </div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 16]
      });

      const marker = L.marker([pinCoords.lat, pinCoords.lng], {
        icon: pinIcon,
        draggable: manualMoveActive
      }).addTo(group);

      marker.on('dragend', () => {
        const pos = marker.getLatLng();
        const lat = Number(pos.lat.toFixed(5));
        const lng = Number(pos.lng.toFixed(5));
        if (!isWithinLimaBounds(lat, lng)) {
          setLocalError(
            'El pin debe mantenerse dentro de Lima Metropolitana, Perú.'
          );
          marker.setLatLng([pinCoords.lat, pinCoords.lng]);
          return;
        }
        setLocalError(null);
        setPinCoords({ lat, lng });
        setMovedManually(true);
      });

      map.setView([pinCoords.lat, pinCoords.lng], Math.max(map.getZoom(), 15), {
        animate: true
      });
    } else if (district && DISTRICT_APPROX_COORDS[district]) {
      const center = DISTRICT_APPROX_COORDS[district];
      // General district area ONLY (no exact pin invented)
      L.circle([center.lat, center.lng], {
        color: '#D97706',
        weight: 2,
        dashArray: '6, 6',
        fillColor: '#F59E0B',
        fillOpacity: 0.14,
        radius: 1400
      })
        .bindTooltip(`Área general de ${district} (sin pin exacto asignado)`, {
          sticky: true
        })
        .addTo(group);

      map.setView([center.lat, center.lng], 13, { animate: true });
    }
  }, [pinCoords, district, manualMoveActive]);

  const handleToggleManualMove = () => {
    setLocalError(null);
    setManualMoveActive(prev => !prev);
  };

  const handleGeocodeSearch = async () => {
    setLocalError(null);
    if (!locationLabel.trim() || locationLabel.trim().length < 3) {
      setLocalError('Ingresa una avenida, calle o referencia de al menos 3 caracteres.');
      return;
    }
    if (!backendAvailable) {
      setLocalError(
        'La geocodificación automática requiere conexión con el servidor. Usa "Mover pin manualmente" para fijar el punto en el mapa.'
      );
      return;
    }

    setGeocoding(true);
    try {
      const res = await geocodeCandidateAddress(currentUser, locationLabel.trim(), district);
      if (res.accepted && res.latitude !== undefined && res.longitude !== undefined) {
        setPinCoords({ lat: res.latitude, lng: res.longitude });
        if (res.locationLabel) {
          setLocationLabel(res.locationLabel);
        }
        if (!confirmedDesc.trim()) {
          setConfirmedDesc(
            `Ubicación aproximada cerca de ${res.locationLabel || locationLabel.trim()}`
          );
        }
        setMovedManually(false);
      } else {
        setLocalError(
          res.reason || 'No se pudo ubicar esa referencia dentro de Lima Metropolitana, Perú.'
        );
      }
    } catch (err) {
      setLocalError(
        err instanceof Error
          ? err.message
          : 'No se encontraron coordenadas en Lima Metropolitana para esa dirección.'
      );
    } finally {
      setGeocoding(false);
    }
  };

  const handleApproveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    if (!district) {
      setLocalError('Selecciona un distrito permitido de Lima Metropolitana.');
      return;
    }
    if (!pinCoords || !isWithinLimaBounds(pinCoords.lat, pinCoords.lng)) {
      setLocalError(
        'Debes confirmar un pin en el mapa dentro de Lima Metropolitana antes de aprobar y publicar. Activa "Mover pin manualmente" y haz clic en el mapa.'
      );
      return;
    }
    if (!confirmedDesc.trim() || confirmedDesc.trim().length < 4) {
      setLocalError(
        'El campo "Descripción de ubicación confirmada" es obligatorio para aprobar y publicar.'
      );
      return;
    }

    try {
      await onApproveAndPublish({
        district,
        category,
        riskLevel,
        title: title.trim() || `Alerta confirmada en ${district}`,
        description: description.trim() || sanitizeExternalText(post.text, 450),
        latitude: pinCoords.lat,
        longitude: pinCoords.lng,
        locationLabel: locationLabel.trim() || confirmedDesc.trim(),
        confirmedLocationDescription: confirmedDesc.trim(),
        movedManually
      });
    } catch (err) {
      setLocalError(
        err instanceof Error ? err.message : 'No se pudo aprobar y publicar el incidente.'
      );
    }
  };

  const handleSaveDraft = async () => {
    setLocalError(null);
    if (!district && !allowSaveWithoutDistrict) {
      setLocalError('Selecciona un distrito permitido de Lima Metropolitana.');
      return;
    }

    try {
      await onSaveForReview({
        district,
        latitude: pinCoords?.lat,
        longitude: pinCoords?.lng,
        locationLabel: locationLabel.trim(),
        confirmedLocationDescription: confirmedDesc.trim(),
        movedManually
      });
    } catch (err) {
      setLocalError(
        err instanceof Error ? err.message : 'No se pudo guardar el borrador de revisión.'
      );
    }
  };

  const handleDiscardClick = async () => {
    setLocalError(null);
    try {
      await onDiscard('Descartado por moderación al revisar ubicación.');
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'No se pudo descartar.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/65 backdrop-blur-xs">
      <div className="bg-white rounded-3xl shadow-2xl max-w-4xl w-full overflow-hidden border border-slate-200 flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="bg-[#0B1F3A] text-white px-5 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <ShieldAlert className="w-5 h-5 text-blue-400 shrink-0" />
            <div>
              <h3 className="font-bold text-sm">
                Revisión geográfica antes de publicar (Lima Metropolitana, Perú)
              </h3>
              <p className="text-[11px] text-blue-200">
                El mapa público ofuscará la ubicación entre 200 y 500 metros como “Ubicación aproximada”.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-300 hover:text-white text-sm font-bold px-2 py-1"
            aria-label="Cerrar revisión"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleApproveSubmit} className="overflow-y-auto p-5 space-y-4 text-xs">
          {/* 1. Original sanitized text */}
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-bold text-slate-800">1. Texto original (sanitizado)</span>
              <div className="flex flex-wrap items-center gap-2">
                {post.isLimaValidated && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-[11px] font-bold">
                    <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                    Ubicación validada: Lima Metropolitana, Perú
                  </span>
                )}
                {getSafeExternalUrl(sourceUrl || post.postUrl) && (
                  <a
                    href={getSafeExternalUrl(sourceUrl || post.postUrl) || undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:underline"
                  >
                    <ExternalLink className="w-3 h-3" />
                    Ver fuente original
                  </a>
                )}
              </div>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 leading-relaxed space-y-1">
              {sourceTitle && (
                <p className="font-bold text-slate-900 text-xs">
                  {sanitizeExternalText(sourceTitle, 220)}
                </p>
              )}
              <p>{sanitizeExternalText(post.text, 500)}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Left column: fields */}
            <div className="lg:col-span-6 space-y-3">
              {/* 2. Detected district */}
              <div>
                <label className="block font-bold text-slate-800 mb-1">
                  2. Distrito detectado (solo Lima Metropolitana) *
                </label>
                <select
                  value={district}
                  onChange={e => {
                    const nextDist = e.target.value;
                    setDistrict(nextDist);
                    if (nextDist && title.startsWith('Alerta confirmada en')) {
                      setTitle(`Alerta confirmada en ${nextDist}`);
                    }
                  }}
                  required
                  className="w-full p-2.5 rounded-xl border border-slate-200 bg-white"
                >
                  <option value="">-- Selecciona distrito de Lima Metropolitana --</option>
                  {ALLOWED_SOCIAL_DISTRICTS.map(d => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>

              {/* 3. Detected address or place */}
              <div>
                <label className="block font-bold text-slate-800 mb-1">
                  3. Dirección o lugar detectado (candidato)
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={locationLabel}
                    onChange={e => setLocationLabel(e.target.value)}
                    placeholder="Ej: Av. Túpac Amaru, mercado o estación"
                    className="flex-1 p-2.5 rounded-xl border border-slate-200"
                  />
                  <button
                    type="button"
                    onClick={handleGeocodeSearch}
                    disabled={geocoding}
                    className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-800 font-bold inline-flex items-center gap-1 shrink-0"
                    title="Buscar coordenadas en OpenStreetMap Nominatim (Lima, Perú)"
                  >
                    <Search className="w-3.5 h-3.5" />
                    {geocoding ? 'Buscando...' : 'Ubicar'}
                  </button>
                </div>
                <p className="text-[10px] text-slate-500 mt-1">
                  Estado actual: <strong>{post.locationStatus || 'unknown'}</strong> • Confianza:{' '}
                  <strong>{post.locationConfidence || 'low'}</strong> • Fuente:{' '}
                  <strong>{movedManually ? 'moderator_manual' : post.locationSource || 'none'}</strong>
                </p>
              </div>

              {/* 6. Mandatory confirmed location description */}
              <div>
                <label className="block font-bold text-slate-800 mb-1">
                  6. Descripción de ubicación confirmada *
                </label>
                <textarea
                  rows={2}
                  value={confirmedDesc}
                  onChange={e => setConfirmedDesc(e.target.value)}
                  placeholder="Ej: Cercanías del cruce Av. Larco con Av. Benavides (sin número de vivienda ni datos personales)"
                  className="w-full p-2.5 rounded-xl border border-slate-200"
                />
                <p className="text-[10px] text-slate-500 mt-0.5">
                  Obligatorio para aprobar y publicar. No incluyas domicilios exactos ni nombres de personas.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block font-bold text-slate-800 mb-1">Categoría</label>
                  <select
                    value={category}
                    onChange={e => setCategory(e.target.value as IncidentCategory)}
                    className="w-full p-2.5 rounded-xl border border-slate-200 bg-white"
                  >
                    <option value="robo">Robo</option>
                    <option value="asalto">Asalto</option>
                    <option value="extorsion">Extorsión</option>
                    <option value="accidente">Accidente</option>
                    <option value="actividad_sospechosa">Actividad sospechosa</option>
                    <option value="hurto_menor">Hurto menor</option>
                    <option value="otro">Otro</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-800 mb-1">Nivel de riesgo</label>
                  <select
                    value={riskLevel}
                    onChange={e => setRiskLevel(e.target.value as RiskLevel)}
                    className="w-full p-2.5 rounded-xl border border-slate-200 bg-white"
                  >
                    <option value="alto">Alto</option>
                    <option value="medio">Medio</option>
                    <option value="informativo">Informativo</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-800 mb-1">Título del reporte público</label>
                <input
                  type="text"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  maxLength={120}
                  className="w-full p-2.5 rounded-xl border border-slate-200"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-800 mb-1">Descripción pública</label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-slate-200"
                />
              </div>
            </div>

            {/* Right column: Leaflet Map + Manual Pin Move */}
            <div className="lg:col-span-6 space-y-2.5 flex flex-col">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold text-slate-800 flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-blue-600" />
                  4. Mapa Leaflet con pin sugerido o área general
                </span>

                {/* 5. Mover pin manualmente */}
                <button
                  type="button"
                  onClick={handleToggleManualMove}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 border transition-colors ${
                    manualMoveActive
                      ? 'bg-emerald-600 text-white border-emerald-700 shadow-sm'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <Move className="w-3.5 h-3.5" />
                  {manualMoveActive ? 'Haz clic o arrastra en mapa (Activo)' : 'Mover pin manualmente'}
                </button>
              </div>

              <div className="relative rounded-2xl overflow-hidden border border-slate-200 h-72 lg:flex-1 min-h-[260px] bg-slate-100">
                <div ref={mapContainerRef} className="h-full w-full" />
                {manualMoveActive && (
                  <div className="absolute top-2 left-1/2 -translate-x-1/2 z-[400] bg-emerald-700/95 text-white px-3 py-1 rounded-full text-[11px] font-bold shadow pointer-events-none">
                    Haz clic en el mapa o arrastra el marcador
                  </div>
                )}
              </div>

              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-600 flex flex-wrap items-center justify-between gap-2">
                {pinCoords ? (
                  <span>
                    <strong>Pin candidato:</strong> {pinCoords.lat.toFixed(5)},{' '}
                    {pinCoords.lng.toFixed(5)} (círculo azul = radio aproximado público)
                  </span>
                ) : post.locationStatus === 'unknown' ? (
                  <span className="text-amber-800 font-semibold">
                    Sin ubicación específica: no se puede publicar directamente en el mapa. Usa “{saveButtonLabel}” o fija un pin manualmente dentro de Lima Metropolitana.
                  </span>
                ) : (
                  <span className="text-amber-800 font-semibold">
                    Solo distrito detectado: mostrando área general en ámbar. Activa “Mover pin manualmente” para fijar ubicación aproximada o usa “{saveButtonLabel}”.
                  </span>
                )}
              </div>
            </div>
          </div>

          {localError && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs font-semibold">
              {localError}
            </div>
          )}

          {/* 7. Action Buttons */}
          <div className="pt-3 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={handleDiscardClick}
              disabled={submitting}
              className="px-4 py-2.5 rounded-xl bg-white hover:bg-red-50 text-red-700 border border-red-200 font-bold inline-flex items-center gap-1.5"
            >
              <XCircle className="w-4 h-4" />
              Descartar
            </button>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="px-3.5 py-2.5 rounded-xl text-slate-600 hover:bg-slate-100 font-semibold"
              >
                Cancelar
              </button>

              <button
                type="button"
                onClick={handleSaveDraft}
                disabled={submitting || (!district && !allowSaveWithoutDistrict)}
                className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-800 border border-slate-300 font-bold inline-flex items-center gap-1.5"
              >
                <Save className="w-4 h-4" />
                {saveButtonLabel}
              </button>

              <button
                type="submit"
                disabled={submitting || !district || !pinCoords || !confirmedDesc.trim()}
                className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold shadow-sm inline-flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-4 h-4" />
                {submitting ? 'Procesando...' : 'Aprobar y publicar'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
