/**
 * CI guard: the driver wallet's fleet-vs-open classification depends on fields
 * that trips_driver_view must actually project.
 *
 * WHY THIS EXISTS
 * ---------------
 * trips_driver_view once omitted organization_id. driverRowToTripRow filled the
 * gap with `organization_id: ''`, and DriverWalletScreen's isEmployerOrgAtDate
 * opens with `if (!orgId) return false`. Result: every driver trip classified as
 * a non-employer "Direct trip", the Fleet Trips tab was structurally always
 * empty, and drivers filed attribution requests for work already recorded.
 *
 * Nothing failed loudly. No exception, no type error, no failing query — the
 * mapper's default was plausible, so the bug was invisible until someone noticed
 * an empty tab. This script makes that failure mode loud instead.
 *
 * WHAT IT CHECKS
 *   1. The latest CREATE OR REPLACE VIEW trips_driver_view projects every
 *      load-bearing column.
 *   2. driverRowToTripRow does not hardcode organization_id or source.
 *
 * Run: npx tsx scripts/check-driver-view-contract.ts
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');
const MIGRATIONS_DIR = join(ROOT, 'supabase', 'migrations');
const TRIP_VIEWS = join(ROOT, 'types', 'trip-views.ts');

/**
 * Columns the driver app cannot function without.
 * organization_id → fleet-vs-open classification (isEmployerOrgAtDate)
 * source          → identifies mover_asset supplier-side rows
 * completed_at    → settlement + history ordering
 */
const REQUIRED_VIEW_COLUMNS = [
  'organization_id',
  'organization_name',
  'source',
  'supplier_id',
  'completed_at',
  'trip_number',
];

const errors: string[] = [];

/** Last migration that redefines trips_driver_view wins — that's the live shape. */
function findLatestViewDefinition(): { file: string; body: string } | null {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (let i = files.length - 1; i >= 0; i--) {
    const sql = readFileSync(join(MIGRATIONS_DIR, files[i]), 'utf8');
    const match = sql.match(
      /CREATE\s+OR\s+REPLACE\s+VIEW\s+(?:public\.)?trips_driver_view\b[\s\S]*?;/i,
    );
    if (match) return { file: files[i], body: match[0] };
  }
  return null;
}

const viewDef = findLatestViewDefinition();

if (!viewDef) {
  errors.push(
    'No migration defines trips_driver_view. The driver wallet reads this view; ' +
      'it must be created in a migration so the schema is reproducible.',
  );
} else {
  // Strip comments so a column named only inside a -- comment never counts.
  const sqlNoComments = viewDef.body
    .replace(/--[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');

  for (const col of REQUIRED_VIEW_COLUMNS) {
    const projected = new RegExp(`(^|[\\s,(.])${col}(\\s|,|$)`, 'm').test(sqlNoComments);
    if (!projected) {
      errors.push(
        `trips_driver_view (${viewDef.file}) does not project "${col}".\n` +
          `  The driver app needs it; without it the mapper substitutes a default\n` +
          `  and classification fails silently — no error, just an empty Fleet tab.`,
      );
    }
  }

  // organization_name must be resolved via the SECURITY DEFINER helper. A plain
  // JOIN silently yields NULL for every driver (security_invoker + is_org_member),
  // which is exactly how this bug shipped — it looks correct and returns nothing.
  if (
    /organization_name/i.test(sqlNoComments) &&
    !/org_display_name\s*\(/i.test(sqlNoComments)
  ) {
    errors.push(
      `trips_driver_view (${viewDef.file}) selects organization_name without\n` +
        `  public.org_display_name(). A direct JOIN to organizations returns NULL for\n` +
        `  every driver: the view is security_invoker, so the join runs under the\n` +
        `  caller's RLS and the organizations policy is is_org_member(id) — drivers\n` +
        `  are never members of the org that hires them. Use the helper function.`,
    );
  }

  if (!/security_invoker/i.test(sqlNoComments)) {
    errors.push(
      `trips_driver_view (${viewDef.file}) is missing security_invoker = true.\n` +
        `  Without it the view runs as owner and bypasses the caller's RLS.`,
    );
  }
}

// ── Guard the mapper against re-hardcoding ───────────────────────────────────
const mapperSrc = readFileSync(TRIP_VIEWS, 'utf8');
const driverMapper = mapperSrc.match(
  /export function driverRowToTripRow[\s\S]*?\n}/,
)?.[0];

if (!driverMapper) {
  errors.push('Could not locate driverRowToTripRow in types/trip-views.ts.');
} else {
  if (/organization_id:\s*['"]['"]/.test(driverMapper)) {
    errors.push(
      "driverRowToTripRow hardcodes organization_id: ''.\n" +
        '  This is the original bug: it makes every driver trip look like it has no\n' +
        '  owning org, so isEmployerOrgAtDate returns false and the Fleet Trips tab\n' +
        '  is always empty. Use `row.organization_id ?? \'\'`.',
    );
  }
  if (/source:\s*['"][a-z_]+['"]\s*,/.test(driverMapper)) {
    errors.push(
      'driverRowToTripRow hardcodes a literal `source`.\n' +
        '  mover_asset rows must stay identifiable. Use `row.source ?? \'assigned\'`.',
    );
  }
}

if (errors.length > 0) {
  console.error('\n✗ Driver view contract violated:\n');
  errors.forEach((e) => console.error(`  • ${e}\n`));
  console.error(
    'These fields are load-bearing for driver trip classification.\n' +
      'See supabase/migrations/20270118000000_driver_view_expose_org_and_source.sql\n',
  );
  process.exit(1);
}

console.log('✓ Driver view contract intact');
console.log(`  view: ${viewDef?.file}`);
console.log(`  columns verified: ${REQUIRED_VIEW_COLUMNS.join(', ')}`);
