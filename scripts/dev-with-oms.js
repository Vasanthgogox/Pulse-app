#!/usr/bin/env node
/**
 * Start Pulse web (Expo) + Commerce Vite dev server together.
 * Commerce must be listening before Expo — Metro proxies /oms/* → :3004.
 */
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');

const projectRoot = path.join(__dirname, '..');
const OMS_DEV_PORT = Number(process.env.OMS_DEV_PORT || 3004);
const OMS_DEV_HOST = process.env.OMS_DEV_HOST || '127.0.0.1';
const OMS_HEALTH_URL = `http://${OMS_DEV_HOST}:${OMS_DEV_PORT}/oms/`;

const children = [];

function spawnNamed(name, command, args, extraEnv = {}) {
  const child = spawn(command, args, {
    cwd: projectRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, ...extraEnv },
  });
  child.on('exit', (code, signal) => {
    if (signal) {
      console.error(`[dev-with-oms] ${name} exited (${signal})`);
    } else if (code && code !== 0) {
      console.error(`[dev-with-oms] ${name} exited with code ${code}`);
    }
    shutdown(code ?? (signal ? 1 : 0));
  });
  children.push(child);
  return child;
}

let shuttingDown = false;
function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM');
  }
  setTimeout(() => process.exit(code), 250);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

function waitForCommerceReady(maxAttempts = 40, delayMs = 250) {
  return new Promise((resolve, reject) => {
    let attempt = 0;

    const tryOnce = () => {
      attempt += 1;
      const req = http.get(OMS_HEALTH_URL, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode < 500) {
          resolve();
          return;
        }
        if (attempt >= maxAttempts) {
          reject(new Error(`Commerce returned HTTP ${res.statusCode}`));
          return;
        }
        setTimeout(tryOnce, delayMs);
      });
      req.on('error', () => {
        if (attempt >= maxAttempts) {
          reject(new Error(`Commerce not reachable at ${OMS_HEALTH_URL}`));
          return;
        }
        setTimeout(tryOnce, delayMs);
      });
      req.setTimeout(2000, () => {
        req.destroy();
      });
    };

    tryOnce();
  });
}

async function main() {
  console.log('[dev-with-oms] Starting Commerce (Vite :%s)…', OMS_DEV_PORT);
  spawnNamed('oms', 'npm', ['run', 'dev', '--prefix', 'oms']);

  try {
    await waitForCommerceReady();
    console.log('[dev-with-oms] Commerce ready at %s', OMS_HEALTH_URL);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[dev-with-oms] Commerce failed to start:', message);
    console.error(
      '[dev-with-oms] Fix: free port %s or run `npm run oms:dev` and check errors.',
      OMS_DEV_PORT,
    );
    shutdown(1);
    return;
  }

  console.log('[dev-with-oms] Starting Pulse web (Expo)…');
  spawnNamed(
    'web',
    'npm',
    ['run', 'web'],
    {
      NODE_OPTIONS: process.env.NODE_OPTIONS || '--max-old-space-size=8192',
      METRO_MAX_WORKERS: process.env.METRO_MAX_WORKERS || '4',
      CI: 'false',
    },
  );
}

void main();
