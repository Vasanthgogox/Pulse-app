/**
 * LEARN: Real Pulse RPC against YOUR Supabase DB
 * ------------------------------------------------
 * Run:
 *   node scripts/rpc_learn_real.js
 *
 * Needs in project-root .env:
 *   EXPO_PUBLIC_SUPABASE_URL=...
 *   SUPABASE_SERVICE_ROLE_KEY=...   (Dashboard → Settings → API → service_role)
 *
 * What this teaches:
 *   Same idea as rpc_test.js / rpc_learn_trips.js, but the "kitchen" is the
 *   real Postgres function get_trips_for_org — not a fake JS object.
 *
 * Metaphor map:
 *   Client (you)     → this script
 *   Data box         → { p_org_id: "..." }
 *   Delivery guy     → supabase.rpc(...)
 *   Kitchen (server) → Postgres RPC get_trips_for_org on Supabase
 *   Answer           → real trip rows from the DB
 */

const { config: loadEnv } = require("dotenv");
const { createClient } = require("@supabase/supabase-js");

// Load ONLY root .env (same pattern as scripts/seed-test-data.ts)
loadEnv({ path: ".env" });

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error(
    "Missing .env values.\n" +
      "Add EXPO_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, then re-run."
  );
  process.exit(1);
}

// Safety check: service_role bypasses RLS. Never ship this key in the mobile app.
function getJwtRole(key) {
  try {
    const payload = key.split(".")[1];
    if (!payload) return null;
    return JSON.parse(Buffer.from(payload, "base64url").toString()).role ?? null;
  } catch {
    return null;
  }
}

const keyRole = getJwtRole(serviceRoleKey);
if (keyRole !== "service_role") {
  console.error(
    `SUPABASE_SERVICE_ROLE_KEY role is "${keyRole ?? "unknown"}", expected "service_role".\n` +
      "Copy the service_role secret from Dashboard → Settings → API (not anon)."
  );
  process.exit(1);
}

// Create the Supabase client = your delivery guy with a master kitchen key
const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

async function main() {
  console.log("=== RPC LEARN (REAL DB) ===");
  console.log("Supabase host:", new URL(supabaseUrl).host);
  console.log("Key role: service_role (bypasses RLS — scripts only)\n");

  // -------------------------------------------------------------------------
  // Step A: pick a real org from the DB (so you don't hardcode UUIDs)
  // -------------------------------------------------------------------------
  const { data: orgs, error: orgErr } = await supabase
    .from("organizations")
    .select("id, name")
    .order("created_at", { ascending: false })
    .limit(5);

  if (orgErr) {
    console.error("Could not list organizations:", orgErr.message);
    process.exit(1);
  }
  if (!orgs || orgs.length === 0) {
    console.error("No organizations found. Create one in the app first.");
    process.exit(1);
  }

  console.log("Sample orgs (data box candidates):");
  for (const org of orgs) {
    console.log(`  - ${org.name}  (${org.id})`);
  }

  // Default: newest org. EXPERIMENT: set ORG_ID=... when running to pick another.
  const myOrgId = process.env.ORG_ID || orgs[0].id;
  const myOrgName = orgs.find((o) => o.id === myOrgId)?.name ?? "(unknown)";
  console.log("\nUsing org box:", myOrgName, myOrgId);

  // -------------------------------------------------------------------------
  // Step B: THE REAL RPC — same call the Trips tab uses
  // -------------------------------------------------------------------------
  // Real app (useTripsQuery):
  //   await supabase().rpc('get_trips_for_org', { p_org_id: orgId })
  //
  // Here:
  console.log("\n[RPC] Calling get_trips_for_org ...");
  const { data: trips, error: rpcErr } = await supabase.rpc("get_trips_for_org", {
    p_org_id: myOrgId,
  });

  if (rpcErr) {
    // Same lesson as makePizza: wrong name / bad args / missing function → error
    console.error("RPC error:", rpcErr.message);
    process.exit(1);
  }

  const list = Array.isArray(trips) ? trips : [];
  console.log("Trip count returned:", list.length);
  if (list.length === 0) {
    console.log("No trips for this org yet — RPC still worked; kitchen returned [].");
  } else {
    // Print a few plain fields (shape can vary; show whatever exists)
    console.log("First few trips:");
    for (const t of list.slice(0, 5)) {
      console.log({
        id: t.id,
        trip_number: t.trip_number ?? t.number ?? null,
        status: t.status ?? null,
        origin: t.origin ?? t.from_location ?? null,
        destination: t.destination ?? t.to_location ?? null,
      });
    }
  }

  // -------------------------------------------------------------------------
  // EXPERIMENTS (run again after changing one thing)
  // -------------------------------------------------------------------------
  // 1) Wrong Order:
  //      Change "get_trips_for_org" below to "make_pizza" and re-run → error.
  //
  // 2) Different org:
  //      ORG_ID=<paste-uuid-from-list-above> node scripts/rpc_learn_real.js
  //
  // 3) Another real RPC (login helper):
  //      Uncomment the block at the bottom labeled EXPERIMENT 3.
  //
  console.log("\nDone. RPC = name + box → remote DB function → rows back.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

/*
 * =============================================================================
 * EXPERIMENT 3 — optional second real RPC
 * =============================================================================
 * Paste inside main() after the trips call if you want:
 *
 *   const phone = process.env.PHONE || "+910000000000";
 *   console.log("\n[RPC] Calling get_email_by_phone ...");
 *   const { data: email, error: emailErr } = await supabase.rpc("get_email_by_phone", {
 *     p_phone: phone,
 *   });
 *   if (emailErr) console.error(emailErr.message);
 *   else console.log("Email for phone:", email);
 */
