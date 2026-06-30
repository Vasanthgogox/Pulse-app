import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { CreateCustomerSheet } from '@/components/commerce/CreateCustomerSheet';
import { useCommerce } from '@/context/CommerceProvider';
import type { Customer, Order, OrderLineItem, Product } from '@/types/commerce';
import { formatCurrency } from '@/lib/utils';
import { getConsigneeDisplayName } from '@/lib/consignee';

interface LineDraft {
  key:       string;
  productId: string;
  qty:       string;
}

interface CreateOrderSheetProps {
  open:    boolean;
  onClose: () => void;
}

function emptyLine(products: Product[]): LineDraft {
  return {
    key:       `line-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    productId: products[0]?.id ?? '',
    qty:       '1',
  };
}

export function CreateOrderSheet({ open, onClose }: CreateOrderSheetProps) {
  const { orders, customers, products, warehouses, addOrder } = useCommerce();
  const [customerId, setCustomerId] = useState(customers[0]?.id ?? '');
  const [lines, setLines] = useState<LineDraft[]>(() => [emptyLine(products)]);
  const [showAddCustomer, setShowAddCustomer] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (!customerId && customers[0]) setCustomerId(customers[0].id);
    if (lines.length === 0 && products.length > 0) setLines([emptyLine(products)]);
  }, [open, customers, customerId, lines.length, products]);

  const preview = useMemo(() => {
    const items: OrderLineItem[] = [];
    for (const line of lines) {
      const product = products.find(p => p.id === line.productId);
      if (!product) continue;
      const qty = Math.max(1, Number(line.qty) || 1);
      const total = product.unit_price * qty;
      items.push({
        id:           `LI-${line.key}`,
        product_id:   product.id,
        product_name: product.name,
        sku:          product.sku,
        qty,
        unit_price:   product.unit_price,
        total,
        weight_kg:    product.weight_kg * qty,
        volume_m3:    product.volume_m3 * qty,
      });
    }
    return {
      items,
      subtotal: items.reduce((s, i) => s + i.total, 0),
      weight:   items.reduce((s, i) => s + i.weight_kg, 0),
      volume:   items.reduce((s, i) => s + i.volume_m3, 0),
    };
  }, [lines, products]);

  const canSubmit =
    customers.length > 0 &&
    products.length > 0 &&
    warehouses.length > 0 &&
    preview.items.length > 0;

  function resetForm() {
    setCustomerId(customers[0]?.id ?? '');
    setLines([emptyLine(products)]);
  }

  function addLine() {
    setLines(prev => [...prev, emptyLine(products)]);
  }

  function updateLine(key: string, patch: Partial<LineDraft>) {
    setLines(prev => prev.map(l => (l.key === key ? { ...l, ...patch } : l)));
  }

  function removeLine(key: string) {
    setLines(prev => (prev.length <= 1 ? prev : prev.filter(l => l.key !== key)));
  }

  function handleCustomerCreated(customer: Customer) {
    setCustomerId(customer.id);
  }

  function handleSubmit() {
    const customer = customers.find(c => c.id === customerId);
    const warehouse = warehouses[0];
    if (!customer || !warehouse || preview.items.length === 0) return;

    const now = new Date().toISOString();
    const order: Order = {
      id:                  `ORD-${Date.now()}`,
      order_number:        `SO-${String(orders.length + 1).padStart(4, '0')}`,
      customer_id:         customer.id,
      customer_name:       getConsigneeDisplayName(customer),
      customer_email:      customer.email,
      status:              'Pending Consolidation',
      pickup_warehouse_id: warehouse.id,
      pickup_address:      warehouse.address,
      drop_address:        customer.shipping_address,
      line_items:          preview.items,
      total_amount:        preview.subtotal,
      total_weight_kg:     preview.weight,
      total_volume_m3:     preview.volume,
      priority:            'standard',
      source:              'Manual',
      created_at:          now,
      updated_at:          now,
    };
    addOrder(order);
    resetForm();
    onClose();
  }

  return (
    <>
      <Sheet open={open} onOpenChange={v => !v && onClose()}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto flex flex-col">
          <SheetHeader className="shrink-0">
            <SheetTitle>New sales order</SheetTitle>
          </SheetHeader>

          <div className="mt-6 flex-1 space-y-5">
            <div>
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-2sm font-medium">Consignee (delivery)</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-2xs gap-1 px-2"
                  onClick={() => setShowAddCustomer(true)}
                >
                  <UserPlus className="size-3.5" /> Add consignee
                </Button>
              </div>
              <select
                value={customerId}
                onChange={e => setCustomerId(e.target.value)}
                className="w-full rounded-md border border-input px-3 py-2 text-2sm bg-background focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {customers.map(c => (
                  <option key={c.id} value={c.id}>
                    {getConsigneeDisplayName(c)}{c.gstin ? ` · ${c.gstin}` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-2sm font-medium">Line items</span>
                <Button type="button" variant="outline" size="sm" className="h-7 text-2xs gap-1" onClick={addLine}>
                  <Plus className="size-3.5" /> Add product
                </Button>
              </div>

              <div className="space-y-2">
                {lines.map((line, index) => (
                  <div
                    key={line.key}
                    className="rounded-lg border border-border bg-muted/20 p-3 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-3xs font-medium text-muted-foreground uppercase tracking-wide">
                        Item {index + 1}
                      </span>
                      {lines.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeLine(line.key)}
                          className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-destructive"
                          aria-label="Remove line"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      )}
                    </div>
                    <label className="block">
                      <span className="text-3xs text-muted-foreground">Product</span>
                      <select
                        value={line.productId}
                        onChange={e => updateLine(line.key, { productId: e.target.value })}
                        className="mt-0.5 w-full rounded-md border border-input px-3 py-1.5 text-2sm bg-background"
                      >
                        {products.map(p => (
                          <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className="text-3xs text-muted-foreground">Quantity</span>
                      <input
                        type="number"
                        min={1}
                        value={line.qty}
                        onChange={e => updateLine(line.key, { qty: e.target.value })}
                        className="mt-0.5 w-full rounded-md border border-input px-3 py-1.5 text-2sm bg-background"
                      />
                    </label>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-border divide-y divide-border text-2sm">
              <div className="flex justify-between px-3 py-2">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-medium">{formatCurrency(preview.subtotal)}</span>
              </div>
              <div className="flex justify-between px-3 py-2">
                <span className="text-muted-foreground">Weight</span>
                <span>{preview.weight.toFixed(1)} kg</span>
              </div>
              <div className="flex justify-between px-3 py-2">
                <span className="text-muted-foreground">Line items</span>
                <span>{preview.items.length}</span>
              </div>
            </div>

            <Button className="w-full" disabled={!canSubmit} onClick={handleSubmit}>
              Create sales order
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <CreateCustomerSheet
        open={showAddCustomer}
        onClose={() => setShowAddCustomer(false)}
        onCreated={handleCustomerCreated}
      />
    </>
  );
}
