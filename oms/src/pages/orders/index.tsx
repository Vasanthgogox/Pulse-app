import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { type ColumnDef } from '@tanstack/react-table';
import { GitMerge, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CreateOrderSheet } from '@/components/commerce/CreateOrderSheet';
import { OrderDetailSheet } from '@/components/commerce/OrderDetailSheet';
import { OrderSummaryPanel, type OrderSummaryMode } from '@/components/commerce/OrderSummaryPanel';
import { PageToolbar } from '@/components/commerce/PageToolbar';
import {
  CommerceDataTable,
  DataGridColumnHeader,
  MemberCell,
  NumericColumnHeader,
  RowActionsButton,
  commerceTableMeta,
} from '@/components/commerce/CommerceDataTable';
import { StatusDotBadge, type StatusDotTone } from '@/components/commerce/StatusDotBadge';
import { useCommerce } from '@/context/CommerceProvider';
import type { Order, OrderStatus } from '@/types/commerce';
import { formatCurrency } from '@/lib/utils';

const ORDER_STATUS: Record<OrderStatus, { label: string; tone: StatusDotTone }> = {
  'Draft':                 { label: 'Draft', tone: 'muted' },
  'Pending Consolidation': { label: 'Pending', tone: 'warning' },
  'Planned':               { label: 'Planned', tone: 'info' },
  'Fulfilled':             { label: 'Fulfilled', tone: 'success' },
  'Cancelled':             { label: 'Cancelled', tone: 'danger' },
};

const VEHICLE_CAPACITY_KG = 750;

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return iso;
  }
}

