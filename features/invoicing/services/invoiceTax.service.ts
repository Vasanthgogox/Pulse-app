/**
 * Phase 2A-2: pure invoice GST engine.
 * No Supabase, no workspace/client queries, no default GST rate, no default SAC.
 *
 * includeGst=false OR gstRate=0 → application-level gst_off (zero tax).
 * That is not a legal zero-rated-supply classification.
 */

import type { InvoiceTaxSnapshot } from '@/features/invoicing/services/invoiceDocumentSnapshot.service';

export type InvoiceTaxStatus = 'ok' | 'blocked';

export type InvoiceSupplyType = 'intra' | 'inter' | 'not_applicable' | 'gst_off';

export type InvoiceTaxDetermination =
  | 'gst_not_applicable'
  | 'gst_off'
  | 'gstin_state_codes'
  | 'declared_state_strings'
  | 'insufficient_tax_state'
  | 'multiple_clients'
  | 'cross_org_client'
  | 'cross_org_trips';

export type InvoiceTaxIssuerInput = {
  org_id: string;
  gstin: string | null;
  gst_not_applicable: boolean;
  state: string | null;
};

export type InvoiceTaxClientInput = {
  client_id: string | null;
  gstin: string | null;
  state: string | null;
  organization_id?: string | null;
};

export type InvoiceTaxEngineInput = {
  issuer: InvoiceTaxIssuerInput;
  clients: InvoiceTaxClientInput[];
  includeGst: boolean;
  gstRate: number;
  tripAmounts: number[];
  includeFuel: boolean;
  fuelRate: number;
  additionalCharges: Array<{ amount?: number }>;
  invoiceOrgId: string;
  tripOrgIds: string[];
  hsn_sac?: string | null;
};

export type InvoiceTaxResult = {
  status: InvoiceTaxStatus;
  block_reason: InvoiceTaxDetermination | null;
  taxable_base: number;
  gst_rate: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  total_amount: number;
  supply_type: InvoiceSupplyType | null;
  snapshot: InvoiceTaxSnapshot;
};

/** Half-up to paise. */
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function parseGstinStateCode(gstin: string | null | undefined): string | null {
  const raw = (gstin ?? '').replace(/\s+/g, '').trim().toUpperCase();
  if (raw.length !== 15) return null;
  const code = raw.slice(0, 2);
  if (!/^\d{2}$/.test(code)) return null;
  const n = Number(code);
  if (n < 1 || n > 38) return null;
  return code;
}

function normalizeState(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
  return trimmed ? trimmed : null;
}

function finiteNonNegative(n: number): boolean {
  return Number.isFinite(n) && n >= 0;
}

function moneyOrZero(n: unknown): number {
  if (typeof n !== 'number' || !Number.isFinite(n)) return 0;
  return n;
}

function uniqueOrgIds(ids: string[]): string[] {
  return Array.from(new Set(ids.map((id) => id.trim()).filter(Boolean)));
}

function uniqueClients(clients: InvoiceTaxClientInput[]): InvoiceTaxClientInput[] {
  const seen = new Set<string>();
  const out: InvoiceTaxClientInput[] = [];
  for (const client of clients) {
    if (client.client_id && seen.has(client.client_id)) continue;
    if (client.client_id) seen.add(client.client_id);
    out.push(client);
  }
  return out;
}

function zeroTaxSnapshot(
  input: InvoiceTaxEngineInput,
  extras: {
    supply_type: InvoiceSupplyType;
    determination: InvoiceTaxDetermination;
    place_of_supply: string | null;
    gst_rate: number;
    issuerCode: string | null;
    clientCode: string | null;
    client: InvoiceTaxClientInput | null;
  },
): InvoiceTaxSnapshot {
  return {
    supply_type: extras.supply_type,
    place_of_supply: extras.place_of_supply,
    hsn_sac: input.hsn_sac ?? null,
    determination: extras.determination,
    issuer_gstin: input.issuer.gstin,
    client_gstin: extras.client?.gstin ?? null,
    issuer_gst_not_applicable: input.issuer.gst_not_applicable === true,
    issuer_gstin_state_code: extras.issuerCode,
    client_gstin_state_code: extras.clientCode,
    issuer_state: input.issuer.state,
    client_state: extras.client?.state ?? null,
    gst_rate: extras.gst_rate,
    include_gst: input.includeGst,
  };
}

function result(args: {
  status: InvoiceTaxStatus;
  block_reason: InvoiceTaxDetermination | null;
  taxable_base: number;
  gst_rate: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  snapshot: InvoiceTaxSnapshot;
  supply_type: InvoiceSupplyType | null;
}): InvoiceTaxResult {
  const total_amount = round2(
    args.taxable_base + args.cgst_amount + args.sgst_amount + args.igst_amount,
  );
  return { ...args, total_amount };
}

/**
 * Deterministic GST calculation. Does not query the database.
 * status 'ok' = tax determination is valid and does not block issuance for tax reasons
 * (intra, inter, gst_off, not_applicable).
 * status 'blocked' = requested GST-on determination cannot safely be made.
 */
