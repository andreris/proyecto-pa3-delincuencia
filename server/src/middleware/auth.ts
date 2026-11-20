import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { AuthenticatedUser } from '../types.js';

const EPHEMERAL_SECRET = crypto.randomBytes(32).toString('hex');

function getSessionSecret(): string {
  return (process.env.SESSION_SECRET || '').trim() || EPHEMERAL_SECRET;
}

export interface SignedTokenPayload extends AuthenticatedUser {
  exp: number;
}

export interface AuthenticatedRequest extends Request {
  authUser?: AuthenticatedUser;
}

export function issueSessionToken(user: AuthenticatedUser, ttlSeconds = 60 * 60 * 12): string {
  const payload: SignedTokenPayload = {
    uid: user.uid,
    name: user.name,
    email: user.email,
    role: user.role,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds
  };

  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = crypto
    .createHmac('sha256', getSessionSecret())
    .update(encoded)
    .digest('base64url');

  return `${encoded}.${signature}`;
}

export function verifySessionToken(token: string): AuthenticatedUser | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [encoded, signature] = parts;
  if (!encoded || !signature) return null;

  const expectedSig = crypto
    .createHmac('sha256', getSessionSecret())
    .update(encoded)
    .digest('base64url');

  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as SignedTokenPayload;
    if (!parsed.uid || !parsed.role || typeof parsed.exp !== 'number') {
      return null;
    }
    if (parsed.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    if (parsed.role !== 'user' && parsed.role !== 'moderator') {
      return null;
    }
    return {
      uid: parsed.uid,
      name: parsed.name || 'Ciudadano',
      email: parsed.email || '',
      role: parsed.role
    };
  } catch {
    return null;
  }
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      error: 'Autenticación requerida. Inicia sesión para continuar.'
    });
    return;
  }

  const token = authHeader.slice('Bearer '.length).trim();
  const user = verifySessionToken(token);
  if (!user) {
    res.status(401).json({
      error: 'Sesión inválida o expirada. Vuelve a iniciar sesión.'
    });
    return;
  }

  req.authUser = user;
  next();
}

export function requireModerator(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.authUser) {
    res.status(401).json({ error: 'Autenticación requerida.' });
    return;
  }

  if (req.authUser.role !== 'moderator') {
    res.status(403).json({
      error: 'Acceso denegado: solo los moderadores autorizados pueden gestionar fuentes sociales o moderar reportes.'
    });
    return;
  }

  next();
}
