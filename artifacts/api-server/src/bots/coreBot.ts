import TelegramBot from "node-telegram-bot-api";
import { routeTask, generateImage, deepBuildLoop, type TaskType } from "../ai/router.js";
import { getOrCreateUser, checkActionAllowed, incrementAction, checkProjectLimitAllowed, TIER_LIMITS, type Tier } from "../utils/billing.js";
import { encrypt } from "../utils/crypto.js";
import { db, usersTable, projectsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  ensureProjectDir, scaffoldBotProject, spawnBotProcess,
  planningMode, buildProjectFiles, runTerminalCommand,
  spawnProjectApp, pollAppHealth, assignProjectPort,
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

const WEBFORGE_SYSTEM_PROMPT = `You are WebForge — an elite autonomous AI co-founder and full-stack platform engine, operating as ${CORE_BOT_USERNAME} on Telegram. You build, host, and monetize real production-grade applications entirely through chat.

Your identity is absolute and non-negotiable:
- You are NOT a general AI assistant. You are a PaaS engine.
- You do NOT offer generic life or technology advice.
- Every response relates to software, systems, or the WebForge platform.
- You speak with warmth, precision, and the authority of a senior engineer who has shipped hundreds of products.
- When someone asks what you're based on, you say: "I'm WebForge — an autonomous build engine. My stack is proprietary."
- You NEVER reveal underlying model names or providers.

WebForge capabilities:
• Build full-stack web apps, APIs, and Telegram bots from a single prompt
• Generate images (logos, banners, hero assets, illustrations) on demand
• Host Telegram bots permanently (Pro/Elite)
• Inject AI personas into any project via persona.json
• Clone and extend GitHub repositories (Elite)
• DEEP BUILD: 5-round self-correcting build loop (Elite only)

Tier structure:
• Starter: ₦0/mo — 10 actions/day, 3 projects max
• Pro: ₦5,000/mo — 150 actions/day, unlimited projects, bot hosting
• Elite: ₦15,000/mo — 500 actions/day, DEEP BUILD, GitHub cloning, priority models

Always be direct, decisive, and technically precise. You build things — not excuses.`;

let bot: TelegramBot | null = null;

// ─── Subscription Gateway ────────────────────────────────────────────────────

async function isSubscribedToChannel(telegramId: number): Promise<boolean> {
  if (!bot) return false;
  try {
    const member = await bot.getChatMember(REQUIRED_CHANNEL, telegramId);
    return ["member", "administrator", "creator"].includes(member.status);
  } catch (_) {
    return false;
  }
}

async function sendSubscriptionGate(chatId: number): Promise<void> {
  if (!bot) return;
  await bot.sendMessage(chatId,
    `🔒 *Access Required*\n\nTo use WebForge, first join our official channel.\n\n📢 ${REQUIRED_CHANNEL}\n\nThen tap *I've Joined* below.`,
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
  return (
    /^(create|generate|make|draw|design|show)\s+(me\s+)?(an?\s+)?(image|photo|picture|illustration|logo|banner|icon|artwork|visual|portrait|landscape|wallpaper)\b/.test(lower) ||
    /\b(image|photo|picture|illustration|logo|banner)\s+of\b/.test(lower) ||
    /^draw\b/.test(lower) ||
    (/\b(create|generate|make|draw|design)\b/.test(lower) && /\b(image|photo|picture|illustration|artwork|visual|wallpaper|portrait)\b/.test(lower))
  );
}

function isBillingIntent(text: string): boolean {
  return /\b(upgrade|pro\s*plan|elite\s*plan|pricing|subscribe|subscription|payment|pay\s+for|how\s+much|plans?|tier|billing|₦|naira)\b/i.test(text);
}

function isBuildIntent(text: string): boolean {
  return /\b(build|create|make|develop|generate|code|write|implement|design|launch|deploy|bot|app|website|api|landing\s*page|clone|scaffold)\b/i.test(text) && text.length > 15;
}

function detectTaskType(text: string): TaskType {
  const lower = text.toLowerCase();
  if (/plan|architect|design system|spec|blueprint/.test(lower)) return "planning";
  if (/build|create|generate|implement|code|develop|write/.test(lower)) return "coding";
  if (/fix|debug|error|bug|issue|repair/.test(lower)) return "fixing";
  if (/ui|interface|frontend|layout|component/.test(lower)) return "ui";
  return "chat";
}

async function sendTyping(chatId: number): Promise<void> {
  try { await bot?.sendChatAction(chatId, "typing"); } catch (_) {}
}

// ─── Image Generation Handler ─────────────────────────────────────────────────

async function handleImageGeneration(msg: TelegramBot.Message, text: string): Promise<void> {
  if (!bot) return;
  const telegramId = msg.from!.id;
  const chatId = msg.chat.id;

  const check = await checkActionAllowed(telegramId);
  if (!check.allowed) {
    await bot.sendMessage(chatId, `⚠️ ${check.reason}\n\nUpgrade via ${PAYMENT_BOT_USERNAME}`);
    return;
  }

  const promptClean = text
    .replace(/^(create|generate|make|draw|design|show)\s+(me\s+)?an?\s+/i, "")
    .replace(/^(image|photo|picture|illustration|logo|banner)\s+of\s+/i, "")
    .trim() || text;

  await sendTyping(chatId);
  const waitMsg = await bot.sendMessage(chatId,
    `🎨 *Generating image...*\n\n_Prompt: ${promptClean.slice(0, 100)}_`,
    { parse_mode: "Markdown" }
  );

  try {
    const imageUrl = await generateImage(promptClean, telegramId);

    if (!imageUrl) {
      await bot.editMessageText("❌ Image generation returned no result. Please try a more descriptive prompt.", {
        chat_id: chatId, message_id: waitMsg.message_id,
      });
      return;
    }

    // Download the image
    const response = await fetch(imageUrl);
    if (!response.ok) throw new Error(`Image download failed: ${response.status}`);
    const buffer = Buffer.from(await response.arrayBuffer());

    // Save to temp file
    const tmpPath = path.join(os.tmpdir(), `wf-img-${Date.now()}.png`);
    await fs.writeFile(tmpPath, buffer);

    await bot.deleteMessage(chatId, waitMsg.message_id);

    await bot.sendPhoto(chatId, tmpPath, {
      caption: `🎨 *Generated by WebForge*\n\n_${promptClean.slice(0, 180)}_`,
      parse_mode: "Markdown",
    });

    await fs.unlink(tmpPath).catch(() => {});
    await incrementAction(telegramId);

  } catch (err) {
    logger.error({ err }, "Image generation error");
    await bot.editMessageText(
      "❌ Image generation failed. The model may be temporarily unavailable — please try again in a moment.",
      { chat_id: chatId, message_id: waitMsg.message_id }
    );
  }
}

// ─── Build Prompt Builder ─────────────────────────────────────────────────────

function buildCodePrompt(description: string, plan: { manifest: Array<{ path: string; description: string }>; techStack: string; summary: string }): string {
  const fileList = plan.manifest.map(f => `- ${f.path}: ${f.description}`).join("\n");
  return `Build a complete, production-ready application based on this request:

"${description}"

Tech stack: ${plan.techStack}

CRITICAL REQUIREMENTS:
1. Use plain JavaScript (NOT TypeScript) for ALL server/backend files
2. The server MUST listen on: const PORT = process.env.PORT || 3000; app.listen(PORT, ...)
3. package.json MUST have: "scripts": { "start": "node src/index.js" } (or equivalent .js entry)
4. All require() or import paths must use existing packages only
5. Include proper error handling and graceful shutdown

Output ALL of the following files using this EXACT format — no exceptions:

=== FILE: <relative/path/to/file> ===
<complete file content — NO truncation, NO ellipsis>
=== END FILE ===

Files to generate:
${fileList}

Every file must be COMPLETE and RUNNABLE. The app should start successfully with: npm start`;
}

// ─── Full Build Pipeline ──────────────────────────────────────────────────────

async function runFullBuild(
  chatId: number,
  telegramId: number,
  projectId: number,
  workDir: string,
  description: string,
  tier: Tier,
  isElite: boolean,
): Promise<void> {
  if (!bot) return;
  const pid = String(projectId);
  const deployingUrl = `${PLATFORM_URL}/deploying/${projectId}`;

  await bot.sendMessage(chatId,
    `🚀 *Build Started — Project #${projectId}*\n\nWatch your app being built live:\n${deployingUrl}`,
    {
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: [[{ text: "📊 Watch Live Build", url: deployingUrl }]] },
    }
  );

  try {
    // ── Phase 1: Planning ──────────────────────────────────────────────────
    broadcastProgress(pid, 5, "Running planning mode...", 0, 0);

    const routeTaskBound = (taskType: "planning", prompt: string, t: string, tid?: number, sys?: string) =>
      routeTask(taskType, prompt, t, tid, sys ?? WEBFORGE_SYSTEM_PROMPT);

    const plan = await planningMode(description, routeTaskBound, telegramId, tier);

    await db.update(projectsTable).set({
      buildManifest: plan.manifest as unknown as Record<string, unknown>[],
      filesTotal: plan.manifest.length,
      techStack: plan.techStack,
      status: "building",
    }).where(eq(projectsTable.id, projectId));

    broadcastProgress(pid, 18, `Plan ready — ${plan.manifest.length} files mapped`, 0, plan.manifest.length);
    broadcastToProject(pid, { type: "round", round: "Plan", maxRounds: isElite ? 5 : 1, message: plan.summary });

    await bot.sendMessage(chatId,
      `📋 *Plan Ready*\n\n${plan.summary}\n*Stack:* ${plan.techStack}\n*Files:* ${plan.manifest.length}\n\n${isElite ? "🔥 *DEEP BUILD* — up to 5 self-correction rounds" : "Starting code generation..."}`,
      { parse_mode: "Markdown" }
    );

    // ── Phase 2: Code generation ───────────────────────────────────────────
    let finalCode = "";

    if (isElite) {
      broadcastProgress(pid, 22, "DeepBuild round 1 — generating code...", 0, plan.manifest.length);

      const deepResult = await deepBuildLoop(
        buildCodePrompt(description, plan),
        telegramId,
        WEBFORGE_SYSTEM_PROMPT,
        5,
        (round, maxRounds, issues) => {
          const pct = 22 + (round / maxRounds) * 36;
          broadcastProgress(pid, pct, `DeepBuild round ${round} of ${maxRounds}...`, 0, plan.manifest.length);
          broadcastToProject(pid, { type: "round", round, maxRounds, message: issues.length ? `${issues.length} issue(s) found, correcting...` : "Clean pass" });
          bot?.sendMessage(chatId,
            `🔄 *DeepBuild — Round ${round}/${maxRounds}*\n${issues.length ? `Found ${issues.length} issue(s), self-correcting...` : "Clean pass ✓"}`,
            { parse_mode: "Markdown" }
          ).catch(() => {});
        },
      );

      finalCode = deepResult.finalCode;
      broadcastProgress(pid, 62, `Code done in ${deepResult.rounds} round(s)`, 0, plan.manifest.length);

      await bot.sendMessage(chatId,
        `✅ *DeepBuild Complete*\n*Rounds:* ${deepResult.rounds}\n*Model:* \`${deepResult.model}\`\n*Cost:* $${deepResult.totalCostUsd.toFixed(4)}\n\nWriting ${plan.manifest.length} files...`,
        { parse_mode: "Markdown" }
      );
    } else {
      broadcastProgress(pid, 22, "Generating code...", 0, plan.manifest.length);
      const result = await routeTask("coding", buildCodePrompt(description, plan), tier, telegramId, WEBFORGE_SYSTEM_PROMPT);
      finalCode = result.content;
      broadcastProgress(pid, 62, "Code generation complete", 0, plan.manifest.length);
    }

    // ── Phase 3: Write files ───────────────────────────────────────────────
    broadcastProgress(pid, 65, "Writing files to disk...", 0, plan.manifest.length);

    const written = await buildProjectFiles(
      workDir, finalCode, pid, plan.manifest,
      (filesWritten, filePath) => {
        const pct = 65 + (filesWritten / Math.max(plan.manifest.length, 1)) * 14;
        broadcastProgress(pid, pct, `Writing: ${filePath}`, filesWritten, plan.manifest.length);
      },
    );

    // ── Phase 4: npm install ───────────────────────────────────────────────
    broadcastProgress(pid, 80, "Installing dependencies...", written, plan.manifest.length);
    broadcastStatus(pid, "Running npm install...");

    await runTerminalCommand(
      "npm install --legacy-peer-deps --prefer-offline 2>&1 || npm install --legacy-peer-deps 2>&1",
      workDir,
      180_000,
    );

    await incrementAction(telegramId);

    // ── Phase 5: Start the app ─────────────────────────────────────────────
    const port = assignProjectPort(projectId);
    broadcastProgress(pid, 88, `Starting app on port ${port}...`, written, plan.manifest.length);
    broadcastStatus(pid, `Binding server to port ${port}...`);

    const { pid: processPid } = await spawnProjectApp(workDir, projectId, port);

    await db.update(projectsTable).set({ port, botPid: processPid ?? null }).where(eq(projectsTable.id, projectId));

    // ── Phase 6: Health poll ───────────────────────────────────────────────
    broadcastProgress(pid, 92, "Waiting for app to accept connections...", written, plan.manifest.length);
    broadcastStatus(pid, "Health checking...");

    await bot.sendMessage(chatId,
      `⏳ *App starting...*\n\nPolling port ${port} — this takes 15-30 seconds for npm apps.`,
      { parse_mode: "Markdown" }
    );

    const isLive = await pollAppHealth(port, 120_000, 2500);

    const liveUrl = `${PLATFORM_URL}/api/preview-proxy/${projectId}/`;

    await db.update(projectsTable).set({
      status: isLive ? "running" : "error",
      liveUrl: isLive ? liveUrl : null,
    }).where(eq(projectsTable.id, projectId));

    broadcastProgress(pid, 100, isLive ? "App is live!" : "Build complete (app may need a moment)", written, plan.manifest.length);
    broadcastRedirect(pid, liveUrl);

    if (isLive) {
      await bot.sendMessage(chatId,
        `🎉 *App is LIVE — Project #${projectId}*\n\n${written} files written\nPort: ${port}\n\n🌐 *Your app:*\n${liveUrl}`,
        {
          parse_mode: "Markdown",
          reply_markup: { inline_keyboard: [[{ text: "🌐 Open Live App", url: liveUrl }]] },
        }
      );
    } else {
      await bot.sendMessage(chatId,
        `⚠️ *Build Complete — App still warming up*\n\n${written} files deployed. The app process is running but hasn't started accepting HTTP requests yet.\n\n🌐 *Your URL (try in 30s):*\n${liveUrl}\n\nThe proxy page will auto-refresh and redirect when ready.`,
        {
          parse_mode: "Markdown",
          reply_markup: { inline_keyboard: [[{ text: "🌐 Open App URL", url: liveUrl }]] },
        }
      );
    }

  } catch (err) {
    logger.error({ err, projectId }, "Build pipeline error");
    await db.update(projectsTable).set({ status: "error" }).where(eq(projectsTable.id, projectId));
    broadcastStatus(pid, "Build failed — see logs");
    await bot.sendMessage(chatId,
      `❌ *Build Failed — Project #${projectId}*\n\nAn error occurred during generation. Please try again with a more specific description.\n\nError: ${err instanceof Error ? err.message.slice(0, 200) : "Unknown error"}`,
      { parse_mode: "Markdown" }
    );
  }
}

// ─── Build Request Handler ────────────────────────────────────────────────────

async function handleBuildRequest(msg: TelegramBot.Message, text: string): Promise<void> {
  if (!bot) return;
  const telegramId = msg.from!.id;

  const check = await checkActionAllowed(telegramId);
  if (!check.allowed) {
    await bot.sendMessage(msg.chat.id, `⚠️ ${check.reason}\n\nUpgrade via ${PAYMENT_BOT_USERNAME}`);
    return;
  }

  const user = check.user!;
  const tier = user.tier as Tier;

  // Bot token detection → Bot-as-a-Service
  const botTokenMatch = text.match(/(\d{9,11}:[A-Za-z0-9_-]{35,})/);
  if (botTokenMatch) {
    const botToken = botTokenMatch[1];
    if (!TIER_LIMITS[tier].botHosting) {
      await bot.sendMessage(msg.chat.id,
        `🤖 *Bot Hosting is a PRO feature*\n\nUpgrade to *Pro* (₦5,000/mo) via ${PAYMENT_BOT_USERNAME}.`,
        { parse_mode: "Markdown" }
      );
      return;
    }

    const projectCheck = await checkProjectLimitAllowed(telegramId);
    if (!projectCheck.allowed) {
      await bot.sendMessage(msg.chat.id, `⚠️ ${projectCheck.reason}\n\nUpgrade via ${PAYMENT_BOT_USERNAME}`);
      return;
    }

    await sendTyping(msg.chat.id);
    const waitMsg = await bot.sendMessage(msg.chat.id, "🤖 Scaffolding and deploying your bot...");

    const [project] = await db.insert(projectsTable).values({
      userId: telegramId, name: `Bot-${Date.now()}`,
      description: text, status: "building",
      techStack: "node-telegram-bot-api", botToken,
    }).returning();

    const workDir = await ensureProjectDir(project.id, telegramId);
    await scaffoldBotProject(workDir, botToken, text, "Respond helpfully to all messages.");
    const { pid: processPid } = spawnBotProcess(workDir, "index.mjs", { BOT_TOKEN: botToken });

    await db.update(projectsTable).set({
      status: "running", workDir, botPid: processPid, isHosted: true,
    }).where(eq(projectsTable.id, project.id));

    const url = `${PLATFORM_URL}/deploying/${project.id}`;
    await bot.deleteMessage(msg.chat.id, waitMsg.message_id);
    await bot.sendMessage(msg.chat.id,
      `🎉 *Bot Deployed!*\n\nYour bot is live and polling.\n📁 Project: \`${project.id}\`\n📌 PID: \`${processPid}\`\n\n${url}`,
      { parse_mode: "Markdown", reply_markup: { inline_keyboard: [[{ text: "📊 View Project", url }]] } }
    );
    return;
  }

  const projectCheck = await checkProjectLimitAllowed(telegramId);
  if (!projectCheck.allowed) {
    await bot.sendMessage(msg.chat.id, `⚠️ ${projectCheck.reason}\n\nUpgrade via ${PAYMENT_BOT_USERNAME}`);
    return;
  }

  await sendTyping(msg.chat.id);
  const thinkMsg = await bot.sendMessage(msg.chat.id, "🧠 Analyzing your request...");

  const planPrompt = `A WebForge user wants to build: "${text}"\n\nGive a concise build plan: tech stack, 3-5 core features, architecture overview, complexity estimate. Max 250 words. Be specific and encouraging.`;
  const planResult = await routeTask("planning", planPrompt, tier, telegramId, WEBFORGE_SYSTEM_PROMPT);

  const [project] = await db.insert(projectsTable).values({
    userId: telegramId, name: text.slice(0, 60),
    description: text, status: "planned", techStack: "fullstack",
  }).returning();

  const workDir = await ensureProjectDir(project.id, telegramId);
  await db.update(projectsTable).set({ status: "idle", workDir }).where(eq(projectsTable.id, project.id));

  await bot.deleteMessage(msg.chat.id, thinkMsg.message_id);

  const deployingUrl = `${PLATFORM_URL}/deploying/${project.id}`;
  await bot.sendMessage(msg.chat.id,
    `📋 *Build Plan — Project #${project.id}*\n\n${planResult.content}\n\n_Model: ${planResult.model}_`,
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "📊 Watch Live Deploy", url: deployingUrl }],
          [{ text: "🚀 Start Building Now", callback_data: `build_${project.id}` }],
        ],
      },
    }
  );
}

