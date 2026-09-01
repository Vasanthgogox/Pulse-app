import { CreateSupportTicketScreen } from "@/features/support/components/CreateSupportTicketScreen";
import { StatusBar } from "expo-status-bar";
import { View } from "react-native";

export default function SupportPage() {
  return (
    <View style={{ flex: 1 }}>
      <StatusBar style="dark" />
      <CreateSupportTicketScreen />
    </View>
  );
}
