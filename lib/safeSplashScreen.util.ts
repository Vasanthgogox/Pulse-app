import { isExpoGo } from '@/lib/expoGoMaps';
import { Platform } from 'react-native';

type SplashScreenModule = typeof import('expo-splash-screen');

/** null = not yet checked; false = skip native splash for this session. */
let nativeSplashEnabled: boolean | null = null;

/** Resolves true only when preventAutoHideAsync succeeded for this session. */
let preventAutoHidePromise: Promise<boolean> | null = null;

const SPLASH_UNAVAILABLE_RE = /No native splash screen registered/i;

function shouldUseNativeSplash(): boolean {
  if (nativeSplashEnabled === false) return false;
  if (Platform.OS === 'web' || isExpoGo()) {
    nativeSplashEnabled = false;
    return false;
  }
  return true;
}

function markNativeSplashUnavailable(): void {
  nativeSplashEnabled = false;
}

function isSplashUnavailableError(error: unknown): boolean {
  if (error instanceof ReferenceError) return true;
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : '';
  return SPLASH_UNAVAILABLE_RE.test(message);
}

function loadSplashScreenModule(): SplashScreenModule | null {
  try {
    // Lazy load so Expo Go never touches the native splash module at import time.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-splash-screen') as SplashScreenModule;
  } catch {
    markNativeSplashUnavailable();
    return null;
  }
}

/**
 * Keeps the native splash visible until hide succeeds.
 * Must complete before hideAsync — iOS rejects hide when no splash is registered.
 */
async function ensurePreventAutoHideAsync(): Promise<boolean> {
  if (!shouldUseNativeSplash()) return false;
  if (preventAutoHidePromise) return preventAutoHidePromise;

  preventAutoHidePromise = (async () => {
    const SplashScreen = loadSplashScreenModule();
    if (!SplashScreen) return false;

    try {
      await SplashScreen.preventAutoHideAsync();
      return true;
    } catch (error) {
      if (isSplashUnavailableError(error)) {
        markNativeSplashUnavailable();
      }
      return false;
    }
  })();

  return preventAutoHidePromise;
}

/** Keeps the native splash visible until {@link safeHideSplashAsync}. No-op in Expo Go / web. */
export function safePreventAutoHideAsync(): Promise<void> {
  return ensurePreventAutoHideAsync()
    .then(() => undefined)
    .catch(() => undefined);
}

/** Hides the native splash once boot UI is ready. No-op when prevent failed or in Expo Go / web. */
export function safeHideSplashAsync(): Promise<void> {
  return (async () => {
    if (!shouldUseNativeSplash()) return;

    const SplashScreen = loadSplashScreenModule();
    if (!SplashScreen) return;

    try {
      // Re-run prevent before hide — HMR / new view controllers can invalidate an earlier prevent.
      await SplashScreen.preventAutoHideAsync();
      await SplashScreen.hideAsync();
    } catch (error) {
      if (isSplashUnavailableError(error)) {
        markNativeSplashUnavailable();
        preventAutoHidePromise = Promise.resolve(false);
      }
    }
  })().catch(() => undefined);
}
