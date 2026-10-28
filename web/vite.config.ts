import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// Static demo build: relative asset paths, so dist/ works from any folder - including a GitHub
// Pages project site, which serves from /<repo>/ rather than the domain root.
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  server: { port: 5174 },
})
