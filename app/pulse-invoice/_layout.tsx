import { PulseProductShell } from "@/features/product-shell/PulseProductShell";
import { routeStackScreenOptions } from "@/lib/routeStackOptions";
import { Stack } from "expo-router";

export default function PulseInvoiceLayout() {
  return (
    <PulseProductShell productId="invoice">
      <Stack screenOptions={routeStackScreenOptions} />
    </PulseProductShell>
  );
}
