import { Router } from "express";
import type { Request, Response } from "express";
import { db, projectsTable, usersTable, paymentsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { routeTask } from "../ai/router.js";
import { checkActionAllowed, incrementAction, checkProjectLimitAllowed, getOrCreateUser } from "../utils/billing.js";
import { ensureProjectDir, writeFilesParallel } from "../engines/orchestrator.js";
import { broadcastStatus, broadcastChunk, broadcastMetrics } from "./stream.js";
import { startSession, endSession } from "../utils/telemetry.js";
import { logger } from "../lib/logger.js";

const router = Router();

router.get("/users/me", async (req: Request, res: Response) => {
  const telegramId = Number(req.query.telegramId);
  if (!telegramId) { res.status(400).json({ error: "telegramId required" }); return; }

  const user = await getOrCreateUser(telegramId);
  res.json(user);
});

router.get("/users/stats", async (_req: Request, res: Response) => {
  const usersResult = await db.execute(sql`
    SELECT
      COUNT(*) as "totalUsers",
      COUNT(*) FILTER (WHERE tier = 'starter') as "starterUsers",
      COUNT(*) FILTER (WHERE tier = 'pro') as "proUsers",
      COUNT(*) FILTER (WHERE tier = 'elite') as "eliteUsers"
    FROM users
  `);
  const projResult = await db.execute(sql`SELECT COUNT(*) as "totalProjects" FROM projects`);

  const r = (usersResult.rows?.[0] ?? {}) as Record<string, unknown>;
  const p = (projResult.rows?.[0] ?? {}) as Record<string, unknown>;

  res.json({
    totalUsers: Number(r.totalUsers ?? 0),
    totalProjects: Number(p.totalProjects ?? 0),
    starterUsers: Number(r.starterUsers ?? 0),
    proUsers: Number(r.proUsers ?? 0),
    eliteUsers: Number(r.eliteUsers ?? 0),
  });
});

router.get("/projects", async (req: Request, res: Response) => {
  const userId = Number(req.query.userId);
  if (!userId) { res.status(400).json({ error: "userId required" }); return; }
  const projects = await db.select().from(projectsTable).where(eq(projectsTable.userId, userId));
  res.json(projects);
});

router.post("/projects", async (req: Request, res: Response) => {
  const { userId, name, description, techStack } = req.body as {
    userId: number; name: string; description?: string; techStack?: string;
  };
  if (!userId || !name) { res.status(400).json({ error: "userId and name required" }); return; }

  const projectCheck = await checkProjectLimitAllowed(userId);
  if (!projectCheck.allowed) { res.status(403).json({ error: projectCheck.reason }); return; }

  const [project] = await db.insert(projectsTable).values({
    userId, name, description: description ?? null, techStack: techStack ?? null, status: "idle",
  }).returning();

  await ensureProjectDir(project.id, userId);
  res.status(201).json(project);
});

router.get("/projects/:id", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, id));
  if (!project) { res.status(404).json({ error: "Project not found" }); return; }
  res.json(project);
});

router.delete("/projects/:id", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  await db.delete(projectsTable).where(eq(projectsTable.id, id));
  res.json({ success: true });
});

router.patch("/projects/:id/persona", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const { name, systemPrompt, tone, instructions } = req.body as {
    name?: string; systemPrompt: string; tone?: string; instructions?: string;
  };

  const personaConfig = { name: name ?? "Assistant", systemPrompt, tone: tone ?? "friendly", instructions: instructions ?? "" };

  const [project] = await db.update(projectsTable)
    .set({ personaConfig, updatedAt: new Date() })
    .where(eq(projectsTable.id, id))
    .returning();

  if (!project) { res.status(404).json({ error: "Project not found" }); return; }

  const { writeFilesParallel: wfp, ensureProjectDir: epd } = await import("../engines/orchestrator.js");
  if (project.workDir) {
    await import("fs/promises").then(fsp => fsp.mkdir(`${project.workDir}/config`, { recursive: true }));
    await wfp([{
      filePath: `${project.workDir}/config/persona.json`,
      content: JSON.stringify(personaConfig, null, 2),
    }]);
  }
  res.json(project);
});

router.get("/payments", async (req: Request, res: Response) => {
  const userId = Number(req.query.userId);
  if (!userId) { res.status(400).json({ error: "userId required" }); return; }
  const payments = await db.select().from(paymentsTable).where(eq(paymentsTable.userId, userId));
  res.json(payments);
});

router.post("/ai/generate", async (req: Request, res: Response) => {
  const { userId, taskType, prompt, projectId } = req.body as {
    userId: number; taskType: string; prompt: string; projectId?: number;
  };
  if (!userId || !taskType || !prompt) {
    res.status(400).json({ error: "userId, taskType, prompt required" });
    return;
  }

  const check = await checkActionAllowed(userId);
  if (!check.allowed) { res.status(429).json({ error: check.reason }); return; }

  const user = check.user!;
  const sessionId = startSession(userId, projectId);

  if (projectId) broadcastStatus(String(projectId), "building");

  try {
    const result = await routeTask(taskType as "planning" | "coding" | "fixing" | "chat" | "image" | "ui", prompt, user.tier, userId);

    if (projectId) {
      broadcastChunk(String(projectId), result.content);
      broadcastStatus(String(projectId), "done");
      broadcastMetrics(String(projectId), {
        cost: result.costUsd,
        files: 0,
        added: 0,
        removed: 0,
      });
    }

    await endSession(sessionId, taskType, result.model, result.inputTokens, result.outputTokens);
    await incrementAction(userId);
    res.json(result);
  } catch (err) {
    logger.error({ err }, "AI generate error");
    if (projectId) broadcastStatus(String(projectId), "error");
    res.status(500).json({ error: "AI generation failed" });
  }
});

export default router;
