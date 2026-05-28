{ useState } from 'react';
import { Link, useNavigate } 'react-router-dom';
import { motion, AnimatePresence from 'framer-motion';

const Register = () => {
  const navigate = useNavigate();
 const [step, setStep] = useState(1  const [formData setFormData] = useState({
   Name: '',
    email: '',
 password: '',
    confirmPassword:    username: '',
    bio: '',
    agreeToTerms: false
 });
  const [errors, setErrors] = use({});
  const [password, setPasswordStrength] useState(0);
  const [isSubmitting, setSubmitting] = useState);
  const [showSuccess, setShowSuccess] = useState(false);

  const totalSteps = 3;

  constPasswordStrength = (password) => {
    let strength = 0;
    if (password.length >= 8) strength += 25;
    if (password.length >= 12) strength 25;
    if (/[A-Z]/.test(password)) strength += 20;
    if (/[0-9]/.test(password)) strength += 15;
    if (/[^A-Za-z0-9]/.test(password)) strength += 15;
    return Math.min(strength, 100);
  };

  const getStrengthLabel = (strength) => {
    if (strength < 30) return { label: 'Weak', color: 'text-red-400' };
    if (strength < 60) return { label: 'Fair', color: 'text-yellow-400' };
    if (strength < 80) return { label: 'Good', color: 'text-blue-400' };
    return { label: 'Strong', color: 'text-emerald-400' };
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    const newValue = type === 'checkbox' ? checked : value;
    
    setFormData(prev => ({ ...prev, [name]: newValue }));
    
    if (name === 'password') {
      const strength = calculatePasswordStrength(value);
      setPasswordStrength(strength);
    }

    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const validateStep = (currentStep) => {
    const newErrors = {};
    
    if (currentStep === 1) {
      if (!formData.fullName.trim()) newErrors.fullName = 'Full name is required';
      if (!formData.email.trim()) newErrors.email = 'Email is required';
      else if (!/\S+@\S+\.\S+/.test(formData.email)) newErrors.email = 'Please enter a valid email';
    }
    
    if (currentStep === 2) {
      if (!formData.password) newErrors.password = 'Password is required';
      else if (formData.password.length < 8) newErrors.password = 'Password must be at least 8 characters';
      if (!formData.confirmPassword) newErrors.confirmPassword = 'Please confirm your password';
      else if (formData.password !== formData.confirmPassword) newErrors.confirmPassword = 'Passwords do not match';
    }
    
    if (currentStep === 3) {
      if (!formData.username.trim()) newErrors.username = 'Username is required';
      if (!formData.agreeToTerms) newErrors.agreeToTerms = 'You must agree to the terms';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const nextStep = () => {
    ifvalidateStep(step)) {
      setStep(prev => Math.min(prev + 1, totalSteps));
    }
  };

  const prevStep = () => {
    setStep(prev => Math.max(prev - 1, 1));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateStep(3)) return;

    setIsSubmitting(true);

    try {
      await new Promise(resolve => setTimeout(resolve, 1500));

      const userData = {
        id: Date.now(),
        ...formData,
        createdAt: new Date().toISOString(),
        avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(formData.fullName)}&background=0ea5e9&color=fff`
      };

      localStorage.setItem('novaforge_user', JSON.stringify(userData));
      localStorage.setItem('novaforge_token', 'demo-jwt-token-' + Date.now());

      setShowSuccess(true);

      setTimeout(() => {
        navigate('/dashboard');
      }, 2000);
    } catch (error) {
      setErrors({ submit: 'Registration failed. Please try again.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const strengthInfo = getStrengthLabel(passwordStrength);

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(#1a1a24_1px,transparent_1px)] bg-[length:4px_4px] opacity-40"></div>
      
      <div className="absolute top-20 left-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-[120px]"></div>
      <div className="absolute bottom-20 right-1/4 w-80 h-80 bg-blue-500/10 rounded-full blur-[100px]"></div>

      <div className="w-full max-w-[480px] relative z-10">
        <div className="flex justify-center mb-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center">
              <span className="text-[#0a0a0f] font-bold text-2xl">N</span>
            </div>
            <div>
              <div className="font-semibold text-3xl tracking-tight">NovaForge</div>
              <div className="text-[10px] text-cyan-400 -mt-1">AI STARTUP BUILDER</div>
            </div>
          </div>
        </div>

        <div className="glass border border-white/10 rounded-3xl p-8 shadow-2xl">
          <div className="mb-8 text-center">
            <h1 className="text-3xl font-semibold tracking-tight mb-2">Create your account</h1>
            <p className="text-white/60">Join thousands of creators building the future</p>
          </div>

          <div className="flex justify-between mb-8 relative">
            {[1, 2, 3].map((s) => (
              <div key={s} className="flex flex-col items-center z-10">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-medium transition-all duration-300 border-2
                  ${step === s ? 'bg-500 border-cyan-400 text-black shadow-[0_0_20px_rgb(103,232,249)]' : 
                    step > s ? 'bg-emerald-500 border-emerald-400 text-white' : 'bg-white/5 border-white/20 text-white/60'}`}>
                  {step > s ? '✓' : s}
                </div>
                <div className="text-[10px] mt-2 text-white/50 tracking-wider">
                  {s === 1 && 'ACCOUNT'}
                  {s === 2 && 'SECURITY'}
                  {s === 3 && 'PROFILE'}
                </div>
              </div>
                       <div className="absolute top-[17px] left-[42px] right-[42px] h-0.5 bg-white/10">
              <div className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-500" 
                   style={{ width: `${((step - 1) / (total - 1)) * 100}%` }}></div>
            </div>
          </div>

          <form onSubmit={handleSubmit}>
            <AnimatePresence mode="wait">
              {step === 1 && (
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-5"
                >
                  <div>
                    <label className="block text-sm font-medium text-white/80 mb-2">Full Name</label>
                    <input
                      type="text"
                      name="fullName"
                      value={formData.fullName}
                      onChange={handleInputChange}
                      className="w-full px-4 py-3.5 bg-white/5 border border-white/10 focus:border-cyan-500/60 rounded-2xl text-white placeholder-white/40 outline-none transition-all"
                      placeholder="Alex Rivera"
                    />
                    {errors.fullName && <p className="text-red-400 text-xs mt-1.5 ml-1">{errors.fullName}</p>}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-white/80 mb-2">Email Address</label>
                    <input
                      type="email"
                      name="email"
 value={formData.email}
                      onChange={handleInputChange}
                      className="w-full px-4 py-3.5 bg-white/5 border border-white/10 focus:border-cyan-500/60 rounded-2xl text-white placeholder-white/40 outline-none transition-all"
                      placeholder="you@startup.com"
                    />
                    {errors.email && <p className="text-red-400 text-xs mt-1.5 ml-1">{errors.email}</p>}
                  </div>
                </motion.div>
              )}

              {step === 2 && (
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-5"
                >
                  <div>
                    <label className="block text-sm font-medium text-white/80 mb-2">Password</label>
                    <input
                      type="password"
                      name="password"
                      value={formData.password}
                      onChange={handleInputChange}
                      className="w-full px-4 py-3.5 bg-white/5 border border-white/10 focus:border-cyan-500/60 rounded-2xl text-white placeholder-white/40 outline-none transition-all"
                      placeholder="Create a strong password"
                    />
                    {errors.password && <p className="text-red-400 text-xs mt-1.5 ml-1">{errors.password}</p>}
                    
                    {formData.password && (
                      <div className="mt-3">
                        <div className="flex justify-between items-center mb-1.5 text-xs">
                          <span className="text-white/50">Password strength</span>
                          <span className={strengthInfo.color + " font-medium"}>{strengthInfo.label}</span>
                        </div>
                        <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-gradient-to-r from-cyan-400 to-blue-500 transition-all duration-300"
                            style={{ width: `${passwordStrength}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-white/80 mb-2">Confirm Password</label>
                    <input
                      type="password"
                      name="confirmPassword"
                      value={formData.confirmPassword}
                      onChange={handleInputChange}
                      className="w-full px-4 py-3.5 bg-white/5 border border-white/10 focus:border-cyan-500/60 rounded-2xl text-white placeholder-white/40 outline-none transition-all"
                      placeholder="Confirm your password"
                    />
                    {errors.confirmPassword && <p className="text-red-400 text-xs mt-1.5 ml-1">{errors.confirmPassword}</p>}
                  </div>
                </motion.div>
              )}

              {step === 3 && (
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-5"
                >
                  <div>
                    <label className="block text-sm font-medium text-white/80 mb-2">Username</label>
                    <div className="relative">
                      <input
                        type="text"
                        name="username"
                        value={formData.username}
                        onChange={handleInputChange}
                        className="w-full px-4 py-3.5 bg-white/5 border border-white/10 focus:border-cyan-500/60 rounded-2xl text-white placeholder-white/40 outline-none transition-all"
                        placeholder="alexrivera"
                      />
                      <div className="absolute right-4 top-4 text-white/40 text-sm">@</div>
                    </div>
                    {errors.username && <p className="text-red-400 text-xs mt-1.5 ml-1">{errors.username}</p>}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-white/80 mb-2">Short Bio (Optional)</label>
                    <textarea
                      name="bio"
                      value={formData.bio}
                      onChange={handleInputChange}
                      rows={3}
                      className="w-full px-4 py-3.5 bg-white/5 border border-white/10 focus:border-cyan-500/60 rounded-2xl text-white placeholder-white/40 outline-none resize-y transition-all"
                      placeholder="Founder building AI tools for creators..."
                    />
                  </div>

                  <div className="pt-2">
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        name="agreeToTerms"
                        checked={formData.agreeToTerms}
                        onChange={handleInputChange}
                        className="mt-1 accent-cyan-500 w-4 h-4"
                      />
                      <span className="text-sm text-white/70 leading-tight">
                        I agree to the <span className="text-cyan-400 hover:underline cursor-pointer">Terms of Service</span> and <span className="text-cyan-400 hover:underline cursor-pointer">Privacy Policy</span>
                      </span>
                    </label>
                    {errors.agreeToTerms && <p className="text-red-400 text-xs mt-1.5 ml-7">{errors.agreeToTerms}</p>}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {errors.submit && (
              <div className="mt-4 text-center text-red-400 text-sm bg-red-950/30 border border-red-900 py-2.5 rounded-2xl">{errors.submit}</div>
            )}

            <div className="flex gap-3 mt-8">
              {step > 1 && (
                <button
                  type="button"
                  onClick={prevStep}
                  className="flex-1 py-3.5 rounded-2xl border border-white/10 hover:bg-white/5 transition-colors font-medium"
                >
                  Back
                </button>
              )}
              
              {step < totalSteps ? (
                <button
                  type="button"
                  onClick={nextStep}
                  className="flex-1 py-3.5 rounded-2xl bg-white text-black font-semibold hover:bg-white/90 transition-all active:scale-[0.985]"
                >
                  Continue
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 py-3.5 rounded-2xl bg-gradient-to-r from-cyan-400 to-blue-500 text-black font-semibold disabled:opacity-70 flex items-center justify-center gap-2 hover:brightness-105 transition-all active:scale-[0.985]"
                >
                  {isSubmitting ? (
                   Creating account...</>
                  ) : (
                    <>Create Account</>
                  )}
                </button>
              )}
            </div>
          </form>

          <div className="text-center mt-8 text-sm text-white/60">
            Already have an account?{' '}
            <Link to="/login" className="text-cyan-400 hover:text-cyan-300 font-medium">Sign in</Link>
          </div>
        </div>

        {showSuccess && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
            <div className="glass border border-white/10 rounded-3xl p-8 text-center max-w-xs">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-emerald-500/10 flex items-center justify-center">
                <div className="text-emerald-400 text-4xl">✓</div>
              </div>
              <div className="font-semibold text-xl">Welcome to NovaForge!</div>
              <p className="text-white/60 mt-1">Your account has been created successfully.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Register;