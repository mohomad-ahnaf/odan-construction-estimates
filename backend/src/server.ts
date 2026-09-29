import { app } from "./app.js";
import { config } from "./config.js";
import { db } from "./db.js";
import { logger } from "./logger.js";
import { authRepository } from "./repositories/auth.repository.js";
import { closePdfBrowser } from "./services/pdf-browser.js";
await db.$connect();
const server = app.listen(config.ODAN_PORT, "127.0.0.1", () =>
  logger.info({ port: config.ODAN_PORT }, "Odan API listening"),
);
server.on("error", (error) => {
  logger.fatal({ err: error }, "Cannot bind configured project port");
  process.exit(1);
});
const cleanup = setInterval(
  () => {
    void authRepository
      .cleanup()
      .catch((error) => logger.error({ err: error }, "Session cleanup failed"));
  },
  15 * 60 * 1000,
);
cleanup.unref();
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    clearInterval(cleanup);
    server.close(() => {
      void Promise.allSettled([closePdfBrowser(), db.$disconnect()]).then(() =>
        process.exit(0),
      );
    });
    setTimeout(() => process.exit(1), 10000).unref();
  });
