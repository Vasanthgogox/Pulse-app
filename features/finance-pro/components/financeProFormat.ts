import { formatINR, formatINRChip } from "@/lib/format";

export function formatFinanceInr(value: number): string {
  return formatINR(value);
}

export function formatFinanceChip(value: number): string {
  return formatINRChip(value);
}

export function formatPct(value: number): string {
  if (!Number.isFinite(value)) return "0%";
  return `${value.toFixed(value >= 10 ? 0 : 1)}%`;
}

export function formatCount(n: number): string {
  return n.toLocaleString("en-IN");
}
