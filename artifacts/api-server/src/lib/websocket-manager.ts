import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage } from "http";
import { logger } from "./logger.js";

type ProjectId = string;

const projectSockets = new Map<ProjectId, Set<WebSocket>>();
const globalSockets = new Set<WebSocket>();

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
    } else {
      globalSockets.add(socket);
      logger.info("WS: global client connected");
      socket.send(JSON.stringify({ type: "connected", scope: "global" }));
    }

    socket.on("close", () => {
      if (projectId) {
        projectSockets.get(projectId)?.delete(socket);
        if (projectSockets.get(projectId)?.size === 0) projectSockets.delete(projectId);
        logger.info({ projectId }, "WS: client unsubscribed from project");
      } else {
        globalSockets.delete(socket);
      }
    });

    socket.on("error", (err) => {
      logger.warn({ err }, "WS socket error");
    });

    socket.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString()) as { type: string; projectId?: string };
        if (msg.type === "subscribe" && msg.projectId) {
          const pid = msg.projectId;
          if (!projectSockets.has(pid)) projectSockets.set(pid, new Set());
          projectSockets.get(pid)!.add(socket);
          socket.send(JSON.stringify({ type: "subscribed", projectId: pid }));
        }
        if (msg.type === "ping") {
          socket.send(JSON.stringify({ type: "pong" }));
        }
      } catch { /* non-JSON messages ignored */ }
    });
  });

  logger.info("WebSocket server initialised at /runtime/ws");
  return wss;
}

function sendToSocket(socket: WebSocket, payload: unknown): void {
  if (socket.readyState === WebSocket.OPEN) {
    try {
      socket.send(JSON.stringify(payload));
    } catch (err) {
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
  broadcastToProject(projectId, {
    type: "log",
    projectId,
    level,
    line,
    ts: Date.now(),
  });
}

export function broadcastStatus(projectId: string, status: string, extra?: Record<string, unknown>): void {
  broadcastToProject(projectId, {
    type: "status",
    projectId,
    status,
    ts: Date.now(),
    ...extra,
  });
}

export function broadcastRuntimeEvent(projectId: string, event: string, data: Record<string, unknown>): void {
  broadcastToProject(projectId, {
    type: "runtime_event",
    event,
    projectId,
    ...data,
    ts: Date.now(),
  });
}

export function getConnectionCount(): { projects: number; global: number; total: number } {
  let projectCount = 0;
  for (const [, sockets] of projectSockets) projectCount += sockets.size;
  return {
    projects: projectCount,
    global: globalSockets.size,
    total: projectCount + globalSockets.size,
  };
}

export function getWebSocketServer(): WebSocketServer | null {
  return wss;
}
