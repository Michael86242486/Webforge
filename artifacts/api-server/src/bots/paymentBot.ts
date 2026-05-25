import TelegramBot from "node-telegram-bot-api";
import { db, paymentsTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { generateReference } from "../utils/crypto.js";
import { upgradeTier, getOrCreateUser, TIER_PRICES, type Tier } from "../utils/billing.js";
import { logger } from "../lib/logger.js";

const TOKEN = process.env.PAYMENT_BOT_TOKEN ?? "";
const ADMIN_GROUP_ID = parseInt(process.env.ADMIN_GROUP_ID ?? "8234256894");

const BANK_INFO = `🏦 *Bank:* OPay\n📞 *Account:* 9036609138\n👤 *Name:*Michael farinloye idunnumi `;

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

  await bot.sendMessage(chatId,
    `💳 *${tier.toUpperCase()} Plan Invoice*\n\n${BANK_INFO}\n\n💰 *Amount:* ₦${amount.toLocaleString()}/month\n🔖 *Reference:* \`${reference}\`\n\n*Instructions:*\n1. Transfer ₦${amount.toLocaleString()} to OPay\n2. Use reference: \`${reference}\`\n3. Screenshot your receipt\n4. Send the screenshot here and click "I HAVE PAID"\n\n⏰ This invoice expires in 24 hours.`,
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

  const adminMsg = await bot.sendPhoto(ADMIN_GROUP_ID, receiptFileId, {
    caption:
      `🔔 *New Payment Verification*\n\n` +
      `👤 *User ID:* \`${userId}\`\n` +
      `🔖 *Username:* @${user?.username ?? "unknown"}\n` +
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

  await bot.editMessageReplyMarkup({ inline_keyboard: [] }, {
    chat_id: query.message!.chat.id,
    message_id: query.message!.message_id,
  });

  await bot.sendMessage(userId,
    `🎉 *Payment Approved!*\n\nYour account has been upgraded to *${tier.toUpperCase()}*.\n\n*New limits:*\n• ${tier === "elite" ? "500" : "150"} AI actions/day\n• ${tier === "elite" ? "Priority premium models (DeepSeek-R1)" : "Unlimited projects"}\n• Bot-as-a-Service hosting\n• Custom API key injection\n\nThank you for trusting WebForge. Now let's build something extraordinary.`,
    { parse_mode: "Markdown" }
  );

  await bot.answerCallbackQuery(query.id, { text: `✅ Approved ${tier.toUpperCase()} for user ${userId}` });
}

async function handleRejection(query: TelegramBot.CallbackQuery, parts: string[]): Promise<void> {
  if (!bot) return;
  const [, reference, userIdStr] = parts;
  const userId = parseInt(userIdStr);

  await db.update(paymentsTable).set({ status: "rejected" }).where(eq(paymentsTable.reference, reference));

  await bot.editMessageReplyMarkup({ inline_keyboard: [] }, {
    chat_id: query.message!.chat.id,
    message_id: query.message!.message_id,
  });

  await bot.sendMessage(userId,
    `❌ *Payment Verification Failed*\n\nReference: \`${reference}\`\n\nWe couldn't verify your payment. This could be due to:\n• Incorrect reference number\n• Receipt mismatch\n• Transfer not completed\n\nPlease contact support or retry with \`/upgrade\`.`,
    { parse_mode: "Markdown" }
  );

  await bot.answerCallbackQuery(query.id, { text: `❌ Rejected payment ${reference}` });
}

export function initPaymentBot(): void {
  if (!TOKEN) {
    logger.warn("PAYMENT_BOT_TOKEN not set — payment bot disabled");
    return;
  }

  bot = new TelegramBot(TOKEN, { polling: true });
  logger.info("Payment bot started polling");

  bot.onText(/\/start/, async (msg) => {
    await bot?.sendMessage(msg.chat.id,
      `💳 *WebForge Payment Portal*\n\nWelcome! I handle all plan upgrades and payment verification for @WebBuilder2Bot.\n\nUse /upgrade to view available plans and get your account upgraded.`,
      { parse_mode: "Markdown" }
    );
  });

  bot.onText(/\/upgrade/, async (msg) => {
    await getOrCreateUser(msg.from!.id, msg.from?.first_name, msg.from?.username);
    await bot?.sendMessage(msg.chat.id,
      "🚀 *Upgrade Your WebForge Plan*\n\nChoose your plan:",
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
  });

  bot.on("photo", async (msg) => {
    if (!bot) return;
    const chatId = msg.chat.id;
    const pending = pendingPayments.get(chatId);
    if (!pending) {
      await bot.sendMessage(chatId, "Please start an upgrade first with /upgrade");
      return;
    }

    const photo = msg.photo?.[msg.photo.length - 1];
    if (!photo) return;

    const fileInfo = await bot.getFile(photo.file_id);
    const receiptUrl = `https://api.telegram.org/file/bot${TOKEN}/${fileInfo.file_path}`;

    await bot.sendMessage(chatId,
      `📸 *Receipt received!*\n\nReference: \`${pending.reference}\`\n\nClick below to confirm your payment:`,
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [[
            { text: "✅ I HAVE PAID", callback_data: `paid_${pending.reference}` },
          ]],
        },
      }
    );

    await db.update(paymentsTable).set({
      receiptFileId: photo.file_id,
      receiptUrl,
    }).where(eq(paymentsTable.reference, pending.reference));
  });

  bot.on("callback_query", async (query) => {
    if (!bot || !query.data) return;
    await bot.answerCallbackQuery(query.id);
    const chatId = query.message!.chat.id;
    const data = query.data;

    if (data === "upgrade_pro") { await sendInvoice(chatId, "pro"); return; }
    if (data === "upgrade_elite") { await sendInvoice(chatId, "elite"); return; }
    if (data === "cancel_payment") {
      pendingPayments.delete(chatId);
      await bot.sendMessage(chatId, "Payment cancelled. Use /upgrade to try again.");
      return;
    }

    if (data.startsWith("paid_")) {
      const reference = data.replace("paid_", "");
      const pending = pendingPayments.get(chatId);
      if (!pending || pending.reference !== reference) {
        await bot.sendMessage(chatId, "Please send your receipt screenshot first.");
        return;
      }
      const payment = await db.select().from(paymentsTable).where(eq(paymentsTable.reference, reference)).limit(1);
      if (!payment[0]?.receiptFileId) {
        await bot.sendMessage(chatId, "Please send your receipt screenshot before confirming.");
        return;
      }
      await routeToAdmin(chatId, pending.tier, reference, payment[0].receiptFileId, payment[0].receiptUrl ?? "");
      await bot.sendMessage(chatId,
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
  });

  bot.on("polling_error", (err) => logger.error({ err }, "Payment bot polling error"));
}
