#!/usr/bin/env node
// STRICTLY READ-ONLY inspection script for validation-pass ground truth.
// Uses service_role_key from .env (bypasses RLS for read visibility only).
// Every call below is a .select() — no insert/update/delete/upsert/rpc-that-mutates.
// This script is not part of the app and is never committed.

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envText = fs.readFileSync(new URL('../.env', import.meta.url), 'utf8');
function getEnvVal(key) {
  const lines = envText.split('\n').filter((l) => l.trim().startsWith(`${key}=`) && !l.trim().startsWith('#'));
  const last = lines[lines.length - 1];
  return last ? last.split('=').slice(1).join('=').trim() : null;
}
const url = getEnvVal('EXPO_PUBLIC_SUPABASE_URL');
const serviceKey = getEnvVal('service_role_key');

if (!url || !serviceKey) {
  console.error('Missing URL or service_role_key in .env');
  process.exit(1);
}

const db = createClient(url, serviceKey, { auth: { persistSession: false } });

async function main() {
  console.log('=== 1. Driver "Sadam" (9008008008) — profile + drivers rows ===');
  const { data: profiles, error: profErr } = await db
    .from('profiles')
    .select('id, phone, full_name, role')
    .ilike('phone', '%9008008008%')
    .limit(5);
  console.log('profiles:', JSON.stringify(profiles, null, 2), profErr ?? '');

  const uid = profiles?.[0]?.id;
  if (!uid) {
    console.log('No profile found for that phone — cannot continue driver-specific queries.');
  } else {
    console.log(`\n=== drivers rows for user_id=${uid} ===`);
    const { data: driverRows, error: dErr } = await db
      .from('drivers')
      .select('id, organization_id, name, phone, user_id, status, tracking_only, left_at, payable_amount, commission_percent, commission_per_km, created_at')
      .eq('user_id', uid);
    console.log(JSON.stringify(driverRows, null, 2), dErr ?? '');

    console.log(`\n=== organization_members rows for user_id=${uid} ===`);
    const { data: omRows, error: omErr } = await db
      .from('organization_members')
      .select('id, organization_id, role, status, created_at')
      .eq('user_id', uid);
    console.log(JSON.stringify(omRows, null, 2), omErr ?? '');

    if (driverRows?.length) {
      const orgIds = [...new Set(driverRows.map((d) => d.organization_id))];
      console.log(`\n=== organizations for those org_ids ===`);
      const { data: orgs, error: orgErr } = await db
        .from('organizations')
        .select('id, name, operating_model')
        .in('id', orgIds);
      console.log(JSON.stringify(orgs, null, 2), orgErr ?? '');

      console.log(`\n=== trips where driver_id in driverRows.id, recent ===`);
      const driverIds = driverRows.map((d) => d.id);
      const { data: trips, error: tripErr } = await db
        .from('trips')
        .select('id, organization_id, supplier_id, driver_id, status, trip_number, client_price, supplier_rate, driver_commission, pickup_area, drop_location, created_at, trip_payout_mode')
        .in('driver_id', driverIds)
        .order('created_at', { ascending: false })
        .limit(10);
      console.log(JSON.stringify(trips, null, 2), tripErr ?? '');
    }
  }

  console.log('\n=== 2. Any drivers rows with tracking_only=true (sample) ===');
  const { data: trackingOnlyDrivers, error: toErr } = await db
    .from('drivers')
    .select('id, organization_id, name, phone, user_id, tracking_only, payable_amount, commission_percent, commission_per_km')
    .eq('tracking_only', true)
    .limit(10);
  console.log(JSON.stringify(trackingOnlyDrivers, null, 2), toErr ?? '');

  console.log('\n=== 3. Cross-check: tracking_only drivers whose user_id ALSO has an organization_members row (signal conflict candidates) ===');
  if (trackingOnlyDrivers?.length) {
    const uids = [...new Set(trackingOnlyDrivers.map((d) => d.user_id).filter(Boolean))];
    if (uids.length) {
      const { data: omConflicts, error: omcErr } = await db
        .from('organization_members')
        .select('user_id, organization_id, role, status')
        .in('user_id', uids)
        .eq('role', 'driver');
      console.log(JSON.stringify(omConflicts, null, 2), omcErr ?? '');
    } else {
      console.log('No tracking_only drivers had a user_id set.');
    }
  }

  console.log('\n=== 4. Trips assigned to tracking_only drivers (for Test 1 ground truth) ===');
  if (trackingOnlyDrivers?.length) {
    const toIds = trackingOnlyDrivers.map((d) => d.id);
    const { data: toTrips, error: toTripErr } = await db
      .from('trips')
      .select('id, organization_id, supplier_id, driver_id, status, trip_number, client_price, supplier_rate, driver_commission, created_at')
      .in('driver_id', toIds)
      .order('created_at', { ascending: false })
      .limit(10);
    console.log(JSON.stringify(toTrips, null, 2), toTripErr ?? '');
  }

  console.log('\n=== 5. Sample drivers rows WITH real commission terms configured (for Test 2 ground truth) ===');
  const { data: realComp, error: realErr } = await db
    .from('drivers')
    .select('id, organization_id, name, tracking_only, payable_amount, commission_percent, commission_per_km, left_at')
    .or('payable_amount.gt.0,commission_percent.gt.0,commission_per_km.gt.0')
    .eq('tracking_only', false)
    .is('left_at', null)
    .limit(10);
  console.log(JSON.stringify(realComp, null, 2), realErr ?? '');

  console.log('\n=== 6. Pending trip_based salary_requests (for Test 4 ground truth) ===');
  const { data: salReqs, error: salErr } = await db
    .from('salary_requests')
    .select('id, driver_id, organization_id, request_type, status, amount, trip_ids, created_at')
    .eq('request_type', 'trip_based')
    .order('created_at', { ascending: false })
    .limit(10);
  console.log(JSON.stringify(salReqs, null, 2), salErr ?? '');

  console.log('\n=== 7. Attributed fleet trips (notes prefix match) ===');
  const { data: attributedTrips, error: attrErr } = await db
    .from('trips')
    .select('id, organization_id, driver_id, driver_commission, notes, created_at')
    .ilike('notes', 'Attributed trip from%')
    .order('created_at', { ascending: false })
    .limit(10);
  console.log(JSON.stringify(attributedTrips, null, 2), attrErr ?? '');
}

main().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
