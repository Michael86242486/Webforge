import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../hooks/useAuth';

const Settings = () => {
  const [activeTab, setActiveTab] = useState('account');
  const { theme, toggleTheme, accentColor, setAccentColor } = useTheme();
  const { user, updateProfile } = useAuth();

  const [accountData, setAccountData] = useState({
    name: user?.name || 'Alex Rivera',
    email: user?.email || 'alex@novaforge.ai',
    bio: user?.bio || 'Building the future with AI',
    avatar: user?.avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=Alex'
  });

  const [preferences, setPreferences] = useState({
    emailNotifications: true,
    pushNotifications: true,
    weeklyDigest: false,
    aiSuggestions: true,
    autoSave: true
  });

  const [notifications, setNotifications] = useState([
    { id: 1, type: 'project', message: 'Project "NovaAI" completed', time: '2h ago', read: false },
    { id: 2, type: 'ai', message: 'New AI model available', time: '1d ago', read: true },
    { id: 3, type: 'billing', message: 'Invoice #4821 paid', time: '3d ago', read: true }
  ]);

  const [billingData, setBillingData] = useState({
    plan: 'Pro',
    nextBilling: 'March 15, 2025',
    cardLast4: '4242',
    usage: { projects: 47, generations: 1240 }
  });

  const tabs = [
    { id: 'account', label: 'Account', icon: '👤' },
    { id: 'preferences', label: 'Preferences', icon: '⚙️' },
    { id: 'notifications', label: 'Notifications', icon: '🔔' },
    { id: 'billing', label: 'Billing', icon: '💳' }
  ];

  const handleAccountSave = (e) => {
    e.preventDefault();
    updateProfile(accountData);
    const toast = document.createElement('div');
    toast.className = 'fixed bottom-4 right-4 bg-cyan-500 text-black px-6 py-3 rounded-xl font-medium shadow-lg';
    toast.textContent = 'Profile updated successfully!';
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  };

  const handlePreferenceChange = (key) => {
    setPreferences(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const markNotificationRead = (id) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  };

  const handleBillingUpgrade = () => {
    alert('Redirecting to Stripe checkout... (Demo)');
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white p-8">
      <div className="max-w-5xl mx-auto">
        <div className="mb-10">
          <h1 className="text-5xl font-bold tracking-tighter mb-3">Settings</h1>
          <p className="text-xl text-white/60">Manage your account and preferences</p>
        </div>

        <div className="flex gap-3 mb-8 border-b border-white/10 pb-1">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-3 px-8 py-4 rounded-t-2xl font-medium transition-all text-lg ${activeTab === tab.id
                  ? 'bg-white/5 text-white border-b-2 border-cyan-400'
                  : 'text-white/60 hover:text-white hover:bg-white/5'
                }`}
            >
              <span>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>

        <div className="glass rounded-3xl p-10 border border-white/10">
          {activeTab === 'account' && (
            <form onSubmit={handleAccountSave} className="space-y-8">
              <div className="flex items-center gap-8">
                <div className="relative">
                  <img src={accountData.avatar} alt="Avatar" className="w-28 h-28 rounded-2xl ring-2 ring-cyan-500/30" />
                  <button type="button" className="absolute bottom-2 right-2 bg-zinc-900 px-3 py-1 text-xs rounded-full border border-white/20">Change</button>
                </div>
                <div>
                  <div className="text-3xl font-semibold">{accountData.name}</div>
                  <div className="text-cyan-400">Pro Member • Joined Jan 2024</div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm mb-2 text-white/70">Full Name</label>
                  <input type="text" value={accountData.name} onChange={(e) => setAccountData({ ...accountData, name: e.target.value })} className="w-full bg-white/5 border border-white/10 px-5 py-4 rounded-2xl focus:outline-none focus:border-cyan-500" />
                </div>
                <div>
                  <label className="block text-sm mb-2 text-white/70">Email Address</label>
                  <input type="email" value={accountData.email} onChange={(e) => setAccountData({ ...accountData, email: e.target.value })} className="w-full bg-white/5 border border-white/10 px-5 py-4 rounded-2xl" />
                </div>
              </div>

              <div>
                <label className="block text-sm mb-2 text-white/70">Bio</label>
                <textarea value={accountData.bio} onChange={(e) => setAccountData({ ...accountData, bio: e.target.value })} rows={3} className="w-full bg-white/5 border border-white/10 px-5 py-4 rounded-3xl resize-y" />
              </div>

              <button type="submit" className="px-10 py-4 bg-white text-black font-semibold rounded-2xl hover:bg-white/90 transition-all active:scale-[0.985]">Save Changes</button>
            </form>
          )}

          {activeTab === 'preferences' && (
            <div>
              <div className="mb-8">
                <div className="text-xl mb-5 font-medium">Appearance</div>
                <div className="flex gap-4">
                  <button onClick={toggleTheme} className={`flex-1 glass p-6 rounded-3xl border flex items-center justify-center gap-3 transition-all ${theme === 'dark' ? 'border-cyan-400 bg-cyan-950/30' : 'border-white/10'}`}>
                    🌙 Dark Mode
                  </button>
                  <button onClick={() => setAccentColor(accentColor === '#22d3ee' ? '#a855f7' : '#22d3ee')} className="flex-1 glass p-6 rounded-3xl border border-white/10 hover:border-white/30">
                    Accent: {accentColor}
                  </button>
                </div>
              </div>

              <div>
                <div className="text-xl mb-5 font-medium">Workspace</div>
                {Object.keys(preferences).map(key => (
                  <div key={key} onClick={() => handlePreferenceChange(key)} className="flex items-center justify-between py-5 border-b border-white/10 cursor-pointer hover:bg-white/5 px-2 rounded-xl">
                    <div className="capitalize">{key.replace(/([A-Z])/g, ' $1')}</div>
                    <div className={`w-12 h-7 rounded-full ${preferences[key] ? 'bg-cyan-400' : 'bg-white/20'} relative transition-all`}>
                      <div className={`absolute top-0.5 h-6 w-6 bg-white rounded-full shadow transition-all ${preferences[key] ? 'left-6' : 'left-0.5'}`} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'notifications' && (
            <div className="space-y-4">
              {notifications.map(n => (
                <div key={n.id} onClick={() => markNotificationRead(n.id)} className={`glass p-7 rounded-3xl flex justify-between items-center cursor-pointer border ${n.read ? 'border-white/10' : 'border-cyan-400/60'}`}>
                  <div>
                    <div className="font-medium">{n.message}</div>
                    <div className="text-sm text-white/60 mt-1">{n.time}</div>
                  </div>
                  {!n.read && <div className="px-4 py-1 text-xs rounded-full bg-cyan-400 text-black font-medium">NEW</div>}
                </div>
              ))}
            </div>
          )}

          {activeTab === 'billing' && (
            <div className="space-y-10">
              <div className="glass p-9 rounded-3xl">
                <div className="flex justify-between items-center mb-8">
                  <div>
                    <div className="text-4xl font-semibold tracking-tight">{billingData.plan} Plan</div>
                    <div className="text-white/70">Next billing: {billingData.nextBilling}</div>
                  </div>
                  <button onClick={handleBillingUpgrade} className="px-9 py-4 bg-gradient-to-r from-cyan-400 to-blue-500 text-black rounded-2xl font-semibold">Upgrade</button>
                </div>
                <div className="text-sm text-white/60">Card ending in {billingData.cardLast4}</div>
              </div>

              <div>
                <div className="font-medium mb-4">Usage this month</div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="glass p-7 rounded-3xl"><div className="text-4xl font-semibold">{billingData.usage.projects}</div><div className="text-white/60">Projects</div></div>
                  <div className="glass p-7 rounded-3xl"><div className="text-4xl font-semibold">{billingData.usage.generations}</div><div className="text-white/60">AI Generations</div></div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Settings;