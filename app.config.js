const path = require('path');
const fs = require('fs');

require('./scripts/expo-env');

// Load .env from same directory as this config file (project root)
const projectRoot = __dirname;
const envPath = path.join(projectRoot, '.env');
const envLocalPath = path.join(projectRoot, '.env.local');

require('dotenv').config({ path: envPath, override: true, quiet: true });
if (fs.existsSync(envLocalPath)) {
  require('dotenv').config({ path: envLocalPath, override: true, quiet: true });
}

// Fallback: if dotenv didn't set them (e.g. "injecting env (0)"), read .env from disk
function parseEnvFile(filePath) {
  const out = {};
  if (!fs.existsSync(filePath)) return out;
  const content = fs.readFileSync(filePath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))
      val = val.slice(1, -1);
    if (key) out[key] = val;
  }
  return out;
}

const envVars = parseEnvFile(envPath);
const localVars = fs.existsSync(envLocalPath) ? parseEnvFile(envLocalPath) : {};

// Source of truth order:
// 1) .env.local (developer override)
// 2) .env (project default)
// 3) process.env — CI only (Netlify injects these; no .env files are present there)
// Avoid process.env winning in local dev where stale shell vars could override the wrong project.
const isCI = process.env.CI === 'true';
let supabaseUrl =
  localVars.EXPO_PUBLIC_SUPABASE_URL ||
  envVars.EXPO_PUBLIC_SUPABASE_URL ||
  envVars.VITE_SUPABASE_URL ||
  (isCI ? process.env.EXPO_PUBLIC_SUPABASE_URL : '') ||
  '';
let supabaseAnonKey =
  localVars.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  envVars.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  envVars.VITE_SUPABASE_ANON_KEY ||
  (isCI ? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY : '') ||
  '';

let geminiApiKey =
  localVars.EXPO_PUBLIC_GEMINI_API_KEY ||
  envVars.EXPO_PUBLIC_GEMINI_API_KEY ||
  localVars.VITE_GEMINI_API_KEY ||
  envVars.VITE_GEMINI_API_KEY ||
  (isCI ? process.env.EXPO_PUBLIC_GEMINI_API_KEY : '') ||
  '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    '[pulse] Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY. Add them to .env in the project root and restart: npx expo start'
  );
} else {
  try {
    const host = new URL(supabaseUrl).hostname;
    console.log('[pulse][config] envPath:', envPath);
    console.log('[pulse][config] envLocalPath:', envLocalPath);
    console.log('[pulse][config] resolved Supabase host:', host);
  } catch (_) {
    // no-op
  }
}

const config = require('./app.json');

// Only include config plugins when their packages are installed (e.g. after npm install).
// This avoids "Failed to resolve plugin" when node_modules is missing or deps not installed.
const basePlugins = Array.isArray(config.expo?.plugins) ? config.expo.plugins : [];
let detoxAvailable = false;
let contactsAvailable = false;
try {
  require.resolve('expo-detox-config-plugin');
  detoxAvailable = true;
} catch (_) {}
try {
  require.resolve('expo-contacts');
  contactsAvailable = true;
} catch (_) {}
const pluginsFromConfig = basePlugins.filter(
  (p) => p !== 'expo-detox-config-plugin' || detoxAvailable
);
const expoContactsPlugin = contactsAvailable
  ? [['expo-contacts', { contactsPermission: 'Allow $(PRODUCT_NAME) to access your contacts to fill name and phone when adding clients, suppliers, or drivers.' }]]
  : [];

// react-native-maps 1.20.x does not ship an Expo config plugin; do not add it to plugins.
// For Android release, set Google Maps API key in native project (e.g. android/app/src/main/AndroidManifest.xml) if needed.

// Production (https Supabase URL): disable cleartext on Android. Local dev (http): allow.
const useCleartextTraffic = typeof supabaseUrl === 'string' && supabaseUrl.startsWith('http://');

// SPA mode for both dev and export. Pulse is an authenticated dashboard — SEO has no value
// inside the app, and static rendering forces the λ render.js server bundle (~3300 modules,
// ~5.8k-module server graph) to be built on every Netlify deploy, which is the dominant
// build-time cost. Netlify's /* → /index.html redirect handles client-side routing.
// PULSE_WEB_OUTPUT=static can reproduce the old static export mode locally if ever needed.
const webOutput = process.env.PULSE_WEB_OUTPUT || 'single';

module.exports = {
  ...config,
  expo: {
    ...config.expo,
    web: {
      ...config.expo?.web,
      output: webOutput,
    },
    extra: {
      supabaseUrl,
      supabaseAnonKey,
      geminiApiKey,
      // Use app/+not-found.tsx — built-in Unmatched.js crashes when async-loaded (StyleSheet undefined).
      router: {
        notFound: false,
      },
    },
    scheme: config.expo?.scheme ?? 'pulse',
    android: {
      ...config.expo?.android,
      permissions: ['android.permission.INTERNET'],
      softwareKeyboardLayoutMode: 'resize',
    },
    plugins: [
      ...pluginsFromConfig,
      ['expo-build-properties', { android: { usesCleartextTraffic: useCleartextTraffic }, ios: {} }],
      ...expoContactsPlugin,
    ].filter(Boolean),
  },
};
