const http = require('http');
const fs   = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);
const REPO_ROOT = path.join(__dirname, '..');

const HTML_PATH = path.join(__dirname, 'pulse_db_audit.html');
const ENV_PATH = path.join(__dirname, '../.env');
const PORT = Number(process.env.AUDIT_PORT || 4040);

function loadEnv() {
  require('dotenv').config({ path: ENV_PATH, override: true });
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) {
    throw new Error('Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY in .env');
  }
  return { url, key, service };
}

function buildHtml() {
  const { url, key, service } = loadEnv();
  const inject = `<script>window.__SB_URL__=${JSON.stringify(url)};window.__SB_KEY__=${JSON.stringify(key)};window.__SB_SERVICE_KEY__=${JSON.stringify(service)};</script>`;
  const raw = fs.readFileSync(HTML_PATH, 'utf8');
  return raw.replace('</head>', inject + '\n</head>');
}

try {
  const boot = loadEnv();
  const live = boot.service ? ' · live DB on' : ' · add SUPABASE_SERVICE_ROLE_KEY to .env for live DB';
  console.log(`Pulse DB Audit → http://localhost:${PORT}${live}`);
  console.log('Reload: refresh the browser (HTML + .env re-read each request).');
} catch (e) {
  console.error(e.message);
  process.exit(1);
}

function parseTableRef(ref) {
  const raw = String(ref || '').trim();
  if (!raw) return null;
  const parts = raw.split('.');
  if (parts.length >= 2) {
    return { schema: parts[0], table: parts.slice(1).join('.') };
  }
  return { schema: 'public', table: raw };
}

function sqlLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

async function fetchTableColumns(schema, table) {
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
    { cwd: REPO_ROOT, maxBuffer: 10 * 1024 * 1024 },
  );
  const parsed = JSON.parse(stdout);
  return Array.isArray(parsed) ? parsed : (parsed.rows || []);
}

async function handleTableSchema(req, res, url) {
  const ref = url.searchParams.get('ref');
  const parsed = parseTableRef(ref);
  if (!parsed) {
    res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'Missing or invalid ref (e.g. public.profiles).' }));
    return;
  }
  try {
    const columns = await fetchTableColumns(parsed.schema, parsed.table);
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    res.end(JSON.stringify({ columns, error: null }));
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      columns: [],
      error: `${parsed.schema}.${parsed.table}: ${e.message || 'schema query failed'}`,
    }));
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://localhost:${PORT}`);
    if (url.pathname === '/api/table-schema') {
      await handleTableSchema(req, res, url);
      return;
    }
    const html = buildHtml();
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    res.end(html);
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(e.message);
  }
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use (audit server may already be running).`);
    console.error(`Open http://localhost:${PORT} or stop the other process, then retry.`);
    process.exit(1);
  }
  throw err;
});

server.listen(PORT);
