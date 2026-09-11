import { LogIncomingPodsScreen } from "@/features/log-pods/LogIncomingPodsScreen";
import { usePulseProductShell } from "@/features/product-shell/PulseProductShell";

export default function LogIncomingPodsRoute() {
  const inProductShell = usePulseProductShell() != null;
  return <LogIncomingPodsScreen embedded={inProductShell} />;
}
