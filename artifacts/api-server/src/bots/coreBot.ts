import TelegramBot from "node-telegram-bot-api";
import { routeTask, type TaskType } from "../ai/router.js";
import { getOrCreateUser, checkActionAllowed, incrementAction, checkProjectLimitAllowed, TIER_LIMITS, type Tier } from "../utils/billing.js";
import { encrypt } from "../utils/crypto.js";
import { db, usersTable, projectsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { ensureProjectDir, scaffoldBotProject, spawnBotProcess } from "../engines/orchestrator.js";
import { logger } from "../lib/logger.js";

const TOKEN = process.env.CORE_BOT_TOKEN ?? "";

let bot: TelegramBot | null = null;

const PLATFORM_URL = (() => {
  const domains = process.env.REPLIT_DOMAINS?.split(",")[0];
  return domains ? `https://${domains}` : "https://webforge.replit.app";
})();

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

async function handleApiKeyInjection(msg: TelegramBot.Message): Promise<boolean> {
  if (!bot || !msg.text) return false;
  const keyMatch = msg.text.match(/sk-[A-Za-z0-9_-]{20,}|devx-[A-Za-z0-9]{20,}/);
  if (!keyMatch) return false;

  const telegramId = msg.from!.id;
  await bot.deleteMessage(msg.chat.id, msg.message_id);

  const encrypted = encrypt(keyMatch[0]);
  await db.update(usersTable).set({ apiKey: encrypted }).where(eq(usersTable.telegramId, telegramId));

  await bot.sendMessage(msg.chat.id,
    "🔐 *API Key Secured*\n\nYour key has been encrypted and stored. The original message was scrubbed from chat for your security.\n\nYou can now use your own model credits for priority access.",
    { parse_mode: "Markdown" }
  );
  return true;
}

async function handleStart(msg: TelegramBot.Message): Promise<void> {
  if (!bot) return;
  const user = await getOrCreateUser(msg.from!.id, msg.from?.first_name, msg.from?.username);

  await bot.sendMessage(msg.chat.id,
    `⚡ *Welcome to WebForge*\n\nI'm your autonomous full-stack co-founder. Tell me what you want to build and I'll architect, code, and deploy it — entirely through this chat.\n\n*Your current plan:* ${user.tier.toUpperCase()}\n*Daily actions remaining:* ${TIER_LIMITS[(user.tier as Tier)]?.dailyActions - user.dailyActionsCounter}\n\n*What I can do:*\n• Build full-stack web apps\n• Host custom Telegram bots\n• Generate and edit images\n• Clone and extend GitHub repos\n• Give your apps AI personalities\n\nType \`/help\` for commands or just tell me what to build.`,
    { parse_mode: "Markdown" }
  );
}

async function handleHelp(msg: TelegramBot.Message): Promise<void> {
  if (!bot) return;
  await bot.sendMessage(msg.chat.id,
    `🛠 *WebForge Commands*\n\n\`/start\` — Welcome & status\n\`/projects\` — List your projects\n\`/newproject <name>\` — Start a new project\n\`/workspace <id>\` — Open project workspace\n\`/upgrade\` — View & upgrade your plan\n\`/status\` — Your account status\n\`/help\` — This menu\n\n*Building:* Just describe what you want in plain English. I'll figure out the rest.\n\n*Pro tip:* Include your Telegram bot token to have me host it for you permanently.`,
    { parse_mode: "Markdown" }
  );
}

async function handleProjects(msg: TelegramBot.Message): Promise<void> {
  if (!bot) return;
  const telegramId = msg.from!.id;
  const projects = await db.select().from(projectsTable).where(eq(projectsTable.userId, telegramId));

  if (projects.length === 0) {
    await bot.sendMessage(msg.chat.id,
      "📂 *No projects yet*\n\nSay something like:\n_\"Build me a task manager app\"_\n_\"Create a restaurant landing page\"_\n_\"I need a Telegram quiz bot\"_",
      { parse_mode: "Markdown" }
    );
    return;
  }

  const list = projects.map(p =>
    `• *${p.name}* — \`${p.status}\`${p.isHosted ? " 🟢" : ""} [/workspace_${p.id}]`
  ).join("\n");

  await bot.sendMessage(msg.chat.id, `📁 *Your Projects*\n\n${list}`, { parse_mode: "Markdown" });
}

async function handleStatus(msg: TelegramBot.Message): Promise<void> {
  if (!bot) return;
  const user = await getOrCreateUser(msg.from!.id, msg.from?.first_name, msg.from?.username);
  const tier = (user.tier as Tier) ?? "starter";
  const limits = TIER_LIMITS[tier];
  const projects = await db.select().from(projectsTable).where(eq(projectsTable.userId, msg.from!.id));
  const remaining = limits.dailyActions - user.dailyActionsCounter;

  await bot.sendMessage(msg.chat.id,
    `📊 *Account Status*\n\n👤 *User:* ${user.firstName ?? "Anonymous"}\n🏷 *Plan:* ${tier.toUpperCase()}\n⚡ *Actions today:* ${user.dailyActionsCounter}/${limits.dailyActions} (${remaining} remaining)\n📁 *Projects:* ${projects.length}${limits.maxProjects !== Infinity ? `/${limits.maxProjects}` : ""}\n\n*Plan features:*\n${limits.botHosting ? "✅" : "❌"} Bot-as-a-Service hosting\n${limits.customKeys ? "✅" : "❌"} Custom API keys\n${limits.gitClone ? "✅" : "❌"} GitHub repo cloning\n${limits.deepBuild ? "✅" : "❌"} DEEP BUILD auto-correction\n\nType /upgrade to unlock more.`,
    { parse_mode: "Markdown" }
  );
}

async function handleWorkspace(msg: TelegramBot.Message, projectId: number): Promise<void> {
  if (!bot) return;
  const url = `${PLATFORM_URL}/workspace/${projectId}`;
  await bot.sendMessage(msg.chat.id,
    `🖥 *Opening Workspace*\n\nProject #${projectId} is ready.\n[Open Code Canvas →](${url})`,
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [[{ text: "🖥 Open Workspace", url }]],
      },
    }
  );
}

