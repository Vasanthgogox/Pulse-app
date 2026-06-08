import { formatPartyContactPhone } from "@/features/network/utils/partyContactDisplay.util";

/** Wizard / picker subtitle — phone only; hide linked-org placeholders and UUIDs. */
export function resolveWizardContactPhone(
  phone: string | null | undefined,
): string | null {
  const display = formatPartyContactPhone(phone);
  return display === "NA" ? null : display;
}

/** @deprecated Use resolveWizardContactPhone */
export const resolveWizardClientPhone = resolveWizardContactPhone;
