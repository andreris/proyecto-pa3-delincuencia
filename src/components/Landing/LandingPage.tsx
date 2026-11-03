import React from 'react';
import {
  Shield,
  MapPin,
  Route,
  PhoneCall,
  UserCheck,
  AlertTriangle,
  ArrowRight,
  ShieldAlert,
  Car,
  Store,
  Footprints,
  Eye,
  CheckCircle2,
  Lock
} from 'lucide-react';
import { useIncidents } from '../../context/IncidentContext';

interface LandingPageProps {
  onGoToMap: () => void;
  onOpenRegister: () => void;
  onGoToRoutes: () => void;
  onGoToSos: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({
  onGoToMap,
  onOpenRegister,
  onGoToRoutes,
  onGoToSos
}) => {
  const { incidents } = useIncidents();

  return (
    <div className="flex-1 bg-white overflow-y-auto">
      {/* Hero Section */}
      <section className="bg-gradient-to-b from-[#0B1F3A] via-[#0F294D] to-[#0B1F3A] text-white py-14 sm:py-20 px-4 sm:px-6 relative overflow-hidden">
        {/* Subtle grid pattern background */}
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#2563EB_1px,transparent_1px)] [background-size:16px_16px] pointer-events-none" />

        <div className="max-w-5xl mx-auto text-center relative z-10 space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-900/80 border border-blue-700/60 text-blue-200 text-xs font-semibold shadow-inner">
            <Shield className="w-3.5 h-3.5 text-blue-400" />
            <span>Geoseguridad Ciudadana Comunitaria en el Perú</span>
          </div>

          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-white leading-tight">
            Infórmate, planifica y muévete con{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-sky-200">
              mayor prevención
            </span>
          </h1>

          <p className="text-sm sm:text-base lg:text-lg text-slate-300 max-w-2xl mx-auto leading-relaxed">
            Vigila.pe es la plataforma colaborativa para ciudadanos, conductores y comerciantes de Lima y provincias. Consulta reportes geolocalizados, planifica rutas y activa tu red de auxilio.
          </p>

          {/* Mandatory emergency notice */}
          <div className="max-w-xl mx-auto bg-amber-500/10 border border-amber-400/30 rounded-2xl p-3 text-xs text-amber-200 flex items-center justify-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              “La información es referencial y no reemplaza a los servicios de emergencia de la Policía Nacional (105) ni serenazgo”.
            </span>
          </div>

          {/* Hero CTAs */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <button
              onClick={onGoToMap}
              className="w-full sm:w-auto px-7 py-3.5 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-extrabold text-sm shadow-xl shadow-blue-600/30 active:scale-95 transition-all flex items-center justify-center gap-2"
            >
              <MapPin className="w-4 h-4" />
              Ver mapa de incidentes
            </button>

            <button
              onClick={onOpenRegister}
              className="w-full sm:w-auto px-7 py-3.5 rounded-2xl bg-white/10 hover:bg-white/20 text-white border border-white/20 font-bold text-sm backdrop-blur-sm active:scale-95 transition-all flex items-center justify-center gap-2"
            >
              <UserCheck className="w-4 h-4 text-blue-300" />
              Crear cuenta ciudadana
            </button>
          </div>

          {/* Quick live indicators */}
          <div className="pt-8 grid grid-cols-2 sm:grid-cols-4 gap-4 max-w-3xl mx-auto border-t border-blue-900/60 text-left">
            <div>
              <p className="text-2xl font-extrabold text-white">{incidents.length}</p>
              <p className="text-xs text-blue-300">Reportes activos en Lima</p>
            </div>
            <div>
              <p className="text-2xl font-extrabold text-white">6 distritos</p>
              <p className="text-xs text-blue-300">Comas, SJL, Surco, Callao, Miraflores...</p>
            </div>
            <div>
              <p className="text-2xl font-extrabold text-emerald-400">100%</p>
              <p className="text-xs text-blue-300">Privacidad y anonimato</p>
            </div>
            <div>
              <p className="text-2xl font-extrabold text-sky-400">OpenStreetMap</p>
              <p className="text-xs text-blue-300">Cartografía libre y abierta</p>
            </div>
          </div>
        </div>
      </section>

      {/* 4 Core Pillars Section */}
      <section className="py-16 px-4 sm:px-6 max-w-7xl mx-auto">
        <div className="text-center space-y-2 mb-12">
          <span className="text-xs font-bold uppercase tracking-wider text-blue-600 bg-blue-50 px-3 py-1 rounded-full border border-blue-200">
            Funcionalidades principales
          </span>
          <h2 className="text-2xl sm:text-4xl font-extrabold text-[#0B1F3A] tracking-tight">
            Herramientas cívicas para tu seguridad diaria
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 max-w-xl mx-auto">
            Diseñadas específicamente para las realidades del transporte y comercio en las calles peruanas.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Card 1: Map */}
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
            <div className="space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold">
                <MapPin className="w-6 h-6" />
              </div>
              <h3 className="font-extrabold text-lg text-slate-900">Mapa Georreferenciado</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Visualiza incidentes filtrados por categoría, fecha, distrito y nivel de riesgo con Leaflet y capas libres de OpenStreetMap.
              </p>
            </div>
            <button
              onClick={onGoToMap}
              className="mt-4 pt-3 border-t border-slate-100 text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1"
            >
              Explorar mapa →
            </button>
          </div>

          {/* Card 2: Reports */}
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
            <div className="space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
                <Lock className="w-6 h-6" />
              </div>
              <h3 className="font-extrabold text-lg text-slate-900">Reportes Responsables</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Registra incidentes con ubicación aproximada para proteger a tu familia. Sin divulgar datos personales de víctimas.
              </p>
            </div>
            <span className="mt-4 pt-3 border-t border-slate-100 text-xs font-semibold text-emerald-700 flex items-center gap-1">
              ✓ Validación comunitaria
            </span>
          </div>

          {/* Card 3: Routes */}
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
            <div className="space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold">
                <Route className="w-6 h-6" />
              </div>
              <h3 className="font-extrabold text-lg text-slate-900">Rutas Preventivas</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Compara rutas principales y alternas con indicador referencial de exposición basado en densidad histórica de reportes.
              </p>
            </div>
            <button
              onClick={onGoToRoutes}
              className="mt-4 pt-3 border-t border-slate-100 text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1"
            >
              Planificar ruta →
            </button>
          </div>

          {/* Card 4: SOS */}
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
            <div className="space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-red-100 text-red-700 flex items-center justify-center font-bold">
                <PhoneCall className="w-6 h-6" />
              </div>
              <h3 className="font-extrabold text-lg text-slate-900">Red SOS y Contactos</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Asigna hasta 3 personas de confianza. Activa el botón de auxilio para generar un enlace inmediato con tu ubicación GPS.
              </p>
            </div>
            <button
              onClick={onGoToSos}
              className="mt-4 pt-3 border-t border-slate-100 text-xs font-bold text-red-600 hover:text-red-800 flex items-center gap-1"
            >
              Configurar red SOS →
            </button>
          </div>
        </div>
      </section>

      {/* Target Audiences: Peatón, Conductor, Comerciante */}
      <section className="bg-slate-50 py-16 px-4 sm:px-6 border-y border-slate-200">
        <div className="max-w-6xl mx-auto space-y-10">
          <div className="text-center space-y-2">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
              Construida para quienes mueven el Perú
            </h2>
            <p className="text-xs sm:text-sm text-slate-500">
              Adaptada a las necesidades puntuales de cada integrante de nuestra comunidad.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white p-6 rounded-3xl border border-slate-200 space-y-3">
              <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center">
                <Footprints className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-base text-slate-900">Peatones y Pasajeros</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Conoce paraderos críticos, tramos con falta de alumbrado público y zonas de arrebato de celulares antes de salir de tu casa o trabajo.
              </p>
            </div>

            <div className="bg-white p-6 rounded-3xl border border-slate-200 space-y-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
                <Car className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-base text-slate-900">Conductores y Taxistas</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Identifica falsos pedidos, congestiones por accidentes graves y esquinas con robo de autopartes para proteger tu herramienta de trabajo.
              </p>
            </div>

            <div className="bg-white p-6 rounded-3xl border border-slate-200 space-y-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center">
                <Store className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-base text-slate-900">Pequeños Comerciantes</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Red de alerta solidaria frente a modalidades de extorsión, billetes falsos o merodeo sospechoso en zonas comerciales barriales.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-[#0B1F3A] text-slate-400 py-10 px-4 sm:px-6 text-xs">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 border-b border-blue-900/60 pb-6 mb-6">
          <div className="flex items-center gap-2 text-white">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center font-bold">
              <Shield className="w-4 h-4" />
            </div>
            <span className="font-extrabold text-lg">Vigila.pe</span>
          </div>

          <p className="text-center md:text-right text-slate-400 text-[11px] max-w-md">
            Plataforma comunitaria de geoseguridad para el Perú. Datos de demostración claramente marcados para fines cívicos e ilustrativos.
          </p>
        </div>

        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-slate-500">
          <span>© 2025-2026 Vigila.pe • Cartografía cortesía de OpenStreetMap</span>
          <div className="flex gap-4">
            <span>PNP: 105</span>
            <span>Bomberos: 116</span>
            <span>SAMU: 106</span>
          </div>
        </div>
      </footer>
    </div>
  );
};
