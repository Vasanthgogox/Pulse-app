import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useExecution } from '@/context/ExecutionProvider';
import { useOrganization } from '@/context/OrganizationProvider';
import { classifyCommerceOpsStage } from '@/lib/commerce-ops-hub';
import {
  allocateCommerceIndentToTrip,
  fetchCommerceAllocationOptions,
  shareCommerceIndentForBidding,
  type CommerceAllocationOption,
} from '@/lib/services/commerce-ops-detail.service';
import type { CommerceExecution } from '@/lib/services/execution-visibility.service';

type Path = 'asset' | 'supplier' | 'bidding';

export function CommerceOpsAllocatePanel({ exec }: { exec: CommerceExecution }) {
  const navigate = useNavigate();
  const { refreshCommerceExecutions } = useExecution();
  const org = useOrganization();
  const indent = exec.indent;
  const [path, setPath] = useState<Path>('bidding');
  const [drivers, setDrivers] = useState<CommerceAllocationOption[]>([]);
  const [vehicles, setVehicles] = useState<CommerceAllocationOption[]>([]);
  const [suppliers, setSuppliers] = useState<CommerceAllocationOption[]>([]);
  const [driverId, setDriverId] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [supplierRate, setSupplierRate] = useState(
    indent?.supplierTarget != null ? String(indent.supplierTarget) : '',
  );
  const [targetRate, setTargetRate] = useState(
    indent?.supplierTarget != null ? String(indent.supplierTarget) : '',
  );
  const [circulation, setCirculation] = useState<'integrated_supplier' | 'marketplace' | 'both'>(
    indent?.circulationTarget === 'marketplace' || indent?.circulationTarget === 'both'
      ? indent.circulationTarget
      : 'integrated_supplier',
  );
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const orgId = org.platformOrganization?.id;
    if (!orgId) return;
    let cancelled = false;
    fetchCommerceAllocationOptions(orgId).then(opts => {
      if (cancelled) return;
      setDrivers(opts.drivers);
      setVehicles(opts.vehicles);
      setSuppliers(opts.suppliers);
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [org.platformOrganization?.id]);

  if (!indent) {
    return <p className="text-2sm text-muted-foreground">Convert the plan to an indent first.</p>;
  }
  if (classifyCommerceOpsStage(exec) !== 'indent') {
    return (
      <p className="text-2sm text-muted-foreground">
        This indent already has a trip. Open the Trip tab.
      </p>
    );
  }

  const onShare = async () => {
    const rate = Number(targetRate);
    if (!Number.isFinite(rate) || rate <= 0) {
      toast.error('Enter a supplier target rate');
      return;
    }
    setBusy(true);
    const { error } = await shareCommerceIndentForBidding({
      indentId: indent.id,
      circulationTarget: circulation,
      supplierTarget: rate,
    });
    setBusy(false);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success('Indent shared for bidding');
    await refreshCommerceExecutions();
    navigate(`/execution/indent/${indent.id}`);
  };

  const onCreateTrip = async (mode: 'asset' | 'supplier') => {
    if (!driverId || !vehicleId) {
      toast.error('Select driver and vehicle');
      return;
    }
    if (mode === 'supplier' && !supplierId) {
      toast.error('Select a supplier');
      return;
    }
    const rate = Number(supplierRate);
    if (mode === 'supplier' && (!Number.isFinite(rate) || rate <= 0)) {
      toast.error('Enter the supplier rate');
      return;
    }
    setBusy(true);
    const { error, tripId } = await allocateCommerceIndentToTrip({
      indentId: indent.id,
      driverId,
      vehicleId,
      supplierId: mode === 'supplier' ? supplierId : null,
      supplierRate: mode === 'supplier' ? rate : indent.supplierTarget,
    });
    setBusy(false);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success('Trip created');
    await refreshCommerceExecutions();
    navigate(tripId ? `/execution/trip/${tripId}` : `/execution/plan/${exec.executionPlanId}`);
  };

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4 max-w-xl">
      <p className="text-2sm">
        Same Core indent <span className="font-mono font-semibold">{indent.indentNumber}</span>.
        Sale value stays on the orders. Supplier rate / target rate are execution rates.
      </p>
      <div className="flex flex-wrap gap-2">
        {([
          ['bidding', 'Share for bidding'],
          ['asset', 'Asset'],
          ['supplier', 'Existing supplier'],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setPath(id)}
            className={`rounded-full px-3 py-1.5 text-2xs font-semibold min-h-11 ${
              path === id ? 'bg-[var(--pulse-hero-blue)] text-white' : 'border border-border'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {path === 'bidding' && (
        <div className="space-y-3">
          <label className="block text-2xs">
            Circulation
            <select
              className="mt-1 w-full rounded-md border border-border bg-background px-2 py-2 min-h-11"
              value={circulation}
              onChange={e => setCirculation(e.target.value as typeof circulation)}
            >
              <option value="integrated_supplier">Network</option>
              <option value="marketplace">Marketplace</option>
              <option value="both">Both</option>
            </select>
          </label>
          <label className="block text-2xs">
            Supplier target rate
            <input
              className="mt-1 w-full rounded-md border border-border bg-background px-2 py-2 min-h-11"
              value={targetRate}
              onChange={e => setTargetRate(e.target.value)}
              inputMode="decimal"
            />
          </label>
          <Button type="button" disabled={busy} onClick={() => void onShare()}>Share indent</Button>
        </div>
      )}

      {(path === 'asset' || path === 'supplier') && (
        <div className="space-y-3">
          {path === 'supplier' && (
            <>
              <label className="block text-2xs">
                Supplier
                <select
                  className="mt-1 w-full rounded-md border border-border bg-background px-2 py-2 min-h-11"
                  value={supplierId}
                  onChange={e => setSupplierId(e.target.value)}
                >
                  <option value="">Select…</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              </label>
              <label className="block text-2xs">
                Supplier rate
                <input
                  className="mt-1 w-full rounded-md border border-border bg-background px-2 py-2 min-h-11"
                  value={supplierRate}
                  onChange={e => setSupplierRate(e.target.value)}
                  inputMode="decimal"
                />
              </label>
            </>
          )}
          <label className="block text-2xs">
            Driver
            <select
              className="mt-1 w-full rounded-md border border-border bg-background px-2 py-2 min-h-11"
              value={driverId}
              onChange={e => setDriverId(e.target.value)}
            >
              <option value="">Select…</option>
              {drivers.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
            </select>
          </label>
          <label className="block text-2xs">
            Vehicle
            <select
              className="mt-1 w-full rounded-md border border-border bg-background px-2 py-2 min-h-11"
              value={vehicleId}
              onChange={e => setVehicleId(e.target.value)}
            >
              <option value="">Select…</option>
              {vehicles.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
            </select>
          </label>
          <Button
            type="button"
            disabled={busy}
            onClick={() => void onCreateTrip(path === 'asset' ? 'asset' : 'supplier')}
          >
            Create trip
          </Button>
        </div>
      )}
    </div>
  );
}
