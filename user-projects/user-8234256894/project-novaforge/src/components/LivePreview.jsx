import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const LivePreview = ({ projectId = 'demo', initialPort = 5173 }) => {
  const [port, setPort] = useState(initialPort);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [previewUrl, setPreviewUrl] = useState(`http://localhost:${initialPort}`);
  const [buildStatus, setBuildStatus] = useState('ready');
  const [logs, setLogs] = useState([]);
  const iframeRef = useRef(null);

  const addLog = (message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev.slice(-8), { id: Date.now(), timestamp, message, type }]);
  };

  const refreshPreview = () => {
    setIsRefreshing(true);
    setHasError(false);
    setBuildStatus('building');
    addLog('Initiating preview refresh...', 'info');

    setTimeout(() => {
      const newPort = Math.floor(Math.random() * 1000) + 5173;
      setPort(newPort);
      setPreviewUrl(`http://localhost:${newPort}`);
      
      if (Math.random() > 0.85) {
        setHasError(true);
        setErrorMessage('Build failed: Module not found. Auto-retrying...');
        setBuildStatus('error');
        addLog('Build error detected. Auto-retrying in 2s', 'error');
        
        setTimeout(() => {
          setHasError(false);
          setBuildStatus('ready');
          addLog('Preview recovered successfully', 'success');
        }, 2200);
      } else {
        setBuildStatus('ready');
        addLog(`Preview live on port ${newPort}`, 'success');
      }
      
      setIsRefreshing(false);
      
      if (iframeRef.current) {
        iframeRef.current.src = previewUrl;
      }
    }, 850);
  };

  const handleIframeError = () => {
    setHasError(true);
    setErrorMessage('Preview failed to load. Check build logs.');
    setBuildStatus('error');
    addLog('Iframe load error', 'error');
  };

  const retryPreview = () => {
    setHasError(false);
    refreshPreview();
  };

  useEffect(() => {
    addLog(`NovaForge preview initialized for project ${projectId}`, 'success');
    const interval = setInterval(() => {
      if (Math.random() > 0.92 && buildStatus === 'ready') {
        addLog('File change detected. Rebuilding...', 'info');
        refreshPreview();
      }
    }, 14000);
    return () => clearInterval(interval);
  }, [projectId]);

  return (
    <div className="h-full flex flex-col bg-[#0a0a0f] rounded-2xl overflow-hidden border border-white/10 shadow-2xl">
      <div className="flex items-center justify-between px-5 py-3 bg-white/5 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-sm font-medium text-white/90">Live Preview</span>
          </div>
          <div className="px-3 py-0.5 rounded-full bg-white/5 text-xs text-cyan-400 font-mono border border-white/10">
            PORT {port}
          </div>
          <div className={`px-2.5 py-0.5 text-[10px] uppercase tracking-[1px] rounded-full font-medium border ${
            buildStatus === 'ready' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
            buildStatus === 'building' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
            'bg-red-500/10 text-red-400 border-red-500/20'
          }`}>
            {buildStatus}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={refreshPreview}
            disabled={isRefreshing}
            className="flex items-center gap-2 px-4 py-1.5 text-xs font-medium rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/80 transition-all disabled:opacity-50 active:scale-[0.985]"
          >
            <motion.div animate={{ rotate: isRefreshing ? 360 : 0 }} transition={{ duration: 0.6 }}>
              ↻
            </motion.div>
            REFRESH
          </button>
          <div className="text-[10px] px-3 py-1 bg-white/5 rounded-lg text-white/50 font-mono">
            {previewUrl}
          </div>
        </div>
      </div>

      <div className="relative flex-1 bg-[#050507] overflow-hidden">
        <iframe
          ref={iframeRef}
          src={previewUrl}
          className="w-full h-full border-0 bg-white"
          title="NovaForge Live Preview"
          onError={handleIframeError}
          sandbox="allow-scripts allow-same-origin allow-forms"
        />

        <AnimatePresence>
          {hasError && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/90 backdrop-blur-xl flex items-center justify-center z-50"
            >
              <div className="text-center px-8">
                <div className="mx-auto w-16 h-16 rounded-2xl bg-red-500/10 flex items-center justify-center mb-6 border border-red-500/20">
                  <span className="text-4xl">⚠</span>
                </div>
                <div className="text-xl font-semibold text-white mb-2">Preview Error</div>
                <p className="text-white/60 text-sm max-w-xs mx-auto mb-8">{errorMessage}</p>
                <button
                  onClick={retryPreview}
                  className="px-8 py-3 bg-gradient-to-r from-cyan-500 to-blue-600 hover:brightness-110 text-white text-sm font-semibold rounded-2xl transition-all active:scale-[0.985]"
                >
                  RETRY BUILD
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {isRefreshing && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-40">
            <div className="flex flex-col items-center">
              <div className="w-9 h-9 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin mb-4" />
              <div className="text-xs tracking-[2px] text-cyan-400 font-medium">REBUILDING PREVIEW</div>
            </div>
          </div>
        )}
      </div>

      <div className="h-[92px] bg-[#0a0a0f] border-t border-white/10 px-5 py-3 overflow-y-auto text-xs font-mono custom-scroll">
        {logs.length > 0 ? (
          logs.map((log, idx) => (
            <div key={idx} className={`flex gap-3 py-px ${log.type === 'error' ? 'text-red-400' : log.type === 'success' ? 'text-emerald-400' : 'text-white/60'}`}>
              <span className="text-white/30 w-[62px] shrink-0">{log.timestamp}</span>
              <span>{log.message}</span>
            </div>
          ))
        ) : (
          <div className="text-white/30 italic">No logs yet...</div>
        )}
      </div>
    </div>
  );
};

export default LivePreview;