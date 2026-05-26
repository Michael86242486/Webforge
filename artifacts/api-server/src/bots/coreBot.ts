import TelegramBot from "node-telegram-bot-api";
import { routeTask, generateImage, deepBuildLoop, type TaskType } from "../ai/router.js";
import {
  getOrCreateUser, checkActionAllowed, incrementAction,
  checkProjectLimitAllowed, TIER_LIMITS, type Tier,
} from "../utils/billing.js";
import { encrypt, decrypt } from "../utils/crypto.js";
import { db, usersTable, projectsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  ensureProjectDir, scaffoldBotProject, spawnBotProcess,
  planningMode, buildProjectFiles, runTerminalCommand,
  spawnProjectApp, pollAppHealth, assignProjectPort, findFreePort,
  syntaxAuditFiles, patchSyntaxError, generateReadme,
  gitCloneRepo, gitPushChanges, selfHealApp,
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
const PAYMENT_BOT_USERNAME = "@Webforgepaymentverificationbot";
const REQUIRED_CHANNEL = "@mkystudiodev";
const PLATFORM_URL = (() => {
  const d = process.env.REPLIT_DOMAINS?.split(",")[0];
  return d ? `https://${d}` : "https://webforge.replit.app";
})();

// ─── System Prompt ────────────────────────────────────────────────────────────

const WEBFORGE_SYSTEM_PROMPT = `You are WebForge — an elite autonomous AI co-founder and full-stack PaaS engine on Telegram.

IDENTITY (non-negotiable):
• ALWAYS respond in English only — if user writes another language, reply: "WebForge operates in English. What shall we build?"
• You are NOT a generic chatbot. You are a build engine. Never give AWS/Docker/cloud textbook advice.
• Never reveal model names. If asked: "I'm WebForge — proprietary intelligence."
• Be warm, excited, and technically precise. Sound like a senior engineer who loves shipping products.
• Never say "How can I help?" as a standalone. Always redirect to building.

Capabilities: full-stack web apps, APIs, Telegram bots, AI image generation, GitHub sync, bot hosting.
Tiers: Starter (₦0/10 actions), Pro (₦5k/150 actions), Elite (₦15k/500 + DeepBuild + GitHub).`;

// ─── State Maps ───────────────────────────────────────────────────────────────

interface DiscoveryState {
  baseDescription: string;
  gathered: string[];
  tier: Tier;
  isElite: boolean;
  expiresAt: number;
}

interface PendingBuild {
  description: string;
  plan: PlanningResult;
  tier: Tier;
  isElite: boolean;
  expiresAt: number;
}

const discoveryStates = new Map<number, DiscoveryState>();
const pendingBuilds    = new Map<number, PendingBuild>();
const activeSessions   = new Set<number>(); // session lock — one build per user at a time
const gitPendingPush   = new Map<number, { workDir: string; projectId: number }>(); // awaiting push confirm

function ttl(ms = 15 * 60 * 1000) { return Date.now() + ms; }
function expired(ts: number) { return Date.now() > ts; }

function getDiscovery(id: number): DiscoveryState | null {
  const s = discoveryStates.get(id);
  if (!s || expired(s.expiresAt)) { discoveryStates.delete(id); return null; }
  return s;
}
function getPending(id: number): PendingBuild | null {
  const s = pendingBuilds.get(id);
  if (!s || expired(s.expiresAt)) { pendingBuilds.delete(id); return null; }
  return s;
}

// ─── Intent Helpers ───────────────────────────────────────────────────────────

function isImageIntent(text: string): boolean {
  const l = text.toLowerCase().trim();
  if (/\b(create|generate|make|draw|design|produce|show me|give me)\s+(me\s+)?(an?\s+)?(image|photo|picture|illustration|logo|banner|icon|artwork|visual|portrait|landscape|wallpaper|graphic|thumbnail)\b/.test(l)) return true;
  if (/\b(image|photo|picture|illustration|portrait|artwork|visual)\s+of\b/.test(l)) return true;
  if (/^draw\b/.test(l)) return true;
  if (/\bprovision\s+(an?\s+)?(image|photo|picture|visual)\b/.test(l)) return true;
  if (/\b(edit|crop|resize|convert|compress|enhance|filter)\s+(an?\s+|my\s+|the\s+)?(photo|image|picture)\b/.test(l)) return true;
  if (/\bcan\s+you\s+(edit|generate|create|make|draw)\s+(photos|images|pictures)\b/.test(l)) return true;
  if (/\b(image|photo|picture)\b/.test(l) && /\b(create|generate|make|draw|design|produce|want|need|get)\b/.test(l)) return true;
  return false;
}

function isBillingIntent(text: string): boolean {
  return /\b(upgrade|pro\s*plan|elite\s*plan|pricing|subscribe|payment|pay\s+for|how\s+much|plans?|tier|billing|₦|naira|cost)\b/i.test(text);
}

function isBuildIntent(text: string): boolean {
  if (text.length < 12) return false;
  return /\b(build|create|make|develop|generate|code|write|implement|design|launch|deploy|clone|scaffold)\b/i.test(text)
    && /\b(app|website|site|api|bot|tool|platform|system|page|dashboard|landing|portfolio|shop|store|game|service|web)\b/i.test(text);
}

function isVagueRequest(text: string): boolean {
  const words = text.trim().split(/\s+/).length;
  if (words > 30) return false;
  const hasDetail = /\b(with|including|that has|should have|need a|featuring|color|colour|section|page|login|auth|dashboard|gallery|shop|cart|form|blog|portfolio|timeline|pricing|dark|light|modern|minimal|clean|bold|colorful|react|express|mongodb|firebase|api|realtime|animation)\b/i.test(text);
  return !hasDetail;
}

function isConfirmation(text: string): boolean {
  return /^(yes|yeah|yep|yup|ok|okay|go|sure|build|start|do it|let'?s go|proceed|confirm|correct|right|great|perfect|absolutely|affirmative|build it|go ahead|start building|sounds good|looks good|fire|🔥|✅)/i.test(text.trim());
}

function isChangeRequest(text: string): boolean {
  return /\b(change|update|instead|rather|different|modify|use|add|remove|also|plus|but|however|no,|nope|actually|wait|hold on)\b/i.test(text);
}

function detectTaskType(text: string): TaskType {
  const l = text.toLowerCase();
  if (/fix|debug|error|bug|issue|repair/.test(l)) return "fixing";
  if (/build|create|implement|code|develop/.test(l)) return "coding";
  if (/plan|architect|spec|blueprint/.test(l)) return "planning";
  if (/ui|interface|frontend|layout/.test(l)) return "ui";
  return "chat";
}

// Discovery question — contextual, enthusiastic
function discoveryQuestion(description: string): string {
  const l = description.toLowerCase();
  if (/coca.cola|pepsi|drink|beverage|food|restaurant|cafe|menu|delivery/.test(l))
    return `Ohhh a ${description.trim()} — I can already picture how fire this is going to look! 🔥\n\nTell me more so I can map the perfect system:\n• What *sections* should it have? (Hero, product gallery, history, contact?)\n• What *vibe* are we going for — bold classic, modern minimal, or something premium?\n• Any specific brand colors or references?`;
  if (/portfolio|cv|resume|personal brand/.test(l))
    return `A personal portfolio — love this! This is going to make you stand out 🚀\n\nA few quick things:\n• What sections do you need? (Projects, skills, about, contact?)\n• What's your style preference — ultra-minimal, bold with animations, or something editorial?\n• Any specific color palette or design references?`;
  if (/shop|store|ecommerce|sell|product|marketplace/.test(l))
    return `An online store — this one's going to convert! 🛒\n\nLet me nail the details:\n• What kind of products? Physical goods, digital downloads, services?\n• Do you need a cart + checkout, or just a product catalog?\n• Any preferred style — clean/minimal, bold/colorful, luxury?`;
  if (/dashboard|admin|analytics|tracking|crm|erp/.test(l))
    return `A dashboard — I *love* building these! 📊 The data viz alone is going to be stunning.\n\nTell me:\n• What data will it display? (Sales, users, analytics, real-time metrics?)\n• Do you need charts, tables, or both?\n• Is there login/authentication, or is it a single-user local tool?`;
  if (/blog|news|article|content|magazine/.test(l))
    return `A content platform — clean and slick! 📝\n\nLet's get the details right:\n• What topics/categories will it cover?\n• Do you need user comments, a newsletter signup, or CMS-style editing?\n• Any style vibe — editorial, tech-minimal, or magazine-style?`;
  if (/bot|telegram|discord|slack|assistant/.test(l))
    return `A custom bot — this is going to be wild! 🤖\n\nTell me more:\n• What should the bot *do*? (Answer questions, book appointments, send alerts?)\n• Should it have a specific persona or personality?\n• Any commands or features you have in mind?`;
  // Generic
  return `Wow, what an idea! I'm already excited to build this 🔥\n\nLet me ask a few quick things so we build it *exactly* right:\n• What specific pages or sections should it have?\n• What style are you going for — bold and modern, clean and minimal, or something else?\n• Any features you definitely need (login, payments, search, etc.)?`;
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
  await bot?.sendMessage(chatId,
    `🔒 *Join to Unlock WebForge*\n\nFirst, join our official channel to access the build engine:\n\n📢 ${REQUIRED_CHANNEL}\n\nThen tap *I've Joined* below ↓`,
    { parse_mode: "Markdown", reply_markup: { inline_keyboard: [[
      { text: "📢 Join Channel", url: `https://t.me/${REQUIRED_CHANNEL.replace("@","")}` },
      { text: "✅ I've Joined", callback_data: "check_subscription" },
    ]] } }
  );
}

async function typing(chatId: number) {
  try { await bot?.sendChatAction(chatId, "typing"); } catch {}
}

// ─── Image Generation Handler ─────────────────────────────────────────────────

async function handleImageGeneration(msg: TelegramBot.Message, text: string): Promise<void> {
  if (!bot) return;
  const { id: telegramId } = msg.from!;
  const chatId = msg.chat.id;

  const check = await checkActionAllowed(telegramId);
  if (!check.allowed) {
    await bot.sendMessage(chatId, `⚠️ ${check.reason}\n\nUpgrade via ${PAYMENT_BOT_USERNAME}`);
    return;
  }

  // Enthusiastic immediate ack — user gets instant feedback
  const ackMsg = await bot.sendMessage(chatId,
    `Ya sure, why not! 🧬 Your image is generating right now — hang tight, this'll be worth the wait...`,
    { parse_mode: "Markdown" }
  );

  const prompt = text
    .replace(/^(create|generate|make|draw|design|produce|provision|show me|give me)\s+(me\s+)?(an?\s+)?/i, "")
    .replace(/^(image|photo|picture|illustration|logo|banner|visual|artwork)\s+(of\s+)?/i, "")
    .replace(/\b(image|photo|picture|illustration|artwork|visual)\s*$/i, "")
    .trim() || text;

  try {
    const imageUrl = await generateImage(prompt, telegramId);
    if (!imageUrl) throw new Error("No URL returned");

    const resp = await fetch(imageUrl);
    if (!resp.ok) throw new Error(`Download HTTP ${resp.status}`);
    const buf = Buffer.from(await resp.arrayBuffer());
    const tmp = path.join(os.tmpdir(), `wf-img-${Date.now()}.png`);
    await fs.writeFile(tmp, buf);

    await bot.deleteMessage(chatId, ackMsg.message_id);
    await bot.sendPhoto(chatId, tmp, {
      caption: `🎨 *Generated by WebForge AI*\n\n_"${prompt.slice(0, 180)}"_`,
      parse_mode: "Markdown",
    });
    fs.unlink(tmp).catch(() => {});
    await incrementAction(telegramId);

  } catch (err) {
    logger.error({ err }, "Image generation error");
    await bot.editMessageText(
      `❌ Image generation hit a snag — the AI model may be warming up. Try again in a moment!\n\n_Prompt saved: "${prompt.slice(0,80)}"_`,
      { chat_id: chatId, message_id: ackMsg.message_id, parse_mode: "Markdown" }
    );
  }
}

// ─── Build Prompt ─────────────────────────────────────────────────────────────

function buildCodePrompt(description: string, plan: PlanningResult): string {
  const fileList = plan.manifest.map(f => `  • ${f.path} — ${f.description}`).join("\n");
  return `Generate a complete, production-ready application for: "${description}"
Tech stack: ${plan.techStack}
Summary: ${plan.summary}

════════════════════════════════════════
REQUIRED OUTPUT FORMAT — FOLLOW EXACTLY
════════════════════════════════════════
Use EXACTLY this format for EVERY file:

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
app.listen(PORT, () => console.log('Running on port ' + PORT));
=== END FILE ===

════════════════════════════════════════
ABSOLUTE REQUIREMENTS
════════════════════════════════════════
1. EVERY file = real, working, complete code — no stubs, no TODOs, no "// rest here"
2. Use CommonJS (require/module.exports) in ALL .js files — ZERO import/export syntax
3. package.json MUST have: "scripts": { "start": "node src/index.js" }
4. Server MUST have: const PORT = process.env.PORT || 3000; app.listen(PORT, ...)
5. HTML = complete pages with DOCTYPE, beautiful CSS, working JS interactions
6. CSS = real styles with gradients, hover effects, responsive layouts (min 40 lines)
7. Minimum 30 lines per file (except package.json and README)
8. Make the UI genuinely beautiful — dark theme preferred, smooth animations, modern typography

FILES TO GENERATE (${plan.manifest.length} total):
${fileList}

Generate ALL ${plan.manifest.length} files now:`;
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

  // Session lock
  if (activeSessions.has(telegramId)) {
    await bot.sendMessage(chatId, "⏳ You already have a build running! Wait for it to finish before starting another.");
    return;
  }
  activeSessions.add(telegramId);

  const [project] = await db.insert(projectsTable).values({
    userId: telegramId, name: description.slice(0, 60),
    description, status: "building", techStack: plan.techStack,
  }).returning();

  const workDir = await ensureProjectDir(project.id, telegramId);
  await db.update(projectsTable).set({ workDir }).where(eq(projectsTable.id, project.id));

  const pid = String(project.id);
  const deployUrl = `${PLATFORM_URL}/deploying/${project.id}`;

  await bot.sendMessage(chatId,
    `🚀 *Build Started — Project #${project.id}*\n\nLive deploy page:\n${deployUrl}`,
    { parse_mode: "Markdown", reply_markup: { inline_keyboard: [[{ text: "📊 Watch Live Build", url: deployUrl }]] } }
  );

  try {
    // ── Store manifest ────────────────────────────────────────────────────
    await db.update(projectsTable).set({
      buildManifest: plan.manifest as unknown as Record<string, unknown>[],
      filesTotal: plan.manifest.length,
    }).where(eq(projectsTable.id, project.id));

    broadcastProgress(pid, 15, `${plan.manifest.length} files planned`, 0, plan.manifest.length);
    broadcastToProject(pid, { type: "round", round: "Plan", maxRounds: isElite ? 5 : 1, message: plan.summary });

    // ── Code generation ───────────────────────────────────────────────────
    const codePrompt = buildCodePrompt(description, plan);
    let finalCode = "";

    if (isElite) {
      broadcastProgress(pid, 20, "DeepBuild round 1 — generating code...", 0, plan.manifest.length);
      const deepResult = await deepBuildLoop(codePrompt, telegramId, WEBFORGE_SYSTEM_PROMPT, 5,
        (round, max, issues) => {
          broadcastProgress(pid, 20 + (round / max) * 38, `DeepBuild round ${round}/${max}`, 0, plan.manifest.length);
          broadcastToProject(pid, { type: "round", round, maxRounds: max, message: issues.length ? `${issues.length} issue(s) correcting...` : "Clean ✓" });
          bot?.sendMessage(chatId, `🔄 *Round ${round}/${max}* — ${issues.length ? `${issues.length} issue(s) self-correcting...` : "Clean pass ✓"}`, { parse_mode: "Markdown" }).catch(() => {});
        },
      );
      finalCode = deepResult.finalCode;
      await bot.sendMessage(chatId,
        `✅ *DeepBuild Complete*\n*Rounds:* ${deepResult.rounds} | *Model:* \`${deepResult.model}\` | *Cost:* $${deepResult.totalCostUsd.toFixed(4)}\n\nWriting ${plan.manifest.length} files...`,
        { parse_mode: "Markdown" }
      );
    } else {
      broadcastProgress(pid, 20, "Generating application code...", 0, plan.manifest.length);
      const result = await routeTask("coding", codePrompt, tier, telegramId, WEBFORGE_SYSTEM_PROMPT);
      finalCode = result.content;
      await bot.sendMessage(chatId,
        `✅ *Code Generated* — \`${result.model}\` — $${result.costUsd.toFixed(4)}\n\nWriting files...`,
        { parse_mode: "Markdown" }
      );
    }

    // ── Write files ───────────────────────────────────────────────────────
    broadcastProgress(pid, 62, "Writing files to disk...", 0, plan.manifest.length);
    const written = await buildProjectFiles(workDir, finalCode, pid, plan.manifest,
      (n, f) => broadcastProgress(pid, 62 + (n / Math.max(plan.manifest.length, 1)) * 12, `Writing ${path.basename(f)}`, n, plan.manifest.length),
    );

    // ── Syntax audit loop ─────────────────────────────────────────────────
    broadcastProgress(pid, 75, "Running syntax audit...", written, plan.manifest.length);
    const syntaxErrors = await syntaxAuditFiles(workDir);

    if (syntaxErrors.length > 0) {
      await bot.sendMessage(chatId,
        `🔍 *Syntax Audit* — found ${syntaxErrors.length} issue(s), auto-patching...`,
        { parse_mode: "Markdown" }
      );
      let patched = 0;
      for (const se of syntaxErrors) {
        const ok = await patchSyntaxError(workDir, se.file, se.error,
          prompt => routeTask("fixing", prompt, tier, telegramId, WEBFORGE_SYSTEM_PROMPT).then(r => r.content)
        );
        if (ok) patched++;
      }
      await bot.sendMessage(chatId,
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

    const { pid: procPid } = await spawnProjectApp(workDir, project.id, port);
    await db.update(projectsTable).set({ port, botPid: procPid ?? null }).where(eq(projectsTable.id, project.id));

    await bot.sendMessage(chatId, `⏳ *App starting on port ${port}...* (10-30s)`, { parse_mode: "Markdown" });

    // ── Health poll ───────────────────────────────────────────────────────
    broadcastProgress(pid, 92, "Polling for HTTP response...", written, plan.manifest.length);
    let isLive = await pollAppHealth(port, 90_000);
    const liveUrl = `${PLATFORM_URL}/api/preview-proxy/${project.id}/`;

    // ── Self-Healing Autopsy (if app didn't start) ────────────────────────
    if (!isLive) {
      await bot.sendMessage(chatId,
        `🔧 *App didn't respond — running self-healing autopsy...*\n_Reading crash logs and dispatching AI repair..._`,
        { parse_mode: "Markdown" }
      );
      broadcastStatus(pid, "Self-healing: analysing crash...");

      const healResult = await selfHealApp(
        workDir, project.id, port, procPid,
        prompt => routeTask("fixing", prompt, tier, telegramId, WEBFORGE_SYSTEM_PROMPT).then(r => r.content),
        (attempt, maxAttempts, fixed) => {
          broadcastStatus(pid, `Heal attempt ${attempt}/${maxAttempts}${fixed ? " ✓" : "..."}`);
          bot?.sendMessage(chatId,
            `🔄 *Heal ${attempt}/${maxAttempts}* — ${fixed ? "✅ Fixed! App is live!" : "Still patching..."}`,
            { parse_mode: "Markdown" }
          ).catch(() => {});
        },
        3,
      );

      if (healResult.healed) {
        isLive = true;
        await bot.sendMessage(chatId,
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
      prompt => routeTask("chat", prompt, tier, telegramId, WEBFORGE_SYSTEM_PROMPT).then(r => r.content)
    ).catch(() => {});

    // ── Check for GitHub auto-push ────────────────────────────────────────
    const userRow = await db.select().from(usersTable).where(eq(usersTable.telegramId, telegramId)).limit(1);
    const ghToken = userRow[0]?.githubToken ? decrypt(userRow[0].githubToken) : null;

    if (isLive) {
      await bot.sendMessage(chatId,
        `🎉 *App is LIVE — Project #${project.id}*\n\n✅ ${written} files deployed\n🔌 Port: ${port}${syntaxErrors.length ? `\n🔍 ${syntaxErrors.length} syntax issues auto-patched` : ""}\n\n🌐 *Your live app:*\n${liveUrl}`,
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
    } else {
      await bot.sendMessage(chatId,
        `⚠️ *Build Complete — App warming up*\n\n${written} files deployed. The process is running but hasn't responded yet.\n\nUse \`/logs ${project.id}\` to inspect crash output, or \`/restart ${project.id}\` to retry.\n\n🌐 ${liveUrl}`,
        { parse_mode: "Markdown", reply_markup: { inline_keyboard: [[{ text: "🌐 Try URL", url: liveUrl }, { text: "📋 View Logs", callback_data: `logs_${project.id}` }]] } }
      );
    }

  } catch (err) {
    logger.error({ err, projectId: project.id }, "Build pipeline error");
    await db.update(projectsTable).set({ status: "error" }).where(eq(projectsTable.id, project.id));
    broadcastStatus(pid, "Build failed");
    await bot.sendMessage(chatId,
      `❌ *Build Failed — Project #${project.id}*\n\n${err instanceof Error ? err.message.slice(0, 300) : "Unknown error"}\n\nPlease try again with more detail.`,
      { parse_mode: "Markdown" }
    );
  } finally {
    activeSessions.delete(telegramId);
  }
}

// ─── Build Request (Discovery Gate → Plan → Confirm) ─────────────────────────

async function handleBuildRequest(msg: TelegramBot.Message, text: string): Promise<void> {
  if (!bot) return;
  const telegramId = msg.from!.id;
  const chatId = msg.chat.id;

  const check = await checkActionAllowed(telegramId);
  if (!check.allowed) { await bot.sendMessage(chatId, `⚠️ ${check.reason}\n\nUpgrade via ${PAYMENT_BOT_USERNAME}`); return; }
  const tier = check.user!.tier as Tier;

  // Bot token detection
  const tokenMatch = text.match(/(\d{9,11}:[A-Za-z0-9_-]{35,})/);
  if (tokenMatch) {
    if (!TIER_LIMITS[tier].botHosting) {
      await bot.sendMessage(chatId, `🤖 *Bot hosting = Pro/Elite feature*\n\nUpgrade via ${PAYMENT_BOT_USERNAME}`, { parse_mode: "Markdown" });
      return;
    }
    const pc = await checkProjectLimitAllowed(telegramId);
    if (!pc.allowed) { await bot.sendMessage(chatId, `⚠️ ${pc.reason}`); return; }
    const wait = await bot.sendMessage(chatId, "🤖 Scaffolding and deploying your bot...");
    const [proj] = await db.insert(projectsTable).values({ userId: telegramId, name: `Bot-${Date.now()}`, description: text, status: "building", techStack: "node-telegram-bot-api" }).returning();
    const wd = await ensureProjectDir(proj.id, telegramId);
    await scaffoldBotProject(wd, tokenMatch[1], text, "Respond helpfully.");
    const { pid: p2 } = spawnBotProcess(wd, "index.js", {});
    await db.update(projectsTable).set({ status: "running", workDir: wd, botPid: p2, isHosted: true }).where(eq(projectsTable.id, proj.id));
    await bot.deleteMessage(chatId, wait.message_id);
    await bot.sendMessage(chatId, `🎉 *Bot Deployed!* — Project #${proj.id}\nPID: \`${p2}\`\n\n${PLATFORM_URL}/deploying/${proj.id}`, { parse_mode: "Markdown" });
    return;
  }

  const pc2 = await checkProjectLimitAllowed(telegramId);
  if (!pc2.allowed) { await bot.sendMessage(chatId, `⚠️ ${pc2.reason}\n\nUpgrade via ${PAYMENT_BOT_USERNAME}`); return; }

  // ── DISCOVERY GATE: vague requests get a conversation first ──────────────
  if (isVagueRequest(text)) {
    discoveryStates.set(telegramId, {
      baseDescription: text,
      gathered: [],
      tier,
      isElite: tier === "elite",
      expiresAt: ttl(),
    });
    await bot.sendMessage(chatId, discoveryQuestion(text), { parse_mode: "Markdown" });
    return;
  }

  // ── Detailed request: run planning immediately ────────────────────────────
  await launchPlanningFlow(chatId, telegramId, text, tier);
}

async function launchPlanningFlow(chatId: number, telegramId: number, description: string, tier: Tier): Promise<void> {
  if (!bot) return;
  await typing(chatId);
  const thinkMsg = await bot.sendMessage(chatId,
    `🧠 *Mapping your system...*\n_WebForge planning engine initialising..._`,
    { parse_mode: "Markdown" }
  );

  try {
    const bound = (taskType: "planning", p: string, t: string, id?: number, sys?: string) =>
      routeTask(taskType, p, t, id, sys ?? WEBFORGE_SYSTEM_PROMPT);
    const plan = await planningMode(description, bound, telegramId, tier);

    pendingBuilds.set(telegramId, {
      description, plan, tier, isElite: tier === "elite", expiresAt: ttl(),
    });

    await bot.deleteMessage(chatId, thinkMsg.message_id);

    const fileList = plan.manifest.slice(0, 12).map(f => `  📄 \`${f.path}\``).join("\n");
    const more = plan.manifest.length > 12 ? `\n  _...and ${plan.manifest.length - 12} more_` : "";

    await bot.sendMessage(chatId,
      `📋 *Build Plan Ready!*\n\n*What I'll build:* ${plan.summary}\n*Stack:* ${plan.techStack}\n*Files:* ${plan.manifest.length}\n\n*Structure:*\n${fileList}${more}\n\n${tier === "elite" ? "🔥 *DEEP BUILD* — 5-round self-correction active\n\n" : ""}Reply *YES* to build this now, or tell me what to change!`,
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
  } catch (err) {
    logger.error({ err }, "Planning error");
    await bot.deleteMessage(chatId, thinkMsg.message_id);
    await bot.sendMessage(chatId, "❌ Planning failed — try again with more detail about what you want to build.");
  }
}

// ─── Command Handlers ─────────────────────────────────────────────────────────

async function handleStart(msg: TelegramBot.Message): Promise<void> {
  if (!bot) return;
  if (!await isSubscribed(msg.from!.id)) { await sendGate(msg.chat.id); return; }
  const user = await getOrCreateUser(msg.from!.id, msg.from?.first_name, msg.from?.username);
  const tier = user.tier as Tier;
  const left = TIER_LIMITS[tier].dailyActions - user.dailyActionsCounter;

  await bot.sendMessage(msg.chat.id,
    `⚡ *Welcome to WebForge!*\n\nI'm your autonomous full-stack co-founder. Tell me what to build — I'll plan it, confirm with you, then code and deploy it live.\n\n*Plan:* ${tier.toUpperCase()} | *Actions left today:* ${left}/${TIER_LIMITS[tier].dailyActions}\n\n*Try saying:*\n🏗 _"Build a Coca-Cola promo website"_\n🎨 _"Create an image of a Lagos sunset"_\n🤖 _"Make a task manager with dark mode"_\n🐙 _"/link\_github [your PAT]"_ — connect GitHub\n\nType \`/help\` for all commands.`,
    { parse_mode: "Markdown" }
  );
}

async function handleHelp(msg: TelegramBot.Message): Promise<void> {
  if (!bot) return;
  if (!await isSubscribed(msg.from!.id)) { await sendGate(msg.chat.id); return; }
  await bot.sendMessage(msg.chat.id,
    `🛠 *WebForge Commands*\n\n` +
    `\`/start\` — Welcome & account status\n` +
    `\`/projects\` — Your projects list\n` +
    `\`/workspace <id>\` — Open workspace for a project\n` +
    `\`/restart <id>\` — Restart a stopped app\n` +
    `\`/health <id>\` — Live health check & ping\n` +
    `\`/logs <id>\` — Tail stdout/stderr of a running app\n` +
    `\`/clone_repo <url>\` — Clone a GitHub repo into a project\n` +
    `\`/link_github <PAT>\` — Connect your GitHub account\n` +
    `\`/upgrade\` — Plans & pricing\n` +
    `\`/status\` — Your tier, usage & API key\n` +
    `\`/help\` — This message\n\n` +
    `*Build an app* (just describe it):\n` +
    `_"Build me a restaurant website"_\n` +
    `_"Make a task manager with dark mode"_\n\n` +
    `*Generate images*:\n` +
    `_"Create an image of a Lagos sunset"_\n` +
    `_"Generate a logo for my coffee shop"_`,
    { parse_mode: "Markdown" }
  );
}

async function handleLogs(msg: TelegramBot.Message, projectId: number): Promise<void> {
  if (!bot) return;
  if (!await isSubscribed(msg.from!.id)) { await sendGate(msg.chat.id); return; }

  const rows = await db.select().from(projectsTable).where(eq(projectsTable.id, projectId)).limit(1);
  const project = rows[0];
  if (!project || project.userId !== msg.from!.id) {
    await bot.sendMessage(msg.chat.id, `❌ Project #${projectId} not found or doesn't belong to you.`);
    return;
  }

  const workDir = path.join(process.cwd(), "user-projects", String(projectId));

  let stdoutLines: string[] = [];
  let stderrLines: string[] = [];

  try {
    const raw = await fs.readFile(path.join(workDir, "app.stdout.log"), "utf8");
    stdoutLines = raw.trim().split("\n").filter(Boolean).slice(-50);
  } catch { stdoutLines = ["(no stdout log)"] }

  try {
    const raw = await fs.readFile(path.join(workDir, "app.stderr.log"), "utf8");
    stderrLines = raw.trim().split("\n").filter(Boolean).slice(-20);
  } catch { stderrLines = ["(no stderr log)"] }

  const stdoutBlock = stdoutLines.join("\n");
  const stderrBlock = stderrLines.join("\n");

  let output = `📋 *Project #${projectId} — ${project.name.slice(0, 30)}*\n\n`;
  output += `*STDOUT (last 50 lines):*\n\`\`\`\n${stdoutBlock}\n\`\`\`\n\n`;
  output += `*STDERR (last 20 lines):*\n\`\`\`\n${stderrBlock}\n\`\`\``;

  // Telegram hard limit is 4096 — truncate gracefully from the middle
  if (output.length > 4000) {
    const combined = `${stdoutBlock}\n\n--- STDERR ---\n${stderrBlock}`;
    const truncated = combined.slice(-3000);
    output = `📋 *Project #${projectId} — ${project.name.slice(0, 30)}*\n_(truncated — last 3000 chars)_\n\`\`\`\n${truncated}\n\`\`\``;
  }

  await bot.sendMessage(msg.chat.id, output, {
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [[
        { text: "🔄 Restart App", callback_data: `restart_${projectId}` },
        { text: "🔁 Refresh Logs", callback_data: `logs_${projectId}` },
      ]],
    },
  });
}

async function handleProjects(msg: TelegramBot.Message): Promise<void> {
  if (!bot) return;
  if (!await isSubscribed(msg.from!.id)) { await sendGate(msg.chat.id); return; }
  const projects = await db.select().from(projectsTable).where(eq(projectsTable.userId, msg.from!.id));

  if (!projects.length) {
    await bot.sendMessage(msg.chat.id, `📂 *No projects yet*\n\nTell me what to build!`, { parse_mode: "Markdown" });
    return;
  }

  const list = projects.map(p => {
    const icon = p.status === "running" ? "🟢" : p.status === "building" ? "🟡" : p.status === "error" ? "🔴" : "⚪";
    const url = p.liveUrl ?? `${PLATFORM_URL}/deploying/${p.id}`;
    return `${icon} *#${p.id}* — ${p.name.slice(0, 35)}\n   \`${p.status}\` | [${p.liveUrl ? "Open App" : "Deploy Page"}](${url})`;
  }).join("\n\n");

  await bot.sendMessage(msg.chat.id, `📁 *Your Projects (${projects.length})*\n\n${list}`, { parse_mode: "Markdown", disable_web_page_preview: true });
}

async function handleStatus(msg: TelegramBot.Message): Promise<void> {
  if (!bot) return;
  if (!await isSubscribed(msg.from!.id)) { await sendGate(msg.chat.id); return; }
  const user = await getOrCreateUser(msg.from!.id, msg.from?.first_name, msg.from?.username);
  const tier = (user.tier as Tier) ?? "starter";
  const lims = TIER_LIMITS[tier];
  const projects = await db.select().from(projectsTable).where(eq(projectsTable.userId, msg.from!.id));
  const hasGh = !!user.githubToken;

  await bot.sendMessage(msg.chat.id,
    `📊 *Account Status*\n\n👤 *User:* ${user.firstName ?? "Anonymous"}\n🏷 *Plan:* ${tier.toUpperCase()}\n⚡ *Actions:* ${user.dailyActionsCounter}/${lims.dailyActions} (${lims.dailyActions - user.dailyActionsCounter} left)\n📁 *Projects:* ${projects.length}${lims.maxProjects !== Infinity ? `/${lims.maxProjects}` : ""}\n🐙 *GitHub:* ${hasGh ? "Connected ✅" : "Not linked"}\n\n${lims.botHosting ? "✅" : "❌"} Bot hosting  ${lims.deepBuild ? "✅" : "❌"} DeepBuild  ${lims.gitClone ? "✅" : "❌"} GitHub\n\nUpgrade: ${PAYMENT_BOT_USERNAME}`,
    { parse_mode: "Markdown" }
  );
}

async function handleUpgrade(msg: TelegramBot.Message): Promise<void> {
  if (!bot) return;
  await bot.sendMessage(msg.chat.id,
    `💳 *WebForge Plans*\n\n🆓 *Starter* — ₦0/mo — 10 actions/day, 3 projects\n⭐ *Pro* — ₦5,000/mo — 150 actions, unlimited projects, bot hosting\n👑 *Elite* — ₦15,000/mo — 500 actions, DeepBuild, GitHub sync, priority models`,
    { parse_mode: "Markdown", reply_markup: { inline_keyboard: [[{ text: "💳 Pay & Upgrade", url: `https://t.me/${PAYMENT_BOT_USERNAME.replace("@","")}` }]] } }
  );
}

async function handleRestart(msg: TelegramBot.Message, projectId: number): Promise<void> {
  if (!bot) return;
  const chatId = msg.chat.id;
  const telegramId = msg.from!.id;

  const rows = await db.select().from(projectsTable).where(eq(projectsTable.id, projectId)).limit(1);
  const proj = rows[0];

  if (!proj || proj.userId !== telegramId) {
    await bot.sendMessage(chatId, `❌ Project #${projectId} not found or not yours.`);
    return;
  }
  if (!proj.workDir) {
    await bot.sendMessage(chatId, `❌ Project #${projectId} has no working directory — was it fully built?`);
    return;
  }

  await typing(chatId);
  const msg2 = await bot.sendMessage(chatId, `🔄 *Restarting Project #${projectId}...*`, { parse_mode: "Markdown" });

  try {
    const preferred = proj.port ?? assignProjectPort(projectId);
    const port = await findFreePort(preferred);
    const { pid: newPid } = await spawnProjectApp(proj.workDir, projectId, port);
    await db.update(projectsTable).set({ port, botPid: newPid ?? null, status: "running" }).where(eq(projectsTable.id, projectId));

    await bot.sendMessage(chatId, `⏳ Polling port ${port} for HTTP response...`);
    const live = await pollAppHealth(port, 60_000);
    const liveUrl = `${PLATFORM_URL}/api/preview-proxy/${projectId}/`;

    if (live) {
      await db.update(projectsTable).set({ status: "running", liveUrl }).where(eq(projectsTable.id, projectId));
    }
    await bot.deleteMessage(chatId, msg2.message_id);
    await bot.sendMessage(chatId,
      live
        ? `✅ *Project #${projectId} is back online!*\n\n🌐 ${liveUrl}`
        : `⚠️ *Project #${projectId} restarted* — still warming up.\n\n🌐 ${liveUrl} (auto-refreshes)`,
      { parse_mode: "Markdown", reply_markup: { inline_keyboard: [[{ text: "🌐 Open App", url: liveUrl }]] } }
    );
  } catch (err) {
    logger.error({ err, projectId }, "handleRestart error");
    await bot.deleteMessage(chatId, msg2.message_id);
    await bot.sendMessage(chatId, `❌ Restart failed: ${err instanceof Error ? err.message.slice(0, 200) : "unknown error"}`);
  }
}

async function handleHealth(msg: TelegramBot.Message, projectId: number): Promise<void> {
  if (!bot) return;
  const chatId = msg.chat.id;
  const telegramId = msg.from!.id;

  const rows = await db.select().from(projectsTable).where(eq(projectsTable.id, projectId)).limit(1);
  const proj = rows[0];
  if (!proj || proj.userId !== telegramId) { await bot.sendMessage(chatId, `❌ Project #${projectId} not found.`); return; }

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
  await bot.sendMessage(chatId,
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
  await bot.deleteMessage(msg.chat.id, msg.message_id); // scrub token from chat
  if (!token.startsWith("ghp_") && !token.startsWith("github_pat_") && !/^gh[a-z]_/.test(token) && token.length < 30) {
    await bot.sendMessage(msg.chat.id, "❌ That doesn't look like a valid GitHub Personal Access Token. Get one at: https://github.com/settings/tokens\n\n_Your message was deleted to keep credentials safe._", { parse_mode: "Markdown" });
    return;
  }
  const encrypted = encrypt(token);
  await db.update(usersTable).set({ githubToken: encrypted }).where(eq(usersTable.telegramId, msg.from!.id));
  await bot.sendMessage(msg.chat.id,
    `🐙 *GitHub Account Linked!*\n\nYour token has been encrypted with AES-256 and stored securely. Your message was deleted from the chat.\n\nYou can now:\n• Use \`/clone_repo [url]\` to clone any repo\n• Push project changes back to GitHub after builds`,
    { parse_mode: "Markdown" }
  );
}

async function handleCloneRepo(msg: TelegramBot.Message, repoUrl: string): Promise<void> {
  if (!bot) return;
  const telegramId = msg.from!.id;
  const chatId = msg.chat.id;

  const check = await checkActionAllowed(telegramId);
  if (!check.allowed) { await bot.sendMessage(chatId, `⚠️ ${check.reason}`); return; }

  const tier = check.user!.tier as Tier;
  if (!TIER_LIMITS[tier].gitClone) {
    await bot.sendMessage(chatId, `🐙 *GitHub clone requires Pro or Elite*\n\nUpgrade via ${PAYMENT_BOT_USERNAME}`, { parse_mode: "Markdown" });
    return;
  }

  const userRow = await db.select().from(usersTable).where(eq(usersTable.telegramId, telegramId)).limit(1);
  const ghToken = userRow[0]?.githubToken ? decrypt(userRow[0].githubToken) : undefined;

  await typing(chatId);
  const waitMsg = await bot.sendMessage(chatId, `🐙 *Cloning repository...*\n\`${repoUrl}\``, { parse_mode: "Markdown" });

  try {
    const pc = await checkProjectLimitAllowed(telegramId);
    if (!pc.allowed) { await bot.sendMessage(chatId, `⚠️ ${pc.reason}`); return; }

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

    // Try to start the cloned project
    const preferred = assignProjectPort(proj.id);
    const port = await findFreePort(preferred);
    await runTerminalCommand("npm install --legacy-peer-deps 2>&1 || yarn install 2>&1", workDir, 180_000);
    const { pid: p2 } = await spawnProjectApp(workDir, proj.id, port);
    await db.update(projectsTable).set({ port, botPid: p2 ?? null, status: "running" }).where(eq(projectsTable.id, proj.id));
    const live = await pollAppHealth(port, 60_000);
    const liveUrl = `${PLATFORM_URL}/api/preview-proxy/${proj.id}/`;
    await db.update(projectsTable).set({ liveUrl: live ? liveUrl : null, status: live ? "running" : "error" }).where(eq(projectsTable.id, proj.id));

    await bot.deleteMessage(chatId, waitMsg.message_id);
    await bot.sendMessage(chatId,
      `✅ *Repository Cloned — Project #${proj.id}*\n\n📦 ${repoName}\n🔌 Port: ${port}\n${live ? `🌐 Live: ${liveUrl}` : "⚠️ App may need a start script — check your package.json"}`,
      { parse_mode: "Markdown", reply_markup: live ? { inline_keyboard: [[{ text: "🌐 Open App", url: liveUrl }]] } : undefined }
    );
    await incrementAction(telegramId);

  } catch (err) {
    logger.error({ err }, "clone_repo error");
    await bot.deleteMessage(chatId, waitMsg.message_id);
    await bot.sendMessage(chatId, `❌ Clone failed: ${err instanceof Error ? err.message.slice(0, 300) : "unknown error"}`);
  }
}

// ─── General Message Handler ──────────────────────────────────────────────────

async function handleGeneralMessage(msg: TelegramBot.Message): Promise<void> {
  if (!bot || !msg.text) return;
  const text = msg.text.trim();
  const telegramId = msg.from!.id;
  const chatId = msg.chat.id;

  if (!await isSubscribed(telegramId)) { await sendGate(chatId); return; }
  await getOrCreateUser(telegramId, msg.from?.first_name, msg.from?.username);

  // API key scrubbing
  const keyMatch = text.match(/sk-[A-Za-z0-9_-]{20,}/);
  if (keyMatch) {
    await bot.deleteMessage(chatId, msg.message_id);
    const enc = encrypt(keyMatch[0]);
    await db.update(usersTable).set({ apiKey: enc }).where(eq(usersTable.telegramId, telegramId));
    await bot.sendMessage(chatId, "🔐 *API Key secured* — AES-256 encrypted, scrubbed from chat.", { parse_mode: "Markdown" });
    return;
  }

  // ── Discovery state: user is answering a discovery question ──────────────
  const discovery = getDiscovery(telegramId);
  if (discovery) {
    discovery.gathered.push(text);
    discoveryStates.delete(telegramId);

    // Merge all context into one full description
    const fullDescription = [discovery.baseDescription, ...discovery.gathered].join(". ");
    await bot.sendMessage(chatId,
      `Perfect — I've got everything I need! 🔥 Let me map out the full system now...`,
      { parse_mode: "Markdown" }
    );
    await launchPlanningFlow(chatId, telegramId, fullDescription, discovery.tier);
    return;
  }

  // ── Pending confirmation: user is replying YES/NO to a plan ──────────────
  const pending = getPending(telegramId);
  if (pending) {
    if (isConfirmation(text)) {
      pendingBuilds.delete(telegramId);
      const check = await checkActionAllowed(telegramId);
      if (!check.allowed) { await bot.sendMessage(chatId, `⚠️ ${check.reason}`); return; }
      await bot.sendMessage(chatId, "✅ *Building now — hold tight!* 🚀", { parse_mode: "Markdown" });
      runFullBuild(chatId, telegramId, pending.description, pending.plan, pending.tier, pending.isElite).catch(logger.error);
      return;
    }
    if (isChangeRequest(text)) {
      pendingBuilds.delete(telegramId);
      const newDesc = `${pending.description}. Changes requested: ${text}`;
      await bot.sendMessage(chatId, "✏️ *Got it — revising the plan...*", { parse_mode: "Markdown" });
      await launchPlanningFlow(chatId, telegramId, newDesc, pending.tier);
      return;
    }
  }

  // ── GitHub push confirmation ──────────────────────────────────────────────
  const ghPush = gitPendingPush.get(telegramId);
  if (ghPush && isConfirmation(text)) {
    gitPendingPush.delete(telegramId);
    const userRow = await db.select().from(usersTable).where(eq(usersTable.telegramId, telegramId)).limit(1);
    const ghToken = userRow[0]?.githubToken ? decrypt(userRow[0].githubToken) : null;
    if (!ghToken) { await bot.sendMessage(chatId, "❌ No GitHub token linked. Use /link_github first."); return; }
    await typing(chatId);
    const r = await gitPushChanges(ghPush.workDir, ghToken, "WebForge auto-commit");
    await bot.sendMessage(chatId, r.stderr && /error|fatal/i.test(r.stderr)
      ? `❌ Push failed: ${r.stderr.slice(0, 300)}`
      : `✅ *Pushed to GitHub successfully!*\n\n${r.stdout.slice(0, 300)}`,
      { parse_mode: "Markdown" }
    );
    return;
  }

  // ① Image intent — FIRST
  if (isImageIntent(text)) { await handleImageGeneration(msg, text); return; }

  // ② Billing
  if (isBillingIntent(text)) { await handleUpgrade(msg); return; }

  // ③ Build intent
  if (isBuildIntent(text)) { await handleBuildRequest(msg, text); return; }

  // ④ General chat — WebForge identity locked
  const check = await checkActionAllowed(telegramId);
  if (!check.allowed) { await bot.sendMessage(chatId, `⚠️ ${check.reason}\n\nUpgrade via ${PAYMENT_BOT_USERNAME}`); return; }

  await typing(chatId);
  const result = await routeTask(detectTaskType(text), text, check.user!.tier, telegramId, WEBFORGE_SYSTEM_PROMPT);
  await incrementAction(telegramId);
  await bot.sendMessage(chatId, result.content.slice(0, 4096), { parse_mode: "Markdown" });
}

// ─── Bot Init ─────────────────────────────────────────────────────────────────

export function initCoreBot(): void {
  if (!TOKEN) { logger.warn("CORE_BOT_TOKEN not set"); return; }

  bot = new TelegramBot(TOKEN, { polling: true });
  logger.info("Core bot started polling");

  bot.onText(/\/start/, handleStart);
  bot.onText(/\/help/, handleHelp);
  bot.onText(/\/projects/, handleProjects);
  bot.onText(/\/status/, handleStatus);
  bot.onText(/\/upgrade/, handleUpgrade);

  bot.onText(/\/restart(?:\s+(\d+))?/, async (msg, match) => {
    if (!await isSubscribed(msg.from!.id)) { await sendGate(msg.chat.id); return; }
    const id = match?.[1] ? parseInt(match[1]) : null;
    if (!id) { await bot!.sendMessage(msg.chat.id, "Usage: /restart <project_id>"); return; }
    await handleRestart(msg, id);
  });

  bot.onText(/\/health(?:\s+(\d+))?/, async (msg, match) => {
    if (!await isSubscribed(msg.from!.id)) { await sendGate(msg.chat.id); return; }
    const id = match?.[1] ? parseInt(match[1]) : null;
    if (!id) { await bot!.sendMessage(msg.chat.id, "Usage: /health <project_id>"); return; }
    await handleHealth(msg, id);
  });

  bot.onText(/\/link_github(?:\s+(.+))?/, async (msg, match) => {
    const token = match?.[1]?.trim();
    if (!token) {
      await bot!.sendMessage(msg.chat.id,
        `🐙 *Link GitHub Account*\n\nGet a Personal Access Token (classic) with \`repo\` scope from:\nhttps://github.com/settings/tokens\n\nThen send:\n\`/link_github ghp_your_token_here\`\n\n_Your token will be immediately deleted from chat and encrypted._`,
        { parse_mode: "Markdown" }
      );
      return;
    }
    await handleLinkGithub(msg, token);
  });

  bot.onText(/\/logs(?:\s+(\d+))?/, async (msg, match) => {
    if (!await isSubscribed(msg.from!.id)) { await sendGate(msg.chat.id); return; }
    const id = match?.[1] ? parseInt(match[1]) : null;
    if (!id) { await bot!.sendMessage(msg.chat.id, "Usage: /logs <project_id>"); return; }
    await handleLogs(msg, id);
  });

  bot.onText(/\/clone_repo(?:\s+(.+))?/, async (msg, match) => {
    if (!await isSubscribed(msg.from!.id)) { await sendGate(msg.chat.id); return; }
    const url = match?.[1]?.trim();
    if (!url) { await bot!.sendMessage(msg.chat.id, "Usage: /clone_repo https://github.com/user/repo"); return; }
    await handleCloneRepo(msg, url);
  });

  bot.onText(/\/workspace(?:\s+(\d+))?/, async (msg, match) => {
    const id = match?.[1] ? parseInt(match[1]) : null;
    if (!id) { await bot!.sendMessage(msg.chat.id, "Usage: /workspace <project_id>"); return; }
    const rows = await db.select().from(projectsTable).where(eq(projectsTable.id, id)).limit(1);
    const p = rows[0];
    const url = p?.liveUrl ?? `${PLATFORM_URL}/deploying/${id}`;
    await bot!.sendMessage(msg.chat.id,
      `📊 *Project #${id}* — \`${p?.status ?? "unknown"}\`\n\n${url}`,
      { parse_mode: "Markdown", reply_markup: { inline_keyboard: [[{ text: p?.liveUrl ? "🌐 Open App" : "📊 Deploy Page", url }]] } }
    );
  });

  // ── Callbacks ─────────────────────────────────────────────────────────────
  bot.on("callback_query", async (query) => {
    if (!bot || !query.data) return;
    await bot.answerCallbackQuery(query.id);
    const chatId = query.message!.chat.id;
    const telegramId = query.from.id;
    const data = query.data;

    if (data === "check_subscription") {
      const ok = await isSubscribed(telegramId);
      if (ok) {
        await getOrCreateUser(telegramId, query.from.first_name, query.from.username);
        await bot.sendMessage(chatId, "✅ *Verified!* Welcome to WebForge 🔥 Tell me what to build.", { parse_mode: "Markdown" });
      } else {
        await bot.sendMessage(chatId, `❌ Not joined yet — join ${REQUIRED_CHANNEL} first.`,
          { reply_markup: { inline_keyboard: [[
            { text: "📢 Join", url: `https://t.me/${REQUIRED_CHANNEL.replace("@","")}` },
            { text: "✅ I've Joined", callback_data: "check_subscription" },
          ]] } }
        );
      }
      return;
    }

    if (data.startsWith("confirm_")) {
      if (parseInt(data.replace("confirm_","")) !== telegramId) return;
      const p = getPending(telegramId);
      if (!p) { await bot.sendMessage(chatId, "⏰ Plan expired — describe what you want to build again."); return; }
      pendingBuilds.delete(telegramId);
      const check = await checkActionAllowed(telegramId);
      if (!check.allowed) { await bot.sendMessage(chatId, `⚠️ ${check.reason}`); return; }
      await bot.sendMessage(chatId, "🚀 *Building now!*", { parse_mode: "Markdown" });
      runFullBuild(chatId, telegramId, p.description, p.plan, p.tier, p.isElite).catch(logger.error);
      return;
    }

    if (data.startsWith("replan_")) {
      if (parseInt(data.replace("replan_","")) !== telegramId) return;
      pendingBuilds.delete(telegramId);
      await bot.sendMessage(chatId, "✏️ Tell me what to change and I'll revise the plan.");
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
      if (!rows[0]?.workDir) { await bot.sendMessage(chatId, "❌ Project workDir not found."); return; }
      gitPendingPush.set(telegramId, { workDir: rows[0].workDir, projectId: id });
      await bot.sendMessage(chatId,
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
  });

  // ── Messages ──────────────────────────────────────────────────────────────
  bot.on("message", async (msg) => {
    if (!msg.text || msg.text.startsWith("/")) return;
    await handleGeneralMessage(msg).catch(err => logger.error({ err }, "Message handler error"));
  });

  bot.on("polling_error", err => logger.error({ err }, "Core bot polling error"));
}
