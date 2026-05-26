/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        background: '#041329',
        surface: '#112036',
        'surface-high': '#1C2A41',
        primary: '#00F5D4',
        'primary-secondary': '#4BDBCB',
        'primary-light': '#80F7E0',
        'text-primary': '#D6E3FF',
        'text-secondary': '#B9CAC4',
        'text-subtle': '#83948F',
        border: '#27354C',
        warning: '#FFD43B',
        error: '#FFB4AB',
        success: '#51CF66',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        xl: '1rem',
        '2xl': '1.25rem',
      },
      boxShadow: {
        panel: '0 8px 32px rgba(0, 0, 0, 0.35), 0 0 0 1px rgba(39, 53, 76, 0.8)',
        glow: '0 0 24px rgba(0, 245, 212, 0.35)',
        'glow-soft': '0 0 12px rgba(0, 245, 212, 0.2)',
        'glow-amber': '0 0 24px rgba(255, 212, 59, 0.35)',
      },
      backgroundImage: {
        'aura-radial':
          'radial-gradient(ellipse 80% 60% at 50% 0%, rgba(0, 245, 212, 0.15), transparent 70%)',
        'aura-mesh':
          'radial-gradient(at 20% 30%, rgba(0, 245, 212, 0.12) 0%, transparent 50%), radial-gradient(at 80% 70%, rgba(75, 219, 203, 0.08) 0%, transparent 50%)',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideInLeft: {
          '0%': { opacity: '0', transform: 'translateX(-24px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        slideInRight: {
          '0%': { opacity: '0', transform: 'translateX(24px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.92)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        'pulse-glow': {
          '0%, 100%': { boxShadow: '0 0 20px rgba(0, 245, 212, 0.25)' },
          '50%': { boxShadow: '0 0 40px rgba(0, 245, 212, 0.45)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      animation: {
        fadeIn: 'fadeIn 0.4s ease-out forwards',
        slideUp: 'slideUp 0.4s ease-out forwards',
        slideInLeft: 'slideInLeft 0.4s ease-out forwards',
        slideInRight: 'slideInRight 0.4s ease-out forwards',
        scaleIn: 'scaleIn 0.4s ease-out forwards',
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
        float: 'float 4s ease-in-out infinite',
        shimmer: 'shimmer 1.5s linear infinite',
      },
      backdropBlur: {
        md: '12px',
        lg: '16px',
      },
    },
  },
  plugins: [],
};