export const DELIVERY_PLACE_CODES = [
  'handed_to_recipient',
  'left_at_door',
  'left_with_security',
  'left_at_reception',
] as const;

export const PICKUP_PLACE_CODES = [
  'collected_from_warehouse',
  'collected_from_seller',
  'loaded_on_vehicle',
] as const;

export type DeliveryPlaceCode = (typeof DELIVERY_PLACE_CODES)[number] | 'other';
export type PickupPlaceCode = (typeof PICKUP_PLACE_CODES)[number] | 'other';
export type StopProofPlaceCode = DeliveryPlaceCode | PickupPlaceCode;
export type StopProofKind = 'pickup' | 'delivery';

export const MAX_STOP_PROOF_PHOTOS = 4;

export type DeliveryProofDraft = {
  place: StopProofPlaceCode | null;
  placeNote: string;
  photoUris: string[];
};

export function emptyDeliveryProof(): DeliveryProofDraft {
  return { place: null, placeNote: '', photoUris: [] };
}

export function deliveryPlaceLabel(code: DeliveryPlaceCode): string {
  switch (code) {
    case 'handed_to_recipient':
      return 'Handed to recipient';
    case 'left_at_door':
      return 'Left at door';
    case 'left_with_security':
      return 'Left with security';
    case 'left_at_reception':
      return 'Left at reception';
    default:
      return 'Other';
  }
}

export function pickupPlaceLabel(code: PickupPlaceCode): string {
  switch (code) {
    case 'collected_from_warehouse':
      return 'Collected from warehouse';
    case 'collected_from_seller':
      return 'Collected from seller';
    case 'loaded_on_vehicle':
      return 'Loaded on vehicle';
    default:
      return 'Other';
  }
}

export function stopProofPlaceLabel(kind: StopProofKind, code: StopProofPlaceCode): string {
  if (kind === 'pickup') return pickupPlaceLabel(code as PickupPlaceCode);
  return deliveryPlaceLabel(code as DeliveryPlaceCode);
}

export function encodeDeliveryPlace(place: StopProofPlaceCode | null, note: string): string | null {
  if (!place) return null;
  if (place === 'other') {
    const trimmed = note.trim();
    return trimmed ? `other:${trimmed.slice(0, 160)}` : 'other';
  }
  return place;
}

export function canSubmitDeliveryProof(draft: DeliveryProofDraft): boolean {
  if (draft.photoUris.length > 0) return true;
  if (draft.place === 'other') return draft.placeNote.trim().length > 0;
  return draft.place != null;
}
