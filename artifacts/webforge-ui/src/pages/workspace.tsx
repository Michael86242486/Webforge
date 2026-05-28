import { useParams, useLocation } from "wouter";
import { useEffect, useRef, useState, useCallback } from "react";
import Editor, { type Monaco } from "@monaco-editor/react";
import {
  ChevronRight, ChevronDown, File, Folder, FolderOpen,
  Play, RefreshCw, ExternalLink, Save, Plus, Trash2,
  Terminal, Bot, Eye, Code2, X, MoreVertical, Loader2,
  TerminalSquare, ArrowLeft, Send, Zap, FilePlus, FolderPlus,
  CheckCircle2, AlertCircle, Cpu,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface FileEntry {
  name: string;
  path: string;
  type: "file" | "directory";
  size?: number;
  children?: FileEntry[];
}

interface OpenTab {
  path: string;
  name: string;
  content: string;
  dirty: boolean;
  language: string;
}

interface TerminalLine {
  text: string;
  type: "output" | "error" | "info" | "input";
}

interface AgentMessage {
  role: "user" | "agent";
  text: string;
  files?: string[];
  thinking?: boolean;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function apiUrl(path: string) {
  return `${BASE}/api${path}`;
}

function langFromPath(p: string): string {
  const ext = p.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript",
    json: "json", css: "css", scss: "scss", html: "html", md: "markdown",
    py: "python", sh: "shell", bash: "shell", yml: "yaml", yaml: "yaml",
    toml: "ini", env: "ini", sql: "sql", rs: "rust", go: "go",
    java: "java", cpp: "cpp", c: "c", rb: "ruby", php: "php",
    swift: "swift", kt: "kotlin", vue: "html", svelte: "html",
  };
  return map[ext] ?? "plaintext";
}

function fileIcon(name: string, open = false) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const colorMap: Record<string, string> = {
    ts: "text-blue-400", tsx: "text-blue-400", js: "text-yellow-400",
    jsx: "text-yellow-400", json: "text-yellow-300", css: "text-cyan-400",
    html: "text-orange-400", md: "text-gray-400", py: "text-green-400",
    sh: "text-gray-300", yml: "text-red-400", yaml: "text-red-400",
  };
  const color = colorMap[ext] ?? "text-gray-400";
  return <File className={cn("w-3.5 h-3.5 shrink-0", color)} />;
}

// ─── File Tree Node ─────────────────────────────────────────────────────────────

function TreeNode({
  entry, depth, onOpen, activeFile,
}: {
  entry: FileEntry;
  depth: number;
  onOpen: (e: FileEntry) => void;
  activeFile: string | null;
}) {
  const [open, setOpen] = useState(depth === 0);

  if (entry.type === "directory") {
    return (
      <div>
        <button
          onClick={() => setOpen(v => !v)}
          className="flex items-center gap-1 w-full text-left px-2 py-0.5 rounded hover:bg-white/5 text-xs text-gray-300 group"
          style={{ paddingLeft: `${8 + depth * 12}px` }}
        >
          {open
            ? <ChevronDown className="w-3 h-3 text-gray-500 shrink-0" />
            : <ChevronRight className="w-3 h-3 text-gray-500 shrink-0" />}
          {open
            ? <FolderOpen className="w-3.5 h-3.5 text-yellow-400/80 shrink-0" />
            : <Folder className="w-3.5 h-3.5 text-yellow-400/60 shrink-0" />}
          <span className="truncate">{entry.name}</span>
        </button>
        {open && entry.children?.map(child => (
          <TreeNode key={child.path} entry={child} depth={depth + 1} onOpen={onOpen} activeFile={activeFile} />
        ))}
      </div>
    );
  }

  return (
    <button
      onClick={() => onOpen(entry)}
      className={cn(
        "flex items-center gap-1.5 w-full text-left px-2 py-0.5 rounded text-xs group",
        activeFile === entry.path
          ? "bg-blue-500/20 text-blue-300"
          : "text-gray-400 hover:bg-white/5 hover:text-gray-200"
      )}
      style={{ paddingLeft: `${20 + depth * 12}px` }}
    >
      {fileIcon(entry.name)}
      <span className="truncate">{entry.name}</span>
    </button>
  );
}

