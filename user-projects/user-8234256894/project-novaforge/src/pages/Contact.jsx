import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';

const Contact = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    subject: '',
    message: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errors, setErrors] = useState({});

  const validateForm = () => {
    const newErrors = {};
    if (!formData.name.trim()) newErrors.name = 'Name is required';
    if (!formData.email.trim()) newErrors.email = 'Email is required';
    else if (!/\S+@\S+\.\S+/.test(formData.email)) newErrors.email = 'Email is invalid';
    if (!formData.subject.trim()) newErrors.subject = 'Subject is required';
    if (!formData.message.trim()) newErrors.message = 'Message is required';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    setIsSubmitting(true);

    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1500));

    // In production would POST to /api/contact
    console.log('Contact form submitted:', formData);

    setIsSubmitting(false);
    setSubmitted(true);

    // Reset form after success
    setTimeout(() => {
      setFormData({ name: '', email: '', subject: '', message: '' });
      setSubmitted(false);
      // Show toast via global or navigate
      navigate('/dashboard', { state: { toast: 'Message sent successfully!' } });
    }, 2000);
  };

  const inputClasses = "w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/40 focus:outline-none focus:border-[#00f5ff] focus:ring-1 focus:ring-[#00f5ff]/50 transition-all duration-200 backdrop-blur-sm";

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white pt-20 pb-16">
      <div className="max-w-4xl mx-auto px-6">
        {/* Header */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 mb-6">
            <div className="w-2 h-2 bg-[#00f5ff] rounded-full animate-pulse" />
            <span className="text-sm text-white/60">We're here to help</span>
          </div>
          <h1 className="text-6xl font-semibold tracking-tighter mb-4">Get in touch</h1>
          <p className="text-xl text-white/60 max-w-md mx-auto">
            Have questions about NovaForge? Our team typically responds within 2 hours.
          </p>
        </div>

        <div className="grid md:grid-cols-5 gap-8">
          {/* Contact Info */}
          <div className="md:col-span-2 space-y-8">
            <div className="glass rounded-3xl p-8 border border-white/10">
              <h3 className="font-semibold text-lg mb-6">Reach us directly</h3>
              <div className="space-y-6 text-sm">
                <div>
                  <div className="text-white/50 mb-1">Email</div>
                  <a href="mailto:hello@novaforge.ai" className="text-[#00f5ff] hover:underline">hello@novaforge.ai</a>
                </div>
                <div>
                  <div className="text-white/50 mb-1">Discord</div>
                  <div className="text-white">discord.gg/novaforge</div>
                </div>
                <div>
                  <div className="text-white/50 mb-1">Office</div>
                  <div className="text-white">San Francisco, CA</div>
                </div>
              </div>
            </div>

            <div className="glass rounded-3xl p-8 border border-white/10">
              <div className="text-sm text-white/60">Average response time</div>
              <div className="text-4xl font-semibold mt-1 tracking-tighter">1h 47m</div>
            </div>
          </div>

          {/* Form */}
          <div className="md:col-span-3">
            <div className="glass rounded-3xl p-10 border border-white/10">
              {submitted ? (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-center py-12"
                >
                  <div className="mx-auto w-16 h-16 rounded-full bg-[#00f5ff]/10 flex items-center justify-center mb-6">
                    <svg className="w-8 h-8 text-[#00f5ff]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7" />
                    </svg>
                  </div>
                  <h3 className="text-2xl font-semibold mb-2">Message received</h3>
                  <p className="text-white/60">Thank you. We'll get back to you shortly.</p>
                </motion.div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm text-white/60 mb-2">Full name</label>
                      <input
                        type="text"
                        name="name"
                        value={formData.name}
                        onChange={handleChange}
                        className={inputClasses}
                        placeholder="Alex Rivera"
                      />
                      {errors.name && <p className="text-red-400 text-xs mt-1.5">{errors.name}</p>}
                    </div>
                    <div>
                      <label className="block text-sm text-white/60 mb-2">Work email</label>
                      <input
                        type="email"
                        name="email"
                        value={formData.email}
                        onChange={handleChange}
                        className={inputClasses}
                        placeholder="you@company.com"
                      />
                      {errors.email && <p className="text-red-400 text-xs mt-1.5">{errors.email}</p>}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm text-white/60 mb-2">Subject</label>
                    <input
                      type="text"
                      name="subject"
                      value={formData.subject}
                      onChange={handleChange}
                      className={inputClasses}
                      placeholder="Enterprise licensing inquiry"
                    />
                    {errors.subject && <p className="text-red-400 text-xs mt-1.5">{errors.subject}</p>}
                  </div>

                  <div>
                    <label className="block text-sm text-white/60 mb-2">Message</label>
                    <textarea
                      name="message"
                      value={formData.message}
                      onChange={handleChange}
                      rows={7}
                      className={`${inputClasses} resize-y min-h-[140px]`}
                      placeholder="Tell us about your project or how we can help..."
                    />
                    {errors.message && <p className="text-red-400 text-xs mt-1.5">{errors.message}</p>}
                  </div>

                  <motion.button
                    type="submit"
                    disabled={isSubmitting}
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                    className="w-full h-14 rounded-2xl bg-gradient-to-r from-[#00f5ff] to-[#0088ff] text-[#0a0a0f] font-semibold flex items-center justify-center gap-3 disabled:opacity-70 transition-all"
                  >
                    {isSubmitting ? (
                      <>
                        <div className="w-4 h-4 border-2 border-[#0a0a0f] border-t-transparent rounded-full animate-spin" />
                        Sending message...
                      </>
                    ) : (
                      'Send message'
                    )}
                  </motion.button>
                  <p className="text-center text-xs text-white/40">We usually reply within a few hours.</p>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Contact;