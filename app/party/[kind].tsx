import { PartyDirectoryScreen } from "@/features/party/components/PartyDirectoryScreen";
import { parsePartyKind } from "@/features/party/types/partyDirectory.types";
import { useSafeBack } from "@/lib/useSafeBack";
import { useLocalSearchParams } from "expo-router";
import { Text, View } from "react-native";
import Theme from "@/constants/Theme";

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

  return <PartyDirectoryScreen kind={parsed} onBack={safeBack} />;
}
