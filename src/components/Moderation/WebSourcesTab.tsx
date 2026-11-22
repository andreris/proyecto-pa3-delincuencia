import {newsMedia, type NewsMediaId} from '../../../server/src/newsMedia';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useIncidents } from '../../context/IncidentContext';
import {
  ALLOWED_SOCIAL_DISTRICTS,
  DEMO_WEB_NEWS,
  INCIDENT_FILTER_OPTIONS,
  LOCATION_REF_OPTIONS
} from '../../data/demoData';
import {
  ApiClientError,
  clearAutomaticWebDiscardedNews,
  fetchWebAuditLogs,
  fetchWebNews,
  fetchWebStatus,
  reviewBackendWebNews,
  triggerRppSync,
  updateWebConfig,
  WebStatusResponse
} from '../../services/apiClient';
import {
  IncidentCategory,
  IncidentFilterKey,
  IncidentReport,
  LocationReferenceKey,
  RiskLevel,
  SocialPost,
  SocialSourceAudit,
  WebNewsItem
} from '../../types';
import { getSafeExternalUrl, getSafeImageUrl, sanitizeExternalText } from '../../utils/sanitize';
import { SocialPostReviewModal } from './SocialPostReviewModal';
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  ChevronDown,
  Clock,
  ExternalLink,
  Filter,
  Globe,
  History,
  Link2,
  Lock,
  MapPin,
  Newspaper,
  PlusCircle,
  RefreshCw,
  Rss,
  X,
  XCircle
} from 'lucide-react';

function mapWebNewsToReviewPost(item: WebNewsItem): SocialPost {
  return {
    id: item.id,
    platform: 'x',
    source: 'x',
    externalPostId: item.externalId,
    postUrl: item.originalUrl,
    text: item.excerpt,
    publishedAt: item.publishedAt,
    importedAt: item.importedAt,
    queryUsed: 'RPP Noticias — RSS oficial',
    status: item.status,
    state: item.state,
    suggestedCategory: item.suggestedCategory,
    suggestedRiskLevel: item.suggestedRiskLevel,
    suggestedDistrict: item.district,
    detectedDistrict: item.detectedDistrict,
    district: item.district,
    latitude: item.latitude,
    longitude: item.longitude,
    locationLabel: item.locationLabel,
    locationConfidence: item.locationConfidence,
    locationStatus: item.locationStatus,
    locationSource: item.locationSource,
    isLimaValidated: item.isLimaValidated,
    confirmedLocationDescription: item.confirmedLocationDescription,
    moderatorId: item.moderatorId,
    moderatorName: item.moderatorName,
    reviewReason: item.reviewReason,
    reviewedAt: item.reviewedAt,
    linkedIncidentId: item.linkedIncidentId,
    isDemo: item.isDemo
  };
}

