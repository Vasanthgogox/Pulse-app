#!/usr/bin/env node
/**
 * Wipe Metro cache locations used by this repo (local + legacy tmpdir).
 * Invoked by `npm run clean:metro` and `npm run clean:all`.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const roots = [
  path.join(__dirname, '..', '.metro-cache'),
  path.join(__dirname, '..', '.expo'),
  path.join(__dirname, '..', 'node_modules', '.cache', 'metro'),
  path.join(__dirname, '..', 'node_modules', '.cache'),
  path.join(os.tmpdir(), 'q-web-metro-cache'),
  path.join(os.tmpdir(), 'metro-cache'),
];

for (const root of roots) {
  try {
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
    console.log('[clear-metro-cache] removed', root);
  } catch (e) {
    console.warn('[clear-metro-cache] skip', root, e instanceof Error ? e.message : e);
  }
}
