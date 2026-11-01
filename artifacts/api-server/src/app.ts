import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { extractUser } from "./lib/auth-middleware";
import { db, auditLogsTable } from "@workspace/db";
import { startTeacherCvExpiryScheduler } from "./lib/teacher-cv-expiry";

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
  ...defaultOrigins,
];

const allowedOrigins = new Set([...configuredOrigins, ...requiredOrigins]);

const isTrustedVercelOrigin = (origin: string) => {
  try {
    const url = new URL(origin);
    return (
      url.protocol === "https:" &&
      /^[a-z0-9-]+\.vercel\.app$/.test(url.hostname)
    );
  } catch {
    return false;
  }
};

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
      if (!origin || allowedOrigins.has(origin) || isTrustedVercelOrigin(origin)) {
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

// Pending teacher applicants are restricted at the API boundary, not only in navigation.
// They may manage their own Profile Hub/CV, upload qualification evidence and use application chat.
// Teaching dashboards, teaching data and every teaching mutation remain inaccessible until approval.
app.use((req,res,next)=>{
  const user=req.currentUser;
  if(!user || String(user.role).toLowerCase()!=="teacher" || user.teacherApplicationStatus!=="pending_review"){next();return;}
  const path=req.path;
  const method=req.method.toUpperCase();
  const selfId=String(user.id);
  const cvPaths=[
    method==="GET" && path==="/users/me/teacher-cv",
    method==="PATCH" && path==="/users/me/teacher-cv",
    method==="GET" && path==="/users/me/qualifications",
    method==="POST" && path==="/users/me/qualifications",
    method==="POST" && path==="/users/me/teacher-documents",
    method==="POST" && /^\/qualifications\/\d+\/document$/.test(path),
    method==="GET" && path==="/users/"+selfId+"/teacher-documents",
    method==="GET" && /^\/users\/\d+\/teacher-documents\/\d+$/.test(path) && path.startsWith("/users/"+selfId+"/"),
    method==="GET" && path==="/users/"+selfId+"/public-profile",
    method==="GET" && path==="/users/"+selfId,
    method==="PATCH" && path==="/users/"+selfId,
    (method==="GET" || method==="POST") && new RegExp("^/teacher-cv-workspace/"+selfId+"/chat$").test(path)
  ].some(Boolean);
  const teachingReadPrefixes=["/dashboard","/lessons","/classes","/assignments","/exercises","/polls","/study-groups","/manager","/attendance","/daily-attendance","/ai","/live-classes"];
  const teachingRead=method==="GET" && teachingReadPrefixes.some(prefix=>path===prefix||path.startsWith(prefix+"/"));
  const profileWriteAllowed=method==="PATCH" && path==="/users/"+selfId;
  if(teachingRead || (["POST","PUT","PATCH","DELETE"].includes(method) && !cvPaths && !profileWriteAllowed)){
    res.status(403).json({error:"Teacher application pending. Only Profile Hub and CV submission tools are available until an Owner or Senior Manager approves and authorizes your teaching access."});return;
  }
  next();
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




