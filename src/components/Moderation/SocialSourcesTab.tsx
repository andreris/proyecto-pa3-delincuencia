import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useIncidents } from '../../context/IncidentContext';
import {
  ALLOWED_SOCIAL_DISTRICTS,
  DEMO_SOCIAL_POSTS,
  DISTRICT_APPROX_COORDS,
  PERU_DISTRICTS
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
  IncidentReport,
  RiskLevel,
  SocialPost,
  SocialSourceAudit
} from '../../types';
import { getSafeExternalUrl, sanitizeExternalText } from '../../utils/sanitize';
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
  Search,
  Save,
  ShieldAlert,
  MapPin,
  Radio,
  History,
  Filter,
  ChevronDown,
  X,
  Calendar
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
  const [queryInput, setQueryInput] = useState(
    '(robo OR asalto OR extorsion OR inseguridad) lang:es -is:retweet'
  );
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [savingQuery, setSavingQuery] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<
    'Pendiente de validación' | 'all' | 'Descartado'
  >('Pendiente de validación');

  // Visual filter inputs (draft vs applied)
  const [draftDistricts, setDraftDistricts] = useState<string[]>([]);
  const [draftDateFrom, setDraftDateFrom] = useState<string>('');
  const [draftDateTo, setDraftDateTo] = useState<string>('');
  const [appliedDistricts, setAppliedDistricts] = useState<string[]>([]);
  const [appliedDateFrom, setAppliedDateFrom] = useState<string>('');
  const [appliedDateTo, setAppliedDateTo] = useState<string>('');
  const [districtMenuOpen, setDistrictMenuOpen] = useState(false);
  const [filterValidationError, setFilterValidationError] = useState<string | null>(null);
  const districtDropdownRef = useRef<HTMLDivElement | null>(null);

  // Create Report modal state
  const [creatingFromPost, setCreatingFromPost] = useState<SocialPost | null>(null);
  const [reportDistrict, setReportDistrict] = useState('');
  const [reportAddress, setReportAddress] = useState('');
  const [reportTitle, setReportTitle] = useState('');
  const [reportDescription, setReportDescription] = useState('');
  const [reportCategory, setReportCategory] = useState<IncidentCategory>('robo');
  const [reportRiskLevel, setReportRiskLevel] = useState<RiskLevel>('medio');
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
          : appliedDistricts.length > 0
          ? appliedDistricts
          : statusData.filterDistricts || [];
      const effectiveDateFrom =
        overrideFilters?.dateFrom !== undefined
          ? overrideFilters.dateFrom
          : appliedDateFrom || statusData.filterDateFrom || '';
      const effectiveDateTo =
        overrideFilters?.dateTo !== undefined
          ? overrideFilters.dateTo
          : appliedDateTo || statusData.filterDateTo || '';

      const [postsData, logsData] = await Promise.all([
        fetchSocialPosts(currentUser, {
          districts: effectiveDistricts,
          dateFrom: effectiveDateFrom || undefined,
          dateTo: effectiveDateTo || undefined
        }),
        fetchSocialAuditLogs(currentUser)
      ]);

      setStatusInfo({ ...statusData, stats: postsData.stats });
      setQueryInput(statusData.searchQuery);
      if (overrideFilters === undefined && appliedDistricts.length === 0 && !appliedDateFrom && !appliedDateTo) {
        const initDistricts = statusData.filterDistricts || [];
        const initFrom = statusData.filterDateFrom || '';
        const initTo = statusData.filterDateTo || '';
        setDraftDistricts(initDistricts);
        setAppliedDistricts(initDistricts);
        setDraftDateFrom(initFrom);
        setAppliedDateFrom(initFrom);
        setDraftDateTo(initTo);
        setAppliedDateTo(initTo);
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

    const nextDistricts = [...draftDistricts];
    const nextFrom = draftDateFrom;
    const nextTo = draftDateTo;

    setAppliedDistricts(nextDistricts);
    setAppliedDateFrom(nextFrom);
    setAppliedDateTo(nextTo);
    setDistrictMenuOpen(false);

    if (nextDistricts.includes('Sin distrito') && nextDistricts.length === 1) {
      setStatusFilter('Descartado');
    }

    if (!backendAvailable || !isModeratorAuthenticated) {
      setSuccessMsg('Filtros aplicados a las publicaciones de demostración.');
      return;
    }

    setLoading(true);
    try {
      // Save real Lima/Callao districts & date range so they also apply to the next X sync
      const syncableDistricts = nextDistricts.filter(d => d !== 'Sin distrito');
      await updateSocialConfig(currentUser, {
        filterDistricts: syncableDistricts,
        filterDateFrom: nextFrom || null,
        filterDateTo: nextTo || null
      });
      await loadBackendSocialData({
        districts: nextDistricts,
        dateFrom: nextFrom,
        dateTo: nextTo
      });
      setSuccessMsg(
        'Filtros aplicados a las publicaciones importadas y guardados para la próxima consulta a X.'
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
    setDraftDistricts([]);
    setDraftDateFrom('');
    setDraftDateTo('');
    setAppliedDistricts([]);
    setAppliedDateFrom('');
    setAppliedDateTo('');
    setDistrictMenuOpen(false);

    if (!backendAvailable || !isModeratorAuthenticated) {
      setSuccessMsg('Filtros restablecidos.');
      return;
    }

    setLoading(true);
    try {
      await updateSocialConfig(currentUser, {
        filterDistricts: [],
        filterDateFrom: null,
        filterDateTo: null
      });
      await loadBackendSocialData({ districts: [], dateFrom: '', dateTo: '' });
      setSuccessMsg('Filtros limpiados.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'No se pudieron limpiar los filtros.');
      setLoading(false);
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

    const effectiveDistricts = (draftDistricts.length > 0 ? draftDistricts : appliedDistricts).filter(
      d => d !== 'Sin distrito'
    );

    if (!backendAvailable || !xConfigured) {
      // Demo simulation when backend or X_BEARER_TOKEN is not configured
      setSyncing(true);
      setTimeout(() => {
        setSyncing(false);
        setStatusFilter('Pendiente de validación');
        setSuccessMsg(
          'Modo demo: no hay X_BEARER_TOKEN activo en el backend. Mostrando publicaciones públicas de demostración filtradas en Lima y Callao.'
        );
      }, 400);
      return;
    }

    setSyncing(true);
    try {
      const res = await triggerXSync(currentUser, {
        districts: effectiveDistricts,
        dateFrom: effectiveFrom || undefined,
        dateTo: effectiveTo || undefined
      });
      setAppliedDistricts(draftDistricts);
      setAppliedDateFrom(effectiveFrom);
      setAppliedDateTo(effectiveTo);
      setStatusFilter('Pendiente de validación');
      setSuccessMsg(res.message);
      await loadBackendSocialData({
        districts: draftDistricts,
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

  const handleSaveQuery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isModeratorAuthenticated || !isModerator) return;
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!backendAvailable) {
      setSuccessMsg('Consulta actualizada localmente (Modo demo).');
      return;
    }

    setSavingQuery(true);
    try {
      const updated = await updateSocialConfig(currentUser, { searchQuery: queryInput });
      setQueryInput(updated.searchQuery);
      setSuccessMsg('Consulta de búsqueda oficial actualizada y registrada en auditoría.');
      await loadBackendSocialData();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'No se pudo guardar la consulta.');
    } finally {
      setSavingQuery(false);
    }
  };

  const openCreateModal = (post: SocialPost) => {
    const detected = post.suggestedDistrict || post.detectedDistrict;
    if (!isModeratorAuthenticated || !detected || detected === 'Sin distrito') return;
    setCreatingFromPost(post);
    setReportDistrict(detected);
    setReportAddress(`Zona aproximada por confirmar en ${detected}`);
    setReportTitle(`Alerta referencial desde X en ${detected}`);
    setReportDescription(sanitizeExternalText(post.text, 400));
    setReportCategory(post.suggestedCategory);
    setReportRiskLevel(post.suggestedRiskLevel);
    setErrorMsg(null);
  };

  const handleConfirmCreateReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!creatingFromPost || !isModerator) return;

    if (!reportDistrict.trim()) {
      setErrorMsg(
        'Debes seleccionar o confirmar el distrito y ubicación aproximada antes de generar el reporte.'
      );
      return;
    }

    setSubmittingAction(true);
    setErrorMsg(null);

    const coords =
      DISTRICT_APPROX_COORDS[reportDistrict] || DISTRICT_APPROX_COORDS['Lima (Cercado)'];

    try {
      if (backendAvailable) {
        const outcome = await reviewBackendSocialPost(currentUser, creatingFromPost.id, {
          action: 'create_report',
          district: reportDistrict,
          category: reportCategory,
          riskLevel: reportRiskLevel,
          title: reportTitle,
          description: reportDescription,
          approxAddress: reportAddress || `Zona aproximada en ${reportDistrict}`,
          approxLat: coords.lat,
          approxLng: coords.lng
        });

        if (outcome.createdIncident) {
          upsertIncident(outcome.createdIncident);
        }
        setSuccessMsg(
          `Reporte ${outcome.createdIncident?.id || ''} creado con estado "Pendiente de validación". Revisa y verifícalo en la Cola de Validación para publicarlo en el mapa.`
        );
        setCreatingFromPost(null);
        await loadBackendSocialData();
      } else {
        // Demo mode local workflow
        const now = new Date();
        const jitterLat = (Math.random() - 0.5) * 0.0012;
        const jitterLng = (Math.random() - 0.5) * 0.0012;
        const newIncident: IncidentReport = {
          id: `VIG-${now.getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
          category: reportCategory,
          riskLevel: reportRiskLevel,
          title: sanitizeExternalText(reportTitle, 120),
          description: sanitizeExternalText(reportDescription, 450),
          date: now.toISOString().split('T')[0],
          time: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
          district: reportDistrict,
          approxLocation: {
            lat: Number((coords.lat + jitterLat).toFixed(5)),
            lng: Number((coords.lng + jitterLng).toFixed(5)),
            address: reportAddress || `Zona aproximada en ${reportDistrict}`
          },
          status: 'Pendiente de validación',
          isDemo: true,
          evidenceNote: `Fuente externa: X — ${creatingFromPost.postUrl}`,
          falseReportFlags: 0,
          helpfulCount: 1,
          reportedByRole: 'Ciudadano',
          source: 'x',
          sourceUrl: creatingFromPost.postUrl,
          createdAt: now.toISOString()
        };

        upsertIncident(newIncident);
        setPosts(prev =>
          prev.map(p =>
            p.id === creatingFromPost.id
              ? {
                  ...p,
                  status: 'Verificado',
                  linkedIncidentId: newIncident.id,
                  moderatorName: currentUser?.name,
                  reviewedAt: now.toISOString()
                }
              : p
          )
        );
        setSuccessMsg(
          `Reporte ${newIncident.id} creado en "Pendiente de validación" (Modo demo). Solo aparecerá en el mapa después de verificarlo en "Cola de Validación".`
        );
        setCreatingFromPost(null);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error creando reporte desde publicación.');
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
  }, [posts, appliedDistricts, appliedDateFrom, appliedDateTo]);

  const totalCount =
    backendAvailable && statusInfo?.stats && appliedDistricts.length === 0 && !appliedDateFrom && !appliedDateTo
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
  const hasActiveFilters =
    appliedDistricts.length > 0 || Boolean(appliedDateFrom) || Boolean(appliedDateTo);

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

        {/* Visual District & Date Filters (apply to imported posts AND next X sync) */}
        <form
          onSubmit={handleApplyFilters}
          className="pt-3 border-t border-slate-100 space-y-3"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
              <Filter className="w-3.5 h-3.5 text-blue-600" />
              <span>Filtros de Lima Metropolitana y Callao (importadas y próxima consulta X)</span>
            </div>
            <span className="text-[11px] text-slate-400 hidden sm:inline">
              {statusInfo?.lastSyncAt
                ? `Última sync: ${new Date(statusInfo.lastSyncAt).toLocaleString('es-PE')}`
                : 'Modo demo precargado'}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5 items-end text-xs">
            {/* Multi-select District Selector */}
            <div className="md:col-span-5 relative" ref={districtDropdownRef}>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                Distritos permitidos
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
                  <button
                    type="button"
                    onClick={() => setDraftDistricts([])}
                    className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center justify-between ${
                      draftDistricts.length === 0
                        ? 'bg-blue-50 text-blue-700'
                        : 'text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <span>Todos los distritos</span>
                    {draftDistricts.length === 0 && <CheckCircle2 className="w-3.5 h-3.5" />}
                  </button>
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

            {/* Fecha desde */}
            <div className="md:col-span-2">
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                Fecha desde
              </label>
              <div className="relative">
                <input
                  type="date"
                  aria-label="Fecha desde"
                  value={draftDateFrom}
                  onChange={e => setDraftDateFrom(e.target.value)}
                  className="w-full px-2.5 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white text-xs"
                />
              </div>
            </div>

            {/* Fecha hasta */}
            <div className="md:col-span-2">
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                Fecha hasta
              </label>
              <div className="relative">
                <input
                  type="date"
                  aria-label="Fecha hasta"
                  value={draftDateTo}
                  onChange={e => setDraftDateTo(e.target.value)}
                  className="w-full px-2.5 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white text-xs"
                />
              </div>
            </div>

            {/* Apply / Clear buttons */}
            <div className="md:col-span-3 flex items-center gap-2">
              <button
                type="submit"
                disabled={loading || syncing}
                className="flex-1 px-3.5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-xs shadow-xs"
              >
                Aplicar filtros
              </button>
              <button
                type="button"
                onClick={handleClearFilters}
                disabled={loading || syncing}
                className="px-3 py-2.5 rounded-xl bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 font-semibold text-xs"
              >
                Limpiar filtros
              </button>
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
              {appliedDistricts.map(district => (
                <span
                  key={district}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold border ${
                    district === 'Sin distrito'
                      ? 'bg-slate-100 text-slate-700 border-slate-300'
                      : 'bg-blue-50 text-blue-800 border-blue-200'
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

          <p className="text-[11px] text-slate-400">
            X API v2 Recent Search consulta publicaciones recientes (típicamente hasta los últimos 7 días). Si X rechaza el rango de fechas solicitado, se mostrará el aviso correspondiente.
          </p>
        </form>

        {/* Moderator Configurable Search Query */}
        <form onSubmit={handleSaveQuery} className="pt-2 border-t border-slate-100 space-y-2">
          <label className="block text-xs font-bold text-slate-800">
            Palabras clave base para X API v2 (solo moderadores):
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={queryInput}
                onChange={e => setQueryInput(e.target.value)}
                disabled={!isModeratorAuthenticated}
                maxLength={250}
                placeholder="Ej: (robo OR asalto OR extorsion OR inseguridad) lang:es -is:retweet"
                className="w-full text-xs pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-mono disabled:opacity-60"
              />
            </div>
            <button
              type="submit"
              disabled={!isModeratorAuthenticated || savingQuery}
              className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold flex items-center justify-center gap-1.5 shrink-0"
            >
              <Save className="w-3.5 h-3.5" />
              {savingQuery ? 'Guardando...' : 'Guardar consulta'}
            </button>
          </div>
          <p className="text-[11px] text-slate-400">
            Solo procesa publicaciones públicas recientes en una única consulta (sin paginación, máx. {maxPostsPerSync} posts cada {cooldownMinutes} min). Retención automática de descartados: {statusInfo?.retentionDays || 30} días.
          </p>
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

                {/* Metadata tags */}
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

                  <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600 font-mono">
                    Consulta: {sanitizeExternalText(post.queryUsed, 90)}
                  </span>

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
                      onClick={() => openCreateModal(post)}
                      disabled={!isModeratorAuthenticated || !hasConfirmedDistrict}
                      title={
                        !hasConfirmedDistrict
                          ? 'Se requiere un distrito permitido confirmado para crear reporte'
                          : 'Crear reporte en Pendiente de validación'
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

      {/* MODAL 1: Create IncidentReport from SocialPost (requires moderator location confirmation) */}
      {creatingFromPost && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200">
            <div className="bg-[#0B1F3A] text-white p-5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-blue-400" />
                <div>
                  <h3 className="font-bold text-sm">Crear reporte desde publicación de X</h3>
                  <p className="text-[11px] text-blue-200">
                    Ingresará como “Pendiente de validación” y requerirá confirmación geográfica
                  </p>
                </div>
              </div>
              <button
                onClick={() => setCreatingFromPost(null)}
                className="text-slate-300 hover:text-white text-sm font-bold px-2"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleConfirmCreateReport} className="p-5 space-y-3.5 max-h-[78vh] overflow-y-auto text-xs">
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-[11px]">
                <strong>Regla de privacidad:</strong> Nunca se infiere ubicación exacta desde el perfil o texto de X. Selecciona y confirma manualmente el distrito y una referencia aproximada antes de crear el reporte.
              </div>

              <div>
                <label className="block font-bold text-slate-800 mb-1">
                  Distrito confirmado por moderador *
                </label>
                <select
                  value={reportDistrict}
                  onChange={e => setReportDistrict(e.target.value)}
                  required
                  className="w-full p-2.5 rounded-xl border border-slate-200 bg-white"
                >
                  <option value="">-- Selecciona un distrito para confirmar --</option>
                  {PERU_DISTRICTS.filter(d => d !== 'Todos los distritos').map(d => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-800 mb-1">
                  Referencia aproximada (no domicilio exacto)
                </label>
                <input
                  type="text"
                  value={reportAddress}
                  onChange={e => setReportAddress(e.target.value)}
                  placeholder="Ej: Zona referencial cerca a avenida principal"
                  className="w-full p-2.5 rounded-xl border border-slate-200"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-800 mb-1">Categoría</label>
                  <select
                    value={reportCategory}
                    onChange={e => setReportCategory(e.target.value as IncidentCategory)}
                    className="w-full p-2.5 rounded-xl border border-slate-200 bg-white"
                  >
                    <option value="robo">Robo</option>
                    <option value="asalto">Asalto</option>
                    <option value="extorsion">Extorsión</option>
                    <option value="accidente">Accidente</option>
                    <option value="actividad_sospechosa">Actividad sospechosa</option>
                    <option value="hurto_menor">Hurto menor</option>
                    <option value="otro">Otro</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-800 mb-1">Nivel de riesgo</label>
                  <select
                    value={reportRiskLevel}
                    onChange={e => setReportRiskLevel(e.target.value as RiskLevel)}
                    className="w-full p-2.5 rounded-xl border border-slate-200 bg-white"
                  >
                    <option value="alto">🔴 Alto</option>
                    <option value="medio">🟡 Medio</option>
                    <option value="informativo">🔵 Informativo</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-800 mb-1">Título del reporte *</label>
                <input
                  type="text"
                  value={reportTitle}
                  onChange={e => setReportTitle(e.target.value)}
                  required
                  maxLength={120}
                  className="w-full p-2.5 rounded-xl border border-slate-200"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-800 mb-1">
                  Descripción redactada sin datos personales *
                </label>
                <textarea
                  rows={3}
                  value={reportDescription}
                  onChange={e => setReportDescription(e.target.value)}
                  required
                  className="w-full p-2.5 rounded-xl border border-slate-200"
                />
              </div>

              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-600">
                <strong>Evidencia generada:</strong> Fuente externa: X ({creatingFromPost.postUrl})
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setCreatingFromPost(null)}
                  className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submittingAction || !reportDistrict.trim() || reportDistrict === 'Sin distrito'}
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold shadow-sm"
                >
                  {submittingAction ? 'Creando...' : 'Crear reporte pendiente'}
                </button>
              </div>
            </form>
          </div>
        </div>
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
