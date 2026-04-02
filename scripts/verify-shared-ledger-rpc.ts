/**
 * One-off script to verify get_shared_ledger_entries RPC (supplier view).
 * Run: npx ts-node --compiler-options '{"module":"CommonJS","moduleResolution":"node"}' scripts/verify-shared-ledger-rpc.ts
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

const ORG_ID = 'cf49d70b-dd39-4781-9572-200818b03e15';   // Nihas (supplier) org
const PARTNER_KEY = 'f9071235-547c-487e-bf56-233373433097'; // Mukunt (client) contact_id

async function main() {
  if (!SUPABASE_URL || !SUPABASE_ANON) {
    console.error('Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY in .env');
    process.exit(1);
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON);
  console.log('Calling get_shared_ledger_entries(org_id, partner_key)');
  console.log('  org_id     =', ORG_ID);
  console.log('  partner_key=', PARTNER_KEY);
  const { data, error } = await supabase.rpc('get_shared_ledger_entries', {
    org_id: ORG_ID,
    partner_key: PARTNER_KEY,
  });
  if (error) {
    console.error('RPC error:', error.message);
    process.exit(1);
  }
  console.log('Result rows:', Array.isArray(data) ? data.length : 0);
  console.log(JSON.stringify(data, null, 2));
}

main();
