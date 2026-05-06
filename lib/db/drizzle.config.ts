import { defineConfig } from "drizzle-kit";
import path from "path";

function getDatabaseUrl(): string {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  const host = process.env.MYSQL_HOST ?? "127.0.0.1";
  const port = process.env.MYSQL_PORT ?? "3306";
  const database = process.env.MYSQL_DATABASE;
  const user = process.env.MYSQL_USER;
  const password = process.env.MYSQL_PASSWORD ?? "";

  if (!database || !user) {
    throw new Error("Set DATABASE_URL or provide MYSQL_DATABASE and MYSQL_USER");
  }

  return `mysql://${user}:${encodeURIComponent(password)}@${host}:${port}/${database}`;
}

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "mysql",
  dbCredentials: {
    url: getDatabaseUrl(),
  },
});
