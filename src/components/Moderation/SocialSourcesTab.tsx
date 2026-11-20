import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useIncidents } from '../../context/IncidentContext';
import {
  ALLOWED_SOCIAL_DISTRICTS,
  buildLocalQueryPreview,
  DEMO_SOCIAL_POSTS,
  INCIDENT_FILTER_OPTIONS,
  LOCATION_REF_OPTIONS
} from '../../data/demoData';
import {
  ApiClientError,
  fetchSocialAuditLogs,
  fetchSocialPosts,
  fetchSocialStatus,
  reviewBackendSocialPost,
  SocialStatusResponse,
  triggerXSync,
  updateSocialConfig
} from '../../services/apiClient';
import {
  IncidentCategory,
  IncidentFilterKey,
  IncidentReport,
  LocationReferenceKey,
  RiskLevel,
  SocialPost,
  SocialSourceAudit
} from '../../types';
import { getSafeExternalUrl, sanitizeExternalText } from '../../utils/sanitize';
import { SocialPostReviewModal } from './SocialPostReviewModal';
import {
  RefreshCw,
  ExternalLink,
  PlusCircle,
  Link2,
  XCircle,
  Lock,
  AlertTriangle,
  CheckCircle2,
  Clock,
  MapPin,
  Radio,
  History,
  Filter,
  ChevronDown,
  X,
  Calendar,
  Eye,
  ShieldCheck
} from 'lucide-react';

const XLogoIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

