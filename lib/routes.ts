/**
 * Centralized route constants.
 *
 * Use these instead of hardcoded string literals everywhere in the app.
 * Benefits: find-all-references, rename-safety, and a single place to update paths.
 */
export const ROUTES = {
  INDEX: '/',
  SIGN_IN: '/sign-in',
  /** Direct sign-in form (skip web landing chooser). */
  SIGN_IN_DIRECT: '/sign-in?direct=1',
  SIGN_UP: '/sign-up',

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

  MODALS: {
    TEAM:           '/(modals)/team'           as const,
    INVITE_MEMBER:  '/(modals)/invite-member'  as const,
    CHAT:           '/(modals)/chat'           as const,
  },

  // Full-screen flows (root-level stack)
  ADD_TRIP:       '/add-trip'       as const,
  CREATE_INDENT:  '/create-indent'  as const,
  LOAD_BOARD:     '/load-board'     as const,
  /** Load Center + share indent to Pulse (story); use when Network is story-only. */
  PULSE_LOADS:   '/pulse-loads'   as const,
} as const;

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
