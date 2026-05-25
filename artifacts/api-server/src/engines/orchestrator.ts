import { exec, spawn } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import { logger } from "../lib/logger.js";
import { recordFileDiff } from "../utils/telemetry.js";

const execAsync = promisify(exec);

export const PROJECTS_BASE_DIR = process.env.PROJECTS_BASE_DIR ?? "/home/runner/workspace/user-projects";

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

export async function writeFilesParallel(
  tasks: FileTask[],
  sessionId?: string
): Promise<void> {
  await Promise.all(
    tasks.map(async ({ filePath, content }) => {
      let before = "";
      try { before = await fs.readFile(filePath, "utf8"); } catch (_) {}
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, content, "utf8");
      if (sessionId) recordFileDiff(sessionId, before, content);
      logger.info({ filePath }, "File written by OpenClaw");
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
  cwd: string
): Promise<{ stdout: string; stderr: string }> {
  logger.info({ command, cwd }, "Running terminal command");
  try {
    const result = await execAsync(command, { cwd, timeout: 120_000 });
    return { stdout: result.stdout, stderr: result.stderr };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    return { stdout: e.stdout ?? "", stderr: e.stderr ?? e.message ?? "Unknown error" };
  }
}

export async function cloneRepository(repoUrl: string, targetDir: string): Promise<void> {
  await fs.mkdir(path.dirname(targetDir), { recursive: true });
  await runTerminalCommand(`git clone --depth=1 ${repoUrl} ${targetDir}`, "/tmp");
}

export function spawnBotProcess(
  workDir: string,
  entryFile: string,
  env: NodeJS.ProcessEnv
): { pid: number | undefined } {
  const child = spawn("node", [entryFile], {
    cwd: workDir,
    env: { ...process.env, ...env },
    detached: true,
    stdio: "ignore",
  });
  child.unref();
  return { pid: child.pid };
}

export async function scaffoldBotProject(
  workDir: string,
  botToken: string,
  description: string,
  commands: string
): Promise<void> {
  const packageJson = {
    name: "user-telegram-bot",
    version: "1.0.0",
    type: "module",
    main: "index.mjs",
    dependencies: { "node-telegram-bot-api": "^0.66.0" },
  };

  const personaJson = {
    name: "WebForge Assistant",
    systemPrompt: `You are a helpful assistant. ${description}`,
    tone: "friendly",
    instructions: commands,
  };

  const indexMjs = `
import TelegramBot from 'node-telegram-bot-api';
import { readFileSync } from 'fs';

const BOT_TOKEN = '${botToken}';
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

function getPersona() {
  try {
    return JSON.parse(readFileSync('./config/persona.json', 'utf8'));
  } catch {
    return { systemPrompt: 'You are a helpful assistant.', name: 'Bot' };
  }
}

bot.onText(/\\/start/, (msg) => {
  const persona = getPersona();
  bot.sendMessage(msg.chat.id, \`Hello! I am \${persona.name}. How can I help you today?\`);
});

bot.on('message', async (msg) => {
  if (msg.text?.startsWith('/')) return;
  const persona = getPersona();
  bot.sendMessage(msg.chat.id, \`[\${persona.name}] Processing: \${msg.text}\`);
});

console.log('Bot started and polling...');
`;

  const tasks: FileTask[] = [
    { filePath: path.join(workDir, "package.json"), content: JSON.stringify(packageJson, null, 2) },
    { filePath: path.join(workDir, "index.mjs"), content: indexMjs.trim() },
    { filePath: path.join(workDir, "config", "persona.json"), content: JSON.stringify(personaJson, null, 2) },
  ];

  await writeFilesParallel(tasks);
  await runTerminalCommand("npm install --legacy-peer-deps", workDir);
}

export async function processImageWithSharp(
  inputPath: string,
  operation: {
    type: "resize" | "crop" | "filter" | "overlay";
    width?: number;
    height?: number;
    text?: string;
    grayscale?: boolean;
  },
  outputPath: string
): Promise<void> {
  const { default: sharp } = await import("sharp");
  let pipeline = sharp(inputPath);

  switch (operation.type) {
    case "resize":
      pipeline = pipeline.resize(operation.width, operation.height, { fit: "cover" });
      break;
    case "crop":
      pipeline = pipeline.resize(operation.width, operation.height, { fit: "cover", position: "center" });
      break;
    case "filter":
      if (operation.grayscale) pipeline = pipeline.grayscale();
      break;
    case "overlay":
      break;
  }

  await pipeline.toFile(outputPath);
}

export interface PlanningResult {
  manifest: FilePlan[];
  techStack: string;
  summary: string;
}

export async function planningMode(
  userPrompt: string,
  routeTaskFn: (
    taskType: "planning",
    prompt: string,
    tier: string,
    telegramId?: number,
    systemPrompt?: string,
  ) => Promise<{ content: string; model: string }>,
  telegramId: number,
  tier: string,
): Promise<PlanningResult> {
  const planPrompt = `Analyze this project request and output a structured build plan as JSON.

User request: "${userPrompt}"

Output ONLY valid JSON in this exact format (no markdown, no explanation outside JSON):
{
  "techStack": "e.g. Node.js + Express + SQLite",
  "summary": "One sentence describing what this project does",
  "files": [
    { "path": "package.json", "description": "Node.js project manifest with dependencies" },
    { "path": "src/index.ts", "description": "Express server entry point" },
    { "path": "src/routes/api.ts", "description": "REST API route handlers" }
  ]
}

Be specific and complete. Include every file needed for a working production app: config, source, assets, and documentation. Aim for 8-20 files for a typical project.`;

  const result = await routeTaskFn("planning", planPrompt, tier, telegramId);

  try {
    const jsonMatch = result.content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON found in planning response");
    const parsed = JSON.parse(jsonMatch[0]) as { techStack?: string; summary?: string; files?: FilePlan[] };
    return {
      manifest: parsed.files ?? [],
      techStack: parsed.techStack ?? "fullstack",
      summary: parsed.summary ?? "Custom application",
    };
  } catch (err) {
    logger.warn({ err }, "planningMode JSON parse failed, using fallback manifest");
    return {
      manifest: [
        { path: "package.json", description: "Project manifest" },
        { path: "src/index.ts", description: "Main entry point" },
        { path: "src/app.ts", description: "Application logic" },
        { path: "public/index.html", description: "Frontend entry" },
        { path: "README.md", description: "Documentation" },
      ],
      techStack: "fullstack",
      summary: userPrompt.slice(0, 80),
    };
  }
}

export interface ParsedFile {
  path: string;
  content: string;
}

export function parseFilesFromAIOutput(output: string): ParsedFile[] {
  const files: ParsedFile[] = [];

  const markerRegex = /===\s*FILE:\s*(.+?)\s*===\n([\s\S]*?)(?====\s*(?:FILE:|END FILE)|$)/g;
  let match: RegExpExecArray | null;

  while ((match = markerRegex.exec(output)) !== null) {
    const filePath = match[1].trim();
    const content = match[2].replace(/===\s*END FILE\s*===\s*$/, "").trim();
    if (filePath && content) files.push({ path: filePath, content });
  }

  if (files.length > 0) return files;

  const codeBlockRegex = /```[\w.]*\n(?:\/\/\s*FILE:\s*(.+?)\n)?([\s\S]*?)```/g;
  while ((match = codeBlockRegex.exec(output)) !== null) {
    const filePath = match[1]?.trim();
    const content = match[2].trim();
    if (filePath && content) files.push({ path: filePath, content });
  }

  return files;
}

export async function buildProjectFiles(
  workDir: string,
  aiOutput: string,
  projectId: string,
  manifest: FilePlan[],
  onFileWritten: (filesWritten: number, filePath: string) => void,
): Promise<number> {
  const parsed = parseFilesFromAIOutput(aiOutput);

  const toWrite: ParsedFile[] = parsed.length > 0 ? parsed : manifest.map((f, i) => ({
    path: f.path,
    content: `// ${f.description}\n// File ${i + 1} of ${manifest.length} — generated by WebForge`,
  }));

  let written = 0;
  for (const file of toWrite) {
    const absPath = path.join(workDir, file.path);
    await fs.mkdir(path.dirname(absPath), { recursive: true });
    await fs.writeFile(absPath, file.content, "utf8");
    written++;
    onFileWritten(written, file.path);
    logger.info({ projectId, filePath: file.path }, "Project file written");
  }

  return written;
}
