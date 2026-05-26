import app from "./app.js";
import { logger } from "./lib/logger.js";
import { initCoreBot } from "./bots/coreBot.js";
import { initPaymentBot } from "./bots/paymentBot.js";
import fs from "fs";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

// ─── Global Error Safety Net ──────────────────────────────────────────────────

process.on("unhandledRejection", (reason, promise) => {
  logger.error({ reason, promise: String(promise) }, "Unhandled promise rejection — process kept alive");
});

process.on("uncaughtException", (err) => {
  logger.error({ err }, "Uncaught exception — process kept alive");
});

// ─── DB Auto-Migration ────────────────────────────────────────────────────────
// Runs drizzle-kit push on startup so missing tables are created automatically.
// This is safe to run repeatedly — drizzle-kit push is idempotent.

async function ensureDbSchema(): Promise<void> {
  try {
    logger.info("DB auto-migration: running drizzle-kit push...");
    const { stdout, stderr } = await execAsync(
      "pnpm --filter @workspace/db run push-force",
      { cwd: "/home/runner/workspace", timeout: 60_000 }
    );
    if (stdout.trim()) logger.info({ output: stdout.trim() }, "DB migration: complete");
    if (stderr.trim()) logger.warn({ stderr: stderr.trim() }, "DB migration: warnings");
  } catch (err) {
    logger.error({ err }, "DB auto-migration failed — server will continue but DB may be missing tables");
  }
}

// ─── Bootstrap ────────────────────────────────────────────────────────────────

const rawPort = process.env["PORT"];
if (!rawPort) throw new Error("PORT environment variable is required but was not provided.");

const port = Number(rawPort);
if (Number.isNaN(port) || port <= 0) throw new Error(`Invalid PORT value: "${rawPort}"`);

const projectsBaseDir = process.env.PROJECTS_BASE_DIR ?? "/home/runner/workspace/user-projects";
try {
  fs.mkdirSync(projectsBaseDir, { recursive: true });
} catch (_) {}

await ensureDbSchema();

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }
  logger.info({ port }, "WebForge API Server listening");

  initCoreBot();
  initPaymentBot();
  logger.info("Telegram bots initialized");
});
