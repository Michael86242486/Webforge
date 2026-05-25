import { Router } from "express";
import type { Request, Response } from "express";

const router = Router();

const WORKSPACE_HTML = (projectId: string, apiBase: string) => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>WebForge Workspace — Project ${projectId}</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --bg: #0d1117;
    --surface: #161b22;
    --border: #30363d;
    --accent: #58a6ff;
    --green: #3fb950;
    --text: #c9d1d9;
    --muted: #8b949e;
    --code-bg: #010409;
    --font-mono: 'JetBrains Mono', 'Fira Code', monospace;
  }
  html, body { height: 100%; overflow: hidden; background: var(--bg); color: var(--text); font-family: -apple-system, BlinkMacSystemFont, sans-serif; }

  .header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 0 16px; height: 44px; background: var(--surface);
    border-bottom: 1px solid var(--border); flex-shrink: 0; z-index: 10;
  }
  .header-brand { display: flex; align-items: center; gap: 8px; font-weight: 600; font-size: 14px; }
  .header-brand .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--accent); animation: pulse 2s infinite; }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
  .header-meta { font-size: 12px; color: var(--muted); }
  .header-actions { display: flex; gap: 8px; }
  .btn { padding: 5px 12px; border-radius: 6px; border: 1px solid var(--border); background: var(--surface); color: var(--text); cursor: pointer; font-size: 12px; transition: all .15s; }
  .btn:hover { background: #21262d; border-color: var(--accent); color: var(--accent); }
  .btn.primary { background: var(--accent); color: #000; border-color: var(--accent); }
  .btn.primary:hover { background: #79b8ff; }

  .workspace { display: flex; height: calc(100vh - 44px); overflow: hidden; }

  .pane { display: flex; flex-direction: column; overflow: hidden; }
  .pane-left { width: 50%; border-right: 1px solid var(--border); }
  .pane-right { flex: 1; }

  .pane-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 0 12px; height: 36px; background: #0d1117;
    border-bottom: 1px solid var(--border); flex-shrink: 0;
    font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: .08em;
  }
  .pane-header .status { display: flex; align-items: center; gap: 6px; }
  .status-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--green); }
  .status-dot.idle { background: var(--muted); }
  .status-dot.building { background: #f0883e; animation: pulse 1s infinite; }

  .code-editor {
    flex: 1; position: relative; overflow: hidden;
    background: var(--code-bg);
  }
  #code-output {
    position: absolute; inset: 0; padding: 16px;
    font-family: var(--font-mono); font-size: 13px; line-height: 1.6;
    color: var(--text); overflow-y: auto; white-space: pre-wrap;
    word-break: break-all;
  }
  #code-output .chunk { animation: fadeIn .1s ease; }
  @keyframes fadeIn { from{opacity:0} to{opacity:1} }

  .code-editor textarea {
    position: absolute; inset: 0; width: 100%; height: 100%;
    background: transparent; border: none; outline: none; resize: none;
    font-family: var(--font-mono); font-size: 13px; line-height: 1.6;
    color: var(--text); padding: 16px; display: none;
  }

  .file-tabs {
    display: flex; overflow-x: auto; background: var(--surface);
    border-bottom: 1px solid var(--border); flex-shrink: 0;
  }
  .file-tab {
    padding: 6px 14px; font-size: 12px; cursor: pointer; white-space: nowrap;
    color: var(--muted); border-right: 1px solid var(--border);
    transition: all .1s;
  }
  .file-tab.active { color: var(--text); background: var(--code-bg); border-bottom: 2px solid var(--accent); }
  .file-tab:hover:not(.active) { color: var(--text); background: #21262d; }

  .sandbox-frame { flex: 1; width: 100%; border: none; background: #fff; }

  .overlay-bar {
    position: absolute; bottom: 12px; right: 12px; left: 12px;
    background: var(--surface); border: 1px solid var(--border); border-radius: 8px;
    padding: 8px 12px; display: flex; gap: 8px; align-items: center; z-index: 20;
    display: none;
  }
  .overlay-bar input {
    flex: 1; background: transparent; border: none; outline: none;
    color: var(--text); font-family: var(--font-mono); font-size: 13px;
  }

  .metrics {
    padding: 6px 12px; background: #010409; border-top: 1px solid var(--border);
    display: flex; gap: 16px; font-size: 11px; color: var(--muted); flex-shrink: 0;
  }
  .metric { display: flex; gap: 4px; }
  .metric-value { color: var(--accent); font-family: var(--font-mono); }

  .resizer {
    width: 4px; background: var(--border); cursor: col-resize; flex-shrink: 0;
    transition: background .1s;
  }
  .resizer:hover { background: var(--accent); }
</style>
</head>
<body>
<header class="header">
  <div class="header-brand">
    <div class="dot"></div>
    WebForge
    <span style="color:var(--muted);font-weight:400">/ Project #${projectId}</span>
  </div>
  <div class="header-meta" id="stream-status">Connecting to stream...</div>
  <div class="header-actions">
    <button class="btn" onclick="toggleEdit()">✏️ Edit</button>
    <button class="btn" onclick="saveFile()">💾 Save</button>
    <button class="btn primary" onclick="reloadSandbox()">▶ Run</button>
  </div>
</header>

<div class="workspace">
  <div class="pane pane-left">
    <div class="pane-header">
      <span>Code Canvas</span>
      <div class="status">
        <div class="status-dot idle" id="build-dot"></div>
        <span id="build-status">Idle</span>
      </div>
    </div>
    <div class="file-tabs" id="file-tabs"></div>
    <div class="code-editor">
      <div id="code-output"></div>
      <textarea id="code-edit" placeholder="Edit code here..."></textarea>
    </div>
    <div class="metrics">
      <div class="metric">⏱ <span class="metric-value" id="m-time">0s</span></div>
      <div class="metric">📄 <span class="metric-value" id="m-files">0</span> files</div>
      <div class="metric">+ <span class="metric-value" id="m-added">0</span></div>
      <div class="metric">- <span class="metric-value" id="m-removed">0</span></div>
      <div class="metric">💰 <span class="metric-value" id="m-cost">$0.00</span></div>
    </div>
  </div>

  <div class="resizer" id="resizer"></div>

  <div class="pane pane-right">
    <div class="pane-header">
      <span>Live Sandbox</span>
      <div class="status">
        <div class="status-dot" id="sandbox-dot"></div>
        <span id="sandbox-status">Ready</span>
      </div>
    </div>
    <iframe class="sandbox-frame" id="sandbox-frame" src="about:blank"></iframe>
  </div>
</div>

<script>
const PROJECT_ID = '${projectId}';
const API_BASE = '${apiBase}';
let editMode = false;
let currentFile = null;
let startTime = Date.now();

// SSE Stream
const evtSource = new EventSource(\`\${API_BASE}/projects/\${PROJECT_ID}/stream\`);

evtSource.onopen = () => {
  document.getElementById('stream-status').textContent = 'Stream connected';
};

evtSource.onmessage = (e) => {
  try {
    const data = JSON.parse(e.data);
    handleStreamEvent(data);
  } catch(_) {
    appendCode(e.data);
  }
};

evtSource.onerror = () => {
  document.getElementById('stream-status').textContent = 'Stream disconnected — retrying...';
};

function handleStreamEvent(data) {
  switch(data.type) {
    case 'chunk': appendCode(data.content); break;
    case 'file': loadFile(data.name, data.content); break;
    case 'reload': reloadSandbox(); break;
    case 'metrics': updateMetrics(data); break;
    case 'status': updateBuildStatus(data.status); break;
  }
}

function appendCode(text) {
  const out = document.getElementById('code-output');
  const span = document.createElement('span');
  span.className = 'chunk';
  span.textContent = text;
  out.appendChild(span);
  out.scrollTop = out.scrollHeight;
}

function loadFile(name, content) {
  const tabs = document.getElementById('file-tabs');
  let tab = tabs.querySelector(\`[data-file="\${name}"]\`);
  if (!tab) {
    tab = document.createElement('div');
    tab.className = 'file-tab';
    tab.setAttribute('data-file', name);
    tab.textContent = name.split('/').pop();
    tab.onclick = () => selectFile(name, content);
    tabs.appendChild(tab);
  }
  if (!currentFile) selectFile(name, content);
}

function selectFile(name, content) {
  currentFile = name;
  document.querySelectorAll('.file-tab').forEach(t => t.classList.toggle('active', t.getAttribute('data-file') === name));
  document.getElementById('code-output').textContent = content;
  document.getElementById('code-edit').value = content;
}

function updateBuildStatus(status) {
  const dot = document.getElementById('build-dot');
  const label = document.getElementById('build-status');
  dot.className = 'status-dot ' + (status === 'building' ? 'building' : status === 'done' ? '' : 'idle');
  label.textContent = status.charAt(0).toUpperCase() + status.slice(1);
}

function updateMetrics(data) {
  if (data.timeMs) document.getElementById('m-time').textContent = Math.round(data.timeMs/1000) + 's';
  if (data.files !== undefined) document.getElementById('m-files').textContent = data.files;
  if (data.added !== undefined) document.getElementById('m-added').textContent = data.added;
  if (data.removed !== undefined) document.getElementById('m-removed').textContent = data.removed;
  if (data.cost !== undefined) document.getElementById('m-cost').textContent = '$' + data.cost.toFixed(4);
}

function toggleEdit() {
  editMode = !editMode;
  document.getElementById('code-output').style.display = editMode ? 'none' : 'block';
  document.getElementById('code-edit').style.display = editMode ? 'block' : 'none';
}

async function saveFile() {
  if (!currentFile) return;
  const content = document.getElementById('code-edit').value;
  try {
    await fetch(\`\${API_BASE}/projects/\${PROJECT_ID}/files\`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: currentFile, content }),
    });
    document.getElementById('code-output').textContent = content;
    if (!editMode) toggleEdit();
  } catch(e) { console.error('Save failed', e); }
}

function reloadSandbox() {
  const frame = document.getElementById('sandbox-frame');
  frame.src = \`\${API_BASE}/preview-proxy/\${PROJECT_ID}/\`;
  document.getElementById('sandbox-dot').className = 'status-dot';
  document.getElementById('sandbox-status').textContent = 'Running';
}

// Resizer drag
const resizer = document.getElementById('resizer');
const leftPane = document.querySelector('.pane-left');
let isResizing = false;
resizer.addEventListener('mousedown', () => { isResizing = true; });
document.addEventListener('mousemove', (e) => {
  if (!isResizing) return;
  const total = document.querySelector('.workspace').offsetWidth;
  const pct = Math.max(20, Math.min(80, (e.clientX / total) * 100));
  leftPane.style.width = pct + '%';
});
document.addEventListener('mouseup', () => { isResizing = false; });

// Timer
setInterval(() => {
  const elapsed = Math.round((Date.now() - startTime) / 1000);
  document.getElementById('m-time').textContent = elapsed + 's';
}, 1000);

// Initial sandbox load attempt
setTimeout(reloadSandbox, 1000);
</script>
</body>
</html>`;

router.get("/workspace/:projectId", (req: Request, res: Response) => {
  const { projectId } = req.params;
  const host = req.get("host") ?? "localhost";
  const proto = req.get("x-forwarded-proto") ?? "http";
  const apiBase = `${proto}://${host}/api`;
  res.setHeader("Content-Type", "text/html");
  res.send(WORKSPACE_HTML(projectId, apiBase));
});

export default router;
