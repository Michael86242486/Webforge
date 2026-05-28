import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const AIChat = () => {
  const [messages, setMessages] = useState([
    { id: 1, type: 'ai', content: 'Hello! I\'m NovaForge AI. How can I help build your startup today?', timestamp: new Date() },
  ]);
  const [input, setInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [thinkingSteps, setThinkingSteps] = useState([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, thinkingSteps]);

  const simulateThinking = async (prompt) => {
    const steps = [
      'Analyzing prompt...',
      'Searching knowledge base...',
      'Generating project structure...',
      'Optimizing for production...',
      'Preparing code preview...'
    ];
    
    setThinkingSteps([]);
    setIsThinking(true);
    
    for (let i = 0; i < steps.length; i++) {
      await new Promise(resolve => setTimeout(resolve, 420));
      setThinkingSteps(prev => [...prev, steps[i]]);
    }
    
    await new Promise(resolve => setTimeout(resolve, 380));
    setIsThinking(false);
    setThinkingSteps([]);
    
    return generateAIResponse(prompt);
  };

  const generateAIResponse = (prompt) => {
    const lowerPrompt = prompt.toLowerCase();
    let response = '';
    
    if (lowerPrompt.includes('react') || lowerPrompt.includes('component')) {
      response = 'I\'ll scaffold a new React component with Tailwind and Framer Motion. Ready to generate files?';
    } else if (lowerPrompt.includes('database') || lowerPrompt.includes('sqlite')) {
      response = 'Creating SQLite schema with users, projects, and ai_generations tables. Would you like the full init script?';
    } else if (lowerPrompt.includes('deploy') || lowerPrompt.includes('production')) {
      response = 'Production build configured with Vite. Setting up auto-retry, health checks, and live preview on port 5173.';
    } else {
      response = 'Understood. Generating a new feature set with glassmorphism UI, JWT auth, and autonomous error detection.';
    }
    
    return response;
  };

  const handleSend = async () => {
    if (!input.trim() || isThinking || isStreaming) return;

    const userMessage = {
      id: Date.now(),
      type: 'user',
      content: input.trim(),
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    const currentInput = input.trim();
    setInput('');

    const aiResponse = await simulateThinking(currentInput);
    
    setIsStreaming(true);
    const aiMessage = {
      id: Date.now() + 1,
      type: 'ai',
      content: '',
      timestamp: new Date()
    };
    
    setMessages(prev => [...prev, aiMessage]);

    // Simulate streaming
    let displayed = '';
    const words = aiResponse.split(' ');
    
    for (let i = 0; i < words.length; i++) {
      await new Promise(resolve => setTimeout(resolve, 65));
      displayed += words[i] + ' ';
      setMessages(prev => 
        prev.map(msg => 
          msg.id === aiMessage.id 
            ? { ...msg, content: displayed.trim() } 
            : msg
        )
      );
    }
    
    setIsStreaming(false);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const clearChat = () => {
    setMessages([{ 
      id: 1, 
      type: 'ai', 
      content: 'Chat reset. What would you like to build next?', 
      timestamp: new Date() 
    }]);
    setThinkingSteps([]);
    setIsThinking(false);
  };

  return (
    <div className="flex flex-col h-full bg-[#0a0a0f] rounded-2xl border border-white/10 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-black/40">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center">
            <span className="text-black font-bold text-lg">N</span>
          </div>
          <div>
            <div className="font-semibold text-white">NovaForge AI</div>
            <div className="text-xs text-emerald-400 flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
              Online • Powered by GPT-4o
            </div>
          </div>
        </div>
        <button 
          onClick={clearChat}
          className="px-3 py-1.5 text-xs text-white/60 hover:text-white hover:bg-white/5 rounded-lg transition-all"
        >
          Clear conversation
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scroll">
        <AnimatePresence>
          {messages.map((message) => (
            <motion.div 
              key={message.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div className={`max-w-[82%] px-5 py-4 rounded-2xl text-sm leading-relaxed ${message.type === 'user' 
                ? 'bg-gradient-to-br from-cyan-500 to-blue-600 text-white' 
                : 'bg-white/5 border border-white/10 text-white/90'}`}>
                {message.content}
                <div className="text-[10px] opacity-40 mt-2 text-right">
                  {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Thinking Steps */}
        <AnimatePresence>
          {isThinking && (
            <div className="flex justify-start">
              <div className="max-w-[82%] w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4">
                <div className="flex items-center gap-2 mb-3 text-cyan-400 text-xs font-medium tracking-wider">
                  THINKING
                  <div className="flex-1 h-px bg-gradient-to-r from-cyan-400/40 to-transparent" />
                </div>
                <div className="space-y-1.5 text-xs text-white/70">
                  {thinkingSteps.map((step, idx) => (
                    <motion.div 
                      key={idx} 
                      initial={{ opacity: 0, x: -8 }} 
                      animate={{ opacity: 1, x: 0 }}
                      className="flex items-center gap-2"
                    >
                      <div className="w-1 h-1 rounded-full bg-cyan-400" /> {step}
                    </motion.div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </AnimatePresence>
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-white/10 bg-black/40">
        <div className="flex gap-3 items-end">
          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Describe your next feature, component, or workflow..."
              className="w-full resize-y min-h-[52px] max-h-36 bg-white/5 border border-white/10 focus:border-cyan-500/40 text-white placeholder:text-white/40 rounded-2xl px-5 py-3.5 text-sm outline-none transition-all"
              disabled={isThinking || isStreaming}
            />
          </div>
          <button
            onClick={handleSend}
            disabled={!input.trim() || isThinking || isStreaming}
            className="h-[52px] px-7 rounded-2xl bg-gradient-to-r from-cyan-400 to-blue-500 text-black font-medium text-sm flex items-center justify-center disabled:opacity-40 transition-all active:scale-[0.985]"
          >
            {isStreaming ? 'STREAMING...' : 'SEND'}
          </button>
        </div>
        <div className="text-[10px] text-center mt-2 text-white/30">Press Enter to send • Shift+Enter for new line</div>
      </div>
    </div>
  );
};

export default AIChat;