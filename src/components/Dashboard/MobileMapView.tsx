import {useState} from 'react';
import {Search, Filter, ChevronRight} from 'lucide-react';
import {LeafletMap} from '../Map/LeafletMap';
import {PERU_DISTRICTS} from '../../data/demoData';
import {useIncidents} from '../../context/IncidentContext';
import type {IncidentReport} from '../../types';

export function MobileMapView() {
  const {filteredIncidents, filters, setFilters, selectedIncident, setSelectedIncident, mapCenter, setMapCenter} = useIncidents();
  const [showFiltersSheet, setShowFiltersSheet] = useState(false);
  const [bottomListExpanded, setBottomListExpanded] = useState(false);

  const handleSelectIncidentFromSheet = (item: IncidentReport) => {
    setSelectedIncident(item);
    setMapCenter([item.approxLocation.lat, item.approxLocation.lng]);
    setBottomListExpanded(false);
  };

  return (<>
          <div className="h-full w-full relative">
            <div className="absolute inset-x-0 top-0 bottom-24"><LeafletMap mobileControls
              incidents={filteredIncidents}
              selectedIncident={selectedIncident}
              onSelectIncident={setSelectedIncident}
              center={mapCenter}
              zoom={12}
              className="h-full w-full"
            /></div>

            {/* Floating Search & Filter Pill on Top of Map */}
            <div className="absolute top-3 left-3 right-14 z-20 flex items-center gap-2">
              <div className="flex-1 bg-white/95 backdrop-blur-md rounded-2xl shadow-lg border border-slate-200 px-3 py-2 flex items-center gap-2">
                <Search className="w-4 h-4 text-slate-400 shrink-0" />
                <input
                  type="text"
                  placeholder="Buscar calle o distrito en Lima..."
                  value={filters.search}
                  onChange={e => setFilters(prev => ({ ...prev, search: e.target.value }))}
                  className="w-full text-xs bg-transparent focus:outline-none text-slate-800"
                />
              </div>

              <button
                onClick={() => setShowFiltersSheet(true)}
                className={`p-2.5 rounded-2xl shadow-lg border transition-all ${
                  filters.district !== 'all' || filters.riskLevel !== 'all' || filters.category !== 'all'
                    ? 'bg-blue-600 text-white border-blue-700'
                    : 'bg-white/95 text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
                title="Filtros"
              >
                <Filter className="w-4 h-4" />
              </button>
            </div>

            {/* Bottom Floating Drawer for Quick Incident Peek */}
            <div
              className={`absolute left-0 right-0 bottom-0 z-20 bg-white rounded-t-3xl shadow-2xl border-t border-slate-200 transition-all duration-300 ease-in-out ${
                bottomListExpanded ? 'h-[72%]' : 'h-24'
              }`}
            >
              {/* Drag handle */}
              <div
                onClick={() => setBottomListExpanded(prev => !prev)}
                className="py-2.5 flex flex-col items-center justify-center cursor-pointer border-b border-slate-100"
              >
                <div className="w-10 h-1 bg-slate-300 rounded-full mb-1"></div>
                <div className="flex items-center justify-between w-full px-4 text-xs">
                  <span className="font-bold text-slate-800 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    {filteredIncidents.length} incidentes en el mapa
                  </span>
                  <span className="text-blue-600 font-semibold text-[11px] flex items-center gap-1">
                    {bottomListExpanded ? 'Ocultar lista' : 'Ver reportes'}
                    <ChevronRight className={`w-3.5 h-3.5 transition-transform ${bottomListExpanded ? '-rotate-90' : 'rotate-90'}`} />
                  </span>
                </div>
              </div>

              {/* Scrollable incidents inside drawer */}
              <div className="p-3 space-y-2 h-[calc(100%-48px)] overflow-y-auto">
                {filteredIncidents.map(item => (
                  <div
                    key={item.id}
                    onClick={() => handleSelectIncidentFromSheet(item)}
                    className="p-3 rounded-2xl bg-slate-50 hover:bg-blue-50/40 border border-slate-200 cursor-pointer transition-all"
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-blue-100 text-blue-800">
                        {item.category.replace('_', ' ')}
                      </span>
                      <span className="text-[10px] text-slate-400 font-medium">{item.time}</span>
                    </div>
                    <h4 className="font-bold text-xs text-slate-900 leading-snug">{item.title}</h4>
                    <p className="text-[11px] text-slate-500 truncate mt-0.5">
                      📍 {item.approxLocation.address} ({item.district})
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
      {showFiltersSheet && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white rounded-t-3xl p-5 shadow-2xl text-slate-800 space-y-4 animate-in slide-in-from-bottom duration-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-extrabold text-sm text-slate-900">Filtros de Geoseguridad</h3>
              <button
                onClick={() => setShowFiltersSheet(false)}
                className="text-xs font-bold text-blue-600"
              >
                Listo
              </button>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Distrito:</label>
              <select
                value={filters.district}
                onChange={e => setFilters(prev => ({ ...prev, district: e.target.value }))}
                className="w-full text-xs p-2.5 rounded-xl border border-slate-200 bg-white"
              >
                {PERU_DISTRICTS.map(d => (
                  <option key={d} value={d === 'Todos los distritos' ? 'all' : d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Nivel de riesgo:</label>
              <div className="grid grid-cols-3 gap-2">
                {['all', 'alto', 'medio', 'informativo'].map(r => (
                  <button
                    key={r}
                    onClick={() => setFilters(prev => ({ ...prev, riskLevel: r }))}
                    className={`py-2 px-1 text-xs rounded-xl border font-bold capitalize ${
                      filters.riskLevel === r
                        ? 'bg-blue-50 border-blue-600 text-blue-800'
                        : 'border-slate-200 text-slate-600'
                    }`}
                  >
                    {r === 'all' ? 'Todos' : r}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={() => {
                setFilters({
                  category: 'all',
                  district: 'all',
                  riskLevel: 'all',
                  timeRange: 'all',
                  status: 'all',
                  search: ''
                });
                setShowFiltersSheet(false);
              }}
              className="w-full py-2.5 text-xs text-slate-500 hover:text-slate-800 font-semibold"
            >
              Restablecer todos los filtros
            </button>
          </div>
        </div>
      )}
  </>);
}
