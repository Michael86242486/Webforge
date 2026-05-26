import TelegramBot from "node-telegram-bot-api";
import { db, paymentsTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { generateReference } from "../utils/crypto.js";
import { upgradeTier, getOrCreateUser, TIER_PRICES, type Tier } from "../utils/billing.js";
import { safeSend, escapeMd } from "../utils/telegram.js";
import { logger } from "../lib/logger.js";

const TOKEN = process.env.PAYMENT_BOT_TOKEN ?? "";
const ADMIN_GROUP_ID = parseInt(process.env.ADMIN_GROUP_ID ?? "8234256894");

const BANK_INFO = `🏦 *Bank:* OPay\n📞 *Account:* 9036609138\n👤 *Name:* Michael Farinloye Idunnumi`;

let bot: TelegramBot | null = null;

const pendingPayments = new Map<number, { tier: Tier; reference: string }>();

async function sendInvoice(chatId: number, tier: Tier): Promise<void> {
  if (!bot) return;
  const amount = TIER_PRICES[tier];
  const reference = generateReference("WF");

  await db.insert(paymentsTable).values({
    userId: chatId,
    reference,
    tier,
    amountNgn: amount,
    status: "pending",
  }).onConflictDoNothing();

  pendingPayments.set(chatId, { tier, reference });

  await safeSend(bot, chatId,
    `💳 *${tier.toUpperCase()} Plan Invoice*\n\n${BANK_INFO}\n\n💰 *Amount:* ₦${amount.toLocaleString()}/month\n🔖 *Reference:* \`${reference}\`\n\n*Instructions:*\n1. Transfer ₦${amount.toLocaleString()} to OPay\n2. Use reference: \`${reference}\`\n3. Screenshot your receipt\n4. Send the screenshot here, then click "I HAVE PAID"\n\n⏰ This invoice expires in 24 hours.`,
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [[
          { text: "✅ I HAVE PAID", callback_data: `paid_${reference}` },
          { text: "❌ Cancel", callback_data: "cancel_payment" },
        ]],
      },
    }
  );
}

async function routeToAdmin(
  userId: number,
  tier: Tier,
  reference: string,
  receiptFileId: string,
  receiptUrl: string
): Promise<void> {
  if (!bot) return;

  const userRows = await db.select().from(usersTable).where(eq(usersTable.telegramId, userId)).limit(1);
  const user = userRows[0];

  try {
    const adminMsg = await bot.sendPhoto(ADMIN_GROUP_ID, receiptFileId, {
      caption:
        `🔔 *New Payment Verification*\n\n` +
        `👤 *User ID:* \`${userId}\`\n` +
        `🔖 *Username:* @${escapeMd(user?.username ?? "unknown")}\n` +
        `📋 *Plan:* ${tier.toUpperCase()}\n` +
        `💰 *Amount:* ₦${TIER_PRICES[tier]?.toLocaleString()}\n` +
        `🏷 *Reference:* \`${reference}\`\n` +
        `🕐 *Submitted:* ${new Date().toLocaleString("en-NG", { timeZone: "Africa/Lagos" })}`,
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [[
          { text: "✅ Approve", callback_data: `approve_${reference}_${userId}_${tier}` },
          { text: "❌ Reject", callback_data: `reject_${reference}_${userId}` },
        ]],
      },
    });

    await db.update(paymentsTable).set({
      receiptFileId,
      receiptUrl,
      adminMessageId: adminMsg.message_id,
      adminChatId: ADMIN_GROUP_ID,
      status: "under_review",
    }).where(eq(paymentsTable.reference, reference));
  } catch (err) {
    logger.error({ err, userId, reference }, "routeToAdmin: failed to send to admin group");
    // Still update status so we know it was submitted
    await db.update(paymentsTable).set({ receiptFileId, receiptUrl, status: "under_review" })
      .where(eq(paymentsTable.reference, reference));
  }
}

async function handleApproval(query: TelegramBot.CallbackQuery, parts: string[]): Promise<void> {
  if (!bot) return;
  const [, reference, userIdStr, tier] = parts;
  const userId = parseInt(userIdStr);

  await upgradeTier(userId, tier as Tier);
  await db.update(paymentsTable).set({
    status: "approved",
    approvedBy: query.from.username ?? "admin",
  }).where(eq(paymentsTable.reference, reference));

  try {
    await bot.editMessageReplyMarkup({ inline_keyboard: [] }, {
      chat_id: query.message!.chat.id,
      message_id: query.message!.message_id,
    });
  } catch {}

  const planLimits = tier === "elite"
    ? "500 AI actions/day • DeepBuild • GitHub sync • Priority models"
    : "150 AI actions/day • Unlimited projects • Bot hosting • Custom API key";

  await safeSend(bot, userId,
    `🎉 *Payment Approved!*\n\nYour account has been upgraded to *${tier.toUpperCase()}*.\n\n*What you now have:*\n${planLimits}\n\nThank you for trusting WebForge. Now let's build something extraordinary! 🚀`,
    { parse_mode: "Markdown" }
  );

  try {
    await bot.answerCallbackQuery(query.id, { text: `✅ Approved ${tier.toUpperCase()} for user ${userId}` });
  } catch {}
}

