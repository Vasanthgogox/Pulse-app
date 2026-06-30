import { readdirSync, readFileSync, statSync } from 'fs';
import path from 'path';

const DIRECT_DB_PATTERNS = [
  /\.schema\s*\(/,
  /platformSchema\s*\(/,
  /\.from\s*\(\s*['"]/,
  /\.rpc\s*\(/,
  /createClient\s*\(/,
];

const ALLOWED_DB_IMPORT = "from '../db/client'";
const ALLOWED_DB_IMPORT_ALT = 'from "../db/client"';

export interface RepositoryIsolationViolation {
  file:     string;
  pattern:  string;
  line:     number;
  snippet:  string;
}

export function scanRepositoryIsolation(rootDir: string): RepositoryIsolationViolation[] {
  const violations: RepositoryIsolationViolation[] = [];
  const repoDir = path.join(rootDir, 'repositories');
  const dbClientPath = path.join(rootDir, 'db', 'client.ts');

  walkTsFiles(rootDir, filePath => {
    if (filePath.startsWith(repoDir) || filePath === dbClientPath) return;

    const rel = path.relative(rootDir, filePath);
    const layer = rel.split(path.sep)[0];
    if (!['api', 'services', 'middleware', 'jwt', 'validation', 'http'].includes(layer)) return;

    const content = readFileSync(filePath, 'utf8');
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const pattern of DIRECT_DB_PATTERNS) {
        if (pattern.test(line)) {
          violations.push({
            file:    rel,
            pattern: pattern.source,
            line:    i + 1,
            snippet: line.trim(),
          });
        }
      }
    }

    if (layer === 'middleware' && content.includes("from '../db/client'")) {
      violations.push({
        file:    rel,
        pattern: 'middleware imports db/client',
        line:    0,
        snippet: "import from '../db/client'",
      });
    }

    if (layer === 'services' && content.includes('@supabase/supabase-js')) {
      violations.push({
        file:    rel,
        pattern: 'service imports @supabase/supabase-js',
        line:    0,
        snippet: '@supabase/supabase-js',
      });
    }
  });

  return violations;
}

function walkTsFiles(dir: string, onFile: (absPath: string) => void): void {
  for (const entry of readdirSync(dir)) {
    const abs = path.join(dir, entry);
    const st = statSync(abs);
    if (st.isDirectory()) {
      if (entry === 'node_modules' || entry === 'dist' || entry === 'tests') continue;
      walkTsFiles(abs, onFile);
      continue;
    }
    if (entry.endsWith('.ts') && !entry.endsWith('.d.ts')) onFile(abs);
  }
}

export function assertRepositoryIsolation(rootDir: string): void {
  const violations = scanRepositoryIsolation(rootDir);
  if (violations.length > 0) {
    const msg = violations
      .map(v => `${v.file}:${v.line} — ${v.pattern} — ${v.snippet}`)
      .join('\n');
    throw new Error(`Repository isolation violations:\n${msg}`);
  }
}
