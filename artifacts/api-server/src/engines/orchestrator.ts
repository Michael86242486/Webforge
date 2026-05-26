import { exec, spawn } from "child_process";
import type { ChildProcess } from "child_process";
import { promisify } from "util";
import net from "net";
import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import { logger } from "../lib/logger.js";
import { recordFileDiff } from "../utils/telemetry.js";
import { routeTaskForModel, routeTask, generateImage, type TaskType } from "../ai/router.js";
import chokidar from "chokidar";

const execAsync = promisify(exec);

export const PROJECTS_BASE_DIR = process.env.PROJECTS_BASE_DIR ?? "/home/runner/workspace/user-projects";
const PORT_RANGE_START = parseInt(process.env.PORT_RANGE_START ?? "5100");

// ─── Swarm Parallel Dispatch ───────────────────────────────────────────────────
// Inspired by ruflo's swarm coordination pattern: dispatch independent task groups
// in parallel using Promise.allSettled so a single agent failure never blocks the
// full build. Each agent runs its own model-routed call concurrently; results are
// collected and settled results are returned.
//
// ruflo tool-group → WebForge model routing:
//   agent_/swarm_/task_  → backend  (Grok-3: multi-file Express architecture)
//   ui / layout          → ui       (Mistral: retro-neon frontend components)
//   hooks_/analyze_      → audit    (Dev-X: code safety, syntax pre-flight)

export interface SwarmAgent {
  id: string;
  taskType: TaskType;
  prompt: string;
  tier?: string;
  telegramId?: number;
}

export interface SwarmResult {
  id: string;
  status: "fulfilled" | "rejected";
  content?: string;
  model?: string;
  error?: string;
}

export async function swarmDispatch(agents: SwarmAgent[]): Promise<SwarmResult[]> {
  logger.info({ agentCount: agents.length }, "swarmDispatch: launching parallel agent swarm");

  const settled = await Promise.allSettled(
    agents.map(agent =>
      routeTask(agent.taskType, agent.prompt, agent.tier ?? "elite", agent.telegramId)
        .then(result => ({ id: agent.id, content: result.content, model: result.model }))
    )
  );

  return settled.map((outcome, i) => {
    const agent = agents[i]!;
    if (outcome.status === "fulfilled") {
      logger.info({ id: agent.id, model: outcome.value.model }, "swarmDispatch: agent fulfilled");
      return { id: agent.id, status: "fulfilled" as const, content: outcome.value.content, model: outcome.value.model };
    } else {
      const errMsg = outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason);
      logger.warn({ id: agent.id, error: errMsg }, "swarmDispatch: agent rejected — continuing swarm");
      return { id: agent.id, status: "rejected" as const, error: errMsg };
    }
  });
}

// ─── Spawn Error Cleanup ───────────────────────────────────────────────────────
// Adapted from openclaw's cleanupFailedAcpSpawn pattern:
// When a project process fails to start, clean up its log files and reset state
// rather than leaving orphaned resources. Best-effort only — never throws.

export async function cleanupFailedSpawn(workDir: string, projectId: number): Promise<void> {
  const filesToClean = ["app.stdout.log", "app.stderr.log"];
  await Promise.allSettled(
    filesToClean.map(f =>
      fs.unlink(path.join(workDir, f)).catch(() => {})
    )
  );
  logger.info({ projectId, workDir }, "cleanupFailedSpawn: log files cleared");
}

// ─── Port Management ──────────────────────────────────────────────────────────

function isPortFree(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const s = net.createServer();
    s.once("error", () => resolve(false));
    s.once("listening", () => { s.close(() => resolve(true)); });
    s.listen(port, "127.0.0.1");
  });
}

export async function findFreePort(preferred: number, maxSearch = 100): Promise<number> {
  for (let offset = 0; offset < maxSearch; offset++) {
    const port = preferred + offset;
    if (await isPortFree(port)) {
      logger.info({ preferred, found: port }, "findFreePort: allocated");
      return port;
    }
  }
  logger.warn({ preferred }, "findFreePort: no free port found, using preferred anyway");
  return preferred;
}

export function assignProjectPort(projectId: number): number {
  return PORT_RANGE_START + (projectId % 900);
}

// ─── Process Supervisor ───────────────────────────────────────────────────────
// Tracks every spawned project process globally with in-memory log ring buffers.
// Enables: live /logs access, auto-restart on crash, graceful hot-reload.

const LOG_RING_SIZE = 500;

interface SupervisedProcess {
  child: ChildProcess | null;
  port: number;
  workDir: string;
  projectId: number;
  slug?: string;
  logs: string[];
  autoRestart: boolean;
  restartCount: number;
  status: "running" | "crashed" | "stopped" | "restarting";
  watcher: ReturnType<typeof chokidar.watch> | null;
  debounceTimer: NodeJS.Timeout | null;
}

const processRegistry = new Map<number, SupervisedProcess>();

function appendLog(rec: SupervisedProcess, line: string): void {
  const ts = new Date().toISOString().slice(11, 23);
  rec.logs.push(`[${ts}] ${line}`);
  if (rec.logs.length > LOG_RING_SIZE) rec.logs.splice(0, rec.logs.length - LOG_RING_SIZE);
}

export function getProjectLogs(projectId: number, lines = 80): string {
  const rec = processRegistry.get(projectId);
  if (!rec || rec.logs.length === 0) return "";
  return rec.logs.slice(-lines).join("\n");
}

export function getSupervisedProcess(projectId: number): SupervisedProcess | undefined {
  return processRegistry.get(projectId);
}

function spawnSupervisedChild(rec: SupervisedProcess): void {
  const { workDir, projectId, port } = rec;

  // Clear disk logs for fresh capture
  try {
    fsSync.writeFileSync(path.join(workDir, "app.stdout.log"), "");
    fsSync.writeFileSync(path.join(workDir, "app.stderr.log"), "");
  } catch { /* non-fatal */ }

  const entry = path.join(workDir, "src/index.js");
  const entryExists = fsSync.existsSync(entry);
  const nodeEntry = entryExists ? "src/index.js" : "index.js";

  const child = spawn("node", [nodeEntry], {
    cwd: workDir,
    env: { ...process.env, PORT: String(port), HOST: "0.0.0.0", BIND_HOST: "0.0.0.0", NODE_ENV: "production" },
    stdio: ["ignore", "pipe", "pipe"],
  });

  rec.child = child;
  rec.status = "running";
  appendLog(rec, `⚡ Process started (pid=${child.pid}, port=${port})`);

  // Capture stdout
  child.stdout?.on("data", (chunk: Buffer) => {
    const lines = chunk.toString().split("\n").filter(Boolean);
    for (const l of lines) {
      appendLog(rec, `[stdout] ${l}`);
      fsSync.appendFileSync(path.join(workDir, "app.stdout.log"), l + "\n");
    }
  });

  // Capture stderr
  child.stderr?.on("data", (chunk: Buffer) => {
    const lines = chunk.toString().split("\n").filter(Boolean);
    for (const l of lines) {
      appendLog(rec, `[stderr] ${l}`);
      fsSync.appendFileSync(path.join(workDir, "app.stderr.log"), l + "\n");
    }
  });

  child.on("exit", (code, signal) => {
    appendLog(rec, `🔴 Process exited (code=${code}, signal=${signal})`);
    rec.status = "crashed";
    logger.warn({ projectId, port, code, signal }, "Supervised process exited");

    if (rec.autoRestart && rec.restartCount < 5) {
      rec.restartCount++;
      rec.status = "restarting";
      appendLog(rec, `🔄 Auto-restart #${rec.restartCount} in 3s...`);
      setTimeout(() => {
        if (processRegistry.get(projectId) === rec) {
          spawnSupervisedChild(rec);
        }
      }, 3000);
    }
  });

  child.on("error", (err) => {
    appendLog(rec, `❌ Spawn error: ${err.message}`);
    logger.error({ projectId, err }, "Supervised process spawn error");
  });

  logger.info({ projectId, port, pid: child.pid }, "ProcessSupervisor: child spawned");
}

export function stopSupervisedProcess(projectId: number): void {
  const rec = processRegistry.get(projectId);
  if (!rec) return;
  rec.autoRestart = false;
  rec.status = "stopped";
  if (rec.child) {
    try { rec.child.kill("SIGTERM"); } catch { }
    rec.child = null;
  }
}

// ─── Hot-Reload File Watcher ──────────────────────────────────────────────────
// Watches a project directory with chokidar. When any source file changes
// (excludes node_modules and .git), the supervised process is gracefully
// restarted without a full AI rebuild — instant hot-reload.

export function watchProjectDir(workDir: string, projectId: number): void {
  const rec = processRegistry.get(projectId);
  if (!rec) { logger.warn({ projectId }, "watchProjectDir: no registry entry — call spawnProjectApp first"); return; }
  if (rec.watcher) return; // already watching

  const watcher = chokidar.watch(workDir, {
    ignored: [/node_modules/, /\.git/, /\.log$/],
    ignoreInitial: true,
    persistent: true,
    awaitWriteFinish: { stabilityThreshold: 400, pollInterval: 100 },
  });

  const triggerReload = (filePath: string) => {
    if (rec.debounceTimer) clearTimeout(rec.debounceTimer);
    rec.debounceTimer = setTimeout(async () => {
      appendLog(rec, `📁 File changed: ${path.relative(workDir, filePath)} — hot-reloading...`);
      logger.info({ projectId, filePath }, "Hot-reload: file changed, restarting process");

      // Graceful restart: SIGTERM → wait → respawn
      if (rec.child) {
        try { rec.child.kill("SIGTERM"); } catch { }
        rec.child = null;
        await new Promise(r => setTimeout(r, 1200));
      }
      rec.restartCount = 0; // reset restart counter on intentional reload
      spawnSupervisedChild(rec);
    }, 500);
  };

  watcher.on("change", triggerReload);
  watcher.on("add",    triggerReload);
  rec.watcher = watcher;
  appendLog(rec, `👁 File watcher active on ${workDir}`);
  logger.info({ projectId, workDir }, "watchProjectDir: watcher started");
}

export function stopProjectWatcher(projectId: number): void {
  const rec = processRegistry.get(projectId);
  if (!rec?.watcher) return;
  rec.watcher.close().catch(() => {});
  rec.watcher = null;
  appendLog(rec, "🛑 File watcher stopped");
}

// ─── Ground Truth Disk Scanner ────────────────────────────────────────────────
// Reads the current project directory and produces a structured context block
// that is injected into every AI generation prompt. This gives the model
// ground-truth knowledge of what exists on disk BEFORE it writes new code.

