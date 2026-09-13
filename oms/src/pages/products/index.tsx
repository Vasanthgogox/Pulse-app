import { useMemo, useState } from 'react';
import { type ColumnDef } from '@tanstack/react-table';
import { LayoutGrid, List, Package, Plus, ShoppingCart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageToolbar } from '@/components/commerce/PageToolbar';
import { ProductGridCard } from '@/components/commerce/ProductGridCard';
import { ProductDetailSheet } from '@/components/commerce/ProductDetailSheet';
import { FormField } from '@/components/commerce/FormField';
import { ProductImageHero, ProductThumb } from '@/components/commerce/ProductImageHero';
import { PackingDimensionsFields } from '@/components/commerce/PackingDimensionsFields';
import {
  CommerceDataTable,
  DataGridColumnHeader,
  MemberCell,
  NumericColumnHeader,
  RowActionsButton,
  commerceTableMeta,
} from '@/components/commerce/CommerceDataTable';
import { StatusDotBadge } from '@/components/commerce/StatusDotBadge';
import { useCommerce } from '@/context/CommerceProvider';
import { useOrganization } from '@/context/OrganizationProvider';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import type { Product, ProductCategory } from '@/types/commerce';
import { cn, formatCurrency } from '@/lib/utils';
import { parseDimension, volumeFromDimensionsCm } from '@/lib/product-dimensions';
import { uploadCommerceProductImage } from '@/lib/services/product-image';

const CATEGORIES: ProductCategory[] = ['Electronics', 'Apparel', 'FMCG', 'Industrial', 'Pharmaceuticals', 'Food & Beverage'];
const TIME_FILTERS = ['Today', 'Week', 'Month', 'All'];

function CreateProductSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const org = useOrganization();
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [category, setCategory] = useState<ProductCategory>('FMCG');
  const [price, setPrice] = useState('');
  const [weight, setWeight] = useState('');
  const [dimL, setDimL] = useState('');
  const [dimW, setDimW] = useState('');
  const [dimH, setDimH] = useState('');
  const [description, setDescription] = useState('');
  const [stock, setStock] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!name.trim() || !sku.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      const dimensions = {
        l: parseDimension(dimL),
        w: parseDimension(dimW),
        h: parseDimension(dimH),
      };
      const created = await org.createProduct({
        sku:         sku.trim().toUpperCase(),
        name:        name.trim(),
        category,
        description: description.trim(),
        unit_price:  parseFloat(price) || 0,
        weight_kg:   parseFloat(weight) || 0,
        volume_m3:   volumeFromDimensionsCm(dimensions),
        dimensions,
        stock:       Math.max(0, parseInt(stock, 10) || 0),
        threshold:   10,
      });
      const orgId = org.platformOrganization?.id;
      if (created && imageFile && orgId) {
        const path = await uploadCommerceProductImage(orgId, created.id, imageFile);
        await org.updateProduct(created.id, { image_path: path });
      }
      setName(''); setSku(''); setPrice(''); setWeight('');
      setDimL(''); setDimW(''); setDimH('');
      setDescription('');
      setStock('');
      setImageFile(null);
      if (imagePreview) URL.revokeObjectURL(imagePreview);
      setImagePreview(null);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save product');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={v => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader><SheetTitle>New product</SheetTitle></SheetHeader>
        <div className="mt-6 space-y-4">
          <ProductImageHero
            imagePath={imagePreview}
            canEdit
            onSelectFile={(file) => {
              if (imagePreview) URL.revokeObjectURL(imagePreview);
              setImageFile(file);
              setImagePreview(URL.createObjectURL(file));
            }}
            onRemove={imagePreview ? () => {
              URL.revokeObjectURL(imagePreview);
              setImageFile(null);
              setImagePreview(null);
            } : undefined}
          />
          <FormField label="Product name *" value={name} onChange={setName} placeholder="Widget Pro Max" />
          <FormField label="SKU *" value={sku} onChange={setSku} placeholder="WDG-001" />
          <label className="block">
            <span className="text-2sm font-medium">Category</span>
            <select
              value={category}
              onChange={e => setCategory(e.target.value as ProductCategory)}
              className="mt-1 w-full rounded-md border border-input px-3 py-2 text-2sm bg-background focus:outline-none focus:ring-1 focus:ring-ring"
            >
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <FormField label="Unit price (₹)" value={price} onChange={setPrice} placeholder="1500" type="number" />
          <FormField label="Weight (kg)" value={weight} onChange={setWeight} placeholder="0.5" type="number" />
          <PackingDimensionsFields
            length={dimL}
            width={dimW}
            height={dimH}
            onLength={setDimL}
            onWidth={setDimW}
            onHeight={setDimH}
          />
          <FormField label="Stock on hand" value={stock} onChange={setStock} placeholder="0" type="number" />
          <FormField label="Description" value={description} onChange={setDescription} placeholder="Optional description" />
          {error ? <p className="text-2sm text-destructive">{error}</p> : null}
          <Button className="w-full mt-2" disabled={!name.trim() || !sku.trim() || saving} onClick={() => void handleSubmit()}>
            {saving ? 'Saving…' : 'Add product'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function ProductsPage() {
  const { products } = useCommerce();
  const [view, setView] = useState<'grid' | 'table'>('table');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [timeFilter, setTimeFilter] = useState('All');

  const columns = useMemo<ColumnDef<Product, unknown>[]>(() => [
    {
      id: 'product',
      accessorKey: 'name',
      header: ({ column }) => <DataGridColumnHeader column={column} title="Product" />,
      cell: ({ row }) => (
        <MemberCell
          avatar={
            <ProductThumb
              imagePath={row.original.image_path}
              fallback={<Package className="size-3.5" />}
            />
          }
          title={row.original.name}
          subtitle={`SKU: ${row.original.sku}`}
        />
      ),
      meta: commerceTableMeta.primary,
    },
    {
      id: 'category',
      accessorKey: 'category',
      header: ({ column }) => <DataGridColumnHeader column={column} title="Category" />,
      cell: ({ row }) => <span className="text-2sm text-muted-foreground">{row.original.category}</span>,
      meta: commerceTableMeta.text,
    },
    {
      id: 'stock',
      accessorFn: row => row.stock - row.reserved,
      header: ({ column }) => <NumericColumnHeader column={column} title="Available" />,
      cell: ({ row }) => {
        const available = row.original.stock - row.original.reserved;
        const low = available <= row.original.threshold;
        return (
          <div className="flex flex-col items-end gap-0.5">
            <span className={cn('text-2sm font-medium tabular-nums', low && 'text-destructive')}>
              {available.toLocaleString()}
            </span>
            {low ? (
              <StatusDotBadge label="Low stock" tone="danger" />
            ) : (
              <span className="text-3xs text-muted-foreground">in stock</span>
            )}
          </div>
        );
      },
      meta: commerceTableMeta.numeric,
    },
    {
      id: 'price',
      accessorKey: 'unit_price',
      header: ({ column }) => <NumericColumnHeader column={column} title="Price" />,
      cell: ({ row }) => <span className="font-medium text-2sm">{formatCurrency(row.original.unit_price)}</span>,
      meta: commerceTableMeta.numeric,
    },
    {
      id: 'actions',
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) => (
        <div className="flex items-center justify-end gap-1 whitespace-nowrap">
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-3xs px-2 shrink-0"
            onClick={e => { e.stopPropagation(); setSelectedId(row.original.id); }}
          >
            <ShoppingCart className="size-3" /> View
          </Button>
          <RowActionsButton onClick={() => setSelectedId(row.original.id)} />
        </div>
      ),
      enableSorting: false,
      meta: commerceTableMeta.actionsWide,
    },
  ], []);

  return (
    <div className="container-fluid">
      <PageToolbar
        title="Product Catalog"
        breadcrumb={['Commerce', 'Catalog', 'Products']}
        description="Manage SKUs, pricing, and inventory levels."
        actions={
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="size-3.5" /> Add product
          </Button>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <p className="text-2xs text-muted-foreground">
          {products.length} product{products.length !== 1 ? 's' : ''}
        </p>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-md border border-border overflow-hidden divide-x divide-border text-2xs">
            {TIME_FILTERS.map(t => (
              <button
                key={t}
                type="button"
                onClick={() => setTimeFilter(t)}
                className={`px-2.5 py-1 transition-colors ${timeFilter === t ? 'bg-[var(--pulse-brand-soft)] text-[var(--pulse-hero-blue)] font-medium' : 'text-muted-foreground hover:bg-accent'}`}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-0.5 rounded-md border border-border p-0.5">
            <Button size="sm" variant={view === 'grid' ? 'primary' : 'ghost'} className="h-7 w-7 p-0" onClick={() => setView('grid')}>
              <LayoutGrid className="size-3.5" />
            </Button>
            <Button size="sm" variant={view === 'table' ? 'primary' : 'ghost'} className="h-7 w-7 p-0" onClick={() => setView('table')}>
              <List className="size-3.5" />
            </Button>
          </div>
        </div>
      </div>

      {view === 'table' ? (
        <CommerceDataTable
          data={products}
          columns={columns}
          searchPlaceholder="Search products…"
          getSearchText={p => `${p.name} ${p.sku} ${p.category}`}
          statusFilters={[
            { label: 'In stock', value: 'in', match: p => p.stock - p.reserved > p.threshold },
            { label: 'Low stock', value: 'low', match: p => p.stock - p.reserved <= p.threshold },
          ]}
          emptyMessage="No products found"
          onRowClick={p => setSelectedId(p.id)}
        />
      ) : products.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {products.map(p => (
            <ProductGridCard key={p.id} product={p} onSelect={() => setSelectedId(p.id)} />
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-border p-10 text-center">
          <Package className="size-8 text-muted-foreground/30 mx-auto mb-2" />
          <p className="font-medium text-sm">No products found</p>
          <Button size="sm" className="mt-3" onClick={() => setShowCreate(true)}><Plus className="size-3.5" /> Add first product</Button>
        </div>
      )}

      <CreateProductSheet open={showCreate} onClose={() => setShowCreate(false)} />
      <ProductDetailSheet
        productId={selectedId}
        open={!!selectedId}
        onClose={() => setSelectedId(null)}
      />
    </div>
  );
}
