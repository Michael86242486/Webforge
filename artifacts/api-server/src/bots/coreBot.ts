import TelegramBot from "node-telegram-bot-api";
import { routeTask } from "../ai/router.js";
import {
  getOrCreateUser, checkActionAllowed, incrementAction,
  checkProjectLimitAllowed, TIER_LIMITS, type Tier,
} from "../utils/billing.js";
import { encrypt, decrypt } from "../utils/crypto.js";
import { recordTelemetry } from "../utils/telemetry.js";
import { safeSend, sendTyping, safeDelete, escapeMd } from "../utils/telegram.js";
import { db, usersTable, projectsTable, paymentsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import {
  ensureProjectDir, scaffoldBotProject, spawnBotProcess,
  runTerminalCommand, spawnProjectApp, pollAppHealth,
  assignProjectPort, findFreePort, syntaxAuditFiles, patchSyntaxError,
  generateReadme, gitCloneRepo, gitPushChanges, selfHealApp,
  triBrainBuildFiles,
  watchProjectDir, stopProjectWatcher, getProjectLogs, stopSupervisedProcess,
  RUFLO_PERSONA_MATRIX,
  rufloDispatch, rufloDeleteDiscovery, rufloDeletePending,
  rufloGetPending, rufloAddHistory,
  type PlanningResult, type TriBrainResult,
} from "../engines/orchestrator.js";
import {
  broadcastProgress, broadcastRedirect, broadcastStatus, broadcastToProject,
} from "../routes/stream.js";
import { logger } from "../lib/logger.js";
import fs from "fs/promises";
import path from "path";
import os from "os";

const TOKEN = process.env.CORE_BOT_TOKEN ?? "";
const ADMIN_TELEGRAM_ID = 8234256894;
const PAYMENT_BOT_USERNAME = "@Webforgepaymentverificationbot";
const REQUIRED_CHANNEL = "@mkystudiodev";
const PLATFORM_URL = (() => {
  const d = process.env.REPLIT_DOMAINS?.split(",")[0];
  return d ? `https://${d}` : "https://webforge.replit.app";
})();

// ─── WPE Integration ──────────────────────────────────────────────────────────

function detectFramework(techStack: string): string {
  const s = techStack.toLowerCase();
  if (s.includes("next")) return "nextjs";
  if (s.includes("react") && s.includes("vite")) return "react-vite";
  if (s.includes("react")) return "react";
  if (s.includes("express")) return "express";
  if (s.includes("fastify")) return "fastify";
  if (s.includes("koa")) return "koa";
  if (s.includes("flask")) return "flask";
  if (s.includes("django")) return "django";
  if (s.includes("html")) return "html";
  return "node";
}

interface WpeWebhookArgs {
  projectSlug: string;
  techStack: string;
  health: number;
  liveUrl: string;
  telegramId: number;
  username?: string;
}

async function fireWpeWebhook(args: WpeWebhookArgs): Promise<void> {
  const wpeUrl = process.env.WPE_API_URL;
  const wpeKey = process.env.WPE_API_KEY;
  if (!wpeUrl || !wpeKey) {
    logger.warn("WPE_API_URL or WPE_API_KEY not set — skipping WPE webhook");
    return;
  }

  const framework = detectFramework(args.techStack);
  const owner = args.username ? `@${args.username}` : `tg:${args.telegramId}`;

  const payload = {
    projectId: args.projectSlug,
    event: "build.complete",
    owner,
    framework,
    url: args.liveUrl,   // actual proxy URL where the app is hosted
    payload: {
      health: args.health,
      buildTime: 3000,
    },
  };

  // Strip any trailing slash so we never produce double-slashes in the final URL
  const base = wpeUrl.replace(/\/+$/, "");
  const webhookUrl = `${base}/api/webhook/project-ready`;
  // payload.url already set to the real live proxy URL — no override needed

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": wpeKey,           // lowercase — works with all HTTP frameworks
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      logger.info({ projectSlug: args.projectSlug, framework, status: res.status, url: webhookUrl }, "WPE webhook acknowledged");
    } else {
      let body = "";
      try { body = await res.text(); } catch { /* ignore */ }
      logger.warn({ projectSlug: args.projectSlug, status: res.status, body, url: webhookUrl }, "WPE webhook non-200 response");
      console.error(`❌ WPE WEBHOOK NON-200 [${res.status}] for ${args.projectSlug}:`, body);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`❌ WPE WEBHOOK DELIVERY FAILED for ${args.projectSlug}:`, msg);
    logger.warn({ err: msg, projectSlug: args.projectSlug, url: webhookUrl }, "WPE webhook delivery failed (non-fatal)");
  }
}

// ─── Slug helpers ─────────────────────────────────────────────────────────────

