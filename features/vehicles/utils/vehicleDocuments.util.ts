/** Vehicle document types — matches pulse-unified-base utils/documentExpiry.ts */
export interface DocumentWithExpiry {
  url: string;
  expiryDate: string;
  uploadedAt?: string;
}

export type VehicleComplianceDocType = "rc" | "insurance" | "fitness" | "pollution";

/** Extra files attached from the trip vault (not RC / insurance / fitness / PUC). */
export interface VehicleExtraDocument extends DocumentWithExpiry {
  id: string;
  fileName?: string;
}

export interface VehicleDocuments {
  rc?: DocumentWithExpiry;
  insurance?: DocumentWithExpiry;
  fitness?: DocumentWithExpiry;
  pollution?: DocumentWithExpiry;
  extras?: VehicleExtraDocument[];
}

export const DOCUMENT_LABELS: Record<VehicleComplianceDocType, string> = {
  rc: 'Registration Certificate (RC)',
  insurance: 'Insurance Policy',
  fitness: 'Fitness Certificate',
  pollution: 'PUC Certificate',
};

export const DOCUMENT_EXPIRY_ORDER: VehicleComplianceDocType[] = [
  'insurance',
  'rc',
  'fitness',
  'pollution',
];
