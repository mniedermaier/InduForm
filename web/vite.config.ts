/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const isDemo = process.env.VITE_DEMO_MODE === 'true';

export default defineConfig({
  base: isDemo ? '/InduForm/demo/' : '/',
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (!id.includes('node_modules')) return;
          if (id.includes('three') || id.includes('@react-three')) return 'three-vendor';
          if (id.includes('jspdf') || id.includes('html2canvas') || id.includes('html-to-image')) return 'pdf-vendor';
          if (id.includes('@xyflow') || id.includes('@dagrejs')) return 'flow-vendor';
          if (id.includes('react-dom')) return 'react-vendor';
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    css: true,
    exclude: ['e2e/**', 'node_modules/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/test/**', 'src/**/__tests__/**', 'src/demo/**', 'src/vite-env.d.ts'],
    },
  },
})