export async function scanWorkspaceDirContext(workDir: string): Promise<string> {
  try {
    let files: string[] = [];
    try {
      const entries = await fs.readdir(workDir, { recursive: true, withFileTypes: true });
      files = entries
        .filter(e => e.isFile() && !e.parentPath?.includes("node_modules") && !e.parentPath?.includes(".git") && !e.name.endsWith(".log"))
        .map(e => path.relative(workDir, path.join(e.parentPath ?? workDir, e.name)))
        .sort();
    } catch { return ""; }

    if (files.length === 0) return "";

    let pkgCtx = "";
    try {
      const pkg = await fs.readFile(path.join(workDir, "package.json"), "utf8");
      const parsed = JSON.parse(pkg) as { dependencies?: Record<string, string>; scripts?: Record<string, string> };
      const deps = Object.keys(parsed.dependencies ?? {}).join(", ") || "none";
      const scripts = Object.entries(parsed.scripts ?? {}).map(([k, v]) => `${k}: ${v}`).join(", ");
      pkgCtx = `\nINSTALLED DEPS: ${deps}\nSCRIPTS: ${scripts}`;
    } catch { /* no package.json yet */ }

    return `EXISTING FILES ON DISK (${files.length} files):${pkgCtx}\n${files.map(f => `  - ${f}`).join("\n")}`;
  } catch {
    return "";
  }
}

// ─── Directory & File Ops ─────────────────────────────────────────────────────

export async function ensureProjectDir(projectId: number, userId: number, slug?: string): Promise<string> {
  const dirName = slug ? `project-${slug}` : `project-${projectId}`;
  const dir = path.join(PROJECTS_BASE_DIR, `user-${userId}`, dirName);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export interface FilePlan {
  path: string;
  description: string;
}

export interface FileTask {
  filePath: string;
  content: string;
}

export async function writeFilesParallel(tasks: FileTask[], sessionId?: string): Promise<void> {
  await Promise.all(
    tasks.map(async ({ filePath, content }) => {
      let before = "";
      try { before = await fs.readFile(filePath, "utf8"); } catch (_) {}
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, content, "utf8");
      if (sessionId) recordFileDiff(sessionId, before, content);
    })
  );
}

export async function readProjectFile(filePath: string): Promise<string> {
  return fs.readFile(filePath, "utf8");
}

export async function deleteProjectFile(filePath: string): Promise<void> {
  await fs.unlink(filePath);
}

export async function listProjectFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { recursive: true, withFileTypes: true });
  return entries.filter(e => e.isFile()).map(e => path.join(e.parentPath ?? dir, e.name));
}

// ─── Terminal ─────────────────────────────────────────────────────────────────

export async function runTerminalCommand(
  command: string,
  cwd: string,
  timeoutMs = 120_000,
): Promise<{ stdout: string; stderr: string }> {
  logger.info({ command, cwd }, "Running terminal command");
  try {
    const result = await execAsync(command, { cwd, timeout: timeoutMs });
    return { stdout: result.stdout, stderr: result.stderr };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    return { stdout: e.stdout ?? "", stderr: e.stderr ?? e.message ?? "Unknown error" };
  }
}

// ─── Process Spawning ─────────────────────────────────────────────────────────

export function spawnBotProcess(workDir: string, entryFile: string, env: NodeJS.ProcessEnv): { pid: number | undefined } {
  const child = spawn("node", [entryFile], {
    cwd: workDir,
    env: { ...process.env, ...env },
    detached: true,
    stdio: "ignore",
  });
  child.unref();
  return { pid: child.pid };
}

export async function detectEntryPoint(workDir: string): Promise<string> {
  try {
    const raw = await fs.readFile(path.join(workDir, "package.json"), "utf8");
    const pkg = JSON.parse(raw) as { scripts?: Record<string, string>; main?: string };
    if (pkg.scripts?.start) {
      const m = pkg.scripts.start.match(/node\s+([\w./src-]+\.m?js)/);
      if (m) return m[1];
    }
    if (pkg.main) return pkg.main;
  } catch (_) {}
  for (const p of ["src/index.js","src/server.js","src/app.js","index.js","server.js","app.js"]) {
    try { await fs.access(path.join(workDir, p)); return p; } catch (_) {}
  }
  return "index.js";
}

export async function spawnProjectApp(
  workDir: string,
  projectId: number,
  port: number,
  slug?: string,
): Promise<{ pid: number | undefined }> {
  // Kill any existing supervised process for this project
  const existing = processRegistry.get(projectId);
  if (existing?.child) {
    try { existing.child.kill("SIGTERM"); } catch { }
    existing.child = null;
    await new Promise(r => setTimeout(r, 800));
  }

  // Build a fresh registry entry
  const rec: SupervisedProcess = {
    child: null,
    port,
    workDir,
    projectId,
    slug,
    logs: [],
    autoRestart: true,
    restartCount: 0,
    status: "running",
    watcher: existing?.watcher ?? null, // keep existing watcher if any
    debounceTimer: null,
  };
  processRegistry.set(projectId, rec);

  appendLog(rec, `🚀 Launching project ${slug ?? projectId} on port ${port}`);
  spawnSupervisedChild(rec);

  logger.info({ projectId, port, slug, pid: rec.child?.pid }, "spawnProjectApp: supervised spawn registered");
  return { pid: rec.child?.pid };
}

export async function pollAppHealth(port: number, maxMs = 90_000, intervalMs = 2_500): Promise<boolean> {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 1500);
      await fetch(`http://localhost:${port}/`, { signal: ctrl.signal });
      clearTimeout(timer);
      return true;
    } catch (_) {
      await new Promise(r => setTimeout(r, intervalMs));
    }
  }
  return false;
}

// ─── Syntax Audit Loop ────────────────────────────────────────────────────────

export interface SyntaxError { file: string; error: string; }

export async function syntaxAuditFiles(workDir: string): Promise<SyntaxError[]> {
  const errors: SyntaxError[] = [];
  let allFiles: string[] = [];
  try { allFiles = await listProjectFiles(workDir); } catch (_) { return []; }

  const jsFiles = allFiles
    .filter(f => (f.endsWith(".js") || f.endsWith(".mjs")) && !f.includes("node_modules"))
    .map(f => path.relative(workDir, f));

  for (const relFile of jsFiles) {
    const result = await runTerminalCommand(`node --check "${relFile}" 2>&1`, workDir, 8_000);
    const output = (result.stdout + result.stderr).trim();
    if (output && !output.toLowerCase().includes("node:internal")) {
      // Only report actual syntax errors
      if (/SyntaxError|unexpected|unterminated|missing|illegal|invalid/i.test(output)) {
        errors.push({ file: relFile, error: output.split("\n").slice(0, 3).join(" ") });
        logger.warn({ file: relFile, error: output.slice(0, 200) }, "Syntax error found");
      }
    }
  }
  return errors;
}

export async function patchSyntaxError(
  workDir: string,
  fileRel: string,
  errorMsg: string,
  routeTaskFn: (prompt: string) => Promise<string>,
): Promise<boolean> {
  try {
    const fullPath = path.join(workDir, fileRel);
    const original = await fs.readFile(fullPath, "utf8");
    const patch = await routeTaskFn(
      `Fix this JavaScript syntax error and return ONLY the corrected complete file — no explanation, no markdown fences:\n\nFile: ${fileRel}\nError: ${errorMsg}\n\nCode:\n${original}`
    );
    // Strip any accidental markdown
    const cleaned = patch.replace(/^```[\w]*\n?/, "").replace(/\n?```$/, "").trim();
    if (cleaned.length > 50) {
      await fs.writeFile(fullPath, cleaned, "utf8");
      logger.info({ fileRel }, "Syntax error auto-patched");
      return true;
    }
  } catch (err) {
    logger.warn({ err, fileRel }, "patchSyntaxError failed");
  }
  return false;
}

// ─── Smart Dependency Extractor ───────────────────────────────────────────────

