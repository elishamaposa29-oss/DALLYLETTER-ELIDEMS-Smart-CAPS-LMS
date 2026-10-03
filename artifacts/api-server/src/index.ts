import app from "./app";
import { logger } from "./lib/logger";
import { ensureConnectSchema } from "./lib/ensureConnectSchema";

const rawPort = process.env["PORT"] ?? process.env["API_PORT"] ?? "4000";

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

void ensureConnectSchema().then(() => app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
})).catch((error) => {
  logger.error({ error }, "Failed to ensure database schema");
  process.exit(1);
});
