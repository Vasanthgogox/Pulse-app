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
  /** Business vs driver entry; top “Sign In” goes to {@link ROUTES.SIGN_IN}. */
  WELCOME: '/welcome',
  SIGN_IN: '/sign-in',
  /** Same as {@link ROUTES.SIGN_IN} — kept for existing call sites (logout, guards). */
  SIGN_IN_DIRECT: '/sign-in',
  /** Request a Supabase password reset email; allow-list `/auth/reset-password` on the same origin in Supabase Auth. */
  FORGOT_PASSWORD: '/forgot-password',
  /** Deep link / web URL target after user taps the reset link in email. */
  AUTH_RESET_PASSWORD: '/auth/reset-password',
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

  /** Full-screen Pulse Chat (root stack — preferred entry). */
  CHAT: '/chat' as const,

  MODALS: {
    TEAM:           '/(modals)/team'           as const,
    INVITE_MEMBER:  '/(modals)/invite-member'  as const,
    /** @deprecated Use {@link ROUTES.CHAT}; kept for deep links — redirects to `/chat`. */
    CHAT:           '/(modals)/chat'           as const,
  },

  // Settings flows (root-level stack)
  /** @deprecated Route replaced by WORKSPACE. branding-settings now redirects there. */
  BRANDING_SETTINGS: '/branding-settings' as const,
  /** Canonical org hub: logo, name, KYC, team, invoice branding. */
  WORKSPACE:         '/workspace'         as const,
  /** Personal identity: name, email, phone, personal avatar */
  MY_ACCOUNT:        '/account'           as const,
  /** Workspace admin: company logo, KYC, TMS metrics */
  COMPANY_PROFILE:   '/company-profile'   as const,

  // Full-screen flows (root-level stack)
  ADD_TRIP:       '/add-trip'       as const,
  /** Modal: same add-client UX as Create Trip (PartyRegistrationPortal on web). */
  ADD_CLIENT:     '/(modals)/add-client' as const,
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
