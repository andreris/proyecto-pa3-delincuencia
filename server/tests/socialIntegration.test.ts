import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createDatabase } from '../src/db/index.js';
import { createApp } from '../src/app.js';
import { issueSessionToken } from '../src/middleware/auth.js';
import { XService, FetchLike } from '../src/services/xService.js';
import { applyRetentionPolicy } from '../src/services/retentionService.js';

async function startTestServer(fetchMock?: FetchLike) {
  const db = await createDatabase(':memory:');
  const xService = new XService({ fetchImpl: fetchMock });
  const app = createApp({ db, xService });
  const server = http.createServer(app);

  await new Promise<void>(resolve => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const baseUrl = `http://127.0.0.1:${address.port}`;

  return {
    db,
    baseUrl,
    close: async () => {
      await new Promise<void>(resolve => server.close(() => resolve()));
      await db.close();
    }
  };
}

test('Deduplicación por external_post_id y sanitización en sincronización X API v2', async () => {
  const originalToken = process.env.X_BEARER_TOKEN;
  const originalCooldown = process.env.X_SYNC_COOLDOWN_MINUTES;
  process.env.X_BEARER_TOKEN = 'test-bearer-token-only-in-server';
  process.env.X_SYNC_COOLDOWN_MINUTES = '0';

  let callCount = 0;
  const mockFetch: FetchLike = async () => {
    callCount += 1;
    return {
      ok: true,
      status: 200,
      headers: {
        get: (name: string) => {
          if (name === 'x-rate-limit-remaining') return '179';
          return null;
        }
      },
      json: async () => ({
        data: [
          {
            id: '190000000001',
            text: '<script>alert(1)</script> Reportan asalto cerca de Av. Túpac Amaru en Comas.',
            created_at: '2026-11-19T12:00:00.000Z',
            lang: 'es'
          },
          {
            id: '190000000002',
            text: 'Posible extorsión a bodegas en San Juan de Lurigancho.',
            created_at: '2026-11-19T13:00:00.000Z',
            lang: 'es'
          }
        ],
        meta: { result_count: 2 }
      })
    };
  };

  const { baseUrl, close } = await startTestServer(mockFetch);

  try {
    const modToken = issueSessionToken({
      uid: 'mod-1',
      name: 'Oficial María Huamán',
      email: 'moderacion@vigila.pe',
      role: 'moderator'
    });

    // First sync: imports 2 unique posts
    const sync1 = await fetch(`${baseUrl}/api/social/x/sync`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${modToken}` }
    });
    assert.equal(sync1.status, 200);
    const data1 = (await sync1.json()) as {
      result: { importedCount: number; duplicatesSkipped: number; importedPosts: Array<{ text: string; suggestedDistrict?: string }> };
    };
    assert.equal(data1.result.importedCount, 2);
    assert.equal(data1.result.duplicatesSkipped, 0);
    assert.equal(data1.result.importedPosts[0].text.includes('<script>'), false);
    assert.equal(data1.result.importedPosts[0].suggestedDistrict, 'Comas');

    // Second sync with same external IDs: 0 imported, 2 duplicates skipped
    const sync2 = await fetch(`${baseUrl}/api/social/x/sync`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${modToken}` }
    });
    assert.equal(sync2.status, 200);
    const data2 = (await sync2.json()) as {
      result: { importedCount: number; duplicatesSkipped: number };
    };
    assert.equal(data2.result.importedCount, 0);
    assert.equal(data2.result.duplicatesSkipped, 2);
    assert.equal(callCount, 2);
  } finally {
    if (originalToken === undefined) delete process.env.X_BEARER_TOKEN;
    else process.env.X_BEARER_TOKEN = originalToken;
    if (originalCooldown === undefined) delete process.env.X_SYNC_COOLDOWN_MINUTES;
    else process.env.X_SYNC_COOLDOWN_MINUTES = originalCooldown;
    await close();
  }
});

