
 Here is Claude's plan:
╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌
 Architecture Restructuring Plan — Q Logistics Platform

 Context

 Production React Native + Expo Router logistics SaaS. 386 feature files, 116 shared components, 323 migrations, 21 feature domains. The
 features/[domain]/ model is fundamentally sound but has accreted ~18 months of structural debt: dual service layers, a lib/ directory used as
  a landfill, three hooks locations, and a partial monorepo with nothing in it. This plan fixes structural issues without touching business
 logic or risking production breakage.



 ---
 1. Architecture Score

 ┌─────────────────────┬─────────┬───────────────┐
 │      Dimension      │ Current │ Post-Refactor │
 ├─────────────────────┼─────────┼───────────────┤
 │ Domain isolation    │ 7/10    │ 9/10          │
 ├─────────────────────┼─────────┼───────────────┤
 │ Discoverability     │ 5/10    │ 8.5/10        │
 ├─────────────────────┼─────────┼───────────────┤
 │ Coupling clarity    │ 5/10    │ 8/10          │
 ├─────────────────────┼─────────┼───────────────┤
 │ Onboarding friction │ 5/10    │ 8/10          │
 ├─────────────────────┼─────────┼───────────────┤
 │ Testability         │ 6/10    │ 8/10          │
 ├─────────────────────┼─────────┼───────────────┤
 │ CI/CD clarity       │ 6/10    │ 8.5/10        │
 ├─────────────────────┼─────────┼───────────────┤
 │ Overall             │ 6/10    │ 8.5/10        │
 └─────────────────────┴─────────┴───────────────┘

 Why not 10? TripDetailScreen (12.4K lines) and AddTransactionModal (9K lines) are architectural debt requiring a separate refactor sprint.
 globalSync/ is a mini-framework with no clear ownership. These are Phase 2 problems.

 ---
 2. Final Recommended Folder Structure

 pulse/
 │
 ├── app/                          # Expo Router screens — UNCHANGED
 │   ├── (tabs)/
 │   ├── (driver)/
 │   ├── (modals)/
 │   ├── auth/
 │   ├── trip/[id].tsx
 │   └── _layout.tsx, index.tsx
 │
 ├── features/                     # Domain logic — EXPANDED
 │   ├── auth/
 │   │   ├── hooks/
 │   │   │   ├── useMobileKeepSignedInSignOut.ts   ← moved from hooks/
 │   │   │   └── useWebKeepSignedInSignOut.ts      ← moved from hooks/
 │   │   ├── services/
 │   │   └── components/
 │   ├── trips/
 │   │   ├── services/
 │   │   ├── components/
 │   │   ├── hooks/
 │   │   ├── utils/
 │   │   ├── styles/
 │   │   └── visibility/
 │   ├── finance/
 │   │   ├── services/
 │   │   │   └── sharedLedger.service.ts           ← moved from services/
 │   │   ├── components/
 │   │   ├── hooks/
 │   │   ├── utils/
 │   │   ├── accounting/
 │   │   ├── aggregation/
 │   │   ├── ledger/
 │   │   ├── lib/
 │   │   └── notifications/
 │   │       └── sharedLedgerNotifications.service.ts  ← moved from services/
 │   ├── drivers/
 │   │   ├── services/
 │   │   ├── components/
 │   │   ├── hooks/
 │   │   └── utils/
 │   │       ├── driverUtils.ts                    ← moved from lib/
 │   │       └── driverInviteOffer.util.ts         ← moved from lib/
 │   ├── driver/                   # Driver-app-specific (vs. drivers = CRUD)
 │   │   ├── components/
 │   │   ├── hooks/
 │   │   ├── utils/
 │   │   │   ├── driverTripSequence.ts             ← moved from lib/
 │   │   │   ├── driverCommunication.ts            ← moved from lib/
 │   │   │   └── driverGpayTransactions.ts         ← moved from lib/
 │   │   ├── tripHistory/
 │   │   └── tripSettlement/
 │   ├── vehicles/
 │   │   ├── services/
 │   │   ├── components/
 │   │   ├── utils/
 │   │   │   └── fleetAvatar.ts                    ← moved from lib/
 │   │   └── pnl/
 │   ├── network/
 │   ├── clients/
 │   ├── suppliers/
 │   ├── indents/
 │   ├── invoicing/
 │   ├── organization/
 │   ├── chat/
 │   ├── ratings/
 │   ├── ai/
 │   ├── client-feed/
 │   ├── log-pods/
 │   │   └── services/
 │   │       └── logPods.service.ts                ← moved from services/
 │   ├── pod-reconciliation/
 │   ├── public-profile/
 │   └── connections/              ← NEW: extract from services/
 │       └── services/
 │           └── connectionRequests.service.ts     ← moved from services/
 │
 ├── lib/                          # INFRA ONLY — strict boundary
 │   ├── queries/                  # TanStack Query hooks
 │   ├── hooks/                    # Truly shared hooks
 │   │   ├── useGlobalFabAnimation.ts              ← moved from hooks/
 │   │   ├── useKeyboardVisible.ts                 ← moved from hooks/
 │   │   ├── useOrgRole.ts
 │   │   ├── useRealtimeHealth.ts
 │   │   ├── useAlertRegistryFinanceHandlers.ts
 │   │   ├── useInboundProtocolInviteActions.ts
 │   │   └── useProtocolInvitesWithDriverSent.ts
 │   ├── cache/                    # Cache infra (mergeDelta, domainSync, etc.)
 │   ├── globalSync/               # Sync engine (keep here — not domain-specific)
 │   ├── pod/                      # POD infra (ocr, imageCompression)
 │   │                             # Note: if only used by log-pods/pod-reconciliation,
 │   │                             # consider moving to features/pod-reconciliation/lib/
 │   ├── utils/
 │   │   └── lr.ts
 │   ├── data/
 │   │   └── indiaLocations.json                   ← moved from lib/ root
 │   │
 │   # Core infra files (STAYS in lib/ root):
 │   ├── supabase.ts
 │   ├── queryKeys.ts
 │   ├── queryClient.ts
 │   ├── routes.ts
 │   ├── capabilities.ts
 │   ├── i18n.ts
 │   ├── format.ts
 │   ├── formatEstimatedDuration.ts
 │   ├── validation.ts
 │   ├── phoneValidation.ts
 │   ├── emailValidation.ts
 │   ├── pagination.ts
 │   ├── realtimeRegistry.ts
 │   ├── realtimeTopic.ts
 │   ├── entityIdentity.ts
 │   ├── appAlert.ts
 │   ├── lastRoute.ts
 │   ├── avatarUpload.ts           # shared by multiple features
 │   ├── avatarContext.ts
 │   └── [navigation helpers]     # useSafeBack, routeStackOptions, etc.
 │
 ├── components/                   # SHARED UI only
 │   ├── [current files — mostly fine]
 │   # Move OUT: domain-specific components
 │   # DriverTripFlowCard → features/driver/components/
 │   # DriverPartnerProfileDashboard → features/driver/components/ or features/drivers/
 │   # CounterpartyProfileSystemCard → features/network/components/ or features/finance/
 │
 ├── contexts/                     # Global React contexts — UNCHANGED
 ├── constants/                    # Theme, typography — UNCHANGED
 ├── types/                        # .d.ts shims ONLY — keep lean
 ├── assets/                       # Images, fonts, email templates
 │   └── email/
 │       ├── pulse_reset_password_email.html       ← moved from root
 │       └── pulse_reset_password_email_v2.html    ← moved from root
 │
 ├── supabase/                     # CANONICAL backend
 │   ├── migrations/               # 323 files — authoritative
 │   └── functions/
 │
 ├── tests/                        # E2E + unit — UNCHANGED
 ├── docs/                         # All planning docs
 │   ├── audit.md                  ← moved from root
 │   ├── claudeaudit.md            ← moved from root
 │   ├── code_organization.md      ← moved from root
 │   ├── Pulse_PRD.md           ← moved from root
 │   ├── MIGRATION_PLAN.md         ← moved from root
 │   ├── architecture/
 │   │   ├── Principal Engineer Execution Plan     ← moved from root
 │   │   └── Systems Architecture Review          ← moved from root (fix typo)
 │   └── reports/
 │       ├── supabase-usage-report-may5-9.md       ← moved from root
 │       └── netlify-build-report.md               ← moved from root
 │
 ├── scripts/
 ├── packages/
 │   └── shared-types/             # Keep as placeholder; defer full monorepo
 ├── native/
 ├── public/
 └── [config files]                # package.json, tsconfig, etc.

 # DELETE:
 # /migrations (root) — legacy, superseded by supabase/migrations/
 # /hooks (root) — merge into lib/hooks/ + features/auth/hooks/
 # /services (root) — fold into features/ (see Phase 4)
 # /apps/web — empty, serves no purpose now
 # /data-analytics — move out of repo entirely
 # /dist, /dist-test-bundle — must be gitignored

 ---
 3. File Movement Table

 3a. Top-Level Services → Features

 Current Path: services/clientsService.ts
 New Path: DELETE (was re-export of features/clients)
 Why: Pure 218B re-export with no callers via this path
 Risk: Low
 ────────────────────────────────────────
 Current Path: services/driversService.ts
 New Path: DELETE
 Why: Pure 219B re-export
 Risk: Low
 ────────────────────────────────────────
 Current Path: services/tripsService.ts
 New Path: DELETE
 Why: Pure 209B re-export
 Risk: Low
 ────────────────────────────────────────
 Current Path: services/loadsService.ts
 New Path: features/indents/services/loads.service.ts
 Why: Sequential ID gen for loads = indent domain
 Risk: Medium
 ────────────────────────────────────────
 Current Path: services/salaryRequestsService.ts
 New Path: features/drivers/services/salaryRequests.service.ts
 Why: Driver salary = driver domain
 Risk: Medium
 ────────────────────────────────────────
 Current Path: services/driverLocationService.ts
 New Path: features/driver/services/driverLocation.service.ts
 Why: Live trip tracking = driver-app domain
 Risk: Medium
 ────────────────────────────────────────
 Current Path: services/routingService.ts
 New Path: lib/routingService.ts
 Why: Cross-domain routing util (maps, no single owner)
 Risk: Medium
 ────────────────────────────────────────
 Current Path: services/tripDocumentsService.ts
 New Path: features/trips/services/tripDocuments.service.ts
 Why: Trip PODs = trips domain
 Risk: Medium
 ────────────────────────────────────────
 Current Path: services/sharedLedgerService.ts
 New Path: features/finance/services/sharedLedger.service.ts
 Why: Shared ledger = finance domain
 Risk: High
 ────────────────────────────────────────
 Current Path: services/sharedLedgerNotificationsService.ts
 New Path: features/finance/notifications/sharedLedgerNotifications.service.ts
 Why: Finance notifications
 Risk: High
 ────────────────────────────────────────
 Current Path: services/logPodsService.ts
 New Path: features/log-pods/services/logPods.service.ts
 Why: POD logging = log-pods domain
 Risk: Medium
 ────────────────────────────────────────
 Current Path: services/connectionRequestsService.ts
 New Path: features/connections/services/connectionRequests.service.ts
 Why: Create new connections feature domain

 
 Risk: High

 3b. Top-Level Hooks → Features + lib/hooks

 ┌───────────────────────────────────────┬─────────────────────────────────────────────────────┬────────────────────────────────────┬──────┐
 │             Current Path              │                      New Path                       │                Why                 │ Risk │
 ├───────────────────────────────────────┼─────────────────────────────────────────────────────┼────────────────────────────────────┼──────┤
 │ hooks/useMobileKeepSignedInSignOut.ts │ features/auth/hooks/useMobileKeepSignedInSignOut.ts │ Auth behavior, mobile-specific     │ Low  │
 ├───────────────────────────────────────┼─────────────────────────────────────────────────────┼────────────────────────────────────┼──────┤
 │ hooks/useWebKeepSignedInSignOut.ts    │ features/auth/hooks/useWebKeepSignedInSignOut.ts    │ Auth behavior, web-specific        │ Low  │
 ├───────────────────────────────────────┼─────────────────────────────────────────────────────┼────────────────────────────────────┼──────┤
 │ hooks/useGlobalFabAnimation.ts        │ lib/hooks/useGlobalFabAnimation.ts                  │ Shared UI infra, used by           │ Low  │
 │                                       │                                                     │ components/FAB.tsx                 │      │
 ├───────────────────────────────────────┼─────────────────────────────────────────────────────┼────────────────────────────────────┼──────┤
 │ hooks/useKeyboardVisible.ts           │ lib/hooks/useKeyboardVisible.ts                     │ Cross-platform keyboard = shared   │ Low  │
 │                                       │                                                     │ infra                              │      │
 └───────────────────────────────────────┴─────────────────────────────────────────────────────┴────────────────────────────────────┴──────┘

 3c. lib/ Domain Files → Features

 ┌───────────────────────────────────┬──────────────────────────────────────────────────┬─────────────────────────────────────────┬────────┐
 │           Current Path            │                     New Path                     │                   Why                   │  Risk  │
 ├───────────────────────────────────┼──────────────────────────────────────────────────┼─────────────────────────────────────────┼────────┤
 │ lib/driverUtils.ts                │ features/drivers/utils/driverUtils.ts            │ Driver entity helpers                   │ Medium │
 ├───────────────────────────────────┼──────────────────────────────────────────────────┼─────────────────────────────────────────┼────────┤
 │ lib/driverTripSequence.ts         │ features/driver/utils/driverTripSequence.ts      │ Driver app trip flow                    │ Medium │
 ├───────────────────────────────────┼──────────────────────────────────────────────────┼─────────────────────────────────────────┼────────┤
 │ lib/driverInviteOffer.util.ts     │ features/drivers/utils/driverInviteOffer.util.ts │ Driver invite = drivers domain          │ Medium │
 ├───────────────────────────────────┼──────────────────────────────────────────────────┼─────────────────────────────────────────┼────────┤
 │ lib/driverCommunication.ts        │ features/driver/utils/driverCommunication.ts     │ Driver app messaging                    │ Medium │
 ├───────────────────────────────────┼──────────────────────────────────────────────────┼─────────────────────────────────────────┼────────┤
 │ lib/driverGpayTransactions.ts     │ features/driver/utils/driverGpayTransactions.ts  │ Driver wallet                           │ Medium │
 ├───────────────────────────────────┼──────────────────────────────────────────────────┼─────────────────────────────────────────┼────────┤
 │ lib/fleetAvatar.ts                │ features/vehicles/utils/fleetAvatar.ts           │ Vehicle/fleet display = vehicles domain │ Medium │
 ├───────────────────────────────────┼──────────────────────────────────────────────────┼─────────────────────────────────────────┼────────┤
 │ lib/indiaLocations.json (213KB)   │ lib/data/indiaLocations.json                     │ Data file ≠ utility code                │ Low    │
 ├───────────────────────────────────┼──────────────────────────────────────────────────┼─────────────────────────────────────────┼────────┤
 │ lib/driverTripStatusNotes.util.ts │ features/driver/utils/                           │ Driver app                              │ Medium │
 ├───────────────────────────────────┼──────────────────────────────────────────────────┼─────────────────────────────────────────┼────────┤
 │ lib/driverAssignerDisplay.ts      │ features/trips/utils/ or features/drivers/utils/ │ Trip assignment display                 │ Medium │
 └───────────────────────────────────┴──────────────────────────────────────────────────┴─────────────────────────────────────────┴────────┘

 3d. components/ Domain Files → Features

 ┌──────────────────────────────────────────────────┬────────────────────────────────────────────────────┬────────────────────────┬──────┐
 │                   Current Path                   │                      New Path                      │          Why           │ Risk │
 ├──────────────────────────────────────────────────┼────────────────────────────────────────────────────┼────────────────────────┼──────┤
 │ components/DriverTripFlowCard.tsx (50KB)         │ features/driver/components/                        │ Driver-app-specific    │ High │
 ├──────────────────────────────────────────────────┼────────────────────────────────────────────────────┼────────────────────────┼──────┤
 │ components/DriverPartnerProfileDashboard.tsx     │ features/driver/components/ or                     │ Driver domain          │ High │
 │                                                  │ features/drivers/components/                       │                        │      │
 ├──────────────────────────────────────────────────┼────────────────────────────────────────────────────┼────────────────────────┼──────┤
 │ components/CounterpartyProfileSystemCard.tsx     │ features/finance/components/ or                    │ Audit actual usage     │ High │
 │ (53KB)                                           │ features/network/components/                       │ first                  │      │
 └──────────────────────────────────────────────────┴────────────────────────────────────────────────────┴────────────────────────┴──────┘

 3e. Root Docs → docs/

 ┌──────────────────────────────────────────────────────────┬──────────────────────────────────────────────────┬──────┐
 │                       Current Path                       │                     New Path                     │ Risk │
 ├──────────────────────────────────────────────────────────┼──────────────────────────────────────────────────┼──────┤
 │ audit.md, claudeaudit.md, code_organization.md           │ docs/                                            │ None │
 ├──────────────────────────────────────────────────────────┼──────────────────────────────────────────────────┼──────┤
 │ Pulse_PRD.md, MIGRATION_PLAN.md                       │ docs/                                            │ None │
 ├──────────────────────────────────────────────────────────┼──────────────────────────────────────────────────┼──────┤
 │ Principal Engineer Execution Plan                        │ docs/architecture/ (fix typo in name)            │ None │
 ├──────────────────────────────────────────────────────────┼──────────────────────────────────────────────────┼──────┤
 │ rincipal Systems Architecture Review                     │ docs/architecture/Systems Architecture Review.md │ None │
 ├──────────────────────────────────────────────────────────┼──────────────────────────────────────────────────┼──────┤
 │ supabase-usage-report-may5-9.md, netlify-build-report.md │ docs/reports/                                    │ None │
 ├──────────────────────────────────────────────────────────┼──────────────────────────────────────────────────┼──────┤
 │ pulse_reset_password_email.html, _v2.html                │ assets/email/                                    │ None │
 ├──────────────────────────────────────────────────────────┼──────────────────────────────────────────────────┼──────┤
 │ PULSE Launch Readiness & Phase-Gate Memo                 │ docs/                                            │ None │
 └──────────────────────────────────────────────────────────┴──────────────────────────────────────────────────┴──────┘

 3f. Deletions

 ┌──────────────────────────────┬────────────────────────────────────────────────┬────────────────────────────────────────────────┐
 │             Path             │                     Action                     │                      Why                       │
 ├──────────────────────────────┼────────────────────────────────────────────────┼────────────────────────────────────────────────┤
 │ migrations/ (root, 14 files) │ Archive to docs/legacy-migrations/ then delete │ Superseded by supabase/migrations/ (323 files) │
 ├──────────────────────────────┼────────────────────────────────────────────────┼────────────────────────────────────────────────┤
 │ hooks/ (root)                │ Delete after moving all 4 files                │ Merged into lib/hooks/ + features/auth/hooks/  │
 ├──────────────────────────────┼────────────────────────────────────────────────┼────────────────────────────────────────────────┤
 │ apps/web/                    │ Delete                                         │ Empty except node_modules                      │
 ├──────────────────────────────┼────────────────────────────────────────────────┼────────────────────────────────────────────────┤
 │ data-analytics/              │ Move out of repo                               │ Python venv in a React Native repo             │
 ├──────────────────────────────┼────────────────────────────────────────────────┼────────────────────────────────────────────────┤
 │ dist/, dist-test-bundle/     │ Gitignore + delete                             │ Build artifacts                                │
 └──────────────────────────────┴────────────────────────────────────────────────┴────────────────────────────────────────────────┘

 ---
 4. Migration Execution Order

 Phase 0: Safety Net (Day 1, 30 min)

 Goal: Establish baseline before any moves.
 # 1. Tag current state
 git tag pre-refactor-baseline

 # 2. Verify CI passes on current branch
 npm run lint && npm test

 # 3. Confirm tsconfig alias
 cat tsconfig.json  # verify @/* → ./

 # 4. Count import references for high-risk files
 grep -r "from '@/services/sharedLedger" . --include="*.ts" --include="*.tsx" | grep -v node_modules
 grep -r "from '@/services/connectionRequests" . --include="*.ts" --include="*.tsx" | grep -v node_modules

 Rollback: git checkout pre-refactor-baseline

 ---
 Phase 1: Zero-Risk Cleanup (Day 1–2, 2 hours)

 What: Docs, assets, gitignore fixes. No import changes.
 1. mkdir -p docs/architecture docs/reports assets/email
 2. git mv audit.md claudeaudit.md code_organization.md Pulse_PRD.md MIGRATION_PLAN.md docs/
 3. git mv "Principal Engineer Execution Plan" "docs/architecture/Principal Engineer Execution Plan.md"
 4. git mv "rincipal Systems Architecture Review" "docs/architecture/Systems Architecture Review.md"
 5. git mv supabase-usage-report-may5-9.md netlify-build-report.md docs/reports/
 6. git mv "PULSE Launch Readiness & Phase-Gate Memo" docs/
 7. git mv pulse_reset_password_email.html pulse_reset_password_email_v2.html assets/email/
 8. Add to .gitignore: /dist /dist-test-bundle /data-analytics /apps/web/.next
 9. git mv migrations/ docs/legacy-migrations/  # archive, don't delete yet
 10. git mv lib/indiaLocations.json lib/data/indiaLocations.json
 CI test: npm run lint && npm test — zero failures expected.
 Rollback: git revert the commit.

 ---
 Phase 2: Consolidate Hooks (Day 2–3, 1 hour)

 What: Move 4 root hooks files. Update their 3 known import sites.
 1. mkdir -p features/auth/hooks lib/hooks
 2. git mv hooks/useMobileKeepSignedInSignOut.ts features/auth/hooks/
 3. git mv hooks/useWebKeepSignedInSignOut.ts features/auth/hooks/
 4. git mv hooks/useGlobalFabAnimation.ts lib/hooks/
 5. git mv hooks/useKeyboardVisible.ts lib/hooks/
 6. Update imports:
    - components/FAB.tsx: @/hooks/useGlobalFabAnimation → @/lib/hooks/useGlobalFabAnimation
    - All useMobileKeepSignedInSignOut callers → @/features/auth/hooks/useMobileKeepSignedInSignOut
    - All useWebKeepSignedInSignOut callers → @/features/auth/hooks/useWebKeepSignedInSignOut
 7. rmdir hooks/
 Verify: grep -r "from '@/hooks" . --include="*.tsx" --include="*.ts" | grep -v node_modules → 0 results.
 CI test: lint + test.

 ---
 Phase 3: Move lib/ Domain Files to Features (Day 3–5, half day)

 Dependency order matters — move leaf utilities before anything that depends on them.

 Sub-phase 3a: Driver utilities (most imported from app/)
 1. git mv lib/driverTripSequence.ts features/driver/utils/
 2. git mv lib/driverTripStatusNotes.util.ts features/driver/utils/
 3. git mv lib/driverCommunication.ts features/driver/utils/
 4. git mv lib/driverGpayTransactions.ts features/driver/utils/
 5. git mv lib/driverUtils.ts features/drivers/utils/
 6. git mv lib/driverAssignerDisplay.ts features/trips/utils/
 7. git mv lib/driverInviteOffer.util.ts features/drivers/utils/
 8. git mv lib/fleetAvatar.ts features/vehicles/utils/

 Sub-phase 3b: Update all @/lib/driver* and @/lib/fleet* import sites
    Use: grep -r "from '@/lib/driver\|from '@/lib/fleet" . --include="*.ts" --include="*.tsx" | grep -v node_modules
    Run sed or targeted Edit tool per file.

 Strategy for import updates:
 # Example for driverUtils
 grep -rl "from '@/lib/driverUtils'" . --include="*.ts" --include="*.tsx" | grep -v node_modules \
   | xargs sed -i "s|from '@/lib/driverUtils'|from '@/features/drivers/utils/driverUtils'|g"

 After each sub-phase: npm run lint — ESLint will catch missed imports.
 CI test: lint + test after all 3a + 3b complete.

 ---
 Phase 4: Move Top-Level Services to Features (Day 5–8, 1 day)

 Order: Simple → Complex. Most risky phase.

 Sub-phase 4a: Delete pure re-exports (clientsService, driversService, tripsService)
 1. Find all callers: grep -r "from '@/services/clients\|@/services/drivers\|@/services/trips'" . ...
 2. Update each caller to import from @/features/[domain]/services/ directly
 3. Delete the 3 re-export files

 Sub-phase 4b: Low-coupling moves (loadsService, salaryRequests, driverLocation, tripDocuments)
 1. git mv services/loadsService.ts features/indents/services/loads.service.ts
 2. git mv services/salaryRequestsService.ts features/drivers/services/salaryRequests.service.ts
 3. git mv services/driverLocationService.ts features/driver/services/driverLocation.service.ts
 4. git mv services/tripDocumentsService.ts features/trips/services/tripDocuments.service.ts
 5. Update all callers (find via grep before moving)

 Sub-phase 4c: High-coupling moves (sharedLedger, logPods)
 1. git mv services/sharedLedgerService.ts features/finance/services/sharedLedger.service.ts
 2. git mv services/sharedLedgerNotificationsService.ts features/finance/notifications/sharedLedgerNotifications.service.ts
 3. git mv services/logPodsService.ts features/log-pods/services/logPods.service.ts
 4. Update all callers

 Sub-phase 4d: connectionRequestsService → new feature
 1. mkdir -p features/connections/services
 2. git mv services/connectionRequestsService.ts features/connections/services/connectionRequests.service.ts
 3. Create features/connections/index.ts barrel
 4. Update all callers

 Sub-phase 4e: routingService stays in lib/
 1. git mv services/routingService.ts lib/routingService.ts
 2. Update callers

 After 4a–4e: rmdir services/ — if it errors, there's a missed file.
 CI test: lint + test + npm run web for visual smoke.

 ---
 Phase 5: Move Domain Components out of components/ (Day 8–10, careful)

 Risk: Highest. These are large files with potential many callers.

 1. Before moving each file, run:
    grep -r "from '@/components/DriverTripFlowCard'" . --include="*.ts" --include="*.tsx" | grep -v node_modules

 2. git mv components/DriverTripFlowCard.tsx features/driver/components/
 3. git mv components/DriverPartnerProfileDashboard.tsx features/driver/components/
 4. For CounterpartyProfileSystemCard: audit usage first, then move to finance/ or network/
 5. Update all callers

 CI test: lint + test + manual visual check in simulator.

 ---
 Phase 6: Enforce Boundaries (Day 10, ongoing)

 Install and configure eslint-plugin-boundaries (see Section 9).

 ---
 Rollback Strategy (any phase)

 # Per-phase rollback
 git revert HEAD  # if single commit per phase

 # Full rollback
 git checkout pre-refactor-baseline

 # Partial rollback (if some phases are deployed)
 git revert <commit-sha>  # revert specific phase commit

 Golden rule: One commit per sub-phase. Never mix phases in a commit. Always run CI before committing.

 ---
 5. Import Refactor Plan

 Current State

 // tsconfig.json
 { "paths": { "@/*": ["./*"] } }
 Single alias. Works but offers no signal about what's "public API" vs internal.

 Recommended Additional Aliases

 {
   "paths": {
     "@/*": ["./*"],
     "@/ui/*": ["./components/*"],
     "@/lib/*": ["./lib/*"],
     "@/features/*": ["./features/*"]
   }
 }
 Keep @/* for backward compat. The new aliases are optional, for new code only — don't mass-migrate.

 Barrel Export Rules

 Each features/[domain]/index.ts should export only the public API — components and hooks consumed by app/ screens. Internal service functions
  should be imported directly from their path.

 // features/trips/index.ts — GOOD
 export { TripCard } from './components/TripCard';
 export { useTripActions } from './hooks/useTripActions';
 // Do NOT re-export trips.service.ts here — service is impl detail

 // app/screens import directly:
 import { getTripsByOrganization } from '@/features/trips/services/trips.service';

 Cyclic Dependency Prevention

 Detected risk: useFinanceLedger imports from trips, vehicles, clients, suppliers. This is a read-only aggregation — acceptable IF
 one-directional. Finance can read trips; trips must NOT import finance.

 Rules:
 1. lib/ → can import nothing from features/
 2. features/[A] → can import from features/[B]/services/ but NEVER from features/[B]/components/ (component coupling = wrong abstraction)
 3. app/ → can import from anywhere
 4. contexts/ → can import from features/*/services/ only, not components
 5. components/ (shared) → can NOT import from features/ — if a shared component needs feature data, it receives it as props

 Detect cycles today:
 npx madge --circular --extensions ts,tsx . --exclude 'node_modules|dist'

 Build Safety During Migration

 Add to tsconfig.json:
 { "compilerOptions": { "noUnusedLocals": true } }
 This causes TypeScript to error on any moved-but-not-updated import, catching misses at compile time before CI runs.

 ---
 6. Domain Boundary Rules

 What belongs in features/[domain]/

 - Supabase queries/mutations for that domain's tables
 - Business logic that is exclusive to the domain
 - React components rendered only within that domain's screens
 - Hooks that depend on domain services
 - TypeScript types for domain entities
 - Domain-specific formatting/display utilities

 What belongs in lib/

 ┌───────────────────────────────────────────────────────┬─────────────────────────────────────────────────────────┐
 │                         File                          │                         Reason                          │
 ├───────────────────────────────────────────────────────┼─────────────────────────────────────────────────────────┤
 │ supabase.ts                                           │ Infrastructure singleton used by every feature          │
 ├───────────────────────────────────────────────────────┼─────────────────────────────────────────────────────────┤
 │ queryKeys.ts                                          │ Cache key contracts used by all features                │
 ├───────────────────────────────────────────────────────┼─────────────────────────────────────────────────────────┤
 │ queryClient.ts                                        │ TanStack configuration                                  │
 ├───────────────────────────────────────────────────────┼─────────────────────────────────────────────────────────┤
 │ routes.ts                                             │ Navigation contracts used by screens + features         │
 ├───────────────────────────────────────────────────────┼─────────────────────────────────────────────────────────┤
 │ capabilities.ts                                       │ Access control used by screens and features             │
 ├───────────────────────────────────────────────────────┼─────────────────────────────────────────────────────────┤
 │ i18n.ts                                               │ Locale infrastructure                                   │
 ├───────────────────────────────────────────────────────┼─────────────────────────────────────────────────────────┤
 │ format.ts, formatEstimatedDuration.ts                 │ Domain-agnostic number/currency formatting              │
 ├───────────────────────────────────────────────────────┼─────────────────────────────────────────────────────────┤
 │ validation.ts, phoneValidation.ts, emailValidation.ts │ Domain-agnostic input validation                        │
 ├───────────────────────────────────────────────────────┼─────────────────────────────────────────────────────────┤
 │ pagination.ts                                         │ Pagination constants used by all query hooks            │
 ├───────────────────────────────────────────────────────┼─────────────────────────────────────────────────────────┤
 │ realtimeRegistry.ts                                   │ Realtime channel management (infra)                     │
 ├───────────────────────────────────────────────────────┼─────────────────────────────────────────────────────────┤
 │ entityIdentity.ts                                     │ Avatar seeds/colors (shared by many features)           │
 ├───────────────────────────────────────────────────────┼─────────────────────────────────────────────────────────┤
 │ avatarUpload.ts, avatarContext.ts                     │ Used by drivers, clients, suppliers, org — truly shared │
 ├───────────────────────────────────────────────────────┼─────────────────────────────────────────────────────────┤
 │ appAlert.ts                                           │ Global alert infrastructure                             │
 ├───────────────────────────────────────────────────────┼─────────────────────────────────────────────────────────┤
 │ cache/, globalSync/                                   │ Sync infrastructure                                     │
 ├───────────────────────────────────────────────────────┼─────────────────────────────────────────────────────────┤
 │ queries/                                              │ All TanStack Query hooks                                │
 ├───────────────────────────────────────────────────────┼─────────────────────────────────────────────────────────┤
 │ hooks/                                                │ Hooks with no domain ownership                          │
 └───────────────────────────────────────────────────────┴─────────────────────────────────────────────────────────┘

 What NEVER belongs in lib/

 - Anything with driver in the name that isn't navigation/session infra
 - Anything with fleet, salary, trip status notes, gpay — these are domain logic
 - Large data files (indiaLocations.json belongs in lib/data/ at minimum)
 - Feature-specific formatting (trip type labels, finance category names)

 Service Ownership Rules

 Rule 1: A service file lives in the feature whose DB table it primarily queries.
   sharedLedgerService → finance (queries ledger/disputes tables)
   tripDocumentsService → trips (queries trip_documents)
   connectionRequestsService → connections (new feature, queries connection_requests)

 Rule 2: Services that span 2+ domains equally → lib/ (routingService is valid here)

 Rule 3: Re-export facades are forbidden. No services/clientsService.ts that only does:
   export * from '@/features/clients/services/clients.service'
   If you need the re-export, add it to the feature's index.ts barrel.

 Rule 4: No service imports from React components. Services are pure data functions.

 Shared UI Rules

 components/ (shared) is for:
   - Atomic/molecular UI primitives used in 3+ feature domains
   - Layout containers (DetailPageLayout, DetailScreenLayout)
   - System UI (AppAlertHost, AppBootGate, AppLoadingSplash)
   - Avatar/entity display primitives (Avatar, EntityRow, EntityAvatar)

 components/ is NOT for:
   - Any component that imports from a single feature's service
   - Components named after a specific domain entity type
     (DriverTripFlowCard → features/driver, CounterpartyProfileSystemCard → features/finance)

 ---
 7. Monorepo Decision

 Current State Assessment

 - packages/shared-types/src/index.ts = 6-line placeholder re-exporting from ../../../types. Not consumed by any real second app.
 - apps/web/ = empty directory with node_modules. No app code.
 - Single tsconfig.json, single package.json — true monolith today.

 Verdict: Do NOT convert to Turborepo/pnpm workspace yet.

 Why not now:
 1. No second app actually exists. Monorepo tooling adds ~2-4 hours/week maintenance for zero benefit when there's one app.
 2. Turborepo pipeline config, workspace hoisting issues, and cross-package type resolution are non-trivial with Expo. Expo's Metro bundler
 has specific monorepo setup requirements.
 3. The team would be managing build tool complexity while also doing this structural refactor — stack them and something breaks.

 When to pull the trigger

 Conditions that justify monorepo migration:
 - apps/web/ becomes an actual Next.js dashboard with its own deploy pipeline
 - packages/shared-types/ is actually imported by 2+ apps (not just a placeholder)
 - Team size exceeds ~8 engineers working concurrently on the repo
 - CI time exceeds 12 minutes and domain-scoped builds would help

 Recommended Setup When Ready

 q-platform/
 ├── apps/
 │   ├── mobile/          # Current pulse repo contents
 │   └── web/             # Next.js dispatcher web
 ├── packages/
 │   ├── shared-types/    # Entity types shared between apps
 │   ├── ui/              # Shared React Native Web components (future)
 │   └── supabase-client/ # Supabase config + queryKeys (future)
 ├── package.json         # pnpm workspace root
 ├── pnpm-workspace.yaml
 └── turbo.json

 Migration path when ready:
 1. Add pnpm-workspace.yaml + turbo.json to current root
 2. mkdir apps && git mv [all current app files] apps/mobile/
 3. Update Metro config's watchFolders to include workspace root
 4. Update Expo's app.config.js paths
 5. Move packages/shared-types to actually export real types

 Tradeoffs:

 ┌────────────────────┬───────────────────────────────┬────────────────────────┐
 │                    │           Monorepo            │    Current monolith    │
 ├────────────────────┼───────────────────────────────┼────────────────────────┤
 │ Shared type safety │ ✅ Strong                     │ ⚠️  Manual sync         │
 ├────────────────────┼───────────────────────────────┼────────────────────────┤
 │ CI speed           │ ✅ Selective builds           │ ❌ Full rebuild always │
 ├────────────────────┼───────────────────────────────┼────────────────────────┤
 │ Setup complexity   │ ❌ High (Expo + Metro quirks) │ ✅ None                │
 ├────────────────────┼───────────────────────────────┼────────────────────────┤
 │ Onboarding         │ ❌ More concepts              │ ✅ Simple              │
 ├────────────────────┼───────────────────────────────┼────────────────────────┤
 │ Deploy isolation   │ ✅ Per-app                    │ ❌ Coupled             │
 └────────────────────┴───────────────────────────────┴────────────────────────┘

 ---
 8. Tech Debt Heatmap

 Critical (address in next sprint)

 1. TripDetailScreen.tsx — 12,427 lines
 - Single component carrying trip lifecycle, finance, documents, chat, assignment, status flow
 - Unloadable on older Android devices (JS parse time)
 - Fix: Extract to TripDetailFinanceSection, TripDetailStatusSection, TripDetailDocumentsSection, TripDetailChatSection — each independently
 lazy-loadable
 - Risk: Any untested branch in this file is a production bug waiting to happen

 2. AddTransactionModal.tsx — 8,990 lines (in components/)
 - Should never be a shared component at this size
 - Carries finance domain logic in the shared layer
 - Fix: Move to features/finance/components/ and decompose into sub-components

 3. globalSync/useGlobalSyncStore.ts — 37KB
 - Priority engine, protocol state machine, health checks — a mini-framework
 - No clear owner (lives in lib/ but is business-logic heavy)
 - Unclear test coverage; a bug here affects all realtime features simultaneously
 - Risk: High. Any change here can cause silent data desync.
 - Fix: Document the state machine formally, add integration tests, consider isolating to lib/sync/

 High (address in 60 days)

 4. useFinanceLedger.ts — cross-domain aggregation
 - Imports from trips, vehicles, clients, suppliers directly
 - If any of those move or rename exports, finance silently breaks
 - Fix: Define stable public APIs in each feature's index.ts barrel; import through those

 5. sharedLedgerNotificationsService.ts — 30KB orphan
 - Finance notification logic sitting in top-level services/
 - Complex, high-value — needs tests before moving
 - Fix: Move to features/finance/notifications/ in Phase 4c

 6. connectionRequestsService.ts — 23KB orphan
 - Org-to-org invite logic with no feature home
 - Cross-domain (clients, suppliers, drivers all use it)
 - Fix: Create features/connections/ as a dedicated domain

 Medium (address in Q3)

 7. Realtime channel proliferation
 - useRealtimeInvalidation creates per-org per-table channels
 - With many tabs open, channel count can spike
 - realtimeRegistry.ts is the throttle — verify it's respected everywhere

 8. lib/ root file count (81 files)
 - Makes lib/ impossible to scan mentally
 - Partially fixed by Phase 3, but the remaining ~50 files still need subcategorization

 9. components/ size (116 files)
 - Mix of atomic primitives and 50KB domain components
 - Fix: Phase 5 relocations + ongoing governance

 Hidden Future Bottlenecks

 10. queryKeys.ts as a monolith
 - Currently one file with keys for every domain
 - As domain count grows, this becomes a conflict hotspot in PRs
 - Future fix: Co-locate each domain's query keys with the feature's index.ts, aggregate in lib/queryKeys.ts

 11. No service-layer error normalization
 - Each service returns { error, data } but error shapes are inconsistent (Supabase errors vs. custom errors)
 - As the app scales, error handling becomes unreliable at the UI layer

 ---
 9. Enforcement Strategy

 ESLint Boundaries (install eslint-plugin-boundaries)

 // eslint.config.cjs additions
 const boundaries = require('eslint-plugin-boundaries');

 // Zone definitions
 boundaries.settings.zones = [
   { type: 'app', pattern: 'app/**' },
   { type: 'feature', pattern: 'features/**' },
   { type: 'lib', pattern: 'lib/**' },
   { type: 'ui', pattern: 'components/**' },
   { type: 'context', pattern: 'contexts/**' },
   { type: 'constants', pattern: 'constants/**' },
 ];

 // Rules
 boundaries.rules['boundaries/element-types'] = ['error', {
   default: 'disallow',
   rules: [
     // app screens can import from anywhere
     { from: 'app', allow: ['feature', 'lib', 'ui', 'context', 'constants'] },
     // features can import from lib, ui primitives, other feature services (not components)
     { from: 'feature', allow: ['lib', 'constants'] },
     // lib cannot import from features (prevents reverse deps)
     { from: 'lib', allow: ['constants'] },
     // shared UI cannot import from features
     { from: 'ui', allow: ['lib', 'constants'] },
     // contexts can use feature services
     { from: 'context', allow: ['lib', 'constants'] },
   ],
 }];

 Naming Convention Enforcement

 Already partially in place via custom ESLint rules (from CLAUDE.md):
 // Extend to cover new patterns
 rules: {
   'local/service-file-naming': 'error',     // *.service.ts in services/
   'local/util-file-naming': 'error',         // *.util.ts in utils/
   'local/no-lib-domain-imports': 'warn',     // warn when lib imports driver*, fleet*, salary*
 }

 CI Validation (add to .github/workflows)

 # architecture-check.yml
 name: Architecture
 on: [pull_request]
 jobs:
   boundaries:
     steps:
       - run: npm run lint -- --rule 'boundaries/element-types: error'
   circular-deps:
     steps:
       - run: npx madge --circular --extensions ts,tsx . --exclude 'node_modules|dist|\.expo'
   lib-size-check:
     steps:
       # Fail if lib/ root file count exceeds 40 (post-refactor target)
       - run: |
           count=$(find lib -maxdepth 1 -name "*.ts" -o -name "*.tsx" | wc -l)
           [ $count -le 40 ] || (echo "lib/ root has $count files (max 40)" && exit 1)

 Architecture Governance (Lightweight)

 - Add ARCHITECTURE.md at repo root with the 6 domain boundary rules from Section 6 (2 pages max)
 - PR template: add checkbox "Does this change respect domain boundaries? (see ARCHITECTURE.md)"
 - Monthly: run npx madge --circular and review output — add to sprint if cycles found
 - File size gate: CI warning if any new component exceeds 500 lines

 ---
 10. Refactor ROI

 Developer Velocity

 ┌──────────────────────────────────────────────────┬─────────────────────────┬────────────────────────────────────┬────────────┐
 │                      Metric                      │         Current         │           Post-Refactor            │    Gain    │
 ├──────────────────────────────────────────────────┼─────────────────────────┼────────────────────────────────────┼────────────┤
 │ Time to find where a service lives               │ ~3 min (check 3 places) │ ~30s (features/[domain]/services/) │ 6× faster  │
 ├──────────────────────────────────────────────────┼─────────────────────────┼────────────────────────────────────┼────────────┤
 │ Time to onboard new engineer to data flow        │ ~2 days                 │ ~4 hours                           │ 4× faster  │
 ├──────────────────────────────────────────────────┼─────────────────────────┼────────────────────────────────────┼────────────┤
 │ Time to understand if a util is shared or domain │ ~5 min                  │ ~30s (lib/ vs features/)           │ 10× faster │
 ├──────────────────────────────────────────────────┼─────────────────────────┼────────────────────────────────────┼────────────┤
 │ PR review clarity (reviewer knows what changed)  │ Low                     │ High                               │ —          │
 └──────────────────────────────────────────────────┴─────────────────────────┴────────────────────────────────────┴────────────┘

 Onboarding Improvements

 - New engineer today: must understand services/, features/, lib/, hooks/ as 4 parallel, overlapping systems
 - New engineer post-refactor: one rule — "domain logic is in features/, shared infra is in lib/"
 - Estimated onboarding time reduction: 2 days → 4 hours for architectural orientation

 Maintenance Reduction

 - Elimination of dual service layer: ~1–2 bugs/quarter from "wrong import path" class of mistakes
 - lib/ cleanup: PR conflicts in lib/ decrease (today every feature engineer touches lib/)
 - Component ownership clarity: fewer "who owns this?" debates in code review

 Scaling Benefits

 - Team can grow from ~5 to ~15 engineers with clear domain ownership boundaries
 - Feature teams can own entire vertical slices: features/[domain]/ + app/[domain-screens]/
 - CI can be scoped to changed domains (preparation for Turborepo later)
 - New features follow an obvious template — no architectural decision needed at feature-start

 Execution Estimate

 ┌───────────────────────────┬─────────┬──────────┬────────┐
 │           Phase           │  Days   │ Engineer │  Risk  │
 ├───────────────────────────┼─────────┼──────────┼────────┤
 │ Phase 0–1 (cleanup, docs) │ 1       │ 1        │ None   │
 ├───────────────────────────┼─────────┼──────────┼────────┤
 │ Phase 2 (hooks)           │ 0.5     │ 1        │ Low    │
 ├───────────────────────────┼─────────┼──────────┼────────┤
 │ Phase 3 (lib/ files)      │ 1.5     │ 1        │ Medium │
 ├───────────────────────────┼─────────┼──────────┼────────┤
 │ Phase 4 (services/)       │ 2       │ 1        │ High   │
 ├───────────────────────────┼─────────┼──────────┼────────┤
 │ Phase 5 (components/)     │ 1.5     │ 1        │ High   │
 ├───────────────────────────┼─────────┼──────────┼────────┤
 │ Phase 6 (enforcement)     │ 0.5     │ 1        │ None   │
 ├───────────────────────────┼─────────┼──────────┼────────┤
 │ Total                     │ ~7 days │ 1 senior │ —      │
 └───────────────────────────┴─────────┴──────────┴────────┘

     - Elimination of dual service layer: ~1–2 bugs/quarter from "wrong import path" class of mistakes
     - lib/ cleanup: PR conflicts in lib/ decrease (today every feature engineer touches lib/)
     - Component ownership clarity: fewer "who owns this?" debates in code review

     Scaling Benefits

     - Team can grow from ~5 to ~15 engineers with clear domain ownership boundaries
     - Feature teams can own entire vertical slices: features/[domain]/ + app/[domain-screens]/
     - CI can be scoped to changed domains (preparation for Turborepo later)
     - New features follow an obvious template — no architectural decision needed at feature-start

     Execution Estimate

     ┌───────────────────────────┬─────────┬──────────┬────────┐
     │           Phase           │  Days   │ Engineer │  Risk  │
     ├───────────────────────────┼─────────┼──────────┼────────┤
     │ Phase 0–1 (cleanup, docs) │ 1       │ 1        │ None   │
     ├───────────────────────────┼─────────┼──────────┼────────┤
     │ Phase 2 (hooks)           │ 0.5     │ 1        │ Low    │
     ├───────────────────────────┼─────────┼──────────┼────────┤
     │ Phase 3 (lib/ files)      │ 1.5     │ 1        │ Medium │
     ├───────────────────────────┼─────────┼──────────┼────────┤
     │ Phase 4 (services/)       │ 2       │ 1        │ High   │
     ├───────────────────────────┼─────────┼──────────┼────────┤
     │ Phase 5 (components/)     │ 1.5     │ 1        │ High   │
     ├───────────────────────────┼─────────┼──────────┼────────┤
     │ Phase 6 (enforcement)     │ 0.5     │ 1        │ None   │
     ├───────────────────────────┼─────────┼──────────┼────────┤
     │ Total                     │ ~7 days │ 1 senior │ —      │
     └───────────────────────────┴─────────┴──────────┴────────┘

     Not included (separate sprint):
     - TripDetailScreen decomposition (~5 days)
     - AddTransactionModal decomposition (~3 days)
     - Monorepo migration (when conditions met, ~3 days)

     ---
     Verification

     After each phase: npm run lint && npm test && npm run web (visual smoke check).
     After Phase 4: Run full E2E — npm run test:web (Playwright) targeting trips, finance, and auth flows.
     After Phase 6: npx madge --circular --extensions ts,tsx . --exclude node_modules → 0 cycles.
     Final gate: npm run build:web must succeed and produce the same bundle size (±5%).

