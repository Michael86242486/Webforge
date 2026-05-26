import TelegramBot from "node-telegram-bot-api";
import { routeTask, generateImage, deepBuildLoop, type TaskType } from "../ai/router.js";
import {
  getOrCreateUser, checkActionAllowed, incrementAction,
  checkProjectLimitAllowed, TIER_LIMITS, type Tier,
} from "../utils/billing.js";
import { encrypt } from "../utils/crypto.js";
import { db, usersTable, projectsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  ensureProjectDir, scaffoldBotProject, spawnBotProcess,
  planningMode, buildProjectFiles, runTerminalCommand,
  spawnProjectApp, pollAppHealth, assignProjectPort,
  type PlanningResult,
} from "../engines/orchestrator.js";
import {
  broadcastProgress, broadcastRedirect, broadcastStatus, broadcastToProject,
} from "../routes/stream.js";
import { logger } from "../lib/logger.js";
import fs from "fs/promises";
import path from "path";
import os from "os";

const TOKEN = process.env.CORE_BOT_TOKEN ?? "";

const CORE_BOT_USERNAME = "@WebBuilder2Bot";
const PAYMENT_BOT_USERNAME = "@Webforgepaymentverificationbot";
const REQUIRED_CHANNEL = "@mkystudiodev";

const PLATFORM_URL = (() => {
  const domains = process.env.REPLIT_DOMAINS?.split(",")[0];
  return domains ? `https://${domains}` : "https://webforge.replit.app";
})();

// ─── WebForge Identity System Prompt ─────────────────────────────────────────

const WEBFORGE_SYSTEM_PROMPT = `You are WebForge — an elite autonomous AI co-founder and full-stack platform engine operating as ${CORE_BOT_USERNAME} on Telegram.

ABSOLUTE IDENTITY RULES — NEVER BREAK THESE:
1. You ALWAYS respond in ENGLISH only — regardless of what language the user writes in.
2. You are NOT a general AI assistant. You are a PaaS engine. NEVER give generic AWS/Docker/cloud advice.
3. NEVER say "How can I help you today?" as a standalone reply.
4. If someone writes in another language, reply: "WebForge operates in English. How can I build something for you?"
5. You NEVER reveal underlying model names (deepseek, GPT, etc.). If asked, say "I'm WebForge — proprietary."
6. Keep responses concise, direct, and technical. You build things — not excuses.

WebForge capabilities:
• Build full-stack web apps, APIs, and Telegram bots from a single prompt
• Generate AI images (logos, banners, illustrations) — sent directly to chat
• Host Telegram bots permanently (Pro/Elite tiers)
• DEEP BUILD: 5-round self-correcting build loop (Elite only)
• GitHub clone and extend (Elite only)

Tier structure:
• Starter: ₦0/mo — 10 actions/day, 3 projects max
• Pro: ₦5,000/mo — 150 actions/day, unlimited projects, bot hosting
• Elite: ₦15,000/mo — 500 actions/day, DEEP BUILD, GitHub cloning`;

// ─── Pending Build Sessions ───────────────────────────────────────────────────
// Stores plans awaiting user confirmation before code is written

interface PendingBuild {
  description: string;
  plan: PlanningResult;
  tier: Tier;
  isElite: boolean;
  expiresAt: number; // Unix ms
}

const pendingBuilds = new Map<number, PendingBuild>();

function setPending(telegramId: number, data: Omit<PendingBuild, "expiresAt">): void {
  pendingBuilds.set(telegramId, { ...data, expiresAt: Date.now() + 10 * 60 * 1000 }); // 10 min TTL
}

function getPending(telegramId: number): PendingBuild | null {
  const p = pendingBuilds.get(telegramId);
  if (!p) return null;
  if (Date.now() > p.expiresAt) { pendingBuilds.delete(telegramId); return null; }
  return p;
}

function clearPending(telegramId: number): void {
  pendingBuilds.delete(telegramId);
}

function isConfirmation(text: string): boolean {
  return /^(yes|yeah|yep|yup|ok|okay|go|sure|build|start|do it|let's go|lets go|proceed|confirm|affirmative|build it|go ahead|start building|correct|right|great|perfect)/i.test(text.trim());
}

function isChangeRequest(text: string): boolean {
  return /\b(change|update|instead|rather|different|modify|use|add|remove|also|plus|but|however|no,|nope|actually)\b/i.test(text);
}

// ─── Subscription Gateway ────────────────────────────────────────────────────

let bot: TelegramBot | null = null;

async function isSubscribedToChannel(telegramId: number): Promise<boolean> {
  if (!bot) return false;
  try {
    const member = await bot.getChatMember(REQUIRED_CHANNEL, telegramId);
    return ["member", "administrator", "creator"].includes(member.status);
  } catch (_) { return false; }
}

async function sendSubscriptionGate(chatId: number): Promise<void> {
  if (!bot) return;
  await bot.sendMessage(chatId,
    `🔒 *Access Required*\n\nTo use WebForge, join our official channel first.\n\n📢 ${REQUIRED_CHANNEL}\n\nThen tap *I've Joined* below.`,
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [[
          { text: "📢 Join Channel", url: `https://t.me/${REQUIRED_CHANNEL.replace("@", "")}` },
          { text: "✅ I've Joined", callback_data: "check_subscription" },
        ]],
      },
    }
  );
}

