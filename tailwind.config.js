/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,jsx}',
  ],
  safelist: [
    'bg-blue-100',    'text-blue-700',
    'bg-violet-100',  'text-violet-700',
    'bg-rose-100',    'text-rose-700',
    'bg-amber-100',   'text-amber-700',
    'bg-emerald-100', 'text-emerald-700',
    'bg-slate-100',   'text-slate-500',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
