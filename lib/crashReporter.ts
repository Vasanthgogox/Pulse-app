/**
 * Thin wrapper around the crash reporter (Sentry). Centralizes init + capture so
 * the rest of the app never imports Sentry directly — call these from the logger
 * façade (lib/logger.ts) and the app-wide error boundary.
 *
 * Safe no-op until `initCrashReporter()` runs and a DSN is present, so the app
 * works identically with or without Sentry configured.
 */
import * as Sentry from '@sentry/react-native';

let initialized = false;

const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;

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
  });
  initialized = true;
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