// ─── Intent Detection ─────────────────────────────────────────────────────────

function isImageIntent(text: string): boolean {
  const lower = text.toLowerCase().trim();
  // Direct image request patterns
  if (/\b(create|generate|make|draw|design|produce|give me|show me)\s+(me\s+)?(an?\s+)?(image|photo|picture|illustration|logo|banner|icon|artwork|visual|portrait|landscape|wallpaper|graphic|thumbnail)\b/.test(lower)) return true;
  // "image/photo of X"
  if (/\b(image|photo|picture|illustration|portrait|artwork|visual)\s+of\b/.test(lower)) return true;
  // Starts with "draw"
  if (/^draw\b/.test(lower)) return true;
  // "provision an image" / "provision a photo" (VM-like phrasing)
  if (/\bprovision\s+(an?\s+)?(image|photo|picture|visual)\b/.test(lower)) return true;
  // "edit photos" / "edit an image" / "edit my photo"
  if (/\b(edit|crop|resize|convert|compress|enhance|filter)\s+(an?\s+|my\s+|the\s+|a\s+)?(photo|image|picture)\b/.test(lower)) return true;
  // "can you edit photos" / "can you generate images"
  if (/\bcan\s+you\s+(edit|generate|create|make|draw|design)\s+(photos|images|pictures|visuals)\b/.test(lower)) return true;
  // Generic: contains "image"/"photo"/"picture" AND an action verb
  if (/\b(image|photo|picture)\b/.test(lower) && /\b(create|generate|make|draw|design|produce|build|want|need|get)\b/.test(lower)) return true;
  return false;
}

function isBillingIntent(text: string): boolean {
  return /\b(upgrade|pro\s*plan|elite\s*plan|pricing|subscribe|subscription|payment|pay\s+for|how\s+much|plans?|tier|billing|₦|naira|cost)\b/i.test(text);
}

function isBuildIntent(text: string): boolean {
  if (text.length < 10) return false;
  return /\b(build|create|make|develop|generate|code|write|implement|design|launch|deploy|clone|scaffold)\b/i.test(text) &&
    /\b(app|website|site|api|bot|tool|platform|system|page|dashboard|landing|portfolio|shop|store|game|service)\b/i.test(text);
}

function detectTaskType(text: string): TaskType {
  const lower = text.toLowerCase();
  if (/plan|architect|spec|blueprint/.test(lower)) return "planning";
  if (/build|create|generate|implement|code|develop|write/.test(lower)) return "coding";
  if (/fix|debug|error|bug|issue|repair/.test(lower)) return "fixing";
  if (/ui|interface|frontend|layout|component/.test(lower)) return "ui";
  return "chat";
}

async function sendTyping(chatId: number): Promise<void> {
  try { await bot?.sendChatAction(chatId, "typing"); } catch (_) {}
}

// ─── Image Generation ─────────────────────────────────────────────────────────

