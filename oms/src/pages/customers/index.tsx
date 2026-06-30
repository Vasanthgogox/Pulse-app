import { useMemo, useState } from 'react';
import { type ColumnDef } from '@tanstack/react-table';
import { UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConsigneeTypeBadge } from '@/components/commerce/ConsigneeTypeBadge';
import { CreateCustomerSheet } from '@/components/commerce/CreateCustomerSheet';
import { CustomerDetailSheet } from '@/components/commerce/CustomerDetailSheet';
import { PageToolbar } from '@/components/commerce/PageToolbar';
import {
  CommerceDataTable,
  DataGridColumnHeader,
  MemberCell,
  NumericColumnHeader,
  RowActionsButton,
  commerceTableMeta,
} from '@/components/commerce/CommerceDataTable';
import { getConsigneeDisplayName, getConsigneeEntityType, getConsigneeSubtitle } from '@/lib/consignee';
import { useCommerce } from '@/context/CommerceProvider';
import type { Customer } from '@/types/commerce';
import { formatCurrency } from '@/lib/utils';

export function CustomersPage() {
  const { customers } = useCommerce();
  const [showCreate, setShowCreate] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const columns = useMemo<ColumnDef<Customer, unknown>[]>(() => [
    {
      id: 'member',
      accessorKey: 'name',
      header: ({ column }) => <DataGridColumnHeader column={column} title="Consignee" />,
      cell: ({ row }) => (
        <MemberCell
          avatar={getConsigneeDisplayName(row.original).slice(0, 2).toUpperCase()}
          title={getConsigneeDisplayName(row.original)}
          subtitle={getConsigneeSubtitle(row.original)}
        />
      ),
      meta: commerceTableMeta.primary,
    },
    {
      id: 'type',
      accessorFn: row => getConsigneeEntityType(row),
      header: ({ column }) => <DataGridColumnHeader column={column} title="Type" />,
      cell: ({ row }) => <ConsigneeTypeBadge consignee={row.original} />,
      meta: commerceTableMeta.status,
    },
    {
      id: 'gstin',
      accessorKey: 'gstin',
      header: ({ column }) => <DataGridColumnHeader column={column} title="GSTIN" />,
      cell: ({ row }) => (
        <span className="text-2sm text-muted-foreground font-mono">
          {row.original.gstin || '—'}
        </span>
      ),
      meta: commerceTableMeta.text,
    },
    {
      id: 'location',
      accessorFn: row => [row.shipping_address.city, row.shipping_address.state].filter(Boolean).join(', '),
      header: ({ column }) => <DataGridColumnHeader column={column} title="Location" />,
      cell: ({ row }) => (
        <span className="text-2sm text-muted-foreground">
          {[row.original.shipping_address.city, row.original.shipping_address.state].filter(Boolean).join(', ') || '—'}
        </span>
      ),
      meta: commerceTableMeta.text,
    },
    {
      id: 'orders',
      accessorKey: 'total_orders',
      header: ({ column }) => <NumericColumnHeader column={column} title="Orders" />,
      cell: ({ row }) => <span className="text-2sm">{row.original.total_orders ?? 0}</span>,
      meta: commerceTableMeta.numeric,
    },
    {
      id: 'spend',
      accessorKey: 'total_spend',
      header: ({ column }) => <NumericColumnHeader column={column} title="Spend" />,
      cell: ({ row }) => <span className="text-2sm font-medium">{formatCurrency(row.original.total_spend ?? 0)}</span>,
      meta: commerceTableMeta.numeric,
    },
    {
      id: 'actions',
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) => (
        <div className="flex justify-end">
          <RowActionsButton onClick={() => setSelectedId(row.original.id)} />
        </div>
      ),
      enableSorting: false,
      meta: commerceTableMeta.actions,
    },
  ], [setSelectedId]);

  return (
    <div className="container-fluid">
      <PageToolbar
        title="Consignees"
        breadcrumb={['Commerce', 'Consignees']}
        description="Order delivery recipients — individuals or businesses with GST and drop addresses."
        actions={
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <UserPlus className="size-3.5" /> Add consignee
          </Button>
        }
      />

      {customers.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center">
          <p className="font-medium text-sm">No consignees yet</p>
          <p className="text-2xs text-muted-foreground mt-1 mb-4">Add a delivery recipient to start creating sales orders.</p>
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <UserPlus className="size-3.5" /> Add first consignee
          </Button>
        </div>
      ) : (
        <CommerceDataTable
          data={customers}
          columns={columns}
          searchPlaceholder="Search consignees…"
          getSearchText={c => `${c.name} ${c.legal_name ?? ''} ${c.email} ${c.phone} ${c.gstin ?? ''} ${c.company ?? ''}`}
          statusFilters={[
            { label: 'Business', value: 'business', match: c => getConsigneeEntityType(c) === 'business' },
            { label: 'Individual', value: 'individual', match: c => getConsigneeEntityType(c) === 'individual' },
          ]}
          statusFilterLabel="Type"
          emptyMessage="No consignees match your search"
          onRowClick={c => setSelectedId(c.id)}
          toolbarEnd={
            <Button size="sm" className="h-8 text-2xs gap-1.5" onClick={() => setShowCreate(true)}>
              <UserPlus className="size-3.5" /> Add New
            </Button>
          }
        />
      )}

      <CreateCustomerSheet open={showCreate} onClose={() => setShowCreate(false)} />
      <CustomerDetailSheet
        customerId={selectedId}
        open={!!selectedId}
        onClose={() => setSelectedId(null)}
      />
    </div>
  );
}
