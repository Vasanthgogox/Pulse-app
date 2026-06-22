const http = require('http');
const fs   = require('fs');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!URL || !KEY) {
  console.error('Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY in .env');
  process.exit(1);
}

const inject = `<script>window.__SB_URL__="${URL}";window.__SB_KEY__="${KEY}";</script>`;
const html = fs.readFileSync(path.join(__dirname, 'pulse_db_audit.html'), 'utf8')
               .replace('</head>', inject + '\n</head>');

http.createServer((_, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
}).listen(4040, () => {
  console.log('Pulse DB Audit → http://localhost:4040');
});
