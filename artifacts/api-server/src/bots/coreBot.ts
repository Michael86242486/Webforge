import TelegramBot from "node-telegram-bot-api";
import { routeTask, deepBuildLoop, type TaskType } from "../ai/router.js";
import { getOrCreateUser, checkActionAllowed, incrementAction, checkProjectLimitAllowed, TIER_LIMITS, type Tier } from "../utils/billing.js";
import { encrypt } from "../utils/crypto.js";
import { db, usersTable, projectsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { ensureProjectDir, scaffoldBotProject, spawnBotProcess } from "../engines/orchestrator.js";
import { logger } from "../lib/logger.js";

const TOKEN = process.env.CORE_BOT_TOKEN ?? "";

const CORE_BOT_USERNAME = "@WebBuilder2Bot";
const PAYMENT_BOT_USERNAME = "@Webforgepaymentverificationbot";

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
    "🔐 *API Key Secured*\n\nYour key has been encrypted with AES-256 and stored. The original message was scrubbed from chat for your security.\n\nYou can now use your own model credits for priority access.",
    { parse_mode: "Markdown" }
  );
  return true;
}

async function handleStart(msg: TelegramBot.Message): Promise<void> {
  if (!bot) return;
  const user = await getOrCreateUser(msg.from!.id, msg.from?.first_name, msg.from?.username);
  const tier = (user.tier as Tier);
  const remaining = TIER_LIMITS[tier].dailyActions - user.dailyActionsCounter;

  await bot.sendMessage(msg.chat.id,
    `⚡ *Welcome to WebForge*\n\nI'm your autonomous full-stack co-founder. Describe what you want to build and I'll architect, code, and deploy it — entirely through this chat.\n\n*Your plan:* ${tier.toUpperCase()}\n*Actions remaining today:* ${remaining}/${TIER_LIMITS[tier].dailyActions}\n\n*What I can build for you:*\n• Full-stack web apps\n• Telegram bots (hosted permanently)\n• Landing pages with AI chat widgets\n• REST APIs and microservices\n• Image generation pipelines\n\nType \`/help\` to see all commands, or just tell me what you need built.`,
    { parse_mode: "Markdown" }
  );
}

async function handleHelp(msg: TelegramBot.Message): Promise<void> {
  if (!bot) return;
  await bot.sendMessage(msg.chat.id,
    `🛠 *WebForge Commands*\n\n\`/start\` — Welcome & your status\n\`/projects\` — List your projects\n\`/workspace <id>\` — Open project workspace\n\`/upgrade\` — View plans & upgrade\n\`/status\` — Account details\n\`/help\` — This menu\n\n*Building:* Just describe what you want in plain English. I handle the rest.\n\n*Bot-as-a-Service:* Include a Telegram bot token in your message and I'll deploy it permanently (Pro/Elite only).\n\n*Pro tip:* Send your OpenAI-compatible API key to use your own credits for faster processing.`,
    { parse_mode: "Markdown" }
  );
}

async function handleProjects(msg: TelegramBot.Message): Promise<void> {
  if (!bot) return;
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
    const statusIcon = p.status === "running" ? "🟢" : p.status === "building" ? "🟡" : "⚪";
    const workspaceUrl = `${PLATFORM_URL}/workspace/${p.id}`;
    return `${statusIcon} *${p.name}* — \`${p.status}\`\n   [Open Workspace](${workspaceUrl})`;
  }).join("\n\n");

  await bot.sendMessage(msg.chat.id, `📁 *Your Projects*\n\n${list}`, { parse_mode: "Markdown" });
}

async function handleUpgrade(msg: TelegramBot.Message): Promise<void> {
  await handleBillingRedirect(msg.chat.id);
}

