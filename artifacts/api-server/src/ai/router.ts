import OpenAI from "openai";
import { decrypt } from "../utils/crypto.js";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger.js";

const GATEWAY_URL = process.env.AI_GATEWAY_URL ?? "https://aimodelapi.onrender.com/v1";
const GATEWAY_KEY = process.env.AI_GATEWAY_KEY ?? "";

export type TaskType = "planning" | "coding" | "fixing" | "chat" | "image" | "ui";

const WEBFORGE_DEFAULT_SYSTEM = `You are WebForge — an elite autonomous AI platform engine. You ONLY discuss software, app building, and the WebForge platform.

HARD RULES:
- You ALWAYS respond in English regardless of what language the user writes in.
- You NEVER break character or act as a general-purpose chatbot.
- You NEVER give advice about AWS, Docker, cloud providers, or generic computing.
- You NEVER say "How can I help you today?" as a standalone reply.
- If someone asks who you are: "I am WebForge — an autonomous build engine. Describe what you want to build."
- Keep responses concise, direct, and action-oriented.`;

const TASK_MODEL_MAP: Record<TaskType, string[]> = {
  planning: ["deepseek-r1", "kimi-k2-thinking"],
  coding:   ["dev-x", "gpt-oss-120b", "grok-3"],
  fixing:   ["dev-x", "gpt-5-nano", "gemini-2.5-flash-lite"],
  chat:     ["gpt-5-nano", "gemini-2.5-flash-lite", "mistral"],
  image:    ["image-gen"],
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

function modelsForTier(taskType: TaskType, tier: string): string[] {
  const all = TASK_MODEL_MAP[taskType] ?? ["gpt-5-nano"];
  if (tier === "starter") {
    const starters = all.filter(m => STARTER_MODELS.has(m));
    return starters.length ? starters : ["gpt-5-nano"];
  }
  if (tier === "pro") {
    const pros = all.filter(m => m !== "deepseek-r1" && m !== "kimi-k2-thinking");
    return pros.length ? pros : all;
  }
  return all; // elite gets full list in order
}

export async function routeTask(
  taskType: TaskType,
  prompt: string,
  tier: string = "starter",
  telegramId?: number,
  systemPrompt?: string,
): Promise<RouterResult> {
  const { client } = await getClientForUser(telegramId);
  const sysContent = systemPrompt ?? WEBFORGE_DEFAULT_SYSTEM;
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: sysContent },
    { role: "user", content: prompt },
  ];
  const temperature = taskType === "planning" ? 0.3 : taskType === "coding" ? 0.15 : 0.6;

  // ── Failover across all models for the tier ─────────────────────────────
  const candidates = modelsForTier(taskType, tier);
  let lastErr: unknown;

  for (const model of candidates) {
    try {
      logger.info({ taskType, model, tier }, "Routing AI task");
      const completion = await client.chat.completions.create({ model, messages, temperature });
      const content = completion.choices[0]?.message?.content ?? "";
      const inputTokens = completion.usage?.prompt_tokens ?? 0;
      const outputTokens = completion.usage?.completion_tokens ?? 0;
      const costs = COST_MAP[model] ?? { input: 0.50, output: 1.00 };
      const costUsd = (inputTokens / 1_000_000) * costs.input + (outputTokens / 1_000_000) * costs.output;
      return { content, model, inputTokens, outputTokens, costUsd };
    } catch (err) {
      logger.warn({ model, err }, "Model failed — trying next candidate");
      lastErr = err;
    }
  }

  // Final fallback: gpt-5-nano on a clean client (never throws)
  try {
    logger.warn({ candidates }, "All candidates failed — using gpt-5-nano emergency fallback");
    const fallbackClient = new OpenAI({ apiKey: GATEWAY_KEY, baseURL: GATEWAY_URL });
    const completion = await fallbackClient.chat.completions.create({
      model: "gpt-5-nano", messages, temperature,
    });
    const content = completion.choices[0]?.message?.content ?? "";
    return { content, model: "gpt-5-nano", inputTokens: 0, outputTokens: 0, costUsd: 0 };
  } catch {
    throw lastErr ?? new Error("All AI models failed");
  }
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
  const costs = COST_MAP[model] ?? { input: 0.90, output: 1.80 };

  // Inject the WebForge system identity AND code-output constraints together
  const codeSystemPrompt = `${systemPrompt}

━━━ ABSOLUTE CODE OUTPUT RULES ━━━
You are generating SOURCE CODE FILES for a user's application. These are MANDATORY:

1. EVERY file in the list must be 100% complete with real, working code.
2. NEVER write empty files, placeholder comments like "// code here", "// TODO", or "..." truncations.
3. NEVER write "rest of code remains the same" — always write the FULL code.
4. The server entry point MUST use: const PORT = process.env.PORT || 3000;
5. package.json MUST have a "start" script: "node src/index.js" (or whichever entry file you create).
6. Use CommonJS (require/module.exports) for all server files — NOT ES modules (no "import" statements in .js files).
7. The average code file should be 50-200 lines. If you write less than 20 lines per file, you have NOT fulfilled the requirement.`;

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: codeSystemPrompt },
    { role: "user", content: initialPrompt },
  ];

  let lastCode = "";
  let completedRounds = 0;

  for (let round = 1; round <= maxRounds; round++) {
    logger.info({ round, maxRounds, telegramId }, "DeepBuild round");

    const completion = await client.chat.completions.create({
      model,
      messages,
      temperature: 0.1,
      max_tokens: 16000,
    });

    const content = completion.choices[0]?.message?.content ?? "";
    const inputTokens = completion.usage?.prompt_tokens ?? 0;
    const outputTokens = completion.usage?.completion_tokens ?? 0;
    totalInputTokens += inputTokens;
    totalOutputTokens += outputTokens;
    totalCostUsd += (inputTokens / 1_000_000) * costs.input + (outputTokens / 1_000_000) * costs.output;

    messages.push({ role: "assistant", content });
    lastCode = content;
    completedRounds = round;

    const lintErrors = detectCodeIssues(content);
    onRound?.(round, maxRounds, lintErrors);

    if (lintErrors.length === 0) {
      logger.info({ round }, "DeepBuild: clean pass, stopping");
      break;
    }

    errors.push(...lintErrors);

    if (round < maxRounds) {
      messages.push({
        role: "user",
        content: `CORRECTIONS REQUIRED for round ${round + 1}:\n\n${lintErrors.map((e, i) => `${i + 1}. ${e}`).join("\n")}\n\nOutput ALL files again with these issues fixed. Do NOT truncate. Do NOT use placeholders. Write every file completely.`,
      });
    }
  }

  return {
    finalCode: lastCode,
    rounds: completedRounds,
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

  // Must have actual file markers — if no files found that's an issue
  const hasFileMarkers = /===\s*FILE:/i.test(code) || /```[\w]*\n/.test(code);
  if (!hasFileMarkers) {
    issues.push("No code files detected in output — use '=== FILE: path ===' markers for each file");
    return issues; // No point checking further
  }

  if (/\btodo\b|\bfixme\b/i.test(lower) && /\/\/\s*(todo|fixme)/i.test(code)) {
    issues.push("Code contains TODO/FIXME markers — replace with real implementation");
  }
  if (/(?<!\.)\.\.\.(?!\w)/.test(code) && /\[\s*rest\s+of|\/\/\s*rest\s+of|#\s*rest\s+of/i.test(code)) {
    issues.push("Code is truncated — output the COMPLETE file contents, no shortcuts");
  }
  // Check for suspiciously short responses (likely empty/placeholder files)
  const fileBlocks = code.match(/===\s*FILE:[\s\S]*?===\s*END\s*FILE/g) ?? [];
  const shortFiles = fileBlocks.filter(block => block.replace(/===.*?===/g, "").trim().split("\n").length < 5);
  if (shortFiles.length > 0) {
    issues.push(`${shortFiles.length} file(s) appear empty or near-empty — write complete, working code for every file`);
  }

  return issues;
}

// ─── Pollinations AI — Official Primary Image Engine ─────────────────────────
//
// The old Render /v1/images/generations proxy has been removed.
// Pollinations AI is now the sole, direct image generation engine.
// Cost: $0.0000 (fully open-source and free).

export async function generateImage(
  prompt: string,
  _telegramId?: number,
): Promise<string> {
  const seed = Math.floor(Math.random() * 999999);
  // Clean the prompt: strip leading/trailing whitespace, collapse internal whitespace
  const cleanPrompt = prompt.trim().replace(/\s+/g, " ");
  const url = `https://image.pollinations.ai/p/${encodeURIComponent(cleanPrompt)}?width=1024&height=1024&nologo=true&enhance=true&seed=${seed}`;
  logger.info({ prompt: cleanPrompt.slice(0, 80), engine: "Pollinations-Primary" }, "Image generation request");
  return url;
}
