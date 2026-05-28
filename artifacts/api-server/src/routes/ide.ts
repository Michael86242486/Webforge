import { Router } from "express";
import type { Request, Response } from "express";
import path from "path";
import fs from "fs/promises";
import { db, projectsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import { PROJECTS_BASE_DIR, runTerminalCommand } from "../engines/orchestrator.js";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);
const router = Router();

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getWorkDir(projectId: string): Promise<string | null> {
  const asNum = Number(projectId);
  if (!isNaN(asNum)) {
    const [proj] = await db.select().from(projectsTable).where(eq(projectsTable.id, asNum)).limit(1);
    if (proj?.workDir) return proj.workDir;
  }
  // Try slug lookup
  const [proj] = await db.select().from(projectsTable).where(eq(projectsTable.slug, projectId)).limit(1);
  if (proj?.workDir) return proj.workDir;
  // Fallback: scan user-projects dirs
  try {
    const users = await fs.readdir(PROJECTS_BASE_DIR);
    for (const u of users) {
      const uDir = path.join(PROJECTS_BASE_DIR, u);
      const projs = await fs.readdir(uDir).catch(() => []);
      for (const p of projs) {
        if (p === `project-${projectId}` || p === `project-${asNum}`) {
          return path.join(uDir, p);
        }
      }
    }
  } catch {}
  return null;
}

function assertSafe(workDir: string, filePath: string): string {
  const resolved = path.resolve(workDir, filePath.replace(/^\/+/, ""));
  if (!resolved.startsWith(path.resolve(workDir))) {
    throw new Error("Path traversal denied");
  }
  return resolved;
}

const IGNORED = new Set([
  "node_modules", ".git", ".next", ".nuxt", "dist", "__pycache__",
  ".venv", "venv", ".cache", "coverage", ".turbo", "build", ".parcel-cache",
]);

interface FileEntry {
  name: string;
  path: string;
  type: "file" | "directory";
  size?: number;
  children?: FileEntry[];
}

async function buildTree(dir: string, rel = "", depth = 0): Promise<FileEntry[]> {
  if (depth > 6) return [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const result: FileEntry[] = [];
  for (const e of entries) {
    if (IGNORED.has(e.name) || e.name.startsWith(".")) continue;
    const relPath = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) {
      const children = await buildTree(path.join(dir, e.name), relPath, depth + 1);
      result.push({ name: e.name, path: relPath, type: "directory", children });
    } else {
      const stat = await fs.stat(path.join(dir, e.name)).catch(() => null);
      result.push({ name: e.name, path: relPath, type: "file", size: stat?.size ?? 0 });
    }
  }
  return result.sort((a, b) => {
    if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

// ─── GET /ide/:projectId/tree ─────────────────────────────────────────────────

router.get("/ide/:projectId/tree", async (req: Request, res: Response) => {
  const workDir = await getWorkDir(req.params.projectId);
  if (!workDir) { res.status(404).json({ error: "Project not found" }); return; }
  try {
    const tree = await buildTree(workDir);
    res.json({ tree, workDir });
  } catch (err) {
    logger.error({ err }, "ide/tree error");
    res.status(500).json({ error: "Failed to read directory" });
  }
});

// ─── GET /ide/:projectId/file?path=... ───────────────────────────────────────

router.get("/ide/:projectId/file", async (req: Request, res: Response) => {
  const workDir = await getWorkDir(req.params.projectId);
  if (!workDir) { res.status(404).json({ error: "Project not found" }); return; }
  const filePath = String(req.query.path ?? "");
  if (!filePath) { res.status(400).json({ error: "path is required" }); return; }
  try {
    const abs = assertSafe(workDir, filePath);
    const content = await fs.readFile(abs, "utf8");
    const stat = await fs.stat(abs);
    res.json({ content, path: filePath, size: stat.size, mtime: stat.mtime });
  } catch (err: any) {
    if (err.message === "Path traversal denied") { res.status(403).json({ error: err.message }); return; }
    res.status(404).json({ error: "File not found" });
  }
});

// ─── PUT /ide/:projectId/file ─────────────────────────────────────────────────

router.put("/ide/:projectId/file", async (req: Request, res: Response) => {
  const workDir = await getWorkDir(req.params.projectId);
  if (!workDir) { res.status(404).json({ error: "Project not found" }); return; }
  const { path: filePath, content } = req.body as { path: string; content: string };
  if (!filePath) { res.status(400).json({ error: "path is required" }); return; }
  try {
    const abs = assertSafe(workDir, filePath);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, content ?? "", "utf8");
    res.json({ saved: true, path: filePath });
  } catch (err: any) {
    if (err.message === "Path traversal denied") { res.status(403).json({ error: err.message }); return; }
    logger.error({ err }, "ide/file PUT error");
    res.status(500).json({ error: "Failed to save file" });
  }
});

// ─── POST /ide/:projectId/file ─────────────────────────────────────────────────
// Create a new file or directory

router.post("/ide/:projectId/file", async (req: Request, res: Response) => {
  const workDir = await getWorkDir(req.params.projectId);
  if (!workDir) { res.status(404).json({ error: "Project not found" }); return; }
  const { path: filePath, type = "file" } = req.body as { path: string; type?: string };
  if (!filePath) { res.status(400).json({ error: "path is required" }); return; }
  try {
    const abs = assertSafe(workDir, filePath);
    if (type === "directory") {
      await fs.mkdir(abs, { recursive: true });
    } else {
      await fs.mkdir(path.dirname(abs), { recursive: true });
      await fs.writeFile(abs, "", "utf8");
    }
    res.json({ created: true, path: filePath, type });
  } catch (err: any) {
    if (err.message === "Path traversal denied") { res.status(403).json({ error: err.message }); return; }
    res.status(500).json({ error: "Failed to create" });
  }
});

// ─── DELETE /ide/:projectId/file?path=... ─────────────────────────────────────

router.delete("/ide/:projectId/file", async (req: Request, res: Response) => {
  const workDir = await getWorkDir(req.params.projectId);
  if (!workDir) { res.status(404).json({ error: "Project not found" }); return; }
  const filePath = String(req.query.path ?? "");
  if (!filePath) { res.status(400).json({ error: "path is required" }); return; }
  try {
    const abs = assertSafe(workDir, filePath);
    await fs.rm(abs, { recursive: true, force: true });
    res.json({ deleted: true, path: filePath });
  } catch (err: any) {
    if (err.message === "Path traversal denied") { res.status(403).json({ error: err.message }); return; }
    res.status(500).json({ error: "Failed to delete" });
  }
});

// ─── POST /ide/:projectId/rename ───────────────────────────────────────────────

router.post("/ide/:projectId/rename", async (req: Request, res: Response) => {
  const workDir = await getWorkDir(req.params.projectId);
  if (!workDir) { res.status(404).json({ error: "Project not found" }); return; }
  const { from, to } = req.body as { from: string; to: string };
  if (!from || !to) { res.status(400).json({ error: "from and to are required" }); return; }
  try {
    const absFrom = assertSafe(workDir, from);
    const absTo = assertSafe(workDir, to);
    await fs.mkdir(path.dirname(absTo), { recursive: true });
    await fs.rename(absFrom, absTo);
    res.json({ renamed: true, from, to });
  } catch (err: any) {
    if (err.message === "Path traversal denied") { res.status(403).json({ error: err.message }); return; }
    res.status(500).json({ error: "Failed to rename" });
  }
});

// ─── POST /ide/:projectId/run ─────────────────────────────────────────────────
// Run a shell command in the project directory, return output

router.post("/ide/:projectId/run", async (req: Request, res: Response) => {
  const workDir = await getWorkDir(req.params.projectId);
  if (!workDir) { res.status(404).json({ error: "Project not found" }); return; }
  const { command } = req.body as { command: string };
  if (!command) { res.status(400).json({ error: "command is required" }); return; }
  const BLOCKED = /rm\s+-rf\s+\/|mkfs|dd\s+if=|shutdown|reboot|:(){ :|:& };:/;
  if (BLOCKED.test(command)) { res.status(403).json({ error: "Command blocked" }); return; }
  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd: workDir,
      timeout: 30000,
      env: { ...process.env, HOME: workDir, TERM: "xterm-256color" },
    });
    res.json({ stdout, stderr, exitCode: 0 });
  } catch (err: any) {
    res.json({ stdout: err.stdout ?? "", stderr: err.stderr ?? err.message, exitCode: err.code ?? 1 });
  }
});

