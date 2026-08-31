// =============================================================================
 // LEARN: Real Pulse RPC — get_trips_for_org
 // File: rpc_learn_trips.js
 // Run:  node rpc_learn_trips.js
 // =============================================================================
 //
 // This is a FAKE local version of the MOST USED trip RPC in our app.
 // Same idea as rpc_test.js (box + kitchen + delivery guy),
 // but shaped like the REAL call:
 //
 //   supabase().rpc('get_trips_for_org', { p_org_id: orgId })
 //
 // In the real app that lives in:
 //   lib/queries/useTripsQuery.ts
 //   features/trips/services/trips.service.ts
 // =============================================================================


 // -----------------------------------------------------------------------------
 // 1. THE SERVER (Postgres kitchen — far away in Supabase)
 // -----------------------------------------------------------------------------
 // In production this is a Postgres FUNCTION named get_trips_for_org.
 // Here we fake it as a JavaScript object so you can run it without the network.
 //
 // Menu rule (same lesson as makePizza):
 //   You can ONLY call recipes that exist on this object.

const remoteServer = {
  // REAL NAME in our app: get_trips_for_org
  // WHAT IT DOES: given an org id, return that org's trips
  // WHY RPC: the DB has RLS + joins; the phone app should not do that logic itself
  get_trips_for_org: (args) => {
    // args = the "data box" from the client, e.g. { p_org_id: "org-abc" }
    const orgId = args.p_org_id;

    // Fake trip rows (in real life Postgres returns these)
    const allTrips = [
      { id: "trip-1", org_id: "org-abc", route: "Chennai → Bangalore", status: "in_transit" },
      { id: "trip-2", org_id: "org-abc", route: "Mumbai → Pune", status: "pending" },
      { id: "trip-3", org_id: "org-xyz", route: "Delhi → Jaipur", status: "delivered" },
    ];

    // Only return trips for the org that was requested
    return allTrips.filter((trip) => trip.org_id === orgId);
  },

  // Another real-ish recipe (optional Experiment 2)
  get_email_by_phone: (args) => {
    const phone = args.p_phone;
    if (phone === "+919999000111") return "driver@example.com";
    return null; // no match
  },
};


 // -----------------------------------------------------------------------------
 // 2. THE RPC LAYER (delivery guy = supabase().rpc)
 // -----------------------------------------------------------------------------
 // Real app code looks like:
 //   const { data, error } = await supabase().rpc('get_trips_for_org', { p_org_id: orgId })
 //
 // Here we fake that shape: function name + args object → result (or crash).

function supabaseRpc(functionName, dataBox) {
  console.log(`[RPC] Calling '${functionName}' with:`, dataBox);

  const recipe = remoteServer[functionName];

  // Experiment 1 lesson: wrong name → not a function → crash
  if (typeof recipe !== "function") {
    throw new Error(
      `RPC failed: '${functionName}' is not on the server menu ` +
        `(same idea as makePizza in rpc_test.js)`
    );
  }

  const data = recipe(dataBox);
  // Real supabase returns { data, error }. We only return data for learning.
  return { data, error: null };
}


 // -----------------------------------------------------------------------------
 // 3. THE CLIENT (your app / Trips tab)
 // -----------------------------------------------------------------------------
 // This is YOU opening the Trips screen.
 // Local knowledge: "I am logged into org-abc"
 // Remote need: "Please give me that org's trips"

const myOrgId = "org-abc"; // like AuthContext org id in the real app
console.log("My local org id:", myOrgId);

 // --- THE REAL PATTERN (learn this line) ---
 // Same shape as useTripsQuery:
 //   supabase().rpc('get_trips_for_org', { p_org_id: orgId })
const { data: trips, error } = supabaseRpc("get_trips_for_org", {
  p_org_id: myOrgId,
});

if (error) {
  console.log("RPC error:", error);
} else {
  console.log("Trips returned from remote kitchen:");
  console.log(trips);
  console.log("Trip count:", trips.length);
}

 // Expected default output:
 //   My local org id: org-abc
 //   [RPC] Calling 'get_trips_for_org' with: { p_org_id: 'org-abc' }
 //   Trips returned from remote kitchen:
 //   [ { id: 'trip-1', ... }, { id: 'trip-2', ... } ]
 //   Trip count: 2
 //
 // Notice trip-3 (org-xyz) was NOT returned — kitchen filtered by org.


 // =============================================================================
 // EXPERIMENTS (edit ONE thing, save, run: node rpc_learn_trips.js)
 // =============================================================================
 //
 // Experiment 1 — Wrong Order (like makePizza)
 //   Change the call name to:
 //     supabaseRpc("make_pizza", { p_org_id: myOrgId })
 //   Expect: crash — not on the server menu.
 //
 // Experiment 2 — Different org box
 //   Change myOrgId to "org-xyz"
 //   Expect: only Delhi → Jaipur (1 trip)
 //
 // Experiment 3 — Call another real-named recipe
 //   Replace the client call with:
 //     const { data, error } = supabaseRpc("get_email_by_phone", {
 //       p_phone: "+919999000111",
 //     });
 //     console.log("Email:", data);
 //   Expect: driver@example.com
 //
 // Experiment 4 — Empty box / wrong phone
 //   Call get_email_by_phone with p_phone: "+910000000000"
 //   Expect: null (server ran, but found nothing)
 //
 // =============================================================================
 // MAP BACK TO THE REAL APP
 // =============================================================================
 //
 // Fake here                          Real Pulse
 // ---------------------------------  ------------------------------------------
 // supabaseRpc(...)                   supabase().rpc(...)
 // "get_trips_for_org"                'get_trips_for_org'
 // { p_org_id: myOrgId }              { p_org_id: orgId }
 // remoteServer object                Postgres function in Supabase
 // trips array in memory              rows from the database
 //
 // One sentence:
 //   RPC = ask Supabase to run a named DB function and send the result home.
 // =============================================================================
