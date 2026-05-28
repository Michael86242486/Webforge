import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage } from "http";
import { spawn, type ChildProcessWithoutNullStreams } from "child_process";
import { logger } from "./logger.js";

type ProjectId = string;

const projectSockets = new Map<ProjectId, Set<WebSocket>>();
const globalSockets = new Set<WebSocket>();

// ─── Terminal Sessions ─────────────────────────────────────────────────────────
// One persistent bash process per projectId, shared across all connected clients.

interface TerminalSession {
  proc: ChildProcessWithoutNullStreams;
  projectId: string;
  workDir: string;
  buffer: string; // last 10k chars of output for late-joiners
}

const terminalSessions = new Map<ProjectId, TerminalSession>();

function spawnTerminal(projectId: string, workDir: string): TerminalSession {
  const proc = spawn("/bin/bash", ["-i"], {
    cwd: workDir,
    env: { ...process.env, TERM: "xterm-256color", HOME: workDir },
    stdio: ["pipe", "pipe", "pipe"],
  }) as ChildProcessWithoutNullStreams;

  const session: TerminalSession = { proc, projectId, workDir, buffer: "" };

  const handleData = (chunk: Buffer) => {
    const text = chunk.toString("utf8");
    session.buffer = (session.buffer + text).slice(-10_000);
    broadcastToProject(projectId, { type: "terminal_output", data: text, ts: Date.now() });
  };

  proc.stdout.on("data", handleData);
  proc.stderr.on("data", handleData);

  proc.on("exit", (code) => {
    broadcastToProject(projectId, {
      type: "terminal_output",
      data: `\r\n[Process exited with code ${code ?? 0}]\r\n`,
      ts: Date.now(),
    });
    terminalSessions.delete(projectId);
  });

  proc.on("error", (err) => {
    logger.warn({ err, projectId }, "Terminal process error");
    broadcastToProject(projectId, {
      type: "terminal_output",
      data: `\r\n[Terminal error: ${err.message}]\r\n`,
      ts: Date.now(),
    });
  });

  terminalSessions.set(projectId, session);
  logger.info({ projectId, workDir }, "WS: terminal session spawned");
  return session;
}

function getOrSpawnTerminal(projectId: string, workDir: string): TerminalSession {
  const existing = terminalSessions.get(projectId);
  if (existing) return existing;
  return spawnTerminal(projectId, workDir);
}

// ─── WebSocket Server ──────────────────────────────────────────────────────────

let wss: WebSocketServer | null = null;

