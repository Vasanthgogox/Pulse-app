import { useMemo, useState, useCallback, type ReactNode } from 'react';
import {
  type Column,
  type ColumnDef,
  type SortingState,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { Columns3, MoreHorizontal, Search, SlidersHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { DataGrid, DataGridContainer } from '@/components/ui/data-grid';
import { DataGridColumnHeader } from '@/components/ui/data-grid-column-header';
import { DataGridPagination } from '@/components/ui/data-grid-pagination';
import {
  DataGridTable,
  DataGridTableRowSelect,
  DataGridTableRowSelectAll,
} from '@/components/ui/data-grid-table';
import { commerceTableMeta, SELECT_COLUMN_SIZE } from '@/components/commerce/commerce-table-meta';

export interface StatusFilterOption<T> {
  label: string;
  value: string;
  match: (row: T) => boolean;
}

export interface CommerceDataTableProps<T extends object> {
  data:                T[];
  columns:             ColumnDef<T, unknown>[];
  searchPlaceholder?:  string;
  getSearchText?:      (row: T) => string;
  statusFilters?:      StatusFilterOption<T>[];
  statusFilterLabel?:  string;
  emptyMessage?:       string;
  onRowClick?:         (row: T) => void;
  toolbarStart?:       ReactNode;
  toolbarEnd?:         ReactNode;
  pageSize?:           number;
  className?:          string;
  enableSelection?:    boolean;
  getRowId?:           (row: T) => string;
  selectedRowIds?:     string[];
  onSelectedRowIdsChange?: (ids: string[]) => void;
  /** Shrink table body to row count — no empty filler space below rows */
  fitContent?:         boolean;
}

export function CommerceDataTable<T extends object>({
  data,
  columns,
  searchPlaceholder = 'Search…',
  getSearchText,
  statusFilters,
  statusFilterLabel = 'Status',
  emptyMessage = 'No records found',
  onRowClick,
  toolbarStart,
  toolbarEnd,
  pageSize = 10,
  className,
  enableSelection = true,
  getRowId,
  selectedRowIds,
  onSelectedRowIdsChange,
  fitContent = false,
}: CommerceDataTableProps<T>) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sorting, setSorting] = useState<SortingState>([]);
  const [internalSelection, setInternalSelection] = useState({});
  const isSelectionControlled = selectedRowIds !== undefined && onSelectedRowIdsChange !== undefined;

  const rowSelection = useMemo(() => {
    if (!isSelectionControlled) return internalSelection;
    return Object.fromEntries(selectedRowIds.map(id => [id, true]));
  }, [isSelectionControlled, internalSelection, selectedRowIds]);

  const onRowSelectionChange = useCallback((updater: typeof internalSelection | ((prev: typeof internalSelection) => typeof internalSelection)) => {
    if (isSelectionControlled) {
      const prev = Object.fromEntries(selectedRowIds.map(id => [id, true]));
      const next = typeof updater === 'function' ? updater(prev) : updater;
      onSelectedRowIdsChange(Object.keys(next).filter(id => next[id]));
      return;
    }
    setInternalSelection(updater);
  }, [isSelectionControlled, onSelectedRowIdsChange, selectedRowIds]);

  const filteredData = useMemo(() => {
    let rows = data;
    if (statusFilter !== 'all' && statusFilters?.length) {
      const opt = statusFilters.find(f => f.value === statusFilter);
      if (opt) rows = rows.filter(opt.match);
    }
    const q = search.trim().toLowerCase();
    if (q && getSearchText) {
      rows = rows.filter(row => getSearchText(row).toLowerCase().includes(q));
    }
    return rows;
  }, [data, search, statusFilter, statusFilters, getSearchText]);

  const tableColumns = useMemo(() => {
    if (!enableSelection) return columns;
    const selectCol: ColumnDef<T, unknown> = {
      id:            'select',
      size:          SELECT_COLUMN_SIZE,
      minSize:       SELECT_COLUMN_SIZE,
      maxSize:       SELECT_COLUMN_SIZE,
      enableResizing: false,
      enableSorting: false,
      header: () => (
        <div className="flex items-center justify-center w-full">
          <DataGridTableRowSelectAll size="sm" />
        </div>
      ),
      cell: ({ row }) => (
        <div className="flex items-center justify-center w-full">
          <DataGridTableRowSelect row={row} size="sm" />
        </div>
      ),
      meta: commerceTableMeta.select,
    };
    return [selectCol, ...columns];
  }, [columns, enableSelection]);

  const table = useReactTable({
    data:              filteredData,
    columns:           tableColumns,
    state:             { sorting, rowSelection },
    onSortingChange:   setSorting,
    onRowSelectionChange,
    getCoreRowModel:   getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    enableRowSelection: enableSelection,
    getRowId:          getRowId ? row => getRowId(row) : undefined,
    defaultColumn:     { minSize: 64, size: 128 },
    initialState:      { pagination: { pageSize } },
  });

  return (
    <div className={cn('space-y-2.5', className)}>
      <div className="flex flex-wrap items-center gap-2 min-h-8">
        {toolbarStart}
        <div className="relative min-w-[12rem] flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={searchPlaceholder}
            className="h-8 w-full rounded-md border border-border bg-card pl-8 pr-3 text-2sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        {statusFilters && statusFilters.length > 0 && (
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="h-8 rounded-md border border-border bg-card px-2.5 text-2sm focus:outline-none cursor-pointer"
          >
            <option value="all">{statusFilterLabel}</option>
            {statusFilters.map(f => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
        )}
        <div className="flex items-center gap-1.5 ms-auto">
          <Button variant="outline" size="sm" className="h-8 text-2xs gap-1.5 px-2.5">
            <SlidersHorizontal className="size-3.5 shrink-0" /> Filters
          </Button>
          <Button variant="outline" size="sm" className="h-8 text-2xs gap-1.5 px-2.5">
            <Columns3 className="size-3.5 shrink-0" /> Columns
          </Button>
          {toolbarEnd}
        </div>
      </div>

      <DataGrid
        table={table}
        recordCount={filteredData.length}
        emptyMessage={emptyMessage}
        onRowClick={onRowClick}
        tableLayout={{
          dense:            true,
          rowBorder:        true,
          headerBackground: true,
          headerBorder:     true,
          width:            'auto',
        }}
        tableClassNames={{
          base:      cn('commerce-data-table w-full min-w-full text-2sm', fitContent && 'commerce-data-table--fit'),
          headerRow: 'h-9',
          bodyRow:   fitContent ? '' : 'h-11',
          edgeCell:  'first:ps-3 last:pe-3',
        }}
      >
        <DataGridContainer className="pulse-card overflow-hidden h-auto">
          <div className="overflow-x-auto shrink-0">
            <DataGridTable />
          </div>
          <div className="border-t border-border px-3 py-1 min-h-10 flex items-center shrink-0">
            <DataGridPagination sizes={[5, 10, 25, 50]} className="w-full py-0" />
          </div>
        </DataGridContainer>
      </DataGrid>
    </div>
  );
}

