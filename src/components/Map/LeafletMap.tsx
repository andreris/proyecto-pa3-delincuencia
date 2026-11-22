import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { createPortal } from 'react-dom';
import { IncidentReport, PreventiveRoute } from '../../types';
import { ShieldAlert, AlertTriangle, Info, Eye, Layers, Compass, LocateFixed } from 'lucide-react';

const defaultCenter: [number, number] = [-12.055, -77.035];

export function RiskLegend() {
  return (<>
        <span className="font-bold text-slate-900 flex items-center gap-1">
          Niveles de riesgo
        </span>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-red-600 inline-block shadow-sm ring-2 ring-red-200"></span>
          <span>Alto</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block shadow-sm ring-2 ring-amber-200"></span>
          <span>Medio</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-blue-600 inline-block shadow-sm ring-2 ring-blue-200"></span>
          <span>Informativo</span>
        </div>
  </>);
}

interface LeafletMapProps {
  incidents: IncidentReport[];
  selectedIncident: IncidentReport | null;
  onSelectIncident?: (incident: IncidentReport | null) => void;
  center?: [number, number];
  zoom?: number;
  activeRoute?: Pick<PreventiveRoute, 'origin' | 'destination' | 'mainPath' | 'altPath'> | null;
  onPickCoordinate?: (coords: { lat: number; lng: number }) => void;
  isPickingLocation?: boolean;
  pickedCoords?: { lat: number; lng: number } | null;
  className?: string;
  showRiskZones?: boolean;
  showLegend?: boolean;
  mobileControls?: boolean;
}

