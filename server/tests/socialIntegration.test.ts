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

test('Consulta de X válida sin error de paréntesis y con distritos permitidos de Lima y Callao', async () => {
  const {
    ALLOWED_SOCIAL_DISTRICTS,
    buildXRecentSearchQuery,
    hasBalancedParentheses
  } = await import('../src/utils/sanitize.js');

  // Default query includes all 11 allowed districts and balanced parentheses
  const defaultQuery = buildXRecentSearchQuery();
  assert.equal(hasBalancedParentheses(defaultQuery), true);
  assert.ok(defaultQuery.includes('lang:es -is:retweet'));
  for (const district of ALLOWED_SOCIAL_DISTRICTS) {
    assert.ok(defaultQuery.includes(district), `Debe incluir ${district}`);
  }

  // Single selected district query
  const singleDistrictQuery = buildXRecentSearchQuery(['San Juan de Lurigancho']);
  assert.equal(hasBalancedParentheses(singleDistrictQuery), true);
  assert.ok(singleDistrictQuery.includes('("San Juan de Lurigancho")'));
  assert.equal(singleDistrictQuery.includes('Miraflores'), false);

  // Malformed custom base keywords with unbalanced parens are safely sanitized
  const recoveredQuery = buildXRecentSearchQuery(['Comas', 'Callao'], '(robo OR asalto');
  assert.equal(hasBalancedParentheses(recoveredQuery), true);
  assert.ok(recoveredQuery.includes('(Comas OR Callao)'));
});

