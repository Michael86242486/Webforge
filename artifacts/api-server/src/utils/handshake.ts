/**
 * WebForge Multi-Tenant Handshake Utility
 *
 * Manages isolated workspace partitions for Telegram bots / external clients.
 * Each node gets:
 *   - A unique WF-XXXXXX connection code
 *   - An exclusively allocated port (range 6100–6999)
 *   - An isolated sandbox directory at ./sandboxes/[connection_code]/
 *   - Absolute path confinement — file ops outside the sandbox throw SecurityError
 */

import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import { logger } from "../lib/logger.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UserNode {
  connection_code: string;
  telegram_chat_id: string | null;
  allocated_port: number;
  sandbox_path: string;
  status: "ACTIVE" | "STANDBY" | "SUSPENDED";
  created_at: string;
  updated_at: string;
  metadata: Record<string, unknown>;
}

export interface NodeStore {
  nodes: Record<string, UserNode>;
  port_counter: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DB_DIR = path.resolve("db");
const NODES_FILE = path.join(DB_DIR, "nodes.json");
const SANDBOXES_BASE = path.resolve("sandboxes");
const NODE_PORT_START = 6100;
const NODE_PORT_END = 6999;

// Alphanumeric alphabet — excludes confusable characters (0/O, 1/I/l)
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

// ─── Persistence ─────────────────────────────────────────────────────────────

async function ensureDirs(): Promise<void> {
  await fs.mkdir(DB_DIR, { recursive: true });
  await fs.mkdir(SANDBOXES_BASE, { recursive: true });
}

async function loadStore(): Promise<NodeStore> {
  try {
    const raw = await fs.readFile(NODES_FILE, "utf8");
    return JSON.parse(raw) as NodeStore;
  } catch {
    return { nodes: {}, port_counter: NODE_PORT_START };
  }
}

async function saveStore(store: NodeStore): Promise<void> {
  await ensureDirs();
  await fs.writeFile(NODES_FILE, JSON.stringify(store, null, 2), "utf8");
}

// ─── Code Generation ──────────────────────────────────────────────────────────

export function generateHandshakeCode(): string {
  let suffix = "";
  for (let i = 0; i < 6; i++) {
    suffix += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return `WF-${suffix}`;
}

function isValidCode(code: string): boolean {
  return /^WF-[A-Z2-9]{6}$/.test(code);
}

// ─── Port Allocation ──────────────────────────────────────────────────────────

async function allocatePort(store: NodeStore): Promise<number> {
  const usedPorts = new Set(Object.values(store.nodes).map(n => n.allocated_port));

  // Start from port_counter, find next free port
  for (let p = store.port_counter; p <= NODE_PORT_END; p++) {
    if (!usedPorts.has(p)) {
      store.port_counter = p + 1;
      return p;
    }
  }

  // Wrap around if we hit the ceiling
  for (let p = NODE_PORT_START; p < store.port_counter; p++) {
    if (!usedPorts.has(p)) {
      store.port_counter = p + 1;
      return p;
    }
  }

  throw new Error(`HandshakeError: All ports in range ${NODE_PORT_START}–${NODE_PORT_END} are exhausted`);
}

// ─── Path Confinement ─────────────────────────────────────────────────────────

/**
 * Validates that a given file path is strictly inside the node's sandbox directory.
 * Throws SecurityError if any path traversal is detected.
 */
export function confinePath(sandboxPath: string, targetPath: string): string {
  const sandbox = path.resolve(sandboxPath);
  const resolved = path.resolve(sandbox, targetPath);

  if (!resolved.startsWith(sandbox + path.sep) && resolved !== sandbox) {
    throw new Error(
      `SecurityError: Path traversal detected — "${targetPath}" escapes sandbox "${sandbox}". Operation blocked.`
    );
  }
  return resolved;
}

/**
 * Validates a path is inside the sandbox and confirms the sandbox itself
 * is inside the global SANDBOXES_BASE directory.
 */
export function assertSandboxed(nodeCode: string, targetPath: string): string {
  const sandboxPath = getSandboxPath(nodeCode);

  // Ensure the sandbox root is inside the approved base
  if (!sandboxPath.startsWith(SANDBOXES_BASE + path.sep)) {
    throw new Error(
      `SecurityError: Sandbox path "${sandboxPath}" is outside approved base directory. Node: ${nodeCode}`
    );
  }
  return confinePath(sandboxPath, targetPath);
}

export function getSandboxPath(nodeCode: string): string {
  return path.join(SANDBOXES_BASE, nodeCode);
}

// ─── Node CRUD ────────────────────────────────────────────────────────────────

/**
 * Generate a new handshake code and create a pending node record.
 * The node is in STANDBY until a Telegram bot binds to it via connectNode().
 */
export async function createNode(metadata: Record<string, unknown> = {}): Promise<UserNode> {
  await ensureDirs();
  const store = await loadStore();

  // Generate a unique code (retry up to 10 times for collision)
  let code = generateHandshakeCode();
  let attempts = 0;
  while (store.nodes[code] && attempts < 10) {
    code = generateHandshakeCode();
    attempts++;
  }
  if (store.nodes[code]) throw new Error("HandshakeError: Could not generate unique code after 10 attempts");

  const port = await allocatePort(store);
  const sandboxPath = getSandboxPath(code);

  await fs.mkdir(sandboxPath, { recursive: true });

  const node: UserNode = {
    connection_code: code,
    telegram_chat_id: null,
    allocated_port: port,
    sandbox_path: sandboxPath,
    status: "STANDBY",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    metadata,
  };

  store.nodes[code] = node;
  await saveStore(store);

  logger.info({ code, port, sandboxPath }, "HandshakeNode created");
  return node;
}

/**
 * Bind a Telegram chat_id to an existing handshake code.
 * Activates the node and returns the full node record.
 */
export async function connectNode(code: string, chatId: string): Promise<UserNode> {
  if (!isValidCode(code)) {
    throw new Error(`HandshakeError: Invalid connection code format: "${code}". Expected WF-XXXXXX`);
  }

  const store = await loadStore();
  const node = store.nodes[code];

  if (!node) {
    throw new Error(`HandshakeError: Connection code "${code}" not found or already expired`);
  }

  if (node.status === "SUSPENDED") {
    throw new Error(`HandshakeError: Node "${code}" is suspended and cannot accept connections`);
  }

  // Check for duplicate Telegram chat_id binding (one bot per node)
  const existingBound = Object.values(store.nodes).find(
    n => n.telegram_chat_id === chatId && n.connection_code !== code
  );
  if (existingBound) {
    throw new Error(
      `HandshakeError: Telegram chat "${chatId}" is already bound to node "${existingBound.connection_code}"`
    );
  }

  node.telegram_chat_id = chatId;
  node.status = "ACTIVE";
  node.updated_at = new Date().toISOString();

  // Ensure sandbox directory exists
  await fs.mkdir(node.sandbox_path, { recursive: true });

  await saveStore(store);

  logger.info({ code, chatId, port: node.allocated_port }, "HandshakeNode connected");
  return node;
}

/**
 * Look up a node by connection code. Returns null if not found.
 */
export async function getNode(code: string): Promise<UserNode | null> {
  const store = await loadStore();
  return store.nodes[code] ?? null;
}

/**
 * Look up a node by Telegram chat_id. Returns null if not found.
 */
export async function getNodeByChatId(chatId: string): Promise<UserNode | null> {
  const store = await loadStore();
  return Object.values(store.nodes).find(n => n.telegram_chat_id === chatId) ?? null;
}

/**
 * List all nodes, optionally filtered by status.
 */
export async function listNodes(status?: UserNode["status"]): Promise<UserNode[]> {
  const store = await loadStore();
  const all = Object.values(store.nodes);
  return status ? all.filter(n => n.status === status) : all;
}

/**
 * Suspend a node — disables it without deleting the sandbox.
 */
export async function suspendNode(code: string): Promise<void> {
  const store = await loadStore();
  const node = store.nodes[code];
  if (!node) throw new Error(`HandshakeError: Node "${code}" not found`);

  node.status = "SUSPENDED";
  node.updated_at = new Date().toISOString();
  await saveStore(store);

  logger.info({ code }, "HandshakeNode suspended");
}

/**
 * Delete a node and remove its sandbox directory.
 */
export async function deleteNode(code: string): Promise<void> {
  const store = await loadStore();
  const node = store.nodes[code];
  if (!node) throw new Error(`HandshakeError: Node "${code}" not found`);

  // Remove sandbox directory
  try {
    await fs.rm(node.sandbox_path, { recursive: true, force: true });
  } catch (e) {
    logger.warn({ code, err: e }, "HandshakeNode: sandbox removal failed (non-fatal)");
  }

  delete store.nodes[code];
  await saveStore(store);

  logger.info({ code }, "HandshakeNode deleted");
}

/**
 * Write a file safely inside a node's sandbox.
 * Throws SecurityError if the target path escapes the sandbox.
 */
export async function sandboxWriteFile(nodeCode: string, relativePath: string, content: string): Promise<string> {
  const absolutePath = assertSandboxed(nodeCode, relativePath);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, content, "utf8");
  return absolutePath;
}

/**
 * Read a file safely from inside a node's sandbox.
 */
export async function sandboxReadFile(nodeCode: string, relativePath: string): Promise<string> {
  const absolutePath = assertSandboxed(nodeCode, relativePath);
  return fs.readFile(absolutePath, "utf8");
}

/**
 * List files inside a node's sandbox (non-recursive).
 */
export async function sandboxListFiles(nodeCode: string, subDir = ""): Promise<string[]> {
  const absoluteDir = assertSandboxed(nodeCode, subDir);
  try {
    const entries = await fs.readdir(absoluteDir);
    return entries;
  } catch {
    return [];
  }
}
