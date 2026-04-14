/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        keller: {
          // Core palette — GitHub Dark inspired, brutalist chip-lab aesthetic
          bg:      '#0d1117',
          panel:   '#161b22',
          surface: '#1c2128',
          border:  '#30363d',
          hover:   '#292e36',

          // Text hierarchy
          text:    '#c9d1d9',
          muted:   '#8b949e',
          dim:     '#484f58',

          // Semantic accents
          accent:  '#58a6ff',
          success: '#3fb950',
          error:   '#f85149',
          warning: '#d29922',
          info:    '#79c0ff',
        },
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'Cascadia Code', 'monospace'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        '2xs': '0.625rem',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in': 'fadeIn 0.2s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%':   { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
};
