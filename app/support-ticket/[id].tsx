import { SupportTicketDetailScreen } from "@/features/support/components/SupportTicketDetailScreen";
import { StatusBar } from "expo-status-bar";
import { View } from "react-native";

export default function SupportTicketDetailPage() {
  return (
    <View style={{ flex: 1 }}>
      <StatusBar style="dark" />
      <SupportTicketDetailScreen />
    </View>
  );
}