export function initWebSocketServer(server: import("http").Server): WebSocketServer {
  wss = new WebSocketServer({ server, path: "/runtime/ws" });

  wss.on("connection", (socket: WebSocket, req: IncomingMessage) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const projectId = url.searchParams.get("projectId") ?? null;

    if (projectId) {
      if (!projectSockets.has(projectId)) projectSockets.set(projectId, new Set());
      projectSockets.get(projectId)!.add(socket);
      logger.info({ projectId }, "WS: client subscribed to project");
      socket.send(JSON.stringify({ type: "connected", projectId }));

      // Send buffered terminal output to late-joining clients
      const session = terminalSessions.get(projectId);
      if (session?.buffer) {
        socket.send(JSON.stringify({ type: "terminal_history", data: session.buffer }));
      }
    } else {
      globalSockets.add(socket);
      logger.info("WS: global client connected");
      socket.send(JSON.stringify({ type: "connected", scope: "global" }));
    }

    socket.on("close", () => {
      if (projectId) {
        projectSockets.get(projectId)?.delete(socket);
        const remaining = projectSockets.get(projectId)?.size ?? 0;
        if (remaining === 0) {
          projectSockets.delete(projectId);
          // Clean up terminal session when last client leaves
          const session = terminalSessions.get(projectId);
          if (session) {
            try { session.proc.kill("SIGTERM"); } catch {}
            terminalSessions.delete(projectId);
            logger.info({ projectId }, "WS: terminal session cleaned up (no clients)");
          }
        }
        logger.info({ projectId }, "WS: client unsubscribed from project");
      } else {
        globalSockets.delete(socket);
      }
    });

    socket.on("error", (err) => {
      logger.warn({ err }, "WS socket error");
    });

    socket.on("message", (rawData) => {
      try {
        const msg = JSON.parse(rawData.toString()) as {
          type: string;
          projectId?: string;
          workDir?: string;
          data?: string;
          cols?: number;
          rows?: number;
        };

        // ── Subscribe to a project ─────────────────────────────────────────
        if (msg.type === "subscribe" && msg.projectId) {
          const pid = msg.projectId;
          if (!projectSockets.has(pid)) projectSockets.set(pid, new Set());
          projectSockets.get(pid)!.add(socket);
          socket.send(JSON.stringify({ type: "subscribed", projectId: pid }));
        }

        // ── Ping / Pong ────────────────────────────────────────────────────
        if (msg.type === "ping") {
          socket.send(JSON.stringify({ type: "pong" }));
        }

        // ── Terminal: start or attach ──────────────────────────────────────
        if (msg.type === "terminal_start" && msg.projectId && msg.workDir) {
          const session = getOrSpawnTerminal(msg.projectId, msg.workDir);
          socket.send(JSON.stringify({ type: "terminal_ready", projectId: msg.projectId }));
          if (session.buffer) {
            socket.send(JSON.stringify({ type: "terminal_history", data: session.buffer }));
          }
        }

        // ── Terminal: user typed something ─────────────────────────────────
        if (msg.type === "terminal_input" && msg.projectId && msg.data != null) {
          const pid = msg.projectId;
          let session = terminalSessions.get(pid);
          if (!session && msg.workDir) {
            session = spawnTerminal(pid, msg.workDir);
          }
          if (session) {
            try {
              session.proc.stdin.write(msg.data);
            } catch (err) {
              logger.warn({ err, pid }, "WS: failed to write to terminal stdin");
            }
          }
        }

        // ── Terminal: kill and restart ─────────────────────────────────────
        if (msg.type === "terminal_kill" && msg.projectId) {
          const session = terminalSessions.get(msg.projectId);
          if (session) {
            try { session.proc.kill("SIGTERM"); } catch {}
            terminalSessions.delete(msg.projectId);
          }
          if (msg.workDir) {
            const fresh = spawnTerminal(msg.projectId, msg.workDir);
            socket.send(JSON.stringify({ type: "terminal_ready", projectId: msg.projectId }));
          }
        }

      } catch { /* non-JSON messages ignored */ }
    });
  });

  logger.info("WebSocket server initialised at /runtime/ws");
  return wss;
}

// ─── Send Helpers ──────────────────────────────────────────────────────────────

function sendToSocket(socket: WebSocket, payload: unknown): void {
  if (socket.readyState === WebSocket.OPEN) {
    try { socket.send(JSON.stringify(payload)); } catch (err) {
      logger.warn({ err }, "WS: failed to send message");
    }
  }
}

export function broadcastToProject(projectId: string, payload: unknown): void {
  const sockets = projectSockets.get(projectId);
  if (!sockets) return;
  for (const socket of sockets) sendToSocket(socket, payload);
}

export function broadcastToAll(payload: unknown): void {
  for (const socket of globalSockets) sendToSocket(socket, payload);
  for (const [, sockets] of projectSockets) {
    for (const socket of sockets) sendToSocket(socket, payload);
  }
}

export function broadcastLog(projectId: string, line: string, level: "info" | "warn" | "error" = "info"): void {
  broadcastToProject(projectId, { type: "log", projectId, level, line, ts: Date.now() });
}

export function broadcastStatus(projectId: string, status: string, extra?: Record<string, unknown>): void {
  broadcastToProject(projectId, { type: "status", projectId, status, ts: Date.now(), ...extra });
}

export function broadcastRuntimeEvent(projectId: string, event: string, data: Record<string, unknown>): void {
  broadcastToProject(projectId, { type: "runtime_event", event, projectId, ...data, ts: Date.now() });
}

export function getConnectionCount(): { projects: number; global: number; total: number } {
  let projectCount = 0;
  for (const [, sockets] of projectSockets) projectCount += sockets.size;
  return { projects: projectCount, global: globalSockets.size, total: projectCount + globalSockets.size };
}

export function getWebSocketServer(): WebSocketServer | null {
  return wss;
}

export function getTerminalSessionCount(): number {
  return terminalSessions.size;
}
