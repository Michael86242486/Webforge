/**
 * WebForge Node Connection API
 * Multi-tenant handshake routing for isolated sandbox workspaces.
 *
 * POST /v1/nodes/generate          — Create a new handshake code (admin/authenticated)
 * POST /v1/nodes/connect           — Bind a Telegram chat_id to a code
 * GET  /v1/nodes/status/:code      — Fetch node status and metadata
 * GET  /v1/nodes/list              — List all nodes
 * POST /v1/nodes/suspend/:code     — Suspend a node
 * DELETE /v1/nodes/:code           — Delete a node and its sandbox
 */

import { Router } from "express";
import type { Request, Response } from "express";
import {
  createNode,
  connectNode,
  getNode,
  getNodeByChatId,
  listNodes,
  suspendNode,
  deleteNode,
  sandboxWriteFile,
  sandboxListFiles,
  assertSandboxed,
} from "../utils/handshake.js";
import { logger } from "../lib/logger.js";

const router = Router();

// ─── POST /v1/nodes/generate ─────────────────────────────────────────────────
// Generate a new handshake connection code (node enters STANDBY state).
// The code is shared out-of-band with the external Telegram bot operator.

router.post("/v1/nodes/generate", async (req: Request, res: Response) => {
  try {
    const metadata = (req.body as { metadata?: Record<string, unknown> }).metadata ?? {};
    const node = await createNode(metadata);

    res.status(201).json({
      success: true,
      connection_code: node.connection_code,
      allocated_port: node.allocated_port,
      sandbox_path: node.sandbox_path,
      status: node.status,
      created_at: node.created_at,
      instructions: `Share the code "${node.connection_code}" with your Telegram bot. ` +
        `The bot must call POST /v1/nodes/connect with { code, chat_id } to activate the workspace.`,
    });
  } catch (err) {
    logger.error({ err }, "nodes/generate failed");
    res.status(500).json({ error: String(err) });
  }
});

// ─── POST /v1/nodes/connect ───────────────────────────────────────────────────
// Bind a Telegram chat_id to an existing code. Activates the node workspace.

router.post("/v1/nodes/connect", async (req: Request, res: Response) => {
  const { code, chat_id } = req.body as { code?: string; chat_id?: string };

  if (!code || !chat_id) {
    res.status(400).json({ error: "Both 'code' and 'chat_id' are required" });
    return;
  }

  try {
    const node = await connectNode(code, String(chat_id));

    res.json({
      success: true,
      connection_code: node.connection_code,
      telegram_chat_id: node.telegram_chat_id,
      allocated_port: node.allocated_port,
      sandbox_path: node.sandbox_path,
      status: node.status,
      message: `Workspace activated. Your isolated sandbox is ready on port ${node.allocated_port}.`,
    });
  } catch (err) {
    const msg = String(err);
    if (msg.includes("not found") || msg.includes("Invalid")) {
      res.status(404).json({ error: msg });
    } else if (msg.includes("suspended")) {
      res.status(403).json({ error: msg });
    } else if (msg.includes("already bound")) {
      res.status(409).json({ error: msg });
    } else {
      logger.error({ err, code }, "nodes/connect failed");
      res.status(500).json({ error: msg });
    }
  }
});

// ─── GET /v1/nodes/status/:code ──────────────────────────────────────────────

router.get("/v1/nodes/status/:code", async (req: Request, res: Response) => {
  try {
    const node = await getNode(req.params.code);
    if (!node) {
      res.status(404).json({ error: `Node "${req.params.code}" not found` });
      return;
    }

    const files = await sandboxListFiles(node.connection_code);

    res.json({
      connection_code: node.connection_code,
      telegram_chat_id: node.telegram_chat_id,
      allocated_port: node.allocated_port,
      sandbox_path: node.sandbox_path,
      status: node.status,
      created_at: node.created_at,
      updated_at: node.updated_at,
      sandbox_files: files.length,
      metadata: node.metadata,
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── GET /v1/nodes/lookup-by-chat/:chat_id ───────────────────────────────────

router.get("/v1/nodes/lookup-by-chat/:chat_id", async (req: Request, res: Response) => {
  try {
    const node = await getNodeByChatId(req.params.chat_id);
    if (!node) {
      res.status(404).json({ error: `No node found for chat_id "${req.params.chat_id}"` });
      return;
    }
    res.json({
      connection_code: node.connection_code,
      telegram_chat_id: node.telegram_chat_id,
      allocated_port: node.allocated_port,
      sandbox_path: node.sandbox_path,
      status: node.status,
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── GET /v1/nodes/list ──────────────────────────────────────────────────────

router.get("/v1/nodes/list", async (req: Request, res: Response) => {
  try {
    const status = req.query.status as "ACTIVE" | "STANDBY" | "SUSPENDED" | undefined;
    const nodes = await listNodes(status);

    res.json({
      total: nodes.length,
      nodes: nodes.map(n => ({
        connection_code: n.connection_code,
        telegram_chat_id: n.telegram_chat_id,
        allocated_port: n.allocated_port,
        status: n.status,
        created_at: n.created_at,
        updated_at: n.updated_at,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── POST /v1/nodes/suspend/:code ────────────────────────────────────────────

router.post("/v1/nodes/suspend/:code", async (req: Request, res: Response) => {
  try {
    await suspendNode(req.params.code);
    res.json({ success: true, message: `Node "${req.params.code}" suspended` });
  } catch (err) {
    const msg = String(err);
    res.status(msg.includes("not found") ? 404 : 500).json({ error: msg });
  }
});

// ─── DELETE /v1/nodes/:code ──────────────────────────────────────────────────

router.delete("/v1/nodes/:code", async (req: Request, res: Response) => {
  try {
    await deleteNode(req.params.code);
    res.json({ success: true, message: `Node "${req.params.code}" deleted and sandbox removed` });
  } catch (err) {
    const msg = String(err);
    res.status(msg.includes("not found") ? 404 : 500).json({ error: msg });
  }
});

// ─── POST /v1/nodes/sandbox/write ────────────────────────────────────────────
// Securely write a file to a node's sandbox (path traversal blocked).

router.post("/v1/nodes/sandbox/write", async (req: Request, res: Response) => {
  const { code, path: filePath, content } = req.body as {
    code?: string; path?: string; content?: string;
  };

  if (!code || !filePath || content === undefined) {
    res.status(400).json({ error: "code, path, and content are required" });
    return;
  }

  try {
    const absPath = await sandboxWriteFile(code, filePath, content);
    res.json({
      success: true,
      written_to: absPath,
      bytes: Buffer.byteLength(content, "utf8"),
    });
  } catch (err) {
    const msg = String(err);
    const isSecErr = msg.includes("SecurityError");
    res.status(isSecErr ? 403 : 500).json({ error: msg });
  }
});

// ─── POST /v1/nodes/sandbox/validate-path ────────────────────────────────────
// Validate that a path is safely within the node's sandbox (dry-run).

router.post("/v1/nodes/sandbox/validate-path", async (req: Request, res: Response) => {
  const { code, path: filePath } = req.body as { code?: string; path?: string };
  if (!code || !filePath) {
    res.status(400).json({ error: "code and path are required" });
    return;
  }

  try {
    const resolved = assertSandboxed(code, filePath);
    res.json({ safe: true, resolved_path: resolved });
  } catch (err) {
    res.json({ safe: false, error: String(err) });
  }
});

export default router;
