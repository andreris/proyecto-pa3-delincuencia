import React, { useState, useEffect } from 'react';
import { useIncidents } from '../../context/IncidentContext';
import { useAuth } from '../../context/AuthContext';
import { LeafletMap } from '../Map/LeafletMap';
import { IncidentReport, PreventiveRoute } from '../../types';
import { DEMO_PREVENTIVE_ROUTES, PERU_DISTRICTS } from '../../data/demoData';
import { PWAInstallButton } from '../PWA/PWAInstallButton';
import {
  MapPin,
  Route,
  Plus,
  PhoneCall,
  Shield,
  Layers,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  Compass,
  Bell,
  Share2,
  AlertTriangle,
  LocateFixed,
  ChevronRight,
  User,
  Users,
  ShieldCheck,
  Radio,
  Smartphone,
  Maximize2,
  Minimize2
} from 'lucide-react';

interface MobileAppShellProps {
  onOpenReportModal: () => void;
  onOpenSosModal: () => void;
  onToggleFullWebMode?: () => void;
  isFramedSimulator?: boolean;
}

type MobileTab = 'map' | 'routes' | 'sos' | 'community' | 'profile';

export const MobileAppShell: React.FC<MobileAppShellProps> = ({
  onOpenReportModal,
  onOpenSosModal,
  onToggleFullWebMode,
  isFramedSimulator = false
}) => {
  const {
    incidents,
    publicIncidents,
    filteredIncidents,
    filters,
    setFilters,
    selectedIncident,
    setSelectedIncident,
    mapCenter,
    setMapCenter,
    trustedContacts,
    verifyIncident,
    discardIncident,
    isDemoMode
  } = useIncidents();

  const { currentUser, isModerator, switchUserPersona } = useAuth();

  const [activeTab, setActiveTab] = useState<MobileTab>('map');
  const [selectedRoute, setSelectedRoute] = useState<PreventiveRoute>(DEMO_PREVENTIVE_ROUTES[0]);
  const [showFiltersSheet, setShowFiltersSheet] = useState(false);
  const [bottomListExpanded, setBottomListExpanded] = useState(false);
  const [simulatedAlert, setSimulatedAlert] = useState<string | null>(
    '🚨 Alerta Preventiva: Se registraron 2 incidentes recientes en Av. Túpac Amaru (Comas).'
  );
  const [currentTime, setCurrentTime] = useState('09:41');

  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: false })
      );
    };
    updateClock();
    const timer = setInterval(updateClock, 30000);
    return () => clearInterval(timer);
  }, []);

  const handleSelectIncidentFromSheet = (item: IncidentReport) => {
    setSelectedIncident(item);
    setMapCenter([item.approxLocation.lat, item.approxLocation.lng]);
    setBottomListExpanded(false);
  };

  return (
    <div className="flex flex-col h-full w-full bg-[#0B1F3A] text-white select-none relative overflow-hidden font-sans">
      {/* 1. NATIVE STATUS BAR (iOS / Android style) */}
      <div className="h-9 px-5 flex items-center justify-between text-xs font-semibold text-slate-200 z-30 shrink-0 bg-[#0B1F3A]/90 backdrop-blur-md">
        <span>{currentTime}</span>
        {/* Dynamic Island / Pill Camera Notch */}
        <div className="w-24 h-4 bg-black/60 rounded-full flex items-center justify-center gap-1.5 border border-white/10">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-ping"></span>
          <span className="text-[9px] text-blue-300 font-mono tracking-tighter">Vigila.pe</span>
        </div>
        <div className="flex items-center gap-1.5 text-[11px]">
          <span>5G</span>
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 3c-4.97 0-9 4.03-9 9 0 2.12.74 4.07 1.97 5.61L4.35 18.9c-.39.39-.39 1.02 0 1.41.39.39 1.02.39 1.41 0l1.29-1.29C8.59 19.64 10.22 20 12 20c4.97 0 9-4.03 9-9s-4.03-9-9-9zm0 15c-3.31 0-6-2.69-6-6s2.69-6 6-6 6 2.69 6 6-2.69 6-6 6z"/>
          </svg>
          <div className="w-5 h-2.5 rounded-xs border border-white/80 p-0.5 flex items-center">
            <div className="h-full w-full bg-emerald-400 rounded-2xs"></div>
          </div>
        </div>
      </div>

      {/* 2. TOP MOBILE APP HEADER */}
      <div className="h-14 px-4 flex items-center justify-between border-b border-blue-900/60 bg-[#0B1F3A] z-20 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-600 to-blue-500 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
            <Shield className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-extrabold text-base tracking-tight text-white">
                Vigila<span className="text-blue-400">.pe</span>
              </span>
              <span className="bg-blue-800 text-[9px] uppercase font-bold px-1.5 py-0.2 rounded text-blue-200">
                APP
              </span>
              {isDemoMode && (
                <span className="bg-amber-500/20 text-amber-200 text-[9px] font-bold px-1.5 py-0.2 rounded border border-amber-400/40">
                  Modo demo
                </span>
              )}
            </div>
            <p className="text-[10px] text-blue-300 font-medium">Lima Metropolitana</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* In-App PWA Install Badge */}
          <PWAInstallButton className="text-[10px] py-1 px-2" />

          {/* Quick SOS Trigger in Header */}
          <button
            onClick={onOpenSosModal}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-extrabold text-xs shadow-md shadow-red-600/30 animate-beacon-red"
            title="Activar Botón SOS"
          >
            <PhoneCall className="w-3.5 h-3.5" />
            SOS
          </button>
        </div>
      </div>

      {/* 3. SIMULATED PUSH NOTIFICATION / RADAR TOAST */}
      {simulatedAlert && (
        <div className="mx-3 mt-2 p-2.5 rounded-2xl bg-blue-950/90 border border-blue-700/80 shadow-lg flex items-center justify-between text-xs z-20 animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-blue-600 flex items-center justify-center text-white shrink-0">
              <Radio className="w-3.5 h-3.5 animate-pulse text-amber-300" />
            </div>
            <span className="text-[11px] text-blue-100 leading-tight line-clamp-1">
              {simulatedAlert}
            </span>
          </div>
          <button
            onClick={() => setSimulatedAlert(null)}
            className="text-blue-300 hover:text-white text-xs px-1 font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* 4. MAIN TAB SCREEN CONTENT */}
      <div className="flex-1 relative overflow-hidden bg-[#F8FAFC] text-[#0F172A]">
        {/* TAB 1: MAP VIEW */}
        {activeTab === 'map' && (
          <div className="h-full w-full relative">
            <LeafletMap
              incidents={filteredIncidents}
              selectedIncident={selectedIncident}
              onSelectIncident={setSelectedIncident}
              center={mapCenter}
              zoom={12}
              className="h-full w-full"
            />

            {/* Floating Search & Filter Pill on Top of Map */}
            <div className="absolute top-3 left-3 right-3 z-20 flex items-center gap-2">
              <div className="flex-1 bg-white/95 backdrop-blur-md rounded-2xl shadow-lg border border-slate-200 px-3 py-2 flex items-center gap-2">
                <Search className="w-4 h-4 text-slate-400 shrink-0" />
                <input
                  type="text"
                  placeholder="Buscar calle o distrito en Lima..."
                  value={filters.search}
                  onChange={e => setFilters(prev => ({ ...prev, search: e.target.value }))}
                  className="w-full text-xs bg-transparent focus:outline-none text-slate-800"
                />
              </div>

              <button
                onClick={() => setShowFiltersSheet(true)}
                className={`p-2.5 rounded-2xl shadow-lg border transition-all ${
                  filters.district !== 'all' || filters.riskLevel !== 'all' || filters.category !== 'all'
                    ? 'bg-blue-600 text-white border-blue-700'
                    : 'bg-white/95 text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
                title="Filtros"
              >
                <Filter className="w-4 h-4" />
              </button>
            </div>

            {/* Bottom Floating Drawer for Quick Incident Peek */}
            <div
              className={`absolute left-0 right-0 bottom-0 z-20 bg-white rounded-t-3xl shadow-2xl border-t border-slate-200 transition-all duration-300 ease-in-out ${
                bottomListExpanded ? 'h-[72%]' : 'h-24'
              }`}
            >
              {/* Drag handle */}
              <div
                onClick={() => setBottomListExpanded(prev => !prev)}
                className="py-2.5 flex flex-col items-center justify-center cursor-pointer border-b border-slate-100"
              >
                <div className="w-10 h-1 bg-slate-300 rounded-full mb-1"></div>
                <div className="flex items-center justify-between w-full px-4 text-xs">
                  <span className="font-bold text-slate-800 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    {filteredIncidents.length} incidentes en el mapa
                  </span>
                  <span className="text-blue-600 font-semibold text-[11px] flex items-center gap-1">
                    {bottomListExpanded ? 'Ocultar lista' : 'Deslizar para ver reportes'}
                    <ChevronRight className={`w-3.5 h-3.5 transition-transform ${bottomListExpanded ? '-rotate-90' : 'rotate-90'}`} />
                  </span>
                </div>
              </div>

              {/* Scrollable incidents inside drawer */}
              <div className="p-3 space-y-2 h-[calc(100%-48px)] overflow-y-auto">
                {filteredIncidents.map(item => (
                  <div
                    key={item.id}
                    onClick={() => handleSelectIncidentFromSheet(item)}
                    className="p-3 rounded-2xl bg-slate-50 hover:bg-blue-50/40 border border-slate-200 cursor-pointer transition-all"
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-blue-100 text-blue-800">
                        {item.category.replace('_', ' ')}
                      </span>
                      <span className="text-[10px] text-slate-400 font-medium">{item.time}</span>
                    </div>
                    <h4 className="font-bold text-xs text-slate-900 leading-snug">{item.title}</h4>
                    <p className="text-[11px] text-slate-500 truncate mt-0.5">
                      📍 {item.approxLocation.address} ({item.district})
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: PREVENTIVE ROUTES VIEW */}
        {activeTab === 'routes' && (
          <div className="h-full flex flex-col bg-slate-50 overflow-y-auto p-4 space-y-4">
            <div className="bg-[#0B1F3A] text-white p-4 rounded-2xl shadow-md">
              <span className="text-[10px] uppercase font-bold text-blue-300">Rutas de Menor Exposición</span>
              <h2 className="text-lg font-extrabold">Planificador Móvil</h2>
              <p className="text-xs text-blue-200 mt-0.5">
                Calcula trayectos con menor densidad de incidentes y vías monitoreadas.
              </p>
            </div>

            {/* Route selector buttons */}
            <div className="space-y-2.5">
              <label className="text-xs font-bold text-slate-700 block">Corredores Disponibles:</label>
              {DEMO_PREVENTIVE_ROUTES.map(route => {
                const isSelected = selectedRoute.id === route.id;
                return (
                  <button
                    key={route.id}
                    onClick={() => setSelectedRoute(route)}
                    className={`w-full text-left p-3.5 rounded-2xl border transition-all text-xs ${
                      isSelected
                        ? 'border-blue-600 bg-white shadow-md ring-2 ring-blue-500/20'
                        : 'border-slate-200 bg-white/70'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-slate-900">{route.name}</span>
                      <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                        {route.exposureLevel === 'menor' ? 'Menor exposición' : 'Exposición media'}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-slate-500 text-[11px] mt-1">
                      <span>📏 {route.distanceKm} km</span>
                      <span>⏱️ ~{route.durationMinutes} min</span>
                      <span>🛡️ {route.incidentCountNear} incidentes</span>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Mini route preview map */}
            <div className="h-56 rounded-2xl overflow-hidden border border-slate-200 shadow-sm relative">
              <LeafletMap
                incidents={publicIncidents}
                selectedIncident={null}
                activeRoute={selectedRoute}
                className="h-full w-full"
              />
            </div>

            {/* Safety Tips Card */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200 text-xs space-y-2">
              <span className="font-bold text-slate-800 flex items-center gap-1.5">
                <Shield className="w-4 h-4 text-blue-600" />
                Recomendaciones para este trayecto:
              </span>
              <ul className="space-y-1.5 text-slate-600 text-[11px]">
                {selectedRoute.safetyNotes.map((note, idx) => (
                  <li key={idx} className="flex items-start gap-1.5">
                    <span className="text-blue-600 font-bold">•</span>
                    <span>{note}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* TAB 3: SOS & TRUSTED CONTACTS */}
        {activeTab === 'sos' && (
          <div className="h-full flex flex-col bg-slate-50 overflow-y-auto p-4 space-y-4">
            <div className="bg-red-600 text-white p-5 rounded-3xl shadow-lg text-center space-y-2">
              <span className="text-[10px] font-bold uppercase tracking-wider bg-white/20 px-3 py-1 rounded-full">
                Centro de Emergencia Personal
              </span>
              <h2 className="text-xl font-extrabold">Botón SOS Comunitario</h2>
              <p className="text-xs text-red-100 max-w-xs mx-auto">
                Despacha un mensaje con tu geolocalización actual a tus {trustedContacts.length} contactos de auxilio.
              </p>
              <div className="pt-2">
                <button
                  onClick={onOpenSosModal}
                  className="w-full py-3 px-4 rounded-2xl bg-white text-red-700 font-extrabold text-sm shadow-md active:scale-95 transition-all flex items-center justify-center gap-2"
                >
                  <PhoneCall className="w-4 h-4" />
                  ACTIVAR ALERTA SOS
                </button>
              </div>
            </div>

            {/* Trusted Contacts in App */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200 space-y-3">
              <span className="font-bold text-xs text-slate-800 flex items-center gap-1.5">
                <Users className="w-4 h-4 text-blue-600" />
                Tus contactos de auxilio ({trustedContacts.length}/3):
              </span>
              {trustedContacts.map(c => (
                <div key={c.id} className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between text-xs">
                  <div>
                    <p className="font-bold text-slate-900">{c.name}</p>
                    <p className="text-[11px] text-slate-500">{c.relationship} • {c.phone}</p>
                  </div>
                  <span className="text-[10px] text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded-full">
                    Activo
                  </span>
                </div>
              ))}
            </div>

            {/* Peruvian Hotlines */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200 space-y-2">
              <span className="font-bold text-xs text-slate-800">Líneas directas de emergencia:</span>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <a href="tel:105" className="p-2.5 rounded-xl bg-blue-900 text-white font-bold text-center">
                  PNP: 105
                </a>
                <a href="tel:116" className="p-2.5 rounded-xl bg-red-700 text-white font-bold text-center">
                  Bomberos: 116
                </a>
                <a href="tel:106" className="p-2.5 rounded-xl bg-amber-700 text-white font-bold text-center">
                  SAMU: 106
                </a>
                <a href="tel:013185050" className="p-2.5 rounded-xl bg-emerald-800 text-white font-bold text-center">
                  Serenazgo Lima
                </a>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: COMMUNITY & MODERATION */}
        {activeTab === 'community' && (
          <div className="h-full flex flex-col bg-slate-50 overflow-y-auto p-4 space-y-4">
            <div className="bg-[#0B1F3A] text-white p-4 rounded-2xl shadow-md">
              <span className="text-[10px] uppercase font-bold text-amber-400">Validación Cívica</span>
              <h2 className="text-lg font-extrabold">Moderación Comunitaria</h2>
              <p className="text-xs text-blue-200 mt-0.5">
                Aprueba o descarta reportes para mantener segura la información de Lima.
              </p>
            </div>

            {/* Quick role toggle */}
            <div className="bg-white p-3.5 rounded-2xl border border-slate-200 flex items-center justify-between text-xs">
              <div>
                <p className="font-bold text-slate-800">Rol actual: {currentUser?.role === 'moderator' ? '🛡️ Moderador Oficial' : 'Ciudadano'}</p>
                <p className="text-[11px] text-slate-500">Puedes probar las facultades de moderador.</p>
              </div>
              <button
                onClick={() => switchUserPersona('moderador')}
                className="px-3 py-1.5 rounded-xl bg-amber-500 text-slate-900 font-bold text-xs"
              >
                Activar
              </button>
            </div>

            {/* Pending queue preview */}
            <div className="space-y-2">
              <span className="text-xs font-bold text-slate-700 block">Reportes pendientes en tu zona:</span>
              {incidents
                .filter(i => i.status === 'Pendiente de validación')
                .slice(0, 3)
                .map(item => (
                  <div key={item.id} className="p-3.5 rounded-2xl bg-white border border-slate-200 space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900">{item.title}</span>
                      <span className="text-[10px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full font-bold">
                        Por validar
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600">{item.description}</p>
                    <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
                      <button
                        onClick={() => verifyIncident(item.id, currentUser?.name || 'Moderador')}
                        className="flex-1 py-1.5 rounded-xl bg-emerald-600 text-white font-bold text-xs"
                      >
                        ✓ Aprobar
                      </button>
                      <button
                        onClick={() => discardIncident(item.id, currentUser?.name || 'Moderador')}
                        className="flex-1 py-1.5 rounded-xl bg-slate-100 text-slate-700 font-semibold text-xs"
                      >
                        ✕ Descartar
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* TAB 5: PROFILE VIEW */}
        {activeTab === 'profile' && (
          <div className="h-full flex flex-col bg-slate-50 overflow-y-auto p-4 space-y-4">
            <div className="bg-[#0B1F3A] text-white p-5 rounded-3xl shadow-md text-center space-y-2">
              <div className="w-14 h-14 rounded-2xl bg-blue-600 mx-auto flex items-center justify-center font-extrabold text-xl">
                {currentUser?.avatarInitials || 'VP'}
              </div>
              <h3 className="font-extrabold text-base">{currentUser?.name}</h3>
              <p className="text-xs text-blue-200">{currentUser?.district} • {currentUser?.userType}</p>
            </div>

            {/* Quick persona switcher */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200 space-y-2">
              <span className="text-xs font-bold text-slate-800 block">Cambiar tipo de usuario:</span>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <button
                  onClick={() => switchUserPersona('peaton')}
                  className="p-2 rounded-xl border border-slate-200 text-center font-medium hover:bg-slate-50"
                >
                  🚶 Peatón
                </button>
                <button
                  onClick={() => switchUserPersona('conductor')}
                  className="p-2 rounded-xl border border-slate-200 text-center font-medium hover:bg-slate-50"
                >
                  🚗 Conductor
                </button>
                <button
                  onClick={() => switchUserPersona('comerciante')}
                  className="p-2 rounded-xl border border-slate-200 text-center font-medium hover:bg-slate-50"
                >
                  🏪 Comerciante
                </button>
              </div>
            </div>

            {/* PWA Install Promo */}
            <div className="bg-gradient-to-br from-blue-900 to-indigo-900 text-white p-4 rounded-2xl space-y-2">
              <div className="flex items-center gap-2">
                <Smartphone className="w-5 h-5 text-blue-300" />
                <h4 className="font-bold text-sm">Instalar Vigila.pe App</h4>
              </div>
              <p className="text-xs text-blue-100">
                Instala esta app en tu pantalla de inicio para recibir alertas y acceder sin conexión a internet.
              </p>
              <div className="pt-1">
                <PWAInstallButton variant="prominent" />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 5. NATIVE BOTTOM NAVIGATION BAR (TAB BAR) */}
      <div className="h-16 bg-white border-t border-slate-200 px-3 flex items-center justify-between text-slate-600 z-30 shrink-0 shadow-lg">
        {/* Tab 1: Map */}
        <button
          onClick={() => setActiveTab('map')}
          className={`flex-1 flex flex-col items-center justify-center py-1 transition-all ${
            activeTab === 'map' ? 'text-blue-600 font-bold' : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          <MapPin className={`w-5 h-5 ${activeTab === 'map' ? 'scale-110' : ''}`} />
          <span className="text-[10px] mt-0.5">Mapa</span>
        </button>

        {/* Tab 2: Routes */}
        <button
          onClick={() => setActiveTab('routes')}
          className={`flex-1 flex flex-col items-center justify-center py-1 transition-all ${
            activeTab === 'routes' ? 'text-blue-600 font-bold' : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          <Route className={`w-5 h-5 ${activeTab === 'routes' ? 'scale-110' : ''}`} />
          <span className="text-[10px] mt-0.5">Rutas</span>
        </button>

        {/* Tab 3: Central ELEVATED ACTION BUTTON: REPORTAR */}
        <div className="flex-1 flex flex-col items-center justify-center relative -top-3">
          <button
            onClick={onOpenReportModal}
            className="w-12 h-12 rounded-full bg-gradient-to-tr from-blue-700 to-blue-500 text-white flex items-center justify-center shadow-xl shadow-blue-600/40 border-2 border-white active:scale-95 transition-transform"
            title="Registrar nuevo reporte"
          >
            <Plus className="w-6 h-6 stroke-[3]" />
          </button>
          <span className="text-[10px] font-bold text-blue-700 mt-0.5">Reportar</span>
        </div>

        {/* Tab 4: SOS */}
        <button
          onClick={() => setActiveTab('sos')}
          className={`flex-1 flex flex-col items-center justify-center py-1 transition-all ${
            activeTab === 'sos' ? 'text-red-600 font-bold' : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          <PhoneCall className={`w-5 h-5 ${activeTab === 'sos' ? 'scale-110 text-red-600' : ''}`} />
          <span className="text-[10px] mt-0.5">SOS</span>
        </button>

        {/* Tab 5: Community / Profile */}
        <button
          onClick={() => setActiveTab('profile')}
          className={`flex-1 flex flex-col items-center justify-center py-1 transition-all ${
            activeTab === 'profile' ? 'text-blue-600 font-bold' : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          <User className={`w-5 h-5 ${activeTab === 'profile' ? 'scale-110' : ''}`} />
          <span className="text-[10px] mt-0.5">Perfil</span>
        </button>
      </div>

      {/* 6. MOBILE FILTERS BOTTOM SHEET (when opened) */}
      {showFiltersSheet && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white rounded-t-3xl p-5 shadow-2xl text-slate-800 space-y-4 animate-in slide-in-from-bottom duration-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-extrabold text-sm text-slate-900">Filtros de Geoseguridad</h3>
              <button
                onClick={() => setShowFiltersSheet(false)}
                className="text-xs font-bold text-blue-600"
              >
                Listo
              </button>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Distrito:</label>
              <select
                value={filters.district}
                onChange={e => setFilters(prev => ({ ...prev, district: e.target.value }))}
                className="w-full text-xs p-2.5 rounded-xl border border-slate-200 bg-white"
              >
                {PERU_DISTRICTS.map(d => (
                  <option key={d} value={d === 'Todos los distritos' ? 'all' : d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Nivel de riesgo:</label>
              <div className="grid grid-cols-3 gap-2">
                {['all', 'alto', 'medio', 'informativo'].map(r => (
                  <button
                    key={r}
                    onClick={() => setFilters(prev => ({ ...prev, riskLevel: r }))}
                    className={`py-2 px-1 text-xs rounded-xl border font-bold capitalize ${
                      filters.riskLevel === r
                        ? 'bg-blue-50 border-blue-600 text-blue-800'
                        : 'border-slate-200 text-slate-600'
                    }`}
                  >
                    {r === 'all' ? 'Todos' : r}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={() => {
                setFilters({
                  category: 'all',
                  district: 'all',
                  riskLevel: 'all',
                  timeRange: 'all',
                  status: 'all',
                  search: ''
                });
                setShowFiltersSheet(false);
              }}
              className="w-full py-2.5 text-xs text-slate-500 hover:text-slate-800 font-semibold"
            >
              Restablecer todos los filtros
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
