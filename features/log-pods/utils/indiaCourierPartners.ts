export type IndiaCourierPartner = {
  label: string;
  value: string;
  category: string;
};

/** Value used when the operator types a courier that is not in the directory. */
export const TYPED_COURIER_VALUE = "__typed_courier__";

/**
 * Common India POD / parcel couriers shown when `courier_partners` is empty
 * or incomplete. Workspace rows win on the same `value` or label.
 */
export const RECOMMENDED_INDIA_COURIERS: IndiaCourierPartner[] = [
  { label: "Delhivery", value: "delhivery", category: "ecommerce_logistics" },
  { label: "Blue Dart", value: "blue_dart", category: "national_express" },
  { label: "DTDC", value: "dtdc", category: "national_courier" },
  {
    label: "India Post (Speed Post)",
    value: "india_post_speed_post",
    category: "postal_courier",
  },
  {
    label: "Professional Couriers",
    value: "professional_couriers",
    category: "national_courier",
  },
  { label: "Trackon", value: "trackon", category: "national_courier" },
  { label: "Gati", value: "gati", category: "express_logistics" },
  { label: "Xpressbees", value: "xpressbees", category: "ecommerce_logistics" },
  { label: "Ecom Express", value: "ecom_express", category: "ecommerce_logistics" },
  { label: "Shadowfax", value: "shadowfax", category: "hyperlocal_ecommerce" },
  { label: "Ekart", value: "ekart", category: "ecommerce_logistics" },
  {
    label: "Amazon Shipping",
    value: "amazon_shipping",
    category: "ecommerce_logistics",
  },
  { label: "FedEx", value: "fedex", category: "international_express" },
  { label: "DHL Express", value: "dhl_express", category: "international_express" },
  { label: "Aramex", value: "aramex", category: "international_express" },
  { label: "UPS", value: "ups", category: "international_express" },
  { label: "TCI XPS", value: "tci_xps", category: "express_logistics" },
  { label: "ST Courier", value: "st_courier", category: "national_courier" },
  { label: "First Flight", value: "first_flight", category: "national_courier" },
  { label: "V-Xpress", value: "v_xpress", category: "express_logistics" },
  { label: "Safexpress", value: "safexpress", category: "express_logistics" },
  {
    label: "Bombino Express",
    value: "bombino_express",
    category: "national_express",
  },
  { label: "Shiprocket", value: "shiprocket", category: "shipping_aggregator" },
  {
    label: "Shree Maruti Courier",
    value: "shree_maruti",
    category: "national_courier",
  },
  { label: "Rivigo", value: "rivigo", category: "express_logistics" },
];

function keyOf(row: IndiaCourierPartner): string {
  return row.value.trim().toLowerCase();
}

function labelKey(row: IndiaCourierPartner): string {
  return row.label.trim().toLowerCase();
}

export function mergeCourierPartnerLists(
  workspace: IndiaCourierPartner[],
  recommended: IndiaCourierPartner[] = RECOMMENDED_INDIA_COURIERS,
): IndiaCourierPartner[] {
  const byValue = new Map<string, IndiaCourierPartner>();
  const labels = new Set<string>();

  for (const row of workspace) {
    if (!row.value || !row.label) continue;
    byValue.set(keyOf(row), row);
    labels.add(labelKey(row));
  }
  for (const row of recommended) {
    if (byValue.has(keyOf(row)) || labels.has(labelKey(row))) continue;
    byValue.set(keyOf(row), row);
    labels.add(labelKey(row));
  }

  return [...byValue.values()].sort((a, b) => a.label.localeCompare(b.label));
}

export function filterCourierPartners(
  partners: IndiaCourierPartner[],
  query: string,
): IndiaCourierPartner[] {
  const q = query.trim().toLowerCase();
  if (!q) return partners;
  return partners.filter(
    (item) =>
      item.label.toLowerCase().includes(q) ||
      item.value.toLowerCase().includes(q) ||
      (item.category ?? "").toLowerCase().includes(q),
  );
}

export function hasExactCourierLabel(
  partners: IndiaCourierPartner[],
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return false;
  return partners.some((item) => item.label.trim().toLowerCase() === q);
}

export function resolveCourierDisplayName(
  partners: IndiaCourierPartner[],
  courierValue: string,
  typedName: string,
): string {
  if (courierValue === TYPED_COURIER_VALUE) return typedName.trim();
  return partners.find((item) => item.value === courierValue)?.label ?? courierValue;
}
