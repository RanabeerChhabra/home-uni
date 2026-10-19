import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// The app lives at rana.beer/homeuni, so every URL is prefixed with /homeuni/
// and the build output is nested to match (dist/homeuni/…).
// https://vite.dev/config/
export default defineConfig({
  base: '/homeuni/',
  build: { outDir: 'dist/homeuni', emptyOutDir: true },
  plugins: [react(), tailwindcss()],
})
