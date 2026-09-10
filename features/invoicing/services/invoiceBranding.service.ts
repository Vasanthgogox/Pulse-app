import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import {
  isLegacyCustomerBrandName,
  sanitizeOptionalHttpLogoUrl,
  type InvoiceBrandingOverlay,
} from '@/features/invoicing/services/invoiceIssuerIdentity.service';

const BRANDING_CACHE_PREFIX = '@pulse/invoice-branding-v1';

export interface InvoiceBrandingSettings {
  companyName: string | null;
  logoUrl: string | null;
}

export function invoiceBrandingCacheKey(orgId: string): string {
  return `${BRANDING_CACHE_PREFIX}:${orgId}`;
}

function normalizeCompanyName(input: string | null | undefined): string | null {
  const normalized = (input ?? '').replace(/\s+/g, ' ').trim();
  if (!normalized) return null;
  if (isLegacyCustomerBrandName(normalized)) return null;
  return normalized;
}

function isMissingTableError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: string }).code;
  const message = String((error as { message?: string }).message ?? '');
  return code === '42P01' || /relation .*branding_settings.* does not exist/i.test(message);
}

async function readCachedBranding(orgId: string): Promise<InvoiceBrandingOverlay> {
  try {
    const cached = await AsyncStorage.getItem(invoiceBrandingCacheKey(orgId));
    if (!cached) {
      return { companyName: null, logoUrl: null };
    }
    const parsed = JSON.parse(cached) as Partial<InvoiceBrandingSettings>;
    return {
      companyName: normalizeCompanyName(parsed.companyName),
      logoUrl: sanitizeOptionalHttpLogoUrl(parsed.logoUrl),
    };
  } catch {
    return { companyName: null, logoUrl: null };
  }
}

async function writeCachedBranding(
  orgId: string,
  settings: InvoiceBrandingOverlay,
): Promise<void> {
  try {
    await AsyncStorage.setItem(invoiceBrandingCacheKey(orgId), JSON.stringify(settings));
  } catch {
    // Best-effort cache write; ignore failures.
  }
}

/**
 * Sync org identity to both the local branding cache and the server's branding_settings row.
 * Call this whenever org name or logo changes. orgId is the canonical upsert key.
 */
export async function syncBrandingFromOrg(
  orgId: string,
  orgName: string,
  orgLogoUrl: string | null,
): Promise<void> {
  const settings: InvoiceBrandingOverlay = {
    companyName: normalizeCompanyName(orgName),
    logoUrl: sanitizeOptionalHttpLogoUrl(orgLogoUrl),
  };
  await writeCachedBranding(orgId, settings);

  try {
    const { error } = await supabase()
      .from('branding_settings')
      .upsert(
        {
          org_id: orgId,
          company_name: settings.companyName,
          logo_url: settings.logoUrl,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'org_id' },
      );
    if (error && !isMissingTableError(error)) {
      console.warn('[invoiceBranding] sync failed:', error.message);
    }
  } catch {
    // Best-effort server write; local cache is already updated.
  }
}

/**
 * Org-scoped branding overlay only. Does not invent a company name.
 * Legal identity remains activeWorkspace via resolveInvoiceIssuerIdentity.
 */
export async function getInvoiceBrandingSettings(
  orgId: string,
): Promise<{
  error: Error | null;
  settings: InvoiceBrandingOverlay;
}> {
  if (!orgId) {
    return { error: new Error('Workspace is required'), settings: { companyName: null, logoUrl: null } };
  }

  try {
    const { data, error } = await supabase()
      .from('branding_settings')
      .select('company_name, logo_url')
      .eq('org_id', orgId)
      .limit(1);

    if (error) {
      const fallback = await readCachedBranding(orgId);
      if (isMissingTableError(error)) {
        return { error: null, settings: fallback };
      }
      return { error: new Error(error.message), settings: fallback };
    }

    const row = Array.isArray(data) && data.length > 0 ? data[0] : null;
    const settings: InvoiceBrandingOverlay = {
      companyName: normalizeCompanyName(row?.company_name),
      logoUrl: sanitizeOptionalHttpLogoUrl(row?.logo_url),
    };
    await writeCachedBranding(orgId, settings);
    return { error: null, settings };
  } catch (e) {
    const fallback = await readCachedBranding(orgId);
    return {
      error: e instanceof Error ? e : new Error(String(e)),
      settings: fallback,
    };
  }
}

export async function updateInvoiceBrandingSettings(
  orgId: string,
  input: InvoiceBrandingSettings,
): Promise<{
  error: Error | null;
  settings: InvoiceBrandingOverlay;
}> {
  const settings: InvoiceBrandingOverlay = {
    companyName: normalizeCompanyName(input.companyName),
    logoUrl: sanitizeOptionalHttpLogoUrl(input.logoUrl),
  };
  if (!orgId) {
    return { error: new Error('Workspace is required'), settings };
  }
  await writeCachedBranding(orgId, settings);

  try {
    const { data: currentRows, error: readError } = await supabase()
      .from('branding_settings')
      .select('id')
      .eq('org_id', orgId)
      .limit(1);

    if (readError) {
      if (isMissingTableError(readError)) {
        return { error: null, settings };
      }
      return { error: new Error(readError.message), settings };
    }

    const currentId =
      Array.isArray(currentRows) && currentRows.length > 0 ? currentRows[0].id : null;

    if (currentId) {
      const { error: updateError } = await supabase()
        .from('branding_settings')
        .update({
          company_name: settings.companyName,
          logo_url: settings.logoUrl,
          updated_at: new Date().toISOString(),
        })
        .eq('id', currentId)
        .eq('org_id', orgId);

      if (updateError) {
        if (isMissingTableError(updateError)) {
          return { error: null, settings };
        }
        return { error: new Error(updateError.message), settings };
      }
      return { error: null, settings };
    }

    const { error: insertError } = await supabase().from('branding_settings').insert({
      org_id: orgId,
      company_name: settings.companyName,
      logo_url: settings.logoUrl,
      updated_at: new Date().toISOString(),
    });

    if (insertError) {
      if (isMissingTableError(insertError)) {
        return { error: null, settings };
      }
      return { error: new Error(insertError.message), settings };
    }

    return { error: null, settings };
  } catch (e) {
    return {
      error: e instanceof Error ? e : new Error(String(e)),
      settings,
    };
  }
}
