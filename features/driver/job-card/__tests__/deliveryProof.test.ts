import {
  canSubmitDeliveryProof,
  encodeDeliveryPlace,
  emptyDeliveryProof,
} from '@/features/driver/job-card/deliveryProof';

describe('deliveryProof', () => {
  it('requires a place or a photo', () => {
    expect(canSubmitDeliveryProof(emptyDeliveryProof())).toBe(false);
    expect(canSubmitDeliveryProof({ ...emptyDeliveryProof(), place: 'left_at_door' })).toBe(true);
    expect(
      canSubmitDeliveryProof({ ...emptyDeliveryProof(), place: 'collected_from_warehouse' }),
    ).toBe(true);
    expect(
      canSubmitDeliveryProof({ ...emptyDeliveryProof(), photoUris: ['file://pod.jpg'] }),
    ).toBe(true);
    expect(canSubmitDeliveryProof({ ...emptyDeliveryProof(), place: 'other' })).toBe(false);
    expect(
      canSubmitDeliveryProof({ ...emptyDeliveryProof(), place: 'other', placeNote: 'with guard' }),
    ).toBe(true);
  });

  it('encodes place for trip_documents.document_number', () => {
    expect(encodeDeliveryPlace(null, '')).toBeNull();
    expect(encodeDeliveryPlace('collected_from_warehouse', '')).toBe('collected_from_warehouse');
    expect(encodeDeliveryPlace('other', '  lobby desk  ')).toBe('other:lobby desk');
  });
});
