import { Package } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { formatCurrency } from '@/lib/utils';
import type { Order, OrderStatus } from '@/types/commerce';

const STATUS_VARIANT: Record<OrderStatus, 'warning' | 'info' | 'success' | 'secondary' | 'destructive'> = {
  'Draft': 'secondary',
  'Pending Consolidation': 'warning',
  'Planned': 'info',
  'Fulfilled': 'success',
  'Cancelled': 'destructive',
};

interface OrderListCardProps {
  order: Order;
}

export function OrderListCard({ order }: OrderListCardProps) {
  return (
    <Card className="shadow-none overflow-hidden">
      <CardHeader className="justify-start bg-muted/70 gap-6 sm:gap-9 h-auto py-5 flex-row flex-wrap border-b border-border">
        <Meta label="Order ID" value={order.order_number} />
        <Meta label="Customer" value={order.customer_name} />
        <Meta label="Total" value={formatCurrency(order.total_amount)} />
        <Meta label="Route" value={`${order.pickup_address.city} → ${order.drop_address.city}`} />
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-normal text-muted-foreground">Status</span>
          <Badge variant={STATUS_VARIANT[order.status]} appearance="light" size="sm">
            {order.status}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="p-5 lg:p-7.5 space-y-4">
        {order.line_items.map(item => (
          <Card key={item.id} className="shadow-none">
            <CardContent className="flex items-center flex-wrap justify-between gap-4 p-2 pe-5">
              <div className="flex items-center gap-3.5 min-w-0">
                <Card className="flex items-center justify-center bg-accent/50 h-[70px] w-[90px] shrink-0 shadow-none border-0">
                  <Package className="size-8 text-muted-foreground/50" />
                </Card>
                <div className="flex flex-col gap-1 min-w-0">
                  <span className="text-sm font-medium leading-5.5 truncate">{item.product_name}</span>
                  <span className="text-xs text-muted-foreground uppercase">
                    sku: <span className="text-xs font-medium text-foreground normal-case">{item.sku}</span>
                  </span>
                </div>
              </div>
              <div className="flex flex-col gap-1.5 items-end shrink-0">
                <span className="text-xs text-muted-foreground">{item.qty} x</span>
                <span className="text-sm font-semibold">{formatCurrency(item.total)}</span>
              </div>
            </CardContent>
          </Card>
        ))}
        <p className="text-2sm text-muted-foreground">
          {order.total_weight_kg} kg · {order.source}
        </p>
      </CardContent>
    </Card>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      <span className="text-xs font-normal text-muted-foreground">{label}</span>
      <span className="text-sm font-medium truncate">{value}</span>
    </div>
  );
}
