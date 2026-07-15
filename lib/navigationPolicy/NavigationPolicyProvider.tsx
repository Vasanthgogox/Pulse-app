/**
 * NavigationPolicyProvider — Snapshot → evaluate → telemetry → Actor.
 *
 * Phase 5: enforce=true + navigate → Actor is navigation authority for session/role.
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';

import { evaluateNavigationPolicy } from '@/lib/navigationPolicy/evaluate';
import { buildPrincipal } from '@/lib/navigationPolicy/grants';
import {
  NavigationActor,
  type NavigateFn,
} from '@/lib/navigationPolicy/NavigationActor';
import { canonicalizePath } from '@/lib/navigationPolicy/pathCanonicalize';
import { emitNavigationDecision } from '@/lib/navigationPolicy/telemetry';
import type {
  Decision,
  PlatformKind,
  PolicySnapshot,
  SessionPosture,
} from '@/lib/navigationPolicy/types';

export type { NavigateFn };

export type NavigationPolicyProviderProps = {
  children: ReactNode;
  pathname: string;
  sessionPosture: SessionPosture;
  profile: {
    role: string;
    aggregated?: boolean;
    asset?: boolean;
  } | null;
  predicates?: Readonly<Record<string, boolean>>;
  platform?: PlatformKind;
  /** When true, Actor applies redirect decisions. */
  enforce?: boolean;
  navigate?: NavigateFn;
};

type NavigationPolicyContextValue = {
  decision: Decision;
  canonicalPath: string;
};

const NavigationPolicyContext =
  createContext<NavigationPolicyContextValue | null>(null);

export function NavigationPolicyProvider({
  children,
  pathname,
  sessionPosture,
  profile,
  predicates = {},
  platform = 'web',
  enforce = false,
  navigate,
}: NavigationPolicyProviderProps) {
  const actorRef = useRef<NavigationActor | null>(null);
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  const epochKey = `${sessionPosture}:${profile?.role ?? ''}`;
  const epochKeyRef = useRef(epochKey);

  if (enforce && navigate && !actorRef.current) {
    actorRef.current = new NavigationActor((opts) => {
      navigateRef.current?.(opts);
    });
  }

  useEffect(() => {
    if (!actorRef.current) return;
    if (epochKeyRef.current === epochKey) return;
    epochKeyRef.current = epochKey;
    actorRef.current.bumpEpoch();
  }, [epochKey]);

  const snapshot: PolicySnapshot = useMemo(
    () => ({
      sessionPosture,
      principal: buildPrincipal(profile),
      predicates,
      platform,
    }),
    [sessionPosture, profile, predicates, platform],
  );

  const canonicalPath = canonicalizePath(pathname).path;
  const decision = useMemo(
    () =>
      evaluateNavigationPolicy({
        rawPathname: pathname,
        snapshot,
      }),
    [pathname, snapshot],
  );

  useEffect(() => {
    emitNavigationDecision({
      pathname,
      canonicalPath,
      decision,
      reason:
        decision.type === 'allow' || decision.type === 'redirect'
          ? decision.reason
          : 'wait',
      at: Date.now(),
    });
  }, [pathname, canonicalPath, decision]);

  useEffect(() => {
    if (!enforce || !actorRef.current) return;
    actorRef.current.apply(decision);
  }, [decision, enforce]);

  const value = useMemo(
    () => ({ decision, canonicalPath }),
    [decision, canonicalPath],
  );

  return (
    <NavigationPolicyContext.Provider value={value}>
      {children}
    </NavigationPolicyContext.Provider>
  );
}

export function useNavigationPolicyDecision(): NavigationPolicyContextValue | null {
  return useContext(NavigationPolicyContext);
}
