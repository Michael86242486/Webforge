import { exec, spawn } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import { logger } from "../lib/logger.js";
import { recordFileDiff } from "../utils/telemetry.js";

const execAsync = promisify(exec);

export const PROJECTS_BASE_DIR = process.env.PROJECTS_BASE_DIR ?? "/home/runner/workspace/user-projects";
const PORT_RANGE_START = parseInt(process.env.PORT_RANGE_START ?? "5100");

export function assignProjectPort(projectId: number): number {
  return PORT_RANGE_START + (projectId % 900);
}

export async function ensureProjectDir(projectId: number, userId: number): Promise<string> {
  const dir = path.join(PROJECTS_BASE_DIR, `user-${userId}`, `project-${projectId}`);
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
      logger.info({ filePath }, "File written");
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
  return entries
    .filter(e => e.isFile())
    .map(e => path.join(e.parentPath ?? dir, e.name));
}

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

  for (const p of ["src/index.js","src/server.js","src/app.js","index.js","server.js","app.js","src/index.mjs"]) {
    try { await fs.access(path.join(workDir, p)); return p; } catch (_) {}
  }
  return "index.js";
}

export async function spawnProjectApp(workDir: string, projectId: number, port: number): Promise<{ pid: number | undefined }> {
  const entry = await detectEntryPoint(workDir);
  const outFd = fsSync.openSync(path.join(workDir, "app.stdout.log"), "a");
  const errFd = fsSync.openSync(path.join(workDir, "app.stderr.log"), "a");

  const child = spawn("node", [entry], {
    cwd: workDir,
    env: { ...process.env, PORT: String(port), NODE_ENV: "production" },
    detached: true,
    stdio: ["ignore", outFd, errFd],
  });
  child.unref();
  logger.info({ projectId, port, entry, pid: child.pid }, "Project app spawned");
  return { pid: child.pid };
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
bot.onText(/\\/start/, msg => {
  const p = getPersona();
  bot.sendMessage(msg.chat.id, 'Hi! I am ' + p.name + '. How can I help?');
});
bot.on('message', msg => {
  if (msg.text?.startsWith('/')) return;
  bot.sendMessage(msg.chat.id, '[' + getPersona().name + '] Got: ' + msg.text);
});
console.log('Bot polling...');
`,
    },
  ];
  await writeFilesParallel(tasks);
  await runTerminalCommand("npm install --legacy-peer-deps", workDir);
}

export interface PlanningResult {
  manifest: FilePlan[];
  techStack: string;
  summary: string;
}

export async function planningMode(
  userPrompt: string,
  routeTaskFn: (taskType: "planning", prompt: string, tier: string, telegramId?: number, systemPrompt?: string) => Promise<{ content: string; model: string }>,
  telegramId: number,
  tier: string,
): Promise<PlanningResult> {
  const planPrompt = `You are planning a software project. Output ONLY valid JSON (no markdown fences, no prose).

User request: "${userPrompt}"

JSON format:
{
  "techStack": "Node.js + Express + SQLite",
  "summary": "One sentence describing the app",
  "files": [
    { "path": "package.json", "description": "Node.js project manifest with start script" },
    { "path": "src/index.js", "description": "Express server, listens on process.env.PORT" },
    { "path": "src/routes/api.js", "description": "REST API routes" },
    { "path": "public/index.html", "description": "Main HTML page" },
    { "path": "public/style.css", "description": "CSS styles" },
    { "path": "public/app.js", "description": "Frontend JavaScript" }
  ]
}

RULES:
- Use plain JavaScript (CommonJS require/exports) for all server files — NO TypeScript
- Include process.env.PORT in the server entry file
- package.json must have: { "scripts": { "start": "node src/index.js" } }
- Target 8-14 files for a complete working app
- Return ONLY the JSON object, nothing else`;

  const result = await routeTaskFn("planning", planPrompt, tier, telegramId);

  try {
    const jsonMatch = result.content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON found");
    const parsed = JSON.parse(jsonMatch[0]) as { techStack?: string; summary?: string; files?: FilePlan[] };
    return {
      manifest: parsed.files ?? [],
      techStack: parsed.techStack ?? "fullstack",
      summary: parsed.summary ?? userPrompt.slice(0, 80),
    };
  } catch (err) {
    logger.warn({ err }, "planningMode JSON parse failed, using fallback");
    return {
      manifest: [
        { path: "package.json", description: "Node.js project manifest" },
        { path: "src/index.js", description: "Express server (process.env.PORT)" },
        { path: "src/routes/api.js", description: "API routes" },
        { path: "public/index.html", description: "Main HTML page" },
        { path: "public/style.css", description: "Styles" },
        { path: "public/app.js", description: "Frontend logic" },
        { path: "README.md", description: "Documentation" },
      ],
      techStack: "Node.js + Express",
      summary: userPrompt.slice(0, 80),
    };
  }
}

// ─── File Parser (multi-format, aggressive) ───────────────────────────────────

export interface ParsedFile {
  path: string;
  content: string;
}

/**
 * Parse AI output into file objects. Handles 4 formats in priority order:
 * 1. === FILE: path === ... === END FILE ===  (preferred)
 * 2. **`path`** or ## path followed by a code block
 * 3. Code block with // FILE: path comment as first line
 * 4. Named code blocks matched against manifest
 */
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

  // ── Format 1: === FILE: path === ... === END FILE ===
  const fmt1 = /===\s*FILE:\s*(.+?)\s*===\n([\s\S]*?)(?====\s*(?:FILE:|END\s*FILE)|$)/gi;
  let m: RegExpExecArray | null;
  while ((m = fmt1.exec(output)) !== null) {
    const body = m[2].replace(/===\s*END\s*FILE\s*===/i, "").trim();
    add(m[1], body);
  }
  if (files.length > 0) return files;

  // ── Format 2: // FILE: path OR # path OR **path** before a code block
  const fmt2 = /(?:\/\/\s*FILE:\s*|#\s*FILE:\s*|\*\*`?|##?\s+)([^\n`*]+)`?\*?\*?\n```[\w]*\n([\s\S]*?)```/gi;
  while ((m = fmt2.exec(output)) !== null) {
    add(m[1], m[2]);
  }
  if (files.length > 0) return files;

  // ── Format 3: Code block where first line is a path comment
  const fmt3 = /```[\w.-]*\n([\s\S]*?)```/gi;
  const codeBlocks: string[] = [];
  while ((m = fmt3.exec(output)) !== null) {
    codeBlocks.push(m[1]);
  }

  for (const block of codeBlocks) {
    const firstLine = block.split("\n")[0] ?? "";
    // e.g. "// src/index.js" or "# package.json"
    const pathMatch = firstLine.match(/^(?:\/\/|#|\/\*)\s*([\w./src-]+\.\w{1,5})/);
    if (pathMatch) {
      add(pathMatch[1], block.split("\n").slice(1).join("\n").trim());
    }
  }
  if (files.length > 0) return files;

  // ── Format 4: Match code blocks to manifest by order or content heuristics
  if (manifest && codeBlocks.length > 0) {
    logger.warn("parseFilesFromAIOutput: falling back to manifest-order matching");
    for (let i = 0; i < Math.min(codeBlocks.length, manifest.length); i++) {
      const block = codeBlocks[i];
      const plan = manifest[i];
      if (block && plan && block.trim().length > 20) {
        add(plan.path, block.trim());
      }
    }
  }

  return files;
}

// ─── Build Project Files ──────────────────────────────────────────────────────

export async function buildProjectFiles(
  workDir: string,
  aiOutput: string,
  projectId: string,
  manifest: FilePlan[],
  onFileWritten: (filesWritten: number, filePath: string) => void,
): Promise<number> {
  const parsed = parseFilesFromAIOutput(aiOutput, manifest);

  logger.info({ projectId, parsedCount: parsed.length, outputLength: aiOutput.length }, "buildProjectFiles: parsed files");

  let toWrite: ParsedFile[];
  if (parsed.length === 0) {
    // Fallback: generate a minimal working Express app that at least runs
    logger.warn({ projectId }, "No files parsed from AI output — using guaranteed fallback app");
    toWrite = generateGuaranteedApp(manifest);
  } else {
    // Fill in any manifest files that weren't in the AI output with stubs
    const parsedPaths = new Set(parsed.map(f => f.path));
    const stubs = manifest
      .filter(m => !parsedPaths.has(m.path))
      .map(m => ({ path: m.path, content: generateStubFile(m) }));
    toWrite = [...parsed, ...stubs];
  }

  let written = 0;
  for (const file of toWrite) {
    const absPath = path.join(workDir, file.path);
    await fs.mkdir(path.dirname(absPath), { recursive: true });
    await fs.writeFile(absPath, file.content, "utf8");
    written++;
    onFileWritten(written, file.path);
    logger.info({ projectId, filePath: file.path, size: file.content.length }, "Project file written");
  }

  return written;
}

// ─── Guaranteed Working App Fallback ─────────────────────────────────────────

function generateGuaranteedApp(manifest: FilePlan[]): ParsedFile[] {
  const appName = "webforge-app";
  return [
    {
      path: "package.json",
      content: JSON.stringify({
        name: appName,
        version: "1.0.0",
        scripts: { start: "node src/index.js" },
        dependencies: { express: "^4.18.2" },
      }, null, 2),
    },
    {
      path: "src/index.js",
      content: `const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', project: '${appName}', timestamp: new Date().toISOString() });
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.listen(PORT, () => {
  console.log('${appName} running on port ' + PORT);
});
`,
    },
    {
      path: "public/index.html",
      content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>WebForge App</title>
  <link rel="stylesheet" href="style.css"/>
</head>
<body>
  <div class="container">
    <div class="badge">Built with WebForge ⚡</div>
    <h1>Your app is live!</h1>
    <p>${manifest[0]?.description ?? "Your WebForge application is running."}</p>
    <div class="status" id="status">Checking API...</div>
  </div>
  <script src="app.js"></script>
</body>
</html>`,
    },
    {
      path: "public/style.css",
      content: `* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  background: linear-gradient(135deg, #0a0e14 0%, #111720 100%);
  color: #cdd9e5;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
}
.container {
  text-align: center;
  padding: 48px 32px;
  max-width: 600px;
}
.badge {
  display: inline-block;
  background: rgba(88,166,255,.15);
  color: #58a6ff;
  border: 1px solid rgba(88,166,255,.3);
  padding: 6px 16px;
  border-radius: 100px;
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 24px;
}
h1 {
  font-size: clamp(28px, 5vw, 48px);
  font-weight: 800;
  letter-spacing: -.02em;
  margin-bottom: 16px;
  background: linear-gradient(135deg, #cdd9e5, #58a6ff);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}
p {
  font-size: 18px;
  color: #8b949e;
  line-height: 1.6;
  margin-bottom: 32px;
}
.status {
  display: inline-block;
  background: rgba(63,185,80,.1);
  color: #3fb950;
  border: 1px solid rgba(63,185,80,.3);
  padding: 8px 20px;
  border-radius: 8px;
  font-family: monospace;
  font-size: 13px;
}`,
    },
    {
      path: "public/app.js",
      content: `fetch('/api/health')
  .then(r => r.json())
  .then(d => {
    document.getElementById('status').textContent = '✅ API: ' + d.status + ' — ' + d.timestamp;
  })
  .catch(() => {
    document.getElementById('status').textContent = '⚠️ API unavailable';
    document.getElementById('status').style.color = '#f0883e';
  });`,
    },
  ];
}

function generateStubFile(f: FilePlan): string {
  if (f.path === "README.md") {
    return `# ${f.path.replace(/\.md$/, "")}\n\n${f.description}\n\nGenerated by WebForge.\n`;
  }
  if (f.path.endsWith(".json") && f.path !== "package.json") {
    return `{}\n`;
  }
  if (f.path.endsWith(".css")) {
    return `/* ${f.description} */\n`;
  }
  return `// ${f.description}\n`;
}

export async function cloneRepository(repoUrl: string, targetDir: string): Promise<void> {
  await fs.mkdir(path.dirname(targetDir), { recursive: true });
  await runTerminalCommand(`git clone --depth=1 ${repoUrl} ${targetDir}`, "/tmp");
}

export async function processImageWithSharp(
  inputPath: string,
  operation: { type: "resize" | "crop" | "filter"; width?: number; height?: number; grayscale?: boolean },
  outputPath: string,
): Promise<void> {
  const { default: sharp } = await import("sharp");
  let pipeline = sharp(inputPath);
  if (operation.type === "resize" || operation.type === "crop") {
    pipeline = pipeline.resize(operation.width, operation.height, { fit: "cover" });
  }
  if (operation.grayscale) pipeline = pipeline.grayscale();
  await pipeline.toFile(outputPath);
}
