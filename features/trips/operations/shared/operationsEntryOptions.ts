import type {
  FuelType,
  OperationalPaymentMode,
  OperationalPaymentOwner,
} from "../types";

export type ChipOption<T extends string> = { value: T; label: string };

export const FUEL_TYPE_OPTIONS: ChipOption<FuelType>[] = [
  { value: "diesel", label: "Diesel" },
  { value: "petrol", label: "Petrol" },
  { value: "cng", label: "CNG" },
  { value: "other", label: "Other" },
];

export const PAYMENT_OWNER_OPTIONS: ChipOption<OperationalPaymentOwner>[] = [
  { value: "organization", label: "Company" },
  { value: "driver", label: "Driver" },
  { value: "supplier", label: "Supplier" },
  { value: "fleet_card", label: "Fleet card" },
  { value: "unknown", label: "Unknown" },
];

export const TOLL_PAYMENT_OWNER_OPTIONS: ChipOption<OperationalPaymentOwner>[] = [
  { value: "organization", label: "Company" },
  { value: "driver", label: "Driver" },
  { value: "supplier", label: "Supplier" },
  { value: "unknown", label: "Unknown" },
];

export const PAYMENT_MODE_OPTIONS: ChipOption<OperationalPaymentMode>[] = [
  { value: "cash", label: "Cash" },
  { value: "fastag", label: "FASTag" },
  { value: "card", label: "Card" },
  { value: "credit", label: "Credit" },
  { value: "pending", label: "Pending" },
  { value: "unknown", label: "Unknown" },
];

export const DRIVER_PAYMENT_OWNER_LABEL = "Paid by you (driver)";

export const DRIVER_PAYMENT_OWNER_OPTION: ChipOption<OperationalPaymentOwner> = {
  value: "driver",
  label: DRIVER_PAYMENT_OWNER_LABEL,
};

export function defaultPaymentOwnerForActor(
  actorRole?: string | null,
): OperationalPaymentOwner {
  return actorRole === "driver" ? "driver" : "organization";
}

/** Driver-submitted costs are always reimbursable requests to the fleet owner. */
export function resolvePaymentOwnerForSave(input: {
  actorRole?: string | null;
  paymentOwner?: OperationalPaymentOwner | null;
}): OperationalPaymentOwner {
  if (input.actorRole === "driver") return "driver";
  return input.paymentOwner ?? "unknown";
}

/** Drivers only reimburse themselves; dispatchers keep the full owner list. */
export function paymentOwnerOptionsForActor(
  options: ChipOption<OperationalPaymentOwner>[],
  actorRole?: string | null,
): ChipOption<OperationalPaymentOwner>[] {
  if (actorRole !== "driver") return options;
  return [DRIVER_PAYMENT_OWNER_OPTION];
}