export const LeafletMap: React.FC<LeafletMapProps> = ({
  incidents,
  selectedIncident,
  onSelectIncident,
  center = defaultCenter,
  zoom = 12,
  activeRoute = null,
  onPickCoordinate,
  isPickingLocation = false,
  pickedCoords = null,
  className = 'h-full w-full',
  showLegend = true,
  mobileControls = false,
  showRiskZones: initialShowRiskZones = true
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const circlesLayerRef = useRef<L.LayerGroup | null>(null);
  const routeLayerRef = useRef<L.LayerGroup | null>(null);
  const pickMarkerRef = useRef<L.Marker | null>(null);

  const [showRiskZones, setShowRiskZones] = useState<boolean>(initialShowRiskZones);
  const [mapTileStyle, setMapTileStyle] = useState<'standard' | 'humanitarian'>('standard');
  const [locationControl, setLocationControl] = useState<HTMLDivElement | null>(null);
  const [userGpsLoading, setUserGpsLoading] = useState<boolean>(false);

  // Helper to create category and risk icons
  const createPinIcon = (report: IncidentReport, isSelected: boolean) => {
    let bgColor = '#2563EB'; // blue for info
    let shadowColor = 'rgba(37, 99, 235, 0.4)';
    let pulseHtml = '';

    if (report.riskLevel === 'alto') {
      bgColor = '#DC2626'; // red
      shadowColor = 'rgba(220, 38, 38, 0.5)';
      pulseHtml = `<span class="absolute -top-1 -left-1 -right-1 -bottom-1 rounded-full animate-ping opacity-60 bg-red-500"></span>`;
    } else if (report.riskLevel === 'medio') {
      bgColor = '#D97706'; // amber
      shadowColor = 'rgba(217, 119, 6, 0.4)';
    }

    const size = isSelected ? 38 : 32;

    const html = `
      <div class="relative flex items-center justify-center cursor-pointer transition-transform duration-200 hover:scale-110" style="width: ${size}px; height: ${size}px;">
        ${pulseHtml}
        <div style="background-color: ${bgColor}; box-shadow: 0 4px 14px ${shadowColor};" 
             class="w-full h-full rounded-full border-2 border-white flex items-center justify-center text-white relative z-10 ${isSelected ? 'ring-4 ring-blue-400 ring-offset-2' : ''}">
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            ${
              report.riskLevel === 'alto'
                ? '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>'
                : report.riskLevel === 'medio'
                ? '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line>'
                : '<circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line>'
            }
          </svg>
        </div>
      </div>
    `;

    return L.divIcon({
      className: 'custom-incident-pin',
      html,
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
      popupAnchor: [0, -size / 2]
    });
  };

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center,
      zoom,
      zoomControl: false,
      attributionControl: true
    });

    // Custom positioned zoom control on top right
    L.control.zoom({ position: 'topright' }).addTo(map);

    const gps = new L.Control({ position: 'topright' });
    gps.onAdd = () => {
      const container = L.DomUtil.create('div', 'leaflet-bar');
      L.DomEvent.disableClickPropagation(container);
      setLocationControl(container);
      return container;
    };
    if (mobileControls) gps.addTo(map);

    // OpenStreetMap tile layer with required attribution
    const tileUrl =
      mapTileStyle === 'humanitarian'
        ? 'https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png'
        : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

    const tileLayer = L.tileLayer(tileUrl, {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a> | Vigila.pe'
    }).addTo(map);

    // Create layer groups
    circlesLayerRef.current = L.layerGroup().addTo(map);
    markersLayerRef.current = L.layerGroup().addTo(map);
    routeLayerRef.current = L.layerGroup().addTo(map);

    mapInstanceRef.current = map;

    // Trigger resize on layout settle
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 200);

    return () => {
      clearTimeout(timer);
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !onPickCoordinate) return;
    const pick = (event: L.LeafletMouseEvent) => onPickCoordinate(event.latlng);
    map.on('click', pick);
    return () => { map.off('click', pick); };
  }, [onPickCoordinate]);

  // Sync Center and Zoom
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    map.setView(center, zoom, { animate: true });
  }, [center, zoom]);

  // Handle picked coordinate marker
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (pickMarkerRef.current) {
      map.removeLayer(pickMarkerRef.current);
      pickMarkerRef.current = null;
    }

    if (pickedCoords) {
      const pinHtml = `
        <div class="relative flex items-center justify-center" style="width: 36px; height: 36px;">
          <div class="w-9 h-9 rounded-full bg-emerald-600 border-2 border-white shadow-lg flex items-center justify-center text-white ring-4 ring-emerald-300">
            <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        </div>
      `;

      const pickIcon = L.divIcon({
        className: 'custom-pick-pin',
        html: pinHtml,
        iconSize: [36, 36],
        iconAnchor: [18, 18]
      });

      pickMarkerRef.current = L.marker([pickedCoords.lat, pickedCoords.lng], { icon: pickIcon }).addTo(map);
      map.panTo([pickedCoords.lat, pickedCoords.lng], { animate: true });
    }
  }, [pickedCoords]);

  // Update Markers & Risk Zones
  useEffect(() => {
    const map = mapInstanceRef.current;
    const markersGroup = markersLayerRef.current;
    const circlesGroup = circlesLayerRef.current;
    if (!map || !markersGroup || !circlesGroup) return;

    markersGroup.clearLayers();
    circlesGroup.clearLayers();

    incidents.forEach(report => {
      const { lat, lng, address } = report.approxLocation;
      const isSelected = selectedIncident?.id === report.id;

      // Risk circle (heat / influence area)
      if (showRiskZones) {
        let circleColor = '#2563EB'; // blue
        let radius = 300;
        let fillOpacity = 0.12;

        if (report.riskLevel === 'alto') {
          circleColor = '#DC2626';
          radius = 550;
          fillOpacity = 0.18;
        } else if (report.riskLevel === 'medio') {
          circleColor = '#D97706';
          radius = 400;
          fillOpacity = 0.15;
        }

        const circle = L.circle([lat, lng], {
          color: circleColor,
          weight: 1.5,
          opacity: 0.6,
          fillColor: circleColor,
          fillOpacity,
          radius
        });
        circlesGroup.addLayer(circle);
      }

      // Marker
      const icon = createPinIcon(report, isSelected);
      const marker = L.marker([lat, lng], { icon });

      // Clean, well-styled popup
      const riskBadgeColor =
        report.riskLevel === 'alto'
          ? 'bg-red-100 text-red-800 border-red-200'
          : report.riskLevel === 'medio'
          ? 'bg-amber-100 text-amber-800 border-amber-200'
          : 'bg-blue-100 text-blue-800 border-blue-200';

      const riskLabel =
        report.riskLevel === 'alto'
          ? 'Riesgo Alto'
          : report.riskLevel === 'medio'
          ? 'Riesgo Medio'
          : 'Informativo';

      const statusBadge =
        report.status === 'Verificado'
          ? '<span class="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">✓ Verificado</span>'
          : '<span class="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">⏳ En validación</span>';

      const categoryLabel = report.category.replace('_', ' ').toUpperCase();

      const popupContent = `
        <div class="p-3.5 max-w-[280px] text-slate-800">
          <div class="flex items-center justify-between gap-2 mb-1.5">
            <span class="text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 rounded border ${riskBadgeColor}">
              ${riskLabel}
            </span>
            ${statusBadge}
          </div>
          <h4 class="font-bold text-sm text-slate-900 leading-snug mb-1">${report.title}</h4>
          <p class="text-xs text-slate-600 line-clamp-2 mb-2">${report.description}</p>
          <div class="pt-2 border-t border-slate-100 text-[11px] space-y-1">
            <div class="flex items-center gap-1.5 text-slate-500 font-medium">
              <svg class="w-3.5 h-3.5 shrink-0 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span class="truncate">${/^ubicaci[oó]n aproximada/i.test(address) ? address : `Ubicación aproximada: ${address}`}</span>
            </div>
            <div class="flex items-center justify-between text-slate-400 text-[10px]">
              <span>📅 ${report.date} • ${report.time}</span>
              <span class="font-medium text-blue-700">${report.district}</span>
            </div>
          </div>
          <div class="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between">
            <span class="text-[10px] text-slate-400">🛡️ Ubicación aproximada (200-500m)</span>
            <button id="view-incident-btn-${report.id}" class="text-xs font-semibold text-blue-600 hover:text-blue-800 underline">
              Ver detalle
            </button>
          </div>
        </div>
      `;

      marker.bindPopup(popupContent);

      marker.on('popupopen', () => {
        const btn = document.getElementById(`view-incident-btn-${report.id}`);
        if (btn && onSelectIncident) {
          btn.onclick = () => onSelectIncident(report);
        }
      });

      marker.on('click', () => {
        if (onSelectIncident) {
          onSelectIncident(report);
        }
      });

      markersGroup.addLayer(marker);
    });
  }, [incidents, selectedIncident, showRiskZones]);

  // Update Route Polyline if activeRoute is set
  useEffect(() => {
    const map = mapInstanceRef.current;
    const routeGroup = routeLayerRef.current;
    if (!map || !routeGroup) return;

    routeGroup.clearLayers();

    if (!activeRoute) return;

    // Alternative Route Polyline (dashed amber / higher exposure)
    if (activeRoute.altPath && activeRoute.altPath.length > 1) {
      const altPolyline = L.polyline(activeRoute.altPath, {
        color: '#D97706',
        weight: 4,
        opacity: 0.65,
        dashArray: '8, 8'
      }).bindTooltip('Ruta alternativa', { sticky: true });
      routeGroup.addLayer(altPolyline);
    }

    // Main Preventive Route Polyline (solid vibrant blue/green - lower exposure)
    if (activeRoute.mainPath && activeRoute.mainPath.length > 1) {
      const mainPolyline = L.polyline(activeRoute.mainPath, {
        color: '#2563EB',
        weight: 6,
        opacity: 0.9
      }).bindTooltip('Ruta seleccionada', { sticky: true });
      routeGroup.addLayer(mainPolyline);

      // Fit bounds to show entire route
      const bounds = L.latLngBounds(activeRoute.mainPath);
      map.fitBounds(bounds, { padding: [50, 50], animate: true });
    }

    // Origin and Destination markers
    const originIcon = L.divIcon({
      className: 'route-origin-pin',
      html: `
        <div class="w-7 h-7 rounded-full bg-emerald-600 border-2 border-white shadow-md flex items-center justify-center text-white text-[11px] font-bold">
          A
        </div>
      `,
      iconSize: [28, 28],
      iconAnchor: [14, 14]
    });

    const destIcon = L.divIcon({
      className: 'route-dest-pin',
      html: `
        <div class="w-7 h-7 rounded-full bg-blue-700 border-2 border-white shadow-md flex items-center justify-center text-white text-[11px] font-bold">
          B
        </div>
      `,
      iconSize: [28, 28],
      iconAnchor: [14, 14]
    });

    const originMarker = L.marker([activeRoute.origin.lat, activeRoute.origin.lng], { icon: originIcon })
      .bindPopup(`<strong>Origen:</strong> ${activeRoute.origin.name}`);
    const destMarker = L.marker([activeRoute.destination.lat, activeRoute.destination.lng], { icon: destIcon })
      .bindPopup(`<strong>Destino:</strong> ${activeRoute.destination.name}`);

    routeGroup.addLayer(originMarker);
    routeGroup.addLayer(destMarker);
  }, [activeRoute]);

  // Center on device GPS
  const handleLocateMe = () => {
    if (!navigator.geolocation) {
      alert('Tu navegador no soporta geolocalización.');
      return;
    }
    setUserGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      pos => {
        setUserGpsLoading(false);
        const { latitude, longitude } = pos.coords;
        const map = mapInstanceRef.current;
        if (map) {
          map.setView([latitude, longitude], 15, { animate: true });
          L.circleMarker([latitude, longitude], {
            radius: 9,
            fillColor: '#2563EB',
            color: '#FFFFFF',
            weight: 3,
            opacity: 1,
            fillOpacity: 0.9
          })
            .addTo(map)
            .bindPopup('Tu ubicación aproximada')
            .openPopup();
        }
        if (onPickCoordinate) {
          onPickCoordinate({ lat: Number(latitude.toFixed(5)), lng: Number(longitude.toFixed(5)) });
        }
      },
      err => {
        setUserGpsLoading(false);
        console.warn('Geolocation error:', err);
        // Fallback smooth alert
      },
      { timeout: 8000, enableHighAccuracy: true }
    );
  };

  const handleResetToLima = () => {
    const map = mapInstanceRef.current;
    if (map) {
      map.setView([-12.055, -77.035], 12, { animate: true });
    }
  };

  return (
    <div className={`relative ${className} bg-slate-100 overflow-hidden`}>
      {/* Map Container */}
      <div ref={mapContainerRef} className="h-full w-full" />

      {/* Picking Location Guide Overlay */}
      {isPickingLocation && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 bg-blue-900/95 text-white px-4 py-2 rounded-full shadow-lg text-xs font-semibold flex items-center gap-2 border border-blue-700 pointer-events-none animate-bounce">
          <LocateFixed className="w-4 h-4 text-emerald-400" />
          Haz clic en cualquier punto del mapa para fijar la ubicación del reporte
        </div>
      )}

      {/* Floating Map Controls Bar */}
      <div className="absolute bottom-5 left-4 z-20 flex flex-wrap items-center gap-2">
        {/* Toggle Risk Zones */}
        <button
          onClick={() => setShowRiskZones(prev => !prev)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold shadow-md border transition-all ${
            showRiskZones
              ? 'bg-blue-600 text-white border-blue-700'
              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
          }`}
          title="Mostrar u ocultar círculos de radio de riesgo"
        >
          <Layers className="w-3.5 h-3.5" />
          {showRiskZones ? 'Zonas de riesgo: Activas' : 'Zonas de riesgo: Ocultas'}
        </button>

        {!mobileControls && <>
        {/* Locate Me */}
        <button
          onClick={handleLocateMe}
          disabled={userGpsLoading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold shadow-md bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 active:scale-95 transition-all"
          title="Centrar en mi ubicación GPS"
        >
          <LocateFixed className={`w-3.5 h-3.5 text-blue-600 ${userGpsLoading ? 'animate-spin' : ''}`} />
          {userGpsLoading ? 'Buscando GPS...' : 'Mi ubicación'}
        </button>

        {/* Reset View */}
        <button
          onClick={handleResetToLima}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold shadow-md bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 active:scale-95 transition-all"
          title="Restablecer vista a Lima Metropolitana"
        >
          <Compass className="w-3.5 h-3.5 text-slate-500" />
          Lima Metropolitana
        </button>
        </>}
      </div>

      {locationControl && createPortal(
        <button type="button" onClick={handleLocateMe} disabled={userGpsLoading}
          aria-label={userGpsLoading ? 'Buscando ubicación' : 'Mi ubicación'}
          title="Mi ubicación"
          className="grid h-8 w-8 place-items-center rounded-sm bg-white text-blue-700 hover:bg-blue-50 focus-visible:outline-blue-600">
          <LocateFixed aria-hidden="true" className={`h-5 w-5 ${userGpsLoading ? 'animate-spin' : ''}`} />
        </button>, locationControl
      )}

      {/* Map Legend */}
      {showLegend && <div className="hidden sm:flex absolute bottom-5 right-4 z-20 bg-white/95 backdrop-blur-sm px-3.5 py-2.5 rounded-xl shadow-md border border-slate-200 text-[11px] items-center gap-4 text-slate-700">
        <RiskLegend />
      </div>}
    </div>
  );
};