async function handleRejection(query: TelegramBot.CallbackQuery, parts: string[]): Promise<void> {
  if (!bot) return;
  const [, reference, userIdStr] = parts;
  const userId = parseInt(userIdStr);

  await db.update(paymentsTable).set({ status: "rejected" }).where(eq(paymentsTable.reference, reference));

  try {
    await bot.editMessageReplyMarkup({ inline_keyboard: [] }, {
      chat_id: query.message!.chat.id,
      message_id: query.message!.message_id,
    });
  } catch {}

  await safeSend(bot, userId,
    `❌ *Payment Verification Failed*\n\nReference: \`${reference}\`\n\nWe couldn't verify your payment. Possible reasons:\n• Incorrect reference number used\n• Receipt doesn't match the transfer\n• Transfer not yet completed\n\nPlease retry with /upgrade or contact support.`,
    { parse_mode: "Markdown" }
  );

  try {
    await bot.answerCallbackQuery(query.id, { text: `❌ Rejected payment ${reference}` });
  } catch {}
}

export function initPaymentBot(): void {
  if (!TOKEN) {
    logger.warn("PAYMENT_BOT_TOKEN not set — payment bot disabled");
    return;
  }

  bot = new TelegramBot(TOKEN, { polling: { interval: 1000, autoStart: true, params: { timeout: 10 } } });
  logger.info("Payment bot started polling");

  bot.onText(/\/start/, async (msg) => {
    try {
      await getOrCreateUser(msg.from!.id, msg.from?.first_name, msg.from?.username);
      await safeSend(bot!, msg.chat.id,
        `💳 *WebForge Payment Portal*\n\nWelcome! I handle all plan upgrades and payment verification for WebForge.\n\nUse /upgrade to view available plans and upgrade your account.`,
        { parse_mode: "Markdown" }
      );
    } catch (err) { logger.error({ err }, "paymentBot /start error"); }
  });

  bot.onText(/\/upgrade/, async (msg) => {
    try {
      await getOrCreateUser(msg.from!.id, msg.from?.first_name, msg.from?.username);
      await safeSend(bot!, msg.chat.id,
        `🚀 *Upgrade Your WebForge Plan*\n\n⭐ *Pro* — ₦5,000/month\n• 150 AI actions/day\n• Unlimited projects\n• Bot hosting\n• GitHub sync\n\n👑 *Elite* — ₦15,000/month\n• 500 AI actions/day\n• DeepBuild (5-round self-correction)\n• Priority models (DeepSeek-R1)\n• Everything in Pro\n\nChoose your plan:`,
        {
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [
              [{ text: "⚡ PRO — ₦5,000/mo", callback_data: "upgrade_pro" }],
              [{ text: "🔥 ELITE — ₦15,000/mo", callback_data: "upgrade_elite" }],
            ],
          },
        }
      );
    } catch (err) { logger.error({ err }, "paymentBot /upgrade error"); }
  });

  bot.on("photo", async (msg) => {
    if (!bot) return;
    try {
      const chatId = msg.chat.id;
      const pending = pendingPayments.get(chatId);
      if (!pending) {
        await safeSend(bot, chatId, "Please start an upgrade first with /upgrade");
        return;
      }

      const photo = msg.photo?.[msg.photo.length - 1];
      if (!photo) return;

      const fileInfo = await bot.getFile(photo.file_id);
      const receiptUrl = `https://api.telegram.org/file/bot${TOKEN}/${fileInfo.file_path}`;

      await db.update(paymentsTable).set({
        receiptFileId: photo.file_id,
        receiptUrl,
      }).where(eq(paymentsTable.reference, pending.reference));

      await safeSend(bot, chatId,
        `📸 *Receipt received!*\n\nReference: \`${pending.reference}\`\n\nClick below to confirm your payment submission:`,
        {
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [[
              { text: "✅ I HAVE PAID", callback_data: `paid_${pending.reference}` },
            ]],
          },
        }
      );
    } catch (err) { logger.error({ err }, "paymentBot photo handler error"); }
  });

  bot.on("callback_query", async (query) => {
    if (!bot || !query.data) return;
    try {
      await bot.answerCallbackQuery(query.id);
    } catch {}

    try {
      const chatId = query.message!.chat.id;
      const data = query.data;

      if (data === "upgrade_pro") { await sendInvoice(chatId, "pro"); return; }
      if (data === "upgrade_elite") { await sendInvoice(chatId, "elite"); return; }
      if (data === "cancel_payment") {
        pendingPayments.delete(chatId);
        await safeSend(bot, chatId, "Payment cancelled. Use /upgrade to try again.");
        return;
      }

      if (data.startsWith("paid_")) {
        const reference = data.replace("paid_", "");
        const pending = pendingPayments.get(chatId);
        if (!pending || pending.reference !== reference) {
          await safeSend(bot, chatId, "Please send your receipt screenshot first.");
          return;
        }
        const payment = await db.select().from(paymentsTable).where(eq(paymentsTable.reference, reference)).limit(1);
        if (!payment[0]?.receiptFileId) {
          await safeSend(bot, chatId, "Please send your receipt screenshot before confirming.");
          return;
        }
        await routeToAdmin(chatId, pending.tier, reference, payment[0].receiptFileId, payment[0].receiptUrl ?? "");
        pendingPayments.delete(chatId);
        await safeSend(bot, chatId,
          `⏳ *Payment Under Review*\n\nReference: \`${reference}\`\n\nOur team will verify your transfer within 1-2 hours. You'll receive a confirmation here once approved.`,
          { parse_mode: "Markdown" }
        );
        return;
      }

      if (data.startsWith("approve_")) {
        await handleApproval(query, data.split("_"));
        return;
      }
      if (data.startsWith("reject_")) {
        await handleRejection(query, data.split("_"));
        return;
      }
    } catch (err) {
      logger.error({ err, data: query.data }, "paymentBot callback_query error");
    }
  });

  bot.on("polling_error", (err) => logger.warn({ err }, "Payment bot polling error — continuing"));
}