async function handleImageGeneration(msg: TelegramBot.Message, text: string): Promise<void> {
  if (!bot) return;
  const telegramId = msg.from!.id;
  const chatId = msg.chat.id;

  const check = await checkActionAllowed(telegramId);
  if (!check.allowed) {
    await bot.sendMessage(chatId, `⚠️ ${check.reason}\n\nUpgrade via ${PAYMENT_BOT_USERNAME}`);
    return;
  }

  // Strip trigger words to get the actual prompt
  const prompt = text
    .replace(/^(create|generate|make|draw|design|produce|provision|show me|give me)\s+(me\s+)?(an?\s+)?/i, "")
    .replace(/^(image|photo|picture|illustration|logo|banner|visual|artwork)\s+(of\s+)?/i, "")
    .replace(/\b(image|photo|picture|illustration|artwork|visual)\s*$/i, "")
    .trim() || text;

  await sendTyping(chatId);
  const waitMsg = await bot.sendMessage(chatId,
    `🎨 *Generating your image...*\n_Prompt: "${prompt.slice(0, 120)}"_`,
    { parse_mode: "Markdown" }
  );

  try {
    const imageUrl = await generateImage(prompt, telegramId);

    if (!imageUrl) {
      await bot.editMessageText(
        "❌ Image generation returned no result. Try a more descriptive prompt — e.g. \"generate an image of a sunset over Lagos\".",
        { chat_id: chatId, message_id: waitMsg.message_id }
      );
      return;
    }

    const response = await fetch(imageUrl);
    if (!response.ok) throw new Error(`Download failed: ${response.status}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    const tmpPath = path.join(os.tmpdir(), `wf-img-${Date.now()}.png`);
    await fs.writeFile(tmpPath, buffer);

    await bot.deleteMessage(chatId, waitMsg.message_id);
    await bot.sendPhoto(chatId, tmpPath, {
      caption: `🎨 *Generated by WebForge AI*\n_"${prompt.slice(0, 180)}"_`,
      parse_mode: "Markdown",
    });

    fs.unlink(tmpPath).catch(() => {});
    await incrementAction(telegramId);

  } catch (err) {
    logger.error({ err }, "Image generation error");
    await bot.editMessageText(
      "❌ Image generation failed — the model may be temporarily unavailable. Please try again in a moment.",
      { chat_id: chatId, message_id: waitMsg.message_id }
    );
  }
}

// ─── Build Prompt (explicit file format) ─────────────────────────────────────

function buildCodePrompt(description: string, plan: PlanningResult): string {
  const fileList = plan.manifest.map(f => `  • ${f.path} — ${f.description}`).join("\n");

  return `Generate a complete, production-ready application for: "${description}"

Tech stack: ${plan.techStack}
Summary: ${plan.summary}

════════════════════════════════════════
REQUIRED OUTPUT FORMAT — FOLLOW EXACTLY
════════════════════════════════════════

Use this EXACT format for EVERY file. No exceptions, no other format:

=== FILE: package.json ===
{
  "name": "my-app",
  "version": "1.0.0",
  "scripts": { "start": "node src/index.js" },
  "dependencies": { "express": "^4.18.2" }
}
=== END FILE ===

=== FILE: src/index.js ===
const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => console.log('Server running on port ' + PORT));
=== END FILE ===

════════════════════════════════════════
ABSOLUTE REQUIREMENTS — VIOLATIONS FAIL
════════════════════════════════════════

1. EVERY file must contain REAL, COMPLETE, WORKING code — not comments, not stubs, not TODO.
2. NEVER write "// code here", "// rest of code", "// TODO", "...", or "[continue]".
3. Use CommonJS (require / module.exports) for ALL .js files — NO import/export syntax in .js files.
4. package.json MUST have: "scripts": { "start": "node src/index.js" } (or whichever main file).
5. Server MUST use: const PORT = process.env.PORT || 3000; then app.listen(PORT, ...).
6. HTML files must be complete with proper DOCTYPE, head, styles, and working JavaScript.
7. CSS files must have real, beautiful styles — not placeholders.
8. Minimum 30 lines per file (except package.json). README can be shorter.

FILES TO GENERATE (${plan.manifest.length} total):
${fileList}

─────────────────────────────────────────
Generate all ${plan.manifest.length} files NOW using === FILE: path === format:`;
}

// ─── Full Build Pipeline ──────────────────────────────────────────────────────

async function runFullBuild(
  chatId: number,
  telegramId: number,
  description: string,
  plan: PlanningResult,
  tier: Tier,
  isElite: boolean,
): Promise<void> {
  if (!bot) return;

  // Create DB project + workDir
  const [project] = await db.insert(projectsTable).values({
    userId: telegramId,
    name: description.slice(0, 60),
    description,
    status: "building",
    techStack: plan.techStack,
  }).returning();

  const workDir = await ensureProjectDir(project.id, telegramId);
  await db.update(projectsTable).set({ workDir }).where(eq(projectsTable.id, project.id));

  const pid = String(project.id);
  const deployingUrl = `${PLATFORM_URL}/deploying/${project.id}`;

  await bot.sendMessage(chatId,
    `🚀 *Build Started — Project #${project.id}*\n\nWatch your app being built live:\n${deployingUrl}`,
    {
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: [[{ text: "📊 Watch Live Build", url: deployingUrl }]] },
    }
  );

  try {
    // ── Store manifest ──────────────────────────────────────────────────────
    await db.update(projectsTable).set({
      buildManifest: plan.manifest as unknown as Record<string, unknown>[],
      filesTotal: plan.manifest.length,
    }).where(eq(projectsTable.id, project.id));

    broadcastProgress(pid, 18, `Plan ready — ${plan.manifest.length} files`, 0, plan.manifest.length);
    broadcastToProject(pid, { type: "round", round: "Plan", maxRounds: isElite ? 5 : 1, message: plan.summary });

    // ── Code generation ─────────────────────────────────────────────────────
    let finalCode = "";
    const codePrompt = buildCodePrompt(description, plan);

    if (isElite) {
      broadcastProgress(pid, 22, "DeepBuild round 1 — generating code...", 0, plan.manifest.length);

      const deepResult = await deepBuildLoop(
        codePrompt, telegramId, WEBFORGE_SYSTEM_PROMPT, 5,
        (round, maxRounds, issues) => {
          const pct = 22 + (round / maxRounds) * 36;
          broadcastProgress(pid, pct, `DeepBuild round ${round} of ${maxRounds}...`, 0, plan.manifest.length);
          broadcastToProject(pid, {
            type: "round", round, maxRounds,
            message: issues.length ? `${issues.length} issue(s) correcting...` : "Clean pass ✓",
          });
          bot?.sendMessage(chatId,
            `🔄 *DeepBuild Round ${round}/${maxRounds}*\n${issues.length ? `${issues.length} issue(s) — self-correcting...` : "Clean pass ✓"}`,
            { parse_mode: "Markdown" }
          ).catch(() => {});
        },
      );

      finalCode = deepResult.finalCode;
      broadcastProgress(pid, 62, `Code complete in ${deepResult.rounds} round(s)`, 0, plan.manifest.length);

      await bot.sendMessage(chatId,
        `✅ *DeepBuild Complete*\n*Rounds:* ${deepResult.rounds}\n*Model:* \`${deepResult.model}\`\n*Cost:* $${deepResult.totalCostUsd.toFixed(4)}\n\nWriting ${plan.manifest.length} files...`,
        { parse_mode: "Markdown" }
      );
    } else {
      broadcastProgress(pid, 22, "Generating application code...", 0, plan.manifest.length);
      const result = await routeTask("coding", codePrompt, tier, telegramId, WEBFORGE_SYSTEM_PROMPT);
      finalCode = result.content;
      broadcastProgress(pid, 62, "Code generation complete", 0, plan.manifest.length);

      await bot.sendMessage(chatId,
        `✅ *Code Generated*\n*Model:* \`${result.model}\`\n*Cost:* $${result.costUsd.toFixed(4)}\n\nWriting files...`,
        { parse_mode: "Markdown" }
      );
    }

    // ── Write files ─────────────────────────────────────────────────────────
    broadcastProgress(pid, 65, "Writing files to disk...", 0, plan.manifest.length);

    const written = await buildProjectFiles(
      workDir, finalCode, pid, plan.manifest,
      (filesWritten, filePath) => {
        const pct = 65 + (filesWritten / Math.max(plan.manifest.length, 1)) * 14;
        broadcastProgress(pid, pct, `Writing: ${path.basename(filePath)}`, filesWritten, plan.manifest.length);
      },
    );

    // ── npm install ─────────────────────────────────────────────────────────
    broadcastProgress(pid, 80, "Installing dependencies...", written, plan.manifest.length);
    broadcastStatus(pid, "Running npm install...");

    const installResult = await runTerminalCommand(
      "npm install --legacy-peer-deps 2>&1",
      workDir, 180_000,
    );
    logger.info({ projectId: project.id, stderr: installResult.stderr.slice(0, 500) }, "npm install done");

    await incrementAction(telegramId);

    // ── Start app ───────────────────────────────────────────────────────────
    const port = assignProjectPort(project.id);
    broadcastProgress(pid, 88, `Starting app on port ${port}...`, written, plan.manifest.length);

    const { pid: processPid } = await spawnProjectApp(workDir, project.id, port);
    await db.update(projectsTable).set({ port, botPid: processPid ?? null }).where(eq(projectsTable.id, project.id));

    await bot.sendMessage(chatId,
      `⏳ *App starting...*\nPolling port ${port} — usually 10-30s...`,
      { parse_mode: "Markdown" }
    );

    // ── Health poll ─────────────────────────────────────────────────────────
    broadcastProgress(pid, 92, "Waiting for HTTP response...", written, plan.manifest.length);

    const isLive = await pollAppHealth(port, 120_000, 2500);
    const liveUrl = `${PLATFORM_URL}/api/preview-proxy/${project.id}/`;

    await db.update(projectsTable).set({
      status: isLive ? "running" : "error",
      liveUrl: isLive ? liveUrl : null,
    }).where(eq(projectsTable.id, project.id));

    broadcastProgress(pid, 100, isLive ? "🎉 App is live!" : "Build complete", written, plan.manifest.length);
    broadcastRedirect(pid, liveUrl);

    if (isLive) {
      await bot.sendMessage(chatId,
        `🎉 *App is LIVE — Project #${project.id}*\n\n✅ ${written} files deployed\n🔌 Port: ${port}\n\n🌐 *Your live app:*\n${liveUrl}`,
        {
          parse_mode: "Markdown",
          reply_markup: { inline_keyboard: [[{ text: "🌐 Open Live App", url: liveUrl }]] },
        }
      );
    } else {
      // Log the startup error to help debug
      try {
        const errLog = await fs.readFile(path.join(workDir, "app.stderr.log"), "utf8");
        logger.warn({ projectId: project.id, errLog: errLog.slice(-1000) }, "App startup stderr");
      } catch (_) {}

      await bot.sendMessage(chatId,
        `⚠️ *Build Complete — App warming up*\n\n${written} files deployed. The process is running but hasn't responded yet (common with large npm installs).\n\n🌐 *URL (auto-refreshes when ready):*\n${liveUrl}`,
        {
          parse_mode: "Markdown",
          reply_markup: { inline_keyboard: [[{ text: "🌐 Open App URL", url: liveUrl }]] },
        }
      );
    }

  } catch (err) {
    logger.error({ err, projectId: project.id }, "Build pipeline error");
    await db.update(projectsTable).set({ status: "error" }).where(eq(projectsTable.id, project.id));
    broadcastStatus(pid, "Build failed");
    await bot.sendMessage(chatId,
      `❌ *Build Failed — Project #${project.id}*\n\n${err instanceof Error ? err.message.slice(0, 300) : "Unknown error"}\n\nPlease try again with a more specific description.`,
      { parse_mode: "Markdown" }
    );
  }
}

