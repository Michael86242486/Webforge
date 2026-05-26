import { exec, spawn } from "child_process";
import { promisify } from "util";
import net from "net";
import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import { logger } from "../lib/logger.js";
import { recordFileDiff } from "../utils/telemetry.js";

const execAsync = promisify(exec);

export const PROJECTS_BASE_DIR = process.env.PROJECTS_BASE_DIR ?? "/home/runner/workspace/user-projects";
const PORT_RANGE_START = parseInt(process.env.PORT_RANGE_START ?? "5100");

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

// ─── Directory & File Ops ─────────────────────────────────────────────────────

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
    { "path": "package.json", "description": "Node.js manifest with start script" },
    { "path": "src/index.js", "description": "Express server, listens on process.env.PORT" },
    { "path": "src/routes/api.js", "description": "REST API routes" },
    { "path": "public/index.html", "description": "Main HTML page" },
    { "path": "public/style.css", "description": "Styles" },
    { "path": "public/app.js", "description": "Frontend JavaScript" }
  ]
}

RULES:
- Use plain JavaScript (CommonJS require/exports) — NO TypeScript, NO ES modules
- package.json must have: { "scripts": { "start": "node src/index.js" } }
- Server must use process.env.PORT
- Target 8-14 files for a complete app
- Return ONLY the JSON object`;

  const result = await routeTaskFn("planning", planPrompt, tier, telegramId);

  try {
    const jsonMatch = result.content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON");
    const parsed = JSON.parse(jsonMatch[0]) as { techStack?: string; summary?: string; files?: FilePlan[] };
    return {
      manifest: parsed.files ?? [],
      techStack: parsed.techStack ?? "fullstack",
      summary: parsed.summary ?? userPrompt.slice(0, 80),
    };
  } catch {
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

export async function buildProjectFiles(
  workDir: string,
  aiOutput: string,
  projectId: string,
  manifest: FilePlan[],
  onFileWritten: (filesWritten: number, filePath: string) => void,
): Promise<number> {
  const parsed = parseFilesFromAIOutput(aiOutput, manifest);
  logger.info({ projectId, parsedCount: parsed.length, outputLen: aiOutput.length }, "buildProjectFiles parsed");

  let toWrite: ParsedFile[];
  if (parsed.length === 0) {
    logger.warn({ projectId }, "No files parsed — using guaranteed fallback app");
    toWrite = generateGuaranteedApp(manifest);
  } else {
    const parsedPaths = new Set(parsed.map(f => f.path));
    const stubs = manifest.filter(m => !parsedPaths.has(m.path)).map(m => ({ path: m.path, content: generateStubFile(m) }));
    toWrite = [...parsed, ...stubs];
  }

  let written = 0;
  for (const file of toWrite) {
    const absPath = path.join(workDir, file.path);
    await fs.mkdir(path.dirname(absPath), { recursive: true });
    await fs.writeFile(absPath, file.content, "utf8");
    written++;
    onFileWritten(written, file.path);
    logger.info({ projectId, file: file.path, size: file.content.length }, "File written");
  }
  return written;
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