async function handleBuildRequest(msg: TelegramBot.Message, text: string): Promise<void> {
  if (!bot) return;
  const telegramId = msg.from!.id;

  const check = await checkActionAllowed(telegramId);
  if (!check.allowed) {
    await bot.sendMessage(msg.chat.id, `⚠️ ${check.reason}\n\nType /upgrade to unlock more capacity.`);
    return;
  }

  const user = check.user!;

  const botTokenMatch = text.match(/(\d{9,11}:[A-Za-z0-9_-]{35,})/);
  if (botTokenMatch) {
    const botToken = botTokenMatch[1];
    const tier = (user.tier as Tier);
    if (!TIER_LIMITS[tier].botHosting) {
      await bot.sendMessage(msg.chat.id,
        "🤖 *Bot Hosting is a PRO feature*\n\nUpgrade to PRO (₦5,000/mo) to host your custom Telegram bots permanently.\n\nType /upgrade to get started.",
        { parse_mode: "Markdown" }
      );
      return;
    }

    const projectCheck = await checkProjectLimitAllowed(telegramId);
    if (!projectCheck.allowed) {
      await bot.sendMessage(msg.chat.id, `⚠️ ${projectCheck.reason}`);
      return;
    }

    await sendTyping(msg.chat.id);
    const waitMsg = await bot.sendMessage(msg.chat.id, "🤖 Scaffolding your bot... hang tight.");

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

    await bot.deleteMessage(msg.chat.id, waitMsg.message_id);
    await bot.sendMessage(msg.chat.id,
      `🎉 *Bot Deployed!*\n\nYour Telegram bot is now live and polling.\n\n📁 *Project ID:* ${project.id}\n📌 *PID:* ${pid}\n\nOpen the workspace to customize your bot's AI persona:\n${PLATFORM_URL}/workspace/${project.id}`,
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [[{ text: "🖥 Open Workspace", url: `${PLATFORM_URL}/workspace/${project.id}` }]],
        },
      }
    );
    return;
  }

  const projectCheck = await checkProjectLimitAllowed(telegramId);
  if (!projectCheck.allowed) {
    await bot.sendMessage(msg.chat.id, `⚠️ ${projectCheck.reason}`);
    return;
  }

  await sendTyping(msg.chat.id);
  const thinkMsg = await bot.sendMessage(msg.chat.id, "🧠 Analyzing your request...");

  const taskType = detectTaskType(text);

  const planPrompt = `You are WebForge, an expert full-stack architect. A user wants to build the following:

"${text}"

Provide a concise build plan covering:
1. Tech stack recommendation
2. Core features (3-5 bullet points)
3. Architecture overview (2-3 sentences)
4. Estimated complexity

Keep it conversational and encouraging. Max 300 words.`;

  const planResult = await routeTask("planning", planPrompt, user.tier, telegramId);

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

  await bot.deleteMessage(msg.chat.id, thinkMsg.message_id);
  await bot.sendMessage(msg.chat.id,
    `📋 *Build Plan for Project #${project.id}*\n\n${planResult.content}\n\n_Model used: ${planResult.model}_`,
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "🖥 Open Workspace", url: `${PLATFORM_URL}/workspace/${project.id}` }],
          [{ text: "🚀 Start Building", callback_data: `build_${project.id}` }],
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

  const buildKeywords = /build|create|make|develop|generate|code|write|implement|design|launch|deploy|bot|app|website|api/i;
  if (buildKeywords.test(text) && text.length > 15) {
    await handleBuildRequest(msg, text);
    return;
  }

  const check = await checkActionAllowed(telegramId);
  if (!check.allowed) {
    await bot.sendMessage(msg.chat.id, `⚠️ ${check.reason}`);
    return;
  }

  await sendTyping(msg.chat.id);

  const taskType = detectTaskType(text);
  const user = check.user!;

  const result = await routeTask(
    taskType,
    text,
    user.tier,
    telegramId,
    "You are WebForge, an elite AI co-founder and full-stack engineer. You communicate with warmth, precision, and genuine expertise. You build real things, not mockups."
  );

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
        `🚀 *Starting build for Project #${projectId}*\n\nOpen the workspace to watch code generate live:\n${url}`,
        { parse_mode: "Markdown" }
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
