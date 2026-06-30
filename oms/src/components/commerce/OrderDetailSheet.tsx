import { useEffect, useState } from 'react';
import { EntityFlexSheet } from '@/components/commerce/EntityFlexSheet';
import { FormField, SpecRow, selectClass } from '@/components/commerce/FormField';
import { StatusDotBadge, type StatusDotTone } from '@/components/commerce/StatusDotBadge';
import { useCommerce } from '@/context/CommerceProvider';
import type { Order, OrderStatus } from '@/types/commerce';
import { cn, formatCurrency } from '@/lib/utils';

const ORDER_STATUS: Record<OrderStatus, { label: string; tone: StatusDotTone }> = {
  'Draft':                 { label: 'Draft', tone: 'muted' },
  'Pending Consolidation': { label: 'Pending', tone: 'warning' },
  'Planned':               { label: 'Planned', tone: 'info' },
  'Fulfilled':             { label: 'Fulfilled', tone: 'success' },
  'Cancelled':             { label: 'Cancelled', tone: 'danger' },
};

const STATUSES: OrderStatus[] = ['Draft', 'Pending Consolidation', 'Planned', 'Fulfilled', 'Cancelled'];

interface OrderDetailSheetProps {
  orderId: string | null;
  open:    boolean;
  onClose: () => void;
}

export function OrderDetailSheet({ orderId, open, onClose }: OrderDetailSheetProps) {
  const { orders, updateOrder, deleteOrder } = useCommerce();
  const order = orders.find(o => o.id === orderId) ?? null;

  const [editing, setEditing] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [status, setStatus] = useState<OrderStatus>('Pending Consolidation');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!order || editing) return;
    setStatus(order.status);
    setNotes(order.notes ?? '');
  }, [order, editing]);

  useEffect(() => {
    if (!open) { setEditing(false); setDeleteConfirm(false); }
  }, [open]);

  if (!order) return null;

  const statusMeta = ORDER_STATUS[order.status];
  const canDelete = order.status !== 'Fulfilled';

  function resetDraft() {
    setStatus(order!.status);
    setNotes(order!.notes ?? '');
  }

  function handleSave() {
    updateOrder(order!.id, { status, notes: notes.trim() || undefined });
    setEditing(false);
  }

  function handleDelete() {
    deleteOrder(order!.id);
    setDeleteConfirm(false);
    onClose();
  }

  return (
    <EntityFlexSheet
      open={open}
      entity={order}
      title="Order Details"
      editing={editing}
      canSave
      canDelete={canDelete}
      deleteConfirm={deleteConfirm}
      onClose={onClose}
      onEdit={() => setEditing(true)}
      onCancelEdit={() => { resetDraft(); setEditing(false); }}
      onSave={handleSave}
      onDelete={() => setDeleteConfirm(true)}
      onDeleteConfirm={handleDelete}
      onDeleteCancel={() => setDeleteConfirm(false)}
    >
      <div className="mb-4">
        <p className="font-mono font-bold text-sm">{order.order_number}</p>
        <p className="text-2xs text-muted-foreground mt-1">{order.customer_name}</p>
      </div>

      {editing ? (
        <div className="space-y-3">
          <label className="block">
            <span className="text-2sm font-medium">Status</span>
            <select value={status} onChange={e => setStatus(e.target.value as OrderStatus)} className={cn(selectClass, 'mt-1')}>
              {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <FormField label="Notes" value={notes} onChange={setNotes} placeholder="Optional notes" />
          <p className="text-2xs text-muted-foreground">
            Line items are managed at creation. Edit products via the Products catalog.
          </p>
        </div>
      ) : (
        <>
          <div className="divide-y divide-border border-y border-border text-2sm mb-4">
            <SpecRow label="Consignee">{order.customer_name}</SpecRow>
            <SpecRow label="Email">{order.customer_email || '—'}</SpecRow>
            <SpecRow label="Status">
              <StatusDotBadge label={statusMeta.label} tone={statusMeta.tone} />
            </SpecRow>
            <SpecRow label="Source">{order.source}</SpecRow>
            <SpecRow label="Weight">{order.total_weight_kg.toFixed(1)} kg</SpecRow>
            <SpecRow label="Items">{order.line_items.length}</SpecRow>
          </div>

          <div className="space-y-2">
            <p className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">Line items</p>
            {order.line_items.map(li => (
              <div key={li.id} className="flex justify-between gap-2 text-2sm py-1.5 border-b border-border/60 last:border-0">
                <div className="min-w-0">
                  <p className="font-medium truncate">{li.product_name}</p>
                  <p className="text-3xs text-muted-foreground">{li.sku} · qty {li.qty}</p>
                </div>
                <span className="font-medium tabular-nums shrink-0">{formatCurrency(li.total)}</span>
              </div>
            ))}
          </div>

          <p className="text-xl font-bold text-right mt-4 tabular-nums text-[var(--pulse-hero-blue)]">
            {formatCurrency(order.total_amount)}
          </p>
        </>
      )}
    </EntityFlexSheet>
  );
}
