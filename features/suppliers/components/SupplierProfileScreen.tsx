import { CenteredLoadingView } from "@/components/CenteredLoadingView";
import { ContentErrorState } from "@/components/ContentErrorState";
import Theme from "@/constants/Theme";
import { useOrganization } from "@/contexts/OrganizationContext";
import { SupplierProfileHub } from "@/features/suppliers/components/desktop/SupplierProfileHub";
import { useSupplierManagementBundleQuery } from "@/features/suppliers/hooks/useSupplierManagementBundleQuery";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Props = {
  supplierId: string;
  onBack: () => void;
};

export function SupplierProfileScreen({ supplierId, onBack }: Props) {
  const insets = useSafeAreaInsets();
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id ?? null;
  const bundleQ = useSupplierManagementBundleQuery(orgId, supplierId);

  if (!orgId || bundleQ.isLoading) return <CenteredLoadingView />;
  if (bundleQ.isError || !bundleQ.data) {
    return (
      <ContentErrorState
        variant="generic"
        message={bundleQ.error instanceof Error ? bundleQ.error.message : "Supplier not found"}
        onRetry={() => void bundleQ.refetch()}
      />
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: Theme.screenBackground, paddingTop: insets.top }}>
      <SupplierProfileHub
        bundle={bundleQ.data}
        onBack={onBack}
        onRefresh={() => void bundleQ.refetch()}
      />
    </View>
  );
}
