import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowRight, Truck, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageToolbar } from '@/components/commerce/PageToolbar';
import { CorrelationTrace, LottieIcon, RouteTimeline } from '@/components/pulse-ui';
import { useExecution } from '@/context/ExecutionProvider';
import { useOrganization } from '@/context/OrganizationProvider';
import { formatCurrency } from '@/lib/utils';

export function DispatchPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const { getJob, assignJob } = useExecution();
  const { drivers, vehicles, addDriver, addVehicle } = useOrganization();
  const job = jobId ? getJob(jobId) : undefined;

  const [driverId, setDriverId] = useState(drivers[0]?.id ?? '');
  const [vehicleId, setVehicleId] = useState(vehicles[0]?.id ?? '');
  const [newDriverName, setNewDriverName] = useState('');
  const [newDriverPhone, setNewDriverPhone] = useState('');
  const [newVehicleLabel, setNewVehicleLabel] = useState('');
  const [newVehicleType, setNewVehicleType] = useState('32FT');

  if (!job) {
    return (
      <div className="container-fluid">
        <p className="text-muted-foreground">Job not found.</p>
        <Link to="/execution" className="text-primary text-sm">← Back</Link>
      </div>
    );
  }

  const selectedDriver = drivers.find(d => d.id === driverId);
  const selectedVehicle = vehicles.find(v => v.id === vehicleId);
  const fleetReady = drivers.length > 0 && vehicles.length > 0;

  function handleAssign() {
    if (!selectedDriver || !selectedVehicle) return;
    const updated = assignJob(job!.id, selectedDriver, selectedVehicle);
    if (updated) navigate(`/execution/driver/${job!.id}`);
  }

  function handleAddDriver() {
    if (!newDriverName.trim()) return;
    const d = { id: `DRV-${Date.now()}`, name: newDriverName.trim(), phone: newDriverPhone.trim() || '+91 00000 00000' };
    addDriver(d);
    setDriverId(d.id);
    setNewDriverName('');
    setNewDriverPhone('');
  }

  function handleAddVehicle() {
    if (!newVehicleLabel.trim()) return;
    const v = { id: `VEH-${Date.now()}`, label: newVehicleLabel.trim(), type: newVehicleType };
    addVehicle(v);
    setVehicleId(v.id);
    setNewVehicleLabel('');
  }

  return (
    <div className="container-fluid pb-8">
      <PageToolbar
        title="Dispatcher — Assign Vehicle"
        breadcrumb={['Pulse Operations', 'Dispatch']}
        description={`Plan ${job.planNumber} · ${job.stops.length} stops · via Execution API`}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-5 shadow-none">
            <h3 className="text-xs font-bold uppercase text-muted-foreground mb-3">Plan summary</h3>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div><dt className="text-muted-foreground">Orders</dt><dd className="font-semibold">{job.command.summary.orderCount}</dd></div>
              <div><dt className="text-muted-foreground">Amount</dt><dd className="font-semibold">{formatCurrency(job.command.summary.totalAmount)}</dd></div>
              <div><dt className="text-muted-foreground">Weight</dt><dd className="font-semibold">{job.command.summary.totalWeightKg} kg</dd></div>
              <div><dt className="text-muted-foreground">Vehicle type</dt><dd className="font-semibold">{job.command.vehicleType}</dd></div>
            </dl>
            {job.indentCode && (
              <p className="text-2sm mt-3 font-mono text-primary">Indent: {job.indentCode}</p>
            )}
          </div>

          <div className="rounded-xl border border-border bg-card p-5 shadow-none">
            <h3 className="text-xs font-bold uppercase text-muted-foreground mb-3">Route</h3>
            <RouteTimeline
              stops={job.command.stops.map(s => ({
                stop_id: s.stopId,
                label: s.label,
                type: s.type,
                warehouse_id: s.warehouseId,
                address: s.address,
                contact_name: s.contact.name,
                contact_phone: s.contact.phone,
                pod_required: s.podRequired,
              }))}
              sequence={job.command.route.sequence}
            />
          </div>
        </div>

        <div className="space-y-4">
          {!fleetReady && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-5 shadow-none">
              <h3 className="font-semibold mb-2">Configure fleet first</h3>
              <p className="text-2sm text-muted-foreground mb-4">Add at least one driver and one vehicle from your organization — no demo seeds.</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <input placeholder="Driver name" value={newDriverName} onChange={e => setNewDriverName(e.target.value)} className="w-full rounded-lg border border-input px-3 py-2 text-sm bg-background mb-2" />
                  <input placeholder="Phone" value={newDriverPhone} onChange={e => setNewDriverPhone(e.target.value)} className="w-full rounded-lg border border-input px-3 py-2 text-sm bg-background mb-2" />
                  <Button size="sm" variant="outline" className="w-full" onClick={handleAddDriver} disabled={!newDriverName.trim()}>Add driver</Button>
                </div>
                <div>
                  <input placeholder="Vehicle label" value={newVehicleLabel} onChange={e => setNewVehicleLabel(e.target.value)} className="w-full rounded-lg border border-input px-3 py-2 text-sm bg-background mb-2" />
                  <select value={newVehicleType} onChange={e => setNewVehicleType(e.target.value)} className="w-full rounded-lg border border-input px-3 py-2 text-sm bg-background mb-2">
                    {['TATA ACE', '14FT', '20FT', '32FT', '40FT'].map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <Button size="sm" variant="outline" className="w-full" onClick={handleAddVehicle} disabled={!newVehicleLabel.trim()}>Add vehicle</Button>
                </div>
              </div>
            </div>
          )}

          <div className="rounded-xl border border-border bg-card p-5 shadow-none">
            <div className="flex items-center gap-3 mb-4">
              <LottieIcon name="delivery" size={48} />
              <div>
                <h3 className="font-semibold">Assign driver & vehicle</h3>
                <p className="text-2sm text-muted-foreground">Execution Service owns trip creation and events</p>
              </div>
            </div>

            <label className="block mb-3">
              <span className="text-2sm font-medium flex items-center gap-1 mb-1"><User className="size-3.5" /> Driver</span>
              <select
                value={driverId}
                onChange={e => setDriverId(e.target.value)}
                className="w-full rounded-lg border border-input px-3 py-2 text-sm bg-background"
                disabled={drivers.length === 0}
              >
                {drivers.length === 0 && <option value="">No drivers — add above</option>}
                {drivers.map(d => (
                  <option key={d.id} value={d.id}>{d.name} · {d.phone}</option>
                ))}
              </select>
            </label>

            <label className="block mb-4">
              <span className="text-2sm font-medium flex items-center gap-1 mb-1"><Truck className="size-3.5" /> Vehicle</span>
              <select
                value={vehicleId}
                onChange={e => setVehicleId(e.target.value)}
                className="w-full rounded-lg border border-input px-3 py-2 text-sm bg-background"
                disabled={vehicles.length === 0}
              >
                {vehicles.length === 0 && <option value="">No vehicles — add above</option>}
                {vehicles.map(v => (
                  <option key={v.id} value={v.id}>{v.label} · {v.type}</option>
                ))}
              </select>
            </label>

            <Button className="w-full" size="lg" onClick={handleAssign} disabled={job.status !== 'received' || !fleetReady}>
              Assign & start trip <ArrowRight className="size-4" />
            </Button>
            {job.status !== 'received' && <p className="text-2sm text-muted-foreground mt-2 text-center">Already assigned</p>}
          </div>

          <div className="rounded-xl border border-border bg-card p-5 shadow-none">
            <h3 className="text-xs font-bold uppercase text-muted-foreground mb-3">Correlation trace</h3>
            <CorrelationTrace correlationId={job.correlationId} compact />
          </div>
        </div>
      </div>
    </div>
  );
}
