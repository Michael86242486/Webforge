, { useState, use, useEffect } from 'react';
import motion, AnimatePresence } 'framer-motion';

 AIWorkspace = () => {
 const [messages, set] = useState([
 { id: 1,: 'ai', content 'Hello! I\' Nova, your AI co-pilot. What would you like to build today?', timestamp '10:24' }
  ]);
  const [, setInput] =State('');
  const [Thinking, setIsThinking] = useState(false);
  constthinkingSteps, setThinkingSteps] = useState([]);
  const [active, setActiveTab] = use('explorer');
  constfiles, setFiles] useState([
    { id: 1, name:src/App.jsx', type: 'file', content: 'import React from "react";\n\nfunction App() {\n  return <div classNametext-cyan-400">NovaForge AI Workspace</div>;\n}\n\nexport default;' },
    { id: 2, name: 'src/components/Hero.jsx', type 'file', content: 'export const Hero = () => <div className="hero">Premium Startup</div>;' },
    { id: 3, name: 'public/index.html', type: 'file', content: '<!DOCTYPE html>\n<html><head><title>NovaForge</title></head><body><div id="rootdiv></body></html>' }
  ]);
  const [selectedFile, setSelectedFile] = useState(files[0]);
  const [editorContent, setEditorContent] = useState(files[0].content);
 const [terminalLogs, setTerminalLogs] = useState([
    { id: 1, type: 'info', text: '[INFO] Dev server started on port 5173' },
    { id: 2,: 'success', text: '[SUCCESS] Hot reload enabled' }
  ]);
  constpreviewHtml, setPreviewHtml] = useState('<div style="display:flex;align-items:center-content:center;height:100%;background:#0a0a0f;color:#67e8f9;font-family:Inter,sans-serif"><divh1 style="font-size:2.5rem;margin-bottom:8px">Nova</h1><p style="color:#64748b">Live Preview • AI Generated</></div></div>');
  const [isPreviewRefreshing, setIsPreviewRefreshing] =State(false);

  const chatContainerRef = useRef(null);
  const editorRef = useRef(null);

  const scrollToBottom = () => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  constAIResponse = (prompt) => {
    setIsThinking(true);
    const steps = [
      'Analyzing prompt...',
     Generating project structure...',
      'Writing React components...',
      'Optimizing for production...',
      'Preparing live preview...'
       setThinkingSteps(steps);

    setTimeout(() => {
      setThinkingSteps([]);
      const aiResponse = {
        id: Date.now(),
        type: 'ai',
        content: `I've generated a beautiful startup landing page based on "${prompt}". Updated App.jsx, added new components, and refreshed the live preview.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setMessages(prev => [...prev, aiResponse]);

      const newCode = `import React from 'react';\n\nfunction App() {\n  return (\n    <div className="min-h-screen bg-[#0a0a0f] text-white">\n      <nav className="glass flex items-center justify-between px-8 py-4">\n        <div className="text-2xl font-semibold tracking-tight">NovaForge</div>\n        <div className="flex gap-8 text-sm">\n          <a href="#features" className="hover:text-cyan-400 transition-colors">Features</a>\n          <a href="#pricing" className="hover:text-cyan-400 transition-colors">Pricing</a>\n        </div>\n      </nav>\n      <div className="flex flex-col items-center justify-center pt-24 pb-16">\n        <div className="text-center max-w-2xl">\n          <div className="inline-block px-4 py-1 mb-4 text-xs rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">AI POWERED</div>\n          <h1 className="text-7xl font-semibold tracking-tighter mb-4">${prompt}</h1>\n          <p className="text-xl text-slate-400 mb-8">The future of creator tools starts here.</p>\n          <button className="px-8 py-3 bg-white text-black rounded-full font-medium hover:bg-cyan-400 hover:text-white transition-all">Get Started Free</button>\n        </div>\n      </>\n    </div>\n  );\n}\n\nexport default App;`;

      const updatedFile = { ...selectedFile, content: newCode };
      setFiles(prev => prev.map(f => f.id === selectedFile.id ? updatedFile : f));
      setSelectedFile(updatedFile);
      setEditorContent(newCode);

      setPreviewHtml(`<div style="display:flex;align-items:center;justify-content:center;height:100%;background:#0a0a0f;color:white;font-familyInter,sans-serif"><div style="text-align:center"><h1 style="font-size:3rem;margin-bottom:12px;color:#67e8f9">${prompt}</h1><p style="color:#64748b">Beautiful AI-generated landing page ready for launch</p></div></div>`);

      setTerminalLogs(prev => [...prev, 
        { id: Date.now(), type: 'success', text: '[AI] Code generation complete' },
        { id: Date.now() + 1, type: 'info', text: '[BUILD] Preview updated successfully' }
      ]);

 setIsThinking(false);
    }, 2400);
  };

  const handleSend = () => {
    if (!input.trim()) return;

    const userMessage = {
      id: Date.now(),
      type: 'user',
      content: input.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    setMessages(prev => [...prev, userMessage]);
    const prompt = input.trim();
    setInput('');

    setTimeout(() => {
      simulateAIResponse(prompt);
    }, 300);
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault      handleSend();
    }
  };

  const selectFile = (file) => {
    setSelectedFile(file);
    setEditorContent(file.content);
    setActiveTab('editor');
  };

  const updateEditor = (e) => {
    const newContent = e.target.value;
    setEditorContent(newContent);
    const updatedFiles = files.map(f => 
      f.id === selectedFile.id ? { ...f, content: newContent } : f
    );
    setFiles(updatedFiles);
    setSelectedFile({ ...selectedFile, content: newContent });
  };

  const refreshPreview = () => {
    setIsPreviewRefreshing(true);
    setTimeout(() => {
      setIsPreviewRefreshing(false);
      setTerminalLogs(prev => [...prev, { id: Date.now(), type: 'info', text: '[PREVIEW] Refreshed at ' + new Date().toLocaleTimeString() }]);
    }, 650);
  };

  const runBuild = () => {
    setTerminalLogs(prev => [...prev, { id: Date.now(), type: 'info', text: '[BUILD] Starting production build...' }]);
    setTimeout(() => {
      setTerminalLogs(prev => [...prev, { id: Date.now(), type: 'success', text: '[BUILD] Build successful. Bundle size: 184kb' }]);
    }, 1200);
  };

  return (
    <div className="flex h-[calc(100vh-64px)] bg-[#0a0a0f] text-white overflow-hidden">
      {/* Left Panel - AI Chat */}
      <div className="w-2/5 flex flex-col border-r border-white/10 bg-[#111113]">
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
          <div>
            <div className="font-semibold flex items-center gap-2">
              <div className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse" /> Nova AI
            </div>
            <div className="text-xs text-slate-500">Workspace Agent v4.2</div>
          </div>
          <div className="px-3 py-1 text-xs rounded-full bg-white/5 border border-white/10">Online</div>
        </div>

        <div ref={chatContainerRef} className="flex-1 overflow-y-auto p-6 space-y-6 text-sm">
          {messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.type === 'user' ? 'justify-end' : ''}`}>
              <div className={`max-w-[85%] px-5 py-3.5 rounded-2xl ${msg.type === 'user' 
                ? 'bg-white text-black' 
                : 'glass border border-white/10'}`}>
                <div className="whitespace-pre-wrap leading-relaxed">{msg.content}</div>
                <div className="text-[10px] mt-2 opacity-50 text-right">{msg.timestamp}</div>
              </div>
            </div>
          ))}

          <AnimatePresence>
            {isThinking && (
              <div className="glass border border-white/10 px-5 py-4 rounded-2xl">
                <div className="text-cyan-400 text-xs mb-3 flex items-center gap-2">
                  <div className="animate-spin w-3 h-3 border border-cyan-400 border-t-transparent rounded-full" /> THINKING
                </div>
                {thinkingSteps.map((step, idx) => (
                  <div key={idx} className="text-xs text-slate-400 flex items-center gap-2 py-px">
                    <div className="w-1 h-1 bg-cyan-400 rounded-full" /> {step}
                  </div>
                ))}
              </div>
            )}
          </AnimatePresence>
        </div>

        <div className="p-6 border-t border-white/10">
          <div className="glass flex items-center gap-3 px-5 py-3 rounded-2xl border border-white/10 focus-within:border-cyan-400/40 transition-all">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder="Describe what you want to build..."
              className="flex-1 bg-transparent outline-none text-sm placeholder:text-slate-500"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isThinking}
              className="px-5 py-1.5 bg-white text-black text-xs font-medium rounded-xl disabled:opacity-40 transition-all active:scale-[0.985]"
            >
              SEND
            </button>
          </div>
          <div className="text-[10px] text-center mt-3 text-slate-500">Press Enter to send • Shift+Enter for newline</div>
        </div>
      </div>

      {/* Right Panel */}
      <div className="flex-1 flex flex-col">
        {/* Tabs */}
        <div className="h-14 flex items-center px-6 border-b border-white/10 bg-[#111113]">
          {['explorer', 'editor', 'preview', 'terminal'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-6 py-2 text-sm font-medium capitalize transition-all relative ${activeTab === tab 
                ? 'text-white' 
                : 'text-slate-400 hover:text-white'}`}
            >
              {tab}
              {activeTab === tab && (
                <motion.div layoutId="tab" className="absolute bottom-0 left-6 right-6 h-px bg-cyan-400" />
              )}
            </button>
          ))}
          <div className="flex-1" />
          <button onClick={runBuild} className="text-xs px-4 py-1.5 bg-white/5 hover:bg-white/10 rounded-xl border border-white/10 flex items-center gap-2 transition-colors">
            <span>Build</span>
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 p-4 overflow-hidden">
          {activeTab === 'explorer' && (
            <div className="glass h-full rounded-3xl p-6 border border-white/10">
              <div className="font-medium mb-4 flex items-center justify-between text-sm">Project Files <span className="text-cyan-400 text-xs">3 files</span></div>
              <div className="space-y-1 text-sm">
                {files.map(file => (
                  <div 
                    key={file.id} 
                    onClick={() => selectFile(file)}
                    className={`px-4 py-3 rounded-2xl flex items-center gap-3 cursor-pointer transition-all hover:bg-white/5 ${selectedFile.id === file.id ? 'bg-white/5 border border-white/10' : ''}`}
                  >
                    <div className="text-cyan-400">📄</div>
                    <div>{file.name}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'editor' && (
            <div className="glass h-full rounded-3xl border border-white/10 overflow-hidden flex flex-col">
              <div className="px-5 py-3 text-xs flex items-center justify-between border-b border-white/10 bg-black/20">
                <div>{selectedFile.name}</div>
                <div className="text-cyan-400 text-[10px]">LIVE SYNCED</div>
              </div>
              <textarea
                ref={editorRef}
                value={editorContent}
                onChange={updateEditor}
                className="flex-1 p-6 font-mono text-sm bg resize-none outline-none leading-relaxed tracking-[-0.2px]"
                spellCheck="false"
              />
            </div>
          )}

          {activeTab === 'preview' && (
            <div className="glass h-full rounded-3xl border border-white/10 overflow-hidden relative">
              <div className="absolute top-4 right-4 z-10 flex gap-2">
                <button onClick={refreshPreview} className="px-4 py-1.5 text-xs bg-black/60 backdrop-blur-xl rounded-full border border-white/10 hover:bg-white/10 flex items-center gap-2">
                  {isPreviewRefreshing ? 'Refreshing...' : 'Refresh Preview'}
                </button>
              </div>
              <iframe 
                title="Live Preview" 
                srcDoc={previewHtml} 
                className="w-full h-full bg-[#0a0a0f]" 
                sandbox="allow-scripts"
              />
            </div>
          )}

          {activeTab === 'terminal' && (
            <div className="glass h-full rounded-3xl border border-white/10 p-6 font-mono text-xs overflow-auto bg-black/40">
              {terminalLogs.map(log => (
                <div key={log.id} className={`py-1 ${log.type === 'success' ? 'text-emerald-400' : 'text-slate-400'}`}>
                  {log.text}
                </div>
              ))}
              <div className="text-cyan-400 mt-4">➜ Ready for commands</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AIWorkspace;