import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/commerce/FormField';
import { useCommerce } from '@/context/CommerceProvider';
import { useExecution } from '@/context/ExecutionProvider';
import { classifyCommerceOpsStage } from '@/lib/commerce-ops-hub';
import { updateCommercePlanningIndent } from '@/lib/services/commerce-ops-detail.service';
import type { CommerceExecution } from '@/lib/services/execution-visibility.service';
import type { ExecutionPlan } from '@/types/commerce';

export function commercePlanningEditLocked(exec: CommerceExecution | null | undefined): boolean {
  if (!exec) return false;
  return classifyCommerceOpsStage(exec) !== 'indent';
}

export function CommerceIndentHandoffActions({
  plan,
  exec,
  indentId,
  showEditForm = false,
}: {
  plan?: ExecutionPlan | null;
  exec?: CommerceExecution | null;
  indentId?: string | null;
  showEditForm?: boolean;
}) {
  const navigate = useNavigate();
  const { sharePlanToOperations, plans } = useCommerce();
  const { refreshCommerceExecutions } = useExecution();
  const [sharing, setSharing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const resolvedPlan = plan ?? plans.find(p =>
    (indentId && p.indent_id === indentId)
    || (exec && (p.core_plan_id === exec.executionPlanId || p.id === exec.executionPlanId || p.plan_number === exec.planNumber)),
  );
  const resolvedIndentId = indentId ?? exec?.indent?.id ?? resolvedPlan?.indent_id;
  const locked = commercePlanningEditLocked(exec);
  const sharedToOps = Boolean(
    resolvedPlan?.status === 'published'
    || exec?.planStatus === 'published',
  );

  const indent = exec?.indent;
  const [pickupArea, setPickupArea] = useState(indent?.pickupArea ?? '');
  const [dropLocation, setDropLocation] = useState(indent?.dropLocation ?? '');
  const [supplierTarget, setSupplierTarget] = useState(
    indent?.supplierTarget != null ? String(indent.supplierTarget) : '',
  );
  const [vehicleType, setVehicleType] = useState(indent?.vehicleType ?? '');
  const [loadType, setLoadType] = useState(indent?.loadType ?? '');
  const [weightKg, setWeightKg] = useState(indent?.weightKg != null ? String(indent.weightKg) : '');

  async function onShare() {
    // Prefer the local plan cache's real Core id (fast path, same session as
    // creation). Fall back to exec.executionPlanId — the DB-backed id already
    // resolved by execution-visibility.service.ts — for a real indent opened
    // in a fresh session/reload where the local plan cache (order-store.ts,
    // localStorage) never got populated. sharePlanToOperations is fully
    // DB-backed (ExecutionOrchestrator.shareExecutionPlanToOperations), so it
    // needs no local plan record — only a real executionPlanId.
    const planId = resolvedPlan?.core_plan_id ?? resolvedPlan?.id ?? exec?.executionPlanId ?? null;
    if (!planId) {
      toast.error('Open this indent from Plan History to share it to Operations.');
      return;
    }
    setSharing(true);
    try {
      await sharePlanToOperations(planId);
      await refreshCommerceExecutions();
      toast.success('Indent is in Operations.');
      navigate('/execution');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not share to Operations');
    } finally {
      setSharing(false);
    }
  }

  async function onSaveEdit() {
    if (!resolvedIndentId) return;
    const rate = Number(supplierTarget);
    const weight = Number(weightKg);
    setSaving(true);
    const { error } = await updateCommercePlanningIndent({
      indentId: resolvedIndentId,
      pickupArea,
      dropLocation,
      supplierTarget: Number.isFinite(rate) && rate > 0 ? rate : undefined,
      vehicleType: vehicleType.trim() || undefined,
      loadType: loadType.trim() || undefined,
      weightKg: Number.isFinite(weight) && weight > 0 ? weight : undefined,
    });
    setSaving(false);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success('Indent updated');
    setEditing(false);
    await refreshCommerceExecutions();
  }

  if (!resolvedIndentId) return null;

  return (
    <div className="flex flex-col gap-2">
      {resolvedIndentId && !showEditForm && (
        <Button className="w-full" size="sm" variant="outline" asChild>
          <Link to={`/execution/indent/${resolvedIndentId}`}>View Indent</Link>
        </Button>
      )}
      {resolvedIndentId && !locked && (
        showEditForm ? (
          editing ? (
            <div className="space-y-2 rounded-lg border border-border p-3">
              <FormField label="Pickup" value={pickupArea} onChange={setPickupArea} />
              <FormField label="Drop" value={dropLocation} onChange={setDropLocation} />
              <FormField label="Supplier target (₹)" value={supplierTarget} onChange={setSupplierTarget} />
              <FormField label="Vehicle" value={vehicleType} onChange={setVehicleType} />
              <FormField label="Load type" value={loadType} onChange={setLoadType} />
              <FormField label="Weight (kg)" value={weightKg} onChange={setWeightKg} />
              <div className="flex gap-2">
                <Button size="sm" type="button" disabled={saving} onClick={() => void onSaveEdit()}>
                  {saving ? 'Saving…' : 'Save'}
                </Button>
                <Button size="sm" type="button" variant="outline" disabled={saving} onClick={() => setEditing(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button className="w-full" size="sm" type="button" onClick={() => setEditing(true)}>
              Edit Indent
            </Button>
          )
        ) : (
          <Button className="w-full" size="sm" variant="outline" asChild>
            <Link to={`/execution/indent/${resolvedIndentId}`}>Edit Indent</Link>
          </Button>
        )
      )}
      {locked && (
        <p className="text-2xs text-muted-foreground">
          Indent is allocated. Planning edits are locked.
        </p>
      )}
      {resolvedIndentId && !sharedToOps && (
        <Button className="w-full" size="sm" type="button" disabled={sharing} onClick={() => void onShare()}>
          {sharing ? 'Sharing…' : 'Share to Operations'}
        </Button>
      )}
      {sharedToOps && (
        <Button className="w-full" size="sm" variant="outline" asChild>
          <Link to="/execution">Go to Operations</Link>
        </Button>
      )}
    </div>
  );
}
