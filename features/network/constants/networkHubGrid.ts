/** Shared hub layout for Network tab (connections + discover). */
export const NETWORK_HUB_GRID_COLUMNS = 3;
/** Grow your network — desktop Metronic grid (matches Your connections). */
export const NETWORK_HUB_GROW_GRID_COLUMNS = 4;
export const NETWORK_HUB_GRID_GAP_PX = 10;
/** Vertical gap between native full-width hub cards (page shows through gap). */
export const NETWORK_HUB_NATIVE_LIST_GAP_PX = 10;
export const NETWORK_HUB_GRID_ROW_PADDING_H = 22;
/** Horizontal space between Grow your network and People you may know (desktop split). */
export const NETWORK_HUB_SPLIT_COLUMN_GAP_PX = 24;

/** Your connections — phone / narrow web (<820): 3 tiles per row × 2 rows. */
export const NETWORK_HUB_CONNECTION_MOBILE_COLUMNS = 3;
export const NETWORK_HUB_CONNECTION_MOBILE_ROWS = 2;
export const NETWORK_HUB_CONNECTION_MOBILE_PAGE_SIZE =
  NETWORK_HUB_CONNECTION_MOBILE_COLUMNS * NETWORK_HUB_CONNECTION_MOBILE_ROWS;

/** @deprecated Use {@link NETWORK_HUB_CONNECTION_MOBILE_COLUMNS}. */
export const NETWORK_HUB_CONNECTION_SCROLL_COLUMNS =
  NETWORK_HUB_CONNECTION_MOBILE_COLUMNS;
/** @deprecated Use {@link NETWORK_HUB_CONNECTION_MOBILE_ROWS}. */
export const NETWORK_HUB_CONNECTION_SCROLL_ROWS = NETWORK_HUB_CONNECTION_MOBILE_ROWS;
export const NETWORK_HUB_CONNECTION_PAGE_SIZE = NETWORK_HUB_CONNECTION_MOBILE_PAGE_SIZE;

/** @deprecated Use {@link NETWORK_HUB_CONNECTION_MOBILE_COLUMNS}. */
export const NETWORK_HUB_CONNECTION_NATIVE_COLUMNS =
  NETWORK_HUB_CONNECTION_MOBILE_COLUMNS;
/** @deprecated Use {@link NETWORK_HUB_CONNECTION_MOBILE_ROWS}. */
export const NETWORK_HUB_CONNECTION_NATIVE_ROWS = NETWORK_HUB_CONNECTION_MOBILE_ROWS;
export const NETWORK_HUB_CONNECTION_NATIVE_PAGE_SIZE =
  NETWORK_HUB_CONNECTION_MOBILE_PAGE_SIZE;

/** Your connections — desktop (≥820): 5 columns × 2 rows per page (chat-style avatar grid). */
export const NETWORK_HUB_CONNECTION_DESKTOP_COLUMNS = 5;
export const NETWORK_HUB_CONNECTION_DESKTOP_ROWS = 2;
export const NETWORK_HUB_CONNECTION_DESKTOP_PAGE_SIZE =
  NETWORK_HUB_CONNECTION_DESKTOP_COLUMNS * NETWORK_HUB_CONNECTION_DESKTOP_ROWS;

export type NetworkHubConnectionsLayout = {
  columns: number;
  rows: number;
  pageSize: number;
};

export type NetworkHubLayoutOptions = {
  /** iOS/Android — single-column hub grids. */
  nativeApp?: boolean;
};

/** Your connections grid: 5×2 on desktop (≥820), 3×2 on mobile. */
export function getNetworkHubConnectionsLayout(
  windowWidth: number,
  _options?: NetworkHubLayoutOptions,
): NetworkHubConnectionsLayout {
  if (windowWidth >= SPLIT_STACK_BREAKPOINT) {
    return {
      columns: NETWORK_HUB_CONNECTION_DESKTOP_COLUMNS,
      rows: NETWORK_HUB_CONNECTION_DESKTOP_ROWS,
      pageSize: NETWORK_HUB_CONNECTION_DESKTOP_PAGE_SIZE,
    };
  }
  return {
    columns: NETWORK_HUB_CONNECTION_MOBILE_COLUMNS,
    rows: NETWORK_HUB_CONNECTION_MOBILE_ROWS,
    pageSize: NETWORK_HUB_CONNECTION_MOBILE_PAGE_SIZE,
  };
}

/** Grow / recommendations — stacked mobile web: 1 per row × 6 rows. */
export const NETWORK_HUB_SPLIT_GRID_COLUMNS = 1;
export const NETWORK_HUB_SPLIT_GRID_ROWS = 6;
export const NETWORK_HUB_SPLIT_SLOT_LIMIT =
  NETWORK_HUB_SPLIT_GRID_COLUMNS * NETWORK_HUB_SPLIT_GRID_ROWS;

/** Grow / recommendations — native app stacked: 1 per row × 6 rows. */
export const NETWORK_HUB_SPLIT_NATIVE_COLUMNS = 1;
export const NETWORK_HUB_SPLIT_NATIVE_ROWS = 6;
export const NETWORK_HUB_SPLIT_NATIVE_SLOT_LIMIT =
  NETWORK_HUB_SPLIT_NATIVE_COLUMNS * NETWORK_HUB_SPLIT_NATIVE_ROWS;

