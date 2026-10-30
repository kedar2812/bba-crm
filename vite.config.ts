import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  base: '/',
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:8080',
      '/uploads': 'http://127.0.0.1:8080',
    },
  },
  build: {
    target: 'es2018',
    outDir: 'dist/app',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('recharts') || id.includes('d3-') || id.includes('victory')) return 'charts'
            if (id.includes('xlsx')) return 'xlsx'
            if (id.includes('framer-motion')) return 'motion'
            if (id.includes('react-dom') || id.includes('/react/') || id.includes('react-router') || id.includes('scheduler')) return 'react'
          }
        },
      },
    },
  },
})
