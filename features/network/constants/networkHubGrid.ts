/** Shared hub layout for Network tab (connections + discover). */
export const NETWORK_HUB_GRID_COLUMNS = 3;
export const NETWORK_HUB_GRID_GAP_PX = 8;
export const NETWORK_HUB_GRID_ROW_PADDING_H = 22;
/** Horizontal space between Grow your network and People you may know (desktop split). */
export const NETWORK_HUB_SPLIT_COLUMN_GAP_PX = 24;

/** Your connections — mobile: 2 columns × 3 rows per page. */
export const NETWORK_HUB_CONNECTION_SCROLL_COLUMNS = 2;
export const NETWORK_HUB_CONNECTION_SCROLL_ROWS = 3;
export const NETWORK_HUB_CONNECTION_PAGE_SIZE =
  NETWORK_HUB_CONNECTION_SCROLL_COLUMNS * NETWORK_HUB_CONNECTION_SCROLL_ROWS;

/** Your connections — desktop: 3 columns × 2 rows per page. */
export const NETWORK_HUB_CONNECTION_DESKTOP_COLUMNS = 3;
export const NETWORK_HUB_CONNECTION_DESKTOP_ROWS = 2;
export const NETWORK_HUB_CONNECTION_DESKTOP_PAGE_SIZE =
  NETWORK_HUB_CONNECTION_DESKTOP_COLUMNS * NETWORK_HUB_CONNECTION_DESKTOP_ROWS;

export type NetworkHubConnectionsLayout = {
  columns: number;
  rows: number;
  pageSize: number;
};

/** Your connections grid from viewport (desktop 3-up, mobile 2-up). */
export function getNetworkHubConnectionsLayout(
  windowWidth: number,
): NetworkHubConnectionsLayout {
  if (windowWidth >= SPLIT_STACK_BREAKPOINT) {
    return {
      columns: NETWORK_HUB_CONNECTION_DESKTOP_COLUMNS,
      rows: NETWORK_HUB_CONNECTION_DESKTOP_ROWS,
      pageSize: NETWORK_HUB_CONNECTION_DESKTOP_PAGE_SIZE,
    };
  }
  return {
    columns: NETWORK_HUB_CONNECTION_SCROLL_COLUMNS,
    rows: NETWORK_HUB_CONNECTION_SCROLL_ROWS,
    pageSize: NETWORK_HUB_CONNECTION_PAGE_SIZE,
  };
}

/** Grow / recommendations — stacked mobile: 2 per row × 3 rows. */
export const NETWORK_HUB_SPLIT_GRID_COLUMNS = 2;
export const NETWORK_HUB_SPLIT_GRID_ROWS = 3;
export const NETWORK_HUB_SPLIT_SLOT_LIMIT =
  NETWORK_HUB_SPLIT_GRID_COLUMNS * NETWORK_HUB_SPLIT_GRID_ROWS;

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
): NetworkHubSplitPaneLayout {
  if (isNetworkHubSplitStacked(windowWidth)) {
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
export function networkHubGridColumnCount(windowWidth: number): number {
  if (windowWidth < 480) return 1;
  if (windowWidth < 820) return 2;
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

export function chunkIntoTwoRowColumns<T>(items: T[]): T[][] {
  const columns: T[][] = [];
  for (let i = 0; i < items.length; i += NETWORK_HUB_CONNECTION_SCROLL_ROWS) {
    columns.push(items.slice(i, i + NETWORK_HUB_CONNECTION_SCROLL_ROWS));
  }
  return columns;
}
