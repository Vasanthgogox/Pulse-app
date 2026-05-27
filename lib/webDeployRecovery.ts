import { Platform } from 'react-native';

const RELOAD_GUARD_KEY = 'q_web_deploy_reload_v1';

/** Lazy route chunks / stale Metro output on native dev (Hermes eval / module ID drift). */
export function isStaleNativeBundleError(error: Error): boolean {
  if (Platform.OS === 'web') return false;
  const msg = error.message ?? '';
  return (
    /expected at end of 'if' condition/i.test(msg) ||
    /SyntaxError:\s*\d+:\d+/i.test(msg) ||
    /Unable to resolve module/i.test(msg) ||
    /Requiring unknown module/i.test(msg)
  );
}

/** Lazy route chunks missing after a new Netlify deploy (hashed filenames no longer exist). */
export function isStaleWebChunkError(error: Error): boolean {
  if (Platform.OS !== 'web') return false;
  const msg = error.message;
  return (
    /Requiring unknown module/i.test(msg) ||
    /Unexpected token '<'/i.test(msg) ||
    /Loading chunk [\w-]+ failed/i.test(msg)
  );
}

/** One hard reload with cache-bust query so users pick up the current entry + chunks. */
export function recoverStaleWebDeploy(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
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

/** Listen for script load failures before React error boundaries run. */
export function installWebDeployRecoveryListener(): void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  window.addEventListener(
    'error',
    (event) => {
      const target = event.target;
      if (!(target instanceof HTMLScriptElement)) return;
      const src = target.src ?? '';
      if (!src.includes('.js')) return;
      recoverStaleWebDeploy();
    },
    true
  );
}
