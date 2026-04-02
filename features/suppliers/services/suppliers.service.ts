/**
 * Suppliers service — Supabase only (mobile). Same DB as Q-unified-base.
 */
import { supabase } from '@/lib/supabase';
import { DEFAULT_PAGE_SIZE, type PageOpts } from '@/lib/pagination';

export interface SupplierRow {
  id: string;
  organization_id: string;
  name: string | null;
  contact: string | null;
  company_name: string | null;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  gst_number: string | null;
  is_active: boolean;
  is_verified: boolean;
  created_at: string;
  updated_at: string;
  /** integrated = platform-linked; offline | marketplace = not. */
  supplier_type?: 'integrated' | 'offline' | 'marketplace';
  /** When set, this supplier is another platform org (for shared ledger / compare & verify). */
  linked_organization_id?: string | null;
}

export async function getSuppliersByOrganization(
  orgId: string,
  opts?: PageOpts
): Promise<{ error: Error | null; suppliers: SupplierRow[]; hasMore?: boolean }> {
  const base = () =>
    supabase()
      .from('suppliers')
      .select('*')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false });
  if (opts != null) {
    const limit = opts.limit ?? DEFAULT_PAGE_SIZE;
    const offset = opts.offset ?? 0;
    const { data, error } = await base().range(offset, offset + limit);
    if (error) return { error: new Error(error.message), suppliers: [] };
    const raw = (data ?? []) as SupplierRow[];
    const hasMore = raw.length > limit;
    return { error: null, suppliers: hasMore ? raw.slice(0, limit) : raw, hasMore };
  }
  const { data, error } = await base();
  if (error) return { error: new Error(error.message), suppliers: [] };
  return { error: null, suppliers: (data ?? []) as SupplierRow[] };
}

export async function getSupplierById(
  orgId: string,
  supplierId: string
): Promise<{ error: Error | null; supplier: SupplierRow | null }> {
  const { data, error } = await supabase()
    .from('suppliers')
    .select('*')
    .eq('organization_id', orgId)
    .eq('id', supplierId)
    .maybeSingle();
  if (error) return { error: new Error(error.message), supplier: null };
  return { error: null, supplier: data as SupplierRow | null };
}

/**
 * Fetch supplier for detail/edit with integrated logic: when supplier_type = 'integrated',
 * name/company_name/contact_person/phone/email are COALESCE from linked org's owner profile.
 * Use this for the supplier detail screen and edit form so the form is pre-filled.
 */
export async function getSupplierDetails(
  supplierId: string
): Promise<{ error: Error | null; supplier: SupplierRow | null }> {
  const { data, error } = await supabase().rpc('get_supplier_details', {
    p_supplier_id: supplierId,
  });
  if (error) return { error: new Error(error.message), supplier: null };
  if (data == null) return { error: null, supplier: null };
  return { error: null, supplier: data as SupplierRow };
}

/**
 * Fetch display profile (name, contact, phone, email) for a linked organization (supplier side).
 * Uses RPC get_connection_partner_display (SECURITY DEFINER) so we can read the other org's profile.
 */
export async function getLinkedOrgProfileForSupplier(
  linkedOrganizationId: string
): Promise<{
  error: Error | null;
  profile: { organizationName: string; contactPerson: string; phone: string; email: string } | null;
}> {
  const { data, error } = await supabase().rpc('get_connection_partner_display', {
    p_linked_organization_id: linkedOrganizationId,
  });
  if (error) {
    return { error: new Error(error.message), profile: null };
  }
  if (data == null || typeof data !== 'object') {
    return { error: null, profile: null };
  }
  const raw = data as { organizationName?: string; contactPerson?: string; phone?: string; email?: string };
  return {
    error: null,
    profile: {
      organizationName: (raw.organizationName ?? '').trim() || 'Connected',
      contactPerson: (raw.contactPerson ?? '').trim(),
      phone: (raw.phone ?? '').trim(),
      email: (raw.email ?? '').trim(),
    },
  };
}

/** Create supplier payload — matches SupplierFormData from Q-unified-base AddSupplierWizard */
export interface CreateSupplierData {
  company_name?: string;
  contact_person?: string;
  phone: string;
  email?: string;
  address?: string;
  operating_areas?: string[];
  vehicle_types?: string[];
  supplier_type?: 'integrated' | 'offline' | 'marketplace';
}

export async function createSupplier(
  orgId: string,
  supplierData: CreateSupplierData
): Promise<{ error: Error | null; supplier: SupplierRow | null }> {
  const payload = {
    organization_id: orgId,
    name: supplierData.company_name ?? supplierData.contact_person ?? '',
    contact: supplierData.contact_person ?? null,
    company_name: supplierData.company_name ?? null,
    contact_person: supplierData.contact_person ?? null,
    phone: (supplierData.phone ?? '').trim(),
    email: (supplierData.email ?? '').trim() || null,
    address: (supplierData.address ?? '').trim() || null,
    is_active: true,
    is_verified: false,
    operating_areas: Array.isArray(supplierData.operating_areas) ? supplierData.operating_areas : [],
    vehicle_types: Array.isArray(supplierData.vehicle_types) ? supplierData.vehicle_types : [],
    supplier_type: supplierData.supplier_type ?? 'offline',
  };
  const { data, error } = await supabase()
    .from('suppliers')
    .insert(payload as Record<string, unknown>)
    .select()
    .single();
  if (error) return { error: new Error(error.message), supplier: null };
  return { error: null, supplier: data as SupplierRow };
}

export interface UpdateSupplierData {
  company_name?: string;
  contact_person?: string;
  phone?: string;
  email?: string;
}

export async function updateSupplier(
  orgId: string,
  supplierId: string,
  patch: UpdateSupplierData
): Promise<{ error: Error | null; supplier: SupplierRow | null }> {
  const updates: Record<string, unknown> = {};
  if (patch.company_name !== undefined) updates.company_name = patch.company_name.trim() || null;
  if (patch.contact_person !== undefined) updates.contact_person = patch.contact_person.trim() || null;
  if (patch.phone !== undefined) updates.phone = patch.phone.trim();
  if (patch.email !== undefined) updates.email = patch.email.trim() || null;
  const name = (patch.company_name ?? '').trim() || (patch.contact_person ?? '').trim() || '';
  if (patch.company_name !== undefined || patch.contact_person !== undefined) updates.name = name;
  if (Object.keys(updates).length === 0) return { error: null, supplier: null };
  const { data, error } = await supabase()
    .from('suppliers')
    .update(updates)
    .eq('organization_id', orgId)
    .eq('id', supplierId)
    .select()
    .single();
  if (error) return { error: new Error(error.message), supplier: null };
  return { error: null, supplier: data as SupplierRow };
}
