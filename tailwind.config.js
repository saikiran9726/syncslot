/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/web/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: 'var(--color-ink)',
          muted: 'var(--color-ink-muted)',
        },
        surface: 'var(--color-surface)',
        card: 'var(--color-card)',
        border: 'var(--color-border)',
        accent: {
          DEFAULT: 'var(--color-accent)',
          hover: 'var(--color-accent-hover)',
          tint: 'var(--color-accent-tint)',
        },
        success: {
          DEFAULT: 'var(--color-success)',
          tint: 'var(--color-success-tint)',
        },
        warning: {
          DEFAULT: 'var(--color-warning)',
          tint: 'var(--color-warning-tint)',
        },
        danger: {
          DEFAULT: 'var(--color-danger)',
          tint: 'var(--color-danger-tint)',
        },
        info: {
          DEFAULT: 'var(--color-info)',
          tint: 'var(--color-info-tint)',
        },
      },
      fontFamily: {
        display: ['Fraunces', 'Georgia', 'serif'],
        sans: ['Plus Jakarta Sans', 'system-ui', '-apple-system', 'sans-serif'],
      },
      borderRadius: {
        control: '8px',
        card: '12px',
        sheet: '16px',
      },
      boxShadow: {
        subtle: '0 1px 3px 0 rgba(20, 33, 43, 0.04), 0 1px 2px -1px rgba(20, 33, 43, 0.04)',
        overlay: '0 10px 25px -5px rgba(20, 33, 43, 0.1), 0 8px 10px -6px rgba(20, 33, 43, 0.1)',
      },
    },
  },
  plugins: [],
};
