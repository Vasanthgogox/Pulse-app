import type { Workspace } from '@/types/workspace';

const LEGACY_CUSTOMER_NAMES = new Set(['gogox', 'gogox logistics']);

export type InvoiceIssuerWorkspace = Pick<
  Workspace,
  | 'id'
  | 'name'
  | 'address_line'
  | 'locality'
  | 'city'
  | 'state'
  | 'pincode'
  | 'business_pan'
  | 'gstin'
  | 'gst_not_applicable'
  | 'logo_url'
>;

/** Optional visual overlay only. Never used as legal name, GSTIN, PAN, or address. */
export type InvoiceBrandingOverlay = {
  companyName: string | null;
  logoUrl: string | null;
};

export type InvoiceIssuerIdentity = {
  orgId: string;
  businessName: string;
  addressLines: string[];
  city: string | null;
  state: string | null;
  pincode: string | null;
  pan: string | null;
  gstin: string | null;
  gstNotApplicable: boolean;
  logoUrl: string | null;
};

function trimOrNull(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').replace(/\s+/g, ' ').trim();
  return trimmed ? trimmed : null;
}

export function isLegacyCustomerBrandName(value: string | null | undefined): boolean {
  const normalized = (value ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
  return LEGACY_CUSTOMER_NAMES.has(normalized);
}

export function sanitizeOptionalHttpLogoUrl(input: string | null | undefined): string | null {
  const trimmed = (input ?? '').trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return null;
}

export function formatWorkspaceAddressLines(workspace: InvoiceIssuerWorkspace): string[] {
  const lines: string[] = [];
  const street = trimOrNull(workspace.address_line);
  const locality = trimOrNull(workspace.locality);
  if (street) lines.push(street);
  if (locality && locality.toLowerCase() !== street?.toLowerCase()) lines.push(locality);

  const city = trimOrNull(workspace.city);
  const state = trimOrNull(workspace.state);
  const pincode = trimOrNull(workspace.pincode);
  const localityLine = [city, state, pincode].filter(Boolean).join(', ');
  if (localityLine) lines.push(localityLine);
  return lines;
}

/**
 * Legal issuer identity is always the active workspace.
 * Branding may overlay logo only — never name, address, PAN, or GSTIN.
 * Never substitutes GOGOX or any other hardcoded company name.
 */
export function resolveInvoiceIssuerIdentity(args: {
  workspace: InvoiceIssuerWorkspace | null;
  branding?: InvoiceBrandingOverlay | null;
}): InvoiceIssuerIdentity | null {
  const workspace = args.workspace;
  if (!workspace?.id) return null;

  const businessName = trimOrNull(workspace.name);
  if (!businessName) return null;

  const brandingLogo = sanitizeOptionalHttpLogoUrl(args.branding?.logoUrl);
  const workspaceLogo = sanitizeOptionalHttpLogoUrl(workspace.logo_url);
  const gstNotApplicable = workspace.gst_not_applicable === true;

  return {
    orgId: workspace.id,
    businessName,
    addressLines: formatWorkspaceAddressLines(workspace),
    city: trimOrNull(workspace.city),
    state: trimOrNull(workspace.state),
    pincode: trimOrNull(workspace.pincode),
    pan: trimOrNull(workspace.business_pan),
    gstin: gstNotApplicable ? null : trimOrNull(workspace.gstin),
    gstNotApplicable,
    logoUrl: brandingLogo ?? workspaceLogo,
  };
}