test('Validación obligatoria de X: acepta Comas válido y descarta Honduras, sin distrito y retuits; filtra por distrito y rango de fechas', async () => {
  const originalToken = process.env.X_BEARER_TOKEN;
  const originalCooldown = process.env.X_SYNC_COOLDOWN_MINUTES;
  process.env.X_BEARER_TOKEN = 'test-bearer-token-lima-callao';
  process.env.X_SYNC_COOLDOWN_MINUTES = '0';

  const now = Date.now();
  const daysAgoIso = (days: number) => new Date(now - days * 24 * 60 * 60 * 1000).toISOString();
  const dateOnlyDaysAgo = (days: number) => daysAgoIso(days).slice(0, 10);

  const requestedUrls: string[] = [];
  const mockFetch: FetchLike = async input => {
    requestedUrls.push(String(input));
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({
        data: [
          {
            // 1. Post de Comas con fecha válida -> aceptado y pendiente
            id: '200000000001',
            text: 'Vecinos alertan de robo al paso en paradero de Comas hace unos minutos.',
            created_at: daysAgoIso(1),
            lang: 'es'
          },
          {
            // 2. Post de Honduras -> descartado automáticamente
            id: '200000000002',
            text: 'Reportan asalto armado en Tegucigalpa, Honduras cerca del bulevar.',
            created_at: daysAgoIso(1),
            lang: 'es'
          },
          {
            // 3. Post sin distrito -> descartado automáticamente
            id: '200000000003',
            text: 'Hubo un robo muy fuerte hoy en la madrugada, tengan cuidado.',
            created_at: daysAgoIso(1),
            lang: 'es'
          },
          {
            // 4. Retuit -> descartado automáticamente aunque mencione Miraflores
            id: '200000000004',
            text: 'RT @alerta_lima: Asalto en avenida principal de Miraflores.',
            created_at: daysAgoIso(1),
            lang: 'es',
            referenced_tweets: [{ type: 'retweeted', id: '199999999999' }]
          },
          {
            // 5. Post válido de Callao con fecha más antigua (5 días atrás) para probar filtro de fechas
            id: '200000000005',
            text: 'Extorsión denunciada por comerciantes cerca del puerto del Callao.',
            created_at: daysAgoIso(5),
            lang: 'es'
          }
        ],
        meta: { result_count: 5 }
      })
    };
  };

  const { baseUrl, close } = await startTestServer(mockFetch);

  try {
    const modToken = issueSessionToken({
      uid: 'mod-filter-1',
      name: 'Moderadora Lima',
      email: 'moderacion@vigila.pe',
      role: 'moderator'
    });

    // Invalid date range (dateFrom > dateTo) is rejected with 400
    const badRangeRes = await fetch(`${baseUrl}/api/social/config`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${modToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        filterDistricts: ['Comas'],
        filterDateFrom: dateOnlyDaysAgo(1),
        filterDateTo: dateOnlyDaysAgo(4)
      })
    });
    assert.equal(badRangeRes.status, 400);

    // Sync all districts without date cutoff so all 5 posts are evaluated
    const syncRes = await fetch(`${baseUrl}/api/social/x/sync`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${modToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ districts: [] })
    });
    assert.equal(syncRes.status, 200);
    const syncJson = (await syncRes.json()) as {
      result: {
        fetchedCount: number;
        importedCount: number;
        discardedCount: number;
        queryUsed: string;
        importedPosts: Array<{
          externalPostId: string;
          status: string;
          state: string;
          source: string;
          detectedDistrict: string;
        }>;
        discardedPosts: Array<{
          externalPostId: string;
          status: string;
          reviewReason?: string;
          detectedDistrict: string;
        }>;
      };
      stats: { total: number; pending: number; verified: number; discarded: number };
    };

    assert.equal(syncJson.result.fetchedCount, 5);
    assert.equal(syncJson.result.importedCount, 2); // Comas + Callao
    assert.equal(syncJson.result.discardedCount, 3); // Honduras + Sin distrito + Retuit
    assert.equal(syncJson.stats.pending, 2);
    assert.equal(syncJson.stats.discarded, 3);

    // Post de Comas accepted & pending_validation
    const comasPost = syncJson.result.importedPosts.find(p => p.externalPostId === '200000000001');
    assert.ok(comasPost);
    assert.equal(comasPost.status, 'Pendiente de validación');
    assert.equal(comasPost.state, 'pending_validation');
    assert.equal(comasPost.source, 'x');
    assert.equal(comasPost.detectedDistrict, 'Comas');

    // Honduras, Sin distrito, Retuit discarded with explicit reasons
    const hondurasPost = syncJson.result.discardedPosts.find(p => p.externalPostId === '200000000002');
    assert.ok(hondurasPost?.reviewReason?.includes('Honduras'));
    const noDistrictPost = syncJson.result.discardedPosts.find(p => p.externalPostId === '200000000003');
    assert.equal(noDistrictPost?.detectedDistrict, 'Sin distrito');
    assert.ok(noDistrictPost?.reviewReason?.includes('distrito permitido'));
    const rtPost = syncJson.result.discardedPosts.find(p => p.externalPostId === '200000000004');
    assert.ok(rtPost?.reviewReason?.includes('Retuit'));

    // Single district filter (Comas) -> returns ONLY Comas
    const comasOnlyRes = await fetch(`${baseUrl}/api/social/posts?districts=Comas`, {
      headers: { Authorization: `Bearer ${modToken}` }
    });
    assert.equal(comasOnlyRes.status, 200);
    const comasOnlyJson = (await comasOnlyRes.json()) as {
      posts: Array<{ externalPostId: string; detectedDistrict: string }>;
    };
    assert.equal(comasOnlyJson.posts.length, 1);
    assert.equal(comasOnlyJson.posts[0].detectedDistrict, 'Comas');

    // Date range filter excludes 5-day-old Callao post
    const recentOnlyRes = await fetch(
      `${baseUrl}/api/social/posts?dateFrom=${dateOnlyDaysAgo(2)}&dateTo=${dateOnlyDaysAgo(0)}`,
      { headers: { Authorization: `Bearer ${modToken}` } }
    );
    assert.equal(recentOnlyRes.status, 200);
    const recentOnlyJson = (await recentOnlyRes.json()) as {
      posts: Array<{ externalPostId: string }>;
    };
    assert.equal(
      recentOnlyJson.posts.some(p => p.externalPostId === '200000000005'),
      false
    );
    assert.equal(
      recentOnlyJson.posts.some(p => p.externalPostId === '200000000001'),
      true
    );

    // "Sin distrito" filter returns ONLY discarded posts without district (never eligible for report)
    const noDistFilterRes = await fetch(
      `${baseUrl}/api/social/posts?districts=${encodeURIComponent('Sin distrito')}`,
      { headers: { Authorization: `Bearer ${modToken}` } }
    );
    const noDistFilterJson = (await noDistFilterRes.json()) as {
      posts: Array<{ id: string; status: string; detectedDistrict: string }>;
    };
    assert.ok(noDistFilterJson.posts.length >= 1);
    assert.ok(noDistFilterJson.posts.every(p => p.status === 'Descartado'));

    // Attempting create_report on discarded post fails with 400
    const discardedId = noDistFilterJson.posts[0].id;
    const createFromDiscarded = await fetch(`${baseUrl}/api/social/posts/${discardedId}/review`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${modToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ action: 'create_report', district: 'Comas' })
    });
    assert.equal(createFromDiscarded.status, 400);

    // Sync with specific district + date range builds filtered X query + start_time/end_time
    await fetch(`${baseUrl}/api/social/x/sync`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${modToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        districts: ['Comas'],
        dateFrom: dateOnlyDaysAgo(2),
        dateTo: dateOnlyDaysAgo(0)
      })
    });
    const lastUrl = new URL(requestedUrls[requestedUrls.length - 1]);
    assert.ok((lastUrl.searchParams.get('query') || '').includes('(Comas)'));
    assert.ok(lastUrl.searchParams.get('start_time'));
    assert.ok(lastUrl.searchParams.get('end_time'));

    // Audit log records consultadas, importadas, descartadas and motivos
    const auditRes = await fetch(`${baseUrl}/api/social/audit`, {
      headers: { Authorization: `Bearer ${modToken}` }
    });
    const auditJson = (await auditRes.json()) as { logs: Array<{ actionType: string; details: string }> };
    const syncAudit = auditJson.logs.find(
      l =>
        l.actionType === 'x_sync' &&
        l.details.includes('5 consultadas') &&
        l.details.includes('2 importadas') &&
        l.details.includes('3 descartadas')
    );
    assert.ok(syncAudit);
  } finally {
    if (originalToken === undefined) delete process.env.X_BEARER_TOKEN;
    else process.env.X_BEARER_TOKEN = originalToken;
    if (originalCooldown === undefined) delete process.env.X_SYNC_COOLDOWN_MINUTES;
    else process.env.X_SYNC_COOLDOWN_MINUTES = originalCooldown;
    await close();
  }
});
