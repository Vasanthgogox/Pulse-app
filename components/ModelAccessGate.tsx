/**
 * Soft RBAC gate for party detail / modal routes.
 * Asset-only: block supplier routes. Aggregate-only: block vehicle/garage routes.
 */
import { CenteredLoadingView } from "@/components/CenteredLoadingView";
import {
  canAccessClients,
  canAccessDrivers,
  canAccessSuppliers,
  canAccessVehicles,
} from "@/lib/capabilities";
import { ROUTES } from "@/lib/routes";
import { useMemberAccess } from "@/lib/useMemberAccess";
import type { useCapabilities } from "@/lib/useCapabilities";
import { useRouter } from "expo-router";
import { useEffect, type ReactNode } from "react";

export type ModelAccessKind =
  | "suppliers"
  | "vehicles"
  | "drivers"
  | "clients";

type Props = {
  kind: ModelAccessKind;
  children: ReactNode;
};

function canAccessKind(
  kind: ModelAccessKind,
  capabilities: ReturnType<typeof useCapabilities>,
): boolean {
  switch (kind) {
    case "suppliers":
      return canAccessSuppliers(capabilities);
    case "vehicles":
      return canAccessVehicles(capabilities);
    case "drivers":
      return canAccessDrivers(capabilities);
    case "clients":
      return canAccessClients(capabilities);
  }
}

export function ModelAccessGate({ kind, children }: Props) {
  const router = useRouter();
  const { capabilities, isLoading } = useMemberAccess();
  const allowed = canAccessKind(kind, capabilities);

  useEffect(() => {
    // Member surfaces hydrate async — redirecting before they land bounces
    // legitimately-permitted members off the route.
    if (isLoading || allowed) return;
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace(ROUTES.TABS.FINANCE as "/");
  }, [allowed, isLoading, router]);

  if (isLoading || !allowed) {
    return <CenteredLoadingView />;
  }

  return <>{children}</>;
}
