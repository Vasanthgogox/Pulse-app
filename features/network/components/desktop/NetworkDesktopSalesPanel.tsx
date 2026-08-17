/**
 * Hub Sales tab — Aggregate (connection / partner) and Asset (own fleet)
 * share one tab. Hybrid orgs toggle; Asset-only / Aggregate-only see one view.
 */
import { NetworkDesktopAssetSalesPanel } from "@/features/network/components/desktop/NetworkDesktopAssetSalesPanel";
import { NetworkDesktopConnectionSalesPanel } from "@/features/network/components/desktop/NetworkDesktopConnectionSalesPanel";
import {
  METRONIC,
  networkDesktopHubStyles as styles,
} from "@/features/network/components/desktop/networkDesktopHub.styles";
import type { ConnectedOrg } from "@/features/network/components/ConnectionsView";
import type { DiscoverOrg } from "@/features/network/services/discover.service";
import { useProfileHubCompactLayout } from "@/features/party/hooks/useProfileHubCompactLayout";
import { canAccessClients, canAccessDrivers } from "@/lib/capabilities";
import { useCapabilities } from "@/lib/useCapabilities";
import { Building2, Truck } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";

export type SalesScope = "aggregate" | "asset";

type Props = {
  orgId: string;
  initialScope?: SalesScope;
  onOpenProfile: (item: ConnectedOrg) => void;
  onOpenDiscoverProfile?: (org: DiscoverOrg) => void;
  onGoToGrowTab?: () => void;
  inviteDailyCapReached?: boolean;
};

function resolveSalesScope({
  canAggregate,
  canAsset,
  preferred,
}: {
  canAggregate: boolean;
  canAsset: boolean;
  preferred: SalesScope;
}): SalesScope {
  if (canAggregate && !canAsset) return "aggregate";
  if (canAsset && !canAggregate) return "asset";
  if (preferred === "asset" && canAsset) return "asset";
  if (preferred === "aggregate" && canAggregate) return "aggregate";
  return canAggregate ? "aggregate" : "asset";
}

export function NetworkDesktopSalesPanel({
  orgId,
  initialScope = "aggregate",
  onOpenProfile,
  onOpenDiscoverProfile,
  onGoToGrowTab,
  inviteDailyCapReached = false,
}: Props) {
  const capabilities = useCapabilities();
  const layout = useProfileHubCompactLayout();
  const canAggregate = canAccessClients(capabilities);
  const canAsset = canAccessDrivers(capabilities);
  const showToggle = canAggregate && canAsset;

  const [scope, setScope] = useState<SalesScope>(() =>
    resolveSalesScope({
      canAggregate,
      canAsset,
      preferred: initialScope,
    }),
  );

  useEffect(() => {
    setScope((prev) =>
      resolveSalesScope({
        canAggregate,
        canAsset,
        preferred: prev,
      }),
    );
  }, [canAggregate, canAsset]);

  const copy = useMemo(
    () =>
      scope === "asset"
        ? {
            title: "Asset sales",
            sub: "Own-fleet trips, driver earnings, and margin",
          }
        : {
            title: "Connection sales",
            sub: "Partner trips, lanes, and margin",
          },
    [scope],
  );

  return (
    <View>
      {showToggle ? (
        <View style={[styles.salesScopeBar, layout.salesScopeBar]}>
          {layout.compact ? null : (
            <View style={styles.salesScopeBarCopy}>
              <Text style={styles.salesPerfViewTitle}>{copy.title}</Text>
              <Text style={styles.salesPerfViewSub}>{copy.sub}</Text>
            </View>
          )}
          <View
            style={[styles.salesPerfViewToggle, layout.salesPerfViewToggle]}
            accessibilityRole="tablist"
            accessibilityLabel="Sales view"
          >
            <Pressable
              onPress={() => setScope("aggregate")}
              style={[
                styles.salesPerfViewTab,
                layout.salesPerfViewTab,
                scope === "aggregate" && styles.salesPerfViewTabOn,
              ]}
              accessibilityRole="tab"
              accessibilityState={{ selected: scope === "aggregate" }}
              accessibilityLabel="Aggregate connection sales"
            >
              <Building2
                size={14}
                color={
                  scope === "aggregate" ? METRONIC.accent : METRONIC.muted
                }
              />
              <Text
                style={[
                  styles.salesPerfViewTabText,
                  scope === "aggregate" && styles.salesPerfViewTabTextOn,
                ]}
              >
                Aggregate
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setScope("asset")}
              style={[
                styles.salesPerfViewTab,
                layout.salesPerfViewTab,
                scope === "asset" && styles.salesPerfViewTabOn,
              ]}
              accessibilityRole="tab"
              accessibilityState={{ selected: scope === "asset" }}
              accessibilityLabel="Asset sales"
            >
              <Truck
                size={14}
                color={scope === "asset" ? METRONIC.accent : METRONIC.muted}
              />
              <Text
                style={[
                  styles.salesPerfViewTabText,
                  scope === "asset" && styles.salesPerfViewTabTextOn,
                ]}
              >
                Asset
              </Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {scope === "asset" ? (
        <NetworkDesktopAssetSalesPanel orgId={orgId} />
      ) : (
        <NetworkDesktopConnectionSalesPanel
          orgId={orgId}
          onOpenProfile={onOpenProfile}
          onOpenDiscoverProfile={onOpenDiscoverProfile}
          onGoToGrowTab={onGoToGrowTab}
          inviteDailyCapReached={inviteDailyCapReached}
        />
      )}
    </View>
  );
}
