import { Router } from "express";
import type { Request, Response, NextFunction, RequestHandler } from "express";
import type { IncomingMessage, ServerResponse } from "http";
import httpProxy from "http-proxy";
import { db, projectsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import fs from "fs/promises";
import path from "path";
import { createReadStream, statSync } from "fs";
import mime from "mime-types";

const router = Router();

const proxy = httpProxy.createProxyServer({ changeOrigin: true, selfHandleResponse: false });

proxy.on("error", (err, req, res) => {
  logger.error({ err, url: req.url }, "proxy error");
  const expressRes = res as Response;
  if (!expressRes.headersSent) {
    expressRes.status(502).send(busyHtml("App proxy error — it may have crashed. Static fallback should have caught this."));
  }
});

// ─── Unified URL Rewriting (HTML + CSS) ───────────────────────────────────────
proxy.on("proxyRes", (proxyRes: IncomingMessage, req: IncomingMessage, res: ServerResponse) => {
  const contentType = (proxyRes.headers["content-type"] ?? "").toLowerCase();
  const isHtml = contentType.includes("text/html");
  const isCss = contentType.includes("text/css");

  if (!isHtml && !isCss) return;

  const projectKey = (req as Request & { __projectKey?: string }).__projectKey;
  if (!projectKey) return;

  if ((res as ServerResponse & { __wfHandled?: boolean }).__wfHandled) return;
  (res as ServerResponse & { __wfHandled?: boolean }).__wfHandled = true;

  const chunks: Buffer[] = [];
  proxyRes.on("data", (chunk: Buffer) => chunks.push(chunk));
  proxyRes.on("end", () => {
    let body = Buffer.concat(chunks).toString("utf8");
    const prefix = `/api/preview-proxy/${projectKey}`;

    if (isHtml) {
      body = rewriteHtml(body, prefix);
    } else if (isCss) {
      body = rewriteCss(body, prefix);
    }

    const buf = Buffer.from(body, "utf8");
    const headers: Record<string, string | string[] | undefined> = {};
    for (const [k, v] of Object.entries(proxyRes.headers)) {
      const lower = k.toLowerCase();
      if (lower !== "content-length" && lower !== "transfer-encoding") {
        headers[k] = v as string | string[];
      }
    }
    headers["content-length"] = String(buf.length);
    if (isHtml) headers["content-type"] = "text/html; charset=utf-8";
    if (isCss) headers["content-type"] = "text/css; charset=utf-8";

    if (!res.headersSent) {
      res.writeHead(proxyRes.statusCode ?? 200, headers as Record<string, string | string[]>);
    }
    res.end(buf);
  });

  proxyRes.on("error", (err) => {
    logger.error({ err }, "proxyRes error during content rewrite");
  });
});

// ─── HTML Rewriter ─────────────────────────────────────────────────────────────
function rewriteHtml(body: string, prefix: string): string {
  if (!body.match(/<base\s/i)) {
    if (body.match(/<head[^>]*>/i)) {
      body = body.replace(/(<head[^>]*>)/i, `$1<base href="${prefix}/">`);
    } else {
      body = `<base href="${prefix}/">\n` + body;
    }
  }
  const prefixEscaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  body = body
    .replace(
      new RegExp(`(href|src|action|data-src)="\/(?!\/${prefixEscaped.slice(1)}|\/|api\/)`, "g"),
      `$1="${prefix}/`
    )
    .replace(/url\(['"]?\/(?!\/|api\/preview-proxy\/)/g, `url('${prefix}/`);
  body = body.replace(/srcset="([^"]+)"/g, (_match, srcset: string) => {
    const fixed = srcset.replace(/(?:^|,\s*)(\/)(?!\/|api\/preview-proxy\/)/g, ` ${prefix}/`);
    return `srcset="${fixed}"`;
  });
  return body;
}

// ─── CSS Rewriter ──────────────────────────────────────────────────────────────
function rewriteCss(body: string, prefix: string): string {
  return body
    .replace(/url\(\s*'\/(?!\/|api\/preview-proxy\/)/g, `url('${prefix}/`)
    .replace(/url\(\s*"\/(?!\/|api\/preview-proxy\/)/g, `url("${prefix}/`)
    .replace(/url\(\s*\/(?![\/']|api\/preview-proxy\/)/g, `url(${prefix}/`)
    .replace(/@import\s+'\/(?!\/|api\/preview-proxy\/)/g, `@import '${prefix}/`)
    .replace(/@import\s+"\/(?!\/|api\/preview-proxy\/)/g, `@import "${prefix}/`);
}

// ─── Port Health Check ─────────────────────────────────────────────────────────
async function isPortAlive(port: number): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 600);
    await fetch(`http://127.0.0.1:${port}/`, { signal: ctrl.signal, method: "HEAD" });
    clearTimeout(timer);
    return true;
  } catch {
    return false;
  }
}

// ─── Static File Fallback ──────────────────────────────────────────────────────
// When the spawned app isn't running, serve built/static assets directly from disk.
// Priority order: public/ → dist/ → build/ → workDir root

const STATIC_CANDIDATES = ["public", "dist", "build", "out", "."];

async function findStaticDir(workDir: string): Promise<string | null> {
  for (const candidate of STATIC_CANDIDATES) {
    const dir = candidate === "." ? workDir : path.join(workDir, candidate);
    try {
      const indexPath = path.join(dir, "index.html");
      await fs.access(indexPath);
      return dir;
    } catch {
      continue;
    }
  }
  return null;
}

function busyHtml(msg = "App is starting up..."): string {
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"/><meta http-equiv="refresh" content="4"/>
<title>WebForge — Loading</title>
<style>
  body{font-family:-apple-system,sans-serif;background:#0a0e14;color:#cdd9e5;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;flex-direction:column;gap:12px;}
  .s{width:32px;height:32px;border:3px solid #1e2d45;border-top-color:#58a6ff;border-radius:50%;animation:spin 1s linear infinite;}
  @keyframes spin{to{transform:rotate(360deg)}}
  h3{color:#58a6ff;margin:0;font-size:16px;}
  p{color:#6e7f96;font-size:13px;text-align:center;max-width:300px;margin:0}
  small{color:#3e4f63;font-size:11px;margin-top:4px}
</style></head>
<body>
  <div class="s"></div>
  <h3>WebForge</h3>
  <p>${msg}</p>
  <small>Auto-refreshing every 4 seconds</small>
</body></html>`;
}

async function serveStaticFallback(
  req: Request,
  res: Response,
  workDir: string,
  projectKey: string
): Promise<boolean> {
  const staticDir = await findStaticDir(workDir);
  if (!staticDir) return false;

  // req.originalUrl has the full path (e.g. /api/preview-proxy/vibeforge/css/style.css)
  // req.url has /api/ stripped by Express (e.g. /preview-proxy/vibeforge/css/style.css)
  // Use originalUrl to strip the correct prefix including /api/
  const rawUrl = (req.originalUrl ?? req.url).split("?")[0];
  const proxyPrefix = `/api/preview-proxy/${projectKey}`;
  const stripped = rawUrl.startsWith(proxyPrefix)
    ? rawUrl.slice(proxyPrefix.length) || "/"
    : "/";

  // Sanitize: resolve within staticDir, prevent path traversal
  const relative = stripped === "/" || stripped === "" ? "index.html" : stripped.replace(/^\/+/, "");
  const filePath = path.resolve(staticDir, relative);

  if (!filePath.startsWith(path.resolve(staticDir))) {
    res.status(403).send("Forbidden");
    return true;
  }

  // Try the file, then fall back to index.html (SPA behaviour)
  let targetPath = filePath;
  try {
    const stat = await fs.stat(targetPath);
    if (stat.isDirectory()) {
      targetPath = path.join(targetPath, "index.html");
      await fs.access(targetPath);
    }
  } catch {
    // Not found — fall back to index.html for client-side routing
    targetPath = path.join(staticDir, "index.html");
    try { await fs.access(targetPath); } catch { return false; }
  }

  const mimeType = mime.lookup(targetPath) || "application/octet-stream";
  const isHtml = mimeType.includes("text/html");
  const isCss = mimeType.includes("text/css");

  try {
    let content = await fs.readFile(targetPath);
    const prefix = `/api/preview-proxy/${projectKey}`;

    if (isHtml) {
      let text = rewriteHtml(content.toString("utf8"), prefix);
      content = Buffer.from(text, "utf8");
    } else if (isCss) {
      let text = rewriteCss(content.toString("utf8"), prefix);
      content = Buffer.from(text, "utf8");
    }

    res.setHeader("Content-Type", mimeType + (isHtml || isCss ? "; charset=utf-8" : ""));
    res.setHeader("Content-Length", content.length);
    res.setHeader("Cache-Control", "no-cache");
    res.status(200).send(content);
    return true;
  } catch (err) {
    logger.error({ err, targetPath }, "Static fallback read error");
    return false;
  }
}

// ─── Project Lookup ────────────────────────────────────────────────────────────
async function lookupProject(projectKey: string) {
  const asNumber = Number(projectKey);
  if (!isNaN(asNumber) && String(asNumber) === projectKey) {
    const [proj] = await db.select().from(projectsTable).where(eq(projectsTable.id, asNumber)).limit(1);
    return proj ?? null;
  }
  const [proj] = await db.select().from(projectsTable).where(eq(projectsTable.slug, projectKey)).limit(1);
  return proj ?? null;
}

// ─── Health Endpoint ──────────────────────────────────────────────────────────
router.get("/projects/:projectKey/health", async (req: Request, res: Response) => {
  const project = await lookupProject(req.params.projectKey);
  if (!project?.port) {
    res.json({ live: false, reason: "no port assigned" });
    return;
  }
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2000);
    const r = await fetch(`http://127.0.0.1:${project.port}/`, { signal: ctrl.signal });
    clearTimeout(timer);
    res.json({ live: true, port: project.port, status: r.status, url: project.liveUrl, slug: project.slug, id: project.id });
  } catch (_) {
    res.json({ live: false, port: project.port, reason: "not responding" });
  }
});

// ─── Preview Proxy Handler ────────────────────────────────────────────────────
const proxyHandler: RequestHandler = async (req: Request, res: Response, _next: NextFunction) => {
  const { projectKey } = req.params;

  const project = await lookupProject(projectKey);

  if (!project) {
    res.status(404).send(`<!DOCTYPE html><html><body style="font-family:-apple-system,sans-serif;background:#0a0e14;color:#cdd9e5;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;flex-direction:column;gap:10px">
      <h2 style="color:#f85149">Project not found</h2>
      <p style="color:#6e7f96">No project with key <strong>${projectKey}</strong> exists.</p>
    </body></html>`);
    return;
  }

  // ── Static fallback path (no port or port dead) ───────────────────────────
  const portDead = !project.port || !(await isPortAlive(project.port));

  if (portDead) {
    const workDir = project.workDir;
    if (workDir) {
      const served = await serveStaticFallback(req, res, workDir, projectKey);
      if (served) return;
    }
    // Nothing to serve — show a loading page
    res.status(503).send(busyHtml(`<strong>${project.name}</strong> isn't running right now.<br/>Rebuild it from Telegram to bring it back online.`));
    return;
  }

  // ── Live proxy to running port ────────────────────────────────────────────
  const targetPort = project.port!;

  (req as Request & { __projectKey?: string }).__projectKey = projectKey;

  // req.url here = /preview-proxy/{key}/... (Express already stripped /api/)
  // Strip /preview-proxy/{key} so the upstream app sees a clean path
  const routePrefix = `/preview-proxy/${projectKey}`;
  if (req.url.startsWith(routePrefix)) {
    req.url = req.url.slice(routePrefix.length) || "/";
  }

  proxy.web(req, res, { target: `http://127.0.0.1:${targetPort}` });
};

router.all("/preview-proxy/:projectKey", proxyHandler);
router.all("/preview-proxy/:projectKey/*path", proxyHandler);

export function invalidateProxyCache(_port: number): void {
  // No-op: http-proxy is stateless per-request
}

export default router;
