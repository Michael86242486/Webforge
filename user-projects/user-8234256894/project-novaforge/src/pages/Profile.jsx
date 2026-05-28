import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../hooks/useAuth';
import Toast from '..//Toast';

const Profile = () {
  const { user, updateProfile } = useAuth();
  const [formData, setFormData] = useState({
    name: user?.name || ' Rivera',
    email: user?.email || 'alex@novaforge',
    bio: user?.bio || 'Building the future with AI. Creator of 12 startups. Currently exploring autonomous agents.',
    twitter: user?.twitter || '@arivera',
    github: user?.github || 'arivera',
    linkedin: user?.linkedin || 'alexrivera'
  });
  const [avatar, setAvatar] = useState(user?.avatar || 'https://i.pravatar.cc/150?img=68');
  const [isUploading, setIsUploading] = useState(false);
  const [toast, setToast] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleAvatarUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsUploading(true);
    
    // Simulate upload with FileReader for live preview
    const reader = new FileReader();
    reader.onload = (event) => {
      setAvatar(event.target.result);
      setIsUploading(false);
      setToast({ type: 'success', message: 'Avatar updated successfully!' });
      setTimeout(() => setToast(null), 3000);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSaving(true);

    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 800));
    
    const success = updateProfile({ ...formData, avatar });
    
    if (success) {
      setToast({ type: 'success', message: 'Profile updated successfully!' });
    } else {
      setToast({ type: 'error', message: 'Failed to update profile. Please try again.' });
    }
    
    setIsSaving(false);
    setTimeout(() => setToast(null), 3000);
  };

  const socialPlatforms = [
    { key: 'twitter', label: 'Twitter', icon: '𝕏', prefix: 'https://twitter.com/' },
    { key: 'github', label: 'GitHub', icon: '⚙', prefix: 'https://github.com/' },
    { key: 'linkedin', label: 'LinkedIn', icon: 'in', prefix: 'https://linkedin.com/in/' }
  ];

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-10">
          <h1 className="text-5xl font-bold tracking-tighter bg-gradient-to-r from-white via-cyan-200 to-white bg-clip-text text-transparent">
            Profile Settings
          </h1>
          <p className="text-xl text-gray-400 mt-3">Manage your public presence and account details</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Avatar Card */}
          <div className="lg:col-span-1">
            <div className="glassmorphism p-8 rounded-3xl border border-white/10">
              <div className="flex flex-col items-center text-center">
                <div className="relative mb-6">
                  <div className="w-40 h-40 rounded-full overflow-hidden ring-4 ring-cyan-500/30 ring-offset-4 ring-offset-[#0a0a0f]">
                    <img 
                      src={avatar} 
                      alt="Profile" 
                      className="w-full h-full object-cover" 
                    />
                  </div>
                  <label className="absolute bottom-2 right-2 cursor-pointer">
                    <div className="bg-cyan-600 hover:bg-cyan-500 transition-colors p-3 rounded-full shadow-lg">
                      {isUploading ? (
                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2 2 2 0 01-2-2 2 2 0 012-2 2 2 0 01-2-2 2 2 0 012-2m14 0a2 2 0 01-2 2 2 2 0 01-2 2 2 2 0 01-2-2 2 2 0 01-2-2" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      )}
                    </div>
                    <input type="file" accept="image/*" onChange={handleAvatarUpload} className="hidden" />
                  </label>
                </div>
                <h3 className="text-2xl font-semibold">{formData.name}</h3>
                <p className="text-cyan-400 mt-1">Pro Creator • 42 projects</p>
              </div>
            </div>
          </div>

          {/* Main Form */}
          <div className="lg:col-span-2">
            <form onSubmit={handleSubmit} className="glassmorphism p-9 rounded-3xl border border-white/10 space-y-8">
              <div>
                <label className="block text-sm uppercase tracking-[2px] text-cyan-400 mb-2">Full Name</label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  className="w-full bg-white/5 border border-white/10 focus:border-cyan-500 rounded-2xl px-6 py-4 text-lg outline-none transition-all"
                />
              </div>

              <div>
                <label className="block text-sm uppercase tracking-[2px] text-cyan-400 mb-2">Email Address</label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  className="w-full bg-white/5 border border-white/10 focus:border-cyan-500 rounded-2xl px-6 py-4 text-lg outline-none transition-all"
                />
              </div>

              <div>
                <label className="block text-sm uppercase tracking-[2px] text-cyan-400 mb-2">Bio</label>
                <textarea
                  name="bio"
                  value={formData.bio}
                  onChange={handleInputChange}
                  rows={4}
                  className="w-full bg-white/5 border border-white/10 focus:border-cyan-500 rounded-3xl px-6 py-4 text-lg resize-y outline-none transition-all"
                />
              </div>

              {/* Social Links */}
              <div>
                <label className="block text-sm uppercase tracking-[2px] text-cyan-400 mb-4">Social Links</label>
                <div className="space-y-4">
                  {socialPlatforms.map((platform) => (
                    <div key={platform.key} className="flex items-center gap-4">
                      <div className="w-12 h-12 flex items-center justify-center bg-white/5 rounded-2xl text-xl border border-white/10">
                        {platform.icon}
                      </div>
                      <div className="flex-1">
                        <input
                          type="text"
                          name={platform.key}
                          value={formData[platform.key]}
                          onChange={handleInputChange}
                          placeholder={platform.label}
                          className="w-full bg-white/5 border border-white/10 focus:border-cyan-500 rounded-2xl px-5 py-3.5 outline-none transition-all"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <motion.button
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.985 }}
                type="submit"
                disabled={isSaving}
                className="w-full py-5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 rounded-2xl font-semibold text-xl tracking-tight transition-all disabled:opacity-70 flex items-center justify-center gap-3"
              >
                {isSaving ? (
                  <>Saving Changes <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /></>
                ) : 'Save Profile'}
              </motion.button>
            </form>
          </div>
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-8 right-8 z-50">
          <Toast type={toast.type} message={toast.message} onClose={() => setToast(null)} />
        </div>
      )}
    </div>
  );
};

export default Profile;