import TelegramBot from "node-telegram-bot-api";
import { routeTask, deepBuildLoop, type TaskType } from "../ai/router.js";
import { getOrCreateUser, checkActionAllowed, incrementAction, checkProjectLimitAllowed, TIER_LIMITS, type Tier } from "../utils/billing.js";
import { encrypt } from "../utils/crypto.js";
import { db, usersTable, projectsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  ensureProjectDir, scaffoldBotProject, spawnBotProcess,
  planningMode, buildProjectFiles,
  runTerminalCommand,
} from "../engines/orchestrator.js";
import {
  broadcastProgress, broadcastRedirect, broadcastStatus, broadcastToProject,
} from "../routes/stream.js";
import { logger } from "../lib/logger.js";

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
• Stream live code to the workspace editor via SSE
• Generate and edit images (logos, banners, hero assets)
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
  await bot.sendMessage(
    chatId,
    `🔒 *Access Required*\n\nTo use WebForge, you must first join our official channel.\n\nJoin here: ${REQUIRED_CHANNEL}\nThen come back and tap *Start* or send any message.\n\nThis gives you access to build plans, deployments, and all WebForge capabilities.`,
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function detectTaskType(text: string): TaskType {
  const lower = text.toLowerCase();
  if (/plan|architect|design system|spec|blueprint/.test(lower)) return "planning";
  if (/build|create|generate|implement|code|develop|write/.test(lower)) return "coding";
  if (/fix|debug|error|bug|issue|repair/.test(lower)) return "fixing";
  if (/image|logo|icon|banner|art|visual/.test(lower)) return "image";
  if (/ui|interface|frontend|layout|component/.test(lower)) return "ui";
  return "chat";
}

async function sendTyping(chatId: number): Promise<void> {
  try { await bot?.sendChatAction(chatId, "typing"); } catch (_) {}
}

function isBillingIntent(text: string): boolean {
  return /\b(upgrade|pro\s*plan|elite\s*plan|pricing|subscribe|subscription|payment|pay\s+for|how\s+much|plans?|tier|billing|₦|naira)\b/i.test(text);
}

async function handleBillingRedirect(chatId: number): Promise<void> {
  if (!bot) return;
  await bot.sendMessage(
    chatId,
    `💳 *Ready to upgrade?*\n\nHead over to my payment partner to process your upgrade natively:\n\n👉 ${PAYMENT_BOT_USERNAME}\n\nType \`/upgrade\` over there to see our NGN plans:\n• *Pro* — ₦5,000/mo (150 actions, bot hosting)\n• *Elite* — ₦15,000/mo (500 actions, DEEP BUILD, GitHub clone)\n\nOnce payment is confirmed, your tier is activated instantly here.`,
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [[
          { text: "💳 Open Payment Bot", url: `https://t.me/${PAYMENT_BOT_USERNAME.replace("@", "")}` },
        ]],
      },
    }
  );
}

async function handleApiKeyInjection(msg: TelegramBot.Message): Promise<boolean> {
  if (!bot || !msg.text) return false;
  const keyMatch = msg.text.match(/sk-[A-Za-z0-9_-]{20,}|devx-[A-Za-z0-9]{20,}/);
  if (!keyMatch) return false;

  const telegramId = msg.from!.id;
  await bot.deleteMessage(msg.chat.id, msg.message_id);

  const encrypted = encrypt(keyMatch[0]);
  await db.update(usersTable).set({ apiKey: encrypted }).where(eq(usersTable.telegramId, telegramId));

  await bot.sendMessage(msg.chat.id,
    "🔐 *API Key Secured*\n\nYour key has been encrypted with AES-256 and stored. The original message was scrubbed from chat for your security.",
    { parse_mode: "Markdown" }
  );
  return true;
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
    `⚡ *Welcome to WebForge*\n\nI'm your autonomous full-stack co-founder. Describe what you want to build and I'll architect, code, and deploy it — entirely through this chat.\n\n*Your plan:* ${tier.toUpperCase()}\n*Actions remaining today:* ${remaining}/${TIER_LIMITS[tier].dailyActions}\n\n*What I can build for you:*\n• Full-stack web apps\n• Telegram bots (hosted permanently)\n• Landing pages with AI chat widgets\n• REST APIs and microservices\n• Image generation pipelines\n\nType \`/help\` to see all commands, or just tell me what you need built.`,
    { parse_mode: "Markdown" }
  );
}

