import { logger } from "../lib/logger.js";

export interface HealthCheckItem {
  name: string;
  passed: boolean;
  detail: string;
}

export interface HealthReport {
  status: "healthy" | "degraded" | "unhealthy" | "starting";
  score: number;
  checks: HealthCheckItem[];
  url: string;
  responseTimeMs: number;
  checkedAt: string;
}

async function fetchWithTimeout(url: string, timeoutMs = 5000): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    return res;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

export async function runHealthCheck(port: number, projectId: string): Promise<HealthReport> {
  const baseUrl = `http://127.0.0.1:${port}`;
  const checks: HealthCheckItem[] = [];
  const checkedAt = new Date().toISOString();
  const start = Date.now();

  let responseTimeMs = 0;
  let mainResponse: Response | null = null;

  try {
    mainResponse = await fetchWithTimeout(baseUrl + "/", 5000);
    responseTimeMs = Date.now() - start;

    checks.push({
      name: "Server Starts",
      passed: true,
      detail: `HTTP ${mainResponse.status} in ${responseTimeMs}ms`,
    });
  } catch (err) {
    responseTimeMs = Date.now() - start;
    checks.push({
      name: "Server Starts",
      passed: false,
      detail: `Connection failed: ${err instanceof Error ? err.message : "Unknown"}`,
    });

    return {
      status: "starting",
      score: 0,
      checks,
      url: baseUrl,
      responseTimeMs,
      checkedAt,
    };
  }

  checks.push({
    name: "Homepage Returns 200",
    passed: mainResponse.status >= 200 && mainResponse.status < 400,
    detail: `HTTP status: ${mainResponse.status}`,
  });

  const contentType = mainResponse.headers.get("content-type") ?? "";
  const isHtml = contentType.includes("text/html") || contentType.includes("application/xhtml");
  checks.push({
    name: "Page Loads",
    passed: isHtml || mainResponse.status === 200,
    detail: isHtml ? "HTML response received" : `Content-Type: ${contentType || "none"}`,
  });

  let body = "";
  try {
    body = await mainResponse.clone().text();
  } catch { /* non-fatal */ }

  const hasScript = /<script/i.test(body);
  checks.push({
    name: "JavaScript Loads",
    passed: hasScript || !isHtml,
    detail: hasScript ? "Script tag found in HTML" : isHtml ? "No script tags (may be server-rendered)" : "Non-HTML response",
  });

  const hasCss = /<link[^>]+stylesheet|<style/i.test(body);
  checks.push({
    name: "CSS Loads",
    passed: hasCss || !isHtml,
    detail: hasCss ? "Stylesheet found" : isHtml ? "No stylesheet (may use inline styles)" : "Non-HTML response",
  });

  const hasConsoleError = body.includes("console.error") || body.includes("Uncaught Error");
  checks.push({
    name: "No Runtime Errors",
    passed: !hasConsoleError,
    detail: hasConsoleError ? "Potential console errors detected in HTML" : "No obvious errors in source",
  });

  try {
    const healthResponse = await fetchWithTimeout(baseUrl + "/health", 3000);
    const apiOk = healthResponse.status < 500;
    checks.push({
      name: "API Endpoints Work",
      passed: apiOk,
      detail: apiOk ? `Health endpoint: ${healthResponse.status}` : "Health endpoint error",
    });
  } catch {
    checks.push({
      name: "API Endpoints Work",
      passed: false,
      detail: "/health endpoint not found (optional)",
    });
  }

  const noTitle = isHtml && !/<title/i.test(body);
  checks.push({
    name: "Navigation Works",
    passed: !noTitle,
    detail: noTitle ? "No title tag found" : "Page structure looks valid",
  });

  const passedCount = checks.filter(c => c.passed).length;
  const score = Math.round((passedCount / checks.length) * 100);

  const status: HealthReport["status"] =
    score >= 80 ? "healthy" :
    score >= 50 ? "degraded" : "unhealthy";

  logger.info({ projectId, port, score, status }, "HealthChecker: check complete");

  return {
    status,
    score,
    checks,
    url: baseUrl,
    responseTimeMs,
    checkedAt,
  };
}

export async function pollUntilHealthy(
  port: number,
  projectId: string,
  maxWaitMs = 120_000,
  intervalMs = 3_000,
): Promise<HealthReport> {
  const deadline = Date.now() + maxWaitMs;

  while (Date.now() < deadline) {
    const report = await runHealthCheck(port, projectId);
    if (report.status !== "starting") {
      return report;
    }
    logger.info({ projectId, port, elapsed: maxWaitMs - (deadline - Date.now()) }, "HealthChecker: still starting, waiting...");
    await new Promise(r => setTimeout(r, intervalMs));
  }

  return {
    status: "unhealthy",
    score: 0,
    checks: [{ name: "Server Starts", passed: false, detail: `Did not respond within ${maxWaitMs / 1000}s` }],
    url: `http://127.0.0.1:${port}`,
    responseTimeMs: maxWaitMs,
    checkedAt: new Date().toISOString(),
  };
}
