import type {
  ClientKycDocType,
  ClientKycDocumentRow,
  ClientWarehouseExtended,
} from '@/features/clients/types/clientManagement.types';
import { KYC_DOC_LABELS, MANDATORY_KYC_DOC_TYPES } from '@/features/clients/types/clientManagement.types';
import {
  formatCityStateFromParts,
  formatCityStateLabel,
} from '@/lib/placeCityState.util';

export function computeKycScore(documents: ClientKycDocumentRow[]): {
  score: number;
  verified: number;
  total: number;
  missing: ClientKycDocType[];
} {
  const byType = new Map<ClientKycDocType, ClientKycDocumentRow>();
  for (const doc of documents) {
    const existing = byType.get(doc.doc_type);
    if (!existing || doc.version_number > existing.version_number) {
      byType.set(doc.doc_type, doc);
    }
  }

  const missing: ClientKycDocType[] = [];
  let verified = 0;
  for (const type of MANDATORY_KYC_DOC_TYPES) {
    const doc = byType.get(type);
    if (!doc || !doc.storage_path) {
      missing.push(type);
      continue;
    }
    if (doc.status === 'verified') verified += 1;
  }

  const total = MANDATORY_KYC_DOC_TYPES.length;
  const score = total === 0 ? 0 : Math.round((verified / total) * 100);
  return { score, verified, total, missing };
}

export function kycMissingLabels(missing: ClientKycDocType[]): string[] {
  return missing.map((t) => KYC_DOC_LABELS[t]);
}

/** Display label for lane-rate origin/destination tied to a warehouse (city + state only). */
export function formatWarehouseLaneLabel(
  warehouse: Pick<ClientWarehouseExtended, 'name' | 'city' | 'state' | 'address'>,
): string {
  const fromParts = formatCityStateFromParts(warehouse.city, warehouse.state);
  if (fromParts) return fromParts;
  const fromAddress = formatCityStateLabel(warehouse.address ?? warehouse.name);
  return fromAddress || (warehouse.name?.trim() || 'Warehouse');
}

export function formatClientPhoneDisplay(phone: string | null | undefined): string {
  const raw = phone?.trim();
  if (!raw) return "—";
  if (/^linked-/i.test(raw)) return "—";
  if (/^[0-9a-f-]{30,}$/i.test(raw)) return "—";
  return raw;
}

export function parseClientProfileTab(raw: string | undefined) {
  // Legacy Contracts / Commercials tabs now live nested under Warehouses.
  if (raw === 'contracts' || raw === 'commercials' || raw === 'lanes') {
    return 'warehouses' as const;
  }
  if (
    raw === 'overview' ||
    raw === 'contacts' ||
    raw === 'kyc' ||
    raw === 'warehouses' ||
    raw === 'finance' ||
    raw === 'vault' ||
    raw === 'audit'
  ) {
    return raw;
  }
  return 'overview' as const;
}
