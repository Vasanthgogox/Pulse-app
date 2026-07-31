import { computePartnerIndentFreightCost } from '../partnerIndentFreightCost.util';

describe('computePartnerIndentFreightCost', () => {
  it('uses the subcontract rate when present, even if 0', () => {
    expect(computePartnerIndentFreightCost(0, 5000)).toBe(0);
    expect(computePartnerIndentFreightCost(1200, 5000)).toBe(1200);
  });

  it('falls back to driver pay when no subcontract rate is recorded', () => {
    expect(computePartnerIndentFreightCost(null, 3000)).toBe(3000);
    expect(computePartnerIndentFreightCost(undefined, 3000)).toBe(3000);
  });

  it('returns 0 when neither subcontract rate nor driver pay is available (no fallback to bid amount)', () => {
    expect(computePartnerIndentFreightCost(null, null)).toBe(0);
    expect(computePartnerIndentFreightCost(undefined, undefined)).toBe(0);
    expect(computePartnerIndentFreightCost(null, 0)).toBe(0);
  });
});
