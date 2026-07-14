import { describe, expect, it } from 'vitest';
import { requiredKycDocSlots } from '@/lib/kycDocumentMatrix';

describe('admin requiredKycDocSlots', () => {
  it('requires COI for pvt_ltd', () => {
    const types = requiredKycDocSlots('pvt_ltd', true).map((s) => s.type);
    expect(types).toContain('PAN Card');
    expect(types).toContain('Address Proof');
    expect(types).toContain('COI');
    expect(types).not.toContain('GST Certificate');
  });

  it('requires activity proof for proprietorship without GST', () => {
    const slot = requiredKycDocSlots('proprietorship', true).find(
      (s) => s.type === 'Activity Proof',
    );
    expect(slot?.satisfyWith).toEqual(
      expect.arrayContaining(['MSME / Udyam', 'IEC', 'GST Certificate']),
    );
  });

  it('requires partnership deed', () => {
    expect(requiredKycDocSlots('partnership', false).map((s) => s.type)).toContain(
      'Partnership Deed',
    );
  });

  it('requires LLP COI + agreement', () => {
    const types = requiredKycDocSlots('llp', false).map((s) => s.type);
    expect(types).toEqual(
      expect.arrayContaining(['GST Certificate', 'COI', 'LLP Agreement']),
    );
  });
});
