import { pgTable, serial, text, timestamp, bigint } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const webUsersTable = pgTable("web_users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  username: text("username").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("user"),
  telegramId: bigint("telegram_id", { mode: "number" }),
  lastLoginAt: timestamp("last_login_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertWebUserSchema = createInsertSchema(webUsersTable);
export const selectWebUserSchema = createSelectSchema(webUsersTable);
export type InsertWebUser = z.infer<typeof insertWebUserSchema>;
export type WebUser = typeof webUsersTable.$inferSelect;
