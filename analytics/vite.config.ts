import { defineConfig } from 'vite';
import react    from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
import path     from 'path';

export default defineConfig({
  plugins: [react(), tailwind()],
  base: '/ops-9f3a2c/',
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: { port: 3002, strictPort: true },
  build:  { sourcemap: false },
});
