import { useEffect, useRef, useState } from "react";
import { useParams } from "wouter";

interface ProgressState {
  percent: number;
  status: string;
  filesWritten: number;
  filesTotal: number;
  round: string | number;
  maxRounds: number;
  elapsed: number;
  logs: Array<{ text: string; cls: string; ts: string }>;
  redirectUrl: string | null;
  connected: boolean;
}

function fmt(s: number) {
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

export default function Deploying() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [state, setState] = useState<ProgressState>({
    percent: 0,
    status: "Connecting to build engine...",
    filesWritten: 0,
    filesTotal: 0,
    round: "—",
    maxRounds: 5,
    elapsed: 0,
    logs: [],
    redirectUrl: null,
    connected: false,
  });

  const startRef = useRef(Date.now());
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function addLog(text: string, cls = "") {
    const ts = new Date().toLocaleTimeString();
    setState(prev => ({
      ...prev,
      logs: [...prev.logs.slice(-60), { text, cls, ts }],
    }));
  }

  useEffect(() => {
    const iv = setInterval(() => {
      setState(prev => ({ ...prev, elapsed: Math.round((Date.now() - startRef.current) / 1000) }));
    }, 1000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    if (!id) return;
    const src = new EventSource(`/api/projects/${id}/stream`);

    src.onopen = () => {
      setState(prev => ({ ...prev, connected: true }));
      addLog("Stream connected to build engine", "ok");
    };

    src.onmessage = (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data as string) as Record<string, unknown>;
        switch (data.type) {
          case "connected":
            addLog("Ruflo orchestrator online", "ok");
            setState(prev => ({ ...prev, percent: 2, status: "Orchestrator ready" }));
            break;
          case "progress":
            setState(prev => ({
              ...prev,
              percent: Number(data.percent ?? prev.percent),
              status: String(data.status ?? prev.status),
              filesWritten: Number(data.filesWritten ?? prev.filesWritten),
              filesTotal: Number(data.filesTotal ?? prev.filesTotal) || prev.filesTotal,
            }));
            addLog(String(data.status ?? ""), "info");
            break;
          case "round":
            setState(prev => ({
              ...prev,
              round: data.round as string | number,
              maxRounds: Number(data.maxRounds ?? 5),
            }));
            addLog(`DeepBuild round ${data.round}: ${data.message ?? ""}`, "round");
            break;
          case "status":
            addLog(String(data.status ?? ""), "info");
            setState(prev => ({ ...prev, status: String(data.status ?? prev.status) }));
            break;
          case "redirect":
            src.close();
            setState(prev => ({ ...prev, percent: 100, status: "Build complete!", redirectUrl: String(data.url) }));
            addLog("Build complete — redirecting...", "ok");
            break;
        }
      } catch (_) {}
    };

    src.onerror = () => addLog("Stream interrupted — will reconnect...", "");

    return () => src.close();
  }, [id]);

  const { redirectUrl } = state;

  useEffect(() => {
    if (!redirectUrl) return;
    let count = 3;
    const el = document.getElementById("wf-countdown");
    if (el) el.textContent = String(count);
    countdownRef.current = setInterval(() => {
      count--;
      const cel = document.getElementById("wf-countdown");
      if (cel) cel.textContent = String(count);
      if (count <= 0) {
        if (countdownRef.current) clearInterval(countdownRef.current);
        window.location.href = redirectUrl;
      }
    }, 1000);
    return () => { if (countdownRef.current) clearInterval(countdownRef.current); };
  }, [redirectUrl]);

  const barW = `${Math.min(100, state.percent)}%`;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0a0e14",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        color: "#cdd9e5",
      }}
    >
      <div style={{ width: "100%", maxWidth: 620 }}>
        {/* Brand */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 36, justifyContent: "center" }}>
          <div style={{
            width: 36, height: 36, borderRadius: 8, background: "#58a6ff",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontWeight: 900, color: "#000", fontSize: 18,
          }}>W</div>
          <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-.02em" }}>WebForge</span>
          <span style={{ color: "#6e7f96" }}>/</span>
          <span style={{ color: "#6e7f96", fontFamily: "monospace", fontSize: 14 }}>Project #{id}</span>
        </div>

        {/* Main card */}
        <div style={{
          background: "#111720",
          border: "1px solid #1e2d45",
          borderRadius: 16,
          padding: "32px 28px",
          position: "relative",
          overflow: "hidden",
        }}>
          {/* Accent line tracks progress */}
          <div style={{
            position: "absolute", top: 0, left: 0, height: 2,
            width: barW,
            background: "linear-gradient(90deg, #58a6ff, #3fb950)",
            transition: "width .6s cubic-bezier(.4,0,.2,1)",
          }} />

          {/* Phase indicator */}
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 28 }}>
            <div style={{
              width: 10, height: 10, borderRadius: "50%", flexShrink: 0, marginTop: 5,
              background: redirectUrl ? "#3fb950" : "#58a6ff",
              boxShadow: redirectUrl ? "0 0 8px #3fb950" : "0 0 8px #58a6ff",
              animation: redirectUrl ? "none" : "wfPulse 1.4s ease-in-out infinite",
            }} />
            <div>
              <div style={{ fontSize: 16, fontWeight: 600 }}>{state.status}</div>
              <div style={{ fontSize: 13, color: "#6e7f96", marginTop: 3 }}>
                {state.connected ? "WebForge Ruflo engine active" : "Initialising orchestrator..."}
              </div>
            </div>
          </div>

          {/* Progress bar */}
          <div style={{
            background: "#1e2d45", borderRadius: 100, height: 6,
            marginBottom: 6, overflow: "hidden",
          }}>
            <div style={{
              height: "100%", borderRadius: 100, width: barW,
              background: "linear-gradient(90deg, #58a6ff, #3fb950)",
              transition: "width .6s cubic-bezier(.4,0,.2,1)",
            }} />
          </div>
          <div style={{ textAlign: "right", fontFamily: "monospace", fontSize: 12, color: "#6e7f96", marginBottom: 24 }}>
            {Math.round(state.percent)}%
          </div>

          {/* Stats row */}
          <div style={{
            display: "flex", background: "#161e2d", borderRadius: 10,
            border: "1px solid #1e2d45", overflow: "hidden", marginBottom: 24,
          }}>
            {[
              { label: "Files Written", value: String(state.filesWritten) },
              { label: "Total Files", value: state.filesTotal > 0 ? String(state.filesTotal) : "—" },
              { label: "Build Round", value: state.round === "—" ? "—" : `${state.round}${state.maxRounds ? ` / ${state.maxRounds}` : ""}` },
              { label: "Elapsed", value: fmt(state.elapsed) },
            ].map((s, i, arr) => (
              <div key={s.label} style={{
                flex: 1, padding: "14px 12px", textAlign: "center",
                borderRight: i < arr.length - 1 ? "1px solid #1e2d45" : "none",
              }}>
                <div style={{ fontSize: 20, fontWeight: 700, fontFamily: "monospace", color: "#58a6ff", lineHeight: 1 }}>
                  {s.value}
                </div>
                <div style={{ fontSize: 11, color: "#6e7f96", marginTop: 4, textTransform: "uppercase", letterSpacing: ".06em" }}>
                  {s.label}
                </div>
              </div>
            ))}
          </div>

          {/* Log feed */}
          <div
            id="wf-log"
            style={{
              background: "#070c12", border: "1px solid #1e2d45", borderRadius: 8,
              padding: "10px 12px", height: 130, overflowY: "auto",
              fontFamily: "monospace", fontSize: 12, lineHeight: 1.7, color: "#6e7f96",
            }}
          >
            {state.logs.map((l, i) => (
              <div key={i} style={{
                color: l.cls === "ok" ? "#3fb950" : l.cls === "round" ? "#f0883e" : l.cls === "info" ? "#cdd9e5" : "#6e7f96",
              }}>
                [{l.ts}] {l.text}
              </div>
            ))}
          </div>

          {/* Redirect card */}
          {redirectUrl && (
            <div style={{
              marginTop: 24, background: "rgba(63,185,80,.08)",
              border: "1px solid rgba(63,185,80,.3)", borderRadius: 10,
              padding: "16px 20px", textAlign: "center",
            }}>
              <div style={{ color: "#3fb950", fontWeight: 700, fontSize: 15, marginBottom: 6 }}>
                Build Complete
              </div>
              <div style={{ fontSize: 13, color: "#6e7f96" }}>
                Redirecting in <span id="wf-countdown">3</span>s...
              </div>
              <a
                href={redirectUrl}
                style={{
                  display: "inline-block", marginTop: 12, padding: "10px 24px",
                  background: "#3fb950", color: "#000", borderRadius: 8,
                  fontWeight: 700, fontSize: 14, textDecoration: "none",
                }}
              >
                Open Live App
              </a>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes wfPulse {
          0%,100%{opacity:1;transform:scale(1)}
          50%{opacity:.5;transform:scale(.8)}
        }
      `}</style>
    </div>
  );
}
