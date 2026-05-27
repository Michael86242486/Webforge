import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";

export default function Login() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login, register } = useAuth();
  const [, navigate] = useLocation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = mode === "login"
        ? await login(email, password)
        : await register(email, password, username);
      if (result.success) {
        navigate("/dashboard");
      } else {
        setError(result.error ?? "Something went wrong");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "#000",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      padding: "24px",
    }}>
      <style>{`
        @keyframes glow-pulse { 0%,100%{box-shadow:0 0 20px rgba(0,240,255,0.3)} 50%{box-shadow:0 0 40px rgba(0,240,255,0.6)} }
        @keyframes scanline { 0%{transform:translateY(-100%)} 100%{transform:translateY(100%)} }
        .wre-input {
          width: 100%;
          background: #0a0a0a;
          border: 1px solid #1a3a3a;
          color: #00f0ff;
          padding: 12px 16px;
          border-radius: 6px;
          font-family: inherit;
          font-size: 14px;
          outline: none;
          box-sizing: border-box;
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        .wre-input:focus { border-color: #00f0ff; box-shadow: 0 0 0 2px rgba(0,240,255,0.15); }
        .wre-input::placeholder { color: #1e4040; }
        .wre-btn {
          width: 100%;
          padding: 13px;
          background: transparent;
          border: 1px solid #00f0ff;
          color: #00f0ff;
          font-family: inherit;
          font-size: 14px;
          font-weight: 700;
          letter-spacing: 0.1em;
          border-radius: 6px;
          cursor: pointer;
          text-transform: uppercase;
          transition: all 0.2s;
          position: relative;
          overflow: hidden;
        }
        .wre-btn:hover:not(:disabled) {
          background: rgba(0,240,255,0.08);
          box-shadow: 0 0 20px rgba(0,240,255,0.3);
        }
        .wre-btn:disabled { opacity: 0.4; cursor: not-allowed; }
      `}</style>

      <div style={{
        width: "100%",
        maxWidth: "420px",
        background: "#060606",
        border: "1px solid #1a3a3a",
        borderRadius: "12px",
        padding: "48px 40px",
        animation: "glow-pulse 3s ease-in-out infinite",
        position: "relative",
        overflow: "hidden",
      }}>
        <div style={{
          position: "absolute",
          top: 0, left: 0, right: 0,
          height: "2px",
          background: "linear-gradient(90deg, transparent, #00f0ff, transparent)",
        }} />

        <div style={{ textAlign: "center", marginBottom: "40px" }}>
          <div style={{
            fontSize: "11px",
            letterSpacing: "0.3em",
            color: "#00f0ff",
            textTransform: "uppercase",
            marginBottom: "8px",
            opacity: 0.7,
          }}>
            WebForge Runtime Engine
          </div>
          <div style={{
            fontSize: "28px",
            fontWeight: "900",
            color: "#ffffff",
            letterSpacing: "-0.02em",
          }}>
            WRE<span style={{ color: "#00f0ff" }}>/</span>AUTH
          </div>
          <div style={{ fontSize: "12px", color: "#1e4040", marginTop: "6px" }}>
            {mode === "login" ? "Access the runtime dashboard" : "Create your WRE account"}
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {mode === "register" && (
            <div>
              <label style={{ display: "block", fontSize: "11px", color: "#00f0ff", marginBottom: "6px", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                Username
              </label>
              <input
                className="wre-input"
                type="text"
                placeholder="your_username"
                value={username}
                onChange={e => setUsername(e.target.value)}
                required
                minLength={2}
              />
            </div>
          )}

          <div>
            <label style={{ display: "block", fontSize: "11px", color: "#00f0ff", marginBottom: "6px", letterSpacing: "0.1em", textTransform: "uppercase" }}>
              Email
            </label>
            <input
              className="wre-input"
              type="email"
              placeholder="user@webforge.io"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "11px", color: "#00f0ff", marginBottom: "6px", letterSpacing: "0.1em", textTransform: "uppercase" }}>
              Password
            </label>
            <input
              className="wre-input"
              type="password"
              placeholder="••••••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={6}
            />
          </div>

          {error && (
            <div style={{
              background: "rgba(248,81,73,0.1)",
              border: "1px solid rgba(248,81,73,0.3)",
              borderRadius: "6px",
              padding: "10px 14px",
              color: "#f85149",
              fontSize: "13px",
            }}>
              {error}
            </div>
          )}

          <button className="wre-btn" type="submit" disabled={loading}>
            {loading ? "Processing..." : mode === "login" ? "[ AUTHENTICATE ]" : "[ CREATE ACCOUNT ]"}
          </button>
        </form>

        <div style={{ textAlign: "center", marginTop: "24px" }}>
          <button
            onClick={() => { setMode(m => m === "login" ? "register" : "login"); setError(""); }}
            style={{
              background: "none",
              border: "none",
              color: "#1e4040",
              fontSize: "12px",
              cursor: "pointer",
              fontFamily: "inherit",
              transition: "color 0.2s",
            }}
            onMouseEnter={e => (e.currentTarget.style.color = "#00f0ff")}
            onMouseLeave={e => (e.currentTarget.style.color = "#1e4040")}
          >
            {mode === "login" ? "New to WebForge? Create account →" : "← Already have an account? Sign in"}
          </button>
        </div>

        <div style={{ textAlign: "center", marginTop: "32px", paddingTop: "24px", borderTop: "1px solid #0a1a1a" }}>
          <a href="/dashboard" style={{ color: "#0a2a2a", fontSize: "11px", textDecoration: "none" }}
            onMouseEnter={e => (e.currentTarget.style.color = "#00f0ff")}
            onMouseLeave={e => (e.currentTarget.style.color = "#0a2a2a")}
          >
            Skip → Continue as guest
          </a>
        </div>
      </div>
    </div>
  );
}