// ─── Command Handlers ─────────────────────────────────────────────────────────

async function handleStart(msg: TelegramBot.Message): Promise<void> {
  if (!bot) return;
  const subscribed = await isSubscribedToChannel(msg.from!.id);
  if (!subscribed) { await sendSubscriptionGate(msg.chat.id); return; }

  const user = await getOrCreateUser(msg.from!.id, msg.from?.first_name, msg.from?.username);
  const tier = user.tier as Tier;
  const remaining = TIER_LIMITS[tier].dailyActions - user.dailyActionsCounter;

  await bot.sendMessage(msg.chat.id,
    `⚡ *Welcome to WebForge*\n\nI'm your autonomous full-stack co-founder. Describe what you want to build and I'll architect, code, and deploy it entirely through this chat.\n\n*Plan:* ${tier.toUpperCase()} | *Actions left:* ${remaining}/${TIER_LIMITS[tier].dailyActions}\n\n*What I build:*\n• Full-stack web apps (live URL delivered)\n• Images, logos, banners (sent directly to chat)\n• Telegram bots (hosted permanently on Pro/Elite)\n• REST APIs and microservices\n\nType \`/help\` for commands or just tell me what to build.`,
    { parse_mode: "Markdown" }
  );
}

async function handleHelp(msg: TelegramBot.Message): Promise<void> {
  if (!bot) return;
  const subscribed = await isSubscribedToChannel(msg.from!.id);
  if (!subscribed) { await sendSubscriptionGate(msg.chat.id); return; }

  await bot.sendMessage(msg.chat.id,
    `🛠 *WebForge Commands*\n\n\`/start\` — Welcome & status\n\`/projects\` — List projects\n\`/workspace <id>\` — View project\n\`/upgrade\` — Plans & pricing\n\`/status\` — Account details\n\n*Image generation:* Say "create an image of..." or "generate a photo of..." — I'll send it directly here.\n\n*App building:* Describe what to build — I'll deploy it and send you a live URL.\n\n*Bot hosting:* Send a bot token in your message to deploy it permanently (Pro/Elite).`,
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
      "📂 *No projects yet*\n\nTell me what to build:\n_\"Build me a task manager\"_\n_\"Create a restaurant landing page\"_",
      { parse_mode: "Markdown" }
    );
    return;
  }

  const list = projects.map(p => {
    const icon = p.status === "running" ? "🟢" : p.status === "building" ? "🟡" : p.status === "error" ? "🔴" : "⚪";
    const urlLine = p.liveUrl ? `\n   🌐 [Live App](${p.liveUrl})` : `\n   📊 [Deploy Page](${PLATFORM_URL}/deploying/${p.id})`;
    return `${icon} *${p.name}* — \`${p.status}\`${urlLine}`;
  }).join("\n\n");

  await bot.sendMessage(msg.chat.id, `📁 *Your Projects*\n\n${list}`, { parse_mode: "Markdown" });
}

