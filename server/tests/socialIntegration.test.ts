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
  process.env.X_BEARER_TOKEN = 'test-bearer-token-only-in-server';

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
