import React, { createContext, useContext, useState, useEffect } from 'react';
import { IncidentReport, TrustedContact, IncidentCategory, RiskLevel, ReportStatus, ModerationLog } from '../types';
import { DEMO_INCIDENTS, DEMO_TRUSTED_CONTACTS } from '../data/demoData';

interface FilterState {
  category: string;
  district: string;
  riskLevel: string;
  timeRange: string;
  status: string;
  search: string;
}

interface IncidentContextType {
  incidents: IncidentReport[];
  filteredIncidents: IncidentReport[];
  filters: FilterState;
  setFilters: React.Dispatch<React.SetStateAction<FilterState>>;
  resetFilters: () => void;
  selectedIncident: IncidentReport | null;
  setSelectedIncident: (report: IncidentReport | null) => void;
  mapCenter: [number, number];
  setMapCenter: (coords: [number, number]) => void;
  mapZoom: number;
  setMapZoom: (zoom: number) => void;
  addIncident: (data: Omit<IncidentReport, 'id' | 'status' | 'falseReportFlags' | 'helpfulCount' | 'createdAt'>) => string;
  verifyIncident: (id: string, moderatorName: string) => void;
  discardIncident: (id: string, moderatorName: string, reason?: string) => void;
  flagSpamOrFalseReport: (id: string) => void;
  helpfulVote: (id: string) => void;
  trustedContacts: TrustedContact[];
  addTrustedContact: (contact: Omit<TrustedContact, 'id' | 'isConfirmed' | 'createdAt'>) => { success: boolean; error?: string };
  updateTrustedContact: (id: string, contact: Partial<TrustedContact>) => void;
  deleteTrustedContact: (id: string) => void;
  moderationLogs: ModerationLog[];
  sosTriggered: boolean;
  lastSosData: { lat: number; lng: number; timestamp: string } | null;
  activateSos: (lat: number, lng: number) => void;
  clearSos: () => void;
  resetDemoData: () => void;
}

const DEFAULT_FILTERS: FilterState = {
  category: 'all',
  district: 'all',
  riskLevel: 'all',
  timeRange: 'all',
  status: 'all',
  search: ''
};

const IncidentContext = createContext<IncidentContextType | undefined>(undefined);

