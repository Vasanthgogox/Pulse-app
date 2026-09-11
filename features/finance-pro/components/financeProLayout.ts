import Layout from "@/constants/Layout";

/** Match Core desktop hub so Finance Pro shares the same side edges. */
export const FINANCE_PRO_CONTENT_MAX_WIDTH = Layout.desktopHubMaxWidth;
export const FINANCE_PRO_GUTTER_DESKTOP = 32;
export const FINANCE_PRO_GUTTER_COMPACT = Layout.screenPaddingHorizontal;
/** @deprecated Use financeProGutter(width) — kept for existing imports. */
export const FINANCE_PRO_GUTTER = FINANCE_PRO_GUTTER_DESKTOP;
export const FINANCE_PRO_STACK_BREAKPOINT = 1100;
export const FINANCE_PRO_TABLE_MIN_WIDTH = 960;

export function financeProGutter(windowWidth: number): number {
  return windowWidth < FINANCE_PRO_STACK_BREAKPOINT
    ? FINANCE_PRO_GUTTER_COMPACT
    : FINANCE_PRO_GUTTER_DESKTOP;
}

export function financeProInnerWidth(windowWidth: number): number {
  const gutter = financeProGutter(windowWidth);
  const capped = Math.min(windowWidth, FINANCE_PRO_CONTENT_MAX_WIDTH);
  return Math.max(0, capped - gutter * 2);
}

export function financeProChartWidth(windowWidth: number, stacked: boolean): number {
  const inner = financeProInnerWidth(windowWidth);
  const col = stacked ? inner : (inner - 20) / 2;
  return Math.max(260, col - 36);
}
