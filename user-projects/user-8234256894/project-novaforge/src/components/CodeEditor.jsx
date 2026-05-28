, { useState, useRef, useEffect } from 'react';

const CodeEditor = ({ 
  initialCode = '// Welcome to NovaForge AI Workspace\n// Start building your next big idea\n\nfunction createStartup() {\n  return "NovaForge powered!";\n}\n\nconsole.log(createStartup());', 
  language = 'javascript',
  onChange = () => {},
  readOnly = false 
}) => {
  const [code, setCode] = useState(initialCode);
  const [currentLanguage, setCurrentLanguage] = useState(language);
  const [lineCount, setLineCount] = useState(1);
  const textareaRef = useRef(null);
  const lineNumbersRef = useRef(null);

  const languages = ['javascript', 'typescript', 'python', 'jsx', 'css', 'json'];

  const updateLineNumbers = (text) => {
    const lines = text.split('\n').length;
    setLineCount(lines);
  };

  const handleCodeChange = (e) => {
    const newCode = e.target.value;
    setCode(newCode);
    updateLineNumbers(newCode);
    onChange(newCode);
  };

  const handleScroll = (e) => {
    if (lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = e.target.scrollTop;
    }
  };

  const insertSnippet = (snippet) => {
    if (readOnly || !textareaRef.current) return;
    
    const textarea = textareaRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const newCode = code.substring(0, start) + snippet + code.substring(end);
    
    setCode(newCode);
    updateLineNumbers(newCode);
    onChange(newCode);
    
    setTimeout(() => {
      textarea.focus();
      textarea.selectionStart = start + snippet.length;
      textarea.selectionEnd = start + snippet.length;
    }, 0);
  };

  const getLanguageColor = (lang) => {
    const colors = {
      javascript: '#f7df1e',
      typescript: '#3178c6',
      python: '#3776ab',
      jsx: '#61dafb',
      css: '#264de4',
      json: '#f58220'
    };
    return colors[lang] || '#67e8f9';
  };

  useEffect(() => {
    updateLineNumbers(code);
  }, [code]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Tab' && textareaRef.current) {
        e.preventDefault();
        const textarea = textareaRef.current;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const newCode = code.substring(0, start) + '  ' + code.substring(end);
        setCode(newCode);
        updateLineNumbers(newCode);
        onChange(newCode);
        
        setTimeout(() => {
          textarea.selectionStart = textarea.selectionEnd = start + 2;
        }, 0);
      }
    };

    const textarea = textareaRef.current;
    if (textarea) {
      textarea.addEventListener('keydown', handleKeyDown);
      return () => textarea.removeEventListener('keydown', handleKeyDown);
    }
  }, [code]);

  return (
    <div className="flex flex-col h-full bg-[#0a0a0f] border border-[#1f2937] rounded-xl overflow-hidden shadow-2xl">
      {/* Editor Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-[#111114] border-b border-[#1f2937]">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-[#ef4444]"></div>
            <div className="w-3 h-3 rounded-full bg-[#f59e0b]"></div>
            <div className="w-3 h-3 rounded-full bg-[#22c55e]"></div>
          </div>
          <div className="flex items-center gap-2 ml-4">
            <div className="px-3 py-1 bg-[#1a1a23] rounded-md text-xs font-mono text-[#67e8f9]">
              {currentLanguage.toUpperCase()}
            </div>
            <select 
              value={currentLanguage}
              onChange={(e) => setCurrentLanguage(e.target.value)}
              className="bg-[#1a1a23] text-[#94a3b8] text-xs px-2 py-1 rounded-md border border-[#334155] focus:outline-none focus:border-[#67e8f9]"
              disabled={readOnly}
            >
              {languages.map(lang => (
                <option key={lang} value={lang}>{lang}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button 
            onClick={() => insertSnippet('// TODO: AI generated code\n')}
            disabled={readOnly}
            className="px-3 py-1 text-xs bg-[#1a1a23] hover:bg-[#67e8f9] hover:text-[#0a0a0f] text-[#67e8f9] rounded-md transition-all border border-[#334155] flex items-center gap-1 disabled:opacity-50"
          >
            <span>AI Snippet</span>
          </button>
          <div className="text-[#64748b] text-xs font-mono">
            {code.length} chars • {lineCount} lines
          </div>
        </div>
      </div>

      {/* Editor Body */}
      <div className="flex flex-1 relative overflow-hidden">
        {/* Line Numbers */}
        <div 
          ref={lineNumbersRef}
          className="w-12 bg-[#111114] border-r border-[#1f2937] py-4 text-right pr-3 select-none overflow-hidden"
          style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' }}
        >
          {Array.from({ length: lineCount }, (_, i) => (
            <div 
              key={i} 
              className="text-[#475569] text-xs leading-[1.45] h-[21px]"
            >
              {i + 1}
            </div>
          ))}
        </div>

        {/* Code Area */}
        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            value={code}
            onChange={handleCodeChange}
            onScroll={handleScroll}
            readOnly={readOnly}
            spellCheck={false}
            className="absolute inset-0 w-full h-full bg-transparent text-[#e2e8f0] resize-none p-4 pl-2 outline-none font-mono text-sm leading-[1.45] tracking-[-0.2px] z-10 caret-[#67e8f9]"
            style={{ 
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
              tabSize: 2 
            }}
            placeholder="Write your code here or let NovaForge AI generate it..."
          />
          
          {/* Syntax Highlight Overlay (visual only) */}
          <div className="absolute inset-0 p-4 pl-2 pointer-events-none text-sm font-mono leading-[1.45] text-[#64748b] z-0 overflow-hidden whitespace-pre-wrap break-words opacity-30">
            {code.split('\n').map((line, idx) => (
              <div key={idx} style={{ color: getLanguageColor(currentLanguage) }}>
                {line || ' '}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Status Bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-[#111114] border-t border-[#1f2937] text-xs text-[#64748b]">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-[#22c55e] animate-pulse"></div>
            <span>Live synced</span>
          </div>
          <div>UTF-8</div>
          <div>Ln {lineCount}, Col 1</div>
        </div>
        <div className="text-[#67e8f9] font-medium">NovaForge Editor v2.4.1</div>
      </div>
    </div>
  );
};

export default CodeEditor;