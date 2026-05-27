import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";

export const wpeWebhookLogsTable = pgTable("wpe_webhook_logs", {
  id:             serial("id").primaryKey(),
  projectId:      text("project_id").notNull(),
  framework:      text("framework").notNull(),
  health:         integer("health").notNull(),
  liveUrl:        text("live_url"),
  deliveryStatus: text("delivery_status").notNull(), // "200 OK", "HTTP 422", "TIMEOUT", etc.
  createdAt:      timestamp("created_at").defaultNow(),
});

export type WpeWebhookLog = typeof wpeWebhookLogsTable.$inferSelect;
