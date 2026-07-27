import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
          muted: 'hsl(var(--destructive-muted))',
          'muted-foreground': 'hsl(var(--destructive-muted-foreground))',
        },
        // One colour per meaning. `bg-success` fills solid; `bg-success-muted` with
        // `text-success-muted-foreground` is the quiet pill used on cards and tables.
        success: {
          DEFAULT: 'hsl(var(--success))',
          foreground: 'hsl(var(--success-foreground))',
          muted: 'hsl(var(--success-muted))',
          'muted-foreground': 'hsl(var(--success-muted-foreground))',
        },
        warning: {
          DEFAULT: 'hsl(var(--warning))',
          foreground: 'hsl(var(--warning-foreground))',
          muted: 'hsl(var(--warning-muted))',
          'muted-foreground': 'hsl(var(--warning-muted-foreground))',
        },
        info: {
          DEFAULT: 'hsl(var(--info))',
          foreground: 'hsl(var(--info-foreground))',
          muted: 'hsl(var(--info-muted))',
          'muted-foreground': 'hsl(var(--info-muted-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        // Every shadcn overlay (select, dropdown, tooltip, the pipeline filter panel) styles
        // itself with bg-popover. Without this entry the class never generated, so those menus
        // rendered fully see-through over whatever was behind them.
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        sidebar: {
          DEFAULT: 'hsl(var(--sidebar))',
          foreground: 'hsl(var(--sidebar-foreground))',
          border: 'hsl(var(--sidebar-border))',
        },
        // Bitrix24 kanban surfaces, used only by the Deals board. Scoped on purpose: this is a
        // copy of another product's chrome, not a second opinion about what "muted" means here.
        bx: {
          board: 'hsl(var(--bx-board))',
          surface: 'hsl(var(--bx-surface))',
          line: 'hsl(var(--bx-line))',
          link: 'hsl(var(--bx-link))',
          text: 'hsl(var(--bx-text))',
          muted: 'hsl(var(--bx-muted))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      // Elevation from one tinted hue rather than Tailwind's neutral black, so shadows sit in the
      // same colour family as the surfaces and read as soft rather than sooty.
      boxShadow: {
        xs: '0 1px 2px 0 hsl(var(--shadow-color) / 0.04)',
        sm: '0 1px 3px 0 hsl(var(--shadow-color) / 0.06), 0 1px 2px -1px hsl(var(--shadow-color) / 0.04)',
        DEFAULT: '0 2px 6px -1px hsl(var(--shadow-color) / 0.08), 0 1px 3px -1px hsl(var(--shadow-color) / 0.05)',
        md: '0 4px 12px -2px hsl(var(--shadow-color) / 0.10), 0 2px 6px -2px hsl(var(--shadow-color) / 0.06)',
        lg: '0 12px 28px -8px hsl(var(--shadow-color) / 0.14), 0 4px 10px -4px hsl(var(--shadow-color) / 0.08)',
        xl: '0 24px 48px -12px hsl(var(--shadow-color) / 0.18)',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;
