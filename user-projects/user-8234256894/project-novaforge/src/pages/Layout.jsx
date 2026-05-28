import React, { useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'amer-motion';
import Sidebar from '../components/Sidebar';
import Navbar from '../components/Navbar';

const Layout = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [notifications, setNotifications] = useState([
    { id: 1, type: 'success', message: 'Project Nova-1 deployed successfully', time: '2m ago' },
    { id: 2, type: 'info', message: 'AI generation completed for landing page', time: '15m ago' }
  ]);
  const [showNotifications, setShowNotifications] = useState(false);
  const navigate = useNavigate();

  const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);

  const dismissNotification = (id) => {
    setNotifications(notifications.filter(n => n.id !== id));
  };

  const addNotification = (type, message) => {
    const newNotif = {
      id: Date.now(),
      type,
      message,
      time: 'just now'
    };
    setNotifications([newNotif, ...notifications].slice(0, 5));
  };

  // Demo notification trigger
  const triggerDemoNotification = () => {
    addNotification('success', 'New AI workspace session started');
    setShowNotifications(true);
    setTimeout(() => setShowNotifications(false), 3000);
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white flex overflow-hidden">
      {/* Sidebar */}
      <div className={`${isSidebarOpen ? 'w-72' : 'w-20'} transition-all duration-300 flex-shrink-0 border-r border-white/10 bg-[#111114]/95 backdrop-blur-xl`}>
        <Sidebar isOpen={isSidebarOpen} toggleSidebar={toggleSidebar} />
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Navbar */}
        <Navbar 
          toggleSidebar={toggleSidebar} 
          showNotifications={() => setShowNotifications(!showNotifications)}
          onDemoNotif={triggerDemoNotification}
        />

        {/* Page Content with Outlet */}
        <main className="flex-1 overflow-auto p-6 bg-gradient-to-br from-[#0a0a0f] via-[#0f0f14] to-[#0a0a0f]">
          <div className="max-w-7xl mx-auto">
            <Outlet />
          </div>
        </main>

        {/* Footer Bar */}
        <div className="h-12 border-t border-white/10 bg-[#111114]/80 backdrop-blur-md flex items-center px-6 text-xs text-white/40">
          <div className="flex items-center justify-between w-full">
            <span>NovaForge v1.0.0 • AI-Powered • All systems operational</span>
            <span>Connected to SQLite • Last sync: just now</span>
          </div>
        </div>
      </div>

      {/* Notifications Overlay */}
      <AnimatePresence>
        {showNotifications && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="fixed top-20 right-6 w-96 z-50"
          >
            <div className="glass-card p-4 border border-white/10">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse" />
                  <span className="font-medium text-sm">Notifications</span>
                </div>
                <button 
                  onClick={() => setShowNotifications(false)}
                  className="text-white/40 hover:text-white text-lg leading-none"
                >
                  ×
                </button>
              </div>
              
              <div className="space-y-2 max-h-80 overflow-auto custom-scroll">
                {notifications.length > 0 ? (
                  notifications.map((notif) => (
                    <div 
                      key={notif.id}
                      className="flex items-start gap-3 p-3 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 transition-all group"
                    >
                      <div className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${
                        notif.type === 'success' ? 'bg-emerald-400' : 
                        notif.type === 'error' ? 'bg-red-400' : 'bg-cyan-400'
                      }`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white/90 leading-snug">{notif.message}</p>
                        <p className="text-[10px] text-white/40 mt-1">{notif.time}</p>
                      </div>
                      <button 
                        onClick={() => dismissNotification(notif.id)}
                        className="opacity-0 group-hover:opacity-100 text-white/30 hover:text-white/70 transition-all text-lg"
                      >
                        ×
                      </button>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8 text-white/40 text-sm">No new notifications</div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Global Toast Container */}
      <div id="toast-container" className="fixed bottom-6 right-6 z-[60] space-y-2" />
    </div>
  );
};

export default Layout;