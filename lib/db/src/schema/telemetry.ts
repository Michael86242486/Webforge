import { pgTable, serial, bigint, integer, text, real, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const telemetryTable = pgTable("telemetry", {
  id: serial("id").primaryKey(),
  userId: bigint("user_id", { mode: "number" }).notNull(),
  projectId: integer("project_id"),
  sessionId: text("session_id").notNull(),
  actionType: text("action_type").notNull(),
  model: text("model"),
  inputTokens: integer("input_tokens").default(0),
  outputTokens: integer("output_tokens").default(0),
  costUsd: real("cost_usd").default(0),
  durationMs: integer("duration_ms").default(0),
  filesChanged: integer("files_changed").default(0),
  linesAdded: integer("lines_added").default(0),
  linesRemoved: integer("lines_removed").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertTelemetrySchema = createInsertSchema(telemetryTable);
export const selectTelemetrySchema = createSelectSchema(telemetryTable);
export type InsertTelemetry = z.infer<typeof insertTelemetrySchema>;
export type Telemetry = typeof telemetryTable.$inferSelect;
