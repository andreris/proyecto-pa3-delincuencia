import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { DatabaseAdapter } from '../db/types.js';
import {
  AuthenticatedRequest,
  requireAuth,
  requireModerator,
  verifySessionToken
} from '../middleware/auth.js';
import {
  createIncident,
  listIncidents,
  reviewIncident
} from '../services/socialRepository.js';
import { IncidentCategory, RiskLevel } from '../types.js';

export function createIncidentRouter(db: DatabaseAdapter): Router {
  const router = Router();

  const writeLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Demasiados reportes enviados en poco tiempo. Intenta nuevamente.' }
  });

  // Public list of incidents: NEVER returns unverified X-sourced incidents
  // Moderators passing ?includePending=true with a valid moderator Bearer token can view pending X incidents
  router.get('/', async (req: AuthenticatedRequest, res) => {
    try {
      let includeUnverifiedX = false;
      if (req.query.includePending === 'true') {
        const authHeader = req.headers.authorization || '';
        if (authHeader.startsWith('Bearer ')) {
          const user = verifySessionToken(authHeader.slice('Bearer '.length).trim());
          if (user && user.role === 'moderator') {
            includeUnverifiedX = true;
          }
        }
      }

      const incidents = await listIncidents(db, { includeUnverifiedX });
      res.json({ incidents });
    } catch (err) {
      console.error('[incidents/get] Error:', err);
      res.status(500).json({ error: 'No se pudieron obtener los incidentes.' });
    }
  });

  // Create citizen incident (always starts as Pendiente de validación)
  router.post('/', writeLimiter, async (req, res) => {
    try {
      const {
        category,
        riskLevel,
        title,
        description,
        date,
        time,
        district,
        approxLocation,
        evidenceNote,
        reportedByRole
      } = req.body as {
        category?: IncidentCategory;
        riskLevel?: RiskLevel;
        title?: string;
        description?: string;
        date?: string;
        time?: string;
        district?: string;
        approxLocation?: { lat: number; lng: number; address: string };
        evidenceNote?: string;
        reportedByRole?: 'Peatón' | 'Conductor' | 'Comerciante' | 'Ciudadano';
      };

      if (!title?.trim() || !description?.trim() || !district?.trim() || !approxLocation) {
        res.status(400).json({
          error: 'Campos obligatorios incompletos: título, descripción, distrito y ubicación aproximada.'
        });
        return;
      }

      const created = await createIncident(db, {
        category: category || 'otro',
        riskLevel: riskLevel || 'medio',
        title,
        description,
        date: date || new Date().toISOString().split('T')[0],
        time: time || '12:00',
        district,
        approxLocation,
        evidenceNote,
        reportedByRole: reportedByRole || 'Ciudadano',
        source: 'citizen'
      });

      res.status(201).json({ incident: created });
    } catch (err) {
      console.error('[incidents/post] Error:', err);
      res.status(500).json({ error: 'No se pudo registrar el incidente.' });
    }
  });

  // Moderator-only: verify or discard an incident
  router.patch(
    '/:id/review',
    requireAuth,
    requireModerator,
    async (req: AuthenticatedRequest, res) => {
      try {
        const incidentId = String(req.params.id);
        const { status, reason } = req.body as {
          status?: 'Verificado' | 'Descartado';
          reason?: string;
        };

        if (status !== 'Verificado' && status !== 'Descartado') {
          res.status(400).json({ error: 'El estado debe ser Verificado o Descartado.' });
          return;
        }

        const updated = await reviewIncident(db, incidentId, status, req.authUser!, reason);
        if (!updated) {
          res.status(404).json({ error: 'Reporte no encontrado.' });
          return;
        }

        res.json({ incident: updated });
      } catch (err) {
        console.error('[incidents/review] Error:', err);
        res.status(500).json({ error: 'No se pudo actualizar el estado del incidente.' });
      }
    }
  );

  return router;
}