// ─── Terminal Panel ─────────────────────────────────────────────────────────────

function TerminalPanel({ projectId }: { projectId: string }) {
  const [lines, setLines] = useState<TerminalLine[]>([
    { text: "WebForge Terminal — type a command and press Enter", type: "info" },
    { text: "", type: "output" },
  ]);
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [histIdx, setHistIdx] = useState(-1);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines]);

  const run = useCallback(async (cmd: string) => {
    if (!cmd.trim()) return;
    setLines(l => [...l, { text: `$ ${cmd}`, type: "input" }]);
    setHistory(h => [cmd, ...h.slice(0, 49)]);
    setHistIdx(-1);
    setInput("");
    setRunning(true);
    try {
      const r = await fetch(apiUrl(`/ide/${projectId}/run`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: cmd }),
      });
      const data = await r.json();
      if (data.stdout) {
        data.stdout.split("\n").forEach((line: string) => {
          setLines(l => [...l, { text: line, type: "output" }]);
        });
      }
      if (data.stderr) {
        data.stderr.split("\n").forEach((line: string) => {
          setLines(l => [...l, { text: line, type: "error" }]);
        });
      }
    } catch (err: any) {
      setLines(l => [...l, { text: `Error: ${err.message}`, type: "error" }]);
    } finally {
      setRunning(false);
    }
  }, [projectId]);

  return (
    <div className="flex flex-col h-full font-mono text-xs bg-[#0d1117]">
      <div className="flex-1 overflow-y-auto p-3 space-y-0.5">
        {lines.map((line, i) => (
          <div key={i} className={cn(
            "whitespace-pre-wrap break-all leading-5",
            line.type === "error" ? "text-red-400" :
            line.type === "input" ? "text-green-400" :
            line.type === "info" ? "text-blue-400" :
            "text-gray-300"
          )}>
            {line.text}
          </div>
        ))}
        {running && (
          <div className="flex items-center gap-2 text-yellow-400">
            <Loader2 className="w-3 h-3 animate-spin" />
            <span>Running...</span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      <div className="border-t border-white/10 flex items-center gap-2 px-3 py-2">
        <span className="text-green-400 shrink-0">$</span>
        <input
          className="flex-1 bg-transparent outline-none text-gray-200 placeholder-gray-600"
          placeholder="Enter command..."
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter") run(input);
            if (e.key === "ArrowUp") {
              const idx = Math.min(histIdx + 1, history.length - 1);
              setHistIdx(idx);
              setInput(history[idx] ?? "");
            }
            if (e.key === "ArrowDown") {
              const idx = Math.max(histIdx - 1, -1);
              setHistIdx(idx);
              setInput(idx === -1 ? "" : history[idx]);
            }
          }}
          disabled={running}
          autoFocus
        />
        {running && <Loader2 className="w-3.5 h-3.5 text-yellow-400 animate-spin shrink-0" />}
      </div>
    </div>
  );
}

// ─── AI Agent Panel ─────────────────────────────────────────────────────────────

