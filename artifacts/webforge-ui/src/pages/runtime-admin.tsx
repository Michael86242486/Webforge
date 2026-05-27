import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "") + "/../api";

type NavSection = "projects" | "containers" | "logs" | "health" | "settings" | "github" | "nodes";
type MainPanel = "preview" | "terminal" | "metrics" | "resources";

interface RuntimeProject {
  projectId: string;
  owner: string;
  framework: string;
  status: string;
  port: number | null;
  liveUrl: string | null;
  healthScore: number;
  createdAt: string;
  updatedAt: string;
}

interface Metrics {
  total: number;
  running: number;
  crashed: number;
  building: number;
  stopped: number;
  avgHealthScore: number;
  portsUsed: number[];
  uptime: number;
  memoryMB: number;
  timestamp: string;
}

interface NodeRecord {
  connection_code: string;
  telegram_chat_id: string | null;
  allocated_port: number;
  status: "ACTIVE" | "STANDBY" | "SUSPENDED";
  created_at: string;
  updated_at: string;
}

function useWindowWidth() {
  const [width, setWidth] = useState(typeof window !== "undefined" ? window.innerWidth : 1280);
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return width;
}

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${h}h ${m}m ${s}s`;
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    running: "#00f0ff",
    building: "#f0a500",
    installing: "#f0a500",
    stopped: "#444",
    crashed: "#f85149",
    error: "#f85149",
    pending: "#888",
    not_found: "#333",
    ACTIVE: "#00f0ff",
    STANDBY: "#f0a500",
    SUSPENDED: "#f85149",
  };
  const color = colors[status] ?? "#888";
  return (
    <span style={{
      padding: "2px 8px",
      borderRadius: "100px",
      fontSize: "10px",
      fontWeight: "700",
      letterSpacing: "0.08em",
      textTransform: "uppercase",
      border: `1px solid ${color}33`,
      color,
      background: `${color}11`,
      whiteSpace: "nowrap",
    }}>
      {status}
    </span>
  );
}

function MetricCard({ label, value, unit, color = "#00f0ff" }: { label: string; value: string | number; unit?: string; color?: string }) {
  return (
    <div style={{
      background: "#070707",
      border: "1px solid #0d2020",
      borderRadius: "10px",
      padding: "16px",
      flex: 1,
      minWidth: "100px",
    }}>
      <div style={{ fontSize: "10px", color: "#1e4040", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "6px" }}>{label}</div>
      <div style={{ fontSize: "24px", fontWeight: "900", color, lineHeight: 1, fontFamily: "monospace" }}>
        {value}
        {unit && <span style={{ fontSize: "12px", color: "#1e4040", marginLeft: "4px" }}>{unit}</span>}
      </div>
    </div>
  );
}

export default function RuntimeAdmin() {
  const { user, logout, isAuthenticated } = useAuth();
  const windowWidth = useWindowWidth();
  const isMobile = windowWidth < 768;
  const isTablet = windowWidth < 1024;

  const [nav, setNav] = useState<NavSection>("projects");
  const [panel, setPanel] = useState<MainPanel>("metrics");
  const [projects, setProjects] = useState<RuntimeProject[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [selectedProject, setSelectedProject] = useState<RuntimeProject | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [createId, setCreateId] = useState("");
  const [creating, setCreating] = useState(false);
  const [createMsg, setCreateMsg] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(!isMobile);
  const [listPanelOpen, setListPanelOpen] = useState(!isMobile);
  const wsRef = useRef<WebSocket | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const [wsConnected, setWsConnected] = useState(false);

  // ── GitHub Push state ──────────────────────────────────────────────────────
  const [githubToken, setGithubToken] = useState("");
  const [githubRepo, setGithubRepo] = useState("");
  const [githubUsername, setGithubUsername] = useState("");
  const [githubMsg, setGithubMsg] = useState("");
  const [githubPushing, setGithubPushing] = useState(false);

  // ── Nodes (Handshake) state ────────────────────────────────────────────────
  const [nodes, setNodes] = useState<NodeRecord[]>([]);
  const [generatingNode, setGeneratingNode] = useState(false);
  const [newNodeCode, setNewNodeCode] = useState("");
  const [connectCode, setConnectCode] = useState("");
  const [connectChatId, setConnectChatId] = useState("");
  const [nodeMsg, setNodeMsg] = useState("");

  const token = typeof window !== "undefined" ? localStorage.getItem("wre_token") : null;

  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/runtime/list`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json() as { projects: RuntimeProject[] };
        setProjects(data.projects ?? []);
      }
    } catch { /* network error */ }
  }, [token]);

  const fetchMetrics = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/runtime/metrics`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: "include",
      });
      if (res.ok) setMetrics(await res.json() as Metrics);
    } catch { /* noop */ }
  }, [token]);

  const fetchLogs = useCallback(async (projectId: string) => {
    setLogsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/runtime/logs/${projectId}?lines=200`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json() as { logs: string[] };
        setLogs(data.logs ?? []);
      }
    } catch { /* noop */ }
    setLogsLoading(false);
  }, [token]);

  const fetchNodes = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/v1/nodes/list`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json() as { nodes: NodeRecord[] };
        setNodes(data.nodes ?? []);
      }
    } catch { /* noop */ }
  }, [token]);

  useEffect(() => {
    fetchProjects();
    fetchMetrics();
    const interval = setInterval(() => { fetchProjects(); fetchMetrics(); }, 5000);
    return () => clearInterval(interval);
  }, [fetchProjects, fetchMetrics]);

  useEffect(() => {
    if (nav === "nodes") fetchNodes();
  }, [nav, fetchNodes]);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  useEffect(() => {
    setSidebarOpen(!isMobile);
    setListPanelOpen(!isMobile);
  }, [isMobile]);

  useEffect(() => {
    const wsProto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsHost = window.location.host;
    const wsPath = import.meta.env.BASE_URL.replace(/\/$/, "") + "/../api".replace("/api", "");
    const wsUrl = `${wsProto}//${wsHost}${wsPath}/runtime/ws`;

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      ws.onopen = () => setWsConnected(true);
      ws.onclose = () => setWsConnected(false);
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data) as { type: string; line?: string; status?: string; projectId?: string };
          if (msg.type === "log" && msg.line) {
            if (!selectedProject || msg.projectId === selectedProject.projectId) {
              setLogs(prev => [...prev.slice(-300), msg.line!]);
            }
          }
          if (msg.type === "status") fetchProjects();
        } catch { /* noop */ }
      };
      return () => { ws.close(); };
    } catch { /* WS not available */ }
  }, [selectedProject, fetchProjects]);

  const handleSelectProject = (p: RuntimeProject) => {
    setSelectedProject(p);
    setPanel("terminal");
    setNav("logs");
    fetchLogs(p.projectId);
    if (isMobile) setSidebarOpen(false);
  };

  const handleRestart = async (projectId: string) => {
    await fetch(`${API_BASE}/runtime/restart`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      credentials: "include",
      body: JSON.stringify({ projectId }),
    });
    fetchProjects();
  };

  const handleDelete = async (projectId: string) => {
    if (!confirm(`Delete project ${projectId}?`)) return;
    await fetch(`${API_BASE}/runtime/delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      credentials: "include",
      body: JSON.stringify({ projectId }),
    });
    setSelectedProject(null);
    fetchProjects();
  };

  const handleCreate = async () => {
    if (!createId.trim()) return;
    setCreating(true);
    setCreateMsg("Sending to WRE...");
    try {
      const res = await fetch(`${API_BASE}/runtime/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        credentials: "include",
        body: JSON.stringify({ projectId: createId.trim() }),
      });
      if (res.ok) {
        setCreateMsg("✅ Runtime creation started.");
        setNav("projects");
        setTimeout(fetchProjects, 1500);
      } else {
        const err = await res.json() as { error?: string };
        setCreateMsg(`❌ ${err.error ?? "Failed"}`);
      }
    } catch {
      setCreateMsg("❌ Network error");
    }
    setCreating(false);
  };

  const handleGitHubPush = async () => {
    if (!selectedProject) { setGithubMsg("❌ Select a project first"); return; }
    if (!githubToken || !githubRepo) { setGithubMsg("❌ Token and repo name are required"); return; }
    setGithubPushing(true);
    setGithubMsg("Pushing to GitHub...");
    try {
      const res = await fetch(`${API_BASE}/runtime/github/push`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        credentials: "include",
        body: JSON.stringify({
          projectId: selectedProject.projectId,
          githubToken,
          repoName: githubRepo,
          username: githubUsername || undefined,
        }),
      });
      const data = await res.json() as { success?: boolean; repoUrl?: string; error?: string; hint?: string };
      if (data.success) {
        setGithubMsg(`✅ Pushed to ${data.repoUrl}`);
      } else {
        setGithubMsg(`❌ ${data.error ?? "Push failed"}${data.hint ? ` — ${data.hint}` : ""}`);
      }
    } catch {
      setGithubMsg("❌ Network error during push");
    }
    setGithubPushing(false);
  };

  const handleGenerateNode = async () => {
    setGeneratingNode(true);
    setNodeMsg("");
    try {
      const res = await fetch(`${API_BASE}/v1/nodes/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        credentials: "include",
        body: JSON.stringify({}),
      });
      const data = await res.json() as { connection_code?: string; allocated_port?: number; error?: string };
      if (data.connection_code) {
        setNewNodeCode(data.connection_code);
        setNodeMsg(`✅ Code generated: ${data.connection_code} (port ${data.allocated_port})`);
        fetchNodes();
      } else {
        setNodeMsg(`❌ ${data.error ?? "Generation failed"}`);
      }
    } catch {
      setNodeMsg("❌ Network error");
    }
    setGeneratingNode(false);
  };

  const handleConnectNode = async () => {
    if (!connectCode || !connectChatId) { setNodeMsg("❌ Code and Chat ID required"); return; }
    try {
      const res = await fetch(`${API_BASE}/v1/nodes/connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        credentials: "include",
        body: JSON.stringify({ code: connectCode, chat_id: connectChatId }),
      });
      const data = await res.json() as { success?: boolean; message?: string; error?: string };
      if (data.success) {
        setNodeMsg(`✅ ${data.message}`);
        setConnectCode("");
        setConnectChatId("");
        fetchNodes();
      } else {
        setNodeMsg(`❌ ${data.error}`);
      }
    } catch {
      setNodeMsg("❌ Network error");
    }
  };

  const navItems: Array<{ id: NavSection; label: string; icon: string }> = [
    { id: "projects", label: "Projects", icon: "◈" },
    { id: "containers", label: "Containers", icon: "⬡" },
    { id: "logs", label: "Logs", icon: "▤" },
    { id: "health", label: "Health", icon: "◎" },
    { id: "github", label: "GitHub", icon: "⎈" },
    { id: "nodes", label: "Nodes", icon: "⬡" },
    { id: "settings", label: "Settings", icon: "⚙" },
  ];

  const panelItems: Array<{ id: MainPanel; label: string }> = [
    { id: "metrics", label: "Metrics" },
    { id: "preview", label: "Preview" },
    { id: "terminal", label: "Terminal" },
    { id: "resources", label: "Resources" },
  ];

  const inputStyle: React.CSSProperties = {
    width: "100%",
    background: "#0a0a0a",
    border: "1px solid #1a3a3a",
    color: "#00f0ff",
    padding: "10px 12px",
    borderRadius: "6px",
    fontFamily: "inherit",
    fontSize: "13px",
    outline: "none",
    marginBottom: "10px",
    boxSizing: "border-box",
  };

  return (
    <div style={{
      display: "flex",
      height: "100dvh",
      width: "100vw",
      background: "#000",
      color: "#ccc",
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Courier New', monospace",
      overflow: "hidden",
      fontSize: isMobile ? "12px" : "13px",
      position: "relative",
    }}>
      <style>{`
        ::-webkit-scrollbar { width: 3px; background: #070707; }
        ::-webkit-scrollbar-thumb { background: #0a2020; border-radius: 4px; }
        ::-webkit-scrollbar-thumb:hover { background: #00f0ff33; }
        .wre-nav-item { display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-radius: 6px; cursor: pointer; color: #2a4a4a; transition: all 0.15s; border: 1px solid transparent; margin-bottom: 2px; }
        .wre-nav-item:hover { color: #00f0ff; background: #00f0ff08; border-color: #00f0ff15; }
        .wre-nav-item.active { color: #00f0ff; background: #00f0ff0d; border-color: #00f0ff22; }
        .wre-panel-tab { padding: 6px 12px; border: none; background: none; color: #2a4a4a; cursor: pointer; font-family: inherit; font-size: 11px; border-bottom: 2px solid transparent; transition: all 0.15s; letter-spacing: 0.05em; white-space: nowrap; }
        .wre-panel-tab:hover { color: #00f0ff; }
        .wre-panel-tab.active { color: #00f0ff; border-bottom-color: #00f0ff; }
        .wre-project-row { padding: 10px 14px; border-bottom: 1px solid #0a1a1a; cursor: pointer; transition: background 0.15s; display: flex; align-items: center; gap: 10px; }
        .wre-project-row:hover { background: #00f0ff06; }
        .wre-project-row.selected { background: #00f0ff0a; border-left: 2px solid #00f0ff; }
        .wre-action-btn { padding: 6px 12px; background: transparent; border: 1px solid #1a3a3a; color: #2a5a5a; border-radius: 4px; cursor: pointer; font-family: inherit; font-size: 11px; transition: all 0.15s; white-space: nowrap; }
        .wre-action-btn:hover { border-color: #00f0ff44; color: #00f0ff; background: #00f0ff08; }
        .wre-action-btn:disabled { opacity: 0.4; cursor: default; }
        .wre-action-btn.danger:hover { border-color: #f8514944; color: #f85149; background: #f8514908; }
        .wre-action-btn.primary { border-color: #00f0ff44; color: #00f0ff88; }
        .wre-action-btn.primary:hover { background: #00f0ff15; border-color: #00f0ff; color: #00f0ff; }
        @keyframes wre-blink { 0%,100%{opacity:1} 50%{opacity:0} }
        .wre-cursor { animation: wre-blink 1s step-end infinite; }
        .wre-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.7); z-index: 9; }
        @media (max-width: 767px) {
          .wre-sidebar { position: fixed !important; left: 0; top: 0; height: 100dvh; z-index: 10; transform: translateX(-100%); transition: transform 0.2s ease; }
          .wre-sidebar.open { transform: translateX(0); }
        }
      `}</style>

      {/* ── Mobile overlay ── */}
      {isMobile && sidebarOpen && (
        <div className="wre-overlay" onClick={() => setSidebarOpen(false)} />
      )}

      {/* ── Left Sidebar ── */}
      <div
        className={`wre-sidebar${sidebarOpen ? " open" : ""}`}
        style={{
          width: isMobile ? "200px" : "200px",
          flexShrink: 0,
          background: "#040404",
          borderRight: "1px solid #0a1a1a",
          display: "flex",
          flexDirection: "column",
          ...(isMobile ? {} : { position: "relative" }),
        }}
      >
        {/* Brand */}
        <div style={{ padding: "16px 14px 12px", borderBottom: "1px solid #0a1a1a" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: "9px", color: "#1a3a3a", letterSpacing: "0.25em", textTransform: "uppercase" }}>WebForge</div>
              <div style={{ fontSize: "16px", fontWeight: "900", color: "#fff" }}>
                WRE<span style={{ color: "#00f0ff" }}>.</span>
              </div>
            </div>
            {isMobile && (
              <button onClick={() => setSidebarOpen(false)} style={{ background: "none", border: "none", color: "#2a4a4a", cursor: "pointer", fontSize: "18px", padding: "4px" }}>✕</button>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "6px" }}>
            <div style={{ width: "5px", height: "5px", borderRadius: "50%", background: wsConnected ? "#00f0ff" : "#333", boxShadow: wsConnected ? "0 0 5px #00f0ff" : "none" }} />
            <span style={{ fontSize: "9px", color: wsConnected ? "#1a4a4a" : "#2a2a2a" }}>
              {wsConnected ? "LIVE" : "OFFLINE"}
            </span>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: "10px 6px", overflowY: "auto" }}>
          {navItems.map(item => (
            <div
              key={item.id}
              className={`wre-nav-item${nav === item.id ? " active" : ""}`}
              onClick={() => { setNav(item.id); if (isMobile) setSidebarOpen(false); }}
            >
              <span style={{ fontSize: "13px" }}>{item.icon}</span>
              <span style={{ fontSize: "11px", letterSpacing: "0.05em" }}>{item.label}</span>
              {item.id === "projects" && metrics && (
                <span style={{ marginLeft: "auto", fontSize: "9px", background: "#0a2020", color: "#00f0ff66", padding: "1px 5px", borderRadius: "100px" }}>
                  {metrics.total}
                </span>
              )}
              {item.id === "nodes" && nodes.length > 0 && (
                <span style={{ marginLeft: "auto", fontSize: "9px", background: "#0a2020", color: "#00f0ff66", padding: "1px 5px", borderRadius: "100px" }}>
                  {nodes.length}
                </span>
              )}
            </div>
          ))}
        </nav>

        {/* User */}
        <div style={{ padding: "10px 14px", borderTop: "1px solid #0a1a1a" }}>
          {isAuthenticated && user ? (
            <div>
              <div style={{ fontSize: "10px", color: "#1a3a3a", marginBottom: "4px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {user.email}
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: "9px", color: "#00f0ff44", textTransform: "uppercase" }}>{user.role}</span>
                <button onClick={logout} className="wre-action-btn" style={{ fontSize: "9px", padding: "3px 8px" }}>out</button>
              </div>
            </div>
          ) : (
            <a href="/login" style={{ color: "#00f0ff66", fontSize: "10px", textDecoration: "none" }}>
              → Sign in
            </a>
          )}
        </div>
      </div>

      {/* ── Main Content ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
        {/* Top bar */}
        <div style={{
          height: "44px",
          borderBottom: "1px solid #0a1a1a",
          display: "flex",
          alignItems: "center",
          padding: "0 12px",
          gap: "2px",
          flexShrink: 0,
          background: "#030303",
        }}>
          {/* Hamburger for mobile */}
          {isMobile && (
            <button
              onClick={() => setSidebarOpen(s => !s)}
              style={{ background: "none", border: "1px solid #1a3a3a", color: "#2a5a5a", borderRadius: "4px", padding: "4px 8px", cursor: "pointer", marginRight: "8px", fontSize: "14px", fontFamily: "inherit", flexShrink: 0 }}
            >
              ☰
            </button>
          )}
          <div style={{ display: "flex", gap: "0", overflowX: "auto", flex: 1 }}>
            {panelItems.map(item => (
              <button key={item.id} className={`wre-panel-tab${panel === item.id ? " active" : ""}`} onClick={() => setPanel(item.id)}>
                {item.label}
              </button>
            ))}
          </div>
          {!isMobile && metrics && (
            <div style={{ marginLeft: "auto", fontSize: "10px", color: "#0a2020", display: "flex", alignItems: "center", gap: "10px", flexShrink: 0 }}>
              <span style={{ color: "#00f0ff33" }}>{metrics.running} running</span>
              <span>·</span>
              <span style={{ color: metrics.crashed > 0 ? "#f8514944" : "#0a2020" }}>{metrics.crashed} crashed</span>
            </div>
          )}
        </div>

        {/* Content split */}
        <div style={{ flex: 1, display: "flex", overflow: "hidden", flexDirection: isMobile ? "column" : "row" }}>
          {/* Left list panel — collapsible on mobile */}
          {(!isMobile || listPanelOpen) && (
            <div style={{
              width: isMobile ? "100%" : isTablet ? "280px" : "320px",
              flexShrink: 0,
              borderRight: isMobile ? "none" : "1px solid #0a1a1a",
              borderBottom: isMobile ? "1px solid #0a1a1a" : "none",
              display: "flex",
              flexDirection: "column",
              background: "#020202",
              overflow: "hidden",
              maxHeight: isMobile ? "40vh" : "100%",
            }}>
              <div style={{ padding: "12px 14px 8px", borderBottom: "1px solid #0a1a1a", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
                <span style={{ fontSize: "10px", color: "#00f0ff66", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                  {nav === "projects" && "Active Projects"}
                  {nav === "containers" && "Container Registry"}
                  {nav === "logs" && "Log Streams"}
                  {nav === "health" && "Health Monitor"}
                  {nav === "settings" && "Configuration"}
                  {nav === "github" && "GitHub Integration"}
                  {nav === "nodes" && "Node Connections"}
                </span>
                <div style={{ display: "flex", gap: "6px" }}>
                  {nav === "projects" && (
                    <button className="wre-action-btn" onClick={fetchProjects} style={{ fontSize: "9px", padding: "3px 8px" }}>↺</button>
                  )}
                  {isMobile && (
                    <button className="wre-action-btn" onClick={() => setListPanelOpen(false)} style={{ fontSize: "9px", padding: "3px 8px" }}>▲</button>
                  )}
                </div>
              </div>

              {/* Project list */}
              {(nav === "projects" || nav === "containers" || nav === "logs" || nav === "health") && (
                <div style={{ flex: 1, overflowY: "auto" }}>
                  {projects.length === 0 ? (
                    <div style={{ padding: "32px 16px", textAlign: "center", color: "#0a2020" }}>
                      <div style={{ fontSize: "20px", marginBottom: "8px" }}>◈</div>
                      <div style={{ fontSize: "11px" }}>No active projects</div>
                    </div>
                  ) : (
                    projects.map(p => (
                      <div
                        key={p.projectId}
                        className={`wre-project-row${selectedProject?.projectId === p.projectId ? " selected" : ""}`}
                        onClick={() => handleSelectProject(p)}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "3px", flexWrap: "wrap" }}>
                            <span style={{ color: "#ccc", fontWeight: "700", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: isMobile ? "120px" : "100px" }}>
                              {p.projectId}
                            </span>
                            <StatusBadge status={p.status} />
                          </div>
                          <div style={{ display: "flex", gap: "8px", fontSize: "10px", color: "#1a3a3a" }}>
                            <span>{p.framework}</span>
                            {p.port && <span>:{p.port}</span>}
                            {nav === "health" && (
                              <span style={{ color: p.healthScore >= 80 ? "#00f0ff55" : p.healthScore >= 50 ? "#f0a50055" : "#f8514955" }}>
                                ♥ {p.healthScore}%
                              </span>
                            )}
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: "4px" }}>
                          {p.status === "running" && (
                            <button className="wre-action-btn" onClick={e => { e.stopPropagation(); handleRestart(p.projectId); }}>↺</button>
                          )}
                          <button className="wre-action-btn danger" onClick={e => { e.stopPropagation(); handleDelete(p.projectId); }}>✕</button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* Settings panel */}
              {nav === "settings" && (
                <div style={{ flex: 1, overflowY: "auto", padding: "16px" }}>
                  <div style={{ marginBottom: "20px" }}>
                    <div style={{ fontSize: "10px", color: "#00f0ff66", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "10px" }}>
                      Spawn Runtime
                    </div>
                    <input style={inputStyle} placeholder="project-id (e.g. WF123)" value={createId} onChange={e => setCreateId(e.target.value)} />
                    <button className="wre-action-btn primary" onClick={handleCreate} disabled={creating} style={{ width: "100%", justifyContent: "center", padding: "10px" }}>
                      {creating ? "Creating..." : "+ Spawn Runtime"}
                    </button>
                    {createMsg && <div style={{ fontSize: "10px", color: "#00f0ff66", marginTop: "8px" }}>{createMsg}</div>}
                  </div>
                  <div style={{ borderTop: "1px solid #0a1a1a", paddingTop: "16px" }}>
                    <div style={{ fontSize: "10px", color: "#1a3a3a", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "10px" }}>WRE Config</div>
                    {[
                      ["Engine", "Super Orchestrator v2.0"],
                      ["Architecture", "Multi-Agent Parallel"],
                      ["Isolation", "Sandbox + Confinement"],
                      ["Port Range", "5100–5999 (projects)"],
                      ["Node Ports", "6100–6999 (nodes)"],
                      ["Auth", "JWT + bcrypt"],
                      ["WebSocket", "/runtime/ws"],
                    ].map(([k, v]) => (
                      <div key={k} style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                        <span style={{ color: "#1a3a3a", fontSize: "10px" }}>{k}</span>
                        <span style={{ color: "#2a5a5a", fontSize: "10px", maxWidth: "130px", textAlign: "right" }}>{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* GitHub panel */}
              {nav === "github" && (
                <div style={{ flex: 1, overflowY: "auto", padding: "16px" }}>
                  <div style={{ fontSize: "10px", color: "#1a3a3a", marginBottom: "14px", lineHeight: "1.6" }}>
                    Push any running project to a GitHub repository. The token needs <span style={{ color: "#00f0ff66" }}>repo</span> scope.
                  </div>

                  <div style={{ fontSize: "10px", color: "#00f0ff66", textTransform: "uppercase", marginBottom: "8px" }}>
                    Selected Project
                  </div>
                  {selectedProject ? (
                    <div style={{ background: "#0a1a1a", borderRadius: "6px", padding: "10px", marginBottom: "14px", display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ color: "#ccc", fontWeight: "700", fontSize: "12px" }}>{selectedProject.projectId}</span>
                      <StatusBadge status={selectedProject.status} />
                    </div>
                  ) : (
                    <div style={{ color: "#1a3a3a", fontSize: "11px", marginBottom: "14px", fontStyle: "italic" }}>
                      Select a project from Projects tab
                    </div>
                  )}

                  <input style={inputStyle} placeholder="GitHub username" value={githubUsername} onChange={e => setGithubUsername(e.target.value)} />
                  <input style={inputStyle} placeholder="Repository name (e.g. my-app)" value={githubRepo} onChange={e => setGithubRepo(e.target.value)} />
                  <input
                    style={{ ...inputStyle, color: "#f0a500" }}
                    placeholder="Personal access token (ghp_...)"
                    type="password"
                    value={githubToken}
                    onChange={e => setGithubToken(e.target.value)}
                  />

                  <button
                    className="wre-action-btn primary"
                    onClick={handleGitHubPush}
                    disabled={githubPushing || !selectedProject}
                    style={{ width: "100%", padding: "10px", justifyContent: "center" }}
                  >
                    {githubPushing ? "Pushing..." : "⎈ Push to GitHub"}
                  </button>

                  {githubMsg && (
                    <div style={{
                      marginTop: "10px",
                      fontSize: "10px",
                      color: githubMsg.startsWith("✅") ? "#00f0ff88" : "#f8514988",
                      lineHeight: "1.5",
                      wordBreak: "break-all",
                    }}>
                      {githubMsg}
                    </div>
                  )}

                  <div style={{ marginTop: "20px", borderTop: "1px solid #0a1a1a", paddingTop: "14px" }}>
                    <div style={{ fontSize: "9px", color: "#1a2a2a", lineHeight: "1.7" }}>
                      <div>• Token stored only in your browser session</div>
                      <div>• Creates new repo or pushes to existing one</div>
                      <div>• Commits as: <span style={{ color: "#00f0ff33" }}>webforge@bot.ai</span></div>
                    </div>
                  </div>
                </div>
              )}

              {/* Nodes panel */}
              {nav === "nodes" && (
                <div style={{ flex: 1, overflowY: "auto", padding: "16px" }}>
                  <div style={{ fontSize: "10px", color: "#00f0ff66", textTransform: "uppercase", marginBottom: "10px" }}>
                    Generate Connection Code
                  </div>
                  <button
                    className="wre-action-btn primary"
                    onClick={handleGenerateNode}
                    disabled={generatingNode}
                    style={{ width: "100%", padding: "10px", marginBottom: "14px" }}
                  >
                    {generatingNode ? "Generating..." : "+ Generate WF Code"}
                  </button>

                  {newNodeCode && (
                    <div style={{ background: "#0a2020", border: "1px solid #00f0ff22", borderRadius: "6px", padding: "10px", marginBottom: "14px", textAlign: "center" }}>
                      <div style={{ fontSize: "9px", color: "#00f0ff44", marginBottom: "4px" }}>CONNECTION CODE</div>
                      <div style={{ fontSize: "20px", fontWeight: "900", color: "#00f0ff", letterSpacing: "0.15em", fontFamily: "monospace" }}>{newNodeCode}</div>
                    </div>
                  )}

                  <div style={{ borderTop: "1px solid #0a1a1a", paddingTop: "14px", marginBottom: "14px" }}>
                    <div style={{ fontSize: "10px", color: "#00f0ff66", textTransform: "uppercase", marginBottom: "10px" }}>Bind Telegram Bot</div>
                    <input style={inputStyle} placeholder="WF-XXXXXX" value={connectCode} onChange={e => setConnectCode(e.target.value.toUpperCase())} />
                    <input style={inputStyle} placeholder="Telegram Chat ID" value={connectChatId} onChange={e => setConnectChatId(e.target.value)} />
                    <button className="wre-action-btn primary" onClick={handleConnectNode} style={{ width: "100%", padding: "10px" }}>
                      Connect Node
                    </button>
                  </div>

                  {nodeMsg && (
                    <div style={{ fontSize: "10px", color: nodeMsg.startsWith("✅") ? "#00f0ff88" : "#f8514988", marginBottom: "10px", lineHeight: "1.5" }}>
                      {nodeMsg}
                    </div>
                  )}

                  <div style={{ borderTop: "1px solid #0a1a1a", paddingTop: "14px" }}>
                    <div style={{ fontSize: "10px", color: "#1a3a3a", textTransform: "uppercase", marginBottom: "8px" }}>Active Nodes ({nodes.length})</div>
                    {nodes.length === 0 ? (
                      <div style={{ color: "#0a2020", fontSize: "11px", textAlign: "center", padding: "16px" }}>No nodes yet</div>
                    ) : (
                      nodes.map(n => (
                        <div key={n.connection_code} style={{ background: "#070707", border: "1px solid #0a1a1a", borderRadius: "6px", padding: "10px", marginBottom: "6px" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                            <span style={{ color: "#00f0ff", fontWeight: "700", fontFamily: "monospace", fontSize: "13px" }}>{n.connection_code}</span>
                            <StatusBadge status={n.status} />
                          </div>
                          <div style={{ fontSize: "9px", color: "#1a3a3a" }}>
                            <span>:{n.allocated_port}</span>
                            {n.telegram_chat_id && <span style={{ marginLeft: "8px" }}>chat:{n.telegram_chat_id}</span>}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Mobile: Show list toggle when collapsed */}
          {isMobile && !listPanelOpen && (
            <button
              onClick={() => setListPanelOpen(true)}
              style={{ background: "#0a1a1a", border: "none", borderBottom: "1px solid #0a1a1a", color: "#00f0ff66", padding: "8px", fontSize: "11px", cursor: "pointer", fontFamily: "inherit", textAlign: "center", flexShrink: 0 }}
            >
              ▼ {nav.toUpperCase()} PANEL
            </button>
          )}

          {/* Right main panel */}
          <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column", minWidth: 0 }}>

            {/* Metrics panel */}
            {panel === "metrics" && (
              <div style={{ flex: 1, overflowY: "auto", padding: isMobile ? "14px" : "20px" }}>
                <div style={{ fontSize: "10px", color: "#00f0ff66", textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: "16px" }}>
                  Runtime Engine Metrics
                </div>
                {metrics ? (
                  <>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "8px", marginBottom: "12px" }}>
                      <MetricCard label="Total" value={metrics.total} />
                      <MetricCard label="Running" value={metrics.running} color="#00f0ff" />
                      <MetricCard label="Building" value={metrics.building} color="#f0a500" />
                      <MetricCard label="Crashed" value={metrics.crashed} color={metrics.crashed > 0 ? "#f85149" : "#333"} />
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "8px", marginBottom: "20px" }}>
                      <MetricCard label="Health" value={metrics.avgHealthScore} unit="%" color={metrics.avgHealthScore >= 80 ? "#00f0ff" : metrics.avgHealthScore >= 50 ? "#f0a500" : "#f85149"} />
                      <MetricCard label="Memory" value={metrics.memoryMB} unit="MB" />
                    </div>
                    <div style={{ fontSize: "10px", color: "#1a3a3a", textTransform: "uppercase", marginBottom: "10px" }}>Active Runtimes</div>
                    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(220px, 1fr))", gap: "8px" }}>
                      {projects.filter(p => p.status !== "stopped").map(p => (
                        <div key={p.projectId} onClick={() => handleSelectProject(p)} style={{
                          background: "#070707",
                          border: `1px solid ${p.status === "running" ? "#0a2020" : p.status === "crashed" ? "#2a0a0a" : "#0a0a1a"}`,
                          borderRadius: "8px",
                          padding: "12px 14px",
                          cursor: "pointer",
                        }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
                            <span style={{ color: "#fff", fontWeight: "700", fontSize: "12px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "120px" }}>
                              {p.projectId}
                            </span>
                            <StatusBadge status={p.status} />
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", color: "#1a3a3a" }}>
                            <span>{p.framework}</span>
                            <span style={{ color: p.healthScore >= 80 ? "#00f0ff44" : "#444" }}>♥ {p.healthScore}%</span>
                          </div>
                          {p.liveUrl && (
                            <a href={p.liveUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                              style={{ display: "block", marginTop: "6px", fontSize: "9px", color: "#00f0ff44", textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              → {p.liveUrl}
                            </a>
                          )}
                        </div>
                      ))}
                      {projects.filter(p => p.status !== "stopped").length === 0 && (
                        <div style={{ textAlign: "center", color: "#0a2020", padding: "32px" }}>No active runtimes</div>
                      )}
                    </div>
                  </>
                ) : (
                  <div style={{ color: "#0a2020", padding: "40px", textAlign: "center" }}>Loading metrics...</div>
                )}
              </div>
            )}

            {/* Terminal panel */}
            {panel === "terminal" && (
              <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                <div style={{ padding: "8px 14px", borderBottom: "1px solid #0a1a1a", fontSize: "10px", color: "#1a3a3a", display: "flex", alignItems: "center", gap: "10px", flexShrink: 0 }}>
                  <span style={{ color: "#00f0ff44" }}>▤</span>
                  {selectedProject
                    ? <><span style={{ color: "#00f0ff66" }}>{selectedProject.projectId}</span><span>logs</span></>
                    : <span>Select a project to view logs</span>
                  }
                  {selectedProject && (
                    <button className="wre-action-btn" onClick={() => fetchLogs(selectedProject.projectId)} style={{ marginLeft: "auto", fontSize: "9px", padding: "3px 8px" }}>↺</button>
                  )}
                </div>
                <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px", background: "#030303", lineHeight: "1.7", fontFamily: "monospace" }}>
                  {logsLoading ? (
                    <div style={{ color: "#0a2020" }}>Loading logs...</div>
                  ) : logs.length === 0 ? (
                    <div style={{ color: "#0a2020" }}>
                      {selectedProject ? "No logs yet..." : "Select a project from the sidebar."}
                    </div>
                  ) : (
                    logs.map((line, i) => (
                      <div key={i} style={{
                        color: line.includes("❌") || line.toLowerCase().includes("error") ? "#f85149" :
                               line.includes("✅") || line.includes("🚀") || line.includes("⚡") ? "#00f0ff" :
                               line.includes("⚠") || line.toLowerCase().includes("warn") ? "#f0a500" :
                               "#2a4a4a",
                        fontSize: "11px",
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-all",
                      }}>
                        {line}
                      </div>
                    ))
                  )}
                  <div ref={logsEndRef} />
                  {logs.length > 0 && <span className="wre-cursor" style={{ color: "#00f0ff" }}>█</span>}
                </div>
              </div>
            )}

            {/* Live Preview panel */}
            {panel === "preview" && (
              <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                <div style={{ padding: "8px 14px", borderBottom: "1px solid #0a1a1a", fontSize: "10px", color: "#1a3a3a", display: "flex", alignItems: "center", gap: "10px", flexShrink: 0 }}>
                  <span style={{ color: "#00f0ff44" }}>◈</span>
                  {selectedProject?.liveUrl
                    ? <><span style={{ color: "#00f0ff66" }}>{selectedProject.projectId}</span><span>— live</span></>
                    : <span>Select a running project to preview</span>
                  }
                  {selectedProject?.liveUrl && (
                    <a href={selectedProject.liveUrl} target="_blank" rel="noopener noreferrer" style={{ marginLeft: "auto", color: "#00f0ff44", fontSize: "10px" }}>
                      ↗ New tab
                    </a>
                  )}
                </div>
                <div style={{ flex: 1, background: "#000", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {selectedProject?.liveUrl ? (
                    <iframe
                      src={selectedProject.liveUrl}
                      style={{ width: "100%", height: "100%", border: "none" }}
                      title={`Preview: ${selectedProject.projectId}`}
                      allow="accelerometer; camera; encrypted-media; geolocation; gyroscope; microphone; payment"
                      sandbox="allow-forms allow-modals allow-popups allow-presentation allow-same-origin allow-scripts"
                    />
                  ) : (
                    <div style={{ textAlign: "center", color: "#0a2020" }}>
                      <div style={{ fontSize: "28px", marginBottom: "10px", opacity: 0.3 }}>◈</div>
                      <div>No project selected</div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Resources panel */}
            {panel === "resources" && (
              <div style={{ flex: 1, overflowY: "auto", padding: isMobile ? "14px" : "20px" }}>
                <div style={{ fontSize: "10px", color: "#00f0ff66", textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: "16px" }}>
                  Resource Monitor
                </div>
                {metrics && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "5px" }}>
                        <span style={{ fontSize: "10px", color: "#1a3a3a", textTransform: "uppercase" }}>Heap Memory</span>
                        <span style={{ fontSize: "10px", color: "#00f0ff66" }}>{metrics.memoryMB} MB</span>
                      </div>
                      <div style={{ background: "#070707", borderRadius: "4px", height: "6px", overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${Math.min((metrics.memoryMB / 512) * 100, 100)}%`, background: "linear-gradient(90deg, #003030, #00f0ff)", borderRadius: "4px", transition: "width 1s" }} />
                      </div>
                    </div>
                    <div style={{ background: "#070707", border: "1px solid #0a1a1a", borderRadius: "8px", padding: "14px" }}>
                      <div style={{ fontSize: "10px", color: "#1a3a3a", textTransform: "uppercase", marginBottom: "6px" }}>Process Uptime</div>
                      <div style={{ fontSize: "20px", fontWeight: "900", color: "#00f0ff", fontFamily: "monospace" }}>{formatUptime(metrics.uptime)}</div>
                    </div>
                    <div style={{ background: "#070707", border: "1px solid #0a1a1a", borderRadius: "8px", padding: "14px" }}>
                      <div style={{ fontSize: "10px", color: "#1a3a3a", textTransform: "uppercase", marginBottom: "10px" }}>Port Registry ({metrics.portsUsed.length})</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "5px" }}>
                        {metrics.portsUsed.length === 0 ? (
                          <span style={{ color: "#0a2020", fontSize: "11px" }}>No ports in use</span>
                        ) : (
                          metrics.portsUsed.map(p => (
                            <span key={p} style={{ padding: "2px 8px", background: "#0a2020", borderRadius: "4px", color: "#00f0ff66", fontSize: "10px", fontFamily: "monospace", border: "1px solid #0d2a2a" }}>
                              :{p}
                            </span>
                          ))
                        )}
                      </div>
                    </div>
                    <div style={{ background: "#070707", border: "1px solid #0a1a1a", borderRadius: "8px", padding: "14px" }}>
                      <div style={{ fontSize: "10px", color: "#1a3a3a", textTransform: "uppercase", marginBottom: "10px" }}>Status Breakdown</div>
                      {[
                        { label: "Running", count: metrics.running, color: "#00f0ff" },
                        { label: "Building", count: metrics.building, color: "#f0a500" },
                        { label: "Crashed", count: metrics.crashed, color: "#f85149" },
                        { label: "Stopped", count: metrics.stopped, color: "#333" },
                      ].map(item => (
                        <div key={item.label} style={{ marginBottom: "8px" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "3px" }}>
                            <span style={{ fontSize: "10px", color: item.color + "88" }}>{item.label}</span>
                            <span style={{ fontSize: "10px", color: item.color }}>{item.count}</span>
                          </div>
                          <div style={{ background: "#0a0a0a", height: "3px", borderRadius: "4px", overflow: "hidden" }}>
                            <div style={{ height: "100%", width: metrics.total > 0 ? `${(item.count / metrics.total) * 100}%` : "0%", background: item.color, borderRadius: "4px", opacity: 0.6, transition: "width 0.5s" }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
