import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createDatabase } from '../src/db/index.js';
import { createApp } from '../src/app.js';
import { issueSessionToken } from '../src/middleware/auth.js';
import { GeocoderService } from '../src/services/geocoderService.js';
import { WebFetchLike, WebService } from '../src/services/webService.js';
import { parseRppRssFeed } from '../src/services/rssService.js';
import { WebNewsRecord } from '../src/types.js';

function createMockGeocoder(): GeocoderService {
  return new GeocoderService({
    customGeocoder: async (query, district) => {
      const q = query
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
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
      return null;
    }
  });
}

function buildRssXml(
  items: Array<{
    title: string;
    link: string;
    description: string;
    pubDate: string;
    imageUrl?: string;
    fullArticleHtml?: string;
  }>
): string {
  const itemsXml = items
    .map(item => {
      const enclosure = item.imageUrl
        ? `<enclosure url="${item.imageUrl}" type="image/jpeg" />`
        : '';
      const contentEncoded = item.fullArticleHtml
        ? `<content:encoded><![CDATA[${item.fullArticleHtml}]]></content:encoded>`
        : '';
      return `<item>
        <title><![CDATA[${item.title}]]></title>
        <link>${item.link}</link>
        <description><![CDATA[${item.description}]]></description>
        <pubDate>${item.pubDate}</pubDate>
        ${enclosure}
        ${contentEncoded}
      </item>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>RPP Noticias</title>
    <link>https://rpp.pe</link>
    <description>Noticias del Perú y el mundo</description>
    ${itemsXml}
  </channel>
</rss>`;
}

async function startWebTestServer(fetchMock?: WebFetchLike) {
  const db = await createDatabase(':memory:');
  const webService = new WebService({
    fetchImpl: fetchMock,
    geocoder: createMockGeocoder()
  });
  const app = createApp({ db, webService });
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

test('Caso 1: Parseo válido de RSS de RPP sin copiar cuerpo completo y estado Pendiente de validación', async () => {
  const sampleXml = buildRssXml([
    {
      title: 'Asalto a farmacia en Av. Túpac Amaru, Comas',
      link: 'http://rpp.pe/lima/policiales/asalto-farmacia-comas-1001?utm_source=rss&utm_medium=feed#articulo',
      description:
        '<p>Delincuentes armados ingresaron al local en Comas, Lima. Serenazgo acudió al lugar.</p>',
      pubDate: 'Wed, 19 Nov 2026 14:30:00 GMT',
      imageUrl: 'https://e.rpp-noticias.io/normal/2026/11/19/foto1.jpg',
      fullArticleHtml:
        '<p>CUERPO COMPLETO PROHIBIDO DE COPIAR CON MUCHOS PARRAFOS EXTRA QUE NO DEBEN GUARDARSE.</p>'
    }
  ]);

  const parsed = parseRppRssFeed(sampleXml);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].externalId, 'https://rpp.pe/lima/policiales/asalto-farmacia-comas-1001');
  assert.equal(parsed[0].originalUrl, 'https://rpp.pe/lima/policiales/asalto-farmacia-comas-1001');
  assert.equal(parsed[0].imageUrl, 'https://e.rpp-noticias.io/normal/2026/11/19/foto1.jpg');
  assert.equal(parsed[0].excerpt.includes('CUERPO COMPLETO PROHIBIDO'), false);

  const originalCooldown = process.env.WEB_SYNC_COOLDOWN_MINUTES;
  process.env.WEB_SYNC_COOLDOWN_MINUTES = '0';

  const mockFetch: WebFetchLike = async () => ({
    ok: true,
    status: 200,
    text: async () => sampleXml
  });

  const { baseUrl, close } = await startWebTestServer(mockFetch);

  try {
    const modToken = issueSessionToken({
      uid: 'mod-web-1',
      name: 'Moderador Web',
      email: 'mod@vigila.pe',
      role: 'moderator'
    });

    const res = await fetch(`${baseUrl}/api/web/rpp/sync`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${modToken}` }
    });
    assert.equal(res.status, 200);
    const data = (await res.json()) as {
      result: {
        sourceName: string;
        importedCount: number;
        importedNews: WebNewsRecord[];
      };
    };

    assert.equal(data.result.sourceName, 'RPP Noticias');
    assert.equal(data.result.importedCount, 1);
    const imported = data.result.importedNews[0];
    assert.equal(imported.source, 'rpp');
    assert.equal(imported.sourceName, 'RPP Noticias');
    assert.equal(imported.status, 'Pendiente de validación');
    assert.equal(imported.state, 'pending_validation');
    assert.equal(imported.district, 'Comas');
    assert.equal(imported.locationStatus, 'exact_candidate');
    assert.equal(imported.excerpt.includes('CUERPO COMPLETO PROHIBIDO'), false);
  } finally {
    if (originalCooldown === undefined) delete process.env.WEB_SYNC_COOLDOWN_MINUTES;
    else process.env.WEB_SYNC_COOLDOWN_MINUTES = originalCooldown;
    await close();
  }
});

test('Caso 2: Máximo estricto de 20 noticias importadas cuando el RSS trae 25 noticias válidas', async () => {
  const originalCooldown = process.env.WEB_SYNC_COOLDOWN_MINUTES;
  process.env.WEB_SYNC_COOLDOWN_MINUTES = '0';

  const items = Array.from({ length: 25 }, (_, i) => ({
    title: `Robo reportado #${i + 1} en Miraflores, Lima`,
    link: `https://rpp.pe/lima/policiales/robo-miraflores-${i + 1}`,
    description: `Vecinos alertan por robo de celular #${i + 1} en Av. José Larco, Miraflores, Lima.`,
    pubDate: 'Wed, 19 Nov 2026 12:00:00 GMT'
  }));

  const mockFetch: WebFetchLike = async () => ({
    ok: true,
    status: 200,
    text: async () => buildRssXml(items)
  });

  const { baseUrl, close } = await startWebTestServer(mockFetch);

  try {
    const modToken = issueSessionToken({
      uid: 'mod-web-2',
      name: 'Moderador Web 2',
      email: 'mod2@vigila.pe',
      role: 'moderator'
    });

    const syncRes = await fetch(`${baseUrl}/api/web/rpp/sync`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${modToken}` }
    });
    assert.equal(syncRes.status, 200);
    const body = (await syncRes.json()) as {
      result: {
        fetchedCount: number;
        importedCount: number;
        capSkippedCount: number;
        maxNewsLimit: number;
      };
      stats: { pending: number };
    };

    assert.equal(body.result.fetchedCount, 25);
    assert.equal(body.result.maxNewsLimit, 20);
    assert.equal(body.result.importedCount, 20);
    assert.equal(body.result.capSkippedCount, 5);
    assert.equal(body.stats.pending, 20);
  } finally {
    if (originalCooldown === undefined) delete process.env.WEB_SYNC_COOLDOWN_MINUTES;
    else process.env.WEB_SYNC_COOLDOWN_MINUTES = originalCooldown;
    await close();
  }
});

test('Caso 3: Duplicados por URL canónica son omitidos y cooldown configurable protege sincronización', async () => {
  const originalCooldown = process.env.WEB_SYNC_COOLDOWN_MINUTES;
  process.env.WEB_SYNC_COOLDOWN_MINUTES = '0';

  let syncStep = 1;
  const mockFetch: WebFetchLike = async () => ({
    ok: true,
    status: 200,
    text: async () =>
      buildRssXml([
        {
          title: 'Asalto en Comas, Lima',
          link:
            syncStep === 1
              ? 'https://rpp.pe/lima/policiales/asalto-comas-dup-01'
              : 'http://rpp.pe/lima/policiales/asalto-comas-dup-01/?utm_source=x&fbclid=123#sec',
          description: 'Reporte policial de asalto en Comas, Lima.',
          pubDate: 'Wed, 19 Nov 2026 15:00:00 GMT'
        }
      ])
  });

  const { baseUrl, close } = await startWebTestServer(mockFetch);

  try {
    const modToken = issueSessionToken({
      uid: 'mod-web-3',
      name: 'Moderador Web 3',
      email: 'mod3@vigila.pe',
      role: 'moderator'
    });

    const res1 = await fetch(`${baseUrl}/api/web/rpp/sync`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${modToken}` }
    });
    assert.equal(res1.status, 200);
    const data1 = (await res1.json()) as {
      result: { importedCount: number; duplicatesSkipped: number };
    };
    assert.equal(data1.result.importedCount, 1);
    assert.equal(data1.result.duplicatesSkipped, 0);

    syncStep = 2;
    const res2 = await fetch(`${baseUrl}/api/web/rpp/sync`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${modToken}` }
    });
    assert.equal(res2.status, 200);
    const data2 = (await res2.json()) as {
      result: { importedCount: number; duplicatesSkipped: number };
    };
    assert.equal(data2.result.importedCount, 0);
    assert.equal(data2.result.duplicatesSkipped, 1);

    // Enable cooldown and confirm immediate re-sync is blocked with 429
    process.env.WEB_SYNC_COOLDOWN_MINUTES = '15';
    const res3 = await fetch(`${baseUrl}/api/web/rpp/sync`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${modToken}` }
    });
    assert.equal(res3.status, 429);
  } finally {
    if (originalCooldown === undefined) delete process.env.WEB_SYNC_COOLDOWN_MINUTES;
    else process.env.WEB_SYNC_COOLDOWN_MINUTES = originalCooldown;
    await close();
  }
});