// ─── Build Request Handler (Planning + Confirmation) ─────────────────────────

async function handleBuildRequest(msg: TelegramBot.Message, text: string): Promise<void> {
  if (!bot) return;
  const telegramId = msg.from!.id;
  const chatId = msg.chat.id;

  const check = await checkActionAllowed(telegramId);
  if (!check.allowed) {
    await bot.sendMessage(chatId, `⚠️ ${check.reason}\n\nUpgrade via ${PAYMENT_BOT_USERNAME}`);
    return;
  }

  const user = check.user!;
  const tier = user.tier as Tier;

  // Bot token detection → Bot-as-a-Service
  const botTokenMatch = text.match(/(\d{9,11}:[A-Za-z0-9_-]{35,})/);
  if (botTokenMatch) {
    if (!TIER_LIMITS[tier].botHosting) {
      await bot.sendMessage(chatId,
        `🤖 *Bot hosting requires Pro or Elite*\n\nUpgrade via ${PAYMENT_BOT_USERNAME}`,
        { parse_mode: "Markdown" }
      );
      return;
    }
    const projectCheck = await checkProjectLimitAllowed(telegramId);
    if (!projectCheck.allowed) {
      await bot.sendMessage(chatId, `⚠️ ${projectCheck.reason}`);
      return;
    }
    await sendTyping(chatId);
    const wait = await bot.sendMessage(chatId, "🤖 Scaffolding and deploying your bot...");

    const [project] = await db.insert(projectsTable).values({
      userId: telegramId, name: `Bot-${Date.now()}`,
      description: text, status: "building", techStack: "node-telegram-bot-api",
    }).returning();
    const workDir = await ensureProjectDir(project.id, telegramId);
    await scaffoldBotProject(workDir, botTokenMatch[1], text, "Respond helpfully to all messages.");
    const { pid: pid2 } = spawnBotProcess(workDir, "index.js", {});
    await db.update(projectsTable).set({ status: "running", workDir, botPid: pid2, isHosted: true }).where(eq(projectsTable.id, project.id));

    await bot.deleteMessage(chatId, wait.message_id);
    await bot.sendMessage(chatId,
      `🎉 *Bot Deployed!*\nProject #${project.id} — PID: \`${pid2}\`\n\n${PLATFORM_URL}/deploying/${project.id}`,
      { parse_mode: "Markdown" }
    );
    return;
  }

  const projectCheck = await checkProjectLimitAllowed(telegramId);
  if (!projectCheck.allowed) {
    await bot.sendMessage(chatId, `⚠️ ${projectCheck.reason}\n\nUpgrade via ${PAYMENT_BOT_USERNAME}`);
    return;
  }

  // ── Run planning mode, then ask for confirmation ──────────────────────────
  await sendTyping(chatId);
  const thinkMsg = await bot.sendMessage(chatId,
    `🧠 *Analysing your request...*\n_Running WebForge planning engine..._`,
    { parse_mode: "Markdown" }
  );

  try {
    const routeTaskBound = (taskType: "planning", prompt: string, t: string, tid?: number, sys?: string) =>
      routeTask(taskType, prompt, t, tid, sys ?? WEBFORGE_SYSTEM_PROMPT);

    const isElite = tier === "elite";
    const plan = await planningMode(text, routeTaskBound, telegramId, tier);

    // Store pending build for confirmation
    setPending(telegramId, { description: text, plan, tier, isElite });

    await bot.deleteMessage(chatId, thinkMsg.message_id);

    const fileList = plan.manifest.slice(0, 10).map(f => `  📄 \`${f.path}\``).join("\n");
    const moreFiles = plan.manifest.length > 10 ? `\n  _...and ${plan.manifest.length - 10} more_` : "";

    await bot.sendMessage(chatId,
      `📋 *Build Plan Ready*\n\n*What I'll build:*\n${plan.summary}\n\n*Tech stack:* ${plan.techStack}\n*Files:* ${plan.manifest.length} files\n\n*File structure:*\n${fileList}${moreFiles}\n\n${isElite ? "🔥 *DEEP BUILD* active — 5-round self-correction loop\n\n" : ""}Reply *YES* to start building, or describe any changes you want.`,
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [{ text: "🚀 YES — Build It Now!", callback_data: `confirm_build_${telegramId}` }],
            [{ text: "✏️ Change Something", callback_data: `replan_${telegramId}` }],
          ],
        },
      }
    );
  } catch (err) {
    logger.error({ err }, "Planning mode error");
    await bot.deleteMessage(chatId, thinkMsg.message_id);
    await bot.sendMessage(chatId, "❌ Planning failed — please try again with more detail about what you want to build.");
  }
}

