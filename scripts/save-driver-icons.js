/**
 * Reads a JSON file with an "assets" array (each: dataUrl, fileName)
 * and saves each dataUrl as a PNG in assets/drivers/ using fileName.
 *
 * Usage:
 *   node scripts/save-driver-icons.js [path-to.json]
 * Default path: ./driver-icons.json (project root)
 *
 * Get the JSON: In the browser where you see the blob, copy the JSON from the
 * page that provided the blob, then save to driver-icons.json.
 */

const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const jsonPath = path.resolve(projectRoot, process.argv[2] || 'driver-icons.json');
const outDir = path.join(projectRoot, 'assets', 'drivers');

function main() {
  if (!fs.existsSync(jsonPath)) {
    console.error('JSON file not found:', jsonPath);
    console.error('Save your JSON (from the blob source) to driver-icons.json in the project root, then run:');
    console.error('  node scripts/save-driver-icons.js');
    process.exit(1);
  }

  const raw = fs.readFileSync(jsonPath, 'utf8');
  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    console.error('Invalid JSON:', e.message);
    process.exit(1);
  }

  const assets = data?.assets;
  if (!Array.isArray(assets)) {
    console.error('JSON must have an "assets" array with objects containing "dataUrl" and "fileName".');
    process.exit(1);
  }

  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  let saved = 0;
  for (const item of assets) {
    const { dataUrl, fileName } = item;
    if (!dataUrl || !fileName) {
      console.warn('Skipping item missing dataUrl or fileName:', item);
      continue;
    }
    const match = dataUrl.match(/^data:image\/\w+;base64,(.+)$/);
    if (!match) {
      console.warn('Skipping invalid dataUrl (expected data:image/...;base64,...):', fileName);
      continue;
    }
    const base64 = match[1];
    const base = path.basename(fileName, path.extname(fileName));
    const safeName = (base.replace(/[^a-zA-Z0-9._-]/g, '_') || 'driver') + '.png';
    const outPath = path.join(outDir, safeName);
    try {
      fs.writeFileSync(outPath, Buffer.from(base64, 'base64'));
      console.log('Saved:', outPath);
      saved++;
    } catch (e) {
      console.error('Failed to write', outPath, e.message);
    }
  }
  console.log('Done. Saved', saved, 'file(s) to', outDir);
}

main();
