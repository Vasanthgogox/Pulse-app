import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const reactRoot = fileURLToPath(new URL('./node_modules/react', import.meta.url));
const reactDomRoot = fileURLToPath(new URL('./node_modules/react-dom', import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    fs: { allow: ['..'] },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@pulse-assets': fileURLToPath(new URL('../assets', import.meta.url)),
      // Keep a single React instance — parent repo also ships react@19.1.0.
      react: reactRoot,
      'react-dom': reactDomRoot,
    },
    dedupe: ['react', 'react-dom'],
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'lottie-react'],
  },
  base: '/oms/',
  build: {
    chunkSizeWarningLimit: 3000,
  },
});
