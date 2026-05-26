import { performance } from "perf_hooks";
import { db } from "@workspace/db";
import { telemetryTable } from "@workspace/db";
import { logger } from "../lib/logger.js";

const MODEL_COST_PER_M: Record<string, { input: number; output: number }> = {
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
  "image-gen":             { input: 0.00,  output: 0.04  },
};

interface TelemetrySession {
  userId: number;
  projectId?: number;
  sessionId: string;
  startMs: number;
  filesChanged: number;
  linesAdded: number;
  linesRemoved: number;
}

const activeSessions = new Map<string, TelemetrySession>();

export function startSession(userId: number, projectId?: number): string {
  const sessionId = `${userId}-${Date.now()}`;
  activeSessions.set(sessionId, {
    userId,
    projectId,
    sessionId,
    startMs: performance.now(),
    filesChanged: 0,
    linesAdded: 0,
    linesRemoved: 0,
  });
  return sessionId;
}

export function recordFileDiff(sessionId: string, before: string, after: string): void {
  const session = activeSessions.get(sessionId);
  if (!session) return;
  const beforeLines = before.split("\n");
  const afterLines = after.split("\n");
  session.filesChanged++;
  const maxLen = Math.max(beforeLines.length, afterLines.length);
  let added = 0, removed = 0;
  for (let i = 0; i < maxLen; i++) {
    if (i >= beforeLines.length) added++;
    else if (i >= afterLines.length) removed++;
    else if (beforeLines[i] !== afterLines[i]) { added++; removed++; }
  }
  session.linesAdded += added;
  session.linesRemoved += removed;
}

export async function endSession(
  sessionId: string,
  actionType: string,
  model: string,
  inputTokens: number,
  outputTokens: number
): Promise<void> {
  const session = activeSessions.get(sessionId);
  if (!session) return;
  activeSessions.delete(sessionId);

  const durationMs = Math.round(performance.now() - session.startMs);
  const costs = MODEL_COST_PER_M[model] ?? { input: 0.50, output: 1.00 };
  const costUsd = (inputTokens / 1_000_000) * costs.input + (outputTokens / 1_000_000) * costs.output;

  try {
    await db.insert(telemetryTable).values({
      userId: session.userId,
      projectId: session.projectId,
      sessionId,
      actionType,
      model,
      inputTokens,
      outputTokens,
      costUsd,
      durationMs,
      filesChanged: session.filesChanged,
      linesAdded: session.linesAdded,
      linesRemoved: session.linesRemoved,
    });
  } catch (err) {
    logger.error({ err }, "Failed to write telemetry");
  }
}

export function summarize(sessionId: string): Record<string, unknown> {
  const s = activeSessions.get(sessionId);
  if (!s) return {};
  return {
    timeWorkedMs: Math.round(performance.now() - s.startMs),
    filesChanged: s.filesChanged,
    linesAdded: s.linesAdded,
    linesRemoved: s.linesRemoved,
  };
}

// ─── Lightweight one-shot telemetry recorder ──────────────────────────────────

interface TelemetryRecord {
  sessionId: string;
  action: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  projectId?: number;
}

export async function recordTelemetry(record: TelemetryRecord): Promise<void> {
  try {
    await db.insert(telemetryTable).values({
      sessionId: record.sessionId,
      actionType: record.action,
      model: record.model,
      inputTokens: record.inputTokens,
      outputTokens: record.outputTokens,
      costUsd: record.costUsd,
      durationMs: 0,
      filesChanged: 0,
      linesAdded: 0,
      linesRemoved: 0,
    });
  } catch (err) {
    logger.warn({ err }, "recordTelemetry: failed to write");
  }
}

// ─── Dynamic Asset Hydration Engine ──────────────────────────────────────────
// Injects royalty-free CDN image URLs into HTML/EJS based on project context.

interface AssetMap { [placeholder: string]: string }

