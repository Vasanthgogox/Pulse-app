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

  useEffect(() => {
    if (allowed) return;
    if (router.canGoBack()) {
      router.back();
      return;
    }
    // Neutral fallback — never one of the 3 gated tabs, so it can't redirect to itself.
    router.replace(ROUTES.TABS.PROFILE as "/");
  }, [allowed, router]);

  if (!allowed) {
    return <CenteredLoadingView />;
  }

  return <>{children}</>;
}