export const WebSourcesTab: React.FC = () => {
  const {
    currentUser,
    isModerator,
    isModeratorAuthenticated,
    openModeratorModal
  } = useAuth();
  const {
    incidents,
    upsertIncident,
    backendAvailable
  } = useIncidents();

  const [medium, setMedium] = useState<NewsMediaId>("rpp");
  const [newsItems, setNewsItems] = useState<WebNewsItem[]>(() => {
    try {
      const saved = localStorage.getItem('vigila_pe_demo_web_news');
      return saved ? JSON.parse(saved) : DEMO_WEB_NEWS;
    } catch {
      return DEMO_WEB_NEWS;
    }
  });
  const [auditLogs, setAuditLogs] = useState<SocialSourceAudit[]>([]);
  const [statusInfo, setStatusInfo] = useState<WebStatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<
    'Pendiente de validación' | 'all' | 'Descartado'
  >('Pendiente de validación');

  // Visual filter inputs (draft vs applied)
  const [draftIncidentTypes, setDraftIncidentTypes] = useState<IncidentFilterKey[]>([]);
  const [draftLocationRefs, setDraftLocationRefs] = useState<LocationReferenceKey[]>([]);
  const [draftAdditionalKeywords, setDraftAdditionalKeywords] = useState<string>('');
  const [draftDistricts, setDraftDistricts] = useState<string[]>([]);
  const [draftDateFrom, setDraftDateFrom] = useState<string>('');
  const [draftDateTo, setDraftDateTo] = useState<string>('');

  const [appliedIncidentTypes, setAppliedIncidentTypes] = useState<IncidentFilterKey[]>([]);
  const [appliedLocationRefs, setAppliedLocationRefs] = useState<LocationReferenceKey[]>([]);
  const [appliedAdditionalKeywords, setAppliedAdditionalKeywords] = useState<string>('');
  const [appliedDistricts, setAppliedDistricts] = useState<string[]>([]);
  const [appliedDateFrom, setAppliedDateFrom] = useState<string>('');
  const [appliedDateTo, setAppliedDateTo] = useState<string>('');

  const [districtMenuOpen, setDistrictMenuOpen] = useState(false);
  const [filterValidationError, setFilterValidationError] = useState<string | null>(null);
  const [filtersInitialized, setFiltersInitialized] = useState(false);
  const districtDropdownRef = useRef<HTMLDivElement | null>(null);

  // Review / geolocation modal state
  const [reviewingItem, setReviewingItem] = useState<WebNewsItem | null>(null);
  const [submittingAction, setSubmittingAction] = useState(false);

  // Link Existing modal state
  const [linkingItem, setLinkingItem] = useState<WebNewsItem | null>(null);
  const [selectedIncidentId, setSelectedIncidentId] = useState<string>('');

  // Close district dropdown when clicking outside
  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (
        districtDropdownRef.current &&
        !districtDropdownRef.current.contains(e.target as Node)
      ) {
        setDistrictMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  // Persist demo items locally when backend is absent
  useEffect(() => {
    if (!backendAvailable) {
      localStorage.setItem('vigila_pe_demo_web_news', JSON.stringify(newsItems));
    }
  }, [newsItems, backendAvailable]);

  const loadBackendWebData = async (overrideFilters?: {
    districts?: string[];
    incidentTypes?: IncidentFilterKey[];
    locationReferences?: LocationReferenceKey[];
    additionalKeywords?: string;
    dateFrom?: string;
    dateTo?: string;
  }) => {
    if (!backendAvailable || !isModeratorAuthenticated) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const statusData = await fetchWebStatus(currentUser);
      const effectiveDistricts =
        overrideFilters?.districts !== undefined
          ? overrideFilters.districts
          : filtersInitialized
          ? appliedDistricts
          : statusData.filterDistricts || [];
      const effectiveIncidentTypes =
        overrideFilters?.incidentTypes !== undefined
          ? overrideFilters.incidentTypes
          : filtersInitialized
          ? appliedIncidentTypes
          : statusData.filterIncidentTypes || [];
      const effectiveLocationRefs =
        overrideFilters?.locationReferences !== undefined
          ? overrideFilters.locationReferences
          : filtersInitialized
          ? appliedLocationRefs
          : statusData.filterLocationRefs || [];
      const effectiveAdditional =
        overrideFilters?.additionalKeywords !== undefined
          ? overrideFilters.additionalKeywords
          : filtersInitialized
          ? appliedAdditionalKeywords
          : statusData.additionalKeywords || '';
      const effectiveDateFrom =
        overrideFilters?.dateFrom !== undefined
          ? overrideFilters.dateFrom
          : filtersInitialized
          ? appliedDateFrom
          : statusData.filterDateFrom || '';
      const effectiveDateTo =
        overrideFilters?.dateTo !== undefined
          ? overrideFilters.dateTo
          : filtersInitialized
          ? appliedDateTo
          : statusData.filterDateTo || '';

      const [newsData, logsData] = await Promise.all([
        fetchWebNews(currentUser, {
          districts: effectiveDistricts,
          incidentTypes: effectiveIncidentTypes,
          locationReferences: effectiveLocationRefs,
          additionalKeywords: effectiveAdditional || undefined,
          dateFrom: effectiveDateFrom || undefined,
          dateTo: effectiveDateTo || undefined
        }),
        fetchWebAuditLogs(currentUser)
      ]);

      setStatusInfo({ ...statusData, stats: newsData.stats });
      if (overrideFilters === undefined && !filtersInitialized) {
        const initDistricts = statusData.filterDistricts || [];
        const initIncidentTypes = statusData.filterIncidentTypes || [];
        const initLocationRefs = statusData.filterLocationRefs || [];
        const initAdditional = statusData.additionalKeywords || '';
        const initFrom = statusData.filterDateFrom || '';
        const initTo = statusData.filterDateTo || '';
        setDraftDistricts(initDistricts);
        setAppliedDistricts(initDistricts);
        setDraftIncidentTypes(initIncidentTypes);
        setAppliedIncidentTypes(initIncidentTypes);
        setDraftLocationRefs(initLocationRefs);
        setAppliedLocationRefs(initLocationRefs);
        setDraftAdditionalKeywords(initAdditional);
        setAppliedAdditionalKeywords(initAdditional);
        setDraftDateFrom(initFrom);
        setAppliedDateFrom(initFrom);
        setDraftDateTo(initTo);
        setAppliedDateTo(initTo);
        setFiltersInitialized(true);
      }
      setNewsItems(newsData.news);
      setAuditLogs(logsData);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error cargando fuentes web.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (backendAvailable && isModeratorAuthenticated) {
      loadBackendWebData();
    }
  }, [backendAvailable, isModeratorAuthenticated, currentUser?.uid, currentUser?.role]);

  const toggleDraftIncidentType = (key: IncidentFilterKey) => {
    setDraftIncidentTypes(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  const toggleDraftLocationRef = (key: LocationReferenceKey) => {
    setDraftLocationRefs(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  const toggleDraftDistrict = (district: string) => {
    setDraftDistricts(prev =>
      prev.includes(district) ? prev.filter(d => d !== district) : [...prev, district]
    );
  };

  const handleApplyFilters = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setFilterValidationError(null);
    setErrorMsg(null);
    setSuccessMsg(null);

    if (draftDateFrom && draftDateTo && draftDateFrom > draftDateTo) {
      setFilterValidationError('La fecha desde no puede ser posterior a la fecha hasta.');
      return;
    }

    if (draftAdditionalKeywords.trim().length > 80) {
      setFilterValidationError('Las palabras adicionales no pueden superar los 80 caracteres.');
      return;
    }

    const nextIncidentTypes = [...draftIncidentTypes];
    const nextLocationRefs = [...draftLocationRefs];
    const nextAdditional = draftAdditionalKeywords.trim();
    const nextDistricts = [...draftDistricts];
    const nextFrom = draftDateFrom;
    const nextTo = draftDateTo;

    setAppliedIncidentTypes(nextIncidentTypes);
    setAppliedLocationRefs(nextLocationRefs);
    setAppliedAdditionalKeywords(nextAdditional);
    setAppliedDistricts(nextDistricts);
    setAppliedDateFrom(nextFrom);
    setAppliedDateTo(nextTo);
    setDistrictMenuOpen(false);
    setFiltersInitialized(true);

    if (nextDistricts.includes('Sin distrito') && nextDistricts.length === 1) {
      setStatusFilter('Descartado');
    }

    if (!backendAvailable || !isModeratorAuthenticated) {
      setSuccessMsg('Filtros visuales aplicados en Modo demo.');
      return;
    }

    setLoading(true);
    try {
      const syncableDistricts = nextDistricts.filter(d => d !== 'Sin distrito');
      await updateWebConfig(currentUser, {
        filterDistricts: syncableDistricts,
        filterIncidentTypes: nextIncidentTypes,
        filterLocationRefs: nextLocationRefs,
        additionalKeywords: nextAdditional,
        filterDateFrom: nextFrom || null,
        filterDateTo: nextTo || null
      });
      await loadBackendWebData({
        districts: nextDistricts,
        incidentTypes: nextIncidentTypes,
        locationReferences: nextLocationRefs,
        additionalKeywords: nextAdditional,
        dateFrom: nextFrom,
        dateTo: nextTo
      });
      setSuccessMsg(
        'Filtros aplicados a las noticias importadas y guardados para el próximo consumo del RSS del medio seleccionado.'
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'No se pudieron aplicar los filtros.');
      setLoading(false);
    }
  };

  const handleClearFilters = async () => {
    setFilterValidationError(null);
    setErrorMsg(null);
    setSuccessMsg(null);
    setDraftIncidentTypes([]);
    setDraftLocationRefs([]);
    setDraftAdditionalKeywords('');
    setDraftDistricts([]);
    setDraftDateFrom('');
    setDraftDateTo('');
    setAppliedIncidentTypes([]);
    setAppliedLocationRefs([]);
    setAppliedAdditionalKeywords('');
    setAppliedDistricts([]);
    setAppliedDateFrom('');
    setAppliedDateTo('');
    setDistrictMenuOpen(false);
    setFiltersInitialized(true);

    if (!backendAvailable || !isModeratorAuthenticated) {
      setSuccessMsg('Filtros restablecidos.');
      return;
    }

    setLoading(true);
    try {
      await updateWebConfig(currentUser, {
        filterDistricts: [],
        filterIncidentTypes: [],
        filterLocationRefs: [],
        additionalKeywords: '',
        filterDateFrom: null,
        filterDateTo: null
      });
      await loadBackendWebData({
        districts: [],
        incidentTypes: [],
        locationReferences: [],
        additionalKeywords: '',
        dateFrom: '',
        dateTo: ''
      });
      setSuccessMsg('Filtros limpiados.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'No se pudieron limpiar los filtros.');
      setLoading(false);
    }
  };

  const removeActiveIncidentChip = async (key: IncidentFilterKey) => {
    const next = appliedIncidentTypes.filter(k => k !== key);
    setDraftIncidentTypes(next);
    setAppliedIncidentTypes(next);
    if (backendAvailable && isModeratorAuthenticated) {
      await updateWebConfig(currentUser, { filterIncidentTypes: next }).catch(() => {});
      await loadBackendWebData({
        districts: appliedDistricts,
        incidentTypes: next,
        locationReferences: appliedLocationRefs,
        additionalKeywords: appliedAdditionalKeywords,
        dateFrom: appliedDateFrom,
        dateTo: appliedDateTo
      });
    }
  };

  const removeActiveLocationRefChip = async (key: LocationReferenceKey) => {
    const next = appliedLocationRefs.filter(k => k !== key);
    setDraftLocationRefs(next);
    setAppliedLocationRefs(next);
    if (backendAvailable && isModeratorAuthenticated) {
      await updateWebConfig(currentUser, { filterLocationRefs: next }).catch(() => {});
      await loadBackendWebData({
        districts: appliedDistricts,
        incidentTypes: appliedIncidentTypes,
        locationReferences: next,
        additionalKeywords: appliedAdditionalKeywords,
        dateFrom: appliedDateFrom,
        dateTo: appliedDateTo
      });
    }
  };

  const clearAdditionalKeywordsChip = async () => {
    setDraftAdditionalKeywords('');
    setAppliedAdditionalKeywords('');
    if (backendAvailable && isModeratorAuthenticated) {
      await updateWebConfig(currentUser, { additionalKeywords: '' }).catch(() => {});
      await loadBackendWebData({
        districts: appliedDistricts,
        incidentTypes: appliedIncidentTypes,
        locationReferences: appliedLocationRefs,
        additionalKeywords: '',
        dateFrom: appliedDateFrom,
        dateTo: appliedDateTo
      });
    }
  };

  const removeActiveDistrictChip = async (district: string) => {
    const next = appliedDistricts.filter(d => d !== district);
    setDraftDistricts(next);
    setAppliedDistricts(next);
    if (backendAvailable && isModeratorAuthenticated) {
      const syncableDistricts = next.filter(d => d !== 'Sin distrito');
      await updateWebConfig(currentUser, { filterDistricts: syncableDistricts }).catch(() => {});
      await loadBackendWebData({
        districts: next,
        incidentTypes: appliedIncidentTypes,
        locationReferences: appliedLocationRefs,
        additionalKeywords: appliedAdditionalKeywords,
        dateFrom: appliedDateFrom,
        dateTo: appliedDateTo
      });
    }
  };

  const clearDateChip = async (which: 'from' | 'to') => {
    const nextFrom = which === 'from' ? '' : appliedDateFrom;
    const nextTo = which === 'to' ? '' : appliedDateTo;
    setDraftDateFrom(nextFrom);
    setAppliedDateFrom(nextFrom);
    setDraftDateTo(nextTo);
    setAppliedDateTo(nextTo);
    if (backendAvailable && isModeratorAuthenticated) {
      await updateWebConfig(currentUser, {
        filterDateFrom: nextFrom || null,
        filterDateTo: nextTo || null
      }).catch(() => {});
      await loadBackendWebData({
        districts: appliedDistricts,
        incidentTypes: appliedIncidentTypes,
        locationReferences: appliedLocationRefs,
        additionalKeywords: appliedAdditionalKeywords,
        dateFrom: nextFrom,
        dateTo: nextTo
      });
    }
  };

  const handleSyncNews = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setFilterValidationError(null);

    if (!isModeratorAuthenticated || !isModerator) {
      setErrorMsg(
        'Acceso restringido: debes autenticarte como moderador antes de sincronizar noticias.'
      );
      return;
    }

    const effectiveFrom = draftDateFrom || appliedDateFrom;
    const effectiveTo = draftDateTo || appliedDateTo;
    if (effectiveFrom && effectiveTo && effectiveFrom > effectiveTo) {
      setFilterValidationError('La fecha desde no puede ser posterior a la fecha hasta.');
      return;
    }

    const effectiveDistricts = draftDistricts.filter(d => d !== 'Sin distrito');
    const effectiveIncidentTypes = [...draftIncidentTypes];
    const effectiveLocationRefs = [...draftLocationRefs];
    const effectiveAdditional = draftAdditionalKeywords.trim();

    if (effectiveAdditional.length > 80) {
      setFilterValidationError('Las palabras adicionales no pueden superar los 80 caracteres.');
      return;
    }

    if (!backendAvailable) {
      if (medium !== "rpp") {setErrorMsg("Conecta el servidor para sincronizar este medio.");return;}
      setSyncing(true);
      setTimeout(() => {
        setSyncing(false);
        setAppliedIncidentTypes(effectiveIncidentTypes);
        setAppliedLocationRefs(effectiveLocationRefs);
        setAppliedAdditionalKeywords(effectiveAdditional);
        setAppliedDistricts(draftDistricts);
        setAppliedDateFrom(effectiveFrom);
        setAppliedDateTo(effectiveTo);
        setStatusFilter('Pendiente de validación');
        setSuccessMsg(
          'Modo demo: backend no conectado. Mostrando extractos RSS de demostración de RPP Noticias en Lima Metropolitana, Perú.'
        );
      }, 350);
      return;
    }

    setSyncing(true);
    try {
      const res = await triggerRppSync(currentUser, {
        districts: effectiveDistricts,
        incidentTypes: effectiveIncidentTypes,
        locationReferences: effectiveLocationRefs,
        additionalKeywords: effectiveAdditional,
        dateFrom: effectiveFrom || undefined,
        dateTo: effectiveTo || undefined
      }, medium);
      setAppliedIncidentTypes(effectiveIncidentTypes);
      setAppliedLocationRefs(effectiveLocationRefs);
      setAppliedAdditionalKeywords(effectiveAdditional);
      setAppliedDistricts(draftDistricts);
      setAppliedDateFrom(effectiveFrom);
      setAppliedDateTo(effectiveTo);
      setStatusFilter('Pendiente de validación');
      setSuccessMsg(res.message);
      await loadBackendWebData({
        districts: draftDistricts,
        incidentTypes: effectiveIncidentTypes,
        locationReferences: effectiveLocationRefs,
        additionalKeywords: effectiveAdditional,
        dateFrom: effectiveFrom,
        dateTo: effectiveTo
      });
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.status === 429 && err.nextAllowedSyncAt) {
          setStatusInfo(prev =>
            prev
              ? {
                  ...prev,
                  canSyncNow: false,
                  nextAllowedSyncAt: err.nextAllowedSyncAt,
                  retryAfterSeconds: err.retryAfterSeconds
                }
              : prev
          );
          setErrorMsg(err.message);
        } else if (err.code === 'WEB_INVALID_DATE_RANGE') {
          setFilterValidationError(err.message);
          setErrorMsg(err.message);
        } else {
          setErrorMsg(err.message);
        }
      } else {
        setErrorMsg(
          err instanceof Error ? err.message : 'No se pudo sincronizar el medio seleccionado.'
        );
      }
    } finally {
      setSyncing(false);
    }
  };

  const openReviewModal = (item: WebNewsItem) => {
    if (!isModeratorAuthenticated) return;
    setReviewingItem(item);
    setErrorMsg(null);
  };

  const obfuscateDemoCoords = (lat: number, lng: number) => {
    const meters = 200 + Math.random() * 300;
    const angle = Math.random() * 2 * Math.PI;
    const deltaLat = (meters * Math.cos(angle)) / 111320;
    const cosLat = Math.max(0.1, Math.cos((lat * Math.PI) / 180));
    const deltaLng = (meters * Math.sin(angle)) / (111320 * cosLat);
    return {
      lat: Number((lat + deltaLat).toFixed(4)),
      lng: Number((lng + deltaLng).toFixed(4))
    };
  };

  const handleApproveAndPublish = async (payload: {
    district: string;
    category: IncidentCategory;
    riskLevel: RiskLevel;
    title: string;
    description: string;
    latitude: number;
    longitude: number;
    locationLabel: string;
    confirmedLocationDescription: string;
    movedManually: boolean;
  }) => {
    if (!reviewingItem || !isModerator) return;
    setSubmittingAction(true);
    setErrorMsg(null);

    try {
      if (backendAvailable) {
        const outcome = await reviewBackendWebNews(currentUser, reviewingItem.id, {
          action: 'approve_and_publish',
          district: payload.district,
          category: payload.category,
          riskLevel: payload.riskLevel,
          title: payload.title,
          description: payload.description,
          latitude: payload.latitude,
          longitude: payload.longitude,
          locationLabel: payload.locationLabel,
          confirmedLocationDescription: payload.confirmedLocationDescription,
          movedManually: payload.movedManually
        });

        if (outcome.createdIncident) {
          upsertIncident(outcome.createdIncident);
        }
        setSuccessMsg(
          `Noticia de ${reviewingItem.sourceName} ${outcome.createdIncident?.id || ''} aprobada y publicada en el mapa con ubicación aproximada (ofuscada 200–500 m).`
        );
        setReviewingItem(null);
        await loadBackendWebData();
      } else {
        const now = new Date();
        const obf = obfuscateDemoCoords(payload.latitude, payload.longitude);
        const publicLabel = /^ubicaci[oó]n aproximada/i.test(payload.confirmedLocationDescription)
          ? payload.confirmedLocationDescription
          : `Ubicación aproximada — ${payload.confirmedLocationDescription}`;
        const newIncident: IncidentReport = {
          id: `VIG-${now.getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
          category: payload.category,
          riskLevel: payload.riskLevel,
          title: sanitizeExternalText(payload.title, 120),
          description: sanitizeExternalText(payload.description, 450),
          date: now.toISOString().split('T')[0],
          time: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
          district: payload.district,
          approxLocation: {
            lat: obf.lat,
            lng: obf.lng,
            address: publicLabel
          },
          status: 'Verificado',
          isDemo: true,
          evidenceNote: `Fuente externa: RPP Noticias — ${reviewingItem.originalUrl} • Validado por moderación`,
          falseReportFlags: 0,
          helpfulCount: 1,
          reportedByRole: 'Ciudadano',
          source: 'rpp',
          sourceUrl: reviewingItem.originalUrl,
          locationStatus: 'moderator_confirmed',
          locationConfidence: 'high',
          locationSource: payload.movedManually
            ? 'moderator_manual'
            : reviewingItem.locationSource || 'moderator_manual',
          createdAt: now.toISOString()
        };

        upsertIncident(newIncident);
        setNewsItems(prev =>
          prev.map(item =>
            item.id === reviewingItem.id
              ? {
                  ...item,
                  status: 'Verificado',
                  state: 'verified',
                  district: payload.district,
                  detectedDistrict: payload.district,
                  latitude: payload.latitude,
                  longitude: payload.longitude,
                  locationLabel: payload.locationLabel,
                  locationStatus: 'moderator_confirmed',
                  locationConfidence: 'high',
                  confirmedLocationDescription: payload.confirmedLocationDescription,
                  linkedIncidentId: newIncident.id,
                  moderatorName: currentUser?.name,
                  reviewedAt: now.toISOString()
                }
              : item
          )
        );
        setSuccessMsg(
          `Reporte ${newIncident.id} desde RPP Noticias publicado en el mapa (Modo demo, ubicación aproximada 200–500 m).`
        );
        setReviewingItem(null);
      }
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleSaveAsReference = async (payload: {
    district: string;
    latitude?: number;
    longitude?: number;
    locationLabel: string;
    confirmedLocationDescription: string;
    movedManually: boolean;
  }) => {
    if (!reviewingItem || !isModerator) return;
    setSubmittingAction(true);
    setErrorMsg(null);

    try {
      if (backendAvailable) {
        await reviewBackendWebNews(currentUser, reviewingItem.id, {
          action: 'save_as_reference',
          district: payload.district || undefined,
          latitude: payload.latitude,
          longitude: payload.longitude,
          locationLabel: payload.locationLabel,
          confirmedLocationDescription: payload.confirmedLocationDescription,
          movedManually: payload.movedManually
        });
        setSuccessMsg('Noticia guardada como referencia para revisión posterior (sin publicar en mapa).');
        setReviewingItem(null);
        await loadBackendWebData();
      } else {
        setNewsItems(prev =>
          prev.map(item =>
            item.id === reviewingItem.id
              ? {
                  ...item,
                  district: payload.district || item.district,
                  detectedDistrict: payload.district || item.detectedDistrict || 'Sin distrito',
                  latitude: payload.latitude ?? item.latitude,
                  longitude: payload.longitude ?? item.longitude,
                  locationLabel: payload.locationLabel || item.locationLabel,
                  confirmedLocationDescription: payload.confirmedLocationDescription,
                  locationStatus:
                    payload.latitude !== undefined && payload.confirmedLocationDescription
                      ? 'moderator_confirmed'
                      : item.locationStatus,
                  locationSource: payload.movedManually ? 'moderator_manual' : item.locationSource,
                  moderatorName: currentUser?.name
                }
              : item
          )
        );
        setSuccessMsg('Noticia guardada como referencia (Modo demo, sin publicar en mapa).');
        setReviewingItem(null);
      }
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleOpenLinkModal = (item: WebNewsItem) => {
    if (!isModeratorAuthenticated) return;
    setLinkingItem(item);
    const firstActive = incidents.find(i => i.status !== 'Descartado');
    setSelectedIncidentId(firstActive?.id || '');
    setErrorMsg(null);
  };

  const handleConfirmLinkIncident = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!linkingItem || !selectedIncidentId || !isModerator) return;
    setSubmittingAction(true);
    setErrorMsg(null);

    try {
      if (backendAvailable) {
        await reviewBackendWebNews(currentUser, linkingItem.id, {
          action: 'link_incident',
          linkedIncidentId: selectedIncidentId
        });
        await loadBackendWebData();
      } else {
        setNewsItems(prev =>
          prev.map(item =>
            item.id === linkingItem.id
              ? {
                  ...item,
                  status: 'Verificado',
                  state: 'verified',
                  linkedIncidentId: selectedIncidentId,
                  moderatorName: currentUser?.name,
                  reviewedAt: new Date().toISOString()
                }
              : item
          )
        );
      }
      setSuccessMsg(`Noticia vinculada correctamente al reporte ${selectedIncidentId}.`);
      setLinkingItem(null);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error al vincular noticia.');
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleDiscardItem = async (item: WebNewsItem) => {
    if (!isModeratorAuthenticated || !isModerator) return;
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      if (backendAvailable) {
        await reviewBackendWebNews(currentUser, item.id, {
          action: 'discard',
          reviewReason: 'Descartado tras revisión humana.'
        });
        await loadBackendWebData();
      } else {
        setNewsItems(prev =>
          prev.map(n =>
            n.id === item.id
              ? {
                  ...n,
                  status: 'Descartado',
                  state: 'discarded',
                  moderatorName: currentUser?.name,
                  reviewReason: 'Descartado tras revisión humana.',
                  reviewedAt: new Date().toISOString()
                }
              : n
          )
        );
      }
      setSuccessMsg('Noticia descartada y registrada en auditoría.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error al descartar noticia.');
    }
  };

  const handleClearAutomaticDiscarded = async () => {
    if (!backendAvailable || !isModeratorAuthenticated) return;
    if (!window.confirm('¿Eliminar los descartes automáticos anteriores del RSS? Los descartes hechos manualmente se conservarán.')) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const result = await clearAutomaticWebDiscardedNews(currentUser);
      await loadBackendWebData();
      setSuccessMsg(`${result.removed} descartes automáticos antiguos fueron eliminados.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'No se pudieron limpiar los descartes automáticos.');
    } finally {
      setLoading(false);
    }
  };

  // Local filtering for demo mode (or matching backend-filtered items)
  const filteredNews = useMemo(() => {
    return newsItems.filter(item => {
      if (item.source !== medium) return false;
      const combined = `${item.title}. ${item.excerpt}`;

      if (appliedDistricts.length > 0) {
        const detected = item.district || item.detectedDistrict || 'Sin distrito';
        const matchesAllowed = appliedDistricts.includes(detected);
        const matchesNoDistrict =
          appliedDistricts.includes('Sin distrito') && detected === 'Sin distrito';

        if (!matchesAllowed && !matchesNoDistrict) {
          return false;
        }
      }

      if (appliedIncidentTypes.length > 0) {
        const matchesIncident = appliedIncidentTypes.some(key => {
          const def = INCIDENT_FILTER_OPTIONS.find(o => o.key === key);
          return def ? def.matchRegex.test(combined) : false;
        });
        if (!matchesIncident) return false;
      }

      if (appliedLocationRefs.length > 0) {
        const matchesLocRef = appliedLocationRefs.some(key => {
          const def = LOCATION_REF_OPTIONS.find(o => o.key === key);
          return def ? def.matchRegex.test(combined) : false;
        });
        if (!matchesLocRef) return false;
      }

      if (appliedAdditionalKeywords.trim()) {
        const cleanTokens = appliedAdditionalKeywords
          .toLowerCase()
          .split(/\s+/)
          .filter(t => t.length >= 2);
        const normCombined = combined.toLowerCase();
        if (cleanTokens.length > 0 && !cleanTokens.every(t => normCombined.includes(t))) {
          return false;
        }
      }

      if (appliedDateFrom || appliedDateTo) {
        const publishedMs = new Date(item.publishedAt).getTime();
        if (Number.isFinite(publishedMs)) {
          if (appliedDateFrom) {
            const fromMs = new Date(`${appliedDateFrom}T00:00:00.000Z`).getTime();
            if (publishedMs < fromMs) return false;
          }
          if (appliedDateTo) {
            const toMs = new Date(`${appliedDateTo}T23:59:59.999Z`).getTime();
            if (publishedMs > toMs) return false;
          }
        }
      }

      return true;
    });
  }, [
    newsItems, medium,
    appliedDistricts,
    appliedIncidentTypes,
    appliedLocationRefs,
    appliedAdditionalKeywords,
    appliedDateFrom,
    appliedDateTo
  ]);

  const hasActiveFilters =
    appliedIncidentTypes.length > 0 ||
    appliedLocationRefs.length > 0 ||
    Boolean(appliedAdditionalKeywords) ||
    appliedDistricts.length > 0 ||
    Boolean(appliedDateFrom) ||
    Boolean(appliedDateTo);

  const totalCount = filteredNews.length;
  const pendingNewsCount = filteredNews.filter(n => n.status === 'Pendiente de validación').length;
  const verifiedNewsCount = filteredNews.filter(n => n.status === 'Verificado').length;
  const discardedNewsCount = filteredNews.filter(n => n.status === 'Descartado').length;

  const visibleNews =
    statusFilter === 'all'
      ? filteredNews
      : filteredNews.filter(n => n.status === statusFilter);

  const allowedDistrictOptions = statusInfo?.allowedDistricts?.length
    ? statusInfo.allowedDistricts
    : [...ALLOWED_SOCIAL_DISTRICTS];

  const maxNewsPerSync = statusInfo?.maxNewsPerSync ?? 20;
  const cooldownMinutes = statusInfo?.cooldownMinutes ?? 15;
  const nextAllowedDate = statusInfo?.nextAllowedSyncAt
    ? new Date(statusInfo.nextAllowedSyncAt)
    : null;
  const isInCooldown = Boolean(
    nextAllowedDate && nextAllowedDate.getTime() > Date.now()
  );
  const nextAllowedLabel = nextAllowedDate
    ? isInCooldown
      ? `Desde las ${nextAllowedDate.toLocaleTimeString('es-PE', {
          hour: '2-digit',
          minute: '2-digit'
        })} (${nextAllowedDate.toLocaleDateString('es-PE')})`
      : 'Disponible ahora'
    : `Disponible ahora (cada ${cooldownMinutes} min)`;

  return (
    <div className="space-y-5">
      {/* Authentication Gate Notice when not yet authenticated as moderator */}
      {!isModeratorAuthenticated && (
        <div className="bg-white p-6 rounded-3xl border border-amber-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
              <Lock className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <h3 className="font-extrabold text-sm text-slate-900">
                Acceso restringido a Moderadores autenticados
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed max-w-xl">
                El botón <strong className="text-slate-900">Sincronizar noticias</strong> y la revisión de fuentes web permanecen deshabilitados hasta validar tu código de acceso de moderador con el servidor.
              </p>
            </div>
          </div>
          <button
            onClick={openModeratorModal}
            className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-900 font-extrabold text-xs shadow-sm inline-flex items-center justify-center gap-2 shrink-0"
          >
            <Lock className="w-4 h-4" />
            Activar modo Moderador
          </button>
        </div>
      )}

      {/* Main Card: RPP Noticias — RSS oficial */}
      <div className="bg-white p-5 sm:p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-900 text-white text-[11px] font-bold">
                <Rss className="w-3 h-3 text-orange-400" />
                RSS público oficial
              </span>

              {isModeratorAuthenticated && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 text-[11px] font-bold">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  Moderador autenticado
                </span>
              )}

              {backendAvailable ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 text-[11px] font-bold">
                  <Globe className="w-3.5 h-3.5 text-emerald-600" />
                  Feed: {newsMedia[medium].name}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-100 text-amber-900 border border-amber-300 text-[11px] font-bold">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                  Modo demo (Sin backend)
                </span>
              )}
            </div>

            <h3 className="font-extrabold text-base text-slate-900 pt-1">
              {newsMedia[medium].name} — RSS oficial
            </h3>
            <p className="text-xs text-slate-500 max-w-2xl">
              Consumo exclusivo desde backend del feed RSS oficial (título, extracto breve y enlace original). Ninguna noticia aparece automáticamente en el mapa público sin revisión humana y ubicación confirmada.
            </p>
          </div>

          <button
            onClick={handleSyncNews}
            disabled={!isModeratorAuthenticated || syncing || loading}
            className="px-5 py-2.5 rounded-xl bg-[#0B1F3A] hover:bg-blue-900 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-xs shadow-md flex items-center justify-center gap-2 shrink-0 transition-all active:scale-95"
            title={
              !isModeratorAuthenticated
                ? 'Autentícate como moderador para habilitar Sincronizar noticias'
                : 'Sincronizar máximo 20 noticias recientes del medio seleccionado'
            }
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Sincronizando noticias...' : 'Sincronizar noticias'}
          </button>
        </div>

        {/* Consumption policy & limits banner */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 rounded-2xl bg-blue-50/80 border border-blue-200 text-xs text-blue-900">
          <span className="font-bold">
            Máximo {maxNewsPerSync} noticias por sincronización
          </span>
          <span className="text-[11px] font-semibold text-blue-800">
            Última sincronización:{' '}
            {statusInfo?.lastSyncAt
              ? new Date(statusInfo.lastSyncAt).toLocaleString('es-PE')
              : 'Pendiente'}
            {' • '}Próxima consulta: {nextAllowedLabel}
          </span>
        </div>

        {/* Metrics strip: 4 moderation counters */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-slate-100 text-xs">
          <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200">
            <span className="text-[11px] text-slate-400 font-semibold block">Importadas</span>
            <span className="font-extrabold text-lg text-slate-900 mt-0.5 block">
              {totalCount}
            </span>
          </div>

          <div className="p-3 rounded-2xl bg-amber-50/70 border border-amber-200">
            <span className="text-[11px] text-amber-700 font-semibold block">Pendientes</span>
            <span className="font-extrabold text-lg text-amber-800 mt-0.5 block">
              {pendingNewsCount}
            </span>
          </div>

          <div className="p-3 rounded-2xl bg-emerald-50/70 border border-emerald-200">
            <span className="text-[11px] text-emerald-700 font-semibold block">Aprobadas</span>
            <span className="font-extrabold text-lg text-emerald-800 mt-0.5 block">
              {verifiedNewsCount}
            </span>
          </div>

          <div className="p-3 rounded-2xl bg-slate-100/80 border border-slate-200">
            <span className="text-[11px] text-slate-500 font-semibold block">Descartadas</span>
            <span className="font-extrabold text-lg text-slate-700 mt-0.5 block">
              {discardedNewsCount}
            </span>
          </div>
        </div>

        {/* Visual Structured Filters */}
        <form
          onSubmit={handleApplyFilters}
          className="pt-3 border-t border-slate-100 space-y-4"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
              <Filter className="w-3.5 h-3.5 text-blue-600" />
              <span>Filtros visuales de noticias (Lima Metropolitana, Perú)</span>
            </div>
            <span className="text-[11px] text-slate-400 hidden sm:inline">
              Solo extracto RSS (nunca copia artículos completos)
            </span>
          </div>

          <label className="block text-xs font-semibold">Medios<select value={medium} disabled={syncing} onChange={e => {setMedium(e.target.value as NewsMediaId);setSuccessMsg(null);setErrorMsg(null);}} className="mt-1 block w-full max-w-sm rounded-lg border border-slate-200 bg-white p-2">{Object.entries(newsMedia).map(([id, m]) => <option key={id} value={id}>{m.name}</option>)}</select></label>
          {/* Group 1: Tipo de incidente */}
          <div className="space-y-2">
            <label className="block text-[11px] font-bold text-slate-700">
              1. Tipo de incidente
            </label>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setDraftIncidentTypes([])}
                className={`px-3 py-1.5 rounded-xl text-[11px] font-bold border transition-colors ${
                  draftIncidentTypes.length === 0
                    ? 'bg-[#0B1F3A] text-white border-[#0B1F3A] shadow-xs'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                Todos los incidentes
              </button>
              {INCIDENT_FILTER_OPTIONS.map(opt => {
                const selected = draftIncidentTypes.includes(opt.key);
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => toggleDraftIncidentType(opt.key)}
                    aria-pressed={selected}
                    className={`px-3 py-1.5 rounded-xl text-[11px] font-bold border transition-colors inline-flex items-center gap-1.5 ${
                      selected
                        ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      readOnly
                      tabIndex={-1}
                      className="pointer-events-none rounded border-slate-300 text-blue-600 w-3 h-3"
                    />
                    <span>{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Group 2: Referencia de ubicación */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="block text-[11px] font-bold text-slate-700">
                2. Referencia de ubicación (exige pista vial o lugar en título/extracto)
              </label>
              <span className="text-[10px] text-slate-500">
                Si seleccionas referencias, se omitirán notas sin mención de vía o lugar
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setDraftLocationRefs([])}
                className={`px-3 py-1.5 rounded-xl text-[11px] font-bold border transition-colors ${
                  draftLocationRefs.length === 0
                    ? 'bg-[#0B1F3A] text-white border-[#0B1F3A] shadow-xs'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                Cualquier referencia de ubicación
              </button>
              {LOCATION_REF_OPTIONS.map(opt => {
                const selected = draftLocationRefs.includes(opt.key);
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => toggleDraftLocationRef(opt.key)}
                    aria-pressed={selected}
                    className={`px-3 py-1.5 rounded-xl text-[11px] font-bold border transition-colors inline-flex items-center gap-1.5 ${
                      selected
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      readOnly
                      tabIndex={-1}
                      className="pointer-events-none rounded border-slate-300 text-emerald-600 w-3 h-3"
                    />
                    <span>{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Districts + Additional Keywords + Date Range */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5 items-end text-xs">
            {/* Distritos permitidos */}
            <div className="md:col-span-4 relative" ref={districtDropdownRef}>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                Distritos permitidos (Lima Metropolitana)
              </label>
              <button
                type="button"
                onClick={() => setDistrictMenuOpen(prev => !prev)}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-white text-left flex items-center justify-between gap-2 font-semibold text-slate-700"
              >
                <span className="truncate">
                  {draftDistricts.length === 0
                    ? 'Todos los distritos'
                    : draftDistricts.length === 1
                    ? draftDistricts[0]
                    : `${draftDistricts.length} distritos seleccionados`}
                </span>
                <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
              </button>

              {districtMenuOpen && (
                <div className="absolute left-0 right-0 mt-1.5 z-30 bg-white rounded-2xl border border-slate-200 shadow-xl p-2 max-h-64 overflow-y-auto space-y-1">
                  <div className="flex items-center gap-1.5 px-1 pb-1">
                    <button
                      type="button"
                      onClick={() => setDraftDistricts([])}
                      className={`flex-1 text-left px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center justify-between ${
                        draftDistricts.length === 0
                          ? 'bg-blue-50 text-blue-700'
                          : 'text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <span>Todos los distritos</span>
                      {draftDistricts.length === 0 && <CheckCircle2 className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => setDraftDistricts([...allowedDistrictOptions])}
                      className="px-2 py-1.5 rounded-lg text-[11px] font-bold text-blue-700 bg-blue-50 hover:bg-blue-100"
                    >
                      Los {allowedDistrictOptions.length}
                    </button>
                  </div>
                  <div className="border-t border-slate-100 my-1" />
                  {allowedDistrictOptions.map(district => {
                    const checked = draftDistricts.includes(district);
                    return (
                      <label
                        key={district}
                        className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer text-xs text-slate-700"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleDraftDistrict(district)}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className={checked ? 'font-bold text-slate-900' : ''}>
                          {district}
                        </span>
                      </label>
                    );
                  })}
                  <div className="border-t border-slate-100 my-1" />
                  <label className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer text-xs text-slate-500">
                    <input
                      type="checkbox"
                      checked={draftDistricts.includes('Sin distrito')}
                      onChange={() => toggleDraftDistrict('Sin distrito')}
                      className="rounded border-slate-300 text-slate-600 focus:ring-slate-400"
                    />
                    <span>Sin distrito específico</span>
                  </label>
                </div>
              )}
            </div>

            {/* Palabras adicionales opcionales */}
            <div className="md:col-span-3">
              <div className="flex items-center justify-between mb-1">
                <label className="block text-[11px] font-bold text-slate-600">
                  Palabras adicionales (opcional)
                </label>
                <span className="text-[10px] text-slate-400">
                  {draftAdditionalKeywords.length}/80
                </span>
              </div>
              <input
                type="text"
                value={draftAdditionalKeywords}
                onChange={e => setDraftAdditionalKeywords(e.target.value)}
                maxLength={80}
                placeholder="Ej: motocicleta farmacia"
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-xs"
              />
            </div>

            {/* Fecha desde */}
            <div className="md:col-span-2">
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                Fecha desde
              </label>
              <input
                type="date"
                aria-label="Fecha desde web"
                value={draftDateFrom}
                onChange={e => setDraftDateFrom(e.target.value)}
                className="w-full px-2.5 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white text-xs"
              />
            </div>

            {/* Fecha hasta */}
            <div className="md:col-span-2">
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                Fecha hasta
              </label>
              <input
                type="date"
                aria-label="Fecha hasta web"
                value={draftDateTo}
                onChange={e => setDraftDateTo(e.target.value)}
                className="w-full px-2.5 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white text-xs"
              />
            </div>

            {/* Apply / Clear buttons */}
            <div className="md:col-span-12 flex flex-wrap items-center gap-2 pt-1">
              <button
                type="submit"
                disabled={loading || syncing}
                className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-xs shadow-xs"
              >
                Aplicar filtros
              </button>
              <button
                type="button"
                onClick={handleClearFilters}
                disabled={loading || syncing}
                className="px-4 py-2.5 rounded-xl bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 font-semibold text-xs"
              >
                Limpiar filtros
              </button>
              <span className="text-[11px] text-slate-400 ml-auto">
                Solo Lima Metropolitana (Callao y otras regiones excluidos)
              </span>
            </div>
          </div>

          {filterValidationError && (
            <div className="p-2.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-[11px] flex items-center gap-1.5 font-semibold">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              <span>{filterValidationError}</span>
            </div>
          )}

          {/* Active Filter Chips */}
          {hasActiveFilters && (
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-[11px] font-semibold text-slate-500 mr-1">
                Filtros activos:
              </span>
              {appliedIncidentTypes.map(key => {
                const label =
                  INCIDENT_FILTER_OPTIONS.find(o => o.key === key)?.label || key;
                return (
                  <span
                    key={`w-inc-${key}`}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold border bg-blue-50 text-blue-800 border-blue-200"
                  >
                    <span>Incidente: {label}</span>
                    <button
                      type="button"
                      onClick={() => removeActiveIncidentChip(key)}
                      aria-label={`Quitar incidente ${label}`}
                      className="hover:text-red-600"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                );
              })}
              {appliedLocationRefs.map(key => {
                const label =
                  LOCATION_REF_OPTIONS.find(o => o.key === key)?.label || key;
                return (
                  <span
                    key={`w-loc-${key}`}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold border bg-emerald-50 text-emerald-800 border-emerald-200"
                  >
                    <span>Ubicación: {label}</span>
                    <button
                      type="button"
                      onClick={() => removeActiveLocationRefChip(key)}
                      aria-label={`Quitar ubicación ${label}`}
                      className="hover:text-red-600"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                );
              })}
              {appliedAdditionalKeywords && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold border bg-purple-50 text-purple-800 border-purple-200">
                  <span>Adicional: "{appliedAdditionalKeywords}"</span>
                  <button
                    type="button"
                    onClick={clearAdditionalKeywordsChip}
                    aria-label="Quitar palabras adicionales"
                    className="hover:text-red-600"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
              {appliedDistricts.map(district => (
                <span
                  key={district}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold border ${
                    district === 'Sin distrito'
                      ? 'bg-slate-100 text-slate-700 border-slate-300'
                      : 'bg-sky-50 text-sky-800 border-sky-200'
                  }`}
                >
                  <span>
                    {district === 'Sin distrito'
                      ? 'Sin distrito específico'
                      : `Distrito: ${district}`}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeActiveDistrictChip(district)}
                    aria-label={`Quitar filtro ${district}`}
                    className="hover:text-red-600"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
              {appliedDateFrom && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-800 border border-indigo-200 text-[11px] font-bold">
                  <Calendar className="w-3 h-3" />
                  <span>Desde: {appliedDateFrom}</span>
                  <button
                    type="button"
                    onClick={() => clearDateChip('from')}
                    aria-label="Quitar fecha desde"
                    className="hover:text-red-600"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
              {appliedDateTo && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-800 border border-indigo-200 text-[11px] font-bold">
                  <Calendar className="w-3 h-3" />
                  <span>Hasta: {appliedDateTo}</span>
                  <button
                    type="button"
                    onClick={() => clearDateChip('to')}
                    aria-label="Quitar fecha hasta"
                    className="hover:text-red-600"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
            </div>
          )}
        </form>
      </div>

      {/* Feedback alerts */}
      {errorMsg && (
        <div className="p-3.5 rounded-2xl bg-red-50 border border-red-200 text-red-800 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Sub-tabs: Pendientes, Todas, Descartadas */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-bold text-xs uppercase tracking-wider text-slate-600">
          Noticias web importadas ({visibleNews.length})
        </h4>
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <button
            onClick={() => setStatusFilter('Pendiente de validación')}
            className={`px-3 py-1 rounded-lg font-bold ${
              statusFilter === 'Pendiente de validación'
                ? 'bg-blue-600 text-white'
                : 'bg-white border border-slate-200 text-slate-600'
            }`}
          >
            Pendientes ({pendingNewsCount})
          </button>
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1 rounded-lg font-bold ${
              statusFilter === 'all'
                ? 'bg-blue-600 text-white'
                : 'bg-white border border-slate-200 text-slate-600'
            }`}
          >
            Todas ({filteredNews.length})
          </button>
          <button
            onClick={() => setStatusFilter('Descartado')}
            className={`px-3 py-1 rounded-lg font-bold ${
              statusFilter === 'Descartado'
                ? 'bg-slate-800 text-white'
                : 'bg-white border border-slate-200 text-slate-600'
            }`}
          >
            Descartadas ({discardedNewsCount})
          </button>
          {backendAvailable && isModeratorAuthenticated && discardedNewsCount > 0 && (
            <button
              onClick={handleClearAutomaticDiscarded}
              className="px-3 py-1 rounded-lg font-bold bg-white border border-red-200 text-red-700 hover:bg-red-50"
              title="Elimina solo descartes automáticos anteriores; conserva los descartes humanos"
            >
              Limpiar automáticas
            </button>
          )}
        </div>
      </div>

      {/* Imported News Cards List */}
      {loading ? (
        <div className="bg-white p-10 rounded-3xl border border-slate-200 text-center text-xs text-slate-500">
          Cargando noticias del medio seleccionado...
        </div>
      ) : visibleNews.length === 0 ? (
        <div className="bg-white p-10 rounded-3xl border border-slate-200 text-center space-y-2">
          <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
          <p className="font-bold text-sm text-slate-800">
            {statusFilter === 'Descartado'
              ? 'Sin noticias descartadas para este filtro'
              : 'Sin noticias para mostrar'}
          </p>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            {hasActiveFilters
              ? 'Prueba ajustando o limpiando los filtros activos, o presiona “Sincronizar noticias” para consultar el RSS del medio seleccionado.'
              : 'Todas las noticias importadas han sido revisadas. Presiona “Sincronizar noticias” para consultar el feed RSS del medio seleccionado.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {visibleNews.map(item => {
            const safeUrl = getSafeExternalUrl(item.originalUrl);
            const safeImg = getSafeImageUrl(item.imageUrl);
            const safeTitle = sanitizeExternalText(item.title, 220);
            const safeExcerpt = sanitizeExternalText(item.excerpt, 360);
            const isPending = item.status === 'Pendiente de validación';
            const detectedDistrict =
              item.district || item.detectedDistrict || 'Sin distrito';
            const hasConfirmedDistrict =
              Boolean(detectedDistrict) && detectedDistrict !== 'Sin distrito';
            const locStatus = item.locationStatus || 'unknown';
            const locConfidence = item.locationConfidence || 'low';

            const statusLabel =
              locStatus === 'moderator_confirmed'
                ? 'Ubicación confirmada por moderador'
                : locStatus === 'exact_candidate'
                ? 'Candidato de dirección/coordenada'
                : locStatus === 'district_only'
                ? 'Solo distrito (área general, requiere pin para publicar)'
                : 'Sin ubicación específica (solo referencia)';

            return (
              <div
                key={item.id}
                className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3"
              >
                {/* Header */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-lg bg-slate-900 text-white">
                      <Newspaper className="w-3.5 h-3.5" />
                    </span>
                    <span className="text-[11px] font-bold text-slate-800">
                      Fuente: {item.sourceName}
                    </span>
                    {item.isDemo && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                        Modo demo
                      </span>
                    )}
                    {item.isLimaValidated && item.status !== 'Descartado' && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        Lima Metropolitana, Perú
                      </span>
                    )}
                    <span className="text-[11px] text-slate-400 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(item.publishedAt).toLocaleString('es-PE')}
                    </span>
                  </div>

                  <span
                    className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${
                      item.status === 'Verificado'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : item.status === 'Descartado'
                        ? 'bg-slate-100 text-slate-600 border-slate-200'
                        : 'bg-amber-50 text-amber-700 border-amber-200'
                    }`}
                  >
                    {item.status}
                  </span>
                </div>

                {/* Title, Optional Thumbnail, and Safe Brief Excerpt */}
                <div className="flex flex-col sm:flex-row gap-3">
                  {safeImg && (
                    <img
                      src={safeImg}
                      alt={safeTitle}
                      loading="lazy"
                      onError={e => {
                        (e.currentTarget as HTMLImageElement).style.display = 'none';
                      }}
                      className="w-full sm:w-28 h-24 object-cover rounded-xl border border-slate-200 shrink-0 bg-slate-100"
                    />
                  )}
                  <div className="flex-1 space-y-1.5">
                    <h4 className="font-extrabold text-sm text-slate-900 leading-snug">
                      {safeTitle}
                    </h4>
                    <p className="text-xs text-slate-700 bg-slate-50 p-3 rounded-xl border border-slate-200 leading-relaxed">
                      {safeExcerpt}
                    </p>
                  </div>
                </div>

                {/* Metadata & Geolocation tags */}
                <div className="flex flex-wrap items-center gap-2 text-[11px]">
                  <span
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border font-semibold ${
                      hasConfirmedDistrict
                        ? 'bg-blue-50 text-blue-800 border-blue-200'
                        : 'bg-slate-100 text-slate-600 border-slate-200'
                    }`}
                  >
                    <MapPin className="w-3 h-3" />
                    Distrito detectado: {detectedDistrict}
                  </span>

                  <span
                    className={`px-2.5 py-1 rounded-lg border font-semibold ${
                      locStatus === 'exact_candidate' || locStatus === 'moderator_confirmed'
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        : locStatus === 'district_only'
                        ? 'bg-amber-50 text-amber-800 border-amber-200'
                        : 'bg-slate-100 text-slate-600 border-slate-200'
                    }`}
                  >
                    {statusLabel} • Confianza: {locConfidence}
                  </span>

                  {item.locationLabel && (
                    <span className="px-2.5 py-1 rounded-lg bg-slate-50 text-slate-700 border border-slate-200">
                      Ref.: {sanitizeExternalText(item.locationLabel, 90)}
                    </span>
                  )}

                  {typeof item.latitude === 'number' && typeof item.longitude === 'number' && (
                    <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600 font-mono text-[10px]">
                      {item.latitude.toFixed(4)}, {item.longitude.toFixed(4)}
                    </span>
                  )}

                  {safeUrl && (
                    <a
                      href={safeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-blue-600 hover:text-blue-800 hover:bg-blue-50 font-bold"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      Ver noticia original
                    </a>
                  )}
                </div>

                {/* Discard Reason if discarded */}
                {item.status === 'Descartado' && item.reviewReason && (
                  <div className="px-3 py-2 rounded-xl bg-slate-100 border border-slate-200 text-[11px] text-slate-700 flex items-center gap-1.5">
                    <XCircle className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    <span>
                      <strong>Motivo de descarte:</strong> {item.reviewReason}
                    </span>
                  </div>
                )}

                {/* Actions */}
                {isPending ? (
                  <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => openReviewModal(item)}
                      disabled={!isModeratorAuthenticated}
                      title={
                        !isModeratorAuthenticated
                          ? 'Autentícate como moderador para revisar'
                          : 'Revisar ubicación en mapa o guardar como referencia'
                      }
                      className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold flex items-center gap-1.5 shadow-xs"
                    >
                      <PlusCircle className="w-3.5 h-3.5" />
                      Revisar / crear reporte
                    </button>

                    <button
                      onClick={() => handleOpenLinkModal(item)}
                      disabled={!isModeratorAuthenticated}
                      className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed text-slate-800 text-xs font-semibold flex items-center gap-1.5 border border-slate-200"
                    >
                      <Link2 className="w-3.5 h-3.5" />
                      Vincular a reporte existente
                    </button>

                    <button
                      onClick={() => handleDiscardItem(item)}
                      disabled={!isModeratorAuthenticated}
                      className="px-3.5 py-2 rounded-xl bg-white hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed text-slate-600 hover:text-red-700 text-xs font-semibold flex items-center gap-1.5 border border-slate-200 ml-auto"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      Descartar
                    </button>
                  </div>
                ) : (
                  <div className="pt-2 border-t border-slate-100 text-[11px] text-slate-500 flex flex-wrap items-center justify-between gap-2">
                    <span>
                      Revisado por {item.moderatorName || 'Moderación'}
                      {item.linkedIncidentId ? ` • Vinculado a ${item.linkedIncidentId}` : ''}
                    </span>
                    {item.reviewedAt && (
                      <span>{new Date(item.reviewedAt).toLocaleString('es-PE')}</span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Backend Audit Log excerpt for Web Sources */}
      {auditLogs.length > 0 && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
            <History className="w-4 h-4 text-blue-600" />
            <h4 className="font-bold text-xs text-slate-800 uppercase tracking-wider">
              Auditoría de Fuentes Web ({auditLogs.length})
            </h4>
          </div>
          <div className="divide-y divide-slate-100 text-xs max-h-60 overflow-y-auto">
            {auditLogs.slice(0, 10).map(log => (
              <div key={log.id} className="p-3.5 flex items-center justify-between gap-2">
                <div>
                  <span className="font-bold text-slate-900 block">{log.details}</span>
                  <span className="text-[11px] text-slate-500">
                    {log.actorName} ({log.actorRole}) • {log.actionType}
                  </span>
                </div>
                <span className="text-[10px] text-slate-400 shrink-0">
                  {new Date(log.createdAt).toLocaleTimeString('es-PE')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MODAL 1: Reuse SocialPostReviewModal for human review + geolocation */}
      {reviewingItem && (
        <SocialPostReviewModal
          post={mapWebNewsToReviewPost(reviewingItem)}
          backendAvailable={backendAvailable}
          submitting={submittingAction}
          sourceTitle={reviewingItem.title}
          sourceUrl={reviewingItem.originalUrl}
          initialTitle={sanitizeExternalText(reviewingItem.title, 120)}
          saveButtonLabel="Guardar como referencia"
          allowSaveWithoutDistrict
          onClose={() => setReviewingItem(null)}
          onApproveAndPublish={handleApproveAndPublish}
          onSaveForReview={handleSaveAsReference}
          onDiscard={async reason => {
            await handleDiscardItem(reviewingItem);
            if (reason) {
              setReviewingItem(null);
            }
          }}
        />
      )}

      {/* MODAL 2: Link WebNewsItem to existing IncidentReport */}
      {linkingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200">
            <div className="bg-[#0B1F3A] text-white p-5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Link2 className="w-5 h-5 text-blue-400" />
                <h3 className="font-bold text-sm">Vincular noticia a reporte existente</h3>
              </div>
              <button
                onClick={() => setLinkingItem(null)}
                className="text-slate-300 hover:text-white text-sm font-bold px-2"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleConfirmLinkIncident} className="p-5 space-y-4 text-xs">
              <p className="text-slate-600">
                Selecciona el incidente ya registrado que coincide con esta noticia para usarla como respaldo informativo.
              </p>

              <div>
                <label className="block font-bold text-slate-800 mb-1">Reporte existente *</label>
                <select
                  value={selectedIncidentId}
                  onChange={e => setSelectedIncidentId(e.target.value)}
                  required
                  className="w-full p-2.5 rounded-xl border border-slate-200 bg-white"
                >
                  {incidents
                    .filter(i => i.status !== 'Descartado')
                    .map(i => (
                      <option key={i.id} value={i.id}>
                        [{i.id}] {i.district} — {i.title}
                      </option>
                    ))}
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setLinkingItem(null)}
                  className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submittingAction || !selectedIncidentId}
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-sm"
                >
                  {submittingAction ? 'Vinculando...' : 'Vincular noticia'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