async function handleHelp(msg: TelegramBot.Message): Promise<void> {
  if (!bot) return;
  const subscribed = await isSubscribedToChannel(msg.from!.id);
  if (!subscribed) { await sendSubscriptionGate(msg.chat.id); return; }

  await bot.sendMessage(msg.chat.id,
    `🛠 *WebForge Commands*\n\n\`/start\` — Welcome & your status\n\`/projects\` — List your projects\n\`/workspace <id>\` — View project status\n\`/upgrade\` — View plans & upgrade\n\`/status\` — Account details\n\`/help\` — This menu\n\n*Building:* Just describe what you want in plain English. I handle the rest.\n\n*Bot-as-a-Service:* Include a Telegram bot token in your message and I'll deploy it permanently (Pro/Elite only).\n\n*Elite users get DEEP BUILD:* Up to 5 rounds of self-correcting code generation with live progress tracking.`,
    { parse_mode: "Markdown" }
  );
}

async function handleProjects(msg: TelegramBot.Message): Promise<void> {
  if (!bot) return;
  const subscribed = await isSubscribedToChannel(msg.from!.id);
  if (!subscribed) { await sendSubscriptionGate(msg.chat.id); return; }

  const telegramId = msg.from!.id;
  const projects = await db.select().from(projectsTable).where(eq(projectsTable.userId, telegramId));

  if (projects.length === 0) {
    await bot.sendMessage(msg.chat.id,
      "📂 *No projects yet*\n\nTell me what to build, for example:\n_\"Build me a task manager app\"_\n_\"Create a restaurant landing page\"_\n_\"I need a Telegram quiz bot\"_",
      { parse_mode: "Markdown" }
    );
    return;
  }

  const list = projects.map(p => {
    const icon = p.status === "running" ? "🟢" : p.status === "building" ? "🟡" : "⚪";
    const url = p.liveUrl ? `\n   [Live App](${p.liveUrl})` : `\n   [Watch Deploy](${PLATFORM_URL}/deploying/${p.id})`;
    return `${icon} *${p.name}* — \`${p.status}\`${url}`;
  }).join("\n\n");

  await bot.sendMessage(msg.chat.id, `📁 *Your Projects*\n\n${list}`, { parse_mode: "Markdown" });
}

async function handleUpgrade(msg: TelegramBot.Message): Promise<void> {
  await handleBillingRedirect(msg.chat.id);
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
    `📊 *Account Status*\n\n👤 *User:* ${user.firstName ?? "Anonymous"}\n🏷 *Plan:* ${tier.toUpperCase()}\n⚡ *Actions today:* ${user.dailyActionsCounter}/${limits.dailyActions} (${remaining} remaining)\n📁 *Projects:* ${projects.length}${limits.maxProjects !== Infinity ? `/${limits.maxProjects}` : " (unlimited)"}\n\n*Feature access:*\n${limits.botHosting ? "✅" : "❌"} Bot-as-a-Service hosting\n${limits.customKeys ? "✅" : "❌"} Custom API keys\n${limits.gitClone ? "✅" : "❌"} GitHub repo cloning\n${limits.deepBuild ? "✅" : "❌"} DEEP BUILD (5-round auto-correction)\n\nUpgrade via ${PAYMENT_BOT_USERNAME}`,
    { parse_mode: "Markdown" }
  );
}

