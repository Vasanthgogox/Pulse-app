import { useEffect, useRef, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EntityFlexSheet } from '@/components/commerce/EntityFlexSheet';
import { FormField, SpecRow, selectClass } from '@/components/commerce/FormField';
import { StatusDotBadge, type StatusDotTone } from '@/components/commerce/StatusDotBadge';
import { useCommerce } from '@/context/CommerceProvider';
import { useOrganization } from '@/context/OrganizationProvider';
import { useUserProfile } from '@/hooks/useUserProfile';
import { coreIndentUrl } from '@/lib/core-navigation';
import { publishIndentForOrder } from '@/lib/orchestration/publish-indent';
import type { OrderStatus } from '@/types/commerce';
import { IndentService, verifyPublishIndentAcceptance } from '@pulse-platform/index';
import type { PublishIndentResult } from '@pulse-platform/index';
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
  const { orders, updateOrder, deleteOrder, refreshOrders } = useCommerce();
  const org = useOrganization();
  const { user } = useUserProfile();
  const order = orders.find(o => o.id === orderId) ?? null;

  const [editing, setEditing] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [status, setStatus] = useState<OrderStatus>('Pending Consolidation');
  const [notes, setNotes] = useState('');
  const [publishing, setPublishing] = useState(false);
  const publishingRef = useRef(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [linkedIndentId, setLinkedIndentId] = useState<string | null>(null);
  const [publishTrace, setPublishTrace] = useState<{
    result: PublishIndentResult;
    publishAttempt: number;
    eventOk: boolean;
    eventErrors: string[];
  } | null>(null);
  const publishAttemptRef = useRef(0);

  useEffect(() => {
    if (!order || editing) return;
    setStatus(order.status);
    setNotes(order.notes ?? '');
  }, [order, editing]);

  useEffect(() => {
    const workspaceId = org.platformOrganization?.id;
    if (!order || order.status !== 'Planned' || !workspaceId) {
      setLinkedIndentId(null);
      return;
    }

    let cancelled = false;
    void IndentService.findBySalesOrderId(workspaceId, order.id).then((indent) => {
      if (!cancelled) setLinkedIndentId(indent?.id ?? null);
    });

    return () => {
      cancelled = true;
    };
  }, [order?.id, order?.status, org.platformOrganization?.id]);

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

  async function handlePublishIndent() {
    const workspaceId = org.platformOrganization?.id;
    const requestedBy = user?.id;
    if (!workspaceId || !requestedBy || publishingRef.current) return;

    publishingRef.current = true;
    setPublishing(true);
    setPublishError(null);
    try {
      const result = await publishIndentForOrder(order!.id, { workspaceId, requestedBy });
      publishAttemptRef.current += 1;
      const verification = verifyPublishIndentAcceptance(result.correlationId, {
        workspaceId,
        orderId: result.orderId,
        indentId: result.indentId,
      });
      const isRepublish = publishAttemptRef.current > 1;
      setPublishTrace({
        result,
        publishAttempt: publishAttemptRef.current,
        eventOk: isRepublish ? verification.events.length === 0 : verification.ok,
        eventErrors: isRepublish
          ? verification.events.length > 0
            ? [`Republish emitted ${verification.events.length} unexpected event(s)`]
            : []
          : verification.errors,
      });
      setLinkedIndentId(result.indentId);
      await refreshOrders();
    } catch (e) {
      setPublishError(e instanceof Error ? e.message : 'Failed to publish indent');
    } finally {
      publishingRef.current = false;
      setPublishing(false);
    }
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
            {org.platformOrganization?.id && (
              <SpecRow label="Order ID">
                <span className="font-mono text-3xs break-all">{order.id}</span>
              </SpecRow>
            )}
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

          {(order.status === 'Pending Consolidation' || order.status === 'Planned') && (
            <div className="mt-4 space-y-2">
              <Button
                className="w-full"
                disabled={publishing || !org.platformOrganization?.id || !user?.id}
                onClick={() => void handlePublishIndent()}
              >
                {publishing
                  ? 'Publishing…'
                  : order.status === 'Planned'
                    ? 'Republish (idempotency check)'
                    : 'Publish to execution'}
              </Button>
              {publishError && (
                <p className="text-2xs text-destructive">{publishError}</p>
              )}
            </div>
          )}

          {(order.status === 'Planned' || publishTrace) && (
            <div className="mt-4 space-y-3 rounded-lg border border-border bg-muted/20 p-3">
              <p className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
                Execution lineage
              </p>
              {org.platformOrganization?.id && (
                <SpecRow label="Organization">
                  <span className="font-mono text-3xs break-all">{org.platformOrganization.id}</span>
                </SpecRow>
              )}
              {linkedIndentId && (
                <SpecRow label="Indent ID">
                  <span className="font-mono text-3xs break-all">{linkedIndentId}</span>
                </SpecRow>
              )}
              {publishTrace && (
                <>
                  <SpecRow label="Publish #">{String(publishTrace.publishAttempt)}</SpecRow>
                  <SpecRow label="correlationId">
                    <span className="font-mono text-3xs break-all">{publishTrace.result.correlationId}</span>
                  </SpecRow>
                  <SpecRow label="Events">
                    <span className={publishTrace.eventOk ? 'text-emerald-600' : 'text-destructive'}>
                      {publishTrace.publishAttempt === 1
                        ? (publishTrace.eventOk ? '2 events · payloads OK' : publishTrace.eventErrors.join('; '))
                        : (publishTrace.eventOk ? '0 events (idempotent)' : publishTrace.eventErrors.join('; '))}
                    </span>
                  </SpecRow>
                </>
              )}
              {linkedIndentId && (
                <Button variant="outline" className="w-full gap-2" asChild>
                  <a href={coreIndentUrl(linkedIndentId)} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="size-4" />
                    Open indent in Core
                  </a>
                </Button>
              )}
            </div>
          )}
        </>
      )}
    </EntityFlexSheet>
  );
}
