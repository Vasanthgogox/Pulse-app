import { useState } from 'react';
import { Boxes, MapPin, Package, Plus, Warehouse as WarehouseIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PageToolbar } from '@/components/commerce/PageToolbar';
import { WarehouseDetailSheet } from '@/components/commerce/WarehouseDetailSheet';
import { FormField } from '@/components/commerce/FormField';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useCommerce } from '@/context/CommerceProvider';
import { useOrganization } from '@/context/OrganizationProvider';
import type { Warehouse } from '@/types/commerce';

function CreateWarehouseSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const org = useOrganization();
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [pincode, setPincode] = useState('');
  const [capacity, setCapacity] = useState('1000');

  function handleSubmit() {
    if (!name.trim() || !city.trim()) return;
    const wh: Warehouse = {
      id:          `WH-${Date.now()}`,
      name:        name.trim(),
      code:        name.trim().slice(0, 6).toUpperCase().replace(/\s+/g, ''),
      address:     { line1: name.trim(), city: city.trim(), state: state.trim(), pincode: pincode.trim() },
      capacity_m3: parseFloat(capacity) || 1000,
    };
    org.addWarehouse(wh);
    setName(''); setCity(''); setState(''); setPincode(''); setCapacity('1000');
    onClose();
  }

  return (
    <Sheet open={open} onOpenChange={v => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader><SheetTitle>New warehouse</SheetTitle></SheetHeader>
        <div className="mt-6 space-y-4">
          <FormField label="Warehouse name *" value={name} onChange={setName} placeholder="Mumbai DC" />
          <FormField label="City *" value={city} onChange={setCity} placeholder="Mumbai" />
          <div className="grid grid-cols-2 gap-3">
            <FormField label="State" value={state} onChange={setState} placeholder="Maharashtra" />
            <FormField label="Pincode" value={pincode} onChange={setPincode} placeholder="400001" />
          </div>
          <FormField label="Capacity (m³)" value={capacity} onChange={setCapacity} placeholder="1000" type="number" />
          <Button className="w-full mt-2" disabled={!name.trim() || !city.trim()} onClick={handleSubmit}>
            Add warehouse
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function WarehousesPage() {
  const { warehouses, products } = useCommerce();
  const [showCreate, setShowCreate] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const totalUnits = products.reduce((s, p) => s + (p.stock - p.reserved), 0);

  return (
    <div className="container-fluid">
      <PageToolbar
        title="Warehouses"
        breadcrumb={['Commerce', 'Inventory', 'Warehouses']}
        description="Fulfillment locations — orders consolidate by warehouse for execution planning."
        actions={
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="size-4" /> Add warehouse
          </Button>
        }
      />

      <div className="grid gap-5 sm:grid-cols-3 mb-6">
        <StatCard icon={WarehouseIcon} label="Warehouses" value={String(warehouses.length)} />
        <StatCard icon={Package} label="SKUs tracked" value={String(products.length)} />
        <StatCard icon={Boxes} label="Available units" value={String(totalUnits)} />
      </div>

      {warehouses.length === 0 && (
        <div className="rounded-xl border border-dashed border-border p-10 text-center">
          <Boxes className="size-10 text-muted-foreground mx-auto mb-3" />
          <p className="font-medium">No warehouses yet</p>
          <p className="text-2sm text-muted-foreground mt-1 mb-4">Add a fulfillment location to start managing inventory.</p>
          <Button size="sm" onClick={() => setShowCreate(true)}><Plus className="size-4" /> Add first warehouse</Button>
        </div>
      )}

      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {warehouses.map(wh => (
          <button
            key={wh.id}
            type="button"
            onClick={() => setSelectedId(wh.id)}
            className="pulse-card p-5 text-left hover:border-[var(--pulse-hero-blue)]/25 hover:bg-[var(--pulse-brand-soft)]/20 transition-colors"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <Badge variant="secondary" appearance="light" size="sm">{wh.code}</Badge>
                <h3 className="text-sm font-medium mt-2">{wh.name}</h3>
              </div>
              <MapPin className="size-4 text-muted-foreground shrink-0" />
            </div>
            {wh.address.line1 !== wh.name && <p className="text-sm text-muted-foreground mt-2">{wh.address.line1}</p>}
            <p className="text-sm text-muted-foreground mt-1">
              {[wh.address.city, wh.address.state, wh.address.pincode].filter(Boolean).join(', ')}
            </p>
            <p className="text-sm text-muted-foreground mt-3">Capacity: {wh.capacity_m3} m³</p>
          </button>
        ))}
      </div>

      <CreateWarehouseSheet open={showCreate} onClose={() => setShowCreate(false)} />
      <WarehouseDetailSheet
        warehouseId={selectedId}
        open={!!selectedId}
        onClose={() => setSelectedId(null)}
      />
    </div>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 flex items-center gap-3 shadow-none">
      <div className="size-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
        <Icon className="size-5 text-primary" />
      </div>
      <div className="min-w-0">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-2xl font-semibold tracking-tight">{value}</p>
      </div>
    </div>
  );
}
