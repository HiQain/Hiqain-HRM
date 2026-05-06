import session from "express-session";
import { sql } from "drizzle-orm";
import { db, pool } from "@workspace/db";
import type { RowDataPacket } from "mysql2";

type SessionRow = RowDataPacket & {
  sess: string;
  expire: Date | string;
};

function getSessionExpiry(sess: session.SessionData): Date {
  const raw = sess.cookie?.expires;
  if (!raw) {
    return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  }
  return raw instanceof Date ? raw : new Date(raw);
}

export async function ensureSessionTable(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS user_sessions (
      sid varchar(191) NOT NULL,
      sess longtext NOT NULL,
      expire datetime NOT NULL,
      PRIMARY KEY (sid),
      KEY user_sessions_expire_idx (expire)
    )
  `);
}

export class MySqlSessionStore extends session.Store {
  override get(
    sid: string,
    callback: (err?: unknown, session?: session.SessionData | null) => void,
  ): void {
    void (async () => {
      const [rows] = await pool.execute<SessionRow[]>(
        "SELECT sess, expire FROM user_sessions WHERE sid = ? LIMIT 1",
        [sid],
      );
      const row = rows[0];
      if (!row) {
        callback(undefined, null);
        return;
      }

      const expiry = row.expire instanceof Date ? row.expire : new Date(row.expire);
      if (expiry.getTime() <= Date.now()) {
        await pool.execute("DELETE FROM user_sessions WHERE sid = ?", [sid]);
        callback(undefined, null);
        return;
      }

      callback(undefined, JSON.parse(row.sess) as session.SessionData);
    })().catch((error) => callback(error));
  }

  override set(
    sid: string,
    sess: session.SessionData,
    callback?: (err?: unknown) => void,
  ): void {
    void pool
      .execute(
        `INSERT INTO user_sessions (sid, sess, expire)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE sess = VALUES(sess), expire = VALUES(expire)`,
        [sid, JSON.stringify(sess), getSessionExpiry(sess)],
      )
      .then(() => callback?.())
      .catch((error) => callback?.(error));
  }

  override destroy(sid: string, callback?: (err?: unknown) => void): void {
    void pool
      .execute("DELETE FROM user_sessions WHERE sid = ?", [sid])
      .then(() => callback?.())
      .catch((error) => callback?.(error));
  }

  override touch(
    sid: string,
    sess: session.SessionData,
    callback?: () => void,
  ): void {
    void pool
      .execute("UPDATE user_sessions SET expire = ? WHERE sid = ?", [
        getSessionExpiry(sess),
        sid,
      ])
      .then(() => callback?.())
      .catch(() => callback?.());
  }
}