function slugify(name: string): string {
  return name.toLowerCase().trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

async function extractProjectName(description: string, telegramId: number): Promise<string | null> {
  try {
    const result = await routeTask(
      "chat",
      `Extract a short, memorable project name (1-3 words, no generic names like "My App" or "Web App") from this build request:\n"${description.slice(0, 400)}"\n\nReply with ONLY the project name, or "NONE" if no distinct name is evident.`,
      "starter", telegramId, undefined
    );
    const raw = result.content.trim().replace(/["'`*]/g, "").split(/[\n,]/)[0]!.trim();
    if (!raw || raw.toUpperCase() === "NONE" || raw.length > 50 || raw.includes(" ") && raw.split(" ").length > 4) return null;
    return raw;
  } catch {
    return null;
  }
}

// ─── State Maps (entry-bot only tracks active builds + git push confirmations) ─
// Identity, intent detection, conversation history, discovery, and pending
// build state are all owned by Ruflo inside orchestrator.ts.

// Tracks number of active concurrent builds per user
const activeSessions = new Map<number, number>();
const gitPendingPush = new Map<number, { workDir: string; projectId: number }>();

// Pending naming: user must reply with a project name before build starts
const pendingNaming = new Map<number, {
  chatId: number;
  plan: PlanningResult;
  description: string;
  tier: Tier;
  isElite: boolean;
}>();

function activeSessionCount(userId: number): number {
  return activeSessions.get(userId) ?? 0;
}
function activeSessionAdd(userId: number): void {
  activeSessions.set(userId, (activeSessions.get(userId) ?? 0) + 1);
}
function activeSessionRemove(userId: number): void {
  const n = (activeSessions.get(userId) ?? 1) - 1;
  if (n <= 0) activeSessions.delete(userId); else activeSessions.set(userId, n);
}

// ─── Admin Stats Cache (refreshed every 10 min) ───────────────────────────────

interface CachedStats {
  totalBuilds: number;
  activeLivePorts: number;
  totalTokens: number;
  estimatedRevenueNgn: number;
  uniqueUsers: number;
  lastUpdated: Date;
}

let cachedStats: CachedStats = {
  totalBuilds: 0,
  activeLivePorts: 0,
  totalTokens: 0,
  estimatedRevenueNgn: 0,
  uniqueUsers: 0,
  lastUpdated: new Date(0),
};

async function refreshStatsCache(): Promise<void> {
  try {
    const { sql } = await import("drizzle-orm");
    const { paymentsTable, telemetryTable } = await import("@workspace/db");

    const [buildCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(projectsTable)
      .where(sql`status NOT IN ('deleted', 'building')`);

    const [activePorts] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(projectsTable)
      .where(sql`status = 'running' AND port IS NOT NULL`);

    const [tokenSum] = await db
      .select({ total: sql<number>`COALESCE(SUM(input_tokens + output_tokens), 0)::int` })
      .from(telemetryTable);

    const [revenue] = await db
      .select({ total: sql<number>`COALESCE(SUM(amount_ngn), 0)::int` })
      .from(paymentsTable)
      .where(sql`status = 'approved'`);

    const [userCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(usersTable);

    cachedStats = {
      totalBuilds: buildCount?.count ?? 0,
      activeLivePorts: activePorts?.count ?? 0,
      totalTokens: tokenSum?.total ?? 0,
      estimatedRevenueNgn: revenue?.total ?? 0,
      uniqueUsers: userCount?.count ?? 0,
      lastUpdated: new Date(),
    };
    logger.info(cachedStats, "Admin stats cache refreshed");
  } catch (err) {
    logger.warn({ err }, "Failed to refresh admin stats cache");
  }
}

function startStatsCache(): void {
  refreshStatsCache().catch(() => {});
  setInterval(() => refreshStatsCache().catch(() => {}), 10 * 60 * 1000);
}

// ─── NEW: Per-user rate limiter ───────────────────────────────────────────────
const lastMessageTime = new Map<number, number>();
const RATE_LIMIT_MS = 1500;

function isRateLimited(userId: number): boolean {
  const last = lastMessageTime.get(userId) ?? 0;
  const now = Date.now();
  if (now - last < RATE_LIMIT_MS) return true;
  lastMessageTime.set(userId, now);
  return false;
}

let bot: TelegramBot | null = null;

// ─── Subscription Gateway ─────────────────────────────────────────────────────

async function isSubscribed(telegramId: number): Promise<boolean> {
  if (!bot) return false;
  try {
    const m = await bot.getChatMember(REQUIRED_CHANNEL, telegramId);
    return ["member", "administrator", "creator"].includes(m.status);
  } catch { return false; }
}

async function sendGate(chatId: number): Promise<void> {
  await safeSend(bot!, chatId,
    `🔒 *Join to Unlock WebForge*\n\nJoin our official channel to access the build engine:\n\n📢 ${REQUIRED_CHANNEL}\n\nThen tap *I've Joined* below ↓`,
    { parse_mode: "Markdown", reply_markup: { inline_keyboard: [[
      { text: "📢 Join Channel", url: `https://t.me/${REQUIRED_CHANNEL.replace("@","")}` },
      { text: "✅ I've Joined", callback_data: "check_subscription" },
    ]] } }
  );
}


// ─── Full Build Pipeline ──────────────────────────────────────────────────────

async function runFullBuild(
  chatId: number,
  telegramId: number,
  description: string,
  plan: PlanningResult,
  tier: Tier,
  isElite: boolean,
  slug?: string,
): Promise<void> {
  if (!bot) return;

  const userRow0 = await db.select().from(usersTable).where(eq(usersTable.telegramId, telegramId)).limit(1);
  const userTier0 = (userRow0[0]?.tier as Tier) ?? "starter";
  const maxConcurrent = TIER_LIMITS[userTier0].concurrentBuilds;
  if (activeSessionCount(telegramId) >= maxConcurrent) {
    await safeSend(bot, chatId,
      `⏳ You have *${activeSessionCount(telegramId)}/${maxConcurrent}* concurrent builds running.\n\n` +
      (maxConcurrent === 1 ? `Upgrade to Pro for *3 simultaneous builds*, or Elite for *5*. Upgrade via ${PAYMENT_BOT_USERNAME}` : `Wait for a slot to free up or use /cancel.`),
      { parse_mode: "Markdown" }
    );
    return;
  }
  activeSessionAdd(telegramId);

  const finalSlug = slug && slug.length > 0 ? slug : undefined;
  const projectName = finalSlug ?? description.slice(0, 60);

  const [project] = await db.insert(projectsTable).values({
    userId: telegramId,
    name: projectName,
    slug: finalSlug,
    description,
    status: "building",
    techStack: plan.techStack,
  }).returning();

  const workDir = await ensureProjectDir(project.id, telegramId, finalSlug);
  await db.update(projectsTable).set({ workDir, slug: finalSlug }).where(eq(projectsTable.id, project.id));

  const pid = String(project.id);
  const projectKey = finalSlug ?? String(project.id);
  const deployUrl = `${PLATFORM_URL}/deploying/${projectKey}`;

  await safeSend(bot, chatId,
    `🚀 *Build Started — \`${projectKey}\`*\n\nLive deploy page:\n${deployUrl}`,
    { parse_mode: "Markdown", reply_markup: { inline_keyboard: [[{ text: "📊 Watch Live Build", url: deployUrl }]] } }
  );

  try {
    await db.update(projectsTable).set({
      buildManifest: plan.manifest as unknown as Record<string, unknown>[],
      filesTotal: plan.manifest.length,
    }).where(eq(projectsTable.id, project.id));

    broadcastProgress(pid, 15, `${plan.manifest.length} files planned`, 0, plan.manifest.length);
    broadcastToProject(pid, { type: "round", round: "Plan", maxRounds: isElite ? 5 : 1, message: plan.summary });

    // ── Tri-Brain Ensemble: Mistral planned, Grok-3 per-file, Dev-X audit ───
    // Phase 1 (Mistral planning) already completed above via planningMode.
    // Phase 2 (Grok-3) + Phase 3 (Dev-X) happen here per-file.
    broadcastProgress(pid, 20, `Phase 2: Grok-3 synthesizing ${plan.manifest.length} files...`, 0, plan.manifest.length);
    await safeSend(bot, chatId,
      `🧠 *Tri-Brain Activated*\n\n` +
      `✅ Mistral designed the architecture\n` +
      `⚡ Grok-3 synthesizing each file (${plan.manifest.length} files)...\n` +
      `🛡️ Dev-X will audit JS files before write`,
      { parse_mode: "Markdown" }
    );

    const triBrainResult: TriBrainResult = await triBrainBuildFiles(
      workDir, description, plan, telegramId,
      (n, total, filePath, phase) => {
        const pct = 20 + (n / Math.max(total, 1)) * 55;
        broadcastProgress(pid, pct, `${phase}: ${path.basename(filePath)}`, n, total);
        broadcastToProject(pid, {
          type: "round", round: n, maxRounds: total,
          message: `[${phase}] Written: ${filePath}`,
        });
      },
    );

    const written = triBrainResult.written;

    await safeSend(bot, chatId,
      `✅ *Tri-Brain Synthesis Complete*\n` +
      `📁 *${written} files written* — Cost: $${triBrainResult.totalCostUsd.toFixed(4)}` +
      (triBrainResult.phaseErrors.length > 0
        ? `\n⚠️ ${triBrainResult.phaseErrors.length} phase error(s) — fallback stubs used`
        : "\n🟢 All files synthesized cleanly"),
      { parse_mode: "Markdown" }
    );

    recordTelemetry({
      sessionId: pid, userId: telegramId, action: "tribrain_build",
      model: "grok-3+dev-x", inputTokens: 0, outputTokens: 0,
      costUsd: triBrainResult.totalCostUsd,
    }).catch(() => {});

    // ── Syntax audit loop ─────────────────────────────────────────────────
    broadcastProgress(pid, 75, "Running syntax audit...", written, plan.manifest.length);
    const syntaxErrors = await syntaxAuditFiles(workDir);

    if (syntaxErrors.length > 0) {
      await safeSend(bot, chatId,
        `🔍 *Syntax Audit* — found ${syntaxErrors.length} issue(s), auto-patching...`,
        { parse_mode: "Markdown" }
      );
      let patched = 0;
      for (const se of syntaxErrors) {
        const ok = await patchSyntaxError(workDir, se.file, se.error,
          prompt => routeTask("fixing", prompt, tier, telegramId, RUFLO_PERSONA_MATRIX).then(r => r.content)
        );
        if (ok) patched++;
      }
      await safeSend(bot, chatId,
        `✅ *Syntax Patch* — ${patched}/${syntaxErrors.length} issues resolved`,
        { parse_mode: "Markdown" }
      );
    }

    // ── npm install ───────────────────────────────────────────────────────
    broadcastProgress(pid, 78, "Installing dependencies...", written, plan.manifest.length);
    broadcastStatus(pid, "Running npm install...");
    await runTerminalCommand("npm install --legacy-peer-deps 2>&1", workDir, 180_000);
    await incrementAction(telegramId);

    // ── Start app (auto-port) ─────────────────────────────────────────────
    const preferred = assignProjectPort(project.id);
    const port = await findFreePort(preferred);
    broadcastProgress(pid, 88, `Starting on port ${port}...`, written, plan.manifest.length);

    const { pid: procPid } = await spawnProjectApp(workDir, project.id, port, projectKey);
    await db.update(projectsTable).set({ port, botPid: procPid ?? null }).where(eq(projectsTable.id, project.id));
    // Start hot-reload file watcher for this project
    watchProjectDir(workDir, project.id);

    await safeSend(bot, chatId, `⏳ *App starting on port ${port}...* (10-30s)`, { parse_mode: "Markdown" });

    // ── Health poll ───────────────────────────────────────────────────────
    broadcastProgress(pid, 92, "Polling for HTTP response...", written, plan.manifest.length);
    let isLive = await pollAppHealth(port, 90_000);
    const liveUrl = `${PLATFORM_URL}/api/preview-proxy/${projectKey}/`;

    // ── Self-Healing Autopsy (if app didn't start) ────────────────────────
    if (!isLive) {
      await safeSend(bot, chatId,
        `🔧 *App didn't respond — running self-healing autopsy...*\n_Reading crash logs and dispatching AI repair..._`,
        { parse_mode: "Markdown" }
      );
      broadcastStatus(pid, "Self-healing: analysing crash...");

      const healResult = await selfHealApp(
        workDir, project.id, port, procPid,
        prompt => routeTask("fixing", prompt, tier, telegramId, RUFLO_PERSONA_MATRIX).then(r => r.content),
        (attempt, maxAttempts, fixed) => {
          broadcastStatus(pid, `Heal attempt ${attempt}/${maxAttempts}${fixed ? " ✓" : "..."}`);
          safeSend(bot!, chatId,
            `🔄 *Heal ${attempt}/${maxAttempts}* — ${fixed ? "✅ Fixed! App is live!" : "Still patching..."}`,
            { parse_mode: "Markdown" }
          );
        },
        3,
      );

      if (healResult.healed) {
        isLive = true;
        await safeSend(bot, chatId,
          `✨ *Self-healed in ${healResult.attempts} attempt(s)!*\nApp is now live.`,
          { parse_mode: "Markdown" }
        );
      }
    }

    await db.update(projectsTable).set({
      status: isLive ? "running" : "error",
      liveUrl: isLive ? liveUrl : null,
    }).where(eq(projectsTable.id, project.id));

    broadcastProgress(pid, 100, isLive ? "App is live!" : "Build complete", written, plan.manifest.length);
    broadcastRedirect(pid, liveUrl);

    // ── Autonomous README (async, non-blocking) ───────────────────────────
    generateReadme(workDir, description, plan, liveUrl,
      prompt => routeTask("chat", prompt, tier, telegramId, RUFLO_PERSONA_MATRIX).then(r => r.content)
    ).catch(() => {});

    // ── Check for GitHub auto-push ────────────────────────────────────────
    const userRow = await db.select().from(usersTable).where(eq(usersTable.telegramId, telegramId)).limit(1);

    // ── WPE fire-and-forget build event ──────────────────────────────────
    fireWpeWebhook({
      projectSlug: projectKey,
      techStack: plan.techStack,
      health: isLive ? 100 : 0,
      liveUrl,
      telegramId,
      username: (userRow[0] as { username?: string })?.username,
    }).catch(() => {});
    const ghToken = userRow[0]?.githubToken ? decrypt(userRow[0].githubToken) : null;

    if (isLive) {
      await safeSend(bot, chatId,
        `🎉 *App is LIVE — \`${projectKey}\`*\n\n✅ ${written} files deployed\n🔌 Port: ${port}${syntaxErrors.length ? `\n🔍 ${syntaxErrors.length} syntax issues auto-patched` : ""}\n\n🌐 *Your live app:*\n${liveUrl}`,
        {
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [
              [{ text: "🌐 Open Live App", url: liveUrl }],
              ...(ghToken ? [[{ text: "🐙 Push to GitHub", callback_data: `ghpush_${project.id}` }]] : []),
            ],
          },
        }
      );
      rufloAddHistory(telegramId, "assistant", `Built \`${projectKey}\` (id=${project.id}): ${description.slice(0,100)}. Live at: ${liveUrl}`);
    } else {
      await safeSend(bot, chatId,
        `⚠️ *Build Complete — \`${projectKey}\` warming up*\n\n${written} files deployed. Use \`/logs ${project.id}\` to inspect crash output.\n\n🌐 ${liveUrl}`,
        { parse_mode: "Markdown", reply_markup: { inline_keyboard: [[{ text: "🌐 Try URL", url: liveUrl }, { text: "📋 View Logs", callback_data: `logs_${project.id}` }]] } }
      );
    }

  } catch (err) {
    logger.error({ err, projectId: project.id }, "Build pipeline error");
    await db.update(projectsTable).set({ status: "error" }).where(eq(projectsTable.id, project.id));
    broadcastStatus(pid, "Build failed");
    const errMsg = err instanceof Error ? err.message.slice(0, 280) : "Unknown error";
    await safeSend(bot, chatId,
      `❌ *Build Failed — \`${projectKey}\`*\n\n${escapeMd(errMsg)}\n\nPlease try again with more detail.`,
      { parse_mode: "Markdown" }
    );
  } finally {
    activeSessionRemove(telegramId);
  }
}


// ─── Command Handlers ─────────────────────────────────────────────────────────

async function handleStart(msg: TelegramBot.Message): Promise<void> {
  if (!bot) return;
  if (!await isSubscribed(msg.from!.id)) { await sendGate(msg.chat.id); return; }
  const user = await getOrCreateUser(msg.from!.id, msg.from?.first_name, msg.from?.username);
  const tier = user.tier as Tier;
  const left = TIER_LIMITS[tier].dailyActions - user.dailyActionsCounter;

  await safeSend(bot, msg.chat.id,
    `⚡ *Welcome to WebForge!*\n\nI'm your autonomous full-stack co-founder. Tell me what to build — I'll plan it, confirm with you, then code and deploy it live.\n\n*Plan:* ${tier.toUpperCase()} | *Actions left today:* ${left}/${TIER_LIMITS[tier].dailyActions}\n\n*Try saying:*\n🏗 "Build a Coca-Cola promo website"\n🎨 "Create an image of a Lagos sunset"\n🤖 "Make a task manager with dark mode"\n🐙 /link\\_github — connect GitHub\n\nType /help for all commands.`,
    { parse_mode: "Markdown" }
  );
}

async function handleHelp(msg: TelegramBot.Message): Promise<void> {
  if (!bot) return;
  if (!await isSubscribed(msg.from!.id)) { await sendGate(msg.chat.id); return; }
  await safeSend(bot, msg.chat.id,
    `🛠 *WebForge Commands*\n\n` +
    `/start — Welcome & account status\n` +
    `/projects — Your projects list\n` +
    `/workspace \\<id\\> — Open workspace for a project\n` +
    `/restart \\<id\\> — Restart a stopped app\n` +
    `/health \\<id\\> — Live health check & ping\n` +
    `/logs \\<id\\> — Tail stdout/stderr of a running app\n` +
    `/delete \\<id\\> — Delete a project\n` +
    `/cancel — Cancel your current build\n` +
    `/batch — Launch multiple projects simultaneously\n` +
    `/draw \\<prompt\\> — Generate an AI image\n` +
    `/clone\\_repo \\<url\\> — Clone a GitHub repo\n` +
    `/link\\_github \\<PAT\\> — Connect your GitHub account\n` +
    `/upgrade — Plans & pricing\n` +
    `/status — Your tier, usage & API key\n` +
    `/help — This message\n\n` +
    `*Just describe what you want to build:*\n` +
    `_"Build me a restaurant website"_\n` +
    `_"Make a task manager with dark mode"_`,
    { parse_mode: "Markdown" }
  );
}

async function handleLogs(msg: TelegramBot.Message, projectId: number): Promise<void> {
  if (!bot) return;
  if (!await isSubscribed(msg.from!.id)) { await sendGate(msg.chat.id); return; }

  const rows = await db.select().from(projectsTable).where(eq(projectsTable.id, projectId)).limit(1);
  const project = rows[0];
  if (!project || project.userId !== msg.from!.id) {
    await safeSend(bot, msg.chat.id, `❌ Project #${projectId} not found or doesn't belong to you.`);
    return;
  }

  const workDir = path.join(process.cwd(), "user-projects", String(projectId));

  // Prefer in-memory ring buffer (ProcessSupervisor), fall back to disk logs
  let combined = "";
  const inMemory = getProjectLogs(projectId, 200);
  if (inMemory.length > 0) {
    combined = inMemory.join("\n");
  } else {
    let stdoutLines: string[] = [];
    let stderrLines: string[] = [];
    try {
      const raw = await fs.readFile(path.join(workDir, "app.stdout.log"), "utf8");
      stdoutLines = raw.trim().split("\n").filter(Boolean).slice(-50);
    } catch { stdoutLines = ["(no stdout log)"]; }
    try {
      const raw = await fs.readFile(path.join(workDir, "app.stderr.log"), "utf8");
      stderrLines = raw.trim().split("\n").filter(Boolean).slice(-20);
    } catch { stderrLines = ["(no stderr log)"]; }
    combined = `${stdoutLines.join("\n")}\n\n--- STDERR ---\n${stderrLines.join("\n")}`;
  }
  const truncated = combined.length > 3000 ? combined.slice(-3000) : combined;

  await safeSend(bot, msg.chat.id,
    `📋 *Project #${projectId} — ${escapeMd(project.name.slice(0, 30))}*\n\`\`\`\n${truncated}\n\`\`\``,
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [[
          { text: "🔄 Restart App", callback_data: `restart_${projectId}` },
          { text: "🔁 Refresh Logs", callback_data: `logs_${projectId}` },
        ]],
      },
    }
  );
}

async function handleProjects(msg: TelegramBot.Message): Promise<void> {
  if (!bot) return;
  if (!await isSubscribed(msg.from!.id)) { await sendGate(msg.chat.id); return; }
  const projects = await db
    .select().from(projectsTable)
    .where(eq(projectsTable.userId, msg.from!.id))
    .orderBy(desc(projectsTable.id));

  if (!projects.length) {
    await safeSend(bot, msg.chat.id, `📂 *No projects yet*\n\nTell me what to build!`, { parse_mode: "Markdown" });
    return;
  }

  const list = projects.map(p => {
    const icon = p.status === "running" ? "🟢" : p.status === "building" ? "🟡" : p.status === "error" ? "🔴" : "⚪";
    const url = p.liveUrl ?? `${PLATFORM_URL}/deploying/${p.id}`;
    const name = escapeMd(p.name.slice(0, 35));
    return `${icon} *#${p.id}* — ${name}\n   \`${p.status}\` | [${p.liveUrl ? "Open App" : "Deploy Page"}](${url})`;
  }).join("\n\n");

  await safeSend(bot, msg.chat.id, `📁 *Your Projects (${projects.length})*\n\n${list}`, { parse_mode: "Markdown", disable_web_page_preview: true });
}

async function handleStatus(msg: TelegramBot.Message): Promise<void> {
  if (!bot) return;
  if (!await isSubscribed(msg.from!.id)) { await sendGate(msg.chat.id); return; }
  const user = await getOrCreateUser(msg.from!.id, msg.from?.first_name, msg.from?.username);
  const tier = (user.tier as Tier) ?? "starter";
  const lims = TIER_LIMITS[tier];
  const projects = await db.select().from(projectsTable).where(eq(projectsTable.userId, msg.from!.id));
  const hasGh = !!user.githubToken;
  const hasKey = !!user.apiKey;
  const building = activeSessionCount(msg.from!.id) > 0;

  await safeSend(bot, msg.chat.id,
    `📊 *Account Status*\n\n` +
    `👤 *User:* ${escapeMd(user.firstName ?? "Anonymous")}\n` +
    `🏷 *Plan:* ${tier.toUpperCase()}\n` +
    `⚡ *Actions:* ${user.dailyActionsCounter}/${lims.dailyActions} (${lims.dailyActions - user.dailyActionsCounter} left)\n` +
    `📁 *Projects:* ${projects.length}${lims.maxProjects !== Infinity ? `/${lims.maxProjects}` : ""}\n` +
    `🐙 *GitHub:* ${hasGh ? "Connected ✅" : "Not linked"}\n` +
    `🔑 *Custom API Key:* ${hasKey ? "Set ✅" : "Not set"}\n` +
    `🔨 *Build in progress:* ${building ? "Yes ⏳" : "No"}\n\n` +
    `${lims.botHosting ? "✅" : "❌"} Bot hosting  ${lims.deepBuild ? "✅" : "❌"} DeepBuild  ${lims.gitClone ? "✅" : "❌"} GitHub\n\n` +
    `Upgrade: ${PAYMENT_BOT_USERNAME}`,
    { parse_mode: "Markdown" }
  );
}

async function handleUpgrade(msg: TelegramBot.Message): Promise<void> {
  if (!bot) return;
  await safeSend(bot, msg.chat.id,
    `💳 *WebForge Plans*\n\n🆓 *Starter* — ₦0/mo — 10 actions/day, 3 projects\n⭐ *Pro* — ₦5,000/mo — 150 actions, unlimited projects, bot hosting\n👑 *Elite* — ₦15,000/mo — 500 actions, DeepBuild, GitHub sync, priority models`,
    { parse_mode: "Markdown", reply_markup: { inline_keyboard: [[{ text: "💳 Pay & Upgrade", url: `https://t.me/${PAYMENT_BOT_USERNAME.replace("@","")}` }]] } }
  );
}

// ─── Cancel active build ──────────────────────────────────────────────────────

async function handleCancel(msg: TelegramBot.Message): Promise<void> {
  if (!bot) return;
  const telegramId = msg.from!.id;
  const count = activeSessionCount(telegramId);
  activeSessions.delete(telegramId);
  rufloDeleteDiscovery(telegramId);
  rufloDeletePending(telegramId);
  if (count === 0) {
    await safeSend(bot, msg.chat.id, "ℹ️ Nothing to cancel — you don't have an active build or pending plan.");
    return;
  }
  await safeSend(bot, msg.chat.id,
    `✅ *${count > 1 ? `All ${count} builds cancelled.` : "Cancelled."}* What would you like to build instead?`,
    { parse_mode: "Markdown" }
  );
}

// ─── NEW: Delete project ──────────────────────────────────────────────────────

async function handleDelete(msg: TelegramBot.Message, projectId: number): Promise<void> {
  if (!bot) return;
  const telegramId = msg.from!.id;
  const rows = await db.select().from(projectsTable).where(eq(projectsTable.id, projectId)).limit(1);
  const proj = rows[0];
  if (!proj || proj.userId !== telegramId) {
    await safeSend(bot, msg.chat.id, `❌ Project #${projectId} not found or not yours.`);
    return;
  }
  await safeSend(bot, msg.chat.id,
    `⚠️ *Delete Project #${projectId}?*\n\n"${escapeMd(proj.name.slice(0,50))}"\n\nThis cannot be undone.`,
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [[
          { text: "🗑 Yes, Delete", callback_data: `confirm_delete_${projectId}` },
          { text: "❌ Cancel", callback_data: "cancel_delete" },
        ]],
      },
    }
  );
}

