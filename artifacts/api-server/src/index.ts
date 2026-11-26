import app from "./app";
import { logger } from "./lib/logger";
import { ensureConnectSchema } from "./lib/ensureConnectSchema";
import { startPushDispatcher } from "./lib/push-service";
import { startTeacherCvExpiryScheduler } from "./lib/teacher-cv-expiry";
import { ensureAuthSessionSchema } from "./lib/auth-session-store";
import { ensureProfileHubSchema } from "./lib/ensureProfileHubSchema";
import { ensureManagerPermissionSchema } from "./lib/ensureManagerPermissionSchema";
import { startEmailNotificationDispatcher } from "./lib/email-notification-queue";
import { startDailyAttendanceLifecycle } from "./lib/daily-attendance-lifecycle";

const rawPort = process.env["PORT"] ?? process.env["API_PORT"] ?? "4000";

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function startServer(): Promise<void> {
  try {
    // Production databases can legitimately lag behind the application bundle.
    // Ensure additive feature schemas exist before serving traffic.
    await ensureConnectSchema();
    await ensureAuthSessionSchema();
    await ensureProfileHubSchema();
    // Manager authorization queries these tables on every protected request.
    // Empty grant tables are default-deny; schema creation grants no authority.
    await ensureManagerPermissionSchema();
    startEmailNotificationDispatcher();
    logger.info("Connect/social and manager-permission schemas verified");
    startPushDispatcher();
    startTeacherCvExpiryScheduler();
    startDailyAttendanceLifecycle();
  } catch (error) {
    logger.error({ err: error }, "Database schema verification failed; refusing to serve traffic");
    process.exit(1);
  }

  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening for connections");
      process.exit(1);
    }

    logger.info({ port }, "Server listening");
  });
}

void startServer();
