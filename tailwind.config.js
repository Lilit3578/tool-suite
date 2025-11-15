/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"], // <-- Added for shadcn-ui
  content: [
	"./src/renderer/**/*.{js,ts,jsx,tsx,html}", // your app code
	"./src/components/**/*.{js,ts,jsx,tsx}",    // shadcn components
	"./node_modules/lucide-react/dist/*.js"     // optional: lucide icons
  ],  
  theme: {
	  extend: {
		fontFamily: {
		  serif: ['Instrument Serif', 'serif'],
		  sans: ['Be Vietnam Pro', 'sans-serif'],
		  mono: ['JetBrains Mono', 'monospace'],
		},
		colors: {
		  ink: {
			'0': 'var(--ink-0)',
			'100': 'var(--ink-100)',
			'200': 'var(--ink-200)',
			'300': 'var(--ink-300)',
			'400': 'var(--ink-400)',
			'500': 'var(--ink-500)',
			'600': 'var(--ink-600)',
			'700': 'var(--ink-700)',
			'800': 'var(--ink-800)',
			'900': 'var(--ink-900)',
			'1000': 'var(--ink-1000)',
		  },
		  background: 'rgb(var(--background) / <alpha-value>)',
		  foreground: 'rgb(var(--foreground) / <alpha-value>)',
		  card: {
			DEFAULT: 'rgb(var(--card) / <alpha-value>)',
			foreground: 'rgb(var(--card-foreground) / <alpha-value>)',
		  },
		  popover: {
			DEFAULT: 'rgb(var(--popover) / <alpha-value>)',
			foreground: 'rgb(var(--popover-foreground) / <alpha-value>)',
		  },
		  primary: {
			DEFAULT: 'rgb(var(--primary) / <alpha-value>)',
			foreground: 'rgb(var(--primary-foreground) / <alpha-value>)',
		  },
		  secondary: {
			DEFAULT: 'rgb(var(--secondary) / <alpha-value>)',
			foreground: 'rgb(var(--secondary-foreground) / <alpha-value>)',
		  },
		  muted: {
			DEFAULT: 'rgb(var(--muted) / <alpha-value>)',
			foreground: 'rgb(var(--muted-foreground) / <alpha-value>)',
		  },
		  accent: {
			DEFAULT: 'rgb(var(--accent) / <alpha-value>)',
			foreground: 'rgb(var(--accent-foreground) / <alpha-value>)',
		  },
		  destructive: {
			DEFAULT: 'rgb(var(--destructive) / <alpha-value>)',
			foreground: 'rgb(var(--destructive-foreground) / <alpha-value>)',
		  },
		  border: 'rgb(var(--border) / <alpha-value>)',
		  input: 'rgb(var(--input) / <alpha-value>)',
		  ring: 'rgb(var(--ring) / <alpha-value>)',
		},
		borderRadius: {
		  lg: 'var(--radius)',
		  md: 'calc(var(--radius) - 2px)',
		  sm: 'calc(var(--radius) - 4px)',
		},
	  },
	},
	plugins: [
	  require('tailwindcss-animate'),
	],
  };
  