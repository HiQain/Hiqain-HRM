import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

function loadWorkspaceEnv() {
  const loadEnvFile = (process as typeof process & {
    loadEnvFile?: (path?: string) => void;
  }).loadEnvFile;

  if (typeof loadEnvFile !== "function") return;

  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const workspaceEnvPath = path.resolve(currentDir, "../../../.env");

  if (existsSync(workspaceEnvPath)) {
    loadEnvFile(workspaceEnvPath);
  }
}

loadWorkspaceEnv();

const [{ default: app }, { logger }] = await Promise.all([
  import("./app"),
  import("./lib/logger"),
]);

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
