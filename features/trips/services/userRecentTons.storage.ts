/**
 * Per-user recent load tonnages — local MRU for Create Trip quick-picks.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

const STORE_KEY = (userId: string) => `q.userRecentTons.v1:${userId}`;
const MAX_STORED = 16;

function normalizeTons(raw: string): string | null {
  const cleaned = String(raw ?? "").replace(/[^\d.]/g, "").trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n <= 0) return null;
  // Prefer compact display: 10 not 10.00; keep decimals when meaningful.
  if (Number.isInteger(n)) return String(n);
  const rounded = Math.round(n * 100) / 100;
  return String(rounded);
}

export async function loadRecentTons(userId: string): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(STORE_KEY(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const out: string[] = [];
    const seen = new Set<string>();
    for (const item of parsed) {
      const v = normalizeTons(String(item ?? ""));
      if (!v || seen.has(v)) continue;
      seen.add(v);
      out.push(v);
      if (out.length >= MAX_STORED) break;
    }
    return out;
  } catch {
    return [];
  }
}

export async function rememberTonsValue(
  userId: string,
  raw: string,
): Promise<string[]> {
  const value = normalizeTons(raw);
  if (!value) return loadRecentTons(userId);
  const prev = await loadRecentTons(userId);
  const next = [value, ...prev.filter((v) => v !== value)].slice(0, MAX_STORED);
  await AsyncStorage.setItem(STORE_KEY(userId), JSON.stringify(next));
  return next;
}

/** Defaults + recent MRU, recent first, capped for ≤2 chip rows. */
export function buildTonsRecommendationChips(
  recent: readonly string[],
  defaults: readonly string[],
  maxChips = 12,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (raw: string) => {
    const v = normalizeTons(raw);
    if (!v || seen.has(v) || out.length >= maxChips) return;
    seen.add(v);
    out.push(v);
  };
  for (const v of recent) push(v);
  for (const v of defaults) push(v);
  return out;
}
