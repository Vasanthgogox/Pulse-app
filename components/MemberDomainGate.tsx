/**
 * Client-side gate for the 3 primary tabs (Fiscal / Trips / Network) — blocks a
 * member whose functional role doesn't cover this domain (see useMemberCapabilities).
 * Same redirect-on-deny pattern as ModelAccessGate.
 */
import { CenteredLoadingView } from "@/components/CenteredLoadingView";
import { ROUTES } from "@/lib/routes";
import {
  useMemberCapabilities,
  type MemberDomainAccess,
} from "@/lib/useMemberCapabilities";
import { useRouter } from "expo-router";
import { useEffect, type ReactNode } from "react";

export type MemberDomainKind = keyof MemberDomainAccess;

type Props = {
  kind: MemberDomainKind;
  children: ReactNode;
};

export function MemberDomainGate({ kind, children }: Props) {
  const router = useRouter();
  const access = useMemberCapabilities();
  const allowed = access[kind];
  const isLoading = access.isLoading;

  useEffect(() => {
    // Hold while the workspace/role is still resolving — bouncing here would
    // eject a legitimately-allowed member before their functional role loads.
    if (isLoading || allowed) return;
    // Neutral fallback — never one of the 3 gated tabs, so it can't redirect to
    // itself. Always replace() (not back()): on a hard web load / deep-link the
    // navigator has no history and back() dispatches an unhandled GO_BACK.
    router.replace(ROUTES.TABS.PROFILE as "/");
  }, [isLoading, allowed, router]);

  if (isLoading || !allowed) {
    return <CenteredLoadingView />;
  }

  return <>{children}</>;
}
