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
  supplier_target: string;
  pickup_date: string;
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
