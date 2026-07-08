import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ConsigneeEntityToggle } from '@/components/commerce/ConsigneeEntityToggle';
import { FormField } from '@/components/commerce/FormField';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useOrganization } from '@/context/OrganizationProvider';
import {
  buildConsigneePayload,
  canSaveConsignee,
  isValidGstin,
  normalizeGstin,
} from '@/lib/consignee';
import type { ConsigneeEntityType, Customer } from '@/types/commerce';

interface CreateCustomerSheetProps {
  open:     boolean;
  onClose:  () => void;
  onCreated?: (customer: Customer) => void;
}

export function CreateCustomerSheet({ open, onClose, onCreated }: CreateCustomerSheetProps) {
  const org = useOrganization();
  const [entityType, setEntityType] = useState<ConsigneeEntityType>('business');
  const [name, setName] = useState('');
  const [legalName, setLegalName] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [gstin, setGstin] = useState('');
  const [pan, setPan] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [line1, setLine1] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [pincode, setPincode] = useState('');

  function reset() {
    setEntityType('business');
    setName('');
    setLegalName('');
    setContactPerson('');
    setGstin('');
    setPan('');
    setEmail('');
    setPhone('');
    setLine1('');
    setCity('');
    setState('');
    setPincode('');
  }

  useEffect(() => {
    if (!open) reset();
  }, [open]);

  const canSubmit = canSaveConsignee({ entityType, name, legalName, gstin });
  const gstError = entityType === 'business' && gstin.trim() && !isValidGstin(gstin);
  const [saving, setSaving] = useState(false);

  async function handleSubmit() {
    if (!canSubmit || gstError || saving) return;
    setSaving(true);
    try {
      const payload = buildConsigneePayload({
        entityType,
        name,
        legalName,
        email,
        phone,
        contactPerson,
        gstin,
        pan,
        line1,
        city,
        state,
        pincode,
      });
      const customer = await org.createCustomer(payload);
      reset();
      if (customer) onCreated?.(customer);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={v => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-[var(--pulse-hero-blue)]">New consignee</SheetTitle>
          <p className="text-2xs text-muted-foreground mt-1">
            Order delivery recipient — person or business at drop location.
          </p>
        </SheetHeader>
        <div className="mt-6 space-y-4">
          <ConsigneeEntityToggle value={entityType} onChange={setEntityType} />

          {entityType === 'business' ? (
            <>
              <FormField label="Registered business name *" value={legalName} onChange={setLegalName} placeholder="Retail Partner Pvt Ltd" />
              <FormField label="GSTIN" value={gstin} onChange={v => setGstin(normalizeGstin(v))} placeholder="27AABCU9603R1ZM" />
              {gstError && <p className="text-2xs text-destructive -mt-2">Enter a valid 15-character GSTIN</p>}
              <FormField label="PAN" value={pan} onChange={v => setPan(v.toUpperCase())} placeholder="AABCU9603R" />
              <FormField label="Contact person" value={contactPerson} onChange={setContactPerson} placeholder="Receiving manager" />
            </>
          ) : (
            <FormField label="Consignee name *" value={name} onChange={setName} placeholder="Priya Sharma" />
          )}

          <FormField label="Email" value={email} onChange={setEmail} placeholder="orders@partner.com" type="email" />
          <FormField label="Phone" value={phone} onChange={setPhone} placeholder="+91 9876543210" />
          <FormField label="Delivery address" value={line1} onChange={setLine1} placeholder="Building, street, landmark" />
          <div className="grid grid-cols-2 gap-3">
            <FormField label="City" value={city} onChange={setCity} placeholder="Mumbai" />
            <FormField label="State" value={state} onChange={setState} placeholder="Maharashtra" />
          </div>
          <FormField label="Pincode" value={pincode} onChange={setPincode} placeholder="400001" />

          <Button className="w-full mt-2" disabled={!canSubmit || Boolean(gstError) || saving} onClick={() => void handleSubmit()}>
            {saving ? 'Saving…' : 'Add consignee'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
