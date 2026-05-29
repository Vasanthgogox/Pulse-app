import type { InboundProtocolInviteItem } from '@/lib/globalSync/inboundProtocol.types';

export type ConnectionOfferTile = {
  label: string;
  value: string;
  hint: string;
  icon: 'client' | 'supplier' | 'partner';
};

/** Roles you will assign in your workspace after accepting (Customers / Suppliers). */
export function buildYourRoleTiles(type: string): ConnectionOfferTile[] {
  const upper = type.toUpperCase();
  const tiles: ConnectionOfferTile[] = [];
  if (upper.includes('CLIENT')) {
    tiles.push({
      label: 'In your workspace',
      value: 'Client',
      hint: 'Listed under Customers — you run trips and manifests as their transporter',
      icon: 'client',
    });
  }
  if (upper.includes('SUPPLIER')) {
    tiles.push({
      label: 'In your workspace',
      value: 'Supplier',
      hint: 'Listed under Suppliers — you book loads and assign their fleet on your indents',
      icon: 'supplier',
    });
  }
  if (tiles.length === 0) {
    tiles.push({
      label: 'In your workspace',
      value: 'Partner',
      hint: 'Share trips, indents, and ledger with this organization',
      icon: 'partner',
    });
  }
  return tiles;
}

/** @deprecated Prefer {@link buildYourRoleTiles} in inbound connection modals. */
export function buildConnectionOfferTiles(type: string): ConnectionOfferTile[] {
  return buildYourRoleTiles(type);
}

/** Short hero pill: what you will add them as after accept. */
export function connectionYourRolePill(type: string): string {
  const upper = type.toUpperCase();
  if (upper.includes('CLIENT') && upper.includes('SUPPLIER')) {
    return 'You add as client & supplier';
  }
  if (upper.includes('CLIENT')) return 'You add as client';
  if (upper.includes('SUPPLIER')) return 'You add as supplier';
  return 'Business partner';
}

/** @deprecated Prefer {@link connectionYourRolePill}. */
export function connectionRolePill(type: string): string {
  return connectionYourRolePill(type);
}

export function formatConnectionInviteDate(createdAt: string | undefined): string | null {
  if (!createdAt) return null;
  try {
    return new Date(createdAt).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return null;
  }
}

export function formatConnectionRatingValue(
  averageRating: number | null | undefined,
  ratingCount?: number | null,
): string {
  if (averageRating == null || !Number.isFinite(averageRating)) {
    return ratingCount != null && ratingCount > 0 ? '—' : 'New';
  }
  return averageRating.toFixed(1);
}

export function formatConnectionTripsValue(tripCount: number | null | undefined): string {
  if (tripCount == null || !Number.isFinite(tripCount) || tripCount < 0) return '0';
  return String(Math.floor(tripCount));
}

/** Tenure on the platform from organization created_at. */
export function formatConnectionExperience(
  orgCreatedAt: string | null | undefined,
): string {
  if (!orgCreatedAt) return 'New';
  const created = new Date(orgCreatedAt);
  if (Number.isNaN(created.getTime())) return 'New';
  const ms = Date.now() - created.getTime();
  if (!Number.isFinite(ms) || ms < 0) return 'New';
  const years = Math.floor(ms / (365.25 * 24 * 60 * 60 * 1000));
  if (years >= 1) return `${years} yr${years === 1 ? '' : 's'}`;
  const months = Math.floor(ms / (30.44 * 24 * 60 * 60 * 1000));
  if (months >= 1) return `${months} mo`;
  return 'New';
}

export function formatConnectionRatingCount(ratingCount: number | null | undefined): string {
  if (ratingCount == null || !Number.isFinite(ratingCount) || ratingCount <= 0) {
    return 'No reviews';
  }
  return `${Math.floor(ratingCount)} review${ratingCount === 1 ? '' : 's'}`;
}

export function connectionNextSteps(orgName: string): string[] {
  return [
    `Trips and indents sync between you and ${orgName}`,
    'They appear in your Customers or Suppliers network',
    'Settle shared ledger entries on connected trips',
  ];
}

export function isConnectionProtocolInvite(item: InboundProtocolInviteItem): boolean {
  return item.kind !== 'driver';
}
