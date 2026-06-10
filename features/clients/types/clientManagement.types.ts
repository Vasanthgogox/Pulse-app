/** Client Management module — enterprise CRM / KYC / contracts types. */

export type ClientStatus = 'prospect' | 'customer' | 'inactive' | 'blacklisted';

export type ClientKycDocType =
  | 'gst_certificate'
  | 'pan_card'
  | 'cin_certificate'
  | 'msme_certificate'
  | 'cancelled_cheque'
  | 'bank_letter'
  | 'incorporation_certificate'
  | 'board_resolution'
  | 'authorized_signatory'
  | 'iec'
  | 'trade_license'
  | 'udyam'
  | 'other';

export type ClientProfileTab =
  | 'overview'
  | 'contacts'
  | 'kyc'
  | 'warehouses'
  | 'contracts'
  | 'commercials'
  | 'finance'
  | 'vault'
  | 'audit';

export type ContractAgreementStatus =
  | 'draft'
  | 'active'
  | 'expired'
  | 'terminated'
  | 'renewal_pending';

export type CommercialModel =
  | 'per_trip'
  | 'per_ton'
  | 'per_km'
  | 'per_vehicle_type'
  | 'fixed_monthly';

export type LaneRateType =
  | 'per_trip'
  | 'per_ton'
  | 'per_kg'
  | 'per_km'
  | 'fixed'
  | 'spot';

export interface ClientContactRow {
  id: string;
  organization_id: string;
  client_id: string;
  name: string;
  designation: string | null;
  mobile: string | null;
  email: string | null;
  department: string | null;
  is_primary: boolean;
  is_decision_maker: boolean;
  is_operations: boolean;
  is_finance: boolean;
  is_procurement: boolean;
  is_dispatch: boolean;
  is_billing: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClientKycDocumentRow {
  id: string;
  organization_id: string;
  client_id: string;
  doc_type: ClientKycDocType;
  doc_label: string | null;
  storage_path: string | null;
  file_name: string | null;
  mime_type: string | null;
  expiry_date: string | null;
  version_number: number;
  is_mandatory: boolean;
  status: 'pending' | 'verified' | 'rejected' | 'expired';
  verified_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClientWarehouseExtended {
  id: string;
  organization_id: string;
  client_id: string;
  warehouse_code: string | null;
  warehouse_zone: string | null;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  local_gstin: string | null;
  latitude: number | null;
  longitude: number | null;
  operating_hours: string | null;
  loading_type: string | null;
  unloading_type: string | null;
  dock_count: number | null;
  capacity_tons: number | null;
  handling_equipment: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  manager_name: string | null;
  manager_phone: string | null;
  security_contact: string | null;
  ops_contact: string | null;
  billing_address: string | null;
  created_at: string;
  updated_at: string;
}

export interface DetentionTerms {
  loading_free_hours?: number;
  unloading_free_hours?: number;
  loading_hourly_charge?: number;
  unloading_hourly_charge?: number;
}

export interface PenaltyClauses {
  vehicle_delay?: string;
  pod_delay?: string;
  delivery_delay?: string;
}

export interface PaymentTerms {
  credit_days?: number;
  billing_cycle?: string;
  invoice_frequency?: string;
}

export interface ClaimsTerms {
  damage_liability?: string;
  theft_liability?: string;
  insurance_responsibility?: string;
}

export interface EscalationLevel {
  level: 'L1' | 'L2' | 'L3';
  name?: string;
  email?: string;
  phone?: string;
}

export interface ClientContractAgreement {
  id: string;
  organization_id: string;
  client_id: string;
  contract_number: string;
  title: string | null;
  status: ContractAgreementStatus;
  commercial_model: CommercialModel;
  effective_date: string | null;
  expiry_date: string | null;
  renewal_date: string | null;
  payment_terms: PaymentTerms;
  detention_terms: DetentionTerms;
  penalty_clauses: PenaltyClauses;
  claims_terms: ClaimsTerms;
  escalation_matrix: EscalationLevel[];
  general_terms: string | null;
  signed_storage_path: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClientLaneRate {
  id: string;
  organization_id: string;
  client_id: string;
  agreement_id: string | null;
  origin_warehouse_id: string | null;
  destination_warehouse_id: string | null;
  origin_label: string;
  destination_label: string;
  destination_gstin: string | null;
  destination_address: string | null;
  warehouse_zone: string | null;
  distance_km: number | null;
  pricing_model: string | null;
  base_rate: number | null;
  per_mt_rate: number | null;
  per_km_rate: number | null;
  vehicle_type: string | null;
  rate: number | null;
  rate_type: LaneRateType;
  min_billing: number | null;
  fuel_clause: string | null;
  toll_included: boolean;
  detention_included: boolean;
  valid_from: string | null;
  valid_to: string | null;
  is_spot_rate: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClientFinanceProfile {
  id: string;
  organization_id: string;
  client_id: string;
  opening_balance: number;
  credit_limit: number | null;
  credit_days: number;
  billing_cycle: string;
  invoice_frequency: string;
  dso_target_days: number | null;
  aging_0_30: number;
  aging_31_60: number;
  aging_61_90: number;
  aging_90_plus: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClientDocumentVaultRow {
  id: string;
  organization_id: string;
  client_id: string;
  folder: string;
  doc_type: string;
  title: string;
  storage_path: string | null;
  file_name: string | null;
  mime_type: string | null;
  version_number: number;
  expiry_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClientAuditLogRow {
  id: string;
  organization_id: string;
  client_id: string;
  entity_type: string;
  entity_id: string | null;
  action: string;
  field_name: string | null;
  old_value: string | null;
  new_value: string | null;
  actor_id: string | null;
  actor_name: string | null;
  created_at: string;
}

export interface ClientManagementBundle {
  client: Record<string, unknown> | null;
  contacts: ClientContactRow[];
  kyc_documents: ClientKycDocumentRow[];
  warehouses: ClientWarehouseExtended[];
  agreements: ClientContractAgreement[];
  lane_rates: ClientLaneRate[];
  legacy_contracts: Record<string, unknown>[];
  finance_profile: ClientFinanceProfile | null;
  documents: ClientDocumentVaultRow[];
  audit_log: ClientAuditLogRow[];
}

/** Mandatory KYC document checklist for onboarding score. */
export const MANDATORY_KYC_DOC_TYPES: readonly ClientKycDocType[] = [
  'gst_certificate',
  'pan_card',
  'cin_certificate',
  'msme_certificate',
  'cancelled_cheque',
  'bank_letter',
  'incorporation_certificate',
  'board_resolution',
  'authorized_signatory',
] as const;

export const KYC_DOC_LABELS: Record<ClientKycDocType, string> = {
  gst_certificate: 'GST Certificate',
  pan_card: 'PAN Card',
  cin_certificate: 'CIN Certificate',
  msme_certificate: 'MSME Certificate',
  cancelled_cheque: 'Cancelled Cheque',
  bank_letter: 'Bank Letter',
  incorporation_certificate: 'Incorporation Certificate',
  board_resolution: 'Board Resolution',
  authorized_signatory: 'Authorized Signatory Proof',
  iec: 'IEC',
  trade_license: 'Trade License',
  udyam: 'UDYAM',
  other: 'Other Document',
};
