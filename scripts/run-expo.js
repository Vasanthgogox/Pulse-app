#!/usr/bin/env node
/**
 * Unified Expo CLI launcher — always applies dev memory + worker limits.
 * Use via npm scripts (`npm start`, `npm run web`) so `npx expo start` alone
 * does not OOM during large graph bundles.
 */
const { spawn } = require('child_process');
const path = require('path');

const projectRoot = path.join(__dirname, '..');

require('dotenv').config({
  path: path.join(projectRoot, '.env'),
  quiet: true,
});

const nodeOpts = String(process.env.NODE_OPTIONS ?? '');
if (!nodeOpts.includes('max-old-space-size')) {
  process.env.NODE_OPTIONS = [nodeOpts, '--max-old-space-size=8192']
    .filter(Boolean)
    .join(' ')
    .trim();
}

if (!process.env.METRO_MAX_WORKERS) {
  process.env.METRO_MAX_WORKERS = '4';
}

process.env.DOTENV_CONFIG_QUIET = process.env.DOTENV_CONFIG_QUIET ?? 'true';

const expoBin = path.join(projectRoot, 'node_modules/expo/bin/cli');
const args = process.argv.slice(2);

const child = spawn(
  process.execPath,
  ['-r', 'dotenv/config', expoBin, ...args],
  {
    cwd: projectRoot,
    stdio: 'inherit',
    env: process.env,
  },
);

child.on('exit', (code, signal) => {
  process.exit(code ?? (signal ? 1 : 0));
});
