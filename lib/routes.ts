/**
 * Centralized route constants.
 *
 * Use these instead of hardcoded string literals everywhere in the app.
 * Benefits: find-all-references, rename-safety, and a single place to update paths.
 */
export const ROUTES = {
  INDEX: '/',
  /** Marketing landing (web). */
  TERMINAL_WEBSITE: '/terminal-website',
  /** Legacy alias — redirects to {@link ROUTES.ONBOARDING.HUB}. */
  WELCOME: '/welcome',
  SIGN_IN: '/sign-in',
  /** Same as {@link ROUTES.SIGN_IN} — kept for existing call sites (logout, guards). */
  SIGN_IN_DIRECT: '/sign-in',
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
  /** Own-org network profile hub (Details / Team / My Profile tabs on desktop). */
  networkOrgHub: (
    tab:
      | "details"
      | "team"
      | "profile"
      | "sales"
      | "goals"
      | "asset"
      | "connections"
      | "grow"
      | "chat" = "details",
  ) =>
    tab === "details"
      ? ("/(tabs)/network/hub" as const)
      : (`/(tabs)/network/hub?tab=${tab}` as const),
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
    const q = new URLSearchParams({ kind, id, mode });
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
  /** Finance entity detail (trips, cash flow, shared ledger). */
  clientDetail: (clientId: string, tab?: 'trips' | 'cash' | 'shared') => {
    const base = `/client/${encodeURIComponent(clientId)}` as const;
    if (!tab) return base;
    return `${base}?tab=${encodeURIComponent(tab)}` as const;
  },
  /** Finance entity detail (trips, cash flow, shared ledger). */
  supplierDetail: (supplierId: string, tab?: 'trips' | 'cash' | 'shared') => {
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
} as const;

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
