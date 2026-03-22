import { startHttpServer } from './servers/http.js';
import { startSmtpServer } from './servers/smtp.js';
import { startDomainExpirySweep } from './services/domain-expiry.service.js';

const closeServer = (server) =>
  new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });

const run = async () => {
  const httpServer = await startHttpServer();
  const smtpServer = await startSmtpServer();
  startDomainExpirySweep();

  const shutdown = async (signal) => {
    console.log(`[app] shutting down on ${signal}`);

    await Promise.allSettled([closeServer(httpServer), closeServer(smtpServer)]);
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
};

run().catch((error) => {
  console.error('[app] startup failed', error);
  process.exit(1);
});
