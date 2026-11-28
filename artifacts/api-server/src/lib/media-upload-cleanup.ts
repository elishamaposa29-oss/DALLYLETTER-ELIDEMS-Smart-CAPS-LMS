import { cleanupExpiredMediaUploads } from "./media-upload-tickets";
import { logger } from "./logger";

/**
 * Expired upload tickets are swept on startup and every ten minutes.
 * Failed object deletion is retained as an expired ticket and retried later.
 */
export function startMediaUploadCleanup(): void {
  const run = () => {
    void cleanupExpiredMediaUploads(200).then((result) => {
      if (result.scanned > 0) logger.info(result, "Expired media upload cleanup completed");
      if (result.failed > 0) logger.warn(result, "Some expired media objects need cleanup retry");
    }).catch((error) => {
      logger.warn({ err: error }, "Expired media upload cleanup will retry");
    });
  };
  run();
  setInterval(run, 10 * 60 * 1000).unref();
}
