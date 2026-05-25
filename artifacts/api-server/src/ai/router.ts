import OpenAI from "openai";
import { decrypt } from "../utils/crypto.js";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger.js";

const GATEWAY_URL = process.env.AI_GATEWAY_URL ?? "https://aimodelapi.onrender.com/v1";
const GATEWAY_KEY = process.env.AI_GATEWAY_KEY ?? "";

export type TaskType = "planning" | "coding" | "fixing" | "chat" | "image" | "ui";

const TASK_MODEL_MAP: Record<TaskType, string[]> = {
  planning: ["deepseek-r1", "kimi-k2-thinking"],
  coding:   ["dev-x", "gpt-oss-120b", "grok-3"],
  fixing:   ["gpt-5-nano", "gemini-2.5-flash-lite", "mistral"],
  chat:     ["gpt-5-nano", "gemini-2.5-flash-lite", "mistral"],
  image:    ["image-gen", "qwen-max-image", "gemini-flash-image"],
  ui:       ["grok-3-mini", "llama-3.3-70b-instruct"],
};

const STARTER_MODELS = new Set(["gpt-5-nano", "gemini-2.5-flash-lite", "mistral"]);

function pickModel(taskType: TaskType, tier: string): string {
  const candidates = TASK_MODEL_MAP[taskType] ?? ["gpt-5-nano"];
  if (tier === "starter") {
    return candidates.find(m => STARTER_MODELS.has(m)) ?? "gpt-5-nano";
  }
  if (tier === "pro") {
    return candidates.find(m => m !== "deepseek-r1" && m !== "kimi-k2-thinking") ?? candidates[0] ?? "gpt-5-nano";
  }
  return candidates[0] ?? "deepseek-r1";
}

async function getClientForUser(telegramId?: number): Promise<{ client: OpenAI; key: string }> {
  if (telegramId) {
    try {
      const users = await db.select().from(usersTable).where(eq(usersTable.telegramId, telegramId)).limit(1);
      if (users[0]?.apiKey) {
        const decrypted = decrypt(users[0].apiKey);
        const client = new OpenAI({ apiKey: decrypted, baseURL: GATEWAY_URL });
        return { client, key: decrypted };
      }
    } catch (_) {}
  }
  const client = new OpenAI({ apiKey: GATEWAY_KEY, baseURL: GATEWAY_URL });
  return { client, key: GATEWAY_KEY };
}

export interface RouterResult {
  content: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export async function routeTask(
  taskType: TaskType,
  prompt: string,
  tier: string = "starter",
  telegramId?: number,
  systemPrompt?: string,
): Promise<RouterResult> {
  const model = pickModel(taskType, tier);
  const { client } = await getClientForUser(telegramId);

  logger.info({ taskType, model, tier }, "Routing AI task");

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
  if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
  messages.push({ role: "user", content: prompt });

  const completion = await client.chat.completions.create({
    model,
    messages,
    temperature: taskType === "planning" ? 0.3 : 0.7,
  });

  const content = completion.choices[0]?.message?.content ?? "";
  const inputTokens = completion.usage?.prompt_tokens ?? 0;
  const outputTokens = completion.usage?.completion_tokens ?? 0;

  const COST_MAP: Record<string, { input: number; output: number }> = {
    "deepseek-r1":           { input: 0.55,  output: 2.19  },
    "kimi-k2-thinking":      { input: 0.60,  output: 2.50  },
    "dev-x":                 { input: 0.90,  output: 1.80  },
    "gpt-oss-120b":          { input: 1.10,  output: 2.20  },
    "grok-3":                { input: 3.00,  output: 15.00 },
    "gpt-5-nano":            { input: 0.15,  output: 0.60  },
    "gemini-2.5-flash-lite": { input: 0.10,  output: 0.40  },
    "mistral":               { input: 0.25,  output: 0.75  },
    "grok-3-mini":           { input: 0.30,  output: 0.50  },
    "llama-3.3-70b-instruct":{ input: 0.20,  output: 0.40  },
  };
  const costs = COST_MAP[model] ?? { input: 0.50, output: 1.00 };
  const costUsd = (inputTokens / 1_000_000) * costs.input + (outputTokens / 1_000_000) * costs.output;

  return { content, model, inputTokens, outputTokens, costUsd };
}

export async function generateImage(
  prompt: string,
  telegramId?: number,
): Promise<string> {
  const { client } = await getClientForUser(telegramId);
  const response = await client.images.generate({
    model: "image-gen",
    prompt,
    n: 1,
    size: "1024x1024",
  });
  return response.data[0]?.url ?? "";
}
