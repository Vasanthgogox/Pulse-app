import { useEffect, useState } from 'react';
import { EntityFlexSheet } from '@/components/commerce/EntityFlexSheet';
import { ConsigneeEntityToggle } from '@/components/commerce/ConsigneeEntityToggle';
import { ConsigneeTypeBadge } from '@/components/commerce/ConsigneeTypeBadge';
import { FormField, SpecRow } from '@/components/commerce/FormField';
import { useCommerce } from '@/context/CommerceProvider';
import { useOrganization } from '@/context/OrganizationProvider';
import {
  buildConsigneePayload,
  canSaveConsignee,
  getConsigneeDisplayName,
  getConsigneeEntityType,
  getConsigneeSubtitle,
  isValidGstin,
  normalizeGstin,
} from '@/lib/consignee';
import type { ConsigneeEntityType } from '@/types/commerce';
import { formatCurrency } from '@/lib/utils';

interface CustomerDetailSheetProps {
  customerId: string | null;
  open:       boolean;
  onClose:    () => void;
}

export function CustomerDetailSheet({ customerId, open, onClose }: CustomerDetailSheetProps) {
  const { customers } = useCommerce();
  const org = useOrganization();
  const customer = customers.find(c => c.id === customerId) ?? null;

  const [editing, setEditing] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [entityType, setEntityType] = useState<ConsigneeEntityType>('individual');
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

  function loadFromCustomer() {
    if (!customer) return;
    setEntityType(getConsigneeEntityType(customer));
    setName(customer.entity_type === 'individual' ? customer.name : '');
    setLegalName(customer.legal_name ?? customer.company ?? customer.name);
    setContactPerson(customer.contact_person ?? '');
    setGstin(customer.gstin ?? '');
    setPan(customer.pan ?? '');
    setEmail(customer.email);
    setPhone(customer.phone);
    setLine1(customer.shipping_address.line1);
    setCity(customer.shipping_address.city);
    setState(customer.shipping_address.state);
    setPincode(customer.shipping_address.pincode);
  }

  useEffect(() => {
    if (!customer || editing) return;
    loadFromCustomer();
  }, [customer, editing]);

  useEffect(() => {
    if (!open) { setEditing(false); setDeleteConfirm(false); }
  }, [open]);

  if (!customer) return null;

  const displayName = getConsigneeDisplayName(customer);
  const canSave = canSaveConsignee({ entityType, name, legalName, gstin });
  const gstError = entityType === 'business' && gstin.trim() && !isValidGstin(gstin);
  const location = [customer.shipping_address.city, customer.shipping_address.state].filter(Boolean).join(', ');

  function handleSave() {
    if (!canSave || gstError) return;
    org.updateCustomer(customer!.id, buildConsigneePayload({
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
    }));
    setEditing(false);
  }

  function handleDelete() {
    org.deleteCustomer(customer!.id);
    setDeleteConfirm(false);
    onClose();
  }

  return (
    <EntityFlexSheet
      open={open}
      entity={customer}
      title="Consignee Details"
      editing={editing}
      canSave={canSave && !gstError}
      deleteConfirm={deleteConfirm}
      onClose={onClose}
      onEdit={() => setEditing(true)}
      onCancelEdit={() => { loadFromCustomer(); setEditing(false); }}
      onSave={handleSave}
      onDelete={() => setDeleteConfirm(true)}
      onDeleteConfirm={handleDelete}
      onDeleteCancel={() => setDeleteConfirm(false)}
    >
      <div className="flex items-center gap-3 mb-4">
        <div className="size-12 rounded-full bg-[var(--pulse-brand-soft)] flex items-center justify-center text-sm font-bold text-[var(--pulse-hero-blue)] shrink-0">
          {displayName.slice(0, 2).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-bold text-sm truncate">{displayName}</h3>
            <ConsigneeTypeBadge consignee={customer} />
          </div>
          <p className="text-2xs text-muted-foreground truncate mt-0.5">{getConsigneeSubtitle(customer)}</p>
        </div>
      </div>

      {editing ? (
        <div className="space-y-3">
          <ConsigneeEntityToggle value={entityType} onChange={setEntityType} />
          {entityType === 'business' ? (
            <>
              <FormField label="Registered business name *" value={legalName} onChange={setLegalName} />
              <FormField label="GSTIN" value={gstin} onChange={v => setGstin(normalizeGstin(v))} placeholder="27AABCU9603R1ZM" />
              {gstError && <p className="text-2xs text-destructive -mt-2">Enter a valid 15-character GSTIN</p>}
              <FormField label="PAN" value={pan} onChange={v => setPan(v.toUpperCase())} />
              <FormField label="Contact person" value={contactPerson} onChange={setContactPerson} />
            </>
          ) : (
            <FormField label="Consignee name *" value={name} onChange={setName} />
          )}
          <FormField label="Email" value={email} onChange={setEmail} type="email" />
          <FormField label="Phone" value={phone} onChange={setPhone} />
          <FormField label="Delivery address" value={line1} onChange={setLine1} />
          <div className="grid grid-cols-2 gap-2">
            <FormField label="City" value={city} onChange={setCity} />
            <FormField label="State" value={state} onChange={setState} />
          </div>
          <FormField label="Pincode" value={pincode} onChange={setPincode} />
        </div>
      ) : (
        <div className="divide-y divide-border border-y border-border text-2sm">
          {getConsigneeEntityType(customer) === 'business' && (
            <>
              <SpecRow label="Legal name">{customer.legal_name ?? customer.company ?? displayName}</SpecRow>
              <SpecRow label="GSTIN">{customer.gstin || '—'}</SpecRow>
              <SpecRow label="PAN">{customer.pan || '—'}</SpecRow>
              <SpecRow label="Contact">{customer.contact_person || '—'}</SpecRow>
            </>
          )}
          <SpecRow label="Email">{customer.email || '—'}</SpecRow>
          <SpecRow label="Phone">{customer.phone || '—'}</SpecRow>
          <SpecRow label="Address">
            {[customer.shipping_address.line1, location, customer.shipping_address.pincode].filter(Boolean).join(', ') || '—'}
          </SpecRow>
          <SpecRow label="Orders">{customer.total_orders ?? 0}</SpecRow>
          <SpecRow label="Spend">{formatCurrency(customer.total_spend ?? 0)}</SpecRow>
        </div>
      )}
    </EntityFlexSheet>
  );
}
