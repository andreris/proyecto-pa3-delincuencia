import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useIncidents } from '../../context/IncidentContext';
import {
  MapPin,
  PlusCircle,
  Route,
  Users,
  ShieldCheck,
  PhoneCall,
  User,
  LogOut,
  ChevronDown,
  Menu,
  X,
  AlertCircle,
  Radio
} from 'lucide-react';

interface NavbarProps {
  currentTab: 'landing' | 'map' | 'routes' | 'sos' | 'moderation' | 'profile';
  setCurrentTab: (tab: 'landing' | 'map' | 'routes' | 'sos' | 'moderation' | 'profile') => void;
  onOpenReportModal: () => void;
  onOpenSosModal: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentTab,
  setCurrentTab,
  onOpenReportModal,
  onOpenSosModal
}) => {
  const { currentUser, logout, switchUserPersona, isModerator } = useAuth();
  const { incidents, isDemoMode } = useIncidents();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);

  // Count pending reports for badge
  const pendingCount = incidents.filter(i => i.status === 'Pendiente de validación').length;

  const handleNavClick = (tab: 'landing' | 'map' | 'routes' | 'sos' | 'moderation' | 'profile') => {
    setCurrentTab(tab);
    setMobileMenuOpen(false);
  };

  return (
    <header className="sticky top-0 z-40 bg-[#0B1F3A] text-white border-b border-blue-900/60 shadow-md">
      {/* Top micro disclaimer banner */}
      <div className="bg-[#071526] px-3 py-1 text-[11px] text-slate-300 flex items-center justify-between border-b border-blue-950/80">
        <div className="flex items-center gap-1.5 mx-auto sm:mx-0">
          <AlertCircle className="w-3.5 h-3.5 text-blue-400 shrink-0" />
          <span>
            Información comunitaria referencial. Ante emergencias en curso llama a la <strong className="text-white">PNP 105</strong> o <strong className="text-white">Bomberos 116</strong>.
          </span>
        </div>
        <div className="hidden sm:flex items-center gap-3 text-slate-400">
          {isDemoMode && (
            <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-200 border border-amber-400/40 text-[10px] font-bold">
              Modo demo
            </span>
          )}
          <span className="flex items-center gap-1">
            <Radio className="w-3 h-3 text-emerald-400 animate-pulse" />
            Red Activa: Lima & Callao
          </span>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
        {/* Logo Textual Vigila.pe */}
        <button
          onClick={() => handleNavClick('landing')}
          className="flex items-center gap-2.5 text-left group focus:outline-none"
        >
          <img src="/vigila-logo.png" alt="Vigila.pe, ir al inicio" className="w-28 sm:w-32 h-10 object-cover object-[center_54%]" />
        </button>

        {/* Main Navigation (Desktop) */}
        <nav className="hidden md:flex items-center gap-1 lg:gap-2">
          <button
            onClick={() => handleNavClick('landing')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              currentTab === 'landing'
                ? 'bg-blue-600 text-white'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            Inicio
          </button>

          <button
            onClick={() => handleNavClick('map')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              currentTab === 'map'
                ? 'bg-blue-600 text-white'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <MapPin className="w-3.5 h-3.5" />
            Mapa en vivo
          </button>

          <button
            onClick={() => handleNavClick('routes')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              currentTab === 'routes'
                ? 'bg-blue-600 text-white'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Route className="w-3.5 h-3.5" />
            Rutas preventivas
          </button>

          <button
            onClick={() => handleNavClick('sos')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              currentTab === 'sos'
                ? 'bg-blue-600 text-white'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            Contactos SOS
          </button>

          <button
            onClick={() => handleNavClick('moderation')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all relative ${
              currentTab === 'moderation'
                ? 'bg-blue-600 text-white'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            Moderación
            {pendingCount > 0 && (
              <span className="bg-amber-500 text-slate-900 text-[10px] font-extrabold px-1.5 py-0.2 rounded-full">
                {pendingCount}
              </span>
            )}
          </button>
        </nav>

        {/* Action Buttons & Profile (Desktop) */}
        <div className="hidden sm:flex items-center gap-2.5">
          {/* Quick Register Report Button */}
          <button
            onClick={onOpenReportModal}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-white text-[#0B1F3A] hover:bg-slate-100 shadow-sm active:scale-95 transition-all"
          >
            <PlusCircle className="w-4 h-4 text-blue-600" />
            Reportar
          </button>

          {/* SOS Button - RED, strictly accessible as requested */}
          <button
            onClick={onOpenSosModal}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-red-600 hover:bg-red-700 text-white shadow-md shadow-red-700/30 active:scale-95 transition-all border border-red-500 animate-beacon-red"
            title="Activar Botón SOS"
          >
            <PhoneCall className="w-4 h-4" />
            SOS
          </button>

          {/* User Persona & Profile Dropdown */}
          <div className="relative">
            <button
              onClick={() => setProfileDropdownOpen(prev => !prev)}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-blue-900/60 border border-blue-800/70 hover:bg-blue-800/70 text-xs text-left transition-all"
            >
              <div className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-xs">
                {currentUser?.avatarInitials || 'VP'}
              </div>
              <div className="hidden lg:block">
                <p className="font-semibold text-white truncate max-w-[110px] leading-tight">
                  {currentUser?.name || 'Ciudadano'}
                </p>
                <p className="text-[10px] text-blue-300 capitalize">
                  {currentUser?.role === 'moderator' ? '🛡️ Moderador' : currentUser?.userType || 'Peatón'}
                </p>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-slate-300" />
            </button>

            {/* Dropdown Menu */}
            {profileDropdownOpen && (
              <div className="absolute right-0 mt-2 w-64 bg-white rounded-2xl shadow-xl border border-slate-200 py-2 text-slate-800 z-50">
                <div className="px-4 py-2 border-b border-slate-100">
                  <p className="text-xs text-slate-400 font-medium">Conectado como</p>
                  <p className="font-bold text-sm text-slate-900 truncate">{currentUser?.name}</p>
                  <p className="text-xs text-slate-500">{currentUser?.district}</p>
                  <span className="inline-block mt-1 text-[10px] font-semibold uppercase px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                    {currentUser?.role === 'moderator' ? 'Rol: Moderador Oficial' : `Tipo: ${currentUser?.userType}`}
                  </span>
                </div>

                {/* Persona Switcher Quick Demo */}
                <div className="px-4 py-2 border-b border-slate-100">
                  <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                    Probar perfil de rol:
                  </p>
                  <div className="grid grid-cols-2 gap-1.5 text-xs">
                    <button
                      onClick={() => {
                        switchUserPersona('peaton');
                        setProfileDropdownOpen(false);
                      }}
                      className="px-2 py-1 rounded-lg border text-left hover:bg-slate-50 text-[11px] font-medium"
                    >
                      🚶 Peatón
                    </button>
                    <button
                      onClick={() => {
                        switchUserPersona('conductor');
                        setProfileDropdownOpen(false);
                      }}
                      className="px-2 py-1 rounded-lg border text-left hover:bg-slate-50 text-[11px] font-medium"
                    >
                      🚗 Conductor
                    </button>
                    <button
                      onClick={() => {
                        switchUserPersona('comerciante');
                        setProfileDropdownOpen(false);
                      }}
                      className="px-2 py-1 rounded-lg border text-left hover:bg-slate-50 text-[11px] font-medium"
                    >
                      🏪 Comerciante
                    </button>
                    <button
                      onClick={() => {
                        switchUserPersona('moderador');
                        setProfileDropdownOpen(false);
                        setCurrentTab('moderation');
                      }}
                      className="px-2 py-1 rounded-lg border border-amber-200 bg-amber-50 text-amber-800 text-left text-[11px] font-bold"
                    >
                      🛡️ Moderador
                    </button>
                  </div>
                </div>

                <button
                  onClick={() => {
                    handleNavClick('profile');
                    setProfileDropdownOpen(false);
                  }}
                  className="w-full px-4 py-2 text-left text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                >
                  <User className="w-3.5 h-3.5 text-slate-400" />
                  Editar mi perfil y distrito
                </button>

                <button
                  onClick={() => {
                    logout();
                    setProfileDropdownOpen(false);
                  }}
                  className="w-full px-4 py-2 text-left text-xs text-red-600 hover:bg-red-50 flex items-center gap-2 border-t border-slate-100"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Cerrar sesión
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Mobile menu toggle & SOS */}
        <div className="flex sm:hidden items-center gap-2">
          <button
            onClick={onOpenSosModal}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-red-600 text-white shadow"
          >
            <PhoneCall className="w-3.5 h-3.5" />
            SOS
          </button>

          <button
            onClick={() => setMobileMenuOpen(prev => !prev)}
            className="p-2 rounded-lg bg-blue-900/80 text-white"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer Menu */}
      {mobileMenuOpen && (
        <div className="sm:hidden bg-[#0B1F3A] border-t border-blue-900 px-4 pt-2 pb-5 space-y-2">
          <div className="flex items-center justify-between py-2 border-b border-blue-900/60">
            <div>
              <p className="font-bold text-sm text-white">{currentUser?.name}</p>
              <p className="text-xs text-blue-300">{currentUser?.district} • {currentUser?.userType}</p>
            </div>
            <button
              onClick={onOpenReportModal}
              className="px-3 py-1.5 rounded-lg bg-white text-[#0B1F3A] font-bold text-xs"
            >
              + Reportar
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-2">
            <button
              onClick={() => handleNavClick('landing')}
              className={`p-2.5 rounded-xl text-xs font-semibold text-left ${
                currentTab === 'landing' ? 'bg-blue-600 text-white' : 'bg-blue-950 text-slate-200'
              }`}
            >
              Inicio
            </button>
            <button
              onClick={() => handleNavClick('map')}
              className={`p-2.5 rounded-xl text-xs font-semibold text-left ${
                currentTab === 'map' ? 'bg-blue-600 text-white' : 'bg-blue-950 text-slate-200'
              }`}
            >
              Mapa de incidentes
            </button>
            <button
              onClick={() => handleNavClick('routes')}
              className={`p-2.5 rounded-xl text-xs font-semibold text-left ${
                currentTab === 'routes' ? 'bg-blue-600 text-white' : 'bg-blue-950 text-slate-200'
              }`}
            >
              Rutas preventivas
            </button>
            <button
              onClick={() => handleNavClick('sos')}
              className={`p-2.5 rounded-xl text-xs font-semibold text-left ${
                currentTab === 'sos' ? 'bg-blue-600 text-white' : 'bg-blue-950 text-slate-200'
              }`}
            >
              Contactos SOS
            </button>
            <button
              onClick={() => handleNavClick('moderation')}
              className={`p-2.5 rounded-xl text-xs font-semibold text-left col-span-2 flex items-center justify-between ${
                currentTab === 'moderation' ? 'bg-blue-600 text-white' : 'bg-blue-950 text-slate-200'
              }`}
            >
              <span>Panel de Moderación</span>
              {pendingCount > 0 && (
                <span className="bg-amber-500 text-slate-900 text-xs px-2 py-0.5 rounded-full font-bold">
                  {pendingCount} pendientes
                </span>
              )}
            </button>
            <button
              onClick={() => handleNavClick('profile')}
              className="p-2.5 rounded-xl text-xs font-semibold text-left col-span-2 bg-blue-950 text-slate-200"
            >
              Configurar perfil
            </button>
          </div>
        </div>
      )}
    </header>
  );
};
