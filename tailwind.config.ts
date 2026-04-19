import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
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
        purple: '#6040c0',
        'purple-light': '#8060e0',
        'purple-pale': '#eeebff',
        blue: '#2060c0',
        'blue-light': '#4080e0',
        'blue-pale': '#e0ecff',
        'text-dark': '#2a3a5a',
        'text-silver': '#8898b0',
        green: '#1a8040',
        'green-pale': '#d8f0e4',
        amber: '#906000',
        'amber-pale': '#faecc0',
        red: '#a02020',
      },
      fontFamily: {
        mono: ['"Share Tech Mono"', 'monospace'],
      },
      boxShadow: {
        panel: '0 0 0 1px rgba(96, 64, 192, 0.05), 6px 6px 0 rgba(138, 164, 200, 0.2)',
      },
      backgroundImage: {
        'titlebar-gradient': 'linear-gradient(90deg, #3050a0, #5040b0)',
      },
    },
  },
  plugins: [],
} satisfies Config