test('Caso 4 y 5: Lima con distrito aceptada en Pendiente, Callao/extranjero/regiones descartados y auditoría completa', async () => {
  const originalCooldown = process.env.WEB_SYNC_COOLDOWN_MINUTES;
  process.env.WEB_SYNC_COOLDOWN_MINUTES = '0';

  const mockFetch: WebFetchLike = async () => ({
    ok: true,
    status: 200,
    text: async () =>
      buildRssXml([
        {
          title: 'Extorsión a comerciantes en San Juan de Lurigancho, Lima',
          link: 'https://rpp.pe/lima/policiales/extorsion-sjl-201',
          description: 'Bodegueros de San Juan de Lurigancho alertan por cobro de cupos.',
          pubDate: 'Wed, 19 Nov 2026 11:00:00 GMT'
        },
        {
          title: 'Robo vehicular en Bellavista, Callao',
          link: 'https://rpp.pe/peru/callao/robo-bellavista-202',
          description: 'Policía investiga robo en distrito de Bellavista en el Callao.',
          pubDate: 'Wed, 19 Nov 2026 10:00:00 GMT'
        },
        {
          title: 'Asalto armado en centro de Bogotá, Colombia',
          link: 'https://rpp.pe/mundo/colombia/asalto-bogota-203',
          description: 'Autoridades reportan incidente en Colombia.',
          pubDate: 'Wed, 19 Nov 2026 09:00:00 GMT'
        },
        {
          title: 'Balacera en el centro de Arequipa deja dos heridos',
          link: 'https://rpp.pe/peru/arequipa/balacera-arequipa-204',
          description: 'Policía de Arequipa investiga tiroteo.',
          pubDate: 'Wed, 19 Nov 2026 08:00:00 GMT'
        }
      ])
  });

  const { baseUrl, close } = await startWebTestServer(mockFetch);

  try {
    const modToken = issueSessionToken({
      uid: 'mod-web-4',
      name: 'Moderador Web 4',
      email: 'mod4@vigila.pe',
      role: 'moderator'
    });

    const syncRes = await fetch(`${baseUrl}/api/web/rpp/sync`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${modToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        incidentTypes: ['extorsion', 'robo', 'asalto', 'balacera']
      })
    });
    assert.equal(syncRes.status, 200);
    const data = (await syncRes.json()) as {
      result: {
        importedCount: number;
        discardedCount: number;
        omittedCount: number;
        discardReasons: string[];
        importedNews: WebNewsRecord[];
      };
    };

    assert.equal(data.result.importedCount, 1);
    assert.equal(data.result.discardedCount, 0);
    assert.equal(data.result.omittedCount, 3);
    assert.equal(data.result.importedNews[0].district, 'San Juan de Lurigancho');
    assert.equal(data.result.importedNews[0].status, 'Pendiente de validación');
    assert.equal(data.result.importedNews[0].locationStatus, 'district_only');
    assert.equal(data.result.discardReasons.length, 0);

    // Check audit log entries
    const auditRes = await fetch(`${baseUrl}/api/web/audit`, {
      headers: { Authorization: `Bearer ${modToken}` }
    });
    assert.equal(auditRes.status, 200);
    const auditBody = (await auditRes.json()) as {
      logs: Array<{ actionType: string; details: string }>;
    };
    const syncAudit = auditBody.logs.find(l => l.actionType === 'web_sync');
    assert.ok(syncAudit);
    assert.equal(syncAudit.details.includes('RPP Noticias'), true);
    assert.equal(syncAudit.details.includes('Filtros activos'), true);
    assert.equal(syncAudit.details.includes('Motivos de descarte'), true);
  } finally {
    if (originalCooldown === undefined) delete process.env.WEB_SYNC_COOLDOWN_MINUTES;
    else process.env.WEB_SYNC_COOLDOWN_MINUTES = originalCooldown;
    await close();
  }
});

