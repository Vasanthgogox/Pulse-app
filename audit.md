Q-Web Full Technical Audit                             
                                                                                                                  
 ▎ Compiled from deep codebase exploration: AuthContext, Supabase client, RLS migrations, performance hooks,
 ▎ services, DevOps config.                                                                                       
                                                                                                                  
 ---                                                                                                              
 1. 🔴 CRITICAL — Production Blockers

 1.1 RLS on network_posts Allows All Authenticated Users to Read All Active Posts

 File: migrations/009_network_social_layer.sql, policy posts_select
 CREATE POLICY "posts_select" ON public.posts
   FOR SELECT USING (is_active = true);
 Why dangerous: Any authenticated user can enumerate every active post across all orgs. A competitor signing up
 for free can scrape all live load tenders, supplier rates, and freight announcements across your entire network.

 Fix: Scope to own org + connected orgs only:
 CREATE POLICY "posts_select" ON public.posts
   FOR SELECT USING (
     is_active = true AND (
       organization_id IN (
         SELECT om.organization_id FROM org_members om WHERE om.user_id = auth.uid()
       ) OR
       organization_id IN (SELECT connected_org_id FROM network_connections WHERE org_id IN (...))
     )
   );

 ---
 1.2 bids_select Policy Is USING (true) — Completely Open

 File: migrations/009_network_social_layer.sql, policy bids_select
 CREATE POLICY "bids_select" ON public.bids
   FOR SELECT USING (true);
 Why dangerous: Every authenticated user can read every bid across every org — including competitor bid amounts,
 supplier names, and win/loss patterns. This is bidding intelligence that orgs explicitly don't want leaked.

 Fix: Allow SELECT only if user is the bidder OR owns the post being bid on:
 CREATE POLICY "bids_select" ON public.bids
   FOR SELECT USING (
     bidder_organization_id IN (SELECT organization_id FROM org_members WHERE user_id = auth.uid())
     OR
     post_id IN (SELECT id FROM network_posts WHERE organization_id IN (
       SELECT organization_id FROM org_members WHERE user_id = auth.uid()
     ))
   );

 ---
 1.3 pod-documents Storage Bucket Allows Any Authenticated User to Upload to Any Path

 File: migrations/006_pod_documents_bucket.sql
 CREATE POLICY "Authenticated users can upload pod documents"
   ON storage.objects FOR INSERT TO authenticated
   WITH CHECK (bucket_id = 'pod-documents');
 Why dangerous: User from Org A can upload {tripId_of_Org_B}/fake_pod.pdf, overwriting or polluting Org B's
 proof-of-delivery documents. In a dispute resolution context (customs, freight payment), fabricated PODs are
 fraud.

 Fix: Gate by org membership based on trip_id prefix in the path:
 WITH CHECK (
   bucket_id = 'pod-documents' AND
   (storage.foldername(name))[1] IN (
     SELECT t.id::text FROM trips t
     JOIN org_members om ON om.organization_id = t.organization_id
     WHERE om.user_id = auth.uid()
   )
 );

 ---
 1.4 trip_pods and pod_attachments Tables Have USING (true) RLS

 File: migrations/006_pod_documents_bucket.sql
 CREATE POLICY "Enable all for authenticated" ON public.trip_pods
   TO authenticated USING (true) WITH CHECK (true);
 Why dangerous: Any authenticated user can read, update, or delete POD attachments for trips they have zero
 relationship with. This is both a privacy breach and an integrity risk — settlement documents can be deleted by
 outsiders.

 Fix: Join to trips → org_members → auth.uid() before permitting access.

 ---
 1.5 organization_name_is_taken() RPC Failure Returns taken: false

 File: features/auth/services/auth.service.ts ~line 645
 if (msg.includes("function") && msg.includes("does not exist")) {
   return { error: new Error("System update required..."), taken: false }; // taken: false!
 }
 Why dangerous: If the RPC is missing (bad migration, permissions rollback), sign-up continues and two orgs with
 identical names can be created. Downstream ledger aggregations, client/supplier lookups, and network discovery
 assume org names are unique.

 Fix: Change to taken: true — fail safe, not fail open.

 ---
 1.6 AuthContext: roleVerified=false Without Sign-Out Creates Zombie Sessions

 File: contexts/AuthContext.tsx ~lines 289–303
 When getVerifiedDbProfile() returns null, roleVerified is set to false but the Supabase JWT remains valid. User
 is in limbo: auth exists, routing gates are closed, no clear error shown.

 Why dangerous: Can happen on a network hiccup during session restore. User restarts app, profile fetch fails
 transiently, user appears logged-out but JWT persists. On next action the JWT is valid and may hit protected
 routes inconsistently.

 Fix: In the profile-missing path, explicitly call signOut() (already done in the restore path at line 307 — make
  all paths consistent).

 ---
 1.7 Realtime Channel Cap Silently Returns No-Op Unsubscribe

 File: lib/realtimeRegistry.ts ~lines 185–186
 if (registry.size >= MAX_SHARED_CHANNELS) {
   return () => {}; // Empty unsubscribe function
 }
 Why dangerous: When the app hits 20 concurrent channels (easily reached with trips + finance + network + chat on
  a busy dispatcher screen), new subscriptions are silently dropped. The screen appears to work but no real-time
 updates arrive. Dispatchers see stale trip statuses.

 Fix: Return a sentinel that triggers a console.error and falls back to polling, OR queue the subscription and
 process it when a slot opens. Never silently no-op.

 ---
 1.8 Missing mounted Check After Async Op in refreshSession()

 File: contexts/AuthContext.tsx ~line 430
 getVerifiedDbProfile() is awaited without a subsequent mounted/attempt check. If the component unmounts (user
 navigates away or signs out) during the DB call, setState fires on an unmounted component.

 Fix: Add if (!isCurrentAuthAttempt(attemptId)) return; immediately after the await, mirroring the pattern
 already used on line 151–158.

 ---
 2. 🟠 ARCHITECTURE — Structural Debt

 2.1 useFinanceLedger.ts (594 lines) Is an Unbounded Client-Side Aggregation Engine

 File: features/finance/hooks/useFinanceLedger.ts, lines 233–418
 - Loads ALL transactions via useTransactionsQuery() — no pagination
 - Applies 5 sequential filter passes on the full array
 - Runs nested loops to build tripDetailsMap (O(trips × transactions) worst case)
 - Sorts the full filtered array on every render

 Problem at scale: An org with 10,000 transactions and 500 trips will lock the JS thread for 500ms+ on every
 filter change. On a 2GB Android device with a degraded V8 heap, this triggers GC pauses and dropped frames.

 Fix path:
 1. Move period filtering to the DB query (created_at BETWEEN ? AND ?)
 2. Move category/party aggregations to a Postgres RPC (get_ledger_summary(org_id, period, filters))
 3. Keep only display-layer transforms in the hook (formatting, UI state)

 ---
 2.2 trips.service.ts (67 KB, 2022 lines) Is a God Service

 File: features/trips/services/trips.service.ts
 Handles trip CRUD, driver availability checks, vehicle conflict checks, trip number generation with retry,
 cross-org visibility, driver phone lookup, OTP flows, and trip status machine — all in one file.

 Problem at scale: Every trip-adjacent feature requires reading/modifying this file. Merge conflicts will be
 constant with a growing team. The mental model required to safely add a feature (avoiding the retry loops, the
 cross-org join logic, etc.) is enormous.

 Fix path: Decompose by bounded context:
 - tripAvailability.service.ts — driver/vehicle conflict checks
 - tripNumbering.service.ts — generation + retry logic
 - tripVisibility.service.ts — cross-org join rules
 - tripStatusMachine.service.ts — status transitions
 - Keep trips.service.ts as thin orchestration

 ---
 2.3 opsAgent.service.ts (68 KB, 1604 lines) — AI Business Logic in a Monolith

 File: features/ops-agent/services/opsAgent.service.ts
 This single file contains: Gemini API integration, tool definitions, validation logic, session state management,
  rate limiting (in-memory), confirmation dialogs, audit logging, and entity creation orchestration.

 Problems:
 - Rate limiting is in-memory — resets on app kill, provides zero cross-device protection
 - No retry logic for transient Gemini failures (503, network flap)
 - No server-side audit trail — every AI-initiated entity creation is untracked in prod
 - AI hallucinations on freight data (wrong vehicle numbers, misread phone digits) flow directly to createTrip()
 without human review at the DB layer

 Fix path:
 1. Move rate limiting to a Supabase function-level counter (durable, cross-device)
 2. Add exponential backoff on Gemini generateContent calls (3 retries, 1s/2s/4s)
 3. Write AI-initiated actions to an ops_agent_audit_log table (org_id, user_id, action, payload, success,
 timestamp)
 4. Consider the ops agent as a separate Edge Function that validates + returns a structured proposal, with the
 app holding confirmation UX

 ---
 2.4 AuthContext.tsx (462 lines) Multi-Path Session Restore Is Race-Prone

 File: contexts/AuthContext.tsx
 The session restore logic has 4 code paths (SecureStore hit, AsyncStorage fallback, server confirm, OAuth
 pending metadata) with shared mutable authAttemptRef. The isCurrentAuthAttempt() guard is present but
 inconsistently applied after every await point.

 Problem at scale: As more auth providers are added (Google OAuth already there, Apple/LinkedIn likely coming),
 each new path increases the surface area for unmounted-state bugs and stale-closure issues.

 Fix path: Extract a SessionRestoreStateMachine (using useReducer) with explicit states: idle → restoring →
 verifying → authenticated | unauthenticated | error. Each state transition is a dispatch — no scattered setState
  calls after awaits.

 ---
 2.5 Supabase SecureStore Fallback Is Irrecoverable

 File: lib/supabase.ts ~lines 110, 133
 useAsyncStorageForAll = true; // Set once, never reset
 Once SecureStore fails (e.g., device lock policy changes, OS permission revoked), the flag permanently routes
 all token storage to AsyncStorage for the session lifetime — and there's no recovery path.

 Problem: AsyncStorage tokens are accessible to any process with app sandbox access. On rooted/jailbroken devices
  (common in South Asia's second-hand device market), this is meaningful downgrade.

 Fix: Make the fallback per-key, not global. After each SecureStore attempt, try SecureStore first — don't assume
  it stays broken. Or implement a checkSecureStoreHealth() probe on app resume.

 ---
 2.6 Query Key Consistency — useTripsQuery Merges Two Data Sources In-Memory

 File: lib/queries/useTripsQuery.ts lines 16–28
 Owner trips + supplier-side trips are fetched as two separate queries and merged in the hook. This means two
 cache entries, two refetch cycles, and the merged result isn't independently cacheable.

 Fix: Consolidate into a single getTripsByOrganization query that the service handles (it already does with
 org-as-supplier joins in trips.service.ts) — return one canonical list per org.

 ---
 3. 🟡 PERFORMANCE — Bottlenecks Before They Hit

 3.1 useTransactionsQuery Loads All Transactions — No Limit

 File: lib/queries/useTransactionsQuery.ts lines 10–22
 The non-infinite query variant has no .range() or LIMIT. Combined with useFinanceLedger.ts consuming its full
 output, a dispatcher org with 12 months of activity (10K+ transactions) loads the entire ledger on every finance
  tab visit.

 Impact on 2G/3G: 10K ledger rows at ~500 bytes/row = ~5MB JSON payload on every load. On 3G India (~3 Mbps),
 that's 13+ seconds.

 Fix: The finance tab must use useTransactionsInfiniteQuery (already exists at line 24–42) and load pages of 50.
 Server-side period filter must be applied before sending to client.

 ---
 3.2 useIndentsQuery Loads Entire Indent Catalog — No Pagination

 File: lib/queries/useIndentsQuery.ts lines 20–30, 33–43
 Both useIndentsQuery and useMarketIndentsQuery perform full .select() with no .range(). LoadCenterView.tsx (6913
  lines!) filters the results client-side by status/tab/search.

 Impact: A marketplace with 5,000 open indents sends the full dataset on mount. FlashList handles virtualized
 rendering fine, but the network + parse cost is borne up-front.

 Fix: Add server-side filtering (status, date range, origin/destination) and use infinite scroll. LoadCenterView
 is already the most complex component in the codebase (6,913 lines) — this is where render perf will first
 visibly degrade.

 ---
 3.3 useFinanceLedger.ts Nested Loop Is O(trips × transactions)

 File: features/finance/hooks/useFinanceLedger.ts lines 463–547
 tripDetailsMap iterates tripRows and for each trip, aggregates all matching ledgerTransactions. With 500 trips
 and 10K transactions this is 5M iterations — fully synchronous on the JS thread.

 Fix: Replace with a single-pass reduce over ledgerTransactions, grouping by trip_id:
 const tripLedger = ledgerTransactions.reduce((acc, tx) => {
   if (tx.trip_id) {
     if (!acc[tx.trip_id]) acc[tx.trip_id] = { in: 0, out: 0 };
     acc[tx.trip_id].in += tx.amount_in || 0;
     acc[tx.trip_id].out += tx.amount_out || 0;
   }
   return acc;
 }, {} as Record<string, { in: number; out: number }>);

 ---
 3.4 Realtime Subscription Per-Table Per-Org Will Proliferate

 File: lib/queries/useRealtimeInvalidation.ts, lib/realtimeRegistry.ts
 Every org × screen combination creates a new channel. A dispatcher with finance + trips + network tabs open
 concurrently = 3–6 active channels. Cap is 20 (realtimeRegistry.ts). With a team of 5 dispatchers using the web
 app in the same browser session (shared tab), channels saturate.

 Impact: When cap is hit, new subscriptions are silently dropped (issue 1.7). The finance tab stops updating in
 real time with no error shown.

 Fix: Consolidate subscriptions — one channel per org that covers all table changes, with client-side dispatch to
  the right query key. Reduce channel count from O(screens) to O(1 per org).

 ---
 3.5 Offset-Based Pagination on trips Table

 File: features/trips/services/trips.service.ts lines 89–122
 Uses .range(offset, offset + limit) — which Postgres executes as OFFSET n scan. At 10,000 trips, fetching page
 200 (offset 10,000) requires a full sequential scan of 10,000 rows before returning 50.

 Impact: Page load time grows linearly with trip count. An org running 30 trips/day hits 10K rows in ~11 months.

 Fix: Cursor-based pagination keyed on (created_at DESC, id DESC):
 WHERE (created_at, id) < (cursor_created_at, cursor_id)
 ORDER BY created_at DESC, id DESC
 LIMIT 50
 Combined with the index in migrations/012_perf_indexes.sql.

 ---
 3.6 LoadCenterView.tsx Is 6,913 Lines — Single-Component Render Cost

 File: features/network/components/LoadCenterView.tsx
 A 6,913-line component with multiple FlashLists, modals, tab state, filter state, and bid management is a single
  React subtree. Any state change (typing in search, tab switch) triggers reconciliation of the full component
 tree.

 Impact: On a 2GB Android device, initial mount time for this component will be 500ms–1s+ due to hook
 initialization and virtual DOM reconciliation.

 Fix: Split into LoadCenterShell (routing/tabs) + LoadTab (per-tab sublists). Each tab mounts independently.

 ---
 4. 🔵 DEVOPS & DEPLOYMENT — Path to Production

 4.1 No Error Monitoring Service

 File: package.json — no Sentry, LogRocket, Bugsnag, or equivalent
 The ErrorBoundary in app/_layout.tsx handles known error types gracefully but reports nothing externally.
 Production crashes are invisible.

 Impact: You will not know about a crash until a user files a ticket. Indian logistics users are unlikely to file
  tickets — they'll just stop using the app.

 Required: Install @sentry/react-native, configure DSN, wrap app/_layout.tsx with Sentry.wrap(). Add
 captureException in ErrorBoundary.componentDidCatch and in all service catch blocks.

 ---
 4.2 CI/CD Pipeline Is Security-Only — No Build, Test, or Deploy

 File: .github/workflows/security.yml
 Pipeline runs npm audit and TruffleHog secret scanning on PRs. That's it.

 Missing:
 - No TypeScript type-check (tsc --noEmit)
 - No Jest unit test run
 - No Playwright E2E test run (configured but never run in CI)
 - No Expo export verification (expo export --platform web)
 - No EAS build trigger on merge to master
 - No staging environment deployment

 Required: Add a ci.yml that runs: npm run lint && tsc --noEmit && npm test && expo export --platform web. Gate
 merges to master on this passing.

 ---
 4.3 OTA Update Strategy Is Absent

 File: eas.json — no channel config for builds
 EAS builds exist (preview and production profiles) but no updates.channel is set. This means Expo Updates has no
  channel routing — a hotfix pushed to production channel will not reach devices built against preview channel.

 Required:
 // eas.json
 "preview": { "channel": "staging" },
 "production": { "channel": "production" }
 Plus app.config.js updates.url pointing to EAS Update endpoint. Define a rollout policy: hotfixes to prod via
 OTA (JS-only changes), native changes via store submission.

 ---
 4.4 The 192KB Consolidated Initial Migration Is a Deployment Liability

 File: migrations/001_initial_schema_consolidated.sql (188 KB)
 Applying this in production via supabase db push is a single atomic transaction. Any error (constraint
 violation, extension missing, table already exists) rolls back the entire schema. There is no incremental apply
 mechanism.

 Impact: Initial production environment setup is high-risk. The Supabase migration system (supabase/migrations/)
 with 200 timestamped files is the right approach — the migrations/ directory appears to be legacy. Confirm which
  system is the authoritative one and delete the other.

 Required: Document exactly: "Run supabase db push against supabase/migrations/ only. The top-level migrations/
 directory is deprecated and must never be applied to a production Supabase project."

 ---
 4.5 Rate Limiting Is In-Memory Only — Stateless Across Function Instances

 Files: supabase/functions/check-user-by-phone/index.ts (30 req/min per IP),
 supabase/functions/ops-agent-chat/index.ts (20 req/min per user)
 Both use Map<string, number[]> in module scope. Each Edge Function invocation may spin up in a fresh isolate —
 the Map is empty. Under load, rate limiting is effectively non-functional.

 Fix: Use Supabase KV (via supabase.storage or a rate_limit_counters table with TTL) or upstash Redis. For the
 ops-agent specifically, Supabase's pg_net can increment a counter row atomically.

 ---
 4.6 No Database Backup Verification or PITR Awareness

 Supabase Pro plan includes daily backups and PITR (Point-In-Time Recovery). No evidence of:
 - Backup restore test being run
 - PITR window documented in runbook
 - Data retention policy for transactions and trips tables

 Required: Document PITR window, run a quarterly restore-to-staging test, and ensure the Supabase plan tier
 supports the required retention window.

 ---
 4.7 Google Maps Key in AndroidManifest.xml — Not in Env System

 File: app.config.js ~line 64 comment: "must be set in android/app/src/main/AndroidManifest.xml"
 The Google Maps Android key bypasses the .env secret management system. If this key is hardcoded in the manifest
  (common when following Google docs), it's committed to the repo.

 Fix: Inject the key from EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY via expo-build-properties or a custom
 withAndroidManifest config plugin. Confirm it's not currently committed.

 ---
 5. 🟣 PRODUCT & UX RISK — Features That Will Confuse Real Users

 5.1 Driver App Assumes Smartphone Literacy That Truck Drivers Often Lack

 The driver app has: Control tab (trip OTP + status buttons), Documents tab (POD uploads), Chat tab (realtime
 messaging), Wallet tab (balance + transactions).

 Risk: The typical Indian truck driver demographic (Class 8/10 educated, primary language regional) navigates
 smartphones primarily via WhatsApp. Multi-tab navigation with icons and no labels, or chat that looks different
 from WhatsApp, will cause abandonment.

 Specific risks:
 - POD upload flow (camera → crop → upload) has multiple failure modes on low-storage devices
 - Trip OTP entry — if driver misremembers the 4/6 digit code, error messaging in English is unhelpful
 - Wallet tab showing INR transactions requires basic financial literacy

 Recommendation: Simplify driver app to 2 screens max for V1: "My Trip" (single active trip with big buttons) and
  "Upload Proof". Everything else is secondary.

 ---
 5.2 NetworkContext Exists But Offline Behavior Is Not Enforced Consistently

 File: contexts/NetworkContext.tsx — exposes useIsOnline()
 No evidence that service calls check useIsOnline() before making Supabase requests. Supabase client has 25s
 timeout + 1 retry, but there's no offline queue, no UI "you are offline" banner, and no request deduplication on
  reconnection.

 Real-world scenario: A dispatcher on a highway with intermittent 2G creates a trip. The request times out
 silently. They create it again. When connectivity restores, two duplicate trips are created. The trip_number
 uniqueness check prevents exact duplicates, but the retry logic in createTrip (3 attempts + 5 candidates) can
 create ghost trips if interrupted mid-retry.

 Fix:
 1. Show a persistent "Offline" banner when useIsOnline() returns false
 2. Disable write operations (createTrip, addTransaction) while offline
 3. Add optimistic mutations with rollback for read-only state

 ---
 5.3 i18n Coverage Is Structurally Present But Production Readiness Is Unknown

 File: lib/i18n.ts, locales/ directory supports EN/HI/TE/TA/KN/ML
 No evidence of:
 - Translation completeness checks in CI (percentage complete per locale)
 - Fallback behavior audit (does missing key show key name or crash?)
 - Right-to-left (RTL) support (Tamil, Malayalam have some RTL adjacency; Urdu would need it)
 - Locale-specific number formatting (Indian number system: lakhs/crores vs. thousands)

 Risk: A Hindi dispatcher sees untranslated English strings for features added after the initial translation
 pass. For an audience where English literacy is limited, this breaks trust in the product.

 Required: Add a scripts/check-i18n-completeness.sh that fails CI if any locale is < 95% complete. Format all
 currency via lib/format.ts using Intl.NumberFormat('hi-IN', ...) not hardcoded ₹ prefixes.

 ---
 5.4 Gemini Ops Agent Hallucination Risk on Freight Data

 File: features/ops-agent/services/opsAgent.service.ts
 The ops agent uses Gemini 2.0 Flash to extract structured data from dispatcher text/photos. Validation functions
  (validateCreateTripArgs, validateCreateDriverArgs) exist but check format only — not business logic validity.

 Specific hallucination scenarios:
 - Driver phone number: OCR of a blurry business card → digit transposition → wrong driver linked to trip
 - Vehicle registration: MH12AB1234 vs MH 12 AB 1234 format variants — Indian registration plates have no
 standard format enforcement
 - Trip amount: Gemini reads ₹45,000 as 45000 but in a context where the dispatcher meant ₹4,500 (comma as
 thousands vs. decimal ambiguity in Indian writing)

 Current mitigation: Confirmation dialog before execute, 5-minute expiry. This is necessary but not sufficient. A
  dispatcher who confirms 20 trips/day will develop confirmation fatigue and stop reading.

 Fix: Add a "show extracted fields" diff view before confirmation — show what AI extracted vs. what currently
 exists. Add a CONFIDENCE_THRESHOLD check — if Gemini's response doesn't include all required fields with high
 structural confidence, require manual entry fallback.

 ---
 5.5 Marketplace / Indent Flow Has No Guided Onboarding

 File: features/network/ — LoadCenterView.tsx, DiscoverView.tsx
 The load board has two modes (GIVE_LOAD / GET_LOAD), indents, bids, network connections, and a social feed — all
  on one tab. For a dispatcher using the platform for the first time, there is no contextual onboarding, empty
 state guidance, or progressive disclosure.

 Risk: Dispatchers who don't understand "indent" (not common English in logistics) will ignore the entire
 marketplace feature, which is likely a key monetization lever.

 Fix: Add empty state screens with one-sentence explanations in the local language: "Post your available truck to
  find loads" / "List a load to find transporters". Add a first-time tooltip sequence (3 steps max).

 ---
 6. ✅ WHAT IS DONE WELL — Don't Break These

 6.1 TanStack Query Configuration Is Textbook-Correct

 staleTime: 60s, gcTime: 5min, retry: 1 — exactly right for a mobile app on flaky connectivity. Optimistic
 mutations with typed rollback in useTripsQuery.ts (lines 97–144) are production-grade. The query key factory in
 lib/queryKeys.ts prevents cache key typos across the codebase.

 6.2 Capability-Based Access Control Is the Right Abstraction

 lib/capabilities.ts with getEffectivePermissions() decouples feature visibility from role names. Adding a new
 tier (e.g., "fleet-only" plan) is one new capability, not a refactor of every screen guard. This is
 significantly better than the raw role === 'driver' checks seen in most React Native apps.

 6.3 Realtime Registry Ref-Counting + Grace Period

 lib/realtimeRegistry.ts implements proper ref-counting with a 5s grace period on unmount (prevents churn on tab
 switch) and a 10-minute stale channel cleanup. This is genuinely sophisticated — most apps just leak WebSocket
 connections. The pattern should be extended to the single-channel consolidation fix.

 6.4 Platform-Aware Supabase Storage Adapter

 lib/supabase.ts auto-detects platform and picks SecureStore (native) vs. AsyncStorage (web/Expo Go) with
 graceful fallback. The 25s timeout + 1-retry wrapper means network hangs don't silently freeze screens. This is
 the correct pattern for a cross-platform Supabase app.

 6.5 Ops Agent Payload Locking Before Confirmation

 opsAgent.service.ts stores the exact model-extracted payload at confirmation time and does not re-extract on
 user confirm. This prevents a TOCTOU (time-of-check / time-of-use) attack where a second AI call between
 "confirm?" and "execute" could return different data. Deliberate and correct.

 6.6 ErrorBoundary Handles Session Expiry Gracefully

 app/_layout.tsx ErrorBoundary detects AuthRetryableFetchError and auth session errors, auto-signs out, and
 redirects to sign-in with a helpful message. This prevents the common React Native failure mode where a stale
 session causes a crash loop.

 6.7 Migration System Is Incremental and Timestamped

 supabase/migrations/ (200 files) uses Supabase CLI's timestamped format. Each migration is atomic and small.
 This is the right pattern. The migrations/012_perf_indexes.sql showing deliberate index planning (trips by
 org+date, transactions by org+date) is good operational thinking.

 6.8 Gemini API Key Stripped From Production Builds

 app.config.js ~line 57–58 detects EAS_BUILD=true and removes EXPO_PUBLIC_GEMINI_API_KEY. The ops agent falls
 back to the server-side proxy only. This prevents key exposure in production app bundles — a frequently missed
 security step.

 ---
 Priority Action Plan

 ┌──────┬──────────────────────────────────────────────┬──────────────────┬────────┬─────────────────────────┐
 │ Rank │                     Item                     │      Owner       │ Effort │     Blocks Launch?      │
 ├──────┼──────────────────────────────────────────────┼──────────────────┼────────┼─────────────────────────┤
 │ 1    │ Fix posts_select + bids_select RLS —         │ Backend Dev      │ 4h     │ YES                     │
 │      │ competitor data leak                         │                  │        │                         │
 ├──────┼──────────────────────────────────────────────┼──────────────────┼────────┼─────────────────────────┤
 │ 2    │ Fix pod-documents bucket + trip_pods RLS —   │ Backend Dev      │ 6h     │ YES                     │
 │      │ cross-org POD write                          │                  │        │                         │
 ├──────┼──────────────────────────────────────────────┼──────────────────┼────────┼─────────────────────────┤
 │ 3    │ Add Sentry error monitoring                  │ Frontend Dev     │ 8h     │ YES                     │
 ├──────┼──────────────────────────────────────────────┼──────────────────┼────────┼─────────────────────────┤
 │ 4    │ Fix organization_name_is_taken() fail-open → │ Backend Dev      │ 1h     │ YES                     │
 │      │  fail-safe                                   │                  │        │                         │
 ├──────┼──────────────────────────────────────────────┼──────────────────┼────────┼─────────────────────────┤
 │ 5    │ Fix Realtime channel cap no-op + silent drop │ Frontend Dev     │ 4h     │ YES                     │
 ├──────┼──────────────────────────────────────────────┼──────────────────┼────────┼─────────────────────────┤
 │ 6    │ Add useTransactionsQuery pagination + move   │ Frontend+Backend │ 3d     │ YES (finance will be    │
 │      │ period filter to DB                          │                  │        │ unusable at scale)      │
 ├──────┼──────────────────────────────────────────────┼──────────────────┼────────┼─────────────────────────┤
 │ 7    │ Add CI pipeline: tsc + lint + test + expo    │ DevOps           │ 1d     │ YES                     │
 │      │ export                                       │                  │        │                         │
 ├──────┼──────────────────────────────────────────────┼──────────────────┼────────┼─────────────────────────┤
 │ 8    │ Configure EAS OTA channels                   │ DevOps           │ 4h     │ YES                     │
 │      │ (staging/production)                         │                  │        │                         │
 ├──────┼──────────────────────────────────────────────┼──────────────────┼────────┼─────────────────────────┤
 │ 9    │ Move ops-agent rate limiting to Supabase     │ Backend Dev      │ 1d     │ Post-launch             │
 │      │ durable counter                              │                  │        │                         │
 ├──────┼──────────────────────────────────────────────┼──────────────────┼────────┼─────────────────────────┤
 │ 10   │ Paginate useIndentsQuery + refactor          │ Frontend Dev     │ 3d     │ Post-launch             │
 │      │ LoadCenterView component split               │                  │        │                         │
 └──────┴──────────────────────────────────────────────┴──────────────────┴────────┴─────────────────────────┘
