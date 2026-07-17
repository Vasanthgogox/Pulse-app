/**
 * Stale bundle recovery (web deploy + native Metro module-ID drift in dev).
 * Do not import `react-native` at module scope — loading RN before
 * `renderRootComponent` breaks StyleSheet and other exports (see index.js).
 */

const RELOAD_GUARD_KEY = 'pulse_deploy_reload_v1';

declare global {
   
  var __qNativeBundleReloadGuard: boolean | undefined;
}

function platformOS(): string | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('react-native').Platform.OS as string;
  } catch {
    return null;
  }
}

/** Lazy route chunks / stale Metro output on native dev (Hermes eval / module ID drift). */
export function isStaleNativeBundleError(error: Error): boolean {
  const os = platformOS();
  if (os === 'web') return false;
  const msg = error.message ?? '';
  return (
    /expected at end of 'if' condition/i.test(msg) ||
    /SyntaxError:\s*\d+:\d+/i.test(msg) ||
    /Unable to resolve module/i.test(msg) ||
    /Requiring unknown module/i.test(msg) ||
    /Cannot read property 'create' of undefined/i.test(msg) ||
    /is not a function \(it is undefined\)/i.test(msg) ||
    /Could not load bundle/i.test(msg) ||
    /LoadBundleFromServerError/i.test(msg) ||
    /Unable to download JS bundle/i.test(msg) ||
    /Metro.*connect/i.test(msg)
  );
}

/** Lazy route chunks missing after a new Netlify deploy (hashed filenames no longer exist). */
export function isStaleWebChunkError(error: Error): boolean {
  if (platformOS() !== 'web') return false;
  const msg = error.message ?? '';
  return (
    /Requiring unknown module/i.test(msg) ||
    /Unexpected token '<'/i.test(msg) ||
    /Loading chunk [\w-]+ failed/i.test(msg) ||
    /Failed to fetch dynamically imported module/i.test(msg) ||
    /error loading dynamically imported module/i.test(msg) ||
    /Importing a module script failed/i.test(msg)
  );
}

/** One hard reload with cache-bust query so users pick up the current entry + chunks. */
export function recoverStaleWebDeploy(): boolean {
  if (platformOS() !== 'web' || typeof window === 'undefined') return false;
  try {
    if (sessionStorage.getItem(RELOAD_GUARD_KEY)) return false;
    sessionStorage.setItem(RELOAD_GUARD_KEY, '1');
  } catch {
    return false;
  }
  const url = new URL(window.location.href);
  url.searchParams.set('_cb', String(Date.now()));
  window.location.replace(url.toString());
  return true;
}

/** One dev reload when Metro module IDs drift (unknown module / importedAll). */
export function recoverStaleNativeBundle(): boolean {
  if (platformOS() === 'web' || !__DEV__) return false;
  if (global.__qNativeBundleReloadGuard) return false;
  global.__qNativeBundleReloadGuard = true;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('react-native').DevSettings.reload();
    return true;
  } catch {
    global.__qNativeBundleReloadGuard = false;
    return false;
  }
}

export function clearNativeBundleReloadGuard(): void {
  global.__qNativeBundleReloadGuard = false;
}

function messageFromUnknownError(error: unknown): string {
  if (error instanceof Error) return error.message ?? '';
  return String(error ?? '');
}

/** Swallow benign Supabase auth lock races before LogBox / redbox. */
function installSupabaseAuthLockErrorHandler(): void {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { isIgnorableSupabaseAuthLockError } = require('@/lib/supabaseAuthLock.util') as typeof import('@/lib/supabaseAuthLock.util');

  if (typeof window !== 'undefined') {
    window.addEventListener('unhandledrejection', (event) => {
      if (isIgnorableSupabaseAuthLockError(event.reason)) {
        event.preventDefault();
      }
    });
  }

  const ErrorUtils = (
    global as typeof global & {
      ErrorUtils?: {
        getGlobalHandler?: () => (error: unknown, isFatal?: boolean) => void;
        setGlobalHandler?: (handler: (error: unknown, isFatal?: boolean) => void) => void;
      };
    }
  ).ErrorUtils;
  if (!ErrorUtils?.getGlobalHandler || !ErrorUtils.setGlobalHandler) return;

  const previous = ErrorUtils.getGlobalHandler();
  ErrorUtils.setGlobalHandler((error, isFatal) => {
    if (isIgnorableSupabaseAuthLockError(error)) {
      return;
    }
    if (__DEV__ && platformOS() !== 'web') {
      const err =
        error instanceof Error
          ? error
          : new Error(messageFromUnknownError(error));
      if (isStaleNativeBundleError(err)) {
        recoverStaleNativeBundle();
        return;
      }
    }
    previous(error, isFatal);
  });
}

/** Install after root layout mounts (not from index.js — RN must init first). */
export function installNativeBundleRecoveryHandler(): void {
  installSupabaseAuthLockErrorHandler();
}

/** Listen for script load / parse failures before React error boundaries run. */
export function installWebDeployRecoveryListener(): void {
  if (platformOS() !== 'web' || typeof window === 'undefined') return;
  window.addEventListener(
    'error',
    (event) => {
      const target = event.target;
      if (target instanceof HTMLScriptElement) {
        const src = target.src ?? '';
        if (src.includes('.js')) {
          recoverStaleWebDeploy();
          return;
        }
      }
      // HTML served as JS (SPA fallback) throws SyntaxError before React.lazy rejects.
      const err =
        event.error instanceof Error
          ? event.error
          : new Error(event.message ?? '');
      if (isStaleWebChunkError(err)) {
        recoverStaleWebDeploy();
      }
    },
    true,
  );
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const err =
      reason instanceof Error ? reason : new Error(String(reason ?? ''));
    if (isStaleWebChunkError(err) && recoverStaleWebDeploy()) {
      event.preventDefault();
    }
  });
}
