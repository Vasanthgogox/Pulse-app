/**
 * Dev-server env bootstrap — loaded from metro.config.js and run-expo.js so
 * `npx expo start` gets the same memory/worker limits as `npm start`.
 *
 * NODE_OPTIONS heap is only applied to child processes spawned after this runs;
 * prefer `npm start` which sets heap on the root Node process via run-expo.js.
 */
const os = require('os');

const nodeOpts = String(process.env.NODE_OPTIONS ?? '');
if (!nodeOpts.includes('max-old-space-size')) {
  process.env.NODE_OPTIONS = [nodeOpts, '--max-old-space-size=8192']
    .filter(Boolean)
    .join(' ')
    .trim();
}

if (!process.env.METRO_MAX_WORKERS) {
  const cpuCount = os.cpus().length;
  process.env.METRO_MAX_WORKERS = String(Math.min(4, Math.max(2, cpuCount - 1)));
}

process.env.DOTENV_CONFIG_QUIET = process.env.DOTENV_CONFIG_QUIET ?? 'true';
