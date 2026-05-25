import app from "./app.js";
import { logger } from "./lib/logger.js";
import { initCoreBot } from "./bots/coreBot.js";
import { initPaymentBot } from "./bots/paymentBot.js";
import fs from "fs";

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
