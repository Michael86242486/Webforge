import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';

const = () => {
  const [stats] = useState([
    { label: 'Active Projects', value: 24, change: '+4', color: 'from-cyan-500 to-blue-500' },
    { label: 'AI Generations', value: 1248, change: '+187', color: 'from-purple-500 to-pink-500' },
    { label: 'Team Members', value: 8, change: '+2', color: 'from-emerald-500 to-teal-500' },
    { label: 'Deployments', value: 156, change: '+31', color: 'from-orange-500 to-amber-500' }
  ]);

  const [recentProjects, setRecentProjects] = useState([
    { id: 1, name: 'NovaAI Landing', status: 'Live', progress: 100, updated: '2h ago', type: 'React' },
    { id: 2, name: 'Creator Studio', status: 'Building', progress: 78, updated: '5h ago', type: 'Vite' },
    { id: 3, name: 'Forge Marketplace', status: 'Draft', progress: 34, updated: '1d ago', type: 'Next.js' },
    { id: 4, name: 'Agent SDK', status: 'Live', progress: 100, updated: '3d ago', type: 'Node' }
  ]);

  const [quickActions] = useState([
    { icon: '🚀', label: 'New Project', action: 'project' },
    { icon: '🤖', label: 'Start AI Session', action: 'ai' },
    { icon: '📊', label: 'View Analytics', action: 'analytics' },
    { icon: '👥', label: 'Invite Team', action: 'invite' }
  ]);

  const [draggedIndex, setDraggedIndex] = useState(null);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');

  const showNotification = (message) => {
    setToastMessage(message);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 2800);
  };

  const handleDragStart = (index) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;

    const newProjects = [...recentProjects];
    const draggedItem = newProjects[draggedIndex];
    newProjects.splice(draggedIndex, 1);
    newProjects.splice(index, 0, draggedItem);

    setRecentProjects(newProjects);
    setDraggedIndex(index);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    showNotification('Project order updated successfully');
  };

  const handleQuickAction = (action) => {
    if (action === 'project') {
      setShowCreateModal(true);
    } else if (action === 'ai') {
      window.location.href = '/ai-workspace';
    } else {
      showNotification(`${action.charAt(0).toUpperCase() + action.slice(1)} opened`);
    }
  };

  const createProject = () => {
    if (!newProjectName.trim()) return;
    
    const newProj = {
      id: Date.now(),
      name: newProjectName,
      status: 'Draft',
      progress: 12,
      updated: 'Just now',
      type: 'React'
    };
    
    setRecentProjects([newProj, ...recentProjects]);
    setNewProjectName('');
    setShowCreateModal(false);
    showNotification('New project created successfully');
  };

  const deleteProject = (id) => {
    setRecentProjects(recentProjects.filter(p => p.id !== id));
    showNotification('Project removed');
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-10">
          <div>
            <h1 className="text-5xl font-semibold tracking-tight">Good morning, Alex.</h1>
            <p className="text-xl text-gray-400 mt-2">Here's what's happening with your startups today.</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="px-4 py-2 bg-white/5 rounded-2xl border border-white/10 flex items-center gap-2">
              <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></div>
              <span className="text-sm text-emerald-400">All systems operational</span>
            </div>
            <Link to="/ai-workspace" className="px-6 py-3 bg-white text-black rounded-2xl font-medium flex items-center gap-2 hover:bg-white/90 transition-all">
              Open AI Workspace
            </Link>
          </div>
        </div>

        {/* Stats Widgets */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
          {stats.map((stat, index) => (
            <motion.div
              key={index}
              whileHover={{ y: -4, scale: 1.01 }}
              className="glass rounded-3xl p-7 border border-white/10 bg-white/[0.02]"
            >
              <div className={`inline-block px-4 py-1 rounded-full bg-gradient-to-r ${stat.color} text-xs font-medium mb-5`}>
                {stat.change} this week
              </div>
              <div className="text-6xl font-semibold tabular-nums tracking-tighter mb-1">{stat.value}</div>
              <div className="text-gray-400 text-lg">{stat.label}</div>
            </motion.div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Recent Projects - Drag & Drop */}
          <div className="lg:col-span-2 glass rounded-3xl p-8 border border-white/10 bg-white/[0.015]">
            <div className="flex justify-between items-center mb-8">
              <div>
                <h2 className="text-2xl font-semibold">Recent Projects</h2>
                <p className="text-gray-400">Drag to reorder • {recentProjects.length} projects</p>
              </div>
              <button onClick={() => setShowCreateModal(true)} className="text-sm px-5 py-2.5 bg-white/10 hover:bg-white/20 rounded-2xl flex items-center gap-2 transition-colors">
                + New Project
              </button>
            </div>

            <div className="space-y-3">
              <AnimatePresence>
                {recentProjects.map((project, index) => (
                  <motion.div
                    key={project.id}
                    draggable
                    onDragStart={() => handleDragStart(index)}
                    onDragOver={(e) => handleDragOver(e, index)}
                    onDragEnd={handleDragEnd}
                    whileHover={{ scale: 1.005 }}
                    className={`group flex items-center justify-between p-5 bg-white/[0.03] hover:bg-white/[0.06] border border-white/10 rounded-2xl cursor-grab active:cursor-grabbing transition-all ${draggedIndex === index ? 'opacity-50' : ''}`}
                  >
                    <div className="flex items-center gap-5">
                      <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-cyan-400/20 to-blue-500/20 flex items-center justify-center text-xl">
                        {project.type === 'React' ? '⚛️' : project.type === 'Vite' ? '⚡' : '📦'}
                      </div>
                      <div>
                        <div className="font-medium text-lg">{project.name}</div>
                        <div className="text-sm text-gray-400 flex items-center gap-2">
                          {project.type} • Updated {project.updated}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-6">
                      <div className="w-32">
                        <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-cyan-400 to-blue-500 transition-all" style={{ width: `${project.progress}%` }} />
                        </div>
                        <div className="text-xs text-right mt-1 text-gray-400">{project.progress}%</div>
                      </div>
                      <div className={`px-4 py-1 text-xs font-medium rounded-full ${project.status === 'Live' ? 'bg-emerald-500/20 text-emerald-400' : project.status === 'Building' ? 'bg-amber-500/20 text-amber-400' : 'bg-white/10 text-gray-400'}`}>
                        {project.status}
                      </div>
                      <button onClick={() => deleteProject(project.id)} className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-500 px-3 transition-all">×</button>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="glass rounded-3xl p-8 border border-white/10 bg-white/[0.015]">
            <h2 className="text-2xl font-semibold mb-6">Quick Actions</h2>
            <div className="grid grid-cols-1 gap-3">
              {quickActions.map((action, index) => (
                <motion.button
                  key={index}
                  whileHover={{ scale: 1.015 }}
                  whileTap={{ scale: 0.985 }}
                  onClick={() => handleQuickAction(action.action)}
                  className="flex items-center gap-4 p-5 bg-white/[0.03] hover:bg-white/[0.07] border border-white/10 rounded-2xl text-left transition-all group"
                >
                  <div className="text-4xl">{action.icon}</div>
                  <div>
                    <div className="font-medium text-lg group-hover:text-cyan-400 transition-colors">{action.label}</div>
                    <div className="text-sm text-gray-400">Instant action</div>
                  </div>
                </motion.button>
              ))}
            </div>

            {/* Activity Feed */}
            <div className="mt-8 pt-8 border-t border-white/10">
              <h3 className="font-medium mb-4">Latest Activity</h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between text-gray-400"><span>AI generated new landing page</span><span>12m ago</span></div>
                <div className="flex justify-between text-gray-400"><span>Deployment completed</span><span>47m ago</span></div>
                <div className="flex justify-between text-gray-400"><span>Team member joined</span><span>2h ago</span></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Create Modal */}
      <AnimatePresence>
        {showCreateModal && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur flex items-center justify-center z-50" onClick={() => setShowCreateModal(false)}>
            <motion.div initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.96, opacity: 0 }} onClick={e => e.stopPropagation()} className="glass p-9 rounded-3xl border border-white/20 w-full max-w-md">
              <h3 className="text-2xl font-semibold mb-6">Create New Project</h3>
              <input type="text" value={newProjectName} onChange={(e) => setNewProjectName(e.target.value)} placeholder="Project name" className="w-full bg-white/5 border border-white/20 rounded-2xl px-6 py-4 text-lg placeholder:text-gray-500 mb-5 focus:outline-none focus:border-cyan-500" />
              <div className="flex gap-3">
                <button onClick={() => setShowCreateModal(false)} className="flex-1 py-4 rounded-2xl border border-white/20">Cancel</button>
                <button onClick={createProject} className="flex-1 py-4 bg-white text-black rounded-2xl font-medium">Create Project</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Toast */}
      <AnimatePresence>
        {showToast && (
          <motion.div initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }} className="fixed bottom-8 left-1/2 -translate-x-1/2 px-8 py-3.5 bg-zinc-900 border-white/10 rounded-2xl flex items-center gap-3 shadow-xl">
            <div className="w-2 h-2 bg-cyan-400 rounded-full"></div>
            {toastMessage}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Dashboard;