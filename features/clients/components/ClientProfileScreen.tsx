/**
 * Full-screen client profile page — Metronic hub layout.
 */
import { CenteredLoadingView } from "@/components/CenteredLoadingView";
import { ContentErrorState } from "@/components/ContentErrorState";
import Theme from "@/constants/Theme";
import { ClientProfileHub } from "@/features/clients/components/desktop/ClientProfileHub";
import { useClientManagementBundleQuery } from "@/features/clients/hooks/useClientManagementBundle";
import { parseClientProfileTab } from "@/features/clients/utils/clientManagement.util";
import type { ClientRow } from "@/features/clients/services/clients.service";
import { getClientDetailBundle } from "@/features/clients/services/clients.service";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Props = {
  clientId: string;
  initialTab?: string;
  onBack: () => void;
};

export function ClientProfileScreen({ clientId, initialTab, onBack }: Props) {
  const insets = useSafeAreaInsets();
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id ?? null;
  const tab = parseClientProfileTab(initialTab);

  const bundleQ = useClientManagementBundleQuery(orgId, clientId);
  const [legacyClient, setLegacyClient] = useState<ClientRow | null>(null);
  const [legacyLoading, setLegacyLoading] = useState(true);

  const loadLegacy = useCallback(async () => {
    if (!orgId || !clientId) return;
    setLegacyLoading(true);
    const { client } = await getClientDetailBundle(orgId, clientId);
    setLegacyClient(client);
    setLegacyLoading(false);
  }, [orgId, clientId]);

  useEffect(() => {
    void loadLegacy();
  }, [loadLegacy]);

  if (!orgId || legacyLoading || bundleQ.isLoading) {
    return <CenteredLoadingView />;
  }

  if (bundleQ.error || !bundleQ.data || !legacyClient) {
    return (
      <ContentErrorState
        variant="generic"
        message={bundleQ.error?.message ?? "Client not found"}
        onRetry={() => {
          void bundleQ.refetch();
          void loadLegacy();
        }}
      />
    );
  }

  const clientFromBundle = bundleQ.data.client as ClientRow | null;
  const client = clientFromBundle ?? legacyClient;

  return (
    <View style={{ flex: 1, backgroundColor: Theme.screenBackground, paddingTop: insets.top }}>
      <ClientProfileHub
        client={client}
        bundle={bundleQ.data}
        initialTab={tab}
        onBack={onBack}
        onRefresh={() => void bundleQ.refetch()}
      />
    </View>
  );
}