export { DataGridColumnHeader };

export function NumericColumnHeader<TData>({
  column,
  title,
}: {
  column: Column<TData, unknown>;
  title:  string;
}) {
  return (
    <div className="flex w-full justify-end">
      <DataGridColumnHeader column={column} title={title} />
    </div>
  );
}

export function RowActionsButton({ onClick }: { onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={e => { e.stopPropagation(); onClick?.(); }}
      className="inline-flex size-7 items-center justify-center rounded-md hover:bg-muted transition-colors"
    >
      <MoreHorizontal className="size-4 text-muted-foreground" />
    </button>
  );
}

export function MemberCell({
  avatar,
  title,
  subtitle,
}: {
  avatar:    ReactNode;
  title:     string;
  subtitle?: string;
}) {
  return (
    <div className="flex items-center gap-2.5 min-w-0 py-0.5">
      <div className="size-8 shrink-0 rounded-md overflow-hidden bg-[var(--pulse-brand-soft)] flex items-center justify-center text-2xs font-bold text-[var(--pulse-hero-blue)]">
        {avatar}
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-medium text-2sm leading-tight text-foreground truncate">{title}</p>
        {subtitle && (
          <p className="text-3xs leading-tight text-muted-foreground truncate mt-0.5">{subtitle}</p>
        )}
      </div>
    </div>
  );
}

export { commerceTableMeta };
