, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../hooks/useAuth';

const Navbar = () => {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [notifications] = useState([
    { id: 1, message: 'Your AI generation completed', time: '2m ago', type: 'success' },
    { id: 2, message: 'New project shared with you', time: '1h ago', type: 'info' },
    { id: 3, message: 'Subscription renewed successfully', time: 'yesterday', type: 'success' }
  ]);

  const unreadCount = notifications.length;

  const handleSearch = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/projects?search=${encodeURIComponent(searchQuery)}`);
      setSearchQuery('');
    }
  };

  const handleLogout = () => {
    logout();
    setShowProfileMenu(false);
    navigate('/login');
  };

  const toggleNotifications = () => {
    setShowNotifications(!showNotifications);
    setShowProfileMenu(false);
  };

  const toggleProfileMenu = () => {
    setShowProfileMenu(!showProfileMenu);
    setShowNotifications(false);
  };

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-[#0a0a0f]/95 backdrop-blur-xl border-b border-white/10">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <Link to="/" className="flex items-center gap-3 group">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-400 via-blue-500 to-purple-600 flex items-center justify-center shadow-[0_0_20px_rgba(103,232,249,0.5)]">
              <span className="text-white font-bold text-xl tracking-tighter">NF</span>
            </div>
            <div>
              <div className="font-semibold text-xl tracking-[-1.5px] text-white">NovaForge</div>
              <div className="text-[10px] text-white/40 -mt-1">AI Startup Builder</div>
            </div>
          </Link>
        </div>

        {/* Search Bar */}
        <div className="flex-1 max-w-md mx-8 hidden md:block">
          <form onSubmit={handleSearch} className="relative group">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search projects, templates, or AI prompts..."
              className="w-full bg-white/5 border border-white/10 focus:border-cyan-400/50 text-white placeholder:text-white/40 px-4 py-2.5 pl-11 rounded-2xl text-sm outline-none transition-all focus:bg-white/10"
            />
            <div className="absolute left-4 top-3 text-white/40">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <div className="absolute right-3 top-2.5 text-[10px] px-1.5 py-px rounded bg-white/10 text-white/50">⌘K</div>
          </form>
        </div>

        {/* Right Side Controls */}
        <div className="flex items-center gap-2">
          {/* Theme Toggle */}
          <button
            onClick={toggleTheme}
            className="p-2.5 rounded-2xl hover:bg-white/5 transition-colors text-white/70 hover:text-white"
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? (
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
              </svg>
            )}
          </button>

          {/* Notifications */}
          <div className="relative">
            <button
              onClick={toggleNotifications}
              className="relative p-2.5 rounded-2xl hover:bg-white/5 transition-colors text-white/70 hover:text-white"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 01-6 0v-1m6 0H9" />
              </svg>
              {unreadCount > 0 && (
                <div className="absolute top-1.5 right-1.5 w-4 h-4 bg-cyan-400 text-[#0a0a0f] text-[9px] font-bold rounded-full flex items-center justify-center">
                  {unreadCount}
                </div>
              )}
            </button>

            <AnimatePresence>
              {showNotifications && (
                <motion.div
                  initial={{ opacity: 0, y: 8, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.96 }}
                  className="absolute right-0 mt-3 w-80 bg-[#111114] border border-white/10 rounded-3xl shadow-2xl overflow-hidden"
                >
                  <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
                    <div className="font-semibold text-sm">Notifications</div>
                    <div className="text-xs text-cyan-400 cursor-pointer">Mark all read</div>
                  </div>
                  <div className="max-h-80 overflow-auto divide-y divide-white/10">
                    {notifications.map((notif) => (
                      <div key={notif.id} className="px-5 py-4 hover:bg-white/5 flex gap-3 text-sm">
                        <div className="w-1.5 h-1.5 mt-2 rounded-full bg-cyan-400 flex-shrink-0" />
                        <div className="flex-1">
                          <div className="text-white/90">{notif.message}</div>
                          <div className="text-white/40 text-xs mt-0.5">{notif.time}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="p-3 border-t border-white/10">
                    <Link to="/settings" className="block text-center text-xs text-cyan-400 hover:text-cyan-300">View all notifications</Link>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Profile Menu */}
          <div className="relative">
            <button onClick={toggleProfileMenu} className="flex items-center gap-2.5 pl-1.5 pr-4 py-1.5 rounded-2xl hover:bg-white/5 transition-all">
              <div className="w-8 h-8 rounded-2xl bg-gradient-to-br from-cyan-400 to-blue-600 ring-2 ring-white/20 overflow-hidden">
                <img 
                  src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.name || 'nova'}`} 
                  alt="avatar" 
                  className="w-full h-full" 
                />
              </div>
              <div className="hidden md:block text-left">
                <div className="text-sm font-medium text-white leading-none">{user?.name || 'Alex Rivera'}</div>
                <div className="text-[10px] text-white/50">Pro Plan</div>
              </div>
            </button>

            <AnimatePresence>
              {showProfileMenu && (
                <motion.div
                  initial={{ opacity: 0, y: 8, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.96 }}
                  className="absolute right-0 mt-3 w-64 bg-[#111114] border border-white/10 rounded-3xl shadow-2xl py-2 text-sm"
                >
                  <div className="px-4 py-3 border-b border-white/10">
                    <div className="font-medium">{user?.name}</div>
                    <div className="text-white/50 text-xs">{user?.email}</div>
                  </div>
                  <Link to="/profile" onClick={() => setShowProfileMenu(false)} className="block px-4 py-2.5 hover:bg-white/5">Profile Settings</Link>
                  <Link to="/settings" onClick={() => setShowProfileMenu(false)} className="block px-4 py-2.5 hover:bg-white/5">Preferences</Link>
                  <div className="border-t border-white/10 my-1" />
                  <button onClick={handleLogout} className="block w-full text-left px-4 py-2.5 hover:bg-white/5 text-red-400">Sign out</button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;