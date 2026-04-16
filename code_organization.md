  Code Organization Audit & Top 1% Structure Proposal                                                                            
                                                                                                                                 
  Q Mobile — React Native + Expo + Supabase                                                                                      
                                                                                                                                 
  ---                                                                                                                            
  Section 1: Current State Scorecard                                                                                             
                                                                                                                                 
  ┌────────────────────────────┬────────────────┬───────┬─────────────────────────────────────────────────────────────────────┐
  │            Area            │     Files      │ Grade │                                Issue                                │  
  ├────────────────────────────┼────────────────┼───────┼─────────────────────────────────────────────────────────────────────┤  
  │ features/ (11 of 17)       │ Has barrels    │ A     │ Inconsistent — 5 features missing barrels                           │  
  ├────────────────────────────┼────────────────┼───────┼─────────────────────────────────────────────────────────────────────┤  
  │ features/ screen placement │ —              │ C+    │ Some features dump screens at root, others in components/           │  
  ├────────────────────────────┼────────────────┼───────┼─────────────────────────────────────────────────────────────────────┤  
  │ components/                │ 41 files, flat │ C     │ No categorization, no barrel — 41-file flat dump                    │  
  ├────────────────────────────┼────────────────┼───────┼─────────────────────────────────────────────────────────────────────┤  
  │ lib/                       │ 33 files, flat │ C     │ Flat dumping ground — hooks, utils, supabase client, maps all mixed │  
  ├────────────────────────────┼────────────────┼───────┼─────────────────────────────────────────────────────────────────────┤  
  │ contexts/                  │ 8 files        │ B-    │ Good files, no barrel                                               │  
  ├────────────────────────────┼────────────────┼───────┼─────────────────────────────────────────────────────────────────────┤  
  │ constants/                 │ 8 files        │ B-    │ Good files, no barrel                                               │  
  ├────────────────────────────┼────────────────┼───────┼─────────────────────────────────────────────────────────────────────┤  
  │ services/                  │ 11 files       │ D     │ Identity crisis — half are redundant re-exports of features         │  
  ├────────────────────────────┼────────────────┼───────┼─────────────────────────────────────────────────────────────────────┤  
  │ types/                     │ 6 files        │ B+    │ Has barrel, cross-imports are clean                                 │  
  ├────────────────────────────┼────────────────┼───────┼─────────────────────────────────────────────────────────────────────┤  
  │ app/ (routes)              │ Thin, correct  │ A     │ Good — no business logic in routes                                  │
  ├────────────────────────────┼────────────────┼───────┼─────────────────────────────────────────────────────────────────────┤  
  │ Naming conventions         │ Mixed          │ C+    │ camelCase vs PascalCase inconsistency                               │
  └────────────────────────────┴────────────────┴───────┴─────────────────────────────────────────────────────────────────────┘  
                  
  ---                                                                                                                            
  Section 2: What's Right — Keep Exactly As-Is
                                              
  ✓ features/<domain>/
      services/     ← Supabase calls, one file per domain                                                                        
      components/   ← UI owned by this feature                                                                                   
      hooks/        ← Feature-specific React hooks                                                                               
      utils/        ← Pure helpers                                                                                               
      index.ts      ← Public API barrel
                                                                                                                                 
  ✓ features/finance/aggregation/   ← Deserves its own sub-module                                                                
  ✓ features/vehicles/pnl/          ← Same, good separation                                                                      
  ✓ features/trips/components/add-trip/  ← Sub-feature barrel pattern                                                            
  ✓ lib/queries/                    ← TanStack Query hooks have their own dir                                                    
  ✓ lib/pod/                        ← POD processing is self-contained                                                           
  ✓ app/ route structure            ← Expo Router groups are clean                                                               
  ✓ types/index.ts                  ← Cross-feature type barrel exists                                                           
  ✓ components/driver/              ← Driver-specific UI isolated                                                                
  ✓ components/demo/index.ts        ← Barrel exists here                                                                         
  ✓ @/ path alias                   ← Clean, no relative traversal
                                                                                                                                 
  ---             
  Section 3: What's Wrong — Exact Problems                                                                                       
                                                                                                                                 
  Problem 1: 5 Features Have No Barrel (Import Chaos)
                                                                                                                                 
  features/invoicing/        ← No index.ts
  features/log-pods/         ← No index.ts                                                                                       
  features/network/          ← No index.ts
  features/ops-agent/        ← No index.ts (only has components/index.ts)                                                        
  features/pod-reconciliation/ ← No index.ts
                                                                                                                                 
  Effect: Consumers import like this:
  // CURRENT (bad) — exposes internals                                                                                           
  import { InvoicingExecuteScreen } from '@/features/invoicing/InvoicingExecuteScreen';                                          
  import { PodReconciliationScreen } from '@/features/pod-reconciliation/PodReconciliationScreen';
                                                                                                                                 
  // CORRECT — single entry point
  import { InvoicingExecuteScreen } from '@/features/invoicing';                                                                 
  import { PodReconciliationScreen } from '@/features/pod-reconciliation';
                                                                                                                                 
  ---             
  Problem 2: Feature Screens Live Inconsistently                                                                                 
   
  features/invoicing/InvoicingExecuteScreen.tsx    ← AT ROOT (wrong)                                                             
  features/log-pods/LogIncomingPodsScreen.tsx       ← AT ROOT (wrong)                                                            
  features/ops-agent/OpsAgentScreen.tsx             ← AT ROOT (wrong)
  features/ops-agent/OpsAgentMessageRow.tsx         ← AT ROOT (wrong)                                                            
  features/pod-reconciliation/PodReconciliationScreen.tsx ← AT ROOT (wrong)                                                      
   
  vs.                                                                                                                            
                  
  features/clients/components/ClientDetailScreen.tsx    ← IN components/ (correct)                                               
  features/trips/components/trip-detail/TripDetailScreen.tsx ← IN components/ (correct)
  features/drivers/components/DriverDetailScreen.tsx    ← IN components/ (correct)                                               
   
  All screens belong in components/ of their feature. Flat feature root should only hold index.ts, types.ts, constants.ts.       
                  
  ---                                                                                                                            
  Problem 3: services/ Is an Identity Crisis

  services/
    clientsService.ts       ← just: export * from '@/features/clients/services/...'  (REDUNDANT)
    driversService.ts        ← just: export * from '@/features/drivers/services/...'  (REDUNDANT)                                
    tripsService.ts          ← just: export * from '@/features/trips/services/...'    (REDUNDANT)                                
                                                                                                                                 
    connectionRequestsService.ts   ← STANDALONE, belongs in features/network/                                                    
    driverLocationService.ts        ← STANDALONE, belongs in features/drivers/                                                   
    routingService.ts               ← STANDALONE, belongs in features/trips/                                                     
    salaryRequestsService.ts        ← STANDALONE, belongs in features/drivers/
    sharedLedgerService.ts          ← STANDALONE, belongs in features/finance/                                                   
    tripDocumentsService.ts         ← STANDALONE, belongs in features/trips/
    logPodsService.ts               ← STANDALONE, belongs in features/log-pods/                                                  
    opsAgentService.ts              ← STANDALONE, belongs in features/ops-agent/
                                                                                                                                 
  The redundant re-exports exist as a legacy facade. They add a layer of indirection with no benefit — direct feature imports    
  already work fine.                                                                                                             
                                                                                                                                 
  ---             
  Problem 4: lib/ Is a 33-File Flat Dump

  lib/
    supabase.ts          ← Supabase client
    queryClient.ts       ← React Query setup                                                                                     
    queryKeys.ts         ← React Query keys
    format.ts            ← Currency/date formatters                                                                              
    formatEstimatedDuration.ts  ← Same domain as format.ts                                                                       
    validation.ts        ← Input validation                                                                                      
    phoneValidation.ts   ← Same domain as validation.ts                                                                          
    emailValidation.ts   ← Same domain as validation.ts                                                                          
    logger.ts            ← Logging                                                                                               
    capabilities.ts      ← Access control (IMPORTANT — keep prominent)
    driverUtils.ts       ← Driver-specific util in shared lib?                                                                   
    contactPicker.ts     ← Native contact picker                                                                                 
    contactPickerNative.ts ← Duplicate platform variant                                                                          
    reactNativeMapsCompat.ts   ← Platform compat shim                                                                            
    reactNativeMapsCompat.web.ts ← Same                                                                                          
    reactNativeMapsCompat.native.ts ← Same                                                                                       
    smsOtpBridge.ts      ← SMS OTP                                                                                               
    smsComposer.ts       ← Same domain as smsOtpBridge                                                                           
    mapStyles.ts         ← Map config                                                                                            
    placesService.ts     ← Actually a service, lives here?
    localTripSubcontracts.ts ← Trip logic in shared lib?                                                                         
    totals.util.ts       ← Generic util                                                                                          
    ... 10 more                                                                                                                  
                                                                                                                                 
  No grouping, no concept boundaries. Everything mixed with everything.                                                          
                                                                                                                                 
  ---                                                                                                                            
  Problem 5: components/ Is a 41-File Flat Dump

  components/
    DetailPageLayout.tsx     ← layout concern
    ListScreenLayout.tsx     ← layout concern
    WizardStepLayout.tsx     ← layout concern                                                                                    
    KeyboardAwareLayout.tsx  ← layout concern
    PaymentCaptureLayout.tsx ← layout concern                                                                                    
    ThemedConfirmModal.tsx   ← modal concern                                                                                     
    ThemedAlertModal.tsx     ← modal concern
    KeyboardAwareModal.tsx   ← modal concern                                                                                     
    LoadBoardModal.tsx       ← modal concern                                                                                     
    CenteredLoadingView.tsx  ← feedback concern
    FAB.tsx                  ← navigation concern                                                                                
    FinanceFAB.tsx           ← navigation concern
    TeslaHeader.tsx          ← navigation concern                                                                                
    FloatingOpsAgentButton.tsx ← navigation concern                                                                              
    SubTabs.tsx              ← navigation concern
    SummaryCard.tsx          ← display concern                                                                                   
    EntityRow.tsx            ← display concern
    TransactionRow.tsx       ← display concern                                                                                   
    InvoicePdf.tsx           ← document concern                                                                                  
    ... 22 more
                                                                                                                                 
  No developer should need to browse 41 files to find a layout component. Flat structure kills discoverability.                  
   
  ---                                                                                                                            
  Problem 6: Naming Convention Inconsistencies

  constants/courierCategories.ts    ← camelCase
  constants/Theme.ts                ← PascalCase  ← rest are PascalCase                                                          
                                                                                                                                 
  services/clientsService.ts        ← camelCase                                                                                  
  features/clients/services/clients.service.ts  ← kebab.case                                                                     
                                                                                                                                 
  hooks: useOpsAgentChat.ts (feature root) vs lib/queries/useClientsQuery.ts (lib/queries/)                                      
                                                                                                                                 
  Rule should be: kebab-case.ts for all files, PascalCase.tsx for components only.                                               
                  
  ---                                                                                                                            
  Section 4: The Ideal Structure
                                                                                                                                 
  q-web/
  │                                                                                                                              
  ├── app/                           ← UNCHANGED — Expo Router thin routes only
  │   ├── (auth)/                    ← MOVE sign-in, sign-up, driver-signup, auth/callback here
  │   ├── (tabs)/                                                                                                                
  │   ├── (driver)/
  │   ├── (modals)/                                                                                                              
  │   ├── client/[id].tsx                                                                                                        
  │   ├── trip/[id].tsx
  │   ├── ... other dynamic routes                                                                                               
  │   ├── +html.tsx                                                                                                              
  │   ├── +not-found.tsx
  │   └── _layout.tsx                                                                                                            
  │               
  ├── features/                      ← Domain features (vertical slices)                                                         
  │   │           
  │   ├── auth/                      ✓ GOOD AS-IS
  │   ├── clients/                   ✓ GOOD AS-IS                                                                                
  │   ├── drivers/
  │   │   ├── components/                                                        
                                                  
  │   │   ├── hooks/                                                                                                             
  │   │   ├── services/
  │   │   │   ├── drivers.service.ts                                                                                             
  │   │   │   ├── driver-location.service.ts    ← MOVE FROM services/
  │   │   │   └── salary-requests.service.ts    ← MOVE FROM services/                                                            
  │   │   ├── utils/
  │   │   ├── types.ts                                                                                                           
  │   │   └── index.ts               ✓ EXISTS
  │   │                                                                                                                          
  │   ├── finance/                   ✓ GOOD AS-IS (most mature module)
  │   │   ├── accounting/                                                                                                        
  │   │   ├── aggregation/
  │   │   ├── components/                                                                                                        
  │   │   ├── hooks/
  │   │   ├── services/                                                                                                          
  │   │   │   ├── finance.service.ts
  │   │   │   └── shared-ledger.service.ts      ← MOVE FROM services/
  │   │   └── index.ts                                                                                                           
  │   │
  │   ├── indents/                   ✓ GOOD AS-IS                                                                                
  │   │                                                                                                                          
  │   ├── invoicing/                 ← FIX NEEDED
  │   │   ├── components/                                                                                                        
  │   │   │   ├── InvoicingExecuteScreen.tsx    ← MOVE FROM feature root                                                         
  │   │   │   └── ... existing components
  │   │   ├── hooks/                                                                                                             
  │   │   ├── services/
  │   │   ├── types.ts                                                                                                           
  │   │   └── index.ts               ← ADD
  │   │                                                                                                                          
  │   ├── log-pods/                  ← FIX NEEDED
  │   │   ├── components/                                                                                                        
  │   │   │   └── LogIncomingPodsScreen.tsx     ← MOVE FROM feature root
  │   │   ├── services/                                                                                                          
  │   │   │   └── log-pods.service.ts           ← MOVE FROM services/
  │   │   ├── types.ts                                                                                                           
  │   │   └── index.ts               ← ADD                                                                                       
  │   │
  │   ├── network/                   ← EVALUATE (possible merge into suppliers)                                                  
  │   │   ├── components/            ✓ EXISTS                                                                                    
  │   │   ├── services/
  │   │   │   └── connection-requests.service.ts  ← MOVE FROM services/                                                          
  │   │   └── index.ts               ← ADD                                                                                       
  │   │
  │   ├── ops-agent/                 ← FIX NEEDED                                                                                
  │   │   ├── components/            ✓ EXISTS (has barrel)
  │   │   ├── hooks/                                                                                                             
  │   │   ├── services/                                                                                                          
  │   │   │   ├── ops-agent.service.ts
  │   │   │   └── ops-agent-chat.service.ts     ← MOVE FROM services/                                                            
  │   │   ├── constants.ts                                                                                                       
  │   │   ├── types.ts
  │   │   ├── utils.ts                                                                                                           
  │   │   └── index.ts               ← ADD
  │   │                                                                                                                          
  │   ├── organization/              ✓ GOOD AS-IS
  │   │                                                                                                                          
  │   ├── pod-reconciliation/        ← FIX NEEDED
  │   │   ├── components/                                                                                                        
  │   │   │   └── PodReconciliationScreen.tsx   ← MOVE FROM feature root
  │   │   ├── lib/                   ✓ EXISTS                                                                                    
  │   │   ├── services/                                                                                                          
  │   │   ├── types.ts
  │   │   └── index.ts               ← ADD                                                                                       
  │   │           
  │   ├── ratings/                   ✓ GOOD AS-IS
  │   ├── suppliers/                 ✓ GOOD AS-IS                                                                                
  │   │
  │   ├── trips/                                                                                                                 
  │   │   ├── components/
  │   │   ├── hooks/                                                                                                             
  │   │   ├── services/
  │   │   │   ├── trips.service.ts                                                                                               
  │   │   │   ├── trip-documents.service.ts     ← MOVE FROM services/
  │   │   │   └── routing.service.ts            ← MOVE FROM services/                                                            
  │   │   ├── visibility/            ✓ EXISTS
  │   │   ├── types.ts                                                                                                           
  │   │   └── index.ts               ✓ EXISTS
  │   │                                                                                                                          
  │   ├── vehicles/                  ✓ GOOD AS-IS (including pnl sub-module)
  │   └── ai/                        ✓ GOOD AS-IS                                                                                
  │                                                                                                                              
  ├── components/                    ← REORGANIZE INTO CATEGORIES                                                                
  │   ├── layout/                    ← Screen layout shells                                                                      
  │   │   ├── DetailPageLayout.tsx                                                                                               
  │   │   ├── DetailScreenLayout.tsx
  │   │   ├── KeyboardAwareLayout.tsx                                                                                            
  │   │   ├── ListScreenLayout.tsx                                                                                               
  │   │   ├── PaymentCaptureLayout.tsx
  │   │   ├── WizardStepLayout.tsx                                                                                               
  │   │   └── index.ts
  │   │                                                                                                                          
  │   ├── modals/                    ← Modal shells and themed dialogs
  │   │   ├── KeyboardAwareModal.tsx                                                                                             
  │   │   ├── LoadBoardModal.tsx                                                                                                 
  │   │   ├── ThemedAlertModal.tsx
  │   │   ├── ThemedConfirmModal.tsx                                                                                             
  │   │   └── index.ts
  │   │
  │   ├── feedback/                  ← Loading, empty states, toasts                                                             
  │   │   ├── CenteredLoadingView.tsx
  │   │   ├── LiquidFillPill.tsx                                                                                                 
  │   │   └── index.ts                                                                                                           
  │   │
  │   ├── navigation/                ← FABs, headers, tab bars, back buttons                                                     
  │   │   ├── FAB.tsx                                                                                                            
  │   │   ├── FinanceFAB.tsx
  │   │   ├── FloatingOpsAgentButton.tsx                                                                                         
  │   │   ├── HeaderPlusButton.tsx                                                                                               
  │   │   ├── SemanticAddIcon.tsx
  │   │   ├── SubTabs.tsx                                                                                                        
  │   │   ├── TeslaHeader.tsx
  │   │   └── index.ts                                                                                                           
  │   │                                                                                                                          
  │   ├── display/                   ← Generic display components
  │   │   ├── EntityRow.tsx                                                                                                      
  │   │   ├── IntegrationModeTag.tsx
  │   │   ├── SummaryCard.tsx                                                                                                    
  │   │   ├── TransactionRow.tsx
  │   │   ├── PaymentTransactionRow.tsx                                                                                          
  │   │   ├── StyledText.tsx                                                                                                     
  │   │   └── index.ts
  │   │                                                                                                                          
  │   ├── document/                  ← PDF/print generation
  │   │   ├── InvoicePdf.tsx                                                                                                     
  │   │   ├── InvoicePdf.web.tsx
  │   │   ├── PdfViewer.tsx                                                                                                      
  │   │   ├── PdfViewer.native.tsx
  │   │   ├── PdfViewer.web.tsx                                                                                                  
  │   │   └── index.ts                                                                                                           
  │   │
  │   ├── map/                       ← Map components                                                                            
  │   │   ├── OptimalRouteMap.tsx
  │   │   ├── OptimalRouteMap.web.tsx                                                                                            
  │   │   └── index.ts
  │   │                                                                                                                          
  │   ├── driver/                    ✓ KEEP — driver-specific UI (has own sub-concerns)
  │   ├── demo/                      ✓ KEEP (has barrel, dev/demo only)                                                          
  │   └── index.ts                   ← ADD — re-exports from all categories                                                      
  │                                                                                                                              
  ├── lib/                           ← REORGANIZE INTO SUB-DOMAINS                                                               
  │   │                                                                                                                          
  │   ├── supabase/                  ← All Supabase infrastructure
  │   │   ├── client.ts              (rename from supabase.ts)                                                                   
  │   │   ├── query-client.ts        (move from lib/queryClient.ts)                                                              
  │   │   ├── query-keys.ts          (move from lib/queryKeys.ts)
  │   │   ├── realtime-invalidation.ts (move from lib/queries/)                                                                  
  │   │   └── index.ts                                                                                                           
  │   │                                                                                                                          
  │   ├── format/                    ← All formatters in one place                                                               
  │   │   ├── currency.ts            (split from format.ts)
  │   │   ├── date.ts                (split from format.ts)                                                                      
  │   │   ├── duration.ts            (move formatEstimatedDuration.ts)
  │   │   ├── vehicle.ts             (split from format.ts)                                                                      
  │   │   └── index.ts
  │   │                                                                                                                          
  │   ├── validation/                ← All validators together                                                                   
  │   │   ├── phone.ts               (move phoneValidation.ts)
  │   │   ├── email.ts               (move emailValidation.ts)                                                                   
  │   │   ├── form.ts                (move validation.ts)                                                                        
  │   │   └── index.ts
  │   │                                                                                                                          
  │   ├── platform/                  ← Platform compat shims
  │   │   ├── maps-compat.ts                                                                                                     
  │   │   ├── maps-compat.web.ts
  │   │   ├── maps-compat.native.ts                                                                                              
  │   │   ├── contact-picker.ts                                                                                                  
  │   │   ├── contact-picker.native.ts
  │   │   └── index.ts                                                                                                           
  │   │           
  │   ├── queries/                   ✓ KEEP AS-IS (TanStack Query hooks)
  │   ├── pod/                       ✓ KEEP AS-IS                                                                                
  │   │
  │   ├── capabilities.ts            ← KEEP AT ROOT (core access control)                                                        
  │   ├── i18n.ts                    ← KEEP AT ROOT (app-wide concern)
  │   ├── logger.ts                  ← KEEP AT ROOT                                                                              
  │   └── index.ts                   ← ADD (re-export only critical shared utils)
  │                                                                                                                              
  ├── contexts/                      ← KEEP FILES, ADD BARREL
  │   ├── AuthContext.tsx                                                                                                        
  │   ├── DriverAvatarContext.tsx
  │   ├── DriverThemeContext.tsx                                                                                                 
  │   ├── LanguageContext.tsx                                                                                                    
  │   ├── NetworkContext.tsx
  │   ├── OrganizationContext.tsx                                                                                                
  │   ├── WalletContext.tsx
  │   ├── DemoTabBarScrollContext.tsx                                                                                            
  │   └── index.ts                   ← ADD
  │                                                                                                                              
  ├── constants/                     ← KEEP FILES, ADD BARREL + FIX NAMING
  │   ├── Theme.ts                   ✓ KEEP                                                                                      
  │   ├── Layout.ts                  ✓ KEEP                                                                                      
  │   ├── Colors.ts                  ✓ KEEP
  │   ├── Typography.ts              ✓ KEEP                                                                                      
  │   ├── DriverLevels.ts            ✓ KEEP
  │   ├── UserAvatars.ts             ✓ KEEP                                                                                      
  │   ├── courier-categories.ts      ← RENAME from courierCategories.ts
  │   ├── AllowedUrls.ts             ✓ KEEP                                                                                      
  │   └── index.ts                   ← ADD
  │                                                                                                                              
  ├── types/                         ✓ GOOD AS-IS
  │   ├── index.ts                                                                                                               
  │   ├── organization.ts
  │   ├── pod.ts
  │   ├── expo-location.d.ts                                                                                                     
  │   ├── expo-print.d.ts
  │   └── jspdf.d.ts                                                                                                             
  │                                                                                                                              
  ├── services/                      ← RATIONALIZE (reduce to non-feature services only)
  │   │                                 Remove: clientsService, driversService, tripsService                                     
  │   │                                 (these are now served by feature barrels directly)                                       
  │   ├── index.ts                   ← ADD (re-export remaining non-feature services)                                            
  │   └── [nothing else — all moved to feature services/]                                                                        
  │                                                                                                                              
  └── scripts/                       ✓ KEEP AS-IS (CLI/standalone)
                                                                                                                                 
  ---             
  Section 5: Priority Matrix                                                                                                     
                            
  Priority 1 — High Impact, Low Risk (Do First)
                                                                                                                                 
  ┌─────┬───────────────────────────────────────────┬────────┬───────────────────────────────────────────────────────────────┐   
  │  #  │                  Change                   │ Effort │                              Why                              │   
  ├─────┼───────────────────────────────────────────┼────────┼───────────────────────────────────────────────────────────────┤   
  │ 1   │ Add index.ts barrels to 5 missing         │ 1–2    │ Stops internal path leakage; zero runtime risk                │
  │     │ features                                  │ hrs    │                                                               │
  ├─────┼───────────────────────────────────────────┼────────┼───────────────────────────────────────────────────────────────┤   
  │ 2   │ Move feature screen files from root into  │ 2 hrs  │ Enforces the rule consistently; no import changes needed if   │   
  │     │ components/                               │        │ barrel added simultaneously                                   │   
  ├─────┼───────────────────────────────────────────┼────────┼───────────────────────────────────────────────────────────────┤   
  │ 3   │ Add contexts/index.ts barrel              │ 30 min │ One file, re-export all 8 contexts                            │
  ├─────┼───────────────────────────────────────────┼────────┼───────────────────────────────────────────────────────────────┤   
  │ 4   │ Add constants/index.ts barrel             │ 30 min │ Same                                                          │
  ├─────┼───────────────────────────────────────────┼────────┼───────────────────────────────────────────────────────────────┤   
  │ 5   │ Rename courierCategories.ts →             │ 5 min  │ Consistency                                                   │
  │     │ courier-categories.ts                     │        │                                                               │   
  └─────┴───────────────────────────────────────────┴────────┴───────────────────────────────────────────────────────────────┘
                                                                                                                                 
  Priority 2 — Medium Impact, Medium Effort (Do Next Sprint)                                                                     
  
  ┌─────┬─────────────────────────────────────────────────────────────┬────────┬─────────────────────────────────────────────┐   
  │  #  │                           Change                            │ Effort │                     Why                     │
  ├─────┼─────────────────────────────────────────────────────────────┼────────┼─────────────────────────────────────────────┤
  │ 6   │ Move 8 standalone services/ files into their feature homes  │ 3–4    │ Eliminates orphan services; all code finds  │
  │     │                                                             │ hrs    │ its domain                                  │
  ├─────┼─────────────────────────────────────────────────────────────┼────────┼─────────────────────────────────────────────┤   
  │ 7   │ Delete 3 redundant services/ re-export facades              │ 30 min │ After updating any callers (few, since      │
  │     │                                                             │        │ features already have barrels)              │   
  ├─────┼─────────────────────────────────────────────────────────────┼────────┼─────────────────────────────────────────────┤
  │ 8   │ Categorize components/ into layout/, modals/, navigation/,  │ 3–4    │ Biggest discoverability win                 │   
  │     │ feedback/, display/, document/, map/                        │ hrs    │                                             │   
  ├─────┼─────────────────────────────────────────────────────────────┼────────┼─────────────────────────────────────────────┤
  │ 9   │ Add components/index.ts barrel                              │ 1 hr   │ After categorization                        │   
  └─────┴─────────────────────────────────────────────────────────────┴────────┴─────────────────────────────────────────────┘   
  
  Priority 3 — Long-Term Structural (Do Incrementally)                                                                           
                  
  ┌─────┬──────────────────────────────────────────────────────────────────────┬────────┬───────────────────────────────────┐    
  │  #  │                                Change                                │ Effort │                Why                │ 
  ├─────┼──────────────────────────────────────────────────────────────────────┼────────┼───────────────────────────────────┤ 
  │ 10  │ Reorganize lib/ into lib/supabase/, lib/format/, lib/validation/,    │ 4–6    │ Kills the dumping-ground pattern  │ 
  │     │ lib/platform/                                                        │ hrs    │                                   │ 
  ├─────┼──────────────────────────────────────────────────────────────────────┼────────┼───────────────────────────────────┤    
  │ 11  │ Move lib/queryClient.ts + lib/queryKeys.ts into lib/supabase/        │ 1 hr   │ Co-locate Supabase infrastructure │
  ├─────┼──────────────────────────────────────────────────────────────────────┼────────┼───────────────────────────────────┤    
  │ 12  │ Group auth routes: app/(auth)/ for sign-in, sign-up, driver-signup,  │ 1 hr   │ Visual clarity in routes          │
  │     │ callback                                                             │        │                                   │    
  ├─────┼──────────────────────────────────────────────────────────────────────┼────────┼───────────────────────────────────┤    
  │ 13  │ Split lib/format.ts into lib/format/currency.ts, date.ts, vehicle.ts │ 2 hrs  │ format.ts is already large and    │
  │     │                                                                      │        │ growing                           │    
  └─────┴──────────────────────────────────────────────────────────────────────┴────────┴───────────────────────────────────┘    
   
  ---                                                                                                                            
  Section 6: File Naming Convention (Enforce Everywhere)
                                                                                                                                 
  Rule: kebab-case for all .ts files
        PascalCase.tsx for all React components                                                                                  
        useXxx.ts for all hooks (regardless of location)                                                                         
                                                                                                                                 
  ✓  clients.service.ts         ← kebab-case service                                                                             
  ✓  AddClientModal.tsx          ← PascalCase component                                                                          
  ✓  useClientsQuery.ts          ← useXxx hook                                                                                   
  ✓  capabilities.ts             ← kebab-case utility                                                                            
  ✓  courier-categories.ts       ← kebab-case constant (rename needed)                                                           
                                                                                                                                 
  ✗  courierCategories.ts        ← camelCase (fix)
  ✗  queryClient.ts              ← camelCase (move+rename to query-client.ts)                                                    
  ✗  queryKeys.ts                ← camelCase (move+rename to query-keys.ts)                                                      
   
  ---                                                                                                                            
  Section 7: What a Feature Module Looks Like at 100%
                                                                                                                                 
  Every feature should match this template — features/trips/ is the closest to perfect today:
                                                                                                                                 
  features/trips/ 
  ├── components/                                                                                                                
  │   ├── add-trip/              ← sub-feature (complex enough to warrant)
  │   │   ├── AddTripModal.tsx                                                                                                   
  │   │   ├── AddTripFormFields.tsx                                                                                              
  │   │   └── index.ts                                                                                                           
  │   ├── trip-detail/                                                                                                           
  │   │   ├── TripDetailScreen.tsx
  │   │   ├── TripDetailHeader.tsx                                                                                               
  │   │   └── index.ts
  │   ├── TripExpandableCard.tsx                                                                                                 
  │   ├── TripAssignmentBlock.tsx                                                                                                
  │   ├── TripFinanceBlock.tsx
  │   └── TripTrackingBlock.tsx                                                                                                  
  ├── hooks/                                                                                                                     
  │   └── use-realtime-trips.ts
  ├── services/                                                                                                                  
  │   ├── trips.service.ts       ← core CRUD
  │   ├── trip-documents.service.ts  ← document ops (move from services/)                                                        
  │   └── routing.service.ts     ← route calculation (move from services/)
  ├── utils/                                                                                                                     
  │   └── trip-display.ts
  ├── visibility/                ← complex enough for own dir                                                                    
  │   └── trip-visibility.ts
  ├── types.ts                   ← all Trip types                                                                                
  ├── constants.ts               ← TRIP_STATUS, etc. (if needed)
  └── index.ts                   ← THE ONLY PUBLIC ENTRY POINT                                                                   
      ↑                                                                                                                          
      export { AddTripModal, TripDetailScreen, TripExpandableCard } from './components/...'                                      
      export { getTripsByOrganization, createTrip, ... } from './services/trips.service'                                         
      export type { TripRow, CreateTripData, ... } from './types'                                                                
      // Nothing from internals leaks out                                                                                        
                                                                                                                                 
  ---                                                                                                                            
  Summary: 13 Changes, Ranked                                                                                                    
                  
  IMMEDIATE (this week):
    ✅  1. Add index.ts to: invoicing, log-pods, network, ops-agent, pod-reconciliation
    ✅  2. Move root-level screens into each feature's components/
    ✅  3. Add contexts/index.ts
    ✅  4. Add constants/index.ts
    ✅  5. Rename courierCategories.ts → courier-categories.ts
   
  NEXT SPRINT:                                                                                                                   
    ✅  6. Move services/connectionRequestsService → features/network/services/
    ✅  7. Move services/driverLocationService → features/drivers/services/
    ✅  8. Move services/salaryRequestsService → features/drivers/services/
    ✅  9. Move services/sharedLedgerService → features/finance/services/
    ✅ 10. Move services/tripDocumentsService → features/trips/services/
    ✅ 11. Move services/routingService → features/trips/services/
    ✅ 12. Categorize components/ into 7 sub-dirs + add barrel
    ✅ 13. Delete 3 redundant services/ re-export facades
                                                                                                                                 
  LONG-TERM:                                                                                                                     
    ✅ 14. Reorganize lib/ into supabase/, format/, validation/, platform/
    ✅ 15. Group app/(auth)/ routes
    ✅ 16. Split lib/format.ts by domain
                                                                                                                                 
  The existing feature architecture is already top 20%. These 13 changes bring it to top 1% — consistent, navigable, zero        
  ambiguity about where any new file belongs.