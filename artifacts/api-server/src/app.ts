import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { extractUser } from "./lib/auth-middleware";
import { db, auditLogsTable } from "@workspace/db";
import { startTeacherCvExpiryScheduler } from "./lib/teacher-cv-expiry";
import { canPendingTeacherUseRoute } from "./lib/role-access";

const app: Express = express();

// Owner-configured teacher CV expiry is checked by the API service on startup and every five minutes.
startTeacherCvExpiryScheduler();

const configuredOrigins = (process.env.CORS_ORIGINS ?? "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

const defaultOrigins = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:8081",
  "http://127.0.0.1:8081",
];

const requiredOrigins = [
  "https://dallyletterelidemslearningplatforme-six.vercel.app",
  // Explicit production frontend origin; additional deployment URLs belong in CORS_ORIGINS.
];

const allowedOrigins = new Set([...configuredOrigins, ...requiredOrigins, ...(process.env.NODE_ENV === "production" ? [] : defaultOrigins)]);

app.disable("x-powered-by");
// Render terminates TLS at its reverse proxy; trust only the nearest proxy hop
// so IP-based authentication throttles use the client address rather than a shared proxy address.
app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error(`Origin ${origin} not allowed by CORS`));
    },
    credentials: true,
    methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "Accept",
      "Origin",
      "X-Requested-With",
      "X-CSRF-Token",
    ],
    optionsSuccessStatus: 204,
  }),
);
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Extract user from Bearer token on all requests
app.use(extractUser);

// Pending teacher applicants may use only their own Profile Hub, CV evidence and application chat.
app.use((req, res, next) => {
  const user = req.currentUser;
  if (!user || canPendingTeacherUseRoute(user, req.method, req.path)) {
    next();
    return;
  }

  // Record the exact denied route without logging tokens, request bodies or personal data.
  logger.warn(
    { event: "teacher_application_route_denied", userId: user.id, method: req.method, path: req.path },
    "Pending teacher attempted to access a restricted route",
  );
  res.status(403).json({
    error: "Teacher application pending. Only Profile Hub and CV submission tools are available until an Owner or Senior Manager approves and authorizes your teaching access.",
    code: "TEACHER_APPLICATION_PENDING",
  });
});

// Record authenticated activity for owner auditability. Request bodies are intentionally excluded.
app.use((req, res, next) => {
  res.on("finish", () => {
    const user = req.currentUser;
    if (!user || req.method === "OPTIONS" || req.path.startsWith("/api/audit-logs")) return;
    void db.insert(auditLogsTable).values({
      action: `${req.method} ${req.path} → ${res.statusCode}`,
      category: "activity",
      performedBy: user.id,
      targetType: "route",
      details: JSON.stringify({ userId: user.id, userName: user.name, role: user.role, statusCode: res.statusCode }),
    }).catch(() => undefined);
  });
  next();
});

app.use("/api", router);



export default app;




