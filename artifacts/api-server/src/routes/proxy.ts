import { Router } from "express";
import type { Request, Response } from "express";
import { createProxyMiddleware } from "http-proxy-middleware";
import { db, projectsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger.js";

const router = Router();

const proxyCache = new Map<string, ReturnType<typeof createProxyMiddleware>>();

router.get("/projects/:projectId/health", async (req: Request, res: Response) => {
  const { projectId } = req.params;
  const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, Number(projectId))).limit(1);

  if (!project?.port) {
    res.json({ live: false, reason: "no port assigned" });
    return;
  }

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2000);
    const r = await fetch(`http://localhost:${project.port}/`, { signal: ctrl.signal });
    clearTimeout(timer);
    res.json({ live: true, port: project.port, status: r.status, url: project.liveUrl });
  } catch (_) {
    res.json({ live: false, port: project.port, reason: "not responding" });
  }
});

router.use("/preview-proxy/:projectId", async (req: Request, res: Response, next) => {
  const { projectId } = req.params;

  const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, Number(projectId))).limit(1);

  if (!project?.port) {
    res.status(503).send(`<!DOCTYPE html>
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
  <p>Project #${projectId} is spinning up.<br/>This page will refresh automatically.</p>
  <script>
    // Poll until the app is live
    (function poll() {
      fetch('/api/projects/${projectId}/health')
        .then(r => r.json())
        .then(d => { if (d.live) window.location.reload(); else setTimeout(poll, 2500); })
        .catch(() => setTimeout(poll, 3000));
    })();
  </script>
</body>
</html>`);
    return;
  }

  const targetPort = project.port;
  const cacheKey = String(targetPort);

  if (!proxyCache.has(cacheKey)) {
    const proxy = createProxyMiddleware({
      target: `http://localhost:${targetPort}`,
      changeOrigin: true,
      pathRewrite: { [`^/api/preview-proxy/${projectId}`]: "" },
      on: {
        error: (_err, rawReq, res) => {
          if (!res || !("status" in res)) return;
          const expressRes = res as Response;
          // Detect API requests (Accept: application/json or /api/ path)
          const rawUrl = (rawReq as { url?: string }).url ?? "";
          const acceptHeader = (rawReq as { headers?: Record<string, string> }).headers?.accept ?? "";
          const isApiRequest = rawUrl.includes("/api/") || acceptHeader.includes("application/json");

          if (isApiRequest) {
            // Return structured JSON fallback — lets the frontend show a helpful error state
            // instead of freezing with "API unavailable"
            expressRes.status(200).json({
              success: false,
              status: "CRASHED",
              error: "Sandbox runtime unavailable — app may be starting up or crashed",
              port: targetPort,
              projectId,
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
<p>Connecting to your app on port ${targetPort}...</p>
<small>Auto-refreshing every 3 seconds</small>
</body></html>`);
          }
        },
      },
    });
    proxyCache.set(cacheKey, proxy);
  }

  proxyCache.get(cacheKey)!(req, res, next);
});

export function invalidateProxyCache(port: number): void {
  proxyCache.delete(String(port));
}

export default router;