const CONTEXT_ASSETS: Array<{ keywords: RegExp; assets: AssetMap }> = [
  {
    keywords: /restaurant|food|cafe|menu|eat|cuisine|dine|chef|cook/i,
    assets: {
      "HERO_IMAGE":    "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1600&q=80&auto=format&fit=crop",
      "FOOD_IMAGE_1":  "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=800&q=80&auto=format&fit=crop",
      "FOOD_IMAGE_2":  "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=800&q=80&auto=format&fit=crop",
      "FOOD_IMAGE_3":  "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=800&q=80&auto=format&fit=crop",
      "INTERIOR":      "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=1200&q=80&auto=format&fit=crop",
    },
  },
  {
    keywords: /portfolio|designer|developer|creative|freelance|artist/i,
    assets: {
      "HERO_IMAGE":    "https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=1600&q=80&auto=format&fit=crop",
      "WORK_IMAGE_1":  "https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=800&q=80&auto=format&fit=crop",
      "WORK_IMAGE_2":  "https://images.unsplash.com/photo-1555066931-4365d14431b9?w=800&q=80&auto=format&fit=crop",
      "AVATAR":        "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&q=80&auto=format&fit=crop",
    },
  },
  {
    keywords: /fashion|clothing|style|wear|outfit|boutique|shop|store|apparel/i,
    assets: {
      "HERO_IMAGE":    "https://images.unsplash.com/photo-1445205170230-053b83016050?w=1600&q=80&auto=format&fit=crop",
      "PRODUCT_1":     "https://images.unsplash.com/photo-1572804013427-4d7ca7268217?w=600&q=80&auto=format&fit=crop",
      "PRODUCT_2":     "https://images.unsplash.com/photo-1585386959984-a4155224a1ad?w=600&q=80&auto=format&fit=crop",
      "PRODUCT_3":     "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=600&q=80&auto=format&fit=crop",
      "BANNER":        "https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=1200&q=80&auto=format&fit=crop",
    },
  },
  {
    keywords: /travel|tour|hotel|vacation|destination|trip|holiday|adventure/i,
    assets: {
      "HERO_IMAGE":    "https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=1600&q=80&auto=format&fit=crop",
      "DESTINATION_1": "https://images.unsplash.com/photo-1539037116277-4db20889f2d4?w=800&q=80&auto=format&fit=crop",
      "DESTINATION_2": "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&q=80&auto=format&fit=crop",
      "DESTINATION_3": "https://images.unsplash.com/photo-1527631746610-bca00a040d60?w=800&q=80&auto=format&fit=crop",
    },
  },
  {
    keywords: /tech|startup|saas|app|software|platform|digital|ai|crypto|blockchain/i,
    assets: {
      "HERO_IMAGE":    "https://images.unsplash.com/photo-1518770660439-4636190af475?w=1600&q=80&auto=format&fit=crop",
      "FEATURE_1":     "https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=800&q=80&auto=format&fit=crop",
      "FEATURE_2":     "https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=800&q=80&auto=format&fit=crop",
      "DASHBOARD_BG":  "https://images.unsplash.com/photo-1563986768609-322da13575f3?w=1200&q=80&auto=format&fit=crop",
    },
  },
  {
    keywords: /fitness|gym|health|wellness|workout|sport|yoga|nutrition/i,
    assets: {
      "HERO_IMAGE":    "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=1600&q=80&auto=format&fit=crop",
      "WORKOUT_1":     "https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=800&q=80&auto=format&fit=crop",
      "WORKOUT_2":     "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=800&q=80&auto=format&fit=crop",
      "TRAINER":       "https://images.unsplash.com/photo-1476480862126-209bfaa8edc8?w=600&q=80&auto=format&fit=crop",
    },
  },
  {
    keywords: /real.?estate|property|house|home|apartment|rent|mortgage|listing/i,
    assets: {
      "HERO_IMAGE":    "https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=1600&q=80&auto=format&fit=crop",
      "PROPERTY_1":    "https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=800&q=80&auto=format&fit=crop",
      "PROPERTY_2":    "https://images.unsplash.com/photo-1502005229762-cf1b2da7c5d6?w=800&q=80&auto=format&fit=crop",
      "INTERIOR":      "https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=800&q=80&auto=format&fit=crop",
    },
  },
];

// Generic fallback assets for any project type
const GENERIC_ASSETS: AssetMap = {
  "HERO_IMAGE":  "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1600&q=80&auto=format&fit=crop",
  "SECTION_BG":  "https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=1200&q=80&auto=format&fit=crop",
  "CARD_IMAGE":  "https://images.unsplash.com/photo-1481487196290-c152efe083f5?w=600&q=80&auto=format&fit=crop",
  "AVATAR":      "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400&q=80&auto=format&fit=crop",
  "THUMBNAIL":   "https://images.unsplash.com/photo-1485827404703-89b55fcc595e?w=400&q=80&auto=format&fit=crop",
};

/**
 * Returns a map of context-appropriate CDN image URLs for a project.
 * These should be injected into generated HTML to replace placeholder img srcs.
 */
export function hydrateProjectAssets(promptContext: string): AssetMap {
  for (const { keywords, assets } of CONTEXT_ASSETS) {
    if (keywords.test(promptContext)) {
      return { ...GENERIC_ASSETS, ...assets };
    }
  }
  return { ...GENERIC_ASSETS };
}

/**
 * Replaces placeholder image src attributes in HTML with hydrated CDN URLs.
 * Targets common patterns like src="HERO_IMAGE", src="{{HERO_IMAGE}}", background-image: url(HERO_IMAGE)
 */
export function injectAssetsIntoHtml(html: string, assets: AssetMap): string {
  let result = html;
  for (const [key, url] of Object.entries(assets)) {
    // Replace exact placeholder strings in src/href/url() positions
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    result = result
      .replace(new RegExp(`src=["']${escaped}["']`, "g"), `src="${url}"`)
      .replace(new RegExp(`href=["']${escaped}["']`, "g"), `href="${url}"`)
      .replace(new RegExp(`url\\(${escaped}\\)`, "g"), `url(${url})`)
      .replace(new RegExp(`url\\(['"]${escaped}['"]\\)`, "g"), `url('${url}')`)
      .replace(new RegExp(`["']${escaped}["']`, "g"), `"${url}"`);
  }
  // Also replace common empty placeholder patterns with generic hero
  result = result.replace(/src=["'](https?:\/\/placeholder\.com[^"']*)["']/g, `src="${assets["HERO_IMAGE"] ?? GENERIC_ASSETS["HERO_IMAGE"]}"`);
  return result;
}