test('Autorización de moderador: rechaza usuarios sin sesión (401) y usuarios comunes (403)', async () => {
  const { baseUrl, close } = await startTestServer();

  try {
    const userToken = issueSessionToken({
      uid: 'usr-1',
      name: 'Jorge Quispe',
      email: 'jorge@taxi.pe',
      role: 'user'
    });

    // Unauthenticated sync -> 401
    const unauthRes = await fetch(`${baseUrl}/api/social/x/sync`, { method: 'POST' });
    assert.equal(unauthRes.status, 401);

    // Common user sync -> 403
    const userSyncRes = await fetch(`${baseUrl}/api/social/x/sync`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${userToken}` }
    });
    assert.equal(userSyncRes.status, 403);

    // Common user list social posts -> 403
    const userPostsRes = await fetch(`${baseUrl}/api/social/posts`, {
      headers: { Authorization: `Bearer ${userToken}` }
    });
    assert.equal(userPostsRes.status, 403);

    // Common user update search query -> 403
    const userConfigRes = await fetch(`${baseUrl}/api/social/config`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${userToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ searchQuery: 'asalto lima lang:es' })
    });
    assert.equal(userConfigRes.status, 403);
  } finally {
    await close();
  }
});

test('Creación de IncidentReport desde SocialPost requiere confirmación humana y no aparece en mapa público hasta ser Verificado', async () => {
  const originalToken = process.env.X_BEARER_TOKEN;
  process.env.X_BEARER_TOKEN = 'test-token-x';

  const mockFetch: FetchLike = async () => ({
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: async () => ({
      data: [
        {
          id: '190000000099',
          text: 'Reportan robo de autopartes en Miraflores cerca de Av. Larco.',
          created_at: '2026-11-19T14:00:00.000Z',
          lang: 'es'
        }
      ],
      meta: { result_count: 1 }
    })
  });

  const { db, baseUrl, close } = await startTestServer(mockFetch);

  try {
    const modToken = issueSessionToken({
      uid: 'mod-1',
      name: 'Oficial María Huamán',
      email: 'moderacion@vigila.pe',
      role: 'moderator'
    });

    // Sync 1 post
    await fetch(`${baseUrl}/api/social/x/sync`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${modToken}` }
    });

    const postsRes = await fetch(`${baseUrl}/api/social/posts`, {
      headers: { Authorization: `Bearer ${modToken}` }
    });
    const postsJson = (await postsRes.json()) as { posts: Array<{ id: string }> };
    assert.equal(postsJson.posts.length, 1);
    const postId = postsJson.posts[0].id;

    // Attempting create_report without confirming district fails (400)
    const missingDistrictRes = await fetch(`${baseUrl}/api/social/posts/${postId}/review`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${modToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ action: 'create_report' })
    });
    assert.equal(missingDistrictRes.status, 400);

    // Moderator confirms district and creates IncidentReport
    const createRes = await fetch(`${baseUrl}/api/social/posts/${postId}/review`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${modToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        action: 'create_report',
        district: 'Miraflores',
        category: 'robo',
        riskLevel: 'medio',
        title: 'Posible robo de autopartes en Miraflores',
        approxAddress: 'Av. José Larco (zona referencial)'
      })
    });
    assert.equal(createRes.status, 200);
    const createdJson = (await createRes.json()) as {
      createdIncident: { id: string; status: string; evidenceNote: string; source: string; sourceUrl: string };
    };
    assert.equal(createdJson.createdIncident.status, 'Pendiente de validación');
    assert.equal(createdJson.createdIncident.source, 'x');
    assert.ok(createdJson.createdIncident.evidenceNote.includes('Fuente externa: X'));
    assert.ok(createdJson.createdIncident.sourceUrl.includes('190000000099'));

    // Public map endpoint MUST NOT expose unverified X-sourced incident
    const publicBeforeRes = await fetch(`${baseUrl}/api/incidents`);
    const publicBeforeJson = (await publicBeforeRes.json()) as { incidents: Array<{ id: string }> };
    assert.equal(
      publicBeforeJson.incidents.some(i => i.id === createdJson.createdIncident.id),
      false
    );

    // Moderator verifies the IncidentReport
    const verifyRes = await fetch(
      `${baseUrl}/api/incidents/${createdJson.createdIncident.id}/review`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${modToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status: 'Verificado' })
      }
    );
    assert.equal(verifyRes.status, 200);

    // Now public map endpoint INCLUDES the verified X-sourced incident
    const publicAfterRes = await fetch(`${baseUrl}/api/incidents`);
    const publicAfterJson = (await publicAfterRes.json()) as { incidents: Array<{ id: string }> };
    assert.equal(
      publicAfterJson.incidents.some(i => i.id === createdJson.createdIncident.id),
      true
    );

    // Verify retention policy deletes discarded posts older than 30 days
    const oldIso = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString();
    await db.execute(
      `INSERT INTO social_posts (
        id, platform, external_post_id, post_url, text, published_at, imported_at,
        query_used, status, suggested_category, suggested_risk_level, reviewed_at
      ) VALUES ('SOC-OLD-1', 'x', '9999999', 'https://x.com/i/web/status/9999999', 'Post antiguo', ?, ?, 'q', 'Descartado', 'otro', 'informativo', ?)`,
      [oldIso, oldIso, oldIso]
    );
    const retentionOutcome = await applyRetentionPolicy(db, 30);
    assert.equal(retentionOutcome.purgedCount, 1);
  } finally {
    if (originalToken === undefined) delete process.env.X_BEARER_TOKEN;
    else process.env.X_BEARER_TOKEN = originalToken;
    await close();
  }
});

