import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';

const BRANDING_CACHE_KEY = '@q-mobile/invoice-branding-v1';
const DEFAULT_COMPANY_NAME = 'GOGOX';
const MAX_COMPANY_NAME_LENGTH = 48;

export interface InvoiceBrandingSettings {
  companyName: string;
  logoUrl: string | null;
}

function sanitizeCompanyName(input: string | null | undefined): string {
  const normalized = (input ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_COMPANY_NAME_LENGTH);
  return normalized || DEFAULT_COMPANY_NAME;
}

function sanitizeLogoUrl(input: string | null | undefined): string | null {
  const trimmed = (input ?? '').trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return null;
}

function isMissingTableError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: string }).code;
  const message = String((error as { message?: string }).message ?? '');
  return code === '42P01' || /relation .*branding_settings.* does not exist/i.test(message);
}

async function readCachedBranding(): Promise<InvoiceBrandingSettings> {
  try {
    const cached = await AsyncStorage.getItem(BRANDING_CACHE_KEY);
    if (!cached) {
      return { companyName: DEFAULT_COMPANY_NAME, logoUrl: null };
    }
    const parsed = JSON.parse(cached) as Partial<InvoiceBrandingSettings>;
    return {
      companyName: sanitizeCompanyName(parsed.companyName),
      logoUrl: sanitizeLogoUrl(parsed.logoUrl),
    };
  } catch {
    return { companyName: DEFAULT_COMPANY_NAME, logoUrl: null };
  }
}

async function writeCachedBranding(settings: InvoiceBrandingSettings): Promise<void> {
  try {
    await AsyncStorage.setItem(BRANDING_CACHE_KEY, JSON.stringify(settings));
  } catch {
    // Best-effort cache write; ignore failures.
  }
}

export async function getInvoiceBrandingSettings(): Promise<{
  error: Error | null;
  settings: InvoiceBrandingSettings;
}> {
  try {
    const { data, error } = await supabase()
      .from('branding_settings')
      .select('company_name, logo_url, updated_at')
      .order('updated_at', { ascending: false })
      .limit(1);

    if (error) {
      if (isMissingTableError(error)) {
        const fallback = await readCachedBranding();
        return { error: null, settings: fallback };
      }
      const fallback = await readCachedBranding();
      return { error: new Error(error.message), settings: fallback };
    }

    const row = Array.isArray(data) && data.length > 0 ? data[0] : null;
    const settings: InvoiceBrandingSettings = {
      companyName: sanitizeCompanyName(row?.company_name),
      logoUrl: sanitizeLogoUrl(row?.logo_url),
    };
    await writeCachedBranding(settings);
    return { error: null, settings };
  } catch (e) {
    const fallback = await readCachedBranding();
    return {
      error: e instanceof Error ? e : new Error(String(e)),
      settings: fallback,
    };
  }
}

export async function updateInvoiceBrandingSettings(input: InvoiceBrandingSettings): Promise<{
  error: Error | null;
  settings: InvoiceBrandingSettings;
}> {
  const settings: InvoiceBrandingSettings = {
    companyName: sanitizeCompanyName(input.companyName),
    logoUrl: sanitizeLogoUrl(input.logoUrl),
  };
  await writeCachedBranding(settings);

  try {
    const { data: currentRows, error: readError } = await supabase()
      .from('branding_settings')
      .select('id')
      .order('updated_at', { ascending: false })
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
        .eq('id', currentId);

      if (updateError) {
        if (isMissingTableError(updateError)) {
          return { error: null, settings };
        }
        return { error: new Error(updateError.message), settings };
      }
      return { error: null, settings };
    }

    const { error: insertError } = await supabase().from('branding_settings').insert({
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
