import React, { useState } from 'react';
import { useIncidents } from '../../context/IncidentContext';
import { useAuth } from '../../context/AuthContext';
import { EMERGENCY_SERVICES } from '../../data/demoData';
import {
  PhoneCall,
  AlertOctagon,
  X,
  MapPin,
  Send,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  Shield,
  Copy,
  Check
} from 'lucide-react';

interface SosModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SosModal: React.FC<SosModalProps> = ({ isOpen, onClose }) => {
  const { trustedContacts, activateSos } = useIncidents();
  const { currentUser } = useAuth();

  const [step, setStep] = useState<'confirm' | 'dispatched'>('confirm');
  const [gpsLocation, setGpsLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [loadingGps, setLoadingGps] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleConfirmSos = () => {
    setLoadingGps(true);

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => {
          const coords = {
            lat: Number(pos.coords.latitude.toFixed(5)),
            lng: Number(pos.coords.longitude.toFixed(5))
          };
          setGpsLocation(coords);
          activateSos(coords.lat, coords.lng);
          setLoadingGps(false);
          setStep('dispatched');
        },
        () => {
          // Fallback to default Lima location if GPS denied
          const fallback = { lat: -12.055, lng: -77.035 };
          setGpsLocation(fallback);
          activateSos(fallback.lat, fallback.lng);
          setLoadingGps(false);
          setStep('dispatched');
        },
        { timeout: 5000 }
      );
    } else {
      const fallback = { lat: -12.055, lng: -77.035 };
      setGpsLocation(fallback);
      activateSos(fallback.lat, fallback.lng);
      setLoadingGps(false);
      setStep('dispatched');
    }
  };

  const emergencyMessage = `🚨 ALERTA SOS - Vigila.pe: ${currentUser?.name || 'Tu contacto'} ha activado el botón de emergencia. Ubicación aproximada: https://www.openstreetmap.org/?mlat=${gpsLocation?.lat || -12.055}&mlon=${gpsLocation?.lng || -77.035}#map=16/${gpsLocation?.lat || -12.055}/${gpsLocation?.lng || -77.035} - Por favor comunícate de inmediato o llama al 105.`;

  const handleCopyMessage = () => {
    navigator.clipboard.writeText(emergencyMessage);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCloseAndReset = () => {
    setStep('confirm');
    setGpsLocation(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-red-950/70 backdrop-blur-xs">
      <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden border-2 border-red-500 animate-in fade-in zoom-in duration-200">
        {/* Header */}
        <div className="bg-red-600 text-white p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center text-white">
              <AlertOctagon className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-extrabold text-lg text-white">Botón SOS de Auxilio</h3>
              <p className="text-xs text-red-100">Red Comunitaria de Contactos</p>
            </div>
          </div>
          <button
            onClick={handleCloseAndReset}
            className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {step === 'confirm' ? (
          <div className="p-6 space-y-4">
            <div className="text-center space-y-2">
              <p className="font-bold text-base text-slate-900">
                ¿Deseas activar la señal de alerta a tus contactos de confianza?
              </p>
              <p className="text-xs text-slate-600 leading-relaxed">
                Al confirmar, se capturará tu geolocalización actual y se enviará una notificación inmediata con enlace de mapa a tus <strong>{trustedContacts.length} contactos registrados</strong>.
              </p>
            </div>

            {/* Trusted Contacts summary */}
            <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 text-xs space-y-1.5">
              <span className="font-bold text-slate-700 block">Contactos que recibirán la alerta:</span>
              {trustedContacts.length === 0 ? (
                <p className="text-amber-700">No has registrado contactos aún. Te recomendamos agregar familiares.</p>
              ) : (
                trustedContacts.map(c => (
                  <div key={c.id} className="flex items-center justify-between text-slate-600">
                    <span>{c.name} ({c.relationship})</span>
                    <span className="font-semibold text-slate-900">{c.phone}</span>
                  </div>
                ))
              )}
            </div>

            {/* Demo Notice Banner */}
            <div className="bg-amber-50 border border-amber-200 text-amber-900 p-3 rounded-xl text-xs flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <strong className="block">Modo de Demostración:</strong>
                <span>
                  Esta app simula el envío a contactos y <strong>no reemplaza</strong> a las centrales oficiales de policía ni emergencias del Estado.
                </span>
              </div>
            </div>

            {/* Buttons */}
            <div className="pt-2 space-y-2">
              <button
                onClick={handleConfirmSos}
                disabled={loadingGps}
                className="w-full py-3 px-4 rounded-xl bg-red-600 hover:bg-red-700 text-white font-extrabold text-sm shadow-lg shadow-red-600/30 active:scale-98 transition-all flex items-center justify-center gap-2"
              >
                <PhoneCall className="w-4 h-4" />
                {loadingGps ? 'Obteniendo GPS...' : 'SÍ, ACTIVAR ALERTA SOS AHORA'}
              </button>

              <button
                onClick={handleCloseAndReset}
                className="w-full py-2.5 px-4 rounded-xl text-slate-600 hover:bg-slate-100 font-semibold text-xs"
              >
                Cancelar y cerrar
              </button>
            </div>
          </div>
        ) : (
          /* Dispatched Screen */
          <div className="p-6 space-y-4">
            <div className="w-14 h-14 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto animate-bounce">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <div className="text-center space-y-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-red-700 bg-red-50 px-3 py-1 rounded-full border border-red-200">
                Alerta Despachada (Simulación)
              </span>
              <h4 className="font-extrabold text-lg text-slate-900 pt-1">
                Enlace de auxilio generado
              </h4>
              <p className="text-xs text-slate-600">
                Se ha estructurado la señal de socorro con tu geolocalización aproximada.
              </p>
            </div>

            {/* Message generated */}
            <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 text-xs space-y-2">
              <div className="flex items-center justify-between text-slate-700 font-semibold">
                <span>Mensaje listo para WhatsApp / SMS:</span>
                <button
                  onClick={handleCopyMessage}
                  className="flex items-center gap-1 text-blue-600 hover:text-blue-800 text-[11px] font-bold"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? 'Copiado' : 'Copiar texto'}
                </button>
              </div>
              <p className="text-[11px] text-slate-600 bg-white p-2.5 rounded-xl border border-slate-200 font-mono break-all leading-relaxed">
                {emergencyMessage}
              </p>
            </div>

            {/* Direct Official Emergency Hotlines */}
            <div>
              <p className="text-xs font-bold text-slate-800 mb-2">
                Llamada directa a servicios oficiales de auxilio:
              </p>
              <div className="grid grid-cols-2 gap-2">
                <a
                  href="tel:105"
                  className="p-2.5 rounded-xl bg-blue-900 text-white text-center hover:bg-blue-950 transition-all font-bold text-xs flex items-center justify-center gap-1.5"
                >
                  <PhoneCall className="w-3.5 h-3.5" />
                  PNP: 105
                </a>
                <a
                  href="tel:116"
                  className="p-2.5 rounded-xl bg-red-700 text-white text-center hover:bg-red-800 transition-all font-bold text-xs flex items-center justify-center gap-1.5"
                >
                  <PhoneCall className="w-3.5 h-3.5" />
                  Bomberos: 116
                </a>
                <a
                  href="tel:106"
                  className="p-2.5 rounded-xl bg-amber-700 text-white text-center hover:bg-amber-800 transition-all font-bold text-xs flex items-center justify-center gap-1.5"
                >
                  <PhoneCall className="w-3.5 h-3.5" />
                  SAMU: 106
                </a>
                <a
                  href="tel:013185050"
                  className="p-2.5 rounded-xl bg-emerald-800 text-white text-center hover:bg-emerald-900 transition-all font-bold text-xs flex items-center justify-center gap-1.5"
                >
                  <PhoneCall className="w-3.5 h-3.5" />
                  Serenazgo Lima
                </a>
              </div>
            </div>

            <button
              onClick={handleCloseAndReset}
              className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-900 text-white font-semibold text-xs transition-all"
            >
              Cerrar alerta
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
