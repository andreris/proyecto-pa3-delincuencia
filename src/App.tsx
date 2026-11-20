import React, { useState } from 'react';
import { AuthProvider } from './context/AuthContext';
import { IncidentProvider, useIncidents } from './context/IncidentContext';
import { Navbar } from './components/Navigation/Navbar';
import { LandingPage } from './components/Landing/LandingPage';
import { MapView } from './components/Dashboard/MapView';
import { PreventiveRoutesView } from './components/Routes/PreventiveRoutesView';
import { TrustedContactsView } from './components/SOS/TrustedContactsView';
import { ModerationPanel } from './components/Moderation/ModerationPanel';
import { ProfileView } from './components/Profile/ProfileView';
import { ReportIncidentModal } from './components/Report/ReportIncidentModal';
import { SosModal } from './components/SOS/SosModal';
import { AuthModal } from './components/Auth/AuthModal';
import { ModeratorAuthModal } from './components/Auth/ModeratorAuthModal';
import { MobileAppShell } from './components/MobileApp/MobileAppShell';
import { PWAInstallButton } from './components/PWA/PWAInstallButton';
import { OfflineIndicator } from './components/PWA/OfflineIndicator';
import { Smartphone, Monitor, Sparkles, Maximize2, Minimize2 } from 'lucide-react';

type AppTab = 'landing' | 'map' | 'routes' | 'sos' | 'moderation' | 'profile';

function MainApp() {
  const { isDemoMode } = useIncidents();
  // Mode: 'app' (Mobile Smartphone App view) vs 'web' (Full Web Platform view)
  const [displayMode, setDisplayMode] = useState<'app' | 'web'>('app');
  const [isPhoneFramed, setIsPhoneFramed] = useState(true);

  // Web view state
  const [currentTab, setCurrentTab] = useState<AppTab>('map');
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [isSosModalOpen, setIsSosModalOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<'login' | 'register'>('login');

  const handleOpenRegister = () => {
    setAuthModalMode('register');
    setIsAuthModalOpen(true);
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#071224] text-[#0F172A]">
      {/* Top Universal Mode Switcher Bar */}
      <header className="bg-[#0B1F3A] border-b border-blue-900/60 px-4 py-2 flex items-center justify-between text-white shrink-0 z-50 shadow-md">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="font-extrabold text-sm sm:text-base tracking-tight text-white">
              Vigila<span className="text-blue-400">.pe</span>
            </span>
            <span className="bg-blue-600/30 text-blue-300 text-[10px] font-bold px-2 py-0.5 rounded-full border border-blue-500/40">
              {displayMode === 'app' ? 'Modo App Móvil' : 'Modo Web / Portal'}
            </span>
            {isDemoMode && (
              <span className="bg-amber-500/20 text-amber-200 text-[10px] font-bold px-2 py-0.5 rounded-full border border-amber-400/40">
                Modo demo
              </span>
            )}
          </div>
        </div>

        {/* Mode Switcher Toggle Pill */}
        <div className="flex items-center gap-2">
          <div className="bg-[#071526] p-1 rounded-xl border border-blue-900/70 flex items-center">
            <button
              onClick={() => setDisplayMode('app')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                displayMode === 'app'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>Versión App</span>
            </button>

            <button
              onClick={() => setDisplayMode('web')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                displayMode === 'web'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Monitor className="w-3.5 h-3.5" />
              <span>Versión Web</span>
            </button>
          </div>

          {/* If in App mode on desktop, allow toggling Phone Frame vs Full Screen */}
          {displayMode === 'app' && (
            <button
              onClick={() => setIsPhoneFramed(prev => !prev)}
              className="hidden md:flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-blue-900/40 hover:bg-blue-900/80 text-blue-200 text-xs font-medium border border-blue-700/50"
              title={isPhoneFramed ? 'Ver en pantalla completa' : 'Ver dentro de marco de smartphone'}
            >
              {isPhoneFramed ? (
                <>
                  <Maximize2 className="w-3.5 h-3.5" />
                  <span className="hidden lg:inline">Expandir</span>
                </>
              ) : (
                <>
                  <Minimize2 className="w-3.5 h-3.5" />
                  <span className="hidden lg:inline">Marco celular</span>
                </>
              )}
            </button>
          )}

          {/* In-App PWA Install */}
          <PWAInstallButton className="hidden sm:flex" />
        </div>
      </header>

      {/* Main Display Container */}
      <div className="flex-1 overflow-hidden relative flex flex-col">
        {/* =========================================
            OPTION A: NATIVE MOBILE APP VERSION
            ========================================= */}
        {displayMode === 'app' ? (
          <div className="flex-1 w-full h-full flex items-center justify-center p-0 md:p-4 bg-gradient-to-b from-[#071224] to-[#0B1F3A]">
            {isPhoneFramed ? (
              /* Smartphone Mockup Frame (iPhone / Android style) */
              <div className="relative w-full h-full md:max-w-[420px] md:h-[840px] md:max-h-[95vh] bg-black rounded-none md:rounded-[48px] shadow-2xl md:ring-12 md:ring-slate-800 md:border-4 md:border-slate-700 overflow-hidden flex flex-col">
                <MobileAppShell
                  onOpenReportModal={() => setIsReportModalOpen(true)}
                  onOpenSosModal={() => setIsSosModalOpen(true)}
                  onToggleFullWebMode={() => setDisplayMode('web')}
                  isFramedSimulator={true}
                />
              </div>
            ) : (
              /* Full-Screen Mobile App */
              <div className="w-full h-full overflow-hidden flex flex-col">
                <MobileAppShell
                  onOpenReportModal={() => setIsReportModalOpen(true)}
                  onOpenSosModal={() => setIsSosModalOpen(true)}
                  onToggleFullWebMode={() => setDisplayMode('web')}
                  isFramedSimulator={false}
                />
              </div>
            )}
          </div>
        ) : (
          /* =========================================
             OPTION B: FULL WEB / PORTAL VERSION
             ========================================= */
          <div className="flex-1 flex flex-col overflow-hidden bg-[#F8FAFC]">
            <Navbar
              currentTab={currentTab}
              setCurrentTab={setCurrentTab}
              onOpenReportModal={() => setIsReportModalOpen(true)}
              onOpenSosModal={() => setIsSosModalOpen(true)}
            />

            <main className="flex-1 flex flex-col overflow-hidden relative">
              {currentTab === 'landing' && (
                <LandingPage
                  onGoToMap={() => setCurrentTab('map')}
                  onOpenRegister={handleOpenRegister}
                  onGoToRoutes={() => setCurrentTab('routes')}
                  onGoToSos={() => setCurrentTab('sos')}
                />
              )}

              {currentTab === 'map' && (
                <MapView
                  onOpenReportModal={() => setIsReportModalOpen(true)}
                />
              )}

              {currentTab === 'routes' && <PreventiveRoutesView />}

              {currentTab === 'sos' && <TrustedContactsView />}

              {currentTab === 'moderation' && <ModerationPanel />}

              {currentTab === 'profile' && <ProfileView />}
            </main>
          </div>
        )}
      </div>

      {/* Global Modals */}
      <ReportIncidentModal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
      />

      <SosModal
        isOpen={isSosModalOpen}
        onClose={() => setIsSosModalOpen(false)}
      />

      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        initialMode={authModalMode}
      />

      <ModeratorAuthModal />

      {/* Offline Connectivity Toast */}
      <OfflineIndicator />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <IncidentProvider>
        <MainApp />
      </IncidentProvider>
    </AuthProvider>
  );
}
