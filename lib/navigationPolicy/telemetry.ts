/**
 * Navigation decision telemetry (RFC).
 * Phase 1: DEV log only; Phase 3 wires mismatch collectors.
 */

import type { Decision } from '@/lib/navigationPolicy/types';

export type NavigationDecisionEvent = {
  pathname: string;
  canonicalPath: string;
  decision: Decision;
  reason: string;
  at: number;
};

type Listener = (event: NavigationDecisionEvent) => void;

const listeners = new Set<Listener>();

export function subscribeNavigationDecisions(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function emitNavigationDecision(event: NavigationDecisionEvent): void {
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    // eslint-disable-next-line no-console
    console.debug('[NavigationPolicy]', event.decision.type, event.reason, {
      path: event.canonicalPath,
    });
  }
  for (const listener of listeners) {
    try {
      listener(event);
    } catch {
      // never throw from telemetry
    }
  }
}