export function extractRequiredPackages(code: string): string[] {
  const packages = new Set<string>();
  // CommonJS: require('pkg') or require("pkg")
  const cjsMatches = code.matchAll(/require\(['"]([^./'"@][^'"]*)['"]\)/g);
  for (const m of cjsMatches) {
    const pkg = m[1].split("/")[0]; // handle 'express/router' → 'express'
    if (pkg) packages.add(pkg);
  }
  // ESM: import ... from 'pkg'
  const esmMatches = code.matchAll(/from ['"]([^./'"@][^'"]*)['"]/g);
  for (const m of esmMatches) {
    const pkg = m[1].split("/")[0];
    if (pkg) packages.add(pkg);
  }
  // Filter out Node built-ins
  const builtins = new Set(["fs","path","http","https","os","net","crypto","stream","util","events","url","querystring","child_process","process","buffer","assert","readline","timers","perf_hooks","cluster","worker_threads","v8","vm","module","console","global","__dirname","__filename"]);
  return [...packages].filter(p => !builtins.has(p));
}

// ─── Autonomous README Compiler ───────────────────────────────────────────────

export async function generateReadme(
  workDir: string,
  description: string,
  plan: PlanningResult,
  liveUrl: string,
  routeTaskFn: (prompt: string) => Promise<string>,
): Promise<void> {
  try {
    const fileList = plan.manifest.map(f => `- \`${f.path}\` — ${f.description}`).join("\n");
    const prompt = `Write a professional README.md for this project. Return ONLY the markdown content, nothing else.

Project: "${description}"
Tech Stack: ${plan.techStack}
Live URL: ${liveUrl}

Files built:
${fileList}

The README must include:
1. # Project Title (infer from description)
2. One-paragraph description
3. ## Tech Stack section with bullet list
4. ## Getting Started with: npm install, then npm start (PORT env var note)
5. ## Features (5-7 specific features based on the project)
6. ## API Routes (if Express, list GET/POST routes from the file descriptions)
7. ## Feature Roadmap (5 future improvements)
8. ## Deployed with WebForge — ${liveUrl}

Use clean, professional Markdown. Include code blocks where appropriate.`;

    const content = await routeTaskFn(prompt);
    await fs.writeFile(path.join(workDir, "README.md"), content, "utf8");
    logger.info({ workDir }, "README.md generated");
  } catch (err) {
    logger.warn({ err }, "generateReadme failed — skipping");
  }
}

// ─── Planning Mode ────────────────────────────────────────────────────────────

export interface PlanningResult {
  manifest: FilePlan[];
  techStack: string;
  summary: string;
  colorScheme?: string;
  designSystem?: string;
}

// ─── Planning JSON Repair Utilities ──────────────────────────────────────────

/** Attempt to close a truncated JSON string so JSON.parse can succeed. */
function repairTruncatedJson(raw: string): string {
  let s = raw.trim();
  // Remove trailing partial token (cut off mid-word, mid-key, mid-string)
  s = s.replace(/,\s*$/, "");               // trailing comma
  s = s.replace(/"[^"]*$/, '"..."');        // unclosed string — close it
  // Count unmatched braces/brackets and close them
  let braces = 0, brackets = 0;
  for (const ch of s) {
    if (ch === "{") braces++;
    else if (ch === "}") braces--;
    else if (ch === "[") brackets++;
    else if (ch === "]") brackets--;
  }
  while (brackets > 0) { s += "]"; brackets--; }
  while (braces > 0)   { s += "}"; braces--; }
  return s;
}

/**
 * Last-resort line scanner: pull "path" values from raw AI output
 * even when the JSON structure is completely broken.
 */
function extractFilePathsFromLines(raw: string): FilePlan[] {
  const files: FilePlan[] = [];
  const seen = new Set<string>();
  // Match: "path": "src/index.js"  or  path: src/index.js
  const re = /['""]?path['""]?\s*:\s*['""]?([^\s,}"']+\.[a-zA-Z]{1,5})['""]?/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    const p = m[1].trim().replace(/^\//, "");
    if (p && !seen.has(p)) {
      seen.add(p);
      // Try to grab description from the same line
      const lineStart = raw.lastIndexOf("\n", m.index) + 1;
      const lineEnd = raw.indexOf("\n", m.index + m[0].length);
      const line = raw.slice(lineStart, lineEnd === -1 ? undefined : lineEnd);
      const descMatch = line.match(/['""]?description['""]?\s*:\s*['""]([^'"]+)['""]?/i);
      files.push({ path: p, description: descMatch?.[1] ?? p });
    }
  }
  return files;
}

export async function planningMode(
  userPrompt: string,
  routeTaskFn: (taskType: "planning", prompt: string, tier: string, telegramId?: number, systemPrompt?: string) => Promise<{ content: string; model: string }>,
  telegramId: number,
  tier: string,
): Promise<PlanningResult> {
  const planPrompt = `You are a strict, defensive staff engineer architecting a software project. Output ONLY valid JSON (no markdown fences, no prose).

User request: "${userPrompt}"

DEFENSIVE ENGINEERING RULES (non-negotiable):
- If the request contradicts a real architectural constraint (e.g. browser can't access a filesystem, a single-page app can't have a real database without a backend), do NOT attempt to write fake code. Instead, choose the correct architecture.
- NEVER hallucinate package names. Only use well-known npm packages (express, cors, sqlite3, mongoose, jsonwebtoken, bcrypt, socket.io, dotenv, etc.)
- If the user request is vague or contradictory, choose the simplest correct interpretation — not the most complex one.
- ALL server files MUST use CommonJS (require/module.exports) — NEVER ES modules, NEVER TypeScript.
- ALL server entry points MUST bind to 0.0.0.0 on process.env.PORT — no hardcoded ports, no localhost-only binding.

JSON format:
{
  "techStack": "Node.js + Express + SQLite",
  "summary": "One sentence describing the app",
  "files": [
    { "path": "package.json", "description": "Node.js manifest with start script" },
    { "path": "src/index.js", "description": "Express server, listens on process.env.PORT" },
    { "path": "src/routes/api.js", "description": "REST API routes" },
    { "path": "public/index.html", "description": "Main HTML page — use RELATIVE paths for all assets (not /style.css but style.css)" },
    { "path": "public/style.css", "description": "Styles" },
    { "path": "public/app.js", "description": "Frontend JavaScript" }
  ]
}

RULES:
- Use plain JavaScript (CommonJS require/exports) — NO TypeScript, NO ES modules
- package.json must have: { "scripts": { "start": "node src/index.js" } }
- Server MUST bind to 0.0.0.0 explicitly: app.listen(PORT, '0.0.0.0', () => { ... })
- Server must use process.env.PORT
- ALL HTML files: use RELATIVE asset paths (href="style.css" NOT href="/style.css") so assets load correctly through the proxy
- Target 8-14 files for a complete app
- Return ONLY the JSON object — no markdown fences, no explanation before or after`;

  // ── Attempt 1: primary planning call ──────────────────────────────────────
  let rawContent = "";
  let techStack = "Node.js + Express";
  let summary = userPrompt.slice(0, 80);

  const attemptParse = (raw: string): { manifest: FilePlan[]; techStack: string; summary: string; colorScheme?: string; designSystem?: string } | null => {
    if (!raw || raw.trim().length < 10) return null;

    // ① Strip markdown fences if the model disobeyed
    let cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();

    // ② Try direct parse first
    let parsed: { techStack?: string; summary?: string; files?: FilePlan[]; colorScheme?: string; designSystem?: string } | null = null;
    try {
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) parsed = JSON.parse(match[0]);
    } catch {
      // ③ JSON was truncated — attempt structural repair
      logger.warn({ rawLen: raw.length }, "planningMode: JSON truncated — attempting repair");
      console.log(`[Planning] ⚠️ JSON truncated (${raw.length} chars), running repair...`);
      try {
        const match = cleaned.match(/\{[\s\S]*/);
        if (match) {
          const repaired = repairTruncatedJson(match[0]);
          parsed = JSON.parse(repaired);
          console.log("[Planning] ✅ JSON repair succeeded");
        }
      } catch (repairErr) {
        logger.warn({ repairErr }, "planningMode: repair also failed — trying line scanner");
      }
    }

    if (parsed) {
      const files = parsed.files ?? [];
      // Filter out any malformed entries
      const validFiles = files.filter(f => f.path && typeof f.path === "string" && f.path.includes("."));
      return {
        manifest: validFiles,
        techStack: parsed.techStack ?? techStack,
        summary: parsed.summary ?? summary,
        colorScheme: parsed.colorScheme,
        designSystem: parsed.designSystem,
      };
    }

    // ④ Structural parse fully failed — line-by-line path scanner
    console.log("[Planning] 🔍 Running line-scanner fallback...");
    const scanned = extractFilePathsFromLines(raw);
    if (scanned.length > 0) {
      console.log(`[Planning] 📂 Line scanner found ${scanned.length} paths`);
      return { manifest: scanned, techStack, summary, colorScheme: undefined, designSystem: undefined };
    }

    return null;
  };

  // ── Phase 1: Mistral Creative Architect ───────────────────────────────────
  const mistralArchitectPrompt = `You are the Creative Architect for a web application. Design the project structure and aesthetic — do NOT write any source code.

User wants to build: "${userPrompt}"

Return ONLY valid JSON (no markdown fences, no prose, no explanation):
{
  "techStack": "Node.js + Express",
  "summary": "One sentence describing the app",
  "colorScheme": "Dark background #0a0e14, primary accent #58a6ff (electric blue), success #3fb950, text #cdd9e5 (light gray), error #f85149 (red)",
  "designSystem": "Glassmorphism cards with backdrop-filter blur, smooth CSS transitions (0.3s ease), Inter font, bold section headings, gradient CTAs, animated hover states",
  "files": [
    { "path": "package.json", "description": "Node.js manifest with start script" },
    { "path": "src/index.js", "description": "Express server, listens on process.env.PORT" },
    { "path": "public/index.html", "description": "Main HTML with beautiful dark themed UI" },
    { "path": "public/style.css", "description": "Production CSS: glassmorphism, animations, responsive grid" },
    { "path": "public/app.js", "description": "Frontend JavaScript: API calls, dynamic UI updates" }
  ]
}

RULES:
- Use plain JavaScript (CommonJS require/module.exports) — NO TypeScript, NO ES modules
- package.json must have: { "scripts": { "start": "node src/index.js" } }
- Server MUST bind to 0.0.0.0 explicitly: app.listen(PORT, '0.0.0.0', () => { ... })
- Server must read process.env.PORT
- Target 8-14 files for a complete, production-quality app
- Make colorScheme and designSystem specific and beautiful for this particular app type
- Return ONLY the JSON object — no markdown, no explanation before or after`;

  try {
    const mistralResult = await routeTaskForModel("mistral", mistralArchitectPrompt, undefined, telegramId, 4096);
    rawContent = mistralResult.content;
    console.log(`[Planning] 🏛️ Mistral Architect returned ${rawContent.length} chars`);
    logger.info({ contentLen: rawContent.length }, "planningMode: Mistral Architect response received");
  } catch (mistralErr) {
    logger.warn({ mistralErr }, "planningMode: Mistral failed — falling back to routeTaskFn");
    try {
      const result = await routeTaskFn("planning", planPrompt, tier, telegramId);
      rawContent = result.content;
      console.log(`[Planning] Fallback call returned ${rawContent.length} chars`);
      logger.info({ contentLen: rawContent.length }, "planningMode: fallback response received");
    } catch (err) {
      logger.warn({ err }, "planningMode: all planning calls failed");
    }
  }

  // ── Try to extract a valid manifest ───────────────────────────────────────
  let planResult = attemptParse(rawContent);

  // ── Hard file count floor — if manifest is empty, silent retry ────────────
  if (!planResult || planResult.manifest.length === 0) {
    console.log("[Planning] ❌ Files === 0 — triggering silent corrective retry...");
    logger.warn({ userPrompt: userPrompt.slice(0, 80) }, "planningMode: empty manifest — retrying with corrective instruction");

    const retryPrompt = `Your previous manifest structure was malformed or incomplete. Provide a valid, clean, unbroken file array list now.

User request: "${userPrompt}"

Return ONLY this exact JSON structure with 8-12 files — no markdown, no prose, no truncation:
{
  "techStack": "Node.js + Express",
  "summary": "Brief one-sentence app description",
  "files": [
    { "path": "package.json", "description": "Project manifest" },
    { "path": "src/index.js", "description": "Express entry point using process.env.PORT" },
    { "path": "src/routes/api.js", "description": "API endpoints" },
    { "path": "public/index.html", "description": "Main page" },
    { "path": "public/style.css", "description": "Stylesheet" },
    { "path": "public/app.js", "description": "Client JavaScript" },
    { "path": "src/middleware/auth.js", "description": "Auth middleware" },
    { "path": "README.md", "description": "Documentation" }
  ]
}`;

    try {
      const retryResult = await routeTaskFn("planning", retryPrompt, tier, telegramId);
      console.log(`[Planning] Retry returned ${retryResult.content.length} chars`);
      planResult = attemptParse(retryResult.content);
    } catch (retryErr) {
      logger.warn({ retryErr }, "planningMode: retry call also failed");
    }
  }

  // ── Final fallback — guaranteed 7-file manifest ───────────────────────────
  if (!planResult || planResult.manifest.length === 0) {
    logger.warn({ userPrompt: userPrompt.slice(0, 80) }, "planningMode: both attempts failed — using guaranteed fallback manifest");
    console.log("[Planning] 🛡️ Using guaranteed fallback manifest");
    return {
      manifest: [
        { path: "package.json", description: "Project manifest" },
        { path: "src/index.js", description: "Express server" },
        { path: "src/routes/api.js", description: "API routes" },
        { path: "public/index.html", description: "Main HTML" },
        { path: "public/style.css", description: "Styles" },
        { path: "public/app.js", description: "Frontend JS" },
        { path: "README.md", description: "Documentation" },
      ],
      techStack: "Node.js + Express",
      summary: userPrompt.slice(0, 80),
    };
  }

  console.log(`[Planning] ✅ Manifest locked — ${planResult.manifest.length} files, stack: ${planResult.techStack}`);
  return planResult;
}

// ─── File Parser (multi-format) ───────────────────────────────────────────────

export interface ParsedFile { path: string; content: string; }

export function parseFilesFromAIOutput(output: string, manifest?: FilePlan[]): ParsedFile[] {
  const files: ParsedFile[] = [];
  const seen = new Set<string>();

  function add(filePath: string, content: string) {
    const clean = filePath.trim().replace(/^\/+/, "");
    const body = content.trim();
    if (!clean || !body || seen.has(clean)) return;
    seen.add(clean);
    files.push({ path: clean, content: body });
  }

  // Format 1: === FILE: path === ... === END FILE ===
  const fmt1 = /===\s*FILE:\s*(.+?)\s*===\n([\s\S]*?)(?====\s*(?:FILE:|END\s*FILE)|$)/gi;
  let m: RegExpExecArray | null;
  while ((m = fmt1.exec(output)) !== null) {
    add(m[1], m[2].replace(/===\s*END\s*FILE\s*===/i, "").trim());
  }
  if (files.length > 0) return files;

  // Format 2: heading / bold before code block
  const fmt2 = /(?:\/\/\s*FILE:\s*|#\s*FILE:\s*|\*\*`?|##?\s+)([^\n`*]+)`?\*?\*?\n```[\w]*\n([\s\S]*?)```/gi;
  while ((m = fmt2.exec(output)) !== null) add(m[1], m[2]);
  if (files.length > 0) return files;

  // Format 3: code block where first line is a path comment
  const fmt3 = /```[\w.-]*\n([\s\S]*?)```/gi;
  const codeBlocks: string[] = [];
  while ((m = fmt3.exec(output)) !== null) codeBlocks.push(m[1]);

  for (const block of codeBlocks) {
    const firstLine = block.split("\n")[0] ?? "";
    const pathMatch = firstLine.match(/^(?:\/\/|#|\/\*)\s*([\w./src-]+\.\w{1,5})/);
    if (pathMatch) add(pathMatch[1], block.split("\n").slice(1).join("\n").trim());
  }
  if (files.length > 0) return files;

  // Format 4: manifest order matching
  if (manifest && codeBlocks.length > 0) {
    for (let i = 0; i < Math.min(codeBlocks.length, manifest.length); i++) {
      const block = codeBlocks[i];
      const plan = manifest[i];
      if (block && plan && block.trim().length > 20) add(plan.path, block.trim());
    }
  }

  return files;
}

// ─── Build Project Files ──────────────────────────────────────────────────────

const MIN_FILE_CHARS = 50; // Minimum content length — anything shorter is a generation failure

export async function buildProjectFiles(
  workDir: string,
  aiOutput: string,
  projectId: string,
  manifest: FilePlan[],
  onFileWritten: (filesWritten: number, filePath: string) => void,
  retryGenerationFn?: (filename: string, description: string, attempt: number) => Promise<string>,
): Promise<number> {
  const parsed = parseFilesFromAIOutput(aiOutput, manifest);
  logger.info({ projectId, parsedCount: parsed.length, outputLen: aiOutput.length }, "buildProjectFiles parsed");

  let toWrite: ParsedFile[];
  if (parsed.length === 0) {
    logger.warn({ projectId }, "No files parsed — using guaranteed fallback app");
    toWrite = generateGuaranteedApp(manifest);
  } else {
    const parsedPaths = new Set(parsed.map(f => f.path));
    const stubs = manifest
      .filter(m => !parsedPaths.has(m.path))
      .map(m => ({ path: m.path, content: generateStubFile(m) }));
    toWrite = [...parsed, ...stubs];
  }

  let written = 0;

  for (const file of toWrite) {
    const absPath = path.join(workDir, file.path);
    let content = file.content;

    // ── Generation Integrity Gate ────────────────────────────────────────────
    // Skip README, gitignore, .env — they can legitimately be short
    const isShortAllowed = /\.(md|env|gitignore|txt|json)$/i.test(file.path);
    const isTooShort = content.trim().length < MIN_FILE_CHARS;

    if (isTooShort && !isShortAllowed) {
      const failureMsg = `Generation Integrity Failure: Code payload for "${file.path}" is missing or too small (${content.trim().length} chars).`;
      logger.warn({ projectId, file: file.path, size: content.trim().length }, failureMsg);
      console.log(`[Integrity Gate] ❌ ${failureMsg}`);

      // ── Retry loop — escalate to heavy reasoning model ────────────────────
      if (retryGenerationFn) {
        let retryContent = "";
        const maxRetries = 3;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          console.log(`[Integrity Gate] 🔄 Retry ${attempt}/${maxRetries} for ${file.path}`);
          try {
            retryContent = await retryGenerationFn(file.path, manifest.find(m => m.path === file.path)?.description ?? file.path, attempt);
            if (retryContent.trim().length >= MIN_FILE_CHARS) {
              console.log(`[Integrity Gate] ✅ Retry ${attempt} succeeded for ${file.path} (${retryContent.trim().length} chars)`);
              content = retryContent;
              break;
            }
            logger.warn({ projectId, file: file.path, attempt }, "Integrity retry still too short");
          } catch (retryErr) {
            logger.warn({ retryErr, file: file.path, attempt }, "Integrity retry failed");
          }
        }
        // If all retries failed, generate a stub so the build continues
        if (content.trim().length < MIN_FILE_CHARS) {
          console.log(`[Integrity Gate] ⚠️ All retries failed for ${file.path} — using intelligent stub`);
          content = generateStubFile(manifest.find(m => m.path === file.path) ?? { path: file.path, description: file.path });
        }
      } else {
        // No retry function — use stub
        content = generateStubFile(manifest.find(m => m.path === file.path) ?? { path: file.path, description: file.path });
      }
    }

    await fs.mkdir(path.dirname(absPath), { recursive: true });
    await fs.writeFile(absPath, content, "utf8");
    written++;
    onFileWritten(written, file.path);
    logger.info({ projectId, file: file.path, size: content.length }, "File written");
    console.log(`[BuildFiles] ✍️  ${file.path} — ${content.length} chars`);
  }

  const totalCost = toWrite.reduce((sum, f) => sum + f.content.length, 0);
  const estimatedCost = (totalCost / 1000) * 0.002; // rough estimate: ~$0.002 per 1k chars
  console.log(`[BuildFiles] 📦 Build complete — ${written} files, ~${totalCost} chars, estimated cost ~$${estimatedCost.toFixed(4)}`);

  return written;
}

// ─── Tri-Brain Ensemble — Per-File Synthesis Engine ──────────────────────────

export interface TriBrainResult {
  written: number;
  totalCostUsd: number;
  phaseErrors: string[];
}

/**
 * Tri-Brain Build Pipeline:
 *   Phase 2 — Grok-3 synthesizes each file individually (dedicated 8192-token window per file)
 *   Phase 3 — Dev-X audits and repairs JS/TS files before writing to disk
 *
 * Eliminates truncation (each file gets full context window) and context contamination
 * (each file prompt is scoped to that file only).
 */
export async function triBrainBuildFiles(
  workDir: string,
  projectDescription: string,
  plan: PlanningResult,
  telegramId: number,
  onFileWritten: (written: number, total: number, filePath: string, phase: string) => void,
): Promise<TriBrainResult> {
  const manifest = plan.manifest;
  const colorScheme = plan.colorScheme
    ?? "Dark background #0a0e14, primary accent #58a6ff (electric blue), success #3fb950, text #cdd9e5";
  const designSystem = plan.designSystem
    ?? "Glassmorphism cards with backdrop-filter blur, smooth CSS transitions (0.3s ease), Inter font, bold headings, gradient CTAs";
  const fileIndex = manifest.map(f => `  - ${f.path}: ${f.description}`).join("\n");

  let written = 0;
  let totalCostUsd = 0;
  const phaseErrors: string[] = [];

  const grokSystemPrompt =
    "You are a strict, defensive staff engineer building production-ready applications. " +
    "Write COMPLETE, working code — never truncate, never use TODO/FIXME/placeholder comments, never write stubs. " +
    "Every file must be 100% functional. Use CommonJS (require/module.exports) for all .js files. " +
    "DEFENSIVE RULES: (1) If a require() call names a package not in package.json, do NOT use it — use only packages already listed. " +
    "(2) NEVER use ES module syntax (import/export) in .js files — CommonJS only. " +
    "(3) Server entry points MUST use: const PORT = process.env.PORT || 3000; app.listen(PORT, '0.0.0.0'). " +
    "(4) HTML files: use RELATIVE asset paths (href=\"style.css\" NOT href=\"/style.css\"). " +
    "Apply beautiful design: gradients, animations, responsive layouts, glassmorphism, real content.";

  // ── Helpers ────────────────────────────────────────────────────────────────
  const isSimpleFile = (p: string) => /\.(md|gitignore|env|txt)$/i.test(p);
  const isComplexFile = (p: string) => /\.(js|ts|mjs|cjs|jsx|tsx|html)$/i.test(p);

  const stripFences = (s: string) =>
    s.replace(/^```[\w\s]*\n?/m, "").replace(/\n?```\s*$/m, "").trim();

  // ── Swarm File Classifier ─────────────────────────────────────────────────
  // Routes each file to its designated model in the swarm:
  //   frontend (HTML/CSS/public JS)  → Mistral  (retro-neon UI, layout, interactivity)
  //   backend  (server JS, routes)   → Grok-3   (Express architecture, data flows, APIs)
  //   simple   (md/env/txt)          → grok-3-mini (lightweight, no heavy context needed)
  const classifyFile = (p: string): { model: string; lane: string } => {
    if (isSimpleFile(p)) return { model: "grok-3-mini", lane: "simple" };
    const isFrontend =
      /^public[/\\]/.test(p) ||
      /^client[/\\]/.test(p) ||
      /^static[/\\]/.test(p) ||
      /^ui[/\\]/.test(p) ||
      p.endsWith(".html") ||
      p.endsWith(".css") ||
      (p.endsWith(".js") && /[/\\](public|client|static|ui)[/\\]/.test(p));
    if (isFrontend) return { model: "mistral", lane: "Mistral(UI)" };
    return { model: "grok-3", lane: "Grok-3(backend)" };
  };

  const mistralSystemPrompt =
    "You are an elite frontend UI engineer specialising in retro-neon web design. " +
    "Write COMPLETE, visually stunning HTML/CSS/JavaScript — no truncation, no TODOs, no stubs. " +
    "Use neon accents, glassmorphism cards, smooth animations, and responsive grids. " +
    "All .js files use CommonJS (require/module.exports). Make it beautiful and production-ready. " +
    "CRITICAL: Use RELATIVE asset paths (href=\"style.css\" NOT href=\"/style.css\", src=\"app.js\" NOT src=\"/app.js\"). " +
    "Absolute paths starting with / break when served through a proxy — always use relative paths.";

  const buildPrompt = (file: FilePlan, pkgCtx?: string, diskContext?: string): string =>
    `Write the COMPLETE source code for ONE specific file in a web application.\n\n` +
    `PROJECT: "${projectDescription}"\n` +
    `TECH STACK: ${plan.techStack}\n` +
    `COLOR SCHEME: ${colorScheme}\n` +
    `DESIGN SYSTEM: ${designSystem}\n` +
    (pkgCtx ? `\nPACKAGE.JSON (use ONLY these deps — no new requires):\n${pkgCtx.slice(0, 600)}\n` : "") +
    (diskContext ? `\nGROUND TRUTH — WHAT ALREADY EXISTS ON DISK (read this before writing):\n${diskContext.slice(0, 800)}\n` : "") +
    `\nALL PROJECT FILES (context — do NOT write these):\n${fileIndex}\n\n` +
    `YOUR FILE TO WRITE:\n` +
    `  PATH: ${file.path}\n` +
    `  PURPOSE: ${file.description}\n\n` +
    `MANDATORY RULES (DEFENSIVE ENGINEERING — NON-NEGOTIABLE):\n` +
    `- Return ONLY raw file content — zero markdown fences, zero explanation\n` +
    `- CommonJS ONLY for .js files (require/module.exports) — never use import/export, never use ES modules\n` +
    `- NEVER require() a package not listed in the PACKAGE.JSON above — only use what's installed\n` +
    `- Server .js files MUST include: const PORT = process.env.PORT || 3000; and app.listen(PORT, '0.0.0.0')\n` +
    `- HTML: complete DOCTYPE, beautiful themed UI matching the color scheme above, linked CSS + JS\n` +
    `- HTML asset paths: RELATIVE only (href="style.css" NOT href="/style.css") — absolute paths break the proxy\n` +
    `- CSS: minimum 80 lines — gradients, animations, hover states, flex/grid responsive layout\n` +
    `- package.json: "scripts":{"start":"node src/index.js"} and ALL required npm package names\n` +
    `- NEVER write placeholders, skeleton code, "// fill in later", "// TODO", or truncated blocks\n` +
    `- Apply the COLOR SCHEME and DESIGN SYSTEM to all visual output — make it beautiful\n` +
    `- Complex files (JS/HTML/CSS): minimum 60 lines of real, working code`;

  // ── Scan existing disk state for ground truth context (pre-flight) ─────────
  let diskContext: string | undefined;
  try {
    diskContext = await scanWorkspaceDirContext(workDir);
    if (diskContext) console.log(`[TriBrain] 🗂️ Ground truth scan: ${diskContext.split("\n").length} lines`);
  } catch { /* non-fatal */ }

  // ── Per-file generator with integrity gate + Dev-X audit ──────────────────
  // Model selection is determined by classifyFile() before this is called,
  // so backend files go to Grok-3 and frontend files go to Mistral in parallel.
  const generateFile = async (
    file: FilePlan,
    pkgCtx?: string,
    modelOverride?: string,
  ): Promise<{ content: string; costUsd: number; phase: string }> => {
    const simple = isSimpleFile(file.path);
    const complex = isComplexFile(file.path);
    const { model: classifiedModel, lane } = classifyFile(file.path);
    const model = modelOverride ?? classifiedModel;
    const sysPrompt = model === "mistral" ? mistralSystemPrompt : grokSystemPrompt;
    const maxToks = simple ? 2048 : complex ? 16384 : 8192;
    let phase = simple ? "Grok-mini" : lane;
    let content = "";
    let costUsd = 0;

    // Phase 2: Primary generation — model is Grok-3 (backend) or Mistral (frontend)
    try {
      const result = await routeTaskForModel(model, buildPrompt(file, pkgCtx, diskContext), sysPrompt, telegramId, maxToks);
      content = stripFences(result.content);
      costUsd += result.costUsd;
      console.log(`[TriBrain] ✓ ${model}[${lane}] → ${file.path} (${content.length} chars)`);
    } catch (err) {
      phaseErrors.push(`${model} failed for ${file.path}: ${String(err).slice(0, 100)}`);
      logger.warn({ file: file.path, err }, "triBrainBuildFiles: primary generation failed");
      content = generateStubContent(file.path, file.description, plan.techStack);
      phase = "stub";
    }

    // Integrity gate: escalate to Dev-X if content is too thin
    if (!simple && content.trim().length < 80) {
      console.log(`[TriBrain] ❌ Integrity fail ${file.path} (${content.length} chars) → Dev-X repair`);
      try {
        const repairPrompt =
          `The file "${file.path}" is critically incomplete. Write COMPLETE production-ready code now.\n\n` +
          `PURPOSE: ${file.description}\nPROJECT: "${projectDescription}"\nSTACK: ${plan.techStack}\n\n` +
          `Return ONLY the file content. No markdown.`;
        const repair = await routeTaskForModel("dev-x", repairPrompt, grokSystemPrompt, telegramId, 8192);
        const repaired = stripFences(repair.content);
        if (repaired.length > content.length) {
          content = repaired;
          costUsd += repair.costUsd;
          phase = "Dev-X-repair";
          console.log(`[TriBrain] 🔧 Dev-X repaired ${file.path} → ${repaired.length} chars`);
        }
      } catch (repairErr) {
        phaseErrors.push(`Dev-X repair failed for ${file.path}: ${String(repairErr).slice(0, 80)}`);
      }
    }

    // Phase 3: Dev-X parallel syntax audit for JS/TS/HTML files
    if (complex && content.trim().length > 100) {
      try {
        const auditPrompt =
          `You are a JavaScript/TypeScript syntax auditor. Review for: unclosed strings, missing braces/brackets, ` +
          `truncated code, undefined references, broken CommonJS syntax. Fix all issues.\n\n` +
          `FILE: ${file.path}\nRULES: Return ONLY the complete corrected file — no markdown, no explanation.\n\n` +
          `CODE:\n${content}`;
        const audit = await routeTaskForModel("dev-x", auditPrompt, undefined, telegramId, 12288);
        const audited = stripFences(audit.content);
        if (audited.length >= content.length * 0.75 && audited.length > 50) {
          content = audited;
          costUsd += audit.costUsd;
          phase = phase === "stub" ? "Dev-X" : `${phase}+Dev-X`;
          console.log(`[TriBrain] 🛡️ Dev-X audited ${file.path} → ${audited.length} chars`);
        }
      } catch (auditErr) {
        logger.warn({ file: file.path, err: auditErr }, "triBrainBuildFiles: Dev-X audit skipped (non-fatal)");
      }
    }

    return { content, costUsd, phase };
  };

  // ── Step 1: Generate package.json first (gives dep context to all other files) ──
  let pkgJsonContent: string | undefined;
  const pkgFile = manifest.find(f => f.path === "package.json");
  if (pkgFile) {
    console.log(`[TriBrain] 📦 Step 1 — Generating package.json first for dependency context...`);
    const { content, costUsd, phase } = await generateFile(pkgFile);
    pkgJsonContent = content;
    totalCostUsd += costUsd;
    const absPath = path.join(workDir, pkgFile.path);
    await fs.mkdir(path.dirname(absPath), { recursive: true });
    await fs.writeFile(absPath, content, "utf8");
    recordFileDiff(String(telegramId), pkgFile.path, content);
    written++;
    onFileWritten(written, manifest.length, pkgFile.path, phase);
    console.log(`[TriBrain] ✅ package.json ready — ${content.length} chars [${phase}]`);
  }

  // ── Step 2: Generate all remaining files in parallel batches of 5 ─────────
  const remaining = manifest.filter(f => f.path !== "package.json");
  const BATCH_SIZE = 5;
  const totalFiles = manifest.length;

  for (let batchStart = 0; batchStart < remaining.length; batchStart += BATCH_SIZE) {
    const batch = remaining.slice(batchStart, batchStart + BATCH_SIZE);
    const batchNum = Math.floor(batchStart / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(remaining.length / BATCH_SIZE);
    console.log(`[TriBrain] 🚀 Step 2 — Parallel batch ${batchNum}/${totalBatches}: [${batch.map(f => f.path).join(", ")}]`);

    // Generate all files in batch simultaneously
    const results = await Promise.allSettled(
      batch.map(file => generateFile(file, pkgJsonContent))
    );

    // Write all files in batch to disk simultaneously
    const writeOps = results.map(async (result, i) => {
      const file = batch[i]!;
      let content: string;
      let costUsd = 0;
      let phase = "stub";

      if (result.status === "fulfilled") {
        ({ content, costUsd, phase } = result.value);
      } else {
        phaseErrors.push(`Batch generation failed for ${file.path}: ${String(result.reason).slice(0, 80)}`);
        content = generateStubContent(file.path, file.description, plan.techStack);
        console.log(`[TriBrain] ⚠️ Fallback stub for ${file.path}`);
      }

      totalCostUsd += costUsd;
      const absPath = path.join(workDir, file.path);
      await fs.mkdir(path.dirname(absPath), { recursive: true });
      await fs.writeFile(absPath, content, "utf8");
      recordFileDiff(String(telegramId), file.path, content);
      return { file, content, phase };
    });

    const batchWritten = await Promise.allSettled(writeOps);

    // Update written count and fire progress callbacks
    batchWritten.forEach((r, i) => {
      written++;
      const file = batch[i]!;
      const phase = r.status === "fulfilled" ? r.value.phase : "error";
      onFileWritten(written, totalFiles, file.path, phase);
      if (r.status === "fulfilled") {
        console.log(`[TriBrain] ✅ ${written}/${totalFiles} — ${file.path} [${phase}]`);
      }
    });
  }

  // ── Step 3: Smart dependency enrichment — scan all JS, patch package.json ──
  try {
    const jsFiles = manifest.filter(f => /\.js$/i.test(f.path) && f.path !== "package.json");
    const allPkgs = new Set<string>();
    for (const f of jsFiles) {
      try {
        const code = await fs.readFile(path.join(workDir, f.path), "utf8").catch(() => "");
        for (const pkg of extractRequiredPackages(code)) allPkgs.add(pkg);
      } catch { /* non-fatal */ }
    }

    if (allPkgs.size > 0) {
      const knownVersions: Record<string, string> = {
        express: "^4.18.2", cors: "^2.8.5", dotenv: "^16.3.1",
        mongoose: "^7.6.3", pg: "^8.11.3", sqlite3: "^5.1.6",
        bcrypt: "^5.1.1", bcryptjs: "^2.4.3", jsonwebtoken: "^9.0.2",
        multer: "^1.4.5-lts.1", axios: "^1.6.2", nodemailer: "^6.9.7",
        "socket.io": "^4.6.2", uuid: "^9.0.0", "express-session": "^1.17.3",
        "express-validator": "^7.0.1", morgan: "^1.10.0", helmet: "^7.1.0",
        compression: "^1.7.4", "cookie-parser": "^1.4.6", joi: "^17.11.0",
        zod: "^3.22.4", lodash: "^4.17.21", moment: "^2.29.4", dayjs: "^1.11.10",
        stripe: "^14.8.0", ejs: "^3.1.9", handlebars: "^4.7.8",
        "node-cron": "^3.0.3", "ws": "^8.16.0", "rate-limiter-flexible": "^4.0.1",
      };
      const pkgPath = path.join(workDir, "package.json");
      try {
        const existing = JSON.parse(await fs.readFile(pkgPath, "utf8").catch(() => "{}"));
        existing.dependencies = existing.dependencies ?? {};
        existing.scripts = existing.scripts ?? { start: "node src/index.js" };
        let enriched = 0;
        for (const pkg of allPkgs) {
          if (!existing.dependencies[pkg]) {
            existing.dependencies[pkg] = knownVersions[pkg] ?? "latest";
            enriched++;
          }
        }
        if (enriched > 0) {
          await fs.writeFile(pkgPath, JSON.stringify(existing, null, 2), "utf8");
          console.log(`[TriBrain] 📦 package.json enriched with ${enriched} auto-detected packages: ${[...allPkgs].join(", ")}`);
        }
      } catch (pkgErr) {
        logger.warn({ pkgErr }, "TriBrain: package.json enrichment failed (non-fatal)");
      }
    }
  } catch (depErr) {
    logger.warn({ depErr }, "TriBrain: smart dep extraction failed (non-fatal)");
  }

  logger.info({ written, totalCostUsd, errors: phaseErrors.length }, "triBrainBuildFiles: complete");
  console.log(`[TriBrain] 🏁 Complete — ${written} files, $${totalCostUsd.toFixed(4)}, ${phaseErrors.length} errors`);
  return { written, totalCostUsd, phaseErrors };
}

/** Generates minimal working stub content when all AI calls fail for a specific file */
function generateStubContent(filePath: string, description: string, techStack: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  if (filePath.endsWith("package.json")) {
    return JSON.stringify({
      name: "webforge-app", version: "1.0.0",
      scripts: { start: "node src/index.js" },
      dependencies: { express: "^4.18.2" },
    }, null, 2);
  }
  if (ext === "json") return "{}";
  if (ext === "html") return `<!DOCTYPE html>\n<html lang="en">\n<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>App</title></head>\n<body><h1>${description}</h1></body>\n</html>`;
  if (ext === "css") return `/* ${description} */\nbody { font-family: -apple-system, sans-serif; background: #0a0e14; color: #cdd9e5; margin: 0; padding: 20px; }\nh1 { color: #58a6ff; }\n`;
  if (ext === "md") return `# ${description}\n\nBuilt with WebForge.\n\nTech: ${techStack}\n`;
  // JS/TS fallback
  return `// ${filePath} — ${description}\n// WebForge generated stub (${techStack})\n'use strict';\nconst express = require('express');\nconst app = express();\nconst PORT = process.env.PORT || 3000;\napp.use(express.json());\napp.get('/', (req, res) => res.send('${description}'));\napp.get('/api/health', (req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));\napp.listen(PORT, () => console.log(\`[WebForge] Running on port \${PORT}\`));\nmodule.exports = app;\n`;
}

// ─── Fallback App Generator ───────────────────────────────────────────────────

function generateGuaranteedApp(manifest: FilePlan[]): ParsedFile[] {
  return [
    {
      path: "package.json",
      content: JSON.stringify({ name: "webforge-app", version: "1.0.0", scripts: { start: "node src/index.js" }, dependencies: { express: "^4.18.2" } }, null, 2),
    },
    {
      path: "src/index.js",
      content: `const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));
app.get('/api/health', (_req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, '../public/index.html')));
app.listen(PORT, () => console.log('App running on port ' + PORT));
`,
    },
    {
      path: "public/index.html",
      content: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>WebForge App</title><link rel="stylesheet" href="style.css"/></head>
<body><div class="container">
<div class="badge">Built with WebForge ⚡</div>
<h1>Your app is live!</h1>
<p>${manifest[0]?.description ?? "Your WebForge app is running."}</p>
<div id="status">Checking API...</div>
</div><script src="app.js"></script></body></html>`,
    },
    {
      path: "public/style.css",
      content: `*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:linear-gradient(135deg,#0a0e14,#111720);color:#cdd9e5;min-height:100vh;display:flex;align-items:center;justify-content:center}
.container{text-align:center;padding:48px 32px;max-width:600px}
.badge{display:inline-block;background:rgba(88,166,255,.15);color:#58a6ff;border:1px solid rgba(88,166,255,.3);padding:6px 16px;border-radius:100px;font-size:13px;font-weight:600;margin-bottom:24px}
h1{font-size:clamp(28px,5vw,48px);font-weight:800;margin-bottom:16px;background:linear-gradient(135deg,#cdd9e5,#58a6ff);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
p{font-size:18px;color:#8b949e;line-height:1.6;margin-bottom:32px}
#status{display:inline-block;background:rgba(63,185,80,.1);color:#3fb950;border:1px solid rgba(63,185,80,.3);padding:8px 20px;border-radius:8px;font-family:monospace;font-size:13px}`,
    },
    {
      path: "public/app.js",
      content: `fetch('/api/health').then(r=>r.json()).then(d=>{document.getElementById('status').textContent='✅ API '+d.status+' — '+d.ts;}).catch(()=>{document.getElementById('status').textContent='⚠️ API unavailable';document.getElementById('status').style.color='#f0883e';});`,
    },
  ];
}

function generateStubFile(f: FilePlan): string {
  if (f.path === "README.md") return `# App\n\n${f.description}\n\nGenerated by WebForge.\n`;
  if (f.path.endsWith(".css")) return `/* ${f.description} */\n`;
  if (f.path.endsWith(".json") && f.path !== "package.json") return `{}\n`;
  return `// ${f.description}\n`;
}

// ─── Git Operations ───────────────────────────────────────────────────────────

export async function gitCloneRepo(repoUrl: string, workDir: string, githubToken?: string): Promise<{ stdout: string; stderr: string }> {
  await fs.mkdir(workDir, { recursive: true });
  // Inject token into URL if provided
  let cloneUrl = repoUrl;
  if (githubToken && repoUrl.startsWith("https://github.com")) {
    cloneUrl = repoUrl.replace("https://", `https://${githubToken}@`);
  }
  return runTerminalCommand(`git clone --depth=1 "${cloneUrl}" .`, workDir, 120_000);
}

export async function gitPushChanges(
  workDir: string,
  githubToken: string,
  message: string,
): Promise<{ stdout: string; stderr: string }> {
  const env = `GIT_ASKPASS=echo GIT_TERMINAL_PROMPT=0`;
  const cmds = [
    `git config user.email "webforge@bot.ai"`,
    `git config user.name "WebForge Bot"`,
    `git add -A`,
    `git commit -m "${message.replace(/"/g, "'")}" --allow-empty`,
    `git push`,
  ].join(" && ");
  return runTerminalCommand(`${env} ${cmds}`, workDir, 60_000);
}

export async function gitInitRepo(workDir: string, remoteUrl: string, githubToken: string): Promise<void> {
  const authUrl = remoteUrl.startsWith("https://github.com")
    ? remoteUrl.replace("https://", `https://${githubToken}@`)
    : remoteUrl;
  const cmds = [
    `git init`,
    `git config user.email "webforge@bot.ai"`,
    `git config user.name "WebForge Bot"`,
    `git remote add origin "${authUrl}"`,
    `git add -A`,
    `git commit -m "Initial commit by WebForge"`,
    `git branch -M main`,
    `git push -u origin main`,
  ].join(" && ");
  await runTerminalCommand(cmds, workDir, 120_000);
}

// ─── Bot Scaffold ─────────────────────────────────────────────────────────────

export async function scaffoldBotProject(workDir: string, botToken: string, description: string, commands: string): Promise<void> {
  const tasks: FileTask[] = [
    {
      filePath: path.join(workDir, "package.json"),
      content: JSON.stringify({ name: "user-bot", version: "1.0.0", main: "index.js", dependencies: { "node-telegram-bot-api": "^0.66.0" } }, null, 2),
    },
    {
      filePath: path.join(workDir, "config", "persona.json"),
      content: JSON.stringify({ name: "WebForge Bot", systemPrompt: description, instructions: commands }, null, 2),
    },
    {
      filePath: path.join(workDir, "index.js"),
      content: `const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const bot = new TelegramBot('${botToken}', { polling: true });
function getPersona() {
  try { return JSON.parse(fs.readFileSync('./config/persona.json','utf8')); }
  catch { return { name: 'Bot', systemPrompt: 'You are helpful.' }; }
}
bot.onText(/\\/start/, msg => bot.sendMessage(msg.chat.id, 'Hi! I am ' + getPersona().name + '. How can I help?'));
bot.on('message', msg => { if (!msg.text?.startsWith('/')) bot.sendMessage(msg.chat.id, '[' + getPersona().name + '] ' + msg.text); });
console.log('Bot polling...');
`,
    },
  ];
  await writeFilesParallel(tasks);
  await runTerminalCommand("npm install --legacy-peer-deps", workDir);
}

export async function cloneRepository(repoUrl: string, targetDir: string): Promise<void> {
  await fs.mkdir(path.dirname(targetDir), { recursive: true });
  await runTerminalCommand(`git clone --depth=1 "${repoUrl}" "${targetDir}"`, "/tmp");
}

// ─── Self-Healing Runtime Autopsy ─────────────────────────────────────────────
// Reads crash logs, routes to AI for targeted patch, re-spawns, retries up to N times.

export interface HealResult {
  healed: boolean;
  attempts: number;
  errorLog: string;
}

export async function selfHealApp(
  workDir: string,
  projectId: number,
  port: number,
  existingPid: number | undefined,
  routeTaskFn: (prompt: string) => Promise<string>,
  onAttempt: (attempt: number, maxAttempts: number, fixed: boolean) => void,
  maxAttempts = 3,
): Promise<HealResult> {
  let lastErrorLog = "";

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // ── Read crash evidence ─────────────────────────────────────────────────
    let stderrContent = "";
    try {
      stderrContent = await fs.readFile(path.join(workDir, "app.stderr.log"), "utf8");
      // Only last 2000 chars of stderr — focus on the crash not old lines
      stderrContent = stderrContent.trim().split("\n").slice(-40).join("\n");
    } catch { stderrContent = ""; }

    let stdoutContent = "";
    try {
      stdoutContent = await fs.readFile(path.join(workDir, "app.stdout.log"), "utf8");
      stdoutContent = stdoutContent.trim().split("\n").slice(-15).join("\n");
    } catch { stdoutContent = ""; }

    const errorLog = `STDERR:\n${stderrContent}\n\nSTDOUT:\n${stdoutContent}`.slice(0, 2500);
    lastErrorLog = errorLog;

    if (!stderrContent && !stdoutContent) {
      // No log yet — process may not have had time to crash, skip this attempt
      await new Promise(r => setTimeout(r, 3000));
      continue;
    }

    logger.info({ projectId, attempt, errorSnippet: stderrContent.slice(0, 200) }, "selfHeal: analysing crash");

    // ── Find which file caused the crash ────────────────────────────────────
    const fileMatch = stderrContent.match(/(?:at\s+|require\s*\(|Error in\s+|Error:\s+)[^\n]*?\b([\w./src-]+\.m?js)(?::\d+)/);
    const crashedFile = fileMatch?.[1];

    // ── Read the crashing file ───────────────────────────────────────────────
    let originalCode = "";
    if (crashedFile) {
      try { originalCode = await fs.readFile(path.join(workDir, crashedFile), "utf8"); } catch { }
    }

    // If we can't identify the file, read all JS files under 200 lines
    if (!originalCode) {
      try {
        const allFiles = await listProjectFiles(workDir);
        const jsFiles = allFiles.filter(f => f.endsWith(".js") && !f.includes("node_modules")).slice(0, 5);
        for (const f of jsFiles) {
          const c = await fs.readFile(f, "utf8").catch(() => "");
          if (c) originalCode += `\n\n// FILE: ${path.relative(workDir, f)}\n${c}`;
        }
      } catch { }
    }

    // ── AI patch request ─────────────────────────────────────────────────────
    const patchPrompt = `An app crashed on startup. Fix the issue and return the corrected file(s).

CRASH LOG:
${errorLog}

${crashedFile ? `CRASHING FILE (${crashedFile}):\n${originalCode.slice(0, 3000)}` : `PROJECT FILES:\n${originalCode.slice(0, 3000)}`}

Return ONLY the fixed code using this format for each file changed:
=== FILE: path/to/file.js ===
// complete corrected file content
=== END FILE ===

Rules: CommonJS only, use process.env.PORT, fix the exact crash — do not change unrelated code.`;

    let patchedCode = "";
    try {
      patchedCode = await routeTaskFn(patchPrompt);
    } catch (aiErr) {
      logger.warn({ aiErr, attempt }, "selfHeal: AI patch request failed");
      onAttempt(attempt, maxAttempts, false);
      continue;
    }

    // ── Apply patches ────────────────────────────────────────────────────────
    const fmt1 = /===\s*FILE:\s*(.+?)\s*===\n([\s\S]*?)(?====\s*(?:FILE:|END\s*FILE)|$)/gi;
    let m: RegExpExecArray | null;
    let patchApplied = false;
    while ((m = fmt1.exec(patchedCode)) !== null) {
      const relPath = m[1].trim().replace(/^\/+/, "");
      const content = m[2].replace(/===\s*END\s*FILE\s*===/i, "").trim();
      if (relPath && content.length > 20) {
        const absPath = path.join(workDir, relPath);
        await fs.mkdir(path.dirname(absPath), { recursive: true });
        await fs.writeFile(absPath, content, "utf8");
        logger.info({ projectId, attempt, file: relPath }, "selfHeal: patch written");
        patchApplied = true;
      }
    }

    if (!patchApplied) {
      logger.warn({ attempt }, "selfHeal: no parseable patches from AI");
      onAttempt(attempt, maxAttempts, false);
      continue;
    }

    // ── Kill old process ─────────────────────────────────────────────────────
    if (existingPid) {
      try { process.kill(existingPid, "SIGTERM"); } catch { }
      await new Promise(r => setTimeout(r, 1500));
    }

    // Clear log files so next round reads fresh crashes
    await fs.writeFile(path.join(workDir, "app.stderr.log"), "", "utf8").catch(() => {});
    await fs.writeFile(path.join(workDir, "app.stdout.log"), "", "utf8").catch(() => {});

    // ── Re-spawn ─────────────────────────────────────────────────────────────
    const { pid: newPid } = await spawnProjectApp(workDir, projectId, port);
    existingPid = newPid;
    logger.info({ projectId, attempt, newPid }, "selfHeal: re-spawned");

    // ── Health check ─────────────────────────────────────────────────────────
    const alive = await pollAppHealth(port, 30_000, 2_000);
    onAttempt(attempt, maxAttempts, alive);

    if (alive) {
      logger.info({ projectId, attempt }, "selfHeal: app is live after patch");
      return { healed: true, attempts: attempt, errorLog: lastErrorLog };
    }

    logger.warn({ projectId, attempt }, "selfHeal: still not responding, next round");
    await new Promise(r => setTimeout(r, 2000));
  }

  return { healed: false, attempts: maxAttempts, errorLog: lastErrorLog };
}

// ═══════════════════════════════════════════════════════════════════════════════
// RUFLO — Central Persona Matrix, Session State, Intent Engine, Dispatch
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Ruflo Persona Matrix (single source of truth for identity + tier rules) ──

export const RUFLO_PERSONA_MATRIX = `You are WebForge — the world's most advanced autonomous AI co-founder and full-stack PaaS engine, operating natively on Telegram.

IDENTITY (absolute, non-negotiable):
• ALWAYS respond in English only — if the user writes in any other language: "WebForge operates in English only. Tell me what to build."
• You are NOT a chatbot. You are a DEPLOYMENT ENGINE. Never give generic cloud/AWS/Docker/DevOps advice.
• Never reveal model names, providers, or internal architecture. If asked: "I'm WebForge — proprietary autonomous intelligence."
• Be warm, confident, slightly intense — like a senior engineer who ships at midnight because they love it.
• Never open with "How can I help?" — always pivot hard to building. Make the user excited to ship.
• You build real, live apps. Not prototypes. Not mockups. Production-grade, deployed, accessible via URL.
• When users describe an idea — match their energy and elevate it. Make them feel like it's already shipping.

PLATFORM IDENTITY: WebForge Engine v3 — Tri-Brain autonomous builder (Mistral architect → Grok-3 synthesizer → Dev-X auditor), AI image forge, GitHub sync engine, live sandbox host, Telegram bot deployer.

TIERS:
• Starter — Free. 10 daily actions. Core Tri-Brain builds + Pollinations image forge.
• Pro — ₦5,000/month. 150 daily actions. All models, priority build queue, concurrent builds.
• Elite — ₦15,000/month. 500 daily actions. DeepBuild loops (5 rounds), GitHub auto-sync, batch builds (5 concurrent), custom AI personas.

CAPABILITIES (what you can actually deploy right now):
• Full-stack web apps: Express + HTML/CSS/JS, EJS templates, REST APIs, SQLite/Postgres backends
• E-commerce stores, dashboards, portfolios, landing pages, SaaS tools, booking systems
• Telegram bots: polling, webhooks, custom commands, AI-powered persona bots
• AI image generation: Pollinations engine, custom prompts, any style/size
• GitHub: clone repos, push builds, auto-commit on every change
• Live sandbox: every app runs at a real HTTPS URL instantly after build

RESPONSE STYLE:
• Concise and punchy — under 700 characters per reply
• No bullet-point walls in chat — use short paragraphs or 2-3 bullets max
• Sound like a founder demoing to investors — confident, specific, action-forward
• Always end conversational replies with a clear next action or question`;


// ─── Session State (owned by Ruflo / orchestrator, not by the entry bot) ──────

export interface RufloDiscoveryState {
  baseDescription: string;
  gathered: string[];
  tier: string;
  expiresAt: number;
}

export interface RufloPendingBuild {
  description: string;
  plan: PlanningResult;
  tier: string;
  isElite: boolean;
  expiresAt: number;
}

const rufloDiscovery = new Map<number, RufloDiscoveryState>();
const rufloPending   = new Map<number, RufloPendingBuild>();
const rufloHistory   = new Map<number, Array<{ role: "user" | "assistant"; content: string }>>();

function rufloTtl(ms = 15 * 60 * 1000): number { return Date.now() + ms; }
function rufloExpired(ts: number): boolean { return Date.now() > ts; }

export function rufloAddHistory(userId: number, role: "user" | "assistant", content: string): void {
  if (!rufloHistory.has(userId)) rufloHistory.set(userId, []);
  const hist = rufloHistory.get(userId)!;
  hist.push({ role, content: content.slice(0, 500) });
  if (hist.length > 20) hist.splice(0, hist.length - 20);
}

export function rufloGetHistory(userId: number): Array<{ role: "user" | "assistant"; content: string }> {
  return rufloHistory.get(userId) ?? [];
}

export function rufloGetDiscovery(userId: number): RufloDiscoveryState | null {
  const s = rufloDiscovery.get(userId);
  if (!s || rufloExpired(s.expiresAt)) { rufloDiscovery.delete(userId); return null; }
  return s;
}

export function rufloSetDiscovery(userId: number, state: RufloDiscoveryState): void {
  rufloDiscovery.set(userId, state);
}

export function rufloDeleteDiscovery(userId: number): void {
  rufloDiscovery.delete(userId);
}

export function rufloGetPending(userId: number): RufloPendingBuild | null {
  const s = rufloPending.get(userId);
  if (!s || rufloExpired(s.expiresAt)) { rufloPending.delete(userId); return null; }
  return s;
}

export function rufloSetPending(userId: number, state: RufloPendingBuild): void {
  rufloPending.set(userId, state);
}

export function rufloDeletePending(userId: number): void {
  rufloPending.delete(userId);
}

// ─── Intent Classification (Ruflo-native, not in the entry bot) ───────────────

export function rufloIsImageIntent(text: string): boolean {
  const l = text.toLowerCase().trim();
  if (/\b(create|generate|make|draw|design|produce|show me|give me)\s+(me\s+)?(an?\s+)?(image|photo|picture|illustration|logo|banner|icon|artwork|visual|portrait|landscape|wallpaper|graphic|thumbnail)\b/.test(l)) return true;
  if (/\b(image|photo|picture|illustration|portrait|artwork|visual)\s+of\b/.test(l)) return true;
  if (/^draw\b/.test(l)) return true;
  if (/\bprovision\s+(an?\s+)?(image|photo|picture|visual)\b/.test(l)) return true;
  if (/\b(edit|crop|resize|convert|compress|enhance|filter)\s+(an?\s+|my\s+|the\s+)?(photo|image|picture)\b/.test(l)) return true;
  if (/\b(image|photo|picture)\b/.test(l) && /\b(create|generate|make|draw|design|produce|want|need|get)\b/.test(l)) return true;
  return false;
}

export function rufloIsBillingIntent(text: string): boolean {
  return /\b(upgrade|pro\s*plan|elite\s*plan|pricing|subscribe|payment|pay\s+for|how\s+much|plans?|tier|billing|₦|naira|cost)\b/i.test(text);
}

export function rufloIsBuildIntent(text: string): boolean {
  if (text.length < 12) return false;
  return /\b(build|create|make|develop|generate|code|write|implement|design|launch|deploy|clone|scaffold)\b/i.test(text)
    && /\b(app|website|site|api|bot|tool|platform|system|page|dashboard|landing|portfolio|shop|store|game|service|web)\b/i.test(text);
}

export function rufloIsVague(text: string): boolean {
  const words = text.trim().split(/\s+/).length;
  if (words > 30) return false;
  const hasDetail = /\b(with|including|that has|should have|need a|featuring|color|colour|section|page|login|auth|dashboard|gallery|shop|cart|form|blog|portfolio|timeline|pricing|dark|light|modern|minimal|clean|bold|colorful|react|express|mongodb|firebase|api|realtime|animation)\b/i.test(text);
  return !hasDetail;
}

export function rufloIsConfirmation(text: string): boolean {
  return /^(yes|yeah|yep|yup|ok|okay|go|sure|build|start|do it|let'?s go|proceed|confirm|correct|right|great|perfect|absolutely|affirmative|build it|go ahead|start building|sounds good|looks good|fire|🔥|✅)/i.test(text.trim());
}

export function rufloIsChangeRequest(text: string): boolean {
  return /\b(change|update|instead|rather|different|modify|use|add|remove|also|plus|but|however|no,|nope|actually|wait|hold on)\b/i.test(text);
}

export function rufloDetectTaskType(text: string): TaskType {
  const l = text.toLowerCase();
  if (/fix|debug|error|bug|issue|repair/.test(l)) return "fixing";
  if (/build|create|implement|code|develop/.test(l)) return "coding";
  if (/plan|architect|spec|blueprint/.test(l)) return "planning";
  if (/ui|interface|frontend|layout/.test(l)) return "ui";
  return "chat";
}

export function rufloDiscoveryQuestion(description: string): string {
  const l = description.toLowerCase();
  if (/coca.cola|pepsi|drink|beverage|food|restaurant|cafe|menu|delivery/.test(l))
    return `Ohhh a ${description.trim()} — I can already picture how fire this is going to look! 🔥\n\nTell me more:\n• What sections? (Hero, gallery, history, contact?)\n• Vibe — bold classic, modern minimal, or premium?\n• Any specific brand colors?`;
  if (/portfolio|cv|resume|personal brand/.test(l))
    return `A personal portfolio — love this! 🚀\n\nQuick questions:\n• Sections needed? (Projects, skills, about, contact?)\n• Style — ultra-minimal, bold with animations, or editorial?\n• Any color palette or references?`;
  if (/shop|store|ecommerce|sell|product|marketplace/.test(l))
    return `An online store — this one's going to convert! 🛒\n\nLet me nail the details:\n• What kind of products? Physical, digital, or services?\n• Cart + checkout, or just a product catalog?\n• Style — clean/minimal, bold/colorful, luxury?`;
  if (/dashboard|admin|analytics|tracking|crm|erp/.test(l))
    return `A dashboard — I love building these! 📊\n\nTell me:\n• What data will it display? (Sales, users, real-time metrics?)\n• Charts, tables, or both?\n• Single-user tool or with auth?`;
  if (/blog|news|article|content|magazine/.test(l))
    return `A content platform — clean and slick! 📝\n\nDetails:\n• Topics/categories?\n• User comments, newsletter, or CMS editing?\n• Style vibe — editorial, tech-minimal, or magazine?`;
  if (/bot|telegram|discord|slack|assistant/.test(l))
    return `A custom bot — this is going to be wild! 🤖\n\nTell me:\n• What should it do? (Answer questions, book appointments, send alerts?)\n• Specific persona?\n• Commands or features in mind?`;
  return `Wow, what an idea! I'm already excited 🔥\n\nA few quick things:\n• What specific pages or sections?\n• Style — bold and modern, clean and minimal?\n• Must-have features (login, payments, search)?`;
}

// ─── Ruflo Dispatch Result ─────────────────────────────────────────────────────

export type RufloDispatchType =
  | "image_ready"
  | "image_error"
  | "build_confirmed"
  | "build_changed"
  | "build_plan_ready"
  | "build_discovery"
  | "billing"
  | "chat"
  | "rate_limited";

export interface RufloDispatchResult {
  type: RufloDispatchType;
  content: string;
  imageUrl?: string;
  imageBuffer?: Buffer;
  plan?: PlanningResult;
  description?: string;
  tier?: string;
  isElite?: boolean;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
}

// ─── Ruflo Dispatch — single entry point driven through the persona matrix ─────
// coreBot hands Telegram text here; Ruflo evaluates intent, routes through
// OpenClaw's native execution skills, and returns a structured result.

export async function rufloDispatch(
  telegramId: number,
  text: string,
  tier: string,
  onPlanReady?: (plan: PlanningResult, description: string, isElite: boolean) => void,
): Promise<RufloDispatchResult> {

  const isElite = tier === "elite";

  // ── 1. Discovery state: user is answering Ruflo's clarifying question ────────
  const discovery = rufloGetDiscovery(telegramId);
  if (discovery) {
    discovery.gathered.push(text);
    rufloDeleteDiscovery(telegramId);
    const fullDescription = [discovery.baseDescription, ...discovery.gathered].join(". ");
    rufloAddHistory(telegramId, "user", `[Discovery answer: ${text.slice(0, 200)}]`);

    const plan = await planningMode(
      fullDescription,
      (taskType, prompt, t, uid, sys) => routeTask(taskType as "planning", prompt, t ?? tier, uid, sys),
      telegramId,
      tier,
    );

    const planSummary = `🏗 *Architecture ready — ${plan.manifest.length} files mapped*\n\n*Stack:* ${plan.techStack}\n*Plan:* ${plan.summary}`;
    rufloSetPending(telegramId, { description: fullDescription, plan, tier, isElite, expiresAt: rufloTtl() });
    onPlanReady?.(plan, fullDescription, isElite);

    return { type: "build_plan_ready", content: planSummary, plan, description: fullDescription, tier, isElite };
  }

  // ── 2. Pending confirmation: user is confirming or changing a pending build ──
  const pending = rufloGetPending(telegramId);
  if (pending) {
    if (rufloIsConfirmation(text)) {
      rufloDeletePending(telegramId);
      return { type: "build_confirmed", content: "✅ *Building now — hold tight!* 🚀", plan: pending.plan, description: pending.description, tier: pending.tier, isElite: pending.isElite };
    }
    if (rufloIsChangeRequest(text)) {
      rufloDeletePending(telegramId);
      const newDesc = `${pending.description}. Changes: ${text}`;
      const plan = await planningMode(
        newDesc,
        (taskType, prompt, t, uid, sys) => routeTask(taskType as "planning", prompt, t ?? tier, uid, sys),
        telegramId,
        tier,
      );
      const planSummary = `✏️ *Revised plan — ${plan.manifest.length} files*\n\n*Stack:* ${plan.techStack}\n*Plan:* ${plan.summary}`;
      rufloSetPending(telegramId, { description: newDesc, plan, tier, isElite, expiresAt: rufloTtl() });
      onPlanReady?.(plan, newDesc, isElite);
      return { type: "build_changed", content: planSummary, plan, description: newDesc, tier, isElite };
    }
  }

  // ── 3. Image intent: OpenClaw handles natively via generateImage skill ────────
  if (rufloIsImageIntent(text)) {
    const prompt = text
      .replace(/^(create|generate|make|draw|design|produce|provision|show me|give me)\s+(me\s+)?(an?\s+)?/i, "")
      .replace(/^(image|photo|picture|illustration|logo|banner|visual|artwork)\s+(of\s+)?/i, "")
      .replace(/\b(image|photo|picture|illustration|artwork|visual)\s*$/i, "")
      .trim() || text;

    try {
      const imageUrl = await generateImage(prompt, telegramId);
      if (!imageUrl) throw new Error("No URL from image engine");

      const axios = (await import("axios")).default;
      const response = await axios.get<ArrayBuffer>(imageUrl, {
        responseType: "arraybuffer",
        timeout: 60_000,
        headers: { "User-Agent": "WebForge/2.0" },
      });

      rufloAddHistory(telegramId, "user", `[Image: ${prompt.slice(0, 100)}]`);
      return {
        type: "image_ready",
        content: `🎨 *Generated by WebForge AI*\n\n_"${prompt.slice(0, 180)}"_`,
        imageBuffer: Buffer.from(response.data),
        imageUrl,
      };
    } catch (err) {
      logger.error({ err }, "rufloDispatch: image generation failed");
      return { type: "image_error", content: `❌ Image generation hit a snag — try again in a moment!\n\nPrompt: "${text.slice(0, 80)}"` };
    }
  }

  // ── 4. Build intent: trigger discovery if vague, else plan immediately ────────
  if (rufloIsBuildIntent(text)) {
    if (rufloIsVague(text)) {
      const question = rufloDiscoveryQuestion(text);
      rufloSetDiscovery(telegramId, { baseDescription: text, gathered: [], tier, expiresAt: rufloTtl() });
      rufloAddHistory(telegramId, "user", `[Build intent: ${text.slice(0, 100)}]`);
      return { type: "build_discovery", content: question };
    }

    rufloAddHistory(telegramId, "user", `[Build: ${text.slice(0, 100)}]`);
    const plan = await planningMode(
      text,
      (taskType, prompt, t, uid, sys) => routeTask(taskType as "planning", prompt, t ?? tier, uid, sys),
      telegramId,
      tier,
    );
    const planSummary = `🏗 *Architecture mapped — ${plan.manifest.length} files*\n\n*Stack:* ${plan.techStack}\n*Plan:* ${plan.summary}`;
    rufloSetPending(telegramId, { description: text, plan, tier, isElite, expiresAt: rufloTtl() });
    onPlanReady?.(plan, text, isElite);
    return { type: "build_plan_ready", content: planSummary, plan, description: text, tier, isElite };
  }

  // ── 5. Billing intent: Ruflo handles inline, no external billing handler ──────
  if (rufloIsBillingIntent(text)) {
    const billingContent = `💎 *WebForge Plans*\n\n*Starter* — Free\n10 daily actions, core builds & image gen\n\n*Pro* — ₦5,000/month\n150 actions, all models, priority queue\n\n*Elite* — ₦15,000/month\n500 actions, DeepBuild loops, GitHub sync\n\nUpgrade via @Webforgepaymentverificationbot`;
    return { type: "billing", content: billingContent };
  }

  // ── 6. General chat: Ruflo responds in persona with conversation context ──────
  const history = rufloGetHistory(telegramId);
  const contextPrompt = history.length > 2
    ? `[Conversation context:\n${history.slice(-6).map(h => `${h.role}: ${h.content}`).join("\n")}\n]\n\nLatest message: ${text}`
    : text;

  const taskType = rufloDetectTaskType(text);
  const result = await routeTask(taskType, contextPrompt, tier, telegramId, RUFLO_PERSONA_MATRIX);

  rufloAddHistory(telegramId, "user", text);
  rufloAddHistory(telegramId, "assistant", result.content.slice(0, 500));

  return {
    type: "chat",
    content: result.content,
    model: result.model,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    costUsd: result.costUsd,
  };
}

// ─── Semantic Code Splicer ────────────────────────────────────────────────────
// Injects content BEFORE or AFTER a structural anchor, without overwriting the whole file.

export async function spliceCodeIntoFile(
  filePath: string,
  targetAnchor: string,
  injectionContent: string,
  position: "before" | "after" = "after",
): Promise<boolean> {
  try {
    const existing = await fs.readFile(filePath, "utf8");
    const idx = existing.indexOf(targetAnchor);
    if (idx === -1) {
      logger.warn({ filePath, targetAnchor }, "spliceCodeIntoFile: anchor not found");
      return false;
    }

    let spliced: string;
    if (position === "before") {
      spliced = existing.slice(0, idx) + injectionContent + "\n" + existing.slice(idx);
    } else {
      // After: insert after the anchor line (find end of anchor's line)
      const afterAnchor = idx + targetAnchor.length;
      const nextNewline = existing.indexOf("\n", afterAnchor);
      const insertAt = nextNewline === -1 ? existing.length : nextNewline + 1;
      spliced = existing.slice(0, insertAt) + injectionContent + "\n" + existing.slice(insertAt);
    }

    await fs.writeFile(filePath, spliced, "utf8");
    logger.info({ filePath, targetAnchor, position }, "spliceCodeIntoFile: success");
    return true;
  } catch (err) {
    logger.error({ err, filePath }, "spliceCodeIntoFile: failed");
    return false;
  }
}
