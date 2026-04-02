/** Vehicle document types — matches Q-unified-base utils/documentExpiry.ts */
export interface DocumentWithExpiry {
  url: string;
  expiryDate: string;
  uploadedAt?: string;
}

export interface VehicleDocuments {
  rc?: DocumentWithExpiry;
  insurance?: DocumentWithExpiry;
  fitness?: DocumentWithExpiry;
  pollution?: DocumentWithExpiry;
}

export const DOCUMENT_LABELS: Record<keyof VehicleDocuments, string> = {
  rc: 'Registration Certificate (RC)',
  insurance: 'Insurance Policy',
  fitness: 'Fitness Certificate',
  pollution: 'PUC Certificate',
};

export const DOCUMENT_EXPIRY_ORDER: (keyof VehicleDocuments)[] = [
  'insurance',
  'rc',
  'fitness',
  'pollution',
];
