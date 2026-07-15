/**
 * Navigation Policy — core types (RFC contract).
 * Navigation ≠ Authorization. RLS remains the data boundary.
 */

/** Auth restore / session knowledge on the client. */
export type SessionPosture =
  | 'restoring'
  | 'anonymous'
  | 'authenticated'
  | 'expired';

/** Product shell the route belongs to. */
export type Experience =
  | 'public_content'
  | 'public_process'
  | 'driver'
  | 'org';

/** Opaque grant strings (capability-compatible). */
export type Grant = string;

export type GrantSet = ReadonlySet<Grant>;

export type PlatformKind = 'ios' | 'android' | 'web';

/** Where to send the user on deny. */
export type OnDenyTarget =
  | { type: 'sign_in' }
  | { type: 'experience_home'; experience: 'driver' | 'org' }
  | { type: 'path'; path: string }
  | { type: 'fail_closed_home' };

export type GrantPredicate = {
  allOf?: readonly Grant[];
  anyOf?: readonly Grant[];
};

export type PredicateRequirement = {
  /** Predicate id must be true. */
  requireTrue?: readonly string[];
  /** Predicate id must be false or absent. */
  requireFalse?: readonly string[];
};

/**
 * Registry policy record. Match against canonical path keys.
 * Patterns: exact `/sign-in` or parameterized `/trip/:id`.
 */
export type PolicyRecord = {
  id: string;
  /** Canonical match pattern (group-stripped). */
  pattern: string;
  experience: Experience;
  grants?: GrantPredicate;
  predicates?: PredicateRequirement;
  onDeny?: OnDenyTarget;
  /** If grants fail, still allow mount (soft UI). Prefer false for new routes. */
  softDeny?: boolean;
  /**
   * Phase 4 parity: legacy Stack/Modal had no session gate.
   * `legacy_open` → anonymous may stay (matches today's ungated routes).
   * `require_auth` → anonymous redirects to sign-in (tabs, pulse-loads, driver).
   * Default: `require_auth`.
   */
  anonymousAccess?: 'require_auth' | 'legacy_open';
  /**
   * Phase 4 parity: legacy Stack had no driver bounce (only tabs layout does).
   * `legacy_open` → drivers may stay on org stack routes.
   * `deny` → redirect to driver home (tabs routes).
   * Default for org: `legacy_open`. Driver experience routes always deny non-drivers.
   */
  driverAccess?: 'deny' | 'legacy_open';
  /** Higher wins when multiple patterns match. Exact typically higher than param. */
  priority: number;
};

export type CanonicalPath = {
  /** Normalized path key used for matching (e.g. `/finance`, `/trip/:id` form for patterns). */
  path: string;
  /** Captured dynamic segment values. */
  params: Readonly<Record<string, string>>;
};

export type Principal = {
  role: 'user' | 'driver';
  grants: GrantSet;
};

export type PolicySnapshot = {
  sessionPosture: SessionPosture;
  principal: Principal | null;
  /** Context predicates from auth/org/feature SDKs. */
  predicates: Readonly<Record<string, boolean>>;
  platform: PlatformKind;
};

export type Decision =
  | { type: 'wait' }
  | { type: 'allow'; soft?: boolean; policyId: string; reason: string }
  | {
      type: 'redirect';
      to: string;
      reason: string;
      replace: true;
      policyId?: string;
    };

/** Well-known redirect destinations (canonical). */
export const SIGN_IN_PATH = '/sign-in' as const;
export const DRIVER_HOME_PATH = '/(driver)' as const;
export const ORG_HOME_PATH = '/trips' as const;
export const TERMINAL_WEBSITE_PATH = '/terminal-website' as const;
export const FAIL_CLOSED_HOME_PATH = ORG_HOME_PATH;