// ─── POST /ide/:projectId/agent ───────────────────────────────────────────────
// Send a task to the AI agent, stream SSE response

router.post("/ide/:projectId/agent", async (req: Request, res: Response) => {
  const workDir = await getWorkDir(req.params.projectId);
  if (!workDir) { res.status(404).json({ error: "Project not found" }); return; }
  const { message, model = "grok-3" } = req.body as { message: string; model?: string };
  if (!message) { res.status(400).json({ error: "message is required" }); return; }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const send = (data: object) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  try {
    const { routeTask } = await import("../ai/router.js");

    // Read workspace context
    let context = "";
    try {
      const entries = await fs.readdir(workDir, { recursive: true, withFileTypes: true });
      const files = (entries as any[])
        .filter((e: any) => e.isFile?.())
        .map((e: any) => path.relative(workDir, path.join(e.parentPath ?? workDir, e.name)))
        .filter((f: string) => !f.includes("node_modules") && !f.includes(".git"))
        .slice(0, 40);
      context = `Project files:\n${files.join("\n")}`;
    } catch {}

    send({ type: "thinking", text: "Analyzing your project..." });

    const prompt = `You are a Replit-like AI coding agent helping with a project.

${context}

User request: ${message}

Respond with clear explanation, then provide any file changes as JSON like:
{"files": [{"path": "src/index.js", "content": "..."}]}

If no files to change, just respond normally.`;

    const result = await routeTask(
      { role: "user", content: prompt },
      { model, maxTokens: 4096 }
    );

    const text = result.content ?? "";

    // Try to extract file changes
    const fileMatch = text.match(/\{"files":\s*\[[\s\S]*?\]\}/);
    let explanation = text;
    let fileChanges: Array<{ path: string; content: string }> = [];

    if (fileMatch) {
      try {
        const parsed = JSON.parse(fileMatch[0]);
        fileChanges = parsed.files ?? [];
        explanation = text.replace(fileMatch[0], "").trim();
      } catch {}
    }

    send({ type: "response", text: explanation });

    // Apply file changes
    for (const fc of fileChanges) {
      try {
        const abs = assertSafe(workDir, fc.path);
        await fs.mkdir(path.dirname(abs), { recursive: true });
        await fs.writeFile(abs, fc.content, "utf8");
        send({ type: "file_written", path: fc.path });
      } catch (err) {
        send({ type: "error", text: `Failed to write ${fc.path}` });
      }
    }

    if (fileChanges.length > 0) {
      send({ type: "done", filesWritten: fileChanges.length });
    } else {
      send({ type: "done", filesWritten: 0 });
    }
  } catch (err: any) {
    logger.error({ err }, "ide/agent error");
    send({ type: "error", text: err.message ?? "Agent error" });
  }

  res.end();
});

export default router;