export const SocialSourcesTab: React.FC = () => {
  const {
    currentUser,
    isModerator,
    isModeratorAuthenticated,
    openModeratorModal
  } = useAuth();
  const {
    incidents,
    upsertIncident,
    backendAvailable,
    xConfigured,
    isDemoMode
  } = useIncidents();

  const [posts, setPosts] = useState<SocialPost[]>(() => {
    try {
      const saved = localStorage.getItem('vigila_pe_demo_social_posts');
      return saved ? JSON.parse(saved) : DEMO_SOCIAL_POSTS;
    } catch {
      return DEMO_SOCIAL_POSTS;
    }
  });
  const [auditLogs, setAuditLogs] = useState<SocialSourceAudit[]>([]);
  const [statusInfo, setStatusInfo] = useState<SocialStatusResponse | null>(null);
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

  // Geolocation review modal state
  const [reviewingPost, setReviewingPost] = useState<SocialPost | null>(null);
  const [submittingAction, setSubmittingAction] = useState(false);

  // Link Existing modal state
  const [linkingPost, setLinkingPost] = useState<SocialPost | null>(null);
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

  // Persist demo posts locally when backend is absent
  useEffect(() => {
    if (!backendAvailable) {
      localStorage.setItem('vigila_pe_demo_social_posts', JSON.stringify(posts));
    }
  }, [posts, backendAvailable]);

  const loadBackendSocialData = async (overrideFilters?: {
    districts?: string[];
    incidentTypes?: IncidentFilterKey[];
    locationReferences?: LocationReferenceKey[];
    dateFrom?: string;
    dateTo?: string;
  }) => {
    if (!backendAvailable || !isModeratorAuthenticated) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const statusData = await fetchSocialStatus(currentUser);
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

      const [postsData, logsData] = await Promise.all([
        fetchSocialPosts(currentUser, {
          districts: effectiveDistricts,
          incidentTypes: effectiveIncidentTypes,
          locationReferences: effectiveLocationRefs,
          dateFrom: effectiveDateFrom || undefined,
          dateTo: effectiveDateTo || undefined
        }),
        fetchSocialAuditLogs(currentUser)
      ]);

      setStatusInfo({ ...statusData, stats: postsData.stats });
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
      setPosts(postsData.posts);
      setAuditLogs(logsData);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error cargando fuentes sociales.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (backendAvailable && isModeratorAuthenticated) {
      loadBackendSocialData();
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
      await updateSocialConfig(currentUser, {
        filterDistricts: syncableDistricts,
        filterIncidentTypes: nextIncidentTypes,
        filterLocationRefs: nextLocationRefs,
        additionalKeywords: nextAdditional,
        filterDateFrom: nextFrom || null,
        filterDateTo: nextTo || null
      });
      await loadBackendSocialData({
        districts: nextDistricts,
        incidentTypes: nextIncidentTypes,
        locationReferences: nextLocationRefs,
        dateFrom: nextFrom,
        dateTo: nextTo
      });
      setSuccessMsg(
        'Filtros aplicados a las publicaciones importadas y guardados para construir la consulta de X en el servidor.'
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
      await updateSocialConfig(currentUser, {
        filterDistricts: [],
        filterIncidentTypes: [],
        filterLocationRefs: [],
        additionalKeywords: '',
        filterDateFrom: null,
        filterDateTo: null
      });
      await loadBackendSocialData({
        districts: [],
        incidentTypes: [],
        locationReferences: [],
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
      await updateSocialConfig(currentUser, { filterIncidentTypes: next }).catch(() => {});
      await loadBackendSocialData({
        districts: appliedDistricts,
        incidentTypes: next,
        locationReferences: appliedLocationRefs,
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
      await updateSocialConfig(currentUser, { filterLocationRefs: next }).catch(() => {});
      await loadBackendSocialData({
        districts: appliedDistricts,
        incidentTypes: appliedIncidentTypes,
        locationReferences: next,
        dateFrom: appliedDateFrom,
        dateTo: appliedDateTo
      });
    }
  };

  const clearAdditionalKeywordsChip = async () => {
    setDraftAdditionalKeywords('');
    setAppliedAdditionalKeywords('');
    if (backendAvailable && isModeratorAuthenticated) {
      await updateSocialConfig(currentUser, { additionalKeywords: '' }).catch(() => {});
      await loadBackendSocialData({
        districts: appliedDistricts,
        incidentTypes: appliedIncidentTypes,
        locationReferences: appliedLocationRefs,
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
      await updateSocialConfig(currentUser, { filterDistricts: syncableDistricts }).catch(() => {});
      await loadBackendSocialData({
        districts: next,
        incidentTypes: appliedIncidentTypes,
        locationReferences: appliedLocationRefs,
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
      await updateSocialConfig(currentUser, {
        filterDateFrom: nextFrom || null,
        filterDateTo: nextTo || null
      }).catch(() => {});
      await loadBackendSocialData({
        districts: appliedDistricts,
        incidentTypes: appliedIncidentTypes,
        locationReferences: appliedLocationRefs,
        dateFrom: nextFrom,
        dateTo: nextTo
      });
    }
  };

  const handleSyncX = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setFilterValidationError(null);

    if (!isModeratorAuthenticated || !isModerator) {
      setErrorMsg('Acceso restringido: debes autenticarte como moderador antes de sincronizar X.');
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

    if (!backendAvailable || !xConfigured) {
      // Demo simulation when backend or X_BEARER_TOKEN is not configured
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
          'Modo demo: no hay X_BEARER_TOKEN activo en el backend. Mostrando publicaciones públicas de demostración filtradas en Lima Metropolitana, Perú.'
        );
      }, 400);
      return;
    }

    setSyncing(true);
    try {
      const res = await triggerXSync(currentUser, {
        districts: effectiveDistricts,
        incidentTypes: effectiveIncidentTypes,
        locationReferences: effectiveLocationRefs,
        additionalKeywords: effectiveAdditional,
        dateFrom: effectiveFrom || undefined,
        dateTo: effectiveTo || undefined
      });
      setAppliedIncidentTypes(effectiveIncidentTypes);
      setAppliedLocationRefs(effectiveLocationRefs);
      setAppliedAdditionalKeywords(effectiveAdditional);
      setAppliedDistricts(draftDistricts);
      setAppliedDateFrom(effectiveFrom);
      setAppliedDateTo(effectiveTo);
      setStatusFilter('Pendiente de validación');
      setSuccessMsg(res.message);
      await loadBackendSocialData({
        districts: draftDistricts,
        incidentTypes: effectiveIncidentTypes,
        locationReferences: effectiveLocationRefs,
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
        } else if (err.code === 'X_INVALID_DATE_RANGE') {
          setFilterValidationError(err.message);
          setErrorMsg(err.message);
        } else if (
          err.code === 'X_TOKEN_MISSING' ||
          err.code === 'X_CREDITS_DEPLETED' ||
          err.status === 402
        ) {
          setPosts(DEMO_SOCIAL_POSTS);
          setStatusFilter('Pendiente de validación');
          setSuccessMsg(
            'Modo demo: sin token o créditos disponibles en X API. Se muestran publicaciones de demostración para revisión humana.'
          );
        } else {
          setErrorMsg(err.message);
        }
      } else {
        setErrorMsg(err instanceof Error ? err.message : 'No se pudo sincronizar con X.');
      }
    } finally {
      setSyncing(false);
    }
  };

  const openReviewModal = (post: SocialPost) => {
    const detected = post.suggestedDistrict || post.detectedDistrict;
    if (
      !isModeratorAuthenticated ||
      !detected ||
      detected === 'Sin distrito' ||
      post.locationStatus === 'unknown'
    ) {
      return;
    }
    setReviewingPost(post);
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
    if (!reviewingPost || !isModerator) return;
    setSubmittingAction(true);
    setErrorMsg(null);

    try {
      if (backendAvailable) {
        const outcome = await reviewBackendSocialPost(currentUser, reviewingPost.id, {
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
          `Reporte ${outcome.createdIncident?.id || ''} aprobado y publicado en el mapa con ubicación aproximada (ofuscada 200–500 m).`
        );
        setReviewingPost(null);
        await loadBackendSocialData();
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
          evidenceNote: `Fuente externa: X — ${reviewingPost.postUrl} • Validado por moderación`,
          falseReportFlags: 0,
          helpfulCount: 1,
          reportedByRole: 'Ciudadano',
          source: 'x',
          sourceUrl: reviewingPost.postUrl,
          locationStatus: 'moderator_confirmed',
          locationConfidence: 'high',
          locationSource: payload.movedManually
            ? 'moderator_manual'
            : reviewingPost.locationSource || 'moderator_manual',
          createdAt: now.toISOString()
        };

        upsertIncident(newIncident);
        setPosts(prev =>
          prev.map(p =>
            p.id === reviewingPost.id
              ? {
                  ...p,
                  status: 'Verificado',
                  state: 'verified',
                  suggestedDistrict: payload.district,
                  detectedDistrict: payload.district,
                  district: payload.district,
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
              : p
          )
        );
        setSuccessMsg(
          `Reporte ${newIncident.id} aprobado y publicado en el mapa (Modo demo, ubicación aproximada 200–500 m).`
        );
        setReviewingPost(null);
      }
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleSaveForReview = async (payload: {
    district: string;
    latitude?: number;
    longitude?: number;
    locationLabel: string;
    confirmedLocationDescription: string;
    movedManually: boolean;
  }) => {
    if (!reviewingPost || !isModerator) return;
    setSubmittingAction(true);
    setErrorMsg(null);

    try {
      if (backendAvailable) {
        await reviewBackendSocialPost(currentUser, reviewingPost.id, {
          action: 'save_for_review',
          district: payload.district,
          latitude: payload.latitude,
          longitude: payload.longitude,
          locationLabel: payload.locationLabel,
          confirmedLocationDescription: payload.confirmedLocationDescription,
          movedManually: payload.movedManually
        });
        setSuccessMsg('Cambios geográficos guardados para revisión posterior (sin publicar en mapa).');
        setReviewingPost(null);
        await loadBackendSocialData();
      } else {
        setPosts(prev =>
          prev.map(p =>
            p.id === reviewingPost.id
              ? {
                  ...p,
                  suggestedDistrict: payload.district,
                  detectedDistrict: payload.district,
                  district: payload.district,
                  latitude: payload.latitude ?? p.latitude,
                  longitude: payload.longitude ?? p.longitude,
                  locationLabel: payload.locationLabel || p.locationLabel,
                  confirmedLocationDescription: payload.confirmedLocationDescription,
                  locationStatus:
                    payload.latitude !== undefined && payload.confirmedLocationDescription
                      ? 'moderator_confirmed'
                      : p.locationStatus,
                  locationSource: payload.movedManually ? 'moderator_manual' : p.locationSource,
                  moderatorName: currentUser?.name
                }
              : p
          )
        );
        setSuccessMsg('Borrador de ubicación guardado para revisión posterior (Modo demo).');
        setReviewingPost(null);
      }
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleOpenLinkModal = (post: SocialPost) => {
    if (!isModeratorAuthenticated) return;
    setLinkingPost(post);
    const firstActive = incidents.find(i => i.status !== 'Descartado');
    setSelectedIncidentId(firstActive?.id || '');
    setErrorMsg(null);
  };

  const handleConfirmLinkIncident = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!linkingPost || !selectedIncidentId || !isModerator) return;
    setSubmittingAction(true);
    setErrorMsg(null);

    try {
      if (backendAvailable) {
        await reviewBackendSocialPost(currentUser, linkingPost.id, {
          action: 'link_incident',
          linkedIncidentId: selectedIncidentId
        });
        await loadBackendSocialData();
      } else {
        setPosts(prev =>
          prev.map(p =>
            p.id === linkingPost.id
              ? {
                  ...p,
                  status: 'Verificado',
                  linkedIncidentId: selectedIncidentId,
                  moderatorName: currentUser?.name,
                  reviewedAt: new Date().toISOString()
                }
              : p
          )
        );
      }
      setSuccessMsg(`Publicación vinculada correctamente al reporte ${selectedIncidentId}.`);
      setLinkingPost(null);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error al vincular publicación.');
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleDiscardPost = async (post: SocialPost) => {
    if (!isModeratorAuthenticated || !isModerator) return;
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      if (backendAvailable) {
        await reviewBackendSocialPost(currentUser, post.id, {
          action: 'discard',
          reviewReason: 'Descartado tras revisión humana.'
        });
        await loadBackendSocialData();
      } else {
        setPosts(prev =>
          prev.map(p =>
            p.id === post.id
              ? {
                  ...p,
                  status: 'Descartado',
                  moderatorName: currentUser?.name,
                  reviewReason: 'Descartado tras revisión humana.',
                  reviewedAt: new Date().toISOString()
                }
              : p
          )
        );
      }
      setSuccessMsg('Publicación descartada y registrada en auditoría.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error al descartar publicación.');
    }
  };

  // Local filtering for demo mode (or already backend-filtered posts)
  const filteredPosts = useMemo(() => {
    return posts.filter(post => {
      if (appliedDistricts.length > 0) {
        const detected = post.suggestedDistrict || post.detectedDistrict || 'Sin distrito';
        const matchesAllowed = appliedDistricts.includes(detected);
        const matchesNoDistrict =
          appliedDistricts.includes('Sin distrito') &&
          post.status === 'Descartado' &&
          detected === 'Sin distrito';

        if (!matchesAllowed && !matchesNoDistrict) {
          return false;
        }
      }

      if (appliedIncidentTypes.length > 0) {
        const matchesIncident = appliedIncidentTypes.some(key => {
          const def = INCIDENT_FILTER_OPTIONS.find(o => o.key === key);
          return def ? def.matchRegex.test(post.text) : false;
        });
        if (!matchesIncident) return false;
      }

      if (appliedLocationRefs.length > 0) {
        const matchesLocRef = appliedLocationRefs.some(key => {
          const def = LOCATION_REF_OPTIONS.find(o => o.key === key);
          return def ? def.matchRegex.test(post.text) : false;
        });
        if (!matchesLocRef) return false;
      }

      if (appliedDateFrom || appliedDateTo) {
        const publishedMs = new Date(post.publishedAt).getTime();
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
    posts,
    appliedDistricts,
    appliedIncidentTypes,
    appliedLocationRefs,
    appliedDateFrom,
    appliedDateTo
  ]);

  const liveQueryPreview = useMemo(
    () =>
      buildLocalQueryPreview({
        incidentTypes: draftIncidentTypes,
        locationRefs: draftLocationRefs,
        additionalKeywords: draftAdditionalKeywords,
        districts: draftDistricts
      }),
    [draftIncidentTypes, draftLocationRefs, draftAdditionalKeywords, draftDistricts]
  );

  const hasActiveFilters =
    appliedIncidentTypes.length > 0 ||
    appliedLocationRefs.length > 0 ||
    Boolean(appliedAdditionalKeywords) ||
    appliedDistricts.length > 0 ||
    Boolean(appliedDateFrom) ||
    Boolean(appliedDateTo);

  const totalCount =
    backendAvailable && statusInfo?.stats && !hasActiveFilters
      ? statusInfo.stats.total
      : filteredPosts.length;
  const pendingPostsCount = filteredPosts.filter(p => p.status === 'Pendiente de validación').length;
  const verifiedPostsCount = filteredPosts.filter(p => p.status === 'Verificado').length;
  const discardedPostsCount = filteredPosts.filter(p => p.status === 'Descartado').length;

  const visiblePosts =
    statusFilter === 'all'
      ? filteredPosts
      : filteredPosts.filter(p => p.status === statusFilter);

  const allowedDistrictOptions = statusInfo?.allowedDistricts?.length
    ? statusInfo.allowedDistricts
    : [...ALLOWED_SOCIAL_DISTRICTS];

  const maxPostsPerSync = statusInfo?.maxPostsPerSync ?? 10;
  const cooldownMinutes = statusInfo?.cooldownMinutes ?? 60;
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
    : `Disponible ahora (1 vez cada ${cooldownMinutes} min)`;

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
                El botón <strong className="text-slate-900">Sincronizar X</strong> y la revisión de fuentes sociales permanecen deshabilitados hasta validar tu código de acceso de moderador con el servidor.
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

      {/* Status & Sync Control Panel */}
      <div className="bg-white p-5 sm:p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-900 text-white text-[11px] font-bold">
                <XLogoIcon className="w-3 h-3" />
                API oficial de X (v2)
              </span>

              {isModeratorAuthenticated && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 text-[11px] font-bold">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  Moderador autenticado
                </span>
              )}

              {isDemoMode ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-100 text-amber-900 border border-amber-300 text-[11px] font-bold">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                  Modo demo {backendAvailable ? '(Sin X_BEARER_TOKEN)' : '(Sin backend)'}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 text-[11px] font-bold">
                  <Radio className="w-3.5 h-3.5 text-emerald-600 animate-pulse" />
                  Conexión activa con X API
                </span>
              )}
            </div>
            <h3 className="font-extrabold text-base text-slate-900 pt-1">
              Monitoreo Preventivo de Publicaciones Públicas en X
            </h3>
            <p className="text-xs text-slate-500 max-w-2xl">
              Ningún post importado aparece automáticamente en el mapa público. Todo contenido externo exige revisión humana, confirmación de ubicación aproximada y verificación.
            </p>
          </div>

          <button
            onClick={handleSyncX}
            disabled={!isModeratorAuthenticated || syncing || loading}
            className="px-5 py-2.5 rounded-xl bg-[#0B1F3A] hover:bg-blue-900 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-xs shadow-md flex items-center justify-center gap-2 shrink-0 transition-all active:scale-95"
            title={
              !isModeratorAuthenticated
                ? 'Autentícate como moderador para habilitar Sincronizar X'
                : 'Sincronizar máximo 10 publicaciones públicas recientes'
            }
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Sincronizando X...' : 'Sincronizar X'}
          </button>
        </div>

        {/* Consumption policy & limits banner */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 rounded-2xl bg-blue-50/80 border border-blue-200 text-xs text-blue-900">
          <span className="font-bold">
            Máximo {maxPostsPerSync} publicaciones por sincronización
          </span>
          <span className="text-[11px] font-semibold text-blue-800">
            Próxima consulta permitida: {nextAllowedLabel}
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
              {pendingPostsCount}
            </span>
          </div>

          <div className="p-3 rounded-2xl bg-emerald-50/70 border border-emerald-200">
            <span className="text-[11px] text-emerald-700 font-semibold block">Aprobadas</span>
            <span className="font-extrabold text-lg text-emerald-800 mt-0.5 block">
              {verifiedPostsCount}
            </span>
          </div>

          <div className="p-3 rounded-2xl bg-slate-100/80 border border-slate-200">
            <span className="text-[11px] text-slate-500 font-semibold block">Descartadas</span>
            <span className="font-extrabold text-lg text-slate-700 mt-0.5 block">
              {discardedPostsCount}
            </span>
          </div>
        </div>

        {/* Visual Structured Filters (Incident Types, Location References, Optional Keywords, Districts, Dates) */}
        <form
          onSubmit={handleApplyFilters}
          className="pt-3 border-t border-slate-100 space-y-4"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
              <Filter className="w-3.5 h-3.5 text-blue-600" />
              <span>Filtros visuales de seguridad (Lima Metropolitana, Perú)</span>
            </div>
            <span className="text-[11px] text-slate-400 hidden sm:inline">
              {statusInfo?.lastSyncAt
                ? `Última sync: ${new Date(statusInfo.lastSyncAt).toLocaleString('es-PE')}`
                : 'Modo demo precargado'}
            </span>
          </div>

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
                2. Referencia de ubicación (exige pista vial o lugar en la publicación)
              </label>
              <span className="text-[10px] text-slate-500">
                Si seleccionas referencias, se descartarán posts sin mención de vía o lugar
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

          {/* Optional additional words + Districts + Date Range */}
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
                    <span>Sin distrito (solo descartados)</span>
                  </label>
                </div>
              )}
            </div>

            {/* Palabras adicionales opcionales (máx. 80 caracteres) */}
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
                placeholder="Ej: motocicleta nocturno"
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
                aria-label="Fecha desde"
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
                aria-label="Fecha hasta"
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
                Retención de descartados: {statusInfo?.retentionDays || 30} días
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
                    key={`inc-${key}`}
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
                    key={`loc-${key}`}
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
                      ? 'Sin distrito (solo descartados)'
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

          {/* Read-only preview of backend-generated X query */}
          <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-800">
                <Eye className="w-3.5 h-3.5 text-blue-600" />
                <span>Vista previa de la consulta generada (solo lectura, construida en backend)</span>
              </div>
              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                <ShieldCheck className="w-3 h-3" />
                {liveQueryPreview.queries.length > 1
                  ? `${liveQueryPreview.queries.length} grupos secuenciales (máx. ${maxPostsPerSync} posts totales)`
                  : '1 consulta válida (≤ 512 caracteres)'}
              </span>
            </div>

            <pre
              aria-label="Vista previa de la consulta X"
              className="text-[11px] font-mono text-slate-700 bg-white p-2.5 rounded-xl border border-slate-200 whitespace-pre-wrap break-words select-all"
            >
              {liveQueryPreview.preview}
            </pre>

            <p className="text-[10px] text-slate-500 leading-relaxed">
              Exclusiones automáticas activas contra falsos positivos bancarios o de trámites (<code className="text-slate-600">-banco -bancos -tramite -trámite -papeles -documentos -licencia -municipalidad</code>), idioma español (<code className="text-slate-600">lang:es</code>) y sin retuits (<code className="text-slate-600">-is:retweet</code>). Máximo {maxPostsPerSync} publicaciones cada {cooldownMinutes} min.
            </p>
          </div>
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

      {/* Filter tabs: Pendientes, Todas, Descartadas */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-bold text-xs uppercase tracking-wider text-slate-600">
          Publicaciones importadas de X ({visiblePosts.length})
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
            Pendientes ({pendingPostsCount})
          </button>
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1 rounded-lg font-bold ${
              statusFilter === 'all'
                ? 'bg-blue-600 text-white'
                : 'bg-white border border-slate-200 text-slate-600'
            }`}
          >
            Todas ({filteredPosts.length})
          </button>
          <button
            onClick={() => setStatusFilter('Descartado')}
            className={`px-3 py-1 rounded-lg font-bold ${
              statusFilter === 'Descartado'
                ? 'bg-slate-800 text-white'
                : 'bg-white border border-slate-200 text-slate-600'
            }`}
          >
            Descartadas ({discardedPostsCount})
          </button>
        </div>
      </div>

      {/* Imported Posts List */}
      {loading ? (
        <div className="bg-white p-10 rounded-3xl border border-slate-200 text-center text-xs text-slate-500">
          Cargando publicaciones de X...
        </div>
      ) : visiblePosts.length === 0 ? (
        <div className="bg-white p-10 rounded-3xl border border-slate-200 text-center space-y-2">
          <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
          <p className="font-bold text-sm text-slate-800">
            {statusFilter === 'Descartado'
              ? 'Sin publicaciones descartadas para este filtro'
              : 'Sin publicaciones para mostrar'}
          </p>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            {hasActiveFilters
              ? 'Prueba ajustando o limpiando los filtros de distrito y fechas, o presiona “Sincronizar X” para consultar nuevas alertas públicas.'
              : 'Todas las publicaciones importadas de X han sido revisadas. Presiona “Sincronizar X” para consultar nuevas alertas públicas.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {visiblePosts.map(post => {
            const safeUrl = getSafeExternalUrl(post.postUrl);
            const safeExcerpt = sanitizeExternalText(post.text, 320);
            const isPending = post.status === 'Pendiente de validación';
            const detectedDistrict =
              post.suggestedDistrict || post.detectedDistrict || 'Sin distrito';
            const hasConfirmedDistrict =
              Boolean(detectedDistrict) && detectedDistrict !== 'Sin distrito';
            const locStatus = post.locationStatus || 'unknown';
            const locConfidence = post.locationConfidence || 'low';
            const canCreateFromPost =
              isModeratorAuthenticated && hasConfirmedDistrict && locStatus !== 'unknown';

            const statusLabel =
              locStatus === 'moderator_confirmed'
                ? 'Ubicación confirmada por moderador'
                : locStatus === 'exact_candidate'
                ? 'Candidato de dirección/coordenada'
                : locStatus === 'district_only'
                ? 'Solo distrito (área general, sin pin público)'
                : 'Sin ubicación suficiente';

            return (
              <div
                key={post.id}
                className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3"
              >
                {/* Header */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-lg bg-slate-900 text-white">
                      <XLogoIcon className="w-3.5 h-3.5" />
                    </span>
                    <span className="text-[11px] font-bold text-slate-700">
                      Publicación pública en X
                    </span>
                    {post.isDemo && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                        Modo demo
                      </span>
                    )}
                    {post.isLimaValidated && post.status !== 'Descartado' && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        Ubicación validada: Lima Metropolitana, Perú
                      </span>
                    )}
                    <span className="text-[11px] text-slate-400 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(post.publishedAt).toLocaleString('es-PE')}
                    </span>
                  </div>

                  <span
                    className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${
                      post.status === 'Verificado'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : post.status === 'Descartado'
                        ? 'bg-slate-100 text-slate-600 border-slate-200'
                        : 'bg-amber-50 text-amber-700 border-amber-200'
                    }`}
                  >
                    {post.status}
                  </span>
                </div>

                {/* Safe Excerpt */}
                <p className="text-xs sm:text-sm text-slate-800 bg-slate-50 p-3.5 rounded-xl border border-slate-200 leading-relaxed">
                  {safeExcerpt}
                </p>

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

                  {post.locationLabel && (
                    <span className="px-2.5 py-1 rounded-lg bg-slate-50 text-slate-700 border border-slate-200">
                      Ref.: {sanitizeExternalText(post.locationLabel, 90)}
                    </span>
                  )}

                  {typeof post.latitude === 'number' && typeof post.longitude === 'number' && (
                    <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600 font-mono text-[10px]">
                      {post.latitude.toFixed(4)}, {post.longitude.toFixed(4)}
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
                      Ver publicación original
                    </a>
                  )}
                </div>

                {/* Discard Reason if discarded */}
                {post.status === 'Descartado' && post.reviewReason && (
                  <div className="px-3 py-2 rounded-xl bg-slate-100 border border-slate-200 text-[11px] text-slate-700 flex items-center gap-1.5">
                    <XCircle className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    <span>
                      <strong>Motivo de descarte:</strong> {post.reviewReason}
                    </span>
                  </div>
                )}

                {/* Actions */}
                {isPending ? (
                  <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => openReviewModal(post)}
                      disabled={!canCreateFromPost}
                      title={
                        !isModeratorAuthenticated
                          ? 'Autentícate como moderador para revisar'
                          : locStatus === 'unknown' || !hasConfirmedDistrict
                          ? 'Sin ubicación suficiente: no se permite crear reporte'
                          : 'Revisar mapa y confirmar ubicación antes de publicar'
                      }
                      className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold flex items-center gap-1.5 shadow-xs"
                    >
                      <PlusCircle className="w-3.5 h-3.5" />
                      Crear reporte desde publicación
                    </button>

                    <button
                      onClick={() => handleOpenLinkModal(post)}
                      disabled={!isModeratorAuthenticated}
                      className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed text-slate-800 text-xs font-semibold flex items-center gap-1.5 border border-slate-200"
                    >
                      <Link2 className="w-3.5 h-3.5" />
                      Vincular a reporte existente
                    </button>

                    <button
                      onClick={() => handleDiscardPost(post)}
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
                      Revisado por {post.moderatorName || 'Moderación'}
                      {post.linkedIncidentId ? ` • Vinculado a ${post.linkedIncidentId}` : ''}
                    </span>
                    {post.reviewedAt && (
                      <span>{new Date(post.reviewedAt).toLocaleString('es-PE')}</span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Backend Audit Log excerpt for Social Sources */}
      {auditLogs.length > 0 && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
            <History className="w-4 h-4 text-blue-600" />
            <h4 className="font-bold text-xs text-slate-800 uppercase tracking-wider">
              Auditoría de Fuentes Sociales ({auditLogs.length})
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

      {/* MODAL 1: Geolocation & Human Review Modal (before publishing to map) */}
      {reviewingPost && (
        <SocialPostReviewModal
          post={reviewingPost}
          backendAvailable={backendAvailable}
          submitting={submittingAction}
          onClose={() => setReviewingPost(null)}
          onApproveAndPublish={handleApproveAndPublish}
          onSaveForReview={handleSaveForReview}
          onDiscard={async reason => {
            await handleDiscardPost(reviewingPost);
            if (reason) {
              setReviewingPost(null);
            }
          }}
        />
      )}

      {/* MODAL 2: Link SocialPost to existing IncidentReport */}
      {linkingPost && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200">
            <div className="bg-[#0B1F3A] text-white p-5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Link2 className="w-5 h-5 text-blue-400" />
                <h3 className="font-bold text-sm">Vincular publicación a reporte existente</h3>
              </div>
              <button
                onClick={() => setLinkingPost(null)}
                className="text-slate-300 hover:text-white text-sm font-bold px-2"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleConfirmLinkIncident} className="p-5 space-y-4 text-xs">
              <p className="text-slate-600">
                Selecciona el incidente ya registrado que coincide con esta publicación pública de X para usarlo como respaldo informativo.
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
                  onClick={() => setLinkingPost(null)}
                  className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submittingAction || !selectedIncidentId}
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-sm"
                >
                  {submittingAction ? 'Vinculando...' : 'Vincular publicación'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
