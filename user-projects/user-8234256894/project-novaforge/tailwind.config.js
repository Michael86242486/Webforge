/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "./src/pages/**/*.{js,ts,jsx,tsx}",
    "./src/components/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Menlo', 'monospace'],
      },
      colors: {
        nova: {
          50: '#f0f9ff',
          100: '#e0f2fe',
          200: '#bae6fd',
          300: '#7dd3fc',
          400: '#38bdf8',
          500: '#06b6d4',
          600: '#0891b2',
          700: '#0e7490',
          800: '#164e63',
          900: '#0c3d5e',
          950: '#052e4a',
        },
        glow: {
          cyan: '#00f0ff',
          blue: '#3b82f6',
          purple: '#8b5cf6',
          pink: '#ec4899',
        },
        glass: {
          bg: 'rgba(15, 23, 42, 0.65)',
          border: 'rgba(148, 163, 184, 0.2)',
          hover: 'rgba(15, 23, 42, 0.85)',
        },
        dark: {
          900: '#0a0f1e',
          800: '#111827',
          700: '#1e2937',
          600: '#334155',
        },
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic': 'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
        'nova-glow': 'linear-gradient(135deg, #00f0ff 0%, #3b82f6 50%, #8b5cf6 100%)',
        'glass-gradient': 'linear-gradient(145deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 100%)',
      },
      boxShadow: {
        'glass': '0 8px 32px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255,255,255,0.1)',
        'glow-cyan': '0 0 20px rgba(0, 240, 255, 0.3), 0 0 40px rgba(0, 240, 255, 0.1)',
        'glow-blue': '0 0 20px rgba(59, 130, 246, 0.3)',
        'premium': '0 25px 50px -12px rgb(0 0 0 / 0.4), 0 0 0 1px rgba(148, 163, 184, 0.1)',
      },
      animation: {
        'glow-pulse': 'glow-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'float': 'float 6s ease-in-out infinite',
        'slide-up': 'slide-up 0.4s cubic-bezier(0.32, 0.72, 0, 1)',
        'fade-in': 'fade-in 0.3s ease-out',
      },
      keyframes: {
        'glow-pulse': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.6' },
        },
        'float': {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        'slide-up': {
          '0%': { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
      backdropBlur: {
        'xs': '2px',
        'glass': '20px',
      },
    },
  },
  plugins: [
    function({ addUtilities }) {
      addUtilities({
        '.glass': {
          background: 'rgba(15, 23, 42, 0.65)',
          'backdrop-filter': 'blur(20px)',
          border: '1px solid rgba(148, 163, 184, 0.2)',
          'box-shadow': '0 8px 32px rgba(0, 0, 0, 0.4)',
        },
        '.glass-hover': {
          transition: 'all 0.2s cubic-bezier(0.23, 1, 0.32, 1)',
          '&:hover': {
            background: 'rgba(15, 23, 42, 0.85)',
            border: '1px solid rgba(148, 163, 184, 0.35)',
            transform: 'translateY(-1px)',
            'box-shadow': '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 0 20px rgba(0, 240, 255, 0.1)',
          },
        },
        '.glow-cyan': {
          'box-shadow': '0 0 20px rgba(0, 240, 255, 0.3), 0 0 40px rgba(0, 240, 255, 0.1)',
        },
        '.text-glow': {
          'text-shadow': '0 0 10px rgba(0, 240, 255, 0.5)',
        },
        '.premium-border': {
          border: '1px solid transparent',
          'background-image': 'linear-gradient(#0a0f1e, #0a0f1e), linear-gradient(135deg, #00f0ff, #3b82f6)',
          'background-origin': 'border-box',
          'background-clip': 'padding-box, border-box',
        },
      })
    }
  ],
}