⏺ Here's the full architectural assessment, grounded in the actual codebase state:

  ---
  Overall Score: 6/10 → 8.5/10 post-refactor
  
  The features/[domain]/ model is the right foundation. The score drag comes from 5 specific structural failures that compound each other.

  ---
  The Real Problems (not generic advice)
  
  1. services/ is a lie. Three files (clientsService.ts, driversService.ts, tripsService.ts) are 200-byte re-export facades. Nine files are
  orphaned business logic with no feature home — connectionRequestsService.ts (23KB), sharedLedgerNotificationsService.ts (30KB) have nowhere
  they belong. They accumulate here because the team has no rule for where to put cross-domain services. → Kill the facade files, create 
  features/connections/ as a new domain.

  2. lib/ has 81 root-level files. Domain logic masquerading as shared infra: driverTripSequence.ts, fleetAvatar.ts, driverGpayTransactions.ts,
   driverInviteOffer.util.ts — all clearly owned by features/driver/ or features/vehicles/. Plus a 213KB indiaLocations.json sitting next to
  supabase.ts. → lib/ should have ~40 root files post-refactor. Everything domain-named moves to its feature.

  3. Hooks in 3 places. hooks/ root (4 files), lib/hooks/ (5 files), features/[domain]/hooks/. The root hooks/ has useMobileKeepSignedInSignOut
   and useWebKeepSignedInSignOut — these are auth hooks living outside features/auth/. → Delete hooks/ root entirely.

  4. Two critical monoliths. TripDetailScreen.tsx is 12,427 lines — a single component handling trip lifecycle, finance, documents, chat, and
  assignment. On older Android devices this is a parse-time performance hazard. AddTransactionModal.tsx is 8,990 lines sitting in components/
  (shared layer) while carrying deep finance domain logic. These are separate sprint work, not part of the structural refactor.

  5. Partial monorepo with nothing in it. packages/shared-types/src/index.ts is 6 lines that re-export from ../../../types. apps/web/ is an
  empty directory. Don't convert to Turborepo yet — Expo's Metro bundler has specific monorepo requirements, there's no second app consuming
  shared packages, and the tooling complexity is pure overhead at current team size. Pull the trigger when apps/web/ becomes a real Next.js app
   or team exceeds ~8 engineers.

  ---
  7-Day Execution Plan

  ┌───────┬─────────────────────────────────────────────────────────────────────────────────────────┬──────┬────────┐
  │ Phase │                                          What                                           │ Days │  Risk  │
  ├───────┼─────────────────────────────────────────────────────────────────────────────────────────┼──────┼────────┤
  │ 0–1   │ Docs to docs/, gitignore fixes, archive root migrations/                                │ 1    │ None   │
  ├───────┼─────────────────────────────────────────────────────────────────────────────────────────┼──────┼────────┤
  │ 2     │ Move 4 root hooks files, update 3 import sites                                          │ 0.5  │ Low    │
  ├───────┼─────────────────────────────────────────────────────────────────────────────────────────┼──────┼────────┤
  │ 3     │ Move 8 domain files out of lib/ → features                                              │ 1.5  │ Medium │
  ├───────┼─────────────────────────────────────────────────────────────────────────────────────────┼──────┼────────┤
  │ 4     │ Fold services/ into features, create features/connections/                              │ 2    │ High   │
  ├───────┼─────────────────────────────────────────────────────────────────────────────────────────┼──────┼────────┤
  │ 5     │ Move DriverTripFlowCard (50KB), CounterpartyProfileSystemCard (53KB) out of components/ │ 1.5  │ High   │
  ├───────┼─────────────────────────────────────────────────────────────────────────────────────────┼──────┼────────┤
  │ 6     │ Install eslint-plugin-boundaries, add CI architecture gate                              │ 0.5  │ None   │
  └───────┴─────────────────────────────────────────────────────────────────────────────────────────┴──────┴────────┘

  Key enforcement additions:
  - eslint-plugin-boundaries with zones: app → features → lib → constants (no reverse deps)
  - CI job: npx madge --circular → fail on any cycle

  - CI gate: lib/ root file count ≤ 40 (post-refactor target)
  - noUnusedLocals: true in tsconfig catches missed import updates at compile time