#!/usr/bin/env node
/**
 * Stop stray Metro/Expo dev servers (common cause of "Could not load bundle"
 * when multiple packagers fight over 8081/8084).
 */
const { execSync } = require("child_process");

const PORTS = [8081, 8082, 8083, 8084, 8085, 19000, 19001, 19002];

for (const port of PORTS) {
  try {
    const pids = execSync(`lsof -ti :${port} 2>/dev/null`, { encoding: "utf8" })
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    for (const pid of pids) {
      try {
        process.kill(Number(pid), "SIGTERM");
      } catch {
        /* already gone */
      }
    }
  } catch {
    /* nothing listening */
  }
}