async function handleRestart(msg: TelegramBot.Message, projectId: number): Promise<void> {
  if (!bot) return;
  const chatId = msg.chat.id;
  const telegramId = msg.from!.id;

  const rows = await db.select().from(projectsTable).where(eq(projectsTable.id, projectId)).limit(1);
  const proj = rows[0];

  if (!proj || proj.userId !== telegramId) {
    await safeSend(bot, chatId, `❌ Project #${projectId} not found or not yours.`);
    return;
  }
  if (!proj.workDir) {
    await safeSend(bot, chatId, `❌ Project #${projectId} has no working directory — was it fully built?`);
    return;
  }

  sendTyping(bot, chatId);
  const msg2 = await safeSend(bot, chatId, `🔄 *Restarting Project #${projectId}...*`, { parse_mode: "Markdown" });

  try {
    const preferred = proj.port ?? assignProjectPort(projectId);
    const port = await findFreePort(preferred);
    const { pid: newPid } = await spawnProjectApp(proj.workDir, projectId, port, proj.slug ?? undefined);
    await db.update(projectsTable).set({ port, botPid: newPid ?? null, status: "running" }).where(eq(projectsTable.id, projectId));
    watchProjectDir(proj.workDir, projectId);

    await safeSend(bot, chatId, `⏳ Polling port ${port} for HTTP response...`);
    const live = await pollAppHealth(port, 60_000);
    const projRow = await db.select().from(projectsTable).where(eq(projectsTable.id, projectId)).limit(1);
    const restartKey = projRow[0]?.slug ?? String(projectId);
    const liveUrl = `${PLATFORM_URL}/api/preview-proxy/${restartKey}/`;

    if (live) {
      await db.update(projectsTable).set({ status: "running", liveUrl }).where(eq(projectsTable.id, projectId));
    }
    if (msg2) await safeDelete(bot, chatId, msg2.message_id);
    await safeSend(bot, chatId,
      live
        ? `✅ *\`${restartKey}\` is back online!*\n\n🌐 ${liveUrl}`
        : `⚠️ *\`${restartKey}\` restarted* — still warming up.\n\n🌐 ${liveUrl}`,
      { parse_mode: "Markdown", reply_markup: { inline_keyboard: [[{ text: "🌐 Open App", url: liveUrl }]] } }
    );
  } catch (err) {
    logger.error({ err, projectId }, "handleRestart error");
    if (msg2) await safeDelete(bot, chatId, msg2.message_id);
    await safeSend(bot, chatId, `❌ Restart failed: ${escapeMd(err instanceof Error ? err.message.slice(0, 200) : "unknown error")}`);
  }
}

