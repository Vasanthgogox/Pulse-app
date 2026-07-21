import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
import path from "path";

/** Repo-root `.env` (Expo / shared Pulse). Maps to VITE_* for the admin console. */
const repoRoot = path.resolve(__dirname, "..");

export default defineConfig(({ mode }) => {
  const rootEnv = loadEnv(mode, repoRoot, "");
  const localEnv = loadEnv(mode, __dirname, "");
  const env = { ...rootEnv, ...localEnv };

  const supabaseUrl =
    env.VITE_SUPABASE_URL ||
    env.EXPO_PUBLIC_SUPABASE_URL ||
    env.SUPABASE_URL ||
    "";
  const serviceRoleKey =
    env.VITE_SUPABASE_SERVICE_ROLE_KEY ||
    env.SUPABASE_SERVICE_ROLE_KEY ||
    env.service_role_key ||
    "";
  const adminToken = env.VITE_ADMIN_TOKEN || "";
  const anonKey =
    env.VITE_SUPABASE_ANON_KEY || env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "";

  return {
    plugins: [react(), tailwind()],
    base: "/ops-9f3a2c/",
    resolve: {
      alias: { "@": path.resolve(__dirname, "./src") },
    },
    server: { port: 3002, strictPort: true },
    build: { sourcemap: false },
    // Prefer analytics/.env when present; otherwise inject from repo root.
    envDir: __dirname,
    define: {
      "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(supabaseUrl),
      "import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY":
        JSON.stringify(serviceRoleKey),
      "import.meta.env.VITE_SUPABASE_ANON_KEY": JSON.stringify(anonKey),
      "import.meta.env.VITE_ADMIN_TOKEN": JSON.stringify(adminToken),
    },
  };
});
