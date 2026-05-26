import TelegramBot from "node-telegram-bot-api";
import { logger } from "../lib/logger.js";

// ─── Markdown Escaping ─────────────────────────────────────────────────────────

/**
 * Escape special characters for Telegram Markdown V1.
 * Always call this on dynamic / AI-generated content before embedding it
 * inside a Markdown-formatted message.
 */
export function escapeMd(text: string): string {
  return text.replace(/[_*`\[\\]/g, (c) => `\\${c}`);
}

/**
 * Strip all Markdown formatting characters from text (for plain-text fallback).
 */
function stripMd(text: string): string {
  return text.replace(/[*_`\[\]\\]/g, "");
}

// ─── Safe Send ────────────────────────────────────────────────────────────────

type SendOpts = TelegramBot.SendMessageOptions;
type EditOpts = Omit<TelegramBot.EditMessageTextOptions, "chat_id" | "message_id">;

/**
 * Send a Telegram message safely.
 * - If Telegram rejects due to Markdown parse failure (400), retries without parse_mode.
 * - Never throws — all errors are logged and null is returned.
 */
export async function safeSend(
  bot: TelegramBot,
  chatId: number,
  text: string,
  opts: SendOpts = {},
): Promise<TelegramBot.Message | null> {
  const truncated = text.slice(0, 4096);
  try {
    return await bot.sendMessage(chatId, truncated, opts);
  } catch (err: unknown) {
    if (isMarkdownError(err) && opts.parse_mode) {
      try {
        const { parse_mode: _pm, ...rest } = opts;
        return await bot.sendMessage(chatId, stripMd(truncated), rest);
      } catch (e2) {
        logger.warn({ err: e2, chatId }, "safeSend: plain-text fallback failed");
        return null;
      }
    }
    logger.warn({ err, chatId }, "safeSend: send failed");
    return null;
  }
}

/**
 * Edit a message safely, with Markdown → plain-text fallback.
 */
export async function safeEdit(
  bot: TelegramBot,
  chatId: number,
  messageId: number,
  text: string,
  opts: EditOpts = {},
): Promise<void> {
  const truncated = text.slice(0, 4096);
  try {
    await bot.editMessageText(truncated, { chat_id: chatId, message_id: messageId, ...opts });
  } catch (err: unknown) {
    if (isMarkdownError(err) && opts.parse_mode) {
      try {
        const { parse_mode: _pm, ...rest } = opts;
        await bot.editMessageText(stripMd(truncated), { chat_id: chatId, message_id: messageId, ...rest });
      } catch (e2) {
        logger.warn({ err: e2 }, "safeEdit: plain-text fallback failed");
      }
      return;
    }
    logger.warn({ err }, "safeEdit: edit failed");
  }
}

/**
 * Fire-and-forget typing indicator.
 */
export function sendTyping(bot: TelegramBot, chatId: number): void {
  bot.sendChatAction(chatId, "typing").catch(() => {});
}

/**
 * Safely delete a message (ignores errors — e.g. message already deleted).
 */
export async function safeDelete(bot: TelegramBot, chatId: number, messageId: number): Promise<void> {
  try { await bot.deleteMessage(chatId, messageId); } catch {}
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isMarkdownError(err: unknown): boolean {
  const e = err as { response?: { body?: { error_code?: number; description?: string } } };
  if (e?.response?.body?.error_code === 400) return true;
  const desc = e?.response?.body?.description ?? "";
  return /parse|entity|markdown/i.test(desc);
}
