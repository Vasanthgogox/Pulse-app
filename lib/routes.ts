/**
 * Centralized route constants.
 *
 * Use these instead of hardcoded string literals everywhere in the app.
 * Benefits: find-all-references, rename-safety, and a single place to update paths.
 */
import * as Linking from "expo-linking";

export type TripDetailRouteTab = "trip" | "finance" | "expenses" | "docs";
export type TripDetailRouteFinanceSubTab = "summary" | "transactions";

export type TripDetailRouteOptions = {
  tab?: TripDetailRouteTab;
  financeSubTab?: TripDetailRouteFinanceSubTab;
  entryContext?: "supplier" | "vehicle" | "client";
  clientIdFromContext?: string;
  clientNameFromContext?: string;
};

function tripDetailRouteQuery(options?: TripDetailRouteOptions): string {
  if (!options) return "";
  const params = new URLSearchParams();
  if (options.tab) params.set("tab", options.tab);
  if (options.financeSubTab) params.set("financeSubTab", options.financeSubTab);
  if (options.entryContext) params.set("entryContext", options.entryContext);
  if (options.clientIdFromContext) {
    params.set("clientIdFromContext", options.clientIdFromContext);
  }
  if (options.clientNameFromContext) {
    params.set("clientNameFromContext", options.clientNameFromContext);
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export const ROUTES = {
  INDEX: '/',
  /** Marketing landing (web). */
  TERMINAL_WEBSITE: '/terminal-website',
  /** Legacy alias — redirects to {@link ROUTES.ONBOARDING.HUB}. */
  WELCOME: '/welcome',
  SIGN_IN: '/sign-in',
  /** Same as {@link ROUTES.SIGN_IN} — kept for existing call sites (logout, guards). */
  SIGN_IN_DIRECT: '/sign-in',
  /** Phone + OTP entry for existing drivers — verifies number then redirects to {@link ROUTES.SIGN_IN} (email prefilled when known). */
  DRIVER_SIGN_IN: '/driver-sign-in',
  /** Request a Supabase password reset email; allow-list `/auth/reset-password` on the same origin in Supabase Auth. */
  FORGOT_PASSWORD: '/forgot-password',
  /** Deep link / web URL target after user taps the reset link in email. */
  AUTH_RESET_PASSWORD: '/auth/reset-password',
  SIGN_UP: '/sign-up',
  /** Persona-first onboarding hub (Phase 2). Legacy `/sign-up` remains valid. */
  ONBOARDING: {
    HUB: '/onboarding',
    BUSINESS: '/onboarding/business',
    DRIVER: '/onboarding/driver',
    JOIN_TEAM: '/onboarding/join-team',
  },

  TABS: {
    /** Fiscal / Cash ledger tab */
    FINANCE:  '/(tabs)/finance'   as const,
    /** Trips management tab */
    TRIPS:    '/(tabs)/trips'     as const,
    /** Network / connections tab */
    NETWORK:  '/(tabs)/network'   as const,
    /** Profile settings (not in main dock) */
    PROFILE:  '/(tabs)/profile'   as const,
    /** Resources / More (not in main dock) */
    RESOURCES:'/(tabs)/resources' as const,
  },

  DRIVER_ROOT: '/(driver)' as const,

  /** Full-screen Pulse Chat (root stack — preferred entry). */
  CHAT: '/chat' as const,

  MODALS: {
    TEAM:           '/(modals)/team'           as const,
    /** Owner-only member role & access control. */
    ACCESS_CONTROL: '/(modals)/access-control' as const,
    /** Owner-only per-member domain permission detail. */
    MEMBER_PERMISSIONS: '/(modals)/member-permissions' as const,
    INVITE_MEMBER:  '/(modals)/invite-member'  as const,
    LANGUAGE_SETTINGS: '/(modals)/language-settings' as const,
    /** @deprecated Use {@link ROUTES.CHAT}; kept for deep links — redirects to `/chat`. */
    CHAT:           '/(modals)/chat'           as const,
  },

  // Settings flows (root-level stack)
  /** @deprecated Route replaced by WORKSPACE. branding-settings now redirects there. */
  BRANDING_SETTINGS: '/branding-settings' as const,
  /** Canonical org hub: logo, name, KYC, team, invoice branding. */
  WORKSPACE:         '/workspace'         as const,
  /** Step-through business verification wizard (Sprint 1). */
  BUSINESS_VERIFY:   '/business-verify'   as const,
  /** Own-org network profile hub (Details / Team / My Profile tabs on desktop). */
  networkOrgHub: (
    tab:
      | "details"
      | "team"
      | "profile"
      | "sales"
      | "goals"
      | "asset"
      | "network"
      | "connections"
      | "grow"
      | "chat" = "details",
  ) => {
    const normalized =
      tab === "connections" || tab === "grow" ? "network" : tab;
    return normalized === "details"
      ? ("/(tabs)/network/hub" as const)
      : (`/(tabs)/network/hub?tab=${normalized}` as const);
  },
  /** Business intelligence command center with cross-filter analytics. */
  BUSINESS_PULSE:    '/business-pulse'    as const,
  /** Personal identity: name, email, phone, personal avatar */
  MY_ACCOUNT:        '/account'           as const,

  /** Compliance & Document Intelligence hub — opened from header icons. */
  DOCUMENTS_CENTER: '/documents-center' as const,

  /** Full-screen alert detail (registry → ledger-style detail + wizard CTAs). */
  alertDetail: (
    kind: "salary" | "shared" | "ops",
    id: string,
    mode: "active" | "archive" = "active",
  ) => {
    const q = new URLSearchParams({ kind, alertId: id, mode });
    return `/alert-detail?${q.toString()}` as const;
  },

  vehicleAnalytics: (vehicleId: string) =>
    `/vehicle/${encodeURIComponent(vehicleId)}/analytics` as const,
  clientAnalytics: (clientId: string) =>
    `/client/${encodeURIComponent(clientId)}/analytics` as const,
  /** Customer management hub (Overview, KYC, Warehouses, Contracts, …). */
  clientProfile: (clientId: string, tab?: string) => {
    const base = `/party/customers/${encodeURIComponent(clientId)}` as const;
    if (!tab) return base;
    return `${base}?tab=${encodeURIComponent(tab)}` as const;
  },
  /** Party directory — customers, suppliers, drivers, vehicles. */
  partyDirectory: (kind: "customers" | "suppliers" | "drivers" | "vehicles") =>
    `/party/${kind}` as const,
  supplierProfile: (supplierId: string, tab?: string) => {
    const base = `/supplier/${encodeURIComponent(supplierId)}/profile` as const;
    if (!tab) return base;
    return `${base}?tab=${encodeURIComponent(tab)}` as const;
  },
  driverProfile: (driverId: string, tab?: string) => {
    const base = `/driver/${encodeURIComponent(driverId)}/profile` as const;
    if (!tab) return base;
    return `${base}?tab=${encodeURIComponent(tab)}` as const;
  },
  vehicleProfile: (vehicleId: string, tab?: string) => {
    const base = `/vehicle/${encodeURIComponent(vehicleId)}/profile` as const;
    if (!tab) return base;
    return `${base}?tab=${encodeURIComponent(tab)}` as const;
  },
  /** Read-only party profile (client / supplier / driver) — connections hub avatar, chat, etc. */
  publicProfile: (
    type: "client" | "supplier" | "driver",
    partyId: string,
  ) => `/public-profile/${type}/${encodeURIComponent(partyId)}` as const,
  /** Finance entity detail (trips, cash flow). */
  clientDetail: (clientId: string, tab?: 'trips' | 'cash') => {
    const base = `/client/${encodeURIComponent(clientId)}` as const;
    if (!tab) return base;
    return `${base}?tab=${encodeURIComponent(tab)}` as const;
  },
  /** Finance entity detail (trips, cash flow). */
  supplierDetail: (supplierId: string, tab?: 'trips' | 'cash') => {
    const base = `/supplier/${encodeURIComponent(supplierId)}` as const;
    if (!tab) return base;
    return `${base}?tab=${encodeURIComponent(tab)}` as const;
  },
  /** Fleet driver detail (trips, cash flow / ledger, earnings). */
  driverDetail: (
    driverId: string,
    tab?: "trips" | "ledger" | "statement" | "ranking" | "earnings" | "cash",
  ) => {
    const base = `/driver/${encodeURIComponent(driverId)}` as const;
    if (!tab || tab === "trips") return base;
    const normalized = tab === "cash" ? "ledger" : tab;
    return `${base}?tab=${encodeURIComponent(normalized)}` as const;
  },
  /** Vehicle detail (trips, P&L, operations). */
  vehicleDetail: (vehicleId: string) =>
    `/vehicle/${encodeURIComponent(vehicleId)}` as const,
  supplierAnalytics: (supplierId: string) =>
    `/supplier/${encodeURIComponent(supplierId)}/analytics` as const,
  driverAnalytics: (driverId: string) =>
    `/driver/${encodeURIComponent(driverId)}/analytics` as const,

  // Full-screen flows (root-level stack)
  ADD_TRIP:       '/add-trip'       as const,
  /** User-local vehicle or product type label (device-only). */
  addCommodityType: (kind: 'vehicle' | 'product') =>
    `/add-commodity-type?kind=${kind}` as const,
  /** Trip detail (operations hub). */
  tripDetail: (tripId: string, options?: TripDetailRouteOptions) =>
    `/trip/${encodeURIComponent(tripId)}${tripDetailRouteQuery(options)}` as const,
  /** Customer Track & Trace — simplified read-only view for the linked client org. */
  trackTrip: (tripId: string) => `/track/${encodeURIComponent(tripId)}` as const,
  /** Fleet-wide operations dashboard (active alerts, dwell/transit outliers, stage distribution). */
  FLEET_OPERATIONS: '/fleet-operations' as const,
  /** Trip detail → Finance Hub → Transactions (ledger rows for the trip). */
  tripDetailFinanceTransactions: (tripId: string) =>
    `/trip/${encodeURIComponent(tripId)}?tab=finance&financeSubTab=transactions` as const,
  /** Full-screen driver & vehicle assignment from trip detail (Change). */
  tripAssignment: (tripId: string, focus?: 'driver' | 'vehicle') => {
    const base = `/trip/${encodeURIComponent(tripId)}/assignment` as const;
    if (!focus) return base;
    return `${base}?focus=${focus}` as const;
  },
  /** Load / indent detail (GET LOAD hub, review, deploy entry). */
  indentDetail: (indentId: string) =>
    `/indent/${encodeURIComponent(indentId)}` as const,
  /** Awarded indent → deploy trip (asset roster or aggregate partner flow). */
  indentAllocation: (indentId: string, focus?: "driver" | "vehicle") => {
    const base = `/indent/${encodeURIComponent(indentId)}/allocation` as const;
    if (!focus) return base;
    return `${base}?focus=${focus}` as const;
  },
  /** Optional trip odometer verification (start/end/both). */
  tripVerification: (tripId: string, side: "start" | "end" | "both" = "start") =>
    `/trip/${encodeURIComponent(tripId)}/verification?side=${side}` as const,
  /** Optional operations entries (fuel/toll). */
  tripFuelEntry: (tripId: string, entryId?: string) => {
    const base = `/trip/${encodeURIComponent(tripId)}/operations/fuel`;
    return entryId ? `${base}?entryId=${encodeURIComponent(entryId)}` : base;
  },
  tripTollEntry: (tripId: string, entryId?: string) => {
    const base = `/trip/${encodeURIComponent(tripId)}/operations/toll`;
    return entryId ? `${base}?entryId=${encodeURIComponent(entryId)}` : base;
  },
  tripOtherExpenseEntry: (tripId: string, entryId?: string) => {
    const base = `/trip/${encodeURIComponent(tripId)}/operations/other`;
    return entryId ? `${base}?entryId=${encodeURIComponent(entryId)}` : base;
  },
  tripExpenses: (tripId: string) =>
    `/trip/${encodeURIComponent(tripId)}/operations/expenses` as const,
  /** Unified fuel / toll / other expense launcher. */
  tripExpenseLauncher: (tripId: string) =>
    `/trip/${encodeURIComponent(tripId)}/operations/launcher` as const,
  /** Modal: same add-client UX as Create Trip (PartyRegistrationPortal on web). */
  ADD_CLIENT:     '/(modals)/add-client' as const,
  CREATE_INDENT:  '/create-indent'  as const,
  LOAD_BOARD:     '/load-board'     as const,
  /** Load Center + share indent to Pulse (story); use when Network is story-only. */
  PULSE_LOADS:   '/pulse-loads'   as const,
  /** DBA audit tool — web only. */
  DBA_AUDIT:     '/audit'          as const,
  REACH: {
    /** Product home — Credits Balance, Reach Delivered, Active Campaigns,
     * Quick Actions, Recent Campaigns. The discovery entry point (Phase 2.2). */
    HOME: '/reach' as const,
    /** Org's Reach campaigns with Impressions/Views/Bids/Credits Used — not
     * load-only long-term (RFQs, hiring, fleet requirements can all become
     * Reach campaigns later), hence "Reach" not "Boost" in the screen name. */
    HISTORY: '/reach/history' as const,
    /** Placeholder only (Phase 2.2) — no referral/verification backend yet;
     * every card reads "Coming Soon". Educational, not functional. */
    EARN_CREDITS: '/reach/earn-credits' as const,
    /** Opportunities (Boost V2) — business opportunities recommended by
     * drivers, priority-scored; approval hands off to a pre-filled bid in the
     * normal bid flow. */
    INBOX: '/reach/inbox' as const,
    /** Single campaign — identity (from its snapshot_* columns), plan/spend,
     * metrics, status/countdown, and actions (View Original Story / Boost
     * Again / Share). The single source of truth for one campaign. */
    campaignDetail: (campaignId: string) => `/reach/campaign/${campaignId}` as const,
  },
  /** Story-detail share landing (Broadcast Load / Pulse story bidding page). */
  storyDetail: (
    postId: string,
    orgId: string,
    storyType: "LOAD" | "VEHICLE_AVAILABILITY" | "UPDATE",
    queue?: string,
  ) => {
    const q = new URLSearchParams({ postId, orgId, storyType, queue: queue ?? postId });
    return `/story-detail?${q.toString()}` as const;
  },
} as const;

/**
 * Public shareable URL for a story-detail post (Broadcast Load "bidding page" link).
 * Uses EXPO_PUBLIC_WEB_BASE_URL when set (real https link for external shares);
 * falls back to an Expo deep link in dev/native builds without a configured web base.
 */
export function buildPulseStoryPublicUrl(
  postId: string,
  orgId: string,
  storyType: "LOAD" | "VEHICLE_AVAILABILITY" | "UPDATE",
): string {
  const webBase = process.env.EXPO_PUBLIC_WEB_BASE_URL?.trim().replace(/\/$/, "") || "";
  const qs = ROUTES.storyDetail(postId, orgId, storyType).slice("/story-detail?".length);
  if (webBase !== "") {
    return `${webBase}/story-detail?${qs}`;
  }
  return Linking.createURL(`/story-detail?${qs}`);
}

function routeParamOne(
  raw: Record<string, string | string[] | undefined>,
  key: string,
): string | undefined {
  const v = raw[key];
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v[0];
  return undefined;
}

/** Parse `/trip/[id]` search params into trip detail screen props. */
export function parseTripDetailRouteParams(
  raw: Record<string, string | string[] | undefined>,
): TripDetailRouteOptions & { tripId: string } {
  const tripId = routeParamOne(raw, "id") ?? "";
  const tab = routeParamOne(raw, "tab");
  const financeSubTab = routeParamOne(raw, "financeSubTab");
  const entryContext = routeParamOne(raw, "entryContext");
  const clientIdFromContext = routeParamOne(raw, "clientIdFromContext");
  const clientNameFromContext = routeParamOne(raw, "clientNameFromContext");

  return {
    tripId,
    tab:
      tab === "finance" || tab === "expenses" || tab === "docs" || tab === "trip"
        ? tab
        : undefined,
    financeSubTab:
      financeSubTab === "summary" || financeSubTab === "transactions"
        ? financeSubTab
        : undefined,
    entryContext:
      entryContext === "supplier" ||
      entryContext === "vehicle" ||
      entryContext === "client"
        ? entryContext
        : undefined,
    clientIdFromContext,
    clientNameFromContext,
  };
}

/** True when the user is on the full-screen indent deploy / allocation wizard. */
export function isIndentAllocationPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return /\/indent\/[^/]+\/allocation(?:\/|$|\?)/.test(pathname);
}

export function parseIndentIdFromAllocationPath(
  pathname: string | null | undefined,
): string | null {
  if (!pathname) return null;
  const m = pathname.match(/\/indent\/([^/]+)\/allocation/);
  return m?.[1] ? decodeURIComponent(m[1]) : null;
}

/** True on `/indent/[id]` detail — not allocation sub-route. */
export function isIndentDetailPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  if (isIndentAllocationPath(pathname)) return false;
  const path = pathname.split("?")[0] ?? "";
  return /\/indent\/[^/]+$/.test(path);
}

