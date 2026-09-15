#!/usr/bin/env node
// Genuine two-session concurrency race for the order-claim fix: two
// independent Supabase sessions (real password sign-ins, real JWTs, real
// PostgREST RPC calls) both try to claim the SAME single pending sales order
// into two different new execution plans at the same instant.
import fs from 'node:fs';

const SUPABASE_URL = 'https://nafxpivddesgsrthmosv.supabase.co';
const ANON_KEY = fs.readFileSync('/tmp/anon_key.txt', 'utf8').trim();
const EMAIL = 'godrej@gmail.com';
const PASSWORD = 'godrej123';

const ORG_ID = 'dc771ec3-0e6b-4397-a599-924d2259acd4';
const ORDER_ID = '0076e978-7e06-4ee9-bf07-4769132ef13d';
const LINE_ID = 'a297ce65-d595-40b3-a890-4389a9e37452';
const CUSTOMER_ID = 'ea09b9b6-4190-4a33-a003-adea218bad2e';
const WAREHOUSE_ID = 'b3ae6831-1887-4ec8-8484-b6e1a94bc2c3';

async function signIn() {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: ANON_KEY },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('sign-in failed: ' + JSON.stringify(data));
  return data.access_token;
}

function buildPayload(clientPlanId) {
  return {
    p_org_id: ORG_ID,
    p_client_plan_id: clientPlanId,
    p_vehicle_type: 'Truck',
    p_stops: [
      {
        clientStopId: 'pu', type: 'pickup', sequence: 0,
        label: '[RACE TEST] Warehouse', contactName: 'Race', contactPhone: '9999999999',
        podRequired: false, warehouseId: WAREHOUSE_ID,
      },
      {
        clientStopId: 'dr', type: 'drop', sequence: 1,
        label: '[RACE TEST] Drop', contactName: 'Race', contactPhone: '9999999999',
        podRequired: true, warehouseId: '',
        address: { line1: 'Race st', city: 'Chennai', state: 'TN', pincode: '600001' },
      },
    ],
    p_allocations: [
      { orderId: ORDER_ID, pickupClientStopId: 'pu', dropClientStopId: 'dr' },
    ],
    p_orders: [
      {
        orderId: ORDER_ID, customerId: CUSTOMER_ID, customerName: 'Race Customer', totalAmount: 17700,
        lineItems: [{ id: LINE_ID, quantity: 1, weightKg: 20, volumeM3: 0.01 }],
      },
    ],
  };
}

async function callRpc(token, clientPlanId, label) {
  const t0 = Date.now();
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/create_execution_plan_with_graph`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: ANON_KEY,
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(buildPayload(clientPlanId)),
  });
  const text = await res.text();
  const ms = Date.now() - t0;
  return { label, status: res.status, body: text, ms };
}

async function main() {
  console.log('Signing in twice (two independent sessions, same real QA account)...');
  const [tokenA, tokenB] = await Promise.all([signIn(), signIn()]);
  console.log('Session A token acquired:', tokenA.slice(0, 20) + '...');
  console.log('Session B token acquired:', tokenB.slice(0, 20) + '...');

  const corrA = 'race-a-' + crypto.randomUUID();
  const corrB = 'race-b-' + crypto.randomUUID();
  console.log('\nFiring both RPC calls concurrently against the SAME order:', ORDER_ID);

  const [resultA, resultB] = await Promise.all([
    callRpc(tokenA, corrA, 'Session A'),
    callRpc(tokenB, corrB, 'Session B'),
  ]);

  console.log('\n=== RESULTS ===');
  for (const r of [resultA, resultB]) {
    console.log(`${r.label}: HTTP ${r.status} (${r.ms}ms) — ${r.body.slice(0, 300)}`);
  }

  const succeeded = [resultA, resultB].filter((r) => r.status === 200 || r.status === 201);
  const failed = [resultA, resultB].filter((r) => r.status >= 400);
  console.log(`\nSucceeded: ${succeeded.length}, Failed: ${failed.length}`);
  if (succeeded.length !== 1) {
    console.log('!!! UNEXPECTED: expected exactly ONE success, got', succeeded.length);
  } else {
    console.log('EXPECTED OUTCOME: exactly one session won the race.');
  }
}
main().catch((e) => { console.error('SCRIPT ERROR:', e); process.exit(1); });