export function computeInvoiceTax(input: InvoiceTaxEngineInput): InvoiceTaxResult {
  if (!finiteNonNegative(input.gstRate)) {
    throw new Error('gstRate must be a finite number >= 0');
  }
  if (!finiteNonNegative(input.fuelRate)) {
    throw new Error('fuelRate must be a finite number >= 0');
  }

  const baseFreightTotal = input.tripAmounts.reduce((acc, n) => acc + moneyOrZero(n), 0);
  const additionalTotal = input.additionalCharges.reduce(
    (acc, c) => acc + moneyOrZero(c.amount),
    0,
  );
  const fuelSurcharge = input.includeFuel ? baseFreightTotal * (input.fuelRate / 100) : 0;
  const taxable_base = round2(baseFreightTotal + additionalTotal + fuelSurcharge);

  const issuerCode = parseGstinStateCode(input.issuer.gstin);
  const clients = uniqueClients(input.clients);
  const client = clients.length === 1 ? clients[0] : null;
  const clientCode = parseGstinStateCode(client?.gstin);
  const tripOrgs = uniqueOrgIds(input.tripOrgIds);

  const blocked = (
    reason: InvoiceTaxDetermination,
    place_of_supply: string | null = null,
  ): InvoiceTaxResult =>
    result({
      status: 'blocked',
      block_reason: reason,
      taxable_base,
      gst_rate: 0,
      cgst_amount: 0,
      sgst_amount: 0,
      igst_amount: 0,
      supply_type: null,
      snapshot: zeroTaxSnapshot(input, {
        supply_type: 'gst_off',
        determination: reason,
        place_of_supply,
        gst_rate: 0,
        issuerCode,
        clientCode,
        client,
      }),
    });

  if (tripOrgs.length > 1 || (tripOrgs.length === 1 && tripOrgs[0] !== input.invoiceOrgId)) {
    return blocked('cross_org_trips');
  }
  if (
    client?.organization_id &&
    client.organization_id.trim() &&
    client.organization_id !== input.invoiceOrgId
  ) {
    return blocked('cross_org_client');
  }

  if (input.issuer.gst_not_applicable === true) {
    return result({
      status: 'ok',
      block_reason: null,
      taxable_base,
      gst_rate: 0,
      cgst_amount: 0,
      sgst_amount: 0,
      igst_amount: 0,
      supply_type: 'not_applicable',
      snapshot: zeroTaxSnapshot(input, {
        supply_type: 'not_applicable',
        determination: 'gst_not_applicable',
        place_of_supply: null,
        gst_rate: 0,
        issuerCode,
        clientCode,
        client,
      }),
    });
  }

  if (!input.includeGst || input.gstRate === 0) {
    return result({
      status: 'ok',
      block_reason: null,
      taxable_base,
      gst_rate: 0,
      cgst_amount: 0,
      sgst_amount: 0,
      igst_amount: 0,
      supply_type: 'gst_off',
      snapshot: zeroTaxSnapshot(input, {
        supply_type: 'gst_off',
        determination: 'gst_off',
        place_of_supply: null,
        gst_rate: 0,
        issuerCode,
        clientCode,
        client,
      }),
    });
  }

  if (clients.length !== 1) {
    return blocked('multiple_clients');
  }

  const gst_rate = input.gstRate;
  const issuerState = normalizeState(input.issuer.state);
  const clientState = normalizeState(client?.state);

  let supply_type: InvoiceSupplyType | null = null;
  let determination: InvoiceTaxDetermination | null = null;
  let place_of_supply: string | null = null;

  if (issuerCode && clientCode) {
    supply_type = issuerCode === clientCode ? 'intra' : 'inter';
    determination = 'gstin_state_codes';
    place_of_supply = clientCode;
  } else if (issuerState && clientState) {
    supply_type = issuerState === clientState ? 'intra' : 'inter';
    determination = 'declared_state_strings';
    place_of_supply = client?.state?.trim() ?? null;
  } else {
    return blocked('insufficient_tax_state');
  }

  const cgst_amount =
    supply_type === 'intra' ? round2((taxable_base * (gst_rate / 2)) / 100) : 0;
  const sgst_amount =
    supply_type === 'intra' ? round2((taxable_base * (gst_rate / 2)) / 100) : 0;
  const igst_amount = supply_type === 'inter' ? round2((taxable_base * gst_rate) / 100) : 0;

  return result({
    status: 'ok',
    block_reason: null,
    taxable_base,
    gst_rate,
    cgst_amount,
    sgst_amount,
    igst_amount,
    supply_type,
    snapshot: {
      supply_type,
      place_of_supply,
      hsn_sac: input.hsn_sac ?? null,
      determination,
      issuer_gstin: input.issuer.gstin,
      client_gstin: client?.gstin ?? null,
      issuer_gst_not_applicable: false,
      issuer_gstin_state_code: issuerCode,
      client_gstin_state_code: clientCode,
      issuer_state: input.issuer.state,
      client_state: client?.state ?? null,
      gst_rate,
      include_gst: true,
    },
  });
}
