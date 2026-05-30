import { IndentAllocationFlowScreen } from "@/features/indents/components/IndentAllocationFlowScreen";
import { useSafeBack } from "@/lib/useSafeBack";
import { useLocalSearchParams } from "expo-router";
import { CenteredLoadingView } from "@/components/CenteredLoadingView";

export default function IndentAllocationRoute() {
  const params = useLocalSearchParams<{ id: string }>();
  const safeBack = useSafeBack();
  const indentId =
    typeof params.id === "string" ? params.id : (params.id?.[0] ?? "");

  if (!indentId) {
    return <CenteredLoadingView message="Missing indent" />;
  }

  return (
    <IndentAllocationFlowScreen indentId={indentId} onBack={safeBack} />
  );
}
