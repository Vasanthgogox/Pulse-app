/**
 * Legacy navigation predictor — mirrors current app gate behavior (Phase 4 parity).
 * Sources: app/index.tsx boot, (tabs)/_layout, (driver)/_layout, pulse-loads/_layout,
 * trip/[id]/index.web.tsx session gate. Unguarded Stack/Modal = stay.
 */

import { canonicalizePath } from '@/lib/navigationPolicy/pathCanonicalize';
import type { PlatformKind, PolicySnapshot } from '@/lib/navigationPolicy/types';
import {
  DRIVER_HOME_PATH,
  ORG_HOME_PATH,
  SIGN_IN_PATH,
  TERMINAL_WEBSITE_PATH,
} from '@/lib/navigationPolicy/types';

export type LegacyPrediction =
  | { type: 'wait' }
  | { type: 'stay' }
  | { type: 'redirect'; to: string; reason: string };

const TAB_PATHS = new Set([
  '/trips',
  '/finance',
  '/resources',
  '/clients',
  '/network',
  '/network/hub',
  '/profile',
  '/payment-detail',
  '/report',
  '/indents',
]);

function isDriverPath(canonical: string): boolean {
  return canonical === '/(driver)' || canonical.startsWith('/(driver)/');
}

function isPulseLoads(canonical: string): boolean {
  return canonical === '/pulse-loads' || canonical.startsWith('/pulse-loads/');
}

function isTripDetailRoot(canonical: string): boolean {
  // /trip/:id exactly (one segment after trip)
  const parts = canonical.split('/').filter(Boolean);
  return parts.length === 2 && parts[0] === 'trip';
}

function isPublicPath(canonical: string): boolean {
  if (canonical === '/terminal-website') return true;
  if (canonical === '/sign-in' || canonical === '/sign-up') return true;
  if (canonical === '/forgot-password' || canonical === '/driver-sign-in') return true;
  if (canonical === '/welcome' || canonical === '/driver-signup') return true;
  if (canonical.startsWith('/auth/')) return true;
  if (canonical.startsWith('/onboarding')) return true;
  if (canonical.startsWith('/public-profile/')) return true;
  if (canonical === '/+not-found') return true;
  return false;
}

/**
 * Predict what today's legacy routers would do (no React).
 */
export function predictLegacyNavigation(
  rawPathname: string,
  snapshot: PolicySnapshot,
): LegacyPrediction {
  const canonical = canonicalizePath(rawPathname).path;
  const { sessionPosture, principal, platform } = snapshot;

  if (sessionPosture === 'restoring') {
    return { type: 'wait' };
  }

  if (sessionPosture === 'expired') {
    return { type: 'redirect', to: SIGN_IN_PATH, reason: 'legacy_session_expired' };
  }

  if (sessionPosture === 'anonymous') {
    // Boot `/` — app/index replaces to marketing (web) or sign-in (native)
    if (canonical === '/') {
      return {
        type: 'redirect',
        to: platform === 'web' ? TERMINAL_WEBSITE_PATH : SIGN_IN_PATH,
        reason: 'legacy_boot_anonymous',
      };
    }
    if (isPublicPath(canonical)) {
      return { type: 'stay' };
    }
    // Layout gates
    if (TAB_PATHS.has(canonical) || isDriverPath(canonical) || isPulseLoads(canonical)) {
      return { type: 'redirect', to: SIGN_IN_PATH, reason: 'legacy_layout_session' };
    }
    // Web-only trip detail session gate
    if (isTripDetailRoot(canonical) && platform === 'web') {
      return { type: 'redirect', to: SIGN_IN_PATH, reason: 'legacy_trip_web_session' };
    }
    // Unguarded org stack / modals — stay (known security gap until Phase 5)
    return { type: 'stay' };
  }

  // authenticated
  const role = principal?.role;
  if (role === 'driver') {
    if (TAB_PATHS.has(canonical)) {
      return {
        type: 'redirect',
        to: DRIVER_HOME_PATH,
        reason: 'legacy_tabs_driver_bounce',
      };
    }
    // Driver shell OK; org stack largely unguarded for drivers historically
    if (isDriverPath(canonical) || isPublicPath(canonical) || canonical === '/') {
      return { type: 'stay' };
    }
    return { type: 'stay' };
  }

  if (role === 'user') {
    if (isDriverPath(canonical)) {
      return {
        type: 'redirect',
        to: ORG_HOME_PATH,
        reason: 'legacy_driver_shell_org_bounce',
      };
    }
    return { type: 'stay' };
  }

  // authenticated but no principal yet — rare
  return { type: 'stay' };
}

export function legacyPredictionToComparable(
  pred: LegacyPrediction,
): { kind: 'wait' | 'stay' | 'redirect'; to: string | null } {
  if (pred.type === 'wait') return { kind: 'wait', to: null };
  if (pred.type === 'stay') return { kind: 'stay', to: null };
  return { kind: 'redirect', to: canonicalizePath(pred.to).path };
}
