import type { Address } from '@/types/commerce';

export function isAddressIncomplete(address: Address | null | undefined): boolean {
  if (!address) return true;
  return ![address.line1, address.city, address.pincode].some((part) => (part ?? '').trim().length > 0);
}

export function formatStopAddress(address: Address | null | undefined): string {
  if (!address) return '';
  return [address.line1, address.city, address.state, address.pincode]
    .map((part) => (part ?? '').trim())
    .filter(Boolean)
    .join(', ');
}
