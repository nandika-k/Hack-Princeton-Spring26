import type { Config } from 'tailwindcss'

// Y2K OS palette — matches the main ReWear app
export default {
  content: ['./src/**/*.{ts,tsx,html}'],
  theme: {
    extend: {
      colors: {
        'bg-0': '#eef2fa',
        'bg-1': '#f4f7fd',
        'bg-2': '#fafbff',
        'bg-3': '#dce6f4',
        'border-dim': '#c8d4e8',
        'border-mid': '#8aa4c8',
        'border-bright': '#4a6898',
        purple: { DEFAULT: '#6040c0', light: '#8060e0', pale: '#eeebff' },
        blue:   { DEFAULT: '#2060c0', light: '#4080e0', pale: '#e0ecff' },
        'text-dark': '#2a3a5a',
        'text-silver': '#8898b0',
        green:  { DEFAULT: '#1a8040', pale: '#d8f0e4' },
        amber:  { DEFAULT: '#906000', pale: '#faecc0' },
        red: '#a02020',
      },
      fontFamily: { mono: ['Share Tech Mono', 'monospace'] },
      backgroundImage: {
        'titlebar-gradient': 'linear-gradient(90deg, #3050a0, #5040b0)',
        'pixel-bar': 'repeating-linear-gradient(90deg, #6040c0 0px, #6040c0 4px, #2060c0 4px, #2060c0 8px, #c8d4e8 8px, #c8d4e8 10px)',
      },
    },
  },
  plugins: [],
} satisfies Config
