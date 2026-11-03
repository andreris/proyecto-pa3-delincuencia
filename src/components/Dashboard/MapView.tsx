import React, { useState } from 'react';
import { useIncidents } from '../../context/IncidentContext';
import { LeafletMap } from '../Map/LeafletMap';
import { IncidentList } from './IncidentList';
import { IncidentDetailModal } from './IncidentDetailModal';
import { IncidentReport } from '../../types';
import {
  List,
  Map as MapIcon,
  PlusCircle,
  AlertTriangle,
  Info,
  Shield,
  Layers,
  ChevronUp,
  ChevronDown
} from 'lucide-react';

interface MapViewProps {
  onOpenReportModal: () => void;
}

export const MapView: React.FC<MapViewProps> = ({ onOpenReportModal }) => {
  const {
    filteredIncidents,
    selectedIncident,
    setSelectedIncident,
    mapCenter,
    mapZoom
  } = useIncidents();

  const [mobileTab, setMobileTab] = useState<'map' | 'list'>('map');
  const [detailModalOpen, setDetailModalOpen] = useState(false);

  const handleSelectIncident = (incident: IncidentReport | null) => {
    setSelectedIncident(incident);
    if (incident) {
      setDetailModalOpen(true);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden relative">
      {/* Mobile Switcher Bar (only on smaller screens) */}
      <div className="sm:hidden flex items-center justify-between bg-white border-b border-slate-200 px-3 py-2 z-20">
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
          <button
            onClick={() => setMobileTab('map')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-all ${
              mobileTab === 'map' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600'
            }`}
          >
            <MapIcon className="w-3.5 h-3.5" />
            Mapa ({filteredIncidents.length})
          </button>
          <button
            onClick={() => setMobileTab('list')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-all ${
              mobileTab === 'list' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600'
            }`}
          >
            <List className="w-3.5 h-3.5" />
            Lista
          </button>
        </div>

        <button
          onClick={onOpenReportModal}
          className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-blue-600 text-white font-bold text-xs shadow-xs"
        >
          <PlusCircle className="w-3.5 h-3.5" />
          Reportar
        </button>
      </div>

      {/* Main Layout Container */}
      <div className="flex-1 flex flex-row overflow-hidden relative">
        {/* Left Sidebar: Incident List */}
        <div
          className={`w-full sm:w-[380px] lg:w-[420px] h-full z-10 ${
            mobileTab === 'list' ? 'block' : 'hidden sm:block'
          }`}
        >
          <IncidentList
            onSelectIncident={handleSelectIncident}
            className="h-full"
          />
        </div>

        {/* Right Canvas: Leaflet Map */}
        <div
          className={`flex-1 h-full relative ${
            mobileTab === 'map' ? 'block' : 'hidden sm:block'
          }`}
        >
          <LeafletMap
            incidents={filteredIncidents}
            selectedIncident={selectedIncident}
            onSelectIncident={handleSelectIncident}
            center={mapCenter}
            zoom={mapZoom}
            className="h-full w-full"
          />

          {/* Quick Floating Action to report directly on desktop map */}
          <div className="hidden sm:block absolute top-4 left-4 z-20">
            <button
              onClick={onOpenReportModal}
              className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-[#0B1F3A] hover:bg-blue-900 text-white font-bold text-xs shadow-lg active:scale-95 transition-all border border-blue-800"
            >
              <PlusCircle className="w-4 h-4 text-blue-400" />
              Reportar nuevo incidente
            </button>
          </div>
        </div>
      </div>

      {/* Detail Modal */}
      {detailModalOpen && (
        <IncidentDetailModal
          incident={selectedIncident}
          onClose={() => {
            setDetailModalOpen(false);
          }}
        />
      )}
    </div>
  );
};
