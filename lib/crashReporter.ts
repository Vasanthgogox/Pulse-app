/**
 * Thin wrapper around the crash reporter (Sentry). Centralizes init + capture so
 * the rest of the app never imports Sentry directly — call these from the logger
 * façade (lib/logger.ts) and the app-wide error boundary.
 *
 * Safe no-op until `initCrashReporter()` runs and a DSN is present, so the app
 * works identically with or without Sentry configured.
 */
import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';

let initialized = false;

const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;

/** App version + build channel become the Sentry release/environment tags. */
const RELEASE =
  Constants.expoConfig?.version != null
    ? `pulse@${Constants.expoConfig.version}`
    : undefined;
const ENVIRONMENT =
  process.env.EXPO_PUBLIC_ENV ??
  (process.env.NODE_ENV === 'production' ? 'production' : 'development');

/**
 * Initialize crash reporting. Call once at app startup (app/_layout.tsx).
 * Disabled in dev and when no DSN is configured.
 */
export function initCrashReporter(): void {
  if (initialized || __DEV__ || !DSN) return;
  Sentry.init({
    dsn: DSN,
    // Keep tracing off by default; enable later once volume/cost is understood.
    tracesSampleRate: 0,
    enableNative: true,
    release: RELEASE,
    environment: ENVIRONMENT,
  });
  initialized = true;
}

/** Attach the signed-in user to crash reports. Call after login/session restore. */
export function setCrashReporterUser(user: { id: string; email?: string | null }): void {
  if (__DEV__ || !initialized) return;
  Sentry.setUser({ id: user.id, email: user.email ?? undefined });
}

/** Clear user context on logout. */
export function clearCrashReporterUser(): void {
  if (__DEV__ || !initialized) return;
  Sentry.setUser(null);
}

export function captureException(
  error: Error,
  context?: Record<string, unknown>,
): void {
  if (__DEV__ || !initialized) return;
  Sentry.captureException(error, context ? { extra: context } : undefined);
}

export function captureMessage(
  message: string,
  level: 'warning' | 'error' = 'error',
  context?: Record<string, unknown>,
): void {
  if (__DEV__ || !initialized) return;
  Sentry.captureMessage(message, {
    level,
    ...(context ? { extra: context } : {}),
  });
}

/** Expose the wrap helper so app/_layout can wrap the root component. */
export const wrapWithCrashReporter = Sentry.wrap;
