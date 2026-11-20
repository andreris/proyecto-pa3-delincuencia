import 'dotenv/config';
import { createDatabase } from './db/index.js';
import { createApp } from './app.js';
import { applyRetentionPolicy, DEFAULT_RETENTION_DAYS } from './services/retentionService.js';
import { getOrCreateSocialConfig } from './services/socialRepository.js';

const PORT = Number(process.env.PORT || 4000);

async function bootstrap() {
  const db = await createDatabase();
  const config = await getOrCreateSocialConfig(db);

  // Run configurable retention cleanup on startup and every 6 hours
  await applyRetentionPolicy(db, config.retentionDays || DEFAULT_RETENTION_DAYS);
  const retentionTimer = setInterval(() => {
    applyRetentionPolicy(db, config.retentionDays || DEFAULT_RETENTION_DAYS).catch(err => {
      console.error('[retention] Cleanup error:', err);
    });
  }, 6 * 60 * 60 * 1000);
  retentionTimer.unref();

  const app = createApp({ db });
  const server = app.listen(PORT, () => {
    console.log(
      `[Vigila.pe API] Servidor escuchando en http://localhost:${PORT} (DB: ${db.dialect}, X API: ${
        process.env.X_BEARER_TOKEN ? 'configurado' : 'modo demo sin token'
      })`
    );
  });

  const shutdown = async () => {
    clearInterval(retentionTimer);
    server.close();
    await db.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

bootstrap().catch(err => {
  console.error('[Vigila.pe API] Error al iniciar servidor:', err);
  process.exit(1);
});
