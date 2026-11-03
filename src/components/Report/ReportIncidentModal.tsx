import React, { useState } from 'react';
import { useIncidents } from '../../context/IncidentContext';
import { useAuth } from '../../context/AuthContext';
import { IncidentCategory, RiskLevel } from '../../types';
import { PERU_DISTRICTS } from '../../data/demoData';
import {
  X,
  AlertTriangle,
  ShieldAlert,
  Info,
  MapPin,
  Calendar,
  Clock,
  FileText,
  UploadCloud,
  CheckCircle2,
  LocateFixed,
  Lock,
  EyeOff
} from 'lucide-react';

interface ReportIncidentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenMapToPick?: () => void;
  initialCoords?: { lat: number; lng: number } | null;
}

export const ReportIncidentModal: React.FC<ReportIncidentModalProps> = ({
  isOpen,
  onClose,
  onOpenMapToPick,
  initialCoords = null
}) => {
  const { addIncident } = useIncidents();
  const { currentUser } = useAuth();

  const [category, setCategory] = useState<IncidentCategory>('asalto');
  const [riskLevel, setRiskLevel] = useState<RiskLevel>('medio');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [time, setTime] = useState(() => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  });
  const [district, setDistrict] = useState(currentUser?.district || 'Lima (Cercado)');
  const [address, setAddress] = useState('');
  const [lat, setLat] = useState<number>(initialCoords?.lat || -12.055);
  const [lng, setLng] = useState<number>(initialCoords?.lng || -77.035);
  const [evidenceNote, setEvidenceNote] = useState('');
  const [gpsLoading, setGpsLoading] = useState(false);
  const [submittedId, setSubmittedId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen) return null;

  const handleUseGps = () => {
    if (!navigator.geolocation) {
      setErrorMsg('Tu dispositivo o navegador no soporta GPS.');
      return;
    }
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      pos => {
        setGpsLoading(false);
        setLat(Number(pos.coords.latitude.toFixed(5)));
        setLng(Number(pos.coords.longitude.toFixed(5)));
        if (!address) {
          setAddress('Coordenadas capturadas por GPS');
        }
      },
      err => {
        setGpsLoading(false);
        setErrorMsg('No se pudo acceder a tu ubicación GPS. Puedes indicar la calle o seleccionar en el mapa.');
      },
      { timeout: 7000 }
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!title.trim() || !description.trim() || !district) {
      setErrorMsg('Por favor completa el título, descripción y distrito del incidente.');
      return;
    }

    if (description.length < 15) {
      setErrorMsg('La descripción debe ser informativa y clara (mínimo 15 caracteres).');
      return;
    }

    const reportId = addIncident({
      category,
      riskLevel,
      title: title.trim(),
      description: description.trim(),
      date,
      time,
      district,
      approxLocation: {
        lat,
        lng,
        address: address.trim() || `Zona referencial en ${district}`
      },
      isDemo: false,
      evidenceNote: evidenceNote.trim() || undefined,
      reportedByRole: currentUser?.userType
        ? currentUser.userType === 'peaton'
          ? 'Peatón'
          : currentUser.userType === 'conductor'
          ? 'Conductor'
          : 'Comerciante'
        : 'Ciudadano'
    });

    setSubmittedId(reportId);
  };

  const handleResetAndClose = () => {
    setSubmittedId(null);
    setTitle('');
    setDescription('');
    setAddress('');
    setEvidenceNote('');
    setErrorMsg('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200 my-8">
        {/* Modal Header */}
        <div className="bg-[#0B1F3A] text-white p-5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center text-white">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-white">Registrar nuevo incidente</h3>
              <p className="text-xs text-blue-200">Reporte anónimo y seguro para la comunidad</p>
            </div>
          </div>
          <button
            onClick={handleResetAndClose}
            className="text-slate-300 hover:text-white p-1.5 rounded-lg hover:bg-white/10"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Success Confirmation Screen */}
        {submittedId ? (
          <div className="p-6 text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                Reporte registrado con éxito
              </span>
              <h4 className="font-extrabold text-xl text-slate-900 mt-2">Folio: {submittedId}</h4>
              <p className="text-xs text-slate-600 mt-1 max-w-sm mx-auto">
                Tu reporte ha ingresado con estado <strong className="text-amber-700">“Pendiente de validación”</strong>. Los moderadores comunitarios revisarán la información para proteger a todos.
              </p>
            </div>

            <div className="bg-slate-50 p-4 rounded-xl text-xs text-slate-600 text-left space-y-2 border border-slate-200">
              <div className="flex items-center gap-2 text-slate-800 font-semibold">
                <Lock className="w-4 h-4 text-blue-600 shrink-0" />
                <span>Privacidad garantizada</span>
              </div>
              <p className="text-[11px] text-slate-500">
                La ubicación pública se muestra de manera <strong>aproximada</strong> para resguardar la identidad del denunciante y las víctimas. Tus datos personales jamás son expuestos.
              </p>
            </div>

            <div className="pt-2">
              <button
                onClick={handleResetAndClose}
                className="w-full py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm shadow-md transition-all"
              >
                Entendido y volver al mapa
              </button>
            </div>
          </div>
        ) : (
          /* Form Content */
          <form onSubmit={handleSubmit} className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
            {/* Privacy Alert Reminder */}
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-start gap-2.5 text-xs text-blue-900">
              <EyeOff className="w-4 h-4 text-blue-700 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Política de privacidad comunitaria</p>
                <p className="text-[11px] text-blue-800/90">
                  No menciones nombres propios ni datos personales. La geolocalización pública será aproximada.
                </p>
              </div>
            </div>

            {errorMsg && (
              <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-xl text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Category selection */}
            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1.5">
                Categoría del incidente *
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {[
                  { id: 'robo', label: 'Robo de bienes' },
                  { id: 'asalto', label: 'Asalto a mano armada' },
                  { id: 'extorsion', label: 'Extorsión / Cupos' },
                  { id: 'accidente', label: 'Accidente vial' },
                  { id: 'actividad_sospechosa', label: 'Actividad sospechosa' },
                  { id: 'hurto_menor', label: 'Arrebato al paso' }
                ].map(c => (
                  <button
                    type="button"
                    key={c.id}
                    onClick={() => setCategory(c.id as IncidentCategory)}
                    className={`py-2 px-2.5 rounded-xl border text-xs font-semibold text-center transition-all ${
                      category === c.id
                        ? 'border-blue-600 bg-blue-50 text-blue-800 ring-2 ring-blue-500/20'
                        : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Risk level selection */}
            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1.5">
                Nivel de riesgo estimado *
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setRiskLevel('informativo')}
                  className={`py-2 px-2 rounded-xl border text-xs font-bold text-center transition-all ${
                    riskLevel === 'informativo'
                      ? 'border-blue-600 bg-blue-50 text-blue-800 ring-2 ring-blue-500/20'
                      : 'border-slate-200 text-slate-600'
                  }`}
                >
                  🔵 Informativo
                </button>
                <button
                  type="button"
                  onClick={() => setRiskLevel('medio')}
                  className={`py-2 px-2 rounded-xl border text-xs font-bold text-center transition-all ${
                    riskLevel === 'medio'
                      ? 'border-amber-600 bg-amber-50 text-amber-800 ring-2 ring-amber-500/20'
                      : 'border-slate-200 text-slate-600'
                  }`}
                >
                  🟡 Riesgo medio
                </button>
                <button
                  type="button"
                  onClick={() => setRiskLevel('alto')}
                  className={`py-2 px-2 rounded-xl border text-xs font-bold text-center transition-all ${
                    riskLevel === 'alto'
                      ? 'border-red-600 bg-red-50 text-red-800 ring-2 ring-red-500/20'
                      : 'border-slate-200 text-slate-600'
                  }`}
                >
                  🔴 Riesgo alto
                </button>
              </div>
            </div>

            {/* Title */}
            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1">
                Título breve del reporte *
              </label>
              <input
                type="text"
                placeholder="Ejemplo: Arrebato de celulares por sujetos en moto"
                value={title}
                onChange={e => setTitle(e.target.value)}
                maxLength={80}
                required
                className="w-full text-xs px-3 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1">
                Descripción del suceso (sin datos personales de víctimas) *
              </label>
              <textarea
                placeholder="Describe cómo ocurrió, características generales de los involucrados o de la vía, sin incluir nombres ni datos identificables..."
                value={description}
                onChange={e => setDescription(e.target.value)}
                rows={3}
                required
                className="w-full text-xs p-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
            </div>

            {/* Date and Time row */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">Fecha</label>
                <div className="relative">
                  <Calendar className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="date"
                    value={date}
                    onChange={e => setDate(e.target.value)}
                    className="w-full text-xs pl-8 pr-2.5 py-2 rounded-xl border border-slate-200"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">Hora aproximada</label>
                <div className="relative">
                  <Clock className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="time"
                    value={time}
                    onChange={e => setTime(e.target.value)}
                    className="w-full text-xs pl-8 pr-2.5 py-2 rounded-xl border border-slate-200"
                  />
                </div>
              </div>
            </div>

            {/* District & Location */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">Distrito *</label>
                <select
                  value={district}
                  onChange={e => setDistrict(e.target.value)}
                  className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 bg-white"
                >
                  {PERU_DISTRICTS.filter(d => d !== 'Todos los distritos').map(d => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  Avenida o punto de referencia
                </label>
                <input
                  type="text"
                  placeholder="Ej. Cruce de Av. Túpac Amaru con México"
                  value={address}
                  onChange={e => setAddress(e.target.value)}
                  className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200"
                />
              </div>
            </div>

            {/* Geolocation selector helper */}
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-2">
              <div className="text-[11px] text-slate-600">
                <span className="font-semibold text-slate-800">Ubicación GPS: </span>
                <span>Lat: {lat.toFixed(4)}, Lng: {lng.toFixed(4)}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleUseGps}
                  disabled={gpsLoading}
                  className="px-2.5 py-1.5 rounded-lg bg-blue-100 text-blue-800 hover:bg-blue-200 text-xs font-semibold flex items-center gap-1 active:scale-95"
                >
                  <LocateFixed className="w-3.5 h-3.5" />
                  {gpsLoading ? 'Obteniendo...' : 'Capturar mi GPS'}
                </button>
              </div>
            </div>

            {/* Evidence attachment with strict warning */}
            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1">
                Nota de evidencia / referencia comunitaria (opcional)
              </label>
              <input
                type="text"
                placeholder="Ej. Registrado por cámaras vecinales / patrulla alertada"
                value={evidenceNote}
                onChange={e => setEvidenceNote(e.target.value)}
                className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200"
              />
              <p className="text-[10px] text-slate-400 mt-1">
                ⚠️ Por disposición legal y resguardo cívico, no está permitido adjuntar fotos con rostros de menores ni documentos de identidad.
              </p>
            </div>

            {/* Buttons */}
            <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
              <button
                type="button"
                onClick={handleResetAndClose}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-5 py-2.5 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-md transition-all"
              >
                Enviar reporte ciudadano
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
