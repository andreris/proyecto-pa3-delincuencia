import React, { useState } from 'react';
import { IncidentReport } from '../../types';
import { useIncidents } from '../../context/IncidentContext';
import {
  X,
  MapPin,
  Calendar,
  Clock,
  ShieldAlert,
  AlertTriangle,
  Info,
  CheckCircle2,
  ThumbsUp,
  Flag,
  Share2,
  Lock,
  Eye,
  AlertCircle,
  ExternalLink
} from 'lucide-react';
import { getSafeExternalUrl, sanitizeExternalText } from '../../utils/sanitize';

interface IncidentDetailModalProps {
  incident: IncidentReport | null;
  onClose: () => void;
  onLocateOnMap?: (coords: [number, number]) => void;
}

export const IncidentDetailModal: React.FC<IncidentDetailModalProps> = ({
  incident,
  onClose,
  onLocateOnMap
}) => {
  const { flagSpamOrFalseReport, helpfulVote } = useIncidents();
  const [copied, setCopied] = useState(false);
  const [flaggedNotice, setFlaggedNotice] = useState(false);

  if (!incident) return null;

  const handleShare = () => {
    const text = `Reporte comunitario Vigila.pe: ${incident.title} en ${incident.approxLocation.address} (${incident.district}).`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleFlag = () => {
    flagSpamOrFalseReport(incident.id);
    setFlaggedNotice(true);
    setTimeout(() => setFlaggedNotice(false), 3000);
  };

  const riskBadge =
    incident.riskLevel === 'alto'
      ? { label: 'Riesgo Alto', bg: 'bg-red-100 text-red-800 border-red-300' }
      : incident.riskLevel === 'medio'
      ? { label: 'Riesgo Medio', bg: 'bg-amber-100 text-amber-800 border-amber-300' }
      : { label: 'Informativo', bg: 'bg-blue-100 text-blue-800 border-blue-300' };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200">
        {/* Header */}
        <div className="bg-[#0B1F3A] text-white p-5 flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className={`text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full border ${riskBadge.bg}`}>
                {riskBadge.label}
              </span>
              <span className="text-xs text-blue-300 font-mono">Folio: {incident.id}</span>
            </div>
            <h3 className="font-extrabold text-base text-white pt-1">{incident.title}</h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-300 hover:text-white p-1 rounded-lg hover:bg-white/10"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          {flaggedNotice && (
            <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>Gracias. Hemos recibido tu reporte de sospecha de información incorrecta.</span>
            </div>
          )}

          {/* Validation Status */}
          <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 border border-slate-200 text-xs">
            <span className="text-slate-500 font-medium">Estado de moderación:</span>
            {incident.status === 'Verificado' ? (
              <span className="inline-flex items-center gap-1.5 font-bold text-emerald-700 bg-emerald-100/70 px-2.5 py-1 rounded-full border border-emerald-300">
                <CheckCircle2 className="w-4 h-4" /> Verificado por moderadores
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 font-bold text-amber-700 bg-amber-100/70 px-2.5 py-1 rounded-full border border-amber-300">
                <Clock className="w-4 h-4" /> Pendiente de validación
              </span>
            )}
          </div>

          {/* Description */}
          <div>
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Descripción del incidente
            </h4>
            <p className="text-xs sm:text-sm text-slate-800 bg-slate-50 p-3.5 rounded-2xl border border-slate-200 leading-relaxed">
              {sanitizeExternalText(incident.description, 500)}
            </p>
          </div>

          {/* Location and Date */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200">
              <span className="text-[10px] text-slate-400 font-bold block mb-1">ZONA APROXIMADA</span>
              <p className="font-semibold text-slate-800">{incident.approxLocation.address}</p>
              <p className="text-blue-700 font-bold text-[11px] mt-0.5">{incident.district}</p>
            </div>

            <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200">
              <span className="text-[10px] text-slate-400 font-bold block mb-1">FECHA Y HORA</span>
              <p className="font-semibold text-slate-800">{incident.date}</p>
              <p className="text-slate-500 font-medium text-[11px] mt-0.5">{incident.time} hrs</p>
            </div>
          </div>

          {/* Privacy Note */}
          <div className="bg-blue-50 border border-blue-200 p-3.5 rounded-2xl text-xs text-blue-900 flex items-start gap-2.5">
            <Lock className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Privacidad y Protección</p>
              <p className="text-[11px] text-blue-800/90 mt-0.5">
                Por seguridad comunitaria, no se revelan datos personales del reportante ni de las víctimas.
              </p>
            </div>
          </div>

          {/* Evidence or notes */}
          {(incident.evidenceNote || incident.source === 'x') && (
            <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 text-xs space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-slate-400 font-bold uppercase">
                  Referencia comunitaria
                </span>
                {incident.source === 'x' && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-900 text-white">
                    Fuente externa: X
                  </span>
                )}
              </div>
              {incident.evidenceNote && (
                <p className="text-slate-700 italic">{sanitizeExternalText(incident.evidenceNote, 260)}</p>
              )}
              {incident.source === 'x' && getSafeExternalUrl(incident.sourceUrl) && (
                <a
                  href={getSafeExternalUrl(incident.sourceUrl)!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-800 underline"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Ver publicación original
                </a>
              )}
            </div>
          )}

          {/* Community Actions */}
          <div className="pt-2 flex items-center justify-between border-t border-slate-100">
            <div className="flex items-center gap-2">
              <button
                onClick={() => helpfulVote(incident.id)}
                className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 flex items-center gap-1.5 active:scale-95 transition-all"
              >
                <ThumbsUp className="w-3.5 h-3.5 text-blue-600" />
                <span>Útil ({incident.helpfulCount})</span>
              </button>

              <button
                onClick={handleShare}
                className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 flex items-center gap-1.5 active:scale-95 transition-all"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>{copied ? '¡Copiado!' : 'Compartir'}</span>
              </button>
            </div>

            <button
              onClick={handleFlag}
              className="text-[11px] text-slate-400 hover:text-red-600 flex items-center gap-1 font-medium"
            >
              <Flag className="w-3.5 h-3.5" />
              Denunciar reporte falso
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
