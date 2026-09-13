import { Package, ShoppingCart } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { productImagePublicUrl } from '@/lib/services/product-image';
import { cn, formatCurrency } from '@/lib/utils';
import type { Product } from '@/types/commerce';

interface ProductGridCardProps {
  product:   Product;
  onSelect?: () => void;
}

export function ProductGridCard({ product, onSelect }: ProductGridCardProps) {
  const available = product.stock - product.reserved;
  const lowStock = available <= product.threshold;
  const imageSrc = productImagePublicUrl(product.image_path);

  return (
    <div
      className="rounded-xl border border-border bg-card overflow-hidden hover:shadow-sm transition-shadow cursor-pointer group"
      onClick={onSelect}
    >
      <div className="relative bg-muted/30 h-[180px] flex items-center justify-center overflow-hidden">
        {lowStock && (
          <Badge
            size="sm"
            variant="destructive"
            className="absolute top-2.5 right-2.5 uppercase text-[10px] font-bold tracking-wide px-1.5 z-10"
          >
            Low stock
          </Badge>
        )}
        {imageSrc ? (
          <img src={imageSrc} alt="" className="absolute inset-0 size-full object-cover" />
        ) : (
          <div className="flex flex-col items-center gap-2 text-muted-foreground/40">
            <Package className="size-12" />
            <span className="text-[10px] font-mono">{product.sku}</span>
          </div>
        )}
      </div>

      <div className="p-3.5">
        <p className="text-sm font-medium leading-snug line-clamp-2 mb-3 min-h-[40px]">{product.name}</p>
        <div className="flex items-center justify-between gap-2">
          <span className={cn('text-2xs font-medium tabular-nums', lowStock ? 'text-destructive' : 'text-muted-foreground')}>
            {available.toLocaleString()} avail.
          </span>
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-sm font-semibold shrink-0">{formatCurrency(product.unit_price)}</span>
            <Button
              size="sm"
              variant="outline"
              className="shrink-0 h-7 px-2 text-xs gap-1"
              onClick={e => { e.stopPropagation(); onSelect?.(); }}
            >
              <ShoppingCart className="size-3" /> Add
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