// ─── Commands ─────────────────────────────────────────────────────────────────

async function handleStart(msg: TelegramBot.Message): Promise<void> {
  if (!bot) return;
  const subscribed = await isSubscribedToChannel(msg.from!.id);
  if (!subscribed) { await sendSubscriptionGate(msg.chat.id); return; }

  const user = await getOrCreateUser(msg.from!.id, msg.from?.first_name, msg.from?.username);
  const tier = user.tier as Tier;
  const remaining = TIER_LIMITS[tier].dailyActions - user.dailyActionsCounter;

  await bot.sendMessage(msg.chat.id,
    `⚡ *Welcome to WebForge*\n\nI'm your autonomous full-stack co-founder. Describe what to build — I'll plan it, confirm with you, then code and deploy it.\n\n*Plan:* ${tier.toUpperCase()} | *Actions left:* ${remaining}/${TIER_LIMITS[tier].dailyActions}\n\n*Try:*\n• _"Build a Coca-Cola promo website"_\n• _"Create an image of a sunset over Lagos"_\n• _"Make a to-do list app with dark mode"_\n\nType \`/help\` for all commands.`,
    { parse_mode: "Markdown" }
  );
}

async function handleHelp(msg: TelegramBot.Message): Promise<void> {
  if (!bot) return;
  const subscribed = await isSubscribedToChannel(msg.from!.id);
  if (!subscribed) { await sendSubscriptionGate(msg.chat.id); return; }

  await bot.sendMessage(msg.chat.id,
    `🛠 *WebForge Commands*\n\n\`/start\` — Welcome & status\n\`/projects\` — Your project list\n\`/workspace <id>\` — View a project\n\`/upgrade\` — Pricing & plans\n\`/status\` — Account details\n\n*Image generation (sends image here):*\n_"Create an image of..."_\n_"Generate a photo of..."_\n_"Draw me a logo for..."_\n\n*App building (live URL delivered):*\n_"Build me a restaurant website"_\n_"Make a task manager with login"_\n\n*Bot hosting (Pro/Elite):*\nPaste your bot token in any message.`,
    { parse_mode: "Markdown" }
  );
}

