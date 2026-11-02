import { Router, type IRouter } from "express";
import { requireAuth } from "../lib/auth-middleware";
import { getCurrentAcademicYear } from "../lib/academic-year";

const router: IRouter = Router();

/**
 * Both callers use the same school-timezone-aware academic-year source.
 * Keep these aliases aligned while legacy clients migrate to the canonical
 * /config/currentYear endpoint.
 */
router.get("/config/currentYear", requireAuth, (_req, res): void => {
  res.setHeader("Cache-Control", "no-store");
  res.json(getCurrentAcademicYear());
});

router.get("/academic-records/current-year", requireAuth, (_req, res): void => {
  res.setHeader("Cache-Control", "no-store");
  const year = getCurrentAcademicYear();
  res.json({
    ...year,
    currentYear: Number(year.academicYear),
  });
});

export default router;
