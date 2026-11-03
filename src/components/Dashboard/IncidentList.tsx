import React from 'react';
import { useIncidents } from '../../context/IncidentContext';
import { IncidentReport, IncidentCategory, RiskLevel } from '../../types';
import { PERU_DISTRICTS } from '../../data/demoData';
import {
  Search,
  Filter,
  ShieldAlert,
  AlertTriangle,
  Info,
  MapPin,
  Clock,
  ThumbsUp,
  Flag,
  CheckCircle2,
  AlertCircle,
  Eye,
  RefreshCw
} from 'lucide-react';

interface IncidentListProps {
  onSelectIncident: (incident: IncidentReport) => void;
  className?: string;
}

export const IncidentList: React.FC<IncidentListProps> = ({ onSelectIncident, className = '' }) => {
  const {
    filteredIncidents,
    filters,
    setFilters,
    resetFilters,
    selectedIncident,
    setMapCenter,
    flagSpamOrFalseReport,
    helpfulVote
  } = useIncidents();

  const handleCenterOnMap = (incident: IncidentReport) => {
    setMapCenter([incident.approxLocation.lat, incident.approxLocation.lng]);
    onSelectIncident(incident);
  };

  const getCategoryIcon = (category: IncidentCategory) => {
    switch (category) {
      case 'asalto':
      case 'robo':
        return <ShieldAlert className="w-4 h-4 text-red-500" />;
      case 'extorsion':
        return <AlertTriangle className="w-4 h-4 text-red-600" />;
      case 'accidente':
        return <AlertCircle className="w-4 h-4 text-amber-500" />;
      case 'actividad_sospechosa':
        return <Eye className="w-4 h-4 text-amber-600" />;
      default:
        return <Info className="w-4 h-4 text-blue-500" />;
    }
  };

  return (
    <div className={`flex flex-col bg-white border-r border-slate-200 h-full ${className}`}>
      {/* Header and Filters Bar */}
      <div className="p-4 border-b border-slate-100 bg-slate-50/70">
        <div className="flex items-center justify-between gap-2 mb-3">
          <div>
            <h2 className="font-bold text-base text-slate-900 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-blue-600" />
              Reportes en tiempo real
            </h2>
            <p className="text-xs text-slate-500">
              {filteredIncidents.length} de {filteredIncidents.length} incidentes visibles
            </p>
          </div>
          <button
            onClick={resetFilters}
            className="text-[11px] font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1 px-2 py-1 rounded bg-blue-50"
            title="Restablecer filtros"
          >
            <RefreshCw className="w-3 h-3" />
            Limpiar
          </button>
        </div>

        {/* Search input */}
        <div className="relative mb-2.5">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar por avenida, lugar o descripción..."
            value={filters.search}
            onChange={e => setFilters(prev => ({ ...prev, search: e.target.value }))}
            className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-white border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          />
        </div>

        {/* Filter controls row */}
        <div className="grid grid-cols-2 gap-2">
          {/* District selector */}
          <select
            value={filters.district}
            onChange={e => setFilters(prev => ({ ...prev, district: e.target.value }))}
            className="text-xs py-1.5 px-2.5 rounded-lg bg-white border border-slate-200 text-slate-700 focus:outline-none focus:border-blue-500"
          >
            {PERU_DISTRICTS.map(d => (
              <option key={d} value={d === 'Todos los distritos' ? 'all' : d}>
                {d}
              </option>
            ))}
          </select>

          {/* Risk Level selector */}
          <select
            value={filters.riskLevel}
            onChange={e => setFilters(prev => ({ ...prev, riskLevel: e.target.value }))}
            className="text-xs py-1.5 px-2.5 rounded-lg bg-white border border-slate-200 text-slate-700 focus:outline-none focus:border-blue-500"
          >
            <option value="all">Todos los riesgos</option>
            <option value="alto">🔴 Riesgo Alto</option>
            <option value="medio">🟡 Riesgo Medio</option>
            <option value="informativo">🔵 Informativo</option>
          </select>

          {/* Category selector */}
          <select
            value={filters.category}
            onChange={e => setFilters(prev => ({ ...prev, category: e.target.value }))}
            className="text-xs py-1.5 px-2.5 rounded-lg bg-white border border-slate-200 text-slate-700 focus:outline-none focus:border-blue-500"
          >
            <option value="all">Todas las categorías</option>
            <option value="robo">Robo de bienes</option>
            <option value="asalto">Asalto a transeúnte</option>
            <option value="extorsion">Extorsión / Cupos</option>
            <option value="accidente">Accidente de tránsito</option>
            <option value="actividad_sospechosa">Actividad sospechosa</option>
            <option value="hurto_menor">Arrebato / Celular</option>
            <option value="otro">Vía pública / Servicios</option>
          </select>

          {/* Status selector */}
          <select
            value={filters.status}
            onChange={e => setFilters(prev => ({ ...prev, status: e.target.value }))}
            className="text-xs py-1.5 px-2.5 rounded-lg bg-white border border-slate-200 text-slate-700 focus:outline-none focus:border-blue-500"
          >
            <option value="all">Todos los estados</option>
            <option value="verificados">✓ Verificados</option>
            <option value="pendientes">⏳ En validación</option>
          </select>
        </div>
      </div>

      {/* Incident Cards Scrollable Area */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {filteredIncidents.length === 0 ? (
          <div className="text-center py-12 px-4">
            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3 text-slate-400">
              <Filter className="w-6 h-6" />
            </div>
            <p className="text-sm font-semibold text-slate-700">No se encontraron reportes</p>
            <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
              Prueba cambiando o limpiando los filtros para ver incidentes en otros distritos o rangos.
            </p>
            <button
              onClick={resetFilters}
              className="mt-3 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700"
            >
              Ver todos los reportes
            </button>
          </div>
        ) : (
          filteredIncidents.map(item => {
            const isSelected = selectedIncident?.id === item.id;
            const riskBorderColor =
              item.riskLevel === 'alto'
                ? 'border-l-red-500'
                : item.riskLevel === 'medio'
                ? 'border-l-amber-500'
                : 'border-l-blue-500';

            return (
              <div
                key={item.id}
                onClick={() => handleCenterOnMap(item)}
                className={`p-3.5 rounded-xl border bg-white transition-all cursor-pointer border-l-4 ${riskBorderColor} ${
                  isSelected
                    ? 'border-blue-500 shadow-md ring-2 ring-blue-500/20 bg-blue-50/20'
                    : 'border-slate-200 hover:border-slate-300 hover:shadow-sm'
                }`}
              >
                {/* Header row */}
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-1.5">
                    {getCategoryIcon(item.category)}
                    <span className="text-[11px] font-bold text-slate-800 uppercase tracking-wide">
                      {item.category.replace('_', ' ')}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    {item.status === 'Verificado' ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                        <CheckCircle2 className="w-3 h-3" /> Verificado
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                        <Clock className="w-3 h-3" /> En validación
                      </span>
                    )}
                  </div>
                </div>

                {/* Title and description */}
                <h3 className="font-bold text-sm text-slate-900 leading-snug mb-1">
                  {item.title}
                </h3>
                <p className="text-xs text-slate-600 line-clamp-2 mb-2 leading-relaxed">
                  {item.description}
                </p>

                {/* Approximate location & district */}
                <div className="text-[11px] text-slate-500 space-y-1 mb-2.5 bg-slate-50 p-2 rounded-lg border border-slate-100">
                  <div className="flex items-center gap-1.5 text-slate-700 font-medium truncate">
                    <MapPin className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                    <span className="truncate">{item.approxLocation.address}</span>
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-slate-500">
                    <span className="font-semibold text-blue-800">{item.district}</span>
                    <span>{item.date} • {item.time}</span>
                  </div>
                </div>

                {/* Footer and community actions */}
                <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        helpfulVote(item.id);
                      }}
                      className="flex items-center gap-1 text-slate-500 hover:text-blue-600 active:scale-95 transition-all text-[11px]"
                      title="Marcar como reporte útil"
                    >
                      <ThumbsUp className="w-3.5 h-3.5" />
                      <span>{item.helpfulCount}</span>
                    </button>

                    <button
                      onClick={e => {
                        e.stopPropagation();
                        flagSpamOrFalseReport(item.id);
                      }}
                      className="flex items-center gap-1 text-slate-400 hover:text-red-600 active:scale-95 transition-all text-[11px]"
                      title="Reportar información incorrecta o spam"
                    >
                      <Flag className="w-3.5 h-3.5" />
                      {item.falseReportFlags > 0 && <span>{item.falseReportFlags}</span>}
                    </button>
                  </div>

                  <span className="text-[10px] font-semibold text-blue-600 flex items-center gap-1 hover:underline">
                    Ver en mapa →
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
