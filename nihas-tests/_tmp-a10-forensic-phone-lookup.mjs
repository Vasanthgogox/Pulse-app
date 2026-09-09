#!/usr/bin/env node
// A10 forensic (READ-ONLY): time the exact get_email_by_phone RPC the
// driver-sign-in screen calls, for the A10 Pilot DCO's phone. anon-callable,
// SECURITY DEFINER, pure SELECT -- no mutation possible via this call.
import fs from 'node:fs';
const ANON_KEY = fs.readFileSync('.env', 'utf8')
  .split('\n').find((l) => l.startsWith('EXPO_PUBLIC_SUPABASE_ANON_KEY='))?.split('=')[1]?.trim();
const URL = 'https://nafxpivddesgsrthmosv.supabase.co/rest/v1/rpc/get_email_by_phone';

async function timedCall(label) {
  const start = Date.now();
  try {
    const res = await fetch(URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
      body: JSON.stringify({ p_phone: '9199990005' }),
    });
    const elapsed = Date.now() - start;
    const body = await res.text();
    console.log(`[${label}] status=${res.status} elapsed=${elapsed}ms body=${body}`);
  } catch (e) {
    const elapsed = Date.now() - start;
    console.log(`[${label}] THREW after ${elapsed}ms: ${e.message}`);
  }
}

async function main() {
  // Run 3 times to see if latency/result is consistent.
  await timedCall('attempt-1');
  await timedCall('attempt-2');
  await timedCall('attempt-3');
}
main();