// ─── Build Orchestration ──────────────────────────────────────────────────────

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
    // Phase 1: Planning
    broadcastProgress(pid, 5, "Planning your project...", 0, 0);
    broadcastStatus(pid, "Running Ruflo planning mode...");

    const routeTaskBound = (
      taskType: "planning",
      prompt: string,
      t: string,
      tid?: number,
      sys?: string,
    ) => routeTask(taskType, prompt, t, tid, sys ?? WEBFORGE_SYSTEM_PROMPT);

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
      `📋 *Build Plan Ready*\n\n${plan.summary}\n\n*Stack:* ${plan.techStack}\n*Files:* ${plan.manifest.length} files mapped\n\n${isElite ? "🔥 *DEEP BUILD active* — up to 5 self-correction rounds" : "Starting code generation..."}`,
      { parse_mode: "Markdown" }
    );

    // Phase 2: Code generation
    let finalCode = "";

    if (isElite) {
      broadcastProgress(pid, 22, "DeepBuild round 1 — generating code...", 0, plan.manifest.length);

      const codePrompt = buildCodePrompt(description, plan);
      const deepResult = await deepBuildLoop(
        codePrompt,
        telegramId,
        WEBFORGE_SYSTEM_PROMPT,
        5,
        (round, maxRounds, issues) => {
          const pct = 22 + (round / maxRounds) * 38;
          broadcastProgress(pid, pct, `DeepBuild round ${round} of ${maxRounds}...`, 0, plan.manifest.length);
          broadcastToProject(pid, { type: "round", round, maxRounds, message: issues.length ? `${issues.length} issue(s) found, correcting...` : "Clean pass" });
          bot?.sendMessage(chatId,
            `🔄 *DeepBuild — Round ${round}/${maxRounds}*\n\n${issues.length ? `Found ${issues.length} issue(s), running self-correction...` : "Clean pass — verifying..."}`,
            { parse_mode: "Markdown" }
          ).catch(() => {});
        },
      );

      finalCode = deepResult.finalCode;
      broadcastProgress(pid, 65, `Code generation complete in ${deepResult.rounds} round(s)`, 0, plan.manifest.length);

      await bot.sendMessage(chatId,
        `✅ *DeepBuild Complete*\n\nFinished in *${deepResult.rounds} round(s)*\nModel: \`${deepResult.model}\`\nCost: $${deepResult.totalCostUsd.toFixed(4)}\n\nWriting ${plan.manifest.length} files to disk...`,
        { parse_mode: "Markdown" }
      );
    } else {
      broadcastProgress(pid, 22, "Generating code...", 0, plan.manifest.length);
      const codePrompt = buildCodePrompt(description, plan);
      const result = await routeTask("coding", codePrompt, tier, telegramId, WEBFORGE_SYSTEM_PROMPT);
      finalCode = result.content;
      broadcastProgress(pid, 65, "Code generation complete", 0, plan.manifest.length);
    }

    // Phase 3: Write files
    broadcastProgress(pid, 68, "Writing files to disk...", 0, plan.manifest.length);

    const written = await buildProjectFiles(
      workDir,
      finalCode,
      pid,
      plan.manifest,
      (filesWritten, filePath) => {
        const pct = 68 + (filesWritten / Math.max(plan.manifest.length, 1)) * 18;
        broadcastProgress(pid, pct, `Writing: ${filePath}`, filesWritten, plan.manifest.length);
      },
    );

    broadcastProgress(pid, 87, `${written} files written — installing dependencies...`, written, plan.manifest.length);
    broadcastStatus(pid, "Running npm install...");

    // Phase 4: Install deps
    await runTerminalCommand("npm install --legacy-peer-deps --silent 2>/dev/null || true", workDir);
    broadcastProgress(pid, 95, "Dependencies installed — starting server...", written, plan.manifest.length);

    await incrementAction(telegramId);

    // Phase 5: Finalise
    const liveUrl = `${PLATFORM_URL}/api/preview-proxy/${projectId}/`;
    await db.update(projectsTable).set({
      status: "running",
      liveUrl,
    }).where(eq(projectsTable.id, projectId));

    broadcastProgress(pid, 100, "Build complete!", written, plan.manifest.length);
    broadcastRedirect(pid, liveUrl);

    await bot.sendMessage(chatId,
      `🎉 *Build Complete — Project #${projectId}*\n\n*${written} files written*\n\n🌐 *Your live app:*\n${liveUrl}\n\nThe deployment page will redirect there automatically.`,
      {
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: [[{ text: "🌐 Open Live App", url: liveUrl }]] },
      }
    );

  } catch (err) {
    logger.error({ err, projectId }, "Build pipeline error");
    await db.update(projectsTable).set({ status: "error" }).where(eq(projectsTable.id, projectId));
    broadcastStatus(pid, "Build failed — check logs");
    await bot.sendMessage(chatId,
      `❌ *Build Failed*\n\nProject #${projectId} encountered an error during generation. This can happen with very complex prompts.\n\nTry again with a more specific description, or contact support.`,
      { parse_mode: "Markdown" }
    );
  }
}

