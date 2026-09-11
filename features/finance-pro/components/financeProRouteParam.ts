/** Expo Router `useLocalSearchParams` may yield `string | string[]`. */
export function financeProRouteParam(
  raw: string | string[] | undefined,
): string | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return null;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
