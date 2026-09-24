import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { pool } from "@workspace/db";

const router: IRouter = Router();

router.get("/healthz", async (_req, res): Promise<void> => {
  try {
    await pool.query("SELECT 1");
    const data = HealthCheckResponse.parse({ status: "ok" });
    res.json(data);
  } catch (error) {
    const databaseError = error as { code?: string; message?: string };
    res.status(503).json({
      status: "error",
      error: "Database unavailable",
      code: databaseError.code ?? "DATABASE_CONNECTION_FAILED",
      reason: databaseError.message ?? "The API could not connect to PostgreSQL.",
    });
  }
});

export default router;
