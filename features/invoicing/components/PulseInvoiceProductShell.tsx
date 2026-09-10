import { PulseProductShell } from "@/features/product-shell/PulseProductShell";
import { type ReactNode } from "react";

/** Invoice-specific wrapper around the standard Pulse product shell. */
export function PulseInvoiceProductShell({ children }: { children: ReactNode }) {
  return (
    <PulseProductShell productId="invoice">{children}</PulseProductShell>
  );
}
