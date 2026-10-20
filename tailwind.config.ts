import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#0f172a',
        brand: '#0f766e',
        accent: '#f59e0b',
      },
    },
  },
  plugins: [],
} satisfies Config
