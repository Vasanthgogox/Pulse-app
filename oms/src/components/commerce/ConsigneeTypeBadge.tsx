import { StatusDotBadge } from '@/components/commerce/StatusDotBadge';
import { getConsigneeEntityType } from '@/lib/consignee';
import type { Customer } from '@/types/commerce';

export function ConsigneeTypeBadge({ consignee }: { consignee: Customer }) {
  const isBusiness = getConsigneeEntityType(consignee) === 'business';
  return (
    <StatusDotBadge
      label={isBusiness ? 'Business' : 'Individual'}
      tone={isBusiness ? 'info' : 'success'}
    />
  );
}
