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

const router: IRouter = Router();

// Health check
router.use(healthRouter);

// Auth routes
router.use(authRouter);

// User management
router.use(usersRouter);

// Lessons
router.use(lessonsRouter);

// Live classes
router.use(classesRouter);

// Chat & messaging
router.use(messagesRouter);

// Study groups
router.use(studyGroupsRouter);

// Payment tracking
router.use(paymentsRouter);

// Notifications
router.use(notificationsRouter);

// Hand raises
router.use(handRaisesRouter);

// Dashboard analytics
router.use(dashboardRouter);

// Platform settings
router.use(settingsRouter);

export default router;
