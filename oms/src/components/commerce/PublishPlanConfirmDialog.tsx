import { useEffect, useState } from 'react';
import { IndianRupee } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/commerce/FormField';
import { formatCurrency } from '@/lib/utils';
import { parseSupplierTargetInr } from '@/lib/supplier-target';

export function PublishPlanConfirmDialog({
  open,
  salesInvoiceInr,
  orderCount,
  publishing,
  onClose,
  onConfirm,
}: {
  open: boolean;
  salesInvoiceInr: number;
  orderCount: number;
  publishing: boolean;
  onClose: () => void;
  onConfirm: (supplierTargetInr: number) => void;
}) {
  const [raw, setRaw] = useState('');
  const [error, setError] = useState<string | null>(null);
  const target = parseSupplierTargetInr(raw);

  useEffect(() => {
    if (!open) return;
    setRaw('');
    setError(null);
  }, [open]);

  if (!open) return null;

  function handleConfirm() {
    if (!raw.trim()) {
      onConfirm(0);
      return;
    }
    const parsed = parseSupplierTargetInr(raw);
    if (parsed == null) {
      setError('Enter a valid supplier target, or leave it blank until Share for Bidding.');
      return;
    }
    onConfirm(parsed);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="Close"
        onClick={publishing ? undefined : onClose}
      />
      <div className="relative w-full max-w-md rounded-xl border border-border bg-card shadow-lg p-5 space-y-4">
        <div className="flex items-start gap-2.5">
          <div className="size-9 rounded-lg bg-[var(--pulse-brand-soft)] flex items-center justify-center shrink-0">
            <IndianRupee className="size-4 text-[var(--pulse-hero-blue)]" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">Convert to indent</h2>
            <p className="text-2xs text-muted-foreground mt-1">
              Creates a draft indent from this plan. It is not shared to Operations or to bidding yet.
              Supplier target is optional until Share for Bidding.
            </p>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-muted/30 px-3 py-2.5 space-y-1">
          <p className="text-3xs font-semibold uppercase tracking-wide text-muted-foreground">Sales invoice</p>
          <p className="text-sm font-semibold tabular-nums">{formatCurrency(salesInvoiceInr)}</p>
          <p className="text-3xs text-muted-foreground">
            {orderCount} {orderCount === 1 ? 'order' : 'orders'} · commercial value only · not freight
          </p>
        </div>

        <FormField
          label="Supplier target (₹)"
          value={raw}
          onChange={(v) => {
            setRaw(v);
            setError(null);
          }}
          placeholder="Optional until Share for Bidding"
          type="text"
        />
        {target != null && (
          <p className="text-2xs text-muted-foreground -mt-2">Market will show {formatCurrency(target)} as the target rate.</p>
        )}
        {error && <p className="text-2xs text-destructive">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" size="sm" disabled={publishing} onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" size="sm" disabled={publishing} onClick={handleConfirm}>
            {publishing ? 'Converting…' : 'Convert to Indent'}
          </Button>
        </div>
      </div>
    </div>
  );
}
