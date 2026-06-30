import type { ConsigneeEntityType, Customer } from '@/types/commerce';

export function isBusinessConsignee(c: Customer): boolean {
  return c.entity_type === 'business' || Boolean(c.gstin?.trim());
}

export function getConsigneeEntityType(c: Customer): ConsigneeEntityType {
  return isBusinessConsignee(c) ? 'business' : (c.entity_type ?? 'individual');
}

export function getConsigneeDisplayName(c: Customer): string {
  if (isBusinessConsignee(c)) {
    return c.legal_name?.trim() || c.company?.trim() || c.name;
  }
  return c.name;
}

export function getConsigneeSubtitle(c: Customer): string {
  if (isBusinessConsignee(c)) {
    const parts = [c.gstin && `GST ${c.gstin}`, c.contact_person, c.email].filter(Boolean);
    return parts.join(' · ') || c.email || 'Business consignee';
  }
  return c.email || c.phone || 'Individual consignee';
}

export function normalizeGstin(value: string): string {
  return value.replace(/\s/g, '').toUpperCase().slice(0, 15);
}

export function isValidGstin(value: string): boolean {
  const gst = normalizeGstin(value);
  if (!gst) return true;
  return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gst);
}

export function buildConsigneePayload(fields: {
  entityType:     ConsigneeEntityType;
  name:           string;
  legalName:      string;
  email:          string;
  phone:          string;
  contactPerson:  string;
  gstin:          string;
  pan:            string;
  line1:          string;
  city:           string;
  state:          string;
  pincode:        string;
}): Pick<
  Customer,
  'name' | 'email' | 'phone' | 'company' | 'entity_type' | 'legal_name' | 'gstin' | 'pan' | 'contact_person' | 'billing_address' | 'shipping_address'
> {
  const address = {
    line1:   fields.line1.trim() || fields.name.trim(),
    city:    fields.city.trim(),
    state:   fields.state.trim(),
    pincode: fields.pincode.trim(),
  };
  const isBusiness = fields.entityType === 'business';

  return {
    entity_type:    fields.entityType,
    name:           isBusiness
      ? (fields.legalName.trim() || fields.name.trim())
      : fields.name.trim(),
    legal_name:     isBusiness ? fields.legalName.trim() || fields.name.trim() : undefined,
    company:        isBusiness ? (fields.legalName.trim() || fields.name.trim()) : undefined,
    contact_person: isBusiness ? fields.contactPerson.trim() || undefined : fields.name.trim(),
    email:          fields.email.trim(),
    phone:          fields.phone.trim(),
    gstin:          isBusiness ? normalizeGstin(fields.gstin) || undefined : undefined,
    pan:            isBusiness ? fields.pan.trim().toUpperCase() || undefined : undefined,
    billing_address:  address,
    shipping_address: address,
  };
}

export function canSaveConsignee(fields: {
  entityType: ConsigneeEntityType;
  name:       string;
  legalName:  string;
  gstin:      string;
}): boolean {
  if (fields.entityType === 'business') {
    const hasName = Boolean(fields.legalName.trim() || fields.name.trim());
    const gstOk = !fields.gstin.trim() || isValidGstin(fields.gstin);
    return hasName && gstOk;
  }
  return Boolean(fields.name.trim());
}
