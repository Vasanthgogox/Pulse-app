/** Courier partner category labels — aligned with cashflow couriers.ts getCategoryLabel. */

export type CourierCategory =
  | 'national_express'
  | 'ecommerce_logistics'
  | 'shipping_aggregator'
  | 'express_logistics'
  | 'international_express'
  | 'hyperlocal_ecommerce'
  | 'postal_courier'
  | 'national_courier'
  | 'other';

export function getCategoryLabel(category: string): string {
  return category
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