function buildCodePrompt(description: string, plan: { manifest: Array<{ path: string; description: string }>; techStack: string; summary: string }): string {
  const fileList = plan.manifest.map(f => `- ${f.path}: ${f.description}`).join("\n");
  return `Build a complete, production-ready application based on this request:

"${description}"

Tech stack: ${plan.techStack}

Output ALL of the following files. Use this exact format for each file:

=== FILE: <path> ===
<complete file content>
=== END FILE ===

Files to generate:
${fileList}

Rules:
- Every file must be complete — no truncation, no "..." placeholders
- Include proper error handling in all server code
- All imports must reference real packages appropriate to the tech stack
- Include a working package.json with all required dependencies
- The app must start with: node src/index.js (or equivalent entry point)`;
}

// ─── Build Request Handler ────────────────────────────────────────────────────

async function handleBuildRequest(msg: TelegramBot.Message, text: string): Promise<void> {
  if (!bot) return;
  const telegramId = msg.from!.id;

  const check = await checkActionAllowed(telegramId);
  if (!check.allowed) {
    await bot.sendMessage(msg.chat.id,
      `⚠️ ${check.reason}\n\nUpgrade your plan via ${PAYMENT_BOT_USERNAME} to unlock more capacity.`
    );
    return;
  }

  const user = check.user!;
  const tier = user.tier as Tier;

  const botTokenMatch = text.match(/(\d{9,11}:[A-Za-z0-9_-]{35,})/);
  if (botTokenMatch) {
    const botToken = botTokenMatch[1];
    if (!TIER_LIMITS[tier].botHosting) {
      await bot.sendMessage(msg.chat.id,
        `🤖 *Bot Hosting is a PRO feature*\n\nUpgrade to *Pro* (₦5,000/mo) to host your custom Telegram bots permanently.\n\nVisit ${PAYMENT_BOT_USERNAME} and type \`/upgrade\` to get started.`,
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
      userId: telegramId,
      name: `Bot-${Date.now()}`,
      description: text,
      status: "building",
      techStack: "node-telegram-bot-api",
      botToken,
    }).returning();

    const workDir = await ensureProjectDir(project.id, telegramId);
    await scaffoldBotProject(workDir, botToken, text, "Respond helpfully to all messages.");
    const { pid } = spawnBotProcess(workDir, "index.mjs", { BOT_TOKEN: botToken });

    await db.update(projectsTable).set({
      status: "running",
      workDir,
      botPid: pid,
      isHosted: true,
    }).where(eq(projectsTable.id, project.id));

    const workspaceUrl = `${PLATFORM_URL}/deploying/${project.id}`;
    await bot.deleteMessage(msg.chat.id, waitMsg.message_id);
    await bot.sendMessage(msg.chat.id,
      `🎉 *Bot Deployed Successfully!*\n\nYour Telegram bot is now live and polling.\n\n📁 *Project ID:* \`${project.id}\`\n📌 *Process ID:* \`${pid}\`\n\n🌐 *Project page:*\n${workspaceUrl}`,
      {
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: [[{ text: "📊 View Project", url: workspaceUrl }]] },
      }
    );
    return;
  }

  const projectCheck = await checkProjectLimitAllowed(telegramId);
  if (!projectCheck.allowed) {
    await bot.sendMessage(msg.chat.id,
      `⚠️ ${projectCheck.reason}\n\nUpgrade via ${PAYMENT_BOT_USERNAME} to create unlimited projects.`
    );
    return;
  }

  await sendTyping(msg.chat.id);
  const thinkMsg = await bot.sendMessage(msg.chat.id, "🧠 Analyzing your request...");

  const planPrompt = `A user on the WebForge platform wants to build: "${text}"\n\nProvide a concise build plan: tech stack, 3-5 core features, architecture overview, and complexity estimate. Max 250 words. Be specific and encouraging.`;

  const planResult = await routeTask("planning", planPrompt, tier, telegramId, WEBFORGE_SYSTEM_PROMPT);

  const [project] = await db.insert(projectsTable).values({
    userId: telegramId,
    name: text.slice(0, 60),
    description: text,
    status: "planned",
    techStack: "fullstack",
  }).returning();

  const workDir = await ensureProjectDir(project.id, telegramId);
  await db.update(projectsTable).set({ status: "idle", workDir }).where(eq(projectsTable.id, project.id));

  await bot.deleteMessage(msg.chat.id, thinkMsg.message_id);

  const deployingUrl = `${PLATFORM_URL}/deploying/${project.id}`;
  await bot.sendMessage(msg.chat.id,
    `📋 *Build Plan — Project #${project.id}*\n\n${planResult.content}\n\n---\n_Model: ${planResult.model}_`,
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

async function handleGeneralMessage(msg: TelegramBot.Message): Promise<void> {
  if (!bot || !msg.text) return;

  const text = msg.text;
  const telegramId = msg.from!.id;

  const subscribed = await isSubscribedToChannel(telegramId);
  if (!subscribed) { await sendSubscriptionGate(msg.chat.id); return; }

  await getOrCreateUser(telegramId, msg.from?.first_name, msg.from?.username);

  const isApiKey = await handleApiKeyInjection(msg);
  if (isApiKey) return;

  if (isBillingIntent(text)) {
    await handleBillingRedirect(msg.chat.id);
    return;
  }

  const buildKeywords = /build|create|make|develop|generate|code|write|implement|design|launch|deploy|bot|app|website|api|landing\s*page|clone|scaffold/i;
  if (buildKeywords.test(text) && text.length > 15) {
    await handleBuildRequest(msg, text);
    return;
  }

  const check = await checkActionAllowed(telegramId);
  if (!check.allowed) {
    await bot.sendMessage(msg.chat.id,
      `⚠️ ${check.reason}\n\nUpgrade via ${PAYMENT_BOT_USERNAME} to unlock more daily actions.`
    );
    return;
  }

  await sendTyping(msg.chat.id);

  const taskType = detectTaskType(text);
  const user = check.user!;

  const result = await routeTask(taskType, text, user.tier, telegramId, WEBFORGE_SYSTEM_PROMPT);

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
    const url = `${PLATFORM_URL}/deploying/${projectId}`;
    await bot.sendMessage(msg.chat.id,
      `📊 *Project #${projectId}*\n\nView your live deployment page:\n${url}`,
      {
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: [[{ text: "📊 Open Deploy Page", url }]] },
      }
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
        await bot.sendMessage(chatId,
          "✅ *Subscription verified!*\n\nWelcome to WebForge. Tell me what you want to build.",
          { parse_mode: "Markdown" }
        );
      } else {
        await bot.sendMessage(chatId,
          `❌ You haven't joined yet. Please join ${REQUIRED_CHANNEL} first, then tap the button again.`,
          {
            reply_markup: {
              inline_keyboard: [[
                { text: "📢 Join Channel", url: `https://t.me/${REQUIRED_CHANNEL.replace("@", "")}` },
                { text: "✅ I've Joined", callback_data: "check_subscription" },
              ]],
            },
          }
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

      const user = check.user!;
      const tier = user.tier as Tier;
      const isElite = tier === "elite";

      const rows = await db.select().from(projectsTable).where(eq(projectsTable.id, projectId)).limit(1);
      const project = rows[0];
      if (!project) {
        await bot.sendMessage(chatId, "❌ Project not found.");
        return;
      }

      if (!project.workDir) {
        await bot.sendMessage(chatId, "❌ Project directory not initialized. Please re-create the project.");
        return;
      }

      runFullBuild(
        chatId,
        telegramId,
        projectId,
        project.workDir,
        project.description ?? project.name,
        tier,
        isElite,
      ).catch(err => logger.error({ err, projectId }, "runFullBuild unhandled error"));

      return;
    }
  });

  bot.on("message", async (msg) => {
    if (!msg.text) return;
    if (msg.text.startsWith("/")) return;
    await handleGeneralMessage(msg).catch(err => logger.error({ err }, "Core bot message handler error"));
  });

  bot.on("polling_error", (err) => logger.error({ err }, "Core bot polling error"));
}
