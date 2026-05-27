/** Shared Create Indent form shape (used by wizard helpers). */
export interface FormState {
  client_name: string;
  client_id: string | null;
  pickup_area: string;
  drop_location: string;
  vehicle_type: string;
  load_type: string;
  weight: string;
  client_price: string;
  supplier_target: string;
  pickup_date: string;
}
