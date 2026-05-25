import { Router } from "express";
import type { Request, Response } from "express";
import { db, projectsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

const DEPLOYING_HTML = (projectId: string, apiBase: string, liveUrl: string) => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>WebForge — Deploying Project #${projectId}</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --bg: #0a0e14;
    --surface: #111720;
    --surface2: #161e2d;
    --border: #1e2d45;
    --accent: #58a6ff;
    --accent2: #3fb950;
    --warn: #f0883e;
    --text: #cdd9e5;
    --muted: #6e7f96;
    --font-mono: 'JetBrains Mono', 'Fira Code', 'Courier New', monospace;
  }
  html, body {
    height: 100%; background: var(--bg); color: var(--text);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    display: flex; align-items: center; justify-content: center;
  }
  .container {
    width: 100%; max-width: 640px; padding: 0 24px;
  }
  .brand {
    display: flex; align-items: center; gap: 10px;
    margin-bottom: 40px; justify-content: center;
  }
  .brand-logo {
    width: 36px; height: 36px; border-radius: 8px;
    background: var(--accent); display: flex; align-items: center;
    justify-content: center; font-weight: 900; color: #000; font-size: 18px;
  }
  .brand-name { font-size: 20px; font-weight: 700; letter-spacing: -.02em; }
  .brand-sep { color: var(--muted); }
  .brand-pid { color: var(--muted); font-size: 14px; font-family: var(--font-mono); }

  .card {
    background: var(--surface); border: 1px solid var(--border);
    border-radius: 16px; padding: 36px 32px; position: relative; overflow: hidden;
  }
  .card::before {
    content: ''; position: absolute; top: 0; left: 0; right: 0; height: 2px;
    background: linear-gradient(90deg, var(--accent), var(--accent2));
    transform-origin: left; transition: transform 0s;
  }

  .phase {
    display: flex; align-items: center; gap: 10px; margin-bottom: 28px;
  }
  .phase-dot {
    width: 10px; height: 10px; border-radius: 50%;
    background: var(--accent); animation: pulse 1.4s ease-in-out infinite;
    flex-shrink: 0;
  }
  .phase-dot.done { background: var(--accent2); animation: none; }
  .phase-dot.error { background: #f85149; animation: none; }
  @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.5;transform:scale(.8)} }

  .phase-text { font-size: 16px; font-weight: 600; }
  .phase-sub { font-size: 13px; color: var(--muted); margin-top: 2px; }

  .progress-wrap {
    background: var(--border); border-radius: 100px; height: 6px;
    margin: 24px 0; overflow: hidden; position: relative;
  }
  .progress-bar {
    height: 100%; border-radius: 100px; width: 0%;
    background: linear-gradient(90deg, var(--accent), var(--accent2));
    transition: width .6s cubic-bezier(.4,0,.2,1);
    position: relative;
  }
  .progress-bar::after {
    content: ''; position: absolute; right: 0; top: 0; bottom: 0; width: 60px;
    background: linear-gradient(90deg, transparent, rgba(255,255,255,.3));
    animation: shimmer 1.2s ease-in-out infinite;
  }
  @keyframes shimmer { 0%{opacity:0} 50%{opacity:1} 100%{opacity:0} }

  .stats-row {
    display: flex; gap: 0; margin-bottom: 24px;
    background: var(--surface2); border-radius: 10px; overflow: hidden;
    border: 1px solid var(--border);
  }
  .stat {
    flex: 1; padding: 14px 16px; text-align: center;
    border-right: 1px solid var(--border);
  }
  .stat:last-child { border-right: none; }
  .stat-value {
    font-size: 22px; font-weight: 700; font-family: var(--font-mono);
    color: var(--accent); line-height: 1;
  }
  .stat-label { font-size: 11px; color: var(--muted); margin-top: 4px; text-transform: uppercase; letter-spacing: .06em; }

  .log-feed {
    background: #070c12; border: 1px solid var(--border); border-radius: 8px;
    padding: 12px 14px; height: 120px; overflow-y: auto;
    font-family: var(--font-mono); font-size: 12px; line-height: 1.7;
    color: var(--muted);
  }
  .log-line { animation: fadeSlide .2s ease; }
  .log-line.info { color: var(--text); }
  .log-line.ok { color: var(--accent2); }
  .log-line.round { color: var(--warn); }
  @keyframes fadeSlide { from{opacity:0;transform:translateY(4px)} to{opacity:1;transform:none} }

  .redirect-card {
    display: none; margin-top: 24px; background: rgba(63,185,80,.08);
    border: 1px solid rgba(63,185,80,.3); border-radius: 10px; padding: 16px 20px;
    text-align: center;
  }
  .redirect-card.show { display: block; }
  .redirect-card h3 { color: var(--accent2); font-size: 15px; margin-bottom: 6px; }
  .redirect-card p { font-size: 13px; color: var(--muted); }
  .redirect-btn {
    display: inline-block; margin-top: 12px; padding: 10px 24px;
    background: var(--accent2); color: #000; border-radius: 8px;
    font-weight: 700; font-size: 14px; text-decoration: none;
    transition: opacity .15s;
  }
  .redirect-btn:hover { opacity: .85; }

  .pct-label {
    text-align: right; font-family: var(--font-mono); font-size: 12px;
    color: var(--muted); margin-top: -18px; margin-bottom: 20px;
  }
