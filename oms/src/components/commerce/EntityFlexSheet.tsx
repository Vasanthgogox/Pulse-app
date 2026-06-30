import type { ReactNode } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

interface EntityFlexSheetProps<T extends { id: string }> {
  open:        boolean;
  entity:      T | null;
  title:       string;
  editing:     boolean;
  canSave?:    boolean;
  canEdit?:    boolean;
  canDelete?:  boolean;
  deleteConfirm?: boolean;
  onClose:     () => void;
  onEdit:      () => void;
  onCancelEdit: () => void;
  onSave:      () => void;
  onDelete:    () => void;
  onDeleteConfirm?: () => void;
  onDeleteCancel?: () => void;
  children:    ReactNode;
  footer?:     ReactNode;
}

export function EntityFlexSheet<T extends { id: string }>({
  open,
  entity,
  title,
  editing,
  canSave = true,
  canEdit = true,
  canDelete = true,
  deleteConfirm = false,
  onClose,
  onEdit,
  onCancelEdit,
  onSave,
  onDelete,
  onDeleteConfirm,
  onDeleteCancel,
  children,
  footer,
}: EntityFlexSheetProps<T>) {
  if (!entity) return null;

  return (
    <Sheet open={open} onOpenChange={v => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-md flex flex-col p-0">
        <SheetHeader className="px-5 pt-5 pb-3 border-b border-border shrink-0">
          <div className="flex items-center justify-between gap-2 pe-8">
            <SheetTitle className="text-base text-[var(--pulse-hero-blue)]">{title}</SheetTitle>
            {!editing && (canEdit || canDelete) && (
              <div className="flex items-center gap-1">
                {canEdit && (
                  <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-2xs" onClick={onEdit}>
                    <Pencil className="size-3.5" /> Edit
                  </Button>
                )}
                {canDelete && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-2xs text-destructive hover:text-destructive"
                    onClick={onDelete}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                )}
              </div>
            )}
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>

        <div className="shrink-0 px-5 pb-5 pt-3 border-t border-border space-y-2">
          {deleteConfirm ? (
            <div className="rounded-lg border border-destructive/30 bg-[var(--pulse-danger-bg)]/50 p-3 space-y-2">
              <p className="text-2sm text-[var(--pulse-danger-text)]">Delete this record? This cannot be undone.</p>
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" className="flex-1" onClick={onDeleteCancel}>
                  Cancel
                </Button>
                <Button type="button" variant="destructive" size="sm" className="flex-1" onClick={onDeleteConfirm}>
                  Delete
                </Button>
              </div>
            </div>
          ) : editing ? (
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" className="flex-1" onClick={onCancelEdit}>
                Cancel
              </Button>
              <Button type="button" size="sm" className="flex-1" disabled={!canSave} onClick={onSave}>
                Save changes
              </Button>
            </div>
          ) : (
            footer
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function EntityHero({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('relative rounded-lg bg-muted/30 h-36 flex items-center justify-center mb-4', className)}>
      {children}
    </div>
  );
}
