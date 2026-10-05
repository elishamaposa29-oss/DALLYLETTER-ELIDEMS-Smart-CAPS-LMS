import app from "./app";
import { logger } from "./lib/logger";
import { ensureConnectSchema } from "./lib/ensureConnectSchema";
import { startPushDispatcher } from "./lib/push-service";
import { startTeacherLifecycle } from "./lib/teacher-lifecycle";

const rawPort = process.env["PORT"] ?? process.env["API_PORT"] ?? "4000";

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function startServer(): Promise<void> {
  try {
    // Production databases can legitimately lag behind the application bundle.
    // Ensure the non-destructive Connect/social schema exists before serving traffic
    // so feature routes never fail because a required table was not provisioned.
    await ensureConnectSchema();
    logger.info("Connect/social schema verified");
    startPushDispatcher();
    startTeacherLifecycle();
  } catch (error) {
    logger.error({ err: error }, "Database schema verification failed; refusing to serve traffic");
    process.exit(1);
  }

  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port }, "Server listening");
  });
}

void startServer();
