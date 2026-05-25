import { pgTable, serial, bigint, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const paymentsTable = pgTable("payments", {
  id: serial("id").primaryKey(),
  userId: bigint("user_id", { mode: "number" }).notNull(),
  reference: text("reference").notNull().unique(),
  tier: text("tier").notNull(),
  amountNgn: integer("amount_ngn").notNull(),
  status: text("status").notNull().default("pending"),
  receiptUrl: text("receipt_url"),
  receiptFileId: text("receipt_file_id"),
  approvedBy: text("approved_by"),
  adminMessageId: integer("admin_message_id"),
  adminChatId: bigint("admin_chat_id", { mode: "number" }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertPaymentSchema = createInsertSchema(paymentsTable);
export const selectPaymentSchema = createSelectSchema(paymentsTable);
export type InsertPayment = z.infer<typeof insertPaymentSchema>;
export type Payment = typeof paymentsTable.$inferSelect;
