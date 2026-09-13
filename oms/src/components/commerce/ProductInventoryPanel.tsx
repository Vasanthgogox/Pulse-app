import { useEffect, useState } from 'react';
import { Boxes } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/commerce/FormField';
import { StatusDotBadge } from '@/components/commerce/StatusDotBadge';
import { useOrganization } from '@/context/OrganizationProvider';
import type { Product } from '@/types/commerce';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

function parseQty(value: string): number {
  return Math.max(0, parseInt(value, 10) || 0);
}

export function ProductInventoryPanel({ product }: { product: Product }) {
  const org = useOrganization();
  const [stock, setStock] = useState(String(product.stock));
  const [reserved, setReserved] = useState(String(product.reserved));
  const [threshold, setThreshold] = useState(String(product.threshold));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setStock(String(product.stock));
    setReserved(String(product.reserved));
    setThreshold(String(product.threshold));
  }, [product.id, product.stock, product.reserved, product.threshold]);

  const onHand = parseQty(stock);
  const held = parseQty(reserved);
  const available = Math.max(0, onHand - held);
  const alertAt = parseQty(threshold);
  const low = available <= alertAt;
  const warehouseName = org.warehouses[0]?.name;

  async function handleUpdate() {
    if (saving || org.masterDataMutating) return;
    setSaving(true);
    try {
      await org.updateProduct(product.id, {
        stock: onHand,
        reserved: held,
        threshold: alertAt,
      });
      toast.success('Inventory updated');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not update inventory');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-xl border border-border bg-muted/20 p-3.5 mb-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Boxes className="size-4 text-[var(--pulse-hero-blue)] shrink-0" />
          <div className="min-w-0">
            <h4 className="text-2sm font-semibold">Stock availability</h4>
            <p className="text-3xs text-muted-foreground mt-0.5">
              {warehouseName
                ? `Held at ${warehouseName}`
                : 'Saving stock will create a primary warehouse'}
            </p>
          </div>
        </div>
        <StatusDotBadge label={low ? 'Low stock' : 'In stock'} tone={low ? 'danger' : 'success'} />
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-background border border-border px-2 py-2">
          <p className="text-3xs text-muted-foreground">On hand</p>
          <p className="text-sm font-semibold tabular-nums mt-0.5">{onHand.toLocaleString()}</p>
        </div>
        <div className="rounded-lg bg-background border border-border px-2 py-2">
          <p className="text-3xs text-muted-foreground">Reserved</p>
          <p className="text-sm font-semibold tabular-nums mt-0.5">{held.toLocaleString()}</p>
        </div>
        <div className="rounded-lg bg-background border border-border px-2 py-2">
          <p className="text-3xs text-muted-foreground">Available</p>
          <p className={cn('text-sm font-semibold tabular-nums mt-0.5', low && 'text-destructive')}>
            {available.toLocaleString()}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <FormField label="Stock on hand" value={stock} onChange={setStock} type="number" />
        <FormField label="Reserved" value={reserved} onChange={setReserved} type="number" />
        <FormField label="Low-stock at" value={threshold} onChange={setThreshold} type="number" />
      </div>

      <Button
        type="button"
        className="w-full"
        size="sm"
        disabled={saving || org.masterDataMutating}
        onClick={() => void handleUpdate()}
      >
        {saving || org.masterDataMutating ? 'Updating inventory…' : 'Update inventory'}
      </Button>
    </section>
  );
}
