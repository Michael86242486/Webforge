import React from 'react';
import { motion } from 'amer-motion';
import { Link } from 'react-router-dom';

const Home = () => {
  const stats = [
    { number: '47K', label: 'Creators Building', icon: '🚀' },
    { number: '128K', label: 'Projects Launched', icon: '✨' },
    { number: '94%', label: 'Success Rate', icon: '📈' },
    { number: '2.4M', label: 'AI Generations', icon: '🤖' }
  ];

  const features = [
    {
      title: 'AI-Powered Ideation',
      desc: 'Transform vague ideas into complete startup blueprints with NovaForge\'s advanced reasoning engine.',
      icon: '🧠'
    },
    {
      title: 'Instant Full-Stack Scaffolding',
      desc: 'Generate production-ready React, Node, and database schemas in seconds.',
      icon: '⚡'
    },
    {
      title: 'Live Autonomous Previews',
      desc: 'Watch your project compile, install dependencies, and run live with automatic error recovery.',
      icon: '🔄'
    },
    {
      title: 'Collaborative AI Workspace',
      desc: 'Real-time chat with your AI agent that writes code, debugs, and iterates alongside you.',
      icon: '💬'
    }
  ];

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white overflow-hidden">
      {/* Hero Section */}
      <div className="relative pt-20 pb-24 px-6">
        <div className="max-w-5xl mx-auto text-center">
          <div className="inline-flex items-center px-4 py-1.5 rounded-full bg-white/5 border border-white/10 mb-6">
            <div className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse mr-2"></div>
            <span className="text-sm text-cyan-400 font-medium">Now with GPT-4o + Claude 3.5</span>
          </div>

          <h1 className="text-7xl md:text-8xl font-bold tracking-tighter mb-6">
            Build the next<br />
            <span className="bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-500 bg-clip-text text-transparent">
              unicorn startup
            </span>
          </h1>
          
          <p className="max-w-2xl mx-auto text-xl text-white/70 mb-10">
            NovaForge is the AI co-founder that turns your vision into a fully functional, 
            investor-ready product in hours instead of months.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link 
              to="/register" 
              className="px-9 py-4 bg-white text-black font-semibold rounded-2xl hover:bg-white/90 transition-all flex items-center justify-center gap-2 group"
            >
              Start Building Free
              <span className="group-hover:translate-x-1 transition">→</span>
            </Link>
            <Link 
              to="/ai-workspace" 
              className="px-9 py-4 bg-white/5 border border-white/20 hover:bg-white/10 font-semibold rounded-2xl transition-all flex items-center justify-center gap-2"
            >
              Watch Demo
            </Link>
          </div>
          <p className="text-xs text-white/40 mt-4">No credit card required • 14-day free trial</p>
        </div>
      </div>

      {/* Animated Stats */}
      <div className="border-y border-white/10 bg-black/30 py-8">
        <div className="max-w-6xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-8">
          {stats.map((stat, index) => (
            <motion.div 
              key={index}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className="text-center"
            >
              <div className="text-4xl mb-1">{stat.icon}</div>
              <div className="text-5xl font-semibold tracking-tighter text-cyan-400">{stat.number}</div>
              <div className="text-sm text-white/60 mt-1">{stat.label}</div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Feature Highlights */}
      <div className="max-w-6xl mx-auto px-6 py-24">
        <div className="text-center mb-14">
          <div className="text-cyan-400 text-sm tracking-[3px] font-medium mb-3">POWERED BY AUTONOMOUS AGENTS</div>
          <h2 className="text-5xl font-bold tracking-tight">Everything you need to ship</h2>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {features.map((feature, index) => (
            <motion.div 
              key={index}
              whileHover={{ y: -4 }}
              className="glass group p-9 rounded-3xl border border-white/10 hover:border-cyan-500/30 transition-all bg-white/[0.02]"
            >
              <div className="text-4xl mb-6">{feature.icon}</div>
              <h3 className="text-2xl font-semibold mb-3 tracking-tight">{feature.title}</h3>
              <p className="text-white/70 leading-relaxed">{feature.desc}</p>
              <div className="mt-6 text-cyan-400 text-sm flex items-center gap-1 group-hover:gap-2 transition-all cursor-pointer">
                Learn more <span>→</span>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Final CTA */}
      <div className="border-t border-white/10 py-20 px-6 bg-black/40">
        <div className="max-w-xl mx-auto text-center">
          <h3 className="text-4xl font-semibold tracking-tight mb-4">Ready to launch your idea?</h3>
          <p className="text-white/60 mb-8">Join thousands of creators building the future with NovaForge.</p>
          <Link 
            to="/register" 
            className="inline-block px-10 py-4 bg-gradient-to-r from-cyan-400 to-blue-500 text-black font-semibold rounded-2xl hover:brightness-105 transition"
          >
            Create Your First Project
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Home;