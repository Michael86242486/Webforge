import { pgTable, serial, bigint, text, integer, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const projectsTable = pgTable("projects", {
  id: serial("id").primaryKey(),
  userId: bigint("user_id", { mode: "number" }).notNull(),
  name: text("name").notNull(),
  description: text("description"),
  status: text("status").notNull().default("idle"),
  port: integer("port"),
  workDir: text("work_dir"),
  techStack: text("tech_stack"),
  botToken: text("bot_token"),
  botPid: integer("bot_pid"),
  personaConfig: jsonb("persona_config"),
  isHosted: boolean("is_hosted").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertProjectSchema = createInsertSchema(projectsTable);
export const selectProjectSchema = createSelectSchema(projectsTable);
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type Project = typeof projectsTable.$inferSelect;
