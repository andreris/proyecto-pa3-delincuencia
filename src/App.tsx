import React, { useState } from 'react';
import { AccessDialog } from './components/Auth/AccessDialog';
import { AuthProvider, useAuth } from './context/AuthContext';
import { IncidentProvider } from './context/IncidentContext';
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
import { OfflineIndicator } from './components/PWA/OfflineIndicator';

import {MobileMapView} from './components/Dashboard/MobileMapView';

type AppTab = 'landing' | 'map' | 'routes' | 'sos' | 'moderation' | 'profile';

function MainApp() {
  const [mobile, setMobile] = useState(() => window.matchMedia('(max-width: 767px)').matches);
  React.useEffect(() => {
    const query = window.matchMedia('(max-width: 767px)');
    const update = () => setMobile(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  const { isModerator } = useAuth();
  const [accessOpen, setAccessOpen] = useState(false);
  React.useEffect(() => { setCurrentTab(tab => isModerator ? "moderation" : tab === "moderation" ? "map" : tab); }, [isModerator]);
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
    <div className="flex flex-col h-dvh w-full overflow-hidden bg-[#071224] text-[#0F172A]">
      <Navbar
        onLogin={() => setAccessOpen(true)}
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

        {currentTab === 'map' && (mobile ? <MobileMapView /> :
          <MapView
            onOpenReportModal={() => setIsReportModalOpen(true)}
          />
        )}

        {currentTab === 'routes' && <PreventiveRoutesView mobile={mobile} />}

        {currentTab === 'sos' && <TrustedContactsView />}

        {currentTab === 'moderation' && isModerator && <ModerationPanel />}

        {currentTab === 'profile' && <ProfileView />}
      </main>

      {mobile && (currentTab === 'map' || currentTab === 'routes') && (
        <nav aria-label="Navegación del mapa" className="flex shrink-0 items-center justify-around border-t border-slate-200 bg-white py-2 text-sm font-semibold">
          <button className={currentTab === 'map' ? 'text-blue-700' : ''} onClick={() => setCurrentTab('map')}>Mapa en vivo</button>
          <button className="rounded-full bg-blue-600 px-4 py-2 text-white" onClick={() => setIsReportModalOpen(true)}>Reportar</button>
          <button className={currentTab === 'routes' ? 'text-blue-700' : ''} onClick={() => setCurrentTab('routes')}>Rutas preventivas</button>
        </nav>
      )}

      {/* Global Modals */}
      <ReportIncidentModal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
      />

      <SosModal
        isOpen={isSosModalOpen}
        onClose={() => setIsSosModalOpen(false)}
      />

      {isAuthModalOpen && <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        initialMode={authModalMode}
      />}

      {accessOpen && <AccessDialog close={() => setAccessOpen(false)} register={() => { setAccessOpen(false); handleOpenRegister(); }} />}
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