async function handleUpgrade(msg: TelegramBot.Message): Promise<void> {
  if (!bot) return;
  await bot.sendMessage(msg.chat.id,
    `💳 *Upgrade WebForge Plan*\n\nHead to the payment bot:\n\n👉 ${PAYMENT_BOT_USERNAME}\n\nType \`/upgrade\` there to see NGN plans:\n• *Pro* — ₦5,000/mo\n• *Elite* — ₦15,000/mo`,
    {
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: [[{ text: "💳 Open Payment Bot", url: `https://t.me/${PAYMENT_BOT_USERNAME.replace("@", "")}` }]] },
    }
  );
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
    `📊 *Account Status*\n\n👤 *User:* ${user.firstName ?? "Anonymous"}\n🏷 *Plan:* ${tier.toUpperCase()}\n⚡ *Actions today:* ${user.dailyActionsCounter}/${limits.dailyActions} (${remaining} left)\n📁 *Projects:* ${projects.length}${limits.maxProjects !== Infinity ? `/${limits.maxProjects}` : " (unlimited)"}\n\n${limits.botHosting ? "✅" : "❌"} Bot hosting | ${limits.deepBuild ? "✅" : "❌"} DEEP BUILD | ${limits.gitClone ? "✅" : "❌"} GitHub clone\n\nUpgrade via ${PAYMENT_BOT_USERNAME}`,
    { parse_mode: "Markdown" }
  );
}