async function handleHealth(msg: TelegramBot.Message, projectId: number): Promise<void> {
  if (!bot) return;
  const chatId = msg.chat.id;
  const telegramId = msg.from!.id;

  const rows = await db.select().from(projectsTable).where(eq(projectsTable.id, projectId)).limit(1);
  const proj = rows[0];
  if (!proj || proj.userId !== telegramId) { await safeSend(bot, chatId, `❌ Project #${projectId} not found.`); return; }

  let httpStatus = "unknown";
  if (proj.port) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 2000);
      const r = await fetch(`http://localhost:${proj.port}/`, { signal: ctrl.signal });
      clearTimeout(t);
      httpStatus = `HTTP ${r.status} ✅`;
    } catch { httpStatus = "Not responding ❌"; }
  }

  let lastLogs = "_No logs available_";
  if (proj.workDir) {
    try {
      const raw = await fs.readFile(path.join(proj.workDir, "app.stdout.log"), "utf8");
      const lines = raw.trim().split("\n").filter(Boolean).slice(-8);
      if (lines.length) lastLogs = "```\n" + lines.join("\n").slice(0, 600) + "\n```";
    } catch {}
  }

  const statusIcon = proj.status === "running" ? "🟢" : proj.status === "building" ? "🟡" : "🔴";
  await safeSend(bot, chatId,
    `📊 *Project #${projectId} Health*\n\n${statusIcon} Status: \`${proj.status}\`\n🌐 URL: ${proj.liveUrl ?? "none"}\n🔌 Port: ${proj.port ?? "unassigned"}\n📡 HTTP: ${httpStatus}\n\n*Last logs:*\n${lastLogs}`,
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "🔄 Restart App", callback_data: `restart_${projectId}` }, { text: "🌐 Open App", url: proj.liveUrl ?? `${PLATFORM_URL}/deploying/${projectId}` }],
        ],
      },
    }
  );
}

async function handleLinkGithub(msg: TelegramBot.Message, token: string): Promise<void> {
  if (!bot) return;
  await safeDelete(bot, msg.chat.id, msg.message_id);
  if (!token.startsWith("ghp_") && !token.startsWith("github_pat_") && !/^gh[a-z]_/.test(token) && token.length < 30) {
    await safeSend(bot, msg.chat.id, "❌ That doesn't look like a valid GitHub Personal Access Token. Get one at: https://github.com/settings/tokens\n\n_Your message was deleted to keep credentials safe._", { parse_mode: "Markdown" });
    return;
  }
  const encrypted = encrypt(token);
  await db.update(usersTable).set({ githubToken: encrypted }).where(eq(usersTable.telegramId, msg.from!.id));
  await safeSend(bot, msg.chat.id,
    `🐙 *GitHub Account Linked!*\n\nYour token has been encrypted with AES-256 and stored securely. Your message was deleted from the chat.\n\nYou can now:\n• Use /clone\\_repo to clone any repo\n• Push project changes back to GitHub after builds`,
    { parse_mode: "Markdown" }
  );
}