test('Sirve dist/index.html para rutas SPA sin interceptar rutas /api', async () => {
  const { baseUrl, close } = await startTestServer();

  try {
    // /api/health always responds JSON and is never intercepted by static/SPA
    const healthRes = await fetch(`${baseUrl}/api/health`);
    assert.equal(healthRes.status, 200);
    assert.ok((healthRes.headers.get('content-type') || '').includes('application/json'));
    const healthJson = (await healthRes.json()) as { ok: boolean; service: string };
    assert.equal(healthJson.ok, true);
    assert.equal(healthJson.service, 'vigila-pe-api');

    // Unknown /api/* routes return JSON 404 instead of index.html
    const api404Res = await fetch(`${baseUrl}/api/ruta-inexistente`);
    assert.equal(api404Res.status, 404);
    assert.ok((api404Res.headers.get('content-type') || '').includes('application/json'));

    // Non-/api route serves dist/index.html when dist build exists
    const spaRes = await fetch(`${baseUrl}/moderacion/fuentes-sociales`);
    assert.equal(spaRes.status, 200);
    assert.ok((spaRes.headers.get('content-type') || '').includes('text/html'));
    const html = await spaRes.text();
    assert.ok(html.includes('<div id="root"></div>'));
  } finally {
    await close();
  }
});

test('Límite estricto X: máximo 10 posts, una sola solicitud sin paginación y bloqueo de 60 minutos', async () => {
  const originalToken = process.env.X_BEARER_TOKEN;
  const originalMaxPosts = process.env.X_SYNC_MAX_POSTS;
  const originalCooldown = process.env.X_SYNC_COOLDOWN_MINUTES;
  process.env.X_BEARER_TOKEN = 'test-bearer-token-limits';
  // Even if someone tries to configure > 10, server strictly caps at 10
  process.env.X_SYNC_MAX_POSTS = '50';
  process.env.X_SYNC_COOLDOWN_MINUTES = '60';

  const requestedUrls: string[] = [];
  const mockFetch: FetchLike = async input => {
    requestedUrls.push(String(input));
    // Simulate upstream returning 15 tweets AND a next_token pagination cursor
    const data = Array.from({ length: 15 }, (_, idx) => ({
      id: `1950000000${String(idx + 1).padStart(2, '0')}`,
      text: `Reporte ciudadano #${idx + 1} de robo en Lima Cercado.`,
      created_at: '2026-11-19T15:00:00.000Z',
      lang: 'es'
    }));
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({
        data,
        meta: {
          result_count: 15,
          next_token: 'NEXT_PAGE_SHOULD_NOT_BE_FETCHED'
        }
      })
    };
  };

  const { baseUrl, close } = await startTestServer(mockFetch);

  try {
    const modToken = issueSessionToken({
      uid: 'mod-limits',
      name: 'Moderador Limites',
      email: 'moderacion@vigila.pe',
      role: 'moderator'
    });

    // First sync succeeds: strictly 1 X API call, max_results=10, and <= 10 imported
    const firstSyncRes = await fetch(`${baseUrl}/api/social/x/sync`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${modToken}` }
    });
    assert.equal(firstSyncRes.status, 200);
    const firstJson = (await firstSyncRes.json()) as {
      result: {
        fetchedCount: number;
        importedCount: number;
        maxPostsLimit: number;
        nextAllowedSyncAt: string;
      };
    };

    // (b) Single request / single page only, with max_results=10 and no next_token
    assert.equal(requestedUrls.length, 1);
    const parsedUrl = new URL(requestedUrls[0]);
    assert.equal(parsedUrl.searchParams.get('max_results'), '10');
    assert.equal(parsedUrl.searchParams.get('next_token'), null);

    // (a) Strict max 10 posts imported/returned
    assert.equal(firstJson.result.maxPostsLimit, 10);
    assert.equal(firstJson.result.fetchedCount, 10);
    assert.equal(firstJson.result.importedCount, 10);
    assert.ok(firstJson.result.nextAllowedSyncAt);

    // (c) Immediate second sync within 60 minutes is blocked with 429 and clear message
    const secondSyncRes = await fetch(`${baseUrl}/api/social/x/sync`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${modToken}` }
    });
    assert.equal(secondSyncRes.status, 429);
    const secondJson = (await secondSyncRes.json()) as {
      code: string;
      error: string;
      nextAllowedSyncAt: string;
    };
    assert.equal(secondJson.code, 'X_SYNC_COOLDOWN');
    assert.ok(secondJson.error.includes('60 minutos'));
    assert.ok(secondJson.nextAllowedSyncAt);
    // Ensure X API was NOT called a second time during cooldown
    assert.equal(requestedUrls.length, 1);
  } finally {
    if (originalToken === undefined) delete process.env.X_BEARER_TOKEN;
    else process.env.X_BEARER_TOKEN = originalToken;
    if (originalMaxPosts === undefined) delete process.env.X_SYNC_MAX_POSTS;
    else process.env.X_SYNC_MAX_POSTS = originalMaxPosts;
    if (originalCooldown === undefined) delete process.env.X_SYNC_COOLDOWN_MINUTES;
    else process.env.X_SYNC_COOLDOWN_MINUTES = originalCooldown;
    await close();
  }
});