export function OrdersPage() {
  const {
    orders,
    customers,
    products,
    warehouses,
    selectedOrderIds,
    setSelectedOrderIds,
  } = useCommerce();
  const [showCreate, setShowCreate] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  const pending = useMemo(
    () => orders.filter(o => o.status === 'Pending Consolidation'),
    [orders],
  );
  const selectedOrders = useMemo(
    () => orders.filter(o => selectedOrderIds.includes(o.id)),
    [orders, selectedOrderIds],
  );

  const summaryMode: OrderSummaryMode = selectedOrders.length > 0
    ? 'selection'
    : pending.length > 0
      ? 'pending'
      : 'browse';

  const previewOrders = selectedOrders.length > 0
    ? selectedOrders
    : pending.length > 0
      ? pending
      : [];

  const summaryOrders = previewOrders;
  const subtotal = summaryOrders.reduce((s, o) => s + o.total_amount, 0);
  const totalWeight = summaryOrders.reduce((s, o) => s + o.total_weight_kg, 0);
  const planEligibleSelected = selectedOrders.filter(o => o.status === 'Pending Consolidation').length;

  const summaryLabel = selectedOrders.length > 0
    ? `${selectedOrders.length} selected · ${planEligibleSelected} ready to plan`
    : pending.length > 0
      ? `${pending.length} order${pending.length !== 1 ? 's' : ''} ready to plan`
      : `${orders.length} orders in pipeline · none pending`;

  const canContinue = selectedOrders.length > 0
    ? planEligibleSelected > 0
    : pending.length > 0;

  const canCreate = customers.length > 0 && products.length > 0 && warehouses.length > 0;

  const columns = useMemo<ColumnDef<Order, unknown>[]>(() => [
    {
      id: 'order',
      accessorKey: 'order_number',
      header: ({ column }) => <DataGridColumnHeader column={column} title="Order" />,
      cell: ({ row }) => (
        <MemberCell
          avatar={row.original.order_number.slice(-2)}
          title={row.original.order_number}
          subtitle={`${row.original.line_items.length} line item${row.original.line_items.length !== 1 ? 's' : ''}`}
        />
      ),
      meta: commerceTableMeta.primary,
    },
    {
      id: 'customer',
      accessorKey: 'customer_name',
      header: ({ column }) => <DataGridColumnHeader column={column} title="Consignee" />,
      cell: ({ row }) => (
        <div className="min-w-0 py-0.5">
          <p className="text-2sm font-medium leading-tight truncate">{row.original.customer_name}</p>
          <p className="text-3xs leading-tight text-muted-foreground truncate mt-0.5">{row.original.customer_email}</p>
        </div>
      ),
      meta: { ...commerceTableMeta.text, headerClassName: 'min-w-[9rem]' },
    },
    {
      id: 'status',
      accessorKey: 'status',
      header: ({ column }) => <DataGridColumnHeader column={column} title="Status" />,
      cell: ({ row }) => {
        const s = ORDER_STATUS[row.original.status];
        return <StatusDotBadge label={s.label} tone={s.tone} />;
      },
      meta: commerceTableMeta.status,
    },
    {
      id: 'amount',
      accessorKey: 'total_amount',
      header: ({ column }) => <NumericColumnHeader column={column} title="Amount" />,
      cell: ({ row }) => <span className="font-medium text-2sm">{formatCurrency(row.original.total_amount)}</span>,
      meta: commerceTableMeta.numeric,
    },
    {
      id: 'weight',
      accessorKey: 'total_weight_kg',
      header: ({ column }) => <NumericColumnHeader column={column} title="Weight" />,
      cell: ({ row }) => <span className="text-2sm text-muted-foreground">{row.original.total_weight_kg.toFixed(1)} kg</span>,
      meta: commerceTableMeta.numeric,
    },
    {
      id: 'source',
      accessorKey: 'source',
      header: ({ column }) => <DataGridColumnHeader column={column} title="Source" />,
      cell: ({ row }) => <span className="text-2xs text-muted-foreground">{row.original.source}</span>,
      meta: commerceTableMeta.text,
    },
    {
      id: 'created',
      accessorKey: 'created_at',
      header: ({ column }) => <DataGridColumnHeader column={column} title="Created" />,
      cell: ({ row }) => <span className="text-2xs text-muted-foreground whitespace-nowrap">{formatDate(row.original.created_at)}</span>,
      meta: commerceTableMeta.text,
    },
    {
      id: 'actions',
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) => (
        <div className="flex justify-end">
          <RowActionsButton onClick={() => setSelectedOrderId(row.original.id)} />
        </div>
      ),
      enableSorting: false,
      meta: commerceTableMeta.actions,
    },
  ], []);

  return (
    <div className="container-fluid">
      <PageToolbar
        title="Sales Orders"
        breadcrumb={['Commerce', 'Orders']}
        description="All order sources produce the same canonical SalesOrder — manual, Shopify, API, CSV, EDI."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowCreate(true)} disabled={!canCreate}>
              <Plus className="size-3.5" /> Create order
            </Button>
            <Button size="sm" asChild>
              <Link to="/execution-plans/build"><GitMerge className="size-3.5" /> Build Plan</Link>
            </Button>
          </div>
        }
      />

      {!canCreate && (
        <div className="rounded-lg border border-dashed border-border p-8 text-center mb-4">
          <p className="text-2sm text-muted-foreground">Complete onboarding — warehouse, product, and consignee — before creating orders.</p>
          <Link to="/onboarding" className="text-2sm text-primary font-medium mt-2 inline-block">Resume setup →</Link>
        </div>
      )}

      <div className="pulse-page-split">
        <div className="min-w-0 self-start w-full">
          <CommerceDataTable
            data={orders}
            columns={columns}
            fitContent
            searchPlaceholder="Search orders…"
            getSearchText={o => `${o.order_number} ${o.customer_name} ${o.customer_email} ${o.status}`}
            getRowId={o => o.id}
            selectedRowIds={selectedOrderIds}
            onSelectedRowIdsChange={setSelectedOrderIds}
            statusFilters={[
              { label: 'Pending', value: 'pending', match: o => o.status === 'Pending Consolidation' },
              { label: 'Planned', value: 'planned', match: o => o.status === 'Planned' },
              { label: 'Fulfilled', value: 'fulfilled', match: o => o.status === 'Fulfilled' },
              { label: 'Draft', value: 'draft', match: o => o.status === 'Draft' },
            ]}
            emptyMessage="No sales orders yet"
            onRowClick={o => setSelectedOrderId(o.id)}
          />
        </div>

        <div className="min-w-0 self-start w-full xl:sticky xl:top-[calc(var(--header-total-height)+0.75rem)]">
          <OrderSummaryPanel
            title="Order Summary"
            mode={summaryMode}
            destination={summaryLabel}
            previewOrders={previewOrders}
            totalWeightKg={totalWeight}
            vehicleCapacityKg={VEHICLE_CAPACITY_KG}
            lines={[
              { label: 'Subtotal', amount: subtotal },
              { label: 'Weight', amount: totalWeight, suffix: 'kg', formatAsCurrency: false },
              { label: 'Shipping', amount: 0 },
              { label: 'Tax', amount: 0 },
            ]}
            total={subtotal}
            hint={
              selectedOrders.length > 0 && planEligibleSelected < selectedOrders.length
                ? `${selectedOrders.length - planEligibleSelected} selected order(s) are not pending consolidation`
                : undefined
            }
            footer={
              canContinue ? (
                <Button className="w-full" size="sm" asChild>
                  <Link to="/execution-plans/build">Continue to Plan Builder →</Link>
                </Button>
              ) : (
                <Button className="w-full" size="sm" disabled>
                  Continue to Plan Builder →
                </Button>
              )
            }
          />
        </div>
      </div>

      <CreateOrderSheet open={showCreate} onClose={() => setShowCreate(false)} />
      <OrderDetailSheet
        orderId={selectedOrderId}
        open={!!selectedOrderId}
        onClose={() => setSelectedOrderId(null)}
      />
    </div>
  );
}
