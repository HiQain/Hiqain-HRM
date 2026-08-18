import {
  boolean,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";

export type MonthlyViewColumnPreferences = {
  attendance: string[];
  salary: string[];
};

export const usersTable = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  role: mysqlEnum("role", ["admin", "hr", "employee"])
    .notNull()
    .default("employee"),
  isActive: boolean("is_active").notNull().default(true),
  mustChangePassword: boolean("must_change_password").notNull().default(true),
  monthlyViewColumnPreferences: json("monthly_view_column_preferences")
    .$type<MonthlyViewColumnPreferences>()
    .notNull()
    .default({ attendance: [], salary: [] }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type User = typeof usersTable.$inferSelect;
export type InsertUser = typeof usersTable.$inferInsert;
