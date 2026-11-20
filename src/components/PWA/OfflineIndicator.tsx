import React from 'react';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { WifiOff } from 'lucide-react';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="fixed bottom-20 left-4 right-4 sm:left-auto sm:right-4 z-50 flex items-center justify-center gap-2 rounded-2xl bg-amber-600 text-white px-4 py-2.5 text-xs font-semibold shadow-xl border border-amber-500 animate-in fade-in slide-in-from-bottom-2">
      <WifiOff className="w-4 h-4 shrink-0 animate-pulse" />
      <span>Modo sin conexión activo — Visualizando mapa y reportes en memoria caché local.</span>
    </div>
  );
};
