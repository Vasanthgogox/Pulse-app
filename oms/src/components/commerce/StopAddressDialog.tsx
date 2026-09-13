import { useEffect, useState } from 'react';
import { MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/commerce/FormField';
import type { Address, PlanStop } from '@/types/commerce';

export function StopAddressDialog({
  open,
  stop,
  partyName,
  onClose,
  onSave,
}: {
  open: boolean;
  stop: PlanStop | null;
  partyName?: string;
  onClose: () => void;
  onSave: (address: Address) => Promise<void>;
}) {
  const [line1, setLine1] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [pincode, setPincode] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !stop) return;
    setLine1(stop.address.line1 ?? '');
    setCity(stop.address.city ?? '');
    setState(stop.address.state ?? '');
    setPincode(stop.address.pincode ?? '');
    setError(null);
  }, [open, stop]);

  if (!open || !stop) return null;

  const isDrop = stop.type === 'drop';
  const title = isDrop ? 'Add client delivery address' : 'Add pickup address';
  const subtitle = isDrop
    ? `No location on file for ${partyName || stop.contact_name || stop.label}. Add the client address to continue planning.`
    : `No location on file for ${partyName || stop.label}. Add the warehouse address to continue planning.`;
  const canSave = city.trim().length > 0 || line1.trim().length > 0 || pincode.trim().length > 0;

  async function handleSave() {
    if (!canSave || saving) return;
    setSaving(true);
    setError(null);
    try {
      await onSave({
        line1: line1.trim(),
        city: city.trim(),
        state: state.trim(),
        pincode: pincode.trim(),
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save address');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="Close"
        onClick={onClose}
      />
      <div className="relative w-full max-w-md rounded-xl border border-border bg-card shadow-lg p-5 space-y-4">
        <div className="flex items-start gap-2.5">
          <div className="size-9 rounded-lg bg-[var(--pulse-brand-soft)] flex items-center justify-center shrink-0">
            <MapPin className="size-4 text-[var(--pulse-hero-blue)]" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">{title}</h2>
            <p className="text-2xs text-muted-foreground mt-1">{subtitle}</p>
          </div>
        </div>

        <FormField label="Street address" value={line1} onChange={setLine1} placeholder="Building, street" />
        <FormField label="City *" value={city} onChange={setCity} placeholder="Chennai" />
        <div className="grid grid-cols-2 gap-3">
          <FormField label="State" value={state} onChange={setState} placeholder="Tamil Nadu" />
          <FormField label="Pincode" value={pincode} onChange={setPincode} placeholder="600001" />
        </div>
        {error ? <p className="text-2sm text-destructive">{error}</p> : null}

        <div className="flex gap-2 pt-1">
          <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
            Later
          </Button>
          <Button
            type="button"
            className="flex-1"
            disabled={!canSave || saving}
            onClick={() => void handleSave()}
          >
            {saving ? 'Saving…' : 'Save address'}
          </Button>
        </div>
      </div>
    </div>
  );
}
