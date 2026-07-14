import {
  isDefaultShellOrganizationName,
  isIncompleteOwnerOrganization,
} from '@/lib/onboarding/incompleteOwnerOrg.util';

describe('incompleteOwnerOrg.util', () => {
  it('detects default shell org names', () => {
    expect(isDefaultShellOrganizationName("Vasanth Raj's Organization")).toBe(true);
    expect(isDefaultShellOrganizationName("nihas logs")).toBe(false);
    expect(isDefaultShellOrganizationName('')).toBe(false);
  });

  it('is incomplete when shell name and no address', () => {
    expect(
      isIncompleteOwnerOrganization({
        name: "Vasanth Raj's Organization",
        address_line: null,
      }),
    ).toBe(true);
    expect(
      isIncompleteOwnerOrganization({
        name: "Vasanth Raj's Organization",
        address_line: '7 Hillside',
      }),
    ).toBe(false);
    expect(
      isIncompleteOwnerOrganization({
        name: 'AJIO',
        address_line: null,
      }),
    ).toBe(false);
  });
});