async function handleCloneRepo(msg: TelegramBot.Message, repoUrl: string): Promise<void> {
  if (!bot) return;
  const telegramId = msg.from!.id;
  const chatId = msg.chat.id;

  const check = await checkActionAllowed(telegramId);
  if (!check.allowed) { await safeSend(bot, chatId, `⚠️ ${escapeMd(check.reason ?? "Limit reached")}`); return; }

  const tier = check.user!.tier as Tier;
  if (!TIER_LIMITS[tier].gitClone) {
    await safeSend(bot, chatId, `🐙 *GitHub clone requires Pro or Elite*\n\nUpgrade via ${PAYMENT_BOT_USERNAME}`, { parse_mode: "Markdown" });
    return;
  }

  const userRow = await db.select().from(usersTable).where(eq(usersTable.telegramId, telegramId)).limit(1);
  const ghToken = userRow[0]?.githubToken ? decrypt(userRow[0].githubToken) : undefined;

  sendTyping(bot, chatId);
  const waitMsg = await safeSend(bot, chatId, `🐙 *Cloning repository...*\n\`${escapeMd(repoUrl)}\``, { parse_mode: "Markdown" });

  try {
    const pc = await checkProjectLimitAllowed(telegramId);
    if (!pc.allowed) { await safeSend(bot, chatId, `⚠️ ${escapeMd(pc.reason ?? "Limit reached")}`); return; }

    const repoName = repoUrl.split("/").pop()?.replace(".git", "") ?? "cloned-repo";
    const [proj] = await db.insert(projectsTable).values({
      userId: telegramId, name: repoName, description: `Cloned from ${repoUrl}`,
      status: "building", techStack: "cloned",
    }).returning();

    const workDir = await ensureProjectDir(proj.id, telegramId);
    await db.update(projectsTable).set({ workDir }).where(eq(projectsTable.id, proj.id));

    const result = await gitCloneRepo(repoUrl, workDir, ghToken);

    if (result.stderr && /error|fatal|denied/i.test(result.stderr)) {
      throw new Error(result.stderr.slice(0, 300));
    }

    const preferred = assignProjectPort(proj.id);
    const port = await findFreePort(preferred);
    await runTerminalCommand("npm install --legacy-peer-deps 2>&1 || yarn install 2>&1", workDir, 180_000);
    const { pid: p2 } = await spawnProjectApp(workDir, proj.id, port, proj.slug ?? undefined);
    await db.update(projectsTable).set({ port, botPid: p2 ?? null, status: "running" }).where(eq(projectsTable.id, proj.id));
    watchProjectDir(workDir, proj.id);
    const live = await pollAppHealth(port, 60_000);
    const cloneKey = proj.slug ?? String(proj.id);
    const liveUrl = `${PLATFORM_URL}/api/preview-proxy/${cloneKey}/`;
    await db.update(projectsTable).set({ liveUrl: live ? liveUrl : null, status: live ? "running" : "error" }).where(eq(projectsTable.id, proj.id));

    if (waitMsg) await safeDelete(bot, chatId, waitMsg.message_id);
    await safeSend(bot, chatId,
      `✅ *Repository Cloned — \`${cloneKey}\`*\n\n📦 ${escapeMd(repoName)}\n🔌 Port: ${port}\n${live ? `🌐 Live: ${liveUrl}` : "⚠️ App may need a start script — check your package.json"}`,
      { parse_mode: "Markdown", reply_markup: live ? { inline_keyboard: [[{ text: "🌐 Open App", url: liveUrl }]] } : undefined }
    );
    await incrementAction(telegramId);

  } catch (err) {
    logger.error({ err }, "clone_repo error");
    if (waitMsg) await safeDelete(bot, chatId, waitMsg.message_id);
    await safeSend(bot, chatId, `❌ Clone failed: ${escapeMd(err instanceof Error ? err.message.slice(0, 300) : "unknown error")}`);
  }
}

// ─── Batch Build Command ──────────────────────────────────────────────────────

async function handleBatch(msg: TelegramBot.Message, raw: string): Promise<void> {
  if (!bot) return;
  const telegramId = msg.from!.id;
  const chatId = msg.chat.id;

  const check = await checkActionAllowed(telegramId);
  if (!check.allowed) {
    await safeSend(bot, chatId, `⚠️ ${escapeMd(check.reason ?? "Limit reached")}\n\nUpgrade via ${PAYMENT_BOT_USERNAME}`);
    return;
  }
  const tier = check.user!.tier as Tier;
  const maxConcurrent = TIER_LIMITS[tier].concurrentBuilds;

  // Split on newlines or pipe |
  const descriptions = raw
    .split(/\n|\|/)
    .map(d => d.trim())
    .filter(d => d.length > 5);

  if (descriptions.length < 2) {
    await safeSend(bot, chatId,
      `📦 *Batch Build*\n\nSend multiple project descriptions separated by newlines or \`|\`:\n\n` +
      `/batch Build a restaurant menu website\nBuild a task manager app\nBuild a weather dashboard\n\n` +
      `*Your tier (${tier.toUpperCase()}) supports up to ${maxConcurrent} simultaneous builds.*`,
      { parse_mode: "Markdown" }
    );
    return;
  }

  const slots = maxConcurrent - activeSessionCount(telegramId);
  if (slots <= 0) {
    await safeSend(bot, chatId,
      `⏳ All *${maxConcurrent}* build slots are full. Wait for one to finish or use /cancel.`,
      { parse_mode: "Markdown" }
    );
    return;
  }

  const batch = descriptions.slice(0, slots);
  const skipped = descriptions.length - batch.length;

  await safeSend(bot, chatId,
    `🚀 *Batch Launch — ${batch.length} projects*${skipped > 0 ? ` (${skipped} skipped — slot limit)` : ""}\n\n` +
    batch.map((d, i) => `${i + 1}. ${escapeMd(d.slice(0, 60))}`).join("\n") +
    `\n\n⏳ Planning all projects now...`,
    { parse_mode: "Markdown" }
  );

  // Plan all projects in parallel first, then build in parallel
  const planResults = await Promise.allSettled(
    batch.map(async (desc) => {
      const { planningMode } = await import("../engines/orchestrator.js");
      const { routeTask: _rt } = await import("../ai/router.js");
      const plan = await planningMode(
        desc,
        (taskType, p, t, id, sys) => _rt(taskType, p, t, id, sys ?? RUFLO_PERSONA_MATRIX),
        telegramId,
        tier
      );
      return { desc, plan };
    })
  );

  const successful = planResults.filter(r => r.status === "fulfilled") as PromiseFulfilledResult<{ desc: string; plan: PlanningResult }>[];
  const failed = planResults.filter(r => r.status === "rejected").length;

  if (failed > 0) {
    await safeSend(bot, chatId, `⚠️ *${failed}* project(s) failed to plan and were skipped.`, { parse_mode: "Markdown" });
  }

  if (successful.length === 0) {
    await safeSend(bot, chatId, "❌ All project plans failed — try again with clearer descriptions.");
    return;
  }

  await safeSend(bot, chatId,
    `✅ *${successful.length} plans ready — launching all builds simultaneously!* 🔥`,
    { parse_mode: "Markdown" }
  );

  // Fire all builds concurrently — each one is non-blocking, name is extracted per-desc
  await Promise.all(
    successful.map(async ({ value: { desc, plan } }) => {
      const rawName = await extractProjectName(desc, telegramId).catch(() => null);
      const slug = rawName ? slugify(rawName) : undefined;
      return runFullBuild(chatId, telegramId, desc, plan, tier, tier === "elite", slug).catch(logger.error);
    })
  );
}

// ─── General Message Handler (thin traffic controller → Ruflo dispatch) ───────

