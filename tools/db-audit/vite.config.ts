import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';
import { auditApiPlugin } from './vite-plugin-audit-api';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, repoRoot, '');
  return {
    plugins: [react(), auditApiPlugin()],
    server: {
      fs: { allow: ['..'] },
      host: env.AUDIT_DEV_HOST || '127.0.0.1',
      port: Number(env.AUDIT_PORT || 4040),
      strictPort: true,
    },
    preview: {
      port: Number(env.AUDIT_PORT || 4040),
      strictPort: true,
    },
    resolve: {
      alias: {
        '@': path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'src'),
      },
    },
    envDir: repoRoot,
    envPrefix: ['VITE_', 'EXPO_PUBLIC_', 'SUPABASE_'],
  };
});
