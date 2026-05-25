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