async function handleGeneralMessage(msg: TelegramBot.Message): Promise<void> {
  if (!bot || !msg.text) return;
  const text = msg.text.trim();
  const telegramId = msg.from!.id;
  const chatId = msg.chat.id;

  if (isRateLimited(telegramId)) return;
  if (!await isSubscribed(telegramId)) { await sendGate(chatId); return; }

  const user = await getOrCreateUser(telegramId, msg.from?.first_name, msg.from?.username);
  const tier = (user.tier as Tier) ?? "starter";

  // API key scrubbing — coreBot still owns this for security
  const keyMatch = text.match(/sk-[A-Za-z0-9_-]{20,}/);
  if (keyMatch) {
    await safeDelete(bot, chatId, msg.message_id);
    const enc = encrypt(keyMatch[0]);
    await db.update(usersTable).set({ apiKey: enc }).where(eq(usersTable.telegramId, telegramId));
    await safeSend(bot, chatId, "🔐 *API Key secured* — AES-256 encrypted, scrubbed from chat.", { parse_mode: "Markdown" });
    return;
  }

  // GitHub push confirmation — entry-bot owns the gitPendingPush state
  const ghPush = gitPendingPush.get(telegramId);
  if (ghPush && /^(yes|yeah|yep|ok|okay|go|sure|push|confirm)/i.test(text.trim())) {
    gitPendingPush.delete(telegramId);
    const userRow = await db.select().from(usersTable).where(eq(usersTable.telegramId, telegramId)).limit(1);
    const ghToken = userRow[0]?.githubToken ? decrypt(userRow[0].githubToken) : null;
    if (!ghToken) { await safeSend(bot, chatId, "❌ No GitHub token linked. Use /link_github first."); return; }
    sendTyping(bot, chatId);
    const r = await gitPushChanges(ghPush.workDir, ghToken, "WebForge auto-commit");
    await safeSend(bot, chatId, r.stderr && /error|fatal/i.test(r.stderr)
      ? `❌ Push failed: ${escapeMd(r.stderr.slice(0, 300))}`
      : `✅ *Pushed to GitHub successfully!*\n\n${escapeMd(r.stdout.slice(0, 300))}`,
      { parse_mode: "Markdown" }
    );
    return;
  }

  // ── Intercept naming replies ───────────────────────────────────────────────
  const namingPending = pendingNaming.get(telegramId);
  if (namingPending) {
    const slug = slugify(text);
    if (!slug) {
      await safeSend(bot, chatId,
        `❌ That name couldn't be converted to a slug. Try a simple name like *VibeForge* or *TaskMaster*.`,
        { parse_mode: "Markdown" }
      );
      return; // keep pendingNaming entry intact so user can retry
    }
    pendingNaming.delete(telegramId);
    await safeSend(bot, chatId,
      `✅ *Project name set: \`${slug}\`* — launching build now! 🚀`,
      { parse_mode: "Markdown" }
    );
    runFullBuild(namingPending.chatId, telegramId, namingPending.description, namingPending.plan, namingPending.tier, namingPending.isElite, slug).catch(logger.error);
    return;
  }

  // ── Hand off to Ruflo — Ruflo owns all intent, session state, and AI routing ─
  const check = await checkActionAllowed(telegramId);
  if (!check.allowed) {
    await safeSend(bot, chatId, `⚠️ ${escapeMd(check.reason ?? "Limit reached")}\n\nUpgrade via ${PAYMENT_BOT_USERNAME}`);
    return;
  }

  sendTyping(bot, chatId);
  console.log(`[CoreBot] → rufloDispatch user=${telegramId} tier=${tier}`);

  const result = await rufloDispatch(telegramId, text, tier);

  switch (result.type) {
    case "image_ready": {
      if (!result.imageBuffer) {
        await safeSend(bot, chatId, "❌ Image buffer missing — try again.");
        break;
      }
      const tmp = path.join(os.tmpdir(), `wf-img-${Date.now()}.jpg`);
      await fs.writeFile(tmp, result.imageBuffer);
      await bot.sendPhoto(chatId, tmp, { caption: result.content, parse_mode: "Markdown" });
      fs.unlink(tmp).catch(() => {});
      await incrementAction(telegramId);
      recordTelemetry({ sessionId: String(telegramId), userId: telegramId, action: "image_gen", model: "ruflo-openclaw", inputTokens: 0, outputTokens: 0, costUsd: 0 }).catch(() => {});
      break;
    }
    case "image_error": {
      await safeSend(bot, chatId, result.content);
      break;
    }
    case "build_discovery": {
      await safeSend(bot, chatId, result.content, { parse_mode: "Markdown" });
      break;
    }
    case "build_plan_ready":
    case "build_changed": {
      const plan = result.plan!;
      const fileList = plan.manifest.slice(0, 12).map(f => `  📄 \`${f.path}\``).join("\n");
      const more = plan.manifest.length > 12 ? `\n  _...and ${plan.manifest.length - 12} more_` : "";
      const safeSummary = escapeMd(plan.summary);
      const safeStack = escapeMd(plan.techStack);
      await safeSend(bot, chatId,
        `📋 *Build Plan Ready!*\n\n*What I'll build:* ${safeSummary}\n*Stack:* ${safeStack}\n*Files:* ${plan.manifest.length}\n\n*Structure:*\n${fileList}${more}\n\n${tier === "elite" ? "🔥 *DEEP BUILD* — 5-round self-correction active\n\n" : ""}Reply *YES* to build, or tell me what to change!`,
        {
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [
              [{ text: "🚀 YES — Build It Now!", callback_data: `confirm_${telegramId}` }],
              [{ text: "✏️ Change Something", callback_data: `replan_${telegramId}` }],
            ],
          },
        }
      );
      break;
    }
    case "build_confirmed": {
      const plan = result.plan!;
      const desc = result.description!;
      const isElite = result.isElite ?? false;
      const pc = await checkProjectLimitAllowed(telegramId);
      if (!pc.allowed) { await safeSend(bot, chatId, `⚠️ ${escapeMd(pc.reason ?? "Project limit reached")}\n\nUpgrade via ${PAYMENT_BOT_USERNAME}`); break; }
      await safeSend(bot, chatId, result.content, { parse_mode: "Markdown" });

      // Try to extract a project name from the description automatically
      const rawName = await extractProjectName(desc, telegramId);
      if (rawName) {
        const slug = slugify(rawName);
        runFullBuild(chatId, telegramId, desc, plan, tier, isElite, slug).catch(logger.error);
      } else {
        // No name extracted — pause and ask the user
        pendingNaming.set(telegramId, { chatId, plan, description: desc, tier, isElite });
        await safeSend(bot, chatId,
          `📛 *What would you like to call this project?*\n\nI couldn't pick a distinct name from your description. Reply with a short name (e.g. "VibeForge") and I'll start building immediately.`,
          { parse_mode: "Markdown" }
        );
      }
      break;
    }
    case "billing": {
      await safeSend(bot, chatId, result.content,
        { parse_mode: "Markdown", reply_markup: { inline_keyboard: [[{ text: "💳 Pay & Upgrade", url: `https://t.me/${PAYMENT_BOT_USERNAME.replace("@","")}` }]] } }
      );
      break;
    }
    case "chat": {
      await incrementAction(telegramId);
      recordTelemetry({
        sessionId: String(telegramId), userId: telegramId, action: "chat",
        model: result.model ?? "unknown", inputTokens: result.inputTokens ?? 0,
        outputTokens: result.outputTokens ?? 0, costUsd: result.costUsd ?? 0,
      }).catch(() => {});
      await safeSend(bot, chatId, result.content, { parse_mode: "Markdown" });
      break;
    }
  }
}

// ─── Safe Command Wrapper ─────────────────────────────────────────────────────

function safeHandler(fn: (msg: TelegramBot.Message, match?: RegExpExecArray | null) => Promise<void>) {
  return async (msg: TelegramBot.Message, match?: RegExpExecArray | null) => {
    try {
      await fn(msg, match);
    } catch (err) {
      logger.error({ err, chatId: msg.chat.id }, "Command handler error");
      try {
        await bot?.sendMessage(msg.chat.id, "❌ Something went wrong — please try again.");
      } catch {}
    }
  };
}

// ─── Daily Reset Timer ────────────────────────────────────────────────────────

function startDailyResetTimer(): void {
  setInterval(async () => {
    try {
      const { db: _db, usersTable: _ut } = await import("@workspace/db");
      const { sql } = await import("drizzle-orm");
      await _db.update(_ut).set({ dailyActionsCounter: 0, dailyActionsReset: new Date() });
      logger.info("Daily action counters reset");
    } catch (err) {
      logger.warn({ err }, "Daily reset failed");
    }
  }, 60 * 60 * 1000); // every hour — only resets if last reset was >24h ago (guarded in billing.ts)
}

// ─── Bot Init ─────────────────────────────────────────────────────────────────

