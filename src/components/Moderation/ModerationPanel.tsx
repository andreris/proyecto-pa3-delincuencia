import React, { useState } from 'react';
import { useIncidents } from '../../context/IncidentContext';
import { useAuth } from '../../context/AuthContext';
import { IncidentReport } from '../../types';
import {
  ShieldCheck,
  CheckCircle,
  XCircle,
  AlertTriangle,
  BarChart3,
  MapPin,
  Clock,
  Filter,
  History,
  Lock,
  ThumbsUp,
  FileCheck
} from 'lucide-react';

export const ModerationPanel: React.FC = () => {
  const { incidents, verifyIncident, discardIncident, moderationLogs, resetDemoData } = useIncidents();
  const { currentUser, isModerator, switchUserPersona } = useAuth();

  const [activeTab, setActiveTab] = useState<'pending' | 'stats' | 'logs'>('pending');
  const [filterDistrict, setFilterDistrict] = useState<string>('all');
  const [reasonInput, setReasonInput] = useState<{ [id: string]: string }>({});

  const pendingReports = incidents.filter(
    i => i.status === 'Pendiente de validación' && (filterDistrict === 'all' || i.district === filterDistrict)
  );

  const verifiedReports = incidents.filter(i => i.status === 'Verificado');
  const discardedReports = incidents.filter(i => i.status === 'Descartado');

  // Compute District Statistics
  const districtCounts = incidents.reduce((acc, curr) => {
    acc[curr.district] = (acc[curr.district] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const sortedDistricts = Object.entries(districtCounts).sort((a, b) => b[1] - a[1]);

  // Compute Category Statistics
  const categoryCounts = incidents.reduce((acc, curr) => {
    acc[curr.category] = (acc[curr.category] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const sortedCategories = Object.entries(categoryCounts).sort((a, b) => b[1] - a[1]);

  const handleVerify = (report: IncidentReport) => {
    verifyIncident(report.id, currentUser?.name || 'Moderador Comunitario');
  };

  const handleDiscard = (report: IncidentReport) => {
    const reason = reasonInput[report.id] || 'Información no verificable o fuera de zona';
    discardIncident(report.id, currentUser?.name || 'Moderador Comunitario', reason);
  };

  return (
    <div className="flex-1 bg-slate-50 p-4 sm:p-6 lg:p-8 overflow-y-auto">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header card with Role Gate notice */}
        <div className="bg-[#0B1F3A] text-white p-6 sm:p-8 rounded-3xl shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-amber-300 bg-amber-950/80 px-3 py-0.5 rounded-full border border-amber-800">
                Panel Oficial de Moderación
              </span>
              {isModerator && (
                <span className="text-[11px] font-semibold text-emerald-300 bg-emerald-950/80 px-2.5 py-0.5 rounded-full border border-emerald-800">
                  Acceso concedido
                </span>
              )}
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              Control de Calidad y Validación de Reportes
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 max-w-2xl">
              Filtro y auditoría cívica para certificar incidentes genuinos, descartar spam y proteger la privacidad de las familias en Lima y distritos.
            </p>
          </div>

          {!isModerator ? (
            <button
              onClick={() => switchUserPersona('moderador')}
              className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-900 font-extrabold text-xs shadow-md shrink-0 flex items-center gap-2"
            >
              <Lock className="w-4 h-4" />
              Activar modo Moderador
            </button>
          ) : (
            <button
              onClick={resetDemoData}
              className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs border border-slate-700 shrink-0"
              title="Restablecer datos demo"
            >
              Restablecer datos demo
            </button>
          )}
        </div>

        {/* Quick KPI stats strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
            <span className="text-xs text-slate-400 font-medium">Total de reportes</span>
            <p className="text-2xl font-extrabold text-slate-900 mt-1">{incidents.length}</p>
            <span className="text-[10px] text-blue-600 font-semibold">100% geo-referenciados</span>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
            <span className="text-xs text-amber-600 font-medium">Por validar</span>
            <p className="text-2xl font-extrabold text-amber-600 mt-1">
              {incidents.filter(i => i.status === 'Pendiente de validación').length}
            </p>
            <span className="text-[10px] text-slate-400">Requieren revisión</span>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
            <span className="text-xs text-emerald-600 font-medium">Verificados</span>
            <p className="text-2xl font-extrabold text-emerald-600 mt-1">{verifiedReports.length}</p>
            <span className="text-[10px] text-emerald-700 font-semibold">Visibles con sello</span>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
            <span className="text-xs text-slate-400 font-medium">Descartados / Spam</span>
            <p className="text-2xl font-extrabold text-slate-600 mt-1">{discardedReports.length}</p>
            <span className="text-[10px] text-slate-400">Protección comunitaria</span>
          </div>
        </div>

        {/* Tab navigation */}
        <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
          <button
            onClick={() => setActiveTab('pending')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              activeTab === 'pending'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Clock className="w-4 h-4" />
            Cola de Validación ({pendingReports.length})
          </button>

          <button
            onClick={() => setActiveTab('stats')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              activeTab === 'stats'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            Métricas por Distrito y Categoría
          </button>

          <button
            onClick={() => setActiveTab('logs')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              activeTab === 'logs'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <History className="w-4 h-4" />
            Registro de Auditoría ({moderationLogs.length})
          </button>
        </div>

        {/* TAB 1: PENDING QUEUE */}
        {activeTab === 'pending' && (
          <div className="space-y-4">
            {pendingReports.length === 0 ? (
              <div className="bg-white p-12 text-center rounded-3xl border border-slate-200">
                <FileCheck className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
                <h3 className="font-bold text-base text-slate-800">¡Bandeja al día!</h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
                  No hay reportes pendientes de validación en este momento. Todos los incidentes han sido moderados.
                </p>
              </div>
            ) : (
              pendingReports.map(report => (
                <div
                  key={report.id}
                  className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  <div className="space-y-1.5 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-200">
                        {report.category.replace('_', ' ')}
                      </span>
                      <span className="text-[10px] font-semibold text-slate-500">
                        Folio: {report.id}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        • {report.date} a las {report.time}
                      </span>
                    </div>

                    <h3 className="font-bold text-sm text-slate-900">{report.title}</h3>
                    <p className="text-xs text-slate-600 leading-relaxed">{report.description}</p>

                    <div className="pt-2 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                      <span className="flex items-center gap-1 font-semibold text-blue-700">
                        <MapPin className="w-3.5 h-3.5" />
                        {report.approxLocation.address} ({report.district})
                      </span>
                      {report.evidenceNote && (
                        <span className="text-[11px] text-slate-500 italic bg-slate-50 px-2 py-0.5 rounded">
                          Referencia: {report.evidenceNote}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-row md:flex-col gap-2 shrink-0 border-t md:border-t-0 pt-3 md:pt-0">
                    <button
                      onClick={() => handleVerify(report)}
                      className="flex-1 md:flex-initial px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs transition-all"
                    >
                      <CheckCircle className="w-4 h-4" />
                      Aprobar y verificar
                    </button>

                    <button
                      onClick={() => handleDiscard(report)}
                      className="flex-1 md:flex-initial px-4 py-2 rounded-xl bg-slate-100 hover:bg-red-50 text-slate-700 hover:text-red-700 text-xs font-semibold flex items-center justify-center gap-1.5 border border-slate-200 transition-all"
                    >
                      <XCircle className="w-4 h-4" />
                      Descartar reporte
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* TAB 2: STATISTICS */}
        {activeTab === 'stats' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Districts Ranking */}
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
              <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <MapPin className="w-4 h-4 text-blue-600" />
                Reportes por Distrito (Zonas de Concentración)
              </h3>
              <div className="space-y-3">
                {sortedDistricts.map(([district, count]) => {
                  const percentage = Math.round((count / incidents.length) * 100);
                  return (
                    <div key={district} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-slate-800">{district}</span>
                        <span className="text-slate-500 font-bold">{count} incidentes ({percentage}%)</span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className="h-full bg-blue-600 rounded-full"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Categories Ranking */}
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
              <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-blue-600" />
                Incidentes por Categoría
              </h3>
              <div className="space-y-3">
                {sortedCategories.map(([category, count]) => {
                  const percentage = Math.round((count / incidents.length) * 100);
                  return (
                    <div key={category} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-slate-800 uppercase">
                          {category.replace('_', ' ')}
                        </span>
                        <span className="text-slate-500 font-bold">{count} reportes ({percentage}%)</span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className="h-full bg-amber-500 rounded-full"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: AUDIT LOGS */}
        {activeTab === 'logs' && (
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-bold text-xs text-slate-800 uppercase tracking-wider">
                Historial de resoluciones comunitarias
              </h3>
              <span className="text-xs text-slate-500">{moderationLogs.length} acciones registradas</span>
            </div>

            {moderationLogs.length === 0 ? (
              <p className="p-8 text-center text-xs text-slate-500">
                Aún no se han ejecutado acciones de moderación en esta sesión.
              </p>
            ) : (
              <div className="divide-y divide-slate-100 text-xs">
                {moderationLogs.map(log => (
                  <div key={log.id} className="p-4 flex items-center justify-between">
                    <div>
                      <span className="font-bold text-slate-900 block">{log.reportTitle}</span>
                      <span className="text-[11px] text-slate-500">
                        {log.action === 'verificado' ? '✅ Verificado' : '❌ Descartado'} por {log.moderatorName}
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-400">
                      {new Date(log.timestamp).toLocaleTimeString('es-PE')}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
