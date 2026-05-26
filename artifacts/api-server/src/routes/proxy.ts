import { Router } from "express";
import type { Request, Response, NextFunction, RequestHandler } from "express";
import type { IncomingMessage, ServerResponse } from "http";
import httpProxy from "http-proxy";
import { db, projectsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger.js";

const router = Router();

const proxy = httpProxy.createProxyServer({ changeOrigin: true, selfHandleResponse: false });

proxy.on("error", (err, req, res) => {
  logger.error({ err, url: req.url }, "proxy error");
  const expressRes = res as Response;
  if (!expressRes.headersSent) {
    const rawUrl = req.url ?? "";
    const acceptHeader = (req.headers?.accept as string) ?? "";
    const isApiRequest = rawUrl.includes("/api/") || acceptHeader.includes("application/json");
    if (isApiRequest) {
      expressRes.status(200).json({
        success: false,
        status: "CRASHED",
        error: "Sandbox runtime unavailable — app may be starting or crashed",
        ts: new Date().toISOString(),
      });
    } else {
      expressRes.status(502).send(`<!DOCTYPE html>
<html><head><meta charset="UTF-8"/><meta http-equiv="refresh" content="3"/>
<title>Connecting...</title>
<style>body{font-family:-apple-system,sans-serif;background:#0a0e14;color:#cdd9e5;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;flex-direction:column;gap:10px;}
.s{width:28px;height:28px;border:3px solid #1e2d45;border-top-color:#58a6ff;border-radius:50%;animation:spin 1s linear infinite;}
@keyframes spin{to{transform:rotate(360deg)}}
p{color:#6e7f96;font-size:14px;text-align:center;max-width:300px}
small{color:#3e4f63;font-size:11px;margin-top:8px}</style>
</head><body>
<div class="s"></div>
<p>Connecting to your app...</p>
<small>Auto-refreshing every 3 seconds</small>
</body></html>`);
    }
  }
});

// ─── HTML URL Rewriting ───────────────────────────────────────────────────────
// Intercepts HTML responses and rewrites absolute asset paths so CSS/JS/images
// load correctly when the app is served through the path-based proxy.
//
// Before:  href="/style.css"         → browser requests /style.css (escapes proxy)
// After:   href="style.css"          → browser requests relative to current path
//          Also injects <base> tag so all relative URLs resolve correctly.

proxy.on("proxyRes", (proxyRes: IncomingMessage, req: IncomingMessage, res: ServerResponse) => {
  const contentType = (proxyRes.headers["content-type"] ?? "").toLowerCase();
  if (!contentType.includes("text/html")) return;

  const projectKey = (req as Request & { __projectKey?: string }).__projectKey;
  if (!projectKey) return;

  // Guard against double-handling
  if ((res as ServerResponse & { __wfHandled?: boolean }).__wfHandled) return;
  (res as ServerResponse & { __wfHandled?: boolean }).__wfHandled = true;

  const chunks: Buffer[] = [];
  proxyRes.on("data", (chunk: Buffer) => chunks.push(chunk));
  proxyRes.on("end", () => {
    let html = Buffer.concat(chunks).toString("utf8");
    const prefix = `/api/preview-proxy/${projectKey}`;

    // Inject <base> tag so relative paths resolve through the proxy prefix
    if (!html.match(/<base\s/i)) {
      if (html.match(/<head[^>]*>/i)) {
        html = html.replace(/(<head[^>]*>)/i, `$1<base href="${prefix}/">`);
      } else {
        html = `<base href="${prefix}/">\n` + html;
      }
    }

    // Rewrite any remaining absolute paths that slip through (e.g., href="/style.css")
    // Guard against rewriting paths that already contain the proxy prefix
    const prefixEscaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    html = html
      .replace(new RegExp(`(href|src|action)="\/(?!\/${prefixEscaped.slice(1)}|\/|api\/)`, "g"),
        `$1="${prefix}/`)
      .replace(/url\(['"]?\/(?!\/|api\/preview-proxy\/)/g, `url('${prefix}/`);

    const buf = Buffer.from(html, "utf8");

    // Build clean headers — strip transfer-encoding (we're sending a fixed-length buffer)
    const headers: Record<string, string | string[] | undefined> = {};
    for (const [k, v] of Object.entries(proxyRes.headers)) {
      const lower = k.toLowerCase();
      if (lower !== "content-length" && lower !== "transfer-encoding") {
        headers[k] = v as string | string[];
      }
    }
    headers["content-length"] = String(buf.length);
    headers["content-type"] = "text/html; charset=utf-8";

    if (!res.headersSent) {
      res.writeHead(proxyRes.statusCode ?? 200, headers as Record<string, string | string[]>);
    }
    res.end(buf);
  });

  proxyRes.on("error", (err) => {
    logger.error({ err }, "proxyRes error during HTML rewrite");
  });
});

// ─── Project Lookup (by slug or numeric ID) ────────────────────────────────────

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
// Two routes share one handler:
//   /preview-proxy/:projectKey        → root path (Express 5 /*path needs ≥1 char)
//   /preview-proxy/:projectKey/*path  → all sub-paths

const startingHtml = (projectKey: string) => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<meta http-equiv="refresh" content="5"/>
<title>WebForge — Starting App...</title>
<style>
  body { font-family: -apple-system, sans-serif; background: #0a0e14; color: #cdd9e5; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; flex-direction: column; gap: 12px; }
  .spinner { width: 32px; height: 32px; border: 3px solid #1e2d45; border-top-color: #58a6ff; border-radius: 50%; animation: spin 1s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  h2 { color: #58a6ff; margin: 0; font-size: 18px; }
  p { color: #6e7f96; margin: 0; font-size: 13px; text-align: center; }
</style>
</head>
<body>
  <div class="spinner"></div>
  <h2>Starting your app...</h2>
  <p><strong>${projectKey}</strong> is spinning up.<br/>This page will refresh automatically.</p>
  <script>
    (function poll() {
      fetch('/api/projects/${projectKey}/health')
        .then(r => r.json())
        .then(d => { if (d.live) window.location.reload(); else setTimeout(poll, 2500); })
        .catch(() => setTimeout(poll, 3000));
    })();
  </script>
</body>
</html>`;

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

  if (!project.port) {
    res.status(503).send(startingHtml(project.slug ?? String(project.id)));
    return;
  }

  const targetPort = project.port;
  const prefix = `/preview-proxy/${projectKey}`;

  // Store projectKey on req so the proxyRes HTML-rewrite handler can access it
  (req as Request & { __projectKey?: string }).__projectKey = projectKey;

  req.url = req.url.replace(prefix, "") || "/";

  proxy.web(req, res, { target: `http://127.0.0.1:${targetPort}` });
};

router.all("/preview-proxy/:projectKey", proxyHandler);
router.all("/preview-proxy/:projectKey/*path", proxyHandler);

export function invalidateProxyCache(_port: number): void {
  // No-op: http-proxy is stateless per-request
}

export default router;
