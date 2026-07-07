#!/usr/bin/env node
// Boots the Expo web dev server, waits for Metro to be ready, then requests
// /terminal-website to trigger + time the bundle. Exits non-zero on failure.

import { spawn } from 'node:child_process';
import http from 'node:http';

const PORT = 8081;
const ROUTE = '/terminal-website';
const BASE = `http://localhost:${PORT}`;
const SERVER_READY_TIMEOUT = 120_000; // wait for Metro to boot
const BUNDLE_TIMEOUT = 600_000; // first web bundle can be slow

const log = (m) => console.log(`[test] ${m}`);

function get(path, timeout) {
  return new Promise((resolve, reject) => {
    const req = http.get(`${BASE}${path}`, { timeout }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('timeout', () => req.destroy(new Error('request timeout')));
    req.on('error', reject);
  });
}

async function waitForServer() {
  const start = Date.now();
  while (Date.now() - start < SERVER_READY_TIMEOUT) {
    try {
      const res = await get('/', 10_000);
      if (res.status && res.status < 500) {
        log(`server up after ${((Date.now() - start) / 1000).toFixed(1)}s`);
        return;
      }
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error('server did not become ready in time');
}

async function isServerUp() {
  try {
    const res = await get('/', 3_000);
    return res.status && res.status < 500;
  } catch {
    return false;
  }
}

async function main() {
  let server = null;
  const shutdown = () => {
    if (!server) return; // reused an existing server — leave it running
    try { process.kill(-server.pid); } catch {}
    try { server.kill('SIGTERM'); } catch {}
  };
  process.on('exit', shutdown);
  process.on('SIGINT', () => { shutdown(); process.exit(130); });

  try {
    if (await isServerUp()) {
      log(`reusing existing dev server on :${PORT}`);
    } else {
      log('starting expo web dev server...');
      server = spawn('npm', ['run', 'web'], {
        cwd: process.cwd(),
        env: { ...process.env, CI: 'false' },
        stdio: ['ignore', 'inherit', 'inherit'],
        detached: true,
      });
      await waitForServer();
    }

    // 1) Fetch the route HTML shell.
    log(`requesting page ${ROUTE} ...`);
    const page = await get(ROUTE, BUNDLE_TIMEOUT);
    if (page.status !== 200) {
      throw new Error(`${ROUTE} returned HTTP ${page.status}`);
    }

    // 2) Force Metro to actually compile the JS bundle (the slow part).
    //    Expo Router web serves the entry bundle from /index.bundle.
    const BUNDLE_URL = '/index.bundle?platform=web&dev=true&hot=false';
    log(`compiling bundle (${BUNDLE_URL}) — this is the slow step...`);
    const t0 = Date.now();
    const bundle = await get(BUNDLE_URL, BUNDLE_TIMEOUT);
    const secs = ((Date.now() - t0) / 1000).toFixed(1);

    if (bundle.status !== 200) {
      throw new Error(`bundle returned HTTP ${bundle.status}`);
    }
    // A valid Metro bundle starts with its runtime preamble; error responses
    // are short JSON/HTML payloads instead.
    if (!bundle.body.startsWith('var __BUNDLE_START_TIME__')) {
      throw new Error('response was not a valid Metro bundle (compile error?)');
    }

    const kb = (bundle.body.length / 1024).toFixed(0);
    log(`✓ ${ROUTE} served + bundle compiled (${kb} KB) in ${secs}s`);
    log('PASS');
    process.exit(0);
  } catch (err) {
    console.error(`[test] FAIL: ${err.message}`);
    process.exit(1);
  } finally {
    shutdown();
  }
}

main();
