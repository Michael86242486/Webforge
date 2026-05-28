import React { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const Projects = () => {
  const [projects, setProjects] = useState([
    { id:1, name: "NovaAI Core", description: "AI-powered code generation engine", status: "active", lastUpdated: "2024-06-12", framework: "React + Vite", previewUrl: "https://demo.novaforge.ai/novaai", health: 98 },
    { id: 2, name: "ForgeStudio", description: "Collaborative design platform", status: "active", lastUpdated: "2024-06-11", framework: "Next.js", previewUrl: "https://demo.novaforge.ai/forge", health: 95 },
    { id: 3, name: "LaunchPad", description: "Startup landing page generator", status: "archived", lastUpdated: "2024-05-28", framework: "Vite", previewUrl: "https://demo.novaforge.ai/launch", health: 87 },
    { id: 4, name: "QuantumChat", description: "Real-time AI conversation UI", status: "active", lastUpdated: "2024-06-10", framework: "React", previewUrl: "https://demo.novaforge.ai/quantum", health: 92 },
  ]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('updated');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newProject, setNewProject] = useState({ name: '', description: '', framework: 'React + Vite' });
  const [toasts, setToasts] = useState([]);

  const addToast = (message, type = 'success') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000);
  };

  const filteredProjects = projects
    .filter(p => 
      (p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
       p.description.toLowerCase().includes(searchTerm.toLowerCase())) &&
      (statusFilter === 'all' || p.status === statusFilter)
    )
    .sort((a, b) => {
      if (sortBy === 'updated') return new Date(b.lastUpdated) - new Date(a.lastUpdated);
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'health') return b.health - a.health;
      return 0;
    });

  const handleCreateProject = () => {
    if (!newProject.name.trim()) return;
    const project = {
      id: Date.now(),
      name: newProject.name,
      description: newProject.description || "New AI-powered project",
      status: "active",
      lastUpdated: new Date().toISOString().split('T')[0],
      framework: newProject.framework,
      previewUrl: `https://demo.novaforge.ai/${newProject.name.toLowerCase().replace(/\s+/g, '')}`,
      health: 100
    };
    setProjects(prev => [project, ...prev]);
    setShowCreateModal(false);
    setNewProject({ name: '', description: '', framework: 'React + Vite' });
    addToast('Project created successfully', 'success');
  };

  const handleDelete = (id) => {
    setProjects(prev => prev.filter(p => p.id !== id));
    addToast('Project deleted', 'warning');
  };

  const handleOpenPreview = (project) => {
    window.open(project.previewUrl, '_blank');
    addToast(`Opening live preview for ${project.name}`);
  };

  const handleOpenWorkspace = (project) => {
    window.location.href = `/ai-workspace?project=${project.id}`;
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8">
          <div>
            <h1 className="text-5xl font-bold tracking-tighter bg-gradient-to-r from-white to-cyan-400 bg-clip-text text-transparent">Projects</h1>
            <p className="text-gray-400 mt-2 text-lg">Manage all your AI-generated startups</p>
          </div>
          <button 
            onClick={() => setShowCreateModal(true)}
            className="mt-4 md:mt-0 px-8 py-3 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-xl font-semibold flex items-center gap-2 hover:brightness-110 transition-all active:scale-[0.985]"
          >
            + New Project
          </button>
        </div>

        {/* Controls */}
        <div className="flex flex-col lg:flex-row gap-4 mb-8">
          <input
            type="text"
            placeholder="Search projects..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1 px-6 py-3 bg-white/5 border border-white/10 rounded-2xl focus:outline-none focus:border-cyan-500/50 placeholder:text-gray-500"
          />
          <select 
            value={statusFilter} 
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-6 py-3 bg-white/5 border border-white/10 rounded-2xl text-white focus:outline-none"
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="archived">Archived</option>
          </select>
          <select 
            value={sortBy} 
            onChange={(e) => setSortBy(e.target.value)}
            className="px-6 py-3 bg-white/5 border border-white/10 rounded-2xl text-white focus:outline-none"
          >
            <option value="updated">Sort by Updated</option>
            <option value="name">Sort by Name</option>
            <option value="health">Sort by Health</option>
          </select>
        </div>

        {/* Project Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          <AnimatePresence>
            {filteredProjects.map((project, index) => (
              <motion.div 
                key={project.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ delay: index * 0.03 }}
                whileHover={{ scale: 1.015, y: -4 }}
                className="group relative bg-white/[0.025] border border-white/10 rounded-3xl overflow-hidden backdrop-blur-xl hover:border-cyan-500/30 transition-all"
              >
                {/* Preview Thumbnail */}
                <div className="h-48 bg-gradient-to-br from-[#111] to-black relative flex items-center justify-center overflow-hidden">
                  <div className="absolute inset-0 bg-[radial-gradient(#ffffff10_1px,transparent_1px)] bg-[length:4px_4px]"></div>
                  <div className="text-center z-10">
                    <div className="text-6xl mb-3 opacity-75">🚀</div>
                    <div className="text-sm font-mono tracking-[3px] text-cyan-400">{project.framework}</div>
                  </div>
                  <div className="absolute top-4 right-4 px-3 py-1 text-xs rounded-full bg-black/60 border border-white/10">
                    {project.health}% healthy
                  </div>
                </div>

                <div className="p-6">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h3 className="font-semibold text-2xl tracking-tight">{project.name}</h3>
                      <p className="text-gray-400 text-sm mt-1 line-clamp-2">{project.description}</p>
                    </div>
                    <span className={`text-xs px-3 py-1 rounded-full font-medium uppercase tracking-widest ${project.status === 'active' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-white/10 text-gray-400'}`}>
                      {project.status}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs text-gray-500 mt-6 mb-6">
                    <div>Updated {project.lastUpdated}</div>
                    <div>{project.framework}</div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-3">
                    <button 
                      onClick={() => handleOpenWorkspace(project)}
                      className="flex-1 py-3 text-sm font-medium bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl transition-all active:bg-white/5"
                    >
                      Open Workspace
                    </button>
                    <button 
                      onClick={() => handleOpenPreview(project)}
                      className="flex-1 py-3 text-sm font-medium bg-gradient-to-r from-cyan-500/90 to-blue-600/90 hover:brightness-110 rounded-2xl transition-all"
                    >
                      Live Preview
                    </button>
                    <button 
                      onClick={() => handleDelete(project.id)}
                      className="px-5 py-3 text-sm font-medium bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-2xl transition-all"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {filteredProjects.length === 0 && (
          <div className="text-center py-20 text-gray-500">No projects found matching your filters.</div>
        )}
      </div>

      {/* Create Modal */}
      <AnimatePresence>
        {showCreateModal && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur flex items-center justify-center z-50 p-6" onClick={() => setShowCreateModal(false)}>
            <motion.div 
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              className="bg-[#111113] border border-white/10 rounded-3xl p-9 w-full max-w-md"
              onClick={e => e.stopPropagation()}
            >
              <h3 className="text-3xl font-semibold mb-6">Create New Project</h3>
              <input 
                type="text" placeholder="Project name" value={newProject.name} 
                onChange={e => setNewProject({...newProject, name: e.target.value})}
                className="w-full px-5 py-3.5 bg-white/5 border border-white/10 rounded-2xl mb-3 focus:border-cyan-500 outline-none"
              />
              <input 
                type="text" placeholder="Description" value={newProject.description} 
                onChange={e => setNewProject({...newProject, description: e.target.value})}
                className="w-full px-5 py-3.5 bg-white/5 border border-white/10 rounded-2xl mb-3 focus:border-cyan-500 outline-none"
              />
              <select value={newProject.framework} onChange={e => setNewProject({...newProject, framework: e.target.value})} className="w-full px-5 py-3.5 bg-white/5 border border-white/10 rounded-2xl mb-8">
                <option>React + Vite</option>
                <option>Next.js</option>
                <option>Vue + Vite</option>
              </select>
              <div className="flex gap-3">
                <button onClick={() => setShowCreateModal(false)} className="flex-1 py-3.5 border border-white/10 rounded-2xl">Cancel</button>
                <button onClick={handleCreateProject} className="flex-1 py-3.5 bg-cyan-600 hover:bg-cyan-500 rounded-2xl font-medium">Create Project</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Toasts */}
      <div className="fixed bottom-6 right-6 space-y-3 z-[60]">
        {toasts.map(toast => (
          <div key={toast.id} className={`px-6 py-3 rounded-2xl shadow-xl flex items-center gap-3 text-sm border ${toast.type === 'success' ? 'bg-emerald-950 border-emerald-800' : 'bg-orange-950 border-orange-800'}`}>
            {toast.message}
          </div>
        ))}
      </div>
    </div>
  );
};

export default Projects;