/** Grow / recommendations — desktop split panes: 1 per row × 5 rows. */
export const NETWORK_HUB_SPLIT_DESKTOP_COLUMNS = 1;
export const NETWORK_HUB_SPLIT_DESKTOP_ROWS = 5;
export const NETWORK_HUB_SPLIT_DESKTOP_SLOT_LIMIT =
  NETWORK_HUB_SPLIT_DESKTOP_COLUMNS * NETWORK_HUB_SPLIT_DESKTOP_ROWS;

export type NetworkHubSplitPaneLayout = {
  columns: number;
  rows: number;
  slotLimit: number;
  compact: boolean;
};

/** Layout for Grow / People you may know panes from viewport width. */
export function getNetworkHubSplitPaneLayout(
  windowWidth: number,
  options?: NetworkHubLayoutOptions,
): NetworkHubSplitPaneLayout {
  if (isNetworkHubSplitStacked(windowWidth)) {
    if (options?.nativeApp) {
      return {
        columns: NETWORK_HUB_SPLIT_NATIVE_COLUMNS,
        rows: NETWORK_HUB_SPLIT_NATIVE_ROWS,
        slotLimit: NETWORK_HUB_SPLIT_NATIVE_SLOT_LIMIT,
        compact: true,
      };
    }
    return {
      columns: NETWORK_HUB_SPLIT_GRID_COLUMNS,
      rows: NETWORK_HUB_SPLIT_GRID_ROWS,
      slotLimit: NETWORK_HUB_SPLIT_SLOT_LIMIT,
      compact: true,
    };
  }
  return {
    columns: NETWORK_HUB_SPLIT_DESKTOP_COLUMNS,
    rows: NETWORK_HUB_SPLIT_DESKTOP_ROWS,
    slotLimit: NETWORK_HUB_SPLIT_DESKTOP_SLOT_LIMIT,
    compact: false,
  };
}

/** Stacked mobile list view — max cards per Grow / People you may know section. */
export const NETWORK_HUB_SPLIT_LIST_LIMIT = 8;

/** Min height for pane section headers — left spacer matches right title block. */
export const NETWORK_HUB_PANE_HEADER_MIN_HEIGHT = 40;

/** Full-width discover search grid (non-split). */
export function networkHubGridColumnCount(
  windowWidth: number,
  options?: NetworkHubLayoutOptions,
): number {
  if (options?.nativeApp && windowWidth < SPLIT_STACK_BREAKPOINT) return 1;
  if (windowWidth < 480) return 1;
  if (windowWidth < SPLIT_STACK_BREAKPOINT) return 1;
  return NETWORK_HUB_GRID_COLUMNS;
}

export function hubScrollCardWidth(
  windowWidth: number,
  visibleColumns = NETWORK_HUB_CONNECTION_SCROLL_COLUMNS,
): number {
  const pad = NETWORK_HUB_GRID_ROW_PADDING_H * 2;
  const gaps = Math.max(0, visibleColumns - 1) * NETWORK_HUB_GRID_GAP_PX;
  const inner = Math.max(0, windowWidth - pad);
  return Math.max(108, Math.floor((inner - gaps) / visibleColumns));
}

export const SPLIT_STACK_BREAKPOINT = 820;

/** Card width for one card inside a split pane (2-up row). Full width when panes stack. */
export function hubSplitPaneCardWidth(
  windowWidth: number,
  stacked = windowWidth < SPLIT_STACK_BREAKPOINT,
): number {
  const pad = NETWORK_HUB_GRID_ROW_PADDING_H * 2;
  const gaps =
    Math.max(0, NETWORK_HUB_SPLIT_GRID_COLUMNS - 1) * NETWORK_HUB_GRID_GAP_PX;

  if (stacked) {
    const inner = Math.max(0, windowWidth - pad);
    return Math.max(
      96,
      Math.floor((inner - gaps) / NETWORK_HUB_SPLIT_GRID_COLUMNS),
    );
  }

  const splitGap = NETWORK_HUB_SPLIT_COLUMN_GAP_PX;
  const inner = Math.max(0, windowWidth - pad - splitGap);
  const paneInner = inner / 2;
  return Math.max(
    96,
    Math.floor((paneInner - gaps) / NETWORK_HUB_SPLIT_GRID_COLUMNS),
  );
}

export function isNetworkHubSplitStacked(windowWidth: number): boolean {
  return windowWidth < SPLIT_STACK_BREAKPOINT;
}

/** Grow / discover recommendation grid column count (4-across on desktop). */
export function getNetworkHubGrowGridColumns(windowWidth: number): number {
  if (windowWidth < 480) return 1;
  if (windowWidth < 640) return 2;
  if (windowWidth < SPLIT_STACK_BREAKPOINT) return 2;
  if (windowWidth < 1100) return 3;
  return NETWORK_HUB_GROW_GRID_COLUMNS;
}

export function chunkIntoTwoRowColumns<T>(items: T[]): T[][] {
  const columns: T[][] = [];
  for (let i = 0; i < items.length; i += NETWORK_HUB_CONNECTION_SCROLL_ROWS) {
    columns.push(items.slice(i, i + NETWORK_HUB_CONNECTION_SCROLL_ROWS));
  }
  return columns;
}
