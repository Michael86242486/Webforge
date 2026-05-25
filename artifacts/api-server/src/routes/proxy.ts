import { Router } from "express";
import type { Request, Response } from "express";
import { createProxyMiddleware } from "http-proxy-middleware";
import { db, projectsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger.js";

const router = Router();

const proxyCache = new Map<string, ReturnType<typeof createProxyMiddleware>>();

router.use("/preview-proxy/:projectId", async (req: Request, res: Response, next) => {
  const { projectId } = req.params;

  const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, Number(projectId))).limit(1);

  if (!project?.port) {
    res.status(503).send(`
      <html><body style="font-family:monospace;background:#0d1117;color:#c9d1d9;padding:40px">
        <h2 style="color:#58a6ff">⚡ WebForge Sandbox</h2>
        <p style="color:#8b949e">Project #${projectId} is not running yet.</p>
        <p style="margin-top:16px">Use the Telegram bot or workspace to start your app.</p>
      </body></html>
    `);
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
        error: (err, _req, res) => {
          logger.warn({ err, targetPort }, "Proxy error");
          if (res && "status" in res) {
            (res as Response).status(502).send("App not responding");
          }
        },
      },
    });
    proxyCache.set(cacheKey, proxy);
  }

  proxyCache.get(cacheKey)!(req, res, next);
});

export default router;
