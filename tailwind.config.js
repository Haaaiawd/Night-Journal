/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive) / <alpha-value>)",
          foreground: "hsl(var(--destructive-foreground) / <alpha-value>)",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent-hsl))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        // Night Journal custom tokens
        parchment: {
          light: '#F5F2ED',
          dark: '#12100E',
        },
        nj: {
          accent: '#B88A64',
          'accent-hover': '#A67B58',
          'text-primary': '#1A1A1A',
          'text-secondary': '#6B6560',
          'text-tertiary': '#9E9892',
          divider: '#E8E4DF',
          surface: '#FFFFFF',
          'surface-dark': '#1C1A17',
          elevated: '#FAFAF7',
          'elevated-dark': '#252320',
          success: '#6B8F71',
          error: '#B85C5C',
          'mood-happy': '#D4A853',
          'mood-calm': '#7BA3A0',
          'mood-sad': '#8B9BB4',
          'mood-tired': '#A08E8E',
          'mood-excited': '#C4826A',
          'mood-anxious': '#9B8AA5',
        },
      },
      fontFamily: {
        display: ['"ZCOOL XiaoWei"', 'serif'],
        body: ['"LXGW WenKai"', 'serif'],
        ui: ['"DM Sans"', 'sans-serif'],
      },
      borderRadius: {
        xl: "calc(var(--radius) + 4px)",
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        xs: "calc(var(--radius) - 6px)",
        '2xl': '16px',
        '3xl': '24px',
      },
      boxShadow: {
        xs: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
        'card-light': '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)',
        'card-dark': 'none',
        'fab': '0 4px 16px rgba(184,138,100,0.35)',
      },
      spacing: {
        'safe-bottom': 'env(safe-area-inset-bottom)',
        '18': '4.5rem',
        '22': '5.5rem',
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "caret-blink": {
          "0%,70%,100%": { opacity: "1" },
          "20%,50%": { opacity: "0" },
        },
        "pulse-dot": {
          "0%, 100%": { transform: "scale(1)", opacity: "0.6" },
          "50%": { transform: "scale(1.4)", opacity: "0" },
        },
        "fab-pulse": {
          "0%, 100%": { transform: "scale(1)" },
          "50%": { transform: "scale(1.03)" },
        },
        "skeleton-pulse": {
          "0%, 100%": { opacity: "0.4" },
          "50%": { opacity: "0.8" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "caret-blink": "caret-blink 1.25s ease-out infinite",
        "pulse-dot": "pulse-dot 1.5s infinite ease-in-out",
        "fab-pulse": "fab-pulse 2s ease-in-out infinite",
        "skeleton-pulse": "skeleton-pulse 1.5s infinite ease-in-out",
      },
      zIndex: {
        'nav': '50',
        'fab': '55',
        'overlay': '60',
        'drawer': '70',
        'toast': '80',
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}