async function handleProjects(msg: TelegramBot.Message): Promise<void> {
  if (!bot) return;
  const subscribed = await isSubscribedToChannel(msg.from!.id);
  if (!subscribed) { await sendSubscriptionGate(msg.chat.id); return; }

  const projects = await db.select().from(projectsTable).where(eq(projectsTable.userId, msg.from!.id));

  if (projects.length === 0) {
    await bot.sendMessage(msg.chat.id,
      `📂 *No projects yet*\n\nTell me what to build:\n_"Build me a task manager"_\n_"Create a restaurant landing page"_`,
      { parse_mode: "Markdown" }
    );
    return;
  }

  const list = projects.map(p => {
    const icon = p.status === "running" ? "🟢" : p.status === "building" ? "🟡" : p.status === "error" ? "🔴" : "⚪";
    const url = p.liveUrl ?? `${PLATFORM_URL}/deploying/${p.id}`;
    return `${icon} *${p.name.slice(0, 40)}* — \`${p.status}\`\n   🌐 [${p.liveUrl ? "Live App" : "Deploy Page"}](${url})`;
  }).join("\n\n");

  await bot.sendMessage(msg.chat.id, `📁 *Your Projects (${projects.length})*\n\n${list}`, { parse_mode: "Markdown", disable_web_page_preview: true });
}

async function handleStatus(msg: TelegramBot.Message): Promise<void> {
  if (!bot) return;
  const subscribed = await isSubscribedToChannel(msg.from!.id);
  if (!subscribed) { await sendSubscriptionGate(msg.chat.id); return; }

  const user = await getOrCreateUser(msg.from!.id, msg.from?.first_name, msg.from?.username);
  const tier = (user.tier as Tier) ?? "starter";
  const limits = TIER_LIMITS[tier];
  const projects = await db.select().from(projectsTable).where(eq(projectsTable.userId, msg.from!.id));
  const remaining = limits.dailyActions - user.dailyActionsCounter;

  await bot.sendMessage(msg.chat.id,
    `📊 *Account Status*\n\n👤 *User:* ${user.firstName ?? "Anonymous"}\n🏷 *Plan:* ${tier.toUpperCase()}\n⚡ *Actions:* ${user.dailyActionsCounter}/${limits.dailyActions} (${remaining} left today)\n📁 *Projects:* ${projects.length}${limits.maxProjects !== Infinity ? `/${limits.maxProjects}` : ""}\n\n${limits.botHosting ? "✅" : "❌"} Bot hosting  ${limits.deepBuild ? "✅" : "❌"} DeepBuild  ${limits.gitClone ? "✅" : "❌"} GitHub clone`,
    { parse_mode: "Markdown" }
  );
}

