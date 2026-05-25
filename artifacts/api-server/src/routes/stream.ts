import { Router } from "express";
import type { Request, Response } from "express";
import fs from "fs";
import path from "path";
import { PROJECTS_BASE_DIR } from "../engines/orchestrator.js";
import { logger } from "../lib/logger.js";

const router = Router();

const projectStreams = new Map<string, Set<Response>>();

export function broadcastToProject(projectId: string, event: Record<string, unknown>): void {
  const clients = projectStreams.get(projectId);
  if (!clients) return;
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  for (const client of clients) {
    try { client.write(payload); } catch (_) {}
  }
}

export function broadcastChunk(projectId: string, content: string): void {
  broadcastToProject(projectId, { type: "chunk", content });
}

export function broadcastFile(projectId: string, name: string, content: string): void {
  broadcastToProject(projectId, { type: "file", name, content });
}

export function broadcastStatus(projectId: string, status: string): void {
  broadcastToProject(projectId, { type: "status", status });
}

export function broadcastMetrics(projectId: string, metrics: Record<string, unknown>): void {
  broadcastToProject(projectId, { type: "metrics", ...metrics });
}

router.get("/projects/:projectId/stream", (req: Request, res: Response) => {
  const { projectId } = req.params;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  if (!projectStreams.has(projectId)) projectStreams.set(projectId, new Set());
  projectStreams.get(projectId)!.add(res);

  res.write(`data: ${JSON.stringify({ type: "connected", projectId })}\n\n`);

  const projectDir = path.join(PROJECTS_BASE_DIR, `project-${projectId}`);
  let watcher: fs.FSWatcher | null = null;

  try {
    if (fs.existsSync(projectDir)) {
      watcher = fs.watch(projectDir, { recursive: true }, (event, filename) => {
        if (!filename) return;
        const filePath = path.join(projectDir, filename);
        try {
          const content = fs.readFileSync(filePath, "utf8");
          broadcastFile(projectId, filename, content);
          broadcastToProject(projectId, { type: "reload" });
        } catch (_) {}
      });
    }
  } catch (err) {
    logger.warn({ err, projectDir }, "Could not watch project dir");
  }

  const keepAlive = setInterval(() => {
    try { res.write(": keepalive\n\n"); } catch (_) {}
  }, 20_000);

  req.on("close", () => {
    clearInterval(keepAlive);
    projectStreams.get(projectId)?.delete(res);
    if (projectStreams.get(projectId)?.size === 0) projectStreams.delete(projectId);
    watcher?.close();
  });
});

router.post("/projects/:projectId/files", async (req: Request, res: Response) => {
  const { projectId } = req.params;
  const { path: filePath, content } = req.body as { path: string; content: string };

  if (!filePath || content === undefined) {
    res.status(400).json({ error: "path and content required" });
    return;
  }

  const safeDir = path.join(PROJECTS_BASE_DIR, `project-${projectId}`);
  const resolved = path.resolve(safeDir, filePath);

  if (!resolved.startsWith(safeDir)) {
    res.status(403).json({ error: "Path traversal not allowed" });
    return;
  }

  try {
    await fs.promises.mkdir(path.dirname(resolved), { recursive: true });
    await fs.promises.writeFile(resolved, content, "utf8");
    broadcastFile(projectId, filePath, content);
    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, "File save error");
    res.status(500).json({ error: "Save failed" });
  }
});

export default router;
