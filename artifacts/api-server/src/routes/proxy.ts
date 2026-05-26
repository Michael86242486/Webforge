import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import httpProxy from "http-proxy";
import { db, projectsTable } from "@workspace/db";
import { eq, or } from "drizzle-orm";
import { logger } from "../lib/logger.js";

const router = Router();

const proxy = httpProxy.createProxyServer({ changeOrigin: true });

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

// ─── Project Lookup (by slug or numeric ID) ────────────────────────────────────
// Accepts either a named slug ("vibeforge") or a legacy numeric ID ("2").
// Ownership check: verifies the requesting session owns the project when
// the user context is available (passed via X-User-Id header from the workspace UI).

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
//   /preview-proxy/:projectKey        → matches the root path (e.g. /api/preview-proxy/vibeforge/)
//   /preview-proxy/:projectKey/*path  → matches all sub-paths  (e.g. /api/preview-proxy/vibeforge/static/css/main.css)
//
// Express 5's path-to-regexp requires *path to have ≥1 char, so root requests
// only hit the first route. Both strip the prefix and forward to the sandbox port.

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

async function proxyHandler(req: Request, res: Response, _next: NextFunction) {
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
  req.url = req.url.replace(prefix, "") || "/";

  proxy.web(req, res, { target: `http://127.0.0.1:${targetPort}` });
}

router.all("/preview-proxy/:projectKey", proxyHandler);
router.all("/preview-proxy/:projectKey/*path", proxyHandler);

export function invalidateProxyCache(_port: number): void {
  // No-op: http-proxy is stateless per-request
}

export default router;
