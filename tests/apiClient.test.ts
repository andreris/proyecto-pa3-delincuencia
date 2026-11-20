import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createDatabase } from '../server/src/db/index.js';
import { createApp } from '../server/src/app.js';
import {
  authenticateModeratorSession,
  buildApiUrl,
  clearBackendSession,
  ensureBackendSession,
  fetchSocialStatus,
  normalizeApiBaseUrl
} from '../src/services/apiClient.js';

test('URL same-origin sin /api/api para VITE_API_BASE_URL vacío, /api y dominio Render', () => {
  assert.equal(normalizeApiBaseUrl(''), '');
  assert.equal(normalizeApiBaseUrl('/'), '');
  assert.equal(normalizeApiBaseUrl('/api'), '');
  assert.equal(normalizeApiBaseUrl('/api/'), '');
  assert.equal(normalizeApiBaseUrl('http://localhost:4000/'), 'http://localhost:4000');
  assert.equal(normalizeApiBaseUrl('https://vigila.onrender.com/api'), 'https://vigila.onrender.com');

  assert.equal(buildApiUrl('/api/health', ''), '/api/health');
  assert.equal(buildApiUrl('/api/health', '/api'), '/api/health');
  assert.equal(buildApiUrl('/api/auth/session', '/api'), '/api/auth/session');
  assert.equal(buildApiUrl('/api/social/posts', '/api/'), '/api/social/posts');
  assert.equal(
    buildApiUrl('/api/social/x/sync', 'https://vigila.onrender.com/api'),
    'https://vigila.onrender.com/api/social/x/sync'
  );
  assert.equal(
    buildApiUrl('/api/health', 'http://localhost:4000'),
    'http://localhost:4000/api/health'
  );
});

test('ensureBackendSession y authenticateModeratorSession usan same-origin y envían Authorization Bearer a rutas protegidas', async () => {
  const originalCode = process.env.MODERATOR_ACCESS_CODE;
  process.env.MODERATOR_ACCESS_CODE = 'MOD-SAME-ORIGIN-2026';

  const db = await createDatabase(':memory:');
  const app = createApp({ db });
  const server = http.createServer(app);

  await new Promise<void>(resolve => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const origin = `http://127.0.0.1:${address.port}`;

  const originalFetch = globalThis.fetch;
  const capturedCalls: Array<{ url: string; authHeader: string | null }> = [];
  clearBackendSession();

  const demoUser = {
    uid: 'usr-same-origin',
    name: 'Ciudadano Prueba',
    email: 'ciudadano@vigila.pe',
    district: 'Miraflores',
    userType: 'peaton' as const,
    role: 'user' as const,
    avatarInitials: 'CP',
    joinedDate: '2026-01-01'
  };

  try {
    globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      const urlStr = typeof input === 'string' ? input : input.toString();
      const headers = new Headers(init?.headers);
      capturedCalls.push({
        url: urlStr,
        authHeader: headers.get('Authorization')
      });
      const target = urlStr.startsWith('/') ? `${origin}${urlStr}` : urlStr;
      return originalFetch(target, init);
    };

    // 1. ensureBackendSession works same-origin (/api/auth/session) without VITE_API_BASE_URL
    const userToken = await ensureBackendSession(demoUser);
    assert.ok(userToken, 'Debe obtener token de sesión vía same-origin /api/auth/session');
    assert.equal(capturedCalls[0].url, '/api/auth/session');

    // 2. authenticateModeratorSession sends moderatorCode and receives moderator token
    const modSession = await authenticateModeratorSession(demoUser, 'MOD-SAME-ORIGIN-2026');
    assert.equal(modSession.user.role, 'moderator');
    assert.equal(capturedCalls[1].url, '/api/auth/session');

    // 3. fetchSocialStatus invokes /api/social/status with Authorization: Bearer <token>
    const status = await fetchSocialStatus({ ...demoUser, role: 'moderator' });
    const statusCall = capturedCalls[2];
    assert.equal(statusCall.url, '/api/social/status');
    assert.equal(statusCall.authHeader, `Bearer ${modSession.token}`);
    assert.equal(status.maxPostsPerSync, 10);
    assert.equal(status.cooldownMinutes, 60);
  } finally {
    globalThis.fetch = originalFetch;
    clearBackendSession();
    if (originalCode === undefined) delete process.env.MODERATOR_ACCESS_CODE;
    else process.env.MODERATOR_ACCESS_CODE = originalCode;
    await new Promise<void>(resolve => server.close(() => resolve()));
    await db.close();
  }
});
