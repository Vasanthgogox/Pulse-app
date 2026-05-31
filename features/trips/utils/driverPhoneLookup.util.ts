import {
  searchExistingDriversByPhone,
  type ExistingDriverMatch,
} from "@/features/drivers/services/drivers.service";

export function normalizeIndianMobileLast10(raw: string): string {
  const digits = (raw || "").replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

/**
 * Resolve driver profile(s) by phone — tries 10-digit, +91, and 91 prefixes.
 */
export async function lookupDriversByPhoneVariants(raw: string): Promise<{
  error: Error | null;
  matches: ExistingDriverMatch[];
  last10: string;
}> {
  const last10 = normalizeIndianMobileLast10(raw);
  if (last10.length < 10) {
    return { error: null, matches: [], last10 };
  }

  const variants = [last10, `+91${last10}`, `91${last10}`];
  const seen = new Set<string>();
  const matches: ExistingDriverMatch[] = [];

  let lastError: Error | null = null;
  for (const phone of variants) {
    const { error, matches: batch } = await searchExistingDriversByPhone(phone);
    if (error) {
      lastError = error;
      continue;
    }
    for (const m of batch) {
      if (!m.user_id || seen.has(m.user_id)) continue;
      seen.add(m.user_id);
      matches.push(m);
    }
    if (matches.length > 0) break;
  }

  return {
    error: matches.length === 0 ? lastError : null,
    matches,
    last10,
  };
}