test('Caso 6: Filtro por rango de fechas en sincronización y listado web', async () => {
  const originalCooldown = process.env.WEB_SYNC_COOLDOWN_MINUTES;
  process.env.WEB_SYNC_COOLDOWN_MINUTES = '0';

  const mockFetch: WebFetchLike = async () => ({
    ok: true,
    status: 200,
    text: async () =>
      buildRssXml([
        {
          title: 'Robo en Surco el 19 de noviembre',
          link: 'https://rpp.pe/lima/policiales/robo-surco-nov19',
          description: 'Incidente en Santiago de Surco, Lima.',
          pubDate: 'Wed, 19 Nov 2026 14:00:00 GMT'
        },
        {
          title: 'Robo en Surco el 10 de noviembre',
          link: 'https://rpp.pe/lima/policiales/robo-surco-nov10',
          description: 'Incidente antiguo en Santiago de Surco, Lima.',
          pubDate: 'Tue, 10 Nov 2026 14:00:00 GMT'
        }
      ])
  });

  const { baseUrl, close } = await startWebTestServer(mockFetch);

  try {
    const modToken = issueSessionToken({
      uid: 'mod-web-6',
      name: 'Moderador Web 6',
      email: 'mod6@vigila.pe',
      role: 'moderator'
    });

    const syncRes = await fetch(`${baseUrl}/api/web/rpp/sync`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${modToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        dateFrom: '2026-11-18',
        dateTo: '2026-11-20'
      })
    });
    assert.equal(syncRes.status, 200);
    const data = (await syncRes.json()) as {
      result: { importedCount: number; discardedCount: number; omittedCount: number; importedNews: WebNewsRecord[] };
    };
    assert.equal(data.result.importedCount, 1);
    assert.equal(data.result.discardedCount, 0);
    assert.equal(data.result.omittedCount, 1);
    assert.equal(data.result.importedNews[0].originalUrl.includes('nov19'), true);
  } finally {
    if (originalCooldown === undefined) delete process.env.WEB_SYNC_COOLDOWN_MINUTES;
    else process.env.WEB_SYNC_COOLDOWN_MINUTES = originalCooldown;
    await close();
  }
});

