/** Canonical sales order sources — all map to the same SalesOrder model. */

export type OrderSource =
  | 'manual'
  | 'shopify'
  | 'woocommerce'
  | 'api'
  | 'csv'
  | 'edi'
  | 'marketplace';

export const ORDER_SOURCE_LABELS: Record<OrderSource, string> = {
  manual:      'Manual Entry',
  shopify:     'Shopify',
  woocommerce: 'WooCommerce',
  api:         'API',
  csv:         'CSV Upload',
  edi:         'EDI',
  marketplace: 'Marketplace',
};

export interface OrderSourceConnector {
  id:       OrderSource;
  label:    string;
  enabled:  boolean;
  connected: boolean;
}

export const ORDER_SOURCE_CONNECTORS: OrderSourceConnector[] = [
  { id: 'manual', label: 'Manual Entry', enabled: true, connected: true },
  { id: 'shopify', label: 'Shopify', enabled: true, connected: false },
  { id: 'woocommerce', label: 'WooCommerce', enabled: true, connected: false },
  { id: 'api', label: 'API', enabled: true, connected: false },
  { id: 'csv', label: 'CSV Upload', enabled: true, connected: false },
  { id: 'edi', label: 'EDI', enabled: false, connected: false },
  { id: 'marketplace', label: 'Marketplace', enabled: false, connected: false },
];
