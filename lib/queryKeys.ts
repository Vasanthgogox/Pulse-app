/**
 * Centralized query key factory for TanStack Query.
 * Single source of truth for cache keys; supports invalidation by scope.
 * See docs/PAGINATION_AND_CACHE_ANALYSIS.md.
 */
export const queryKeys = {
  all: ["q"] as const,

  trips: {
    all: (orgId: string) => ["q", "trips", orgId] as const,
    finite: (orgId: string) => ["q", "trips", orgId, "finite"] as const,
    infinite: (orgId: string, pageSize: number) =>
      ["q", "trips", orgId, "infinite", pageSize] as const,
    list: (orgId: string, opts?: { limit?: number; offset?: number }) =>
      opts
        ? (["q", "trips", orgId, opts] as const)
        : (["q", "trips", orgId] as const),
    detail: (tripId: string) => ["q", "trips", "detail", tripId] as const,
    verification: (tripId: string) =>
      ["q", "trips", "verification", tripId] as const,
    verificationPhotos: (tripId: string) =>
      ["q", "trips", "verification", tripId, "photos"] as const,
    fuelEntries: (tripId: string) =>
      ["q", "trips", "operations", tripId, "fuel"] as const,
    tollEntries: (tripId: string) =>
      ["q", "trips", "operations", tripId, "toll"] as const,
    otherEntries: (tripId: string) =>
      ["q", "trips", "operations", tripId, "other"] as const,
    operationsSummary: (tripId: string) =>
      ["q", "trips", "operations", tripId, "summary"] as const,
    operationsTimeline: (tripId: string) =>
      ["q", "trips", "operations", tripId, "timeline"] as const,
    vehicleOperationsLedger: (orgId: string, vehicleId: string) =>
      ["q", "trips", "operations", "vehicle", orgId, vehicleId, "ledger"] as const,
    vehicleOperationsLedgerEntries: (orgId: string, vehicleId: string, stateKey: string) =>
      ["q", "trips", "operations", "vehicle", orgId, vehicleId, "ledger-entries", stateKey] as const,
    workflow: (tripId: string) => ["q", "trips", "workflow", tripId] as const,
    timeline: (tripId: string) => ["q", "trips", "timeline", tripId] as const,
    driverPresence: (tripId: string) => ["q", "trips", "driver-presence", tripId] as const,
    checkpointDistance: (tripId: string) => ["q", "trips", "checkpoint-distance", tripId] as const,
    byDriver: (driverId: string, opts?: { limit?: number; offset?: number }) =>
      opts
        ? (["q", "trips", "driver", driverId, opts] as const)
        : (["q", "trips", "driver", driverId] as const),
    byDriverIds: (
      driverIds: string[],
      opts?: { limit?: number; offset?: number },
    ) => ["q", "trips", "driverIds", driverIds.join(","), opts ?? {}] as const,
    whereOrgIsClient: (orgId: string) =>
      ["q", "trips", "orgIsClient", orgId] as const,
    whereOrgIsSupplier: (orgId: string) =>
      ["q", "trips", "orgIsSupplier", orgId] as const,
    shipperNamesForSupplier: (orgId: string) =>
      ["q", "trips", "shipperNames", orgId] as const,
    /** Prefix: `invalidateQueries` with this refetches every assignment-audit batch. */
    assignmentAuditRoot: ["q", "trips", "assignment-audit"] as const,
    assignmentAudit: (tripIdsKey: string) =>
      ["q", "trips", "assignment-audit", tripIdsKey] as const,
    /** Phase 3a: single-RPC bundle for trip detail hydration. */
    bundle: (tripId: string) => ["q", "trips", "bundle", tripId] as const,
    /** Hub list: last ping time / offline for in-transit trips. */
    hubInTransitPings: (orgId: string, tripIdsKey: string) =>
      ["q", "trips", "hub", orgId, "in-transit-pings", tripIdsKey] as const,
  },

  transactions: {
    all: (orgId: string) => ["q", "transactions", orgId] as const,
    finite: (orgId: string) => ["q", "transactions", orgId, "finite"] as const,
    infinite: (orgId: string, pageSize: number) =>
      ["q", "transactions", orgId, "infinite", pageSize] as const,
    list: (
      orgId: string,
      opts?: { limit?: number; offset?: number; partyName?: string },
    ) =>
      opts
        ? (["q", "transactions", orgId, opts] as const)
        : (["q", "transactions", orgId] as const),
    byContact: (orgId: string, contactId: string) =>
      ["q", "transactions", orgId, "contact", contactId] as const,
    byDriver: (orgId: string, driverId: string) =>
      ["q", "transactions", orgId, "driver", driverId] as const,
  },

  clients: {
    all: (orgId: string) => ["q", "clients", orgId] as const,
    finite: (orgId: string) => ["q", "clients", orgId, "finite"] as const,
    infinite: (orgId: string, pageSize: number) =>
      ["q", "clients", orgId, "infinite", pageSize] as const,
    list: (orgId: string, opts?: { limit?: number; offset?: number }) =>
      opts
        ? (["q", "clients", orgId, opts] as const)
        : (["q", "clients", orgId] as const),
    detail: (orgId: string, clientId: string) =>
      ["q", "clients", orgId, clientId] as const,
    managementBundle: (orgId: string, clientId: string) =>
      ["q", "clients", orgId, clientId, "management-bundle"] as const,
    warehouses: (orgId: string, clientId: string) =>
      ["q", "clients", orgId, clientId, "warehouses"] as const,
    laneRates: (orgId: string, clientId: string, search = "") =>
      ["q", "clients", orgId, clientId, "lane-rates", search] as const,
    linkedOrgLocations: (orgId: string, clientId: string) =>
      ["q", "clients", orgId, clientId, "linked-org-locations"] as const,
  },

  suppliers: {
    all: (orgId: string) => ["q", "suppliers", orgId] as const,
    finite: (orgId: string) => ["q", "suppliers", orgId, "finite"] as const,
    list: (orgId: string, opts?: { limit?: number; offset?: number }) =>
      opts
        ? (["q", "suppliers", orgId, opts] as const)
        : (["q", "suppliers", orgId] as const),
    detail: (orgId: string, supplierId: string) =>
      ["q", "suppliers", orgId, supplierId] as const,
    managementBundle: (orgId: string, supplierId: string) =>
      ["q", "suppliers", orgId, supplierId, "management-bundle"] as const,
  },

  drivers: {
    all: (orgId: string) => ["q", "drivers", orgId] as const,
    finite: (orgId: string) => ["q", "drivers", orgId, "finite"] as const,
    list: (orgId: string, opts?: { limit?: number; offset?: number }) =>
      opts
        ? (["q", "drivers", orgId, opts] as const)
        : (["q", "drivers", orgId] as const),
    detail: (orgId: string, driverId: string) =>
      ["q", "drivers", orgId, driverId] as const,
  },

  vehicles: {
    all: (orgId: string) => ["q", "vehicles", orgId] as const,
    finite: (orgId: string) => ["q", "vehicles", orgId, "finite"] as const,
    list: (orgId: string, opts?: { limit?: number; offset?: number }) =>
      opts
        ? (["q", "vehicles", orgId, opts] as const)
        : (["q", "vehicles", orgId] as const),
    detail: (orgId: string, vehicleId: string) =>
      ["q", "vehicles", orgId, vehicleId] as const,
  },

  indents: {
    all: (orgId: string) => ["q", "indents", orgId] as const,
    finite: (orgId: string) => ["q", "indents", orgId, "finite"] as const,
    infinite: (orgId: string, pageSize: number) =>
      ["q", "indents", orgId, "infinite", pageSize] as const,
    list: (orgId: string, opts?: { limit?: number; offset?: number }) =>
      opts
        ? (["q", "indents", orgId, opts] as const)
        : (["q", "indents", orgId] as const),
    market: (orgId: string) => ["q", "indents", orgId, "market"] as const,
    visible: (orgId: string, indentId: string) =>
      ["q", "indents", orgId, "visible", indentId] as const,
    /** Orgs already upstream in a load's custody chain (loop guard). */
    chainAncestors: (indentId: string) =>
      ["q", "indents", "chain-ancestors", indentId] as const,
    /** Finance aggregation: pending/quoted/awarded indents (pre-trip amount visibility). */
    forFinance: (orgId: string) => ["q", "indents", orgId, "finance"] as const,
    /** Finance aggregation: accepted direct quotes for indents owned by this org. */
    acceptedQuotes: (orgId: string) =>
      ["q", "indents", orgId, "acceptedQuotes"] as const,
  },

  connectionRequests: {
    received: (orgId: string) =>
      ["q", "connection-requests", "received", orgId] as const,
    sent: (orgId: string) =>
      ["q", "connection-requests", "sent", orgId] as const,
  },

  driverInvites: {
    sent: (orgId: string) => ["q", "driver-invites", "sent", orgId] as const,
    /** Driver app: invites received by authenticated user (RPC get_driver_invites_received). */
    received: (userId: string) =>
      ["q", "driver-invites", "received", userId] as const,
  },

  tracking: {
    /** Dispatcher trip detail: presence seed + checkpoint trail for one trip/driver pair. */
    tripLiveSeed: (tripId: string, driverId: string) =>
      ["q", "tracking", "trip-live-seed", tripId, driverId] as const,
  },

  /** Driver app home dashboard (linked drivers + pending OTP trips). */
  driverApp: {
    root: (userId: string) => ["q", "driver-app", userId] as const,
    linkedDrivers: (userId: string) =>
      ["q", "driver-app", userId, "linked-drivers"] as const,
    pendingOtpTrips: (userId: string) =>
      ["q", "driver-app", userId, "pending-otp-trips"] as const,
    /** Home dashboard "at a glance" summary — today's earnings, pending
     * rewards, trips, recommendations. Keyed by the driver row ids it
     * aggregates over (stable, sorted, joined) so it re-fetches when the
     * linked-driver set changes. */
    dailySummary: (driverIdsKey: string) =>
      ["q", "driver-app", "daily-summary", driverIdsKey] as const,
    /** Explicit Fleet Owner capability (not employment). */
    fleetOwner: (userId: string) =>
      ["q", "driver-app", userId, "fleet-owner"] as const,
    /** Personal owner vehicles (Phase 1b). */
    ownerVehicles: (userId: string) =>
      ["q", "driver-app", userId, "owner-vehicles"] as const,
    ownerVehicle: (userId: string, vehicleId: string) =>
      ["q", "driver-app", userId, "owner-vehicles", vehicleId] as const,
    /** Phase 3A: open marketplace loads for Fleet Owner (read-only). */
    fleetOwnerOpenLoads: (userId: string) =>
      ["q", "driver-app", userId, "fleet-owner-open-loads"] as const,
    /** Phase 3B.1: FO capacity Stories authored by this driver. */
    capacityStories: (userId: string) =>
      ["q", "driver-app", userId, "capacity-stories"] as const,
  },

  salaryRequests: (orgId: string, status?: string) =>
    status
      ? (["q", "salary-requests", orgId, status] as const)
      : (["q", "salary-requests", orgId] as const),

  /** Trip finance adjustments (revenue/cost registry) — invalidate org-wide after add/remove on a trip. */
  tripFinanceAdjustmentsRoot: ["q", "trip-finance-adjustments"] as const,

  driverOffers: (orgId: string) => ["q", "driver-offers", orgId] as const,

  logPods: {
    trips: (orgId: string) => ["q", "log-pods", "trips", orgId] as const,
    courierPartners: () => ["q", "log-pods", "courier-partners"] as const,
  },

  invoicing: {
    trips: (orgId: string) => ["q", "invoicing", "trips", orgId] as const,
    summary: (orgId: string) => ["q", "invoicing", "summary", orgId] as const,
  },

  posts: {
    all: (orgId: string) => ["q", "posts", orgId] as const,
    feed: (orgId: string, opts?: { limit?: number; offset?: number }) =>
      opts
        ? (["q", "posts", orgId, "feed", opts] as const)
        : (["q", "posts", orgId, "feed"] as const),
    detail: (postId: string) => ["q", "posts", "detail", postId] as const,
    indentStories: (orgId: string, indentIdsKey: string) =>
      ["q", "posts", orgId, "indent-stories", indentIdsKey] as const,
  },

  bids: {
    forPost: (postId: string) => ["q", "bids", "post", postId] as const,
    directForPost: (postId: string) => ["q", "bids", "direct-post", postId] as const,
    myBid: (postId: string, orgId: string) =>
      ["q", "bids", "mine", postId, orgId] as const,
  },

  storyViews: {
    forPost: (postId: string) => ["q", "story-views", postId] as const,
  },

  reach: {
    plans: () => ["q", "reach", "plans"] as const,
    campaignsForOrg: (orgId: string) => ["q", "reach", "campaigns", orgId] as const,
    campaignPurchasesForOrg: (orgId: string) => ["q", "reach", "campaign-purchases", orgId] as const,
    campaignMetrics: (campaignId: string) => ["q", "reach", "metrics", campaignId] as const,
    wallet: (orgId: string) => ["q", "reach", "wallet", orgId] as const,
    orgSummary: (orgId: string) => ["q", "reach", "org-summary", orgId] as const,
    myReferralCode: (orgId: string) => ["q", "reach", "referral-code", orgId] as const,
    referralsForOrg: (orgId: string) => ["q", "reach", "referrals", orgId] as const,
    referrerName: (code: string) => ["q", "reach", "referrer-name", code] as const,
    driverReferralsForCampaign: (campaignId: string) =>
      ["q", "reach", "driver-referrals", "campaign", campaignId] as const,
    driverReferralsForFleetOrg: (orgId: string) =>
      ["q", "reach", "driver-referrals", "fleet", orgId] as const,
    campaignDelivery: (campaignId: string) =>
      ["q", "reach", "delivery", campaignId] as const,
    driverStories: (userId: string) => ["q", "reach", "driver-stories", userId] as const,
    driverRewardEarnings: (userId: string) =>
      ["q", "reach", "driver-reward-earnings", userId] as const,
    driverReferralForTrip: (tripId: string) =>
      ["q", "reach", "driver-referral-for-trip", tripId] as const,
  },

  discover: {
    search: (orgId: string, search: string) =>
      ["q", "discover", orgId, search] as const,
  },

  mutualConnections: (viewerOrgId: string, targetOrgId: string) =>
    ["q", "network", "mutual-connections", viewerOrgId, targetOrgId] as const,

  unlinkedCounterparties: (orgId: string) =>
    ["q", "network", "unlinked-counterparties", orgId] as const,

  networkNotifications: {
    all: (orgId: string) => ["q", "network", "notifications", orgId] as const,
    list: (orgId: string, statusFilter: string) =>
      ["q", "network", "notifications", orgId, statusFilter] as const,
    count: (orgId: string) =>
      ["q", "network", "notifications", orgId, "count"] as const,
  },

  orgMembers: {
    all: (orgId: string) => ["q", "org-members", orgId] as const,
    list: (orgId: string) => ["q", "org-members", orgId, "list"] as const,
  },

  organizationLocations: {
    list: (orgId: string) => ["q", "organization-locations", orgId] as const,
  },

  organizationWorkspaceProfile: {
    detail: (orgId: string) => ["q", "organization-workspace-profile", orgId] as const,
  },

  teamInvites: {
    mine: () => ["q", "team-invites", "mine"] as const,
  },

  /**
   * Pulse Chat Platform (unified chat_* schema). Inbox is patched in-place by
   * the chat_conversations row subscription in `useChatInboxQuery` — no
   * per-message org-wide fan-out.
   */
  chatPlatform: {
    inbox: (orgId: string) => ["q", "chat-platform", "inbox", orgId] as const,
    tripRoom: (tripId: string) => ["q", "chat-platform", "trip-room", tripId] as const,
    messages: (conversationId: string) =>
      ["q", "chat-platform", "messages", conversationId] as const,
    search: (orgId: string, query: string) =>
      ["q", "chat-platform", "search", orgId, query] as const,
  },

  tripConversations: {
    all: (orgId: string) => ["q", "trip-conversations", orgId] as const,
    detail: (conversationId: string) =>
      ["q", "trip-conversations", "detail", conversationId] as const,
    messages: (conversationId: string) =>
      ["q", "trip-conversations", "messages", conversationId] as const,
    /** Driver app: infinite message pages for one thread. */
    driverMessages: (conversationId: string) =>
      ["q", "trip-conversations", "driver-messages", conversationId] as const,
  },

  identity: {
    one: (userId: string) => ["q", "identity", userId] as const,
    many: (userIdsKey: string) => ["q", "identities", userIdsKey] as const,
  },

  driverChat: {
    conversations: (driverIdsKey: string) =>
      ["q", "driver-chat", "conversations", driverIdsKey] as const,
  },

  disputes: {
    all: (orgId: string) => ["q", "disputes", orgId] as const,
    received: (orgId: string) => ["q", "disputes", orgId, "received"] as const,
    open: (orgId: string) => ["q", "disputes", orgId, "open"] as const,
  },

  /**
   * Compliance & Document Intelligence — keys for the polymorphic
   * `entity_documents` table, audit log, and the per-org / per-entity
   * dashboard slices. Use these instead of ad-hoc strings so realtime
   * invalidation (`useRealtimeInvalidation`) can target precise scopes.
   */
  compliance: {
    /** Root — invalidate to bust every compliance slice for an org. */
    all: (orgId: string) => ["q", "compliance", orgId] as const,
    /** Aggregated `get_compliance_summary` RPC payload. */
    summary: (orgId: string) => ["q", "compliance", orgId, "summary"] as const,
    /** `get_expiring_documents` RPC (paramed by lookahead window). */
    expiring: (orgId: string, daysAhead: number) =>
      ["q", "compliance", orgId, "expiring", daysAhead] as const,
    /** Per-org list (Documents Center sections — optional filter bag). */
    orgList: (
      orgId: string,
      filters: Record<string, unknown> = {},
    ) => ["q", "compliance", orgId, "org-list", filters] as const,
    /** Documents owned by a single entity (vehicle / driver / etc.). */
    byEntity: (
      orgId: string,
      entityType: string,
      entityId: string,
    ) =>
      [
        "q",
        "compliance",
        orgId,
        "by-entity",
        entityType,
        entityId,
      ] as const,
    /** Server-computed compliance score for a single entity. */
    score: (entityType: string, entityId: string) =>
      ["q", "compliance", "score", entityType, entityId] as const,
    /** Document-level audit trail. */
    audit: (documentId: string) =>
      ["q", "compliance", "audit", documentId] as const,
    /** Trip-allocation blocking probe (used by reassign sheets). */
    blocking: (vehicleId: string | null, driverId: string | null) =>
      [
        "q",
        "compliance",
        "blocking",
        vehicleId ?? "_",
        driverId ?? "_",
      ] as const,
  },

  /**
   * Analytics — keys for the Driver / Client / Supplier intelligence
   * modules. All entries derived from RPCs in
   * `supabase/migrations/20260828020000_analytics_rpcs.sql`. Cache
   * lifetime for analytics is generous (default `staleTime` 5 min) since
   * the underlying tables don't change frequently and the RPCs aggregate
   * up to 12 months of data per call.
   */
  analytics: {
    /** Root — invalidate to bust every analytics slice for an org. */
    all: (orgId: string) => ["q", "analytics", orgId] as const,
    /** Monthly aggregation per client. */
    clientMonthly: (orgId: string, clientId: string, monthsBack: number) =>
      [
        "q",
        "analytics",
        orgId,
        "client",
        clientId,
        "monthly",
        monthsBack,
      ] as const,
    /** Customer Health Score for a single client. */
    clientHealth: (orgId: string, clientId: string) =>
      ["q", "analytics", orgId, "client", clientId, "health"] as const,
    /** Monthly aggregation per supplier. */
    supplierMonthly: (orgId: string, supplierId: string, monthsBack: number) =>
      [
        "q",
        "analytics",
        orgId,
        "supplier",
        supplierId,
        "monthly",
        monthsBack,
      ] as const,
    /** Supplier Reliability Score for a single supplier. */
    supplierReliability: (orgId: string, supplierId: string) =>
      ["q", "analytics", orgId, "supplier", supplierId, "reliability"] as const,
    /** Monthly aggregation per driver. */
    driverMonthly: (orgId: string, driverId: string, monthsBack: number) =>
      [
        "q",
        "analytics",
        orgId,
        "driver",
        driverId,
        "monthly",
        monthsBack,
      ] as const,
    /** Driver Performance Score for a single driver. */
    driverPerformance: (orgId: string, driverId: string) =>
      ["q", "analytics", orgId, "driver", driverId, "performance"] as const,
    /** Monthly aggregation per vehicle. */
    vehicleMonthly: (orgId: string, vehicleId: string, monthsBack: number) =>
      [
        "q",
        "analytics",
        orgId,
        "vehicle",
        vehicleId,
        "monthly",
        monthsBack,
      ] as const,
    /** Vehicle Performance Score for a single vehicle. */
    vehiclePerformance: (orgId: string, vehicleId: string) =>
      ["q", "analytics", orgId, "vehicle", vehicleId, "performance"] as const,
  },

  operations: {
    controlCenter: (orgId: string) =>
      ["q", "operations", "control-center", orgId] as const,
    reimbursementQueue: (orgId: string) =>
      ["q", "operations", "reimbursement-queue", orgId] as const,
    vehicleEconomics: (orgId: string) =>
      ["q", "operations", "vehicle-economics", orgId] as const,
    healthSnapshot: (orgId: string) =>
      ["q", "operations", "health", orgId] as const,
    observabilityByTrip: (tripId: string) =>
      ["q", "operations", "observability", tripId] as const,
    postingReconciliationByTrip: (tripId: string) =>
      ["q", "trips", "operations", "reconciliation", tripId] as const,
    ledgerReconciliationByOrg: (orgId: string) =>
      ["q", "operations", "ledger-reconciliation", "org", orgId] as const,
    ledgerReconciliationByTrip: (tripId: string) =>
      ["q", "operations", "ledger-reconciliation", "trip", tripId] as const,
  },

  ocr: {
    metrics: (orgId: string, days = 30) =>
      ["q", "ocr", "metrics", orgId, days] as const,
  },

  /** Linked-org display profiles (avatar URL + seed) fetched via batch RPC. */
  linkedOrgDisplay: (ids: string[]) =>
    ["q", "linked-org-display", ids.join("|")] as const,

  /** Driver linked-user profile images (signed URLs) fetched via batch RPC. */
  driverProfileImages: (ids: string[]) =>
    ["q", "driver-profile-images", ids.join(",")] as const,

  workspace: {
    products: (orgId: string) => ["q", "workspace", "products", orgId] as const,
    waitlist: (orgId: string) => ["q", "workspace", "waitlist", orgId] as const,
    verificationBanner: (orgId: string) =>
      ["q", "workspace", "verificationBanner", orgId] as const,
  },
} as const;
