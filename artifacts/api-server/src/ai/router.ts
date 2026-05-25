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

export interface DeepBuildResult {
  finalCode: string;
  rounds: number;
  model: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
  errors: string[];
}

export async function deepBuildLoop(
  initialPrompt: string,
  telegramId: number,
  systemPrompt: string,
  maxRounds = 5,
  onRound?: (round: number, maxRounds: number, issues: string[]) => void,
): Promise<DeepBuildResult> {
  const model = "dev-x";
  const { client } = await getClientForUser(telegramId);

  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCostUsd = 0;
  const errors: string[] = [];

  const COST_MAP: Record<string, { input: number; output: number }> = {
    "dev-x": { input: 0.90, output: 1.80 },
  };
  const costs = COST_MAP[model] ?? { input: 0.90, output: 1.80 };

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: `${initialPrompt}\n\nIMPORTANT: Output production-ready, complete, runnable code only. No placeholders, no TODO comments, no truncation. Include all imports, error handling, and a working entry point.`,
    },
  ];

  let lastCode = "";

  for (let round = 1; round <= maxRounds; round++) {
    logger.info({ round, maxRounds, telegramId }, "DeepBuild round");

    const completion = await client.chat.completions.create({
      model,
      messages,
      temperature: 0.2,
    });

    const content = completion.choices[0]?.message?.content ?? "";
    const inputTokens = completion.usage?.prompt_tokens ?? 0;
    const outputTokens = completion.usage?.completion_tokens ?? 0;
    totalInputTokens += inputTokens;
    totalOutputTokens += outputTokens;
    totalCostUsd += (inputTokens / 1_000_000) * costs.input + (outputTokens / 1_000_000) * costs.output;

    messages.push({ role: "assistant", content });
    lastCode = content;

    const lintErrors = detectCodeIssues(content);
    if (lintErrors.length === 0) {
      logger.info({ round }, "DeepBuild: no issues detected, stopping early");
      break;
    }

    errors.push(...lintErrors);
    onRound?.(round, maxRounds, lintErrors);

    if (round < maxRounds) {
      messages.push({
        role: "user",
        content: `Round ${round} review found these issues that must be fixed:\n\n${lintErrors.map((e, i) => `${i + 1}. ${e}`).join("\n")}\n\nFix ALL of them. Output the complete corrected code — no truncation, no ellipsis, no comments saying "rest of code here".`,
      });
    }
  }

  return {
    finalCode: lastCode,
    rounds: errors.length === 0 ? 1 : Math.min(maxRounds, errors.length + 1),
    model,
    totalInputTokens,
    totalOutputTokens,
    totalCostUsd,
    errors,
  };
}

function detectCodeIssues(code: string): string[] {
  const issues: string[] = [];
  const lower = code.toLowerCase();

  if (/\btodo\b|\bfixme\b|\bplaceholder\b/.test(lower)) {
    issues.push("Code contains TODO/FIXME/placeholder markers — replace with real implementation");
  }
  if (/\.\.\.|\[rest of/.test(code)) {
    issues.push("Code is truncated (contains '...' or '[rest of') — output the complete file");
  }
  if (/require\(['"]/.test(code) && /^import\s/m.test(code)) {
    issues.push("Mixed CommonJS require() and ES module import — pick one module system");
  }
  const openBraces = (code.match(/\{/g) ?? []).length;
  const closeBraces = (code.match(/\}/g) ?? []).length;
  if (Math.abs(openBraces - closeBraces) > 2) {
    issues.push(`Unbalanced braces: ${openBraces} opening vs ${closeBraces} closing`);
  }
  if (!/export\s+default|module\.exports|export\s+\{|export\s+function|export\s+const|export\s+class/.test(code)) {
    if (code.length > 200) {
      issues.push("No exports detected — ensure the module exports its main interface");
    }
  }
  return issues;
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
