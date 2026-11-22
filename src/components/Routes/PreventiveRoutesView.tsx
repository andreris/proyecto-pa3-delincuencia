import React, { useRef, useState } from 'react';
import { PreventiveRoute } from '../../types';
import { DEMO_PREVENTIVE_ROUTES } from '../../data/demoData';
import { LeafletMap } from '../Map/LeafletMap';
import { useIncidents } from '../../context/IncidentContext';
import {
  Route,
  Navigation,
  ShieldCheck,
  AlertTriangle,
  Clock,
  ArrowRight,
  Sun,
  Shield,
  Info,
  ChevronRight,
  Compass
} from 'lucide-react';

type Point = {lat: number; lng: number};
type Candidate = {path: [number, number][]; minutes: number; km: number; reports: number};
type DrivingRoute = {geometry: {coordinates: [number, number][]}; duration: number; distance: number};

// Distancia al segmento en metros, con proyección local a la latitud del reporte.
function nearPath(point: Point, path: [number, number][]) {
  const scale = 111320 * Math.cos(point.lat * Math.PI / 180);
  return path.some(([lat, lng], i) => {
    if (!i) return false;
    const [prevLat, prevLng] = path[i - 1];
    const x = (prevLng - point.lng) * scale, y = (prevLat - point.lat) * 111320;
    const dx = (lng - prevLng) * scale, dy = (lat - prevLat) * 111320;
    const t = Math.max(0, Math.min(1, -(x * dx + y * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(x + t * dx, y + t * dy) <= 300;
  });
}

export const PreventiveRoutesView: React.FC = () => {
  const { publicIncidents } = useIncidents();
  const [selectedRoute, setSelectedRoute] = useState<PreventiveRoute>(DEMO_PREVENTIVE_ROUTES[0]);
  const [points, setPoints] = useState<Partial<Record<'Inicio' | 'Llegada', Point>>>({});
  const [picking, setPicking] = useState<'Inicio' | 'Llegada' | null>(null);
  const [options, setOptions] = useState<Candidate[]>([]);
  const [chosen, setChosen] = useState(0);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const request = useRef(0);
  const mapPanel = useRef<HTMLDivElement>(null);
  const selected = options[chosen];
  function setPoint(key: 'Inicio' | 'Llegada', point: Point) {
    request.current++;
    setBusy(false);
    setOptions([]);
    setMessage('');
    setPicking(null);
    const next = {...points, [key]: point};
    setPoints(next);
    if (next.Inicio && next.Llegada) void calculate(next);
    else if (key === 'Inicio') {
      setPicking('Llegada');
      setMessage('Marca la llegada en el mapa.');
    }
  }
  async function calculate(endpoints = points) {
    const {Inicio, Llegada} = endpoints;
    if (!Inicio || !Llegada) return;
    const id = ++request.current;
    setPicking(null);
    setBusy(true);
    setOptions([]);
    setMessage('');
    try {
      const coords = [Inicio, Llegada].map(p => `${p.lng},${p.lat}`).join(';');
      const response = await fetch(`https://routing.openstreetmap.de/routed-car/route/v1/driving/${coords}?alternatives=true&geometries=geojson&overview=full&radiuses=500;500`, {signal: AbortSignal.timeout(18000)});
      if (!response.ok) throw Error();
      const data = await response.json();
      if (data.code !== 'Ok' || !data.routes?.length) throw Error();
      const routes: Candidate[] = data.routes.filter((r: DrivingRoute) => r.distance > 0).map((r: DrivingRoute) => {
        const path = r.geometry.coordinates.map(([lng, lat]): [number, number] => [lat, lng]);
        return {path, minutes: r.duration / 60, km: r.distance / 1000,
          reports: publicIncidents.filter(i => i.status === 'Verificado' && !i.isDemo && nearPath(i.approxLocation, path)).length};
      });
      if (!routes.length) throw Error();
      routes.sort((a, b) => a.minutes - b.minutes);
      const quieter = routes.reduce((best, r) => r.reports < best.reports ? r : best);
      if (request.current !== id) return;
      setOptions(quieter === routes[0] ? [routes[0]] : [routes[0], quieter]);
      setChosen(quieter === routes[0] ? 0 : 1);
      if (routes.length === 1) setMessage('El servicio encontró un solo trayecto.');
      else if (quieter === routes[0]) setMessage('La más rápida también tiene el menor número de reportes entre las alternativas.');
    } catch {
      if (request.current === id) setMessage('No se pudo calcular la ruta. Acerca los puntos a una vía transitable e inténtalo de nuevo.');
    } finally {
      if (request.current === id) setBusy(false);
    }
  }
  function locate() {
    const id = ++request.current;
    setBusy(false);
    setPicking(null);
    setMessage('Buscando tu ubicación…');
    if (!navigator.geolocation) {setMessage('Selecciona el inicio en el mapa.'); return;}
    navigator.geolocation.getCurrentPosition(p => {
      if (id === request.current) setPoint('Inicio', {lat:p.coords.latitude, lng:p.coords.longitude});
    }, () => {if (id === request.current) setMessage('Ubicación no disponible. Marca el inicio en el mapa.');}, {timeout:10000});
  }

  const getExposureBadge = (level: 'menor' | 'medio' | 'mayor') => {
    switch (level) {
      case 'menor':
        return (
          <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-800 bg-emerald-100 border border-emerald-300 px-3 py-1 rounded-full shadow-xs">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            Menor exposición
          </span>
        );
      case 'medio':
        return (
          <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-800 bg-amber-100 border border-amber-300 px-3 py-1 rounded-full shadow-xs">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            Exposición media
          </span>
        );
      case 'mayor':
        return (
          <span className="inline-flex items-center gap-1 text-xs font-bold text-red-800 bg-red-100 border border-red-300 px-3 py-1 rounded-full shadow-xs">
            <AlertTriangle className="w-4 h-4 text-red-600" />
            Mayor exposición
          </span>
        );
    }
  };

  return (
    <div className="flex-1 flex flex-col lg:flex-row h-full overflow-y-auto lg:overflow-hidden bg-slate-50">
      {/* Sidebar Controls & Itinerary Analysis */}
      <div className="w-full lg:w-[420px] bg-white border-r border-slate-200 flex flex-col h-auto lg:h-full shrink-0 lg:overflow-y-auto">
        <div className="p-5 border-b border-slate-100 bg-[#0B1F3A] text-white">
          <div className="flex items-center gap-2 mb-1.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white">
              <Route className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-bold text-base text-white">Rutas Preventivas</h2>
              <p className="text-xs text-blue-200">Planificador de desplazamiento seguro</p>
            </div>
          </div>
          <p className="text-xs text-slate-300 mt-2">
            Compara trayectos habituales frente a corredores con menor densidad de incidentes y mejor iluminación.
          </p>
        </div>

        <section className="p-4 space-y-3 border-b text-sm">
          <h3 className="font-bold">Planifica tu viaje en auto</h3>
          {(['Inicio', 'Llegada'] as const).map(key => (
            <div key={key} className="flex items-center justify-between gap-2">
              <div><strong>{key}</strong><div className="text-xs text-slate-600">{points[key] ? `${points[key]!.lat.toFixed(4)}, ${points[key]!.lng.toFixed(4)}` : 'Sin seleccionar'}</div></div>
              <button className="text-blue-700 font-semibold" onClick={() => {request.current++; setBusy(false); setPicking(key); mapPanel.current?.scrollIntoView({block:'nearest'}); setMessage(`Marca el punto de ${key.toLowerCase()} en el mapa.`);}}>Elegir en mapa</button>
            </div>
          ))}
          <button onClick={locate} className="text-blue-700 font-semibold">Usar mi ubicación como inicio</button>
          <p className="text-xs text-slate-600">Al marcar ambos puntos, se envían a OSRM para calcular tu ruta en auto.</p>
          <button onClick={() => void calculate()} disabled={busy || !points.Inicio || !points.Llegada} className="w-full rounded-xl bg-blue-600 text-white py-2 font-bold disabled:opacity-50">{busy ? 'Calculando…' : 'Calcular ruta'}</button>
          {options.map((r, i) => <button key={i} aria-pressed={chosen === i} onClick={() => setChosen(i)} className={`block w-full text-left border rounded-xl p-3 ${chosen === i ? 'bg-blue-50 border-blue-500' : ''}`}>
            <strong>{i === 0 ? 'Más rápida estimada' : 'Menos reportes cercanos'}</strong><br/>{Math.max(1,Math.round(r.minutes))} min · {r.km.toFixed(1)} km · {r.reports} reportes
          </button>)}
          {selected && <p className="text-xs">Se cuentan reportes verificados a 300 m del trayecto. El tiempo es estimado sin tráfico en vivo.</p>}
          <p role="status" className="text-xs text-slate-700">{message}</p>
        </section>

        {/* Mandatory Safety Notice */}
        <div className="m-4 p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold">Aviso legal y preventivo obligatorio</p>
            <p className="text-[11px] text-amber-800 mt-0.5">
              “Las rutas son solo referenciales y no garantizan seguridad”. Conduce y camina siempre atento a tu entorno.
            </p>
          </div>
        </div>

        {/* Route Selector Presets */}
        <div className="px-4 pb-3">
          <label className="block text-xs font-bold text-slate-800 mb-2">
            Seleccionar corredor metropolitano:
          </label>
          <div className="space-y-2">
            {DEMO_PREVENTIVE_ROUTES.map(route => {
              const isSelected = !selected && selectedRoute.id === route.id;
              return (
                <button
                  key={route.id}
                  onClick={() => {request.current++; setBusy(false); setPicking(null); setMessage(''); setOptions([]); setSelectedRoute(route);}}
                  className={`w-full text-left p-3 rounded-xl border transition-all text-xs ${
                    isSelected
                      ? 'border-blue-600 bg-blue-50/70 shadow-sm ring-2 ring-blue-500/20'
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-slate-900 truncate max-w-[220px]">
                      {route.name}
                    </span>
                    <span className="text-[10px] font-semibold text-blue-700 bg-blue-100/60 px-2 py-0.5 rounded">
                      {route.distanceKm} km
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-500 text-[11px]">
                    <Clock className="w-3 h-3 text-slate-400" />
                    <span>~{route.durationMinutes} min</span>
                    <span>•</span>
                    <span className="text-emerald-700 font-medium">Recomendada activa</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Selected Route Detailed Comparison Card */}
        {!selected && <div className="p-4 border-t border-slate-100 flex-1 space-y-4">
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">Evaluación del corredor:</span>
              {getExposureBadge(selectedRoute.exposureLevel)}
            </div>

            {/* Origin & Destination chips */}
            <div className="space-y-2 text-xs">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-emerald-600 text-white font-bold flex items-center justify-center text-[10px] shrink-0">
                  A
                </span>
                <span className="font-medium text-slate-700 truncate">{selectedRoute.origin.name}</span>
              </div>
              <div className="flex items-center gap-2 pl-3">
                <div className="w-0.5 h-3 bg-slate-300 ml-0.5"></div>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center text-[10px] shrink-0">
                  B
                </span>
                <span className="font-medium text-slate-700 truncate">{selectedRoute.destination.name}</span>
              </div>
            </div>

            {/* Metrics */}
            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200/80 text-xs">
              <div className="bg-white p-2.5 rounded-xl border border-slate-200">
                <p className="text-[10px] text-slate-400 font-medium">Iluminación de vía</p>
                <p className="font-bold text-slate-800">{selectedRoute.lightingQuality}</p>
              </div>
              <div className="bg-white p-2.5 rounded-xl border border-slate-200">
                <p className="text-[10px] text-slate-400 font-medium">Patrullaje integrado</p>
                <p className="font-bold text-slate-800 truncate">{selectedRoute.patrolFrequency}</p>
              </div>
            </div>

            {/* Incident density summary */}
            <div className="bg-white p-3 rounded-xl border border-slate-200 text-xs flex items-center justify-between">
              <span className="text-slate-600">Incidentes cercanos al corredor:</span>
              <span className="font-extrabold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
                {selectedRoute.incidentCountNear} reportados recientemente
              </span>
            </div>
          </div>

          {/* Safety Recommendations list */}
          <div>
            <h4 className="text-xs font-bold text-slate-800 mb-2 flex items-center gap-1.5">
              <Shield className="w-4 h-4 text-blue-600" />
              Recomendaciones para tu trayecto:
            </h4>
            <ul className="space-y-2 text-xs text-slate-600">
              {selectedRoute.safetyNotes.map((note, index) => (
                <li key={index} className="flex items-start gap-2 bg-white p-2.5 rounded-xl border border-slate-200">
                  <ChevronRight className="w-3.5 h-3.5 text-blue-600 shrink-0 mt-0.5" />
                  <span>{note}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>}
      </div>

      {/* Map Interactive Canvas */}
      <div ref={mapPanel} className="flex-1 relative min-h-[450px] lg:min-h-full">
        {/* Floating Route Legend on Map */}
        <div className="absolute top-4 left-4 z-20 bg-white/95 backdrop-blur-sm p-3 rounded-2xl shadow-lg border border-slate-200 text-xs space-y-2 max-w-xs">
          <p className="font-bold text-slate-900 flex items-center gap-1.5">
            <Compass className="w-4 h-4 text-blue-600" />
            Trazado en Leaflet:
          </p>
          <div className="flex items-center gap-2">
            <span className="w-6 h-1.5 rounded-full bg-blue-600"></span>
            <span className="font-semibold text-slate-700">Ruta seleccionada (línea azul)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-6 h-1.5 rounded-full border-t-2 border-dashed border-amber-600"></span>
            <span className="text-slate-500">Ruta alternativa (Línea punteada ámbar)</span>
          </div>
        </div>

        {picking && <p className="absolute bottom-14 left-3 z-[500] bg-white rounded-lg shadow p-2 text-sm">Toca el mapa para marcar {picking.toLowerCase()}.</p>}
        <LeafletMap
          incidents={publicIncidents}
          selectedIncident={null}
          pickedCoords={picking === "Llegada" ? points.Inicio : undefined}
          onPickCoordinate={picking ? point => setPoint(picking, point) : undefined}
          activeRoute={selected && points.Inicio && points.Llegada ? {
            origin: {...points.Inicio, name:'Inicio'}, destination: {...points.Llegada, name:'Llegada'},
            mainPath:selected.path, altPath:options.find(r => r !== selected)?.path ?? []
          } : selectedRoute}
          showRiskZones={true}
          className="h-full w-full"
        />
      </div>
    </div>
  );
};
