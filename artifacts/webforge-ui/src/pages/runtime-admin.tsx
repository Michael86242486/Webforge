import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "") + "/../api";

type NavSection = "projects" | "containers" | "logs" | "health" | "settings";
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
  };
  const color = colors[status] ?? "#888";
  return (
    <span style={{
      padding: "2px 10px",
      borderRadius: "100px",
      fontSize: "10px",
      fontWeight: "700",
      letterSpacing: "0.08em",
      textTransform: "uppercase",
      border: `1px solid ${color}33`,
      color,
      background: `${color}11`,
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
      padding: "20px",
      flex: 1,
      minWidth: "120px",
    }}>
      <div style={{ fontSize: "11px", color: "#1e4040", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "8px" }}>{label}</div>
      <div style={{ fontSize: "28px", fontWeight: "900", color, lineHeight: 1, fontFamily: "monospace" }}>
        {value}
        {unit && <span style={{ fontSize: "13px", color: "#1e4040", marginLeft: "4px" }}>{unit}</span>}
      </div>
    </div>
  );
}

export default function RuntimeAdmin() {
  const { user, logout, isAuthenticated } = useAuth();
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
  const wsRef = useRef<WebSocket | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const [wsConnected, setWsConnected] = useState(false);

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

  useEffect(() => {
    fetchProjects();
    fetchMetrics();
    const interval = setInterval(() => { fetchProjects(); fetchMetrics(); }, 5000);
    return () => clearInterval(interval);
  }, [fetchProjects, fetchMetrics]);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  useEffect(() => {
    const wsProto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsHost = window.location.host;
    const wsPath = import.meta.env.BASE_URL.replace(/\/$/, "") + "/../api".replace("/api", "");
    const wsUrl = `${wsProto}//${wsHost}${wsPath}/runtime/ws`;

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => { setWsConnected(true); };
      ws.onclose = () => { setWsConnected(false); };
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data) as { type: string; line?: string; status?: string; projectId?: string };
          if (msg.type === "log" && msg.line) {
            if (!selectedProject || msg.projectId === selectedProject.projectId) {
              setLogs(prev => [...prev.slice(-300), msg.line!]);
            }
          }
          if (msg.type === "status") {
            fetchProjects();
          }
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
    if (!confirm(`Delete project ${projectId}? This removes all files.`)) return;
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
        setCreateMsg("✅ Runtime creation started. Building...");
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

  const navItems: Array<{ id: NavSection; label: string; icon: string }> = [
    { id: "projects", label: "Projects", icon: "◈" },
    { id: "containers", label: "Containers", icon: "⬡" },
    { id: "logs", label: "Logs", icon: "▤" },
    { id: "health", label: "Health", icon: "◎" },
    { id: "settings", label: "Settings", icon: "⚙" },
  ];

  const panelItems: Array<{ id: MainPanel; label: string }> = [
    { id: "metrics", label: "Metrics" },
    { id: "preview", label: "Live Preview" },
    { id: "terminal", label: "Terminal" },
    { id: "resources", label: "Resources" },
  ];

  return (
    <div style={{
      display: "flex",
      height: "100vh",
      width: "100vw",
      background: "#000",
      color: "#ccc",
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      overflow: "hidden",
      fontSize: "13px",
    }}>
      <style>{`
        ::-webkit-scrollbar { width: 4px; background: #070707; }
        ::-webkit-scrollbar-thumb { background: #0a2020; border-radius: 4px; }
        ::-webkit-scrollbar-thumb:hover { background: #00f0ff33; }
        .wre-nav-item { display: flex; align-items: center; gap: 10px; padding: 10px 16px; border-radius: 6px; cursor: pointer; color: #2a4a4a; transition: all 0.15s; border: 1px solid transparent; margin-bottom: 2px; }
        .wre-nav-item:hover { color: #00f0ff; background: #00f0ff08; border-color: #00f0ff15; }
        .wre-nav-item.active { color: #00f0ff; background: #00f0ff0d; border-color: #00f0ff22; }
        .wre-panel-tab { padding: 6px 16px; border: none; background: none; color: #2a4a4a; cursor: pointer; font-family: inherit; font-size: 12px; border-bottom: 2px solid transparent; transition: all 0.15s; letter-spacing: 0.05em; }
        .wre-panel-tab:hover { color: #00f0ff; }
        .wre-panel-tab.active { color: #00f0ff; border-bottom-color: #00f0ff; }
        .wre-project-row { padding: 12px 16px; border-bottom: 1px solid #0a1a1a; cursor: pointer; transition: background 0.15s; display: flex; align-items: center; gap: 12px; }
        .wre-project-row:hover { background: #00f0ff06; }
        .wre-project-row.selected { background: #00f0ff0a; border-left: 2px solid #00f0ff; }
        .wre-action-btn { padding: 5px 12px; background: transparent; border: 1px solid #1a3a3a; color: #2a5a5a; border-radius: 4px; cursor: pointer; font-family: inherit; font-size: 11px; transition: all 0.15s; }
        .wre-action-btn:hover { border-color: #00f0ff44; color: #00f0ff; background: #00f0ff08; }
        .wre-action-btn.danger:hover { border-color: #f8514944; color: #f85149; background: #f8514908; }
        @keyframes wre-blink { 0%,100%{opacity:1} 50%{opacity:0} }
        .wre-cursor { animation: wre-blink 1s step-end infinite; }
        @keyframes scan { 0%{transform:translateY(0)} 100%{transform:translateY(100%)} }
      `}</style>

      {/* ── Left Sidebar ── */}
      <div style={{
        width: "220px",
        flexShrink: 0,
        background: "#040404",
        borderRight: "1px solid #0a1a1a",
        display: "flex",
        flexDirection: "column",
        padding: "0",
      }}>
        {/* Brand */}
        <div style={{ padding: "20px 16px 16px", borderBottom: "1px solid #0a1a1a" }}>
          <div style={{ fontSize: "10px", color: "#1a3a3a", letterSpacing: "0.25em", textTransform: "uppercase", marginBottom: "4px" }}>
            WebForge
          </div>
          <div style={{ fontSize: "18px", fontWeight: "900", color: "#fff" }}>
            WRE<span style={{ color: "#00f0ff" }}>.</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "6px" }}>
            <div style={{
              width: "6px", height: "6px", borderRadius: "50%",
              background: wsConnected ? "#00f0ff" : "#333",
              boxShadow: wsConnected ? "0 0 6px #00f0ff" : "none",
            }} />
            <span style={{ fontSize: "10px", color: wsConnected ? "#1a4a4a" : "#2a2a2a" }}>
              {wsConnected ? "LIVE" : "OFFLINE"}
            </span>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: "12px 8px", overflowY: "auto" }}>
          {navItems.map(item => (
            <div
              key={item.id}
              className={`wre-nav-item${nav === item.id ? " active" : ""}`}
              onClick={() => setNav(item.id)}
            >
              <span style={{ fontSize: "14px" }}>{item.icon}</span>
              <span style={{ fontSize: "12px", letterSpacing: "0.05em" }}>{item.label}</span>
              {item.id === "projects" && metrics && (
                <span style={{
                  marginLeft: "auto",
                  fontSize: "10px",
                  background: "#0a2020",
                  color: "#00f0ff66",
                  padding: "1px 6px",
                  borderRadius: "100px",
                }}>
                  {metrics.total}
                </span>
              )}
            </div>
          ))}
        </nav>

        {/* User */}
        <div style={{ padding: "12px 16px", borderTop: "1px solid #0a1a1a" }}>
          {isAuthenticated && user ? (
            <div>
              <div style={{ fontSize: "11px", color: "#1a3a3a", marginBottom: "4px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {user.email}
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: "10px", color: "#00f0ff55", textTransform: "uppercase" }}>{user.role}</span>
                <button onClick={logout} className="wre-action-btn" style={{ fontSize: "10px" }}>logout</button>
              </div>
            </div>
          ) : (
            <a href="/login" style={{ color: "#00f0ff66", fontSize: "11px", textDecoration: "none" }}>
              → Sign in
            </a>
          )}
        </div>
      </div>

      {/* ── Main Content ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Top bar */}
        <div style={{
          height: "44px",
          borderBottom: "1px solid #0a1a1a",
          display: "flex",
          alignItems: "center",
          padding: "0 20px",
          gap: "4px",
          flexShrink: 0,
          background: "#030303",
        }}>
          {panelItems.map(item => (
            <button
              key={item.id}
              className={`wre-panel-tab${panel === item.id ? " active" : ""}`}
              onClick={() => setPanel(item.id)}
            >
              {item.label}
            </button>
          ))}
          <div style={{ marginLeft: "auto", fontSize: "11px", color: "#0a2020", display: "flex", alignItems: "center", gap: "12px" }}>
            {metrics && (
              <>
                <span style={{ color: "#00f0ff33" }}>{metrics.running} running</span>
                <span>·</span>
                <span style={{ color: metrics.crashed > 0 ? "#f8514944" : "#0a2020" }}>{metrics.crashed} crashed</span>
              </>
            )}
          </div>
        </div>

        {/* Content split: left list + right panel */}
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
          {/* Left list panel */}
          <div style={{
            width: "340px",
            flexShrink: 0,
            borderRight: "1px solid #0a1a1a",
            display: "flex",
            flexDirection: "column",
            background: "#020202",
            overflow: "hidden",
          }}>
            {/* Section header */}
            <div style={{ padding: "14px 16px 10px", borderBottom: "1px solid #0a1a1a", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: "11px", color: "#00f0ff66", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                {nav === "projects" && "Active Projects"}
                {nav === "containers" && "Container Registry"}
                {nav === "logs" && "Log Streams"}
                {nav === "health" && "Health Monitor"}
                {nav === "settings" && "Configuration"}
              </span>
              {nav === "projects" && (
                <button className="wre-action-btn" onClick={fetchProjects} style={{ fontSize: "10px" }}>↺ refresh</button>
              )}
            </div>

            {/* Project list */}
            {(nav === "projects" || nav === "containers" || nav === "logs" || nav === "health") && (
              <div style={{ flex: 1, overflowY: "auto" }}>
                {projects.length === 0 ? (
                  <div style={{ padding: "40px 20px", textAlign: "center", color: "#0a2020" }}>
                    <div style={{ fontSize: "24px", marginBottom: "10px" }}>◈</div>
                    <div style={{ fontSize: "12px" }}>No active projects</div>
                    <div style={{ fontSize: "11px", marginTop: "6px", color: "#071414" }}>Send a project to WRE to get started</div>
                  </div>
                ) : (
                  projects.map(p => (
                    <div
                      key={p.projectId}
                      className={`wre-project-row${selectedProject?.projectId === p.projectId ? " selected" : ""}`}
                      onClick={() => handleSelectProject(p)}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                          <span style={{ color: "#ccc", fontWeight: "700", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "140px" }}>
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
                      <div style={{ display: "flex", gap: "6px" }}>
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

            {/* Settings */}
            {nav === "settings" && (
              <div style={{ flex: 1, overflowY: "auto", padding: "20px" }}>
                <div style={{ marginBottom: "24px" }}>
                  <div style={{ fontSize: "11px", color: "#00f0ff66", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "12px" }}>
                    Create Runtime
                  </div>
                  <input
                    style={{
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
                    }}
                    placeholder="project-id (e.g. WF123)"
                    value={createId}
                    onChange={e => setCreateId(e.target.value)}
                  />
                  <button
                    className="wre-action-btn"
                    onClick={handleCreate}
                    disabled={creating}
                    style={{ width: "100%", justifyContent: "center", padding: "10px" }}
                  >
                    {creating ? "Creating..." : "+ Spawn Runtime"}
                  </button>
                  {createMsg && (
                    <div style={{ fontSize: "11px", color: "#00f0ff66", marginTop: "8px" }}>{createMsg}</div>
                  )}
                </div>

                <div style={{ borderTop: "1px solid #0a1a1a", paddingTop: "20px" }}>
                  <div style={{ fontSize: "11px", color: "#1a3a3a", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "12px" }}>
                    WRE Configuration
                  </div>
                  {[
                    ["Engine", "WebForge Runtime Engine v1.0"],
                    ["Architecture", "User → AI Core → Ruflo → WRE"],
                    ["Isolation", "Child Process + Chokidar"],
                    ["Port Range", "5100 – 5999"],
                    ["Auth", "JWT + bcrypt"],
                    ["WebSocket", "/runtime/ws"],
                    ["Proxy", "/api/preview-proxy/:id"],
                  ].map(([k, v]) => (
                    <div key={k} style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                      <span style={{ color: "#1a3a3a", fontSize: "11px" }}>{k}</span>
                      <span style={{ color: "#2a5a5a", fontSize: "11px", maxWidth: "160px", textAlign: "right" }}>{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right main panel */}
          <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
            {/* Metrics panel */}
            {panel === "metrics" && (
              <div style={{ flex: 1, overflowY: "auto", padding: "24px" }}>
                <div style={{ fontSize: "11px", color: "#00f0ff66", textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: "20px" }}>
                  Runtime Engine Metrics
                </div>

                {metrics ? (
                  <>
                    <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginBottom: "20px" }}>
                      <MetricCard label="Total Projects" value={metrics.total} />
                      <MetricCard label="Running" value={metrics.running} color="#00f0ff" />
                      <MetricCard label="Building" value={metrics.building} color="#f0a500" />
                      <MetricCard label="Crashed" value={metrics.crashed} color={metrics.crashed > 0 ? "#f85149" : "#333"} />
                    </div>
                    <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginBottom: "24px" }}>
                      <MetricCard label="Avg Health" value={metrics.avgHealthScore} unit="%" color={metrics.avgHealthScore >= 80 ? "#00f0ff" : metrics.avgHealthScore >= 50 ? "#f0a500" : "#f85149"} />
                      <MetricCard label="Uptime" value={formatUptime(metrics.uptime)} />
                      <MetricCard label="Memory" value={metrics.memoryMB} unit="MB" />
                      <MetricCard label="Ports Used" value={metrics.portsUsed.length} />
                    </div>

                    {/* Live project grid */}
                    <div style={{ fontSize: "11px", color: "#1a3a3a", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "14px" }}>
                      Active Runtimes
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "10px" }}>
                      {projects.filter(p => p.status !== "stopped").map(p => (
                        <div
                          key={p.projectId}
                          onClick={() => handleSelectProject(p)}
                          style={{
                            background: "#070707",
                            border: `1px solid ${p.status === "running" ? "#0a2020" : p.status === "crashed" ? "#2a0a0a" : "#0a0a1a"}`,
                            borderRadius: "8px",
                            padding: "14px 16px",
                            cursor: "pointer",
                            transition: "border-color 0.2s",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                            <span style={{ color: "#fff", fontWeight: "700", fontSize: "13px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "140px" }}>
                              {p.projectId}
                            </span>
                            <StatusBadge status={p.status} />
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "#1a3a3a" }}>
                            <span>{p.framework}</span>
                            <span style={{ color: p.healthScore >= 80 ? "#00f0ff44" : "#444" }}>
                              ♥ {p.healthScore}%
                            </span>
                          </div>
                          {p.liveUrl && (
                            <a
                              href={p.liveUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={e => e.stopPropagation()}
                              style={{ display: "block", marginTop: "8px", fontSize: "10px", color: "#00f0ff44", textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                            >
                              → {p.liveUrl}
                            </a>
                          )}
                        </div>
                      ))}
                      {projects.filter(p => p.status !== "stopped").length === 0 && (
                        <div style={{ gridColumn: "1/-1", textAlign: "center", color: "#0a2020", padding: "40px" }}>
                          No active runtimes
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div style={{ color: "#0a2020", padding: "40px", textAlign: "center" }}>
                    Loading metrics...
                  </div>
                )}
              </div>
            )}

            {/* Terminal / Logs panel */}
            {panel === "terminal" && (
              <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                <div style={{
                  padding: "10px 20px",
                  borderBottom: "1px solid #0a1a1a",
                  fontSize: "11px",
                  color: "#1a3a3a",
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  flexShrink: 0,
                }}>
                  <span style={{ color: "#00f0ff44" }}>▤</span>
                  {selectedProject
                    ? <><span style={{ color: "#00f0ff66" }}>{selectedProject.projectId}</span><span>logs</span></>
                    : <span>Select a project to view logs</span>
                  }
                  {selectedProject && (
                    <button
                      className="wre-action-btn"
                      onClick={() => fetchLogs(selectedProject.projectId)}
                      style={{ marginLeft: "auto" }}
                    >
                      ↺ refresh
                    </button>
                  )}
                </div>
                <div style={{
                  flex: 1,
                  overflowY: "auto",
                  padding: "16px 20px",
                  background: "#030303",
                  lineHeight: "1.7",
                }}>
                  {logsLoading ? (
                    <div style={{ color: "#0a2020" }}>Loading logs...</div>
                  ) : logs.length === 0 ? (
                    <div style={{ color: "#0a2020" }}>
                      {selectedProject ? "No logs yet — project may be starting..." : "Select a project from the sidebar to view its logs."}
                    </div>
                  ) : (
                    logs.map((line, i) => (
                      <div key={i} style={{
                        color: line.includes("❌") || line.includes("error") || line.includes("Error") ? "#f85149" :
                               line.includes("✅") || line.includes("🚀") || line.includes("⚡") ? "#00f0ff" :
                               line.includes("⚠") || line.includes("warn") ? "#f0a500" :
                               "#2a4a4a",
                        fontSize: "12px",
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
                <div style={{ padding: "10px 20px", borderBottom: "1px solid #0a1a1a", fontSize: "11px", color: "#1a3a3a", display: "flex", alignItems: "center", gap: "10px", flexShrink: 0 }}>
                  <span style={{ color: "#00f0ff44" }}>◈</span>
                  {selectedProject?.liveUrl ? (
                    <><span style={{ color: "#00f0ff66" }}>{selectedProject.projectId}</span><span>— live preview</span></>
                  ) : (
                    <span>Select a running project to preview</span>
                  )}
                  {selectedProject?.liveUrl && (
                    <a href={selectedProject.liveUrl} target="_blank" rel="noopener noreferrer" style={{ marginLeft: "auto", color: "#00f0ff44", fontSize: "11px" }}>
                      ↗ Open in new tab
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
                      <div style={{ fontSize: "32px", marginBottom: "12px", opacity: 0.3 }}>◈</div>
                      <div>No project selected or project not running</div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Resources panel */}
            {panel === "resources" && (
              <div style={{ flex: 1, overflowY: "auto", padding: "24px" }}>
                <div style={{ fontSize: "11px", color: "#00f0ff66", textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: "20px" }}>
                  Resource Monitor
                </div>
                {metrics && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                    {/* Memory bar */}
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                        <span style={{ fontSize: "11px", color: "#1a3a3a", textTransform: "uppercase", letterSpacing: "0.1em" }}>Heap Memory</span>
                        <span style={{ fontSize: "11px", color: "#00f0ff66" }}>{metrics.memoryMB} MB</span>
                      </div>
                      <div style={{ background: "#070707", borderRadius: "4px", height: "8px", overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${Math.min((metrics.memoryMB / 512) * 100, 100)}%`, background: "linear-gradient(90deg, #003030, #00f0ff)", borderRadius: "4px", transition: "width 1s" }} />
                      </div>
                    </div>

                    {/* Uptime */}
                    <div style={{ background: "#070707", border: "1px solid #0a1a1a", borderRadius: "8px", padding: "16px" }}>
                      <div style={{ fontSize: "11px", color: "#1a3a3a", textTransform: "uppercase", marginBottom: "8px" }}>Process Uptime</div>
                      <div style={{ fontSize: "24px", fontWeight: "900", color: "#00f0ff", fontFamily: "monospace" }}>{formatUptime(metrics.uptime)}</div>
                    </div>

                    {/* Port registry */}
                    <div style={{ background: "#070707", border: "1px solid #0a1a1a", borderRadius: "8px", padding: "16px" }}>
                      <div style={{ fontSize: "11px", color: "#1a3a3a", textTransform: "uppercase", marginBottom: "12px" }}>Port Registry ({metrics.portsUsed.length} active)</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                        {metrics.portsUsed.length === 0 ? (
                          <span style={{ color: "#0a2020", fontSize: "12px" }}>No ports in use</span>
                        ) : (
                          metrics.portsUsed.map(p => (
                            <span key={p} style={{
                              padding: "3px 10px",
                              background: "#0a2020",
                              borderRadius: "4px",
                              color: "#00f0ff66",
                              fontSize: "11px",
                              fontFamily: "monospace",
                              border: "1px solid #0d2a2a",
                            }}>
                              :{p}
                            </span>
                          ))
                        )}
                      </div>
                    </div>

                    {/* Project status breakdown */}
                    <div style={{ background: "#070707", border: "1px solid #0a1a1a", borderRadius: "8px", padding: "16px" }}>
                      <div style={{ fontSize: "11px", color: "#1a3a3a", textTransform: "uppercase", marginBottom: "12px" }}>Project Status Breakdown</div>
                      {[
                        { label: "Running", count: metrics.running, color: "#00f0ff" },
                        { label: "Building", count: metrics.building, color: "#f0a500" },
                        { label: "Crashed", count: metrics.crashed, color: "#f85149" },
                        { label: "Stopped", count: metrics.stopped, color: "#333" },
                      ].map(item => (
                        <div key={item.label} style={{ marginBottom: "8px" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "3px" }}>
                            <span style={{ fontSize: "11px", color: item.color + "88" }}>{item.label}</span>
                            <span style={{ fontSize: "11px", color: item.color }}>{item.count}</span>
                          </div>
                          <div style={{ background: "#0a0a0a", height: "4px", borderRadius: "4px", overflow: "hidden" }}>
                            <div style={{
                              height: "100%",
                              width: metrics.total > 0 ? `${(item.count / metrics.total) * 100}%` : "0%",
                              background: item.color,
                              borderRadius: "4px",
                              opacity: 0.6,
                              transition: "width 0.5s",
                            }} />
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
