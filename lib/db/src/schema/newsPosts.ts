import {
  int,
  mysqlTable,
  timestamp,
  text,
  varchar,
} from "drizzle-orm/mysql-core";
import { usersTable } from "./users";

export const newsPostsTable = mysqlTable("news_posts", {
  id: int("id").autoincrement().primaryKey(),
  authorId: int("author_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 255 }).notNull(),
  body: text("body").notNull().default(""),
  attachmentUrl: varchar("attachment_url", { length: 1024 }),
  attachmentName: varchar("attachment_name", { length: 255 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type NewsPost = typeof newsPostsTable.$inferSelect;
