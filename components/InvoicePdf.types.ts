export interface InvoicePdfItem {
  key: string;
  tripId: string;
  route: string;
  date: string;
  amount: number;
  lineType: 'freight' | 'fuel' | 'additional';
}

export interface InvoicePdfTaxRow {
  label: string;
  value: string;
}

export interface InvoicePdfData {
  documentKind: 'draft';
  brandingCompanyName: string;
  brandingLogoUrl: string | null;
  invoiceNo: 'DRAFT';
  invoiceNumberCaption: string;
  clientName: string;
  previewDate: string;
  indicativeDueDate: string | null;
  issuerAddressLines: string[];
  issuerPan: string | null;
  issuerGstin: string | null;
  issuerGstNotApplicable: boolean;
  billingLines: string[];
  paymentTerms: string | null;
  notes: string | null;
  bankDetailsLines: string[];
  items: InvoicePdfItem[];
  taxableBase: number;
  taxRows: InvoicePdfTaxRow[];
  taxWarning: string | null;
  grandTotal: number;
}
