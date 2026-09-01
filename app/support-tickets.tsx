import { MySupportTicketsScreen } from "@/features/support/components/MySupportTicketsScreen";
import { StatusBar } from "expo-status-bar";
import { View } from "react-native";

export default function SupportTicketsPage() {
  return (
    <View style={{ flex: 1 }}>
      <StatusBar style="dark" />
      <MySupportTicketsScreen />
    </View>
  );
}
