import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseAdapter } from './db/types.js';
import { issueSessionToken } from './middleware/auth.js';
import { createIncidentRouter } from './routes/incidentRoutes.js';
import { createSocialRouter } from './routes/socialRoutes.js';
import { XService } from './services/xService.js';

export interface AppDependencies {
  db: DatabaseAdapter;
  xService?: XService;
}

export function createApp({ db, xService }: AppDependencies) {
  const app = express();
  const resolvedXService = xService || new XService();

  app.set('trust proxy', 1);

  app.use(
    cors({
      origin: true,
      credentials: false,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization']
    })
  );

  app.use(express.json({ limit: '256kb' }));

  const globalLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 150,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Demasiadas solicitudes. Intenta nuevamente en un momento.' }
  });

  app.use('/api', globalLimiter);

  // Healthcheck (never exposes secrets or tokens)
  app.get('/api/health', (_req, res) => {
    const xConfigured = resolvedXService.isTokenConfigured();
    res.json({
      ok: true,
      service: 'vigila-pe-api',
      mode: xConfigured ? 'live' : 'demo_no_token',
      xConfigured,
      dbType: db.dialect,
      timestamp: new Date().toISOString()
    });
  });

  // Session token endpoint for frontend auth / demo persona alignment
  app.post('/api/auth/session', (req, res) => {
    const { uid, name, email, role, moderatorCode } = req.body as {
      uid?: string;
      name?: string;
      email?: string;
      role?: 'user' | 'moderator';
      moderatorCode?: string;
    };

    if (!uid || !name) {
      res.status(400).json({ error: 'Se requiere identificador y nombre de usuario.' });
      return;
    }

    let grantedRole: 'user' | 'moderator' = 'user';
    const configuredModCode = (process.env.MODERATOR_ACCESS_CODE || '').trim();

    if (role === 'moderator') {
      if (configuredModCode) {
        if (moderatorCode !== configuredModCode) {
          res.status(403).json({ error: 'Código de moderador inválido.' });
          return;
        }
        grantedRole = 'moderator';
      } else if (process.env.NODE_ENV !== 'production' && email === 'moderacion@vigila.pe') {
        // Allow demo moderator persona in local development when no MODERATOR_ACCESS_CODE is set
        grantedRole = 'moderator';
      } else {
        res.status(403).json({
          error: 'No autorizado para obtener rol de moderador.'
        });
        return;
      }
    }

    const token = issueSessionToken({
      uid: String(uid),
      name: String(name).slice(0, 80),
      email: String(email || '').slice(0, 120),
      role: grantedRole
    });

    res.json({
      token,
      user: {
        uid: String(uid),
        name: String(name).slice(0, 80),
        email: String(email || '').slice(0, 120),
        role: grantedRole
      }
    });
  });

  app.use('/api/incidents', createIncidentRouter(db));
  app.use('/api/social', createSocialRouter(db, resolvedXService));

  // Ensure unknown /api routes return JSON 404 instead of SPA fallback
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Ruta API no encontrada.' });
  });

  // Serve Vite production frontend build (dist/) after all /api routes
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const distCandidates = [
    path.resolve(__dirname, '../../dist'),
    path.resolve(__dirname, '../../../dist'),
    path.resolve(process.cwd(), 'dist')
  ];
  const distDir =
    distCandidates.find(candidate => fs.existsSync(path.join(candidate, 'index.html'))) ||
    distCandidates[2];

  if (fs.existsSync(distDir)) {
    app.use(express.static(distDir));
  }

  // React SPA routing fallback for any route not starting with /api
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) {
      next();
      return;
    }

    const indexPath = path.join(distDir, 'index.html');
    if (!fs.existsSync(indexPath)) {
      next();
      return;
    }

    res.sendFile(indexPath);
  });

  return app;
}
