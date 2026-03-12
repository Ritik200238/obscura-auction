/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: {
          950: '#06060b',
          900: '#0c0c14',
          800: '#14142a',
          700: '#1e1e3f',
          600: '#2a2a55',
        },
        accent: {
          600: '#7c3aed',
          500: '#8b5cf6',
          400: '#a78bfa',
          300: '#c4b5fd',
          200: '#ddd6fe',
        },
        brand: {
          cyan: '#06b6d4',
          teal: '#14b8a6',
        },
        // Semantic phase colors
        sealed: {
          500: '#22c55e',
          400: '#4ade80',
          300: '#86efac',
          DEFAULT: '#22c55e',
        },
        reveal: {
          500: '#f59e0b',
          400: '#fbbf24',
          300: '#fcd34d',
          DEFAULT: '#f59e0b',
        },
        settle: {
          500: '#3b82f6',
          400: '#60a5fa',
          300: '#93c5fd',
          DEFAULT: '#3b82f6',
        },
        failed: {
          500: '#ef4444',
          400: '#f87171',
          300: '#fca5a5',
          DEFAULT: '#ef4444',
        },
        success: '#22c55e',
        warning: '#f59e0b',
        error: '#ef4444',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      backdropBlur: {
        xs: '2px',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in': 'fadeIn 0.4s ease-out',
        'fade-in-up': 'fadeInUp 0.5s ease-out',
        'slide-in': 'slideIn 0.3s ease-out',
        'glow-pulse': 'glowPulse 2s ease-in-out infinite',
        'shimmer': 'shimmer 2s linear infinite',
        'float': 'float 6s ease-in-out infinite',
        'gradient-flow': 'gradientFlow 4s ease-in-out infinite',
        'wallet-pulse': 'walletPulse 2s ease-in-out infinite',
        'mesh-drift': 'meshDrift 12s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        fadeInUp: {
          '0%': { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideIn: {
          '0%': { opacity: '0', transform: 'translateX(-8px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        glowPulse: {
          '0%, 100%': { boxShadow: '0 0 20px rgba(139, 92, 246, 0.15)' },
          '50%': { boxShadow: '0 0 40px rgba(139, 92, 246, 0.3)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-8px)' },
        },
        gradientFlow: {
          '0%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
          '100%': { backgroundPosition: '0% 50%' },
        },
        walletPulse: {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(139, 92, 246, 0.4)' },
          '50%': { boxShadow: '0 0 0 6px rgba(139, 92, 246, 0)' },
        },
        meshDrift: {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '25%': { backgroundPosition: '100% 25%' },
          '50%': { backgroundPosition: '50% 100%' },
          '75%': { backgroundPosition: '25% 0%' },
        },
      },
    },
  },
  plugins: [],
}
