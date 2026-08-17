// Shared credential loader for the manual smoke scripts in this folder.
//
// These credentials used to be hardcoded in each script, which meant a working login
// sat in tracked files. They now come from e2e/.env.e2e (gitignored) — the same file
// the Playwright suite uses, so there is one place to update and nothing to commit.
//
// No fallback value on purpose: a missing credential should stop the script with a
// clear message rather than silently driving the browser as a logged-out user.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ENV_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../e2e/.env.e2e',
);

/** Minimal KEY=VALUE parser — avoids depending on dotenv from a bare node script. */
function readEnvFile(file) {
  if (!fs.existsSync(file)) return {};
  const out = {};
  for (const raw of fs.readFileSync(file, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    out[line.slice(0, eq).trim()] = line
      .slice(eq + 1)
      .trim()
      .replace(/^["']|["']$/g, '');
  }
  return out;
}

export function loadCredentials() {
  const fromFile = readEnvFile(ENV_PATH);
  // Real env vars win, so CI or a one-off shell override still works.
  const email = process.env.E2E_EMAIL || fromFile.E2E_EMAIL;
  const password = process.env.E2E_PASSWORD || fromFile.E2E_PASSWORD;

  if (!email || !password) {
    throw new Error(
      'Missing E2E_EMAIL / E2E_PASSWORD.\n' +
        'Copy e2e/.env.e2e.example to e2e/.env.e2e and fill in a dedicated QA account.',
    );
  }
  return { email, password };
}

export function loadMemberId() {
  return process.env.E2E_MEMBER_ID || readEnvFile(ENV_PATH).E2E_MEMBER_ID || '';
}
