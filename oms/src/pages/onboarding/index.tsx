import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageToolbar } from '@/components/commerce/PageToolbar';
import { LottieIcon } from '@/components/pulse-ui';
import {
  createDefaultProfile,
  useOrganization,
} from '@/context/OrganizationProvider';
import { ONBOARDING_STEPS } from '@/types/onboarding';
import type { Customer, Product, Warehouse } from '@/types/commerce';
import { cn } from '@/lib/utils';

function OnboardingLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">
      Loading workspace…
    </div>
  );
}

export function OnboardingPage() {
  const navigate = useNavigate();
  const org = useOrganization();

  if (!org.organizationHydrated) {
    return <OnboardingLoading />;
  }

  if (org.hasPlatformOrganization || org.commerceSetupComplete) {
    return <Navigate to="/dashboard" replace />;
  }
  const [companyName, setCompanyName] = useState(org.profile?.name ?? '');
  const [whName, setWhName] = useState('');
  const [whCity, setWhCity] = useState('');
  const [productName, setProductName] = useState('');
  const [productSku, setProductSku] = useState('');
  const [stockQty, setStockQty] = useState('100');
  const [custName, setCustName] = useState('');
  const [custEmail, setCustEmail] = useState('');

  const step = org.onboardingStep;

  function finishAndGo() {
    org.completeOnboarding();
    navigate('/dashboard');
  }

  return (
    <div className="container-fluid max-w-2xl pb-12 mx-auto">
      <PageToolbar
        title="Organization Setup"
        description="Create Organization → Warehouse → Products → Inventory → Customer → First Order"
        showDate={false}
      />

      <div className="mb-8">
        <LottieIcon name="warehouse" size={72} className="mx-auto mb-4" />
        <ol className="flex flex-wrap gap-2 justify-center">
          {ONBOARDING_STEPS.map((s, i) => (
            <li
              key={s.id}
              className={cn(
                'text-2xs px-2 py-1 rounded-full border',
                i <= org.currentStepIndex ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground',
              )}
            >
              {s.label}
            </li>
          ))}
        </ol>
      </div>

      {step === 'organization' && (
        <WizardCard title="Create organization" description="Company profile — referenced by ID across Commerce, Execution, Finance DBs.">
          <Field label="Company name" value={companyName} onChange={setCompanyName} placeholder="Acme Logistics Pvt Ltd" />
          <Button
            className="w-full mt-4"
            disabled={!companyName.trim()}
            onClick={() => org.setProfile(createDefaultProfile(companyName.trim()))}
          >
            Continue
          </Button>
        </WizardCard>
      )}

      {step === 'warehouse' && (
        <WizardCard title="Create warehouse" description="First fulfillment location for inventory and pickups.">
          <Field label="Warehouse name" value={whName} onChange={setWhName} placeholder="Mumbai DC" />
          <Field label="City" value={whCity} onChange={setWhCity} placeholder="Mumbai" />
          <Button
            className="w-full mt-4"
            disabled={!whName.trim() || !whCity.trim()}
            onClick={() => {
              const wh: Warehouse = {
                id: `WH-${Date.now()}`,
                name: whName.trim(),
                code: whName.trim().slice(0, 6).toUpperCase(),
                address: { line1: whName, city: whCity.trim(), state: '', pincode: '' },
                capacity_m3: 1000,
              };
              org.addWarehouse(wh);
            }}
          >
            Add warehouse
          </Button>
        </WizardCard>
      )}

      {step === 'products' && (
        <WizardCard title="Add product" description="Catalog SKU — used by all order sources (Manual, Shopify, API, etc.).">
          <Field label="Product name" value={productName} onChange={setProductName} placeholder="Widget Pro" />
          <Field label="SKU" value={productSku} onChange={setProductSku} placeholder="WDG-001" />
          <Button
            className="w-full mt-4"
            disabled={!productName.trim() || !productSku.trim()}
            onClick={() => {
              const p: Product = {
                id: `P-${Date.now()}`,
                sku: productSku.trim(),
                name: productName.trim(),
                category: 'Industrial',
                description: '',
                unit_price: 1000,
                weight_kg: 1,
                volume_m3: 0.01,
                dimensions: { l: 10, w: 10, h: 10 },
                stock: 0,
                reserved: 0,
                threshold: 10,
                created_at: new Date().toISOString().slice(0, 10),
              };
              org.addProduct(p);
            }}
          >
            Add product
          </Button>
        </WizardCard>
      )}

      {step === 'inventory' && org.products.length > 0 && (
        <WizardCard title="Set inventory" description={`Stock for ${org.products[0].name} at ${org.warehouses[0]?.name ?? 'warehouse'}.`}>
          <Field label="Quantity on hand" value={stockQty} onChange={setStockQty} placeholder="100" />
          <Button
            className="w-full mt-4"
            onClick={() => {
              org.setProductStock(org.products[0].id, Number(stockQty) || 0);
            }}
          >
            Save inventory
          </Button>
        </WizardCard>
      )}

      {step === 'customer' && (
        <WizardCard title="Add consignee" description="Delivery recipient for sales orders — individual or business with GST.">
          <Field label="Consignee / business name" value={custName} onChange={setCustName} placeholder="Retail Partner Ltd" />
          <Field label="Email" value={custEmail} onChange={setCustEmail} placeholder="orders@partner.com" />
          <Button
            className="w-full mt-4"
            disabled={!custName.trim() || !custEmail.trim()}
            onClick={() => {
              const c: Customer = {
                id: `C-${Date.now()}`,
                name: custName.trim(),
                email: custEmail.trim(),
                phone: '',
                entity_type: 'business',
                legal_name: custName.trim(),
                company: custName.trim(),
                billing_address: { line1: '', city: org.warehouses[0]?.address.city ?? '', state: '', pincode: '' },
                shipping_address: { line1: '', city: org.warehouses[0]?.address.city ?? '', state: '', pincode: '' },
                total_orders: 0,
                total_spend: 0,
                created_at: new Date().toISOString().slice(0, 10),
              };
              org.addCustomer(c);
            }}
          >
            Add consignee
          </Button>
        </WizardCard>
      )}

      {step === 'first_order' && org.customers.length > 0 && org.products.length > 0 && (
        <WizardCard title="Ready for first order" description="Onboarding complete — create your first sales order in Commerce, then build an execution plan.">
          <ul className="text-sm space-y-2 mb-4">
            <li className="flex items-center gap-2"><CheckCircle2 className="size-4 text-emerald-500" /> {org.profile?.name}</li>
            <li className="flex items-center gap-2"><CheckCircle2 className="size-4 text-emerald-500" /> {org.warehouses.length} warehouse(s)</li>
            <li className="flex items-center gap-2"><CheckCircle2 className="size-4 text-emerald-500" /> {org.products.length} product(s)</li>
            <li className="flex items-center gap-2"><CheckCircle2 className="size-4 text-emerald-500" /> {org.customers.length} consignee(s)</li>
          </ul>
          <Button className="w-full" onClick={finishAndGo}>
            Start using Commerce
          </Button>
        </WizardCard>
      )}

      {step === 'complete' && (
        <WizardCard title="Setup complete" description="Your organization is ready.">
          <Button className="w-full" onClick={() => navigate('/dashboard')}>Go to dashboard</Button>
        </WizardCard>
      )}
    </div>
  );
}

function WizardCard({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-none">
      <h2 className="font-semibold text-lg">{title}</h2>
      <p className="text-2sm text-muted-foreground mt-1 mb-5">{description}</p>
      {children}
    </div>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="block mb-3">
      <span className="text-2sm font-medium">{label}</span>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full rounded-lg border border-input px-3 py-2 text-sm bg-background"
      />
    </label>
  );
}
