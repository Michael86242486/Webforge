import React, { use } from 'react';
import { } from 'framer-motionimport { Link, use } from 'react-router';
import { useAuth } from '../hooksAuth';
import { useTheme } from '../context/Context';

const Login = () => {
  const [email, setEmail] useState('');
  constpassword, setPassword] = useState('');
  constrememberMe, setRemember] = useState(true  const [isLoading, setIsLoading] = useState(false  const [error, setError] = useState  const { login } = useAuth();
 const { isDark } useTheme();
  const navigate = useNavigate();

  handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const result = await login(email, password, rememberMe);
      if (result.success) {
        navigate('/dashboard');
      } else {
        setError(result.error || 'Login failed. Please try again.');
      }
    } catch (err) {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSocialLogin = (provider) => {
    setIsLoading(true);
    setTimeout(() => {
      const mockUser = {
        id: Date.now(),
        email: `user@${provider.toLowerCase()}.com`,
        name: `${provider} User`,
        avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${provider}`
      };
      localStorage.setItem('novaforge_token', 'mock_jwt_token_' + Date.now());
      localStorage.setItem('novaforge_user', JSON.stringify(mockUser));
      window.location.href = '/dashboard';
    }, 800);
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(#1a1a24_1px,transparent_1px)] bg-[length:4px_4px]"></div>
      
      <div className="absolute top-20 left-10 w-72 h-72 bg-cyan-500/10 rounded-full blur-[120px]"></div>
      <div className="absolute bottom-20 right-10 w-96 h-96 bg-blue-500/10 rounded-full blur-[120px]"></div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="w-full max-w-md relative z-10"
      >
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center">
              <span className="text-white font-bold text-2xl">N</span>
            </div>
            <span className="text-4xl font-semibold text-white tracking-tight">NovaForge</span>
          </div>
          <p className="text-zinc-400 text-lg">Welcome back, creator</p>
        </div>

        <div className="bg-zinc-900/60 backdrop-blur-2xl border border-white/10 rounded-3xl p-8 shadow-2xl">
          <div className="mb-8">
            <h1 className="text-3xl font-semibold text-white mb-2">Sign in</h1>
            <p className="text-zinc-400">Access your AI-powered workspace</p>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-2xl text-red-400 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-2">Email address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3.5 bg-zinc-950/70 border border-white/10 rounded-2xl text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-500/60 transition-all"
                placeholder="you@studio.com"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-2">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3.5 bg-zinc-950/70 border border-white/10 rounded-2xl text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-500/60 transition-all"
                placeholder="••••••••"
                required
              />
            </div>

            <div className="flex items-center justify-between pt-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-4 h-4 accent-cyan-500 bg-zinc-800 border-white/20 rounded"
                />
                <span className="text-sm text-zinc-400">Remember me</span>
              </label>
              <Link to="/forgot-password" className="text-sm text-cyan-400 hover:text-cyan-300 transition-colors">
                Forgot password?
              </Link>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3.5 mt-2 bg-white text-zinc-950 rounded-2xl font-semibold flex items-center justify-center gap-2 hover:bg-zinc-100 active:scale-[0.985] transition-all disabled:opacity-70"
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-zinc-400 border-t-zinc-900 rounded-full animate-spin" />
              ) : (
                'Sign in to NovaForge'
              )}
            </button>
          </form>

          <div className="my-8 flex items-center gap-4">
            <div className="flex-1 h-px bg-white/10"></div>
            <span className="text-xs uppercase tracking-[2px] text-zinc-500">or continue with</span>
            <div className="flex-1 h-px bg-white/10"></div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {['Google', 'GitHub', 'Twitter'].map((provider) => (
              <button
                key={provider}
                onClick={() => handleSocialLogin(provider)}
                disabled={isLoading}
                className="py-3 bg-zinc-950/70 hover:bg-zinc-950 border border-white/10 rounded-2xl text-sm font-medium text-white transition-all flex items-center justify-center gap-2 active:scale-[0.985]"
              >
                {provider}
              </button>
            ))}
          </div>

          <div className="text-center mt-8 text-sm text-zinc-400">
            Don't have an account?{' '}
            <Link to="/register" className="text-cyan-400 hover:text-cyan-300 font-medium transition-colors">
              Create one free
            </Link>
          </div>
        </div>

        <p className="text-center text-xs text-zinc-600 mt-8">
          Protected by enterprise-grade encryption
        </p>
     motion.div>
    </div>
  );
};

export default Login;