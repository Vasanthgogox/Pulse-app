import { ModelAccessGate, type ModelAccessKind } from "@/components/ModelAccessGate";
import { PartyDirectoryScreen } from "@/features/party/components/PartyDirectoryScreen";
import {
  parsePartyKind,
  type PartyKind,
} from "@/features/party/types/partyDirectory.types";
import { useSafeBack } from "@/lib/useSafeBack";
import { useLocalSearchParams } from "expo-router";
import { Text, View } from "react-native";
import Theme from "@/constants/Theme";

function partyKindToAccess(kind: PartyKind): ModelAccessKind {
  switch (kind) {
    case "customers":
      return "clients";
    case "suppliers":
      return "suppliers";
    case "drivers":
      return "drivers";
    case "vehicles":
      return "vehicles";
  }
}

export default function PartyDirectoryRoute() {
  const { kind } = useLocalSearchParams<{ kind: string }>();
  const safeBack = useSafeBack();
  const parsed = parsePartyKind(typeof kind === "string" ? kind : kind?.[0]);

  if (!parsed) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ color: Theme.textMuted }}>Unknown party type</Text>
      </View>
    );
  }

  return (
    <ModelAccessGate kind={partyKindToAccess(parsed)}>
      <PartyDirectoryScreen kind={parsed} onBack={safeBack} />
    </ModelAccessGate>
  );
}