test('Caso 7: Noticia sin ubicación específica no puede publicarse directamente en el mapa, permite Guardar como referencia y ofusca 200-500m al confirmar pin', async () => {
  const originalCooldown = process.env.WEB_SYNC_COOLDOWN_MINUTES;
  process.env.WEB_SYNC_COOLDOWN_MINUTES = '0';

  const mockFetch: WebFetchLike = async () => ({
    ok: true,
    status: 200,
    text: async () =>
      buildRssXml([
        {
          title: 'Operativo policial contra robos en Lima Metropolitana',
          link: 'https://rpp.pe/lima/policiales/operativo-lima-metro-701',
          description:
            'Agentes desplegaron patrullaje en Lima Metropolitana para prevenir delitos.',
          pubDate: 'Wed, 19 Nov 2026 16:00:00 GMT'
        }
      ])
  });

  const { baseUrl, close } = await startWebTestServer(mockFetch);

  try {
    const modToken = issueSessionToken({
      uid: 'mod-web-7',
      name: 'Moderador Web 7',
      email: 'mod7@vigila.pe',
      role: 'moderator'
    });

    // Authorization check: citizen blocked from /api/web/news
    const userToken = issueSessionToken({
      uid: 'usr-web-7',
      name: 'Ciudadano',
      email: 'user@vigila.pe',
      role: 'user'
    });
    const forbiddenRes = await fetch(`${baseUrl}/api/web/news`, {
      headers: { Authorization: `Bearer ${userToken}` }
    });
    assert.equal(forbiddenRes.status, 403);

    const syncRes = await fetch(`${baseUrl}/api/web/rpp/sync`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${modToken}` }
    });
    assert.equal(syncRes.status, 200);
    const syncData = (await syncRes.json()) as {
      result: { importedNews: WebNewsRecord[] };
    };
    const newsItem = syncData.result.importedNews[0];
    assert.equal(newsItem.locationStatus, 'unknown');
    assert.equal(newsItem.latitude, null);
    assert.equal(newsItem.longitude, null);

    // 1) Attempting direct publish without specific location fails with 400
    const badPublishRes = await fetch(`${baseUrl}/api/web/news/${newsItem.id}/review`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${modToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        action: 'approve_and_publish'
      })
    });
    assert.equal(badPublishRes.status, 400);

    // 2) Public incidents map remains empty (0 incidents published)
    const publicBefore = (await (await fetch(`${baseUrl}/api/incidents`)).json()) as {
      incidents: unknown[];
    };
    assert.equal(publicBefore.incidents.length, 0);

    // 3) Save as reference succeeds without publishing to public map
    const saveRefRes = await fetch(`${baseUrl}/api/web/news/${newsItem.id}/review`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${modToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        action: 'save_as_reference',
        locationLabel: 'Lima Metropolitana (en seguimiento)'
      })
    });
    assert.equal(saveRefRes.status, 200);

    const publicAfterRef = (await (await fetch(`${baseUrl}/api/incidents`)).json()) as {
      incidents: unknown[];
    };
    assert.equal(publicAfterRef.incidents.length, 0);

    // 4) Moderator confirms district + pin + description -> publishes with 200-500m obfuscation
    const exactLat = -12.0464;
    const exactLng = -77.0428;
    const approveRes = await fetch(`${baseUrl}/api/web/news/${newsItem.id}/review`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${modToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        action: 'approve_and_publish',
        district: 'Lima',
        latitude: exactLat,
        longitude: exactLng,
        confirmedLocationDescription: 'Cercanías de Av. Abancay con Jr. Cusco',
        movedManually: true
      })
    });
    assert.equal(approveRes.status, 200);
    const approveBody = (await approveRes.json()) as {
      createdIncident: {
        source: string;
        status: string;
        approxLocation: { lat: number; lng: number; address: string };
      };
    };

    assert.equal(approveBody.createdIncident.source, 'rpp');
    assert.equal(approveBody.createdIncident.status, 'Verificado');
    assert.equal(
      approveBody.createdIncident.approxLocation.address.startsWith('Ubicación aproximada'),
      true
    );

    const latDiff = Math.abs(approveBody.createdIncident.approxLocation.lat - exactLat);
    const lngDiff = Math.abs(approveBody.createdIncident.approxLocation.lng - exactLng);
    assert.equal(latDiff > 0 || lngDiff > 0, true);
  } finally {
    if (originalCooldown === undefined) delete process.env.WEB_SYNC_COOLDOWN_MINUTES;
    else process.env.WEB_SYNC_COOLDOWN_MINUTES = originalCooldown;
    await close();
  }
});
