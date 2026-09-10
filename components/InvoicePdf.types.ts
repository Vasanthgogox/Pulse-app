export interface InvoicePdfItem {
  tripId: string;
  route: string;
  context: string;
  date: string;
  amount: number;
}

export interface InvoicePdfData {
  brandingCompanyName: string;
  brandingLogoUrl: string | null;
  invoiceNo: string;
  clientName: string;
  issuedOn: string;
  dueOn: string;
  issuerAddressLines: string[];
  issuerPan: string | null;
  issuerGstin: string | null;
  issuerGstNotApplicable: boolean;
  billingAddressLines: string[];
  shipmentTargetLines: string[];
  paymentTerms: string;
  notes: string;
  lrScope: string;
  assetFleet: string;
  bankDetailsLines: string[];
  items: InvoicePdfItem[];
  additionalCharges: { description: string; amount: number }[];
  subtotal: number;
  taxLabel: string;
  taxAmount: number;
  grandTotal: number;
}