</style>
</head>
<body>
<div class="container">
  <div class="brand">
    <div class="brand-logo">W</div>
    <span class="brand-name">WebForge</span>
    <span class="brand-sep">/</span>
    <span class="brand-pid">Project #${projectId}</span>
  </div>

  <div class="card">
    <div class="phase">
      <div class="phase-dot" id="phase-dot"></div>
      <div>
        <div class="phase-text" id="phase-text">Connecting to build engine...</div>
        <div class="phase-sub" id="phase-sub">Initialising WebForge Ruflo orchestrator</div>
      </div>
    </div>

    <div class="progress-wrap">
      <div class="progress-bar" id="progress-bar"></div>
    </div>
    <div class="pct-label"><span id="pct-label">0%</span></div>

    <div class="stats-row">
      <div class="stat">
        <div class="stat-value" id="stat-written">0</div>
        <div class="stat-label">Files Written</div>
      </div>
      <div class="stat">
        <div class="stat-value" id="stat-total">—</div>
        <div class="stat-label">Total Files</div>
      </div>
      <div class="stat">
        <div class="stat-value" id="stat-round">—</div>
        <div class="stat-label">Build Round</div>
      </div>
      <div class="stat">
        <div class="stat-value" id="stat-elapsed">0s</div>
        <div class="stat-label">Elapsed</div>
      </div>
    </div>

    <div class="log-feed" id="log-feed"></div>

    <div class="redirect-card" id="redirect-card">
      <h3>Build Complete</h3>
      <p>Your app is live. Redirecting automatically in <span id="countdown">3</span>s...</p>
      <a class="redirect-btn" id="redirect-btn" href="#">Open Live App</a>
    </div>
  </div>
</div>

<script>
const PROJECT_ID = '${projectId}';
const API_BASE = '${apiBase}';
const INITIAL_LIVE_URL = '${liveUrl}';

const progressBar = document.getElementById('progress-bar');
const pctLabel = document.getElementById('pct-label');
const phaseText = document.getElementById('phase-text');
const phaseSub = document.getElementById('phase-sub');
const phaseDot = document.getElementById('phase-dot');
const statWritten = document.getElementById('stat-written');
const statTotal = document.getElementById('stat-total');
const statRound = document.getElementById('stat-round');
const statElapsed = document.getElementById('stat-elapsed');
const logFeed = document.getElementById('log-feed');
const redirectCard = document.getElementById('redirect-card');
const redirectBtn = document.getElementById('redirect-btn');
const countdownEl = document.getElementById('countdown');

const startTime = Date.now();
let redirectUrl = null;

// If already deployed, redirect immediately
if (INITIAL_LIVE_URL && INITIAL_LIVE_URL !== 'null' && INITIAL_LIVE_URL !== '') {
  window.location.href = INITIAL_LIVE_URL;
}

function addLog(text, cls = '') {
  const line = document.createElement('div');
  line.className = 'log-line ' + cls;
  line.textContent = '[' + new Date().toLocaleTimeString() + '] ' + text;
  logFeed.appendChild(line);
  logFeed.scrollTop = logFeed.scrollHeight;
}

function setProgress(percent, status, sub) {
  progressBar.style.width = percent + '%';
  pctLabel.textContent = Math.round(percent) + '%';
  if (status) { phaseText.textContent = status; addLog(status, 'info'); }
  if (sub) phaseSub.textContent = sub;
}

function triggerRedirect(url) {
  redirectUrl = url;
  redirectBtn.href = url;
  redirectCard.classList.add('show');
  phaseDot.className = 'phase-dot done';
  phaseText.textContent = 'Build complete!';
  phaseSub.textContent = url;
  addLog('Build complete — redirecting to ' + url, 'ok');
  setProgress(100, null, null);

  let count = 3;
  const iv = setInterval(() => {
    count--;
    countdownEl.textContent = count;
    if (count <= 0) { clearInterval(iv); window.location.href = url; }
  }, 1000);
}

// Elapsed timer
setInterval(() => {
  const s = Math.round((Date.now() - startTime) / 1000);
  statElapsed.textContent = s < 60 ? s + 's' : Math.floor(s/60) + 'm ' + (s%60) + 's';
}, 1000);

// SSE
const evtSource = new EventSource(API_BASE + '/projects/' + PROJECT_ID + '/stream');

evtSource.onopen = () => {
  addLog('Stream connected to build engine', 'ok');
  setProgress(2, 'Connected to build engine', 'Waiting for orchestrator...');
};

evtSource.onmessage = (e) => {
  try {
    const data = JSON.parse(e.data);
    switch (data.type) {
      case 'connected':
        addLog('Ruflo orchestrator online', 'ok');
        break;
      case 'progress':
        setProgress(data.percent, data.status, null);
        if (data.filesWritten !== undefined) statWritten.textContent = data.filesWritten;
        if (data.filesTotal !== undefined && data.filesTotal > 0) statTotal.textContent = data.filesTotal;
        break;
      case 'round':
        statRound.textContent = data.round + ' / ' + (data.maxRounds || 5);
        addLog('DeepBuild round ' + data.round + ': ' + data.message, 'round');
        break;
      case 'status':
        addLog(data.status, 'info');
        phaseText.textContent = data.status;
        break;
      case 'redirect':
        evtSource.close();
        triggerRedirect(data.url);
        break;
    }
  } catch (_) {}
};

evtSource.onerror = () => {
  addLog('Stream interrupted — will reconnect...', '');
};
</script>
</body>
</html>`;

router.get("/deploying/:projectId", async (req: Request, res: Response) => {
  const { projectId } = req.params;
  const host = req.get("host") ?? "localhost";
  const proto = req.get("x-forwarded-proto") ?? "http";
  const apiBase = `${proto}://${host}/api`;

  let liveUrl = "";
  try {
    const rows = await db.select().from(projectsTable).where(eq(projectsTable.id, Number(projectId))).limit(1);
    liveUrl = rows[0]?.liveUrl ?? "";
  } catch (_) {}

  res.setHeader("Content-Type", "text/html");
  res.send(DEPLOYING_HTML(String(projectId), apiBase, liveUrl));
});

export default router;
