const React = require('react');
const { Link, useLocation } = require('react-router-dom');
const { motion, AnimatePresence } = require('framer-motion');
const { useState } = require('react');

function Sidebar({ isCollapsed, setIsCollapsed, user, onLogout }) {
  const location = useLocation();
  const [showUserDropdown, setShowUserDropdown] = useState(false);

  const navItems = [
    { path: '/', label: 'Home', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1v-5m10 0v5a1 1 0 001-1V10m-10 0a1 1 0 00-1 1v5' },
    { path: '/features', label: 'Features', icon: 'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2' },
    { path: '/pricing', label: 'Pricing', icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 4.01V8' },
    { path: '/dashboard', label: 'Dashboard', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1v-5m10 0v5a1 1 0 001-1V10m-10 0a1 1 0 00-1 1v5' },
    { path: '/projects', label: 'Projects', icon: 'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2' },
    { path: '/ai-workspace', label: 'AI Workspace', icon: 'M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 21h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2z' },
    { path: '/profile', label: 'Profile', icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
    { path: '/settings', label: 'Settings', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z' },
    { path: '/contact', label: 'Contact', icon: 'M3 8l7.89 5.26a2.009 2.009 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z' }
  ];

  const isActive = (path) => location.pathname === path;

  return React.createElement('div', {
    className: `fixed left-0 top-0 h-full bg-[#0a0a0f] border-r border-white/10 flex flex-col transition-all duration-300 z-50 ${isCollapsed ? 'w-20' : 'w-72'} glassmorphism`
  },
    React.createElement('div', { className: 'p-6 flex items-center justify-between border-b border-white/10' },
      React.createElement(Link, { to: '/', className: 'flex items-center gap-3' },
        React.createElement('div', { className: 'w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center' },
          React.createElement('span', { className: 'text-white font-bold text-2xl tracking-tighter' }, 'N')
        ),
        !isCollapsed && React.createElement('div', {},
          React.createElement('div', { className: 'font-semibold text-2xl tracking-[-1.5px] text-white' }, 'NovaForge'),
          React.createElement('div', { className: 'text-[10px] text-white/50 -mt-1' }, 'AI STARTUP OS')
        )
      ),
      React.createElement('button', {
        onClick: () => setIsCollapsed(!isCollapsed),
        className: 'p-2 hover:bg-white/5 rounded-lg transition-colors text-white/60 hover:text-white'
      }, React.createElement('svg', { className: 'w-4 h-4', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' },
        React.createElement('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, d: isCollapsed ? 'M13 5l7 7-7 7M5 5l7 7-7 7' : 'M11 19l-7-7 7-7m8 14l-7-7 7-7' })
      ))
    ),

    React.createElement('div', { className: 'flex-1 px-3 py-6 overflow-y-auto space-y-1' },
      navItems.map((item) =>
        React.createElement(Link, {
          key: item.path,
          to: item.path,
          className: `group flex items-center gap-3 px-4 py-3 mx-2 rounded-2xl transition-all ${isActive(item.path) ? 'bg-white/10 text-white shadow-inner' : 'text-white/70 hover:bg-white/5 hover:text-white'}`
        },
          React.createElement('div', { className: `w-5 h-5 flex-shrink-0 ${isActive(item.path) ? 'text-cyan-400' : 'text-white/50 group-hover:text-cyan-400'}` },
            React.createElement('svg', { fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' },
              React.createElement('path', { strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 1.75, d: item.icon })
            )
          ),
          !isCollapsed && React.createElement('span', { className: 'font-medium tracking-[-0.2px]' }, item.label),
          isActive(item.path) && React.createElement('div', { className: 'ml-auto w-1.5 h-1.5 rounded-full bg-cyan-400' })
        )
      )
    ),

    React.createElement('div', { className: 'p-4 border-t border-white/10 relative' },
      React.createElement('button', {
        onClick: () => setShowUserDropdown(!showUserDropdown),
        className: 'w-full flex items-center gap-3 px-3 py-3 rounded-2xl hover:bg-white/5 transition-all'
      },
        React.createElement('div', { className: 'w-9 h-9 rounded-full bg-gradient-to-br from-cyan-400/80 to-blue-500 ring-2 ring-white/20 flex-shrink-0 overflow-hidden' },
          user?.avatar ? React.createElement('img', { src: user.avatar, alt: '', className: 'w-full h-full object-cover' }) : React.createElement('div', { className: 'w-full h-full bg-white/10 flex items-center justify-center text-cyan-300 text-sm font-semibold' }, user?.name?.[0] || 'U')
        ),
        !isCollapsed && React.createElement('div', { className: 'flex-1 min-w-0 text-left' },
          React.createElement('div', { className: 'font-medium text-sm text-white truncate' }, user?.name || 'Creator'),
          React.createElement('div', { className: 'text-[11px] text-white/50 truncate' }, user?.email || 'user@novaforge.ai')
        )
      ),

      React.createElement(AnimatePresence, {},
        showUserDropdown && React.createElement(motion.div, {
          initial: { opacity: 0, y: 8, scale: 0.96 },
          animate: { opacity: 1, y: 0, scale: 1 },
          exit: { opacity: 0, y: 8, scale: 0.96 },
          className: `absolute bottom-[72px] ${isCollapsed ? 'left-20' : 'left-4 right-4'} bg-[#111114] border border-white/10 rounded-2xl shadow-2xl py-1.5 z-50 glassmorphism`
        },
          React.createElement(Link, { to: '/profile', className: 'block px-4 py-2.5 text-sm hover:bg-white/5 text-white/80 hover:text-white' }, 'View Profile'),
          React.createElement(Link, { to: '/settings', className: 'block px-4 py-2.5 text-sm hover:bg-white/5 text-white/80 hover:text-white' }, 'Account Settings'),
          React.createElement('div', { className: 'h-px bg-white/10 my-1' }),
          React.createElement('button', {
            onClick: onLogout,
            className: 'w-full px-4 py-2.5 text-sm text-left text-red-400 hover:bg-white/5 hover:text-red-300'
          }, 'Sign out')
        )
      )
    )
  );
}

module.exports = Sidebar;