async function handleUpgrade(msg: TelegramBot.Message): Promise<void> {
  if (!bot) return;
  await bot.sendMessage(msg.chat.id,
    `💳 *WebForge Plans*\n\n🆓 *Starter* — ₦0/mo\n  10 actions/day • 3 projects\n\n⭐ *Pro* — ₦5,000/mo\n  150 actions • Unlimited projects • Bot hosting\n\n👑 *Elite* — ₦15,000/mo\n  500 actions • DeepBuild • GitHub clone • Priority AI\n\nUpgrade via payment bot:`,
    {
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: [[{ text: "💳 Open Payment Bot", url: `https://t.me/${PAYMENT_BOT_USERNAME.replace("@", "")}` }]] },
    }
  );
}

// ─── General Message Handler ──────────────────────────────────────────────────

async function handleGeneralMessage(msg: TelegramBot.Message): Promise<void> {
  if (!bot || !msg.text) return;
  const text = msg.text.trim();
  const telegramId = msg.from!.id;
  const chatId = msg.chat.id;

  const subscribed = await isSubscribedToChannel(telegramId);
  if (!subscribed) { await sendSubscriptionGate(chatId); return; }

  await getOrCreateUser(telegramId, msg.from?.first_name, msg.from?.username);

  // API key injection
  const keyMatch = text.match(/sk-[A-Za-z0-9_-]{20,}|devx-[A-Za-z0-9]{20,}/);
  if (keyMatch) {
    await bot.deleteMessage(chatId, msg.message_id);
    const encrypted = encrypt(keyMatch[0]);
    await db.update(usersTable).set({ apiKey: encrypted }).where(eq(usersTable.telegramId, telegramId));
    await bot.sendMessage(chatId, "🔐 *API Key Secured* — encrypted AES-256, scrubbed from chat.", { parse_mode: "Markdown" });
    return;
  }

  // ── Check for pending confirmation ────────────────────────────────────────
  const pending = getPending(telegramId);
  if (pending) {
    if (isConfirmation(text)) {
      clearPending(telegramId);
      const check = await checkActionAllowed(telegramId);
      if (!check.allowed) {
        await bot.sendMessage(chatId, `⚠️ ${check.reason}`);
        return;
      }
      await bot.sendMessage(chatId, "✅ *Confirmed! Starting build now...*", { parse_mode: "Markdown" });
      runFullBuild(chatId, telegramId, pending.description, pending.plan, pending.tier, pending.isElite)
        .catch(err => logger.error({ err }, "runFullBuild error"));
      return;
    }

    if (isChangeRequest(text)) {
      clearPending(telegramId);
      // Treat as a new build request with updated description
      const newDescription = `${pending.description}. Additional requirements: ${text}`;
      await handleBuildRequest({ ...msg, text: newDescription } as TelegramBot.Message, newDescription);
      return;
    }
  }

  // ① Image intent — check FIRST before anything else
  if (isImageIntent(text)) {
    await handleImageGeneration(msg, text);
    return;
  }

  // ② Billing intent
  if (isBillingIntent(text)) {
    await handleUpgrade(msg);
    return;
  }

  // ③ Build intent
  if (isBuildIntent(text)) {
    await handleBuildRequest(msg, text);
    return;
  }

  // ④ General chat — WebForge identity locked via system prompt
  const check = await checkActionAllowed(telegramId);
  if (!check.allowed) {
    await bot.sendMessage(chatId, `⚠️ ${check.reason}\n\nUpgrade via ${PAYMENT_BOT_USERNAME}`);
    return;
  }

  await sendTyping(chatId);
  const taskType = detectTaskType(text);
  const result = await routeTask(taskType, text, check.user!.tier, telegramId, WEBFORGE_SYSTEM_PROMPT);
  await incrementAction(telegramId);
  await bot.sendMessage(chatId, result.content.slice(0, 4096), { parse_mode: "Markdown" });
}

// ─── Bot Init ─────────────────────────────────────────────────────────────────

