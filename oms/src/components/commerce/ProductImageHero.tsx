import { useRef, useState, type ReactNode } from 'react';
import { ImagePlus, Loader2, Package, Trash2 } from 'lucide-react';
import { productImagePublicUrl } from '@/lib/services/product-image';
import { cn } from '@/lib/utils';

export function ProductImageHero({
  imagePath,
  uploading,
  onSelectFile,
  onRemove,
  canEdit,
}: {
  imagePath?: string | null;
  uploading?: boolean;
  onSelectFile?: (file: File) => void;
  onRemove?: () => void;
  canEdit?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const src = productImagePublicUrl(imagePath);

  return (
    <div className="relative rounded-lg bg-muted/30 h-44 flex items-center justify-center mb-4 overflow-hidden">
      {src ? (
        <img src={src} alt="" className="absolute inset-0 size-full object-cover" />
      ) : (
        <Package className="size-12 text-muted-foreground/20" />
      )}
      {canEdit ? (
        <div className="absolute inset-0 flex items-end justify-center gap-2 p-3 bg-gradient-to-t from-black/45 via-black/10 to-transparent">
          <button
            type="button"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-md bg-white/95 px-2.5 py-1.5 text-2xs font-semibold text-foreground shadow-sm hover:bg-white disabled:opacity-60"
          >
            {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <ImagePlus className="size-3.5" />}
            {src ? 'Change photo' : 'Upload photo'}
          </button>
          {src && onRemove ? (
            <button
              type="button"
              disabled={uploading}
              onClick={onRemove}
              className="inline-flex items-center gap-1 rounded-md bg-white/95 px-2 py-1.5 text-2xs font-semibold text-destructive shadow-sm hover:bg-white disabled:opacity-60"
              aria-label="Remove product photo"
            >
              <Trash2 className="size-3.5" />
            </button>
          ) : null}
        </div>
      ) : null}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) onSelectFile?.(file);
        }}
      />
    </div>
  );
}

export function ProductThumb({
  imagePath,
  fallback,
  className,
}: {
  imagePath?: string | null;
  fallback: ReactNode;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const src = productImagePublicUrl(imagePath);
  if (!src || failed) return <>{fallback}</>;
  return (
    <img
      src={src}
      alt=""
      className={cn('size-full object-cover', className)}
      onError={() => setFailed(true)}
    />
  );
}
