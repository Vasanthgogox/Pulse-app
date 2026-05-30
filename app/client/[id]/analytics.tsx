import { useLocalSearchParams } from "expo-router";
import { ClientAnalyticsFullScreen } from "@/features/clients/components/ClientAnalyticsFullScreen";

export default function ClientAnalyticsRoute() {
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  const clientId =
    typeof id === "string" ? id : Array.isArray(id) ? id[0] ?? "" : "";

  return <ClientAnalyticsFullScreen clientId={clientId} />;
}