test('Autorización de moderador con código MODERATOR_ACCESS_CODE en POST /api/auth/session', async () => {
  const originalCode = process.env.MODERATOR_ACCESS_CODE;
  process.env.MODERATOR_ACCESS_CODE = 'VIGILA-MOD-TEST-99';

  const { baseUrl, close } = await startTestServer();

  try {
    // Missing or wrong code -> 403 "Código de moderador inválido"
    const invalidRes = await fetch(`${baseUrl}/api/auth/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uid: 'usr-100',
        name: 'Usuario Común',
        email: 'usuario@vigila.pe',
        role: 'moderator',
        moderatorCode: 'CODIGO-INCORRECTO'
      })
    });
    assert.equal(invalidRes.status, 403);
    const invalidJson = (await invalidRes.json()) as { error: string };
    assert.equal(invalidJson.error, 'Código de moderador inválido');

    // Empty code -> 403
    const emptyRes = await fetch(`${baseUrl}/api/auth/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uid: 'usr-100',
        name: 'Usuario Común',
        email: 'moderacion@vigila.pe',
        role: 'moderator'
      })
    });
    assert.equal(emptyRes.status, 403);

    // Valid MODERATOR_ACCESS_CODE -> 200 + token accepted on protected /api/social/status
    const validRes = await fetch(`${baseUrl}/api/auth/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uid: 'usr-100',
        name: 'Moderador Autorizado',
        email: 'usuario@vigila.pe',
        role: 'moderator',
        moderatorCode: 'VIGILA-MOD-TEST-99'
      })
    });
    assert.equal(validRes.status, 200);
    const validJson = (await validRes.json()) as {
      token: string;
      user: { role: string };
    };
    assert.equal(validJson.user.role, 'moderator');
    assert.ok(validJson.token);

    const statusRes = await fetch(`${baseUrl}/api/social/status`, {
      headers: { Authorization: `Bearer ${validJson.token}` }
    });
    assert.equal(statusRes.status, 200);
    const statusJson = (await statusRes.json()) as { maxPostsPerSync: number; cooldownMinutes: number };
    assert.equal(statusJson.maxPostsPerSync, 10);
    assert.equal(statusJson.cooldownMinutes, 60);
  } finally {
    if (originalCode === undefined) delete process.env.MODERATOR_ACCESS_CODE;
    else process.env.MODERATOR_ACCESS_CODE = originalCode;
    await close();
  }
});
