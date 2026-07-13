import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import type { Plugin } from 'vite';

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function parseTableRef(ref: string | null) {
  const raw = String(ref || '').trim();
  if (!raw) return null;
  const parts = raw.split('.');
  if (parts.length >= 2) {
    return { schema: parts[0], table: parts.slice(1).join('.') };
  }
  return { schema: 'public', table: raw };
}

function sqlLiteral(value: string) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

async function fetchTableColumns(schema: string, table: string) {
  const sql = [
    'SELECT column_name, data_type, udt_name, is_nullable, ordinal_position',
    'FROM information_schema.columns',
    `WHERE table_schema = ${sqlLiteral(schema)}`,
    `AND table_name = ${sqlLiteral(table)}`,
    'ORDER BY ordinal_position',
  ].join(' ');
  const { stdout } = await execFileAsync(
    'supabase',
    ['db', 'query', sql, '--linked', '-o', 'json'],
    { cwd: repoRoot, maxBuffer: 10 * 1024 * 1024 },
  );
  const parsed = JSON.parse(stdout) as { rows?: unknown[] } | unknown[];
  return Array.isArray(parsed) ? parsed : (parsed.rows || []);
}

async function handleTableSchemaRequest(
  req: import('http').IncomingMessage,
  res: import('http').ServerResponse,
  next: () => void,
) {
  if (!req.url?.startsWith('/api/table-schema')) {
    next();
    return;
  }
  try {
    const url = new URL(req.url, 'http://localhost');
    const parsed = parseTableRef(url.searchParams.get('ref'));
    if (!parsed) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Missing ref (e.g. public.profiles).' }));
      return;
    }
    const columns = await fetchTableColumns(parsed.schema, parsed.table);
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify({ columns, error: null }));
  } catch (e) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        columns: [],
        error: e instanceof Error ? e.message : 'schema query failed',
      }),
    );
  }
}

/** Dev/preview middleware: schema introspection via linked Supabase CLI. */
export function auditApiPlugin(): Plugin {
  return {
    name: 'pulse-audit-api',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        void handleTableSchemaRequest(req, res, next);
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        void handleTableSchemaRequest(req, res, next);
      });
    },
  };
}
