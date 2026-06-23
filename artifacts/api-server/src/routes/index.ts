// Main router — registers all sub-routers
import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import usersRouter from "./users";
import lessonsRouter from "./lessons";
import classesRouter from "./classes";
import messagesRouter from "./messages";
import studyGroupsRouter from "./studyGroups";
import paymentsRouter from "./payments";
import notificationsRouter from "./notifications";
import handRaisesRouter from "./handRaises";
import dashboardRouter from "./dashboard";
import settingsRouter from "./settings";
import pollsRouter from "./polls";
import aiRouter from "./ai";
import breakElidemRouter from "./breakElidems";
import safetyRouter from "./safety";
import auditLogsRouter from "./auditLogs";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(usersRouter);
router.use(lessonsRouter);
router.use(classesRouter);
router.use(messagesRouter);
router.use(studyGroupsRouter);
router.use(paymentsRouter);
router.use(notificationsRouter);
router.use(handRaisesRouter);
router.use(dashboardRouter);
router.use(settingsRouter);
router.use(pollsRouter);
router.use(aiRouter);
router.use(breakElidemRouter);
router.use(safetyRouter);
router.use(auditLogsRouter);

export default router;
