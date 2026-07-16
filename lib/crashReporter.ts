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

/**
 * TEMPORARY pilot probe — remove after Sentry ingest is confirmed.
 * Open: https://gx-pulse.netlify.app/?sentry_probe=1
 * Fires once per browser session; no-op without DSN / in __DEV__.
 */
export function maybeRunSentryPilotProbe(): void {
  if (__DEV__ || !initialized || typeof window === 'undefined') return;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('sentry_probe') !== '1') return;
    const key = 'pulse_sentry_probe_v1';
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, '1');
    Sentry.captureException(new Error('sentry-pilot-probe'), {
      tags: { probe: 'pilot' },
      extra: { href: window.location.href },
    });
  } catch {
    // ignore — probe must never break boot
  }
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
