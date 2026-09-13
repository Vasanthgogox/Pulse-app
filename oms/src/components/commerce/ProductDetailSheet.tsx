import { useEffect, useState } from 'react';
import { EntityFlexSheet } from '@/components/commerce/EntityFlexSheet';
import { ProductImageHero } from '@/components/commerce/ProductImageHero';
import { ProductInventoryPanel } from '@/components/commerce/ProductInventoryPanel';
import { FormField, SpecRow, selectClass } from '@/components/commerce/FormField';
import { PackingDimensionsFields } from '@/components/commerce/PackingDimensionsFields';
import { useCommerce } from '@/context/CommerceProvider';
import { useOrganization } from '@/context/OrganizationProvider';
import { formatDimensions, parseDimension, volumeFromDimensionsCm } from '@/lib/product-dimensions';
import type { ProductCategory } from '@/types/commerce';
import { toast } from 'sonner';
import { cn, formatCurrency } from '@/lib/utils';
import {
  removeCommerceProductImage,
  uploadCommerceProductImage,
} from '@/lib/services/product-image';

const CATEGORIES: ProductCategory[] = ['Electronics', 'Apparel', 'FMCG', 'Industrial', 'Pharmaceuticals', 'Food & Beverage'];

interface ProductDetailSheetProps {
  productId: string | null;
  open:      boolean;
  onClose:   () => void;
}

export function ProductDetailSheet({ productId, open, onClose }: ProductDetailSheetProps) {
  const { products } = useCommerce();
  const org = useOrganization();
  const product = products.find(p => p.id === productId) ?? null;

  const [editing, setEditing] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [category, setCategory] = useState<ProductCategory>('FMCG');
  const [description, setDescription] = useState('');
  const [unitPrice, setUnitPrice] = useState('');
  const [weight, setWeight] = useState('');
  const [dimL, setDimL] = useState('');
  const [dimW, setDimW] = useState('');
  const [dimH, setDimH] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [imageUploading, setImageUploading] = useState(false);

  useEffect(() => {
    if (!product || editing) return;
    setName(product.name);
    setSku(product.sku);
    setCategory(product.category);
    setDescription(product.description);
    setUnitPrice(String(product.unit_price));
    setWeight(String(product.weight_kg));
    setDimL(String(product.dimensions.l || ''));
    setDimW(String(product.dimensions.w || ''));
    setDimH(String(product.dimensions.h || ''));
  }, [product, editing]);

  useEffect(() => {
    if (!open) {
      setEditing(false);
      setDeleteConfirm(false);
      setSaveError(null);
    }
  }, [open]);

  if (!product) return null;

  const canSave = name.trim().length > 0 && sku.trim().length > 0;

  function resetDraft() {
    setName(product!.name);
    setSku(product!.sku);
    setCategory(product!.category);
    setDescription(product!.description);
    setUnitPrice(String(product!.unit_price));
    setWeight(String(product!.weight_kg));
    setDimL(String(product!.dimensions.l || ''));
    setDimW(String(product!.dimensions.w || ''));
    setDimH(String(product!.dimensions.h || ''));
  }

  function buildDimensions() {
    const dimensions = {
      l: parseDimension(dimL),
      w: parseDimension(dimW),
      h: parseDimension(dimH),
    };
    return { dimensions, volume_m3: volumeFromDimensionsCm(dimensions) };
  }

  async function handleSave() {
    if (!canSave || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const { dimensions, volume_m3 } = buildDimensions();
      await org.updateProduct(product!.id, {
        name:        name.trim(),
        sku:         sku.trim().toUpperCase(),
        category,
        description: description.trim(),
        unit_price:  parseFloat(unitPrice) || 0,
        weight_kg:   parseFloat(weight) || 0,
        dimensions,
        volume_m3,
      });
      setEditing(false);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Could not save product';
      setSaveError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  async function handleImageFile(file: File) {
    const orgId = org.platformOrganization?.id;
    if (!orgId || imageUploading) return;
    setImageUploading(true);
    try {
      const path = await uploadCommerceProductImage(orgId, product!.id, file);
      await org.updateProduct(product!.id, { image_path: path });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Could not upload photo';
      toast.error(message);
    } finally {
      setImageUploading(false);
    }
  }

  async function handleRemoveImage() {
    if (!product?.image_path || imageUploading) return;
    setImageUploading(true);
    try {
      await removeCommerceProductImage(product.image_path);
      await org.updateProduct(product.id, { image_path: null });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Could not remove photo';
      toast.error(message);
    } finally {
      setImageUploading(false);
    }
  }

  async function handleDelete() {
    await org.deleteProduct(product!.id);
    setDeleteConfirm(false);
    onClose();
  }

  return (
    <EntityFlexSheet
      open={open}
      entity={product}
      title="Product Details"
      editing={editing}
      canSave={canSave && !saving}
      deleteConfirm={deleteConfirm}
      onClose={onClose}
      onEdit={() => setEditing(true)}
      onCancelEdit={() => { resetDraft(); setEditing(false); }}
      onSave={() => void handleSave()}
      onDelete={() => setDeleteConfirm(true)}
      onDeleteConfirm={() => void handleDelete()}
      onDeleteCancel={() => setDeleteConfirm(false)}
    >
      <ProductImageHero
        imagePath={product.image_path}
        uploading={imageUploading}
        canEdit
        onSelectFile={(file) => void handleImageFile(file)}
        onRemove={() => void handleRemoveImage()}
      />

      {!editing ? (
        <div className="mb-4">
          <h3 className="font-bold text-sm">{product.name}</h3>
          <p className="text-2xs text-muted-foreground mt-1">{product.description || `${product.category} product`}</p>
        </div>
      ) : null}

      <ProductInventoryPanel product={product} />

      {editing ? (
        <div className="space-y-3">
          <FormField label="Product name *" value={name} onChange={setName} />
          <FormField label="SKU *" value={sku} onChange={setSku} />
          <label className="block">
            <span className="text-2sm font-medium">Category</span>
            <select value={category} onChange={e => setCategory(e.target.value as ProductCategory)} className={cn(selectClass, 'mt-1')}>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <FormField label="Unit price (₹)" value={unitPrice} onChange={setUnitPrice} type="number" />
          <FormField label="Weight (kg)" value={weight} onChange={setWeight} type="number" />
          <PackingDimensionsFields
            length={dimL}
            width={dimW}
            height={dimH}
            onLength={setDimL}
            onWidth={setDimW}
            onHeight={setDimH}
          />
          {saveError ? <p className="text-2sm text-destructive">{saveError}</p> : null}
          <FormField label="Description" value={description} onChange={setDescription} />
        </div>
      ) : (
        <>
          <div className="divide-y divide-border border-y border-border text-2sm">
            <SpecRow label="SKU"><span className="font-mono">{product.sku}</span></SpecRow>
            <SpecRow label="Category">{product.category}</SpecRow>
            <SpecRow label="Weight">{product.weight_kg} kg</SpecRow>
            <SpecRow label="Packing">{formatDimensions(product.dimensions)}</SpecRow>
          </div>
          <p className="text-xl font-bold text-right mt-4 tabular-nums text-[var(--pulse-hero-blue)]">
            {formatCurrency(product.unit_price)}
          </p>
        </>
      )}
    </EntityFlexSheet>
  );
}
