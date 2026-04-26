import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // App theme (DARK)
        background: '#0A0E1A',
        sidebar: '#111827',
        card: '#1F2937',
        border: '#374151',
        textPrimary: '#F9FAFB',
        textSecondary: '#9CA3AF',
        accent: '#6366F1',
        violet: '#8B5CF6',
        success: '#10B981',
        warning: '#F59E0B',
        error: '#EF4444',
        // Logo gradient
        cyanLogo: '#00D4FF',
        blueLogo: '#38BDF8',
        blueDeepLogo: '#1E3A8A',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
} satisfies Config;