export const IncidentProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [incidents, setIncidents] = useState<IncidentReport[]>(() => {
    try {
      const saved = localStorage.getItem('vigila_pe_incidents');
      return saved ? JSON.parse(saved) : DEMO_INCIDENTS;
    } catch {
      return DEMO_INCIDENTS;
    }
  });

  const [trustedContacts, setTrustedContacts] = useState<TrustedContact[]>(() => {
    try {
      const saved = localStorage.getItem('vigila_pe_contacts');
      return saved ? JSON.parse(saved) : DEMO_TRUSTED_CONTACTS;
    } catch {
      return DEMO_TRUSTED_CONTACTS;
    }
  });

  const [moderationLogs, setModerationLogs] = useState<ModerationLog[]>(() => {
    try {
      const saved = localStorage.getItem('vigila_pe_mod_logs');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [selectedIncident, setSelectedIncident] = useState<IncidentReport | null>(null);
  
  // Lima default center: -12.06, -77.037
  const [mapCenter, setMapCenter] = useState<[number, number]>([-12.055, -77.035]);
  const [mapZoom, setMapZoom] = useState<number>(12);

  const [sosTriggered, setSosTriggered] = useState<boolean>(false);
  const [lastSosData, setLastSosData] = useState<{ lat: number; lng: number; timestamp: string } | null>(null);

  useEffect(() => {
    localStorage.setItem('vigila_pe_incidents', JSON.stringify(incidents));
  }, [incidents]);

  useEffect(() => {
    localStorage.setItem('vigila_pe_contacts', JSON.stringify(trustedContacts));
  }, [trustedContacts]);

  useEffect(() => {
    localStorage.setItem('vigila_pe_mod_logs', JSON.stringify(moderationLogs));
  }, [moderationLogs]);

  const resetFilters = () => {
    setFilters(DEFAULT_FILTERS);
  };

  const addIncident = (
    data: Omit<IncidentReport, 'id' | 'status' | 'falseReportFlags' | 'helpfulCount' | 'createdAt'>
  ): string => {
    const id = `VIG-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
    
    // Privacy protection: slightly randomize coordinates by ~100m to avoid pinpointing exact residences
    const jitterLat = (Math.random() - 0.5) * 0.0012;
    const jitterLng = (Math.random() - 0.5) * 0.0012;

    const newReport: IncidentReport = {
      ...data,
      id,
      approxLocation: {
        lat: Number((data.approxLocation.lat + jitterLat).toFixed(5)),
        lng: Number((data.approxLocation.lng + jitterLng).toFixed(5)),
        address: data.approxLocation.address || 'Zona referencial en ' + data.district
      },
      status: 'Pendiente de validación',
      falseReportFlags: 0,
      helpfulCount: 1,
      createdAt: new Date().toISOString()
    };

    setIncidents(prev => [newReport, ...prev]);
    return id;
  };

  const verifyIncident = (id: string, moderatorName: string) => {
    setIncidents(prev =>
      prev.map(item => (item.id === id ? { ...item, status: 'Verificado' as ReportStatus } : item))
    );

    const target = incidents.find(i => i.id === id);
    if (target) {
      setModerationLogs(prev => [
        {
          id: 'log-' + Date.now(),
          reportId: id,
          reportTitle: target.title,
          action: 'verificado',
          moderatorName,
          timestamp: new Date().toISOString()
        },
        ...prev
      ]);
    }
  };

  const discardIncident = (id: string, moderatorName: string, reason?: string) => {
    setIncidents(prev =>
      prev.map(item => (item.id === id ? { ...item, status: 'Descartado' as ReportStatus } : item))
    );

    const target = incidents.find(i => i.id === id);
    if (target) {
      setModerationLogs(prev => [
        {
          id: 'log-' + Date.now(),
          reportId: id,
          reportTitle: target.title,
          action: 'descartado',
          moderatorName,
          timestamp: new Date().toISOString(),
          reason
        },
        ...prev
      ]);
    }
  };

  const flagSpamOrFalseReport = (id: string) => {
    setIncidents(prev =>
      prev.map(item =>
        item.id === id ? { ...item, falseReportFlags: item.falseReportFlags + 1 } : item
      )
    );
  };

  const helpfulVote = (id: string) => {
    setIncidents(prev =>
      prev.map(item =>
        item.id === id ? { ...item, helpfulCount: item.helpfulCount + 1 } : item
      )
    );
  };

  const addTrustedContact = (
    contact: Omit<TrustedContact, 'id' | 'isConfirmed' | 'createdAt'>
  ): { success: boolean; error?: string } => {
    if (trustedContacts.length >= 3) {
      return { success: false, error: 'Has alcanzado el límite máximo de 3 contactos de confianza.' };
    }
    const newContact: TrustedContact = {
      ...contact,
      id: 'contact-' + Date.now().toString(36),
      isConfirmed: true,
      createdAt: new Date().toISOString()
    };
    setTrustedContacts(prev => [...prev, newContact]);
    return { success: true };
  };

  const updateTrustedContact = (id: string, contactUpdates: Partial<TrustedContact>) => {
    setTrustedContacts(prev =>
      prev.map(c => (c.id === id ? { ...c, ...contactUpdates } : c))
    );
  };

  const deleteTrustedContact = (id: string) => {
    setTrustedContacts(prev => prev.filter(c => c.id !== id));
  };

  const activateSos = (lat: number, lng: number) => {
    const timestamp = new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setSosTriggered(true);
    setLastSosData({ lat, lng, timestamp });
  };

  const clearSos = () => {
    setSosTriggered(false);
  };

  const resetDemoData = () => {
    setIncidents(DEMO_INCIDENTS);
    setTrustedContacts(DEMO_TRUSTED_CONTACTS);
    setModerationLogs([]);
    setFilters(DEFAULT_FILTERS);
    localStorage.removeItem('vigila_pe_incidents');
    localStorage.removeItem('vigila_pe_contacts');
    localStorage.removeItem('vigila_pe_mod_logs');
  };

  // Filter computation
  const filteredIncidents = incidents.filter(item => {
    if (filters.category !== 'all' && item.category !== filters.category) return false;
    if (filters.district !== 'all' && !item.district.toLowerCase().includes(filters.district.toLowerCase()) && filters.district !== 'Todos los distritos') {
      return false;
    }
    if (filters.riskLevel !== 'all' && item.riskLevel !== filters.riskLevel) return false;
    if (filters.status !== 'all') {
      if (filters.status === 'verificados' && item.status !== 'Verificado') return false;
      if (filters.status === 'pendientes' && item.status !== 'Pendiente de validación') return false;
    }
    if (filters.search) {
      const q = filters.search.toLowerCase();
      const match =
        item.title.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.district.toLowerCase().includes(q) ||
        item.approxLocation.address.toLowerCase().includes(q);
      if (!match) return false;
    }
    return true;
  });

  return (
    <IncidentContext.Provider
      value={{
        incidents,
        filteredIncidents,
        filters,
        setFilters,
        resetFilters,
        selectedIncident,
        setSelectedIncident,
        mapCenter,
        setMapCenter,
        mapZoom,
        setMapZoom,
        addIncident,
        verifyIncident,
        discardIncident,
        flagSpamOrFalseReport,
        helpfulVote,
        trustedContacts,
        addTrustedContact,
        updateTrustedContact,
        deleteTrustedContact,
        moderationLogs,
        sosTriggered,
        lastSosData,
        activateSos,
        clearSos,
        resetDemoData
      }}
    >
      {children}
    </IncidentContext.Provider>
  );
};

export const useIncidents = () => {
  const context = useContext(IncidentContext);
  if (!context) {
    throw new Error('useIncidents must be used within an IncidentProvider');
  }
  return context;
};
