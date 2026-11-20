import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createDatabase } from '../src/db/index.js';
import { createApp } from '../src/app.js';
import { issueSessionToken } from '../src/middleware/auth.js';
import { XService, FetchLike } from '../src/services/xService.js';
import { GeocoderService, GeocodeFetchLike } from '../src/services/geocoderService.js';
import { applyRetentionPolicy } from '../src/services/retentionService.js';

function createDefaultMockGeocoder(): GeocoderService {
  return new GeocoderService({
    customGeocoder: async (query, district) => {
      const q = query.toLowerCase();
      if (q.includes('tupac amaru')) {
        return {
          accepted: true,
          latitude: -11.9341,
          longitude: -77.0539,
          locationLabel: 'Av. Túpac Amaru, Comas, Lima',
          countryCode: 'pe',
          provinceOrState: 'Lima',
          district: district || 'Comas',
          confidence: 'high'
        };
      }
      if (q.includes('larco')) {
        return {
          accepted: true,
          latitude: -12.1219,
          longitude: -77.0297,
          locationLabel: 'Av. José Larco, Miraflores, Lima',
          countryCode: 'pe',
          provinceOrState: 'Lima',
          district: district || 'Miraflores',
          confidence: 'high'
        };
      }
      if (q.includes('carretera central')) {
        return {
          accepted: true,
          latitude: -12.0285,
          longitude: -76.9154,
          locationLabel: 'Av. Carretera Central, Ate, Lima',
          countryCode: 'pe',
          provinceOrState: 'Lima',
          district: district || 'Ate',
          confidence: 'high'
        };
      }
      if (q.includes('proceres')) {
        return {
          accepted: true,
          latitude: -11.9869,
          longitude: -77.0046,
          locationLabel: 'Av. Próceres de la Independencia, San Juan de Lurigancho, Lima',
          countryCode: 'pe',
          provinceOrState: 'Lima',
          district: district || 'San Juan de Lurigancho',
          confidence: 'high'
        };
      }
      if (q.includes('javier prado')) {
        return {
          accepted: true,
          latitude: -12.0885,
          longitude: -77.0012,
          locationLabel: 'Av. Javier Prado Este, San Borja, Lima',
          countryCode: 'pe',
          provinceOrState: 'Lima',
          district: district || 'San Borja',
          confidence: 'high'
        };
      }
      if (q.includes('reforma')) {
        return {
          accepted: false,
          countryCode: 'mx',
          isForeign: true,
          reason: 'País no confirmado: geocodificador devolvió país MX.'
        };
      }
      return null;
    }
  });
}

