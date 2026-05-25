import { db, usersTable, projectsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export type Tier = "starter" | "pro" | "elite";

export const TIER_LIMITS: Record<Tier, {
  maxProjects: number;
  dailyActions: number;
  allowedModels: string[];
  deepBuild: boolean;
  botHosting: boolean;
  customKeys: boolean;
  gitClone: boolean;
}> = {
  starter: {
    maxProjects: 3,
    dailyActions: 10,
    allowedModels: ["gpt-5-nano", "gemini-2.5-flash-lite", "mistral"],
    deepBuild: false,
    botHosting: false,
    customKeys: false,
    gitClone: false,
  },
  pro: {
    maxProjects: Infinity,
    dailyActions: 150,
    allowedModels: [
      "gpt-5-nano", "gemini-2.5-flash-lite", "mistral",
      "dev-x", "gpt-oss-120b", "grok-3", "grok-3-mini",
      "llama-3.3-70b-instruct",
    ],
    deepBuild: false,
    botHosting: true,
    customKeys: true,
    gitClone: true,
  },
  elite: {
    maxProjects: Infinity,
    dailyActions: 500,
    allowedModels: [
      "deepseek-r1", "kimi-k2-thinking", "dev-x", "gpt-oss-120b",
      "grok-3", "gpt-5-nano", "gemini-2.5-flash-lite", "mistral",
      "grok-3-mini", "llama-3.3-70b-instruct",
    ],
    deepBuild: true,
    botHosting: true,
    customKeys: true,
    gitClone: true,
  },
};

export const TIER_PRICES: Record<string, number> = { pro: 5000, elite: 15000 };

export async function getOrCreateUser(telegramId: number, firstName?: string, username?: string) {
  const existing = await db.select().from(usersTable).where(eq(usersTable.telegramId, telegramId)).limit(1);
  if (existing.length > 0) return existing[0];

  const [created] = await db.insert(usersTable).values({
    telegramId,
    firstName: firstName ?? null,
    username: username ?? null,
    tier: "starter",
  }).returning();
  return created;
}

export async function checkActionAllowed(telegramId: number): Promise<{
  allowed: boolean;
  reason?: string;
  user?: typeof usersTable.$inferSelect;
}> {
  const users = await db.select().from(usersTable).where(eq(usersTable.telegramId, telegramId)).limit(1);
  if (users.length === 0) return { allowed: false, reason: "User not found" };
  const user = users[0];
  const tier = (user.tier as Tier) ?? "starter";
  const limits = TIER_LIMITS[tier];

  // Reset daily counter if older than 24h
  const resetTime = user.dailyActionsReset;
  if (resetTime && Date.now() - resetTime.getTime() > 24 * 60 * 60 * 1000) {
    await db.update(usersTable)
      .set({ dailyActionsCounter: 0, dailyActionsReset: new Date() })
      .where(eq(usersTable.telegramId, telegramId));
    user.dailyActionsCounter = 0;
  }

  if (user.dailyActionsCounter >= limits.dailyActions) {
    return {
      allowed: false,
      reason: `Daily action limit reached (${limits.dailyActions} actions for ${tier} tier). Upgrade to unlock more!`,
    };
  }

  return { allowed: true, user };
}

export async function incrementAction(telegramId: number): Promise<void> {
  await db.update(usersTable)
    .set({ dailyActionsCounter: (await db.select().from(usersTable).where(eq(usersTable.telegramId, telegramId)).limit(1))[0]?.dailyActionsCounter ?? 0 + 1 })
    .where(eq(usersTable.telegramId, telegramId));
}

export async function checkProjectLimitAllowed(telegramId: number): Promise<{ allowed: boolean; reason?: string }> {
  const users = await db.select().from(usersTable).where(eq(usersTable.telegramId, telegramId)).limit(1);
  if (users.length === 0) return { allowed: false, reason: "User not found" };
  const user = users[0];
  const tier = (user.tier as Tier) ?? "starter";
  const limits = TIER_LIMITS[tier];

  if (limits.maxProjects === Infinity) return { allowed: true };

  const projects = await db.select().from(projectsTable).where(eq(projectsTable.userId, telegramId));
  if (projects.length >= limits.maxProjects) {
    return {
      allowed: false,
      reason: `Project limit reached (${limits.maxProjects} for ${tier} tier). Upgrade to create unlimited projects!`,
    };
  }
  return { allowed: true };
}

export async function upgradeTier(telegramId: number, tier: Tier): Promise<void> {
  await db.update(usersTable)
    .set({ tier, dailyActionsCounter: 0, dailyActionsReset: new Date() })
    .where(eq(usersTable.telegramId, telegramId));
}
