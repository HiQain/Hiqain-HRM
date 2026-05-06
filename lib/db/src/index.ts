import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "./schema";

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
    throw new Error(
      "Set DATABASE_URL or provide MYSQL_DATABASE and MYSQL_USER for MySQL.",
    );
  }

  const encodedPassword = encodeURIComponent(password);
  return `mysql://${user}:${encodedPassword}@${host}:${port}/${database}`;
}

const databaseUrl = getDatabaseUrl();

export const pool = mysql.createPool(databaseUrl);
export const db = drizzle(pool, { schema, mode: "default" });

export * from "./schema";