export function parseIndentIdFromDetailPath(
  pathname: string | null | undefined,
): string | null {
  if (!pathname || !isIndentDetailPath(pathname)) return null;
  const path = pathname.split("?")[0] ?? "";
  const m = path.match(/\/indent\/([^/]+)$/);
  return m?.[1] ? decodeURIComponent(m[1]) : null;
}

/** Allocation wizard or indent detail — hide global deploy prompt while focused. */
export function isIndentDeployFlowPath(pathname: string | null | undefined): boolean {
  return isIndentAllocationPath(pathname) || isIndentDetailPath(pathname);
}

export function parseIndentIdFromDeployFlowPath(
  pathname: string | null | undefined,
): string | null {
  return (
    parseIndentIdFromAllocationPath(pathname) ??
    parseIndentIdFromDetailPath(pathname)
  );
}

/** Navigate to fuel/toll/other entry screen for editing an existing line item (`fuel:uuid`, etc.). */
export function tripExpenseEntryEditRoute(tripId: string, costEventId: string): string | null {
  const [kind, sourceId] = costEventId.split(":");
  if (!sourceId) return null;
  if (kind === "fuel") return ROUTES.tripFuelEntry(tripId, sourceId);
  if (kind === "toll") return ROUTES.tripTollEntry(tripId, sourceId);
  if (kind === "other") return ROUTES.tripOtherExpenseEntry(tripId, sourceId);
  return null;
}

/** The three tabs that live in the bottom dock and are valid startup landing pages. */
export const BOOKMARKABLE_TABS = [
  ROUTES.TABS.TRIPS,
  ROUTES.TABS.FINANCE,
  ROUTES.TABS.NETWORK,
] as const;

export type BookmarkableTab = (typeof BOOKMARKABLE_TABS)[number];

/**
 * Default landing route for dispatcher / admin users (non-driver).
 * Trips is the primary operational view; Finance is secondary.
 */
export const DEFAULT_DISPATCHER_ROUTE: BookmarkableTab = ROUTES.TABS.TRIPS;

/** Default landing route for the driver role. */
export const DEFAULT_DRIVER_ROUTE = ROUTES.DRIVER_ROOT;
