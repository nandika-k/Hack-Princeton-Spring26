import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // RE//WORN palette
        'deep-navy':     '#042C53',
        'steel-blue':    '#8DB9DC',
        'sky-mist':      '#BCD4E9',
        'midnight-blue': '#0C447C',
        'forest-sage':   '#48655E',
        seafoam:         '#DDE9EA',
        'sage-mist':     '#CCDBD1',
        'frost-white':   '#F0F4F8',
        // Legacy aliases (keep JSX working)
        'bg-0': '#F0F4F8',
        'bg-1': '#F0F4F8',
        'bg-2': '#ffffff',
        'bg-3': '#DDE9EA',
        'border-dim':    '#CCDBD1',
        'border-mid':    '#8DB9DC',
        'border-bright': '#042C53',
        purple:          '#48655E',
        'purple-light':  '#8DB9DC',
        'purple-pale':   '#BCD4E9',
        blue:            '#0C447C',
        'blue-light':    '#8DB9DC',
        'blue-pale':     '#DDE9EA',
        'text-dark':     '#042C53',
        'text-silver':   '#48655E',
        green:           '#1a8040',
        'green-pale':    '#d8f0e4',
        amber:           '#906000',
        'amber-pale':    '#faecc0',
        red:             '#a02020',
      },
      fontFamily: {
        mono: ['"Share Tech Mono"', 'monospace'],
      },
      boxShadow: {
        panel: '0 1px 3px rgba(4,44,83,0.08), 0 1px 2px rgba(4,44,83,0.04)',
      },
    },
  },
  plugins: [],
} satisfies Config
