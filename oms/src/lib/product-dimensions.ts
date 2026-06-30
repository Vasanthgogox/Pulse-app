export interface PackingDimensions {
  l: number;
  w: number;
  h: number;
}

/** Volume in m³ from packing dimensions in centimetres. */
export function volumeFromDimensionsCm(dimensions: PackingDimensions): number {
  const { l, w, h } = dimensions;
  if (!l || !w || !h) return 0.01;
  return Math.max(0.000001, (l * w * h) / 1_000_000);
}

export function parseDimension(value: string): number {
  const n = parseFloat(value);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export function formatDimensions(dimensions: PackingDimensions): string {
  const { l, w, h } = dimensions;
  if (!l && !w && !h) return '—';
  return `${l || 0} × ${w || 0} × ${h || 0} cm`;
}