export function initCoreBot(): void {
  if (!TOKEN) { logger.warn("CORE_BOT_TOKEN not set — core bot disabled"); return; }

  bot = new TelegramBot(TOKEN, { polling: { interval: 1000, autoStart: true, params: { timeout: 10 } } });
  logger.info("Core bot started polling");

  startDailyResetTimer();
  startStatsCache();

  bot.onText(/\/start/, safeHandler(handleStart));
  bot.onText(/\/help/, safeHandler(handleHelp));
  bot.onText(/\/projects/, safeHandler(handleProjects));
  bot.onText(/\/status/, safeHandler(handleStatus));
  bot.onText(/\/upgrade/, safeHandler(handleUpgrade));
  bot.onText(/\/cancel/, safeHandler(handleCancel));
  bot.onText(/\/batch(?:\s+([\s\S]+))?/, safeHandler(async (msg, match) => {
    if (!await isSubscribed(msg.from!.id)) { await sendGate(msg.chat.id); return; }
    const raw = match?.[1]?.trim() ?? "";
    await handleBatch(msg, raw);
  }));

  // ── Admin-only: /broadcast ────────────────────────────────────────────────
  bot.onText(/\/broadcast(?:\s+([\s\S]+))?/, safeHandler(async (msg, match) => {
    if (msg.from!.id !== ADMIN_TELEGRAM_ID) return;
    const message = match?.[1]?.trim();
    if (!message) {
      await safeSend(bot!, msg.chat.id,
        `📢 *Broadcast Usage*\n\n/broadcast <your message>\n\nExample:\n/broadcast 🚀 WebForge just shipped DeepBuild v2!`,
        { parse_mode: "Markdown" }
      );
      return;
    }

    const allUsers = await db.select({ telegramId: usersTable.telegramId }).from(usersTable);
    if (!allUsers.length) {
      await safeSend(bot!, msg.chat.id, "❌ No registered users found.");
      return;
    }

    const statusMsg = await safeSend(bot!, msg.chat.id,
      `📡 *Broadcasting to ${allUsers.length} users...*`,
      { parse_mode: "Markdown" }
    );

    let sent = 0, failed = 0;
    const BATCH_SIZE = 25;

    for (let i = 0; i < allUsers.length; i++) {
      const user = allUsers[i];
      if (!user) continue;
      try {
        await safeSend(bot!, user.telegramId,
          `📢 *WebForge Announcement*\n\n${message}`,
          { parse_mode: "Markdown" }
        );
        sent++;
      } catch {
        failed++;
      }
      // Rate limit: pause every batch to avoid Telegram flood limits
      if ((i + 1) % BATCH_SIZE === 0) {
        await new Promise(r => setTimeout(r, 1500));
      }
    }

    if (statusMsg) await safeDelete(bot!, msg.chat.id, statusMsg.message_id);
    await safeSend(bot!, msg.chat.id,
      `✅ *Broadcast Complete*\n\n📬 Delivered: ${sent}\n❌ Failed: ${failed}\n👥 Total: ${allUsers.length}`,
      { parse_mode: "Markdown" }
    );
  }));

  // ── Admin-only: /refund ────────────────────────────────────────────────────
  // Usage: /refund <reference> [reason]
  bot.onText(/\/refund(?:\s+(\S+))?(?:\s+([\s\S]+))?/, safeHandler(async (msg, match) => {
    if (msg.from!.id !== ADMIN_TELEGRAM_ID) return;
    const chatId = msg.chat.id;
    const reference = match?.[1]?.trim();
    const reason = match?.[2]?.trim() ?? "Refund issued by admin";

    if (!reference) {
      await safeSend(bot!, chatId,
        `💸 *Refund Usage*\n\n/refund <reference> [reason]\n\nExample:\n/refund WF-ABC123 Duplicate payment`,
        { parse_mode: "Markdown" }
      );
      return;
    }

    // Look up the payment by reference
    const [payment] = await db
      .select()
      .from(paymentsTable)
      .where(eq(paymentsTable.reference, reference))
      .limit(1);

    if (!payment) {
      await safeSend(bot!, chatId, `❌ No payment found with reference *${escapeMd(reference)}*`, { parse_mode: "Markdown" });
      return;
    }

    if (payment.status === "refunded") {
      await safeSend(bot!, chatId,
        `⚠️ Payment *${escapeMd(reference)}* is already marked as refunded.`,
        { parse_mode: "Markdown" }
      );
      return;
    }

    // Mark as refunded
    await db
      .update(paymentsTable)
      .set({ status: "refunded" })
      .where(eq(paymentsTable.reference, reference));

    // Notify the user
    try {
      await safeSend(bot!, payment.userId,
        `💸 *Payment Refund Notice*\n\n` +
        `Your payment *${escapeMd(reference)}* (₦${payment.amountNgn.toLocaleString()}) has been refunded.\n\n` +
        `*Reason:* ${escapeMd(reason)}\n\n` +
        `If you have questions, please contact support.`,
        { parse_mode: "Markdown" }
      );
    } catch {
      // User may have blocked the bot — log but don't fail
      logger.warn({ userId: payment.userId, reference }, "/refund: could not notify user");
    }

    await safeSend(bot!, chatId,
      `✅ *Refund Processed*\n\n` +
      `📋 *Reference:* ${escapeMd(reference)}\n` +
      `💰 *Amount:* ₦${payment.amountNgn.toLocaleString()}\n` +
      `🎯 *Tier:* ${payment.tier}\n` +
      `👤 *User ID:* ${payment.userId}\n` +
      `📝 *Reason:* ${escapeMd(reason)}\n\n` +
      `User has been notified.`,
      { parse_mode: "Markdown" }
    );
  }));

  // ── Admin-only: /wpe status ────────────────────────────────────────────────
  bot.onText(/\/wpe(?:\s+status)?/, safeHandler(async (msg) => {
    if (msg.from!.id !== ADMIN_TELEGRAM_ID) return; // silent denial for non-admins
    const wpeUrl = process.env.WPE_API_URL;
    const wpeKey = process.env.WPE_API_KEY;
    if (!wpeUrl || !wpeKey) {
      await safeSend(bot!, msg.chat.id, "⚠️ WPE credentials not configured in environment.");
      return;
    }
    const base = wpeUrl.replace(/\/+$/, "");
    sendTyping(bot!, msg.chat.id);
    try {
      const res = await fetch(`${base}/api/stats/overview`, {
        headers: { "x-api-key": wpeKey },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) {
        await safeSend(bot!, msg.chat.id, `❌ WPE returned HTTP ${res.status} — check server logs.`);
        return;
      }
      const data = await res.json() as Record<string, unknown>;

      // Parse known fields defensively — fall back to "N/A" for anything missing
      const load       = data.systemLoad      != null ? String(data.systemLoad)      : "N/A";
      const active     = data.activeSandboxes != null ? String(data.activeSandboxes) : "N/A";
      const max        = data.maxSandboxes    != null ? String(data.maxSandboxes)    : "N/A";
      const status     = typeof data.coreStatus === "string" ? data.coreStatus.toUpperCase() : "UNKNOWN";
      const uptime     = data.uptime          != null ? String(data.uptime)          : "N/A";
      const requests   = data.totalRequests   != null ? String(data.totalRequests)   : "N/A";
      const statusIcon = status === "OPERATIONAL" ? "🟢" : status === "DEGRADED" ? "🟡" : "🔴";

      await safeSend(bot!, msg.chat.id,
        `⚡ *WPE INFRASTRUCTURE REPORT* ⚡\n\n` +
        `${statusIcon} *Core Status:* ${status}\n` +
        `🖥️ *System Load:* ${load}\n` +
        `📦 *Active Sandboxes:* ${active} / ${max}\n` +
        `⏱️ *Uptime:* ${uptime}\n` +
        `📈 *Total Requests:* ${requests}\n\n` +
        `_Queried live · ${new Date().toISOString()}_`,
        { parse_mode: "Markdown" }
      );
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error("❌ WPE STATUS FETCH FAILED:", errMsg);
      await safeSend(bot!, msg.chat.id, `❌ Could not reach WPE server: ${errMsg.slice(0, 200)}`);
    }
  }));

  // ── Admin-only: /stats ─────────────────────────────────────────────────────
  bot.onText(/\/stats/, safeHandler(async (msg) => {
    if (msg.from!.id !== ADMIN_TELEGRAM_ID) return; // silently ignore non-admins
    const s = cachedStats;
    const age = Math.round((Date.now() - s.lastUpdated.getTime()) / 1000);
    const ageStr = age < 60 ? `${age}s ago` : `${Math.round(age / 60)}m ago`;
    await safeSend(bot!, msg.chat.id,
      `📊 *WebForge Engine Diagnostics*\n\n` +
      `🔨 *Total Completed Builds:* ${s.totalBuilds.toLocaleString()}\n` +
      `🟢 *Active Live Ports:* ${s.activeLivePorts.toLocaleString()}\n` +
      `🧠 *Global Token Consumption:* ${s.totalTokens.toLocaleString()}\n` +
      `💰 *Estimated Revenue Generated:* ₦${s.estimatedRevenueNgn.toLocaleString()}\n` +
      `👥 *Engaged Platform Users:* ${s.uniqueUsers.toLocaleString()}\n\n` +
      `_Cache refreshed: ${ageStr} • Updates every 10 min_`,
      { parse_mode: "Markdown" }
    );
  }));

  bot.onText(/\/draw(?:\s+(.+))?/, safeHandler(async (msg, match) => {
    if (!await isSubscribed(msg.from!.id)) { await sendGate(msg.chat.id); return; }
    const prompt = match?.[1]?.trim();
    if (!prompt) { await safeSend(bot!, msg.chat.id, "Usage: /draw <your image prompt>\n\nExample: /draw a futuristic Lagos skyline at sunset"); return; }
    const telegramId = msg.from!.id;
    const chatId = msg.chat.id;
    const check = await checkActionAllowed(telegramId);
    if (!check.allowed) { await safeSend(bot!, chatId, `⚠️ ${escapeMd(check.reason ?? "Limit reached")}\n\nUpgrade via ${PAYMENT_BOT_USERNAME}`); return; }
    const tier = (check.user!.tier as Tier);
    sendTyping(bot!, chatId);
    const result = await rufloDispatch(telegramId, `/draw ${prompt}`, tier);
    if (result.type === "image_ready" && result.imageBuffer) {
      const tmp = path.join(os.tmpdir(), `wf-img-${Date.now()}.jpg`);
      await fs.writeFile(tmp, result.imageBuffer);
      await bot!.sendPhoto(chatId, tmp, { caption: result.content, parse_mode: "Markdown" });
      fs.unlink(tmp).catch(() => {});
      await incrementAction(telegramId);
    } else {
      await safeSend(bot!, chatId, result.content);
    }
  }));

  bot.onText(/\/restart(?:\s+(\d+))?/, safeHandler(async (msg, match) => {
    if (!await isSubscribed(msg.from!.id)) { await sendGate(msg.chat.id); return; }
    const id = match?.[1] ? parseInt(match[1]) : null;
    if (!id) { await safeSend(bot!, msg.chat.id, "Usage: /restart <project_id>"); return; }
    await handleRestart(msg, id);
  }));

  bot.onText(/\/health(?:\s+(\d+))?/, safeHandler(async (msg, match) => {
    if (!await isSubscribed(msg.from!.id)) { await sendGate(msg.chat.id); return; }
    const id = match?.[1] ? parseInt(match[1]) : null;
    if (!id) { await safeSend(bot!, msg.chat.id, "Usage: /health <project_id>"); return; }
    await handleHealth(msg, id);
  }));

  bot.onText(/\/delete(?:\s+(\d+))?/, safeHandler(async (msg, match) => {
    if (!await isSubscribed(msg.from!.id)) { await sendGate(msg.chat.id); return; }
    const id = match?.[1] ? parseInt(match[1]) : null;
    if (!id) { await safeSend(bot!, msg.chat.id, "Usage: /delete <project_id>"); return; }
    await handleDelete(msg, id);
  }));

  bot.onText(/\/link_github(?:\s+(.+))?/, safeHandler(async (msg, match) => {
    const token = match?.[1]?.trim();
    if (!token) {
      await safeSend(bot!, msg.chat.id,
        `🐙 *Link GitHub Account*\n\nGet a Personal Access Token (classic) with \`repo\` scope from:\nhttps://github.com/settings/tokens\n\nThen send:\n\`/link_github ghp_your_token_here\`\n\n_Your token will be immediately deleted from chat and encrypted._`,
        { parse_mode: "Markdown" }
      );
      return;
    }
    await handleLinkGithub(msg, token);
  }));

  bot.onText(/\/logs(?:\s+(\d+))?/, safeHandler(async (msg, match) => {
    if (!await isSubscribed(msg.from!.id)) { await sendGate(msg.chat.id); return; }
    const id = match?.[1] ? parseInt(match[1]) : null;
    if (!id) { await safeSend(bot!, msg.chat.id, "Usage: /logs <project_id>"); return; }
    await handleLogs(msg, id);
  }));

  bot.onText(/\/clone_repo(?:\s+(.+))?/, safeHandler(async (msg, match) => {
    if (!await isSubscribed(msg.from!.id)) { await sendGate(msg.chat.id); return; }
    const url = match?.[1]?.trim();
    if (!url) { await safeSend(bot!, msg.chat.id, "Usage: /clone_repo https://github.com/user/repo"); return; }
    await handleCloneRepo(msg, url);
  }));

  bot.onText(/\/workspace(?:\s+(\d+))?/, safeHandler(async (msg, match) => {
    if (!await isSubscribed(msg.from!.id)) { await sendGate(msg.chat.id); return; }
    const id = match?.[1] ? parseInt(match[1]) : null;
    if (!id) { await safeSend(bot!, msg.chat.id, "Usage: /workspace <project_id>"); return; }
    const rows = await db.select().from(projectsTable).where(eq(projectsTable.id, id)).limit(1);
    const p = rows[0];
    const url = p?.liveUrl ?? `${PLATFORM_URL}/deploying/${id}`;
    await safeSend(bot!, msg.chat.id,
      `📊 *Project #${id}* — \`${p?.status ?? "unknown"}\`\n\n*Name:* ${escapeMd(p?.name ?? "Unknown")}\n*Stack:* ${escapeMd(p?.techStack ?? "unknown")}\n\n🌐 ${url}`,
      { parse_mode: "Markdown", reply_markup: { inline_keyboard: [[{ text: p?.liveUrl ? "🌐 Open App" : "📊 Deploy Page", url }]] } }
    );
  }));

  // ── Callbacks ─────────────────────────────────────────────────────────────
  bot.on("callback_query", async (query) => {
    if (!bot || !query.data) return;
    try {
      await bot.answerCallbackQuery(query.id);
    } catch {}
    const chatId = query.message!.chat.id;
    const telegramId = query.from.id;
    const data = query.data;

    try {
      if (data === "check_subscription") {
        const ok = await isSubscribed(telegramId);
        if (ok) {
          await getOrCreateUser(telegramId, query.from.first_name, query.from.username);
          await safeSend(bot, chatId, "✅ *Verified!* Welcome to WebForge 🔥 Tell me what to build.", { parse_mode: "Markdown" });
        } else {
          await safeSend(bot, chatId, `❌ Not joined yet — join ${REQUIRED_CHANNEL} first.`,
            { reply_markup: { inline_keyboard: [[
              { text: "📢 Join", url: `https://t.me/${REQUIRED_CHANNEL.replace("@","")}` },
              { text: "✅ I've Joined", callback_data: "check_subscription" },
            ]] } }
          );
        }
        return;
      }

      if (data.startsWith("confirm_") && !data.startsWith("confirm_delete_")) {
        if (parseInt(data.replace("confirm_","")) !== telegramId) return;
        const p = rufloGetPending(telegramId);
        if (!p) { await safeSend(bot, chatId, "⏰ Plan expired — describe what you want to build again."); return; }
        rufloDeletePending(telegramId);
        const check = await checkActionAllowed(telegramId);
        if (!check.allowed) { await safeSend(bot, chatId, `⚠️ ${escapeMd(check.reason ?? "Limit reached")}`); return; }
        await safeSend(bot, chatId, "🚀 *Building now!*", { parse_mode: "Markdown" });
        // Extract name from stored description; if none found, fall back to slugified description words
        const rawBtnName = await extractProjectName(p.description, telegramId).catch(() => null);
        const btnSlug = rawBtnName ? slugify(rawBtnName) : slugify(p.description.split(" ").slice(0, 3).join(" "));
        runFullBuild(chatId, telegramId, p.description, p.plan, p.tier, p.isElite, btnSlug || undefined).catch(logger.error);
        return;
      }

      if (data.startsWith("confirm_delete_")) {
        const id = parseInt(data.replace("confirm_delete_", ""));
        const rows = await db.select().from(projectsTable).where(eq(projectsTable.id, id)).limit(1);
        if (rows[0]?.userId !== telegramId) return;
        await db.update(projectsTable).set({ status: "deleted" }).where(eq(projectsTable.id, id));
        await safeSend(bot, chatId, `🗑 *Project #${id} deleted.*`, { parse_mode: "Markdown" });
        return;
      }

      if (data === "cancel_delete") {
        await safeSend(bot, chatId, "✅ Deletion cancelled.");
        return;
      }

      if (data.startsWith("replan_")) {
        if (parseInt(data.replace("replan_","")) !== telegramId) return;
        rufloDeletePending(telegramId);
        await safeSend(bot, chatId, "✏️ Tell me what to change and I'll revise the plan.");
        return;
      }

      if (data.startsWith("restart_")) {
        const id = parseInt(data.replace("restart_",""));
        await handleRestart(query.message as TelegramBot.Message, id);
        return;
      }

      if (data.startsWith("ghpush_")) {
        const id = parseInt(data.replace("ghpush_",""));
        const rows = await db.select().from(projectsTable).where(eq(projectsTable.id, id)).limit(1);
        if (!rows[0]?.workDir) { await safeSend(bot, chatId, "❌ Project workDir not found."); return; }
        gitPendingPush.set(telegramId, { workDir: rows[0].workDir, projectId: id });
        await safeSend(bot, chatId,
          `🐙 *Push Project #${id} to GitHub?*\n\nThis will commit all project files and push to your linked GitHub remote.\n\nReply *YES* to confirm.`,
          { parse_mode: "Markdown" }
        );
        return;
      }

      if (data.startsWith("logs_")) {
        const id = parseInt(data.replace("logs_", ""));
        await handleLogs(query.message as TelegramBot.Message, id);
        return;
      }
    } catch (err) {
      logger.error({ err, data }, "Callback query handler error");
    }
  });

  // ── Messages ──────────────────────────────────────────────────────────────
  bot.on("message", async (msg) => {
    if (!msg.text || msg.text.startsWith("/")) return;
    await handleGeneralMessage(msg).catch(err => logger.error({ err }, "Message handler error"));
  });

  bot.on("polling_error", (err) => {
    logger.warn({ err }, "Core bot polling error — continuing");
  });
}