export function initCoreBot(): void {
  if (!TOKEN) {
    logger.warn("CORE_BOT_TOKEN not set — core bot disabled");
    return;
  }

  bot = new TelegramBot(TOKEN, { polling: true });
  logger.info("Core bot started polling");

  bot.onText(/\/start/, handleStart);
  bot.onText(/\/help/, handleHelp);
  bot.onText(/\/projects/, handleProjects);
  bot.onText(/\/status/, handleStatus);
  bot.onText(/\/upgrade/, handleUpgrade);

  bot.onText(/\/workspace (\d+)/, async (msg, match) => {
    if (!bot || !match?.[1]) return;
    const projectId = parseInt(match[1]);
    const rows = await db.select().from(projectsTable).where(eq(projectsTable.id, projectId)).limit(1);
    const p = rows[0];
    const url = p?.liveUrl ?? `${PLATFORM_URL}/deploying/${projectId}`;
    await bot.sendMessage(msg.chat.id,
      `📊 *Project #${projectId}* — \`${p?.status ?? "unknown"}\`\n\n${url}`,
      { parse_mode: "Markdown", reply_markup: { inline_keyboard: [[{ text: p?.liveUrl ? "🌐 Open App" : "📊 Deploy Page", url }]] } }
    );
  });

  // ── Callback queries ──────────────────────────────────────────────────────
  bot.on("callback_query", async (query) => {
    if (!bot || !query.data) return;
    await bot.answerCallbackQuery(query.id);
    const chatId = query.message!.chat.id;
    const telegramId = query.from.id;
    const data = query.data;

    if (data === "check_subscription") {
      const ok = await isSubscribedToChannel(telegramId);
      if (ok) {
        await getOrCreateUser(telegramId, query.from.first_name, query.from.username);
        await bot.sendMessage(chatId, "✅ *Verified!* Welcome to WebForge. Tell me what to build.", { parse_mode: "Markdown" });
      } else {
        await bot.sendMessage(chatId,
          `❌ Not joined yet. Please join ${REQUIRED_CHANNEL} first.`,
          { reply_markup: { inline_keyboard: [[
            { text: "📢 Join Channel", url: `https://t.me/${REQUIRED_CHANNEL.replace("@", "")}` },
            { text: "✅ I've Joined", callback_data: "check_subscription" },
          ]] } }
        );
      }
      return;
    }

    // Confirm build via inline button
    if (data.startsWith("confirm_build_")) {
      const ownerId = parseInt(data.replace("confirm_build_", ""));
      if (ownerId !== telegramId) {
        await bot.sendMessage(chatId, "❌ This button isn't for you.");
        return;
      }
      const pending = getPending(telegramId);
      if (!pending) {
        await bot.sendMessage(chatId, "⏰ Plan expired — please describe what you want to build again.");
        return;
      }
      clearPending(telegramId);
      const check = await checkActionAllowed(telegramId);
      if (!check.allowed) { await bot.sendMessage(chatId, `⚠️ ${check.reason}`); return; }

      await bot.sendMessage(chatId, "✅ *Confirmed — starting build now!*", { parse_mode: "Markdown" });
      runFullBuild(chatId, telegramId, pending.description, pending.plan, pending.tier, pending.isElite)
        .catch(err => logger.error({ err }, "runFullBuild error"));
      return;
    }

    // Replan via inline button
    if (data.startsWith("replan_")) {
      const ownerId = parseInt(data.replace("replan_", ""));
      if (ownerId !== telegramId) return;
      clearPending(telegramId);
      await bot.sendMessage(chatId, "✏️ Tell me what changes you'd like, and I'll revise the plan.");
      return;
    }

    // Legacy build_ callback (from old "Start Building Now" buttons still in chat)
    if (data.startsWith("build_")) {
      const projectId = parseInt(data.replace("build_", ""));
      const rows = await db.select().from(projectsTable).where(eq(projectsTable.id, projectId)).limit(1);
      const project = rows[0];
      if (!project?.workDir) { await bot.sendMessage(chatId, "❌ Project not found."); return; }

      const check = await checkActionAllowed(telegramId);
      if (!check.allowed) { await bot.sendMessage(chatId, `⚠️ ${check.reason}`); return; }

      const tier = check.user!.tier as Tier;
      // For legacy flow, use a basic plan
      const plan: PlanningResult = {
        manifest: (project.buildManifest as unknown as Array<{ path: string; description: string }> | null) ?? [],
        techStack: project.techStack ?? "fullstack",
        summary: project.description ?? project.name,
      };

      if (plan.manifest.length === 0) {
        await bot.sendMessage(chatId, "⚠️ No plan found for this project — please start a new build.");
        return;
      }

      runFullBuild(chatId, telegramId, project.description ?? project.name, plan, tier, tier === "elite")
        .catch(err => logger.error({ err }, "runFullBuild legacy error"));
    }
  });

  // ── Messages ──────────────────────────────────────────────────────────────
  bot.on("message", async (msg) => {
    if (!msg.text || msg.text.startsWith("/")) return;
    await handleGeneralMessage(msg).catch(err => logger.error({ err }, "Message handler error"));
  });

  bot.on("polling_error", (err) => logger.error({ err }, "Core bot polling error"));
}
