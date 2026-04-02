/**
 * Seed script: populates the database with test data for clients, suppliers,
 * drivers, and trucks (vehicles) for an existing organization.
 *
 * Prerequisites:
 * - An organization already exists (e.g. created via sign-up).
 * - Environment: EXPO_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
 *   (service role bypasses RLS so the script can insert without auth).
 *
 * Usage:
 *   npm run seed
 *   # or: npx ts-node scripts/seed-test-data.ts
 *
 * Uses .env only (preprod URL + SUPABASE_SERVICE_ROLE_KEY). Get service_role from Dashboard → Settings → API.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { config as loadEnv } from 'dotenv';

// Seed always uses .env only (preprod). Do not load .env.local so app local/dev doesn't override.
loadEnv({ path: '.env' });

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error(
    'Missing env in .env: EXPO_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.\n' +
      'Seed uses .env only (preprod). Add preprod Project URL and service_role key from Dashboard → Settings → API.'
  );
  process.exit(1);
}

// Ensure we're using the service_role key (bypasses RLS), not anon
function getJwtRole(key: string): string | null {
  try {
    const payload = key.split('.')[1];
    if (!payload) return null;
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return decoded.role ?? null;
  } catch {
    return null;
  }
}
const keyRole = getJwtRole(serviceRoleKey);
if (keyRole !== 'service_role') {
  console.error(
    `SUPABASE_SERVICE_ROLE_KEY in .env has role "${keyRole ?? 'unknown'}", not "service_role".\n` +
      'Seed needs the service_role secret from Dashboard → Settings → API (Reveal and copy), not the anon key.'
  );
  process.exit(1);
}

const supabase: SupabaseClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

const COUNT = 3;
/** Short suffix so repeated seed runs don't hit unique constraints */
const runSuffix = Math.random().toString(36).slice(2, 8);

/** Organization to seed. Override with env SEED_ORGANIZATION_ID. */
const DEFAULT_ORGANIZATION_ID = '04349588-f3ee-408e-a2c3-d14005d45ac8';

interface OrganizationRow {
  id: string;
  name: string;
  slug: string | null;
  owner_id: string | null;
  operating_model: string;
  created_at: string;
  updated_at: string;
}

async function fetchOrganization(organizationId: string): Promise<OrganizationRow | null> {
  const { data, error } = await supabase
    .from('organizations')
    .select('id, name, slug, owner_id, operating_model, created_at, updated_at')
    .eq('id', organizationId)
    .maybeSingle();

  if (error) {
    console.error('Failed to fetch organization:', error.message);
    if (error.message.includes('permission denied')) {
      console.error(
        '\n→ Key is service_role; if the error persists, preprod may need table grants.\n' +
          '  In Supabase Dashboard → SQL Editor run:\n' +
          '  GRANT USAGE ON SCHEMA public TO service_role;\n' +
          '  GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO service_role;'
      );
    }
    return null;
  }
  return data as OrganizationRow | null;
}

async function seedClients(organizationId: string): Promise<void> {
  const clients = [
    { name: 'Test Client A', contact_person: 'Contact A', phone: `+15550010001-${runSuffix}`, email: `client-a-${runSuffix}@test.example` },
    { name: 'Test Client B', contact_person: 'Contact B', phone: `+15550010002-${runSuffix}`, email: `client-b-${runSuffix}@test.example` },
    { name: 'Test Client C', contact_person: 'Contact C', phone: `+15550010003-${runSuffix}`, email: `client-c-${runSuffix}@test.example` },
  ];

  for (const c of clients) {
    const { error } = await supabase.from('clients').insert({
      organization_id: organizationId,
      name: c.name,
      contact_person: c.contact_person,
      phone: c.phone,
      email: c.email,
      status: 'active',
    });
    if (error) {
      console.error('Client insert failed:', c.name, error.message);
      throw error;
    }
  }
  console.log(`  Created ${COUNT} clients.`);
}

async function seedSuppliers(organizationId: string): Promise<void> {
  const suppliers = [
    { company_name: 'Test Supplier A', contact_person: 'Supplier A', phone: `+15550020001-${runSuffix}`, email: `supplier-a-${runSuffix}@test.example` },
    { company_name: 'Test Supplier B', contact_person: 'Supplier B', phone: `+15550020002-${runSuffix}`, email: `supplier-b-${runSuffix}@test.example` },
    { company_name: 'Test Supplier C', contact_person: 'Supplier C', phone: `+15550020003-${runSuffix}`, email: `supplier-c-${runSuffix}@test.example` },
  ];

  for (const s of suppliers) {
    const { error } = await supabase.from('suppliers').insert({
      organization_id: organizationId,
      company_name: s.company_name,
      contact_person: s.contact_person,
      phone: s.phone,
      email: s.email,
      is_active: true,
      is_verified: false,
      operating_areas: [],
      vehicle_types: ['32FT', '20FT'],
      supplier_type: 'offline',
    });
    if (error) {
      console.error('Supplier insert failed:', s.company_name, error.message);
      throw error;
    }
  }
  console.log(`  Created ${COUNT} suppliers.`);
}

async function seedDrivers(organizationId: string): Promise<void> {
  const drivers = [
    { name: 'Test Driver Alpha', phone: `+15550030001-${runSuffix}`, email: `driver-alpha-${runSuffix}@test.example` },
    { name: 'Test Driver Beta', phone: `+15550030002-${runSuffix}`, email: `driver-beta-${runSuffix}@test.example` },
    { name: 'Test Driver Gamma', phone: `+15550030003-${runSuffix}`, email: `driver-gamma-${runSuffix}@test.example` },
  ];

  for (const d of drivers) {
    const { error } = await supabase.from('drivers').insert({
      organization_id: organizationId,
      name: d.name,
      phone: d.phone,
      email: d.email,
      status: 'offline',
    });
    if (error) {
      console.error('Driver insert failed:', d.name, error.message);
      throw error;
    }
  }
  console.log(`  Created ${COUNT} drivers.`);
}

async function seedTrucks(organizationId: string): Promise<void> {
  const trucks = [
    { vehicle_number: `TRK-SEED-001-${runSuffix}`, vehicle_type: '32FT' },
    { vehicle_number: `TRK-SEED-002-${runSuffix}`, vehicle_type: '20FT' },
    { vehicle_number: `TRK-SEED-003-${runSuffix}`, vehicle_type: '32FT' },
  ];

  for (const t of trucks) {
    const { error } = await supabase.from('vehicles').insert({
      organization_id: organizationId,
      vehicle_number: t.vehicle_number,
      vehicle_type: t.vehicle_type,
      type: 'owned',
      status: 'active',
    });
    if (error) {
      console.error('Vehicle insert failed:', t.vehicle_number, error.message);
      throw error;
    }
  }
  console.log(`  Created ${COUNT} trucks (vehicles).`);
}

async function main(): Promise<void> {
  const organizationId = process.env.SEED_ORGANIZATION_ID ?? DEFAULT_ORGANIZATION_ID;
  console.log(`Using organization ID: ${organizationId}`);
  const org = await fetchOrganization(organizationId);
  if (!org) {
    console.error('Organization not found. Check that the ID exists in the database.');
    process.exit(1);
  }

  console.log(`Organization: ${org.name} (${org.id})\n`);

  await seedClients(org.id);
  await seedSuppliers(org.id);
  await seedDrivers(org.id);
  await seedTrucks(org.id);

  console.log('\nSeed completed successfully.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
