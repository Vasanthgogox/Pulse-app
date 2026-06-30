/**
 * Workspace route helpers — avoid treating /execution-plans as /execution.
 */

/** True only for Operations/Execution workspace routes (/execution, /execution/dispatch/…). */
export function isExecutionWorkspacePath(pathname: string): boolean {
  return pathname === '/execution' || pathname.startsWith('/execution/');
}

/** Commerce planning routes (Plan Builder, Published Plans). */
export function isCommercePlanningPath(pathname: string): boolean {
  return pathname === '/execution-plans' || pathname.startsWith('/execution-plans/');
}

/** Active nav link — sibling paths under /execution-plans must not both highlight. */
export function isNavPathActive(pathname: string, path: string): boolean {
  if (pathname === path) return true;
  if (path === '/execution-plans') return false;
  return pathname.startsWith(`${path}/`);
}