// ─── General Message Handler ──────────────────────────────────────────────────

async function handleGeneralMessage(msg: TelegramBot.Message): Promise<void> {
  if (!bot || !msg.text) return;
  const text = msg.text;
  const telegramId = msg.from!.id;

  const subscribed = await isSubscribedToChannel(telegramId);
  if (!subscribed) { await sendSubscriptionGate(msg.chat.id); return; }

  await getOrCreateUser(telegramId, msg.from?.first_name, msg.from?.username);

  // API key injection
  const keyMatch = text.match(/sk-[A-Za-z0-9_-]{20,}|devx-[A-Za-z0-9]{20,}/);
  if (keyMatch) {
    await bot.deleteMessage(msg.chat.id, msg.message_id);
    const encrypted = encrypt(keyMatch[0]);
    await db.update(usersTable).set({ apiKey: encrypted }).where(eq(usersTable.telegramId, telegramId));
    await bot.sendMessage(msg.chat.id, "🔐 *API Key Secured* — encrypted with AES-256 and scrubbed from chat.", { parse_mode: "Markdown" });
    return;
  }

  // ① Image intent — MUST come before build intent check
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

  // ④ General chat — pass through with pinned WebForge identity
  const check = await checkActionAllowed(telegramId);
  if (!check.allowed) {
    await bot.sendMessage(msg.chat.id, `⚠️ ${check.reason}\n\nUpgrade via ${PAYMENT_BOT_USERNAME}`);
    return;
  }

  await sendTyping(msg.chat.id);
  const taskType = detectTaskType(text);
  const result = await routeTask(taskType, text, check.user!.tier, telegramId, WEBFORGE_SYSTEM_PROMPT);
  await incrementAction(telegramId);
  await bot.sendMessage(msg.chat.id, result.content, { parse_mode: "Markdown" });
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
  bot.onText(/\/newproject (.+)/, async (msg, match) => {
    if (!match?.[1]) return;
    const subscribed = await isSubscribedToChannel(msg.from!.id);
    if (!subscribed) { await sendSubscriptionGate(msg.chat.id); return; }
    await handleBuildRequest(msg, match[1]);
  });
  bot.onText(/\/workspace (\d+)/, async (msg, match) => {
    if (!bot || !match?.[1]) return;
    const subscribed = await isSubscribedToChannel(msg.from!.id);
    if (!subscribed) { await sendSubscriptionGate(msg.chat.id); return; }
    const projectId = parseInt(match[1]);
    const rows = await db.select().from(projectsTable).where(eq(projectsTable.id, projectId)).limit(1);
    const p = rows[0];
    const url = p?.liveUrl ?? `${PLATFORM_URL}/deploying/${projectId}`;
    await bot.sendMessage(msg.chat.id,
      `📊 *Project #${projectId}* — \`${p?.status ?? "unknown"}\`\n\n${p?.liveUrl ? `🌐 Live: ${p.liveUrl}` : `📊 ${url}`}`,
      { parse_mode: "Markdown", reply_markup: { inline_keyboard: [[{ text: p?.liveUrl ? "🌐 Open App" : "📊 Deploy Page", url }]] } }
    );
  });

  bot.on("callback_query", async (query) => {
    if (!bot || !query.data) return;
    await bot.answerCallbackQuery(query.id);
    const chatId = query.message!.chat.id;
    const telegramId = query.from.id;
    const data = query.data;

    if (data === "check_subscription") {
      const subscribed = await isSubscribedToChannel(telegramId);
      if (subscribed) {
        await bot.sendMessage(chatId, "✅ *Verified!* Welcome to WebForge. Tell me what to build.", { parse_mode: "Markdown" });
      } else {
        await bot.sendMessage(chatId,
          `❌ Not joined yet. Join ${REQUIRED_CHANNEL} first.`,
          { reply_markup: { inline_keyboard: [[{ text: "📢 Join Channel", url: `https://t.me/${REQUIRED_CHANNEL.replace("@", "")}` }, { text: "✅ I've Joined", callback_data: "check_subscription" }]] } }
        );
      }
      return;
    }

    if (data.startsWith("build_")) {
      const projectId = parseInt(data.replace("build_", ""));

      const subscribed = await isSubscribedToChannel(telegramId);
      if (!subscribed) { await sendSubscriptionGate(chatId); return; }

      const check = await checkActionAllowed(telegramId);
      if (!check.allowed) {
        await bot.sendMessage(chatId, `⚠️ ${check.reason}\n\nUpgrade via ${PAYMENT_BOT_USERNAME}`);
        return;
      }

      const rows = await db.select().from(projectsTable).where(eq(projectsTable.id, projectId)).limit(1);
      const project = rows[0];
      if (!project?.workDir) {
        await bot.sendMessage(chatId, "❌ Project not found or not initialized.");
        return;
      }

      const tier = (check.user!.tier as Tier);
      const isElite = tier === "elite";

      runFullBuild(chatId, telegramId, projectId, project.workDir, project.description ?? project.name, tier, isElite)
        .catch(err => logger.error({ err, projectId }, "runFullBuild unhandled"));
    }
  });

  bot.on("message", async (msg) => {
    if (!msg.text || msg.text.startsWith("/")) return;
    await handleGeneralMessage(msg).catch(err => logger.error({ err }, "Message handler error"));
  });

  bot.on("polling_error", (err) => logger.error({ err }, "Core bot polling error"));
}