async function handleStatus(msg: TelegramBot.Message): Promise<void> {
  if (!bot) return;
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

async function handleWorkspace(msg: TelegramBot.Message, projectId: number): Promise<void> {
  if (!bot) return;
  const url = `${PLATFORM_URL}/workspace/${projectId}`;
  await bot.sendMessage(msg.chat.id,
    `🖥 *Workspace Ready — Project #${projectId}*\n\nYour live coding canvas is open. Watch code stream in real-time as I build.\n\n${url}`,
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [[{ text: "🖥 Open Live Workspace", url }]],
      },
    }
  );
}

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

    const workspaceUrl = `${PLATFORM_URL}/workspace/${project.id}`;
    await bot.deleteMessage(msg.chat.id, waitMsg.message_id);
    await bot.sendMessage(msg.chat.id,
      `🎉 *Bot Deployed Successfully!*\n\nYour Telegram bot is now live and polling.\n\n📁 *Project ID:* \`${project.id}\`\n📌 *Process ID:* \`${pid}\`\n\n🖥 *Live Workspace:*\n${workspaceUrl}\n\nOpen the workspace to edit your bot's AI persona, view logs, and make live changes.`,
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [[{ text: "🖥 Open Live Workspace", url: workspaceUrl }]],
        },
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
  const thinkMsg = await bot.sendMessage(msg.chat.id, "🧠 Analyzing your request and generating a build plan...");

  const planPrompt = `A user on the WebForge platform wants to build the following:

"${text}"

Provide a concise, expert build plan covering:
1. Tech stack recommendation (be specific — framework, DB, hosting approach)
2. Core features (3-5 bullet points)
3. Architecture overview (2-3 sentences)
4. Estimated complexity (Simple / Moderate / Complex)

Keep it conversational, specific, and encouraging. Max 250 words. Do not use generic filler phrases.`;

  const planResult = await routeTask("planning", planPrompt, user.tier, telegramId, WEBFORGE_SYSTEM_PROMPT);

  const [project] = await db.insert(projectsTable).values({
    userId: telegramId,
    name: text.slice(0, 60),
    description: text,
    status: "planned",
    techStack: "fullstack",
  }).returning();

  const workDir = await ensureProjectDir(project.id, telegramId);
  await db.update(projectsTable).set({ status: "idle", workDir }).where(eq(projectsTable.id, project.id));

  await incrementAction(telegramId);

  const workspaceUrl = `${PLATFORM_URL}/workspace/${project.id}`;
  await bot.deleteMessage(msg.chat.id, thinkMsg.message_id);
  await bot.sendMessage(msg.chat.id,
    `📋 *Build Plan — Project #${project.id}*\n\n${planResult.content}\n\n---\n🖥 *Your Live Workspace:*\n${workspaceUrl}\n\n_Model: ${planResult.model}_`,
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "🖥 Open Live Workspace", url: workspaceUrl }],
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
    await handleBuildRequest(msg, match[1]);
  });
  bot.onText(/\/workspace_(\d+)/, async (msg, match) => {
    if (!match?.[1]) return;
    await handleWorkspace(msg, parseInt(match[1]));
  });
  bot.onText(/\/workspace (\d+)/, async (msg, match) => {
    if (!match?.[1]) return;
    await handleWorkspace(msg, parseInt(match[1]));
  });

  bot.on("callback_query", async (query) => {
    if (!bot || !query.data) return;
    await bot.answerCallbackQuery(query.id);
    if (query.data.startsWith("build_")) {
      const projectId = parseInt(query.data.replace("build_", ""));
      const url = `${PLATFORM_URL}/workspace/${projectId}`;
      await bot.sendMessage(query.message!.chat.id,
        `🚀 *Building Project #${projectId}*\n\nOpening your live workspace now — watch code stream in real-time:\n\n${url}`,
        {
          parse_mode: "Markdown",
          reply_markup: { inline_keyboard: [[{ text: "🖥 Open Live Workspace", url }]] },
        }
      );
    }
  });

  bot.on("message", async (msg) => {
    if (!msg.text) return;
    if (msg.text.startsWith("/")) return;
    await handleGeneralMessage(msg).catch(err => logger.error({ err }, "Core bot message handler error"));
  });

  bot.on("polling_error", (err) => logger.error({ err }, "Core bot polling error"));
}

export { deepBuildLoop };
