import React, { useState } from 'react';
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

export const PreventiveRoutesView: React.FC = () => {
  const { incidents } = useIncidents();
  const [selectedRoute, setSelectedRoute] = useState<PreventiveRoute>(DEMO_PREVENTIVE_ROUTES[0]);
  const [activeTab, setActiveTab] = useState<'main' | 'alt'>('main');

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
    <div className="flex-1 flex flex-col lg:flex-row h-full overflow-hidden bg-slate-50">
      {/* Sidebar Controls & Itinerary Analysis */}
      <div className="w-full lg:w-[420px] bg-white border-r border-slate-200 flex flex-col h-auto lg:h-full overflow-y-auto">
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
              const isSelected = selectedRoute.id === route.id;
              return (
                <button
                  key={route.id}
                  onClick={() => setSelectedRoute(route)}
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
        <div className="p-4 border-t border-slate-100 flex-1 space-y-4">
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
        </div>
      </div>

      {/* Map Interactive Canvas */}
      <div className="flex-1 relative min-h-[450px] lg:min-h-full">
        {/* Floating Route Legend on Map */}
        <div className="absolute top-4 left-4 z-20 bg-white/95 backdrop-blur-sm p-3 rounded-2xl shadow-lg border border-slate-200 text-xs space-y-2 max-w-xs">
          <p className="font-bold text-slate-900 flex items-center gap-1.5">
            <Compass className="w-4 h-4 text-blue-600" />
            Trazado en Leaflet:
          </p>
          <div className="flex items-center gap-2">
            <span className="w-6 h-1.5 rounded-full bg-blue-600"></span>
            <span className="font-semibold text-slate-700">Ruta preventiva (Línea sólida azul)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-6 h-1.5 rounded-full border-t-2 border-dashed border-amber-600"></span>
            <span className="text-slate-500">Ruta alternativa (Línea punteada ámbar)</span>
          </div>
        </div>

        <LeafletMap
          incidents={incidents}
          selectedIncident={null}
          activeRoute={selectedRoute}
          showRiskZones={true}
          className="h-full w-full"
        />
      </div>
    </div>
  );
};