function AgentPanel({ projectId, onFilesChanged }: { projectId: string; onFilesChanged: () => void }) {
  const [messages, setMessages] = useState<AgentMessage[]>([
    {
      role: "agent",
      text: "Hi! I'm your WebForge AI agent. I can help you write code, fix bugs, add features, and modify files in your project. What would you like to build?",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = useCallback(async () => {
    const msg = input.trim();
    if (!msg || loading) return;
    setInput("");
    setMessages(m => [...m, { role: "user", text: msg }]);
    setMessages(m => [...m, { role: "agent", text: "", thinking: true }]);
    setLoading(true);

    try {
      const r = await fetch(apiUrl(`/ide/${projectId}/agent`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg }),
      });

      if (!r.body) throw new Error("No stream");
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let agentText = "";
      const writtenFiles: string[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = dec.decode(value);
        const lines = chunk.split("\n");
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === "thinking") {
              setMessages(m => {
                const copy = [...m];
                const last = copy[copy.length - 1];
                if (last.role === "agent") copy[copy.length - 1] = { ...last, text: data.text, thinking: true };
                return copy;
              });
            } else if (data.type === "response") {
              agentText = data.text;
              setMessages(m => {
                const copy = [...m];
                const last = copy[copy.length - 1];
                if (last.role === "agent") copy[copy.length - 1] = { ...last, text: data.text, thinking: false };
                return copy;
              });
            } else if (data.type === "file_written") {
              writtenFiles.push(data.path);
            } else if (data.type === "done") {
              if (data.filesWritten > 0) {
                setMessages(m => {
                  const copy = [...m];
                  const last = copy[copy.length - 1];
                  if (last.role === "agent") {
                    copy[copy.length - 1] = { ...last, files: writtenFiles, thinking: false };
                  }
                  return copy;
                });
                onFilesChanged();
              }
            } else if (data.type === "error") {
              setMessages(m => {
                const copy = [...m];
                const last = copy[copy.length - 1];
                if (last.role === "agent") copy[copy.length - 1] = { ...last, text: `Error: ${data.text}`, thinking: false };
                return copy;
              });
            }
          } catch {}
        }
      }
    } catch (err: any) {
      setMessages(m => {
        const copy = [...m];
        const last = copy[copy.length - 1];
        if (last.role === "agent") copy[copy.length - 1] = { ...last, text: `Error: ${err.message}`, thinking: false };
        return copy;
      });
    } finally {
      setLoading(false);
    }
  }, [input, loading, projectId, onFilesChanged]);

  return (
    <div className="flex flex-col h-full bg-[#0d1117]">
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {messages.map((msg, i) => (
          <div key={i} className={cn("flex gap-2", msg.role === "user" ? "flex-row-reverse" : "flex-row")}>
            <div className={cn(
              "w-6 h-6 rounded-full flex items-center justify-center text-xs shrink-0 mt-0.5",
              msg.role === "user" ? "bg-blue-600 text-white" : "bg-purple-700 text-white"
            )}>
              {msg.role === "user" ? "U" : <Zap className="w-3 h-3" />}
            </div>
            <div className={cn(
              "max-w-[85%] rounded-lg px-3 py-2 text-xs leading-5",
              msg.role === "user" ? "bg-blue-600/20 text-blue-100" : "bg-white/5 text-gray-200"
            )}>
              {msg.thinking ? (
                <div className="flex items-center gap-1.5 text-gray-400">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>{msg.text || "Thinking..."}</span>
                </div>
              ) : (
                <>
                  <p className="whitespace-pre-wrap">{msg.text}</p>
                  {msg.files && msg.files.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {msg.files.map(f => (
                        <div key={f} className="flex items-center gap-1.5 text-green-400 text-[10px]">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>{f}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <div className="border-t border-white/10 p-2">
        <div className="flex items-end gap-2 bg-white/5 rounded-lg p-2">
          <textarea
            ref={textareaRef}
            className="flex-1 bg-transparent outline-none text-xs text-gray-200 placeholder-gray-600 resize-none min-h-[40px] max-h-[120px]"
            placeholder="Ask AI to help with your code..."
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
            }}
            rows={2}
          />
          <button
            onClick={send}
            disabled={loading || !input.trim()}
            className="shrink-0 p-1.5 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin text-white" /> : <Send className="w-3.5 h-3.5 text-white" />}
          </button>
        </div>
        <p className="text-[10px] text-gray-600 mt-1.5 px-1">Shift+Enter for newline · Enter to send</p>
      </div>
    </div>
  );
}

// ─── Main Workspace ─────────────────────────────────────────────────────────────

type BottomPanel = "terminal" | "agent" | null;
type RightPanel = "preview" | null;

export default function Workspace() {
  const params = useParams();
  const [, navigate] = useLocation();
  const projectId = params.id ?? "";

  // File tree
  const [tree, setTree] = useState<FileEntry[]>([]);
  const [treeLoading, setTreeLoading] = useState(true);

  // Tabs
  const [tabs, setTabs] = useState<OpenTab[]>([]);
  const [activeTab, setActiveTab] = useState<string | null>(null);

  // Panels
  const [bottomPanel, setBottomPanel] = useState<BottomPanel>("terminal");
  const [rightPanel, setRightPanel] = useState<RightPanel>("preview");
  const [bottomHeight, setBottomHeight] = useState(220);

  // Project info
  const [projectName, setProjectName] = useState(`Project ${projectId}`);
  const [previewKey, setPreviewKey] = useState(0);

  // New file/folder modal
  const [newItemType, setNewItemType] = useState<"file" | "directory" | null>(null);
  const [newItemName, setNewItemName] = useState("");
  const [newItemParent, setNewItemParent] = useState("");

  // Saving
  const [saving, setSaving] = useState(false);

  const editorRef = useRef<any>(null);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = "auto"; };
  }, []);

  const loadTree = useCallback(async () => {
    setTreeLoading(true);
    try {
      const r = await fetch(apiUrl(`/ide/${projectId}/tree`));
      if (r.ok) {
        const data = await r.json();
        setTree(data.tree ?? []);
      }
    } catch {}
    setTreeLoading(false);
  }, [projectId]);

  useEffect(() => {
    loadTree();
    // Load project name
    fetch(apiUrl(`/projects?userId=1`)).then(r => r.json()).then(data => {
      const proj = (data.projects ?? data ?? []).find((p: any) =>
        String(p.id) === projectId || p.slug === projectId
      );
      if (proj?.name) setProjectName(proj.name);
    }).catch(() => {});
  }, [projectId, loadTree]);

  const openFile = useCallback(async (entry: FileEntry) => {
    if (entry.type === "directory") return;
    // Already open?
    if (tabs.find(t => t.path === entry.path)) {
      setActiveTab(entry.path);
      return;
    }
    try {
      const r = await fetch(apiUrl(`/ide/${projectId}/file?path=${encodeURIComponent(entry.path)}`));
      if (!r.ok) return;
      const data = await r.json();
      const tab: OpenTab = {
        path: entry.path,
        name: entry.name,
        content: data.content ?? "",
        dirty: false,
        language: langFromPath(entry.path),
      };
      setTabs(t => [...t, tab]);
      setActiveTab(entry.path);
    } catch {}
  }, [tabs, projectId]);

  const closeTab = useCallback((tabPath: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setTabs(t => {
      const idx = t.findIndex(x => x.path === tabPath);
      const next = t.filter(x => x.path !== tabPath);
      if (activeTab === tabPath) {
        setActiveTab(next[Math.max(0, idx - 1)]?.path ?? null);
      }
      return next;
    });
  }, [activeTab]);

  const saveCurrentFile = useCallback(async () => {
    const tab = tabs.find(t => t.path === activeTab);
    if (!tab) return;
    setSaving(true);
    try {
      await fetch(apiUrl(`/ide/${projectId}/file`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: tab.path, content: tab.content }),
      });
      setTabs(ts => ts.map(t => t.path === tab.path ? { ...t, dirty: false } : t));
      setPreviewKey(k => k + 1);
    } catch {}
    setSaving(false);
  }, [tabs, activeTab, projectId]);

  const handleEditorChange = useCallback((value: string | undefined) => {
    if (!activeTab) return;
    setTabs(ts => ts.map(t =>
      t.path === activeTab ? { ...t, content: value ?? "", dirty: true } : t
    ));
  }, [activeTab]);

  const createNewItem = useCallback(async () => {
    if (!newItemName.trim()) return;
    const fullPath = newItemParent ? `${newItemParent}/${newItemName.trim()}` : newItemName.trim();
    try {
      await fetch(apiUrl(`/ide/${projectId}/file`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: fullPath, type: newItemType }),
      });
      setNewItemType(null);
      setNewItemName("");
      setNewItemParent("");
      loadTree();
    } catch {}
  }, [newItemName, newItemParent, newItemType, projectId, loadTree]);

  const deleteFile = useCallback(async (filePath: string) => {
    if (!confirm(`Delete ${filePath}?`)) return;
    await fetch(apiUrl(`/ide/${projectId}/file?path=${encodeURIComponent(filePath)}`), { method: "DELETE" });
    setTabs(ts => ts.filter(t => t.path !== filePath));
    if (activeTab === filePath) setActiveTab(null);
    loadTree();
  }, [projectId, activeTab, loadTree]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        saveCurrentFile();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [saveCurrentFile]);

  const activeTabData = tabs.find(t => t.path === activeTab);
  const previewSlug = projectId;

  return (
    <div className="flex flex-col h-screen w-screen bg-[#0d1117] text-gray-200 overflow-hidden font-sans">

      {/* ── Top Bar ── */}
      <div className="h-10 bg-[#161b22] border-b border-white/10 flex items-center gap-2 px-3 shrink-0 z-10">
        <button
          onClick={() => navigate("/projects")}
          className="flex items-center gap-1 text-gray-400 hover:text-gray-200 transition-colors mr-1"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
        </button>
        <TerminalSquare className="w-4 h-4 text-blue-400 shrink-0" />
        <span className="text-sm font-semibold text-gray-200 truncate max-w-[180px]">{projectName}</span>

        <div className="flex-1" />

        {/* Run / Preview */}
        <button
          onClick={() => fetch(apiUrl(`/runtime/restart`), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ projectId }),
          }).then(() => setPreviewKey(k => k + 1))}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-green-600 hover:bg-green-500 text-white text-xs font-medium transition-colors"
        >
          <Play className="w-3 h-3" />
          Run
        </button>

        <button
          onClick={saveCurrentFile}
          disabled={!activeTabData?.dirty || saving}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-medium transition-colors"
        >
          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
          Save
        </button>

        <button
          onClick={() => setPreviewKey(k => k + 1)}
          className="p-1.5 rounded hover:bg-white/10 text-gray-400 hover:text-gray-200 transition-colors"
          title="Refresh preview"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>

        <a
          href={`/api/preview-proxy/${previewSlug}/`}
          target="_blank"
          rel="noopener noreferrer"
          className="p-1.5 rounded hover:bg-white/10 text-gray-400 hover:text-gray-200 transition-colors"
          title="Open in new tab"
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </a>

        {/* Panel toggles */}
        <div className="flex items-center gap-0.5 ml-1 border border-white/10 rounded p-0.5">
          <button
            onClick={() => setRightPanel(v => v === "preview" ? null : "preview")}
            className={cn("p-1 rounded transition-colors text-xs", rightPanel === "preview" ? "bg-white/10 text-white" : "text-gray-500 hover:text-gray-300")}
            title="Preview"
          >
            <Eye className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex flex-1 min-h-0">

        {/* ── Sidebar: File Tree ── */}
        <div className="w-52 shrink-0 bg-[#0d1117] border-r border-white/10 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-2 py-1.5 border-b border-white/10">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-500">Explorer</span>
            <div className="flex gap-0.5">
              <button
                onClick={() => { setNewItemType("file"); setNewItemName(""); setNewItemParent(""); }}
                className="p-0.5 rounded hover:bg-white/10 text-gray-500 hover:text-gray-300"
                title="New file"
              >
                <FilePlus className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => { setNewItemType("directory"); setNewItemName(""); setNewItemParent(""); }}
                className="p-0.5 rounded hover:bg-white/10 text-gray-500 hover:text-gray-300"
                title="New folder"
              >
                <FolderPlus className="w-3.5 h-3.5" />
              </button>
              <button onClick={loadTree} className="p-0.5 rounded hover:bg-white/10 text-gray-500 hover:text-gray-300" title="Refresh">
                <RefreshCw className="w-3 h-3" />
              </button>
            </div>
          </div>

          {/* New item modal */}
          {newItemType && (
            <div className="border-b border-white/10 p-2">
              <div className="flex items-center gap-1 bg-white/5 rounded px-2 py-1">
                {newItemType === "file" ? <File className="w-3 h-3 text-gray-400" /> : <Folder className="w-3 h-3 text-yellow-400" />}
                <input
                  autoFocus
                  className="flex-1 bg-transparent outline-none text-xs text-gray-200 placeholder-gray-500"
                  placeholder={newItemType === "file" ? "filename.ts" : "folder-name"}
                  value={newItemName}
                  onChange={e => setNewItemName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter") createNewItem();
                    if (e.key === "Escape") { setNewItemType(null); setNewItemName(""); }
                  }}
                />
              </div>
              <div className="flex gap-1 mt-1.5">
                <button onClick={createNewItem} className="flex-1 text-[10px] bg-blue-600 hover:bg-blue-500 text-white rounded py-0.5 transition-colors">Create</button>
                <button onClick={() => { setNewItemType(null); setNewItemName(""); }} className="flex-1 text-[10px] bg-white/5 hover:bg-white/10 text-gray-400 rounded py-0.5 transition-colors">Cancel</button>
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto py-1 text-xs">
            {treeLoading ? (
              <div className="flex items-center justify-center py-8 text-gray-600">
                <Loader2 className="w-4 h-4 animate-spin" />
              </div>
            ) : tree.length === 0 ? (
              <div className="px-3 py-6 text-center text-gray-600 text-[11px]">No files yet</div>
            ) : (
              tree.map(entry => (
                <div key={entry.path} className="group relative">
                  <TreeNode entry={entry} depth={0} onOpen={openFile} activeFile={activeTab} />
                </div>
              ))
            )}
          </div>
        </div>

        {/* ── Center: Editor + Bottom Panel ── */}
        <div className="flex-1 flex flex-col min-w-0">

          {/* Tab bar */}
          <div className="flex items-center h-8 bg-[#161b22] border-b border-white/10 overflow-x-auto shrink-0">
            {tabs.length === 0 ? (
              <span className="text-[11px] text-gray-600 px-4 py-1">No files open — click a file to edit</span>
            ) : (
              tabs.map(tab => (
                <button
                  key={tab.path}
                  onClick={() => setActiveTab(tab.path)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 h-full border-r border-white/10 text-xs shrink-0 min-w-[80px] max-w-[160px] group/tab",
                    activeTab === tab.path
                      ? "bg-[#0d1117] text-gray-200"
                      : "text-gray-500 hover:bg-white/5 hover:text-gray-300"
                  )}
                >
                  {fileIcon(tab.name)}
                  <span className="truncate">{tab.name}</span>
                  {tab.dirty && <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />}
                  <button
                    onClick={(e) => closeTab(tab.path, e)}
                    className="ml-auto p-0.5 rounded opacity-0 group-hover/tab:opacity-100 hover:bg-white/10 transition-opacity shrink-0"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </button>
              ))
            )}
          </div>

          {/* Editor area */}
          <div className="flex-1 min-h-0 relative">
            {activeTabData ? (
              <Editor
                key={activeTab}
                height="100%"
                language={activeTabData.language}
                value={activeTabData.content}
                onChange={handleEditorChange}
                theme="vs-dark"
                options={{
                  fontSize: 13,
                  fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
                  fontLigatures: true,
                  minimap: { enabled: false },
                  scrollBeyondLastLine: false,
                  wordWrap: "on",
                  lineNumbers: "on",
                  glyphMargin: false,
                  folding: true,
                  lineDecorationsWidth: 0,
                  renderLineHighlight: "line",
                  cursorBlinking: "smooth",
                  smoothScrolling: true,
                  bracketPairColorization: { enabled: true },
                  formatOnPaste: true,
                  automaticLayout: true,
                  padding: { top: 8, bottom: 8 },
                  tabSize: 2,
                  quickSuggestions: true,
                  suggestOnTriggerCharacters: true,
                  acceptSuggestionOnEnter: "on",
                }}
                onMount={(editor) => { editorRef.current = editor; }}
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-gray-600 select-none">
                <Code2 className="w-12 h-12 mb-3 opacity-30" />
                <p className="text-sm">Open a file to start editing</p>
                <p className="text-xs mt-1">Or ask the AI agent to build something new</p>
              </div>
            )}
          </div>

          {/* Bottom panel bar */}
          <div className="flex items-center h-7 bg-[#161b22] border-t border-white/10 shrink-0">
            <button
              onClick={() => setBottomPanel(v => v === "terminal" ? null : "terminal")}
              className={cn(
                "flex items-center gap-1.5 px-3 h-full text-xs border-r border-white/10 transition-colors",
                bottomPanel === "terminal" ? "text-blue-400 bg-blue-500/10" : "text-gray-500 hover:text-gray-300"
              )}
            >
              <Terminal className="w-3 h-3" />
              Terminal
            </button>
            <button
              onClick={() => setBottomPanel(v => v === "agent" ? null : "agent")}
              className={cn(
                "flex items-center gap-1.5 px-3 h-full text-xs border-r border-white/10 transition-colors",
                bottomPanel === "agent" ? "text-purple-400 bg-purple-500/10" : "text-gray-500 hover:text-gray-300"
              )}
            >
              <Bot className="w-3 h-3" />
              AI Agent
            </button>
            {bottomPanel && (
              <button
                onClick={() => setBottomPanel(null)}
                className="ml-auto px-2 h-full text-gray-600 hover:text-gray-400"
              >
                <ChevronDown className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Bottom panel content */}
          {bottomPanel && (
            <div
              className="border-t border-white/10 shrink-0 overflow-hidden"
              style={{ height: `${bottomHeight}px` }}
            >
              {/* Resize handle */}
              <div
                className="h-1 bg-transparent hover:bg-blue-500/30 cursor-row-resize transition-colors"
                onMouseDown={e => {
                  const startY = e.clientY;
                  const startH = bottomHeight;
                  const onMove = (ev: MouseEvent) => {
                    const delta = startY - ev.clientY;
                    setBottomHeight(Math.max(120, Math.min(500, startH + delta)));
                  };
                  const onUp = () => {
                    window.removeEventListener("mousemove", onMove);
                    window.removeEventListener("mouseup", onUp);
                  };
                  window.addEventListener("mousemove", onMove);
                  window.addEventListener("mouseup", onUp);
                }}
              />
              <div className="h-[calc(100%-4px)]">
                {bottomPanel === "terminal" && <TerminalPanel projectId={projectId} />}
                {bottomPanel === "agent" && (
                  <AgentPanel projectId={projectId} onFilesChanged={loadTree} />
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── Right: Live Preview ── */}
        {rightPanel === "preview" && (
          <div className="w-[420px] shrink-0 border-l border-white/10 flex flex-col bg-[#0d1117]">
            <div className="h-8 bg-[#161b22] border-b border-white/10 flex items-center gap-2 px-2 shrink-0">
              <Eye className="w-3.5 h-3.5 text-gray-500" />
              <span className="text-[11px] text-gray-400 flex-1 truncate">
                /api/preview-proxy/{previewSlug}/
              </span>
              <button
                onClick={() => setPreviewKey(k => k + 1)}
                className="p-1 rounded hover:bg-white/10 text-gray-500 hover:text-gray-300"
              >
                <RefreshCw className="w-3 h-3" />
              </button>
              <button
                onClick={() => setRightPanel(null)}
                className="p-1 rounded hover:bg-white/10 text-gray-500 hover:text-gray-300"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
            <div className="flex-1 relative bg-white">
              <iframe
                key={previewKey}
                src={`${BASE}/api/preview-proxy/${previewSlug}/`}
                className="absolute inset-0 w-full h-full border-none"
                title="Live Preview"
                sandbox="allow-forms allow-modals allow-popups allow-presentation allow-same-origin allow-scripts"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
