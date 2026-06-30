import { useEffect, useState } from 'react';
import { MapPin, Warehouse as WarehouseIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { EntityFlexSheet, EntityHero } from '@/components/commerce/EntityFlexSheet';
import { FormField, SpecRow } from '@/components/commerce/FormField';
import { useCommerce } from '@/context/CommerceProvider';
import { useOrganization } from '@/context/OrganizationProvider';

interface WarehouseDetailSheetProps {
  warehouseId: string | null;
  open:        boolean;
  onClose:     () => void;
}

export function WarehouseDetailSheet({ warehouseId, open, onClose }: WarehouseDetailSheetProps) {
  const { warehouses } = useCommerce();
  const org = useOrganization();
  const warehouse = warehouses.find(w => w.id === warehouseId) ?? null;

  const [editing, setEditing] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [pincode, setPincode] = useState('');
  const [capacity, setCapacity] = useState('');

  useEffect(() => {
    if (!warehouse || editing) return;
    setName(warehouse.name);
    setCity(warehouse.address.city);
    setState(warehouse.address.state);
    setPincode(warehouse.address.pincode);
    setCapacity(String(warehouse.capacity_m3));
  }, [warehouse, editing]);

  useEffect(() => {
    if (!open) { setEditing(false); setDeleteConfirm(false); }
  }, [open]);

  if (!warehouse) return null;

  const canSave = name.trim().length > 0 && city.trim().length > 0;

  function resetDraft() {
    setName(warehouse!.name);
    setCity(warehouse!.address.city);
    setState(warehouse!.address.state);
    setPincode(warehouse!.address.pincode);
    setCapacity(String(warehouse!.capacity_m3));
  }

  function handleSave() {
    if (!canSave) return;
    org.updateWarehouse(warehouse!.id, {
      name:        name.trim(),
      code:        name.trim().slice(0, 6).toUpperCase().replace(/\s+/g, ''),
      capacity_m3: parseFloat(capacity) || 0,
      address: {
        ...warehouse!.address,
        line1: name.trim(),
        city:  city.trim(),
        state: state.trim(),
        pincode: pincode.trim(),
      },
    });
    setEditing(false);
  }

  function handleDelete() {
    org.deleteWarehouse(warehouse!.id);
    setDeleteConfirm(false);
    onClose();
  }

  const location = [warehouse.address.city, warehouse.address.state, warehouse.address.pincode].filter(Boolean).join(', ');

  return (
    <EntityFlexSheet
      open={open}
      entity={warehouse}
      title="Warehouse Details"
      editing={editing}
      canSave={canSave}
      deleteConfirm={deleteConfirm}
      onClose={onClose}
      onEdit={() => setEditing(true)}
      onCancelEdit={() => { resetDraft(); setEditing(false); }}
      onSave={handleSave}
      onDelete={() => setDeleteConfirm(true)}
      onDeleteConfirm={handleDelete}
      onDeleteCancel={() => setDeleteConfirm(false)}
    >
      <EntityHero>
        <WarehouseIcon className="size-12 text-muted-foreground/20" />
      </EntityHero>

      <div className="flex items-start justify-between gap-2 mb-4">
        <div>
          <Badge variant="secondary" appearance="light" size="sm">{warehouse.code}</Badge>
          <h3 className="font-bold text-sm mt-2">{warehouse.name}</h3>
        </div>
        <MapPin className="size-4 text-muted-foreground shrink-0 mt-1" />
      </div>

      {editing ? (
        <div className="space-y-3">
          <FormField label="Warehouse name *" value={name} onChange={setName} />
          <FormField label="City *" value={city} onChange={setCity} />
          <div className="grid grid-cols-2 gap-2">
            <FormField label="State" value={state} onChange={setState} />
            <FormField label="Pincode" value={pincode} onChange={setPincode} />
          </div>
          <FormField label="Capacity (m³)" value={capacity} onChange={setCapacity} type="number" />
        </div>
      ) : (
        <div className="divide-y divide-border border-y border-border text-2sm">
          <SpecRow label="Code">{warehouse.code}</SpecRow>
          <SpecRow label="Location">{location || '—'}</SpecRow>
          <SpecRow label="Capacity">{warehouse.capacity_m3.toLocaleString()} m³</SpecRow>
        </div>
      )}
    </EntityFlexSheet>
  );
}
