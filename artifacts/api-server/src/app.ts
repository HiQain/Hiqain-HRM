import express, { type Express } from "express";
import cors from "cors";
import session from "express-session";
import pinoHttp from "pino-http";
import path from "node:path";
import { existsSync } from "node:fs";
import router from "./routes";
import { logger } from "./lib/logger";
import { ensureSeed } from "./lib/seed";
import { ensureSessionTable, MySqlSessionStore } from "./lib/mysqlSessionStore";
import { startAttendanceExtensionMonitor } from "./lib/attendanceExtension";
import { ensureLegacySchemaCompatibility } from "./lib/schemaCompatibility";

const app: Express = express();

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
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const sessionSecret = process.env["SESSION_SECRET"];
if (!sessionSecret) {
  throw new Error("SESSION_SECRET environment variable is required");
}

app.set("trust proxy", 1);

await ensureLegacySchemaCompatibility();
await ensureSessionTable();
startAttendanceExtensionMonitor();

app.use(
  session({
    store: new MySqlSessionStore(),
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 24 * 7,
    },
  }),
);

app.use("/api", router);

const frontendDistDir = path.resolve(__dirname, "../../hrm/dist/public");
const frontendIndexPath = path.join(frontendDistDir, "index.html");
const hasFrontendBuild = existsSync(frontendIndexPath);

if (hasFrontendBuild) {
  app.use(express.static(frontendDistDir));
  app.use((req, res, next) => {
    if (req.path.startsWith("/api")) {
      next();
      return;
    }
    res.sendFile(frontendIndexPath);
  });
} else {
  logger.warn(
    { frontendDistDir },
    "Frontend build not found; serving API routes only",
  );
}

// Best-effort seed; do not block startup if it fails
ensureSeed().catch((err) => {
  logger.error({ err }, "Seed failed");
});

export default app;
