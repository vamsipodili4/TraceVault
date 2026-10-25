/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        cyber: {
          base: '#0A0A0A',
          surface: '#121216',
          surfaceHover: '#181822',
          border: 'rgba(0, 123, 167, 0.25)',
        },
        cerulean: {
          primary: '#007BA7',
          glow: 'rgba(0, 123, 167, 0.45)',
        },
        neon: {
          rose: '#FF2D95',
          glow: 'rgba(255, 45, 149, 0.45)',
        },
        text: {
          primary: '#FFFFFF',
          secondary: '#94A3B8',
          muted: '#64748B',
        },
      },
      fontFamily: {
        mono: ['"DM Mono"', 'monospace'],
        manrope: ['"Manrope"', 'system-ui', 'sans-serif'],
      },
      animation: {
        'pulse-cerulean': 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'pulse-rose': 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'spin-slow': 'spin 3s linear infinite',
      },
    },
  },
  plugins: [],
}