async function startTestServer(fetchMock?: FetchLike, geocoder?: GeocoderService) {
  const db = await createDatabase(':memory:');
  const xService = new XService({
    fetchImpl: fetchMock,
    geocoder: geocoder || createDefaultMockGeocoder()
  });
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
            text: 'Posible extorsión a bodegas en Av. Próceres de la Independencia, San Juan de Lurigancho, Lima.',
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

test('Consulta de X válida sin error de paréntesis y con distritos permitidos de Lima Metropolitana (sin Callao)', async () => {
  const {
    ALLOWED_SOCIAL_DISTRICTS,
    DEFAULT_X_QUERY_DISTRICTS,
    buildXRecentSearchQuery,
    hasBalancedParentheses,
    sanitizeAllowedDistricts
  } = await import('../src/utils/sanitize.js');

  // Callao is strictly excluded from allowed Lima Metropolitana districts
  assert.equal(ALLOWED_SOCIAL_DISTRICTS.includes('Callao' as never), false);
  assert.deepEqual(sanitizeAllowedDistricts(['Comas', 'Callao', 'Bellavista']), ['Comas']);

  // Default query includes core Lima Metropolitana districts, balanced parentheses, and <= 512 chars
  const defaultQuery = buildXRecentSearchQuery();
  assert.equal(hasBalancedParentheses(defaultQuery), true);
  assert.ok(defaultQuery.length <= 512);
  assert.ok(defaultQuery.includes('lang:es -is:retweet'));
  for (const district of DEFAULT_X_QUERY_DISTRICTS) {
    assert.ok(defaultQuery.includes(district), `Debe incluir ${district}`);
  }

  // Single selected district query
  const singleDistrictQuery = buildXRecentSearchQuery(['San Juan de Lurigancho']);
  assert.equal(hasBalancedParentheses(singleDistrictQuery), true);
  assert.ok(singleDistrictQuery.includes('("San Juan de Lurigancho")'));
  assert.equal(singleDistrictQuery.includes('Miraflores'), false);

  // Malformed custom base keywords with unbalanced parens are safely sanitized & Callao stripped
  const recoveredQuery = buildXRecentSearchQuery(['Comas', 'Miraflores', 'Callao'], '(robo OR asalto');
  assert.equal(hasBalancedParentheses(recoveredQuery), true);
  assert.ok(recoveredQuery.includes('(Comas OR Miraflores)'));
  assert.equal(recoveredQuery.includes('Callao'), false);
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
            // 5. Post válido de Ate con fecha más antigua (5 días atrás) para probar filtro de fechas
            id: '200000000005',
            text: 'Extorsión denunciada por comerciantes cerca de Av. Carretera Central en Ate, Lima.',
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
          isLimaValidated: boolean;
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
    assert.equal(syncJson.result.importedCount, 2); // Comas + Ate
    assert.equal(syncJson.result.discardedCount, 3); // Honduras + Sin distrito + Retuit
    assert.equal(syncJson.stats.pending, 2);
    assert.equal(syncJson.stats.discarded, 3);

    // Post de Comas accepted & pending_validation & Lima validated
    const comasPost = syncJson.result.importedPosts.find(p => p.externalPostId === '200000000001');
    assert.ok(comasPost);
    assert.equal(comasPost.status, 'Pendiente de validación');
    assert.equal(comasPost.state, 'pending_validation');
    assert.equal(comasPost.source, 'x');
    assert.equal(comasPost.detectedDistrict, 'Comas');
    assert.equal(comasPost.isLimaValidated, true);

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

    // Date range filter excludes 5-day-old Ate post
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

test('Geolocalización segura: exact_candidate con geocodificador, district_only sin coordenadas inventadas, rechazo de Callao/extranjero/ambiguo y ofuscación 200-500m', async () => {
  const originalToken = process.env.X_BEARER_TOKEN;
  const originalCooldown = process.env.X_SYNC_COOLDOWN_MINUTES;
  process.env.X_BEARER_TOKEN = 'test-bearer-geo';
  process.env.X_SYNC_COOLDOWN_MINUTES = '0';

  const mockFetch: FetchLike = async () => ({
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: async () => ({
      data: [
        {
          // 1. exact_candidate via street + district + geocoder PE/Lima
          id: '300000000001',
          text: 'Asalto a transeúnte en Av. Javier Prado Este cerca de estación en San Borja, Lima.',
          created_at: '2026-11-19T14:00:00.000Z',
          lang: 'es'
        },
        {
          // 2. district_only (valid Lima district + Peru evidence, NO street -> MUST NOT invent coords)
          id: '300000000002',
          text: 'Vecinos reportan aumento de robos durante la noche en Comas, Lima Metropolitana.',
          created_at: '2026-11-19T14:10:00.000Z',
          lang: 'es'
        },
        {
          // 3. Ambiguous bare district without Lima/Perú or local ref -> discarded
          id: '300000000003',
          text: 'Reportaron un robo fuerte en Miraflores hace unos minutos.',
          created_at: '2026-11-19T14:20:00.000Z',
          lang: 'es'
        },
        {
          // 4. Callao -> MUST be discarded (closed list excludes Callao)
          id: '300000000004',
          text: 'Asalto armado en Av. Sáenz Peña en el Callao, Perú.',
          created_at: '2026-11-19T14:30:00.000Z',
          lang: 'es'
        },
        {
          // 5. Foreign country detected by geocoder (MX) -> discarded
          id: '300000000005',
          text: 'Asalto reportado en Av. Reforma cerca de Miraflores.',
          created_at: '2026-11-19T14:40:00.000Z',
          lang: 'es'
        },
        {
          // 6. X public coordinates inside Lima Metropolitana -> candidate only (requires review)
          id: '300000000006',
          text: 'Alerta de robo en zona comercial de Miraflores.',
          created_at: '2026-11-19T14:50:00.000Z',
          lang: 'es',
          geo: {
            place_id: 'place-pe-1',
            coordinates: {
              type: 'Point',
              coordinates: [-77.0305, -12.121]
            }
          }
        },
        {
          // 7. Foreign X place (Colombia) -> discarded
          id: '300000000007',
          text: 'Robo en Av. Caracas en Miraflores.',
          created_at: '2026-11-19T14:55:00.000Z',
          lang: 'es',
          geo: {
            place_id: 'place-co-1'
          }
        }
      ],
      includes: {
        places: [
          {
            id: 'place-pe-1',
            country: 'Peru',
            country_code: 'PE',
            full_name: 'Miraflores, Lima',
            name: 'Miraflores'
          },
          {
            id: 'place-co-1',
            country: 'Colombia',
            country_code: 'CO',
            full_name: 'Bogotá, Colombia',
            name: 'Bogotá'
          }
        ]
      },
      meta: { result_count: 7 }
    })
  });

  const { baseUrl, close } = await startTestServer(mockFetch);

  const haversineMeters = (lat1: number, lng1: number, lat2: number, lng2: number) => {
    const R = 6371000;
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  try {
    const modToken = issueSessionToken({
      uid: 'mod-geo-1',
      name: 'Moderador Geo',
      email: 'moderacion@vigila.pe',
      role: 'moderator'
    });

    const syncRes = await fetch(`${baseUrl}/api/social/x/sync`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${modToken}` }
    });
    assert.equal(syncRes.status, 200);
    const syncJson = (await syncRes.json()) as {
      result: {
        importedCount: number;
        discardedCount: number;
        importedPosts: Array<{
          id: string;
          externalPostId: string;
          status: string;
          detectedDistrict: string;
          latitude: number | null;
          longitude: number | null;
          locationStatus: string;
          locationConfidence: string;
          locationSource: string;
          isLimaValidated: boolean;
        }>;
        discardedPosts: Array<{
          externalPostId: string;
          reviewReason?: string;
          locationStatus: string;
        }>;
      };
    };

    assert.equal(syncJson.result.importedCount, 3); // exact_candidate (#1), district_only (#2), x_coordinates (#6)
    assert.equal(syncJson.result.discardedCount, 4); // ambiguous (#3), Callao (#4), MX geocoder (#5), CO place (#7)

    // 1. Verify exact_candidate
    const exactPost = syncJson.result.importedPosts.find(p => p.externalPostId === '300000000001');
    assert.ok(exactPost);
    assert.equal(exactPost.status, 'Pendiente de validación');
    assert.equal(exactPost.locationStatus, 'exact_candidate');
    assert.equal(exactPost.locationConfidence, 'high');
    assert.equal(exactPost.locationSource, 'text_geocoded');
    assert.equal(exactPost.isLimaValidated, true);
    assert.equal(exactPost.latitude, -12.0885);
    assert.equal(exactPost.longitude, -77.0012);

    // 2. Verify district_only has NO invented coordinates
    const districtOnlyPost = syncJson.result.importedPosts.find(
      p => p.externalPostId === '300000000002'
    );
    assert.ok(districtOnlyPost);
    assert.equal(districtOnlyPost.locationStatus, 'district_only');
    assert.equal(districtOnlyPost.latitude, null);
    assert.equal(districtOnlyPost.longitude, null);
    assert.equal(districtOnlyPost.isLimaValidated, true);

    // 3. Verify X coordinates treated as candidate only (still pending review, NOT on public map)
    const xCoordPost = syncJson.result.importedPosts.find(p => p.externalPostId === '300000000006');
    assert.ok(xCoordPost);
    assert.equal(xCoordPost.status, 'Pendiente de validación');
    assert.equal(xCoordPost.locationStatus, 'exact_candidate');
    assert.equal(xCoordPost.locationSource, 'x_coordinates');

    const publicBefore = (await (await fetch(`${baseUrl}/api/incidents`)).json()) as {
      incidents: Array<{ sourceUrl?: string }>;
    };
    assert.equal(
      publicBefore.incidents.some(i => i.sourceUrl?.includes('300000000006')),
      false
    );

    // 4. Verify discarded reasons (ambiguous, Callao, foreign MX/CO)
    const ambiguous = syncJson.result.discardedPosts.find(p => p.externalPostId === '300000000003');
    assert.ok(ambiguous?.reviewReason?.includes('Distrito ambiguo'));
    const callao = syncJson.result.discardedPosts.find(p => p.externalPostId === '300000000004');
    assert.ok(callao?.reviewReason?.includes('Callao'));
    const mxPost = syncJson.result.discardedPosts.find(p => p.externalPostId === '300000000005');
    assert.ok(mxPost?.reviewReason?.includes('MX'));
    const coPost = syncJson.result.discardedPosts.find(p => p.externalPostId === '300000000007');
    assert.ok(coPost?.reviewReason?.includes('CO'));

    // 5. Moderator save_for_review on district_only keeps post pending and off public map
    const saveRes = await fetch(`${baseUrl}/api/social/posts/${districtOnlyPost.id}/review`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${modToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        action: 'save_for_review',
        district: 'Comas',
        latitude: -11.9361,
        longitude: -77.0532,
        confirmedLocationDescription: 'Cruce Av. Túpac Amaru con Av. Belaunde',
        movedManually: true
      })
    });
    assert.equal(saveRes.status, 200);
    const saveJson = (await saveRes.json()) as {
      post: { status: string; locationStatus: string; locationSource: string };
    };
    assert.equal(saveJson.post.status, 'Pendiente de validación');
    assert.equal(saveJson.post.locationStatus, 'moderator_confirmed');
    assert.equal(saveJson.post.locationSource, 'moderator_manual');

    // 6. Moderator approve_and_publish requires confirmedLocationDescription
    const missingDescRes = await fetch(`${baseUrl}/api/social/posts/${exactPost.id}/review`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${modToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        action: 'approve_and_publish',
        district: 'San Borja',
        latitude: -12.0885,
        longitude: -77.0012
      })
    });
    assert.equal(missingDescRes.status, 400);

    // 7. Successful approve_and_publish publishes Verified incident with 200-500m obfuscation & "Ubicación aproximada"
    const approveRes = await fetch(`${baseUrl}/api/social/posts/${exactPost.id}/review`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${modToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        action: 'approve_and_publish',
        district: 'San Borja',
        latitude: -12.0885,
        longitude: -77.0012,
        confirmedLocationDescription: 'Cercanías Av. Javier Prado Este alt. 1500 N° 1542',
        movedManually: false
      })
    });
    assert.equal(approveRes.status, 200);
    const approveJson = (await approveRes.json()) as {
      post: { status: string; locationStatus: string };
      createdIncident: {
        id: string;
        status: string;
        locationStatus: string;
        approxLocation: { lat: number; lng: number; address: string };
      };
    };
    assert.equal(approveJson.post.status, 'Verificado');
    assert.equal(approveJson.post.locationStatus, 'moderator_confirmed');
    assert.equal(approveJson.createdIncident.status, 'Verificado');
    assert.equal(approveJson.createdIncident.locationStatus, 'moderator_confirmed');
    assert.ok(approveJson.createdIncident.approxLocation.address.startsWith('Ubicación aproximada'));
    // Exact house number stripped from public label
    assert.equal(approveJson.createdIncident.approxLocation.address.includes('1542'), false);

    // Distance between confirmed point and public map point is strictly 200-500m (allowing rounding margin)
    const offsetMeters = haversineMeters(
      -12.0885,
      -77.0012,
      approveJson.createdIncident.approxLocation.lat,
      approveJson.createdIncident.approxLocation.lng
    );
    assert.ok(offsetMeters >= 180 && offsetMeters <= 530, `Offset was ${offsetMeters}m`);
  } finally {
    if (originalToken === undefined) delete process.env.X_BEARER_TOKEN;
    else process.env.X_BEARER_TOKEN = originalToken;
    if (originalCooldown === undefined) delete process.env.X_SYNC_COOLDOWN_MINUTES;
    else process.env.X_SYNC_COOLDOWN_MINUTES = originalCooldown;
    await close();
  }
});

test('GeocoderService valida Nominatim PE/Lima y rechaza resultados extranjeros o Callao', async () => {
  const nominatimFetchMock: GeocodeFetchLike = async input => {
    const url = String(input);
    if (url.includes('México') || url.includes('Reforma')) {
      return {
        ok: true,
        status: 200,
        json: async () => [
          {
            lat: '19.4326',
            lon: '-99.1332',
            display_name: 'Paseo de la Reforma, Ciudad de México, México',
            address: { country_code: 'mx', state: 'Ciudad de México', road: 'Paseo de la Reforma' }
          }
        ]
      };
    }
    if (url.includes('Saenz') || url.includes('Callao')) {
      return {
        ok: true,
        status: 200,
        json: async () => [
          {
            lat: '-12.0602',
            lon: '-77.1450',
            display_name: 'Av. Sáenz Peña, Callao, Perú',
            address: { country_code: 'pe', state: 'Callao', road: 'Avenida Sáenz Peña' }
          }
        ]
      };
    }
    return {
      ok: true,
      status: 200,
      json: async () => [
        {
          lat: '-12.1219',
          lon: '-77.0297',
          display_name: 'Avenida José Larco, Miraflores, Lima, Perú',
          address: {
            country_code: 'pe',
            region: 'Lima Metropolitana',
            city_district: 'Miraflores',
            road: 'Avenida José Larco'
          }
        }
      ]
    };
  };

  const geocoder = new GeocoderService({ fetchImpl: nominatimFetchMock });

  const limaRes = await geocoder.geocodeCandidate('Av. José Larco', 'Miraflores');
  assert.ok(limaRes);
  assert.equal(limaRes.accepted, true);
  assert.equal(limaRes.countryCode, 'pe');
  assert.equal(limaRes.confidence, 'high');

  const mxRes = await geocoder.geocodeCandidate('Av. Reforma');
  assert.ok(mxRes);
  assert.equal(mxRes.accepted, false);
  assert.equal(mxRes.isForeign, true);

  const callaoRes = await geocoder.geocodeCandidate('Av. Saenz Peña');
  assert.ok(callaoRes);
  assert.equal(callaoRes.accepted, false);
  assert.equal(callaoRes.isOutsideLima, true);
});

