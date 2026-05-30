import { AddCommodityTypeScreen } from "@/features/trips/components/add-trip/AddCommodityTypeScreen";
import type { CommodityTypeKind } from "@/features/trips/services/userCommodityTypes.storage";
import { useLocalSearchParams, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { View } from "react-native";

function parseKind(raw: string | string[] | undefined): CommodityTypeKind {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return v === "product" || v === "load" ? "product" : "vehicle";
}

export default function AddCommodityTypePage() {
  const router = useRouter();
  const params = useLocalSearchParams<{ kind?: string | string[] }>();
  const kind = parseKind(params.kind);

  return (
    <View style={{ flex: 1 }}>
      <StatusBar style="dark" />
      <AddCommodityTypeScreen kind={kind} onClose={() => router.back()} />
    </View>
  );
}
