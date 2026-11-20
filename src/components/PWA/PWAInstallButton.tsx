import React, { useState } from 'react';
import { usePWAInstall } from '../../hooks/usePWAInstall';
import { Download, Smartphone, X, Check, Share2 } from 'lucide-react';

interface PWAInstallButtonProps {
  className?: string;
  variant?: 'compact' | 'prominent' | 'card';
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  className = '',
  variant = 'compact'
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [showAndroidGuide, setShowAndroidGuide] = useState(false);

  // If already running standalone, display a subtle badge or null
  if (isInstalled) {
    return null;
  }

  // Chromium / Android native prompt
  if (isInstallable) {
    if (variant === 'prominent') {
      return (
        <button
          onClick={install}
          className={`flex items-center gap-2 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-2.5 text-xs font-bold text-white shadow-lg shadow-blue-500/25 hover:from-blue-700 hover:to-indigo-700 active:scale-95 transition-all ${className}`}
        >
          <Smartphone className="w-4 h-4 text-blue-200" />
          <span>Instalar App en Celular</span>
        </button>
      );
    }

    return (
      <button
        onClick={install}
        className={`flex items-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition active:scale-95 ${className}`}
        title="Instalar Vigila.pe como aplicación en tu pantalla principal"
      >
        <Download className="w-3.5 h-3.5" />
        <span>Instalar App</span>
      </button>
    );
  }

  // iOS Safari flow (since WebKit does not trigger beforeinstallprompt)
  if (isIOS) {
    return (
      <>
        <button
          onClick={() => setShowIOSGuide(true)}
          className={`flex items-center gap-1.5 rounded-xl border border-blue-400/40 bg-blue-900/40 px-3 py-1.5 text-xs font-semibold text-blue-200 hover:bg-blue-900/80 transition active:scale-95 ${className}`}
        >
          <Smartphone className="w-3.5 h-3.5 text-blue-300" />
          <span>Instalar en iPhone</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
            <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl border border-slate-200 text-slate-800 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold">
                    <Smartphone className="w-4 h-4" />
                  </div>
                  <h3 className="text-base font-extrabold text-slate-900">Instalar en iPhone / iPad</h3>
                </div>
                <button
                  onClick={() => setShowIOSGuide(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-700"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-3 text-xs text-slate-600">
                <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                  <span className="w-5 h-5 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center text-[10px] shrink-0">
                    1
                  </span>
                  <p>
                    Toca el botón <strong>Compartir</strong> <Share2 className="w-3.5 h-3.5 inline mx-1 text-blue-600" /> en la barra inferior de Safari.
                  </p>
                </div>

                <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                  <span className="w-5 h-5 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center text-[10px] shrink-0">
                    2
                  </span>
                  <p>
                    Desplázate hacia abajo y selecciona <strong>“Agregar a pantalla de inicio”</strong>.
                  </p>
                </div>

                <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                  <span className="w-5 h-5 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center text-[10px] shrink-0">
                    3
                  </span>
                  <p>
                    ¡Listo! Se abrirá a pantalla completa como una aplicación nativa.
                  </p>
                </div>
              </div>

              <button
                onClick={() => setShowIOSGuide(false)}
                className="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold"
              >
                Entendido
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  // Fallback for browsers that don't trigger the prompt yet (general guidance)
  return (
    <>
      <button
        onClick={() => setShowAndroidGuide(true)}
        className={`flex items-center gap-1.5 rounded-xl bg-blue-600/90 hover:bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition active:scale-95 ${className}`}
        title="Ver cómo instalar en tu celular"
      >
        <Smartphone className="w-3.5 h-3.5" />
        <span>Instalar App</span>
      </button>

      {showAndroidGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl border border-slate-200 text-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold">
                  <Smartphone className="w-4 h-4" />
                </div>
                <h3 className="text-base font-extrabold text-slate-900">Instalar Vigila.pe</h3>
              </div>
              <button
                onClick={() => setShowAndroidGuide(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-600">
              <p>
                Puedes instalar esta app directamente desde el menú de tu navegador:
              </p>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                <p>
                  1. Abre el menú del navegador (tres puntos <strong>⋮</strong> arriba a la derecha).
                </p>
                <p>
                  2. Toca <strong>“Instalar aplicación”</strong> o <strong>“Agregar a pantalla principal”</strong>.
                </p>
              </div>
            </div>

            <button
              onClick={() => setShowAndroidGuide(false)}
              className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}
    </>
  );
};
