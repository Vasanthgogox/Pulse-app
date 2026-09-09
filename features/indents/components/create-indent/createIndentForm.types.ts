/** Who should receive this load. Mirrors indents.service's CirculationTarget,
 * minus 'offline' -- not offered as a Create Indent choice. */
export type IndentDistributionChoice = "integrated_supplier" | "marketplace" | "both";

/** Shared Create Indent form shape (used by wizard helpers). */
export interface FormState {
  client_name: string;
  client_id: string | null;
  pickup_area: string;
  drop_location: string;
  vehicle_type: string;
  load_type: string;
  weight: string;
  /** How many matching indent rows to create on share. Default `"1"`. */
  vehicle_count: string;
  client_price: string;
  /** `per_mt` keeps ₹/MT so sale can be computed after loading. */
  sale_rate_basis: "per_mt" | "per_trip";
  /** Unit rate when `sale_rate_basis` is `per_mt`. */
  sale_unit_rate: string;
  supplier_target: string;
  /**
   * Unit of `supplier_target`. Separate from `sale_rate_basis`, which is the
   * CLIENT sale basis — a load can be sold per-trip and bought per-MT.
   */
  supplier_rate_basis: "per_mt" | "per_trip";
  pickup_date: string;
  /** Who receives this load: connected suppliers, the open Marketplace, or both. */
  circulation_target: IndentDistributionChoice;
}

export {
  INDENT_VEHICLE_COUNT_CHIPS,
  INDENT_VEHICLE_COUNT_ERROR,
  INDENT_VEHICLE_COUNT_MAX,
  INDENT_VEHICLE_COUNT_MIN,
  isValidIndentVehicleCount,
  parseIndentVehicleCount,
  sanitizeIndentVehicleCountInput,
} from "@/features/indents/utils/indentVehicleCount.util";
