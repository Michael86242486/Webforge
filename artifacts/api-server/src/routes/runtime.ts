import { Router } from "express";
import type { Request, Response } from "express";
import path from "path";
import fs from "fs/promises";
import fsSync from "fs";
import { db, projectsTable, webUsersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { detectFramework } from "../engines/framework-detector.js";
import { autoDetectAndInstall } from "../engines/dependency-engine.js";
import { pollUntilHealthy, runHealthCheck } from "../engines/health-checker.js";
import {
  spawnProjectApp,
  stopSupervisedProcess,
  getProjectLogs,
  getSupervisedProcess,
  findFreePort,
  assignProjectPort,
  watchProjectDir,
  ensureProjectDir,
  PROJECTS_BASE_DIR,
  writeFilesParallel,
} from "../engines/orchestrator.js";
import { broadcastToProject, broadcastLog, broadcastStatus, broadcastRuntimeEvent } from "../lib/websocket-manager.js";
import { requireAuth, optionalAuth } from "../middlewares/jwt-auth.js";
import { logger } from "../lib/logger.js";

const router = Router();

// ─── Runtime Registry (in-memory with disk fallback) ─────────────────────────

interface RuntimeEntry {
  projectId: string;
  owner: string;
  framework: string;
  status: "pending" | "installing" | "building" | "running" | "stopped" | "crashed" | "error";
  port: number | null;
  pid: number | undefined;
  workDir: string;
  liveUrl: string | null;
  healthScore: number;
  createdAt: string;
  updatedAt: string;
  startCommand: string | null;
  buildCommand: string | null;
  logs: string[];
}

const runtimeRegistry = new Map<string, RuntimeEntry>();

function getOrCreateEntry(projectId: string, owner = "anonymous"): RuntimeEntry {
  if (!runtimeRegistry.has(projectId)) {
    runtimeRegistry.set(projectId, {
      projectId,
      owner,
      framework: "unknown",
      status: "pending",
      port: null,
      pid: undefined,
      workDir: path.join(PROJECTS_BASE_DIR, `project-${projectId}`),
      liveUrl: null,
      healthScore: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      startCommand: null,
      buildCommand: null,
      logs: [],
    });
  }
  return runtimeRegistry.get(projectId)!;
}

function appendRuntimeLog(entry: RuntimeEntry, line: string): void {
  const ts = new Date().toISOString().slice(11, 23);
  const logLine = `[${ts}] ${line}`;
  entry.logs.push(logLine);
  if (entry.logs.length > 500) entry.logs.splice(0, entry.logs.length - 500);
  broadcastLog(entry.projectId, logLine);
}

function updateEntry(entry: RuntimeEntry, updates: Partial<RuntimeEntry>): void {
  Object.assign(entry, updates, { updatedAt: new Date().toISOString() });
  broadcastStatus(entry.projectId, entry.status, {
    port: entry.port,
    healthScore: entry.healthScore,
    framework: entry.framework,
  });
}

function buildLiveUrl(req: Request, projectId: string): string {
  const host = req.get("x-forwarded-host") ?? req.get("host") ?? "localhost";
  const proto = req.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}/api/preview-proxy/${projectId}`;
}

// ─── POST /runtime/create ─────────────────────────────────────────────────────

router.post("/runtime/create", optionalAuth, async (req: Request, res: Response) => {
  const {
    projectId,
    files,
    framework: frameworkHint,
    userId,
  } = req.body as {
    projectId?: string;
    files?: Record<string, string>;
    framework?: string;
    userId?: number;
  };

  if (!projectId) {
    res.status(400).json({ error: "projectId is required" });
    return;
  }

  const owner = req.user?.email ?? String(userId ?? "anonymous");
  const entry = getOrCreateEntry(projectId, owner);

  if (entry.status === "running" || entry.status === "building" || entry.status === "installing") {
    res.status(409).json({ error: "Project is already being processed", status: entry.status });
    return;
  }

  res.status(202).json({
    accepted: true,
    projectId,
    message: "Runtime creation started",
  });

  (async () => {
    try {
      updateEntry(entry, { status: "pending" });
      appendRuntimeLog(entry, `🚀 WRE: Starting runtime creation for project ${projectId}`);

      const workDir = path.join(PROJECTS_BASE_DIR, `project-${projectId}`);
      await fs.mkdir(workDir, { recursive: true });
      updateEntry(entry, { workDir });
      appendRuntimeLog(entry, `📁 Work directory: ${workDir}`);

      if (files && Object.keys(files).length > 0) {
        appendRuntimeLog(entry, `📝 Writing ${Object.keys(files).length} files...`);
        await writeFilesParallel(
          Object.entries(files).map(([filePath, content]) => ({
            filePath: path.join(workDir, filePath),
            content,
          }))
        );
        appendRuntimeLog(entry, `✅ Files written successfully`);
      }

      appendRuntimeLog(entry, `🔍 Detecting framework...`);
      const port = await findFreePort(assignProjectPort(Number(projectId.replace(/\D/g, "")) || 1));
      const frameworkInfo = frameworkHint
        ? { framework: frameworkHint as ReturnType<typeof detectFramework> extends Promise<infer T> ? T["framework"] : never, startCommand: `npm start`, buildCommand: null, installCommand: "npm install", envVars: { PORT: String(port) }, confidence: 60, language: "js" as const }
        : await detectFramework(workDir, port);

      updateEntry(entry, {
        framework: frameworkInfo.framework,
        port,
        startCommand: frameworkInfo.startCommand,
        buildCommand: frameworkInfo.buildCommand ?? null,
      });
      appendRuntimeLog(entry, `✅ Framework: ${frameworkInfo.framework} (${frameworkInfo.confidence}% confidence)`);
      appendRuntimeLog(entry, `🔌 Port assigned: ${port}`);

      updateEntry(entry, { status: "installing" });
      appendRuntimeLog(entry, `📦 Installing dependencies...`);

      const depResult = await autoDetectAndInstall(workDir);
      if (!depResult.success) {
        appendRuntimeLog(entry, `⚠️ Dependency install issues: ${depResult.output.slice(0, 200)}`);
      } else {
        appendRuntimeLog(entry, `✅ Dependencies installed in ${depResult.duration}ms`);
      }

      updateEntry(entry, { status: "building" });
      appendRuntimeLog(entry, `🔨 Spawning project application...`);

      const numId = Number(projectId.replace(/\D/g, "")) || Date.now();
      const spawnResult = await spawnProjectApp(workDir, numId, port, projectId);
      updateEntry(entry, { pid: spawnResult.pid, status: "running" });
      appendRuntimeLog(entry, `⚡ Process spawned (pid=${spawnResult.pid})`);

      watchProjectDir(workDir, numId);
      appendRuntimeLog(entry, `👁 Hot-reload watcher active`);

      appendRuntimeLog(entry, `🏥 Running health checks...`);
      const healthReport = await pollUntilHealthy(port, projectId, 90_000, 3_000);

      updateEntry(entry, { healthScore: healthReport.score });
      appendRuntimeLog(entry, `✅ Health: ${healthReport.status} (score: ${healthReport.score}/100)`);

      const liveUrl = buildLiveUrl(req, projectId);
      updateEntry(entry, { liveUrl, status: "running" });

      try {
        await db.update(projectsTable).set({
          status: "running",
          port,
          liveUrl,
          isHosted: true,
          updatedAt: new Date(),
        }).where(eq(projectsTable.id, numId));
      } catch { /* best-effort DB sync */ }

      broadcastRuntimeEvent(projectId, "ready", {
        url: liveUrl,
        health: healthReport.score,
        framework: frameworkInfo.framework,
        port,
      });

      appendRuntimeLog(entry, `🌐 Live URL: ${liveUrl}`);
      logger.info({ projectId, port, liveUrl, health: healthReport.score }, "WRE: project ready");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      updateEntry(entry, { status: "error" });
      appendRuntimeLog(entry, `❌ Runtime error: ${msg}`);
      logger.error({ err, projectId }, "WRE: runtime creation failed");
    }
  })();
});

// ─── POST /runtime/restart ────────────────────────────────────────────────────

router.post("/runtime/restart", optionalAuth, async (req: Request, res: Response) => {
  const { projectId } = req.body as { projectId?: string };
  if (!projectId) { res.status(400).json({ error: "projectId required" }); return; }

  const entry = runtimeRegistry.get(projectId);
  if (!entry) { res.status(404).json({ error: "Project not found in runtime" }); return; }

  const numId = Number(projectId.replace(/\D/g, "")) || 0;
  stopSupervisedProcess(numId);

  await new Promise(r => setTimeout(r, 1000));

  const port = entry.port ?? assignProjectPort(numId);
  try {
    const spawnResult = await spawnProjectApp(entry.workDir, numId, port, projectId);
    updateEntry(entry, { status: "running", pid: spawnResult.pid });
    appendRuntimeLog(entry, `🔄 Process restarted (pid=${spawnResult.pid})`);

    res.json({ success: true, projectId, status: "running" });
  } catch (err) {
    updateEntry(entry, { status: "error" });
    res.status(500).json({ error: "Restart failed", detail: String(err) });
  }
});

// ─── POST /runtime/update ─────────────────────────────────────────────────────

router.post("/runtime/update", optionalAuth, async (req: Request, res: Response) => {
  const { projectId, files } = req.body as {
    projectId?: string; files?: Record<string, string>;
  };

  if (!projectId || !files) { res.status(400).json({ error: "projectId and files required" }); return; }

  const entry = runtimeRegistry.get(projectId);
  if (!entry) { res.status(404).json({ error: "Project not found in runtime" }); return; }

  try {
    await writeFilesParallel(
      Object.entries(files).map(([filePath, content]) => ({
        filePath: path.join(entry.workDir, filePath),
        content,
      }))
    );
    appendRuntimeLog(entry, `📝 Updated ${Object.keys(files).length} files (hot-reload will trigger)`);
    res.json({ success: true, projectId, filesUpdated: Object.keys(files).length });
  } catch (err) {
    res.status(500).json({ error: "File update failed", detail: String(err) });
  }
});

// ─── POST /runtime/delete ─────────────────────────────────────────────────────

router.post("/runtime/delete", optionalAuth, async (req: Request, res: Response) => {
  const { projectId } = req.body as { projectId?: string };
  if (!projectId) { res.status(400).json({ error: "projectId required" }); return; }

  const entry = runtimeRegistry.get(projectId);
  if (!entry) { res.status(404).json({ error: "Project not found in runtime" }); return; }

  const numId = Number(projectId.replace(/\D/g, "")) || 0;
  stopSupervisedProcess(numId);
  runtimeRegistry.delete(projectId);

  try {
    await fs.rm(entry.workDir, { recursive: true, force: true });
    appendRuntimeLog(entry, `🗑 Project deleted`);
  } catch { /* best-effort */ }

  res.json({ success: true, projectId, message: "Project deleted" });
});

// ─── GET /runtime/status/:id ──────────────────────────────────────────────────

router.get("/runtime/status/:id", (req: Request, res: Response) => {
  const { id } = req.params;
  const entry = runtimeRegistry.get(id);

  if (!entry) {
    res.json({
      projectId: id,
      status: "not_found",
      port: null,
      liveUrl: null,
      healthScore: 0,
    });
    return;
  }

  const supervised = getSupervisedProcess(Number(id.replace(/\D/g, "")) || 0);

  res.json({
    projectId: entry.projectId,
    status: entry.status,
    framework: entry.framework,
    port: entry.port,
    pid: entry.pid,
    liveUrl: entry.liveUrl,
    healthScore: entry.healthScore,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    processStatus: supervised?.status ?? "not_supervised",
    restartCount: supervised?.restartCount ?? 0,
  });
});

// ─── GET /runtime/url/:id ─────────────────────────────────────────────────────

router.get("/runtime/url/:id", (req: Request, res: Response) => {
  const { id } = req.params;
  const entry = runtimeRegistry.get(id);

  if (!entry?.liveUrl) {
    res.status(404).json({ error: "No live URL available", projectId: id, status: entry?.status ?? "not_found" });
    return;
  }

  res.json({
    status: entry.status,
    projectId: id,
    url: entry.liveUrl,
    health: entry.healthScore,
    framework: entry.framework,
  });
});

// ─── GET /runtime/logs/:id ────────────────────────────────────────────────────

router.get("/runtime/logs/:id", (req: Request, res: Response) => {
  const { id } = req.params;
  const lines = Number(req.query.lines ?? 100);
  const entry = runtimeRegistry.get(id);
  const supervisedLogs = getProjectLogs(Number(id.replace(/\D/g, "")) || 0, lines);

  const runtimeLogs = entry ? entry.logs.slice(-lines) : [];
  const allLogs = [...runtimeLogs, ...supervisedLogs.split("\n").filter(Boolean)];

  res.json({
    projectId: id,
    logs: allLogs.slice(-lines),
    total: allLogs.length,
  });
});

// ─── GET /runtime/health/:id ──────────────────────────────────────────────────

router.get("/runtime/health/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  const entry = runtimeRegistry.get(id);

  if (!entry?.port) {
    res.json({
      status: "not_running",
      score: 0,
      projectId: id,
      checks: [],
    });
    return;
  }

  try {
    const report = await runHealthCheck(entry.port, id);
    updateEntry(entry, { healthScore: report.score });
    res.json({ ...report, projectId: id });
  } catch (err) {
    res.status(500).json({ error: "Health check failed", detail: String(err) });
  }
});

// ─── GET /runtime/list ────────────────────────────────────────────────────────

router.get("/runtime/list", (_req: Request, res: Response) => {
  const entries = Array.from(runtimeRegistry.values()).map(e => ({
    projectId: e.projectId,
    owner: e.owner,
    framework: e.framework,
    status: e.status,
    port: e.port,
    liveUrl: e.liveUrl,
    healthScore: e.healthScore,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
  }));
  res.json({ projects: entries, total: entries.length });
});

// ─── GET /runtime/metrics ─────────────────────────────────────────────────────

router.get("/runtime/metrics", (_req: Request, res: Response) => {
  const entries = Array.from(runtimeRegistry.values());
  const running = entries.filter(e => e.status === "running").length;
  const crashed = entries.filter(e => e.status === "crashed" || e.status === "error").length;
  const building = entries.filter(e => e.status === "building" || e.status === "installing").length;

  const avgHealth = entries.length > 0
    ? Math.round(entries.reduce((sum, e) => sum + e.healthScore, 0) / entries.length)
    : 0;

  const portsUsed = entries.filter(e => e.port !== null).map(e => e.port!);

  res.json({
    total: entries.length,
    running,
    crashed,
    building,
    stopped: entries.filter(e => e.status === "stopped").length,
    avgHealthScore: avgHealth,
    portsUsed,
    uptime: process.uptime(),
    memoryMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    timestamp: new Date().toISOString(),
  });
});

export default router;
