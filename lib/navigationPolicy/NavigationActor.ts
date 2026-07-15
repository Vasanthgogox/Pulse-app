/**
 * Sole navigation authority for policy-driven redirects (RFC).
 * Inject navigate fn — no Expo imports required for unit tests.
 */

import type { Decision } from '@/lib/navigationPolicy/types';

export type NavigateFn = (opts: { href: string; replace: boolean }) => void;

export type ActorApplyResult =
  | { status: 'none' }
  | { status: 'wait' }
  | { status: 'navigated'; href: string }
  | { status: 'loop_prevented'; href: string };

/**
 * Applies a Decision. Auth redirects always use replace: true.
 * Loop cap: same redirect target twice in one auth epoch → stop.
 */
export class NavigationActor {
  private lastRedirectTarget: string | null = null;
  private redirectCountForTarget = 0;
  private epoch = 0;

  constructor(private readonly navigate: NavigateFn) {}

  /** Call when auth identity changes (login/logout) to reset loop detection. */
  bumpEpoch(): void {
    this.epoch += 1;
    this.lastRedirectTarget = null;
    this.redirectCountForTarget = 0;
  }

  apply(decision: Decision): ActorApplyResult {
    if (decision.type === 'wait') {
      return { status: 'wait' };
    }
    if (decision.type === 'allow') {
      this.lastRedirectTarget = null;
      this.redirectCountForTarget = 0;
      return { status: 'none' };
    }

    const href = decision.to;
    if (
      this.lastRedirectTarget === href &&
      this.redirectCountForTarget >= 1
    ) {
      return { status: 'loop_prevented', href };
    }

    if (this.lastRedirectTarget === href) {
      this.redirectCountForTarget += 1;
    } else {
      this.lastRedirectTarget = href;
      this.redirectCountForTarget = 1;
    }

    this.navigate({ href, replace: true });
    return { status: 'navigated', href };
  }
}
