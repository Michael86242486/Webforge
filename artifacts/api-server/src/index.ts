import app from "./app.js";
import { logger } from "./lib/logger.js";
import { initCoreBot } from "./bots/coreBot.js";
import { initPaymentBot } from "./bots/paymentBot.js";
import fs from "fs";

// ─── Global Error Safety Net ──────────────────────────────────────────────────
// Prevents the process from dying on unhandled promise rejections (e.g. Telegram
// sendMessage throwing a 400 due to bad Markdown entities).

process.on("unhandledRejection", (reason, promise) => {
  logger.error({ reason, promise: String(promise) }, "Unhandled promise rejection — process kept alive");
});

process.on("uncaughtException", (err) => {
  logger.error({ err }, "Uncaught exception — process kept alive");
});

// ─── Bootstrap ────────────────────────────────────────────────────────────────

const rawPort = process.env["PORT"];
if (!rawPort) throw new Error("PORT environment variable is required but was not provided.");

const port = Number(rawPort);
if (Number.isNaN(port) || port <= 0) throw new Error(`Invalid PORT value: "${rawPort}"`);

const projectsBaseDir = process.env.PROJECTS_BASE_DIR ?? "/home/runner/workspace/user-projects";
try {
  fs.mkdirSync(projectsBaseDir, { recursive: true });
} catch (_) {}

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
